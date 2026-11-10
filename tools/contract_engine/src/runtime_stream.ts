import {SourceError} from './document';
import {runtimeMediaKind,decodeRuntimeMedia} from './runtime_media';
import {runtimeBinaryMedia} from './runtime_binary';
import {mimeBoundary,mimeDelimiter,mimeParts,mimeSingleton} from './mime_parts';

export const streamRevision='2';
export const streamRecordLimit=16*1024*1024;
import {sseLine,type SseState} from './runtime_sse';
export type StreamState={version:1;mediaType:string;buffer:string;index:number;bytes:number;offset:number;started:boolean;closed:boolean;scan:number;awaitRs?:boolean;ended?:boolean;lex?:{depth:number;quoted:boolean;escaped:boolean;started:boolean};eventStart?:number;sequence?:number;nested?:{state?:StreamState;processed:number;type:string;header:string};sse:SseState};
export type StreamFrame={index:number;offset:number;bytes:number;path?:number[];text?:string;mime?:string;error?:{code:string;message:string;kind?:string}};
export function streamingMedia(type:string):boolean {return ['json-lines','json-sequence','event-stream'].includes(runtimeMediaKind(type))||type.split(';')[0].trim().toLowerCase().startsWith('multipart/')||runtimeBinaryMedia(type);}
/** Stateless bounded continuation: no worker affinity, resource acquisition,
 * global stream cache or complete-body buffering. Core owns the continuation. */
