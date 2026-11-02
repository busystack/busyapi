const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {analyse,createGraph}=require('./dist/model.cjs');
const {planMigration}=require('./dist/migration.cjs');
const {requestOperation}=require('./dist/execution.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');

const root='file:///entries/legacy.json',other='file:///entries/modern.json',models='file:///entries/models.json',headers='file:///entries/headers.json';
function fixture(format,recursive){
 const entry=(version,name)=>({openapi:version,info:{title:name,version:'business'},paths:{'/p':{post:{
  requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/Model'}}}},
  responses:{200:{description:'Response',headers:{'X-Name':{$ref:'headers.json#/Header'}},content:{'application/json':{schema:{$ref:'#/components/schemas/Model'}}}}}}},
  components:{schemas:{Model:{$ref:'models.json#/Forward'}}}});
 const node=recursive?{type:'array',items:{$ref:'#/Node'},nullable:true}:{type:'string',minLength:1,nullable:true};
 const values=[entry('3.0.4','Legacy'),entry('3.2.1','Modern'),
  {Forward:{$ref:'#/Node'},Node:{...node,description:'[Guide](guide.md)'},'x-literal':{$ref:'literal-only',zero:0,empty:'',flag:false}},
  {Header:{description:'[Header](headers.md)',schema:{type:'string',minLength:1}}}];
 const ids=[root,other,models,headers].map(id=>id.replace(/\.json$/,'.'+format));
 return {root:ids[0],snapshot:'entry-owned-'+format+recursive,targetVersion:'3.2.1',destination:'file:///delivered/entries/',resources:values.map((value,index)=>({
  id:ids[index],generation:index+1,text:(format==='yaml'?'# Keep source 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
   .replaceAll('models.json','models.'+format).replaceAll('headers.json','headers.'+format),
 }))};
}
async function check(packet,root,recursive,nullable){
 const input={...packet,root},analysis=analyse(input);assert.equal(analysis.status,'complete',JSON.stringify(analysis.findings));
 const plan=requestOperation({...input,resource:root,pointer:'/paths/~1p/post'});
 assert.equal(plan.responses[0].headers[0].name,'X-Name');
 const samples=recursive?['null','[]','[[]]','[null]','[0]']:['null','"雪"','""','false'];
 const expected=recursive?[nullable,true,true,nullable,false]:[nullable,true,false,false];
 const evaluated=await evaluateSchemas({...input,runtimeInstances:[
  ...samples.map(text=>({subject:'response-body',location:text,text,schema:plan.responses[0].content[0].schema})),
  ...samples.map(text=>({subject:'request-body',location:text,text,schema:plan.requestBody.content[0].schema})),
 ]});
 assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.runtimeEvaluations.map(value=>value.valid),[...expected,...expected]);
}
for(const format of ['yaml','json'])for(const recursive of [false,true])
test(`${format} entry-dependent ${recursive?'recursive':'scalar'} schemas, forwarders and Headers receive independent common owners`,async()=>{
 const input=fixture(format,recursive),before=input.resources.map(resource=>resource.text);
 await check(input,input.root,recursive,true);await check(input,input.resources[1].id,recursive,false);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0})),snapshot:'cold-entry-owners'};
 for(const [source,nullable]of [[input.root,true],[input.resources[1].id,false]]){
  const output=review.changes.find(change=>change.resource===source).destination;
  await check(cold,output,recursive,nullable);
  const graph=createGraph({...cold,root:output}).graph;
  for(const reference of graph.references)if(reference.resolution==='resolved')assert(cold.resources.some(resource=>resource.id===reference.targetResource));
 }
 for(const resource of input.resources.slice(2)){
  const output=review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===resource.id).destination);
  assert.equal(output.text,resource.text,'Detached original fragments retain exact source values and comments');
 }
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
 const repeated=await planMigration(input);assert.equal(repeated.complete,true,JSON.stringify(repeated.problems));
 assert.deepEqual(repeated.outputs,review.outputs,'Owner names and selected consumers are deterministic');
});

test('entry variants retain precise identity guards rather than globally rewriting an identified shared resource',async()=>{
 const input=fixture('json',false),value=JSON.parse(input.resources[2].text);
 value.Node.$id='https://schemas.invalid/shared';value.Node.$dynamicAnchor='node';
 // Both entries use modern semantics, so the source resource is valid in
 // both dialects. Its declaration is still one shared physical identity.
 input.resources[0].text=input.resources[0].text.replace('3.0.4','3.1.2');
 input.resources[2].text=JSON.stringify(value);
 const before=input.resources.map(resource=>resource.text),result=await planMigration(input);
 assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
 const problem=result.problems.find(problem=>problem.code==='migration.owners.entry-resource');
 assert(problem,JSON.stringify(result.problems));assert.equal(problem.reason,'implementation');assert(problem.range[1]>problem.range[0]);
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

test('a specialized fragment selects its captured dialect instead of inheriting an entry override',async()=>{
 const input=fixture('json',false),legacy=JSON.parse(input.resources[0].text);
 legacy.openapi='3.1.2';legacy.jsonSchemaDialect='https://json-schema.org/draft/2020-12/schema';
 input.resources[0].text=JSON.stringify(legacy);
 await check(input,input.root,false,false);
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const output=result.changes.find(change=>change.resource===input.root).destination;
 const packet={root:output,resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0})),snapshot:'cold-entry-dialect'};
 await check(packet,output,false,false);
 const graph=createGraph(packet).graph,first=graph.referenceAs(output,'/components/schemas/Model','$ref','schema');
 const scope=graph.scopeAs(first.targetResource,first.targetPointer,'schema');
 assert.equal(scope.dialect,'https://spec.openapis.org/oas/3.1/dialect/base');
 assert.equal(graph.docs.get(scope.resource).dataNode(scope.pointer+'/$schema').value,scope.dialect);
});
