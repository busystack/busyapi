import {componentFamily,componentLocation} from './authoring';
import {children,referenceKinds} from './contexts';
import {escape,SourceError} from './document';
import {documentUriOccurrences} from './document_uris';
import {serverTemplate} from './derived_bundle';
import {documentUriBase,pointerFragment,resolveUri,schemaResourceContextIdentity,supportedSchemaDialect,type GraphScope,type GraphReference,type ReferenceGraph} from './reference_graph';
import {MigrationSchemaOwners} from './migration_schema_owners';
import {migrationContextDifferences,migrationReferences,type DocumentContext} from './migration_documents';
import {defaultSchemaDialect,modernFamily} from './specification';
import {MigrationSource,type MigrationLocation} from './migration_source';
import type {MigrationIssue} from './migration_schema';

const key=(at:MigrationLocation)=>JSON.stringify([at.resource,at.pointer]);
const inside=(pointer:string,parent:string)=>pointer===parent||pointer.startsWith(parent+'/');
type ResourceHolder=Readonly<{location:MigrationLocation;dialect:string|null}>;
type Placement=Readonly<{scope:GraphScope;location:MigrationLocation;intrinsic:ReadonlyMap<string,string>;inheritedDialect:string|null;inheritsResource:boolean;resourceSensitive:boolean}>;
type UseSelection=Readonly<{mode:'entry';entryNamespace:string;scopes:readonly GraphScope[]}>|
    Readonly<{mode:'role';scopes:readonly GraphScope[];references:readonly GraphReference[];containers?:ReadonlyMap<string,MigrationLocation>}>;
const useKey=(scope:{resource:string;pointer:string;kind:string})=>JSON.stringify([scope.resource,scope.pointer,scope.kind]);
const referenceOwnerKind=(reference:GraphReference)=>reference.connection==='discriminator'?'discriminator':
    reference.connection==='security'?'security-requirement':reference.connection?'link':reference.kind;
const secondarySchema=(graph:ReferenceGraph,scope:GraphScope)=>scope.kind==='schema'&&
    graph.scopes.get(scope.resource+'#'+scope.pointer)?.kind!=='schema'&&graph.hasOverlappingScope(scope.resource,scope.pointer);

/** Entry namespace and containing-document family are independent. Prefer the
 * selected entry's compatible component map; otherwise retain the captured
 * foreign document's native map. The common allocator still keys the owner by
 * entry use, and the reference/context proofs still apply to every consumer. */
function entryComponentLocation(graph:ReferenceGraph,scope:GraphScope,namespace:string):MigrationLocation|undefined {
    const group=componentFamily(scope.kind,scope.family);
    if(!group)return;
    // Swagger model names participate in implicit discriminator tables. Its
    // anonymous schema registry cannot borrow a different entry's family.
    if(scope.kind==='schema'&&scope.family==='2.0'&&graph.specifications.get(namespace)?.family!==scope.family)return;
    const resource=graph.specifications.get(namespace)?.family===scope.family?namespace:
        graph.specifications.get(scope.resource)?.family===scope.family?scope.resource:undefined;
    const pointer=componentLocation(group,scope.family);
    return resource!==undefined&&pointer!==undefined?{resource,pointer}:undefined;
}
function entryComponentContainer(graph:ReferenceGraph,scope:GraphScope,namespace:string,owners:MigrationSchemaOwners,
    prepared?:(scope:GraphScope)=>boolean):MigrationLocation|undefined {
    const container=entryComponentLocation(graph,scope,namespace);
    if(container){
        // A newly admitted holder must not change an independent
        // schema annotation or literal collection. That container needs its
        // own semantic split before a native member can be inserted there.
        const resource=container.resource;
        let at=container.pointer;
        while(true){
            const primary=graph.scopes.get(resource+'#'+at);
            const protectedRoles=graph.scopesAt(resource,at).every(role=>role.kind===primary?.kind||role.kind==='schema'&&
                (owners.roleOwners(role).length>0||prepared?.(role)===true));
            if(graph.literalContainer(resource,at)!==undefined||graph.hasOverlappingScope(resource,at)&&!protectedRoles){
                const range=graph.docs.get(resource)!.dataNode(at)?.range??graph.docs.get(resource)!.root.range;
                throw new SourceError('migration.owners.entry-container','This component container has another interpretation requiring independent ownership before insertion',range,'unsupported',{resource,pointer:at,range});
            }
            if(!at)break;at=at.slice(0,at.lastIndexOf('/'));
        }
    }
    return container;
}

