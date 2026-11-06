import {compare,decimal} from './exact_numbers';
import {SourceError} from './document';
import {projectSchemaReference} from './schema_reference_projection';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {MigrationSource} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {constantSchemaAssertion} from './schema_constant_assertions';
import {migrationUnevaluatedMapping} from './migration_schema_unevaluated';

const identity=(scope:GraphScope)=>JSON.stringify([scope.resource,scope.pointer]);
const matchesAll=(schema:unknown)=>schema===true||schema!==null&&typeof schema==='object'&&!Array.isArray(schema)&&Object.keys(schema).length===0;

/** A conservative proof of a finite upper bound on arrays accepted at this
 * schema occurrence. Ancestor constraints apply only to a non-independent
 * same-instance occurrence. Cyclic references retain finite graph identities;
 * an unavailable bound is not evidence of an unbounded language. */
export class MigrationArrayBounds {
    private readonly proved=new Map<string,number>();
    private work=0;
    constructor(private readonly graph:ReferenceGraph,private readonly limit=2048,
        private readonly canInherit:(scope:GraphScope)=>boolean=()=>false){}
    maximum(scope:GraphScope,seen=new Set<string>()):number|undefined {
        const id=identity(scope),known=this.proved.get(id);
        if(known!==undefined)return known;
        if(seen.has(id))return;
        const doc=this.graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value;
        if(++this.work>50000||seen.size>=128){
            const range=doc.dataNode(scope.pointer)!.range;
            throw new SourceError('limit.migration.array-bounds','Array-bound proofs exceed 50000 states or 128 reference levels',range,'unsupported',{resource:scope.resource,pointer:scope.pointer,range});
        }
        const bounds:number[]=[],path=new Set(seen).add(id);
        const retain=(bound:number|undefined)=>{if(bound!==undefined)bounds.push(bound);};
        const finish=()=>{
            const bound=bounds.length?bounds.reduce((maximum,bound)=>Math.min(maximum,bound),Infinity):undefined;
            if(bound!==undefined&&bound<=this.limit){this.proved.set(id,bound);return bound;}
        };
        if(value===false)retain(0);
        if(this.canInherit(scope))for(const parent of this.graph.schemaParentsOf(scope))if(parent.resource===scope.resource&&scope.pointer.startsWith(parent.pointer+'/')&&
            /^\/(?:allOf\/\d+|anyOf\/\d+|oneOf\/\d+|if|then|else|not)$/.test(scope.pointer.slice(parent.pointer.length)))
            retain(this.maximum(parent,path));
        if(value&&typeof value==='object'&&!Array.isArray(value)){
            const contains=this.graph.scopeAs(scope.resource,scope.pointer+'/contains','schema');
            const containsConstant=contains?constantSchemaAssertion(this.graph,contains):undefined;
            if(typeof value.type==='string'&&value.type!=='array'||Array.isArray(value.type)&&!value.type.includes('array'))retain(0);
            if(Object.hasOwn(value,'const'))retain(Array.isArray(value.const)?value.const.length:0);
            if(Array.isArray(value.enum))retain(value.enum.reduce((maximum:number,item:unknown)=>Array.isArray(item)?Math.max(maximum,item.length):maximum,0));
            for(const field of ['maxItems',...(containsConstant===true?['maxContains']:[])])if(Object.hasOwn(value,field)){
                const exact=decimal(doc.dataJson(scope.pointer+'/'+field));
                if(compare(exact,decimal('0'))>=0&&compare(exact,decimal(String(this.limit)))<=0&&exact.exponent>=0n)
                    retain(Number(exact.coefficient*10n**exact.exponent));
            }
            if(containsConstant===false&&(!Object.hasOwn(value,'minContains')||compare(decimal(doc.dataJson(scope.pointer+'/minContains')),decimal('0'))>0))retain(0);
            const child=(pointer:string)=>this.graph.scopeAs(scope.resource,pointer,'schema');
            if(Array.isArray(value.prefixItems)){
                const impossible=value.prefixItems.indexOf(false);
                if(impossible>=0)retain(impossible);
                const tail=child(scope.pointer+(migrationUnevaluatedMapping(value,'unevaluatedItems')==='local'?'/unevaluatedItems':'/items'));
                if(tail&&constantSchemaAssertion(this.graph,tail)===false)retain(value.prefixItems.length);
            }
            // One conjunctive bound suffices. Unrelated recursive or dynamic
            // branches need no additional proof and cannot widen that bound.
            const local=finish();if(local!==undefined)return local;
            for(const keyword of ['allOf','anyOf','oneOf'])if(Array.isArray(value[keyword])){
                if(keyword==='allOf'){
                    for(let index=0;index<value.allOf.length;index++){
                        const nestedScope=child(scope.pointer+'/allOf/'+index);
                        if(nestedScope)retain(this.maximum(nestedScope,path));
                        const bound=finish();if(bound!==undefined)return bound;
                    }
                    continue;
                }
                const nested=value[keyword].map((_,index)=>child(scope.pointer+'/'+keyword+'/'+index))
                    .map(scope=>scope?this.maximum(scope,path):undefined);
                if(nested.length&&nested.every(bound=>bound!==undefined))retain(nested.reduce((maximum,bound)=>Math.max(maximum,bound!),0));
                const bound=finish();if(bound!==undefined)return bound;
            }
            for(const keyword of ['$ref','$dynamicRef']){
                const reference=this.graph.referenceAs(scope.resource,scope.pointer,keyword,'schema');
                if(!reference||projectSchemaReference(reference).state!=='fixed')continue;
                const target=this.graph.scopeAs(reference.targetResource!,reference.targetPointer!,'schema');
                if(target)retain(this.maximum(target,path));
                const bound=finish();if(bound!==undefined)return bound;
            }
        }
        return finish();
    }
}

