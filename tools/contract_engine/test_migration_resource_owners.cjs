const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs'),{join}=require('node:path'),{createHash}=require('node:crypto'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{analyse,createGraph}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs'),{SourceDocument}=require('./dist/document.cjs');
const {resolveUri}=require('./dist/reference_graph.cjs');
const first='file:///owners/a.json',second='file:///owners/b.json',model='file:///owners/model.json';
const corpus=JSON.parse(readFileSync(join(__dirname,'../../fixtures/json_schema_2020_12/dynamicRef.json'),'utf8'));
const descriptions=[
 'A $dynamicRef to a $dynamicAnchor in the same schema resource behaves like a normal $ref to an $anchor',
 'A $dynamicRef resolves to the first $dynamicAnchor still in scope that is encountered when the schema is evaluated',
 'A $dynamicRef with intermediate scopes that don\'t include a matching $dynamicAnchor does not affect dynamic scope resolution',
];
function packet(schema){
 const entry=version=>({openapi:version,info:{title:'Resource owners',version:'business'},paths:{},components:{schemas:{Model:{$ref:'model.json'}}}});
 return {root:first,snapshot:'identified-resources',destination:'file:///delivered/resources/',resources:[
  {id:first,text:JSON.stringify(entry('3.1.2')),generation:1},{id:second,text:JSON.stringify(entry('3.2.1')),generation:2},
  {id:model,text:JSON.stringify(schema),generation:3}]};
}
async function outcomes(input,root,samples){
 const checked=analyse({...input,root});assert.equal(checked.status,'complete',JSON.stringify(checked.findings));
 const prefix=checked.specification.family==='2.0'?'/definitions':'/components/schemas';
 const result=await evaluateSchemas({...input,root,runtimeInstances:samples.map(value=>({subject:'response-body',location:value.description,text:typeof value.text==='string'?value.text:JSON.stringify(value.data),schema:{resource:root,pointer:prefix+'/Model'}}))});
 assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
}
for(const [index,description]of descriptions.entries())for(const targetVersion of index===0?['2.0','3.0.4','3.1.2','3.2.1']:['3.1.2','3.2.1'])
test(`${targetVersion} entry-owned resource namespaces retain official dynamic semantics: ${description}`,async()=>{
 const fixture=corpus.find(value=>value.description===description);assert(fixture,description);
 const input={...packet(fixture.schema),targetVersion},before=input.resources.map(value=>value.text),expected=fixture.tests.map(value=>value.valid);
 for(const root of [first,second])assert.deepEqual(await outcomes(input,root,fixture.tests),expected);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={snapshot:'cold-resource-owners',resources:review.outputs.map(value=>({id:value.id,text:value.text,generation:0,
  aliases:Object.entries(review.manifest.resourceMappings).filter(([,path])=>path===value.path).map(([uri])=>uri)}))};
 for(const source of [first,second]){
  const root=review.changes.find(value=>value.resource===source).destination;
  assert.deepEqual(await outcomes(cold,root,fixture.tests),expected);
  const graph=createGraph({...cold,root}).graph;
  for(const reference of graph.entryReferences())assert.equal(reference.resolution,'resolved');
  assert(!graph.entryReferences().some(reference=>reference.targetResource===model));
 }
 const original=review.outputs.find(value=>value.id===review.changes.find(value=>value.resource===model).destination);
 assert.equal(original.text,input.resources[2].text,'Detached original schema resources retain exact source bytes');
 assert.deepEqual(input.resources.map(value=>value.text),before);
});

