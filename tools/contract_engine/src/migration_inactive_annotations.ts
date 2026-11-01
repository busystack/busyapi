import {escape} from './document';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {MigrationSource} from './migration_source';
import {restrictedBooleanSchema} from './migration_schema_values';
import {MigrationSchemaOwners} from './migration_schema_owners';

/** OAS 3.0.4 Schema Object fixed fields: writeOnly/deprecated default to false.
 * Their inactive values impose neither a directional rule nor deprecation.
 * Swagger has no corresponding fields. Remove only these false annotations;
 * a modern value also referenced as a boolean schema keeps a separate owner.
 * Active annotations still require their own faithful representation. */
export function migrateInactiveSchemaAnnotations(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,
    sources:ReadonlyMap<string,MigrationSource>,target:string,owners:MigrationSchemaOwners):void {
    if(target!=='2.0'||scope.family==='2.0')return;
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(graph.referenceObject(value,scope))return;
    for(const field of ['writeOnly','deprecated']){
        if(value?.[field]!==false)continue;
        const original=scope.pointer+'/'+escape(field),current=source.current(original);
        if(current===undefined||!source.doc.dataNode(current))continue;
        if(graph.scopeAs(scope.resource,original,'schema')){
            const entry=sources.get(graph.root)!;
            const destination=owners.move({resource:scope.resource,pointer:original},source,current,'annotation').pointer;
            // The graph may retain this independent schema role separately
            // from its physical annotation field. Lower its boolean value
            // after moving it, without giving the annotation object meaning.
            if(entry.doc.dataNode(destination)?.value===false)entry.set(destination,restrictedBooleanSchema(false,target));
        }else source.remove(current,true,true,true);
    }
}
