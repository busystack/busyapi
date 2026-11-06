import type {GraphScope} from './reference_graph';
import type {MigrationSchemaOwners} from './migration_schema_owners';

/** Proof expressions for successful in-place applications. These never
 * evaluate instances; emitted guard tests must suppress their annotations. */
export type AnnotationGuard=boolean|Readonly<{schema:GraphScope}>|Readonly<{not:AnnotationGuard}>|
    Readonly<{all:readonly AnnotationGuard[]}>|Readonly<{any:readonly AnnotationGuard[]}>|Readonly<{present:string}>;
export const annotationAny=(values:readonly AnnotationGuard[]):AnnotationGuard=>values.includes(true)?true:values.filter(value=>value!==false).length===0?false:
    values.filter(value=>value!==false).length===1?values.find(value=>value!==false)!:{any:values.filter(value=>value!==false)};
export const annotationAll=(values:readonly AnnotationGuard[]):AnnotationGuard=>values.includes(false)?false:values.filter(value=>value!==true).length===0?true:
    values.filter(value=>value!==true).length===1?values.find(value=>value!==true)!:{all:values.filter(value=>value!==true)};
export const annotationNot=(value:AnnotationGuard):AnnotationGuard=>typeof value==='boolean'?!value:{not:value};
export function emitAnnotationGuard(guard:AnnotationGuard,owners:MigrationSchemaOwners,target:string):unknown {
    if(typeof guard==='boolean')return guard?{}:{not:{}};
    if('schema'in guard)return {$ref:owners.reference(owners.uniqueLocation(guard.schema).location,target)};
    if('present'in guard)return {required:[guard.present]};
    if('not'in guard)return {not:emitAnnotationGuard(guard.not,owners,target)};
    return 'all'in guard?{allOf:guard.all.map(value=>emitAnnotationGuard(value,owners,target))}:
        {anyOf:guard.any.map(value=>emitAnnotationGuard(value,owners,target))};
}
