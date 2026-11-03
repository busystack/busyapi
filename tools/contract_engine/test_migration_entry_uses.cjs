const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {analyse,createGraph}=require('./dist/model.cjs');
const {planMigration}=require('./dist/migration.cjs');
const {requestOperation}=require('./dist/execution.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');

const root='file:///entries/legacy.json',other='file:///entries/modern.json',models='file:///entries/models.json',headers='file:///entries/headers.json';
function fixture(format,recursive){
 const entry=(version,name)=>({openapi:version,info:{title:name,version:'business'},paths:{'/p':{post:{
  requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/Model'}}}},
  responses:{200:{description:'Response',headers:{'X-Name':{$ref:'headers.json#/Header'}},content:{'application/json':{schema:{$ref:'#/components/schemas/Model'}}}}}}},
  components:{schemas:{Model:{$ref:'models.json#/Forward'}}}});
 const node=recursive?{type:'array',items:{$ref:'#/Node'},nullable:true}:{type:'string',minLength:1,nullable:true};
 const values=[entry('3.0.4','Legacy'),entry('3.2.1','Modern'),
  {Forward:{$ref:'#/Node'},Node:{...node,description:'[Guide](guide.md)'},'x-literal':{$ref:'literal-only',zero:0,empty:'',flag:false}},
  {Header:{description:'[Header](headers.md)',schema:{type:'string',minLength:1}}}];
 const ids=[root,other,models,headers].map(id=>id.replace(/\.json$/,'.'+format));
 return {root:ids[0],snapshot:'entry-owned-'+format+recursive,targetVersion:'3.2.1',destination:'file:///delivered/entries/',resources:values.map((value,index)=>({
  id:ids[index],generation:index+1,text:(format==='yaml'?'# Keep source 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
   .replaceAll('models.json','models.'+format).replaceAll('headers.json','headers.'+format),
 }))};
}
async function check(packet,root,recursive,nullable){
 const input={...packet,root},analysis=analyse(input);assert.equal(analysis.status,'complete',JSON.stringify(analysis.findings));
 const plan=requestOperation({...input,resource:root,pointer:'/paths/~1p/post'});
 assert.equal(plan.responses[0].headers[0].name,'X-Name');
 const samples=recursive?['null','[]','[[]]','[null]','[0]']:['null','"雪"','""','false'];
 const expected=recursive?[nullable,true,true,nullable,false]:[nullable,true,false,false];
 const evaluated=await evaluateSchemas({...input,runtimeInstances:[
  ...samples.map(text=>({subject:'response-body',location:text,text,schema:plan.responses[0].content[0].schema})),
  ...samples.map(text=>({subject:'request-body',location:text,text,schema:plan.requestBody.content[0].schema})),
 ]});
 assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.runtimeEvaluations.map(value=>value.valid),[...expected,...expected]);
}
for(const format of ['yaml','json'])for(const recursive of [false,true])
test(`${format} entry-dependent ${recursive?'recursive':'scalar'} schemas, forwarders and Headers receive independent common owners`,async()=>{
 const input=fixture(format,recursive),before=input.resources.map(resource=>resource.text);
 await check(input,input.root,recursive,true);await check(input,input.resources[1].id,recursive,false);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0})),snapshot:'cold-entry-owners'};
 for(const [source,nullable]of [[input.root,true],[input.resources[1].id,false]]){
  const output=review.changes.find(change=>change.resource===source).destination;
  await check(cold,output,recursive,nullable);
  const graph=createGraph({...cold,root:output}).graph;
  for(const reference of graph.references)if(reference.resolution==='resolved')assert(cold.resources.some(resource=>resource.id===reference.targetResource));
 }
 for(const resource of input.resources.slice(2)){
  const output=review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===resource.id).destination);
  assert.equal(output.text,resource.text,'Detached original fragments retain exact source values and comments');
 }
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
 const repeated=await planMigration(input);assert.equal(repeated.complete,true,JSON.stringify(repeated.problems));
 assert.deepEqual(repeated.outputs,review.outputs,'Owner names and selected consumers are deterministic');
});

