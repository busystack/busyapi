const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');
const {analyse,createGraph}=require('./dist/model.cjs');
const {requestOperation}=require('./dist/execution.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {resolveUri}=require('./dist/reference_graph.cjs');

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ref=name=>({$ref:'#/x-data/'+name});
const node=()=>({$ref:'#/components/schemas/Count'});
const payload=(id,bytes,aliases=[])=>({version:1,id,aliases,generation:3,state:'available',identity:hash(bytes),byteLength:bytes.length,base64:bytes.toString('base64')});
function fixture(version,format){
 const root='file:///approved/contracts/api.'+format;
 const media=()=>({schema:node(),examples:{External:ref('example')}});
 const data={
  example:{description:'[Example](../example.md)',externalValue:'count.bin'},
  queryExample:{externalValue:'query.bin'},
  parameter:{name:'n',in:'query',required:true,schema:node(),examples:{External:ref('queryExample')}},
  header:{description:'[Header](../header.md)',content:{'application/json':{schema:node()}},examples:{External:ref('example')}},
  media:media(),
  body:{required:true,content:{'application/json':version.startsWith('3.2')?ref('media'):media()}},
  response:{description:'[Reply](../reply.md)',headers:{'X-Count':ref('header')},
   content:{'application/json':version.startsWith('3.2')?ref('media'):media()},links:{Next:ref('link')}},
  operation:{operationId:'detached',responses:{204:{description:'Done'}}},
  link:{description:'[Next](../next.md)',operationRef:'#/x-data/operation'},
  callback:{'https://callback.invalid/':{post:{responses:{204:{description:'Callback'}}}}},
  pathItem:{servers:[{url:'../api/{tenant}',variables:{tenant:{default:'one',enum:['one','two']}}}],post:{
   parameters:[ref('parameter')],requestBody:ref('body'),responses:{200:ref('response')},callbacks:{Notify:ref('callback')},
  }},
 };
 if(version.startsWith('3.2')){
  data.security={type:'apiKey',in:'header',name:'X-Secret',description:'Captured key'};
  data.pathItem.post.security=[{'#/x-data/security':['reader'],[root+'#/x-data/security']:['writer']}];
 }
 const value={openapi:version,info:{title:'Independent native uses',version:'business'},
  ...(version.startsWith('3.2')?{$self:'https://contracts.invalid/api.'+format}:{}),
  paths:{'/echo':ref('pathItem')},components:{schemas:{Count:{type:'integer',enum:['EXACT']},
   ...(!version.startsWith('3.0')?{HeaderAsSchema:ref('header')}:{})}},'x-data':data,'x-alias':data};
 const text=(format==='yaml'?'# Keep native/data ownership 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 return {root,snapshot:'native-object-uses',resources:[{id:root,text,generation:4,aliases:['https://retrieval.invalid/contracts/api.'+format]}],
  exampleResources:[payload('file:///approved/contracts/count.bin',Buffer.from('9007199254740993.00'),
   ['https://retrieval.invalid/contracts/count.bin','https://contracts.invalid/count.bin']),
   payload('file:///approved/contracts/query.bin',Buffer.from('n=9007199254740993'),
    ['https://retrieval.invalid/contracts/query.bin','https://contracts.invalid/query.bin'])],
  targetVersion:'3.2.1',destination:'file:///delivered/'};
}
function delivered(review,destination='file:///cold/elsewhere/'){
 const aliases=path=>Object.entries(review.manifest.resourceMappings).filter(([,mapped])=>mapped===path).map(([uri])=>uri).sort();
 return {root:new URL(review.entry,destination).href,snapshot:'cold-native-uses',
  resources:review.outputs.map(output=>({id:new URL(output.path,destination).href,text:output.text,generation:0,aliases:aliases(output.path)})),
  exampleResources:review.exampleOutputs.map(output=>payload(new URL(output.path,destination).href,Buffer.from(output.base64,'base64'),aliases(output.path)))};
}
async function wire(input){
 const {graph}=createGraph(input),operation=graph.operations().find(operation=>operation.path==='/echo');
 const plan=requestOperation({...input,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
 const header=graph.references.find(reference=>reference.kind==='header'&&reference.pointer.endsWith('/headers/X-Count'));
 assert(header);assert.equal(plan.parameters[0].name,'n');
 const runtimeInstances=[...['n=9007199254740993','n=9007199254740992'].map((text,index)=>({
  subject:'request-parameter',location:'query:'+index,text,parameter:{resource:plan.parameters[0].source.resource,pointer:plan.parameters[0].source.pointer}})),
  ...['9007199254740993','9007199254740992'].map((text,index)=>({subject:'response-header',location:'header:'+index,text:'',
   header:{resource:header.resource,pointer:header.pointer,name:'X-Count',values:[text]}})),
  ...['request-body','response-body'].flatMap(subject=>['9007199254740993','9007199254740992'].map((text,index)=>({
   subject,location:subject+':'+index,text,schema:subject==='request-body'?plan.requestBody.content[0].schema:plan.responses[0].content[0].schema})))];
 const result=await evaluateSchemas({...input,runtimeInstances});
 assert.equal(result.complete,true,JSON.stringify(result.findings));
 assert(result.serializedEvaluations.length>=4);assert(result.serializedEvaluations.every(value=>value.complete&&value.valid),JSON.stringify(result.findings));
 assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false,true,false,true,false,true,false]);
 return result;
}
for(const version of ['3.0.4','3.1.2','3.2.0'])for(const format of ['yaml','json'])
test(`${version} ${format} native objects and literal values share one specialization/publication path`,async()=>{
 const input=fixture(version,format),original=input.resources[0].text,doc=new SourceDocument(original,input.root);
 assert.equal(analyse(input).status,'complete');await wire(input);
 const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));assert.equal(review.producerVersion,'45');
 assert.equal(review.exampleOutputs.length,2);assert.equal(input.resources[0].text,original);
 const output=delivered(review),{graph}=createGraph(output);
 assert.equal(analyse(output).status,'complete');await wire(output);
 const root=graph.docs.get(output.root);
 for(const pointer of ['/x-data','/x-alias'])assert.equal(root.dataJson(pointer),doc.dataJson(pointer));
 for(const kind of ['path-item','parameter','request-body','response','header','example','link','callback','operation',...(version.startsWith('3.2')?['media','security']:[])]){
  const reference=graph.references.find(reference=>reference.kind===kind&&reference.resolution==='resolved'&&reference.targetPointer.includes('/_migrated_object_use_'));
  assert(reference,kind+' retains its independently owned target');
  assert.equal(graph.literalContainer(reference.targetResource,reference.targetPointer),undefined);
 }
 if(version.startsWith('3.2')){
  const bindings=graph.references.filter(reference=>reference.connection==='security');
  assert.equal(bindings.length,2);assert(bindings.every(reference=>reference.resolution==='resolved'&&reference.targetUri!==undefined));
  assert.notEqual(bindings[0].keyword,bindings[1].keyword);
  assert.deepEqual(bindings.map(binding=>graph.docs.get(binding.resource).dataNode(binding.pointer+'/'+binding.keyword.replaceAll('~','~0').replaceAll('/','~1')).value),[['reader'],['writer']]);
 }
 const native=graph.references.find(reference=>reference.kind==='header'&&reference.pointer.endsWith('/headers/X-Count'));
 const header=graph.docs.get(native.targetResource).dataNode(native.targetPointer).value;
 const sourceHeader=createGraph(input).graph.scopeAs(input.root,'/x-data/header','header');
 const descriptionTarget=header.description.match(/\]\(([^)]+)\)/)[1];
 assert.equal(resolveUri(descriptionTarget,graph.scopeAs(native.targetResource,native.targetPointer,'header').base).href,resolveUri('../header.md',sourceHeader.base).href);
 if(!version.startsWith('3.0')){
  const schema=graph.referenceAs(output.root,'/components/schemas/HeaderAsSchema','$ref','schema');
  assert.notEqual(schema.targetPointer,native.targetPointer);
  assert.equal(graph.docs.get(schema.targetResource).dataJson(schema.targetPointer+'/content'),doc.dataJson('/x-data/header/content'));
  assert(!graph.references.some(reference=>reference.resource===schema.targetResource&&reference.pointer.startsWith(schema.targetPointer+'/content/')));
 }
 if(version.startsWith('3.2'))assert.deepEqual(review.stages,[],'A same-family patch update is not a family conversion');
 if(format==='yaml')assert(root.text.includes('*'),'The unaffected literal alias remains authored as an alias');
});
test('anchored schemas inside native Header data retain the original resource through the common allocator',async()=>{
 const root='file:///approved/headers.json';
 const value={openapi:'3.1.2',info:{title:'Anchored Header',version:'business'},paths:{'/p':{get:{responses:{204:{description:'No body',headers:{'X-N':{$ref:'#/x-data'}}}}}}},
  components:{schemas:{Anchor:{$ref:'#count'}}},'x-data':{schema:{$anchor:'count',type:'integer',enum:['EXACT']}}};
 const text=JSON.stringify(value).replaceAll('"EXACT"','9007199254740993.00');
 const input={root,snapshot:'anchored-header',resources:[{id:root,text,generation:0}],targetVersion:'3.2.1',destination:'file:///delivered/'};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=delivered(review),{graph}=createGraph(output),header=graph.references.find(reference=>reference.kind==='header');
 assert.equal(header.targetResource,output.root);assert(header.targetPointer.startsWith('/components/headers/_migrated_object_use_'));
 const anchor=graph.referenceAs(output.root,'/components/schemas/Anchor','$ref','schema');
 assert.equal(anchor.targetPointer,header.targetPointer+'/schema');
 assert.equal(graph.docs.get(output.root).dataJson('/x-data'),new SourceDocument(text,root).dataJson('/x-data'));
 const evaluated=await evaluateSchemas({...output,runtimeInstances:['9007199254740993','9007199254740992'].map(text=>({subject:'response-header',location:text,text:'',
  header:{resource:output.root,pointer:'/paths/~1p/get/responses/204/headers/X-N',name:'X-N',values:[text]}}))});
 assert.equal(evaluated.complete,true);assert.deepEqual(evaluated.runtimeEvaluations.map(value=>value.valid),[true,false]);
});
for(const condition of ['missing','denied'])test(`${condition} external bytes remain an incomplete condition through native literal ownership`,async()=>{
 const input=fixture('3.1.2','json'),before=input.resources[0].text;
 input.exampleResources=condition==='missing'?[]:input.exampleResources.map(resource=>({version:1,id:resource.id,aliases:resource.aliases,generation:resource.generation,
  state:'unavailable',identity:resource.identity,problem:{condition:'unavailable',code:'example.external-value.denied',message:'Controlled denial'}}));
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert.deepEqual(review.exampleOutputs,[]);
 assert(review.problems.some(problem=>problem.code.startsWith('migration.validation.')));assert.equal(input.resources[0].text,before);
});

