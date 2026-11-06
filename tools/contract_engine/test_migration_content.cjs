const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertB03}=require('./migration_b03_fixture.cjs');
const {planMigration}=require('./dist/migration.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');

for(const targetVersion of ['2.0','3.0.4'])for(const format of ['yaml','json'])
test(`${format} ${targetVersion} contentSchema without a media annotation stays inactive and independently addressable`,async()=>{
 await assertB03({format,targetVersion,schema:{type:'string',contentSchema:{type:'object',required:['n'],
  properties:{n:{type:'integer',enum:['EXACT'],description:'Decoded independent value'},next:{$ref:'#/components/schemas/Value/contentSchema'}}}},
  independent:'contentSchema',samples:['"arbitrary undecoded content"','"not JSON"','null','{}','{"n":9007199254740993.00}',
   '{"n":9007199254740992}','{"n":9007199254740993,"next":{"n":9007199254740993}}']});
});
for(const targetVersion of ['2.0','3.0.4'])for(const format of ['yaml','json'])
test(`${format} ${targetVersion} nonstring content annotations preserve values without activating decoding`,async()=>{
 await assertB03({format,targetVersion,schema:{type:'object',contentEncoding:'base16',contentMediaType:'application/json',
  contentSchema:{patternProperties:{'^unsupported':{type:'integer'}}},properties:{n:{type:'integer',enum:['EXACT']}}},
  samples:['null','"00ff"','[]','{}','{"n":9007199254740993.00}','{"n":9007199254740992}']});
});
test('active decoded-content meaning retains a target-vocabulary refusal; it is never made an assertion',async()=>{
 const root='file:///content-policy/api.json',text=JSON.stringify({openapi:'3.2.1',info:{title:'Content annotation',version:'1'},paths:{},components:{schemas:{
  Value:{type:'string',contentMediaType:'application/json',contentSchema:{type:'object',required:['n']}},
 }}}),input={root,snapshot:'content-policy',resources:[{id:root,text,generation:0}],targetVersion:'3.0.4',destination:'file:///content-output/'};
 const checked=await evaluateSchemas({...input,runtimeInstances:['"not JSON"','"{}"'].map(text=>({subject:'response-body',location:'content',text,
  schema:{resource:root,pointer:'/components/schemas/Value'}}))});
 assert.equal(checked.complete,true,JSON.stringify(checked.findings));assert.deepEqual(checked.runtimeEvaluations.map(value=>value.valid),[true,true]);
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(value=>value.code==='migration.schema.contentSchema'&&value.reason==='target-representation'));
 assert.equal(input.resources[0].text,text);
});
for(const targetVersion of ['3.1.0','3.1.1','3.1.2','3.2.0'])test(`modern target ${targetVersion} retains all active content annotations`,async()=>{
 await assertB03({targetVersion,schema:{type:'string',contentEncoding:'base16',contentMediaType:'application/json',
  contentSchema:{type:'object',properties:{n:{type:'integer',enum:['EXACT']}}}},independent:'contentSchema',
  samples:['"arbitrary"','""','{}','{"n":9007199254740993.00}','null']});
});