test('identified entry resources acquire distinct owned identities while retaining original literals and cold behavior',async()=>{
 const input=fixture('json',false),value=JSON.parse(input.resources[2].text);
 value.Node.$id='https://schemas.invalid/shared';value.Node.$dynamicAnchor='node';
 // Both entries use modern semantics, so the source resource is valid in
 // both dialects. Its declaration is still one shared physical identity.
 input.resources[0].text=input.resources[0].text.replace('3.0.4','3.1.2');
 input.resources[2].text=JSON.stringify(value);
 const before=input.resources.map(resource=>resource.text);
 await check(input,input.root,false,false);await check(input,other,false,false);
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const packet={resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0})),snapshot:'cold-identified-entry'};
 const identities=[];
 for(const source of [input.root,other]){
  const root=result.changes.find(change=>change.resource===source).destination;
  await check(packet,root,false,false);
  const graph=createGraph({...packet,root}).graph;
  const generated=graph.scopesFor('schema').filter(scope=>scope.resource===root&&scope.pointer.startsWith('/components/schemas/_migrated_entry_use_')&&graph.docs.get(root).dataNode(scope.pointer+'/$id'));
  assert.equal(generated.length,1);identities.push(generated[0].base);
  assert.notEqual(generated[0].base,value.Node.$id);assert.equal(graph.identities.get(generated[0].base).length,1);
 }
 assert.equal(new Set(identities).size,2);
 const originalFragment=result.outputs.find(output=>output.id===result.changes.find(change=>change.resource===models).destination);
 assert.equal(originalFragment.text,input.resources[2].text);
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

