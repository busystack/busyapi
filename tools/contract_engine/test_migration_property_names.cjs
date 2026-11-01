const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {createHash}=require('node:crypto');
const {planMigration}=require('./dist/migration.cjs'),{analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const controls={
 enum:{enum:['','a/~雪','__proto__',0,false,null]},
 const:{const:'a/~雪'}, intersection:{type:['string','integer'],enum:['a/~雪','other',0],const:'a/~雪'},
 impossible:{enum:['a/~雪'],const:'other'}, nonString:{type:'integer'},
 true:true,false:false,empty:{},
};
for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])
for(const targetVersion of ['2.0','3.0.0','3.0.1','3.0.2','3.0.3','3.0.4'])
test(`${version} ${format} finite property names retain assertions, independent references and literals in ${targetVersion}`,async()=>{
 const root='file:///approved/api.'+format,schemas={};
 const stem='_migrated_property_names_'+createHash('sha256').update(JSON.stringify([root,'/components/schemas/enum/propertyNames'])).digest('hex').slice(0,24);
 for(const [name,propertyNames]of Object.entries(controls)){
  schemas[name]={propertyNames,properties:{'a/~雪':{type:'integer',minimum:'EXACT'}},additionalProperties:{type:'integer'},allOf:[{maxProperties:2}]};
  schemas[name+'Names']={$ref:'#/components/schemas/'+name+'/propertyNames'};
 }
 schemas[stem]={type:'boolean'};
 const value={openapi:version,info:{title:'Name restrictions 雪',version:'business'},paths:{},components:{schemas},'x-literal':controls};
 const text=(format==='yaml'?'# Keep names\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'finite-names',resources:[{id:root,text,generation:3}],targetVersion,destination:'file:///reviewed/'};
 assert.equal(analyse(input).status,'complete');
 const samples=['{}','{"a/~雪":9007199254740993}','{"a/~雪":9007199254740992}','{"":0}','{"__proto__":0}','{"other":0}','{"a/~雪":"bad"}','[]','null','false','0','"a/~雪"','"other"'];
 const evaluate=(capture,container)=>evaluateSchemas({...capture,runtimeInstances:Object.keys(controls).flatMap(name=>[name,name+'Names'].flatMap(name=>samples.map(text=>({subject:'response-body',location:name,text,schema:{resource:capture.root,pointer:container+'/'+name}}))))});
 const before=await evaluate(input,'/components/schemas');assert.equal(before.complete,true,JSON.stringify(before.findings));
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const target={root:result.outputRoot,snapshot:'cold',resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 assert.equal(analyse(target).status,'complete');
 const after=await evaluate(target,targetVersion==='2.0'?'/definitions':'/components/schemas');assert.equal(after.complete,true,JSON.stringify(after.findings));
 assert.deepEqual(after.runtimeEvaluations.map(proof=>proof.valid),before.runtimeEvaluations.map(proof=>proof.valid));
 const doc=new SourceDocument(target.resources.find(resource=>resource.id===target.root).text,target.root),container=targetVersion==='2.0'?'/definitions':'/components/schemas';
 assert.equal(doc.dataJson('/x-literal'),new SourceDocument(text,root).dataJson('/x-literal'));
 assert.equal(doc.dataNode(container+'/'+stem+'/type').value,'boolean');assert(doc.dataNode(container+'/'+stem+'_1'));
 assert.equal(doc.dataNode(container+'/enum/propertyNames'),undefined);assert.equal(input.resources[0].text,text);
});
for(const propertyNames of [{pattern:'^a'}, {enum:['a'],description:'Name annotation'}, {enum:['a'],'x-kept':false}])
test(`general or annotated property-name schemas retain a specific implementation blocker ${JSON.stringify(propertyNames)}`,async()=>{
 const root='file:///approved/api.json',text=JSON.stringify({openapi:'3.2.1',info:{title:'Names',version:'1'},paths:{},components:{schemas:{Model:{propertyNames}}}});
 const result=await planMigration({root,snapshot:'name-blocker',resources:[{id:root,text,generation:0}],targetVersion:'3.0.4',destination:'file:///reviewed/'});
 assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.code==='migration.schema.propertyNames'&&problem.reason==='implementation'));
});
test('a literal enum member independently used as a boolean schema retains its ownership blocker',async()=>{
 const root='file:///approved/api.json',text=JSON.stringify({openapi:'3.2.1',info:{title:'Dual name data',version:'1'},paths:{},components:{schemas:{
  Model:{propertyNames:{enum:['a',false]}},False:{$ref:'#/components/schemas/Model/propertyNames/enum/1'}
 }}});
 const input={root,snapshot:'dual-name-data',resources:[{id:root,text,generation:0}],targetVersion:'3.0.4',destination:'file:///reviewed/'};
 assert.equal(analyse(input).status,'complete');
 const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
 assert(result.problems.some(problem=>problem.code==='migration.schema.property-name-owner'&&problem.reason==='implementation'));
 assert.equal(input.resources[0].text,text);
});
