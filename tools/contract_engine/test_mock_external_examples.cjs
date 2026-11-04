const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),YAML=require('yaml');
const {capturedMockStart,startMock}=require('./mock_test_capture.cjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(version,format){
 const root='file:///mock-external/api.'+format,examples='file:///mock-external/defs/examples.'+format;
 const bytes=Buffer.from([0,255,128,13,10,0]),json=Buffer.from('{"n":9007199254740993.00,"$ref":"literal","__proto__":false}');
 const binary=version.startsWith('3.0')?{type:'string',format:'binary'}:{not:{type:'null'}};
 const media=(type,schema,choices)=>({200:{description:'Original captured bytes',content:{[type]:{schema,examples:choices}}}});
 const ref=name=>({$ref:'defs/examples.'+format+'#/'+name});
 const document={openapi:version,info:{title:'External mock examples',version:'1'},paths:{
  '/bytes':{post:{responses:media('application/octet-stream',binary,{Bytes:ref('Bytes'),Empty:ref('Empty')})}},
  '/json':{post:{responses:media('application/json',{type:'object',required:['n'],properties:{n:{type:'integer',enum:['EXACT']}}},{Exact:ref('Json')})}},
  '/text':{post:{responses:media('text/plain; charset=iso-8859-1',{type:'string',enum:['é']},{Latin:ref('Text')})}},
 }},definitions={Bytes:{externalValue:'payload.bin'},Empty:{externalValue:'empty.bin'},Json:{externalValue:'payload.json'},Text:{externalValue:'text.bin'}};
 const encode=value=>(format==='json'?JSON.stringify(value):'# Keep external owners 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const capture={root,snapshot:'0'.repeat(64),resources:[{id:root,text:encode(document),generation:1},{id:examples,text:encode(definitions),generation:2}].map(resource=>({...resource,identity:hash(resource.text)})),
  exampleResources:[['payload.bin',bytes],['empty.bin',Buffer.alloc(0)],['payload.json',json],['text.bin',Buffer.from([0xe9])]].map(([name,bytes])=>({
   version:1,id:'file:///approved-payloads/'+name,aliases:['file:///mock-external/defs/'+name],generation:0,identity:hash(bytes),state:'available',base64:bytes.toString('base64'),byteLength:bytes.length,
  }))};
 return {input:capturedMockStart(capture),bytes,json};
}
for(const version of ['3.0.4','3.2.1'])for(const format of ['yaml','json'])test(`${version} ${format} mock negotiation preserves approved external binary, empty, exact JSON and charset bytes`,{timeout:25000},async t=>{
 const {input,bytes,json}=fixture(version,format),before=JSON.stringify(input),{port}=await startMock(t,input);
 const send=async(route,expected,headers={})=>{
  // POST with an absent body uses the route's ordinary native request owner.
  const http=require('node:http');
  const response=await new Promise((resolve,reject)=>{
   const request=http.request({host:'127.0.0.1',port,path:route,method:'POST',headers},response=>{
    const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.once('error',reject);
    response.once('end',()=>resolve({status:response.statusCode,headers:response.headers,bytes:Buffer.concat(chunks)}));
   });request.once('error',reject);request.end();
  });
  assert.equal(response.status,200,response.bytes.toString());assert.deepEqual(response.bytes,expected);
  assert.equal(response.headers['busyapi-response-validation-complete'],'true');
  if(response.headers['content-length']!==undefined)assert.equal(Number(response.headers['content-length']),expected.length);
  assert(!JSON.parse(response.headers['sl-violations']??'[]').some(finding=>finding.location?.[0]==='response'));
  return response;
 };
 await send('/bytes',bytes);await send('/bytes',Buffer.alloc(0),{prefer:'code=200,example=Empty'});
 await send('/json',json);const text=await send('/text',Buffer.from([0xe9]));
 assert.match(text.headers['content-type'],/charset=iso-8859-1/i);
 assert.equal(JSON.stringify(input),before);
});
for(const condition of ['missing','denied','identity','base64'])test(`mock external ${condition} capture cannot become a ready session`,{timeout:20000},async t=>{
 const {input}=fixture('3.2.1','json');
 if(condition==='missing')input.capture.exampleResources=[];
 else if(condition==='denied')input.capture.exampleResources[0]={...input.capture.exampleResources[0],state:'unavailable',
  identity:hash('denied'),problem:{condition:'unavailable',code:'example.external-value.unapproved',message:'No approved byte resource'}};
 else if(condition==='identity')input.capture.exampleResources[0].identity='f'.repeat(64);
 else input.capture.exampleResources[0].base64='A===';
 const event=await startMock(t,input,{failure:true});assert.equal(event.event,'failed');assert.equal(event.port,undefined);
 assert(event.failure?.code==='example.resource.protocol'||event.failure?.code==='mock.validation.unsupported',JSON.stringify(event));
});
