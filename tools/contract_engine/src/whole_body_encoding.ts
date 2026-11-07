import type {GraphTarget,ReferenceGraph} from './reference_graph';
import {FormSemantics} from './form_semantics';
import {MultipartEncoding} from './multipart_encoding';
import {SourceError} from './document';

/** OAS 3.1.2 §4.4.2: an explicitly modeled encoded string is distinct
 * from an unencoded entity. Reuse captured same-instance annotation discovery;
 * neither HTTP Content-Encoding nor an opaque media label establishes base64.
 * This describes the wire string, and never decodes its annotated contents. */
export function wholeBodyEncoding(graph:ReferenceGraph,schema:GraphTarget):string|undefined {
    const shape=new FormSemantics(graph).shape(schema.resource,schema.pointer);
    if(!shape.types?.includes('string'))return;
    const encoding=new MultipartEncoding(graph).schemaPathEncoding(schema,[],undefined,false,true).encoding;
    if(encoding!==undefined&&shape.types.some(type=>!['string','null'].includes(type))){
        const range=graph.docs.get(schema.resource)!.dataNode(schema.pointer)!.range;
        throw new SourceError('runtime.body.encoding.unsupported','The opaque body has competing string and structured representations without a captured wire binding',range,'unsupported',{...schema,range});
    }
    return encoding;
}
