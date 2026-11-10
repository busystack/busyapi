import {randomUUID} from 'node:crypto';
import type {ServerResponse} from 'node:http';
import type {ExactProxyObserver} from './mock_exact_proxy';
import type {MockNativeValidation} from './mock_native_validation';
import {SourceError} from './document';

/** Adapter on the existing exact proxy transport. Wire delivery and decoded
 * evaluation each await their consumer; headers never advertise a future proof. */
export function mockStreamResponse(native:MockNativeValidation,path:string,method:string,reply:ServerResponse,signal:AbortSignal):ExactProxyObserver {
 const runId=randomUUID();
 let schemaProducer:any,receivedBytes=0,decodedBytes=0,findingBytes=0;
 let state:any,active=false,finished=false,status=0,type='',whole=false,wholeBytes=0,records=0,invalid=0,unchecked=0,binaryValid=true,binaryComplete=true;
 let framing=false,failed=false,responseInvalid=false,headersComplete=true,observedInvalid=false;
 const chunks:Buffer[]=[],findings:any[]=[];let headers:Record<string,string[]>=Object.create(null),capturedHeaders:Record<string,string[]>=Object.create(null);
 const note=(value:any)=>{if(value.severity==='error')observedInvalid=true;const bytes=Buffer.byteLength(JSON.stringify(value));if(findings.length<200&&findingBytes+bytes<=1024*1024){findingBytes+=bytes;findings.push(value);}};
 const accept=(result:any)=>{
  schemaProducer={name:result.producer,version:result.producerVersion,configuration:result.configuration};
  state=result.state;framing=result.framingComplete===true;binaryValid=result.binaryValid===true;binaryComplete=result.binaryComplete===true;
  for(const record of result.records){records++;if(!record.complete)unchecked++;else if(!record.valid)invalid++;for(const finding of record.findings)note(finding);}
  for(const finding of result.findings??[])note(finding);
  if(result.failure){failed=true;note({...result.failure,severity:result.failure.kind==='unsupported'||result.failure.code.startsWith('limit.')?'warning':'error'});}
 };
 const evaluate=async(bytes:Buffer,end=false)=>{
  let result=await native.responseStreamChunk(path,method,status,type,bytes.toString('base64'),state,end,signal,runId);accept(result);
  while(result.pending&&!failed){result=await native.responseStreamChunk(path,method,status,type,'',state,end,signal,runId);accept(result);}
  if(failed&&!end)throw new SourceError('mock.stream.framing','Streaming framing exceeded its supported representation or resource budget',[0,0],'unsupported');
 };
 const waitWrite=(bytes:Buffer)=>new Promise<void>((resolve,reject)=>{
  if(reply.destroyed||signal.aborted){reject(new SourceError('cancelled','Downstream stream closed'));return;}
  const finish=(error?:Error)=>{reply.removeListener('drain',drain);reply.removeListener('error',errorListener);reply.removeListener('close',closed);error?reject(error):resolve();};
  const drain=()=>finish(),errorListener=(error:Error)=>finish(error),closed=()=>finish(Error('Downstream stream closed'));
  reply.once('error',errorListener);reply.once('close',closed);
  if(reply.write(bytes))finish();else reply.once('drain',drain);
 });
 return {
  async open(code,received,raw){
   if(method==='HEAD'||code<200||[204,205,304].includes(code))return false;
   status=code;type=received.get('content-type')??'';if(!type)return false;
   const initial=await native.responseStreamChunk(path,method,status,type,'',undefined,false,signal,runId);if(!initial.supported)return false;
   accept(initial);whole=initial.wholeAvailable!==true;
   const hop=new Set(['connection','keep-alive','proxy-connection','transfer-encoding','upgrade','te','trailer','content-length','busyapi-response-validation-complete','busyapi-request-security-complete']);
   for(const name of (received.get('connection')??'').split(',').map(value=>value.trim().toLowerCase()))if(name)hop.add(name);
   for(let at=0;at<raw.length;at+=2){const name=raw[at].toLowerCase();(capturedHeaders[name]??=[]).push(raw[at+1]);if(hop.has(name))continue;(headers[name]??=[]).push(raw[at+1]);}
   const checked=await native.streamResponseHeaders(path,method,status,capturedHeaders,signal);headersComplete=checked.complete;if(checked.complete&&!checked.valid||checked.findings.some(value=>value.severity==='error'))responseInvalid=true;checked.findings.forEach(note);
   reply.statusCode=status;for(const [name,values]of Object.entries(headers))reply.setHeader(name,values);
   reply.setHeader('busyapi-response-validation-complete','false');
   reply.setHeader('trailer','busyapi-stream-status, busyapi-stream-records, busyapi-stream-invalid-records, busyapi-stream-unchecked-records');
   reply.flushHeaders();active=true;return true;
  },
  async wire(bytes){receivedBytes+=bytes.length;await waitWrite(bytes);},
  async decoded(bytes){
   decodedBytes+=bytes.length;
   if(whole){wholeBytes+=bytes.length;if(wholeBytes>64*1024*1024)throw new SourceError('limit.mock.stream.whole','Whole-content response proof exceeds 64 MiB',[0,0],'unsupported');chunks.push(Buffer.from(bytes));}
   for(let offset=0;offset<bytes.length;offset+=65536)await evaluate(bytes.subarray(offset,offset+65536));
  },
  async finish(ended,error){
   if(!active||finished)return;finished=true;
   let complete=false;
   try{
    if(ended)await evaluate(Buffer.alloc(0),true);
    complete=ended&&framing&&!failed&&!unchecked&&binaryComplete&&headersComplete;
    if(ended&&framing&&!failed&&whole){const checked=await native.response(path,method,status,capturedHeaders,Buffer.concat(chunks,wholeBytes),signal);complete=checked.complete;if(checked.complete&&!checked.valid||checked.findings.some(value=>value.severity==='error'))responseInvalid=true;else if(checked.complete){unchecked=0;for(let at=0;at<findings.length;at++)if(findings[at].severity==='warning')findings[at]={...findings[at],severity:'information',provisional:true,resolvedBy:'complete-content-evaluation'};}checked.findings.forEach(note);}
   }catch(problem){ended=false;complete=false;error=problem;note({code:problem instanceof SourceError?problem.code:'mock.stream.incomplete',severity:'warning',message:'Streaming response evaluation was interrupted.'});}
   const valid=!responseInvalid&&invalid===0&&binaryValid&&!observedInvalid;
   const terminal=!valid?'invalid':!ended?'incomplete':complete?'complete':'incomplete';
   if(ended&&!reply.destroyed){reply.addTrailers({'busyapi-stream-status':terminal,'busyapi-stream-records':String(records),'busyapi-stream-invalid-records':String(invalid),'busyapi-stream-unchecked-records':String(unchecked)});reply.end();}
   else if(!reply.destroyed)reply.destroy(error instanceof Error?error:undefined);
   process.stdout.write(JSON.stringify({event:'stream-result',path,method,status,stream:{producer:'busyapi-incremental-stream',producerVersion:'1',schemaProducer,status:terminal,complete,valid:complete&&valid,receivedBytes,decodedBytes,records,validRecords:records-invalid-unchecked,invalidRecords:invalid,uncheckedRecords:unchecked,findings:findings.slice(0,32)}})+'\n');
   chunks.length=0;
  }
 };
}
