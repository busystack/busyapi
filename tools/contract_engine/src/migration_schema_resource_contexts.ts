import {schemaResourceContextIdentity,sameSchemaDialect,type GraphScope,type ReferenceGraph} from './reference_graph';
import {SourceError} from './document';
import type {MigrationIssue} from './migration_schema';
import type {MigrationLocation} from './migration_source';
import {modernFamily} from './specification';

export type CapturedSchemaResource=Readonly<{
    identity:string;members:readonly GraphScope[];roots:readonly GraphScope[];
    boundary?:GraphScope;anchors:ReadonlyMap<string,GraphScope>;dynamicAnchors:ReadonlyMap<string,GraphScope>;
}>;

/** A view of the canonical capture, not an identity/ownership registry. Files,
 * retrieval aliases and native containers are not schema resource boundaries.
 * In particular an implicit resource can have several independently embedded
 * Schema roots. All its captured anchors belong to that same resource. */
export function capturedSchemaResources(graph:ReferenceGraph):ReadonlyMap<string,CapturedSchemaResource> {
    const members=new Map<string,GraphScope[]>();let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.resources','Schema resource capture exceeds 2000000 typed states');};
    for(const scope of graph.entryScopes()){
        inspect();if(scope.kind!=='schema')continue;
        const identity=schemaResourceContextIdentity(scope),values=members.get(identity)??[];
        values.push(scope);members.set(identity,values);
    }
    const result=new Map<string,CapturedSchemaResource>();
    for(const [identity,values]of [...members].sort(([a],[b])=>a.localeCompare(b))){
        const ordered=values.sort((a,b)=>a.pointer.length-b.pointer.length||a.pointer.localeCompare(b.pointer));
        const candidate=graph.scopeAs(ordered[0].resource,ordered[0].resourcePointer,'schema');
        const boundary=candidate&&graph.isEntryUse(candidate)&&schemaResourceContextIdentity(candidate)===identity?candidate:undefined;
        const roots=ordered.filter(scope=>{
            inspect();const parent=scope.schemaParent===undefined?undefined:graph.scopeAs(scope.resource,scope.schemaParent,'schema');
            return !parent||schemaResourceContextIdentity(parent)!==identity;
        });
        const anchors=new Map<string,GraphScope>(),dynamicAnchors=new Map<string,GraphScope>();
        for(const scope of ordered){
            inspect();const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            for(const [keyword,index]of [['$anchor',anchors],['$dynamicAnchor',dynamicAnchors]] as const)
                if(typeof value?.[keyword]==='string')index.set(value[keyword],scope);
        }
        result.set(identity,{identity,members:ordered,roots,boundary,anchors,dynamicAnchors});
    }
    return result;
}

/** A resource/anchor isomorphism proves all evaluation paths, rather than a
 * sample's selected dynamic target. Static/dynamic edge targets are proved by
 * proveMigrationConnections. Here every anchor-bearing resource must retain
 * one distinct resource, its complete anchor table and its effective dialect.
 * Anchorless forwarding frames may split/merge only with anchorless frames;
 * those frames cannot change the first matching dynamic binding. */
export function proveMigrationSchemaResources(source:ReferenceGraph,target:ReferenceGraph,
    mapped:(at:MigrationLocation,scope:GraphScope)=>readonly MigrationLocation[],issue:MigrationIssue,preserveFamily=false):void {
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
        const destinations=new Map<string,Map<string,GraphScope>>();
        for(const member of group.members){
            inspect();const locations=mapped(member,member).flatMap(at=>{
                const scope=target.scopeAs(at.resource,at.pointer,'schema');return scope&&target.isEntryUse(scope)?[scope]:[];
            });
            // Legacy lowering has a different, explicit fixed-binding proof.
            if(!preserveFamily&&locations.length&&locations.every(scope=>!modernFamily(scope.family)))continue;
            if(!locations.length){issue(member,'migration.invariant.resource-owner','A captured schema resource member has no retained semantic owner','implementation');continue;}
            for(const scope of locations){
                inspect();if(!sameSchemaDialect(scope.dialect,member.dialect)||preserveFamily&&scope.family!==member.family)
                    issue(member,'migration.invariant.resource-dialect','The retained schema resource changes its captured effective dialect or family','implementation');
                const id=schemaResourceContextIdentity(scope),members=destinations.get(id)??new Map<string,GraphScope>();
                members.set(member.pointer,scope);destinations.set(id,members);
            }
        }
        if(critical.has(identity)&&destinations.size>1)
            issue(group.members[0],'migration.invariant.resource-boundary','This captured identified or anchor-bearing resource was split between independent target resources','implementation');
        for(const [destination,members]of destinations){
            inspect();const actual=retained.get(destination);if(!actual)continue;
            if(critical.has(identity)){
                const previous=destinationOwners.get(destination);
                if(previous!==undefined&&previous!==identity)
                    issue(group.members[0],'migration.invariant.resource-merge','Independent identified or anchor-bearing resources were merged into one target resource','implementation');
                destinationOwners.set(destination,identity);
            }
            for(const [expected,found]of [[group.anchors,actual.anchors],[group.dynamicAnchors,actual.dynamicAnchors]]){
                if(expected.size!==found.size||[...expected].some(([name,at])=>{
                    inspect();const material=members.get(at.pointer),anchor=found.get(name);
                    return !material||!anchor||material.resource!==anchor.resource||material.pointer!==anchor.pointer;
                }))issue(group.members[0],'migration.invariant.resource-anchors','The target resource changes a captured anchor table or introduces a dynamic binding from another resource','implementation');
            }
        }
    }
}
