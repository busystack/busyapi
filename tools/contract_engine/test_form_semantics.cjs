const {prepareMultipart}=require('./multipart_test_capture.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const YAML=require('yaml');
const {analyse}=require('./dist/model.cjs');

for(const version of ['3.0.4','3.1.2','3.2.1'])for(const format of ['json','yaml'])for(const composition of [false,true])test(`${version} ${format} recursive object parts keep their JSON representation and full schema checks composition=${composition}`,async()=>{
 const {requestOperation}=require('./dist/execution.cjs');
 const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
 const root='file:///recursive-form/api.'+format,mediaType='multipart/form-data';
 const node={type:'object',properties:{label:{type:'string'},next:{$ref:'#/components/schemas/Node'}}};
 const document={openapi:version,info:{title:'Recursive form',version:'1'},paths:{'/form':{post:{requestBody:{content:{[mediaType]:{schema:{$ref:'#/components/schemas/Node'}}}},responses:{204:{description:'Empty'}}}}},
  components:{schemas:{Node:composition?{allOf:[node,{properties:{label:{minLength:2}}}]}:node}}};
 const input={root,resource:root,pointer:'/paths/~1form/post',snapshot:'recursive',mediaType,files:[],resources:[{id:root,generation:1,text:format==='json'?JSON.stringify(document):YAML.stringify(document)}]};
 const content=requestOperation(input).requestBody.content[0];
 assert.deepEqual(content.form.parts.next.contentTypes,['application/json']);
 assert.deepEqual(content.form.parts.label.contentTypes,['text/plain']);
 const text='{"label":"outer","next":{"label":"inner"}}',plan=await prepareMultipart({...input,text});
 const part=plan.tree.parts.find(part=>part.name==='next');
 assert.equal(part.contentType,'application/json');assert.equal(Buffer.from(part.bytes,'base64').toString(),'{"label":"inner"}');
 for(const [nested,valid]of [['{"label":"inner"}',true],['{"label":7}',false],['{"label":"x"}',!composition]]){
  const wire='--Recursive\r\nContent-Disposition: form-data; name="label"\r\nContent-Type: text/plain\r\n\r\nouter\r\n--Recursive\r\nContent-Disposition: form-data; name="next"\r\nContent-Type: application/json\r\n\r\n'+nested+'\r\n--Recursive--\r\n';
  const checked=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:mediaType,text:Buffer.from(wire).toString('base64'),mediaBase64:true,mediaType:mediaType+'; boundary=Recursive',form:content.definition??content.source,schema:content.schema,itemSchema:content.itemSchema}]});
  assert.equal(checked.complete,true,JSON.stringify(checked.findings));
  assert.equal(checked.runtimeEvaluations[0].valid,valid,JSON.stringify(checked.runtimeFindings));
 }
 document.components.schemas.Node={properties:{next:{$ref:'#/components/schemas/Node'}}};
 input.resources[0].text=format==='json'?JSON.stringify(document):YAML.stringify(document);
 assert.equal(requestOperation(input).requestBody.content[0].form.shape.properties.next.types,undefined);
});

for(const version of ['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const format of ['json','yaml'])test(`${version} ${format} multipart input schema requirements stay in their family and context`,()=>{
 const document={openapi:version,info:{title:'Multipart schema',version:'1'},paths:{'/form':{post:{
  requestBody:{$ref:'#/components/requestBodies/Body'},responses:{200:{description:'Optional output schema',content:{'multipart/form-data':{}}}},
 }}},components:{requestBodies:{Body:{content:{'multipart/form-data':{}}}}},'x-payload':{requestBody:{content:{'multipart/form-data':{}}}}};
 const root='file:///form-schema/api.'+format;
 const run=()=>analyse({root,snapshot:version+format,resources:[{id:root,text:format==='json'?JSON.stringify(document):YAML.stringify(document),generation:1}]});
 const initial=run(),issues=initial.findings.filter(finding=>finding.code==='media.multipart.schema.required');
 assert.equal(issues.length,version.startsWith('3.0.')?1:0,JSON.stringify(initial.findings));
 if(issues.length){assert.equal(issues[0].pointer,'/components/requestBodies/Body/content/multipart~1form-data');assert.ok(issues[0].range[1]>issues[0].range[0]);}
 document.components.requestBodies.Body.content['multipart/form-data'].schema={};
 assert.equal(run().findings.filter(finding=>finding.severity==='error').length,0);
 document.components.requestBodies.Body.content={'application/x-www-form-urlencoded':{}};
 assert.equal(run().findings.filter(finding=>finding.severity==='error').length,0);
});

