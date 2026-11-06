import {escape,SourceError} from './document';
import type {GraphScope,GraphTarget,ReferenceGraph} from './reference_graph';

export type PropertyAccess=Readonly<{readOnly:boolean;writeOnly:boolean}>;
const unmarked:PropertyAccess={readOnly:false,writeOnly:false};

/** A migration may assume presence without selecting a direction only when
 * the owning family's required rule applies in both request and response. */
export function requiredInBothDirections(graph:ReferenceGraph,scope:GraphScope,name:string):boolean {
    if(scope.family!=='2.0'&&scope.family!=='3.0')return true;
    const access=propertyAccess(graph,scope,name);
    return !access.readOnly&&(scope.family!=='3.0'||!access.writeOnly);
}

/** Legacy Schema Object references replace their occurrence and ignore
 * siblings. Access flags belong to that resolved property schema, including
 * when its physical definition is outside a properties map (2.0 §6.4.18.1;
 * 3.0 §4.7.24.2). This does not apply modern annotation/required semantics. */
export function propertyAccess(graph:ReferenceGraph,owner:GraphTarget,name:string):PropertyAccess {
    let target=graph.scopeAs(owner.resource,owner.pointer+'/properties/'+escape(name),'schema');
    const seen=new Set<string>();
    while(target){
        const identity=target.resource+'#'+target.pointer;
        if(seen.has(identity))return unmarked;
        if(seen.size>=128)throw new SourceError('limit.schema.access','Property access reference inspection exceeds its bounded depth');
        seen.add(identity);
        const value=graph.docs.get(target.resource)?.dataNode(target.pointer)?.value;
        if(typeof value?.$ref!=='string')return {readOnly:value?.readOnly===true,writeOnly:value?.writeOnly===true};
        const resolved=graph.resolveReference(value.$ref,target);
        if(resolved.resolution!=='resolved')throw new SourceError('schema.access.reference','Property access annotations require a resolved schema reference',undefined,'unsupported');
        target=graph.scopeAs(resolved.targetResource!,resolved.targetPointer!,'schema');
    }
    return unmarked;
}