/** Core 10.3.1.3 / Validation 6.4.4–6.4.5: a true contains schema matches
 * every array item, a false schema matches none. Counts become ordinary array
 * bounds; absent contains makes both count keywords inactive. Other instance
 * types remain unaffected, including when no array can satisfy the counts. */
export function migrateConstantContains(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,
    pointer:string,owners:MigrationSchemaOwners):void {
    const doc=graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value;
    if(!value||typeof value!=='object'||Array.isArray(value))return;
    const present=Object.hasOwn(value,'contains'),contains=graph.scopeAs(scope.resource,scope.pointer+'/contains','schema');
    const constant=contains?constantSchemaAssertion(graph,contains):undefined;
    const all=constant===true;
    if(present&&constant===undefined)return;
    const bound=(field:string,raw:string,upper:boolean)=>{
        const at=pointer+'/'+field,existing=source.doc.dataNode(at);
        const comparison=existing?compare(decimal(raw),decimal(source.doc.dataJson(at))):undefined;
        if(comparison===undefined||(upper?comparison<0:comparison>0)){
            owners.admit(source);source.exact(at,raw);
        }
    };
    const retire=(field:string)=>{
        const original=scope.pointer+'/'+field,at=source.current(original,scope.resource);
        if(at===undefined)return;
        const referenced=graph.references.some(reference=>reference.kind==='schema'&&reference.resolution==='resolved'&&
            reference.targetResource===scope.resource&&(reference.targetPointer===original||reference.targetPointer?.startsWith(original+'/')));
        if(referenced)owners.move({resource:scope.resource,pointer:original},source,at,field);
        else {owners.admit(source);source.remove(at,true,true,true);}
    };
    if(present){
        const minimum=Object.hasOwn(value,'minContains')?doc.dataJson(scope.pointer+'/minContains'):'1';
        if(all){
            bound('minItems',minimum,false);
            if(Object.hasOwn(value,'maxContains'))bound('maxItems',doc.dataJson(scope.pointer+'/maxContains'),true);
            // Every item of a successful array is already evaluated. Keep an
            // independent boolean/empty-schema target, but its unevaluated
            // assertion cannot affect this occurrence. Other schema shapes
            // retain their existing lowering and annotation-owner checks.
            if(Object.hasOwn(value,'unevaluatedItems')&&(typeof value.unevaluatedItems==='boolean'||matchesAll(value.unevaluatedItems)))
                retire('unevaluatedItems');
        }else if(compare(decimal(minimum),decimal('0'))>0){
            bound('minItems','1',false);bound('maxItems','0',true);
        }
        retire('contains');
    }
    for(const field of ['minContains','maxContains'])if(source.doc.dataNode(pointer+'/'+field)){
        owners.admit(source);source.remove(pointer+'/'+field,true,true,true);
    }
}

/** A disjunction of pure upper array bounds is its least restrictive bound;
 * non-arrays satisfy every such branch. Boolean branches have no annotations.
 * Retain independently referenced choices through the common owner allocator,
 * and never apply this reduction to a branch carrying other assertions or
 * annotations. This is a finite dominance proof, not schema satisfiability. */
export function migrateArrayAlternatives(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,
    pointer:string,owners:MigrationSchemaOwners):void {
    const doc=graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value;
    if(!Array.isArray(value?.anyOf)||!value.anyOf.length)return;
    const choices=value.anyOf;
    if(!choices.every(choice=>typeof choice==='boolean'||choice&&typeof choice==='object'&&!Array.isArray(choice)&&
        Object.keys(choice).length===1&&Object.hasOwn(choice,'maxItems')))return;
    let selected=0;
    for(let index=1;index<choices.length;index++){
        if(choices[selected]===true)break;
        if(choices[index]===true||choices[selected]===false||choices[index]!==false&&
            compare(decimal(doc.dataJson(scope.pointer+'/anyOf/'+index+'/maxItems')),
                decimal(doc.dataJson(scope.pointer+'/anyOf/'+selected+'/maxItems')))>0)selected=index;
    }
    let retained:string|undefined;
    for(let index=0;index<choices.length;index++){
        const original=scope.pointer+'/anyOf/'+index,at=source.current(original,scope.resource);
        if(at===undefined)throw new SourceError('migration.schema.array-choice-owner','An array bound choice has no surviving captured owner');
        if(index===selected||graph.references.some(reference=>reference.kind==='schema'&&reference.resolution==='resolved'&&
            reference.targetResource===scope.resource&&(reference.targetPointer===original||reference.targetPointer?.startsWith(original+'/')))){
            const owner=owners.move({resource:scope.resource,pointer:original},source,at,'array_choice');
            if(index===selected)retained=owners.reference(owner,'2.0');
        }
    }
    if(!retained)throw new SourceError('migration.schema.array-choice-owner','The selected array bound lost its independent owner');
    const collection=pointer+'/allOf';
    owners.admit(source,3);
    if(!source.doc.dataNode(collection))source.set(collection,[]);
    source.set(collection+'/'+source.doc.dataNode(collection)!.children.size,{$ref:retained});
    const current=source.current(scope.pointer+'/anyOf',scope.resource);
    if(current!==undefined)source.remove(current,true,true,true);
}