for(const format of ['yaml','json'])test(`${format} resource specialization retains exact data and original schema/documentation identities`,async()=>{
 const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://schemas.invalid/base/model',type:'object',required:['n'],
  properties:{n:{type:'integer',enum:['EXACT']}},additionalProperties:false,description:'[Guide](guide.md)',externalDocs:{url:'guide.md'},
  'x-literal':{$id:'literal-id',$ref:'literal-ref',n:'EXACT',zero:0,empty:'',flag:false}};
 const input={...packet(schema),targetVersion:'3.2.1'},id=model.replace('.json','.'+format);
 input.resources[2]={id,generation:3,text:(format==='yaml'?'# Keep resource identity 雪\r\n'+YAML.stringify(schema).replaceAll('\n','\r\n'):JSON.stringify(schema))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00')};
 for(const resource of input.resources.slice(0,2))resource.text=resource.text.replaceAll('model.json','model.'+format);
 const before=input.resources.map(value=>value.text),samples=[{text:'{"n":9007199254740993}',description:'exact'},{text:'{"n":9007199254740992}',description:'rounded'}];
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={snapshot:'cold-exact-resources',resources:review.outputs.map(value=>({id:value.id,text:value.text,generation:0,
  aliases:Object.entries(review.manifest.resourceMappings).filter(([,path])=>path===value.path).map(([uri])=>uri)}))};
 const source=new SourceDocument(input.resources[2].text,id);
 for(const entry of [first,second]){
  const root=review.changes.find(value=>value.resource===entry).destination;
  assert.deepEqual(await outcomes(cold,root,samples),[true,false]);
  const graph=createGraph({...cold,root}).graph,owner=graph.referenceAs(root,'/components/schemas/Model','$ref','schema');
  const scope=graph.scopeAs(owner.targetResource,owner.targetPointer,'schema'),doc=graph.docs.get(scope.resource);
  assert.notEqual(scope.base,schema.$id);assert.equal(doc.dataJson(scope.pointer+'/x-literal'),source.dataJson('/x-literal'));
  assert.equal(resolveUri(doc.dataNode(scope.pointer+'/description').value.match(/\]\(([^)]+)\)/)[1],scope.base).href,'https://schemas.invalid/base/guide.md');
  assert.equal(doc.dataNode(scope.pointer+'/externalDocs/url').value,'https://schemas.invalid/base/guide.md');
 }
 assert.equal(review.outputs.find(value=>value.id===review.changes.find(value=>value.resource===id).destination).text,input.resources[2].text);
 assert.deepEqual(input.resources.map(value=>value.text),before);
});

test('an implicit whole resource retains its boundary when each entry receives an inline owner',async()=>{
 const fixture=corpus.find(value=>value.description===descriptions[0]),schema={...fixture.schema};delete schema.$id;
 const input={...packet(schema),targetVersion:'3.2.1'},expected=fixture.tests.map(value=>value.valid);
 for(const root of [first,second])assert.deepEqual(await outcomes(input,root,fixture.tests),expected);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={snapshot:'implicit-resource-cold',resources:review.outputs.map(value=>({id:value.id,text:value.text,generation:0}))};
 const identities=[];
 for(const entry of [first,second]){
  const root=review.changes.find(value=>value.resource===entry).destination;
  assert.deepEqual(await outcomes(cold,root,fixture.tests),expected);
  const graph=createGraph({...cold,root}).graph,reference=graph.referenceAs(root,'/components/schemas/Model','$ref','schema');
  const scope=graph.scopeAs(reference.targetResource,reference.targetPointer,'schema');
  assert.equal(scope.resourcePointer,scope.pointer);identities.push(scope.base);
 }
 assert.equal(new Set(identities).size,2);
 assert.equal(review.outputs.find(value=>value.id===review.changes.find(value=>value.resource===model).destination).text,input.resources[2].text);
});

