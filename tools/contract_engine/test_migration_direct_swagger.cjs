const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');
const {analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const versions=['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
for(const targetVersion of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])test(`R2 Swagger ${format} inherited mixed forms and reusable file responses -> ${targetVersion}`,async()=>{
 const root='file:///approved/api.'+format;
 const response={$ref:'#/responses/File'},value={swagger:'2.0',info:{title:'Mixed R2',version:'1'},host:'api.invalid',schemes:['https'],consumes:['multipart/form-data'],produces:['application/octet-stream','image/png'],paths:{'/items':{parameters:[{name:'file',in:'formData',type:'file',required:true,maxLength:0},{name:'name',in:'formData',type:'string',allowEmptyValue:true},{name:'numbers',in:'formData',type:'array',collectionFormat:'multi',allowEmptyValue:true,items:{type:'integer',minimum:0}}],post:{responses:{200:response}}},'/file':{get:{produces:['image/png'],responses:{200:response}}}},responses:{File:{description:'Shared file',schema:{type:'file',format:'byte'}}}};
 const text=format==='json'?JSON.stringify(value):YAML.stringify(value),input={root,snapshot:'R2-swagger',resources:[{id:root,text,generation:4}],targetVersion,destination:'file:///reviewed/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(input.resources[0].text,text);
 assert(result.outputs.some(output=>output.text.includes('file_format')));
 const after={root:result.outputRoot,snapshot:'R2-cold',resources:result.outputs.map(value=>({id:value.id,text:value.text,generation:0}))};
 assert.equal(analyse(after).complete,true);
 const {createGraph}=require('./dist/model.cjs'),{requestOperation}=require('./dist/execution.cjs');
 for(const captured of [input,after]){
  const {graph}=createGraph(captured),operation=graph.operations().find(value=>value.path==='/items'),plan=requestOperation({...captured,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
  assert.deepEqual(plan.responses[0].content.map(value=>value.mediaType).sort(),['application/octet-stream','image/png']);
  const type='multipart/form-data; boundary=R2';
  for(const raw of [Buffer.alloc(0),Buffer.from([0,255,128])]){
   const bytes=Buffer.concat([Buffer.from('--R2\r\nContent-Disposition: form-data; name="file"\r\nContent-Type: application/octet-stream\r\n\r\n'),raw,Buffer.from('\r\n--R2\r\nContent-Disposition: form-data; name="name"\r\n\r\n\r\n--R2\r\nContent-Disposition: form-data; name="numbers"\r\n\r\n0\r\n--R2--\r\n')]);
   const media=plan.requestBody.content[0],checked=await evaluateSchemas({...captured,runtimeInstances:[{subject:'request-body',location:type,text:bytes.toString('base64'),mediaType:type,mediaBase64:true,form:media.swaggerForm?{resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence}:media.definition??media.source}]});
   assert.equal(checked.complete,true,JSON.stringify(checked.runtimeFindings));assert(checked.runtimeEvaluations.every(value=>value.valid));assert(!checked.runtimeFindings.some(value=>value.severity==='error'));
  }
  for(const media of plan.responses[0].content)for(const raw of [Buffer.alloc(0),Buffer.from([0,255,128])]){
   const checked=await evaluateSchemas({...captured,runtimeInstances:[{subject:'response-body',location:media.mediaType,mediaType:media.mediaType,mediaBase64:true,text:raw.toString('base64'),media:media.definition??media.source}]});
   assert.equal(checked.complete,true);assert(checked.runtimeEvaluations.length>0&&checked.runtimeEvaluations.every(value=>value.complete&&value.valid));
  }
 }
});
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
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.producerVersion,'90');
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
  assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(p=>p.code==='migration.schema.binary-context'&&p.reason==='target-representation'));
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

for(const targetVersion of ['3.0.4',...versions])for(const format of ['yaml','json'])
test(`Swagger ${format} file is never emitted as an unrestricted union for ${targetVersion}`,async()=>{
 const root='file:///approved/api.'+format,value={swagger:'2.0',info:{title:'Invalid file union',version:'1'},produces:['application/octet-stream','application/json'],
  paths:{'/file':{get:{responses:{200:{description:'Reply',schema:{type:['file','object']}}}}}}};
 const text=format==='json'?JSON.stringify(value):YAML.stringify(value),input={root,snapshot:'invalid-file-union',targetVersion,destination:'file:///reviewed/',resources:[{id:root,text,generation:1}]};
 const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert.deepEqual(result.changes,[]);
 assert(result.problems.some(problem=>problem.code.startsWith('migration.validation.')&&problem.reason==='source-incomplete'),JSON.stringify(result.problems));
 assert.equal(input.resources[0].text,text);
});
