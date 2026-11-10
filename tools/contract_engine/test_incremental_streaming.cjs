const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {responseStreamChunk}=require('./dist/stream_execution.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const root='file:///streams/api.json';
function capture(type,options={}) {
 const {version='3.2.1',yaml=false,schema={type:'array'},itemSchema={type:'number',minimum:0},encoding={}}=options,legacy=version==='2.0';
 const media={schema,...(version.startsWith('3.2')&&itemSchema!==null?{itemSchema}:{}),...encoding};
 const document={...(legacy?{swagger:version,produces:[type]}:{openapi:version}),info:{title:'Incremental capture',version:'1'},paths:{'/events':{get:{responses:{200:{description:'Stream',...(legacy?{schema}:{content:{[type]:media}})}}}}}};
 return {root,snapshot:'stream-capture',resource:root,pointer:'/paths/~1events/get',status:200,mediaType:type,resources:[{id:root,text:yaml?YAML.stringify(document):JSON.stringify(document),generation:1}]};
}
async function exchange(input,chunks,end=true) {
 let state,records=[],last;const original=JSON.stringify(input.resources);
 for(const chunk of chunks){last=await responseStreamChunk({...input,state,text:Buffer.from(chunk).toString('base64'),end:false});state=last.state;records.push(...last.records);
  while(last.pending){last=await responseStreamChunk({...input,state,text:'',end:false});state=last.state;records.push(...last.records);}
 }
 if(end){last=await responseStreamChunk({...input,state,text:'',end:true});state=last.state;records.push(...last.records);while(last.pending){last=await responseStreamChunk({...input,state,text:'',end:true});state=last.state;records.push(...last.records);}}
 assert.equal(JSON.stringify(input.resources),original);return {...last,state,records};
}
for(const version of ['2.0','3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const yaml of [false,true])for(const type of ['application/jsonl','application/x-ndjson','application/json-seq','application/example+json-seq'])test(`${version} ${yaml?'YAML':'JSON'} ${type} captured records precede complete-content proof`,async()=>{
 const seq=type.endsWith('json-seq'),wire=Buffer.from(seq?'\x1e9007199254740993\n\x1e-1\n':'9007199254740993\n-1\n'),input=capture(type,{version,yaml});
 const live=await exchange(input,[wire.subarray(0,seq?18:17),wire.subarray(seq?18:17)],false);
 assert(live.records.length>0);assert.equal(live.framingComplete,false);assert.equal(live.wholeAvailable,false);
 const final=await exchange(input,[wire]);assert.equal(final.framingComplete,true);assert.equal(final.records[0].data,'9007199254740993');
 assert.equal(final.records[1].valid,!version.startsWith('3.2'));
 if(version.startsWith('3.2'))assert(final.records[1].findings.some(value=>value.schema?.pointer.endsWith('/itemSchema')));
});
for(const [type,text,expected]of [
 ['application/x-ndjson','{"v":"雪😀","n":9007199254740993}\r\n{"v":"z","n":1}\n',2],
 ['application/json-seq','\x1e{\n"v":"雪😀","n":9007199254740993}\n\x1e{"v":"z","n":1}\n',2],
 ['text/event-stream','\ufeff: ignored\r\nid: kept\r\nretry: 9007199254740993\r\ndata: 雪😀\r\ndata: second\r\nunknown: ignored\r\n\r\ndata: last\n\n',2],
])test(`every byte split retains ${type} delimiters, UTF-8 and exact data`,async()=>{
 const bytes=Buffer.from(text),input=capture(type,{itemSchema:{type:'object'}});
 const finite=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'finite',mediaType:type,text}]});
 assert(finite.runtimeEvaluations.every(value=>value.valid));
 const expectedData=(await exchange(input,[bytes])).records.map(value=>value.data);
 for(let offset=1;offset<bytes.length;offset++){
  const result=await exchange(input,[bytes.subarray(0,offset),bytes.subarray(offset)]);
  assert.equal(result.records.length,expected);assert.deepEqual(result.records.map(value=>value.data),expectedData);assert(result.records.every(value=>value.complete&&value.valid));
 }
 if(type==='text/event-stream'){assert.equal(JSON.parse(expectedData[0]).id,'kept');assert.equal(JSON.parse(expectedData[1]).id,'kept');assert(expectedData[0].includes('9007199254740993'));}
});
for(const scalar of ['123','true','false','null'])test(`RFC 7464 ${scalar} requires truncation protection`,async()=>{
 const input=capture('application/json-seq',{itemSchema:{}});
 const bad=await exchange(input,[Buffer.from('\x1e'+scalar)]);assert.equal(bad.records.length,1);assert.equal(bad.records[0].valid,false);
 const good=await exchange(input,[Buffer.from('\x1e'+scalar+'\n')]);assert.equal(good.records[0].valid,true);
});
test('multiple bad records remain independent and later records are still proved',async()=>{
 const result=await exchange(capture('application/x-ndjson'),[Buffer.from('1\nnot-json\n-1\n2\n')]);
 assert.deepEqual(result.records.map(value=>value.valid),[true,false,false,true]);assert(result.records.every(value=>value.complete));
 const incomplete=await exchange(capture('application/x-ndjson'),[Buffer.from('1\n{"unfinished":')],false);assert.equal(incomplete.records.length,1);assert.equal(incomplete.framingComplete,false);
 const invalid=await exchange(capture('application/x-ndjson'),[Buffer.from([49,10,0xf0,0x9f])]);assert.equal(invalid.records[0].valid,true);assert.equal(invalid.records[1].valid,false);
});
test('SSE EOF never dispatches an unfinished event; IDs/retry and ignored fields follow shared finite rules',async()=>{
 const result=await exchange(capture('text/event-stream',{itemSchema:{type:'object'}}),[Buffer.from('id: first\nretry: 2\ndata: yes\n\nid: bad\0id\nretry: nope\ndata: next\n\ndata: unfinished\n')]);
 assert.equal(result.records.length,2);assert.deepEqual(result.records.map(value=>JSON.parse(value.data)),[{data:'yes',id:'first',retry:2},{data:'next',id:'first',retry:2}]);
});
test('ordered and nested multipart publish child records before the enclosing part ends',async()=>{
 const type='multipart/mixed; boundary=outer',schema={type:'array',prefixItems:[{type:'array',prefixItems:[{type:'integer',minimum:0},{type:'string'}],items:false,minItems:2,maxItems:2}],items:false,minItems:1,maxItems:1};
 const input=capture(type,{schema,itemSchema:{},encoding:{prefixEncoding:[{contentType:'multipart/mixed',prefixEncoding:[{contentType:'application/json'},{contentType:'application/json'}]}]}});
 const prefix='--outer\r\nContent-Type: multipart/mixed; boundary=inner\r\n\r\n--inner\r\nContent-Type: application/json\r\n\r\n9007199254740993\r\n--inner\r\nContent-Type: application/json\r\n\r\n';
 const first=await exchange(input,[Buffer.from(prefix)],false);assert(first.records.some(value=>value.path.length===2));assert.equal(first.framingComplete,false);assert(first.records.every(value=>value.valid),JSON.stringify(first.records));
 const end='"雪"\r\n--inner--\r\n\r\n--outer--\r\n',whole=Buffer.from(prefix+end),expected=await exchange(input,[whole]);
 assert.equal(expected.framingComplete,true);assert.equal(expected.records.length,3);assert(expected.records.every(value=>value.complete&&value.valid),JSON.stringify(expected.records));
 for(const cut of [1,7,9,prefix.indexOf('9007')+4,whole.length-4]){const split=await exchange(input,[whole.subarray(0,cut),whole.subarray(cut)]);assert.deepEqual(split.records.map(value=>[value.path,value.valid]),expected.records.map(value=>[value.path,value.valid]));}
 const truncated=await exchange(input,[Buffer.from(prefix)]);assert.equal(truncated.framingComplete,false);assert(truncated.failure);assert(truncated.records.some(value=>value.path.length===2));
});
test('multipart itemSchema and binary leaves retain original constraints at actual positions',async()=>{
 const type='multipart/mixed; boundary=parts',input=capture(type,{schema:{type:'array'},itemSchema:{maxLength:2},encoding:{itemEncoding:{contentType:'application/octet-stream'}}});
 const text='--parts\r\nContent-Type: application/octet-stream\r\n\r\nab\r\n--parts\r\nContent-Type: application/octet-stream\r\n\r\nabc\r\n--parts--\r\n';
 const result=await exchange(input,[Buffer.from(text)]);assert.deepEqual(result.records.map(value=>value.valid),[true,false]);assert(result.records[1].findings.some(value=>value.schema.pointer.includes('itemSchema')));
});
test('binary cumulative maxLength uses exact count provenance without allocating a complete body',async()=>{
 const input=capture('application/octet-stream',{schema:{maxLength:3},itemSchema:null});let state;
 for(const text of ['ab','cd']){const result=await responseStreamChunk({...input,state,text:Buffer.from(text).toString('base64'),end:false});state=result.state;assert.equal(result.binaryValid,true);assert.equal(result.binaryComplete,false);assert.equal(state.buffer,'');}
 const final=await responseStreamChunk({...input,state,text:'',end:true});assert.equal(final.binaryComplete,true);assert.equal(final.binaryValid,false);
 const inverse=capture('application/octet-stream',{schema:{not:{maxLength:3}},itemSchema:null});
 const prefix=await responseStreamChunk({...inverse,text:Buffer.from('ab').toString('base64'),end:false});assert.equal(prefix.binaryComplete,false);assert.equal(prefix.binaryValid,true);
 const complete=await responseStreamChunk({...inverse,state:prefix.state,text:Buffer.from('cd').toString('base64'),end:true});assert.equal(complete.binaryComplete,true);assert.equal(complete.binaryValid,true);
});
test('bounded batches preserve every record and unfinished record limits remain explicit',async()=>{
 const input=capture('application/x-ndjson',{schema:{},itemSchema:{type:'number'}}),bytes=Buffer.from('1\n'.repeat(300));
 let state,records=[];let result=await responseStreamChunk({...input,state,text:bytes.toString('base64'),end:false,maximumRecords:1});state=result.state;records.push(...result.records);assert.equal(records.length,1);
 while(result.pending){result=await responseStreamChunk({...input,state,text:'',end:false});state=result.state;records.push(...result.records);}
 assert.equal(records.length,300);assert.equal(state.buffer,'');assert.deepEqual(records.map(value=>value.index),Array.from({length:300},(_,index)=>index));
 // Use the production response entry for overflow; every incoming chunk stays bounded.
 state=undefined;for(let n=0;n<257;n++){result=await responseStreamChunk({...input,state,text:Buffer.alloc(65536,32).toString('base64'),end:false});state=result.state;if(result.failure)break;}
 assert.equal(result.failure.code,'limit.stream.record');
});

