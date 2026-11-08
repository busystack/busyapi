import {escape,SourceError} from './document';
import {pointerFragment,type GraphReference,type ReferenceGraph} from './reference_graph';
import type {DocumentContext} from './migration_documents';
import type {MigrationIssue} from './migration_schema';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {migrationLocations,type MigrationLocation,type MigrationSource} from './migration_source';

/** Converters can introduce typed reference fields before later component
 * moves. Capture their current coordinates through the same CST relation;
 * existing authored/foreign provenance remains independent. Literal-looking
 * values never enter this graph-selected inventory. */
export function captureMigrationOwnerReferences(contexts:readonly DocumentContext[],sources:ReadonlyMap<string,MigrationSource>):void {
    let work=0;
    for(const {graph}of contexts)for(const reference of graph.entryReferences()){
        if(++work>2000000)throw new SourceError('limit.migration.owners','Generated reference capture exceeds 2000000 fields');
        if(reference.resolution!=='resolved'||reference.connection||!['$ref','$dynamicRef'].includes(reference.keyword))continue;
        const source=sources.get(reference.resource)!,field=reference.pointer+'/'+escape(reference.keyword);
        if(!source.origins.has(field))source.origins.set(field,new Set([field]));
        for(const target of [{resource:reference.targetResource!,pointer:reference.targetPointer!},...reference.dynamic?.candidates??[]]){
            if(++work>2000000)throw new SourceError('limit.migration.owners','Generated reference capture exceeds 2000000 fields');
            const output=sources.get(target.resource)!;
            if(!output.origins.has(target.pointer))output.origins.set(target.pointer,new Set([target.pointer]));
        }
    }
}

/** Finish static edges after all reservations have materialized. Inserting a
 * container owner in a later entry must also repair an earlier owner's copied
 * fields. Coordinates and targets come exclusively from the common entry/role
 * relation; no payload traversal or second reference resolver is involved.
 * Dynamic references retain their anchor spelling in the terminal resource,
 * never a pointer/static substitution. Per-entry dynamic proofs still check
 * every captured candidate and resource transition. */
export function repairMigrationOwnerReferences(contexts:readonly DocumentContext[],sources:ReadonlyMap<string,MigrationSource>,
    owners:MigrationSchemaOwners,issue:MigrationIssue,prepared:readonly ReferenceGraph[]):void {
    const graphs=new Map(prepared.map(graph=>[graph.root,graph]));
    const current=migrationLocations(sources),edits=new Map<string,{
        at:MigrationLocation;value:string;changed:boolean;reference:GraphReference;conflict:boolean;
    }>();let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.owners','Owner reference repair exceeds 2000000 captured states');};
    const same=(a:MigrationLocation,b:MigrationLocation)=>a.resource===b.resource&&a.pointer===b.pointer;
    for(const {graph}of contexts)for(const reference of graph.entryReferences()){
        inspect();if(reference.resolution!=='resolved'||
            reference.connection&&!['discriminator','operationRef'].includes(reference.connection))continue;
        const scope=graph.referenceOwner(reference);if(!scope)continue;
        const owner=owners.entryOwner(graph.root,scope,scope.kind);
        // An unchanged data occurrence cannot acquire the copied role's
        // semantic edits, even when its scalar resembles a reference.
        if(same(owner,scope)&&(graph.literalContainer(scope.resource,scope.pointer)!==undefined||
            graph.scopes.get(scope.resource+'#'+scope.pointer)?.kind!==scope.kind))continue;
        const origin={resource:reference.targetResource!,pointer:reference.targetPointer!};
        const target=owners.entryOwner(graph.root,origin,reference.kind);
        const field={resource:reference.resource,pointer:reference.pointer+'/'+escape(reference.keyword)};
        const targets=current.get(JSON.stringify([target.resource,target.pointer]))??[];
        if(targets.length!==1){
            issue(field,'migration.owners.reference-target','This typed connection has no unique retained material target','implementation');continue;
        }
        let value=targets[0].resource+pointerFragment(targets[0].pointer);
        if(reference.keyword==='$dynamicRef'&&reference.dynamic){
            const preparedGraph=graphs.get(graph.root);
            const targetScope=preparedGraph?.scopeAs(targets[0].resource,targets[0].pointer,'schema');
            if(!targetScope||preparedGraph!.docs.get(targetScope.resource)!.dataNode(targetScope.pointer+'/$dynamicAnchor')?.value!==reference.dynamic.anchor){
                issue(field,'migration.owners.dynamic-resource','The terminal schema owner has no captured matching dynamic anchor','implementation');continue;
            }
            value=targetScope.base+'#'+encodeURIComponent(reference.dynamic.anchor);
        }
        for(const at of owners.entryLocations(graph.root,field,scope,current)){
            if(reference.keyword==='$dynamicRef'){
                const preparedGraph=graphs.get(graph.root),ownerScope=preparedGraph?.scopeAs(at.resource,at.pointer.slice(0,at.pointer.lastIndexOf('/')),'schema');
                const rebound=ownerScope&&preparedGraph!.resolveReference(value,ownerScope,'$dynamicRef');
                if(rebound?.resolution!=='resolved'||rebound.targetResource!==targets[0].resource||rebound.targetPointer!==targets[0].pointer||
                    Boolean(rebound.dynamic)!==Boolean(reference.dynamic)){
                    issue(field,'migration.owners.dynamic-binding','The proposed dynamic locator does not retain its initial anchor and applicator kind','implementation');continue;
                }
            }
            inspect();const id=JSON.stringify([at.resource,at.pointer]),previous=edits.get(id);
            const changed=!same(owner,scope)||!same(target,origin)||!same(targets[0],origin)||!same(at,field);
            if(previous){previous.changed||=changed;previous.conflict||=previous.value!==value;}
            else edits.set(id,{at,value,changed,reference,conflict:false});
        }
    }
    for(const {at,value,changed,reference,conflict}of edits.values()){
        inspect();if(conflict){
            issue({...reference,pointer:reference.pointer+'/'+escape(reference.keyword)},'migration.owners.reference-context',
                'This retained reference field still needs independent entry ownership for its captured targets','implementation');continue;
        }
        if(!changed)continue;
        const source=sources.get(at.resource)!;
        if(typeof source.doc.dataNode(at.pointer)?.value!=='string'){
            issue({...reference,pointer:reference.pointer+'/'+escape(reference.keyword)},'migration.owners.reference-source',
                'This copied reference has no retained scalar field','implementation');continue;
        }
        if(source.doc.dataNode(at.pointer)!.value===value)continue;
        owners.admit(source);source.set(at.pointer,value);
    }
}
