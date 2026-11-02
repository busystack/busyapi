const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');
const {analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const versions=['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
function fixture(format,external=false){
 const root='file:///approved/api.'+format,model='file:///approved/model.'+format;
 const tuple={type:'array',items:[{type:'integer',minimum:'EXACT',exclusiveMinimum:true},{type:'string'}]};
 const value={swagger:'2.0',info:{title:'Direct tuple 雪',version:'business'},host:'api.example.invalid',schemes:['https'],produces:['application/json'],
  paths:{'/items':{get:{parameters:[{name:'q',in:'query',type:'integer',minimum:'EXACT',exclusiveMinimum:true}],responses:{200:{description:'Values',schema:{$ref:'#/definitions/Tuple'},headers:{'X-N':{type:'integer',minimum:'EXACT',exclusiveMinimum:true}}}}}}},
  definitions:{Tuple:external?{$ref:'model.'+format+'#/Tuple'}:tuple},'x-kept':{n:'EXACT',value:{$ref:'literal.json'},flag:false}};
 const encode=value=>(format==='yaml'?'# Keep comments\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 return {root,snapshot:'direct-swagger',destination:'file:///reviewed/',resources:[{id:root,text:encode(value),generation:9},...(external?[{id:model,text:encode({Tuple:tuple}),generation:7}]:[])]};
}
for(const targetVersion of versions)for(const format of ['yaml','json'])for(const external of [false,true])test(`Swagger tuple -> ${targetVersion} ${format} external=${external} bypasses restricted intermediate schemas`,async()=>{
 const input={...fixture(format,external),targetVersion},original=input.resources.map(r=>r.text);
 assert.equal(analyse(input).status,'complete');
 const values=['[]','[9007199254740994]','[9007199254740994,"雪",false,null,{}]','[9007199254740993]','["wrong"]','[9007199254740994,0]'];
 const evaluate=(capture,pointer)=>evaluateSchemas({...capture,runtimeInstances:values.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:capture.root,pointer}}))});
 const before=await evaluate(input,'/definitions/Tuple');assert.equal(before.complete,true,JSON.stringify(before.findings));
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.producerVersion,'52');
 assert(!result.stages.some(stage=>stage.from==='2.0'&&stage.to==='3.0'));
 const target={root:result.outputRoot,snapshot:'cold',resources:result.outputs.map(o=>({id:o.id,text:o.text,generation:0}))};
 assert.equal(analyse(target).status,'complete');
 const after=await evaluate(target,'/components/schemas/Tuple');assert.equal(after.complete,true,JSON.stringify(after.findings));
 assert.deepEqual(before.runtimeEvaluations.map(v=>v.valid),[true,true,true,false,false,false]);
 assert.deepEqual(after.runtimeEvaluations.map(v=>v.valid),before.runtimeEvaluations.map(v=>v.valid));
 const doc=new SourceDocument(result.outputs.find(o=>o.id===result.outputRoot).text,result.outputRoot);
 for(const pointer of ['/paths/~1items/get/parameters/0/schema','/paths/~1items/get/responses/200/headers/X-N/schema']){
  assert.equal(doc.dataJson(pointer+'/exclusiveMinimum'),'9007199254740993.00');assert.equal(doc.dataNode(pointer+'/minimum'),undefined);
 }
 assert.equal(doc.dataJson('/x-kept'),new SourceDocument(original[0],input.root).dataJson('/x-kept'));
 assert.deepEqual(input.resources.map(r=>r.text),original);
 const returned=await planMigration({...target,targetVersion:'2.0',destination:'file:///returned/'});
 assert.equal(returned.complete,true,JSON.stringify(returned.problems));
});
for(const format of ['yaml','json'])test(`Swagger ${format} tuple still receives a final-target restriction for 3.0`,async()=>{
 const input={...fixture(format),targetVersion:'3.0.4'},result=await planMigration(input);
 assert.equal(result.status,'blocked');assert.deepEqual(result.outputs,[]);
 assert(result.problems.some(p=>p.code==='migration.schema.tuple'&&p.reason==='target-representation'));
});
for(const targetVersion of ['3.0.4',...versions])for(const media of ['application/octet-stream','application/json'])test(`Swagger file response ${media} -> ${targetVersion} retains raw semantics or a specific mapping blocker`,async()=>{
 const root='file:///approved/api.json',text=JSON.stringify({swagger:'2.0',info:{title:'Raw file',version:'1'},host:'api.example.invalid',schemes:['https'],produces:[media],paths:{'/file':{get:{responses:{200:{description:'File',schema:{type:'file'}}}}}}});
 const input={root,snapshot:'file-response',resources:[{id:root,text,generation:0}],targetVersion,destination:'file:///reviewed/'},result=await planMigration(input);
 assert.equal(analyse(input).status,'complete');
 if(media==='application/json'){
  assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(p=>p.code==='migration.schema.binary-context'&&p.reason==='implementation'));
 }else{
  assert.equal(result.complete,true,JSON.stringify(result.problems));
  const after={root:result.outputRoot,snapshot:'raw-file-cold',resources:result.outputs.map(o=>({id:o.id,text:o.text,generation:0}))},operation='/paths/~1file/get/responses/200';
  const sourcePointer=operation+'/schema',pointer=operation+'/content/application~1octet-stream/schema';
  const checked=await evaluateSchemas({...after,runtimeInstances:[{subject:'response-body',location:media,text:'/wAA/w==',mediaType:media,mediaBase64:true,schema:{resource:after.root,pointer}}]});
  const original=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:media,text:'/wAA/w==',mediaType:media,mediaBase64:true,schema:{resource:root,pointer:sourcePointer}}]});
  assert.equal(original.complete,true,JSON.stringify(original.findings));assert.equal(checked.complete,true,JSON.stringify(checked.findings));assert.deepEqual(checked.runtimeEvaluations.map(v=>v.valid),original.runtimeEvaluations.map(v=>v.valid));
 }
 assert.equal(input.resources[0].text,text);
});
