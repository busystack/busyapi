import {componentFamily,componentLocation} from './authoring';
import {children,referenceKinds} from './contexts';
import {escape,segments,SourceError} from './document';
import {documentUriOccurrences} from './document_uris';
import {serverTemplate} from './derived_bundle';
import {documentUriBase,pointerFragment,resolveUri,schemaResourceContextIdentity,supportedSchemaDialect,sameSchemaDialect,type GraphScope,type GraphReference,type ReferenceGraph} from './reference_graph';
import {MigrationSchemaOwners,type MigrationOperationSlot} from './migration_schema_owners';
import {migrationContextDifferences,securityConnectionTarget,sharedNativeSecurityDefinition,type DocumentContext} from './migration_documents';
import {defaultSchemaDialect,modernFamily,type SpecificationFamily} from './specification';
import {SourcePlan,type SourceLocation} from './source_plan';
import type {MigrationIssue} from './migration_schema';
import {capturedSchemaResources} from './migration_schema_resource_contexts';
import {ParameterSemantics} from './parameter_semantics';

const key=(at:SourceLocation)=>JSON.stringify([at.resource,at.pointer]);
const inside=(pointer:string,parent:string)=>pointer===parent||pointer.startsWith(parent+'/');
type ResourceHolder=Readonly<{location:SourceLocation;dialect:string|null}>;
type Placement=Readonly<{scope:GraphScope;location:SourceLocation;intrinsic:ReadonlyMap<string,string>;inheritedDialect:string|null;inheritsResource:boolean;resourceSensitive:boolean}>;
type OwnerSelection=Readonly<{entryNamespace:string;scopes:readonly GraphScope[];distinct:boolean;documentResources:ReadonlySet<string>;varyingResources:ReadonlySet<string>}>;
const useKey=(scope:{resource:string;pointer:string;kind:string})=>JSON.stringify([scope.resource,scope.pointer,scope.kind]);
const interpretationKey=(scope:GraphScope)=>JSON.stringify([useKey(scope),schemaResourceContextIdentity(scope),scope.schemaParent]);
const independentSchema=(graph:ReferenceGraph,scope:GraphScope)=>scope.kind==='schema'&&(
    graph.literalContainer(scope.resource,scope.pointer)!==undefined||
    graph.scopes.get(scope.resource+'#'+scope.pointer)?.kind!=='schema'&&graph.hasOverlappingScope(scope.resource,scope.pointer));
const loweredDocumentResource=(graph:ReferenceGraph,scope:GraphScope,targetFamily:SpecificationFamily|undefined)=>
    targetFamily!==undefined&&targetFamily!=='3.2'&&scope.kind==='schema'&&scope.resourcePointer===''&&
    graph.specifications.get(scope.resource)?.family==='3.2'&&typeof graph.docs.get(scope.resource)!.dataNode('/$self')?.value==='string';

/** Entry namespace and containing-document family are independent. Prefer the
 * selected entry's compatible component map; otherwise retain the captured
 * foreign document's native map. The common allocator still keys the owner by
 * entry use, and the reference/context proofs still apply to every consumer. */
function entryComponentLocation(graph:ReferenceGraph,scope:GraphScope,namespace:string):SourceLocation|undefined {
    const group=componentFamily(scope.kind,scope.family);
    if(!group)return;
    const resource=graph.specifications.get(namespace)?.family===scope.family?namespace:
        graph.specifications.get(scope.resource)?.family===scope.family?scope.resource:undefined;
    const pointer=componentLocation(group,scope.family);
    return resource!==undefined&&pointer!==undefined?{resource,pointer}:undefined;
}

function operationHolderSlot(graph:ReferenceGraph,scope:GraphScope):MigrationOperationSlot|undefined {
    const parts=segments(scope.pointer),method=parts.pop();if(method===undefined)return;
    let pointer=parts.length?'/'+parts.map(escape).join('/'):'',additional=false;
    if(graph.scopeAs(scope.resource,pointer,'operation-map')){
        if(parts.pop()!=='additionalOperations')return;
        pointer=parts.length?'/'+parts.map(escape).join('/'):'',additional=true;
    }
    const parent=graph.scopeAs(scope.resource,pointer,'path-item');
    if(!parent)return undefined;
    const view=graph.pathItem(parent),value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.value;
    const parameters=view.fields.get('parameters'),servers=!Object.hasOwn(value,'servers')?view.fields.get('servers')??
        (graph.docs.get(graph.root)!.dataNode('/servers')?{resource:graph.root,pointer:'/servers'}:undefined):undefined;
    // Refer to inherited Parameter owners instead of duplicating their schemas
    // or identifiers. Operation-local overrides remain local to the copied
    // Operation; canonical name/in inheritance still decides applicability.
    const inherited=parameters?new ParameterSemantics(graph).operation(scope.resource,scope.pointer,parent).visible
        .filter(parameter=>parameter.inherited).map(parameter=>parameter.source):undefined;
    let inheritedServers:MigrationOperationSlot['servers'];
    if(servers){
        const source=new SourcePlan(graph.docs.get(servers.resource)!);
        const urls=[...source.doc.dataNode(servers.pointer)!.children.keys()].map(name=>{
            const pointer=servers.pointer+'/'+escape(name),node=source.doc.dataNode(pointer)!;
            const scope=graph.scopeAs(servers.resource,pointer,'server')!;
            return serverTemplate(node.value.url,documentUriBase(graph,scope),node.value.variables,
                {resource:servers.resource,pointer:pointer+'/url',range:source.doc.dataNode(pointer+'/url')!.range});
        });
        inheritedServers=servers.pointer==='/servers'&&!urls.length?
            {urls:[resolveUri('/',graph.retrievals.get(graph.root)!).href]}:{source,pointer:servers.pointer,urls};
    }
    else if(scope.family!=='2.0'&&!Object.hasOwn(value,'servers'))inheritedServers={urls:[resolveUri('/',graph.retrievals.get(graph.root)!).href]};
    return {parameters:inherited,servers:inheritedServers};
}
export function entryComponentContainer(graph:ReferenceGraph,scope:GraphScope,namespace:string,owners:MigrationSchemaOwners,
    prepared?:(scope:GraphScope)=>boolean):SourceLocation|undefined {
    const container=entryComponentLocation(graph,scope,namespace);
    if(container){
        // A newly admitted holder must not change an independent
        // typed interpretation or literal collection. That container needs its
        // own semantic split before a native member can be inserted there.
        const resource=container.resource;
        let at=container.pointer;
        while(true){
            const primary=graph.scopes.get(resource+'#'+at);
            const protectedRoles=graph.scopesAt(resource,at).every(role=>role.kind===primary?.kind||
                owners.roleOwners(role).length>0||prepared?.(role)===true);
            if(graph.literalContainer(resource,at)!==undefined||graph.hasOverlappingScope(resource,at)&&!protectedRoles){
                const range=graph.docs.get(resource)!.dataNode(at)?.range??graph.docs.get(resource)!.root.range;
                throw new SourceError('migration.owners.entry-container','This component container has another interpretation requiring independent ownership before insertion',range,'unsupported',{resource,pointer:at,range});
            }
            if(!at)break;at=at.slice(0,at.lastIndexOf('/'));
        }
    }
    return container;
}

