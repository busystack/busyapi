const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {analyse,createGraph}=require('./dist/model.cjs');
const {planMigration}=require('./dist/migration.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {referenceChoices}=require('./dist/reference_choices.cjs');

function material(graph,resource,pointer){
 const seen=new Set();
 for(let work=0;work<128;work++){
  const key=JSON.stringify([resource,pointer]);assert(!seen.has(key),'Material forwarding must not introduce a cycle');seen.add(key);
  const reference=graph.referenceAs(resource,pointer,'$ref','schema');
  if(!reference)return {resource,pointer,value:graph.docs.get(resource).dataNode(pointer).value};
  assert.equal(reference.resolution,'resolved');resource=reference.targetResource;pointer=reference.targetPointer;
 }
 assert.fail('Material forwarding must remain bounded');
}
const cold=review=>({root:review.outputRoot,snapshot:'cold-model-resources',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))});
async function evaluations(packet,pointer,texts){
 const result=await evaluateSchemas({...packet,runtimeInstances:texts.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer}}))});
 assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
}
function choices(packet,at){
 return referenceChoices({...packet,resource:at.resource,pointer:at.pointer+'/discriminator',contextKind:'discriminator',keyword:'defaultMapping',query:''});
}

for(const format of ['yaml','json'])test(`${format} whole identified discriminator models retain anonymous entry owners and native choices`,async()=>{
 const ids=['a','b','models'].map(name=>'file:///model-resources/'+name+'.'+format);
 const entry=(version,name)=>({openapi:version,info:{title:name,version:'1'},paths:{},components:{schemas:{
  Base:{$ref:'models.'+format+'#/Node'},Dog:{allOf:[{$ref:'#/components/schemas/Base'}],'x-entry':name},
 }}});
 const model={$id:'https://schemas.invalid/model',type:'object',required:['kind'],properties:{kind:{type:'string'},n:{type:'integer'},child:{$id:'child',type:'integer'}},
  discriminator:{propertyName:'kind',mapping:{chosen:'Dog'}}};
 const values=[entry('3.2.1','First'),entry('3.1.2','Second'),{Node:model,'x-literal':{$id:'data-only',$ref:'not-a-reference',zero:0,flag:false,empty:'',text:'雪'}}];
 const resources=values.map((value,index)=>({id:ids[index],text:format==='yaml'?'# Keep model 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value),generation:index+1}));
 const input={root:ids[0],snapshot:'whole-model-'+format,resources,targetVersion:'3.2.1',destination:'file:///model-output/'},before=resources.map(resource=>resource.text);
 const texts=['{"kind":"chosen","n":0}','{"kind":"unknown","n":0}','{"kind":"chosen","n":false}','{}','{"kind":"chosen","child":0}','{"kind":"chosen","child":false}'];
 const expected=[true,true,false,false,true,false];
 for(const root of ids.slice(0,2))assert.deepEqual(await evaluations({...input,root},'/components/schemas/Base',texts),expected);
 const sourceGraph=createGraph(input).graph,sourceChoices=choices(input,material(sourceGraph,input.root,'/components/schemas/Base'));
 assert.equal(sourceChoices.complete,true);assert(sourceChoices.entries.some(value=>value.target.resource===input.root&&value.target.pointer==='/components/schemas/Dog'));
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=cold(review);
 for(const [index,entry]of ['First','Second'].entries()){
  const packet={...output,root:review.changes.find(change=>change.resource===ids[index]).destination},graph=createGraph(packet).graph;
  assert.equal(analyse(packet).status,'complete');assert.deepEqual(await evaluations(packet,'/components/schemas/Base',texts),expected);
  const at=material(graph,packet.root,'/components/schemas/Base');assert(at.pointer.includes('/$defs/'),'A generated native component must not become another implicit model name');
  assert.equal(typeof at.value.$id,'string');assert.equal(at.value.$schema,'https://spec.openapis.org/oas/3.'+(index===0?'2':'1')+'/dialect/base');
  const embedded=graph.scopeAs(at.resource,at.pointer+'/properties/child','schema');assert.equal(embedded.resourcePointer,embedded.pointer);
  assert.equal(graph.docs.get(embedded.resource).dataNode(embedded.pointer).value.type,'integer');
  const binding=graph.referenceAs(at.resource,at.pointer+'/discriminator/mapping','chosen','schema')??graph.references.find(reference=>reference.resource===at.resource&&reference.pointer===at.pointer+'/discriminator/mapping'&&reference.keyword==='chosen');
  assert(binding);assert.equal(binding.resolution,'resolved');assert.equal(graph.docs.get(binding.targetResource).dataNode(binding.targetPointer).value['x-entry'],entry);
  const page=choices(packet,at);assert.equal(page.complete,true);assert.deepEqual(page.entries.map(value=>value.label),['Dog']);
 }
 assert.deepEqual(resources.map(resource=>resource.text),before);assert.deepEqual((await planMigration(input)).outputs,review.outputs);
 const original=review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===ids[2]).destination);
 assert.equal(original.text,before[2],'Detached original model and literal bytes are retained');
});

for(const value of [true,false])test(`boolean resource ${value} retains its value and anonymous discriminator choices across entries`,async()=>{
 const ids=['file:///boolean-model/a.json','file:///boolean-model/b.json','file:///boolean-model/choice.json'];
 const entry=version=>({openapi:version,info:{title:'Boolean choice',version:'1'},paths:{},components:{schemas:{
  Choice:{$ref:'choice.json'},Other:{type:'object',properties:{kind:{const:'Other'}}},
  Select:{type:'object',required:['kind'],properties:{kind:{type:'string'}},discriminator:{propertyName:'kind'},oneOf:[{$ref:'#/components/schemas/Choice'},{$ref:'#/components/schemas/Other'}]},
 }}});
 const input={root:ids[0],snapshot:'boolean-model-'+value,targetVersion:'3.2.1',destination:'file:///boolean-output/',resources:[entry('3.2.1'),entry('3.1.2'),value].map((value,index)=>({id:ids[index],text:JSON.stringify(value),generation:1}))};
 const expected=[value,!value,false],texts=['{"kind":"Choice"}','{"kind":"Other"}','{}'];
 for(const root of ids.slice(0,2))assert.deepEqual(await evaluations({...input,root},'/components/schemas/Select',texts),expected);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=cold(review);
 for(const id of ids.slice(0,2)){
  const packet={...output,root:review.changes.find(change=>change.resource===id).destination},graph=createGraph(packet).graph;
  assert.equal(analyse(packet).status,'complete');assert.deepEqual(await evaluations(packet,'/components/schemas/Select',texts),expected);
  const at=material(graph,packet.root,'/components/schemas/Choice');assert.equal(at.value,value);assert(at.pointer.includes('/$defs/'));
  const scope=graph.scopeAs(at.resource,at.pointer,'schema');assert.notEqual(scope.pointer,scope.resourcePointer);
  const holder=graph.docs.get(scope.resource).dataNode(scope.resourcePointer).value;assert.equal(typeof holder.$id,'string');assert.equal(typeof holder.$schema,'string');
  const page=choices(packet,{resource:packet.root,pointer:'/components/schemas/Select'});assert.equal(page.complete,true);assert.equal(page.count,2);
  assert.equal(page.entries.filter(choice=>choice.target.resource===at.resource&&choice.target.pointer===at.pointer).length,1);
 }
 assert.equal(input.resources[2].text,JSON.stringify(value));
});

test('a foreign literal schema resource retains its captured family, recursive identity and original data',async()=>{
 const ids=['file:///literal-model/a.yaml','file:///literal-model/b.yaml'];
 const schema={$id:'https://schemas.invalid/recursive',$ref:'#/$defs/Node',$defs:{Node:{$dynamicAnchor:'node',type:'object',required:['n'],properties:{n:{type:'integer',minimum:0},child:{$dynamicRef:'#node'}},description:'[Guide](./node.md)'}}};
 const first={openapi:'3.2.1',info:{title:'First',version:'1'},paths:{},components:{schemas:{Value:{$ref:'b.yaml#/components/examples/Payload/value'},Dictionary:{$ref:'b.yaml#/components/schemas'}}}};
 const second={openapi:'3.1.2',info:{title:'Second',version:'1'},paths:{},components:{examples:{Payload:{value:schema}},schemas:{Value:{$ref:'#/components/examples/Payload/value'}}}};
 const input={root:ids[0],snapshot:'foreign-literal-model',targetVersion:'3.2.1',destination:'file:///literal-output/',resources:[first,second].map((value,index)=>({id:ids[index],text:'# Keep literal 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'),generation:1}))};
 const before=input.resources.map(resource=>resource.text),texts=['{"n":0,"child":{"n":1}}','{"n":0,"child":{"n":-1}}','{"n":"0"}'];
 for(const root of ids)assert.deepEqual(await evaluations({...input,root},'/components/schemas/Value',texts),[true,false,false]);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));const output=cold(review);
 for(const id of ids){
  const packet={...output,root:review.changes.find(change=>change.resource===id).destination};
  assert.equal(analyse(packet).status,'complete');assert.deepEqual(await evaluations(packet,'/components/schemas/Value',texts),[true,false,false]);
  const graph=createGraph(packet).graph;assert.equal(graph.identities.get(schema.$id).length,1);
  const dynamic=graph.entryReferences().filter(reference=>reference.keyword==='$dynamicRef');assert.equal(dynamic.length,1);assert.equal(dynamic[0].dynamic.candidates.length,1);
 }
 const destination=review.changes.find(change=>change.resource===ids[1]).destination,graph=createGraph(output).graph;
 const dictionary=material(graph,output.root,'/components/schemas/Dictionary');assert.deepEqual(dictionary.value,second.components.schemas);
 const original=graph.docs.get(destination);assert.equal(original.dataJson('/components/examples/Payload/value'),createGraph(input).graph.docs.get(ids[1]).dataJson('/components/examples/Payload/value'));
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

