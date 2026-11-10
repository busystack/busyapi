const {test}=require('node:test'),assert=require('node:assert/strict');
const {planMigration}=require('./dist/migration.cjs'),{analyse,createGraph}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {readFileSync}=require('node:fs'),{join}=require('node:path');
const fixture=require('./migration_schema_resources_fixture.cjs');
const cold=review=>({root:review.outputRoot,snapshot:'resources-cold',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))});
const samples=name=>['{"n":9007199254740993}',`{"n":9007199254740993,"tag":"${name}"}`,`{"n":9007199254740993,"tag":"${name}","next":{"n":9007199254740993}}`,
 `{"n":9007199254740993,"tag":"${name}","next":{"n":9007199254740993,"tag":"${name}"}}`,'{"n":9007199254740992}','null'];
async function outcomes(packet,name){
 const runtimeInstances=['Node','Strict'].flatMap(schema=>samples(name).map(text=>({subject:'response-body',location:schema,text,schema:{resource:packet.root,pointer:'/components/schemas/'+schema}})));
 const evaluated=await evaluateSchemas({...packet,runtimeInstances});assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));
 return evaluated.runtimeEvaluations.map(value=>value.valid);
}
for(const format of ['yaml','json'])for(const target of ['3.1.2','3.2.1'])for(const single of [false,true])
test(`${format} ${single?'ordinary role':'independent entries'} whole resources preserve nested dialects and actual dynamic recursion for ${target}`,async()=>{
 const input=fixture(format,target,single),before=input.resources.map(resource=>resource.text),entryIds=input.resources.slice(0,-1).map(resource=>resource.id);
 const expected=[true,true,true,true,false,false,false,true,false,true,false,false];
 for(const [index,root]of entryIds.entries())assert.deepEqual(await outcomes({...input,root},['First','Second'][index]),expected);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));assert.equal(review.producerVersion,'107');
 const output=cold(review);
 for(const [index,id]of entryIds.entries()){
  const root=review.changes.find(change=>change.resource===id).destination,packet={...output,root};
  assert.equal(analyse(packet).status,'complete',JSON.stringify(analyse(packet).findings));assert.deepEqual(await outcomes(packet,['First','Second'][index]),expected);
  const graph=createGraph(packet).graph;
  for(const reference of graph.entryReferences()){
   assert.equal(reference.resolution,'resolved');
   if(reference.keyword==='$dynamicRef'&&reference.dynamic){assert(reference.value.endsWith('#node'));assert.equal(reference.dynamic.candidates.length,2);}
  }
  assert.equal(graph.issues.some(issue=>issue.code==='reference.identity.duplicate'),false);
  for(const scopes of graph.identities.values())assert.equal(scopes.length,1);
  const number=[...graph.entryScopes()].find(scope=>graph.docs.get(scope.resource).dataNode(scope.pointer+'/$anchor')?.value==='number');assert(number);
  assert.equal(number.dialect,'https://json-schema.org/draft/2020-12/schema');
 }
 const literal=input.resources.at(-1),copy=review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===literal.id).destination);
 assert.equal(copy.text,literal.text,'Shared literal resource and YAML aliases remain byte-exact');
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
 const repeated=await planMigration({...input,resources:[...input.resources].reverse()});assert.equal(repeated.complete,true,JSON.stringify(repeated.problems));
 assert.deepEqual(repeated.outputs,review.outputs);
 const moved='file:///cold-resources-moved/',relocated={root:new URL(review.entry,moved).href,snapshot:'moved-resources',resources:review.outputs.map(output=>({id:new URL(output.path,moved).href,text:output.text,generation:0}))};
 assert.deepEqual(await outcomes(relocated,'First'),expected);
});

