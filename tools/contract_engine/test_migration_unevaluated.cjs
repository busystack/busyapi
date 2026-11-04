const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{analyse,createGraph}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
for(const targetVersion of ['2.0','3.0.4'])for(const format of ['yaml','json'])test(`${format} local and covered unevaluated selections preserve original constraints in ${targetVersion}`,async()=>{
 const root='file:///unevaluated/api.'+format,inactive={patternProperties:{'.':{contains:{type:'integer'}}}};
 const additional={type:'integer',enum:['EXACT']},models={
  Object:{type:'object',properties:{known:{type:'string'},next:{$ref:'#/components/schemas/Object'}},unevaluatedProperties:additional},
  ObjectValue:{$ref:'#/components/schemas/Object/unevaluatedProperties'},
  Array:{type:'array',unevaluatedItems:{type:'integer'}},ArrayValue:{$ref:'#/components/schemas/Array/unevaluatedItems'},
  CoveredObject:{type:'object',properties:{known:{type:'string'}},additionalProperties:false,unevaluatedProperties:inactive},
  CoveredArray:{type:'array',items:{type:'integer'},unevaluatedItems:inactive},
  ClosedArray:{type:'array',items:false,unevaluatedItems:inactive},
  All:{contains:true,minContains:0,unevaluatedItems:inactive},
  OnlyString:{type:'string',unevaluatedProperties:inactive},OnlyObject:{type:'object',unevaluatedItems:inactive},
  Finite:{type:'object',propertyNames:{enum:['n','free']},patternProperties:{'^n$':{type:'integer'}},unevaluatedProperties:{type:'string'}},
  ...(targetVersion==='2.0'?{
   Tuple:{type:'array',prefixItems:[{type:'string'}],unevaluatedItems:additional,maxItems:3},TupleValue:{$ref:'#/components/schemas/Tuple/unevaluatedItems'},
   ClosedTuple:{type:'array',prefixItems:[{type:'string'}],unevaluatedItems:false},ClosedValue:{$ref:'#/components/schemas/ClosedTuple/unevaluatedItems'},
  }:{}),
 };
 const document={openapi:'3.2.1',info:{title:'Unevaluated owners',version:'1'},paths:{},components:{schemas:models},'x-literal':{additional,inactive}};
 const text=(format==='yaml'?'# Keep unevaluated aliases 雪\r\n'+YAML.stringify(document).replaceAll('\n','\r\n'):JSON.stringify(document))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'unevaluated-owners',resources:[{id:root,text,generation:1}],targetVersion,destination:'file:///unevaluated-output/'};
 const samples=['null','false','0','"雪"','{}','{"known":"雪","extra":9007199254740993.00}','{"known":"雪","extra":9007199254740992}',
  '{"next":{"extra":9007199254740993}}','{"n":1,"free":"雪"}','{"n":"1"}','{"free":1}','[]','[0,1]','["雪"]',
  '["雪",9007199254740993.00]','["雪",9007199254740992]','["雪",9007199254740993,9007199254740993]',
  '["雪",9007199254740993,9007199254740993,9007199254740993]','9007199254740993.00'];
 const outcomes=async(packet,prefix)=>{
  const result=await evaluateSchemas({...packet,runtimeInstances:Object.keys(models).flatMap(name=>samples.map(text=>({subject:'response-body',location:name+text,text,schema:{resource:packet.root,pointer:prefix+name}})))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(result=>result.valid);
 };
 assert.equal(analyse(input).status,'complete');const before=await outcomes(input,'/components/schemas/');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-unevaluated',resources:review.outputs.map(output=>({...output,generation:0}))};
 assert.equal(analyse(output).status,'complete');assert.deepEqual(await outcomes(output,targetVersion==='2.0'?'/definitions/':'/components/schemas/'),before);
 const graph=createGraph(output).graph,doc=graph.docs.get(output.root),prefix=targetVersion==='2.0'?'/definitions/':'/components/schemas/';
 assert.equal(doc.dataNode(prefix+'Object/unevaluatedProperties'),undefined);assert(doc.dataNode(prefix+'Object/additionalProperties'));
 assert(doc.dataNode(prefix+'Array/items'));assert.equal(doc.dataNode(prefix+'CoveredArray/unevaluatedItems'),undefined);
 if(targetVersion==='2.0'){
  assert.equal(doc.dataNode(prefix+'Tuple/items').children.size,3);assert.equal(doc.dataNode(prefix+'ClosedTuple/maxItems').value,1);
  const reference=graph.referenceAs(output.root,prefix+'TupleValue','$ref','schema');assert(reference.targetPointer.endsWith('/items'));
 }
 assert.equal(doc.dataJson('/x-literal'),new SourceDocument(text,root).dataJson('/x-literal'));
 assert.equal(input.resources[0].text,text);assert.deepEqual((await planMigration(input)).outputs,review.outputs);
});

// The retained, unmodified official suite supplies expected outcomes independently
// of BusyAPI's source evaluator. General annotation-dependent cases remain in
// the native conformance suite; these selected cases have the proved mapping.
const official=require('../../fixtures/json_schema_2020_12/unevaluatedProperties.json');
const mapped=new Set(['unevaluatedProperties true','unevaluatedProperties schema','unevaluatedProperties false',
 'unevaluatedProperties with adjacent properties','unevaluatedProperties with adjacent bool additionalProperties',
 'unevaluatedProperties with adjacent non-bool additionalProperties','non-object instances are valid']);
for(const targetVersion of ['2.0','3.0.4'])for(const fixture of official.filter(value=>mapped.has(value.description)))
test(`official unevaluated selection ${targetVersion}: ${fixture.description}`,async()=>{
 const root='file:///official-unevaluated/api.json',text=JSON.stringify({openapi:'3.1.2',info:{title:fixture.description,version:'1'},paths:{},components:{schemas:{Value:fixture.schema}}});
 const input={root,snapshot:'official-unevaluated',resources:[{id:root,text,generation:1}],targetVersion,destination:'file:///official-output/'};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 for(const packet of [input,{root:review.outputRoot,snapshot:'cold-official',resources:review.outputs.map(output=>({...output,generation:0}))}]){
  const pointer=packet===input||targetVersion!=='2.0'?'/components/schemas/Value':'/definitions/Value';
  const result=await evaluateSchemas({...packet,runtimeInstances:fixture.tests.map(sample=>({subject:'response-body',location:sample.description,text:JSON.stringify(sample.data),schema:{resource:packet.root,pointer}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),fixture.tests.map(value=>value.valid));
 }
});
test('unresolved composition coverage and identified inactive assertions retain specific blockers',async()=>{
 const root='file:///unevaluated-refusals/api.json';
 for(const schema of [
  {allOf:[{properties:{n:{type:'integer'}}}],unevaluatedProperties:false},
  {contains:{type:'integer'},minContains:0,unevaluatedItems:{type:'string'}},
  {additionalProperties:true,unevaluatedProperties:{$id:'independent',patternProperties:{'.':{type:'integer'}}}},
 ]){
  const text=JSON.stringify({openapi:'3.2.1',info:{title:'Retain evaluation scope',version:'1'},paths:{},components:{schemas:{Value:schema}}});
  const input={root,snapshot:'unevaluated-refusal',resources:[{id:root,text,generation:1}],targetVersion:'3.0.4',destination:'file:///not-published/'};
  const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
  assert(review.problems.some(problem=>problem.reason==='implementation'&&['migration.schema.unevaluatedProperties','migration.schema.unevaluatedItems','migration.schema.patternProperties'].includes(problem.code)));
  assert.equal(input.resources[0].text,text);
 }
});
