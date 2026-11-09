const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const YAML=require('yaml');
const {mockStart,capturedMockStart,startMock:start,mockRequest:request}=require('./mock_test_capture.cjs');

const versions=['2.0','3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
function contract(version,schemas) {
 const legacy=version==='2.0';
 return {...(legacy?{swagger:version,consumes:['application/json']}:{openapi:version}),info:{title:'Native body checks',version:'1'},
  paths:Object.fromEntries(Object.entries(schemas).map(([name,schema])=>['/'+name,{post:{
   ...(legacy?{parameters:[{in:'body',name:'payload',required:true,schema}]}:{requestBody:{required:true,content:{'application/json':{schema}}}}),
   responses:{204:{description:'Empty'}}}}]))};
}
function text(document,format) {
 const serialized=format==='json'?JSON.stringify(document):YAML.stringify(document);
 return serialized.replaceAll(format==='json'?'"__exact__"':'__exact__','9007199254740993.00');
}

for(const version of versions)for(const format of ['json','yaml'])test(`${version} ${format} native mock validates scalar presence and exact numbers`,{timeout:20000},async t=>{
 const schemas={zero:{type:'integer',enum:[0]},false:{type:'boolean',enum:[false]},empty:{type:'string',enum:['']},
  null:version.startsWith('3.0.')?{type:'string',nullable:true,enum:[null]}:{enum:[null]},
  exact:{type:'integer',enum:['__exact__']},
  ...(version==='2.0'?{}:{direction:{type:'object',required:['read','write'],properties:{read:{type:'string',readOnly:true},write:{type:'string',writeOnly:true}}}}),
  bounded:version.startsWith('3.0.')||version==='2.0'?{type:'number',minimum:0,exclusiveMinimum:true}:{type:'number',exclusiveMinimum:0},
  object:{type:'object',required:['雪/é~','literal'],properties:{'雪/é~':{type:'string'},literal:{type:'object',properties:{$ref:{type:'string'}}}}}};
 const document=contract(version,schemas),source=text(document,format),input=mockStart(source,{},'file:///mock-fixture/api.'+format);
 const original=JSON.stringify(input.capture),{port}=await start(t,input);
 for(const [route,body]of [['zero','0'],['zero','-0'],['false','false'],['empty','""'],['null','null'],['exact','9007199254740993'],['exact','9007199254740993.000'],['bounded','0.0000000000000000000000000001'],['object','{"雪/é~":"🙂","literal":{"$ref":"./not-a-contract.json"}}']]){
  const res=await request(port,'/'+route,body);assert.equal(res.status,204,route+' '+body+': '+res.text);
 }
 for(const [route,body]of [['zero',undefined],['zero','false'],['false','0'],['empty','null'],['exact','9007199254740992'],['exact','9007199254740994'],['bounded','-0'],['bounded','-0.0000000000000000000000000001'],['object','{"雪/é~":false}'],['object','{bad']]){
  const res=await request(port,'/'+route,body);assert.equal(res.status,422,route+' '+body+': '+res.text);
 }
 if(version!=='2.0'){
  assert.equal((await request(port,'/direction','{"read":"old","write":"雪"}')).status,204);
  assert.equal((await request(port,'/direction','{"write":"雪"}')).status,version.startsWith('3.0.')?204:422);
  assert.equal((await request(port,'/direction','{"read":"old"}')).status,422);
 }
 assert.equal(JSON.stringify(input.capture),original,'mocking must not rewrite captured source');
});

test('native mock violations retain external schema sources, Unicode and escaped pointers',{timeout:20000},async t=>{
 const root='file:///mock-fixture/api.yaml',schemaId='file:///mock-fixture/shared.yaml';
 const source='openapi: 3.0.4\ninfo: {title: External schema, version: "1"}\npaths:\n  /data:\n    post:\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema: {$ref: "./shared.yaml#/schema"}\n      responses:\n        "204": {description: Empty}\n';
 const schema='# untouched comment\nschema: &schema\n  type: object\n  properties:\n    雪/é~: {type: integer, enum: [9007199254740993]}\n';
 const resource=(id,text)=>({id,text,generation:7,identity:createHash('sha256').update(text).digest('hex')});
 const input=capturedMockStart({root,snapshot:'e'.repeat(64),resources:[resource(root,source),resource(schemaId,schema)]},{errors:false}),original=JSON.stringify(input);
 const {port}=await start(t,input),res=await request(port,'/data','{"雪/é~":9007199254740992}');
 assert.equal(res.status,422,res.text);
 const findings=JSON.parse(res.headers['sl-violations']);
 assert.ok(findings.some(finding=>finding.location.includes('雪/é~')&&finding.source.resource===root&&finding.source.pointer.endsWith('/schema')),JSON.stringify(findings));
 assert.match(res.headers['sl-violations'],/\\u96ea/);
 assert.equal(JSON.stringify(input),original);
});

test('a stale derived identity cannot start the native mock',{timeout:20000},async t=>{
 const input=mockStart(contract('3.0.4',{zero:{type:'integer'}}));input.derived.identity='f'.repeat(64);
 const event=await start(t,input,{failure:true});assert.equal(event.event,'failed');assert.equal(event.failure.code,'mock.capture.changed');
});

test('native mock diagnostic headers remain valid bounded JSON with long Unicode paths',{timeout:20000},async t=>{
 const properties=Object.fromEntries(Array.from({length:8},(_,index)=>[index+'雪'.repeat(300),{type:'integer'}]));
 const input=mockStart(contract('3.0.4',{data:{type:'object',properties}})),{port}=await start(t,input);
 const res=await request(port,'/data',JSON.stringify(Object.fromEntries(Object.keys(properties).map(name=>[name,'wrong']))));
 assert.equal(res.status,422,res.text);
 const header=res.headers['sl-violations'],findings=JSON.parse(header);
 assert.ok(Buffer.byteLength(header)<=8000);assert.ok(findings.some(finding=>finding.code==='report.header.limit'));
 assert.ok(findings.some(finding=>finding.source.resource===input.capture.root));
});

test('an unsupported captured dialect cannot be reported as mock readiness',{timeout:20000},async t=>{
 const input=mockStart(contract('3.1.2',{data:{type:'string'}}));
 const resource=input.capture.resources[0];resource.text=resource.text.replace('"schema":{"type":"string"}','"schema":{"$schema":"https://example.invalid/dialect","type":"string"}');
 resource.identity=createHash('sha256').update(resource.text).digest('hex');
 const event=await start(t,input,{failure:true});assert.equal(event.event,'failed');assert.equal(event.failure.kind,'unsupported');
 assert.equal(event.failure.source.resource,input.capture.root);assert.ok(event.failure.source.pointer.includes('/schema'));assert.ok(event.failure.source.range[1]>event.failure.source.range[0]);
});

test('undecoded structured request media returns explicit incompleteness even with mock errors disabled',{timeout:20000},async t=>{
 const document=contract('3.2.1',{data:{type:'object'}}),body=document.paths['/data'].post.requestBody;
 body.content={'application/vnd.busyapi-opaque':{schema:{type:'object'}}};
 const {port}=await start(t,mockStart(document,{errors:false})),res=await request(port,'/data','abc',{mediaType:'application/vnd.busyapi-opaque'});
 assert.equal(res.status,501,res.text);const report=JSON.parse(res.text);assert.equal(report.complete,false);
 assert.ok(report.findings.some(finding=>finding.kind==='unsupported'&&finding.code==='runtime.request.body.unchecked'));
});

test('malformed and implementation-defined request Content-Types have distinct outcomes',{timeout:20000},async t=>{
 const {port}=await start(t,mockStart(contract('3.0.4',{data:{type:'integer'}})));
 const invalid=await request(port,'/data','0',{mediaType:'broken'});assert.equal(invalid.status,422,invalid.text);
 const unsupported=await request(port,'/data','0',{mediaType:'application/json; charset=utf-8; charset=us-ascii'});
 assert.equal(unsupported.status,501,unsupported.text);assert.equal(JSON.parse(unsupported.text).complete,false);
 assert.ok(JSON.parse(unsupported.text).findings.some(finding=>finding.kind==='unsupported'&&finding.source.range[1]>finding.source.range[0]));
});

test('native mock retains the existing resource limit above 256 captured files',{timeout:20000},async t=>{
 const document=contract('3.0.4',{data:{$ref:'#/components/schemas/S299'}}),root='file:///mock-fixture/api.json';
 document.components={schemas:Object.fromEntries(Array.from({length:300},(_,index)=>['S'+index,{$ref:'./models/s'+index+'.json#/Schema'}]))};
 const resource=(id,text)=>({id,text,generation:1,identity:createHash('sha256').update(text).digest('hex')});
 const resources=[resource(root,JSON.stringify(document)),...Array.from({length:300},(_,index)=>resource('file:///mock-fixture/models/s'+index+'.json','{"Schema":{"type":"integer","enum":[9007199254740993]}}'))];
 const input=capturedMockStart({root,snapshot:'d'.repeat(64),resources}),original=JSON.stringify(resources),{port}=await start(t,input);
 assert.equal((await request(port,'/data','9007199254740993')).status,204);
 assert.equal((await request(port,'/data','9007199254740992')).status,422);
 assert.equal(JSON.stringify(resources),original);
});

test('disconnecting a native validation proxy client cancels its actual upstream request',{timeout:20000},async t=>{
 let entered,closed;
 const upstreamEntered=new Promise(resolve=>entered=resolve),upstreamClosed=new Promise(resolve=>closed=resolve);
 const upstream=http.createServer((req,res)=>{
  req.resume();req.on('end',()=>entered());
  res.once('close',()=>{if(!res.writableEnded)closed();});
 });
 await new Promise((resolve,reject)=>{upstream.once('error',reject);upstream.listen(0,'127.0.0.1',resolve);});
 t.after(()=>new Promise(resolve=>{upstream.closeAllConnections();upstream.close(resolve);}));
 const {port}=await start(t,mockStart(contract('3.0.4',{data:{type:'integer'}}),{upstream:'http://127.0.0.1:'+upstream.address().port}));
 const req=http.request({host:'127.0.0.1',port,path:'/data',method:'POST',headers:{'content-type':'application/json','content-length':1}});
 req.once('error',()=>{});req.end('0');
 await upstreamEntered;req.destroy();await upstreamClosed;
});

test('native media framing checks schema-free and wildcard JSON without inventing schema constraints',{timeout:20000},async t=>{
 const document=contract('3.0.4',{absent:{},wildcard:{}});
 delete document.paths['/absent'].post.requestBody;
 document.paths['/wildcard'].post.requestBody.content={'*/*':{}};
 const {port}=await start(t,mockStart(document));
 for(const route of ['/absent','/wildcard']){
  for(const value of ['false','0','null','""'])assert.equal((await request(port,route,value)).status,204);
  assert.equal((await request(port,route,'{bad')).status,422);
 }
});

test('native validation retains the pinned callback string projection and original request bytes',{timeout:20000},async t=>{
 let delivered;const received=new Promise(resolve=>delivered=resolve);
 const callback=http.createServer((req,res)=>{
  const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{
   delivered({method:req.method,path:req.url,body:Buffer.concat(chunks).toString()});res.statusCode=204;res.end();
  });
 });
 await new Promise((resolve,reject)=>{callback.once('error',reject);callback.listen(0,'127.0.0.1',resolve);});
 t.after(()=>new Promise(resolve=>{callback.closeAllConnections();callback.close(resolve);}));
 const document=contract('3.0.4',{data:{type:'object',required:['target'],properties:{target:{type:'string'}}}});
 document.paths['/data'].post.callbacks={after:{'{$request.body#/target}':{post:{
  requestBody:{content:{'application/json':{schema:{type:'object'},example:{delivered:true}}}},responses:{204:{description:'Received'}}}}}};
 const input=mockStart(document),original=JSON.stringify(input.capture),{port}=await start(t,input);
 const response=await request(port,'/data',JSON.stringify({target:'http://127.0.0.1:'+callback.address().port+'/callback'}));
 assert.equal(response.status,204,response.text);
 const timer=setTimeout(()=>delivered({timeout:true}),5000);
 try{assert.deepEqual(await received,{method:'POST',path:'/callback',body:'{"delivered":true}'});}finally{clearTimeout(timer);}
 assert.equal(JSON.stringify(input.capture),original);
});

