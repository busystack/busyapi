const {test}=require('node:test'),assert=require('node:assert/strict');
const {analyse,createGraph}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {requestOperation}=require('./dist/execution.cjs');
const {planMigration}=require('./dist/migration.cjs');
const a='file:///entries/a.json',b='file:///entries/b.json',model='file:///entries/model.json';
function fixture(){
 const doc=(version,name)=>({openapi:version,info:{title:name,version:'1'},paths:{'/p':{get:{responses:{200:{description:'Value',content:{'application/json':{schema:{$ref:'#/components/schemas/Model'}}}}}}}},
  security:[{[name]:[]}],components:{schemas:{Model:{$ref:'model.json#/Value'}},securitySchemes:{[name]:{type:'apiKey',in:'header',name:'X-'+name}},examples:{
   Entry:name==='A'?{$ref:'b.json#/components/examples/Entry'}:{value:'B'},
  }}});
 return {root:a,snapshot:'entry-contexts',resources:[{id:a,text:JSON.stringify(doc('3.0.4','A')),generation:0},
  {id:b,text:JSON.stringify(doc('3.2.1','B')),generation:0},{id:model,text:'{"Value":{"type":"string","nullable":true}}',generation:0}]};
}
test('each captured entry retains native family, namespace and shared-fragment behavior without activating unrelated foreign branches',async()=>{
 const input=fixture(),original=input.resources.map(resource=>resource.text);
 for(const [root,nullable,name]of [[a,true,'A'],[b,false,'B']]){
  const packet={...input,root},graph=createGraph(packet).graph;
  assert.equal(graph.specifications.size,2,'All declaration and resource identities remain captured');
  assert.equal(graph.isEntryUse(graph.scopeAs(root,'/components/schemas/Model','schema')),true);
  assert.equal(graph.isEntryUse(graph.scopeAs(root===a?b:a,'/components/schemas/Model','schema')),false);
  const analysis=analyse(packet);assert.equal(analysis.status,'complete',JSON.stringify(analysis.findings));
  const plan=requestOperation({...packet,resource:root,pointer:'/paths/~1p/get'});
  assert.equal(plan.security.schemes[name].parameterName,'X-'+name);
  const evaluated=await evaluateSchemas({...packet,runtimeInstances:['null','"雪"','0'].map(text=>({subject:'response-body',location:text,text,schema:plan.responses[0].content[0].schema}))});
  assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.runtimeEvaluations.map(value=>value.valid),[nullable,true,false]);
 }
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
});
test('unused foreign failures remain active for their own root, explicit maintenance and whole-project migration',async()=>{
 const input=fixture(),foreign=JSON.parse(input.resources[1].text),pointer='/components/schemas/Bad';
 foreign.components.schemas.Bad={$ref:'missing.json'};input.resources[1].text=JSON.stringify(foreign);
 assert.equal(analyse(input).status,'complete');
 assert(analyse({...input,root:b}).findings.some(finding=>finding.resource===b&&finding.pointer===pointer+'/$ref'&&finding.code==='reference.unavailable'));
 const selected=createGraph({...input,occurrences:[{resource:b,pointer,kind:'schema'}]});
 assert(selected.graph.issues.some(issue=>issue.resource===b&&issue.pointer===pointer+'/$ref'));
 const review=await planMigration({...input,targetVersion:'3.2.1',destination:'file:///delivered/entries/'});
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.resource===b&&problem.pointer===pointer+'/$ref'&&problem.code.startsWith('migration.validation.')));
});
test('complete identity discovery retains a referenced resource in a foreign document without activating its unrelated failures',async()=>{
 const input=fixture();input.resources[0].text=input.resources[0].text.replace('3.0.4','3.2.1');
 const primary=JSON.parse(input.resources[0].text),foreign=JSON.parse(input.resources[1].text),identity='https://schemas.invalid/known';
 primary.components.schemas.Model={$ref:identity};foreign.components.schemas.Target={$id:identity,type:'integer',enum:[7]};
 foreign.components.schemas.Bad={$ref:'missing.json'};
 input.resources[0].text=JSON.stringify(primary);input.resources[1].text=JSON.stringify(foreign);
 const graph=createGraph(input).graph,reference=graph.referenceAs(a,'/components/schemas/Model','$ref','schema');
 assert.equal(reference.resolution,'resolved');assert.equal(reference.targetResource,b);assert.equal(reference.targetPointer,'/components/schemas/Target');
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));
 const evaluated=await evaluateSchemas({...input,runtimeInstances:['7','0'].map(text=>({subject:'response-body',location:text,text,schema:{resource:a,pointer:'/components/schemas/Model'}}))});
 assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.runtimeEvaluations.map(value=>value.valid),[true,false]);
 primary.components.schemas.Collision={$id:identity,type:'string'};input.resources[0].text=JSON.stringify(primary);
 const ambiguous=analyse(input);assert.notEqual(ambiguous.status,'complete');
 assert(ambiguous.findings.some(finding=>finding.resource===a&&finding.pointer==='/components/schemas/Model/$ref'&&finding.code==='reference.ambiguous'));
});

test('an independent native schema does not activate a physical containing schema resource with another base or dialect',async()=>{
 const root='file:///entries/native.json',raw='file:///entries/response.json',pointer='/$defs/Response/content/application~1json/schema';
 const input={root,snapshot:'native-resource-entry',resources:[{id:root,text:JSON.stringify({openapi:'3.2.1',info:{title:'Native use',version:'1'},
  paths:{'/p':{get:{responses:{200:{$ref:'response.json#/$defs/Response'}}}}}}),generation:0},
  {id:raw,text:JSON.stringify({$id:'https://schemas.invalid/independent',$schema:'https://json-schema.org/draft/2020-12/schema',type:7,
   $defs:{Response:{description:'Native',content:{'application/json':{schema:{type:'integer',enum:[7]}}}}}}),generation:0}]};
 const graph=createGraph(input).graph;
 assert.equal(graph.isEntryUse(graph.scopeAs(raw,'','schema')),false);
 assert.equal(graph.isEntryUse(graph.scopeAs(raw,pointer,'schema')),true);
 const analysis=analyse(input);assert.equal(analysis.status,'complete',JSON.stringify(analysis.findings));
 const result=await evaluateSchemas({...input,runtimeInstances:['7','0'].map(text=>({subject:'response-body',location:text,text,schema:{resource:raw,pointer}}))});
 assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);
});
