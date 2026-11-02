import {componentFamily,componentLocation} from './authoring';
import {children,referenceKinds} from './contexts';
import {escape,SourceError} from './document';
import {documentUriOccurrences} from './document_uris';
import {serverTemplate} from './derived_bundle';
import {documentUriBase,pointerFragment,resolveUri,type GraphScope,type GraphReference,type ReferenceGraph} from './reference_graph';
import {MigrationSchemaOwners} from './migration_schema_owners';
import {migrationContextDifferences,type DocumentContext} from './migration_documents';
import {defaultSchemaDialect,modernFamily} from './specification';
import type {MigrationLocation,MigrationSource} from './migration_source';
import type {MigrationIssue} from './migration_schema';

const key=(at:MigrationLocation)=>JSON.stringify([at.resource,at.pointer]);
const inside=(pointer:string,parent:string)=>pointer===parent||pointer.startsWith(parent+'/');
type Placement=Readonly<{scope:GraphScope;location:MigrationLocation;intrinsic:ReadonlyMap<string,string>;inheritedDialect:string|null}>;
type EntrySelection=Readonly<{entryNamespace:string;scopes:readonly GraphScope[]}>;
const useKey=(scope:{resource:string;pointer:string;kind:string})=>JSON.stringify([scope.resource,scope.pointer,scope.kind]);
const referenceOwnerKind=(reference:GraphReference)=>reference.connection==='discriminator'?'discriminator':
    reference.connection==='security'?'security-requirement':reference.connection?'link':reference.kind;

/** A variant propagates back through shared fragments until a concrete entry
 * owns its incoming locator. This finite closure follows typed containment and
 * captured references, never reference-looking payload keys. Cycles retain one
 * owner per occurrence; the ordinary allocator repairs the resulting graph. */
