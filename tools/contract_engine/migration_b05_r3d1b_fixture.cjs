const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{createGraph,analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const at='/paths/~1parts/post/requestBody/content/multipart~1form-data';
const singleton=(name='tag',value={type:'string'})=>({type:'object',required:[name],additionalProperties:false,properties:{[name]:value}});
function capture(version='3.2.1',format='json',target='3.1.2',media){
 const root='file:///named/api.'+format;
 const value={openapi:version,info:{title:'Named positional 雪',version:'1'},paths:{'/parts':{post:{requestBody:{required:true,content:{'multipart/form-data':media??{
  schema:{type:'array',maxItems:3,items:singleton()},prefixEncoding:[{contentType:'text/plain; charset=utf-8'}],itemEncoding:{contentType:'text/plain; charset=utf-8'},
 }}},responses:{204:{description:'Empty'}}}}}};
 const encode=value=>(format==='json'?JSON.stringify(value):'# Named source stays exact\r\n'+YAML.stringify(value).replaceAll('\n','\r\n')).replaceAll(format==='json'?'"EXACT"':'EXACT','9007199254740993.00');
 return {value,encode,input:{root,resources:[{id:root,text:encode(value),generation:7}],snapshot:'R3d1b',targetVersion:target,destination:'file:///named-output/'}};
}
const wire=parts=>Buffer.concat([...parts.flatMap(({name='tag',type='text/plain; charset=utf-8',bytes=Buffer.from(''),transfer})=>[
 Buffer.from('--Parts\r\nContent-Disposition: form-data; name="'+name+'"\r\nContent-Type: '+type+'\r\n'+(transfer?'Content-Transfer-Encoding: '+transfer+'\r\n':'')+'\r\n'),bytes,Buffer.from('\r\n')]),Buffer.from('--Parts--\r\n')]);
async function valid(input,bytes){
 const result=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:'named',text:bytes.toString('base64'),mediaType:'multipart/form-data; boundary=Parts',mediaBase64:true,
 form:{resource:input.root,pointer:at},schema:{resource:input.root,pointer:at+'/schema'}}]});
 assert(result.complete,JSON.stringify(result.runtimeFindings));return result.runtimeEvaluations.every(value=>value.complete&&value.valid===true);
}
async function review(input){
 const original=JSON.stringify(input),result=await planMigration(input);assert.equal(JSON.stringify(input),original);
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.producerVersion,'105');
 const cold={root:result.outputRoot,resources:result.outputs,snapshot:'named-cold'};
 assert.equal(analyse(cold).complete,true,JSON.stringify(analyse(cold).findings));return {result,cold,graph:createGraph(cold).graph};
}
module.exports=function register(group){
 require('./migration_b05_r3d1b2_fixture.cjs')(group);
 require('./migration_b05_r3d1b3_fixture.cjs')(group);
 require('./migration_b05_r3d1b4_fixture.cjs')(group);
 if(group==='media')for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const target of ['3.1.2','3.0.4'])test(`R3d1b ${version} ${format} complete named repetitions to ${target}`,async()=>{
  const {input}=capture(version,format,target),{result,cold,graph}=await review(input),media=graph.docs.get(cold.root).dataNode(at).value;
  assert.equal(media.prefixEncoding,undefined);assert.equal(media.itemEncoding,undefined);
  assert.equal(media.encoding.tag.contentType,'text/plain; charset=utf-8');
  assert.deepEqual(media.schema.properties.tag.type,'array');assert.equal(media.schema.additionalProperties,false);
  for(const parts of [[{bytes:Buffer.from('')}],[{bytes:Buffer.from('a')},{bytes:Buffer.from('雪')}],[{bytes:Buffer.from('1')},{bytes:Buffer.from('2')},{bytes:Buffer.from('3')}],[{name:'other',bytes:Buffer.from('a')}],Array.from({length:4},()=>({bytes:Buffer.from('x')}))]){
   const bytes=wire(parts);assert.equal(await valid(cold,bytes),await valid(input,bytes));
  }
  assert.equal((await planMigration(input)).identity,result.identity);
 });
 if(group==='media')for(const target of ['3.1.2','3.0.4'])test(`R3d1b ${target} symbolic tail and finite prefix retain defaults and omission`,async()=>{
  const {input}=capture('3.2.1','yaml',target,{schema:{type:'array',items:singleton()},prefixEncoding:[{}],itemEncoding:{}});
  const {cold}=await review(input);
  // No arbitrary finite tail expansion: a long supported wire still agrees.
  const bytes=wire(Array.from({length:17},(_,index)=>({bytes:Buffer.from('v'+index)})));
  assert.equal(await valid(input,bytes),true);assert.equal(await valid(cold,bytes),true);
 });
 if(group==='media')test('R3d1b fixed and optional repeated positions retain value order and exact constraints',async()=>{
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',minItems:1,maxItems:2,prefixItems:[singleton('tag',{type:'integer',minimum:'EXACT'}),singleton('tag',{type:'integer',maximum:5})],items:false},prefixEncoding:[{contentType:'text/plain'},{contentType:'text/plain'}]});
  const {cold}=await review(input);
  for(const [values,expected]of [[['9007199254740993.00'],true],[['9007199254740993', '5'],true],[['5','9007199254740993'],false],[['9007199254740992'],false]]){
   const bytes=wire(values.map(value=>({type:'text/plain',bytes:Buffer.from(value)})));assert.equal(await valid(input,bytes),expected);assert.equal(await valid(cold,bytes),expected);
  }
 });
 if(group==='downgrade')for(const [label,media,classification]of [
  ['fixed cross-field order',{schema:{type:'array',maxItems:2,prefixItems:[singleton('first'),singleton('second')],items:false},prefixEncoding:[{contentType:'text/plain'},{contentType:'text/plain'}]},'target-representation'],
  ['unknown name',{schema:{type:'array',items:{type:'object',properties:{tag:{type:'string'}}}},itemEncoding:{contentType:'text/plain'}},'unavailable-proof'],
  ['unproved tail',{schema:{type:'array',prefixItems:[singleton()]},itemEncoding:{contentType:'text/plain'}},'unavailable-proof'],
  ['positional media conflict',{schema:{type:'array',items:singleton()},prefixEncoding:[{contentType:'text/plain'}],itemEncoding:{contentType:'application/json'}},'target-representation'],
  ['explicit and default',{schema:{type:'array',items:singleton()},prefixEncoding:[{contentType:'text/plain'}],itemEncoding:{}},'target-representation'],
 ])test(`R3d1b ${label} retains precise ${classification}`,async()=>{
  const {input}=capture('3.2.1','yaml','3.1.2',media),result=await planMigration(input);
  assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.code.startsWith('migration.encoding.')&&problem.reason===classification),JSON.stringify(result.problems));
 });
 if(group==='owners')for(const format of ['json','yaml'])test(`R3d1b ${format} independent shared schema and Header consumers survive`,async()=>{
  const {input,value,encode}=capture('3.2.1',format);
  const media=value.paths['/parts'].post.requestBody.content['multipart/form-data'];
  media.itemEncoding.headers={'Content-Transfer-Encoding':{$ref:'#/components/headers/Transfer'}};media.prefixEncoding=[media.itemEncoding];
  value.components={schemas:{Value:{$ref:'#'+at+'/schema/items/properties/tag'},Original:{$ref:'#'+at+'/schema'}},headers:{Transfer:{required:true,schema:{type:'string',enum:['binary','8bit']}}}};
  input.resources[0].text=encode(value);
  const {cold,graph}=await review(input);
  assert(graph.entryReferences().filter(edge=>['schema','header'].includes(edge.kind)).every(edge=>edge.resolution==='resolved'));
  for(const transfer of ['binary','8bit']){const bytes=wire([{bytes:Buffer.from('original'),transfer}]);assert.equal(await valid(input,bytes),true);assert.equal(await valid(cold,bytes),true);}
 });
 if(group==='owners')test('R3d1b shared Media Type and YAML aliases keep separate selected envelopes',async()=>{
  const {input,value,encode}=capture('3.2.1','yaml');
  const media=value.paths['/parts'].post.requestBody.content['multipart/form-data'];
  media.prefixEncoding=[media.itemEncoding];
  value.components={mediaTypes:{Shared:media}};
  value.paths['/parts'].post.requestBody.content['multipart/form-data']={$ref:'#/components/mediaTypes/Shared'};
  value.paths['/other']={post:{requestBody:{content:{'multipart/form-data; charset=utf-8':{$ref:'#/components/mediaTypes/Shared'}}},responses:{204:{description:'Empty'}}}};
  input.resources[0].text=encode(value);const {cold}=await review(input);assert(cold.resources.some(resource=>resource.text.includes('multipart/form-data; charset=utf-8')));
 });
 if(group==='multipart')for(const target of ['3.1.2','3.0.4'])test(`R3d1b ${target} complete encoded binary bytes and media alternatives survive`,async()=>{
  const part=singleton('tag',{type:'string',contentEncoding:'base64'}),rule={contentType:'application/octet-stream, image/png',headers:{'Content-Transfer-Encoding':{required:true,schema:{type:'string',enum:['base64']}}}};
  const {input}=capture('3.2.1','json',target,{schema:{type:'array',minItems:1,maxItems:3,items:part},prefixEncoding:[rule],itemEncoding:rule}),{cold}=await review(input);
  for(const type of ['application/octet-stream','image/png']){
   const raw=Buffer.from([0,255,13,10,128]),bytes=wire([{type,bytes:Buffer.from(raw.toString('base64')),transfer:'base64'},{type,bytes:Buffer.from(''),transfer:'base64'}]);
   assert.equal(await valid(input,bytes),true);assert.equal(await valid(cold,bytes),true);assert.deepEqual(Buffer.from(raw.toString('base64'),'base64'),raw);
  }
 });
 if(group==='multipart')test('R3d1b named raw binary leaves retain exact non-Unicode and empty octets in 3.1',async()=>{
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',items:singleton('tag',{})},itemEncoding:{contentType:'application/octet-stream'}}),{cold}=await review(input);
  const bytes=wire([{type:'application/octet-stream',bytes:Buffer.from([0,255,13,10,128])},{type:'application/octet-stream',bytes:Buffer.alloc(0)}]);
  assert.equal(await valid(input,bytes),true);assert.equal(await valid(cold,bytes),true);
 });
 if(group==='owners')for(const format of ['yaml','json'])test(`R3d1b ${format} external part and Header resources retain their defining identities`,async()=>{
  const {input,value,encode}=capture('3.2.1',format),media=value.paths['/parts'].post.requestBody.content['multipart/form-data'];
  media.schema={$ref:'parts.'+format+'#/Parts'};
  media.itemEncoding.headers={'Content-Transfer-Encoding':{$ref:'parts.'+format+'#/Transfer'}};media.prefixEncoding=[media.itemEncoding];
  const library={Parts:{type:'array',items:singleton('tag',{$ref:'#/Value'})},Value:{type:'string'},Transfer:{required:true,schema:{type:'string',enum:['binary']}},Independent:{$ref:'#/Value'}};
  input.resources[0].text=encode(value);input.resources.push({id:'file:///named/parts.'+format,text:format==='json'?JSON.stringify(library):YAML.stringify(library),generation:11});
  const {cold,graph}=await review(input);assert(graph.entryReferences().filter(edge=>['schema','header'].includes(edge.kind)).every(edge=>edge.resolution==='resolved'));
  const bytes=wire([{bytes:Buffer.from('ref'),transfer:'binary'}]);assert.equal(await valid(input,bytes),true);assert.equal(await valid(cold,bytes),true);
 });
 if(group==='downgrade')test('R3d1b a shared form/mixed owner keeps its unavailable context proof',async()=>{
  const {input,value,encode}=capture(),media=value.paths['/parts'].post.requestBody.content['multipart/form-data'];
  value.components={mediaTypes:{Shared:media}};
  value.paths['/parts'].post.requestBody.content={'multipart/form-data':{$ref:'#/components/mediaTypes/Shared'},'multipart/mixed':{$ref:'#/components/mediaTypes/Shared'}};
  input.resources[0].text=encode(value);const original=input.resources[0].text,result=await planMigration(input);
  assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert.equal(input.resources[0].text,original);
  assert(result.problems.some(problem=>problem.reason==='unavailable-proof'),JSON.stringify(result.problems));
 });
 if(group==='media')test('R3d1b existing named media/Header selections stay exact and file inverses refuse explicitly',async()=>{
  const {input}=capture();
  const configuration=files=>({id:'file:///named/busyapi.yaml',generation:1,text:JSON.stringify({version:1,roots:[{name:'api',path:'api.json'}],tests:[{name:'saved',operation:{entry:'api',method:'POST',path:'/parts'},body:{mediaType:'multipart/form-data',value:{tag:['snow','']},partMediaTypes:{tag:'text/plain; charset=utf-8'},partHeaders:[],...(files?{files:[{name:'tag',path:'original.bin',mediaType:'text/plain'}]}:{})}}]})});
  input.configuration=configuration(false);const {result}=await review(input);assert.equal(result.configurationProjections.filter(value=>value.multipart).length,0);
  assert.deepEqual(result.manifest.tests[0].body,JSON.parse(input.configuration.text).tests[0].body);
  input.configuration=configuration(true);const blocked=await planMigration(input);assert.equal(blocked.complete,false);assert.deepEqual(blocked.outputs,[]);
  assert(blocked.problems.some(problem=>problem.code==='migration.multipart.saved-proof'&&problem.reason==='unavailable-proof'),JSON.stringify(blocked.problems));
 });
 if(group==='swagger')test('R3d1b named positional media with active part Headers retains the Swagger restriction',async()=>{
  const {input}=capture('3.2.1','json','2.0'),result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.reason==='target-representation'));
 });
 if(group==='media')test('R3d1b saved ordered values retain empty selections, exact numbers and unrelated configuration',async()=>{
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',items:singleton('tag',{type:'integer',minimum:'EXACT'})},itemEncoding:{contentType:'text/plain'}});
  input.configuration={id:'file:///named/busyapi.yaml',generation:3,text:'version: 1\nroots: [{name: api, path: api.json}]\nenvironments: {dev: {variables: {keep: unchanged}}}\ntests:\n- name: selected\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: [{tag: 9007199254740993.00}, {tag: 9007199254740994e0}]}\n- name: empty\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: []}\n- name: omitted\n  operation: {entry: api, method: POST, path: /parts}\n'};
  const {result}=await review(input);assert.equal(result.configurationProjections.filter(value=>value.multipart).length,2);
  assert(result.manifestText.includes('9007199254740993.00'));assert(result.manifestText.includes('9007199254740994e0'));assert.equal(result.manifest.tests[2].body,undefined);
  assert.deepEqual(result.manifest.environments.dev.variables,{keep:'unchanged'});
 });
 if(group==='media')test('R3d1b final certificate rejects extra combinations and changed neutral values',async()=>{
  const {input,value,encode}=capture();value.components={schemas:{Value:{$ref:'#'+at+'/schema/items/properties/tag'}}};input.resources[0].text=encode(value);
  const {result,cold}=await review(input),source=createGraph(input).graph,baseline=createGraph(cold).graph;
  const edge=baseline.referenceAs(cold.root,'/components/schemas/Value','$ref','schema');assert.equal(edge.resolution,'resolved');
  for(const mutation of ['count','media','activation','value']){
   const outputs=result.outputs.map(output=>{const doc=new (require('./dist/document.cjs').SourceDocument)(output.text,output.id);
    let text=output.text;
    if(output.id===cold.root){
     if(mutation==='count')text=doc.set(at+'/schema/properties/tag/allOf',[{maxItems:9}]);
     if(mutation==='media')text=doc.set(at+'/encoding/tag/contentType','application/json');
     if(mutation==='activation')text=doc.set(at+'/encoding/other',{contentType:'text/plain'});
    }
    if(mutation==='value'&&output.id===edge.targetResource)text=doc.set(edge.targetPointer+'/maxLength',0);
    return {...output,text};});
   const target=createGraph({...cold,resources:outputs}).graph,problems=[];
   require('./dist/migration_invariants.cjs').proveMigrationPositionalEncoding(source,target,(location,scope)=>
    scope.kind==='media'?[{resource:cold.root,pointer:at}]:[{resource:edge.targetResource,pointer:edge.targetPointer}],
    (location,code,message,reason)=>problems.push({code,message,reason}));
   assert(problems.some(problem=>problem.code==='migration.invariant.named-multipart'),mutation+JSON.stringify(problems));
  }
 });
};
module.exports.capture=capture;
