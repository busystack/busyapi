import {escape,SourceError} from './document';
import type {Resource} from './engine';
import {evaluateSchemas} from './schema_evaluation';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {MigrationSource} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {MigrationArrayBounds} from './migration_schema_arrays';
import {discardInactiveMigrationSchema} from './migration_schema_conditions';
import type {GraphReference} from './reference_graph';
import {restrictedBooleanSchema} from './migration_schema_values';
import {compare,decimal} from './exact_numbers';
import {schemaContext} from './schema_context';
import {migrationUnevaluatedMapping} from './migration_schema_unevaluated';
import type {ExternalExampleResourcePacket} from './external_examples';
import {modernFamily} from './specification';

/** Finite domains are exhaustive supersets, never a selection of samples.
 * The original captured evaluator filters them under the source dialect.
 * Limits abandon the proof; no finite cutoff is substituted for infinity. */
export class FiniteMigrationDomain {
    private work=0;
    private readonly proofs:MigrationSchemaProofs;
    constructor(private readonly graph:ReferenceGraph){this.proofs=new MigrationSchemaProofs(graph);}
    private bounded(values:string[]):string[]|undefined {
        if(values.length>2048||values.reduce((bytes,value)=>bytes+value.length,0)>8*1024*1024)return;
        return [...new Set(values)];
    }
    values(scope:GraphScope,active=new Set<string>()):string[]|undefined {
        const id=JSON.stringify([scope.resource,scope.pointer]);
        if(++this.work>50000||active.size>=128||active.has(id))return;
        const next=new Set(active).add(id),parts=this.proofs.conjuncts(scope);
        const value=(scope:GraphScope)=>this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        for(const part of parts){
            const doc=this.graph.docs.get(part.resource)!,schema=value(part);
            if(schema===false)return [];
            if(this.graph.referenceObject(schema,part))continue;
            if(Object.hasOwn(schema??{},'const'))return [doc.dataJson(part.pointer+'/const')];
            if(Array.isArray(schema?.enum))return this.bounded(schema.enum.map((_:unknown,index:number)=>doc.dataJson(part.pointer+'/enum/'+index)));
            if(schema?.type==='boolean')return ['false','true',...(part.family==='3.0'&&schema.nullable===true?['null']:[])];
            if(schema?.type==='null')return ['null'];
        }
        const finiteExtras=(kind:string)=>parts.flatMap(part=>{
            const type=value(part)?.type;
            if(type===kind&&part.family==='3.0'&&value(part).nullable===true)return ['null'];
            return Array.isArray(type)&&type.includes(kind)&&type.every(type=>[kind,'null','boolean'].includes(type))?
                [type.includes('null')?'null':undefined,...(type.includes('boolean')?['false','true']:[])].filter((item):item is string=>item!==undefined):[];
        });
        const typed=(kind:string)=>parts.some(part=>{
            if(this.graph.referenceObject(value(part),part))return false;
            const type=value(part)?.type;
            return type===kind||Array.isArray(type)&&type.includes(kind)&&type.every(type=>[kind,'null','boolean'].includes(type));
        });
        if(typed('integer')){
            let lower:bigint|undefined,upper:bigint|undefined;
            for(const part of parts){
                const doc=this.graph.docs.get(part.resource)!,schema=value(part);
                if(this.graph.referenceObject(schema,part))continue;
                for(const field of ['minimum','exclusiveMinimum','maximum','exclusiveMaximum']){
                    if(typeof schema?.[field]!=='number')continue;
                    const exact=decimal(doc.dataJson(part.pointer+'/'+field));
                    // Huge exponents cannot enter a bounded enumeration. A
                    // budget refusal is not an approximation to that domain.
                    if(exact.exponent>4096n||exact.exponent < -4096n)return;
                    const denominator=exact.exponent<0n?10n**(-exact.exponent):1n;
                    const numerator=exact.exponent>0n?exact.coefficient*10n**exact.exponent:exact.coefficient;
                    const quotient=numerator/denominator,remainder=numerator%denominator;
                    const floor=quotient-(remainder<0n?1n:0n),ceil=quotient+(remainder>0n?1n:0n);
                    const low=field==='minimum'||field==='exclusiveMinimum';
                    const strict=field.startsWith('exclusive')||schema[low?'exclusiveMinimum':'exclusiveMaximum']===true;
                    const bound=low?(strict?floor+1n:ceil):(strict?ceil-1n:floor);
                    if(low)lower=lower===undefined||bound>lower?bound:lower;
                    else upper=upper===undefined||bound<upper?bound:upper;
                }
            }
            if(lower!==undefined&&upper!==undefined){
                if(upper-lower>2047n)return;
                const literals:string[]=[];
                for(let item=lower;item<=upper;item++)literals.push(String(item));
                return this.bounded([...literals,...finiteExtras('integer')]);
            }
        }
        if(typed('string')&&parts.some(part=>!this.graph.referenceObject(value(part),part)&&value(part)?.maxLength===0))
            return ['""',...finiteExtras('string')];
        if(typed('number')){
            const lower=parts.find(part=>!this.graph.referenceObject(value(part),part)&&typeof value(part)?.minimum==='number');
            const upper=parts.find(part=>!this.graph.referenceObject(value(part),part)&&typeof value(part)?.maximum==='number');
            if(lower&&upper){
                const low=this.graph.docs.get(lower.resource)!.dataJson(lower.pointer+'/minimum');
                const high=this.graph.docs.get(upper.resource)!.dataJson(upper.pointer+'/maximum');
                if(compare(decimal(low),decimal(high))>=0)return this.bounded([low,...finiteExtras('number')]);
            }
        }
        const object=parts.some(part=>value(part)?.type==='object'||Array.isArray(value(part)?.type)&&
            value(part).type.includes('object')&&value(part).type.every(type=>['object','null','boolean'].includes(type)));
        if(object)for(const part of parts){
            const schema=value(part);
            if(schema?.additionalProperties!==false||schema.patternProperties)continue;
            let objects=['{}'];
            for(const name of Object.keys(schema.properties??{})){
                let candidates:string[]|undefined;
                for(const owner of parts){
                    const child=this.graph.scopeAs(owner.resource,owner.pointer+'/properties/'+escape(name),'schema');
                    if(child){candidates=this.values(child,next);if(candidates!==undefined)break;}
                }
                if(candidates===undefined)return;
                const products=[...objects];
                for(const original of objects)for(const item of candidates){
                    products.push(original.slice(0,-1)+(original==='{}'?'':',')+JSON.stringify(name)+':'+item+'}');
                    if(products.length>2048)return;
                }
                const bounded=this.bounded(products);if(!bounded)return;objects=bounded;
            }
            return this.bounded([...objects,...finiteExtras('object')]);
        }
        const array=parts.some(part=>value(part)?.type==='array'||Array.isArray(value(part)?.type)&&
            value(part).type.includes('array')&&value(part).type.every(type=>['array','null','boolean'].includes(type)));
        if(array){
            const maximum=new MigrationArrayBounds(this.graph).maximum(scope);if(maximum===undefined)return;
            let current=['[]'],arrays=['[]'];
            for(let index=0;index<maximum;index++){
                let candidates:string[]|undefined;
                for(const owner of parts){
                    const schema=value(owner),keyword=Array.isArray(schema?.prefixItems)?'prefixItems':Array.isArray(schema?.items)?'items':undefined;
                    const pointer=keyword&&index<schema[keyword].length?owner.pointer+'/'+keyword+'/'+index:
                        keyword==='items'?undefined:owner.pointer+(migrationUnevaluatedMapping(schema,'unevaluatedItems')==='local'?'/unevaluatedItems':'/items');
                    const child=pointer===undefined?undefined:schemaContext(this.graph,owner.resource,pointer);
                    if(child){candidates=this.values(child,next);if(candidates!==undefined)break;}
                }
                if(candidates===undefined)return;
                const products:string[]=[];
                for(const original of current)for(const item of candidates){
                    products.push(original.slice(0,-1)+(original==='[]'?'':',')+item+']');
                    if(products.length+arrays.length>2048)return;
                }
                current=products;arrays.push(...current);
                if(!current.length)break;
            }
            return this.bounded([...arrays,...finiteExtras('array')]);
        }
        for(const part of parts)for(const keyword of ['anyOf','oneOf'])if(Array.isArray(value(part)?.[keyword])){
            const all:string[]=[];let complete=true;
            for(let index=0;index<value(part)[keyword].length;index++){
                const child=this.graph.scopeAs(part.resource,part.pointer+'/'+keyword+'/'+index,'schema');
                const literals=child?this.values(child,next):undefined;
                if(literals===undefined){complete=false;break;}all.push(...literals);
            }
            if(complete)return this.bounded(all);
        }
    }
}

