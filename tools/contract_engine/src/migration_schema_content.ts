import {MigrationSchemaProofs} from './migration_schema_proofs';
import {discardInactiveMigrationSchema} from './migration_schema_conditions';
import type {GraphScope,GraphReference,ReferenceGraph} from './reference_graph';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationSource} from './migration_source';

/** Validation 2020-12 §8: content fields annotate strings, never assert that
 * arbitrary strings decode or conform. contentSchema is ignored without a
 * contentMediaType. The canonical evaluator implements that same policy.
 * Active media/encoding conversion remains with the existing binary/media
 * owners. No media type, decoder, file specialization or assertion is invented.
 */
export function discardInactiveContent(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,
    owners:MigrationSchemaOwners,references:readonly GraphReference[]):void {
    if(graph.hasOverlappingScope(scope.resource,scope.pointer)||graph.literalContainer(scope.resource,scope.pointer)!==undefined)return;
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(!value||typeof value!=='object'||Array.isArray(value))return;
    const noStrings=!new MigrationSchemaProofs(graph).domains(scope).has('string');
    if(Object.hasOwn(value,'contentSchema')&&(noStrings||!Object.hasOwn(value,'contentMediaType'))){
        const original={resource:scope.resource,pointer:scope.pointer+'/contentSchema'};
        discardInactiveMigrationSchema(graph,original,source,owners,references);
        const at=source.current(original.pointer,scope.resource);
        if(at!==undefined)owners.move(original,source,at,'content_schema',{context:graph,layout:'array-item'});
    }
    if(noStrings)for(const field of ['contentEncoding','contentMediaType']){
        const original={resource:scope.resource,pointer:scope.pointer+'/'+field},at=source.current(original.pointer,scope.resource);
        if(at!==undefined)owners.retainLiteralValue(original,source,at,'inactive_content');
    }
}
