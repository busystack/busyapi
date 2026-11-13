import {segments,type SourceDocument} from './document';
import type {ReferenceGraph} from './reference_graph';

export const swaggerSchemaRulesRevision='1';

/** Swagger 2.0 §6.4.18 adopts Draft 4 §5.3.1.1 without a nonempty-tuple
 * requirement. For meta/shape checking only, the empty tuple has the same
 * unconstrained item semantics as {} (additionalItems is outside this subset).
 * Keep the pinned upstream schema and authored/runtime values unchanged.
 * Copy only paths affected by this first-party native rule. */
export function swaggerNativeMetaView(doc:SourceDocument,graph:ReferenceGraph,pointer='',value=doc.dataNode(pointer)?.value):any {
    type Changes=Map<string,Changes|null>;
    const changes:Changes=new Map();
    for(const scope of graph.scopesFor('schema')){
        if(scope.resource!==doc.id||scope.family!=='2.0'||
            scope.pointer!==pointer&&!scope.pointer.startsWith(pointer+'/'))continue;
        const original=doc.dataNode(scope.pointer)?.value;
        if(!original||graph.referenceObject(original,scope)||!Array.isArray(original.items)||original.items.length)continue;
        const keys=segments(scope.pointer.slice(pointer.length)+'/items');
        const represented=keys.reduce((item,key)=>item?.[key],value);
        if(!Array.isArray(represented)||represented.length)continue;
        let at=changes;
        for(const [index,key]of keys.entries()){
            if(index===keys.length-1)at.set(key,null);
            else{let child=at.get(key);if(!child){child=new Map();at.set(key,child);}at=child;}
        }
    }
    const apply=(source:any,selected:Changes):any=>{
        if(!selected.size)return source;
        const result=Array.isArray(source)?[...source]:{...source};
        for(const [key,child]of selected)result[key]=child===null?{}:apply(source[key],child);
        return result;
    };
    return apply(value,changes);
}
