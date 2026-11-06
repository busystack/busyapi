import {decimal} from './exact_numbers';
import {SourceError} from './document';
import {supportedSchemaDialect,type GraphScope,type ReferenceGraph} from './reference_graph';
import {projectSchemaReference} from './schema_reference_projection';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {MigrationPropertyPresence} from './migration_property_presence';

const metadata=new Set(['$id','$schema','$anchor','$dynamicAnchor']);
const jsonTypes=['null','boolean','object','array','number','integer','string'];

/** Draft 4's uniform items can constrain an unbounded modern tail when every
 * positional prefix already implies that constraint. Restrict this proof to
 * annotation-free type assertions: applying an annotated tail to the prefix
 * could change successful instance annotations even when assertions agree.
 * All other tail shapes retain the finite mapping or explicit missing proof.
 */
export function uniformTupleTail(graph:ReferenceGraph,initial:GraphScope,prefixes:readonly GraphScope[]):boolean {
    const assertions=new MigrationSchemaProofs(graph);
    if(assertions.annotationFree(initial)&&prefixes.every(prefix=>assertions.implies(prefix,initial)))return true;
    if(prefixes.every(prefix=>assertions.implies(prefix,initial)&&assertions.annotationsInactiveIn(initial,assertions.domains(prefix))))return true;
    const presence=new MigrationPropertyPresence(graph);
    const coverage=(prefix:GraphScope,tail:GraphScope,seen=new Set<string>()):boolean=>{
        if(assertions.annotationFree(tail))return true;
        const id=JSON.stringify([prefix.resource,prefix.pointer,tail.resource,tail.pointer]);
        if(seen.has(id)||seen.size>=128)return false;
        const value=graph.docs.get(tail.resource)!.dataNode(tail.pointer)?.value;
        if(!value||typeof value!=='object'||Array.isArray(value))return false;
        const parts=assertions.conjuncts(prefix),next=new Set(seen).add(id);
        for(const name of Object.keys(value)){
            if(metadata.has(name)||['type','required','minProperties','maxProperties'].includes(name))continue;
            if(['$ref','$dynamicRef'].includes(name)){
                const target=assertions.fixed(tail,name);if(!target||!coverage(prefix,target,next))return false;
            }else if(name==='allOf'){
                if(!value.allOf.every((_:unknown,index:number)=>{
                    const child=graph.scopeAs(tail.resource,tail.pointer+'/allOf/'+index,'schema');return child&&coverage(prefix,child,next);
                }))return false;
            }else if(name==='properties'){
                for(const key of Object.keys(value.properties)){
                    if(presence.absent(prefix,key))continue;
                    const child=graph.scopeAs(tail.resource,tail.pointer+'/properties/'+key.replace(/~/g,'~0').replace(/\//g,'~1'),'schema');
                    if(!child||!parts.some(part=>{
                        const source=graph.scopeAs(part.resource,part.pointer+'/properties/'+key.replace(/~/g,'~0').replace(/\//g,'~1'),'schema');
                        return source&&coverage(source,child,next);
                    }))return false;
                }
            }else if(name==='additionalProperties'&&typeof value.additionalProperties==='boolean'){
                if(value.additionalProperties&& !parts.some(part=>{
                    const schema=graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
                    return schema?.additionalProperties===false&&!schema.patternProperties;
                }))return false;
            }else return false;
        }
        return true;
    };
    if(assertions.annotationFree(initial,true)&&prefixes.every(prefix=>assertions.implies(prefix,initial)&&coverage(prefix,initial)))return true;
    let work=0;
    const inspect=(scope:GraphScope)=>{
        if(++work>20000){
            const range=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.range;
            throw new SourceError('limit.migration.tuple-tail','Uniform tail proof exceeds 20000 captured states',range,'unsupported',{...scope,range});
        }
    };
    const fixed=(scope:GraphScope,keyword:string):GraphScope|undefined=>{
        const reference=graph.referenceAs(scope.resource,scope.pointer,keyword,'schema'),projected=reference&&projectSchemaReference(reference);
        return projected?.state==='fixed'?graph.scopeAs(projected.target.resource,projected.target.pointer,'schema'):undefined;
    };
    const tail=(scope:GraphScope,active=new Set<string>()):ReadonlySet<string>|undefined=>{
        inspect(scope);const key=JSON.stringify([scope.resource,scope.pointer]);
        if(active.has(key)||active.size>=128||!supportedSchemaDialect(scope))return;
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(value===true)return new Set(jsonTypes);
        if(!value||typeof value!=='object'||Array.isArray(value))return;
        const fields=Object.keys(value).filter(name=>!metadata.has(name));
        if(!fields.length)return new Set(jsonTypes);
        if(fields.length!==1)return;
        if(fields[0]==='type'){
            const types=typeof value.type==='string'?[value.type]:value.type;
            return Array.isArray(types)&&types.every(type=>jsonTypes.includes(type))?new Set(types):undefined;
        }
        if(!['$ref','$dynamicRef'].includes(fields[0]))return;
        const target=fixed(scope,fields[0]);return target?tail(target,new Set(active).add(key)):undefined;
    };
    const types=tail(initial);if(!types)return false;
    const accepts=(type:string)=>types.has(type)||type==='integer'&&types.has('number');
    const implies=(scope:GraphScope,active=new Set<string>()):boolean=>{
        inspect(scope);const key=JSON.stringify([scope.resource,scope.pointer]);
        if(active.has(key)||active.size>=128||!supportedSchemaDialect(scope))return false;
        const doc=graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value;
        if(value===false)return true;
        if(!value||typeof value!=='object'||Array.isArray(value))return false;
        const next=new Set(active).add(key);
        if(graph.referenceObject(value,scope)){
            const target=fixed(scope,'$ref');return target!==undefined&&implies(target,next);
        }
        const local=typeof value.type==='string'?[value.type,...(scope.family==='3.0'&&value.nullable===true?['null']:[])]:value.type;
        if(Array.isArray(local)&&local.length&&local.every(accepts))return true;
        const literal=(pointer:string)=>{
            const node=doc.dataNode(pointer);if(!node)return false;
            let type=node.kind;
            if(typeof node.value==='number'){
                const number=decimal(doc.dataJson(pointer));
                type=number.coefficient===0n||number.exponent>=0n?'integer':'number';
            }
            return accepts(type);
        };
        if(Object.hasOwn(value,'const')&&literal(scope.pointer+'/const'))return true;
        if(Array.isArray(value.enum)&&value.enum.length&&value.enum.every((_:unknown,index:number)=>literal(scope.pointer+'/enum/'+index)))return true;
        for(const keyword of ['$ref','$dynamicRef']){
            const target=fixed(scope,keyword);if(target&&implies(target,next))return true;
        }
        const child=(keyword:string,index:number)=>graph.scopeAs(scope.resource,scope.pointer+'/'+keyword+'/'+index,'schema');
        if(Array.isArray(value.allOf)&&value.allOf.some((_:unknown,index:number)=>{
            const target=child('allOf',index);return target!==undefined&&implies(target,next);
        }))return true;
        for(const keyword of ['anyOf','oneOf'])if(Array.isArray(value[keyword])&&value[keyword].length&&value[keyword].every((_:unknown,index:number)=>{
            const target=child(keyword,index);return target!==undefined&&implies(target,next);
        }))return true;
        return false;
    };
    return jsonTypes.every(accepts)||prefixes.every(scope=>implies(scope));
}