test('partial entry schema resources share one neutral holder instead of acquiring duplicate anchor identities',async()=>{
 const input=fixture('json',false),value=JSON.parse(input.resources[2].text);
 value.Node.$dynamicAnchor='node';input.resources[0].text=input.resources[0].text.replace('3.0.4','3.1.2');input.resources[2].text=JSON.stringify(value);
 const before=input.resources.map(resource=>resource.text),result=await planMigration(input);
 assert.equal(result.complete,true,JSON.stringify(result.problems));
 const cold={snapshot:'cold-partial-resource',resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 for(const entry of [input.root,other]){
  const root=result.changes.find(change=>change.resource===entry).destination;
  await check(cold,root,false,false);
  const graph=createGraph({...cold,root}).graph;
  const holders=graph.entryScopes().filter(scope=>scope.kind==='schema'&&scope.resource===root&&scope.pointer.startsWith('/components/schemas/_migrated_resource_use_')&&scope.pointer===scope.resourcePointer);
  assert.equal(holders.length,1);
 }
 assert.equal(result.outputs.find(output=>output.id===result.changes.find(change=>change.resource===models).destination).text,input.resources[2].text);
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

for(const format of ['yaml','json'])test(`${format} intrinsic native schema slots reference their shared material owner without duplicating anchors or changing literal aliases`,async()=>{
 const input=fixture(format,false),value=YAML.parse(input.resources[3].text);
 value.Header.schema.$dynamicAnchor='header';value.Literal=value.Header.schema;
 input.resources[0].text=input.resources[0].text.replace('3.0.4','3.1.2');input.resources[3].text=format==='yaml'?YAML.stringify(value):JSON.stringify(value);
 const before=input.resources.map(resource=>resource.text),result=await planMigration(input);
 assert.equal(result.complete,true,JSON.stringify(result.problems));
 const cold={snapshot:'cold-native-resource',resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 for(const entry of [input.root,input.resources[1].id]){
  const root=result.changes.find(change=>change.resource===entry).destination,packet={...cold,root};
  await check(cold,root,false,false);
  const graph=createGraph(packet).graph,header=graph.entryReferences().find(reference=>reference.kind==='header'&&reference.pointer.endsWith('/headers/X-Name'));
  const schema=graph.docs.get(header.targetResource).dataNode(header.targetPointer+'/schema').value;
  assert.deepEqual(Object.keys(schema),['$ref']);
  const evaluations=await evaluateSchemas({...packet,runtimeInstances:['Name',''].map(text=>({subject:'response-header',location:text,text:'',
   header:{resource:header.resource,pointer:header.pointer,name:'X-Name',values:[text]}}))});
  assert.equal(evaluations.complete,true,JSON.stringify(evaluations.findings));assert.deepEqual(evaluations.runtimeEvaluations.map(value=>value.valid),[true,false]);
 }
 assert.equal(result.outputs.find(output=>output.id===result.changes.find(change=>change.resource===input.resources[3].id).destination).text,input.resources[3].text);
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

test('a specialized fragment selects its captured dialect instead of inheriting an entry override',async()=>{
 const input=fixture('json',false),legacy=JSON.parse(input.resources[0].text);
 legacy.openapi='3.1.2';legacy.jsonSchemaDialect='https://json-schema.org/draft/2020-12/schema';
 input.resources[0].text=JSON.stringify(legacy);
 await check(input,input.root,false,false);
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const output=result.changes.find(change=>change.resource===input.root).destination;
 const packet={root:output,resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0})),snapshot:'cold-entry-dialect'};
 await check(packet,output,false,false);
 const graph=createGraph(packet).graph,first=graph.referenceAs(output,'/components/schemas/Model','$ref','schema');
 const scope=graph.scopeAs(first.targetResource,first.targetPointer,'schema');
 assert.equal(scope.dialect,'https://spec.openapis.org/oas/3.1/dialect/base');
 assert.equal(graph.docs.get(scope.resource).dataNode(scope.pointer+'/$schema').value,scope.dialect);
});

for(const format of ['yaml','json'])test(`${format} shared operation, security and discriminator names retain each entry namespace`,async()=>{
 const root='file:///names/a.'+format,other='file:///names/b.'+format,shared='file:///names/uses.'+format;
 const api=name=>({openapi:'3.2.1',info:{title:name,version:'business'},paths:{'/p':{$ref:'uses.'+format+'#/Path'}},
  components:{securitySchemes:{Access:{type:'apiKey',in:'header',name:'X-'+name}},schemas:{Choice:{allOf:[{$ref:'uses.'+format+'#/Base'}],'x-entry':name}}}});
 const values=[api('First'),api('Second'),{Path:{get:{operationId:'shared',security:[{Access:[]}],responses:{200:{description:'Value',
  links:{Next:{$ref:'a.'+format+'#/components/links/Next'}},content:{'application/json':{schema:{$ref:'#/Base'}}}}}}},
  Base:{type:'object',properties:{kind:{type:'string'}},required:['kind'],discriminator:{propertyName:'kind',mapping:{chosen:'Choice'}},description:'[Guide](guide.md)'},
  Literal:{security:[{Access:[]}],mapping:{chosen:'Choice'},zero:0,flag:false,empty:''}}];
 values[0].components.links={Next:{operationId:'shared',description:'[Next](../next.md)'}};
 values[0]['x-next']=values[0].components.links.Next;
 values[0].components.schemas.Dictionary={$ref:'#/components'};
 values[0].components.schemas.Document={$ref:'#'};
 const input={root,snapshot:'entry-names',targetVersion:'3.1.2',destination:'file:///names-output/',resources:values.map((value,index)=>({
  id:[root,other,shared][index],generation:index,text:format==='yaml'?'# Keep namespaces 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)}))};
 const original=input.resources.map(resource=>resource.text);
 const inspect=(packet,converted=false)=>{
  assert.equal(analyse(packet).status,'complete',JSON.stringify(analyse(packet).findings));
  const graph=createGraph(packet).graph,operation=graph.operations().find(value=>value.path==='/p');
  const plan=requestOperation({...packet,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
  const bindings=graph.entryReferences().filter(reference=>reference.connection==='discriminator');
  assert.equal(bindings.length,1);assert.equal(bindings[0].resolution,'resolved');
  assert.equal(bindings[0].targetResource,packet.root);assert.equal(bindings[0].targetPointer,'/components/schemas/Choice');
  const links=graph.entryReferences().filter(reference=>reference.connection==='operationId'||reference.connection==='operationRef');
  assert.equal(links.length,1);assert.equal(links[0].resolution,'resolved');
  assert.equal(links[0].targetResource,operation.source.resource);assert.equal(links[0].targetPointer,operation.source.pointer);
  assert.equal(links[0].connection,converted?'operationRef':'operationId');
  assert.equal(graph.docs.get(operation.source.resource).dataNode(operation.source.pointer+'/operationId').value,'shared');
  const literal=graph.docs.get(packet.root).dataNode('/x-next');
  if(literal)assert.deepEqual(literal.value,values[0]['x-next'],'A literal YAML alias retains operationId data while the native Link gains its URI owner');
  return plan.security.schemes.Access.parameterName;
 };
 assert.equal(inspect(input),'X-First');assert.equal(inspect({...input,root:other}),'X-Second');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={snapshot:'cold-entry-names',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 for(const [entry,name]of [[root,'First'],[other,'Second']]){
  const outputRoot=review.changes.find(change=>change.resource===entry).destination;
  assert.equal(inspect({...cold,root:outputRoot},true),'X-'+name);
  if(entry===root){
   const {SourceDocument}=require('./dist/document.cjs'),before=new SourceDocument(original[0],root),graph=createGraph({...cold,root:outputRoot}).graph;
   for(const [name,pointer,fields]of [['Dictionary','/components',['schemas','links','securitySchemes']],['Document','',['openapi','paths','components','x-next']]]){
    const reference=graph.referenceAs(outputRoot,'/components/schemas/'+name,'$ref','schema');
    assert.equal(reference.resolution,'resolved');assert.notEqual(reference.targetPointer,pointer);
    const owner=graph.docs.get(reference.targetResource);
    for(const field of fields)assert.equal(owner.dataJson(reference.targetPointer+'/'+field),before.dataJson(pointer+'/'+field),name+' preserves its original '+field+' annotation');
   }
  }
 }
 const detached=review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===shared).destination);
 assert.equal(detached.text,input.resources[2].text);assert.deepEqual(input.resources.map(resource=>resource.text),original);
});

test('an inactive primary interpretation cannot choose a foreign entry native/schema owner family',async()=>{
 const root='file:///admission/a.json',other='file:///admission/b.json',shared='file:///admission/header.json';
 const first={openapi:'3.1.2',info:{title:'First',version:'business'},paths:{},components:{examples:{Other:{$ref:'b.json#/components/examples/Here'}}}};
 const second={openapi:'3.2.1',info:{title:'Second',version:'business'},paths:{'/p':{get:{responses:{204:{description:'Empty',headers:{'X-N':{$ref:'header.json#/Header'}}}}}}},
  components:{examples:{Here:{value:'Captured root'}},schemas:{HeaderAsSchema:{$ref:'header.json#/Header'}}}};
 const input={root,snapshot:'actual-role-capture',targetVersion:'3.2.1',destination:'file:///admitted/',resources:[
  {id:root,text:JSON.stringify(first),generation:1},{id:other,text:JSON.stringify(second),generation:2},
  {id:shared,text:'{"Header":{"description":"[Header](guide.md)","schema":{"type":"integer","enum":[9007199254740993.00]},"x-data":{"flag":false}}}',generation:3}]};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=review.changes.find(change=>change.resource===other).destination;
 const packet={root:output,snapshot:'cold-role-capture',resources:review.outputs.map(value=>({id:value.id,text:value.text,generation:0}))};
 assert.equal(analyse(packet).status,'complete',JSON.stringify(analyse(packet).findings));
 const graph=createGraph(packet).graph,header=graph.entryReferences().find(reference=>reference.kind==='header');
 assert(header);assert.equal(graph.scopeAs(header.targetResource,header.targetPointer,'header').family,'3.2');
 const plan=requestOperation({...packet,resource:output,pointer:'/paths/~1p/get'});
 const result=await evaluateSchemas({...packet,runtimeInstances:[
  ...['9007199254740993','9007199254740992'].map(text=>({subject:'response-header',location:text,text:'',header:{resource:header.resource,pointer:header.pointer,name:'X-N',values:[text]}})),
  {subject:'response-body',location:'independent schema',text:'null',schema:{resource:output,pointer:'/components/schemas/HeaderAsSchema'}},
 ]});
 assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false,true]);
 assert.equal(plan.responses[0].headers[0].name,'X-N');
 assert.equal(review.outputs.find(value=>value.id===review.changes.find(change=>change.resource===shared).destination).text,input.resources[2].text);
});

for(const [foreignVersion,entryVersion,targetVersion,anchored]of [
 ['3.0.4','3.2.1','3.2.1',false],['3.1.2','3.2.1','3.2.1',true],['3.2.1','3.1.2','3.1.2',true],
])for(const format of ['yaml','json'])test(`${format} foreign ${foreignVersion} components retain their family and ${entryVersion} entry bindings`,async()=>{
 const root='file:///mixed/a.'+format,other='file:///mixed/b.'+format;
 const model={...(anchored?{$dynamicAnchor:'node'}:{}),type:'object',properties:{value:{type:'integer',enum:['EXACT']},entry:{type:'string'},
  ...(anchored?{child:{$dynamicRef:'#node'}}:{})},required:['value','entry'],discriminator:{propertyName:'entry',mapping:{chosen:'Choice'}},description:'[Guide](guide.md)'};
 const operation=prefix=>({responses:{200:{description:'Value',headers:{'X-Value':{$ref:prefix+'#/components/headers/Shared'}},
  content:{'application/json':{schema:{$ref:prefix+'#/components/schemas/Base'}}}}}});
 const api=(version,name,prefix)=>({openapi:version,info:{title:name,version:'business'},paths:{'/p':{get:operation(prefix)}},
  components:{schemas:{Choice:{allOf:[{$ref:'b.'+format+'#/components/schemas/Base'}],'x-entry':name}}}});
 const first=api(entryVersion,'First','b.'+format),second=api(foreignVersion,'Second','');
 second.components.schemas.Base=model;second.components.headers={Shared:{description:'[Header](headers.md)',schema:{$ref:'#/components/schemas/Base'}}};
 second['x-history']=model;
 const encode=value=>(format==='yaml'?'# Keep source 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'mixed-native-holder',targetVersion,destination:'file:///mixed-output/',resources:[{id:root,text:encode(first),generation:1},{id:other,text:encode(second),generation:2}]};
 const original=input.resources.map(resource=>resource.text),history=new (require('./dist/document.cjs').SourceDocument)(input.resources[1].text,other).dataJson('/x-history');
 const follow=(graph,resource,pointer,kind)=>{
  for(let count=0;count<64;count++){
   const reference=graph.referenceAs(resource,pointer,'$ref',kind);
   if(!reference)return {resource,pointer};
   assert.equal(reference.resolution,'resolved');resource=reference.targetResource;pointer=reference.targetPointer;
  }
  assert.fail('The material owner forwarding chain must remain bounded');
 };
 const inspect=async(packet,name,dynamicChildren=anchored)=>{
  const analysis=analyse(packet);assert.equal(analysis.status,'complete',JSON.stringify(analysis.findings));
  const graph=createGraph(packet).graph,plan=requestOperation({...packet,resource:packet.root,pointer:'/paths/~1p/get'});
  const body=plan.responses[0].content[0].schema,owner=follow(graph,body.resource,body.pointer,'schema');
  const binding=graph.entryReferences().find(reference=>reference.connection==='discriminator'&&reference.resource===owner.resource&&reference.pointer===owner.pointer+'/discriminator/mapping');
  assert.equal(binding.resolution,'resolved');assert.equal(binding.targetResource,packet.root);assert.equal(binding.targetPointer,'/components/schemas/Choice');
  const header=plan.responses[0].headers[0].schema;
  assert.deepEqual(follow(graph,header.resource,header.pointer,'schema'),owner);
  const choice=graph.docs.get(binding.targetResource).dataNode(binding.targetPointer).value;
  assert.equal(choice['x-entry'],name);
  const samples=['{"value":9007199254740993.00,"entry":"chosen"}','{"value":0}','{"value":"wrong"}',...(dynamicChildren?['{"value":9007199254740993.00,"entry":"chosen","child":{"value":9007199254740993.00,"entry":"chosen"}}','{"value":9007199254740993.00,"entry":"chosen","child":{"value":0,"entry":"chosen"}}']:[])];
  const evaluated=await evaluateSchemas({...packet,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:body}))});
  assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.runtimeEvaluations.map(value=>value.valid),[true,false,false,...(dynamicChildren?[true,false]:[])]);
 };
 await inspect(input,'First');await inspect({...input,root:other},'Second');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={snapshot:'cold-mixed-components',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 for(const [entry,name]of [[root,'First'],[other,'Second']])await inspect({...cold,root:review.changes.find(change=>change.resource===entry).destination},name);
 const output=review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===other).destination),doc=new (require('./dist/document.cjs').SourceDocument)(output.text,output.id);
 assert.equal(doc.dataJson('/x-history'),history);assert.deepEqual(input.resources.map(resource=>resource.text),original);
 const repeated=await planMigration(input);assert.equal(repeated.complete,true,JSON.stringify(repeated.problems));assert.deepEqual(repeated.outputs,review.outputs);
 if(anchored){
  // The container's independent annotation view must be captured before new
  // native variants are inserted, through the same typed role-owner relation.
  first.components.schemas.Dictionary={$ref:'b.'+format+'#/components'};
  const guarded={...input,resources:[{...input.resources[0],text:encode(first)},input.resources[1]]};
  assert.equal(analyse(guarded).status,'complete');
  const protectedReview=await planMigration(guarded);assert.equal(protectedReview.complete,true,JSON.stringify(protectedReview.problems));
  const protectedCold={snapshot:'cold-owned-container',resources:protectedReview.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
  const outputRoot=protectedReview.changes.find(change=>change.resource===root).destination;
  await inspect({...protectedCold,root:outputRoot},'First');
  const graph=createGraph({...protectedCold,root:outputRoot}).graph,annotation=follow(graph,outputRoot,'/components/schemas/Dictionary','schema');
  const doc=graph.docs.get(annotation.resource),before=new (require('./dist/document.cjs').SourceDocument)(input.resources[1].text,other);
  assert.notEqual(annotation.pointer,'/components');
  assert.equal(doc.dataJson(annotation.pointer+'/schemas'),before.dataJson('/components/schemas'));
  assert.equal(doc.dataJson(annotation.pointer+'/headers'),before.dataJson('/components/headers'));
  assert.equal(new (require('./dist/document.cjs').SourceDocument)(protectedCold.resources.find(resource=>resource.id===annotation.resource).text,annotation.resource).dataJson('/x-history'),history);
  assert.deepEqual(guarded.resources.map(resource=>resource.text),[encode(first),original[1]]);
  const assertionFirst=structuredClone(first),assertionSecond=structuredClone(second);
  assertionFirst.components.schemas.Assertions={$ref:'b.'+format+'#/components/schemas'};
  assertionSecond.components.schemas.additionalProperties={type:'integer',minimum:'EXACT'};
  assertionSecond.components.schemas.propertyNames={enum:['a','雪']};
  const assertions={...input,snapshot:'assertion-container-owners',resources:[
   {...input.resources[0],text:encode(assertionFirst)},{...input.resources[1],text:encode(assertionSecond)}
  ]},assertionOriginal=assertions.resources.map(resource=>resource.text);
  assert.equal(analyse(assertions).status,'complete');assert.equal(analyse({...assertions,root:other}).status,'complete');
  const assertInstances=async(packet)=>{
   const result=await evaluateSchemas({...packet,runtimeInstances:[
    '{}','{"a":9007199254740993.00}','{"雪":9007199254740994}',
    '{"bad":9007199254740993}','{"a":0}','{"a":"wrong"}','[]','null'
   ].map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer:'/components/schemas/Assertions'}}))});
   assert.equal(result.complete,true,JSON.stringify(result.findings));
   assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,true,true,false,false,false,true,true]);
  };
  await assertInstances(assertions);
  const assertionReview=await planMigration(assertions);assert.equal(assertionReview.complete,true,JSON.stringify(assertionReview.problems));
  const assertionCold={snapshot:'cold-assertion-owners',root:assertionReview.outputRoot,resources:assertionReview.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
  await assertInstances(assertionCold);await inspect(assertionCold,'First');
  await inspect({...assertionCold,root:assertionReview.changes.find(change=>change.resource===other).destination},'Second');
  const assertionGraph=createGraph(assertionCold).graph,material=follow(assertionGraph,assertionCold.root,'/components/schemas/Assertions','schema');
  assert.notEqual(material.pointer,'/components/schemas');
  const materialDoc=assertionGraph.docs.get(material.resource),capturedDoc=new (require('./dist/document.cjs').SourceDocument)(assertions.resources[1].text,other);
  for(const name of ['Base','Choice'])assert.equal(materialDoc.dataJson(material.pointer+'/'+name),capturedDoc.dataJson('/components/schemas/'+name));
  for(const [name,field]of [['additionalProperties','minimum'],['propertyNames','enum']]){
   const child=follow(assertionGraph,material.resource,material.pointer+'/'+name,'schema');
   assert.equal(assertionGraph.docs.get(child.resource).dataJson(child.pointer+'/'+field),capturedDoc.dataJson('/components/schemas/'+name+'/'+field));
  }
  assert.deepEqual(assertions.resources.map(resource=>resource.text),assertionOriginal);
  assert.deepEqual((await planMigration(assertions)).outputs,assertionReview.outputs);
  for(const keepDynamic of [true,false]){
   const polymorphic=structuredClone(assertionSecond);
   polymorphic.components.schemas.additionalProperties={allOf:[{$ref:'#/components/schemas/Base'}]};
   if(!keepDynamic){delete polymorphic.components.schemas.Base.$dynamicAnchor;delete polymorphic.components.schemas.Base.properties.child;}
   const polymorphicInput={...assertions,snapshot:'polymorphic-container-owners-'+keepDynamic,resources:[assertions.resources[0],{...assertions.resources[1],text:encode(polymorphic)}]};
   assert.equal(analyse(polymorphicInput).status,'complete');
   const polymorphicReview=await planMigration(polymorphicInput);
   assert.equal(polymorphicReview.complete,true,JSON.stringify(polymorphicReview.problems));
   const polymorphicCold={root:polymorphicReview.outputRoot,snapshot:'cold-polymorphic-map',resources:polymorphicReview.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
   const modelInstances=['{}','{"a":{"value":9007199254740993.00,"entry":"chosen"}}',
    '{"a":{"value":0,"entry":"chosen"}}','{"bad":{"value":9007199254740993.00,"entry":"chosen"}}',
    '{"a":{"value":9007199254740993.00}}','null'];
   for(const packet of [polymorphicInput,polymorphicCold]){
    const result=await evaluateSchemas({...packet,runtimeInstances:modelInstances.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer:'/components/schemas/Assertions'}}))});
    assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,true,false,false,false,true]);
   }
   const polymorphicGraph=createGraph(polymorphicCold).graph,mapOwner=follow(polymorphicGraph,polymorphicCold.root,'/components/schemas/Assertions','schema');
   assert(mapOwner.pointer.includes('/$defs/'),'The map use must not acquire a new native component model name');
   const polymorphicDoc=polymorphicGraph.docs.get(mapOwner.resource),originalMap=new (require('./dist/document.cjs').SourceDocument)(polymorphicInput.resources[1].text,other);
   for(const name of ['Base','Choice'])assert.equal(polymorphicDoc.dataJson(mapOwner.pointer+'/'+name),originalMap.dataJson('/components/schemas/'+name));
   await inspect(polymorphicCold,'First',keepDynamic);await inspect({...polymorphicCold,root:polymorphicReview.changes.find(change=>change.resource===other).destination},'Second',keepDynamic);
   assert.equal(polymorphicInput.resources[1].text,encode(polymorphic));
  }
 }
});

