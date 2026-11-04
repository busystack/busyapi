import {decimal} from './exact_numbers';
import {SourceError} from './document';
import {supportedSchemaDialect,type GraphScope,type ReferenceGraph} from './reference_graph';
import {projectSchemaReference} from './schema_reference_projection';

const metadata=new Set(['$id','$schema','$anchor','$dynamicAnchor']);
const jsonTypes=['null','boolean','object','array','number','integer','string'];

/** Draft 4's uniform items can constrain an unbounded modern tail when every
 * positional prefix already implies that constraint. Restrict this proof to
 * annotation-free type assertions: applying an annotated tail to the prefix
 * could change successful instance annotations even when assertions agree.
 * All other tail shapes retain the finite mapping or explicit missing proof.
 */
export function uniformTupleTail(graph:ReferenceGraph,initial:GraphScope,prefixes:readonly GraphScope[]):boolean {
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
