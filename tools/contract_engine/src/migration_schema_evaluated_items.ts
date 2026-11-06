import {MigrationSchemaProofs} from './migration_schema_proofs';
import {annotationAll,annotationNot,emitAnnotationGuard,type AnnotationGuard} from './migration_schema_annotation_guards';
import type {GraphScope,GraphReference,ReferenceGraph} from './reference_graph';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationSource} from './migration_source';
import type {MigrationArrayBounds} from './migration_schema_arrays';
import {discardInactiveMigrationSchema} from './migration_schema_conditions';
import {compare,decimal} from './exact_numbers';

type Term=Readonly<{guard:AnnotationGuard;item:true|GraphScope}>;

/** Coverage is a union of successful array applications and matching item
 * predicates. Partitioning the finite applicator graph never partitions or
 * truncates the array length/value language. Original applications retain
 * their annotations; the selection tests below run under not only. */
export class MigrationEvaluatedItems {
    private readonly proofs:MigrationSchemaProofs;
    private work=0;
    constructor(private readonly graph:ReferenceGraph,private readonly owners:MigrationSchemaOwners,
        private readonly bounds:MigrationArrayBounds){this.proofs=new MigrationSchemaProofs(graph);}
    private guard(scope:GraphScope):AnnotationGuard{return this.proofs.validationConstant(scope)??{schema:scope};}
    /** Exact positional coverage certificates, independent of the selected
     * value schemas. Infinity means every present position on success. */
    private prefix(scope:GraphScope,root=false,active=new Set<string>()):number|undefined {
        const id=JSON.stringify([scope.resource,scope.pointer]);
        if(++this.work>50000||active.size>=128||active.has(id))return;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(typeof value==='boolean')return 0;
        if(!value||typeof value!=='object'||Array.isArray(value))return;
        if(!root&&Object.hasOwn(value,'unevaluatedItems')||Object.hasOwn(value,'items'))return Infinity;
        const next=new Set(active).add(id),child=(pointer:string)=>this.graph.scopeAs(scope.resource,pointer,'schema');
        let prefix=Array.isArray(value.prefixItems)?value.prefixItems.length:0,unknown=false;
        const retain=(value:number|undefined)=>{if(value===undefined)unknown=true;else prefix=Math.max(prefix,value);};
        if(Object.hasOwn(value,'contains')){
            const at=child(scope.pointer+'/contains'),truth=at&&this.proofs.validationConstant(at),maximum=this.bounds.maximum(scope);
            const doc=this.graph.docs.get(scope.resource)!,minimum=Object.hasOwn(value,'minContains')?doc.dataJson(scope.pointer+'/minContains'):'1';
            if(truth===true||maximum!==undefined&&compare(decimal(minimum),decimal('0'))>0&&compare(decimal(String(maximum)),decimal(minimum))<=0)return Infinity;
            if(truth!==false)unknown=true;
        }
        for(const field of ['$ref','$dynamicRef'])if(Object.hasOwn(value,field)){
            const at=this.proofs.fixed(scope,field);retain(at?this.prefix(at,false,next):undefined);
        }
        for(const field of ['allOf','anyOf','oneOf'])if(Array.isArray(value[field])){
            const choices=value[field].map((_:unknown,index:number)=>child(scope.pointer+'/'+field+'/'+index))
                .filter(at=>at&&this.proofs.validationConstant(at)!==false).map(at=>this.prefix(at!,false,next));
            if(field==='allOf')choices.forEach(retain);
            else if(choices.length&&choices.every(value=>value!==undefined&&value===choices[0]))retain(choices[0]);
            else unknown=true;
            if(prefix===Infinity)return Infinity;
        }
        if(Object.hasOwn(value,'if')){
            const at=child(scope.pointer+'/if');if(!at)return;
            const truth=this.proofs.validationConstant(at),condition=this.prefix(at,false,next);
            const branch=(field:string)=>{const at=child(scope.pointer+'/'+field);return at?this.prefix(at,false,next):0;};
            if(truth===true){retain(condition);retain(branch('then'));}
            else if(truth===false)retain(branch('else'));
            else {
                const positive=branch('then'),negative=branch('else');
                if(positive===Infinity&&negative===Infinity)retain(Infinity);
                else if(condition!==undefined&&positive!==undefined&&negative!==undefined&&Math.max(condition,positive)===negative)retain(negative);
                else unknown=true;
            }
        }
        return prefix===Infinity?Infinity:unknown?undefined:prefix;
    }
    private lowerPrefix(scope:GraphScope,source:MigrationSource,pointer:string,target:string,prefix:number,defer:(apply:()=>void)=>void):boolean {
        if(prefix!==Infinity&&prefix>2048)return false;
        const maximum=this.bounds.maximum(scope),original={resource:scope.resource,pointer:scope.pointer+'/unevaluatedItems'};
        const selected=this.graph.scopeAs(scope.resource,original.pointer,'schema');if(!selected)return false;
        const covered=prefix===Infinity||maximum!==undefined&&prefix>=maximum;
        let uniform=prefix===0;
        if(!covered&&!uniform&&(target!=='2.0'||maximum===undefined)&&this.proofs.annotationFree(selected)){
            const parts=this.proofs.conjuncts(scope);
            uniform=Array.from({length:prefix},(_,index)=>index).every(index=>parts.some(part=>{
                const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
                const at=this.graph.scopeAs(part.resource,part.pointer+(index<(value?.prefixItems?.length??0)?'/prefixItems/'+index:'/items'),'schema');
                return at&&this.proofs.implies(at,selected);
            }));
        }
        if(!covered&&!uniform&&(target!=='2.0'||maximum===undefined))return false;
        const owner=this.owners.move(original,source,pointer+'/unevaluatedItems','unevaluated_positional_items',{context:this.graph,layout:'array-item'});
        defer(()=>{
            if(covered)return;
            const material=this.owners.uniqueLocation(scope),entry=material.source,collection=material.location.pointer+'/allOf';
            const reference={$ref:this.owners.reference(owner,target)};this.owners.admit(entry,3);
            if(!entry.doc.dataNode(collection))entry.set(collection,[]);
            const branch=collection+'/'+entry.doc.dataNode(collection)!.children.size;
            entry.set(branch,{items:uniform?reference:Array.from({length:maximum!},(_,index)=>index<prefix?{}:reference)});
            entry.presentationChanges.push(branch);
        });
        return true;
    }
    private terms(scope:GraphScope,root=false,active=new Set<string>()):readonly Term[]|undefined {
        const id=JSON.stringify([scope.resource,scope.pointer]);
        if(++this.work>50000||active.size>=128||active.has(id))return;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(typeof value==='boolean')return [];
        if(!value||typeof value!=='object'||Array.isArray(value))return;
        const next=new Set(active).add(id),parts:Term[]=[];
        if(!root&&Object.hasOwn(value,'unevaluatedItems')||Object.hasOwn(value,'items'))return [{guard:true,item:true}];
        if(Array.isArray(value.prefixItems)&&value.prefixItems.length){
            const maximum=this.bounds.maximum(scope);
            if(maximum===undefined||maximum>value.prefixItems.length)return;
            return [{guard:true,item:true}];
        }
        const child=(pointer:string)=>this.graph.scopeAs(scope.resource,pointer,'schema');
        if(Object.hasOwn(value,'contains')){
            const at=child(scope.pointer+'/contains');if(!at)return;
            const truth=this.proofs.validationConstant(at);
            const maximum=this.bounds.maximum(scope),doc=this.graph.docs.get(scope.resource)!;
            const minimum=Object.hasOwn(value,'minContains')?doc.dataJson(scope.pointer+'/minContains'):'1';
            const forced=maximum!==undefined&&compare(decimal(minimum),decimal('0'))>0&&compare(decimal(String(maximum)),decimal(minimum))<=0;
            if(forced||truth!==false)parts.push({guard:true,item:forced||truth===true?true:at});
        }
        for(const field of ['$ref','$dynamicRef'])if(Object.hasOwn(value,field)){
            const target=this.proofs.fixed(scope,field),terms=target&&this.terms(target,false,next);if(!terms)return;
            parts.push(...terms);
        }
        for(const field of ['allOf','anyOf','oneOf'])if(Array.isArray(value[field]))for(let index=0;index<value[field].length;index++){
            const at=child(scope.pointer+'/'+field+'/'+index),terms=at&&this.terms(at,false,next);if(!at||!terms)return;
            parts.push(...terms.map(term=>({guard:annotationAll([field==='allOf'?true:this.guard(at),term.guard]),item:term.item})));
        }
        if(Object.hasOwn(value,'if')){
            const at=child(scope.pointer+'/if'),terms=at&&this.terms(at,false,next);if(!at||!terms)return;
            const guard=this.guard(at);
            parts.push(...terms.map(term=>({guard:annotationAll([guard,term.guard]),item:term.item})));
            for(const field of ['then','else'])if(Object.hasOwn(value,field)){
                const at=child(scope.pointer+'/'+field),terms=at&&this.terms(at,false,next);if(!terms)return;
                parts.push(...terms.map(term=>({guard:annotationAll([field==='then'?guard:annotationNot(guard),term.guard]),item:term.item})));
            }
        }
        return parts;
    }
    discardInactive(scope:GraphScope,source:MigrationSource,references:readonly GraphReference[]):void {
        const original={resource:scope.resource,pointer:scope.pointer+'/unevaluatedItems'};
        if(source.current(original.pointer,scope.resource)===undefined||this.graph.hasOverlappingScope(scope.resource,scope.pointer)||
            this.graph.literalContainer(scope.resource,scope.pointer)!==undefined)return;
        const prefix=this.prefix(scope,true),maximum=this.bounds.maximum(scope);
        if(prefix!==Infinity&&!(prefix!==undefined&&maximum!==undefined&&prefix>=maximum)&&
            !this.terms(scope,true)?.some(term=>term.guard===true&&term.item===true))return;
        discardInactiveMigrationSchema(this.graph,original,source,this.owners,references);
        const at=source.current(original.pointer,scope.resource);
        if(at!==undefined)this.owners.move(original,source,at,'covered_unevaluated_items',{context:this.graph,layout:'array-item'});
    }
    lower(scope:GraphScope,source:MigrationSource,pointer:string,target:string,defer:(apply:()=>void)=>void):boolean {
        const original={resource:scope.resource,pointer:scope.pointer+'/unevaluatedItems'},at=source.current(original.pointer,scope.resource);
        if(at!==pointer+'/unevaluatedItems'||!source.doc.dataNode(at)||this.graph.hasOverlappingScope(scope.resource,scope.pointer)||
            this.graph.literalContainer(scope.resource,scope.pointer)!==undefined)return false;
        const prefix=this.prefix(scope,true);
        if(prefix!==undefined&&this.lowerPrefix(scope,source,pointer,target,prefix,defer))return true;
        const terms=this.terms(scope,true);if(!terms||terms.length>128)return false;
        const covered=terms.some(term=>term.guard===true&&term.item===true);
        if(target==='2.0'&&!covered&&terms.some(term=>term.guard!==false))return false;
        const optional=[...new Map(terms.filter(term=>typeof term.guard!=='boolean').map(term=>[JSON.stringify(term.guard),term.guard])).values()];
        if(optional.length>8)return false;
        const owner=this.owners.move(original,source,at,'unevaluated_items',{context:this.graph,layout:'array-item'});
        defer(()=>{
            if(covered)return;
            const material=this.owners.uniqueLocation(scope),entry=material.source,base=material.location.pointer;
            const reference={$ref:this.owners.reference(owner,target)};
            for(let mask=0;mask<2**optional.length;mask++){
                const selected=new Map(optional.map((guard,index)=>[JSON.stringify(guard),(mask&(1<<index))!==0]));
                const active=terms.filter(term=>term.guard===true||typeof term.guard!=='boolean'&&selected.get(JSON.stringify(term.guard)));
                if(active.some(term=>term.item===true))continue;
                const predicates=active.map(term=>({$ref:this.owners.reference(this.owners.uniqueLocation(term.item as GraphScope).location,target)}));
                const item=predicates.length?{anyOf:[{not:{not:{anyOf:predicates}}},{allOf:[{not:{anyOf:predicates}},reference]}]}:reference;
                const guards=optional.map(guard=>selected.get(JSON.stringify(guard))?{not:{not:emitAnnotationGuard(guard,this.owners,target)}}:
                    {not:emitAnnotationGuard(guard,this.owners,target)});
                const assertion={items:item},collection=base+'/allOf';this.owners.admit(entry,3);
                if(!entry.doc.dataNode(collection))entry.set(collection,[]);
                const branch=collection+'/'+entry.doc.dataNode(collection)!.children.size;
                entry.set(branch,guards.length?{anyOf:[{not:{allOf:guards}},{allOf:[...guards,assertion]}]}:assertion);
                entry.presentationChanges.push(branch);
            }
        });
        return true;
    }
}
