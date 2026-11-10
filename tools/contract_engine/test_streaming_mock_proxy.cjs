const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),zlib=require('node:zlib');
const {mockStart,startMock}=require('./mock_test_capture.cjs');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function contract(type,itemSchema={type:'number',minimum:0},extra={}){return {openapi:'3.2.1',info:{title:'Live proxy',version:'1'},paths:{'/events':{get:{responses:{200:{description:'Events',content:{[type]:{itemSchema,...extra}}}}}}}};}
for(const compressed of [false,true])test(`native proxy forwards ${compressed?'gzip':'plain'} records before upstream EOF and validates them incrementally`,{timeout:30000},async t=>{
 const release=deferred(),first=deferred(),result=deferred(),a=compressed?zlib.gzipSync('9007199254740993\n'):Buffer.from('9007199254740993\n'),b=compressed?zlib.gzipSync('-1\n2\n'):Buffer.from('-1\n2\n');
 const upstream=http.createServer(async(req,res)=>{res.setHeader('content-type','application/x-ndjson');if(compressed)res.setHeader('content-encoding','gzip');res.write(a);await release.promise;res.end(b);});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));t.after(()=>{release.resolve();upstream.closeAllConnections();upstream.close();});
 const input=mockStart(contract('application/x-ndjson'),{upstream:`http://127.0.0.1:${upstream.address().port}`}),original=JSON.stringify(input.capture),{port}=await startMock(t,input);
 let ended=false;const chunks=[];
 const request=http.get(`http://127.0.0.1:${port}/events`,response=>{
  assert.equal(response.headers['busyapi-response-validation-complete'],'false');
  response.on('data',chunk=>{chunks.push(chunk);if(chunks.reduce((size,value)=>size+value.length,0)>=a.length)first.resolve();});response.on('error',result.reject);
  response.on('end',()=>{ended=true;result.resolve(response);});
 });request.on('error',result.reject);t.after(()=>request.destroy());
 await first.promise;assert.equal(ended,false);assert.deepEqual(Buffer.concat(chunks),a);release.resolve();const response=await result.promise;
 assert.deepEqual(Buffer.concat(chunks),Buffer.concat([a,b]));assert.equal(response.trailers['busyapi-stream-status'],'invalid');assert.equal(response.trailers['busyapi-stream-records'],'3');assert.equal(response.trailers['busyapi-stream-invalid-records'],'1');assert.equal(JSON.stringify(input.capture),original);
});
test('proxy disconnect retires both peers without a synthetic successful EOF',{timeout:30000},async t=>{
 const delivered=deferred(),lost=deferred();
 const upstream=http.createServer((req,res)=>{res.setHeader('content-type','application/json-seq');res.write('\x1e1\n');req.socket.once('close',lost.resolve);});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));t.after(()=>{upstream.closeAllConnections();upstream.close();});
 const {port}=await startMock(t,mockStart(contract('application/json-seq'),{upstream:`http://127.0.0.1:${upstream.address().port}`}));
 const request=http.get(`http://127.0.0.1:${port}/events`,response=>{response.on('data',()=>{delivered.resolve();response.destroy();});response.on('error',()=>{});});request.on('error',()=>{});t.after(()=>request.destroy());
 await delivered.promise;await lost.promise;
});
for(const [type,data]of [['application/x-ndjson',[1,2]],['application/json-seq',[1,2]],['text/event-stream',[{data:'雪',id:'same'},{data:'second',id:'same'}]]])test(`native generated ${type} body uses the shared wire representation`,{timeout:30000},async t=>{
 const document=contract(type,type==='text/event-stream'?{type:'object',required:['data']}:{type:'integer'},{schema:{type:'array',minItems:2,maxItems:2},examples:{authored:{dataValue:data}}}),{port}=await startMock(t,mockStart(document));
 const response=await new Promise((resolve,reject)=>{http.get(`http://127.0.0.1:${port}/events`,res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);res.on('end',()=>resolve({headers:res.headers,body:Buffer.concat(chunks).toString()}));}).on('error',reject);});
 assert.equal(response.headers['busyapi-response-validation-complete'],'true');
 assert.equal(response.body,type==='application/x-ndjson'?'1\n2\n':type==='application/json-seq'?'\x1e1\n\x1e2\n':'id: same\ndata: 雪\n\nid: same\ndata: second\n\n');
});
test('generated itemSchema-only sequence obtains a captured item witness',{timeout:30000},async t=>{
 const {port}=await startMock(t,mockStart(contract('application/x-ndjson',{type:'integer',const:7})));
 const body=await new Promise((resolve,reject)=>http.get(`http://127.0.0.1:${port}/events`,response=>{let body='';response.on('data',bytes=>body+=bytes);response.on('end',()=>resolve(body));response.on('error',reject);}).on('error',reject));assert.equal(body,'7\n');
});
for(const [type,prefix,suffix,itemSchema]of [
 ['application/json-seq','\x1e9007199254740993\n','\x1e2\n',{type:'number'}],
 ['text/event-stream','id: kept\r\ndata: 雪😀\r\n\r\n','data: last\n\n',{type:'object',required:['data']}],
 ['multipart/mixed; boundary=parts','--parts\r\nContent-Type: application/json\r\n\r\n9007199254740993\r\n--parts\r\nContent-Type: application/json\r\n\r\n','2\r\n--parts--\r\n',{type:'number'}],
])test(`actual proxy ${type} delivers before EOF and reports complete per-item proof`,{timeout:30000},async t=>{
 const first=deferred(),release=deferred(),done=deferred();
 const upstream=http.createServer(async(req,res)=>{res.setHeader('content-type',type);res.write(prefix);await release.promise;res.end(suffix);});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));t.after(()=>{release.resolve();upstream.closeAllConnections();upstream.close();});
 const extra=type.startsWith('multipart/')?{itemEncoding:{contentType:'application/json'}}:{};
 const {port}=await startMock(t,mockStart(contract(type,itemSchema,extra),{upstream:`http://127.0.0.1:${upstream.address().port}`}));
 let ended=false;const chunks=[];
 const request=http.get(`http://127.0.0.1:${port}/events`,response=>{response.on('data',chunk=>{chunks.push(chunk);if(chunks.reduce((size,value)=>size+value.length,0)>=Buffer.byteLength(prefix))first.resolve();});response.on('error',done.reject);response.on('end',()=>{ended=true;done.resolve(response);});});request.on('error',done.reject);t.after(()=>request.destroy());
 await first.promise;assert.equal(ended,false);assert.deepEqual(Buffer.concat(chunks),Buffer.from(prefix));release.resolve();const response=await done.promise;
 assert.deepEqual(Buffer.concat(chunks),Buffer.from(prefix+suffix));assert.equal(response.trailers['busyapi-stream-status'],'complete');assert.equal(response.trailers['busyapi-stream-records'],'2');assert.equal(response.trailers['busyapi-stream-invalid-records'],'0');
});
test('proxy unavailable binary item interpretation stays incomplete without inventing invalid records',{timeout:30000},async t=>{
 const upstream=http.createServer((req,res)=>{res.setHeader('content-type','application/octet-stream');res.end(Buffer.from([0,255]));});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));t.after(()=>{upstream.closeAllConnections();upstream.close();});
 const {port}=await startMock(t,mockStart(contract('application/octet-stream',{}),{upstream:`http://127.0.0.1:${upstream.address().port}`}));
 const response=await new Promise((resolve,reject)=>http.get(`http://127.0.0.1:${port}/events`,response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('error',reject);response.on('end',()=>resolve({trailers:response.trailers,wire:Buffer.concat(chunks)}));}).on('error',reject));
 assert.deepEqual(response.wire,Buffer.from([0,255]));assert.equal(response.trailers['busyapi-stream-status'],'incomplete');assert.equal(response.trailers['busyapi-stream-records'],'0');assert.equal(response.trailers['busyapi-stream-invalid-records'],'0');
});
