const {test}=require('node:test'),assert=require('node:assert/strict');
const {analyse,createGraph}=require('./dist/model.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {planMigration}=require('./dist/migration.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const fixture=require('./migration_overlapping_containers_fixture.cjs');

const cold=review=>({root:review.outputRoot,snapshot:'overlap-cold',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))});
function roleTarget(packet,root,pointer,kind){
 const graph=createGraph({...packet,root}).graph,reference=graph.referenceAs(root,pointer,'$ref',kind);
 assert.equal(reference?.resolution,'resolved');
 return {graph,resource:reference.targetResource,pointer:reference.targetPointer};
}
async function values(packet,root,pointer,samples){
 const evaluated=await evaluateSchemas({...packet,root,runtimeInstances:samples.map(text=>({subject:'response-body',location:text,text,schema:{resource:root,pointer}}))});
 assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));return evaluated.runtimeEvaluations.map(value=>value.valid);
}
for(const format of ['json','yaml'])for(const restrictedVersion of ['2.0','3.0.4'])
test(`${format} ${restrictedVersion}/3.1 entries independently own overlapping native, Schema, dictionary and literal uses`,async()=>{
 const input=fixture(format,restrictedVersion),before=input.resources.map(resource=>resource.text),modern=input.resources[1].id;
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));
 assert.equal(analyse({...input,root:modern}).status,'complete');
 const original=new SourceDocument(before[1],modern);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));assert.equal(review.producerVersion,'92');
 const output=cold(review),root=review.changes.find(change=>change.resource===modern).destination;
 for(const entry of [output.root,root])assert.equal(analyse({...output,root:entry}).status,'complete');
 const example=roleTarget(output,root,'/components/examples/Dictionary','example');
 assert(example.pointer.startsWith('/components/examples/_migrated_object_use_'));
 assert.equal(example.graph.docs.get(example.resource).dataJson(example.pointer+'/value'),original.dataJson('/components/pathItems/value'));
 const mapTargets=[];
 for(const name of ['SchemaMap','ExampleMap']){
  const target=roleTarget(output,root,'/components/schemas/'+name,'schema');mapTargets.push(target.pointer);
  assert(target.pointer.startsWith('/components/schemas/_migrated_schema_use_'));
  assert.equal(target.graph.docs.get(target.resource).dataJson(target.pointer),original.dataJson(name==='SchemaMap'?'/components/schemas':'/components/examples'),name+' reads immutable capture');
  const samples=['null','false','0','[]','{}','{"n":9007199254740993}'];
  assert.deepEqual(await values(output,root,'/components/schemas/'+name,samples),await values(input,modern,'/components/schemas/'+name,samples));
 }
 const recursion=['[]','[[]]','[[[]]]','[0]','null'];
 assert.deepEqual(await values(output,root,'/components/schemas/Node',recursion),[true,true,true,false,false]);
 const doc=example.graph.docs.get(root);
 assert.equal(doc.dataJson('/x-path-alias'),original.dataJson('/x-path-alias'));
 assert.equal(doc.dataJson('/components/pathItems/value'),original.dataJson('/components/pathItems/value'));
 assert.equal(new SourceDocument(before[2],input.resources[2].id).dataJson('/Literal'),
  new SourceDocument(review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===input.resources[2].id).destination).text,'file:///shared.yaml').dataJson('/Literal'));
 const allocations=packet=>[...createGraph({...packet,root}).graph.docs.get(root).dataNode('/components/schemas').children.keys()].filter(name=>name.startsWith('_migrated_')).sort();
 assert.deepEqual((await planMigration({...input,resources:[...input.resources].reverse()})).outputs,review.outputs);
 const reordered=await planMigration(fixture(format,restrictedVersion,true));assert.equal(reordered.complete,true,JSON.stringify(reordered.problems));
 const reorderedRoot=reordered.changes.find(change=>change.resource===modern).destination;
 const reorderedPacket=cold(reordered);
 assert.equal(reorderedRoot,root);assert.deepEqual(allocations(reorderedPacket),allocations(output));
 assert.deepEqual(mapTargets,['SchemaMap','ExampleMap'].map(name=>roleTarget(reorderedPacket,root,'/components/schemas/'+name,'schema').pointer));
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

test('container ownership reserves authored collisions without overwriting literal data',async()=>{
 const input=fixture('json'),first=await planMigration(input);assert.equal(first.complete,true,JSON.stringify(first.problems));
 const root=first.changes.find(change=>change.resource===input.resources[1].id).destination;
 const target=roleTarget(cold(first),root,'/components/examples/Dictionary','example'),name=target.pointer.split('/').at(-1);
 const source=JSON.parse(input.resources[1].text.replaceAll('9007199254740993.00','"EXACT"'));source.components.examples[name]={value:{kept:'authored',n:'EXACT'}};
 input.resources[1].text=JSON.stringify(source).replaceAll('"EXACT"','9007199254740993.00');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const next=roleTarget(cold(review),root,'/components/examples/Dictionary','example');assert.equal(next.pointer,target.pointer+'_1');
 assert.equal(next.graph.docs.get(root).dataNode('/components/examples/'+name+'/value/kept').value,'authored');
 assert.equal(next.graph.docs.get(root).dataJson('/components/examples/'+name+'/value/n'),'9007199254740993.00');
});

