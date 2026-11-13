import {escape,type SourceDocument} from './document';
import type {ReferenceGraph} from './reference_graph';

export const swaggerSchemaRulesRevision='1';

/** Swagger 2.0 §6.4.18 adopts Draft 4 §5.3.1.1 without a nonempty-tuple
 * requirement. For meta/shape checking only, the empty tuple has the same
 * unconstrained item semantics as {} (additionalItems is outside this subset).
 * Keep the pinned upstream schema and authored/runtime values unchanged.
 * Copy only affected branches of the value being checked. */
export function swaggerNativeMetaView(doc:SourceDocument,graph:ReferenceGraph,pointer='',value=doc.dataNode(pointer)?.value):any {
    const project=(value:any,at:string):any=>{
        if(value===null||typeof value!=='object')return value;
        const scope=graph.scopeAs(doc.id,at,'schema');
        const emptyTuple=scope?.family==='2.0'&&!graph.referenceObject(value,scope)&&Array.isArray(value.items)&&!value.items.length;
        let changed:any;
        for(const [name,child]of Object.entries(value)){
            const next=emptyTuple&&name==='items'?{}:project(child,at+'/'+escape(name));
            if(next===child)continue;
            changed??=Array.isArray(value)?[...value]:{...value};
            Object.defineProperty(changed,name,{value:next,enumerable:true,writable:true,configurable:true});
        }
        return changed??value;
    };
    return project(value,pointer);
}