/** Backward closure over typed containment and static schema references.
 * Moving a static forwarder can change a downstream dynamic call's resource
 * stack. Cycles are finite states, not recursively expanded schema copies. */
function dynamicSchemaDependencies(graph:ReferenceGraph,references:readonly GraphReference[],inspect:()=>void):ReadonlySet<string> {
    const incoming=new Map<string,Set<string>>(),pending:string[]=[],selected=new Set<string>();
    const connect=(source:string,target:string)=>{
        inspect();const owners=incoming.get(target)??new Set<string>();owners.add(source);incoming.set(target,owners);
    };
    for(const scope of graph.scopesFor('schema'))for(const parent of graph.schemaParentsOf(scope))
        connect(key(parent),key(scope));
    for(const reference of references){
        inspect();if(reference.kind!=='schema'||reference.connection)continue;
        if(reference.dynamic||reference.resolution!=='resolved'||!graph.scopeAs(reference.targetResource!,reference.targetPointer!,'schema'))pending.push(key(reference));
        else connect(key(reference),key({resource:reference.targetResource!,pointer:reference.targetPointer!}));
    }
    for(let index=0;index<pending.length;index++){
        inspect();const id=pending[index];if(selected.has(id))continue;
        selected.add(id);pending.push(...incoming.get(id)??[]);
    }
    return selected;
}

/** A variant propagates back through shared fragments until a concrete entry
 * owns its incoming locator. This finite closure follows typed containment and
 * captured references, never reference-looking payload keys. Cycles retain one
 * owner per occurrence; the ordinary allocator repairs the resulting graph. */