test('authored resource IDs resembling private owners remain published and collision-safe',async()=>{
 const input=fixture('json','3.2.1',true),first=await planMigration(input);assert.equal(first.complete,true,JSON.stringify(first.problems));
 const firstGraph=createGraph(cold(first)).graph;
 const reserved=[...firstGraph.entryScopes()].map(scope=>firstGraph.docs.get(scope.resource).dataNode(scope.pointer+'/$id')?.value)
  .find(value=>typeof value==='string'&&value.includes('busyapi-schema-owner'));assert(reserved);
 const api=JSON.parse(input.resources[0].text);api.components.schemas.Authored={$id:reserved,$dynamicAnchor:'authored',type:'string'};
 input.resources[0].text=JSON.stringify(api);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));const output=cold(review),graph=createGraph(output).graph;
 assert.equal(graph.identities.get(reserved).length,1);assert.equal(graph.identities.get(reserved)[0].pointer,'/components/schemas/Authored');
 const evaluated=await evaluateSchemas({...output,runtimeInstances:['"kept"','null'].map(text=>({subject:'response-body',location:text,text,schema:{resource:output.root,pointer:'/components/schemas/Authored'}}))});
 assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.runtimeEvaluations.map(value=>value.valid),[true,false]);
 assert.deepEqual(await outcomes(output,'First'),[true,true,true,true,false,false,false,true,false,true,false,false]);
});

