import {createGraph} from './engine';
import {requestOperation} from './execution';
import {SourceDocument,SourceError} from './document';
import {frameStream,streamingMedia,streamRevision} from './runtime_stream';
import {runtimeBinaryMedia} from './runtime_binary';
import {selectNativeMedia} from './mock_projection';
import {evaluateSchemas,schemaProducer} from './schema_evaluation';
import {runtimeMediaBytes} from './runtime_media';

/** Original response ownership is recovered for every continuation. A caller
 * cannot supply a replacement item schema, family, Encoding or MIME binding. */
export async function responseStreamChunk(input:any){
 if(typeof input.mediaType!=='string'||typeof input.text!=='string'||typeof input.end!=='boolean'||!Number.isInteger(input.status)||input.runId!==undefined&&(typeof input.runId!=='string'||input.runId.length>256))throw new SourceError('runtime.stream.input','Expected captured response chunks');
 const context=createGraph(input),plan=requestOperation(input,context),declaration=plan.responses.find(item=>item.status===String(input.status))??plan.responses.find(item=>item.status===String(input.status)[0]+'XX')??plan.responses.find(item=>item.status==='default');
 const media=declaration&&selectNativeMedia<any>(declaration.content,input.mediaType);
 const base={version:1,revision:streamRevision,snapshot:input.snapshot,identity:plan.identity,producer:schemaProducer.name,producerVersion:schemaProducer.version,configuration:schemaProducer.configuration};
 if(!media||!streamingMedia(input.mediaType))return {...base,supported:false};
 const capture=JSON.stringify([input.snapshot,plan.identity,input.runId??null,input.status,input.mediaType,streamRevision,schemaProducer.version]);
 if(input.state&&input.state.capture!==capture)throw new SourceError('runtime.stream.capture','The stream continuation belongs to a different operation capture');
 const framed=frameStream(input.mediaType,input.state,runtimeMediaBytes(input.text,true),input.end,input.maximumRecords??128),instances:any[]=[],binary=runtimeBinaryMedia(input.mediaType),multipart=input.mediaType.split(';')[0].trim().toLowerCase().startsWith('multipart/');
 const itemSchema=media.family==='3.2'?media.itemSchema:undefined;
 for(const record of framed.records){
  if(record.error)continue;
  const location='stream:'+record.index;
  if(record.mime!==undefined)instances.push({subject:'response-body',location,text:record.mime,mediaBase64:true,mediaType:input.mediaType,form:{...media.definition,streamIndex:record.path?.[0]??record.index,streamPath:record.path},schema:media.schema,...((record.path?.length??1)===1?{itemSchema}:{}),captureData:true});
  else instances.push({subject:'response-item',location,text:record.text,...(itemSchema?{schema:itemSchema}:{})});
 }
 const rawBinary=binary&&['3.1','3.2'].includes(media.family)&&media.schema;
 // Even a byte-length schema can be non-monotone under not/alternatives.
 // Retain exact cumulative provenance, but evaluate the original whole schema
 // only at EOF; a short prefix must not create a permanent false violation.
 const binaryEnded=input.end&&framed.state.closed&&!framed.pending;
 if(rawBinary&&binaryEnded)instances.push({subject:'response-body',location:'stream:binary',text:'',mediaType:input.mediaType,schema:media.schema,rawByteLength:framed.state.bytes});
 const checked=instances.length?await evaluateSchemas({...input,runtimeInstances:instances},undefined,context):undefined;
 const records=framed.records.map(record=>{
  const evaluations=checked?.runtimeEvaluations.filter(value=>value.location==='stream:'+record.index)??[];
  const findings=checked?.runtimeFindings.filter(value=>value.location==='stream:'+record.index)??[];
  const projection=evaluations.find(value=>typeof value.projectionData==='string')?.projectionData;
  let data=record.text;
  if(typeof projection==='string'){const document=new SourceDocument(projection,'urn:busyapi:stream-preview',true,'json');data=(()=>{let node=document.root;for(const _ of record.path??[0]){if(node.kind!=='array'||!node.children.has('0'))break;node=document.dataNode(node.children.get('0')!.pointer)!;}return document.dataJson(node.pointer);})();}
  const complete=record.error?record.error.kind!=='unsupported'&&!record.error.code.startsWith('limit.'):evaluations.length>0&&evaluations.every(value=>value.complete),valid=!record.error&&complete&&evaluations.every(value=>value.valid)&&!findings.some(value=>value.severity==='error');
  return {index:record.index,...(record.path?{path:record.path}:{}),offset:record.offset,bytes:record.bytes,complete,valid,...(data&&Buffer.byteLength(data)<=16384?{data}:{}),findings:record.error?[{...record.error,severity:record.error.kind==='unsupported'||record.error.code.startsWith('limit.')?'warning':'error',subject:'response-item',location:'stream:'+record.index,recordIndex:record.index,byteOffset:record.offset}]:findings.slice(0,16).map(value=>({...value,recordIndex:record.index,byteOffset:record.offset}))};
 });
 const binaryEvaluations=checked?.runtimeEvaluations.filter(value=>value.location==='stream:binary')??[];
 return {...base,supported:true,state:{...framed.state,capture},records,pending:framed.pending,framingComplete:framed.state.closed,
  failure:framed.failure,binary,wholeSchema:!!media.schema,wholeAvailable:!!rawBinary||!media.schema||media.schema.unconstrained===true,
  binaryComplete:binary&&itemSchema?false:!rawBinary||binaryEnded&&binaryEvaluations.length>0&&binaryEvaluations.every(value=>value.complete),binaryValid:!rawBinary||!binaryEvaluations.some(value=>value.complete&&value.valid===false)&&!(checked?.runtimeFindings.some(value=>value.location==='stream:binary'&&value.severity==='error')),
  findings:[...(binary&&itemSchema?[{code:'runtime.media.items.unsupported',severity:'warning',message:'Binary content has no independent item representation.',subject:'response-body',schema:itemSchema}]:[]),...(checked?.runtimeFindings.filter(value=>value.location==='stream:binary')??[])].slice(0,16)};
}
