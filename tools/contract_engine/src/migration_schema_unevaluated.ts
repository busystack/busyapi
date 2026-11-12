import type {GraphScope,GraphReference,ReferenceGraph} from './reference_graph';
import type {SourcePlan} from './source_plan';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {constantSchemaAssertion} from './schema_constant_assertions';

type Field='unevaluatedProperties'|'unevaluatedItems';
const fields:readonly Field[]=['unevaluatedProperties','unevaluatedItems'];
const destination=(field:Field)=>field==='unevaluatedProperties'?'additionalProperties':'items';

/** Core 2020-12 §§10.3, 11.2–3. An explicit additionalProperties covers all
 * remaining names, and explicit items together with prefixItems covers all
 * array positions. A true/empty contains also covers every successful item.
 * These proofs hold even beside other in-place applicators. Without such
 * applicators, the unevaluated selection is exactly the local additional
 * selection. Unknown composition coverage is never guessed or expanded. */
export function migrationUnevaluatedMapping(value:any,field:Field,containsAll=false):'inactive'|'local'|undefined {
    if(value===null||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,field))return;
    const type=field==='unevaluatedProperties'?'object':'array';
    if(typeof value.type==='string'&&value.type!==type||Array.isArray(value.type)&&!value.type.includes(type))return 'inactive';
    if(Object.hasOwn(value,destination(field)))return 'inactive';
    if(field==='unevaluatedItems'&&(containsAll||value.contains===true||value.contains!==null&&typeof value.contains==='object'&&
        !Array.isArray(value.contains)&&Object.keys(value.contains).length===0))return 'inactive';
    if(['$ref','$dynamicRef','allOf','anyOf','oneOf','if','dependentSchemas'].some(name=>Object.hasOwn(value,name)))return;
    if(field==='unevaluatedItems'&&Object.hasOwn(value,'contains'))return;
    return 'local';
}

function independent(graph:ReferenceGraph,scope:GraphScope):boolean {
    return graph.literalContainer(scope.resource,scope.pointer)===undefined&&!graph.hasOverlappingScope(scope.resource,scope.pointer);
}

/** An inactive child must not block conversion for an assertion that never
 * evaluates it. Identified/independently consumed children remain material
 * owners and undergo their own ordinary conversion. */
export function discardInactiveUnevaluated(graph:ReferenceGraph,scope:GraphScope,source:SourcePlan,
    owners:MigrationSchemaOwners,references:readonly GraphReference[]):void {
    if(!independent(graph,scope))return;
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    const contains=graph.scopeAs(scope.resource,scope.pointer+'/contains','schema');
    const containsAll=contains!==undefined&&constantSchemaAssertion(graph,contains)===true;
    for(const field of fields){
        if(migrationUnevaluatedMapping(value,field,containsAll)!=='inactive')continue;
        const original={resource:scope.resource,pointer:scope.pointer+'/'+field},current=source.current(original.pointer,scope.resource);
        if(current!==undefined&&!owners.hasConsumers(original,references)){
            owners.admit(source,4);source.remove(current,true,true,true);
        }
    }
}

/** Retain the selected subschema's CST/provenance when it becomes an ordinary
 * applicator. The returned origin lets tuple conversion distinguish a newly
 * selected unevaluated tail from an originally absent/unconstrained items. */
export function migrateSchemaUnevaluated(graph:ReferenceGraph,scope:GraphScope,source:SourcePlan,pointer:string,
    owners:MigrationSchemaOwners,references:readonly GraphReference[]):string|undefined {
    if(!independent(graph,scope))return;
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    const contains=graph.scopeAs(scope.resource,scope.pointer+'/contains','schema');
    const containsAll=contains!==undefined&&constantSchemaAssertion(graph,contains)===true;
    let tail:string|undefined;
    for(const field of fields){
        const mode=migrationUnevaluatedMapping(value,field,containsAll);if(mode===undefined)continue;
        const original={resource:scope.resource,pointer:scope.pointer+'/'+field},current=source.current(original.pointer,scope.resource);
        if(current!==pointer+'/'+field)continue;
        if(mode==='inactive'){
            if(owners.hasConsumers(original,references))owners.move(original,source,current,'inactive_unevaluated',{context:graph,layout:'array-item'});
            else {owners.admit(source,4);source.remove(current,true,true,true);}
        }else{
            owners.admit(source,4);source.move(current,pointer+'/'+destination(field),true);
            if(field==='unevaluatedItems')tail=original.pointer;
        }
    }
    return tail;
}