export function separateMigrationEntryUses(contexts:readonly DocumentContext[],sources:ReadonlyMap<string,MigrationSource>,
    issue:MigrationIssue,createSchemaResource:()=>MigrationSource,
    preserveContext:(scope:GraphScope,destination:MigrationLocation,preserveBase:boolean)=>void):ReadonlyMap<string,readonly MigrationLocation[]> {
    const differences=migrationContextDifferences(contexts),provenance=new Map<string,MigrationLocation[]>();
    if(!contexts.length)return provenance;
    const owners=new MigrationSchemaOwners(contexts[0].graph,sources,createSchemaResource);
    let work=0;
    const admit=()=>{if(++work>2000000)throw new SourceError('limit.migration.owners','Entry specialization exceeds its bounded graph work');};
    for(const {graph}of [...contexts].sort((a,b)=>a.graph.root.localeCompare(b.graph.root))){
        const pending=[...(differences.get(graph.root)?.values()??[])];
        if(!pending.length)continue;
        const parents=new Map<string,GraphScope[]>(),incoming=new Map<string,GraphScope[]>(),forward=new Map<string,GraphScope[]>();
        const connect=(index:Map<string,GraphScope[]>,child:string,parent:GraphScope)=>{
            admit();const owners=index.get(child)??[];owners.push(parent);index.set(child,owners);
        };
        for(const scope of graph.interpretedScopes()){
            admit();
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(graph.referenceObject(value,scope)&&scope.kind!=='path-item')continue;
            for(const [name,,kind]of children(value,scope.kind,scope.family)){
                const pointer=scope.pointer+'/'+escape(name),child=graph.scopeAs(scope.resource,pointer,kind);
                connect(parents,useKey({resource:scope.resource,pointer,kind}),scope);
                if(child)connect(forward,useKey(scope),child);
            }
        }
        for(const reference of graph.references){
            admit();if(reference.resolution!=='resolved')continue;
            const owner=graph.scopeAs(reference.resource,reference.pointer,referenceOwnerKind(reference))??
                (reference.connection==='discriminator'?graph.scopeAs(reference.resource,reference.pointer,'discriminator-map'):undefined);
            if(owner){
                connect(incoming,useKey({resource:reference.targetResource!,pointer:reference.targetPointer!,kind:reference.kind}),owner);
                const target=graph.scopeAs(reference.targetResource!,reference.targetPointer!,reference.kind);
                if(target)connect(forward,useKey(owner),target);
            }
        }
        // A different complete document owns its declarations even when this
        // entry references it. Its own capture prepares its fragments; copying
        // those again here would create unused owners and confuse namespaces.
        const reachable=new Set<string>(),visit=[graph.scopeAs(graph.root,'','root')!];
        for(let index=0;index<visit.length;index++){
            admit();const scope=visit[index],id=useKey(scope);
            if(reachable.has(id)||scope.resource!==graph.root&&graph.specifications.has(scope.resource))continue;
            reachable.add(id);visit.push(...forward.get(id)??[]);
        }
        const selected=new Map<string,GraphScope>();
        for(let index=0;index<pending.length;index++){
            admit();const scope=pending[index],id=useKey(scope);
            // A declared document keeps its own family/dialect in every entry.
            // The entry's static locator is the boundary of this specialization.
            if(graph.specifications.has(scope.resource)||!reachable.has(id)||selected.has(id))continue;
            selected.set(id,scope);
            pending.push(...(parents.get(id)??[]),...(incoming.get(id)??[]));
        }
        const copies=separateMigrationUses(graph,sources,issue,createSchemaResource,preserveContext,
            {entryNamespace:graph.root,scopes:[...selected.values()]},owners);
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
export function separateMigrationUses(graph:ReferenceGraph,sources:ReadonlyMap<string,MigrationSource>,
    issue:MigrationIssue,createSchemaResource:()=>MigrationSource,
    preserveContext:(scope:GraphScope,destination:MigrationLocation,preserveBase:boolean)=>void,
    entry?:EntrySelection,owners=new MigrationSchemaOwners(graph,sources,createSchemaResource)):ReadonlyMap<string,readonly MigrationLocation[]> {
    const provenance=new Map<string,MigrationLocation[]>();
    const schemaScopes=graph.scopesFor('schema');
    const candidates=entry?entry.scopes.filter(scope=>referenceKinds.has(scope.kind)||scope.kind==='operation'):
        [...graph.interpretedScopes()].filter(scope=>(referenceKinds.has(scope.kind)||scope.kind==='operation')&&
        // This inactive boolean annotation already has a faithful owner in
        // migrateInactiveSchemaAnnotations; retain that established mapping.
        !(/\/(?:writeOnly|deprecated)$/.test(scope.pointer)&&graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value===false)&&(
        graph.literalContainer(scope.resource,scope.pointer)!==undefined||
        graph.hasOverlappingScope(scope.resource,scope.pointer)&&graph.scopes.get(scope.resource+'#'+scope.pointer)?.kind!==scope.kind));
    if(!candidates.length)return provenance;
    const uris=[...documentUriOccurrences(graph)];
    // A generated $defs owner may sit inside another independently interpreted
    // object's unknown annotation. Copy each interpretation from its captured
    // value, never from a planning document containing earlier generated uses.
    const pristine=new Map([...new Set(candidates.map(scope=>scope.resource))].map(resource=>[resource,sources.get(resource)!.fork()]));
    const placements:Placement[]=[];
    let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.owners','Independent semantic ownership exceeds its bounded graph work');};
    for(const scope of candidates.sort((a,b)=>a.resource.localeCompare(b.resource)||a.pointer.length-b.pointer.length||a.pointer.localeCompare(b.pointer)||a.kind.localeCompare(b.kind))){
        // Ordinary descendants of a copied object already have an owner. A
        // nested literal or independently interpreted use still needs its own.
        const containing=placements.find(placement=>{
            inspect();return placement.scope.resource===scope.resource&&inside(scope.pointer,placement.scope.pointer)&&placement.intrinsic.get(scope.pointer)===scope.kind;
        });
        if(containing)continue;
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
        const dynamic=graph.references.find(reference=>{
            inspect();return reference.dynamic&&(
                reference.resource===scope.resource&&intrinsic.get(reference.pointer)==='schema'||
                reference.dynamic.candidates.some(candidate=>candidate.resource===scope.resource&&intrinsic.get(candidate.pointer)==='schema'));
        });
        const group=componentFamily(scope.kind,scope.family);
        const nativeContainer=scope.kind!=='schema'&&group&&graph.specifications.get(scope.resource)?.family===scope.family?
            componentLocation(group,scope.family):undefined;
        // Native component owners keep document/API URI context. Schema uses
        // keep the separate registry unless resource-sensitive: introducing a
        // new component model name could alter implicit discriminator choices.
        let container:MigrationLocation|undefined=nativeContainer?{resource:scope.resource,pointer:nativeContainer}:undefined;
        const resourceSensitive=anchored||dynamic!==undefined;
        const intrinsicSchemas=schemaScopes.filter(schema=>{
            inspect();return schema.resource===scope.resource&&intrinsic.get(schema.pointer)==='schema';
        });
        const identified=intrinsicSchemas.every(schema=>inside(schema.resourcePointer,scope.pointer));
        if(entry){
            const entryFamily=graph.specifications.get(entry.entryNamespace)?.family;
            const entryGroup=componentFamily(scope.kind,scope.family);
            const entryContainer=entryFamily===scope.family&&entryGroup?componentLocation(entryGroup,scope.family):undefined;
            const hasIdentity=intrinsicSchemas.some(schema=>typeof graph.docs.get(schema.resource)!.dataNode(schema.pointer)?.value?.$id==='string');
            if(!entryContainer||resourceSensitive||hasIdentity){
                issue({...scope,decisionKey:entry.entryNamespace},'migration.owners.entry-resource',
                    'This entry-dependent use requires an independently proved native holder or schema resource identity before specialization','implementation');
                return provenance;
            }
            container={resource:entry.entryNamespace,pointer:entryContainer};
        }
        if(resourceSensitive&&!identified){
            const holders=scope.kind==='schema'?schemaScopes.filter(holder=>{
                inspect();return holder.resource===scope.resource&&holder.base===scope.base&&holder.dialect===scope.dialect&&
                holder.family===scope.family&&holder.resourcePointer===scope.resourcePointer&&
                graph.docs.get(holder.resource)!.dataNode(holder.pointer)?.kind==='object'&&
                graph.literalContainer(holder.resource,holder.pointer)===undefined&&!graph.hasOverlappingScope(holder.resource,holder.pointer);
            }):[];
            holders.sort((a,b)=>Number(inside(scope.pointer,b.pointer))-Number(inside(scope.pointer,a.pointer))||
                b.pointer.length-a.pointer.length||a.pointer.localeCompare(b.pointer));
            const holder=holders[0];
            if(!holder&&!nativeContainer){
                issue(scope,'migration.owners.resource-context','This anchored or dynamic use has no captured ordinary owner in its original resource and dialect','implementation');
                return provenance;
            }
            container=holder?{resource:holder.resource,pointer:holder.pointer+'/$defs'}:{resource:scope.resource,pointer:nativeContainer!};
        }
        // Unversioned native fragments belong in an entry's ordinary component
        // map. A schema registry would interpret their unknown native fields
        // as schema annotations and create another overlapping owner.
        if(!container&&scope.kind!=='schema'&&group&&graph.specifications.get(graph.root)?.family===scope.family)
            container={resource:graph.root,pointer:componentLocation(group,scope.family)!};
        const separated=owners.separate(scope,entry?'entry_use':scope.kind==='schema'?'schema_use':'object_use',container,pristine.get(scope.resource),
            JSON.stringify([entry?.entryNamespace??'',scope.resource,scope.pointer,scope.kind,scope.family,scope.dialect,scope.base,scope.resourcePointer]));
        placements.push({scope,location:separated.location,intrinsic,inheritedDialect:container?
            graph.scope(container.resource,container.pointer).dialect:defaultSchemaDialect(graph.family)});
        for(const [pointer,kind]of intrinsic){
            const captured=graph.scopeAs(scope.resource,pointer,kind);
            if(captured)preserveContext(captured,{resource:separated.location.resource,pointer:separated.location.pointer+pointer.slice(scope.pointer.length)},resourceSensitive&&kind==='schema');
        }
        for(const [pointer,location]of separated.provenance){
            const identity=key({resource:scope.resource,pointer}),values=provenance.get(identity)??[];
            values.push(location);provenance.set(identity,values);
        }
    }
    const placementFor=(at:MigrationLocation,kind:string):Placement|undefined=>{
        let selected:Placement|undefined;
        for(const placement of placements){
            inspect();
            if(placement.scope.resource===at.resource&&inside(at.pointer,placement.scope.pointer)&&
                (placement.intrinsic.get(at.pointer)===kind||kind==='discriminator'&&placement.intrinsic.get(at.pointer)==='discriminator-map')&&
                (!selected||placement.scope.pointer.length>selected.scope.pointer.length))selected=placement;
        }
        return selected;
    };
    const mapped=(at:MigrationLocation,placement:Placement):MigrationLocation=>({resource:placement.location.resource,pointer:placement.location.pointer+at.pointer.slice(placement.scope.pointer.length)});
    const set=(at:MigrationLocation,value:string)=>{const source=sources.get(at.resource)!;owners.admit(source);source.set(at.pointer,value);};
    const repair=(at:MigrationLocation,value:string,key:boolean)=>{
        if(!key){set(at,value);return;}
        const source=sources.get(at.resource)!,parent=at.pointer.slice(0,at.pointer.lastIndexOf('/'));
        const occupied=source.doc.dataNode(parent)!.children;
        const failure=(message:string)=>new SourceError('migration.owners.connection-key',message,
            source.doc.dataNode(at.pointer)!.range,'unsupported',{...at,range:source.doc.dataNode(at.pointer)!.range});
        const slash=value.lastIndexOf('/',value.indexOf('#')),canonical=resolveUri(value,value).href;
        let selected=value,index=0;
        // Distinct URI keys can bind one scheme with distinct role arrays.
        // Retain separate members with equivalent hierarchical URI spellings;
        // never merge their arrays or overwrite an existing connection.
        while(occupied.has(selected)){
            inspect();
            if(slash<=value.indexOf(':')||++index>2048||value.length+index*2>65536)
                throw failure('Distinct security bindings have no bounded collision-free URI spelling');
            selected=value.slice(0,slash+1)+'./'.repeat(index)+value.slice(slash+1);
            if(resolveUri(selected,selected).href!==canonical)
                throw failure('The proposed security key does not preserve its URI identity');
        }
        owners.admit(source);source.rename(at.pointer,selected);
    };
    for(const reference of graph.references){
        inspect();
        if(reference.resolution!=='resolved')continue;
        const sourceKind=referenceOwnerKind(reference);
        const sourcePlacement=placementFor(reference,sourceKind);
        const destination={resource:reference.targetResource!,pointer:reference.targetPointer!};
        const targetPlacement=placementFor(destination,reference.kind);
        const target=targetPlacement?mapped(destination,targetPlacement):destination;
        // A dynamic starting anchor remains named. Its resource context is
        // proved after recapture; a physical-pointer spelling would turn the
        // dynamic applicator into a static one (Core 8.2.3.2).
        const address=reference.keyword==='$dynamicRef'&&reference.dynamic?
            resolveUri(reference.value,reference.base).href:target.resource+pointerFragment(target.pointer);
        if(sourcePlacement){
            const field=mapped({...reference,pointer:reference.pointer+'/'+escape(reference.keyword)},sourcePlacement);
            if(reference.connection==='security'&&reference.targetUri!==undefined&&targetPlacement)repair(field,address,true);
            else if(!reference.connection||['discriminator','operationRef'].includes(reference.connection))repair(field,address,false);
        }
        // Intrinsic structural children can coexist with the separate
        // dictionary interpretation. Literal reference-looking data never
        // receives the schema copy's repair.
        if(targetPlacement&&(!entry||reference.resource===entry.entryNamespace)&&graph.literalContainer(reference.resource,reference.pointer)===undefined&&
            (graph.scopes.get(reference.resource+'#'+reference.pointer)?.kind===reference.kind&&!reference.connection||
                reference.connection==='discriminator'||reference.connection==='operationRef'||reference.connection==='security'&&reference.targetUri!==undefined))
            repair({...reference,pointer:reference.pointer+'/'+escape(reference.keyword)},address,reference.connection==='security');
    }
    for(const placement of placements){
        for(const scope of schemaScopes){
            inspect();
            if(scope.resource!==placement.scope.resource||placement.intrinsic.get(scope.pointer)!=='schema')continue;
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(typeof value?.$id==='string')set(mapped({...scope,pointer:scope.pointer+'/$id'},placement),scope.base);
        }
        for(const uri of uris){
            inspect();
            if(uri.scope.resource!==placement.scope.resource||placement.intrinsic.get(uri.scope.pointer)!==uri.scope.kind)continue;
            const source=graph.docs.get(uri.scope.resource)!;
            const address=uri.scope.kind==='server'?serverTemplate(uri.value,documentUriBase(graph,uri.scope),source.dataNode(uri.scope.pointer)?.value?.variables,
                {resource:uri.scope.resource,pointer:uri.pointer,range:source.dataNode(uri.pointer)!.range}):resolveUri(uri.value,documentUriBase(graph,uri.scope)).href;
            set(mapped({resource:uri.scope.resource,pointer:uri.pointer},placement),address);
        }
        // Selecting the captured dialect is necessary when the generated owner
        // belongs to an entry with a different default schema dialect.
        if(placement.scope.kind==='schema'&&modernFamily(placement.scope.family)&&placement.scope.dialect!==placement.inheritedDialect&&placement.scope.dialect)
            set({...placement.location,pointer:placement.location.pointer+'/$schema'},placement.scope.dialect);
    }
    return provenance;
}