export function separateMigrationEntryUses(contexts:readonly DocumentContext[],sources:ReadonlyMap<string,SourcePlan>,
    issue:MigrationIssue,
    preserveContext:(scope:GraphScope,destination:SourceLocation,preserveBase:boolean,expectedBase?:string,namespace?:string)=>void,
    owners:MigrationSchemaOwners,securityComponentNames=false,targetFamily?:SpecificationFamily):ReadonlyMap<string,readonly SourceLocation[]> {
    const differences=migrationContextDifferences(contexts),provenance=new Map<string,SourceLocation[]>();
    if(!contexts.length)return provenance;
    let work=0;
    const admit=()=>{if(++work>2000000)throw new SourceError('limit.migration.owners','Entry specialization exceeds its bounded graph work');};
    const ordered=[...contexts].sort((a,b)=>a.graph.root.localeCompare(b.graph.root));
    for(const {graph}of ordered){
        const pending=[...(differences.get(graph.root)?.values()??[])].map(scope=>({scope,varying:true}));
        const varyingResources=new Set<string>();
        // Entry context and source role are one captured interpretation. Plan
        // both before materializing any destination; no intermediate role copy
        // can acquire a second entry owner in a later pass.
        for(const scope of graph.entryScopes())if((referenceKinds.has(scope.kind)||scope.kind==='operation')&&
            !( /\/(?:writeOnly|deprecated)$/.test(scope.pointer)&&graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value===false)&&
            (graph.literalContainer(scope.resource,scope.pointer)!==undefined||
                graph.hasOverlappingScope(scope.resource,scope.pointer)&&graph.scopes.get(scope.resource+'#'+scope.pointer)?.kind!==scope.kind))pending.push({scope,varying:false});
        // URI bindings shared across entries need each entry's component-name
        // namespace when lowered. Seed the existing typed containment and
        // incoming-reference closure even when their URI targets agree.
        if(securityComponentNames)for(const reference of graph.entryReferences())
            if(reference.connection==='security'&&reference.targetUri!==undefined){
                const owner=graph.referenceOwner(reference);if(owner)pending.push({scope:owner,varying:false});
            }
        if(!pending.length&&!(targetFamily!==undefined&&targetFamily!=='3.2'&&[...graph.specifications].some(([resource,specification])=>
            specification.family==='3.2'&&typeof graph.docs.get(resource)!.dataNode('/$self')?.value==='string')))continue;
        const parents=new Map<string,GraphScope[]>(),incoming=new Map<string,GraphScope[]>();
        const connect=(index:Map<string,GraphScope[]>,child:string,parent:GraphScope)=>{
            admit();const owners=index.get(child)??[];owners.push(parent);index.set(child,owners);
        };
        for(const scope of graph.entryScopes()){
            admit();
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(graph.referenceObject(value,scope)&&scope.kind!=='path-item')continue;
            for(const [name,,kind]of children(value,scope.kind,scope.family)){
                const pointer=scope.pointer+'/'+escape(name);
                connect(parents,useKey({resource:scope.resource,pointer,kind}),scope);
            }
        }
        for(const reference of graph.entryReferences()){
            admit();if(reference.resolution!=='resolved')continue;
            const owner=graph.referenceOwner(reference);
            if(owner){
                connect(incoming,useKey({resource:reference.targetResource!,pointer:reference.targetPointer!,kind:reference.kind}),owner);
            }
        }
        const schemaGroups=new Map<string,GraphScope[]>(),sensitiveGroups=new Set<string>(),documentResources=new Set<string>();
        const dynamic=dynamicSchemaDependencies(graph,graph.entryReferences(),admit);
        for(const scope of graph.entryScopes())if(scope.kind==='schema'&&modernFamily(scope.family)){
            admit();const identity=schemaResourceContextIdentity(scope),members=schemaGroups.get(identity)??[];
            members.push(scope);schemaGroups.set(identity,members);
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            const anchored=typeof value?.$anchor==='string'||typeof value?.$dynamicAnchor==='string';
            if(dynamic.has(key(scope))||anchored)sensitiveGroups.add(identity);
            if(anchored&&loweredDocumentResource(graph,scope,targetFamily))documentResources.add(identity);
        }
        for(const identity of documentResources)pending.push(...(schemaGroups.get(identity)??[]).map(scope=>({scope,varying:false})));
        const selected=new Map<string,GraphScope>(),visited=new Set<string>();
        for(let index=0;index<pending.length;index++){
            admit();const {scope,varying}=pending[index],id=useKey(scope),state=JSON.stringify([id,varying]);
            if(visited.has(state)||!graph.isEntryUse(scope))continue;
            visited.add(state);if(varying)varyingResources.add(schemaResourceContextIdentity(scope));
            const predecessors=[...(parents.get(id)??[]),...(incoming.get(id)??[])].map(scope=>({scope,varying}));
            // The owning entry keeps its intrinsic fields; secondary Schema
            // interpretations can acquire their own owners too. Foreign document
            // subtrees can have independent entry names/media, even though
            // their containing document still owns their family and dialect.
            if(scope.resource===graph.root&&graph.literalContainer(scope.resource,scope.pointer)===undefined&&
                !(scope.kind==='schema'&&documentResources.has(schemaResourceContextIdentity(scope)))&&
                !(graph.hasOverlappingScope(scope.resource,scope.pointer)&&graph.scopes.get(scope.resource+'#'+scope.pointer)?.kind!==scope.kind)){pending.push(...predecessors);continue;}
            if(scope.kind==='root')continue;
            selected.set(id,scope);
            pending.push(...predecessors);
            if(scope.kind==='schema'&&sensitiveGroups.has(schemaResourceContextIdentity(scope)))
                pending.push(...(schemaGroups.get(schemaResourceContextIdentity(scope))??[]).map(scope=>({scope,varying})));
        }
        const copies=materializeMigrationOwners(graph,sources,issue,preserveContext,
            {entryNamespace:graph.root,scopes:[...selected.values()],distinct:Boolean(differences.get(graph.root)?.size),documentResources,
                varyingResources},owners);
        for(const [origin,locations]of copies){
            const values=provenance.get(origin)??[];values.push(...locations);provenance.set(origin,values);
        }
    }
    return provenance;
}

/** Split established semantic uses before any family conversion. The physical
 * dictionary or literal value stays with its original owner. Only references
 * and fields belonging to the native interpretation use the standard generated
 * owner. Core 9.4.2 leaves non-schema targets undefined; this preserves BusyAPI's
 * existing explicit interpretation, rather than discovering schemas in data.
 *
 * This relation is deliberately separate from a planning copy's conversion
 * coordinates: an independently used dictionary member can still be converted
 * and moved by its structural owner without retargeting the schema copy. */
