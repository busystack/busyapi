const assert = require('node:assert/strict');
const {test} = require('node:test');
const {planMigration} = require('./dist/migration.cjs');
const {requestOperation} = require('./dist/execution.cjs');
const {SourceDocument} = require('./dist/document.cjs');
const {createGraph, analyse} = require('./dist/model.cjs');
const {evaluateSchemas} = require('./dist/schema_evaluation.cjs');

for(const location of ['whole','cookie'])test(`R3c Swagger retains the ${location} native-owner proof boundary`,async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')('3.2.1','json','2.0');
 if(location==='cookie'){
  delete input.value.components.parameters.Whole;
  delete input.value.paths['/p'].parameters;
  input.value.paths['/shared'].get.parameters.shift();
 }
 input.resources[0].text=input.encode(input.value);const result=await planMigration(input);
 assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert.deepEqual(result.changes,[]);
 assert(result.problems.some(problem=>problem.code===(location==='whole'?'migration.parameter.querystring-proof':'migration.parameter.cookie-target')&&
  problem.reason===(location==='whole'?'unavailable-proof':'target-representation')),JSON.stringify(result.problems));
});

const publishedTargets = ['3.0.0', '3.0.1', '3.0.2', '3.0.3', '3.0.4', '3.1.0', '3.1.1', '3.1.2', '3.2.0', '3.2.1'];
for(const version of publishedTargets)for(const format of ['yaml','json'])test(`B05-R2 ${version} ${format} reusable metadata and equivalent examples retain actual consumers`,async()=>{
 const fixture=require('./migration_b05_r2_fixture.cjs'),{input}=fixture.capture(version,format),before=JSON.stringify(input);
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const after=fixture.reopened(result,'file:///cold/r2/');assert.equal(analyse(after).complete,true,JSON.stringify(analyse(after).findings));
 const source=operations(input)[0],target=operations(after)[0];
 const selected=plan=>[plan.parameters.map(p=>[p.name,p.in,p.required,p.deprecated]),plan.requestBody.required,
  plan.requestBody.content.map(m=>[m.mediaType,[...new Set(m.examples.map(e=>e.raw))])]),
  plan.responses.map(r=>[r.status,r.bodyAllowed===false?[]:r.content.map(m=>[m.mediaType,[...new Set(m.examples.map(e=>e.raw))])]),r.headers.map(h=>[h.name,h.required])])];
 assert.deepEqual(selected(target),selected(source));
 assert.equal(target.requestBody.content[0].examples[0].raw,'9007199254740993.00');
 assert.equal(target.responses.find(r=>r.status==='200').content[0].examples.length,1);
 assert.equal(target.responses.find(r=>r.status==='204').content.length,0);
 for(const sample of ['9007199254740993.00','0','-1']){
  const check=async(packet,plan)=>{
   const response=plan.responses.find(r=>r.status==='200');
   const result=await evaluateSchemas({...packet,runtimeInstances:[
    ...[plan.requestBody.content[0].schema,response.content[0].schema].map(schema=>({subject:'request-body',location:sample,text:sample,schema})),
    {subject:'response-header',location:sample,text:'',header:{resource:response.headers[0].source.resource,pointer:response.headers[0].source.pointer,name:'X-Count',values:[sample]}}
   ]});assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(e=>e.valid);
  };
  const expected=await check(input,source);assert(expected.every(valid=>valid===(sample!=='-1')));assert.deepEqual(await check(after,target),expected);
 }
 const text=result.outputs.map(output=>output.text).join('\n');assert(text.includes('9007199254740993.00'));assert(text.includes('literal-only'));
 if(format==='yaml')assert(text.includes('# Preserve R2 owners 雪'));
 const doc=new SourceDocument(result.outputs.find(o=>o.id===result.outputRoot).text,result.outputRoot);
 assert.equal(doc.dataNode('/components'),undefined);assert.equal(doc.dataNode('/parameters/Shared/in').value,'query');
 const independent=await evaluateSchemas({...after,runtimeInstances:[{subject:'request-body',location:'independent',text:'-1',schema:{resource:after.root,pointer:'/definitions/Independent'}}]});
 assert.equal(independent.complete,true);assert(independent.runtimeEvaluations.every(e=>e.valid===false));
 assert.equal(JSON.stringify(input),before);assert.equal((await planMigration(input)).identity,result.identity);
});
for(const format of ['yaml','json'])for(const distinct of [false,true])test(`B05-R2 ${format} schema-less response media and distinct=${distinct} named payloads preserve body presence`,async()=>{
 const {render}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/named.'+format;
 const media={examples:{First:{value:false},Second:{value:distinct?0:false}},encoding:{ignored:{headers:{'X-Ignore':{schema:{type:'object',properties:{n:{type:'integer'}}}}}}}};
 const value={openapi:'3.0.4',info:{title:'Schema-less media',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/items':{get:{responses:{200:{$ref:'#/components/responses/Reply'},204:{description:'Empty'}}}}},
  components:{responses:{Reply:{description:'Payload',content:{'application/json':media}}},schemas:{Independent:{$ref:'#/components/responses/Reply/content/application~1json/encoding/ignored/headers/X-Ignore/schema'}}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:'schema-less-names',targetVersion:'2.0',destination:'file:///review/named/'};
 const result=await planMigration(input);
 if(distinct){assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(p=>p.code==='migration.response.named-examples'&&p.reason==='target-representation'));assert.deepEqual(result.acceptedDecisions,[]);}
 else{
  assert.equal(result.complete,true,JSON.stringify(result.problems));const after=reopened(result),plan=operations(after)[0];
  assert.equal(plan.responses[0].bodyAllowed,true);assert.deepEqual(plan.responses[0].content.map(m=>[m.mediaType,m.examples[0].raw]),[['application/json','false']]);
  assert.equal(plan.responses[1].content.length,0);
  const check=await evaluateSchemas({...after,runtimeInstances:[{subject:'response-body',location:'retained-owner',text:'{"n":3}',schema:{resource:after.root,pointer:'/definitions/Independent'}}]});
  assert.equal(check.complete,true);assert(check.runtimeEvaluations.every(e=>e.valid));
 }
 assert.equal(input.resources[0].text,text);
});
for(const format of ['yaml','json'])for(const distinct of [false,true])test(`B05-R2 ${format} common JSON/text string example distinct=${distinct} requires a byte-preserving schema annotation`,async()=>{
 const {render}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/body.'+format,media=['application/json','text/plain; charset=utf-8'];
 const content=Object.fromEntries(media.map((name,index)=>[name,{schema:{type:'string'},example:distinct&&index?'different':'snow 雪'}]));
 const value={openapi:'3.0.4',info:{title:'Media examples',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/echo':{post:{requestBody:{description:'Request text',required:true,content},responses:{204:{description:'Empty'}}}}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:'body-examples',targetVersion:'2.0',destination:'file:///review/body/'};
 const result=await planMigration(input);assert.equal(result.complete,!distinct,JSON.stringify(result.problems));
 if(distinct){assert.deepEqual(result.outputs,[]);assert(result.problems.some(p=>p.code==='migration.body.media-metadata'&&p.reason==='target-representation'));}
 else{
  const before=operations(input)[0],after=operations(reopened(result))[0];
  assert.deepEqual(after.requestBody.content.map(m=>[m.mediaType,m.examples[0].raw]),before.requestBody.content.map(m=>[m.mediaType,m.examples[0].raw]));
  assert.equal(after.requestBody.required,true);
 }
 assert.equal(input.resources[0].text,text);
});
for(const version of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])test(`B05-R2 ${version} ${format} a media example overrides a shared recursive schema example only at its body use`,async()=>{
 const {render,reopened}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/overrides.'+format;
 const operation=example=>({post:{requestBody:{content:{'application/json':{schema:{$ref:'#/components/schemas/Model'},...(example?{example:{n:1}}:{})}}},responses:{204:{description:'Empty'}}}});
 const value={openapi:version,info:{title:'Example overrides',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/override':operation(true),'/independent':operation(false)},
  components:{schemas:{Model:{type:'object',required:['n'],properties:{n:{type:'integer',enum:[0,1]},next:{$ref:'#/components/schemas/Model'}},example:{n:0}}}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:'sample-overrides',targetVersion:'2.0',destination:'file:///review/override/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));const after=reopened(result);
 for(const packet of [input,after]){
  const plans=operations(packet);assert.deepEqual(plans.find(p=>p.operation.path==='/override').requestBody.content[0].examples.map(e=>e.raw),['{"n":1}']);
  assert.deepEqual(plans.find(p=>p.operation.path==='/independent').requestBody.content[0].examples.map(e=>e.raw),['{"n":0}']);
 }
 const schema=operations(after).find(p=>p.operation.path==='/override').requestBody.content[0].schema;
 const evaluated=await evaluateSchemas({...after,runtimeInstances:['{"n":1,"next":{"n":0}}','{"n":2}'].map(text=>({subject:'request-body',location:text,text,schema}))});
 assert.equal(evaluated.complete,true);assert.deepEqual(evaluated.runtimeEvaluations.map(e=>e.valid),[true,false]);assert.equal(input.resources[0].text,text);
});
for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4','3.1.2'])test(`B05-R2 ${format} active 3.2 response encoding cannot become ignored in ${targetVersion}`,async()=>{
 const {render}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/response-encoding.'+format;
 const value={openapi:'3.2.1',info:{title:'Response parts',version:'1'},paths:{'/parts':{get:{responses:{200:{description:'Parts',content:{'multipart/form-data':{
  schema:{type:'object',properties:{part:{type:'string'}}},encoding:{part:{headers:{'X-Part':{schema:{type:'string',enum:['must remain']}}}}}
 }}}}}}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:'response-parts',targetVersion,destination:'file:///review/parts/'};
 const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
 assert(result.problems.some(p=>p.code==='migration.response.encoding'&&p.reason==='target-representation'),JSON.stringify(result.problems));assert.equal(input.resources[0].text,text);
});
for(const format of ['yaml','json'])test(`B05-R2 ${format} formerly ignored response encoding remains inactive in 3.2`,async()=>{
 const {render,reopened}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/inactive-response-encoding.'+format,type='multipart/form-data; boundary=R2';
 const value={openapi:'3.1.2',info:{title:'Ignored response parts',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/parts':{get:{responses:{200:{description:'Parts',content:{[type]:{
  schema:{type:'object',properties:{part:{type:'string',enum:['plain']}}},encoding:{part:{contentType:'application/json',headers:{'X-Part':{schema:{type:'object'}}}}}
 }}}}}}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:'inactive-response-parts',targetVersion:'3.2.1',destination:'file:///review/inactive-parts/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const after=reopened(result),doc=new SourceDocument(result.outputs.find(output=>output.id===result.outputRoot).text,result.outputRoot);
 assert.equal(doc.dataNode('/paths/~1parts/get/responses/200/content/multipart~1form-data; boundary=R2/encoding'),undefined);
 assert(result.outputs.some(output=>output.text.includes('X-Part')));assert.equal(analyse(after).complete,true);assert.equal(input.resources[0].text,text);
 for(const part of ['plain','wrong']){
  const bytes=Buffer.from('--R2\r\nContent-Disposition: form-data; name="part"\r\n\r\n'+part+'\r\n--R2--\r\n');
  for(const packet of [input,after]){
   const media=operations(packet)[0].responses[0].content[0],check=await evaluateSchemas({...packet,runtimeInstances:[{subject:'response-body',location:part,text:bytes.toString('base64'),mediaBase64:true,mediaType:type,media:media.definition??media.source}]});
   assert.equal(check.complete,true,JSON.stringify(check.findings));assert.deepEqual(check.runtimeEvaluations.map(e=>e.valid),[part==='plain']);
  }
 }
});
for(const format of ['yaml','json'])for(const referenced of [false,true])test(`B05-R2 ${format} ignored Content-Type Header referenced=${referenced} retains annotations and independent schema consumers`,async()=>{
 const {render,reopened}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/ignored-header.'+format;
 const header=referenced?{$ref:'#/components/headers/Type',description:'[Ignored reference](./ignored.md)'}:
  {deprecated:true,required:true,description:'[Ignored header](./ignored.md)',schema:{type:'object',properties:{n:{type:'integer'}}}};
 const value={openapi:'3.1.2',info:{title:'Ignored Header',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/empty':{get:{responses:{204:{description:'Empty',headers:{'Content-Type':header}}}}}},
  components:referenced?{headers:{Type:{schema:{type:'string'}}}}:{schemas:{Independent:{$ref:'#/paths/~1empty/get/responses/204/headers/Content-Type/schema'}}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:'ignored-header',targetVersion:'2.0',destination:'file:///review/ignored-header/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));const after=reopened(result),plan=operations(after)[0];
 assert.equal(plan.responses[0].content.length,0);assert.deepEqual(plan.responses[0].headers,[]);assert(result.outputs.some(output=>output.text.includes('ignored.md')));
 if(!referenced){const check=await evaluateSchemas({...after,runtimeInstances:[{subject:'response-body',location:'independent',text:'{"n":3}',schema:{resource:after.root,pointer:'/definitions/Independent'}}]});assert.equal(check.complete,true);assert(check.runtimeEvaluations.every(e=>e.valid));}
 assert.equal(input.resources[0].text,text);
});
for(const format of ['yaml','json'])test(`B05-R2 ${format} media-specific schema examples and empty overrides preserve selection`,async()=>{
 const {render,reopened}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/schema-samples.'+format;
 const content=Object.fromEntries(['application/json','application/vnd.busy+json'].map((media,index)=>[media,{schema:{type:'integer',enum:[0,1],example:index}}]));
 const empty={schema:{type:'integer',enum:[0,1],example:0},examples:{}};
 const value={openapi:'3.0.4',info:{title:'Schema samples',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/data':{post:{
  requestBody:{content:{'application/json':structuredClone(empty)}},responses:{200:{description:'Data',content},201:{description:'No sample',content:{'application/json':empty,'application/vnd.busy+json':structuredClone(empty)}}}
 }}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:'schema-samples',targetVersion:'2.0',destination:'file:///review/schema-samples/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const before=operations(input)[0],after=operations(reopened(result))[0];
 const samples=plan=>[plan.requestBody.content.map(m=>m.examples.map(e=>e.raw)),plan.responses.map(r=>r.content.map(m=>[m.mediaType,m.examples.map(e=>e.raw)]))];
 assert.deepEqual(samples(after),samples(before));assert.deepEqual(after.requestBody.content[0].examples,[]);
 assert.deepEqual(after.responses[0].content.map(m=>m.examples[0].raw),['0','1']);assert(after.responses[1].content.every(m=>m.examples.length===0));
 assert.equal(input.resources[0].text,text);
});
test('B05-R2 authored JSON entity whitespace and exact numeric spellings survive schema/media placement',async()=>{
 const root='file:///approved/entity.json',payload='{\r\n  "n": 9007199254740993.00\r\n}';
 const schema={type:'object',properties:{n:{type:'integer'}}};
 const value={openapi:'3.0.4',info:{title:'Entity text',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/echo':{post:{
  requestBody:{content:{'application/json':{schema,example:'MARKER'}}},responses:{200:{description:'Echo',content:{'application/json':{schema,examples:{First:{value:'MARKER'},Same:{value:'MARKER'}}}}}}
 }}}};
 const text=JSON.stringify(value,null,2).replaceAll('"MARKER"',payload),input={root,resources:[{id:root,text,generation:1}],snapshot:'entity-whitespace',targetVersion:'2.0',destination:'file:///review/entity/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));const after=operations(reopened(result))[0];
 assert.equal(after.requestBody.content[0].examples[0].raw,payload);assert.equal(after.responses[0].content[0].examples[0].raw,payload);assert.equal(input.resources[0].text,text);
});
for(const targetVersion of publishedTargets)for(const format of ['yaml','json'])test(`B05-R1 ${format} inherited operation media and overrides have independent owners in ${targetVersion}`,async()=>{
 const input={...require('./migration_operation_contexts_fixture.cjs')(format),targetVersion},before=input.resources.map(resource=>resource.text);
 assert.equal(analyse(input).complete,true,JSON.stringify(analyse(input).findings));
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const after=reopened(result),owners=[];
 for(const original of input.resources.slice(0,2)){
  const source={...input,root:original.id},root=result.changes.find(change=>change.resource===original.id).destination,packet={...after,root};
  assert.equal(analyse(packet).complete,true,JSON.stringify(analyse(packet).findings));
  const signature=packet=>operations(packet).map(plan=>[plan.operation.method,plan.operation.path,plan.servers.map(server=>server.url),
   plan.parameters.map(parameter=>[parameter.name,parameter.in]),plan.requestBody.required,plan.requestBody.content.map(value=>value.mediaType).sort(),
   plan.responses.map(response=>[response.status,response.bodyAllowed===false?[]:response.content.map(value=>value.mediaType).sort()])]);
  assert.deepEqual(signature(packet),signature(source));
  const graph=createGraph(packet).graph,operation=graph.operations().find(operation=>operation.path==='/inherited');
  assert.equal(graph.docs.get(operation.source.resource).dataNode(operation.source.pointer+'/operationId').value,'shared');
  owners.push([operation.source.resource,operation.source.pointer]);
  const plan=operations(packet).find(plan=>plan.operation.path==='/inherited');
  assert.equal(Object.values(plan.security.schemes)[0].parameterName,original===input.resources[0]?'X-First':'X-Second');
  for(const sample of ['{"n":9007199254740993,"next":{"n":9007199254740993}}','{"n":9007199254740992}']){
   const check=async(packet,plan)=>{
    const checked=await evaluateSchemas({...packet,runtimeInstances:[plan.requestBody.content[0].schema,plan.responses[0].content[0].schema].map(schema=>({subject:'request-body',location:sample,text:sample,schema}))});
    assert.equal(checked.complete,true,JSON.stringify(checked.findings));return checked.runtimeEvaluations.map(value=>value.valid);
   };
   const original=await check(source,operations(source).find(plan=>plan.operation.path==='/inherited'));
   assert.deepEqual(original,sample.includes('9007199254740992')?[false,false]:[true,true]);
   assert.deepEqual(await check(packet,plan),original);
   const independent=await evaluateSchemas({...packet,runtimeInstances:[{subject:'request-body',location:sample,text:sample,
    schema:{resource:root,pointer:'/components/schemas/Independent'}}]});
   assert.equal(independent.complete,true,JSON.stringify(independent.findings));assert.deepEqual(independent.runtimeEvaluations.map(value=>value.valid),[original[0]]);
  }
 }
 assert.notDeepEqual(owners[0],owners[1]);assert.deepEqual(input.resources.map(resource=>resource.text),before);
 const repeated=await planMigration({...input,resources:[...input.resources].reverse()});assert.equal(repeated.complete,true,JSON.stringify(repeated.problems));
 assert.deepEqual([...repeated.outputs].sort((a,b)=>a.path.localeCompare(b.path)),[...result.outputs].sort((a,b)=>a.path.localeCompare(b.path)));
});
for(const format of ['yaml','json'])test(`R3 ${format} equivalent exact numeric bounds share one encoded-body schema`,async()=>{
 const root='file:///approved/api.'+format,types=['application/octet-stream','application/json'];
 const content=Object.fromEntries(types.map((type,index)=>[type,{schema:{type:'string',format:'byte',minLength:'MIN'+index,maxLength:8,description:'DESC'+index}}]));
 const value={openapi:'3.0.4',info:{title:'Equivalent encoded media',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/bytes':{post:{requestBody:{content},responses:{200:{description:'Echo',content}}}}}};
 const text=(format==='json'?JSON.stringify(value):require('yaml').stringify(value)).replaceAll(format==='json'?'"MIN0"':'MIN0','4.00').replaceAll(format==='json'?'"MIN1"':'MIN1','4e0').replaceAll(format==='json'?'"DESC0"':'DESC0',JSON.stringify('café')).replaceAll(format==='json'?'"DESC1"':'DESC1',JSON.stringify('café').replace('é','\\u00e9'));
 const input={root,snapshot:'R3-exact-media',resources:[{id:root,text,generation:0}],targetVersion:'2.0',destination:'file:///reviewed/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 assert.deepEqual(await planMigration(input),result,'Review output is deterministic for the same capture');
 const output=reopened(result);assert.equal(analyse(standalone(result)).complete,true);
 for(const type of types)for(const value of ['AP+A','','too-long-for-bounds']){
  const bytes=Buffer.from(type==='application/json'?JSON.stringify(value):value);
  const check=async packet=>{
   const plan=operations(packet).find(plan=>plan.operation.path==='/bytes');
   const media=[plan.requestBody.content.find(media=>media.mediaType===type),plan.responses[0].content.find(media=>media.mediaType===type)];
   const checked=await evaluateSchemas({...packet,runtimeInstances:media.map((media,index)=>({subject:index?'response-body':'request-body',location:type,mediaType:type,mediaBase64:true,text:bytes.toString('base64'),media:media.definition??media.source}))});
   assert.equal(checked.complete,true);assert.equal(checked.runtimeEvaluations.length,2);return checked.runtimeEvaluations.map(value=>({complete:value.complete,valid:value.valid}));
  };
  const before=await check(input);assert(before.every(result=>result.complete&&result.valid===(value==='AP+A')));
  assert.deepEqual(await check(output),before);
 }
 assert(result.outputs.some(output=>output.text.includes('4.00')));assert(result.outputs.some(output=>output.text.includes('4e0')));
 assert.equal(input.resources[0].text,text);
});
for(const version of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])test(`R2 ${version} ${format} compatible raw/JSON media retain one Swagger wire schema and independent owners`,async()=>{
 const root='file:///approved/api.'+format,type='application/octet-stream',raw={maxLength:4},data={type:'string',maxLength:4};
 const content={[type]:{schema:raw},'application/json':{schema:{$ref:'#/components/schemas/Text'}}};
 const value={openapi:version,info:{title:'R2 media',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/bytes':{post:{requestBody:{content},responses:{200:{description:'Reply',content}}}}},components:{schemas:{Text:data,Independent:{$ref:'#/paths/~1bytes/post/requestBody/content/application~1octet-stream/schema'}}}};
 const text=format==='json'?JSON.stringify(value):require('yaml').stringify(value),input={root,snapshot:'R2-media',resources:[{id:root,text,generation:6}],targetVersion:'2.0',destination:'file:///reviewed/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(input.resources[0].text,text);
 const after=reopened(result);assert.equal(analyse(after).complete,true);assert.equal(analyse(standalone(result)).complete,true);
 assert.deepEqual(operations(after).map(plan=>[plan.requestBody.content.map(value=>value.mediaType).sort(),plan.responses[0].content.map(value=>value.mediaType).sort()]),[[['application/json',type],['application/json',type]]]);
 const checked=await evaluateSchemas({...after,runtimeInstances:[{subject:'response-body',location:'independent',text:'false',schema:{resource:after.root,pointer:'/definitions/Independent'}}]});
 assert.equal(checked.complete,true);assert(checked.runtimeEvaluations.every(value=>value.valid));
 const beforeProof=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'independent',text:'false',schema:{resource:root,pointer:'/components/schemas/Independent'}}]});
 assert.deepEqual(checked.runtimeEvaluations.map(value=>value.valid),beforeProof.runtimeEvaluations.map(value=>value.valid));
});

for(const format of ['yaml','json'])for(const compatible of [true,false])test(`R2 ${format} fixed referenced media schemas compatible=${compatible} do not become a union`,async()=>{
 const root='file:///approved/api.'+format,content={'application/json':{schema:{$ref:'#/components/schemas/A'}},'application/vnd.busy+json':{schema:{$ref:'#/components/schemas/B'}}};
 const value={openapi:'3.0.4',info:{title:'R2 alternatives',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/items':{post:{requestBody:{content},responses:{200:{description:'Reply',content}}}}},components:{schemas:{A:{type:'string'},B:{type:compatible?'string':'integer'}}}};
 const text=format==='json'?JSON.stringify(value):require('yaml').stringify(value),result=await planMigration({root,snapshot:'media-schema',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///reviewed/'});
 assert.equal(result.complete,compatible,JSON.stringify(result.problems));
 if(!compatible){assert.deepEqual(result.outputs,[]);assert(result.problems.some(value=>value.code==='migration.body.media-schema'||value.code==='migration.response.media-schema'));}
 else assert.equal(analyse(reopened(result)).complete,true);
});
function capture(body, extras = [], format = 'yaml') {
  const root = 'file:///approved/api.' + format;
  const resources = [{id: root, generation: 3, text: `# Original API\nswagger: '2.0'\ninfo: {title: Media, version: '1'}\nhost: api.invalid\nschemes: [https]\nbasePath: /v1\nconsumes: [application/json]\nproduces: [application/json]\n${body}`}, ...extras];
  if (format === 'json') for (const resource of resources) resource.text = new SourceDocument(resource.text, 'file:///fixture.yaml').dataJson('');
  return {root, snapshot: 'swagger-media-capture', destination: 'file:///review/migrated/',
    resources};
}
function operations(input) {
  const {graph} = createGraph(input);
  return graph.operations().map(operation => requestOperation({...input, resource: operation.source.resource,
    pointer: operation.source.pointer, occurrence: operation.occurrence}));
}
function reopened(result) {
  return {root: result.outputRoot, snapshot: 'cold-media', resources: result.outputs.map(output => ({
    id: output.id, generation: 0, text: output.text,
    aliases: Object.entries(result.manifest.resourceMappings).filter(([, path]) => path === output.path).map(([identity]) => identity).sort()
  }))};
}
function standalone(result) {
  const destination = 'file:///relocated/without-project/';
  return {root: new URL(result.entry, destination).href, snapshot: 'standalone-media', resources: result.outputs.map(output => ({
    id: new URL(output.path, destination).href, generation: 0, text: output.text
  }))};
}
for (const targetVersion of publishedTargets) for (const format of ['yaml', 'json']) {
  test(`${format} external body fragments retain their owner and operation-specific media in ${targetVersion}`, async () => {
    const filename = 'parameters.' + format, external = 'file:///approved/' + filename;
    const input = {...capture(`paths:
  /json:
    parameters: [{$ref: '${filename}#/chain'}]
    post:
      responses: {'204': {description: ok}}
  /text:
    post:
      consumes: [text/plain]
      parameters: [{$ref: '${filename}#/body'}]
      responses: {'204': {description: ok}}
`, [{id: external, generation: 7, text: `# External organization\nchain: {$ref: '#/body'}\nbody:\n  # Parameter comment\n  in: body\n  name: payload\n  required: true\n  description: Shared body\n  x-data: {literal: false, $ref: untouched}\n  schema:\n    # Schema comment\n    type: integer\n    enum: [9007199254740993, 0]\n`}], format), targetVersion};
    const before = input.resources.map(resource => resource.text);
    const result = await planMigration(input);
    assert.equal(result.status, 'faithfully-convertible', JSON.stringify(result.problems));
    assert.equal(result.complete, true);
    assert.equal(result.outputs.length, 2);
    assert.deepEqual(input.resources.map(resource => resource.text), before);
    const migrated = reopened(result);
    assert.equal(analyse(migrated).complete, true);
    const relocated = standalone(result);
    assert.equal(analyse(relocated).complete, true);
    assert.deepEqual(operations(relocated).map(plan => plan.requestBody.content.map(item => item.mediaType)), operations(migrated).map(plan => plan.requestBody.content.map(item => item.mediaType)));
    assert.deepEqual(operations(migrated).map(plan => [plan.operation.path, plan.requestBody.required, plan.requestBody.content.map(item => item.mediaType)]),
      operations(input).map(plan => [plan.operation.path, plan.requestBody.required, plan.requestBody.content.map(item => item.mediaType)]));
    const output = result.outputs.map(output => output.text).join('\n');
    if (format === 'yaml') {
      for (const comment of ['# Original API', '# External organization', '# Parameter comment', '# Schema comment']) assert(output.includes(comment), comment);
    }
    assert(output.includes('9007199254740993'));
    const fragment = result.outputs.find(output => output.path.startsWith('resources/'));
    const document = new SourceDocument(fragment.text, fragment.id);
    assert.equal(document.dataNode('/body/name'), undefined);
    assert.equal(document.dataNode('/body/in'), undefined);
    assert(document.dataNode('/body/content'));
    assert.equal(document.dataNode('/body/x-data/$ref').value, 'untouched');
    assert.equal(document.dataNode('/body/x-data/literal').value, false);
  });
  test(`${format} shared responses specialize produces while keeping exact examples in ${targetVersion}`, async () => {
    const input = {...capture(`paths:
  /json:
    get:
      responses: {'200': {$ref: '#/responses/Shared'}}
  /text:
    get:
      produces: [text/plain]
      responses: {'200': {$ref: 'response-chain.${format}'}}
responses:
  Shared:
    description: Shared response
    # Header comment
    headers: {X-Values: {type: array, items: {type: integer}, collectionFormat: csv}}
    schema: {type: integer}
    examples:
      application/json: 9007199254740993
      application/xml: false
    x-data: {$ref: literal, zero: 0}
`, [{id: 'file:///approved/response-chain.' + format, generation: 2, text: `# Response chain\n$ref: 'api.${format}#/responses/Shared'\n`}], format), targetVersion};
    const original = input.resources[0].text;
    const result = await planMigration(input);
    assert.equal(result.complete, true, JSON.stringify(result.problems));
    assert.equal(input.resources[0].text, original);
    const migrated = reopened(result);
    assert.equal(analyse(standalone(result)).complete, true);
    assert.deepEqual(operations(standalone(result)).map(plan => plan.responses.map(response => response.content.map(item => item.mediaType).sort())), operations(migrated).map(plan => plan.responses.map(response => response.content.map(item => item.mediaType).sort())));
    assert.deepEqual(operations(migrated).map(plan => plan.responses.map(response => response.content.map(item => item.mediaType).sort())),
      operations(input).map(plan => plan.responses.map(response => response.content.map(item => item.mediaType).sort())));
    const text = result.outputs[0].text;
    assert(text.includes('9007199254740993'));
    if (format === 'yaml') assert(text.includes('# Header comment'));
    const document = new SourceDocument(text, result.outputRoot);
    assert.equal(document.dataNode('/components/responses/Shared/x-data/$ref').value, 'literal');
    assert.equal(result.invariants.requests, 'effective-url-serialization-security-and-media');
  });
}
test('an invalid reusable Swagger response is not converted by following its forbidden reference', async () => {
  const input = {...capture("paths: {}\nresponses: {Invalid: {$ref: '#/responses/Other'}, Other: {description: ok}}\n"), targetVersion: '3.0.4'};
  const result = await planMigration(input);
  assert.equal(result.complete, false);
  assert.deepEqual(result.outputs, []);
  assert(result.problems.some(problem => problem.code.startsWith('migration.validation.structure.') && problem.pointer === '/responses/Invalid'));
});
for (const targetVersion of ['3.0.4', '3.1.2', '3.2.1']) for (const format of ['yaml', 'json']) {
  test(`${format} external body pointer escaping survives migration to ${targetVersion}`, async () => {
    const name = 'body /~?#雪';
    const input = capture(`paths: {/data: {post: {parameters: [{$ref: 'parameters.${format}#/body%20~1~0%3F%23%E9%9B%AA'}], responses: {'204': {description: ok}}}}}\n`,
      [{id: 'file:///approved/parameters.' + format, generation: 5, text: JSON.stringify({[name]: {in: 'body', name: 'payload', schema: {type: 'integer'}}})}], format);
    const result = await planMigration({...input, targetVersion});
    assert.equal(result.complete, true, JSON.stringify(result.problems));
    const after = standalone(result);
    assert.equal(analyse(after).complete, true);
    assert.equal(operations(after)[0].requestBody.content[0].mediaType, 'application/json');
  });
  for (const external of [false, true]) test(`${format} ${external ? 'external root' : 'local reusable'} bodies keep recursive schemas and independent schema consumers in ${targetVersion}`, async () => {
    const address = external ? `body.${format}` : '#/parameters/Body';
    const schemaAddress = address + (external ? '#/schema' : '/schema');
    const body = {in: 'body', name: 'payload', required: true, schema: {type: 'object', properties: {
      id: {type: 'integer'}, next: {$ref: schemaAddress}
    }, additionalProperties: false, default: {id: 0}}};
    const input = capture(`paths:
  /first:
    post:
      parameters: [{$ref: '${address}'}]
      responses: {'204': {description: ok}}
  /second:
    post:
      consumes: [text/plain, application/json]
      parameters: [{$ref: '${address}'}]
      responses: {'204': {description: ok}}
definitions:
  Kept: {type: string}
  Reuse: {$ref: '${schemaAddress}'}
${external ? '' : 'parameters:\n  Body: ' + JSON.stringify(body)}
`, external ? [{id: 'file:///approved/body.' + format, generation: 8, text: JSON.stringify(body)}] : [], format);
    const result = await planMigration({...input, targetVersion});
    assert.equal(result.complete, true, JSON.stringify(result.problems));
    const after = reopened(result), samples = ['{"id":9007199254740993,"next":{"id":0}}', '{"id":"wrong"}', '{"extra":false}'];
    const instances = (resource, pointer) => samples.map(text => ({subject: 'response-body', location: 'application/json', text, schema: {resource, pointer}}));
    const beforeProof = await evaluateSchemas({...input, runtimeInstances: instances(input.root, '/definitions/Reuse')});
    const afterProof = await evaluateSchemas({...after, runtimeInstances: instances(after.root, '/components/schemas/Reuse')});
    assert.equal(beforeProof.complete, true, JSON.stringify(beforeProof.findings));
    assert.equal(afterProof.complete, true, JSON.stringify(afterProof.findings));
    assert.deepEqual(beforeProof.runtimeEvaluations.map(item => item.valid), [true, false, false]);
    assert.deepEqual(afterProof.runtimeEvaluations.map(item => item.valid), beforeProof.runtimeEvaluations.map(item => item.valid));
    assert.equal(new SourceDocument(result.outputs[0].text, result.outputRoot).dataNode('/components/schemas/Kept/type').value, 'string');
    assert.deepEqual(operations(after).map(plan => plan.requestBody.content.map(item => item.mediaType).sort()), [['application/json'], ['application/json', 'text/plain']]);
  });
  test(`${format} nested Swagger header migration to ${targetVersion} is a precise representability blocker`, async () => {
    const input = capture("paths: {/data: {get: {responses: {'200': {description: ok, headers: {X-Values: {type: array, collectionFormat: csv, items: {type: array, collectionFormat: pipes, items: {type: integer}}}}}}}}}\n", [], format);
    const result = await planMigration({...input, targetVersion});
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.outputs, []);
    const problem = result.problems.find(problem => problem.code === 'migration.header.nested-collection');
    assert(problem, JSON.stringify(result.problems));
    assert.equal(problem.reason, 'target-representation');
    assert.equal(problem.resource, input.root);
    assert.equal(problem.pointer, '/paths/~1data/get/responses/200/headers/X-Values/items');
    assert(problem.range[1] > problem.range[0]);
  });
}
for(const format of ['yaml','json'])test(`R3b ${format} media specialize request, response, Parameter and Header occurrences independently`,async()=>{
 const fixture=require('./migration_b05_r3b_fixture.cjs'),{input}=fixture.capture(format,'3.2.1',{scalarContexts:true}),before=JSON.stringify(input);
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));const cold=fixture.reopened(result);
 for(const packet of [input,cold]){
  const graph=createGraph(packet).graph;assert.equal(graph.operations().length,2);
  for(const operation of graph.operations()){
   const plan=requestOperation({...packet,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
   assert.deepEqual(plan.parameters.map(parameter=>[parameter.name,parameter.in,parameter.required]),[['n','query',true]]);
   assert.equal(plan.responses[0].headers[0].name,'X-Count');
   assert.deepEqual(plan.requestBody.content.map(media=>media.mediaType),['application/json']);
   assert.deepEqual(plan.responses[0].content.map(media=>media.mediaType),['application/vnd.count+json']);
  }
 }
 assert.equal(JSON.stringify(input),before);
});
for(const format of ['yaml','json'])for(const intermediate of ['3.1.2','3.0.4'])
test(`R3b ${format} inactive ${intermediate} holders stay inactive on a subsequent Swagger review`,async()=>{
 const fixture=require('./migration_b05_r3b_fixture.cjs'),{input}=fixture.capture(format),first=await planMigration({...input,targetVersion:intermediate});
 assert.equal(first.complete,true,JSON.stringify(first.problems));const middle=fixture.reopened(first),graph=createGraph(middle).graph;
 assert.equal(graph.operations().length,2);assert(!graph.operations().some(op=>op.role==='callback'));
 const contentKeys=[...graph.entryScopes()].filter(scope=>scope.kind==='media'&&scope.pointer.startsWith('/components/responses/')).map(scope=>scope.pointer.split('/').at(-1));
 assert(contentKeys.includes('application~1json'));assert(contentKeys.includes('application~1vnd.count+json'));
 assert(!contentKeys.includes('application~1octet-stream'),'A bound object retains actual media contexts');
 const last=await planMigration({...middle,targetVersion:'2.0',destination:'file:///r3b-composed/'});
 if(intermediate==='3.0.4'){
  // Once delivered as a native Callback definition, its independent callback
  // category is authored input to the next review. No hidden sidecar contract
  // authorizes treating it as disposable or inventing an invocation.
  assert.equal(last.complete,false);assert.deepEqual(last.outputs,[]);
  assert(last.problems.some(p=>p.code==='migration.components.callbacks'&&p.reason==='target-representation'),JSON.stringify(last.problems));
 }else{
  assert.equal(last.complete,true,JSON.stringify(last.problems));const cold=fixture.reopened(last);
  const {migrationRequestSignatures}=require('./dist/migration_invariants.cjs');
  assert.deepEqual(migrationRequestSignatures(createGraph(cold).graph,cold.resources),migrationRequestSignatures(createGraph(input).graph,input.resources));
 }
});

for(const format of ['yaml','json'])for(const targetVersion of ['3.1.2','3.0.4'])
test(`R3b ${format} an unbound ${targetVersion} Response holder supplies no executable media`,async()=>{
 const fixture=require('./migration_b05_r3b_fixture.cjs'),{input,objects}=fixture.capture(format);
 objects.components.mediaTypes.Unused={schema:{type:'boolean'},example:false};
 input.resources[1].text=fixture.render(objects,format);
 const result=await planMigration({...input,targetVersion});assert.equal(result.complete,true,JSON.stringify(result.problems));
 const cold=fixture.reopened(result),{migrationRequestSignatures}=require('./dist/migration_invariants.cjs');
 assert.deepEqual(migrationRequestSignatures(createGraph(cold).graph,cold.resources),migrationRequestSignatures(createGraph(input).graph,input.resources));
 const graph=createGraph(cold).graph;
 assert.equal(graph.operations().length,2);
 const library=result.outputs.find(output=>output.text.includes('R3b library'));
 assert(library.text.includes('application/octet-stream'),'The unbound object uses inactive storage syntax only');
 for(const operation of graph.operations()){
  const plan=requestOperation({...cold,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
  assert(![...plan.requestBody.content,...plan.responses.flatMap(response=>response.content)].some(media=>media.mediaType==='application/octet-stream'));
 }
});