export function frameStream(mediaType:string,previous:StreamState|undefined,chunk:Buffer,end=false,maximumRecords=128,depth=0){
 if(depth>8)throw new SourceError('limit.stream.mime.depth','Nested stream framing exceeds eight levels');
 if(!Number.isInteger(maximumRecords)||maximumRecords<1||maximumRecords>128)throw new SourceError('runtime.stream.input','Expected at most 128 records per batch');
 if(chunk.length>65536)throw new SourceError('limit.stream.chunk','Stream chunks must be at most 64 KiB');
 if(previous&&(previous.version!==1||previous.mediaType!==mediaType||!Number.isSafeInteger(previous.index)||previous.index<0||!Number.isSafeInteger(previous.bytes)||previous.bytes<0||typeof previous.buffer!=='string'||previous.buffer.length>24*1024*1024||!Number.isSafeInteger(previous.offset)||previous.offset<0||!Number.isSafeInteger(previous.scan)||previous.scan<0||typeof previous.started!=='boolean'||typeof previous.closed!=='boolean'||!previous.sse||!Array.isArray(previous.sse.data)||previous.sse.data.length>65536||previous.sse.data.some(value=>typeof value!=='string')))throw new SourceError('runtime.stream.state','Malformed stream continuation');
 if(previous?.ended&&(chunk.length>0||!end))throw new SourceError('runtime.stream.closed','The stream continuation is already complete');
 const state:StreamState=previous?{...previous,lex:previous.lex?{...previous.lex}:undefined,nested:previous.nested?{...previous.nested}:undefined,sse:{...previous.sse,data:[...previous.sse.data]}}:{version:1,mediaType,buffer:'',index:0,bytes:0,offset:0,started:false,closed:false,scan:0,sse:{data:[]}};
 let bytes=Buffer.concat([Buffer.from(state.buffer,'base64'),chunk]);state.bytes+=chunk.length;
 const records:StreamFrame[]=[],kind=runtimeMediaKind(mediaType),multipart=mediaType.split(';')[0].trim().toLowerCase().startsWith('multipart/');
 const consume=(count:number)=>{bytes=bytes.subarray(count);state.offset+=count;state.scan=0;};
 const emit=(wire:Buffer,length:number,mime=false)=>{
  const frame:StreamFrame={index:state.index++,offset:state.offset,bytes:length};
  if(mime){frame.path=[frame.index];frame.index=state.sequence??0;state.sequence=frame.index+1;}
  try{
   if(mime){mimeParts(wire,mediaType);frame.mime=wire.toString('base64');}
   else {const decoded=decodeRuntimeMedia(wire.toString('base64'),'urn:busyapi:stream-item',mediaType,true);if(decoded.items?.length!==1)throw new SourceError('runtime.stream.record','A completed record must contain one item');frame.text=decoded.items[0].dataJson('');}
  }catch(error){if(!(error instanceof SourceError))throw error;frame.error={code:error.code,message:error.message,kind:error.kind};}
  records.push(frame);
 };
 let failure:{code:string;message:string;kind?:string}|undefined;
 try{
 if(runtimeBinaryMedia(mediaType)){consume(bytes.length);state.started=true;state.closed=end;}
 else if(multipart){
  const {marker}=mimeBoundary(mediaType);
  const children=(endOffset:number,ended:boolean)=>{
   const headerEnd=bytes.indexOf(Buffer.from('\r\n\r\n'));
   if(headerEnd<0||headerEnd>16384||headerEnd+4>endOffset)return false;
   if(!state.nested){
    const head=bytes.subarray(0,headerEnd),sample=Buffer.concat([marker,Buffer.from('\r\n'),head,Buffer.from('\r\n\r\n\r\n'),marker,Buffer.from('--\r\n')]);
    const type=mimeSingleton(mimeParts(sample,mediaType)[0].headers,'content-type');
    if(!type?.toLowerCase().startsWith('multipart/'))return false;
    state.nested={processed:0,type,header:head.toString('base64')};
   }
   const child=state.nested,bodyOffset=headerEnd+4;let added=bytes.subarray(bodyOffset+child.processed,endOffset);
   do{
    const chunk=added.subarray(0,65536),last=chunk.length===added.length;
    const next=frameStream(child.type,child.state,chunk,ended&&last,maximumRecords-records.length,depth+1);
    child.state=next.state;child.processed+=chunk.length;added=added.subarray(chunk.length);
    for(const record of next.records){
     const path=[state.index,...(record.path??[record.index])],index=state.sequence??0;state.sequence=index+1;
     records.push({...record,index,path,offset:state.offset+bodyOffset+record.offset,...(record.mime?{mime:Buffer.concat([marker,Buffer.from('\r\n'),Buffer.from(child.header,'base64'),Buffer.from('\r\n\r\n'),Buffer.from(record.mime,'base64'),Buffer.from('\r\n'),marker,Buffer.from('--\r\n')]).toString('base64')}:{})});
    }
    if(next.failure){failure=next.failure;return true;}
    if(records.length===maximumRecords)return true;
    if(!added.length&&!next.pending)break;
   }while(true);
   return false;
  };
  while(!state.closed&&records.length<maximumRecords){
   const next=mimeDelimiter(bytes,marker,state.started?maxScan(state.scan,marker.length):0,end);
   if(!next){
    if(state.started){
     let safe=bytes.length;const line=bytes.lastIndexOf(Buffer.from('\r\n'));
     if(line>=0){const tail=bytes.subarray(line+2);if(tail.length===0||marker.subarray(0,tail.length).equals(tail)||tail.subarray(0,marker.length).equals(marker))safe=line;}
     if(bytes.at(-1)===13)safe=Math.min(safe,bytes.length-1);
     if(children(safe,false))break;
    }
    state.scan=Math.max(0,bytes.length-marker.length-8192);break;
   }
   if(!state.started){if(next.closed)throw new SourceError('runtime.form.syntax','A multipart stream needs at least one part');consume(next.after);state.started=true;continue;}
   if(next.at<2)throw new SourceError('runtime.form.syntax','A MIME part omitted its delimiter CRLF');
   if(children(next.at-2,true))break;
   const part=bytes.subarray(0,next.at-2),wire=Buffer.concat([marker,Buffer.from('\r\n'),part,Buffer.from('\r\n'),marker,Buffer.from('--\r\n')]);
   emit(wire,next.at,true);consume(next.after);delete state.nested;state.closed=next.closed;
  }
  if(state.closed)consume(bytes.length);else if(end&&!failure&&records.length<maximumRecords)throw new SourceError('runtime.stream.truncated','Multipart stream ended without its closing delimiter');
 }else if(kind==='json-lines'){
  while(records.length<maximumRecords){const at=bytes.indexOf(10,state.scan);if(at<0){state.scan=bytes.length;break;}const record=bytes.subarray(0,at+1);emit(record,record.length);consume(record.length);}
  if(end&&bytes.length&&records.length<maximumRecords){emit(bytes,bytes.length);consume(bytes.length);}state.closed=end&&bytes.length===0;
 }else if(kind==='json-sequence'){
  // Lexical state finds record boundaries; the shared finite decoder remains
  // the sole JSON parser. Pretty-printed records are parsed once, not at every
  // interior LF, and quotes/escapes survive arbitrary transport boundaries.
  sequence:while(bytes.length&&records.length<maximumRecords){
   if(!state.started||state.awaitRs){
    if(bytes[0]===30){consume(1);state.started=true;state.awaitRs=false;delete state.lex;continue;}
    if(state.awaitRs&&[9,10,13,32].includes(bytes[0])){consume(1);continue;}
    throw new SourceError('runtime.media.syntax','A JSON sequence record requires RS');
   }
   const lex=state.lex??={depth:0,quoted:false,escaped:false,started:false};
   for(let at=state.scan;at<bytes.length;at++){
    const byte=bytes[at];
    if(byte===30){if(at>0)emit(Buffer.concat([Buffer.from([30]),bytes.subarray(0,at)]),at);consume(at+1);delete state.lex;continue sequence;}
    if(lex.quoted){if(lex.escaped)lex.escaped=false;else if(byte===92)lex.escaped=true;else if(byte===34)lex.quoted=false;}
    else {
     if(![9,10,13,32].includes(byte))lex.started=true;
     if(byte===34)lex.quoted=true;else if(byte===123||byte===91)lex.depth++;else if(byte===125||byte===93)lex.depth--;
     if(lex.depth>128)throw new SourceError('limit.stream.depth','A JSON sequence record exceeds 128 levels');
    }
    if(byte===10&&lex.started&&!lex.quoted&&lex.depth<=0){const length=at+1;emit(Buffer.concat([Buffer.from([30]),bytes.subarray(0,length)]),length);consume(length);delete state.lex;state.awaitRs=true;continue sequence;}
   }
   state.scan=bytes.length;
   if(end){emit(Buffer.concat([Buffer.from([30]),bytes]),bytes.length);consume(bytes.length);delete state.lex;}break;
  }state.closed=end&&bytes.length===0;
 }else if(kind==='event-stream'){
  if(!state.started){if(bytes.length<3&&!end){state.buffer=bytes.toString('base64');return {state,records,failure:undefined,pending:false};}if(bytes.subarray(0,3).equals(Buffer.from([239,187,191])))consume(3);state.started=true;}
  while(records.length<maximumRecords){let at=state.scan;while(at<bytes.length&&bytes[at]!==10&&bytes[at]!==13)at++;if(at===bytes.length||bytes[at]===13&&at+1===bytes.length&&!end){state.scan=at;break;}
   const length=at+(bytes[at]===13&&bytes[at+1]===10?2:1),line=new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes.subarray(0,at)),text=sseLine(state.sse,line);
   if(text!==undefined)records.push({index:state.index++,offset:state.eventStart??0,bytes:state.offset+length-(state.eventStart??0),text});if(line==='')state.eventStart=state.offset+length;consume(length);
  }
  if(end&&records.length<maximumRecords){consume(bytes.length);state.sse.data=[];delete state.sse.event;state.closed=true;}
 }else throw new SourceError('runtime.stream.unsupported','The media representation has no incremental framing',[0,0],'unsupported');
 }catch(error){if(!(error instanceof SourceError))throw error;failure={code:error.code,message:error.message,kind:error.kind};}
 const retained=bytes.length+state.sse.data.reduce((n,value)=>n+Buffer.byteLength(value)+1,0)+(state.sse.event?.length??0)+(state.sse.id?.length??0)+(state.sse.retry?.length??0);
 if(retained>streamRecordLimit||state.sse.data.length>65536){failure={code:'limit.stream.record',message:'An unfinished stream record exceeds 16 MiB',kind:'unsupported'};bytes=Buffer.alloc(0);state.sse={data:[]};delete state.nested;}
 if(!Number.isSafeInteger(state.bytes)||!Number.isSafeInteger(state.index))throw new SourceError('limit.stream.count','Stream counters exceed exact integer range');
 const pending=!failure&&records.length===maximumRecords&&bytes.length>0;state.ended=end&&!pending&&!failure;
 state.buffer=bytes.toString('base64');return {state,records,failure,pending};
}
const maxScan=(scan:number,marker:number)=>Math.max(0,scan-marker);
