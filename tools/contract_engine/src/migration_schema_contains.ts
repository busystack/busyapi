import {compare,decimal} from './exact_numbers';
import {MigrationSchemaProofs,migrationExactValueIdentity} from './migration_schema_proofs';
import {FiniteMigrationDomain} from './migration_finite_domain';
import {SourceDocument} from './document';
import {constantSchemaAssertion} from './schema_constant_assertions';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationSource} from './migration_source';
import type {MigrationArrayBounds} from './migration_schema_arrays';
import {schemaStringComplement} from './migration_schema_string_complements';

/** Nonconstant containment: exact structural match counts, or the 3.0
 * existential/complement equivalence. Neither algorithm bounds arbitrary
 * lengths. The predicate retains its own material schema; successful predicate
 * metadata is applied once per matching item, separately from count tests. */
export function migrateSchemaContains(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,pointer:string,target:string,
    owners:MigrationSchemaOwners,bounds:MigrationArrayBounds):boolean {
    const doc=graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value;
    const contains=graph.scopeAs(scope.resource,scope.pointer+'/contains','schema'),at=source.current(scope.pointer+'/contains',scope.resource);
    if(!contains||at!==pointer+'/contains'||!source.doc.dataNode(at)||constantSchemaAssertion(graph,contains)!==undefined)return false;
    if(graph.hasOverlappingScope(scope.resource,scope.pointer)||graph.literalContainer(scope.resource,scope.pointer)!==undefined)return false;
    const proofs=new MigrationSchemaProofs(graph),parts=proofs.conjuncts(scope),maximum=bounds.maximum(scope);
    const predicateTruth=proofs.validationConstant(contains);
    const minimum=Object.hasOwn(value,'minContains')?doc.dataJson(scope.pointer+'/minContains'):'1';
    const upper=Object.hasOwn(value,'maxContains')?doc.dataJson(scope.pointer+'/maxContains'):undefined;
    const zero=compare(decimal(minimum),decimal('0'))===0,one=compare(decimal(minimum),decimal('1'))===0;
    const noMatches=upper!==undefined&&compare(decimal(upper),decimal('0'))===0;
    const impossible=upper!==undefined&&compare(decimal(minimum),decimal(upper))>0;
    const effectiveUpper=maximum!==undefined&&upper!==undefined&&compare(decimal(upper),decimal(String(maximum)))>=0?undefined:upper;
    const position=(part:GraphScope,index:number)=>{
        const schema=graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
        if(Array.isArray(schema?.prefixItems)&&index<schema.prefixItems.length)
            return graph.scopeAs(part.resource,part.pointer+'/prefixItems/'+index,'schema');
        return graph.scopeAs(part.resource,part.pointer+'/items','schema');
    };
    const uniform=(match:boolean)=>parts.some(part=>{
        const schema=graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
        if(Array.isArray(schema?.prefixItems))return false;
        const item=graph.scopeAs(part.resource,part.pointer+'/items','schema');
        return item&&(match?proofs.implies(item,contains):proofs.disjoint(item,contains));
    });
    const forcedAll=maximum!==undefined&&!zero&&compare(decimal(String(maximum)),decimal(minimum))<=0;
    const allMatch=predicateTruth===true||forcedAll||maximum===0||uniform(true)||maximum!==undefined&&Array.from({length:maximum},(_,index)=>index)
        .every(index=>parts.some(part=>{const item=position(part,index);return item&&proofs.implies(item,contains);}));
    const noneMatch=predicateTruth===false||uniform(false)||maximum!==undefined&&Array.from({length:maximum},(_,index)=>index)
        .every(index=>parts.some(part=>{const item=position(part,index);return item&&proofs.disjoint(item,contains);}));
    const unconstrained=zero&&effectiveUpper===undefined&&proofs.annotationFree(contains);
    let complement:Record<string,unknown>|undefined;
    if(target==='2.0'&&zero&&noMatches){
        let types=new Set(['null','boolean','object','array','number','string']),known=true;
        const annotations=new Set(['title','description','default','examples','deprecated','readOnly','writeOnly','externalDocs','xml']);
        for(const part of proofs.conjuncts(contains)){
            const body=graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
            if(!body||typeof body!=='object'||Object.keys(body).some(field=>
                !['type','$id','$schema','$anchor','$dynamicAnchor','$ref','$dynamicRef','allOf'].includes(field)&&!annotations.has(field))){known=false;break;}
            if(['$ref','$dynamicRef'].some(field=>Object.hasOwn(body,field)&&!proofs.fixed(part,field))){known=false;break;}
            if(Object.hasOwn(body,'type')){
                const allowed=typeof body.type==='string'?[body.type]:body.type;
                if(!Array.isArray(allowed)||allowed.includes('integer')){known=false;break;}
                types=new Set([...types].filter(type=>allowed.includes(type)));
            }
        }
        if(known){const remaining=['null','boolean','object','array','number','string'].filter(type=>!types.has(type));
            if(remaining.length)complement={type:remaining};}
        complement??=schemaStringComplement(graph,contains);
    }
    let finiteMatches:readonly string[]|undefined;
    if(target==='3.0'&&!allMatch&&!noneMatch&&!impossible&&(!zero&&!one||effectiveUpper!==undefined&&!noMatches)&&parts.some(part=>
        graph.docs.get(part.resource)!.dataNode(part.pointer)?.value?.uniqueItems===true)){
        const candidates=new FiniteMigrationDomain(graph).values(contains);
        if(candidates!==undefined){
            const literals=new SourceDocument('['+candidates.join(',')+']','file:///busyapi-migration-containment-proof.json');
            const distinct=new Map<string,string>();
            candidates.forEach((raw,index)=>distinct.set(migrationExactValueIdentity(literals,'/'+index),raw));
            if(distinct.size<=8)finiteMatches=[...distinct.values()];
        }
    }
    if(!allMatch&&!noneMatch&&!impossible&&!unconstrained&&!complement&&finiteMatches===undefined&&
        (target!=='3.0'||!zero&&!one||effectiveUpper!==undefined&&!noMatches))return false;
    // An unevaluated selection must be projected from the captured annotation
    // graph before containment changes target items coverage.
    if(source.doc.dataNode(pointer+'/unevaluatedItems'))return false;
    const owner=owners.move(contains,source,at,'contains',{context:graph,layout:'array-item'}),reference={$ref:owners.reference(owner,target)};
    const append=(assertion:unknown)=>{
        const collection=pointer+'/allOf';owners.admit(source,3);
        if(!source.doc.dataNode(collection))source.set(collection,[]);
        const branch=collection+'/'+source.doc.dataNode(collection)!.children.size;
        source.set(branch,assertion);source.presentationChanges.push(branch);
    };
    const bound=(field:string,raw:string,upper:boolean)=>{
        const existing=source.doc.dataNode(pointer+'/'+field),order=existing?compare(decimal(raw),decimal(source.doc.dataJson(pointer+'/'+field))):undefined;
        if(order===undefined||(upper?order<0:order>0)){owners.admit(source);source.exact(pointer+'/'+field,raw);}
    };
    if(impossible||noneMatch&&!zero){bound('minItems','1',false);bound('maxItems','0',true);}
    else if(allMatch){
        bound('minItems',minimum,false);if(upper!==undefined)bound('maxItems',upper,true);
        append({items:reference});
    }else if(finiteMatches!==undefined){
        // uniqueItems turns each value in a proven finite predicate domain
        // into one possible match. Boolean presence combinations preserve the
        // exact count for arrays of arbitrary length and unrelated item values.
        // Candidate values need not themselves satisfy C: each test intersects
        // its exact literal with the original predicate under not.
        const alternatives:unknown[]=[];
        for(let mask=0;mask<2**finiteMatches.length;mask++){
            let count=0;for(let index=0;index<finiteMatches.length;index++)if(mask&(1<<index))count++;
            if(compare(decimal(String(count)),decimal(minimum))<0||upper!==undefined&&compare(decimal(String(count)),decimal(upper))>0)continue;
            alternatives.push(finiteMatches.length?{allOf:finiteMatches.map((_,index)=>{
                const predicate={not:{type:'array',items:{not:{allOf:[reference,{enum:[null]}]}}}};
                return mask&(1<<index)?predicate:{not:predicate};
            })}:{});
        }
        // Exact CST literals must never round through JSON.parse. Install the
        // raw enum operands after constructing the generated branch below.
        const collection=pointer+'/allOf';owners.admit(source,3);if(!source.doc.dataNode(collection))source.set(collection,[]);
        const branch=collection+'/'+source.doc.dataNode(collection)!.children.size;
        source.set(branch,{anyOf:[{not:{type:'array',items:{}}},...(alternatives.length?[{anyOf:alternatives}]:[])]});
        let choice=0;
        for(let mask=0;mask<2**finiteMatches.length;mask++){
            let count=0;for(let index=0;index<finiteMatches.length;index++)if(mask&(1<<index))count++;
            if(compare(decimal(String(count)),decimal(minimum))<0||upper!==undefined&&compare(decimal(String(count)),decimal(upper))>0)continue;
            finiteMatches.forEach((raw,index)=>{
                owners.admit(source);source.exact(branch+'/anyOf/1/anyOf/'+choice+'/allOf/'+index+
                    (mask&(1<<index)?'':'/not')+'/not/items/not/allOf/1/enum','['+raw+']');
            });choice++;
        }
        source.presentationChanges.push(branch);append({items:{anyOf:[reference,{not:reference}]}});
    }else if(!noneMatch&&!(target==='2.0'&&unconstrained)){
        if(noMatches)append({items:complement??{not:reference}});
        else {
            if(one)append({not:{type:'array',items:{not:reference}}});
            // A tautology with disjoint choices preserves C's successful
            // annotations even when minContains is zero. Count tests above
            // suppress their own metadata through not.
            append({items:{anyOf:[reference,{not:reference}]}});
        }
    }
    for(const field of ['minContains','maxContains'])if(source.doc.dataNode(pointer+'/'+field)){
        owners.admit(source);source.remove(pointer+'/'+field,true,true,true);
    }
    return true;
}
