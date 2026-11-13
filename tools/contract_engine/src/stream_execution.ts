import {createGraph} from './engine';
import {requestOperation} from './execution';
import {SourceDocument,SourceError} from './document';
import {frameStream,streamingMedia,streamRevision,type StreamState} from './runtime_stream';
import {runtimeBinaryMedia} from './runtime_binary';
import {selectNativeMedia} from './mock_projection';
import {evaluateSchemas,schemaProducer} from './schema_evaluation';
import {runtimeMediaBytes} from './runtime_media';

/** One immutable semantic capture and one mutable framer belong to a stream.
 * Continuations contain new bytes only; original sources stay in this worker. */
class ResponseStream {
 readonly context:ReturnType<typeof createGraph>;
 readonly plan:ReturnType<typeof requestOperation>;
 readonly media:any;
 readonly base:any;
 state?:StreamState;
 busy?:Promise<any>;
 closed=false;
 readonly retained:number;
 constructor(readonly capture:any){
  this.context=createGraph(capture);this.plan=requestOperation(capture,this.context);
  const declaration=this.plan.responses.find(item=>item.status===String(capture.status))??this.plan.responses.find(item=>item.status===String(capture.status)[0]+'XX')??this.plan.responses.find(item=>item.status==='default');
  this.media=declaration&&selectNativeMedia<any>(declaration.content,capture.mediaType);
  this.base={version:1,revision:streamRevision,stream:capture.stream,snapshot:capture.snapshot,identity:this.plan.identity,producer:schemaProducer.name,producerVersion:schemaProducer.version,configuration:schemaProducer.configuration};
  this.retained=capture.resources.reduce((bytes:number,resource:any)=>bytes+resource.text.length*2,0);
 }
 async chunk(input:any){
 const {capture,context,plan,media,base}=this;
 if(!media||!streamingMedia(capture.mediaType))return {...base,supported:false};
 const framed=frameStream(capture.mediaType,this.state,runtimeMediaBytes(input.text,true),input.end,input.maximumRecords??128),instances:any[]=[],binary=runtimeBinaryMedia(capture.mediaType);
 this.state=framed.state;
 const itemSchema=media.family==='3.2'?media.itemSchema:undefined;
 for(const record of framed.records){
  if(record.error)continue;
  const location='stream:'+record.index;
  if(record.mime!==undefined)instances.push({subject:'response-body',location,text:record.mime,mediaBase64:true,mediaType:capture.mediaType,form:{...media.definition,streamIndex:record.path?.[0]??record.index,streamPath:record.path},schema:media.schema,...((record.path?.length??1)===1?{itemSchema}:{}),captureData:true});
  else instances.push({subject:'response-item',location,text:record.text,...(itemSchema?{schema:itemSchema}:{})});
 }
 const rawBinary=binary&&['3.1','3.2'].includes(media.family)&&media.schema;
 // Even a byte-length schema can be non-monotone under not/alternatives.
 // Retain exact cumulative provenance, but evaluate the original whole schema
 // only at EOF; a short prefix must not create a permanent false violation.
 const binaryEnded=input.end&&framed.state.closed&&!framed.pending;
 if(rawBinary&&binaryEnded)instances.push({subject:'response-body',location:'stream:binary',text:'',mediaType:capture.mediaType,schema:media.schema,rawByteLength:framed.state.bytes});
 const checked=instances.length?await evaluateSchemas({...capture,runtimeInstances:instances},undefined,context):undefined;
 const records=framed.records.map(record=>{
  const evaluations=checked?.runtimeEvaluations.filter(value=>value.location==='stream:'+record.index)??[];
  const findings=checked?.runtimeFindings.filter(value=>value.location==='stream:'+record.index)??[];
  const projection=evaluations.find(value=>typeof value.projectionData==='string')?.projectionData;
  let data=record.text;
  if(typeof projection==='string'){const document=new SourceDocument(projection,'urn:busyapi:stream-preview',true,'json');data=(()=>{let node=document.root;for(const _ of record.path??[0]){if(node.kind!=='array'||!node.children.has('0'))break;node=document.dataNode(node.children.get('0')!.pointer)!;}return document.dataJson(node.pointer);})();}
  const complete=record.error?record.error.kind!=='unsupported'&&!record.error.code.startsWith('limit.'):evaluations.length>0&&evaluations.every(value=>value.complete),valid=!record.error&&complete&&evaluations.every(value=>value.valid)&&!findings.some(value=>value.severity==='error');
  // Only a deferred whole-context binding, without an independent itemSchema,
  // can be discharged by a successful original complete-content evaluation.
  const wholeResolvable=!complete&&!itemSchema&&record.mime!==undefined&&!record.error&&findings.length>0&&
   findings.every(value=>value.severity==='warning'&&value.detailCode==='runtime.stream.part.unavailable')&&
   evaluations.length>0&&evaluations.every(value=>value.complete||value.reason==='unsupported-representation');
  return {index:record.index,wholeResolvable,...(record.path?{path:record.path}:{}),offset:record.offset,bytes:record.bytes,complete,valid,...(data&&Buffer.byteLength(data)<=16384?{data}:{}),findings:record.error?[{...record.error,severity:record.error.kind==='unsupported'||record.error.code.startsWith('limit.')?'warning':'error',subject:'response-item',location:'stream:'+record.index,recordIndex:record.index,byteOffset:record.offset}]:findings.slice(0,16).map(value=>({...value,...(wholeResolvable?{wholeResolvable:true}:{}),recordIndex:record.index,byteOffset:record.offset}))};
 });
 const binaryEvaluations=checked?.runtimeEvaluations.filter(value=>value.location==='stream:binary')??[];
 return {...base,supported:true,receivedBytes:framed.state.bytes,records,pending:framed.pending,framingComplete:framed.state.closed,
  failure:framed.failure,binary,wholeSchema:!!media.schema,wholeAvailable:!!rawBinary||!media.schema||media.schema.unconstrained===true,
  binaryComplete:binary&&itemSchema?false:!rawBinary||binaryEnded&&binaryEvaluations.length>0&&binaryEvaluations.every(value=>value.complete),binaryValid:!rawBinary||!binaryEvaluations.some(value=>value.complete&&value.valid===false)&&!(checked?.runtimeFindings.some(value=>value.location==='stream:binary'&&value.severity==='error')),
  findings:[...(binary&&itemSchema?[{code:'runtime.media.items.unsupported',severity:'warning',message:'Binary content has no independent item representation.',subject:'response-body',schema:itemSchema}]:[]),...(checked?.runtimeFindings.filter(value=>value.location==='stream:binary')??[])].slice(0,16)};
}
}

