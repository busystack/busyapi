import {escape,SourceError} from './document';
import {pointerFragment,type GraphReference} from './reference_graph';
import type {DocumentContext} from './migration_documents';
import type {MigrationIssue} from './migration_schema';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {migrationLocations,type MigrationLocation,type MigrationSource} from './migration_source';

/** Finish static edges after all reservations have materialized. Inserting a
 * container owner in a later entry must also repair an earlier owner's copied
 * fields. Coordinates and targets come exclusively from the common entry/role
 * relation; no payload traversal or second reference resolver is involved.
 * Dynamic and named security connections retain their dedicated scope/name
 * algorithms and are checked by the ordinary per-entry connection proof. */
export function repairMigrationOwnerReferences(contexts:readonly DocumentContext[],sources:ReadonlyMap<string,MigrationSource>,
    owners:MigrationSchemaOwners,issue:MigrationIssue):void {
    const current=migrationLocations(sources),edits=new Map<string,{
        at:MigrationLocation;value:string;changed:boolean;reference:GraphReference;conflict:boolean;
    }>();let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.owners','Owner reference repair exceeds 2000000 captured states');};
    const same=(a:MigrationLocation,b:MigrationLocation)=>a.resource===b.resource&&a.pointer===b.pointer;
    for(const {graph}of contexts)for(const reference of graph.entryReferences()){
        inspect();if(reference.resolution!=='resolved'||reference.keyword==='$dynamicRef'||
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
        const value=targets[0].resource+pointerFragment(targets[0].pointer);
        for(const at of owners.entryLocations(graph.root,field,scope,current)){
            inspect();const id=JSON.stringify([at.resource,at.pointer]),previous=edits.get(id);
            const changed=!same(owner,scope)||!same(target,origin);
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