for(const identified of [false,true])test(`model-sensitive maps retain unnamed owners or an identified-resource guard, identified=${identified}`,async()=>{
 const root='file:///holder-guard/a.json',other='file:///holder-guard/b.json';
 const first={openapi:'3.2.1',info:{title:'Chooser',version:'1'},paths:{},components:{schemas:{
  Target:{$ref:'b.json#/components/schemas'},Other:{type:'object',properties:{kind:{const:'Other'}}},
  Chooser:{type:'object',required:['kind'],properties:{kind:{type:'string'}},discriminator:{propertyName:'kind'},
   oneOf:[{$ref:'#/components/schemas/Target'},{$ref:'#/components/schemas/Other'}]}
 }}},second={openapi:'3.1.2',info:{title:'Empty models',version:'1'},paths:{},components:{schemas:identified?{
  additionalProperties:{$id:'https://schemas.invalid/value',type:'integer'}
 }:{}}};
 const input={root,snapshot:'model-holder-'+identified,targetVersion:'3.2.1',destination:'file:///holder-output/',resources:[
  {id:root,text:JSON.stringify(first),generation:1},{id:other,text:JSON.stringify(second),generation:1}
 ]},frozen=input.resources.map(resource=>resource.text);
 assert.equal(analyse(input).status,'complete');assert.equal((await evaluateSchemas(input)).complete,true);
 const source=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'source',text:identified?'{"kind":"Other"}':'{"kind":"Target"}',schema:{resource:root,pointer:'/components/schemas/Chooser'}}]});
 assert.equal(source.complete,true,JSON.stringify(source.findings));assert.equal(source.runtimeEvaluations[0].valid,true);
 const review=await planMigration(input);
 if(identified){
  assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
  assert(review.problems.some(problem=>problem.resource===other&&problem.pointer==='/components/schemas'&&problem.code==='migration.owners.resource-context'&&problem.reason==='implementation'),JSON.stringify(review.problems));
 }else{
  assert.equal(review.complete,true,JSON.stringify(review.problems));
  const cold={root:review.outputRoot,snapshot:'cold-neutral-holder',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
  assert.equal(analyse(cold).status,'complete');
  const result=await evaluateSchemas({...cold,runtimeInstances:['{"kind":"Target"}','{"kind":"Other"}','{}'].map(text=>({subject:'response-body',location:'cold',text,schema:{resource:cold.root,pointer:'/components/schemas/Chooser'}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false,false]);
  const graph=createGraph(cold).graph,branch=graph.referenceAs(cold.root,'/components/schemas/Chooser/oneOf/0','$ref','schema');
  assert.equal(branch.targetResource,cold.root);assert.equal(branch.targetPointer,'/components/schemas/Target');
  const reference=graph.referenceAs(cold.root,'/components/schemas/Target','$ref','schema');
  assert(reference.targetPointer.includes('/$defs/'));assert.deepEqual(graph.docs.get(reference.targetResource).dataNode(reference.targetPointer).value,{});
 }
 assert.deepEqual(input.resources.map(resource=>resource.text),frozen);
});

test('ordinary patch migration retains authored operationId links when no operation owner was cloned',async()=>{
 const root='file:///unchanged/api.json',document={openapi:'3.2.0',info:{title:'Unchanged names',version:'business'},paths:{'/p':{get:{operationId:'one',responses:{200:{description:'Reply',links:{Self:{operationId:'one'}}}}}}}};
 const input={root,snapshot:'unchanged-operation-names',targetVersion:'3.2.1',destination:'file:///unchanged-output/',resources:[{id:root,text:JSON.stringify(document),generation:1}]};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const result=JSON.parse(review.outputs.find(output=>output.id===review.outputRoot).text);
 assert.deepEqual(result.paths['/p'].get.responses['200'].links.Self,{operationId:'one'});assert.equal(result.paths['/p'].get.operationId,'one');
});

for(const format of ['yaml','json'])test(`${format} a foreign whole-document Schema view retains annotations without entry binding differences`,async()=>{
 const root='file:///foreign-schema/a.'+format,other='file:///foreign-schema/b.'+format;
 const first={openapi:'3.2.1',info:{title:'First',version:'business'},paths:{},components:{schemas:{Foreign:{$ref:'b.'+format+'#'}}}};
 const second={openapi:'3.1.2',info:{title:'Second',version:'business'},paths:{'/native':{get:{responses:{200:{description:'Value',content:{'application/json':{schema:{$ref:'#/components/schemas/Number'}}}}}}}},components:{schemas:{Number:{type:'integer',enum:['EXACT']}}}};
 const encode=value=>(format==='yaml'?YAML.stringify(value):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'foreign-annotation-role',targetVersion:'3.2.1',destination:'file:///foreign-schema-output/',resources:[{id:root,text:encode(first),generation:1},{id:other,text:encode(second),generation:2}]};
 const values=['null','false','0','{}','{"value":"any"}'];
 const evaluate=packet=>evaluateSchemas({...packet,runtimeInstances:values.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer:'/components/schemas/Foreign'}}))});
 const before=await evaluate(input);assert.equal(before.complete,true,JSON.stringify(before.findings));assert.deepEqual(before.runtimeEvaluations.map(value=>value.valid),values.map(()=>true));
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));assert.equal(review.outputs.length,2);
 const cold={root:review.outputRoot,snapshot:'cold-foreign-annotation',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 const graph=createGraph(cold).graph,reference=graph.referenceAs(cold.root,'/components/schemas/Foreign','$ref','schema');assert.equal(reference.resolution,'resolved');assert.notEqual(reference.targetPointer,'');
 const {SourceDocument}=require('./dist/document.cjs'),source=new SourceDocument(input.resources[1].text,other),doc=graph.docs.get(reference.targetResource);
 for(const name of ['openapi','info','paths','components'])assert.equal(doc.dataJson(reference.targetPointer+'/'+name),source.dataJson('/'+name));
 assert.equal(doc.node('/openapi').value,'3.2.1');assert.equal(doc.node(reference.targetPointer+'/openapi').value,'3.1.2');
 const after=await evaluate(cold);assert.equal(after.complete,true,JSON.stringify(after.findings));assert.deepEqual(after.runtimeEvaluations.map(value=>value.valid),values.map(()=>true));
 const plan=requestOperation({...cold,root:reference.targetResource,resource:reference.targetResource,pointer:'/paths/~1native/get'});
 const native=await evaluateSchemas({...cold,root:reference.targetResource,runtimeInstances:['9007199254740993.00','0'].map(text=>({subject:'response-body',location:'application/json',text,schema:plan.responses[0].content[0].schema}))});
 assert.equal(native.complete,true,JSON.stringify(native.findings));assert.deepEqual(native.runtimeEvaluations.map(value=>value.valid),[true,false]);
 assert.deepEqual(input.resources.map(resource=>resource.text),[encode(first),encode(second)]);
});
