import {escape,segments,SourceError} from './document';
import {pointerFragment,type ReferenceGraph,type GraphScope} from './reference_graph';
import type {MigrationIssue} from './migration_schema';
import {modernFamily,type SpecificationFamily} from './specification';
import {securityRequirementChain,securityRequirementDefinition,securityRequirementValuesAllowed} from './security_requirements';
import {MigrationSource,type MigrationLocation} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {entryComponentContainer} from './migration_schema_uses';
import {children} from './contexts';

/** OAS 3.2.1 §4.30: resolution has already selected component-name
 * precedence or a URI target. Give each URI binding a distinct standard
 * component occurrence through the common allocator. Even equal arrays must
 * not collapse independently authored AND bindings or OR alternatives. */
export function migrateSecurityBindings(graphs:readonly ReferenceGraph[],sources:ReadonlyMap<string,MigrationSource>,
    families:readonly string[],target:SpecificationFamily,owners:MigrationSchemaOwners,excludedNames:ReadonlySet<string>=new Set()):ReadonlyMap<string,readonly MigrationLocation[]> {
    const provenance=new Map<string,MigrationLocation[]>();
    if(target==='3.2')return provenance;
    const pristine=new Map([...sources].map(([id,source])=>[id,new MigrationSource(source.doc)]));
    let work=0,bindingCount=0;
    const remember=(graph:ReferenceGraph,scope:GraphScope,copied:ReturnType<MigrationSchemaOwners['separate']>,excludedFields:ReadonlySet<string>=new Set())=>{
        for(const [pointer,location]of copied.provenance){
            const id=JSON.stringify([scope.resource,pointer]),values=provenance.get(id)??[];
            values.push(location);provenance.set(id,values);
        }
        const pending=[scope],seen=new Set<string>();
        for(let index=0;index<pending.length;index++){
            const child=pending[index],id=JSON.stringify([child.resource,child.pointer,child.kind]);
            if(seen.has(id))continue;seen.add(id);
            if(++work>200000)throw new SourceError('limit.migration.security','Security material copying exceeds 200000 typed states');
            owners.rememberAdditionalUse(graph.root,child,{resource:copied.location.resource,
                pointer:copied.location.pointer+child.pointer.slice(scope.pointer.length)},child===scope?excludedFields:undefined);
            const value=graph.docs.get(child.resource)!.dataNode(child.pointer)?.value;
            if(graph.referenceObject(value,child))continue;
            for(const [name,,kind]of children(value,child.kind,child.family)){
                const next=graph.scopeAs(child.resource,child.pointer+'/'+escape(name),kind);if(next)pending.push(next);
            }
        }
    };
    const description=(graph:ReferenceGraph,captured:GraphScope)=>securityRequirementChain(graph,captured)?.find(at=>{
        const scope=graph.scopeAs(at.resource,at.pointer,'security')!,value=graph.docs.get(at.resource)!.dataNode(at.pointer)?.value;
        return typeof value?.description==='string'&&(!graph.referenceObject(value,scope)||modernFamily(scope.family));
    });
    const annotate=(graph:ReferenceGraph,captured:GraphScope,scope:GraphScope,copied:ReturnType<MigrationSchemaOwners['separate']>)=>{
        const annotation=description(graph,captured),overridden=annotation&&(annotation.resource!==scope.resource||annotation.pointer!==scope.pointer);
        remember(graph,scope,copied,overridden?new Set(['description']):undefined);
        if(!overridden)return;
        const copy=sources.get(copied.location.resource)!,owner=graph.scopeAs(annotation.resource,annotation.pointer,'security')!;
        copy.remove(copied.location.pointer+'/description');
        copy.copy(pristine.get(annotation.resource)!,annotation.pointer+'/description',copied.location.pointer+'/description');
        copy.origins.set(copied.location.pointer+'/description',new Set([copied.location.pointer+'/description']));
        // The overriding Reference Object owns this annotation's URI base.
        owners.rememberAdditionalUse(graph.root,owner,copied.location);
    };
    const materialized=new Set<string>();
    for(const graph of [...graphs].sort((a,b)=>a.root.localeCompare(b.root))){
        const names=new Set([...excludedNames,...graph.entryReferences().filter(reference=>reference.connection==='security').map(reference=>reference.value)]);
        if(target==='2.0'||target==='3.0')for(const alias of graph.entryScopes()){
            const value=graph.docs.get(alias.resource)!.dataNode(alias.pointer)?.value;
            if(alias.kind!=='security'||!families.includes(alias.family)||!graph.referenceObject(value,alias)||
                target==='3.0'&&(!modernFamily(alias.family)||!Object.hasOwn(value,'description')))continue;
            const definition=securityRequirementDefinition(graph,alias),scope=definition&&graph.scopeAs(definition.resource,definition.pointer,'security');
            if(!scope)throw new SourceError('migration.security.target','A Security Scheme alias has no finite captured definition');
            const id=JSON.stringify([alias.resource,alias.pointer]);
            if(materialized.has(id))continue;materialized.add(id);
            const container=entryComponentContainer(graph,{...scope,family:graph.family},graph.root,owners);
            if(!container)throw new SourceError('migration.security.container','The captured entry has no Security Scheme component container');
            const copied=owners.separate(scope,'security_definition',{container,captured:pristine.get(scope.resource),identity:id});
            annotate(graph,alias,scope,copied);
            const source=sources.get(alias.resource)!,copy=sources.get(copied.location.resource)!;
            owners.admit(source,8);
            // Root fragments and named components use the same field/CST
            // ownership. The material copy owns annotations and exact values;
            // the alias occurrence keeps its original root coordinate.
            for(const field of [...source.doc.dataNode(alias.pointer)!.children.keys()])
                source.remove(alias.pointer+'/'+escape(field),true,field==='$ref');
            for(const field of [...copy.doc.dataNode(copied.location.pointer)!.children.keys()])
                source.copy(copy,copied.location.pointer+'/'+escape(field),alias.pointer+'/'+escape(field),true);
            source.associate(copy,copied.location.pointer,alias.pointer);
            copy.remove(copied.location.pointer);
            // The alias occurrence is still the same named target. Its old
            // Reference Object locator retires; copied material fields keep
            // their terminal-definition provenance and documentation base.
            source.origins.set(alias.pointer,new Set([alias.pointer]));
            const overridden=description(graph,alias);
            owners.rememberAdditionalUse(graph.root,scope,{resource:alias.resource,pointer:alias.pointer},
                overridden&&(overridden.resource!==scope.resource||overridden.pointer!==scope.pointer)?new Set(['description']):undefined);
            provenance.set(id,[{resource:alias.resource,pointer:alias.pointer}]);
        }
        const references=graph.entryReferences().filter(reference=>reference.connection==='security'&&reference.targetUri!==undefined&&families.includes(reference.family))
            .sort((a,b)=>JSON.stringify([a.resource,a.pointer,a.keyword]).localeCompare(JSON.stringify([b.resource,b.pointer,b.keyword])));
        for(const reference of references){
            if(++bindingCount>4096)throw new SourceError('limit.migration.security','Security binding conversion exceeds 4096 captured bindings');
            if(reference.resolution!=='resolved')throw new SourceError('migration.security.target','A URI binding requires a resolved captured Security Scheme');
            const captured=graph.scopeAs(reference.targetResource!,reference.targetPointer!,'security');
            if(!captured)throw new SourceError('migration.security.target','A URI binding has no typed Security Scheme owner');
            // Swagger has no Security Scheme Reference Object. Resolve that
            // permitted chain before copying; other targets retain aliases
            // and their authored Reference Object annotations.
            const definition=target==='2.0'?securityRequirementDefinition(graph,captured):captured;
            const scope=definition&&graph.scopeAs(definition.resource,definition.pointer,'security');
            if(!scope)throw new SourceError('migration.security.target','A URI binding has no finite Security Scheme definition');
            const container=entryComponentContainer(graph,{...scope,family:graph.family},graph.root,owners);
            if(!container)throw new SourceError('migration.security.container','The captured entry has no native Security Scheme component container');
            const copied=owners.separate(scope,'security_binding',{container,captured:pristine.get(scope.resource),
                excludedNames:names,
                identity:JSON.stringify([graph.root,reference.resource,reference.pointer,reference.keyword,reference.targetResource,reference.targetPointer])});
            if(target==='2.0')annotate(graph,captured,scope,copied);else remember(graph,scope,copied);
            if(scope.resource!==captured.resource||scope.pointer!==captured.pointer)
                owners.rememberAdditionalUse(graph.root,captured,copied.location);
            const copy=sources.get(copied.location.resource)!;
            // A copied Reference Object retains the exact captured target,
            // independently of $self removal and output retrieval identities.
            const edge=graph.referenceAs(scope.resource,scope.pointer,'$ref','security');
            if(edge?.resolution==='resolved')copy.set(copied.location.pointer+'/$ref',edge.targetResource!+pointerFragment(edge.targetPointer!));
            const source=sources.get(reference.resource)!,field=reference.pointer+'/'+escape(reference.keyword);
            // Ownership preparation can already have renamed this captured
            // URI key. Its recaptured graph coordinate is current; older CST
            // coordinates still carry the original binding's provenance.
            const at=source.doc.dataNode(field)?field:source.current(field);
            if(at===undefined)throw new SourceError('migration.security.owner','A URI binding lost its independently owned requirement occurrence');
            const name=segments(copied.location.pointer).at(-1)!;
            owners.admit(source);source.rename(at,name);
        }
    }
    return provenance;
}

