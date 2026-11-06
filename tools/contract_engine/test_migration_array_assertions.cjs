const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');
const {analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const official=require('../../fixtures/json_schema_2020_12/contains.json');
for(const version of ['3.1.2','3.2.1'])for(const targetVersion of ['2.0','3.0.4'])for(const format of ['yaml','json'])
test(`${version} to ${targetVersion} ${format} constant contains preserves counts, independent schemas and non-arrays`,async()=>{
 const root='file:///approved/counts.'+format;
 const models={
  All:{contains:true,minContains:0,maxContains:2},
  Every:{contains:{},minContains:1,maxContains:3,unevaluatedItems:false},
  Default:{contains:true},
  None:{contains:false,minContains:0,maxContains:0},
  NoArray:{contains:false},
  Tight:{contains:true,minContains:0,maxContains:5,minItems:1,maxItems:2},
  Inactive:{minContains:'EXACT',maxContains:0},
  TrueOwner:{$ref:'#/components/schemas/All/contains'},
  FalseOwner:{$ref:'#/components/schemas/NoArray/contains'},
  UnevaluatedOwner:{$ref:'#/components/schemas/Every/unevaluatedItems'},
 };
 const literal={contains:false,minContains:'EXACT',maxContains:0,$ref:'literal-data'};
 const value={openapi:version,info:{title:'Counts 雪',version:'business'},paths:{},components:{schemas:models},'x-literal':literal};
 const text=(format==='yaml'?'# Retain count owners\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,resources:[{id:root,text,generation:4}],snapshot:'count-mappings',targetVersion,destination:'file:///delivered/'};
 const samples=['null','false','0','"雪"','{}','[]','[null]','[false,0]','[null,false,0]','[1,2,3,4]'];
 const evaluate=(packet,prefix)=>evaluateSchemas({...packet,runtimeInstances:Object.keys(models).flatMap(name=>samples.map(text=>({
  subject:'response-body',location:name+text,text,schema:{resource:packet.root,pointer:prefix+'/'+name}})))});
 const before=await evaluate(input,'/components/schemas');assert.equal(before.complete,true,JSON.stringify(before.findings));
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={root:review.outputRoot,resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0})),snapshot:'cold-counts'};
 assert.equal(analyse(cold).status,'complete',JSON.stringify(analyse(cold).findings));
 const after=await evaluate(cold,targetVersion==='2.0'?'/definitions':'/components/schemas');
 assert.equal(after.complete,true,JSON.stringify(after.findings));
 assert.deepEqual(after.runtimeEvaluations.map(result=>result.valid),before.runtimeEvaluations.map(result=>result.valid));
 const output=new SourceDocument(review.outputs.find(output=>output.id===cold.root).text,cold.root);
 assert.equal(output.dataJson('/x-literal'),new SourceDocument(text,root).dataJson('/x-literal'));
 assert.equal(input.resources[0].text,text);
});
test('unproved match counts and positional coverage retain explicit proof blockers',async()=>{
 const root='file:///approved/nonconstant.json';
 for(const schema of [{contains:{type:'integer'},minContains:2},
  {anyOf:[{prefixItems:[{type:'integer'}]},{items:{type:'string'}}],unevaluatedItems:{title:'Retain this owner'}}]){
  const text=JSON.stringify({openapi:'3.2.1',info:{title:'Not a constant proof',version:'1'},paths:{},components:{schemas:{Model:schema}}});
  const review=await planMigration({root,resources:[{id:root,text,generation:0}],snapshot:'nonconstant',targetVersion:'3.0.4',destination:'file:///delivered/'});
  assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
  assert(review.problems.some(problem=>problem.reason==='implementation'&&['migration.schema.contains','migration.schema.unevaluatedItems'].includes(problem.code)));
 }
});

