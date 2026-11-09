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
    graph:ReferenceGraph,examples:CapturedExampleResources):Buffer|undefined {
    const selected=selectedExample(plan,status,actual,keys);
    if(selected?.external===undefined){
        if(!selected||typeof selected.raw!=='string')return;
        const kind=runtimeMediaKind(actual);
        if(!['xml','linkset','linkset-json'].includes(kind))return;
        if(selected.representation==='serialized')return runtimeMediaBytes(selected.raw,false);
        const media=capturedMockResponseMedia(plan,status,actual),schema=media&&schemaLocation(media.schema);
        return encodeRuntimeMedia(new SourceDocument(selected.raw,'urn:busyapi:mock-example',true,'json'),actual,false,schema?{graph,schema}:undefined);
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
