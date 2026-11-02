const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');
const {analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
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
test('nonconstant containment and an unevaluated annotated schema retain explicit implementation blockers',async()=>{
 const root='file:///approved/nonconstant.json';
 for(const schema of [{contains:{type:'integer'},minContains:2},{contains:true,unevaluatedItems:{title:'Retain this owner'}}]){
  const text=JSON.stringify({openapi:'3.2.1',info:{title:'Not a constant proof',version:'1'},paths:{},components:{schemas:{Model:schema}}});
  const review=await planMigration({root,resources:[{id:root,text,generation:0}],snapshot:'nonconstant',targetVersion:'3.0.4',destination:'file:///delivered/'});
  assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
  assert(review.problems.some(problem=>problem.reason==='implementation'&&['migration.schema.contains','migration.schema.unevaluatedItems'].includes(problem.code)));
 }
});
// The byte-for-byte retained official fixture supplies an independent oracle.
const official=require('../../fixtures/json_schema_2020_12/contains.json');
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
