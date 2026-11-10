const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {mockStart,startMock}=require('./mock_test_capture.cjs');
function request(port,path){return new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port,path},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks),text:Buffer.concat(chunks).toString()}));}).on('error',reject));}
for(const version of ['2.0','3.0.4','3.1.2','3.2.1'])test(`${version} constructive patterns, enums, exact numbers and compositions use the original response path`,{timeout:45000},async t=>{
 const modern=version.startsWith('3.1')||version.startsWith('3.2'),legacy=version==='2.0';
 const schemas={
  pattern:{type:'string',pattern:'^(?:AB|CD)[0-9]{3}-[a-z]{2}$',minLength:8,maxLength:8},
  bounded:{type:'string',pattern:'^x+$',minLength:5,maxLength:5},
  enum:{type:'object',required:['n','mode'],properties:{n:{enum:['EXACT']},mode:{enum:['finite','alternate']}},additionalProperties:false},
  array:{type:'array',minItems:2,maxItems:2,uniqueItems:true,items:{type:'integer',enum:[2,3]}},
  object:{type:'object',minProperties:2,properties:{code:{type:'string',pattern:'^Z[0-9]{2}$'},n:{type:'integer',minimum:3,maximum:4}},additionalProperties:false},
  ...(modern?{
   conditional:{type:'object',required:['kind'],properties:{kind:{enum:['chosen']}},if:{properties:{kind:{const:'chosen'}},required:['kind']},then:{required:['value'],properties:{value:{const:'EXACT'}}},else:false},
   recursive:{$ref:'#/components/schemas/Node'},
   binary:{maxLength:5,not:{maxLength:3}},
   encoded:{type:'string',contentEncoding:'base64',pattern:'^[A-Z]{4}==$'},
  }:{}),
 };
 const media=name=>name==='binary'||name==='encoded'?'application/octet-stream':'application/json';
 const doc={[legacy?'swagger':'openapi']:version,info:{title:'Constructive bounded witnesses',version:'1'},...(legacy?{produces:['application/json']}:{}),
  ...(modern?{components:{schemas:{Node:{type:'object',required:['next'],properties:{next:{anyOf:[{type:'null'},{$ref:'#/components/schemas/Node'}]}},additionalProperties:false}}}}:{}),
  paths:Object.fromEntries(Object.entries(schemas).map(([name,schema])=>['/'+name,{get:{responses:{200:{description:'Proved',...(legacy?{schema}:{content:{[media(name)]:{schema}}})}}}}]))};
 const input=mockStart(JSON.stringify(doc).replaceAll('"EXACT"','9007199254740993.00')),original=JSON.stringify(input),ready=await startMock(t,input);
 for(const name of Object.keys(schemas)){
  const response=await request(ready.port,'/'+name);assert.equal(response.status,200,response.text);assert.equal(response.headers['busyapi-response-validation-complete'],'true');assert.equal(response.headers['sl-violations'],undefined);
  if(name==='pattern')assert.match(JSON.parse(response.text),/^(?:AB|CD)[0-9]{3}-[a-z]{2}$/);
  if(name==='bounded')assert.equal(JSON.parse(response.text),'xxxxx');
  if(name==='enum'||name==='conditional')assert(response.text.includes('9007199254740993.00'));
  if(name==='array')assert.deepEqual(new Set(JSON.parse(response.text)),new Set([2,3]));
  if(name==='object')assert.match(JSON.parse(response.text).code,/^Z[0-9]{2}$/);
  if(name==='recursive')assert.deepEqual(JSON.parse(response.text),{next:null});
  if(name==='binary')assert(response.bytes.length>3&&response.bytes.length<=5);
  if(name==='encoded')assert.match(response.text,/^[A-Z]{4}==$/);
 }
 assert.equal(JSON.stringify(input),original);
});

test('authored media bytes retain precedence; unavailable or conflicting witnesses never become successful mocks',{timeout:30000},async t=>{
 const schemas={pattern:{type:'string',pattern:'^(?=never$)other$'},conflict:{type:'integer',minimum:10,maximum:1},recursive:{$ref:'#/components/schemas/Loop'},binary:{type:'object'},bound:{type:'string',minLength:65537}};
 const document={openapi:'3.2.1',info:{title:'Unavailable witnesses',version:'1'},components:{schemas:{Loop:{type:'object',required:['next'],properties:{next:{$ref:'#/components/schemas/Loop'}}}}},paths:{
  ...Object.fromEntries(Object.entries(schemas).map(([name,schema])=>['/'+name,{get:{responses:{200:{description:'Unavailable',content:{[name==='binary'?'application/octet-stream':'application/json']:{schema}}}}}}])),
  '/authored':{get:{responses:{200:{description:'Authored',content:{'text/plain':{schema:{type:'string',pattern:'^[A-Z]{2}[0-9]{2}$'},examples:{first:{serializedValue:'ZZ99'}}}}}}}},
 }};
 const input=mockStart(document),original=JSON.stringify(input),ready=await startMock(t,input);
 for(const name of Object.keys(schemas)){const response=await request(ready.port,'/'+name);assert.equal(response.status,501,response.text);assert.equal(response.headers['busyapi-response-validation-complete'],'false');const problem=JSON.parse(response.text);assert.equal(problem.complete,false);assert(problem.findings.some(value=>/^mock.sample./.test(value.code)));assert.equal(problem.findings[0].source.resource,input.capture.root);}
 const authored=await request(ready.port,'/authored');assert.equal(authored.status,200,authored.text);assert.equal(authored.text,'ZZ99');assert.equal(JSON.stringify(input),original);
});