function materializeMigrationOwners(graph:ReferenceGraph,sources:ReadonlyMap<string,SourcePlan>,issue:MigrationIssue,
    preserveContext:(scope:GraphScope,destination:SourceLocation,preserveBase:boolean,expectedBase?:string,namespace?:string)=>void,
    entry:OwnerSelection,owners:MigrationSchemaOwners):ReadonlyMap<string,readonly SourceLocation[]> {
    const provenance=new Map<string,SourceLocation[]>(),references=graph.entryReferences();
    const schemaScopes=graph.scopesFor('schema');
    const candidates=entry.scopes.filter(scope=>referenceKinds.has(scope.kind)||scope.kind==='operation');
    if(!candidates.length)return provenance;
    // These exact captured roles are copied before repair, even if their
    // destinations are ancestors of one another. Reservation and all source
    // reads remain independent of earlier insertions. Merely sharing a kind
    // or physical prefix cannot authorize an unprepared interpretation.
    const preparing=new Set(candidates.map(interpretationKey));
    const componentContainer=(scope:GraphScope,namespace:string)=>entryComponentContainer(graph,scope,namespace,owners,role=>
        preparing.has(interpretationKey(role)));
    const uris=[...documentUriOccurrences(graph)];
    // A generated $defs owner may sit inside another independently interpreted
    // object's unknown annotation. Copy each interpretation from its captured
    // value, never from a planning document containing earlier generated uses.
    const pristine=new Map([...new Set(candidates.map(scope=>scope.resource))].map(resource=>[resource,new SourcePlan(graph.docs.get(resource)!)]));
    const placements:Placement[]=[];
    const resourceVariants=new Map<string,string>();
    const resourceHolders=new Map<string,ResourceHolder>();
    const nativeSlots=new Set<string>();
    const nativeSchemaSlot=(scope:GraphScope)=>{
        const container=componentLocation('schemas',scope.family),prefix=container+'/';
        return scope.kind==='schema'&&graph.specifications.get(scope.resource)?.family===scope.family&&
            container!==undefined&&scope.pointer.startsWith(prefix)&&!scope.pointer.slice(prefix.length).includes('/');
    };
    const retainedNative=(scope:GraphScope)=>nativeSchemaSlot(scope)&&
        !entry.varyingResources.has(schemaResourceContextIdentity(scope))&&
        !entry.documentResources.has(schemaResourceContextIdentity(scope));
    let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.owners','Independent semantic ownership exceeds its bounded graph work');};
    const dynamicSchemas=dynamicSchemaDependencies(graph,references,inspect);
    const dynamicDependency=(schemas:readonly GraphScope[])=>schemas.some(scope=>{inspect();return dynamicSchemas.has(key(scope));});
    {
        // Independently admitted schemas can share an implicit resource even
        // when its physical dictionary is not itself a Schema Object. One
        // neutral resource owner retains that context; each intrinsic schema
        // tree is copied once beneath it, with cycles left as references.
        const resources=capturedSchemaResources(graph);
        for(const owner of graph.entryScopes()){
            inspect();if(owner.kind==='schema'||owner.kind==='root'&&!graph.specifications.has(owner.resource))continue;
            const value=graph.docs.get(owner.resource)!.dataNode(owner.pointer)?.value;
            if(graph.referenceObject(value,owner))continue;
            for(const [name,,kind]of children(value,owner.kind,owner.family)){
                inspect();if(kind!=='schema')continue;
                const slot={resource:owner.resource,pointer:owner.pointer+'/'+escape(name)};
                if(graph.scopeAs(slot.resource,slot.pointer,'schema')?.schemaParent===undefined)nativeSlots.add(key(slot));
            }
        }
        // A native ancestor can require specialization solely because of a
        // security/operation name. Its intrinsic schemas still need their
        // captured resource stack, even when none seeded a context difference.
        // Admit those typed roots to the existing resource-holder algorithm;
        // never discover schemas through arbitrary payload keys.
        const admitted=new Set(candidates.map(useKey));
        const admitSchemas=(scope:GraphScope,depth=0)=>{
            inspect();if(depth>128)throw new SourceError('limit.migration.owners','Native resource ownership exceeds 128 typed levels');
            if(scope.kind==='schema'){
                const id=useKey(scope);if(!admitted.has(id)){candidates.push(scope);admitted.add(id);}return;
            }
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(graph.referenceObject(value,scope)&&scope.kind!=='path-item')return;
            for(const [name,,kind]of children(value,scope.kind,scope.family)){
                const child=graph.scopeAs(scope.resource,scope.pointer+'/'+escape(name),kind);
                if(child)admitSchemas(child,depth+1);
            }
        };
        for(const scope of [...candidates])if(scope.kind!=='schema')admitSchemas(scope);
        for(const scope of schemaScopes)if(retainedNative(scope)&&graph.schemaParentsOf(scope).some(parent=>admitted.has(useKey(parent)))){
            nativeSlots.add(key(scope));
            const id=useKey(scope);if(!admitted.has(id)){candidates.push(scope);admitted.add(id);}
            if(scope.pointer===scope.resourcePointer)resourceHolders.set(schemaResourceContextIdentity(scope),{location:scope,dialect:scope.dialect});
        }
        const needed=new Map<string,GraphScope>();
        for(const scope of candidates){
            inspect();
            if(scope.kind!=='schema'||!modernFamily(scope.family)||!supportedSchemaDialect(scope))continue;
            if(scope.resource===graph.root&&!independentSchema(graph,scope)&&!entry.documentResources.has(schemaResourceContextIdentity(scope)))continue;
            if(scope.pointer===scope.resourcePointer)continue;
            const identity=schemaResourceContextIdentity(scope);
            const anchored=(resources.get(identity)?.members??[]).some(schema=>{
                inspect();if(!inside(schema.pointer,scope.pointer))return false;
                const value=graph.docs.get(schema.resource)!.dataNode(schema.pointer)?.value;
                return typeof value?.$anchor==='string'||typeof value?.$dynamicAnchor==='string';
            });
            const needsResource=anchored||dynamicDependency([scope])||owners.authoredDialect(scope)!==undefined&&
                !sameSchemaDialect(scope.dialect,defaultSchemaDialect(graph.family));
            // Entry variants must not add discriminator wire names. Anonymous
            // map uses, ordinary models and boolean choices share the same
            // resource holder; original public aliases retain their names.
            if(needsResource)needed.set(identity,scope);
        }
        const selected=new Set(candidates.map(useKey));
        for(const [identity,scope]of [...needed].sort(([a],[b])=>a.localeCompare(b))){
            const captured=resources.get(identity)!,boundary=captured.boundary;
            if(!entry.varyingResources.has(identity)){
                const frames=new Map(captured.members.flatMap(member=>owners.roleOwners(member)).flatMap(use=>
                    use.context?.frame?[[key(use.context.frame.location),use.context.frame] as const]:[]));
                if(frames.size===1){const frame=[...frames.values()][0];resourceHolders.set(identity,{location:frame.location,dialect:frame.scope.dialect});continue;}
            }
            const whole=boundary!==undefined;
            // A real retained Schema resource is already the final URI owner.
            // Literal-role extraction can place its selected use directly in
            // that resource's definitions without cloning a published identity.
            if(!entry.varyingResources.has(identity)&&boundary&&graph.isEntryUse(boundary)&&
                graph.literalContainer(boundary.resource,boundary.pointer)===undefined&&!graph.hasOverlappingScope(boundary.resource,boundary.pointer)){
                resourceHolders.set(identity,{location:boundary,dialect:boundary.dialect});continue;
            }
            // A selected intrinsic Schema ancestor already carries an embedded
            // whole resource anonymously. It needs no additional empty holder.
            // Use typed containment rather than a source-prefix assumption.
            let contained=false;
            if(whole&&boundary){
                const pending=[...graph.schemaParentsOf(boundary)],seen=new Set<string>();
                for(let index=0;index<pending.length;index++){
                    inspect();const parent=pending[index],id=useKey(parent);
                    if(seen.has(id))continue;seen.add(id);
                    if(selected.has(id)){contained=true;break;}
                    pending.push(...graph.schemaParentsOf(parent));
                }
            }
            if(!contained&&!whole){
                const namespace=entry.entryNamespace;
                if(!scope.dialect)continue;
                const native=!entry.varyingResources.has(identity)&&scope.resourcePointer===''&&graph.specifications.has(scope.resource)&&
                    scope.base===graph.scope(scope.resource,'').base&&!entry.documentResources.has(schemaResourceContextIdentity(scope));
                const container=native?componentContainer(scope,scope.resource):undefined;
                const reserved=owners.reserve(scope,'resource_use',JSON.stringify([namespace,identity]),container,true);
                const source=reserved.source,holder=reserved.location;
                const retainUri=native||!entry.distinct&&entry.documentResources.has(identity)&&scope.base!==scope.resource;
                const base=retainUri?scope.base:owners.resourceIdentity(namespace,identity);
                // A real API resource keeps its existing URI frame. External
                // implicit fragments need one explicit, independently captured
                // resource. Both are final Schema owners, never preparation
                // wrappers awaiting retirement.
                owners.admit(source,8);source.set(holder.pointer,{
                    ...(!native?{$id:base,$schema:scope.dialect}:!sameSchemaDialect(scope.dialect,graph.scope(scope.resource,'').dialect)?{$schema:scope.dialect}:{}),$defs:{}});
                source.origins.set(holder.pointer,new Set([holder.pointer]));
                source.presentationChanges.push(holder.pointer);
                if(!native)resourceVariants.set(identity,base);resourceHolders.set(identity,{location:holder,dialect:scope.dialect});
                // The API's other native roots already inhabit this exact
                // resource. Copy only the selected independent occurrences;
                // cloning native public bindings would reactivate literal
                // declarations and duplicate their anchors.
                if(native)continue;
            }
            if(whole&&boundary&&!selected.has(useKey(boundary))){candidates.push(boundary);selected.add(useKey(boundary));}
            for(const member of captured.roots){
                inspect();if(selected.has(useKey(member)))continue;
                candidates.push(member);selected.add(useKey(member));
            }
        }
    }
    const placementFor=(at:SourceLocation,kind:string):Placement|undefined=>{
        let selected:Placement|undefined;
        for(const placement of placements){
            inspect();
            if(placement.scope.resource===at.resource&&inside(at.pointer,placement.scope.pointer)&&
                (placement.intrinsic.get(at.pointer)===kind||kind==='discriminator'&&placement.intrinsic.get(at.pointer)==='discriminator-map')&&
                (!selected||placement.scope.pointer.length>selected.scope.pointer.length))selected=placement;
        }
        return selected;
    };
    for(const scope of candidates.sort((a,b)=>a.resource.localeCompare(b.resource)||a.pointer.length-b.pointer.length||a.pointer.localeCompare(b.pointer)||a.kind.localeCompare(b.kind))){
        // Ordinary descendants of a copied object already have an owner. A
        // nested literal or independently interpreted use still needs its own.
        const containing=placementFor(scope,scope.kind);
        const materialSlot=scope.kind==='schema'&&nativeSlots.has(key(scope))&&(retainedNative(scope)||
            scope.pointer!==scope.resourcePointer&&resourceHolders.has(schemaResourceContextIdentity(scope)));
        if(containing&&!materialSlot)continue;
        const intrinsic=new Map<string,string>();
        const visit=(pointer:string,kind:string,depth=0)=>{
            inspect();
            if(depth>128)throw new SourceError('limit.migration.owners','Independent semantic containment exceeds 128 levels');
            intrinsic.set(pointer,kind);
            const value=graph.docs.get(scope.resource)!.dataNode(pointer)?.value;
            const context=graph.scopeAs(scope.resource,pointer,kind)??scope;
            if(graph.referenceObject(value,{...context,kind})&&kind!=='path-item')return;
            for(const [name,,next]of children(value,kind,context.family))visit(pointer+'/'+escape(name),next,depth+1);
        };
        visit(scope.pointer,scope.kind);
        let anchored=false;
        for(const [pointer,kind]of intrinsic){
            if(kind!=='schema')continue;
            const nested=graph.scopeAs(scope.resource,pointer,'schema');
            const value=graph.docs.get(scope.resource)!.dataNode(pointer)?.value;
            if(nested&&!inside(nested.resourcePointer,scope.pointer)&&
                (typeof value?.$anchor==='string'||typeof value?.$dynamicAnchor==='string')){
                anchored=true;
            }
        }
        const dynamic=references.find(reference=>{
            inspect();return reference.dynamic&&(
                reference.resource===scope.resource&&intrinsic.get(reference.pointer)==='schema'||
                reference.dynamic.candidates.some(candidate=>candidate.resource===scope.resource&&intrinsic.get(candidate.pointer)==='schema'));
        });
        const group=componentFamily(scope.kind,scope.family);
        const nativeContainer=scope.kind==='security'&&group&&graph.specifications.get(scope.resource)?.family===scope.family?
            componentLocation(group,scope.family):undefined;
        // Native component owners keep document/API URI context. Schema uses
        // usually keep the separate registry: introducing a new component model
        // name could alter implicit discriminator choices. Model-independent
        // views below cannot join an existing discriminator's namespace.
        let container:SourceLocation|undefined;
        const operationSlot=scope.kind==='operation'?operationHolderSlot(graph,scope):undefined;
        // Native objects without a reusable component category occupy their
        // final anonymous slot. Captured planning contexts retain their family
        // until the coordinated conversion stage finishes.
        const anonymousNative=scope.kind!=='schema'&&scope.kind!=='security';
        container??=nativeContainer?{resource:scope.resource,pointer:nativeContainer}:undefined;
        let intrinsicSchemas=schemaScopes.filter(schema=>{
            inspect();return schema.resource===scope.resource&&intrinsic.get(schema.pointer)==='schema';
        });
        // A native object's physical root is not itself a schema resource
        // owner. Every boundary must be an actual intrinsic Schema Object.
        let identified=intrinsicSchemas.every(schema=>inside(schema.resourcePointer,scope.pointer)&&intrinsic.get(schema.resourcePointer)==='schema');
        let resourceSensitive=anchored||dynamic!==undefined||dynamicDependency(intrinsicSchemas);
        const copiedHolder=resourceHolders.get(schemaResourceContextIdentity(scope));
        let ownedResources=intrinsicSchemas.every(schema=>{
            inspect();return inside(schema.resourcePointer,scope.pointer)&&intrinsic.get(schema.resourcePointer)==='schema'||
                resourceHolders.has(schemaResourceContextIdentity(schema));
        });
        let inheritedDialect:string|null|undefined;
        let inheritsResource=false;
        if(entry){
            const entryContainer=anonymousNative||scope.kind==='schema'?undefined:componentContainer(scope,entry.entryNamespace);
            if((!entryContainer&&!anonymousNative&&scope.kind!=='schema')||(resourceSensitive&&!identified&&!ownedResources)){
                issue({...scope,decisionKey:entry.entryNamespace},'migration.owners.entry-resource',
                    'This entry-dependent use requires its captured schema resource identity before specialization','implementation');
                return provenance;
            }
            container=anonymousNative||scope.kind==='schema'?undefined:entryContainer!;
            for(const schema of intrinsicSchemas){
                inspect();
                const value=graph.docs.get(schema.resource)!.dataNode(schema.pointer)?.value;
                if(typeof value?.$id!=='string'&&!(modernFamily(schema.family)&&schema.pointer===schema.resourcePointer&&value!==null&&typeof value==='object'&&!Array.isArray(value)))continue;
                const identity=schemaResourceContextIdentity(schema);
                if(entry.varyingResources.has(identity)&&!resourceVariants.has(identity))resourceVariants.set(identity,owners.resourceIdentity(entry.entryNamespace,identity));
            }
        }
        if(copiedHolder&&scope.kind==='schema'){
            container={resource:copiedHolder.location.resource,pointer:copiedHolder.location.pointer+'/$defs'};
            inheritedDialect=copiedHolder.dialect;inheritsResource=scope.pointer!==scope.resourcePointer||typeof graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value==='boolean';
        }
        if(resourceSensitive&&!identified&&!ownedResources&&!copiedHolder&&scope.kind==='schema'){
            issue(scope,'migration.owners.resource-context','A resource-sensitive schema requires its captured whole-resource owner before specialization','implementation');
            return provenance;
        }
        if(group&&container&&container.pointer===componentLocation(group,scope.family)){
            // A compatible native map can itself have a Schema interpretation.
            // Admit insertion only after that exact interpretation has a
            // captured copy (including a scheduled immutable map copy). Every
            // other role needs the same proof; literal containers stay guarded.
            entryComponentContainer(graph,scope,container.resource,owners,role=>{
                if(preparing.has(interpretationKey(role)))return true;
                inspect();if(role.kind===scope.kind&&role.resource===scope.resource&&role.pointer===scope.pointer)return true;
                const placement=placementFor(role,role.kind);
                return placement!==undefined&&(placement.location.resource!==role.resource||placement.location.pointer!==role.pointer);
            });
        }
        const shared=!entry.distinct?owners.roleOwners(scope):[];
        const separated=retainedNative(scope)?{location:scope,provenance:new Map<string,SourceLocation>()}:
            shared.length===1?{location:shared[0].location,provenance:new Map<string,SourceLocation>()}:owners.separate(scope,'entry_use',{
            container,captured:pristine.get(scope.resource),
            operationSlot,
            identity:JSON.stringify([entry.entryNamespace,interpretationKey(scope)]),
        });
        for(const schema of intrinsicSchemas){
            inspect();
            const value=graph.docs.get(schema.resource)!.dataNode(schema.pointer)?.value;
            if(modernFamily(schema.family)&&value!==null&&typeof value==='object'&&!Array.isArray(value)&&schema.pointer===schema.resourcePointer&&
                (typeof value?.$id==='string'||resourceVariants.has(schemaResourceContextIdentity(schema))))
                resourceHolders.set(schemaResourceContextIdentity(schema),{location:{resource:separated.location.resource,
                    pointer:separated.location.pointer+schema.pointer.slice(scope.pointer.length)},dialect:schema.dialect});
        }
        placements.push({scope,location:separated.location,intrinsic,inheritsResource,resourceSensitive,inheritedDialect:inheritedDialect!==undefined?inheritedDialect:container?
            graph.scope(container.resource,container.pointer).dialect:defaultSchemaDialect(graph.family)});
        for(const [pointer,location]of separated.provenance){
            const identity=key({resource:scope.resource,pointer}),values=provenance.get(identity)??[];
            values.push(location);provenance.set(identity,values);
        }
    }
    const mapped=(at:SourceLocation,placement:Placement):SourceLocation=>({resource:placement.location.resource,pointer:placement.location.pointer+at.pointer.slice(placement.scope.pointer.length)});
    for(const placement of placements){
      const native=graph.scopes.get(placement.scope.resource+'#'+placement.scope.pointer);
      const retained=native&&native.kind!==placement.scope.kind&&graph.isEntryUse(native)&&!placementFor(native,native.kind);
      for(const [pointer,kind]of placement.intrinsic){
        const captured=graph.scopeAs(placement.scope.resource,pointer,kind);if(!captured)continue;
        const owner=placementFor(captured,kind)!;
        const destination=mapped(captured,owner);
        // A copied role can share a child with a retained native parent.
        // Keep that actual original child and its copied use, rather than
        // refining both parents' fields into the copy's coordinates.
        if(retained&&owner===placement&&pointer!==placement.scope.pointer&&kind!=='schema'&&
            graph.scopes.get(captured.resource+'#'+captured.pointer)?.kind===kind){
            owners.retainBinding(entry.entryNamespace,captured);
            const source=sources.get(destination.resource)!,locations=source.original.id===captured.resource?
                source.origins.get(captured.pointer):source.foreignOrigins.get(captured.resource+'#'+captured.pointer);
            locations?.delete(destination.pointer);
            provenance.set(key(captured),(provenance.get(key(captured))??[]).filter(at=>
                at.resource!==destination.resource||at.pointer!==destination.pointer));
            owners.rememberAdditionalUse(entry.entryNamespace,captured,destination);
            if(!entry.distinct)owners.rememberRole(entry.entryNamespace,captured,captured);
            continue;
        }
        owners.rememberEntry(entry.entryNamespace,captured,destination,owner.scope);
        const expectedBase=kind==='schema'?resourceVariants.get(schemaResourceContextIdentity(captured)):undefined;
        preserveContext(captured,destination,kind==='schema'&&(owner.resourceSensitive||expectedBase!==undefined),expectedBase,entry.entryNamespace);
        if(kind==='schema'){
            const frame=resourceHolders.get(schemaResourceContextIdentity(captured))?.location;
            if(frame&&frame.resource===destination.resource&&destination.pointer.startsWith(frame.pointer+'/'))
                owners.rememberFrame(entry.entryNamespace,captured,destination,frame);
        }
        if(!entry.distinct)owners.rememberRole(entry.entryNamespace,captured,destination);
        if(kind!=='schema'||!nativeSlots.has(key(captured))||owner===placement)continue;
        const slot=mapped(captured,placement),source=sources.get(slot.resource)!;
        // The native field is a use of the material schema, not a second
        // anchor-bearing definition. Retire its old child coordinates before
        // installing the new locator; copied source comments/values stay with
        // the material owner and the original literal dictionary.
        for(const [origin,locations]of provenance)provenance.set(origin,locations.filter(location=>{
            inspect();return location.resource!==slot.resource||location.pointer===slot.pointer||!inside(location.pointer,slot.pointer);
        }));
        const target=mapped(captured,owner);
        owners.referenceUse(source,slot.pointer,target);
    }
    }
    const set=(at:SourceLocation,value:string)=>{const source=sources.get(at.resource)!;owners.admit(source);source.set(at.pointer,value);};
    const securityAlias=(reference:GraphReference,target:SourceLocation):string=>{
        const containers:SourceLocation[]=[],excluded=new Set<string>();
        const origin=graph.scopeAs(reference.targetResource!,reference.targetPointer!,'security')!;
        let legacy=false;
        for(const [namespace,specification]of graph.specifications){
            inspect();if(specification.family==='2.0')legacy=true;
            if(specification.family!==origin.family&&(!modernFamily(specification.family)||!modernFamily(origin.family)))legacy=true;
            const container=componentContainer({...reference,kind:'security',family:specification.family},namespace);
            if(!container)throw new SourceError('migration.owners.connection-name','A captured entry has no native Security Scheme alias container');
            containers.push(container);
            for(const name of sources.get(container.resource)!.doc.dataNode(container.pointer)?.children.keys()??[]){inspect();excluded.add(name);}
        }
        for(const connection of references){inspect();if(connection.connection==='security')excluded.add(connection.value);}
        let definition:Readonly<{scope:GraphScope;origin:GraphScope;captured:SourcePlan}>|undefined;
        if(legacy){
            const terminal=securityConnectionTarget(graph,origin,inspect),scope=graph.scopeAs(terminal.resource,terminal.pointer,'security')!;
            if(!scope||!sharedNativeSecurityDefinition(graph,scope,inspect)){
                const pointer=reference.pointer+'/'+escape(reference.keyword),range=graph.docs.get(reference.resource)!.dataNode(pointer)!.range;
                throw new SourceError('migration.owners.connection-family','This named security binding needs an additional family-preserving definition mapping before foreign native placement',
                    range,'unsupported',{resource:reference.resource,pointer,range});
            }
            // A 3.0 Reference Object cannot substitute a modern definition.
            // Copy only the proved common concrete representation instead.
            definition={scope,origin,captured:pristine.get(scope.resource)??new SourcePlan(graph.docs.get(scope.resource)!)};
        }
        return owners.securityAlias(containers,target,JSON.stringify([entry.entryNamespace,target.resource,target.pointer]),excluded,definition);
    };
    // Only named bindings need domain-specific aliases in foreign API maps.
    // Static, dynamic and URI-key edges are emitted once by the coordinator
    // from the common captured occurrence-to-terminal-owner relation.
    for(const reference of references){
        inspect();if(reference.resolution!=='resolved'||reference.connection!=='security'||reference.targetUri!==undefined)continue;
        const placement=placementFor(reference,'security-requirement');
        if(!placement)continue;
        const destination={resource:reference.targetResource!,pointer:reference.targetPointer!},selected=placementFor(destination,reference.kind);
        const target=selected?mapped(destination,selected):owners.entryOwner(entry.entryNamespace,destination,reference.kind);
        if(target.resource===destination.resource&&target.pointer===destination.pointer)continue;
        const field=mapped({...reference,pointer:reference.pointer+'/'+escape(reference.keyword)},placement),source=sources.get(field.resource)!;
        owners.admit(source);source.rename(field.pointer,securityAlias(reference,target));
    }
    for(const placement of placements){
        for(const scope of schemaScopes){
            inspect();
            if(scope.resource!==placement.scope.resource||placement.intrinsic.get(scope.pointer)!=='schema'||placementFor(scope,'schema')!==placement)continue;
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            const variant=resourceVariants.get(schemaResourceContextIdentity(scope));
            if(value!==null&&typeof value==='object'&&!Array.isArray(value)&&(typeof value.$id==='string'||variant&&scope.pointer===scope.resourcePointer))
                set(mapped({...scope,pointer:scope.pointer+'/$id'},placement),variant??scope.base);
            const location=mapped(scope,placement);
            if(modernFamily(scope.family)&&scope.pointer===scope.resourcePointer&&scope.dialect&&
                typeof sources.get(location.resource)!.doc.dataNode(location.pointer)?.value?.$id==='string')
                set({...location,pointer:location.pointer+'/$schema'},scope.dialect);
        }
        for(const uri of uris){
            inspect();
            if(uri.scope.resource!==placement.scope.resource||placement.intrinsic.get(uri.scope.pointer)!==uri.scope.kind||placementFor(uri.scope,uri.scope.kind)!==placement)continue;
            const source=graph.docs.get(uri.scope.resource)!;
            const address=uri.scope.kind==='server'?serverTemplate(uri.value,documentUriBase(graph,uri.scope),source.dataNode(uri.scope.pointer)?.value?.variables,
                {resource:uri.scope.resource,pointer:uri.pointer,range:source.dataNode(uri.pointer)!.range}):resolveUri(uri.value,documentUriBase(graph,uri.scope)).href;
            set(mapped({resource:uri.scope.resource,pointer:uri.pointer},placement),address);
        }
        // Selecting the captured dialect is necessary when the generated owner
        // belongs to an entry with a different default schema dialect.
        if(placement.scope.kind==='schema'&&modernFamily(placement.scope.family)&&!sameSchemaDialect(placement.scope.dialect,placement.inheritedDialect)&&placement.scope.dialect&&owners.authoredDialect(placement.scope)!==undefined){
            if(typeof sources.get(placement.location.resource)!.doc.dataNode(placement.location.pointer)?.value?.$id!=='string')
                set({...placement.location,pointer:placement.location.pointer+'/$id'},owners.resourceIdentity(entry.entryNamespace,interpretationKey(placement.scope)));
            set({...placement.location,pointer:placement.location.pointer+'/$schema'},placement.scope.dialect);
        }
        else if(placement.scope.kind==='schema'&&placement.inheritsResource&&
            Object.hasOwn(graph.docs.get(placement.scope.resource)!.dataNode(placement.scope.pointer)?.value??{},'$schema'))
            sources.get(placement.location.resource)!.remove(placement.location.pointer+'/$schema');
    }
    for(const placement of placements)if(nativeSlots.has(key(placement.scope))&&entry.documentResources.has(schemaResourceContextIdentity(placement.scope)))
        owners.referenceUse(sources.get(placement.scope.resource)!,placement.scope.pointer,placement.location);
    // Each API owns its public component bindings. A child of a copied map
    // can already have its final owner without another physical placement.
    for(const scope of schemaScopes){
        if(scope.resource!==graph.root||!nativeSchemaSlot(scope))continue;
        const target=owners.entryOwner(entry.entryNamespace,scope,'schema');
        if(target.resource!==scope.resource||target.pointer!==scope.pointer)
            owners.referenceUse(sources.get(scope.resource)!,scope.pointer,target);
    }
    return provenance;
}