const streams=new Map<string,ResponseStream>();
let retainedSources=0;
export const responseStreamOwned=(stream:unknown):boolean=>typeof stream==='string'&&streams.has(stream);
function streamIdentity(input:any):string {
 if(typeof input?.stream!=='string'||!input.stream.length||input.stream.length>256)throw new SourceError('runtime.stream.input','Choose a bounded stream owner');
 return input.stream;
}
function release(stream:string,owner:ResponseStream){
 if(streams.get(stream)!==owner)return;
 streams.delete(stream);retainedSources-=owner.retained;owner.closed=true;
}
export async function responseStreamOpen(input:any){
 const stream=streamIdentity(input);
 if(streams.has(stream))throw new SourceError('runtime.stream.capture','The stream identity is already owned');
 if(typeof input.mediaType!=='string'||!Number.isInteger(input.status)||input.runId!==undefined&&(typeof input.runId!=='string'||input.runId.length>256))throw new SourceError('runtime.stream.input','Expected captured response semantics');
 const retained=input.resources?.reduce((bytes:number,resource:any)=>bytes+(typeof resource.text==='string'?resource.text.length*2:Infinity),0);
 if(streams.size>=8||!Number.isFinite(retained)||retainedSources+retained>128*1024*1024)throw new SourceError('limit.stream.owners','Live stream captures exceed the bounded worker capacity');
 const owner=new ResponseStream({...input,resources:input.resources.map((resource:any)=>({...resource,aliases:resource.aliases?.slice()}))});
 const initial=await owner.chunk({text:'',end:false});
 if(initial.supported){streams.set(stream,owner);retainedSources+=owner.retained;}
 return initial;
}
export async function responseStreamChunk(input:any){
 const stream=streamIdentity(input),owner=streams.get(stream);
 if(!owner||owner.closed)throw new SourceError('runtime.stream.closed','The stream owner has completed or its worker was retired');
 if(Object.keys(input).some(key=>!['stream','text','end','maximumRecords'].includes(key)))throw new SourceError('runtime.stream.capture','A continuation cannot replace its captured operation or sources');
 if(typeof input.text!=='string'||input.text.length>87384||typeof input.end!=='boolean')throw new SourceError('runtime.stream.input','Expected bounded new response bytes');
 if(owner.busy)throw new SourceError('runtime.stream.concurrent','Await the preceding stream chunk before continuing');
 const work=owner.chunk(input);owner.busy=work;
 try{
  const result=await work;
  if(owner.closed)throw new SourceError('cancelled','The stream owner was closed');
  if(result.failure||input.end&&!result.pending)release(stream,owner);
  return result;
 }catch(error){release(stream,owner);throw error;}
 finally{if(owner.busy===work)owner.busy=undefined;}
}
export async function responseStreamClose(input:any){
 const stream=streamIdentity(input),owner=streams.get(stream);
 if(owner){release(stream,owner);await owner.busy?.catch(()=>{});}
 return {version:1,stream,closed:true};
}
