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
  components:{securitySchemes:{Access:{type:'apiKey',in:'header',name:'X-'+name}},schemas:{Choice:{type:'object',properties:{entry:{const:name}}}}}});
 const values=[api('First'),api('Second'),{Path:{get:{operationId:'shared',security:[{Access:[]}],responses:{200:{description:'Value',
  links:{Next:{$ref:'a.'+format+'#/components/links/Next'}},content:{'application/json':{schema:{$ref:'#/Base'}}}}}}},
  Base:{type:'object',discriminator:{propertyName:'kind',mapping:{chosen:'Choice'}},description:'[Guide](guide.md)'},
  Literal:{security:[{Access:[]}],mapping:{chosen:'Choice'},zero:0,flag:false,empty:''}}];
 values[0].components.links={Next:{operationId:'shared',description:'[Next](../next.md)'}};
 values[0]['x-next']=values[0].components.links.Next;
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

test('ordinary patch migration retains authored operationId links when no operation owner was cloned',async()=>{
 const root='file:///unchanged/api.json',document={openapi:'3.2.0',info:{title:'Unchanged names',version:'business'},paths:{'/p':{get:{operationId:'one',responses:{200:{description:'Reply',links:{Self:{operationId:'one'}}}}}}}};
 const input={root,snapshot:'unchanged-operation-names',targetVersion:'3.2.1',destination:'file:///unchanged-output/',resources:[{id:root,text:JSON.stringify(document),generation:1}]};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const result=JSON.parse(review.outputs.find(output=>output.id===review.outputRoot).text);
 assert.deepEqual(result.paths['/p'].get.responses['200'].links.Self,{operationId:'one'});assert.equal(result.paths['/p'].get.operationId,'one');
});