export async function migrateFiniteSchemaDomain(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,target:string,
    owners:MigrationSchemaOwners,references:readonly GraphReference[],resources:readonly Resource[],exampleResources:readonly ExternalExampleResourcePacket[],flatItems=false):Promise<boolean> {
    const doc=graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value,pointer=source.current(scope.pointer,scope.resource);
    if(pointer===undefined||!value||typeof value!=='object'||graph.referenceObject(value,scope))return false;
    if(graph.literalContainer(scope.resource,scope.pointer)!==undefined||graph.hasOverlappingScope(scope.resource,scope.pointer))return false;
    const localTail=migrationUnevaluatedMapping(value,'unevaluatedItems')==='local';
    if(source.doc.dataNode(pointer+'/unevaluatedProperties'))return false;
    const positional=target==='3.0'||target==='2.0'&&flatItems?(modernFamily(scope.family)&&Array.isArray(value.prefixItems)?'prefixItems':scope.family==='2.0'&&Array.isArray(value.items)?'items':undefined):undefined;
    const positionalFields=positional?[positional,...(positional==='prefixItems'?(Object.hasOwn(value,'items')?['items']:localTail?['unevaluatedItems']:[]):[])]:[];
    const dependencyFields=target==='2.0'&&modernFamily(scope.family)?['if','then','else','dependentRequired','dependentSchemas'].filter(field=>Object.hasOwn(value,field)):[];
    const containmentFields=modernFamily(scope.family)&&Object.hasOwn(value,'contains')?
        ['contains','minContains','maxContains'].filter(field=>Object.hasOwn(value,field)):[];
    const logicalFields=target==='2.0'?['anyOf','oneOf','not'].filter(field=>Object.hasOwn(value,field)):[];
    const evaluatedFields=modernFamily(scope.family)&&source.doc.dataNode(pointer+'/unevaluatedItems')&&!localTail?['unevaluatedItems']:[];
    const coveredConjunction=evaluatedFields.length&&Array.isArray(value.allOf)?['allOf']:[];
    // The exhaustive source evaluation covers their conjunction. Leaving a
    // pure conditional/dependency behind after folding positional assertions
    // would obstruct a finite language already proved by this same capture.
    const fields=[...new Set([...positionalFields.filter(field=>source.doc.dataNode(pointer+'/'+field)),...dependencyFields,...containmentFields,...logicalFields,...evaluatedFields,...coveredConjunction])];
    if(!fields.length)return false;
    if(fields.some(field=>source.doc.dataNode(pointer+'/'+field)===undefined))return false;
    const proofs=new MigrationSchemaProofs(graph),names=new Set(Object.keys(value.properties??{}));
    for(const field of fields){
        if(['dependentRequired','minContains','maxContains'].includes(field))continue;
        const node=doc.dataNode(scope.pointer+'/'+field)!;
        const schemas=['dependentSchemas','prefixItems','allOf','anyOf','oneOf'].includes(field)||field==='items'&&node.kind==='array'?
            [...node.children.keys()].map(key=>scope.pointer+'/'+field+'/'+escape(key)):[scope.pointer+'/'+field];
        const maximum=positional?new MigrationArrayBounds(graph).maximum(scope):undefined;
        for(const original of schemas){
            if(positional&&positionalFields.includes(field)&&maximum!==undefined&&(
                field===positional&&Number(original.slice(original.lastIndexOf('/')+1))>=maximum||
                field!==positional&&maximum<=value[positional].length))continue;
            const schema=graph.scopeAs(scope.resource,original,'schema');
            if(!schema||!(field==='allOf'?proofs.annotationsCoveredByItems(schema):
                positional||field==='contains'||field==='unevaluatedItems'||logicalFields.includes(field)?proofs.annotationFree(schema):proofs.annotationsCoveredByProperties(schema,names)))return false;
        }
    }
    // Without an explicit tail, source coverage ends at the last prefix. The
    // uniform target coverage is safe only when no accepted array reaches it.
    if(positional==='prefixItems'&&!Object.hasOwn(value,'items')&&!localTail){
        const maximum=new MigrationArrayBounds(graph).maximum(scope);
        if(maximum===undefined||maximum>value.prefixItems.length)return false;
    }
    const candidates=new FiniteMigrationDomain(graph).values(scope);if(candidates===undefined)return false;
    const capture=resources.filter(resource=>graph.docs.has(resource.id)).map(resource=>({...resource,text:graph.docs.get(resource.id)!.text}));
    const range=doc.dataNode(scope.pointer)!.range;
    if((capture.reduce((bytes,resource)=>bytes+resource.text.length,0)+exampleResources.reduce((bytes,resource)=>bytes+(resource.state==='available'?resource.byteLength:0),0))*Math.ceil(candidates.length/4)>128*1024*1024)
        throw new SourceError('limit.migration.finite-work','Exhaustive finite-domain evaluation exceeds its captured-source work budget',range,'unsupported',{...scope,range});
    const accepted:string[]=[];
    // Small independent batches preserve complete native diagnostics, including
    // negative instances, without treating a truncated finding list as proof.
    for(let offset=0;offset<candidates.length;offset+=4){
        const batch=candidates.slice(offset,offset+4),checked=await evaluateSchemas({root:graph.root,snapshot:'migration-finite-source:'+offset,
            resources:capture,exampleResources,runtimeInstances:['request-body','response-body'].flatMap(subject=>batch.map(text=>({subject,location:'finite-domain',text,
                schema:{resource:scope.resource,pointer:scope.pointer}}))),
        });
        if(!checked.complete||checked.findings.some(value=>value.severity==='error')||checked.runtimeEvaluations.length!==batch.length*2||checked.runtimeEvaluations.some(value=>!value.complete))
            throw new SourceError('migration.proof.finite-incomplete','The exhaustive finite-domain source evaluation did not complete',range,'unsupported',{...scope,range});
        for(const [index,text]of batch.entries()){
            const request=checked.runtimeEvaluations[index].valid,response=checked.runtimeEvaluations[index+batch.length].valid;
            if(request!==response)return false;
            if(response)accepted.push(text);
        }
    }
    const retire=(original:string)=>{
        const material=source.current(original,scope.resource);if(material===undefined||!material.startsWith(pointer+'/'))return;
        // An enclosing unevaluatedItems projection can consume the original
        // contains predicate even when no authored $ref enters it directly.
        // Keep that predicate in the common allocator through finite folding.
        if(original===scope.pointer+'/contains'){
            owners.move({resource:scope.resource,pointer:original},source,material,'finite_contains',{context:graph,layout:'array-item'});return;
        }
        discardInactiveMigrationSchema(graph,{resource:scope.resource,pointer:original},source,owners,references);
        const current=source.current(original,scope.resource);
        if(current!==undefined)owners.move({resource:scope.resource,pointer:original},source,current,'finite_schema',{context:graph,layout:'array-item'});
    };
    for(const field of fields){
        const original=scope.pointer+'/'+field;
        if(['dependentRequired','minContains','maxContains'].includes(field)){
            const current=source.current(original,scope.resource);if(current!==undefined)owners.retainLiteralValue({resource:scope.resource,pointer:original},source,current,'dependency_names');
        }else if(['dependentSchemas','prefixItems','allOf','anyOf','oneOf'].includes(field)||field==='items'&&doc.dataNode(original)?.kind==='array'){
            for(const key of doc.dataNode(original)!.children.keys())
                retire(original+'/'+escape(key));
            const current=source.current(original,scope.resource);if(current!==undefined)source.remove(current,true,true,true);
        }else retire(original);
    }
    const collection=pointer+'/allOf';owners.admit(source,3);
    if(!source.doc.dataNode(collection))source.set(collection,[]);
    const branch=collection+'/'+source.doc.dataNode(collection).children.size;
    if(accepted.length)source.exact(branch,'{"enum":['+accepted.join(',')+']}');
    else source.set(branch,restrictedBooleanSchema(false,target));
    // A successful unevaluatedItems application finishes coverage of every
    // present item. Scalar, annotation-free U schemas may therefore fold with
    // the exhaustive assertion while the target retains complete coverage.
    if(positional||evaluatedFields.length)source.set(pointer+'/items',{});
    return true;
}