for(const mediaType of ['application/xml','application/linkset','application/linkset+json'])test(`modeled mock ${mediaType} emits proved bytes and HTTP Link Header content`,{timeout:20000},async t=>{
 const xml=mediaType==='application/xml';
 const data={linkset:[{anchor:'/context',next:[{href:'/p',title:'a,b; c','title*':[{value:'雪',language:'ja'}]}]}]};
 const schema=xml?{type:'object',xml:{name:'payload'},required:['value'],properties:{value:{type:'number',enum:['__exact__']}}}:{type:'object',enum:[data]};
 const example=xml?{value:'__exact__'}:data;
 const document={openapi:'3.2.1',info:{title:'Modeled mock',version:'1'},paths:{'/data':{post:{responses:{200:{description:'OK',
  headers:{Link:{content:{'application/linkset':{schema:{type:'object',enum:[data]}}},examples:{authored:{dataValue:data}}}},
  content:{[mediaType]:{schema,examples:{authored:{dataValue:example}}}}
 }}}}}};
 const source=JSON.stringify(document).replaceAll('"__exact__"','9007199254740993'),original=source;
 const {port}=await start(t,mockStart(source)),response=await request(port,'/data');
 assert.equal(response.status,200,response.text);assert.equal(response.headers['busyapi-response-validation-complete'],'true');
 assert.match(response.headers.link,/title="a,b; c"/);assert.match(response.headers.link,/title\*=UTF-8'ja'%E9%9B%AA/);
 if(xml)assert.match(response.text,/>9007199254740993</);
 else if(mediaType==='application/linkset')assert.match(response.text,/^<\/p>; rel="next"/);
 else assert.deepEqual(JSON.parse(response.text),data);
 assert.equal(source,original);
});
for(const mediaType of ['application/xml','application/linkset','application/linkset+json'])test(`generated ${mediaType} mock bodies use captured constraints without authored media examples`,{timeout:20000},async t=>{
 const xml=mediaType==='application/xml',value=xml?{value:'__exact__'}:{linkset:[{next:[{href:'/p'}]}]};
 const schema=xml?{type:'object',xml:{name:'generated'},const:value,required:['value'],properties:{value:{type:'number'}}}:{type:'object',const:value};
 const document={openapi:'3.2.1',info:{title:'Generated wire',version:'1'},paths:{'/data':{post:{responses:{200:{description:'OK',content:{[mediaType]:{schema}}}}}}}};
 const {port}=await start(t,mockStart(JSON.stringify(document).replaceAll('"__exact__"','9007199254740993'))),response=await request(port,'/data');
 assert.equal(response.status,200,response.text);assert.equal(response.headers['busyapi-response-validation-complete'],'true');
 if(xml)assert.match(response.text,/<generated[^>]*><value[^>]*>9007199254740993<\/value>/);
 else if(mediaType==='application/linkset')assert.equal(response.text,'</p>; rel="next"');
 else assert.deepEqual(JSON.parse(response.text),value);
});
for(const authored of [false,true])test(`mock multipart XML/Linkset response uses shared captured generation (${authored?'authored data':'schema sample'})`,{timeout:20000},async t=>{
 const value={xml:{n:'__exact__'},links:{linkset:[{next:[{href:'../p',title:'a,b','title*':[{value:'雪',language:'ja'}]}]}]}};
 const link={type:'object',required:['linkset']},schema={type:'object',required:['xml','links'],properties:{xml:{type:'object',xml:{name:'Part'},required:['n'],properties:{n:{type:'number',enum:['__exact__']}}},links:link},...(!authored?{const:value}:{})};
 const media={schema,...(authored?{examples:{authored:{dataValue:value}}}:{}),encoding:{xml:{contentType:'application/xml; charset=utf-16be',headers:{'Content-Type':{required:true,schema:false},Link:{required:true,content:{'application/linkset':{schema:link}},examples:{link:{dataValue:value.links}}}}},links:{contentType:'application/linkset'}}};
 const document={openapi:'3.2.1',info:{title:'Mock parts',version:'1'},paths:{'/parts':{get:{responses:{200:{description:'OK',content:{'multipart/mixed':media}}}}}}};
 const input=mockStart(JSON.stringify(document).replaceAll('"__exact__"','9007199254740993')),original=JSON.stringify(input.capture),{port}=await start(t,input);
 const response=await new Promise((resolve,reject)=>{const call=http.get({hostname:'127.0.0.1',port,path:'/parts'},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)}));});call.on('error',reject);});
 assert.equal(response.status,200,response.bytes.toString());assert.equal(response.headers['busyapi-response-validation-complete'],'true');assert.match(response.headers['content-type'],/boundary=/);
 const wire=response.bytes.toString('latin1');assert.match(wire,/Content-Type: application\/xml; charset=utf-16be/);assert.match(wire,/title\*=UTF-8'ja'%E9%9B%AA/);assert(wire.includes('\0P\0a\0r\0t'));assert(wire.includes('9007199254740993'.split('').map(character=>'\0'+character).join('')));
 assert.equal(JSON.stringify(input.capture),original);
});
test('generated URL-form mock response serializes XML and Linkset fields with their captured schemas',{timeout:20000},async t=>{
 const data={xml:{n:'__exact__'},links:{linkset:[{next:[{href:'/n',title:'a,b'}]}]}};
 const schema={type:'object',const:data,required:['xml','links'],properties:{xml:{type:'object',xml:{name:'Value'},required:['n'],properties:{n:{type:'number'}}},links:{type:'object',required:['linkset']}}};
 const document={openapi:'3.2.1',info:{title:'Mock form media',version:'1'},paths:{'/form':{post:{responses:{200:{description:'OK',content:{'application/x-www-form-urlencoded':{schema,encoding:{xml:{contentType:'application/xml; charset=utf-16be'},links:{contentType:'application/linkset'}}}}}}}}}};
 const input=mockStart(JSON.stringify(document).replaceAll('"__exact__"','9007199254740993')),original=JSON.stringify(input.capture),{port}=await start(t,input),response=await request(port,'/form');
 assert.equal(response.status,200,response.text);assert.equal(response.headers['busyapi-response-validation-complete'],'true');assert.match(response.text,/xml=%00%3C/);assert.match(response.text,/links=%3C%2Fn%3E/);assert.equal(JSON.stringify(input.capture),original);
});
for(const mediaType of ['application/linkset','application/linkset+json'])test(`minimal ${mediaType} schema gets a format-valid original-schema-proved witness`,{timeout:20000},async t=>{
 const schema={type:'object',required:['linkset']},document={openapi:'3.2.1',info:{title:'Minimal links',version:'1'},paths:{'/links':{post:{responses:{200:{description:'OK',headers:{Link:{required:true,content:{'application/linkset':{schema}}}},content:{[mediaType]:{schema}}}}}}}};
 const {port}=await start(t,mockStart(document)),response=await request(port,'/links');assert.equal(response.status,200,response.text);assert.equal(response.headers['busyapi-response-validation-complete'],'true');
 if(mediaType==='application/linkset+json')assert.deepEqual(JSON.parse(response.text),{linkset:[]});else assert.equal(response.text,'');
 assert.equal(response.headers.link,'');
});
