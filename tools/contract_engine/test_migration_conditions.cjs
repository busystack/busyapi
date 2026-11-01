const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const mode of ['both','then','else','neither','no-if'])test(`${version} ${format} ${mode} conditional lowers with independent captured targets`,async()=>{
 const root='file:///approved/api.'+format,condition={properties:{flag:{enum:[true]}},required:['flag']};
 const schema={type:'object',properties:{flag:{type:'boolean'}},...(mode!=='no-if'?{if:condition}:{}),
  ...(['both','then','no-if'].includes(mode)?{then:{required:['n'],properties:{n:{type:'integer',minimum:'EXACT'}}}}:{}),
  ...(['both','else','no-if'].includes(mode)?{else:{required:['label'],properties:{label:{type:'string',minLength:1}}}}:{})};
 const value={openapi:version,info:{title:'Conditional 雪',version:'api'},paths:{},components:{schemas:{Value:schema,
  ...(mode!=='no-if'?{Condition:{$ref:'#/components/schemas/Value/if'}}:{Inactive:{$ref:'#/components/schemas/Value/then'}})}},'x-kept':{n:'EXACT',if:condition}};
 const text=(format==='yaml'?'# Preserve condition\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'condition-'+mode,resources:[{id:root,text,generation:6}],targetVersion:'3.0.4',destination:'file:///converted/'};
 assert.equal(analyse(input).status,'complete');
 const samples=['{}','{"flag":true}','{"flag":false}','{"flag":true,"n":9007199254740993}','{"flag":true,"n":9007199254740992}','{"flag":false,"label":"雪"}','{"flag":false,"label":""}','null'];
 const evaluate=(capture,pointer)=>evaluateSchemas({...capture,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:capture.root,pointer}}))});
 const before=await evaluate(input,'/components/schemas/Value');assert.equal(before.complete,true,JSON.stringify(before.findings));
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(input.resources[0].text,text);
 const target={root:result.outputRoot,snapshot:'cold',resources:result.outputs.map(o=>({id:o.id,text:o.text,generation:0}))};assert.equal(analyse(target).status,'complete');
 const after=await evaluate(target,'/components/schemas/Value');assert.equal(after.complete,true,JSON.stringify(after.findings));assert.deepEqual(after.runtimeEvaluations.map(v=>v.valid),before.runtimeEvaluations.map(v=>v.valid));
 const selected='/components/schemas/'+(mode==='no-if'?'Inactive':'Condition');
 const independentBefore=await evaluate(input,selected),independentAfter=await evaluate(target,selected);
 assert.equal(independentAfter.complete,true,JSON.stringify(independentAfter.findings));assert.deepEqual(independentAfter.runtimeEvaluations.map(v=>v.valid),independentBefore.runtimeEvaluations.map(v=>v.valid));
 const doc=new SourceDocument(result.outputs.find(o=>o.id===target.root).text,target.root);assert.equal(doc.dataNode('/components/schemas/Value/if'),undefined);assert.equal(doc.dataNode('/components/schemas/Value/then'),undefined);assert.equal(doc.dataNode('/components/schemas/Value/else'),undefined);assert.equal(doc.dataJson('/x-kept'),new SourceDocument(text,root).dataJson('/x-kept'));
});
