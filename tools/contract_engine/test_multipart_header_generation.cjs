const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const engine=process.env.BUSYAPI_HEADER_GENERATION_BASELINE||__dirname;
const YAML=require(path.join(engine,'node_modules/yaml'));
const {requestMultipartEncoding}=require(path.join(engine,'dist/execution.cjs'));
const versions=['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
const meta='{"id":9007199254740993.00,"flag":false,"empty":""}';

for(const version of ['3.0.4','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])
test(`${version} ${format} concrete MIME Header example selection retains approved bytes and original proof`,async()=>{
 const {requestMultipartPlan}=require(path.join(engine,'dist/execution.cjs'));
 const input=fixture(version,format,false,{
  Approved:{externalValue:'header.bin'},'':{externalValue:'header.bin'},
 });
 const bytes=Buffer.from(meta),id='file:///generated-headers/header.bin';
 input.exampleResources=[{version:1,id,generation:0,identity:require('node:crypto').createHash('sha256').update(bytes).digest('hex'),state:'available',aliases:[],byteLength:bytes.length,base64:bytes.toString('base64')}];
 const ordered=version.startsWith('3.2.');
 if(ordered){
  const document=YAML.parse(input.resources[0].text),media=document.paths['/parts'].post.requestBody.content[input.mediaType];
  media.schema={type:'array',items:{type:'string'}};
  media.itemEncoding=media.encoding.value;
  delete media.encoding;
  input.resources[0].text=format==='yaml'?YAML.stringify(document):JSON.stringify(document);
 }
 const position=ordered?'/0':'/value';
 const selection={...input,text:ordered?'["value"]':'{"value":"value"}',files:[],headers:{[position]:[{name:'X-Meta',value:'',example:{name:'Approved'}}]}};
 const inspected=await requestMultipartPlan({...selection,inspect:true}),header=inspected.controls.find(value=>value.name===position).headerControls[0];
 assert.equal(header.examples[0].external.resource,id);assert.equal(header.examples[0].wireBase64,undefined);
 const prepared=await requestMultipartPlan(selection);assert.equal(prepared.tree.parts[0].headers[0].value,meta);
 const emptyName=await requestMultipartPlan({...selection,headers:{[position]:[{name:'X-Meta',value:'',example:{name:''}}]}});
 assert.equal(emptyName.tree.parts[0].headers[0].value,meta);
 const wire=value=>'--Example\r\n'+(ordered?'':'Content-Disposition: form-data; name="value"\r\n')+'Content-Type: text/plain\r\nX-Meta: '+value+'\r\n\r\nvalue\r\n--Example--\r\n';
 assert.equal((await requestMultipartPlan({...selection,wire:Buffer.from(wire(meta)).toString('base64'),wireType:'multipart/mixed; boundary=Example'})).proof.valid,true);
 await rejectChangedHeader({...selection,wire:Buffer.from(wire(meta.replace('9007199254740993.00','9007199254740992'))).toString('base64'),wireType:'multipart/mixed; boundary=Example'});
 await assert.rejects(requestMultipartPlan({...selection,exampleResources:[]}),error=>error.code==='request.multipart.header.example');
 await assert.rejects(requestMultipartPlan({...selection,headers:{[position]:[{name:'X-Meta',value:'literal',example:{name:'Approved'}}]}}),error=>error.code==='request.multipart.headers');
});
function fixture(version,format,transfer=false,examples){
 const root='file:///generated-headers/api.'+format,mediaType=transfer?'multipart/form-data':'multipart/mixed';
 const header=transfer?{content:{'text/plain':{schema:{type:'string',enum:['base64']}}}}:{required:true,content:{'application/json':{schema:{type:'object',required:['id','flag','empty'],properties:{id:{type:'integer',enum:['EXACT']},flag:{type:'boolean',enum:[false]},empty:{type:'string',maxLength:0}}}}}};
 if(examples!==undefined)header.examples=examples;
 const name=transfer?'Content-Transfer-Encoding':'X-Meta';
 const value={openapi:version,info:{title:'Keep 雪',version:'unrelated'},paths:{'/parts':{post:{requestBody:{content:{[mediaType]:{schema:{type:'object',properties:{value:{type:'string'}}},encoding:{value:{contentType:'text/plain',headers:{[name]:{$ref:'headers.yaml#/Alias'}}}}}}},responses:{204:{description:'Empty'}}}}}};
 const text=(format==='json'?JSON.stringify(value):'# Keep exact source\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'));
 const shared=('# Keep shared alias\r\n'+YAML.stringify({Actual:header,Alias:header}).replaceAll('\n','\r\n')).replaceAll('EXACT','9007199254740993.00');
 return {root,resource:root,pointer:'/paths/~1parts/post',snapshot:version+format,mediaType,resources:[{id:root,text,generation:2},{id:'file:///generated-headers/headers.yaml',text:shared,generation:3}],parts:[{name:'value',kind:'string'}],files:[],headers:transfer?{}:{value:[{name,value:meta}]}};
}
async function rejectChangedHeader(input){
 const {requestMultipartPlan}=require(path.join(engine,'dist/execution.cjs'));
 const {evaluateSchemas}=require(path.join(engine,'dist/schema_evaluation.cjs'));
 // Construction rejects bytes that differ from the captured choice, even if
 // those bytes happen to satisfy a schema. Independently observe validation of
 // this changed large integer against the original referenced Header schema.
 await assert.rejects(requestMultipartPlan(input),error=>error.code==='request.multipart.identity');
 const pointer=input.pointer+'/requestBody/content/multipart~1mixed';
 const checked=await evaluateSchemas({...input,runtimeInstances:[{
  subject:'request-body',location:input.mediaType,text:input.wire,mediaBase64:true,mediaType:input.wireType,
  form:{resource:input.root,pointer},schema:{resource:input.root,pointer:pointer+'/schema'},
 }]});
 assert.equal(checked.complete,true,JSON.stringify(checked.runtimeFindings));
 // The body projection and nested Header have separate evaluations.
 assert.equal(checked.runtimeEvaluations.every(value=>value.valid===true),false);
 assert(checked.runtimeFindings.some(value=>value.schema?.resource===input.resources[1].id));
}
for(const version of versions.filter(version=>!version.startsWith('3.2.')))for(const format of ['yaml','json'])test(`${version} ${format} generated generic MIME headers retain explicit exact wire values`,async()=>{
 const input=fixture(version,format),before=JSON.stringify(input.resources),result=await requestMultipartEncoding(input);
 assert.equal(result.identity.length,64);assert.equal(result.snapshot,input.snapshot);
 assert.deepEqual(result.parts.value.headers.map(({name,value})=>({name,value})),[{name:'X-Meta',value:meta}]);
 assert.deepEqual(result.parts.value.string,{schemaEncoded:false});assert.equal(JSON.stringify(input.resources),before);
});
for(const version of versions)for(const format of ['yaml','json'])test(`${version} ${format} captured transfer Header content selects an implemented valid token`,async()=>{
 const input=fixture(version,format,true),before=JSON.stringify(input.resources),result=await requestMultipartEncoding(input);
 assert.equal(result.parts.value.string.encoding,'base64');assert.equal(result.parts.value.string.schemaEncoded,false);
 assert.equal(result.parts.value.string.source.resource,input.root);assert.match(result.parts.value.string.source.pointer,/\/headers\/Content-Transfer-Encoding$/);
 assert.equal(JSON.stringify(input.resources),before);
});
for(const version of ['3.0.4','3.1.2'])for(const format of ['yaml','json'])test(`${version} ${format} malformed or stale MIME inputs cannot produce header lines`,async()=>{
 const input=fixture(version,format);
 for(const [fields,code]of [
  [[{name:'Bad Name',value:'x'}],'request.multipart.header.syntax'],
  [[{name:'X-Meta',value:'x\r\nInjected: yes'}],'request.multipart.header.syntax'],
  [[{name:'X-Meta',value:'\0'}],'request.multipart.header.syntax'],
  [[{name:'X-Meta',value:'café'}],'request.multipart.header.syntax'],
  [[{name:'Content-Type',value:'text/plain'}],'request.multipart.header.controlled'],
  [[{name:'Content-Disposition',value:'override'}],'request.multipart.header.controlled'],
  [[{name:'Content-Transfer-Encoding',value:'base64'}],'request.multipart.header.controlled'],
  [[{name:'X-Meta',value:'x'.repeat(8193)}],'limit.request.multipart.headers'],
  [Array.from({length:62},()=>({name:'X-Field',value:'x'})),'request.multipart.headers'],
 ])await assert.rejects(requestMultipartEncoding({...input,headers:{value:fields}}),error=>error.code===code);
 await assert.rejects(requestMultipartEncoding({...input,headers:{removed:[]}}),error=>error.code==='request.multipart.header.stale');
 const empty=await requestMultipartEncoding({...input,headers:{value:[{name:'X-Empty',value:''},{name:'X-Empty',value:'0'}]}});
 assert.deepEqual(empty.parts.value.headers.map(({name,value})=>({name,value})),[{name:'X-Empty',value:''},{name:'X-Empty',value:'0'}]);
 const before=JSON.stringify(input.resources);await requestMultipartEncoding(input);assert.equal(JSON.stringify(input.resources),before);
});
for(const version of ['3.0.4','3.1.2','3.2.1'])test(`${version} form-data cannot transmit an additional ignored MIME header`,async()=>{
 await assert.rejects(requestMultipartEncoding({...fixture(version,'yaml',true),headers:{value:[{name:'X-Extra',value:'x'}]}}),error=>error.code==='request.multipart.header.forbidden');
});

for(const version of ['3.1.2','3.2.1'])test(`${version} MIME base64 model strings retain non-folding spelling on actual entity evaluation`,async()=>{
 const {evaluateSchemas}=require(path.join(engine,'dist/schema_evaluation.cjs'));
 for(const [wire,model]of [['Zg== ','Zg== '],['Zg==\t','Zg==\t'],['Zg==!','Zg==!'],['Zg==\r\n','Zg==']]){
  const input=fixture(version,'json',true),value=JSON.parse(input.resources[0].text);
  const at='/paths/~1parts/post/requestBody/content/multipart~1form-data';
  value.paths['/parts'].post.requestBody.content[input.mediaType].schema.properties.value={type:'string',contentEncoding:'base64',enum:[model]};
  input.resources[0].text=JSON.stringify(value);
  const text='--Fixture\r\nContent-Disposition: form-data; name="value"\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: base64\r\n\r\n'+wire+'\r\n--Fixture--\r\n';
  const result=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:input.mediaType,text:Buffer.from(text).toString('base64'),mediaType:input.mediaType+'; boundary=Fixture',mediaBase64:true,form:{resource:input.root,pointer:at},schema:{resource:input.root,pointer:at+'/schema'}}]});
  assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.equal(result.runtimeEvaluations.every(value=>value.valid===true),true,JSON.stringify(result.runtimeFindings));
 }
});
for(const version of versions)for(const format of ['yaml','json'])test(`${version} ${format} actual form-data token Header content uses captured media semantics`,async()=>{
 const {evaluateSchemas}=require(path.join(engine,'dist/schema_evaluation.cjs'));
 const input=fixture(version,format,true),value=YAML.parse(input.resources[0].text),at='/paths/~1parts/post/requestBody/content/multipart~1form-data';
 value.paths['/parts'].post.requestBody.content[input.mediaType].schema.properties.value={type:'string',enum:['f']};
 input.resources[0].text=format==='yaml'?YAML.stringify(value):JSON.stringify(value);
 const original=JSON.stringify(input.resources);
 for(const [token,valid]of [['base64',true],['binary',false]]){
  const text='--Fixture\r\nContent-Disposition: form-data; name="value"\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: '+token+'\r\n\r\nZg==\r\n--Fixture--\r\n';
  const result=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:input.mediaType,text:Buffer.from(text).toString('base64'),mediaType:input.mediaType+'; boundary=Fixture',mediaBase64:true,form:{resource:input.root,pointer:at},schema:{resource:input.root,pointer:at+'/schema'}}]});
  assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.equal(result.runtimeEvaluations.every(value=>value.valid===true),valid,JSON.stringify(result.runtimeFindings));
  if(!valid)assert(result.runtimeFindings.some(value=>value.schema?.resource===input.resources[1].id));
 }
 assert.equal(JSON.stringify(input.resources),original);
});