for(const format of ['yaml','json'])for(const version of ['2.0','3.0.4'])test(`${version} ${format} foreign literal models retain restricted native owners and each entry's bindings`,async()=>{
 const swagger=version==='2.0',ids=['a','b'].map(name=>'file:///restricted-model/'+name+'.'+format);
 const pointer=swagger?'/definitions/Data/default':'/components/examples/Payload/value';
 const base={type:'object',required:swagger?['n']:['n','kind'],properties:{n:{type:'integer',enum:[0,2]},next:{$ref:'#'+pointer},
  ...(swagger?{}:{kind:{type:'string'}})},description:'[Guide](./guide.md)',...(swagger?{}:{discriminator:{propertyName:'kind',mapping:{chosen:'Dog'}}})};
 const first={openapi:'3.2.1',info:{title:'First',version:'1'},paths:{},components:{schemas:{Base:{$ref:'b.'+format+'#'+pointer},
  ...(swagger?{}:{Dog:{allOf:[{$ref:'#/components/schemas/Base'}],'x-entry':'First'}})}}};
 const second={...(swagger?{swagger:version}:{openapi:version}),info:{title:'Second',version:'1'},paths:{},...(swagger?{
  host:'api.invalid',schemes:['https'],definitions:{Data:{default:base},Base:{$ref:'#'+pointer}},
 }:{components:{examples:{Payload:{value:base}},schemas:{Base:{$ref:'#'+pointer},Dog:{allOf:[{$ref:'#/components/schemas/Base'}],'x-entry':'Second'}}}})};
 const input={root:ids[0],snapshot:'restricted-model-'+version+format,targetVersion:'3.2.1',destination:'file:///restricted-output/',resources:[first,second].map((value,index)=>({id:ids[index],text:format==='yaml'?'# Keep restricted 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value),generation:1}))};
 const before=input.resources.map(resource=>resource.text),texts=swagger?['{"n":0,"next":{"n":2}}','{"n":1}','{"n":0,"next":{"n":false}}','null']:
  ['{"n":0,"kind":"chosen","next":{"n":2,"kind":"chosen"}}','{"n":1,"kind":"chosen"}','{"n":0,"kind":"unknown"}','{"n":0}'];
 const expected=swagger?[true,false,false,false]:[true,false,true,false];
 for(const [index,root]of ids.entries())assert.deepEqual(await evaluations({...input,root},index===1&&swagger?'/definitions/Base':'/components/schemas/Base',texts),expected);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));const output=cold(review);
 for(const [index,id]of ids.entries()){
  const packet={...output,root:review.changes.find(change=>change.resource===id).destination},graph=createGraph(packet).graph;
  assert.equal(analyse(packet).status,'complete');assert.deepEqual(await evaluations(packet,'/components/schemas/Base',texts),expected);
  const at=material(graph,packet.root,'/components/schemas/Base');assert(at.pointer.endsWith('/items'));
  assert.equal(graph.docs.get(at.resource).dataNode(at.pointer.slice(0,-'/items'.length)+'/type').value,'array');
  if(!swagger){
   const binding=graph.references.find(reference=>reference.connection==='discriminator'&&reference.resource===at.resource&&reference.pointer===at.pointer+'/discriminator/mapping');
   assert(binding);assert.equal(binding.resolution,'resolved');assert.equal(graph.docs.get(binding.targetResource).dataNode(binding.targetPointer).value['x-entry'],index===0?'First':'Second');
   const page=choices(packet,at);assert.equal(page.complete,true);assert.deepEqual(page.entries.map(value=>value.label),['Dog']);
  }
 }
 const destination=review.changes.find(change=>change.resource===ids[1]).destination,document=createGraph(output).graph.docs.get(destination);
 const literal=swagger?'/components/schemas/Data/default':pointer;
 assert.equal(document.dataJson(literal),createGraph(input).graph.docs.get(ids[1]).dataJson(pointer));
 assert.deepEqual(input.resources.map(resource=>resource.text),before);assert.deepEqual((await planMigration(input)).outputs,review.outputs);
});

test('implicit allOf model names seed shared ownership even without explicit mapping fields',async()=>{
 const ids=['a','b','models'].map(name=>'file:///implicit-model/'+name+'.json');
 const entry=name=>({openapi:'3.0.4',info:{title:name,version:'1'},paths:{},components:{schemas:{
  Base:{$ref:'models.json#/Node'},[name]:{allOf:[{$ref:'#/components/schemas/Base'}],'x-entry':name},
 }}});
 const model={type:'object',required:['kind'],properties:{kind:{type:'string'}},discriminator:{propertyName:'kind'}};
 const input={root:ids[0],snapshot:'implicit-model-owners',targetVersion:'3.2.1',destination:'file:///implicit-output/',resources:[entry('Dog'),entry('Cat'),{Node:model}].map((value,index)=>({id:ids[index],text:JSON.stringify(value),generation:1}))};
 const texts=['{"kind":"Dog"}','{"kind":"Cat"}','{"kind":"unknown"}','{}'];
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));const output=cold(review);
 for(const [index,name]of ['Dog','Cat'].entries()){
  assert.deepEqual(await evaluations({...input,root:ids[index]},'/components/schemas/Base',texts),[true,true,true,false]);
  const packet={...output,root:review.changes.find(change=>change.resource===ids[index]).destination},graph=createGraph(packet).graph;
  assert.deepEqual(await evaluations(packet,'/components/schemas/Base',texts),[true,true,true,false]);
  const at=material(graph,packet.root,'/components/schemas/Base');assert(at.pointer.endsWith('/items'));
  assert.deepEqual(at.value.discriminator,{propertyName:'kind'},'Implicit names need no invented discriminator mapping');
  const page=choices(packet,at);assert.equal(page.complete,true);assert.deepEqual(page.entries.map(value=>value.label),[name]);
 }
});
