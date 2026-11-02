import {children} from './contexts';
import {escape,SourceError} from './document';
import {documentUriOccurrences} from './document_uris';
import {documentUriBase,pointerFragment,resolveUri,type GraphScope,type ReferenceGraph} from './reference_graph';
import {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationLocation,MigrationSource} from './migration_source';
import type {MigrationIssue} from './migration_schema';

const key=(at:MigrationLocation)=>JSON.stringify([at.resource,at.pointer]);
const inside=(pointer:string,parent:string)=>pointer===parent||pointer.startsWith(parent+'/');
type Placement=Readonly<{scope:GraphScope;location:MigrationLocation;intrinsic:ReadonlyMap<string,string>;sameResource:boolean}>;

/** Split established schema uses before any family conversion. The physical
 * dictionary or literal value stays with its original owner. Only references
 * and fields belonging to the schema interpretation use the standard generated
 * owner. Core 9.4.2 leaves non-schema targets undefined; this preserves BusyAPI's
 * existing explicit interpretation, rather than discovering schemas in data.
 *
 * This relation is deliberately separate from a planning copy's conversion
 * coordinates: an independently used dictionary member can still be converted
 * and moved by its structural owner without retargeting the schema copy. */
export function separateMigrationSchemaUses(graph:ReferenceGraph,sources:ReadonlyMap<string,MigrationSource>,
    issue:MigrationIssue,createSchemaResource:()=>MigrationSource,
    preserveResource:(scope:GraphScope,destination:MigrationLocation)=>void):ReadonlyMap<string,readonly MigrationLocation[]> {
    const owners=new MigrationSchemaOwners(graph,sources,createSchemaResource),provenance=new Map<string,MigrationLocation[]>();
    const schemaScopes=graph.scopesFor('schema');
    const candidates=schemaScopes.filter(scope=>
        // This inactive boolean annotation already has a faithful owner in
        // migrateInactiveSchemaAnnotations; retain that established mapping.
        !(/\/(?:writeOnly|deprecated)$/.test(scope.pointer)&&graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value===false)&&(
        graph.literalContainer(scope.resource,scope.pointer)!==undefined||
        graph.hasOverlappingScope(scope.resource,scope.pointer)&&graph.scopes.get(scope.resource+'#'+scope.pointer)?.kind!=='schema'));
    if(!candidates.length)return provenance;
    const uris=[...documentUriOccurrences(graph)];
    // A generated $defs owner may sit inside another independently interpreted
    // object's unknown annotation. Copy each interpretation from its captured
    // value, never from a planning document containing earlier generated uses.
    const pristine=new Map([...new Set(candidates.map(scope=>scope.resource))].map(resource=>[resource,sources.get(resource)!.fork()]));
    const placements:Placement[]=[];
    let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.owners','Independent schema ownership exceeds its bounded graph work');};
    for(const scope of candidates.sort((a,b)=>a.resource.localeCompare(b.resource)||a.pointer.length-b.pointer.length||a.pointer.localeCompare(b.pointer))){
        // Ordinary descendants of a copied schema already have an owner. A
        // nested literal/schema occurrence still needs its own interpretation.
        const containing=placements.find(placement=>{
            inspect();return placement.scope.resource===scope.resource&&inside(scope.pointer,placement.scope.pointer)&&placement.intrinsic.get(scope.pointer)==='schema';
        });
        if(containing)continue;
        const intrinsic=new Map<string,string>();
        const visit=(pointer:string,kind:string,depth=0)=>{
            inspect();
            if(depth>128)throw new SourceError('limit.migration.owners','Independent schema containment exceeds 128 levels');
            intrinsic.set(pointer,kind);
            const value=graph.docs.get(scope.resource)!.dataNode(pointer)?.value;
            const context=graph.scopeAs(scope.resource,pointer,kind)??scope;
            if(graph.referenceObject(value,{...context,kind})&&kind!=='path-item')return;
            for(const [name,,next]of children(value,kind,context.family))visit(pointer+'/'+escape(name),next,depth+1);
        };
        visit(scope.pointer,'schema');
        let anchored=false;
        for(const pointer of intrinsic.keys()){
            const nested=graph.scopeAs(scope.resource,pointer,'schema');
            const value=graph.docs.get(scope.resource)!.dataNode(pointer)?.value;
            if(nested&&!inside(nested.resourcePointer,scope.pointer)&&
                (typeof value?.$anchor==='string'||typeof value?.$dynamicAnchor==='string')){
                anchored=true;
            }
        }
        const dynamic=graph.references.find(reference=>{
            inspect();return reference.dynamic&&(
                reference.resource===scope.resource&&intrinsic.has(reference.pointer)||
                reference.dynamic.candidates.some(candidate=>candidate.resource===scope.resource&&intrinsic.has(candidate.pointer)));
        });
        let container:MigrationLocation|undefined;
        const resourceSensitive=anchored||dynamic!==undefined;
        const identified=scope.resourcePointer===scope.pointer&&
            typeof graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value?.$id==='string';
        if(resourceSensitive&&!identified){
            const holders=schemaScopes.filter(holder=>{
                inspect();return holder.resource===scope.resource&&holder.base===scope.base&&holder.dialect===scope.dialect&&
                holder.family===scope.family&&holder.resourcePointer===scope.resourcePointer&&
                graph.docs.get(holder.resource)!.dataNode(holder.pointer)?.kind==='object'&&
                graph.literalContainer(holder.resource,holder.pointer)===undefined&&!graph.hasOverlappingScope(holder.resource,holder.pointer);
            });
            holders.sort((a,b)=>Number(inside(scope.pointer,b.pointer))-Number(inside(scope.pointer,a.pointer))||
                b.pointer.length-a.pointer.length||a.pointer.localeCompare(b.pointer));
            const holder=holders[0];
            if(!holder){
                issue(scope,'migration.owners.resource-context','This anchored or dynamic schema use has no captured ordinary schema holder in its original resource and dialect','implementation');
                return provenance;
            }
            container={resource:holder.resource,pointer:holder.pointer+'/$defs'};
        }
        const separated=owners.separate(scope,'schema_use',container,pristine.get(scope.resource));
        placements.push({scope,location:separated.location,intrinsic,sameResource:container!==undefined});
        if(resourceSensitive)for(const [pointer,kind]of intrinsic){
            if(kind!=='schema')continue;
            const captured=graph.scopeAs(scope.resource,pointer,'schema');
            if(captured)preserveResource(captured,{resource:separated.location.resource,pointer:separated.location.pointer+pointer.slice(scope.pointer.length)});
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
    for(const reference of graph.references){
        inspect();
        if(reference.resolution!=='resolved')continue;
        const sourcePlacement=placementFor(reference,reference.connection==='discriminator'?'discriminator':reference.kind);
        const destination={resource:reference.targetResource!,pointer:reference.targetPointer!};
        const targetPlacement=reference.kind==='schema'?placementFor(destination,'schema'):undefined;
        const target=targetPlacement?mapped(destination,targetPlacement):destination;
        // A dynamic starting anchor remains named. Its resource context is
        // proved after recapture; a physical-pointer spelling would turn the
        // dynamic applicator into a static one (Core 8.2.3.2).
        const address=reference.keyword==='$dynamicRef'&&reference.dynamic?
            resolveUri(reference.value,reference.base).href:target.resource+pointerFragment(target.pointer);
        if(sourcePlacement){
            const field=mapped({...reference,pointer:reference.pointer+'/'+escape(reference.keyword)},sourcePlacement);
            if(!reference.connection||reference.connection==='discriminator')set(field,address);
        }
        // Intrinsic structural schema children can coexist with the separate
        // dictionary interpretation. Literal reference-looking data never
        // receives the schema copy's repair.
        if(targetPlacement&&graph.literalContainer(reference.resource,reference.pointer)===undefined&&
            (graph.scopes.get(reference.resource+'#'+reference.pointer)?.kind===reference.kind&&!reference.connection||reference.connection==='discriminator'))
            set({...reference,pointer:reference.pointer+'/'+escape(reference.keyword)},address);
    }
    for(const placement of placements){
        for(const scope of schemaScopes){
            inspect();
            if(scope.resource!==placement.scope.resource||!placement.intrinsic.has(scope.pointer))continue;
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(typeof value?.$id==='string')set(mapped({...scope,pointer:scope.pointer+'/$id'},placement),scope.base);
        }
        for(const uri of uris){
            inspect();
            if(uri.scope.resource!==placement.scope.resource||!placement.intrinsic.has(uri.scope.pointer)||uri.scope.kind==='server')continue;
            set(mapped({resource:uri.scope.resource,pointer:uri.pointer},placement),resolveUri(uri.value,documentUriBase(graph,uri.scope)).href);
        }
        // Selecting the captured dialect is necessary when the generated owner
        // belongs to an entry with a different default schema dialect.
        if(!placement.sameResource&&placement.scope.dialect!==graph.scope(graph.root,'').dialect&&placement.scope.dialect)
            set({...placement.location,pointer:placement.location.pointer+'/$schema'},placement.scope.dialect);
    }
    return provenance;
}