for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])test(`${version} ${format} ordered Header values use actual position and original Header schema`,async()=>{
 const {requestMultipartPlan}=require(path.join(engine,'dist/execution.cjs'));
 const input=fixture(version,format),value=YAML.parse(input.resources[0].text);
 value.paths['/parts'].post.requestBody.content['multipart/mixed']={schema:{type:'array',items:{type:'string'}},itemEncoding:{contentType:'text/plain',headers:{'X-Meta':{$ref:'headers.yaml#/Alias'}}}};
 input.resources[0].text=format==='yaml'?YAML.stringify(value):JSON.stringify(value);
 const typed={...input,text:'["value"]',files:[],headers:{'/0':[{name:'X-Meta',value:meta}]}};
 const plan=await requestMultipartPlan(typed);assert.equal(plan.tree.parts[0].headers[0].value,meta);
 const wire=value=>'--W4\r\nContent-Type: text/plain\r\nX-Meta: '+value+'\r\n\r\nvalue\r\n--W4--\r\n';
 assert.equal((await requestMultipartPlan({...typed,wire:Buffer.from(wire(meta)).toString('base64'),wireType:'multipart/mixed; boundary=W4'})).proof.valid,true);
 await rejectChangedHeader({...typed,wire:Buffer.from(wire(meta.replace('9007199254740993.00','9007199254740992'))).toString('base64'),wireType:'multipart/mixed; boundary=W4'});
 await assert.rejects(requestMultipartPlan({...typed,headers:{'/8':[{name:'X-Meta',value:meta}]}}),error=>error.code==='request.multipart.choice.stale');
 const disposition={...typed,headers:{'/0':[{name:'X-Meta',value:meta},{name:'Content-Disposition',value:'inline'}]}};
 const selected=await requestMultipartPlan(disposition);
 assert.equal(selected.tree.parts[0].allowDisposition,true);
 assert.equal((await requestMultipartPlan({...disposition,wire:Buffer.from(wire(meta).replace('X-Meta:', 'Content-Disposition: inline\r\nX-Meta:')).toString('base64'),wireType:'multipart/mixed; boundary=W4'})).proof.valid,true);
 await assert.rejects(requestMultipartPlan({...disposition,headers:{'/0':[{name:'Content-Disposition',value:'inline'},{name:'content-disposition',value:'attachment'}]}}),error=>error.code==='request.multipart.header.singleton');
 await assert.rejects(requestMultipartPlan({...disposition,wire:Buffer.from(wire(meta).replace('X-Meta:', 'Content-Disposition: attachment\r\nX-Meta:')).toString('base64'),wireType:'multipart/mixed; boundary=W4'}),error=>error.code==='request.multipart.identity');
});
