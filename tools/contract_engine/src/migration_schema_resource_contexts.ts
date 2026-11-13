import {schemaResourceContextIdentity,sameSchemaDialect,type GraphScope,type ReferenceGraph} from './reference_graph';
import {SourceError} from './document';
import type {MigrationIssue} from './migration_schema';
import type {SourceLocation} from './source_plan';
import {defaultSchemaDialect,modernFamily} from './specification';

export type CapturedSchemaResource=Readonly<{
    identity:string;members:readonly GraphScope[];roots:readonly GraphScope[];
    boundary?:GraphScope;anchors:ReadonlyMap<string,GraphScope>;dynamicAnchors:ReadonlyMap<string,GraphScope>;
}>;

/** Read an effective declaration from this immutable captured interpretation.
 * External implicit fragments use their native family default; an API's
 * jsonSchemaDialect governs its own embedded schemas. */
export function authoredSchemaDialect(graph:ReferenceGraph,scope:GraphScope):string|undefined {
    const document=graph.docs.get(scope.resource)!;
    for(let pointer=scope.pointer;;pointer=pointer.slice(0,pointer.lastIndexOf('/'))){
        const declaration=graph.scopeAs(scope.resource,pointer,'schema')&&document.dataNode(pointer+'/$schema')?.value;
        if(typeof declaration==='string'&&sameSchemaDialect(declaration,scope.dialect))return declaration;
        if(!pointer)break;
    }
    const declaration=graph.specifications.has(scope.resource)&&document.dataNode('/jsonSchemaDialect')?.value;
    return typeof declaration==='string'&&sameSchemaDialect(declaration,scope.dialect)?declaration:undefined;
}

/** A view of the canonical capture, not an identity/ownership registry. Files,
 * retrieval aliases and native containers are not schema resource boundaries.
 * In particular an implicit resource can have several independently embedded
 * Schema roots. All its captured anchors belong to that same resource. */
export function capturedSchemaResources(graph:ReferenceGraph):ReadonlyMap<string,CapturedSchemaResource> {
    const resources=new Map<string,{identity:string;members:GraphScope[];roots:GraphScope[];boundary?:GraphScope;anchors:Map<string,GraphScope>;dynamicAnchors:Map<string,GraphScope>}>();let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.resources','Schema resource capture exceeds 2000000 typed states');};
    for(const scope of graph.entryScopes()){
        inspect();if(scope.kind!=='schema')continue;
        const identity=schemaResourceContextIdentity(scope);
        let resource=resources.get(identity);
        if(!resource){resource={identity,members:[],roots:[],anchors:new Map(),dynamicAnchors:new Map()};resources.set(identity,resource);}
        resource.members.push(scope);
    }
    // Resource declarations and anchor availability do not apply unrelated
    // sibling assertions or native model metadata to a referenced fragment.
    for(const scope of graph.interpretedScopes()){
        inspect();if(scope.kind!=='schema')continue;
        const resource=resources.get(schemaResourceContextIdentity(scope));if(!resource)continue;
        if(scope.pointer===scope.resourcePointer)resource.boundary=scope;
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        for(const [keyword,index]of [['$anchor',resource.anchors],['$dynamicAnchor',resource.dynamicAnchors]] as const)
            if(typeof value?.[keyword]==='string')index.set(value[keyword],scope);
    }
    for(const resource of resources.values()){
        resource.members.sort((a,b)=>a.pointer.length-b.pointer.length||a.pointer.localeCompare(b.pointer));
        resource.roots=resource.members.filter(scope=>{
            inspect();const parent=scope.schemaParent===undefined?undefined:graph.scopeAs(scope.resource,scope.schemaParent,'schema');
            return !parent||!graph.isEntryUse(parent)||schemaResourceContextIdentity(parent)!==resource.identity;
        });
    }
    return new Map([...resources].sort(([a],[b])=>a.localeCompare(b)));
}

/** A resource/anchor isomorphism proves all evaluation paths, rather than a
 * sample's selected dynamic target. Static/dynamic edge targets are proved by
 * proveMigrationConnections. Here every anchor-bearing resource must retain
 * one distinct resource, its complete anchor table and its effective dialect.
 * Anchorless forwarding frames may split/merge only with anchorless frames;
 * those frames cannot change the first matching dynamic binding. */
