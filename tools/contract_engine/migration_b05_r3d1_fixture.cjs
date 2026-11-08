const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{createGraph,analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const at='/paths/~1parts/post/requestBody/content/multipart~1mixed';
function capture(version,format,media,targetVersion='3.1.2'){
 const root='file:///positional/api.'+format;
 const value={openapi:version,info:{title:'Positional Encoding 雪',version:'unchanged'},paths:{'/parts':{post:{requestBody:{required:true,content:{'multipart/mixed':media}},responses:{204:{description:'Empty'}}}}}};
 const encode=value=>(format==='json'?JSON.stringify(value):'# Retain exact bytes and comments\r\n'+YAML.stringify(value).replaceAll('\n','\r\n')).replaceAll(format==='json'?'"EXACT"':'EXACT','9007199254740993.00');
 return {value,encode,input:{root,snapshot:'R3d1-captured',resources:[{id:root,text:encode(value),generation:9}],targetVersion,destination:'file:///reviewed/'}};
}
async function evaluate(input,body){
 return evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:'multipart/mixed',text:body.toString('base64'),mediaType:'multipart/mixed; boundary=Parts',mediaBase64:true,
  form:{resource:input.root,pointer:at},schema:{resource:input.root,pointer:at+'/schema'}}]});
}
const wire=(values)=>Buffer.from(values.map(value=>'--Parts\r\nContent-Type: text/plain\r\n\r\n'+value+'\r\n').join('')+'--Parts--\r\n');
module.exports=function register(group){
 if(group==='media')for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const target of ['3.1.2','3.0.4'])test(`R3d1 ${version} ${format} redundant positional defaults to ${target}`,async()=>{
  const {input}=capture(version,format,{schema:{type:'array',minItems:0,maxItems:3,items:{type:'integer',minimum:'EXACT'}},prefixEncoding:[{contentType:'text/plain'},{style:'form',explode:false}],itemEncoding:{contentType:'text/plain'}},target);
  const original=JSON.stringify(input),review=await planMigration(input);
  assert.equal(review.complete,true,JSON.stringify(review.problems));assert.equal(JSON.stringify(input),original);
  const cold={root:review.outputRoot,snapshot:'cold-positional',resources:review.outputs.map(value=>({...value,generation:0}))};
  assert.equal(analyse(cold).complete,true,JSON.stringify(analyse(cold).findings));
  const graph=createGraph(cold).graph,value=graph.docs.get(cold.root).dataNode(at).value;
  assert.equal(value.prefixEncoding,undefined);assert.equal(value.itemEncoding,undefined);
  for(const [values,valid]of [[[],true],[['9007199254740993.00'],true],[['9007199254740993','9007199254740994','9007199254740995'],true],[['9007199254740992'],false],[['9007199254740993','9007199254740993','9007199254740993','9007199254740993'],false]]){
   const bytes=wire(values),before=await evaluate(input,bytes),after=await evaluate(cold,bytes);
   assert.equal(before.complete,true,JSON.stringify(before.runtimeFindings));assert.equal(after.complete,true,JSON.stringify(after.runtimeFindings));
   assert.deepEqual(after.runtimeEvaluations.map(value=>value.valid),before.runtimeEvaluations.map(value=>value.valid));
   assert.equal(after.runtimeEvaluations.every(value=>value.valid===true),valid);
  }
  assert.equal((await planMigration(input)).identity,review.identity);
 });
 if(group==='downgrade')for(const [label,media,reason]of [
  ['active media',{schema:{type:'array',items:{type:'string'}},itemEncoding:{contentType:'application/json'}},'target-representation'],
  ['media alternatives',{schema:{type:'array',items:{type:'string'}},itemEncoding:{contentType:'text/plain, application/json'}},'target-representation'],
  ['part transfer header',{schema:{type:'array',items:{type:'string'}},itemEncoding:{headers:{'Content-Transfer-Encoding':{required:true,schema:{const:'base64'}}}}},'target-representation'],
  ['conditional shape',{schema:{type:'array',items:{oneOf:[{type:'string'},{type:'object'}]}},itemEncoding:{contentType:'text/plain'}},'unavailable-proof'],
  ['unknown shape',{itemEncoding:{contentType:'text/plain'}},'unavailable-proof'],
 ])test(`R3d1 ${label} keeps a located ${reason} refusal`,async()=>{
  const {input}=capture('3.2.1','yaml',media),original=input.resources[0].text,review=await planMigration(input);
  assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert.equal(input.resources[0].text,original);
  const problem=review.problems.find(value=>value.code==='migration.encoding.itemEncoding');assert(problem,JSON.stringify(review.problems));assert.equal(problem.reason,reason);assert.equal(problem.pointer,at+'/itemEncoding');assert(problem.range[1]>problem.range[0]);
 });
 if(group==='owners')for(const format of ['yaml','json'])test(`R3d1 ${format} schema-proven absent rules keep independent Header schema owners`,async()=>{
  const {input,value,encode}=capture('3.2.1',format,{schema:{type:'array',maxItems:0},prefixEncoding:[{contentType:'image/png',headers:{'X-Required':{required:true,schema:{type:'integer',minimum:'EXACT'}}}}],itemEncoding:{contentType:'application/xml'}});
  value.components={schemas:{Independent:{$ref:'#'+at+'/prefixEncoding/0/headers/X-Required/schema'}}};input.resources[0].text=encode(value);
  const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
  const cold={root:review.outputRoot,resources:review.outputs,snapshot:'cold-absent'},graph=createGraph(cold).graph;
  assert.equal(analyse(cold).complete,true,JSON.stringify(analyse(cold).findings));assert(graph.entryReferences().filter(edge=>edge.kind==='schema').every(edge=>edge.resolution==='resolved'));
  assert(review.outputs.some(output=>output.text.includes('9007199254740993.00')));
 });
 if(group==='swagger')test('R3d1 unnamed active positional parts cannot become Swagger named formData',async()=>{
  const {input}=capture('3.2.1','json',{schema:{type:'array',items:{type:'string'}},itemEncoding:{contentType:'text/plain'}},'2.0');
  const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
  assert(review.problems.some(problem=>problem.reason==='target-representation'),JSON.stringify(review.problems));
 });
 if(group==='multipart')test('R3d1 mixed structured and encoded parts retain exact wire under default removal',async()=>{
  const {input}=capture('3.2.1','json',{schema:{type:'array',maxItems:2,prefixItems:[{type:'object',properties:{n:{const:'EXACT'}}},{type:'string',contentEncoding:'base64'}]},prefixEncoding:[{contentType:'application/json'},{contentType:'application/octet-stream'}]});
  const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
  const cold={root:review.outputRoot,resources:review.outputs,snapshot:'cold-bytes'};
  const body=Buffer.from('--Parts\r\nContent-Type: application/json\r\n\r\n{"n":9007199254740993.00}\r\n--Parts\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: base64\r\n\r\nAP8=\r\n--Parts--\r\n');
  const before=await evaluate(input,body),after=await evaluate(cold,body);
  assert.equal(before.complete,true,JSON.stringify(before.runtimeFindings));assert.equal(after.complete,true,JSON.stringify(after.runtimeFindings));assert(after.runtimeEvaluations.every(value=>value.valid));
  assert.deepEqual(after.runtimeEvaluations.map(value=>value.valid),before.runtimeEvaluations.map(value=>value.valid));
 });
};
module.exports.capture=capture;