test('unproved source dialects keep a located blocker and expose no partial container copies',async()=>{
 const input=fixture('json'),source=JSON.parse(input.resources[1].text);source.jsonSchemaDialect='https://dialect.invalid/unproved';input.resources[1].text=JSON.stringify(source);
 const before=input.resources.map(resource=>resource.text),review=await planMigration(input);
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert.deepEqual(review.changes,[]);
 assert(review.problems.some(problem=>problem.resource===input.resources[1].id&&problem.code.includes('dialect')));
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

for(const reverse of [false,true])test(`copied Header fields follow later Schema owners across entries, reverse=${reverse}`,async()=>{
 const root='file:///overlap-edges/a.json',other='file:///overlap-edges/b.json';
 const first={openapi:'3.2.1',info:{title:'First',version:'business'},paths:{},components:{
  schemas:{Dictionary:{$ref:'b.json#/components/schemas'}},headers:{Value:{$ref:'b.json#/components/schemas'}}}};
 const second={openapi:'3.1.2',info:{title:'Second',version:'business'},paths:{'/p':{get:{responses:{200:{description:'Value',
  headers:{'X-N':{$ref:'#/components/schemas'}},content:{'application/json':{schema:{$ref:'#/components/schemas'}}}}}}}},
  components:{schemas:{schema:{$ref:'#/x-model'}}},'x-model':{$id:'https://models.invalid/overlap-number',type:'integer',enum:['EXACT']}};
 const input={root,snapshot:'overlapping-typed-edges',targetVersion:'3.2.1',destination:'file:///overlap-edges-output/',
  resources:[first,second].map((value,index)=>({id:[root,other][index],generation:1,text:JSON.stringify(value).replaceAll('"EXACT"','9007199254740993.00')}))};
 if(reverse)input.resources.reverse();
 const before=input.resources.map(resource=>resource.text),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));const output=cold(review),targetRoot=review.changes.find(change=>change.resource===other).destination;
 const header=roleTarget(output,targetRoot,'/paths/~1p/get/responses/200/headers/X-N','header');
 assert(header.pointer.startsWith('/components/headers/_migrated_object_use_'));
 const edge=header.graph.referenceAs(header.resource,header.pointer+'/schema','$ref','schema');
 assert.equal(edge.resolution,'resolved');assert.notEqual(edge.targetPointer,'/x-model');
 const numbers=['9007199254740993.00','9007199254740992','null'];
 assert.deepEqual(await values(output,targetRoot,'/components/schemas/schema',numbers),[true,false,false]);
 for(const packet of [{...input,root:other},{...output,root:targetRoot}]){
  const result=await evaluateSchemas({...packet,runtimeInstances:numbers.slice(0,2).map(text=>({subject:'response-header',location:text,text:'',
   header:{resource:packet.root,pointer:'/paths/~1p/get/responses/200/headers/X-N',name:'X-N',values:[text]}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);
 }
 assert.equal(header.graph.docs.get(targetRoot).dataJson('/x-model'),JSON.stringify(second['x-model']).replaceAll('"EXACT"','9007199254740993.00'));
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

test('native container copies forward to one published identified Schema resource through an anchorless frame',async()=>{
 const root='file:///native-resource/api.json',id='https://schemas.invalid/native-array';
 const input={root,snapshot:'native-resource-holder',targetVersion:'3.2.1',destination:'file:///native-resource-output/',resources:[{id:root,generation:1,text:JSON.stringify({
  openapi:'3.1.2',info:{title:'Native resource',version:'1'},paths:{'/p':{get:{responses:{200:{description:'Value',headers:{'X-N':{$ref:'#/components/schemas'}}}}}}},
  components:{schemas:{schema:{$id:id,$dynamicAnchor:'node',type:'array',items:{$dynamicRef:'#node'}}}},
 })}]};
 const before=input.resources[0].text,review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=cold(review),header=roleTarget(output,output.root,'/paths/~1p/get/responses/200/headers/X-N','header'),graph=header.graph;
 assert.equal(graph.identities.get(id).length,1);const native=graph.identities.get(id)[0];assert.equal(native.pointer,'/components/schemas/schema');
 const slot=graph.scopeAs(header.resource,header.pointer+'/schema','schema');assert(slot);
 assert.notEqual(slot.base,graph.scope(output.root,'').base);assert.notEqual(slot.base,id);
 const edge=graph.referenceAs(slot.resource,slot.pointer,'$ref','schema');assert.equal(edge.resolution,'resolved');assert.equal(edge.targetPointer,native.pointer);
 assert.deepEqual(await values(output,output.root,native.pointer,['[]','[[]]','[0]','null']),[true,true,false,false]);
 assert.equal(input.resources[0].text,before);
});