const {assertB03}=require('./migration_b03_fixture.cjs');
for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])
for(const counts of [{},{minContains:0},{minContains:0,maxContains:0}])
test(`${version} ${format} nonconstant existential/complement containment preserves successful metadata ${JSON.stringify(counts)}`,async()=>{
 await assertB03({version,format,schema:{contains:{$ref:'#/components/schemas/Match'},...counts},
  models:{Match:{type:'object',required:['n'],properties:{n:{type:'integer',enum:['EXACT'],description:'Matched number'},
   next:{$ref:'#/components/schemas/Match'}},title:'Successful match'}},independent:'contains',
  samples:['null','false','0','{}','[]','[false]','[{"n":9007199254740993.00}]','[{"n":9007199254740992}]',
   '[{"n":9007199254740993},false,{"n":9007199254740993}]','[{"n":9007199254740993,"next":{}}]']});
});
for(const targetVersion of ['2.0','3.0.4'])for(const format of ['yaml','json'])
test(`${format} ${targetVersion} structural implication establishes exact nonconstant match counts without length expansion`,async()=>{
 await assertB03({targetVersion,format,schema:{allOf:[{items:{$ref:'#/components/schemas/Item'}}],
  contains:{type:'integer',minimum:0,description:'Every successful item matches'},minContains:2,maxContains:3},
  models:{Item:{type:'integer',minimum:1}},independent:'contains',samples:[
   'null','{}','[]','[1]','[1,2]','[1,2,3]','[1,2,3,4]','[1,0]','[1,"2"]',
  ],expected:[true,true,false,false,true,true,false,false,false]});
});
for(const targetVersion of ['2.0','3.0.4'])for(const format of ['yaml','json'])
test(`${format} ${targetVersion} exhaustive finite arrays retain exact matching counts`,async()=>{
 await assertB03({targetVersion,format,schema:{type:'array',maxItems:3,items:{type:'boolean'},contains:{const:true},minContains:2,maxContains:2},
  independent:'contains',samples:['null','[]','[true]','[true,false,true]','[true,true]','[true,true,true]','[true,true,false,false]','[true,1,true]'],
  expected:[false,false,false,true,true,false,false,false]});
});
for(const fixture of official.filter(value=>!value.description.includes('boolean schema')))
test(`official nonconstant containment 3.0: ${fixture.description}`,async()=>{
 await assertB03({schema:fixture.schema,samples:fixture.tests.map(value=>JSON.stringify(value.data)),expected:fixture.tests.map(value=>value.valid)});
});
test('official conditional constant containment retains the Swagger count mapping',async()=>{
 const fixture=official.find(value=>value.description==='contains with false if subschema');assert(fixture);
 await assertB03({targetVersion:'2.0',schema:fixture.schema,samples:fixture.tests.map(value=>JSON.stringify(value.data)),expected:fixture.tests.map(value=>value.valid)});
});
for(const targetVersion of ['2.0','3.0.4'])test(`a forced all-match count retains exact length and predicate annotations in ${targetVersion}`,async()=>{
 await assertB03({targetVersion,schema:{maxItems:2,contains:{type:'integer',description:'Every accepted item'},minContains:2,unevaluatedItems:false},
  independent:'contains',samples:['null','[]','[1]','[1,2]','[1,"2"]','[1,2,3]'],expected:[true,false,false,true,false,false]});
});
for(const counts of [{minContains:1,maxContains:1},{minContains:2,maxContains:2}])
test(`finite matching values plus uniqueness preserve exact counts at unbounded array lengths: ${JSON.stringify(counts)}`,async()=>{
 await assertB03({schema:{uniqueItems:true,contains:{enum:[1,'EXACT'],description:'A counted value'},...counts},independent:'contains',samples:[
  'null','{}','[]','[1]','[9007199254740993.00]','[1,9007199254740993.00]','[1,1]',
  '[1,2,3,4,5,6]','[9007199254740993,9007199254740992]',
  '['+Array.from({length:65},(_,index)=>index+1).join(',')+']',
 ]});
});
test('a native type complement expresses zero matching items in Swagger without a not keyword',async()=>{
 await assertB03({targetVersion:'2.0',schema:{contains:{type:'string',description:'Never successful here'},minContains:0,maxContains:0},
  independent:'contains',samples:['null','{}','[]','[1,false,null,{}]','["snow"]','[1,"snow"]'],expected:[true,true,true,true,false,false]});
});
for(const contains of [{pattern:'a'},{type:'string',pattern:'^a$'},{enum:['a','snow 雪']}])
test(`a proved string complement expresses zero matching items in Swagger: ${JSON.stringify(contains)}`,async()=>{
 await assertB03({targetVersion:'2.0',schema:{contains,minContains:0,maxContains:0},independent:'contains',samples:[
  'null','{}','[]','[1,false,null]','["a"]','["a\\n"]','["bad"]','["snow 雪"]','["unrelated"]',
 ]});
});
// The byte-for-byte retained official fixture supplies an independent oracle.
for(const description of ['contains keyword with boolean schema true','contains keyword with boolean schema false'])
for(const targetVersion of ['2.0','3.0.4'])test(`official constant containment ${targetVersion}: ${description}`,async()=>{
 const fixture=official.find(fixture=>fixture.description===description);assert(fixture);
 const root='file:///official/contains.json',text=JSON.stringify({openapi:'3.2.1',info:{title:description,version:'1'},paths:{},components:{schemas:{Model:fixture.schema}}});
 const input={root,resources:[{id:root,text,generation:0}],snapshot:description,targetVersion,destination:'file:///official/output/'};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={root:review.outputRoot,resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0})),snapshot:'cold-official'};
 for(const [packet,prefix]of [[input,'/components/schemas'],[cold,targetVersion==='2.0'?'/definitions':'/components/schemas']]){
  const result=await evaluateSchemas({...packet,runtimeInstances:fixture.tests.map(test=>({subject:'response-body',location:test.description,
   text:JSON.stringify(test.data),schema:{resource:packet.root,pointer:prefix+'/Model'}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));
  assert.deepEqual(result.runtimeEvaluations.map(result=>result.valid),fixture.tests.map(test=>test.valid));
 }
});

for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4'])for(const positive of [false,true])
test(`${format} ${targetVersion} composed constant containment maps counts and retains independent owners positive=${positive}`,async()=>{
 const root='file:///composed-contains/api.'+format;
 const predicate=positive?{allOf:[{not:false},{oneOf:[false,true]}]}:{not:{anyOf:[false,{not:false}]}};
 const document={openapi:'3.2.1',info:{title:'Composed containment',version:'1'},paths:{},components:{schemas:{
  Model:{contains:predicate,minContains:1,maxContains:2,...(positive?{unevaluatedItems:{patternProperties:{'.':{contains:{const:0}}}}}:{})},
  Independent:{$ref:'#/components/schemas/Model/contains'},
 }},'x-history':{contains:predicate,number:'EXACT'}};
 const text=(format==='yaml'?'# Keep composed containment\r\n'+YAML.stringify(document,{aliasDuplicateObjects:false}):JSON.stringify(document))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'composed-contains-'+positive,resources:[{id:root,text,generation:4}],targetVersion,destination:'file:///composed-contains-output/'};
 assert.equal(analyse(input).status,'complete');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-composed-contains',resources:review.outputs.map(resource=>({id:resource.id,text:resource.text,generation:0}))};
 const prefix=targetVersion==='2.0'?'/definitions/':'/components/schemas/';
 for(const name of ['Model','Independent']){
  const samples=['null','false','0','"雪"','{}','[]','[0]','[0,null]','[0,null,false]'];
  const evaluate=async(packet,pointer)=>{
   const result=await evaluateSchemas({...packet,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer}}))});
   assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(result=>result.valid);
  };
  assert.deepEqual(await evaluate(output,prefix+name),await evaluate(input,'/components/schemas/'+name));
 }
 assert.equal(new SourceDocument(review.outputs.find(resource=>resource.id===output.root).text,output.root).dataJson('/x-history'),new SourceDocument(text,root).dataJson('/x-history'));
 assert.equal(input.resources[0].text,text);
});
