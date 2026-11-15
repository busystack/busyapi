const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const YAML=require('yaml');
const {mockStart,startMock}=require('./mock_test_capture.cjs');

const high='9007199254740993.00',low='9007199254740992.00';
function wire(port,path,headers={}){
 return new Promise((resolve,reject)=>{
  const request=http.get({host:'127.0.0.1',port,path,headers},response=>{
   const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.once('error',reject);
   response.once('end',()=>resolve({status:response.statusCode,text:Buffer.concat(chunks).toString(),headers:response.headers}));
  });request.once('error',reject);
 });
}

for(const mediaType of ['application/x-www-form-urlencoded','multipart/form-data'])for(const declaration of ['200','2XX','default'])
test(`${declaration} generated ${mediaType} retains its declaration and concrete HTTP status`,{timeout:20000},async t=>{
 const value='café+a&b',document={openapi:'3.2.1',info:{title:'Selected form response',version:'1'},paths:{'/form':{get:{responses:{[declaration]:{
  description:'Captured form',content:{[mediaType]:{schema:{type:'object',properties:{value:{type:'string',enum:[value]}},required:['value'],additionalProperties:false},examples:{captured:{dataValue:{value}}}}}
 }}}}}};
 const input=mockStart(document),original=JSON.stringify(input.capture),{port}=await startMock(t,input);
 for(const [status,choice]of [[200,'example=captured'],[declaration==='2XX'?201:declaration==='default'?500:200,'dynamic=true']]){
  const response=await wire(port,'/form',{accept:mediaType,prefer:'code='+status+','+choice});
  assert.equal(response.status,status,response.text);
  assert.equal(response.headers['busyapi-response-validation-complete'],'true');
  assert.deepEqual(JSON.parse(response.headers['sl-violations']??'[]'),[]);
  assert.equal(Number(response.headers['content-length']),Buffer.byteLength(response.text));
  if(mediaType==='application/x-www-form-urlencoded')assert.equal(response.text,'value=caf%C3%A9%2Ba%26b');
  else{
   const boundary=/boundary="?([^";]+)"?/.exec(response.headers['content-type'])?.[1];assert(boundary,response.headers['content-type']);
   assert(response.text.startsWith('--'+boundary+'\r\n'));assert(response.text.endsWith('--'+boundary+'--\r\n'));
   assert.equal((response.text.match(/name="value"/g)??[]).length,1);assert(response.text.includes('\r\n\r\n'+value+'\r\n'));
  }
 }
 assert.equal(JSON.stringify(input.capture),original,'Response generation changed captured source');
});

for(const version of ['3.0.4','2.0','3.1.2','3.2.1'])for(const format of ['yaml','json'])for(const errors of [true,false])
test(`${version} ${format} errors=${errors} native samples preserve pinned response negotiation`,{timeout:20000},async t=>{
 const swagger=version==='2.0';
 const response=marker=>({description:'Captured response',...(swagger
  ?{schema:{type:'integer',default:marker,enum:[marker]}}
  :{content:{'application/json':{schema:{type:'integer',default:marker,enum:[marker]}}}})});
 const responses={200:response('BIG'),401:response('LOW'),422:response('LOW'),default:response('LOW')};
 if(!swagger){
  responses['2XX']=response('BIG');
  responses[200].content['application/problem+json']={schema:{type:'integer',enum:['LOW']}};
 }
 const operation={security:[{Key:[]}],parameters:[{in:'query',name:'q',required:true,
  ...(swagger?{type:'string',enum:['ok']}:{schema:{type:'string',enum:['ok']}})}],responses};
 const paths={'/data':{get:operation}};
 if(!swagger)paths['/named']={get:{...operation,responses:{200:response('BIG'),422:{description:'Named errors',
  content:{'application/json':{schema:{type:'integer',enum:['LOW','BIG']},examples:{default:{value:'LOW'},picked:{value:'BIG'}}}}}}}};
 const schemes={Key:{type:'apiKey',in:'header',name:'X-Key'}};
 const document={[swagger?'swagger':'openapi']:version,info:{title:'Negotiation',version:'1'},
  ...(swagger?{produces:['application/json'],securityDefinitions:schemes}:{components:{securitySchemes:schemes}}),paths};
 const text=(format==='json'?JSON.stringify(document):YAML.stringify(document))
  .replaceAll('"BIG"',high).replaceAll('BIG',high).replaceAll('"LOW"',low).replaceAll('LOW',low);
 const input=mockStart(text,{errors},'file:///sample-negotiation/api.'+format),before=JSON.stringify(input);
 const {port}=await startMock(t,input);
 const send=async(path,headers,status,expected)=>{
  const response=await wire(port,path,headers);
  assert.equal(response.status,status,response.text);assert.equal(response.text,expected);
  assert.equal(response.headers['busyapi-response-validation-complete'],'true');
  assert.equal(Number(response.headers['content-length']),Buffer.byteLength(expected));
  const findings=JSON.parse(response.headers['sl-violations']??'[]');
  assert.ok(!findings.some(value=>value.location?.[0]==='response'),JSON.stringify(findings));
  return response;
 };
 const key={'X-Key':'synthetic-sample-key'};
 await send('/data?q=ok',key,200,high);
 await send('/data',key,422,low);
 await send('/data',{},401,low);
 await send('/data?q=wrong',key,422,low);
 await send('/data?q=ok',{...key,prefer:'code=500,dynamic=true'},500,low);
 await send('/data?q=ok',{...key,prefer:'code=201,dynamic=true'},201,swagger?low:high);
 if(!swagger){
  await send('/data?q=ok',{...key,accept:'application/problem+json'},200,low);
  await send('/named',{...key,prefer:'code=422,example=picked,dynamic=true'},422,high);
  await send('/named?q=ok',{...key,prefer:'code=422,example=picked'},422,high);
 }
 assert.equal(JSON.stringify(input),before,'Negotiation altered captured source');
});

for(const format of ['yaml','json'])for(const produces of [undefined,[]])
test(`2.0 ${format} ${produces?'empty':'omitted'} produces retains a generated exact JSON value`,{timeout:15000},async t=>{
 const document={swagger:'2.0',info:{title:'Optional media',version:'1'},...(produces?{produces}:{}),
  paths:{'/data':{get:{responses:{200:{description:'Generated',schema:{type:'integer',default:'BIG'}}}}}}};
 const text=(format==='json'?JSON.stringify(document):YAML.stringify(document)).replaceAll('"BIG"',high).replaceAll('BIG',high);
 const {port}=await startMock(t,mockStart(text,{},'file:///optional-media/api.'+format));
 const response=await wire(port,'/data',{accept:'application/json'});
 assert.equal(response.status,200,response.text);assert.equal(response.text,high);
 assert.equal(response.headers['content-type'],'application/json');
 assert.equal(response.headers['busyapi-response-validation-complete'],'true');
 assert.deepEqual(JSON.parse(response.headers['sl-violations']??'[]'),[]);
});