// One value can satisfy more than one native Object definition. Its roles
// share source bytes, never the interpretation of their incoming references.
for(const version of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])
test(`${version} ${format} shared Response/Request Body roles remain editable and migrate independently`,async()=>{
 const {inspect,propose}=require('./dist/model.cjs'),{referencePage,referenceDocument}=require('./dist/reference_projection.cjs');
 const root='file:///approved/roles.'+format,pointer='/components/responses/Shared';
 const value={openapi:version,info:{title:'Native roles',version:'business'},paths:{'/echo':{post:{
  requestBody:{$ref:'#/components/requestBodies/Body'},responses:{200:{$ref:'#/components/responses/Shared'}}}}},
  components:{responses:{Shared:{description:'[Guide](../guide.md)',content:{'application/json':{
   schema:{type:'integer',enum:['EXACT']},examples:{Sample:{value:'EXACT'}}}}}},requestBodies:{Body:{$ref:'#/components/responses/Shared'}}}};
 const text=(format==='yaml'?'# Roles 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'native-roles',resources:[{id:root,text,generation:7}],targetVersion:'3.2.1',destination:'file:///delivered/roles/'};
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));
 const graph=createGraph(input).graph;
 assert.deepEqual(new Set(graph.scopesAt(root,pointer).map(scope=>scope.kind)),new Set(['response','request-body']));
 for(const kind of ['response','request-body']){
  const page=inspect({...input,resource:root,pointer,contextKind:kind});
  assert.equal(page.kind,kind);assert.equal(page.interpretations.length,2);
  assert(page.fields.some(field=>field.name===(kind==='response'?'headers':'required')));
  assert.equal(page.fields.some(field=>field.name===(kind==='response'?'required':'headers')),false);
  assert.equal(referencePage({...input,resource:root,pointer,contextKind:kind}).kind,kind);
 }
 assert.throws(()=>inspect({...input,resource:root,pointer,contextKind:'parameter'}),error=>error.code==='inspect.context.stale');
 const documentation=referenceDocument(input),section=documentation.sections.find(section=>section.source.pointer===pointer);
 assert.deepEqual(new Set(section.interpretations.map(role=>role.kind)),new Set(['response','request-body']));
 const before=requestOperation({...input,resource:root,pointer:'/paths/~1echo/post'});
 const check=async(packet,plan)=>{
  const result=await evaluateSchemas({...packet,runtimeInstances:['request-body','response-body'].flatMap(subject=>
   ['9007199254740993','9007199254740992'].map(text=>({subject,location:subject+text,text,
    schema:subject==='request-body'?plan.requestBody.content[0].schema:plan.responses[0].content[0].schema})))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));
  assert.deepEqual(result.runtimeEvaluations.map(result=>result.valid),[true,false,true,false]);
 };
 await check(input,before);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=delivered(review),after=requestOperation({...output,resource:output.root,pointer:'/paths/~1echo/post'}),owned=createGraph(output).graph;
 await check(output,after);
 assert.equal(analyse(output).status,'complete',JSON.stringify(analyse(output).findings));
 const binding=owned.referenceAs(output.root,'/components/requestBodies/Body','$ref','request-body');
 assert(binding.targetPointer.startsWith('/components/requestBodies/_migrated_object_use_'));
 assert.notEqual(binding.targetPointer,pointer);
 assert.equal(owned.scopeAs(binding.targetResource,binding.targetPointer,'request-body').kind,'request-body');
 const page=inspect({...output,resource:binding.targetResource,pointer:binding.targetPointer,contextKind:'request-body'});
 assert(page.fields.some(field=>field.name==='required'));
 const edit=propose({...output,target:page,actions:[{kind:'set',pointer:page.pointer+'/required',value:true}]});
 assert(edit.edits.length>0);assert.equal(input.resources[0].text,text);
});