for(const holder of [false,true])test(`native object copies retain independently dialected implicit Schema resources, existing holder=${holder}`,async()=>{
 const root='file:///schema-slot/api.json',data='file:///schema-slot/data.json';
 const input={root,snapshot:'independent-native-slot',targetVersion:'3.2.1',destination:'file:///schema-slot-output/',resources:[
  {id:root,generation:1,text:JSON.stringify({openapi:'3.2.1',info:{title:'Slots',version:'1'},paths:{'/p':{get:{responses:{200:{description:'Value',headers:{X:{$ref:'data.json#/Example/value/Header'}}}}}}},
   components:{schemas:{Use:{$ref:'data.json#/Example/value/Header/schema'},...(holder?{Other:{$ref:'data.json#/Other'}}:{})},examples:{Payload:{$ref:'data.json#/Example'}}}})},
  {id:data,generation:2,text:JSON.stringify({Example:{value:{Header:{schema:{$schema:'https://json-schema.org/draft/2020-12/schema#',$dynamicAnchor:'node',type:'array',items:{$dynamicRef:'#node'}}}}},
   ...(holder?{Other:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object'}}:{})})}]};
 const evaluate=async packet=>{
  const result=await evaluateSchemas({...packet,runtimeInstances:['[]','[[]]','[0]','null'].map(text=>({subject:'response-body',location:text,text,schema:{resource:packet.root,pointer:'/components/schemas/Use'}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
 };
 assert.deepEqual(await evaluate(input),[true,true,false,false]);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=cold(review);assert.deepEqual(await evaluate(output),[true,true,false,false]);
 const graph=createGraph(output).graph,reference=graph.referenceAs(output.root,'/components/schemas/Use','$ref','schema');
 assert.equal(graph.scopeAs(reference.targetResource,reference.targetPointer,'schema').dialect.replace(/#$/,''),'https://json-schema.org/draft/2020-12/schema');
 const copiedData=graph.docs.get(review.changes.find(change=>change.resource===data).destination);
 assert.deepEqual(copiedData.dataNode('/Example/value').value,JSON.parse(input.resources[1].text).Example.value);
 if(holder)assert.equal(copiedData.dataNode('/Other/type').value,'object');
});

for(const defect of ['duplicate-id','duplicate-anchor','unknown-dialect','unavailable'])test(`whole resource ${defect} remains a located refusal with no partial output`,async()=>{
 const input=fixture('json'),resource=input.resources.at(-1),value=JSON.parse(resource.text.replaceAll('9007199254740993.00','"EXACT"')),payload=value.Example.value;
 if(defect==='duplicate-id')payload.Node.$defs.Number.$id='middle';
 if(defect==='duplicate-anchor')payload.Forward.$dynamicAnchor='node';
 if(defect==='unknown-dialect')payload.Node.$defs.Number.$schema='https://dialects.invalid/unavailable';
 if(defect==='unavailable')payload.Middle.$dynamicRef='https://schemas.invalid/unavailable#node';
 resource.text=JSON.stringify(value).replaceAll('"EXACT"','9007199254740993.00');
 const before=input.resources.map(resource=>resource.text),review=await planMigration(input);
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert.deepEqual(review.changes,[]);
 assert(review.problems.some(problem=>problem.resource===resource.id&&problem.range[1]>problem.range[0]),JSON.stringify(review.problems));
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

test('multiple foreign entries choose the same anonymous resource allocator in every capture order',async()=>{
 const ids=['a','b','c','shared'].map(name=>'file:///ordered-resource/'+name+'.json');
 const entry=(version,name)=>({openapi:version,info:{title:name,version:'1'},paths:{},components:{
  links:{Use:{operationRef:'shared.json#/Operation'}},securitySchemes:{Access:{type:'apiKey',in:'header',name:'X-'+name}}}});
 const input={root:ids[0],snapshot:'ordered-resource-entries',targetVersion:'3.2.1',destination:'file:///ordered-resource-output/',
  resources:[entry('3.2.1','First'),entry('3.1.2','Second'),entry('3.1.2','Third'),{
   Operation:{operationId:'detached',security:[{Access:[]}],responses:{204:{description:'Empty'}}},Literal:{$ref:'literal-only'},
  }].map((value,index)=>({id:ids[index],generation:1,text:JSON.stringify(value)}))};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const reversed=await planMigration({...input,resources:[...input.resources].reverse()});assert.equal(reversed.complete,true,JSON.stringify(reversed.problems));
 const ordered=outputs=>outputs.slice().sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(ordered(reversed.outputs),ordered(review.outputs));
 for(const [index,name]of ['First','Second','Third'].entries()){
  const root=review.changes.find(change=>change.resource===ids[index]).destination,graph=createGraph({...cold(review),root}).graph;
  const operation=graph.entryReferences().find(reference=>reference.pointer==='/components/links/Use'&&reference.connection==='operationRef');
  assert.equal(operation.resolution,'resolved');
  const binding=graph.entryReferences().find(reference=>reference.connection==='security'&&reference.resource===operation.targetResource&&reference.pointer===operation.targetPointer+'/security/0');
  assert.equal(binding.resolution,'resolved');assert.equal(graph.docs.get(binding.targetResource).dataNode(binding.targetPointer+'/name').value,'X-'+name);
 }
});

const official=JSON.parse(readFileSync(join(__dirname,'../../fixtures/json_schema_2020_12/dynamicRef.json'),'utf8'));
for(const description of [
 'A $dynamicRef resolves to the first $dynamicAnchor still in scope that is encountered when the schema is evaluated',
 "A $dynamicRef with intermediate scopes that don't include a matching $dynamicAnchor does not affect dynamic scope resolution",
])test(`ordinary foreign data ownership preserves official resource transitions: ${description}`,async()=>{
 const oracle=official.find(value=>value.description===description);assert(oracle);
 const root='file:///official-resource/api.json',data='file:///official-resource/data.json';
 const input={root,snapshot:'official-whole-resource',targetVersion:'3.1.2',destination:'file:///official-resource-output/',resources:[
  {id:root,generation:1,text:JSON.stringify({openapi:'3.2.1',info:{title:'Official',version:'business'},paths:{},components:{schemas:{Use:{$ref:'data.json#/Example/value'}},examples:{Data:{$ref:'data.json#/Example'}}}})},
  {id:data,generation:2,text:JSON.stringify({Example:{value:oracle.schema},Literal:oracle.schema})}]};
 const evaluate=async packet=>{
  const result=await evaluateSchemas({...packet,runtimeInstances:oracle.tests.map(value=>({subject:'response-body',location:value.description,text:JSON.stringify(value.data),schema:{resource:packet.root,pointer:'/components/schemas/Use'}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
 };
 assert.deepEqual(await evaluate(input),oracle.tests.map(value=>value.valid));
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.deepEqual(await evaluate(cold(review)),oracle.tests.map(value=>value.valid));
 assert.equal(review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===data).destination).text,input.resources[1].text);
});