const nameSensitiveSchemas=new WeakMap<ReferenceGraph,ReadonlySet<string>>();
/** A native model name must not enter a discriminator's captured namespace.
 * Compute the finite connected schema uses (including dynamic candidates), not
 * a physical-prefix scan: native map members may also be opaque annotations of
 * the container's independently referenced Schema Object. OAS 3.2 §4.25 leaves
 * assertion outcomes unchanged, but its dispatch metadata still needs ownership. */
function nativeSchemaHolderScope(graph:ReferenceGraph,scope:GraphScope,inspect:()=>void):boolean {
    if(scope.kind!=='schema'||!modernFamily(scope.family)||!supportedSchemaDialect(scope))return false;
    let sensitive=nameSensitiveSchemas.get(graph);
    if(!sensitive){
        const adjacent=new Map<string,Set<string>>(),pending:string[]=[],selected=new Set<string>();
        const connect=(a:string,b:string)=>{
            inspect();
            for(const [from,to]of [[a,b],[b,a]]){
                const targets=adjacent.get(from)??new Set<string>();targets.add(to);adjacent.set(from,targets);
            }
        };
        for(const schema of graph.scopesFor('schema')){
            inspect();const id=key(schema),value=graph.docs.get(schema.resource)!.dataNode(schema.pointer)?.value;
            for(const parent of graph.schemaParentsOf(schema))connect(id,key(parent));
            if(value!==null&&typeof value==='object'&&Object.hasOwn(value,'discriminator'))pending.push(id);
        }
        for(const reference of graph.references){
            inspect();if(reference.kind!=='schema')continue;
            if(reference.connection==='discriminator'){
                if(reference.resolution==='resolved')pending.push(key({resource:reference.targetResource!,pointer:reference.targetPointer!}));
                continue;
            }
            if(reference.connection)continue;
            if(reference.resolution==='resolved')connect(key(reference),key({resource:reference.targetResource!,pointer:reference.targetPointer!}));
            for(const target of reference.dynamic?.candidates??[])connect(key(reference),key(target));
        }
        for(let index=0;index<pending.length;index++){
            inspect();const id=pending[index];if(selected.has(id))continue;
            selected.add(id);pending.push(...adjacent.get(id)??[]);
        }
        sensitive=selected;nameSensitiveSchemas.set(graph,sensitive);
    }
    return !sensitive.has(key(scope));
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
export function separateMigrationEntryUses(contexts:readonly DocumentContext[],sources:ReadonlyMap<string,MigrationSource>,
    issue:MigrationIssue,createSchemaResource:()=>MigrationSource,
    preserveContext:(scope:GraphScope,destination:MigrationLocation,preserveBase:boolean,expectedBase?:string,namespace?:string)=>void,
    allocator?:MigrationSchemaOwners):ReadonlyMap<string,readonly MigrationLocation[]> {
    const differences=migrationContextDifferences(contexts),provenance=new Map<string,MigrationLocation[]>();
    if(!contexts.length)return provenance;
    const owners=allocator??new MigrationSchemaOwners(contexts[0].graph,sources,createSchemaResource);
    let work=0;
    const admit=()=>{if(++work>2000000)throw new SourceError('limit.migration.owners','Entry specialization exceeds its bounded graph work');};
    for(const {graph}of [...contexts].sort((a,b)=>a.graph.root.localeCompare(b.graph.root))){
        const pending=[...(differences.get(graph.root)?.values()??[])];
        if(!pending.length)continue;
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
        const schemaGroups=new Map<string,GraphScope[]>(),sensitiveGroups=new Set<string>();
        const dynamic=dynamicSchemaDependencies(graph,graph.entryReferences(),admit);
        for(const scope of graph.entryScopes())if(scope.kind==='schema'&&modernFamily(scope.family)){
            admit();const identity=schemaResourceContextIdentity(scope),members=schemaGroups.get(identity)??[];
            members.push(scope);schemaGroups.set(identity,members);
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(dynamic.has(key(scope))||typeof value?.$anchor==='string'||typeof value?.$dynamicAnchor==='string')sensitiveGroups.add(identity);
        }
        const selected=new Map<string,GraphScope>(),visited=new Set<string>();
        for(let index=0;index<pending.length;index++){
            admit();const scope=pending[index],id=useKey(scope);
            if(visited.has(id)||!graph.isEntryUse(scope))continue;
            visited.add(id);
            // The owning entry keeps its intrinsic fields; secondary Schema
            // interpretations can acquire their own owners too. Foreign document
            // subtrees can have independent entry names/media, even though
            // their containing document still owns their family and dialect.
            if(scope.resource===graph.root&&!secondarySchema(graph,scope)){pending.push(...parents.get(id)??[],...incoming.get(id)??[]);continue;}
            if(scope.kind==='root')continue;
            selected.set(id,scope);
            pending.push(...(parents.get(id)??[]),...(incoming.get(id)??[]));
            if(scope.kind==='schema'&&sensitiveGroups.has(schemaResourceContextIdentity(scope)))
                pending.push(...schemaGroups.get(schemaResourceContextIdentity(scope))??[]);
        }
        // Native allocation can change a map's independently interpreted
        // schema before the ordinary role pass reaches it. Capture affected
        // views first, using this same owner
        // relation, immutable source and typed reference repair. They retain
        // the containing document's family even for a different entry.
        const protectedScopes=new Map<string,GraphScope>(),containers=new Map<string,MigrationLocation>();
        for(const scope of selected.values()){
            const container=entryComponentLocation(graph,scope,graph.root);
            if(!container)continue;
            let pointer=container.pointer;
            while(true){
                admit();const schema=graph.scopeAs(container.resource,pointer,'schema');
                if(schema&&!protectedScopes.has(useKey(schema))&&graph.hasOverlappingScope(schema.resource,schema.pointer)&&!owners.roleOwners(schema).length){
                    const holder=entryComponentLocation(graph,schema,schema.resource);
                    if(holder){
                        protectedScopes.set(useKey(schema),schema);
                        if(nativeSchemaHolderScope(graph,schema,admit))containers.set(useKey(schema),holder);
                    }
                }
                if(!pointer)break;pointer=pointer.slice(0,pointer.lastIndexOf('/'));
            }
        }
        if(protectedScopes.size){
            const copies=separateMigrationUses(graph,sources,issue,createSchemaResource,preserveContext,
                {mode:'role',scopes:[...protectedScopes.values()],references:[...migrationReferences(contexts.map(context=>context.graph))],containers},owners);
            for(const [origin,locations]of copies){
                const values=provenance.get(origin)??[];values.push(...locations);provenance.set(origin,values);
            }
        }
        const copies=separateMigrationUses(graph,sources,issue,createSchemaResource,preserveContext,
            {mode:'entry',entryNamespace:graph.root,scopes:[...selected.values()]},owners);
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
    preserveContext:(scope:GraphScope,destination:MigrationLocation,preserveBase:boolean,expectedBase?:string,namespace?:string)=>void,
    selection?:UseSelection,owners=new MigrationSchemaOwners(graph,sources,createSchemaResource)):ReadonlyMap<string,readonly MigrationLocation[]> {
    const provenance=new Map<string,MigrationLocation[]>();
    const entry=selection?.mode==='entry'?selection:undefined;
    const references=selection?.mode==='role'?selection.references:graph.entryReferences();
    const schemaScopes=graph.scopesFor('schema');
    const candidates=entry?entry.scopes.filter(scope=>referenceKinds.has(scope.kind)||scope.kind==='operation'):
        [...(selection?.scopes??graph.entryScopes())].filter(scope=>(referenceKinds.has(scope.kind)||scope.kind==='operation')&&
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
    const pristine=new Map([...new Set(candidates.map(scope=>scope.resource))].map(resource=>[resource,new MigrationSource(graph.docs.get(resource)!)]));
    const placements:Placement[]=[];
    const resourceVariants=new Map<string,string>();
    const resourceHolders=new Map<string,ResourceHolder>();
    const nativeSlots=new Set<string>();
    let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.owners','Independent semantic ownership exceeds its bounded graph work');};
    const nativeSchemas=new Map<string,ReadonlySet<string>>();
    const nativeSchemaPositions=(resource:string):ReadonlySet<string>=>{
        const existing=nativeSchemas.get(resource);if(existing)return existing;
        const positions=new Set<string>(),specification=graph.specifications.get(resource);
        if(specification){
            // Establish physical native containment from the published root.
            // Merely finding a Schema scope at this pointer is insufficient:
            // it could exist only in the map's secondary Schema interpretation.
            const visit=(pointer:string,kind:string,depth=0)=>{
                inspect();if(depth>128)throw new SourceError('limit.migration.owners','Native semantic containment exceeds 128 levels');
                if(kind==='schema')positions.add(pointer);
                const value=graph.docs.get(resource)!.dataNode(pointer)?.value;
                const context=graph.scopeAs(resource,pointer,kind)??{...graph.scope(resource,''),resource,pointer,kind};
                if(graph.referenceObject(value,context)&&kind!=='path-item')return;
                for(const [name,,next]of children(value,kind,specification.family))visit(pointer+'/'+escape(name),next,depth+1);
            };
            visit('','root');
        }
        nativeSchemas.set(resource,positions);return positions;
    };
    const dynamicSchemas=dynamicSchemaDependencies(graph,references,inspect);
    const dynamicDependency=(schemas:readonly GraphScope[])=>schemas.some(scope=>{inspect();return dynamicSchemas.has(key(scope));});
    if(entry){
        // Independently admitted schemas can share an implicit resource even
        // when its physical dictionary is not itself a Schema Object. One
        // neutral resource owner retains that context; each intrinsic schema
        // tree is copied once beneath it, with cycles left as references.
        const activeSchemas=schemaScopes.filter(scope=>graph.isEntryUse(scope));
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
        const groups=new Map<string,GraphScope[]>();
        for(const schema of activeSchemas){
            inspect();const identity=schemaResourceContextIdentity(schema),group=groups.get(identity)??[];
            group.push(schema);groups.set(identity,group);
        }
        const needed=new Map<string,GraphScope>();
        for(const scope of candidates){
            inspect();
            if(scope.kind!=='schema'||!modernFamily(scope.family)||scope.resource===graph.root&&!secondarySchema(graph,scope))continue;
            const modelSensitive=!nativeSchemaHolderScope(graph,scope,inspect);
            if(scope.pointer===scope.resourcePointer&&!modelSensitive)continue;
            const identity=schemaResourceContextIdentity(scope);
            const anchored=(groups.get(identity)??[]).some(schema=>{
                inspect();if(!inside(schema.pointer,scope.pointer))return false;
                const value=graph.docs.get(schema.resource)!.dataNode(schema.pointer)?.value;
                return typeof value?.$anchor==='string'||typeof value?.$dynamicAnchor==='string';
            });
            // Entry variants must not add discriminator wire names. Anonymous
            // map uses, ordinary models and boolean choices share the same
            // resource holder; original public aliases retain their names.
            if(anchored||dynamicDependency([scope])||modelSensitive)needed.set(identity,scope);
        }
        const selected=new Set(candidates.map(useKey));
        for(const [identity,scope]of [...needed].sort(([a],[b])=>a.localeCompare(b))){
            const members=groups.get(identity)!;
            const boundary=graph.scopeAs(scope.resource,scope.resourcePointer,'schema');
            const whole=boundary&&graph.isEntryUse(boundary)&&schemaResourceContextIdentity(boundary)===identity;
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
            if(!contained&&(!whole||boundary&&!nativeSchemaHolderScope(graph,boundary,inspect))){
                const container=entryComponentContainer(graph,scope,entry.entryNamespace,owners);
                if(!container||!scope.dialect)continue;
                const source=sources.get(container.resource)!;
                const holder=owners.allocate(source,container.pointer,'resource_use',JSON.stringify([entry.entryNamespace,identity]));
                const base=owners.resourceIdentity(entry.entryNamespace,identity);
                const value=whole&&boundary?graph.docs.get(boundary.resource)!.dataNode(boundary.pointer)?.value:undefined;
                const schemaOwnsIdentity=whole&&value!==null&&typeof value==='object'&&!Array.isArray(value);
                // Object resource roots carry their cloned ID themselves.
                // A boolean schema inherits its identity from this neutral
                // wrapper because Schema Object keywords cannot be added to it.
                owners.admit(source,8);source.set(holder.pointer,{
                    ...(schemaOwnsIdentity?{}:{$id:base}),$schema:scope.dialect,$defs:{}});
                source.presentationChanges.push(holder.pointer);
                resourceVariants.set(identity,base);resourceHolders.set(identity,{location:holder,dialect:scope.dialect});
            }
            if(whole&&boundary&&!selected.has(useKey(boundary))){candidates.push(boundary);selected.add(useKey(boundary));}
            for(const member of members){
                inspect();
                const parent=member.schemaParent===undefined?undefined:graph.scopeAs(member.resource,member.schemaParent,'schema');
                if(parent&&schemaResourceContextIdentity(parent)===identity||selected.has(useKey(member)))continue;
                candidates.push(member);selected.add(useKey(member));
            }
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
    for(const scope of candidates.sort((a,b)=>a.resource.localeCompare(b.resource)||a.pointer.length-b.pointer.length||a.pointer.localeCompare(b.pointer)||a.kind.localeCompare(b.kind))){
        // Ordinary descendants of a copied object already have an owner. A
        // nested literal or independently interpreted use still needs its own.
        const containing=placementFor(scope,scope.kind);
        const materialSlot=entry&&scope.kind==='schema'&&nativeSlots.has(key(scope))&&scope.pointer!==scope.resourcePointer&&
            resourceHolders.has(schemaResourceContextIdentity(scope));
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
        const nativeContainer=scope.kind!=='schema'&&group&&graph.specifications.get(scope.resource)?.family===scope.family?
            componentLocation(group,scope.family):undefined;
        // Native component owners keep document/API URI context. Schema uses
        // usually keep the separate registry: introducing a new component model
        // name could alter implicit discriminator choices. Model-independent
        // views below cannot join an existing discriminator's namespace.
        let container:MigrationLocation|undefined=selection?.mode==='role'?selection.containers?.get(useKey(scope)):undefined;
        container??=nativeContainer?{resource:scope.resource,pointer:nativeContainer}:undefined;
        // A model-independent view has no implicit model/connection behavior.
        // Its containing document's map preserves the captured family in all
        // entries, independently of their processing order. An anonymous
        // registry would instead inherit each selected entry's feature set.
        if(!container&&!entry&&nativeSchemaHolderScope(graph,scope,inspect))
            container=entryComponentLocation(graph,scope,scope.resource);
        let intrinsicSchemas=schemaScopes.filter(schema=>{
            inspect();return schema.resource===scope.resource&&intrinsic.get(schema.pointer)==='schema';
        });
        // A native object's physical root is not itself a schema resource
        // owner. Every boundary must be an actual intrinsic Schema Object.
        const identified=intrinsicSchemas.every(schema=>inside(schema.resourcePointer,scope.pointer)&&intrinsic.get(schema.resourcePointer)==='schema');
        const resourceSensitive=anchored||dynamic!==undefined||dynamicDependency(intrinsicSchemas);
        const copiedHolder=resourceHolders.get(schemaResourceContextIdentity(scope));
        const ownedResources=intrinsicSchemas.every(schema=>{
            inspect();return inside(schema.resourcePointer,scope.pointer)&&intrinsic.get(schema.resourcePointer)==='schema'||
                resourceHolders.has(schemaResourceContextIdentity(schema));
        });
        let inheritedDialect:string|null|undefined;
        let inheritsResource=false;
        let retainedMaterials:GraphScope[]=[];
        if(entry){
            const entryFamily=graph.specifications.get(entry.entryNamespace)?.family;
            const entryContainer=entryComponentContainer(graph,scope,entry.entryNamespace,owners);
            // Older Path Items and independently referenced Operations have no
            // component map. A plain captured fragment is their native holder;
            // it must still be interpreted in the original specification family.
            const anonymous=entryFamily===scope.family&&['path-item','operation'].includes(scope.kind);
            if((!entryContainer&&!anonymous)||(resourceSensitive&&!identified&&!ownedResources)){
                issue({...scope,decisionKey:entry.entryNamespace},'migration.owners.entry-resource',
                    'This entry-dependent use requires an independently proved native holder or schema resource identity before specialization','implementation');
                return provenance;
            }
            // Swagger definition names participate in discriminator validation.
            // An anonymous captured use must not gain a new friendly model name.
            container=(anonymous&&!entryContainer||scope.kind==='schema'&&scope.family==='2.0')?undefined:
                copiedHolder&&scope.kind==='schema'?{resource:copiedHolder.location.resource,pointer:copiedHolder.location.pointer+'/$defs'}:
                    entryContainer!;
            for(const schema of intrinsicSchemas){
                inspect();
                const value=graph.docs.get(schema.resource)!.dataNode(schema.pointer)?.value;
                if(typeof value?.$id!=='string'&&!(modernFamily(schema.family)&&schema.pointer===schema.resourcePointer&&value!==null&&typeof value==='object'&&!Array.isArray(value)))continue;
                const identity=schemaResourceContextIdentity(schema);
                if(!resourceVariants.has(identity))resourceVariants.set(identity,owners.resourceIdentity(entry.entryNamespace,identity));
            }
        }
        if(copiedHolder&&scope.kind==='schema'){
            container={resource:copiedHolder.location.resource,pointer:copiedHolder.location.pointer+'/$defs'};
            inheritedDialect=copiedHolder.dialect;inheritsResource=scope.pointer!==scope.resourcePointer||typeof graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value==='boolean';
        }
        const preserveModelNamespace=scope.kind==='schema'&&modernFamily(scope.family)&&!nativeSchemaHolderScope(graph,scope,inspect);
        if((resourceSensitive&&!identified||preserveModelNamespace)&&!copiedHolder&&!entry){
            const holders=scope.kind==='schema'?schemaScopes.filter(holder=>{
                inspect();return holder.resource===scope.resource&&holder.base===scope.base&&holder.dialect===scope.dialect&&
                holder.family===scope.family&&holder.resourcePointer===scope.resourcePointer&&
                graph.docs.get(holder.resource)!.dataNode(holder.pointer)?.kind==='object'&&
                graph.literalContainer(holder.resource,holder.pointer)===undefined&&!graph.hasOverlappingScope(holder.resource,holder.pointer)&&
                graph.literalContainer(holder.resource,holder.pointer+'/$defs')===undefined&&!graph.hasOverlappingScope(holder.resource,holder.pointer+'/$defs');
            }):[];
            holders.sort((a,b)=>Number(inside(scope.pointer,b.pointer))-Number(inside(scope.pointer,a.pointer))||
                b.pointer.length-a.pointer.length||a.pointer.localeCompare(b.pointer));
            const holder=holders[0];
            const host=graph.scope(scope.resource,''),compatible=entryComponentLocation(graph,scope,scope.resource);
            const rootValue=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            const ownsIdentity=identified&&rootValue!==null&&typeof rootValue==='object'&&!Array.isArray(rootValue)&&typeof rootValue.$id==='string';
            const retained:GraphScope[]=[];
            if(preserveModelNamespace)for(const schema of [...intrinsicSchemas].sort((a,b)=>a.pointer.length-b.pointer.length||a.pointer.localeCompare(b.pointer))){
                inspect();if(schema.pointer===scope.pointer||
                    !nativeSchemaPositions(schema.resource).has(schema.pointer)||
                    graph.literalContainer(schema.resource,schema.pointer)!==undefined||graph.hasOverlappingScope(schema.resource,schema.pointer)||
                    retained.some(parent=>{inspect();return inside(schema.pointer,parent.pointer);}))continue;
                const value=graph.docs.get(schema.resource)!.dataNode(schema.pointer)?.value;
                if(['$id','$anchor','$dynamicAnchor'].some(name=>typeof value?.[name]==='string'))retained.push(schema);
            }
            const neutral=supportedSchemaDialect(scope)&&compatible?.resource===scope.resource&&
                graph.specifications.get(scope.resource)?.family===scope.family&&
                (ownsIdentity||scope.resourcePointer===''&&scope.base===host.base)&&intrinsicSchemas.every(schema=>{
                    inspect();if(retained.some(parent=>{inspect();return inside(schema.pointer,parent.pointer);}))return true;
                    const value=graph.docs.get(schema.resource)!.dataNode(schema.pointer)?.value;
                    return ['$id','$anchor','$dynamicAnchor'].every(name=>typeof value?.[name]!=='string')||
                        !nativeSchemaPositions(schema.resource).has(schema.pointer);
                });
            if(neutral&&compatible){
                // The holder has no assertion, reference or discriminator and
                // cannot join an allOf model table. Its $defs child remains an
                // unnamed use, in the original document resource and dialect.
                // An explicit dialect retains an independent native root even
                // when the containing document selects another default.
                // Downstream dynamic calls enter the same resource. Captured
                // child resources/anchors stay with native material owners.
                // Secondary-only resources move with this Schema view; their
                // original bytes remain literal data, with no active identity.
                // Canonical recapture still rejects any duplicate resource or
                // anchor retained by another actual semantic consumer.
                // Copy from the immutable capture after reserving this owner;
                // a map/document annotation never absorbs the new member.
                const source=sources.get(compatible.resource)!;
                const reserved=owners.allocate(source,compatible.pointer,'schema_context',JSON.stringify([
                    scope.resource,scope.pointer,scope.family,scope.dialect,scope.base,scope.resourcePointer]));
                owners.admit(source,8);source.set(reserved.pointer,{
                    ...(scope.dialect!==host.dialect?{$schema:scope.dialect}:{}),$defs:{}});
                source.presentationChanges.push(reserved.pointer);
                container={resource:reserved.resource,pointer:reserved.pointer+'/$defs'};
                inheritedDialect=scope.dialect;inheritsResource=!ownsIdentity;
                retainedMaterials=retained;
                // Reuse existing native resource owners. Copying their $id
                // would introduce duplicate identities; forwarding from this
                // same implicit resource preserves the captured resource stack.
                for(const [pointer]of intrinsic)if(retained.some(parent=>{inspect();return inside(pointer,parent.pointer);}))intrinsic.delete(pointer);
                intrinsicSchemas=intrinsicSchemas.filter(schema=>intrinsic.get(schema.pointer)==='schema');
            }else if(holder){
                container={resource:holder.resource,pointer:holder.pointer+'/$defs'};
                inheritedDialect=holder.dialect;inheritsResource=true;
            }else if(nativeContainer){container={resource:scope.resource,pointer:nativeContainer};}
            else if(identified&&scope.family===graph.family&&(!resourceSensitive||ownsIdentity)){
                // A whole identified resource can keep its URI and dialect in
                // the existing anonymous registry when that registry has the
                // same native family. No new component model name is needed.
                container=undefined;
            }
            else {
                issue(scope,'migration.owners.resource-context','This resource-sensitive or polymorphic use has no captured ordinary owner in its original resource and dialect','implementation');
                return provenance;
            }
        }
        // Unversioned native fragments belong in an entry's ordinary component
        // map. A schema registry would interpret their unknown native fields
        // as schema annotations and create another overlapping owner.
        if(!container&&scope.kind!=='schema'&&group&&graph.specifications.get(graph.root)?.family===scope.family)
            container={resource:graph.root,pointer:componentLocation(group,scope.family)!};
        if(group&&container&&container.pointer===componentLocation(group,scope.family)){
            // A compatible native map can itself have a Schema interpretation.
            // Admit insertion only after that exact interpretation has a
            // captured copy (including the current immutable map copy). Literal
            // containers and other roles retain the same ownership guards.
            entryComponentContainer(graph,scope,container.resource,owners,role=>{
                inspect();if(role.kind===scope.kind&&role.resource===scope.resource&&role.pointer===scope.pointer)return true;
                const placement=placementFor(role,role.kind);
                return placement!==undefined&&(placement.location.resource!==role.resource||placement.location.pointer!==role.pointer);
            });
        }
        const separated=owners.separate(scope,entry?'entry_use':scope.kind==='schema'?'schema_use':'object_use',{
            container,captured:pristine.get(scope.resource),retained:retainedMaterials,
            identity:JSON.stringify([entry?.entryNamespace??'',scope.resource,scope.pointer,scope.kind,scope.family,scope.dialect,scope.base,scope.resourcePointer]),
            schemaIdentity:intrinsicSchemas.some(schema=>{
                inspect();const value=graph.docs.get(schema.resource)!.dataNode(schema.pointer)?.value;
                return ['$id','$anchor','$dynamicAnchor'].some(name=>typeof value?.[name]==='string');
            }),
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
    const mapped=(at:MigrationLocation,placement:Placement):MigrationLocation=>({resource:placement.location.resource,pointer:placement.location.pointer+at.pointer.slice(placement.scope.pointer.length)});
    for(const placement of placements)for(const [pointer,kind]of placement.intrinsic){
        const captured=graph.scopeAs(placement.scope.resource,pointer,kind);if(!captured)continue;
        const owner=placementFor(captured,kind)!;
        const destination=mapped(captured,owner);
        owners.rememberEntry(entry?.entryNamespace??graph.root,captured,destination,owner.scope);
        if(!entry)owners.rememberRole(captured,destination,owner.scope);
        const expectedBase=kind==='schema'?resourceVariants.get(schemaResourceContextIdentity(captured)):undefined;
        preserveContext(captured,destination,kind==='schema'&&(owner.resourceSensitive||expectedBase!==undefined),expectedBase,entry?.entryNamespace??graph.root);
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
    for(const reference of references){
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
        const targetScope=graph.scopeAs(destination.resource,destination.pointer,reference.kind);
        const variant=targetScope&&targetPlacement?resourceVariants.get(schemaResourceContextIdentity(targetScope)):undefined;
        const address=reference.keyword==='$dynamicRef'&&reference.dynamic?
            variant?variant+'#'+encodeURIComponent(reference.dynamic.anchor):resolveUri(reference.value,reference.base).href:
            target.resource+pointerFragment(target.pointer);
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
        if(placement.scope.kind==='schema'&&modernFamily(placement.scope.family)&&placement.scope.dialect!==placement.inheritedDialect&&placement.scope.dialect)
            set({...placement.location,pointer:placement.location.pointer+'/$schema'},placement.scope.dialect);
        else if(placement.scope.kind==='schema'&&placement.inheritsResource&&
            Object.hasOwn(graph.docs.get(placement.scope.resource)!.dataNode(placement.scope.pointer)?.value??{},'$schema'))
            sources.get(placement.location.resource)!.remove(placement.location.pointer+'/$schema');
    }
    return provenance;
}

/** Ordinary role/literal preparation uses actual entry captures. A dormant
 * interpretation from another root cannot choose a fragment's source family.
 * Equal contexts share one owner; differing bindings were separated first by
 * the same allocator and are proved again after this restructuring. */
export function separateMigrationRoles(contexts:readonly DocumentContext[],sources:ReadonlyMap<string,MigrationSource>,
    issue:MigrationIssue,createSchemaResource:()=>MigrationSource,
    preserveContext:(scope:GraphScope,destination:MigrationLocation,preserveBase:boolean,expectedBase?:string,namespace?:string)=>void,
    owners:MigrationSchemaOwners):ReadonlyMap<string,readonly MigrationLocation[]> {
    const provenance=new Map<string,MigrationLocation[]>(),seen=new Set<string>();
    const references=[...migrationReferences(contexts.map(context=>context.graph))];
    for(const {graph}of [...contexts].sort((a,b)=>a.graph.root.localeCompare(b.graph.root))){
        const scopes=[...graph.entryScopes()].filter(scope=>{
            const identity=JSON.stringify([useKey(scope),schemaResourceContextIdentity(scope)]);
            if(seen.has(identity))return false;
            if(seen.size>=200000)throw new SourceError('limit.migration.owners','Role ownership exceeds 200000 captured contexts');
            seen.add(identity);return true;
        });
        const copies=separateMigrationUses(graph,sources,issue,createSchemaResource,preserveContext,{mode:'role',scopes,references},owners);
        for(const scope of graph.entryScopes()){
            for(const material of owners.roleOwners(scope))owners.rememberEntry(graph.root,scope,material.location,material.owner,'capture');
        }
        for(const [origin,locations]of copies){
            const values=provenance.get(origin)??[];values.push(...locations);provenance.set(origin,values);
        }
    }
    return provenance;
}

/** A cloned operation retains its public operationId. Link Objects can use
 * their normative URI alternative to bind the exact captured operation owner,
 * avoiding an ambiguous name among the independent documents in the project.
 * This runs after common ownership, so literal/data uses are never renamed. */
export function materializeMigrationOperationConnections(contexts:readonly DocumentContext[],sources:ReadonlyMap<string,MigrationSource>,
    owners:MigrationSchemaOwners,issue:MigrationIssue):boolean {
    const desired=new Map<string,{source:MigrationSource;pointer:string;value:string;origin:GraphReference}>();let work=0;
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