/** Roles are standard in 3.1/3.2 but have no in-band representation in older
 * non-OAuth requirements (3.1.2 §4.8.30; 3.0.4 §4.7.30; 2.0 §6.4.26).
 * Check original graph connections before target validation can obscure them. */
export function checkSecurityRequirementTarget(graph:ReferenceGraph,target:SpecificationFamily,issue:MigrationIssue):void {
    if(target==='2.0'||target==='3.0')for(const scope of graph.entryScopes())if(scope.kind==='security'){
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(graph.referenceObject(value,scope)&&modernFamily(scope.family)&&Object.hasOwn(value,'summary'))
            issue({...scope,pointer:scope.pointer+'/summary'},'migration.security.reference-summary',
                'The selected older Security Scheme cannot retain this Reference Object summary override','target-representation');
        if(target==='2.0'&&graph.referenceObject(value,scope)&&!modernFamily(scope.family)&&Object.keys(value).some(field=>field!=='$ref'))
            issue(scope,'migration.security.ignored-siblings',
                'Materializing this legacy Security Scheme reference requires independent ownership for its authored ignored siblings','implementation');
    }
    for(const reference of graph.references){
        if(reference.connection!=='security'||reference.resolution!=='resolved'||reference.targetResource===undefined||reference.targetPointer===undefined)continue;
        const definition=securityRequirementDefinition(graph,{resource:reference.targetResource,pointer:reference.targetPointer,kind:'security'});
        const value=definition&&graph.docs.get(definition.resource)?.dataNode(definition.pointer)?.value;
        const pointer=reference.pointer+'/'+escape(reference.keyword),roles=graph.docs.get(reference.resource)?.dataNode(pointer);
        if(roles?.kind==='array'&&!securityRequirementValuesAllowed(target,value?.type,roles.children.size))
            issue({resource:reference.resource,pointer},'migration.security.roles','The target requires an empty non-OAuth security list and cannot retain these role requirements','target-representation');
    }
}
