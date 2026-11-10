import {encodePlainText} from './text_encoding';
import {runtimeBinaryMedia} from './runtime_binary';
import {embeddedMimeTextBytes} from './embedded_mime_text';
import {rawXmlBytes} from './xml_wire';
import {mediaTypes} from './media_types';
import {encodeRuntimeMedia,runtimeMediaKind,runtimeMediaBytes} from './runtime_media';
import {schemaLocation} from './mock_projection';
import {SourceDocument,SourceError} from './document';
import {capturedMockResponseMedia,sourceLocation} from './mock_projection';
import type {ReferenceGraph} from './reference_graph';
import type {CapturedExampleResources} from './external_examples';
import {record} from './engine_worker_client';

function selectedExample(plan:unknown,status:string,actual:string,keys:readonly string[]):Record<string,unknown>|undefined {
    const media=capturedMockResponseMedia(plan,status,actual);
    if(!media)return;
    const examples=media.examples.filter(value=>value.origin!=='schema');
    const direct=examples.find(value=>value.name===undefined);
    return direct??keys.map(key=>examples.find(value=>value.name===key)).find(value=>value!==undefined);
}

/** OAS 3.0 §4.7.14 / 3.1 §4.8.14: media examples override schema examples.
 * Keep the pinned negotiator's choice and ordering among actual media examples, while
 * excluding its synthesized schema default. The original CST supplies bytes;
 * the existing response validator still checks the resulting representation. */
export function authoredMockResponseExample(plan:unknown,status:string,actual:string,keys:readonly string[]):string|undefined {
    const selected=selectedExample(plan,status,actual,keys);
    if(!selected)return;
    if(typeof selected.raw!=='string'||!sourceLocation(selected.source))
        throw new SourceError('mock.validation.protocol','The authored response example omitted its captured value or source');
    return selected.raw;
}

/** External examples are serialized entity bytes. Recover the approved owner
 * through the actual Example Object occurrence; a projected URI/base64 alone
 * cannot authorize acquisition or supply an invented media interpretation. */
export function authoredMockResponseBytes(plan:unknown,status:string,actual:string,keys:readonly string[],
    graph:ReferenceGraph,examples:CapturedExampleResources,wireMedia?:(bytes:Buffer,type:string)=>void):Buffer|undefined {
    const selected=selectedExample(plan,status,actual,keys);
    if(selected?.external===undefined){
        if(!selected||typeof selected.raw!=='string')return;
        const kind=runtimeMediaKind(actual);
        if(kind==='text'||kind==='opaque'&&runtimeBinaryMedia(actual)){
            const value=selected.representation==='serialized'?selected.raw:JSON.parse(selected.raw);
            if(typeof value!=='string'){const source=sourceLocation(selected.source);throw new SourceError('mock.example.representation','The authored example has no supported string or byte representation',source?.range??[0,0],'unsupported',source);}
            if(kind==='text'){const encoded=encodePlainText(value,actual,mediaTypes(actual,false)[0].parameters.get('charset'));wireMedia?.(encoded.bytes,encoded.contentType);return encoded.bytes;}
            return runtimeMediaBytes(value,false);
        }
        if(actual.split(';')[0].trim().toLowerCase().startsWith('multipart/')&&selected.representation==='serialized'){
            const source=sourceLocation(selected.source);
            return source?.pointer.endsWith('/serializedValue')?runtimeMediaBytes(selected.raw,false):embeddedMimeTextBytes(selected.raw,actual);
        }
        if(!['xml','linkset','linkset-json','json-lines','json-sequence','event-stream'].includes(kind))return;
        if(selected.representation==='serialized')return kind==='xml'?rawXmlBytes(selected.raw,mediaTypes(actual,false)[0].parameters.get('charset')):runtimeMediaBytes(selected.raw,false);
        return; // Structured values pass through asynchronous canonical preparation.

    }
    if(!record(selected.external))throw new SourceError('mock.validation.protocol','The external response example omitted its captured byte identity');
    const source=sourceLocation(selected.source);
    if(!source)throw new SourceError('mock.validation.protocol','The captured external example omitted its native source');
    const captured=examples.read(graph,source.resource,source.pointer);
    if(selected.external.resource!==captured.id||selected.external.identity!==captured.identity||
        selected.external.byteLength!==captured.byteLength||selected.wireBase64!==captured.base64)
        throw new SourceError('mock.validation.protocol','The response example differs from its approved captured byte owner');
    return Buffer.from(captured.base64,'base64');
}
