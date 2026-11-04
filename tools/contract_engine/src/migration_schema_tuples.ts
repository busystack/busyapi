import {compare,decimal} from './exact_numbers';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {MigrationSource} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';
import type {MigrationArrayBounds} from './migration_schema_arrays';
import {uniformTupleTail} from './migration_tuple_uniform_tail';

/** A finite modern tail has a positional Draft 4 representation: repeat its
 * schema at every reachable tail position, retaining the original maxItems.
 * One hoisted owner preserves annotations and independent references into that
 * schema. Boolean tails remain unrestricted/closed and keep independent owners
 * when referenced. Bounds may be proved through same-instance composition and
 * fixed references; no finite expansion is claimed without that proof. */
export function migrateSchemaTuple(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,
    pointer:string,target:string,owners:MigrationSchemaOwners,issue:MigrationIssue,bounds:MigrationArrayBounds,
    tailOrigin=scope.pointer+'/items'):void {
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(!Array.isArray(value?.prefixItems))return;
    if(target!=='2.0'){
        issue({...scope,pointer:scope.pointer+'/prefixItems'},'migration.schema.tuple','OpenAPI 3.0 has no positional tuple Schema Object keyword','target-representation');return;
    }
    const originalTail=tailOrigin,tailValue=graph.docs.get(scope.resource)!.dataNode(originalTail)?.value;
    const constrained=tailValue!==undefined&&typeof tailValue!=='boolean';
    const maximum=constrained?bounds.maximum(scope):undefined;
    const tailScope=graph.scopeAs(scope.resource,originalTail,'schema');
    const prefixes=value.prefixItems.map((_:unknown,index:number)=>graph.scopeAs(scope.resource,scope.pointer+'/prefixItems/'+index,'schema'));
    const uniform=constrained&&maximum===undefined&&tailScope!==undefined&&prefixes.every(scope=>scope!==undefined)&&uniformTupleTail(graph,tailScope,prefixes);
    if(constrained&&maximum===undefined&&!uniform){
        issue({...scope,pointer:originalTail},'migration.schema.tuple-tail','No finite same-instance array bound was proved within the 2048-position conversion budget; a different equivalent Swagger mapping remains required','implementation');return;
    }
    const tail=pointer+'/items';
    const referenced=graph.references.some(reference=>reference.kind==='schema'&&reference.resolution==='resolved'&&
        reference.targetResource===scope.resource&&(reference.targetPointer===originalTail||reference.targetPointer?.startsWith(originalTail+'/')));
    // Keep a reference target even if every permitted array ends before it.
    const retained=source.doc.dataNode(tail)&&(constrained||referenced)
        ?owners.move({resource:scope.resource,pointer:originalTail},source,tail,'tuple_tail',{layout:'array-item',context:owners.contextOf(scope)}):undefined;
    if(!retained)source.remove(tail);
    source.rename(pointer+'/prefixItems','items');
    if(constrained&&retained){
        if(uniform){
            const allOf=pointer+'/allOf';owners.admit(source,2);
            if(!source.doc.dataNode(allOf))source.set(allOf,[]);
            source.set(allOf+'/'+source.doc.dataNode(allOf).children.size,{items:{$ref:owners.reference(retained,target)}});
        }else{
            for(let index=value.prefixItems.length;index<maximum!;index++){
                owners.admit(source);
                source.set(pointer+'/items/'+index,{$ref:owners.reference(retained,target)});
            }
        }
    }
    if(tailValue===false){
        const maximum=String(value.prefixItems.length),existing=source.doc.dataNode(pointer+'/maxItems');
        if(!existing||compare(decimal(source.doc.dataJson(existing.pointer)),decimal(maximum))>0)source.exact(pointer+'/maxItems',maximum);
    }
}