test('continuations reject replaced captures and retain original declaration identities',async()=>{
 const input={...capture('application/x-ndjson'),runId:'one-run'},first=await responseStreamChunk({...input,text:Buffer.from('1\n{"partial":').toString('base64'),end:false});
 assert.equal(first.records.length,1);
 await assert.rejects(responseStreamChunk({...input,snapshot:'changed-capture',state:first.state,text:'',end:false}),error=>error.code==='runtime.stream.capture');
 await assert.rejects(responseStreamChunk({...input,runId:'another-run',state:first.state,text:'',end:false}),error=>error.code==='runtime.stream.capture');
 assert.equal(first.state.mediaType,'application/x-ndjson');
});

for(const version of ['2.0','3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const yaml of [false,true])test(`${version} ${yaml?'YAML':'JSON'} SSE preserves its event model and family keyword boundary`,async()=>{
 const result=await exchange(capture('text/event-stream',{version,yaml,itemSchema:{type:'object',required:['data'],properties:{data:{const:'good'}}}}),[Buffer.from('data: bad\r'),Buffer.from('\n\r'),Buffer.from('\n')]);
 assert.equal(result.records.length,1);assert.equal(result.records[0].valid,!version.startsWith('3.2'));assert.equal(result.framingComplete,true);
});
for(const version of ['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const yaml of [false,true])test(`${version} ${yaml?'YAML':'JSON'} named multipart keeps captured property constraints`,async()=>{
 const type='multipart/form-data; boundary=named',input=capture(type,{version,yaml,schema:{type:'object',properties:{n:{type:'integer',minimum:0}}},itemSchema:null});
 const wire=Buffer.from('--named\r\nContent-Disposition: form-data; name="n"\r\nContent-Type: application/json\r\n\r\n-1\r\n--named--\r\n');
 const result=await exchange(input,Array.from(wire,byte=>Buffer.from([byte])));assert.equal(result.records.length,1);assert.equal(result.records[0].complete,true);assert.equal(result.records[0].valid,false);assert.equal(result.framingComplete,true);
 assert(result.records[0].findings.some(value=>value.schema?.pointer.endsWith('/schema/properties/n')));
});
test('shared MIME framing rejects truncated suffixes and preserves transfer-decoded exact data',async()=>{
 const type='multipart/mixed; boundary=x',input=capture(type,{schema:{type:'array'},itemSchema:{type:'number',minimum:0},encoding:{itemEncoding:{contentType:'application/json'}}});
 const wire=Buffer.from('--x\r\nContent-Type: application/json\r\nContent-Transfer-Encoding: base64\r\n\r\n'+Buffer.from('9007199254740993').toString('base64')+'\r\n--x--\r\n');
 const result=await exchange(input,Array.from(wire,byte=>Buffer.from([byte])));assert.equal(result.records[0].data,'9007199254740993');assert.equal(result.records[0].valid,true);
 const missing=await exchange(input,[wire.subarray(0,wire.length-4)]);assert(missing.failure);assert.equal(missing.framingComplete,false);
});

