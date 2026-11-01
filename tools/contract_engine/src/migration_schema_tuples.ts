import {compare,decimal} from './exact_numbers';
import {pointerFragment,type GraphScope,type ReferenceGraph} from './reference_graph';
import {SourceError} from './document';
import type {MigrationSource} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';

/** A finite modern tail has a positional Draft 4 representation: repeat its
 * schema at every reachable tail position, retaining the original maxItems.
 * One hoisted owner preserves annotations and independent references into that
 * schema. Boolean tails remain unrestricted/closed and keep independent owners
 * when referenced. No finite expansion is claimed for an unbounded tail. */
export function migrateSchemaTuple(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,
    pointer:string,target:string,owners:MigrationSchemaOwners,issue:MigrationIssue):void {
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(!Array.isArray(value?.prefixItems))return;
    if(target!=='2.0'){
        issue({...scope,pointer:scope.pointer+'/prefixItems'},'migration.schema.tuple','OpenAPI 3.0 has no positional tuple Schema Object keyword','target-representation');return;
    }
    const constrained=Object.hasOwn(value,'items')&&typeof value.items!=='boolean';
    let maximum:number|undefined;
    const upper=source.doc.dataNode(pointer+'/maxItems');
    if(constrained&&upper){
        const exact=decimal(source.doc.dataJson(pointer+'/maxItems'));
        // Compare before exponentiation: huge exact bounds cannot allocate a
        // large integer or an unbounded positional list.
        if(compare(exact,decimal('0'))>=0&&compare(exact,decimal('2048'))<=0&&exact.exponent>=0n)
            maximum=Number(exact.coefficient*10n**exact.exponent);
    }
    if(constrained&&maximum===undefined){
        issue({...scope,pointer:scope.pointer+'/items'},'migration.schema.tuple-tail','This constrained tail has no captured finite maxItems within the 2048-position conversion budget; a different equivalent Swagger mapping remains required','implementation');return;
    }
    const tail=pointer+'/items',originalTail=scope.pointer+'/items';
    const referenced=graph.references.some(reference=>reference.kind==='schema'&&reference.resolution==='resolved'&&
        reference.targetResource===scope.resource&&(reference.targetPointer===originalTail||reference.targetPointer?.startsWith(originalTail+'/')));
    // Keep a reference target even if every permitted array ends before it.
    const retained=source.doc.dataNode(tail)&&(constrained||referenced)
        ?owners.move({resource:scope.resource,pointer:originalTail},source,tail,'tuple_tail'):undefined;
    if(!retained)source.remove(tail);
    source.rename(pointer+'/prefixItems','items');
    if(constrained&&retained){
        const container='/components/schemas/';
        if(!retained.pointer.startsWith(container))throw new SourceError('migration.schema.tuple-owner','The generated tail has no captured component owner');
        // The coordinated Swagger root mapping moves this exact generated
        // component to definitions before any derived graph is validated.
        const target='/definitions/'+retained.pointer.slice(container.length);
        for(let index=value.prefixItems.length;index<maximum!;index++){
            owners.admit(source);
            source.set(pointer+'/items/'+index,{$ref:retained.resource+pointerFragment(target)});
        }
    }
    if(value.items===false){
        const maximum=String(value.prefixItems.length),existing=source.doc.dataNode(pointer+'/maxItems');
        if(!existing||compare(decimal(source.doc.dataJson(existing.pointer)),decimal(maximum))>0)source.exact(pointer+'/maxItems',maximum);
    }
}