for(const format of ['yaml','json'])test(`${format} partial resource owners preserve recursive dynamic overrides and exact values`,async()=>{
 const schema={Forward:{$ref:'#/Node'},Node:{$dynamicAnchor:'node',type:'object',required:['n'],
  properties:{n:{type:'integer',enum:['EXACT']},next:{$dynamicRef:'#node'}},description:'[Guide](guide.md)'},
  Strict:{$id:'https://schemas.invalid/strict',$dynamicAnchor:'node',$ref:model+'#/Node',required:['strict'],properties:{strict:{const:true}}},
  Literal:{$ref:'literal-only',zero:0,flag:false,empty:''}};
 const input={...packet(schema),targetVersion:'3.2.1'};
 for(const resource of input.resources.slice(0,2)){
  const value=JSON.parse(resource.text);value.components.schemas.Model.$ref='model.json#/Forward';
  value.components.schemas.Strict={$ref:'model.json#/Strict'};resource.text=JSON.stringify(value);
 }
 input.resources[2].text=(format==='yaml'?'# Keep partial resource 雪\r\n'+YAML.stringify(schema).replaceAll('\n','\r\n'):JSON.stringify(schema)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const texts=['{"n":9007199254740993}','{"n":9007199254740993,"strict":true}',
  '{"n":9007199254740993,"strict":true,"next":{"n":9007199254740993}}',
  '{"n":9007199254740993,"strict":true,"next":{"n":9007199254740993,"strict":true}}',
  '{"n":9007199254740992,"strict":true}'];
 const samples=texts.map((text,index)=>({text,description:String(index)}));
 for(const root of [first,second])assert.deepEqual(await outcomes(input,root,samples),[true,true,true,true,false]);
 const strict=async(packet,root)=>{
  const result=await evaluateSchemas({...packet,root,runtimeInstances:texts.map(text=>({subject:'response-body',location:text,text,schema:{resource:root,pointer:'/components/schemas/Strict'}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
 };
 for(const root of [first,second])assert.deepEqual(await strict(input,root),[false,true,false,true,false]);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={snapshot:'cold-partial-dynamic',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 for(const entry of [first,second]){
  const root=review.changes.find(change=>change.resource===entry).destination;
  assert.deepEqual(await outcomes(cold,root,samples),[true,true,true,true,false]);
  assert.deepEqual(await strict(cold,root),[false,true,false,true,false]);
 }
 assert.equal(review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===model).destination).text,input.resources[2].text);
});

for(const targetVersion of ['2.0','3.0.4'])test(`partial resource owners lower fixed recursive dynamic binding to ${targetVersion}`,async()=>{
 const schema={Forward:{$ref:'#/Node'},Node:{$dynamicAnchor:'items',type:'array',items:{$dynamicRef:'#items'}},Literal:{$ref:'literal-only',flag:false}};
 const input={...packet(schema),targetVersion};
 for(const resource of input.resources.slice(0,2)){
  const entry=JSON.parse(resource.text);entry.components.schemas.Model.$ref='model.json#/Forward';resource.text=JSON.stringify(entry);
 }
 const samples=['[]','[[]]','[false]','null'].map((text,index)=>({text,description:String(index)}));
 for(const root of [first,second])assert.deepEqual(await outcomes(input,root,samples),[true,true,false,false]);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={snapshot:'partial-fixed-cold',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 for(const entry of [first,second]){
  const root=review.changes.find(change=>change.resource===entry).destination;
  assert.deepEqual(await outcomes(cold,root,samples),[true,true,false,false]);
 }
 assert.equal(review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===model).destination).text,input.resources[2].text);
});

for(const owner of ['document-alias','example-alias'])test(`generated schema identities avoid captured ${owner} collisions`,async()=>{
 const input={...packet({$id:'https://schemas.invalid/model',type:'string'}),targetVersion:'3.2.1'};
 const initial=await planMigration(input);assert.equal(initial.complete,true,JSON.stringify(initial.problems));
 const output=initial.outputs.find(value=>value.id===initial.outputRoot),value=JSON.parse(output.text);
 const generated=Object.values(value.components.schemas).find(value=>typeof value.$id==='string');assert(generated);
 const reserved=generated.$id;
 if(owner==='document-alias')input.resources.push({id:'file:///owners/reserved.json',text:'{"literal":true}',generation:0,aliases:[reserved]});
 else{
  const bytes=Buffer.from('null');input.exampleResources=[{version:1,id:'file:///owners/reserved-example.json',aliases:[reserved],generation:0,
   state:'available',base64:bytes.toString('base64'),byteLength:bytes.length,identity:createHash('sha256').update(bytes).digest('hex')}];
 }
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const result=JSON.parse(review.outputs.find(value=>value.id===review.outputRoot).text);
 const identity=Object.values(result.components.schemas).find(value=>typeof value.$id==='string').$id;
 assert.notEqual(identity,reserved);
 const cold={snapshot:'collision-cold',resources:review.outputs.map(value=>({id:value.id,text:value.text,generation:0}))};
 assert.deepEqual(await outcomes(cold,review.outputRoot,[{text:'"雪"',description:'valid'},{text:'null',description:'invalid'}]),[true,false]);
});
