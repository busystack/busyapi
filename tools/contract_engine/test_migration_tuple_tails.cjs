const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {createHash}=require('node:crypto');
const {planMigration}=require('./dist/migration.cjs'),{analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const tail of ['constrained','true','false'])for(const maxItems of [0,1,3])test(`${version} ${format} ${tail} tuple tail maxItems=${maxItems} reaches Swagger with one independent owner`,async()=>{
 const root='file:///approved/api.'+format,schema=tail==='constrained'?{type:'integer',minimum:'EXACT'}:tail==='true';
 const stem='_migrated_tuple_tail_'+createHash('sha256').update(JSON.stringify([root,'/components/schemas/Tuple/items'])).digest('hex').slice(0,24);
 const value={openapi:version,info:{title:'Tail owner 雪',version:'business'},paths:{},components:{schemas:{
  Tuple:{type:'array',prefixItems:[{type:'string'}],items:schema,maxItems},Tail:{$ref:'#/components/schemas/Tuple/items'},[stem]:{type:'boolean'}
 }},'x-literal':{items:schema,n:'EXACT',flag:false}};
 const text=(format==='yaml'?'# Keep tail\r\n'+YAML.stringify(value,{aliasDuplicateObjects:false}).replaceAll('\n','\r\n'):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'tail-owner',resources:[{id:root,text,generation:3}],targetVersion:'2.0',destination:'file:///reviewed/'};
 assert.equal(analyse(input).status,'complete');
 const values=['[]','["雪"]','["雪",9007199254740993]','["雪",9007199254740992]','["雪",9007199254740993,9007199254740994]','["雪",9007199254740993,9007199254740994,9007199254740995]','[false]'];
 const evaluate=(capture,container)=>evaluateSchemas({...capture,runtimeInstances:[...values.map(text=>({subject:'response-body',location:'tuple',text,schema:{resource:capture.root,pointer:container+'/Tuple'}})),...['0','9007199254740993','"雪"','null'].map(text=>({subject:'response-body',location:'tail',text,schema:{resource:capture.root,pointer:container+'/Tail'}}))]});
 const before=await evaluate(input,'/components/schemas');assert.equal(before.complete,true,JSON.stringify(before.findings));
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const target={root:result.outputRoot,snapshot:'cold',resources:result.outputs.map(o=>({id:o.id,text:o.text,generation:0}))};assert.equal(analyse(target).status,'complete');
 const after=await evaluate(target,'/definitions');assert.equal(after.complete,true,JSON.stringify(after.findings));assert.deepEqual(after.runtimeEvaluations.map(v=>v.valid),before.runtimeEvaluations.map(v=>v.valid));
 const doc=new SourceDocument(result.outputs.find(o=>o.id===target.root).text,target.root);
 assert.equal(doc.dataJson('/x-literal'),new SourceDocument(text,root).dataJson('/x-literal'));
 assert.equal(doc.dataNode('/definitions/'+stem+'/type').value,'boolean');assert(doc.dataNode('/definitions/'+stem+'_1'));
 assert.equal(input.resources[0].text,text);
});
test('unbounded constrained tuple tails remain an implementation queue item rather than a claimed target impossibility',async()=>{
 const root='file:///approved/api.json',text=JSON.stringify({openapi:'3.1.2',info:{title:'Unbounded tail',version:'1'},paths:{},components:{schemas:{Tuple:{prefixItems:[{type:'string'}],items:{type:'integer'}}}}});
 const result=await planMigration({root,snapshot:'unbounded-tail',resources:[{id:root,text,generation:0}],targetVersion:'2.0',destination:'file:///reviewed/'});
 assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(p=>p.code==='migration.schema.tuple-tail'&&p.reason==='implementation'));
});