for(const version of ['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2'])test(`${version} undeclared newer positional metadata does not activate a codec`,async()=>{
 const {requestOperation}=require('./dist/execution.cjs');
 const root='file:///ignored-position/api.json',media={schema:{type:'object',required:['value'],properties:{value:{type:'integer',enum:[1]}}},
  prefixEncoding:[{contentType:'application/unavailable'}],itemEncoding:{contentType:'application/unavailable'}};
 const input={root,resource:root,pointer:'/paths/~1form/post',snapshot:version,mediaType:'multipart/form-data',files:[],resources:[{id:root,generation:1,text:JSON.stringify({openapi:version,info:{title:'Ignored',version:'1'},paths:{'/form':{post:{requestBody:{content:{'multipart/form-data':media}},responses:{204:{description:'Empty'}}}}}})}]};
 assert.equal(requestOperation(input).requestBody.content[0].formBinding,'multipart-named');
 const wire='--W4\r\nContent-Disposition: form-data; name="value"\r\nContent-Type: text/plain\r\n\r\n1\r\n--W4--\r\n';
 assert.equal((await prepareMultipart({...input,text:'{"value":1}',wireType:'multipart/form-data; boundary=W4',wire:Buffer.from(wire).toString('base64')})).checked.valid,true);
});

for(const version of ['3.2.0','3.2.1'])test(`${version} ordered form-data exposes captured ordering and ignores absent Encoding positions`,async()=>{
 const {requestOperation,requestMultipartPlan,requestMultipartAppend}=require('./dist/execution.cjs');
 const root='file:///form-policy/api.json',media={schema:{type:'array',items:{type:'object',additionalProperties:{type:'integer'}}},prefixEncoding:[{contentType:'text/plain'},{contentType:'application/unavailable'}],itemEncoding:{contentType:'text/plain'}};
 const input={root,resource:root,pointer:'/paths/~1form/post',snapshot:version,mediaType:'multipart/form-data',text:'[{"tag":9007199254740993.00}]',files:[],resources:[{id:root,generation:1,text:JSON.stringify({openapi:version,info:{title:'Policy',version:'1'},paths:{'/form':{post:{requestBody:{content:{'multipart/form-data':media}},responses:{204:{description:'Empty'}}}}}})}]};
 const projected=requestOperation(input).requestBody.content[0];
 assert.equal(projected.formBinding,'multipart-ordered');assert.equal(projected.multipart.usesTree,true);
 const plan=await prepareMultipart(input);assert.equal(plan.tree.parts.length,1);assert.equal(plan.tree.parts[0].name,'tag');
 assert.equal(plan.tree.parts[0].text,'9007199254740993.00');
 assert.equal(requestMultipartAppend({text:input.text,pointer:'',value:'{"tag":false}'}).text,'[{"tag":9007199254740993.00},{"tag":false}]');
 await assert.rejects(prepareMultipart({...input,text:'[{"tag":1},{"tag":2}]'}),error=>error.code==='request.multipart.codec.unsupported'&&error.source.pointer.endsWith('/prefixEncoding/1'));
});

for(const version of ['3.0.4','3.1.2','3.2.1'])test(`${version} an Encoding key absent from schema properties remains inactive`,async()=>{
 const {requestOperation}=require('./dist/execution.cjs');
 const root='file:///ignored-name/api.json',media={schema:{type:'object',properties:{value:{type:'string'}}},encoding:{absent:{contentType:'application/unavailable',headers:{'Content-Transfer-Encoding':{schema:{type:'string',enum:['unavailable']}}},itemEncoding:{contentType:'application/unavailable'}}}};
 const input={root,resource:root,pointer:'/paths/~1form/post',snapshot:version,mediaType:'multipart/form-data',files:[],resources:[{id:root,generation:1,text:JSON.stringify({openapi:version,info:{title:'Ignored name',version:'1'},paths:{'/form':{post:{requestBody:{content:{'multipart/form-data':media}},responses:{204:{description:'Empty'}}}}}})}]};
 const content=requestOperation(input).requestBody.content[0];
 assert.deepEqual(Object.keys(content.encoding),[]);assert.equal(content.formBinding,'multipart-named');assert(!content.form.parts.absent);
 const wire='--W4\r\nContent-Disposition: form-data; name="value"\r\nContent-Type: text/plain\r\n\r\nretained\r\n--W4--\r\n';
 assert.equal((await prepareMultipart({...input,text:'{"value":"retained"}',wireType:'multipart/form-data; boundary=W4',wire:Buffer.from(wire).toString('base64')})).checked.valid,true);
});
