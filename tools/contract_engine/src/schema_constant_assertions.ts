import {SourceError} from './document';
import {supportedSchemaDialect,type GraphScope,type ReferenceGraph} from './reference_graph';
import {projectSchemaReference} from './schema_reference_projection';

/** Three-valued, annotation-free truth proof over captured applicators. Unknown
 * assertions/dialects, cycles and genuine dynamic choice do not establish truth.
 * This proves constants; it is neither sample evaluation nor satisfiability.
 * Resource metadata itself does not produce instance annotations (Core §8).
 */
export function constantSchemaAssertion(graph:ReferenceGraph,initial:GraphScope):boolean|undefined {
    const active=new Set<string>(),proved=new Map<string,boolean>();let work=0;
    const visit=(scope:GraphScope,depth:number):boolean|undefined=>{
        if(++work>20000||depth>128){
            const range=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.range;
            throw new SourceError('limit.schema.constant','Constant-assertion proof exceeds 20000 states or 128 captured levels',range,'unsupported',
                {resource:scope.resource,pointer:scope.pointer,range});
        }
        const key=JSON.stringify([scope.resource,scope.pointer]);
        if(proved.has(key))return proved.get(key);
        if(active.has(key)||!supportedSchemaDialect(scope))return;
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(typeof value==='boolean')return value;
        if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(name=>
            !['$id','$schema','$anchor','$dynamicAnchor','$ref','$dynamicRef','allOf','anyOf','oneOf','not'].includes(name)))return;
        active.add(key);
        try {
            const assertions:(boolean|undefined)[]=[];
            for(const keyword of ['$ref','$dynamicRef'])if(Object.hasOwn(value,keyword)){
                const reference=graph.referenceAs(scope.resource,scope.pointer,keyword,'schema');
                const projected=reference&&projectSchemaReference(reference);
                const target=projected?.state==='fixed'&&graph.scopeAs(projected.target.resource,projected.target.pointer,'schema');
                assertions.push(target?visit(target,depth+1):undefined);
            }
            const child=(pointer:string)=>{
                const target=graph.scopeAs(scope.resource,pointer,'schema');return target?visit(target,depth+1):undefined;
            };
            for(const keyword of ['allOf','anyOf','oneOf'])if(Object.hasOwn(value,keyword)){
                if(!Array.isArray(value[keyword]))return;
                const choices=value[keyword].map((_:unknown,index:number)=>child(scope.pointer+'/'+keyword+'/'+index));
                assertions.push(choices.some(value=>value===undefined)?undefined:keyword==='allOf'?choices.every(Boolean):
                    keyword==='anyOf'?choices.some(Boolean):choices.filter(Boolean).length===1);
            }
            if(Object.hasOwn(value,'not')){
                const result=child(scope.pointer+'/not');assertions.push(result===undefined?undefined:!result);
            }
            if(assertions.some(value=>value===undefined))return;
            const result=assertions.every(Boolean);proved.set(key,result);return result;
        }finally{active.delete(key);}
    };
    return visit(initial,0);
}