/** A cloned operation retains its public operationId. Link Objects can use
 * their normative URI alternative to bind the exact captured operation owner,
 * avoiding an ambiguous name among the independent documents in the project.
 * This runs after common ownership, so literal/data uses are never renamed. */
export function materializeMigrationOperationConnections(contexts:readonly DocumentContext[],sources:ReadonlyMap<string,SourcePlan>,
    owners:MigrationSchemaOwners,issue:MigrationIssue):boolean {
    const desired=new Map<string,{source:SourcePlan;pointer:string;value:string;origin:GraphReference}>();let work=0;
    for(const {graph}of contexts)for(const reference of graph.entryReferences()){
        if(++work>2000000)throw new SourceError('limit.migration.owners','Operation connection ownership exceeds 2000000 captured uses');
        if(reference.connection!=='operationId'||reference.resolution!=='resolved'||!owners.operationNameHasVariants(reference.value))continue;
        const owner=graph.referenceOwner(reference);if(!owner)continue;
        const link=owners.entryOwner(graph.root,owner,'link'),target=owners.entryOwner(graph.root,
            {resource:reference.targetResource!,pointer:reference.targetPointer!},'operation');
        const source=sources.get(link.resource)!,pointer=source.current(link.pointer+'/operationId');
        if(pointer===undefined||source.doc.dataNode(pointer)?.value!==reference.value){
            issue({...reference,pointer:reference.pointer+'/operationId'},'migration.owners.connection-source','This captured operation connection has no retained material field','implementation');continue;
        }
        const original=link.resource===owner.resource&&link.pointer===owner.pointer;
        if(original&&graph.literalContainer(owner.resource,owner.pointer)!==undefined){
            issue({...reference,pointer:reference.pointer+'/operationId'},'migration.owners.connection-literal','This operation connection still requires an independently owned Link Object before URI materialization','implementation');continue;
        }
        const value=target.resource+pointerFragment(target.pointer),id=key({resource:link.resource,pointer}),previous=desired.get(id);
        if(previous&&previous.value!==value){
            issue({...reference,pointer:reference.pointer+'/operationId'},'migration.owners.connection-target','This operation connection still has different captured entry targets and requires an independent owner','implementation');continue;
        }
        desired.set(id,{source,pointer,value,origin:reference});
    }
    for(const {source,pointer,value,origin}of desired.values()){
        const parent=pointer.slice(0,pointer.lastIndexOf('/'));
        if(source.doc.dataNode(parent+'/operationRef')){
            issue({...origin,pointer:origin.pointer+'/operationId'},'migration.owners.connection-collision','The material Link Object already has an operationRef field','implementation');continue;
        }
        owners.admit(source,2);source.rename(pointer,'operationRef');source.set(parent+'/operationRef',value);
    }
    return desired.size>0;
}