export function proveMigrationSchemaResources(source:ReferenceGraph,target:ReferenceGraph,
    mapped:(at:SourceLocation,scope:GraphScope)=>readonly SourceLocation[],issue:MigrationIssue,preserveFamily=false):void {
    const captured=capturedSchemaResources(source),retained=capturedSchemaResources(target);
    const incoming=new Map<string,Set<string>>(),dynamic=new Set<string>(),critical=new Set<string>();let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.resources','Resource ownership proof exceeds 2000000 states');};
    const edge=(from:GraphScope,to:GraphScope)=>{
        inspect();const a=schemaResourceContextIdentity(from),b=schemaResourceContextIdentity(to),values=incoming.get(b)??new Set<string>();
        values.add(a);incoming.set(b,values);
    };
    for(const group of captured.values()){
        inspect();if(!modernFamily(group.members[0].family))continue;
        if(group.anchors.size||group.dynamicAnchors.size||group.boundary&&
            typeof source.docs.get(group.boundary.resource)!.dataNode(group.boundary.pointer)?.value?.$id==='string')critical.add(group.identity);
        for(const member of group.members)for(const parent of source.schemaParentsOf(member))edge(parent,member);
    }
    for(const reference of source.entryReferences()){
        inspect();if(reference.kind!=='schema'||reference.connection||reference.resolution!=='resolved')continue;
        const to=source.scopeAs(reference.targetResource!,reference.targetPointer!,'schema');if(to)edge(reference,to);
        if(reference.keyword==='$dynamicRef'&&reference.dynamic){
            dynamic.add(schemaResourceContextIdentity(reference));
            for(const at of reference.dynamic.candidates){
                const scope=source.scopeAs(at.resource,at.pointer,'schema');if(scope)dynamic.add(schemaResourceContextIdentity(scope));
            }
        }
    }
    const pending=[...dynamic];
    for(let index=0;index<pending.length;index++)for(const previous of incoming.get(pending[index])??[]){
        inspect();if(!dynamic.has(previous)){dynamic.add(previous);pending.push(previous);}
    }
    const destinationOwners=new Map<string,string>();
    for(const identity of new Set([...critical,...dynamic])){
        const group=captured.get(identity);if(!group)continue;
        const authoredDialect=authoredSchemaDialect(source,group.members[0])!==undefined;
        const destinations=new Set<string>();
        for(const member of group.members){
            inspect();const locations=mapped(member,member).flatMap(at=>{
                const scope=target.scopeAs(at.resource,at.pointer,'schema');return scope&&target.isEntryUse(scope)?[scope]:[];
            });
            // Legacy lowering has a different, explicit fixed-binding proof.
            if(!preserveFamily&&locations.length&&locations.every(scope=>!modernFamily(scope.family)))continue;
            if(!locations.length){issue(member,'migration.invariant.resource-owner','A captured schema resource member has no retained semantic owner','implementation');continue;}
            for(const scope of locations){
                // An explicit family conversion owns its native annotation
                // mappings. Its un-authored known default follows that family;
                // authored dialects remain a separate, exact resource contract.
                const defaultTransition=!preserveFamily&&!authoredDialect&&modernFamily(member.family)&&modernFamily(scope.family)&&
                    member.family!==scope.family&&sameSchemaDialect(member.dialect,defaultSchemaDialect(member.family))&&
                    sameSchemaDialect(scope.dialect,defaultSchemaDialect(scope.family));
                inspect();if(!sameSchemaDialect(scope.dialect,member.dialect)&&!defaultTransition||preserveFamily&&scope.family!==member.family)
                    issue(member,'migration.invariant.resource-dialect','The retained schema resource changes its captured effective dialect or family','implementation');
                destinations.add(schemaResourceContextIdentity(scope));
            }
        }
        if(critical.has(identity)&&destinations.size>1)
            issue(group.members[0],'migration.invariant.resource-boundary','This captured identified or anchor-bearing resource was split between independent target resources','implementation');
        for(const destination of destinations){
            inspect();const actual=retained.get(destination);if(!actual)continue;
            if(critical.has(identity)){
                const previous=destinationOwners.get(destination);
                if(previous!==undefined&&previous!==identity)
                    issue(group.members[0],'migration.invariant.resource-merge','Independent identified or anchor-bearing resources were merged into one target resource','implementation');
                destinationOwners.set(destination,identity);
            }
            for(const [expected,found]of [[group.anchors,actual.anchors],[group.dynamicAnchors,actual.dynamicAnchors]]){
                if(expected.size!==found.size||[...expected].some(([name,at])=>{
                    inspect();const anchor=found.get(name);
                    return !anchor||!mapped(at,at).some(material=>{
                        inspect();const scope=target.scopeAs(material.resource,material.pointer,'schema');
                        return scope!==undefined&&schemaResourceContextIdentity(scope)===destination&&
                            material.resource===anchor.resource&&material.pointer===anchor.pointer;
                    });
                }))issue(group.members[0],'migration.invariant.resource-anchors','The target resource changes a captured anchor table or introduces a dynamic binding from another resource','implementation');
            }
        }
    }
}