test('multipart item alternatives are original schemas, not conjoined representation branches',async()=>{
 const type='multipart/mixed; boundary=alternatives',input=capture(type,{schema:{type:'array'},itemSchema:{anyOf:[{type:'integer',minimum:0},{type:'string',minLength:2}]},encoding:{itemEncoding:{contentType:'application/json'}}});
 const wire=Buffer.from('--alternatives\r\nContent-Type: application/json\r\n\r\n1\r\n--alternatives\r\nContent-Type: application/json\r\n\r\n"ok"\r\n--alternatives\r\nContent-Type: application/json\r\n\r\nfalse\r\n--alternatives--\r\n');
 const result=await exchange(input,[wire]);assert.deepEqual(result.records.map(value=>value.valid),[true,true,false]);assert(result.records.every(value=>value.complete));
});

test('only a deferred original whole-context MIME binding carries a resolvable item proof',async()=>{
 const type='multipart/form-data; boundary=proof',schema={type:'object',oneOf:[{required:['value'],properties:{value:{type:'integer',const:1}}},{required:['value'],properties:{value:{type:'integer',const:2}}}]};
 const input=capture(type,{schema,itemSchema:null,encoding:{encoding:{value:{contentType:'application/json'}}}}),wire='--proof\r\nContent-Disposition: form-data; name="value"\r\nContent-Type: application/json\r\n\r\n1\r\n--proof--\r\n';
 const result=await exchange(input,[Buffer.from(wire)]);assert.equal(result.records.length,1);assert.equal(result.records[0].complete,false);assert.equal(result.records[0].wholeResolvable,true);assert(result.records[0].findings.every(value=>value.wholeResolvable===true&&value.detailCode==='runtime.stream.part.unavailable'));
 const finite=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'whole',text:wire,mediaType:type,schema:{resource:root,pointer:'/paths/~1events/get/responses/200/content/multipart~1form-data; boundary=proof/schema'},form:{resource:root,pointer:'/paths/~1events/get/responses/200/content/multipart~1form-data; boundary=proof'}}]});
 assert.equal(finite.complete,true);assert(finite.runtimeEvaluations.every(value=>value.complete&&value.valid),JSON.stringify(finite.runtimeFindings));
 const independent=capture(type,{schema,itemSchema:{type:'object'},encoding:{encoding:{value:{contentType:'application/json'}}}});
 const unchecked=await exchange(independent,[Buffer.from(wire)]);assert(unchecked.records.every(value=>value.wholeResolvable===false));
});
