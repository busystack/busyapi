const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {createGraph}=require('./dist/model.cjs');
for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const mode of ['both','then','else','neither','no-if'])test(`${version} ${format} ${mode} conditional lowers with independent captured targets`,async()=>{
 const root='file:///approved/api.'+format,condition={properties:{flag:{enum:[true]}},required:['flag']};
 const schema={type:'object',properties:{flag:{type:'boolean'}},...(mode!=='no-if'?{if:condition}:{}),
  ...(['both','then','no-if'].includes(mode)?{then:{required:['n'],properties:{n:{type:'integer',minimum:'EXACT'}}}}:{}),
  ...(['both','else','no-if'].includes(mode)?{else:{required:['label'],properties:{label:{type:'string',minLength:1}}}}:{})};
 const value={openapi:version,info:{title:'Conditional 雪',version:'api'},paths:{},components:{schemas:{Value:schema,
  ...(mode!=='no-if'?{Condition:{$ref:'#/components/schemas/Value/if'}}:{Inactive:{$ref:'#/components/schemas/Value/then'}})}},'x-kept':{n:'EXACT',if:condition}};
 const text=(format==='yaml'?'# Preserve condition\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'condition-'+mode,resources:[{id:root,text,generation:6}],targetVersion:'3.0.4',destination:'file:///converted/'};
 assert.equal(analyse(input).status,'complete');
 const samples=['{}','{"flag":true}','{"flag":false}','{"flag":true,"n":9007199254740993}','{"flag":true,"n":9007199254740992}','{"flag":false,"label":"雪"}','{"flag":false,"label":""}','null'];
 const evaluate=(capture,pointer)=>evaluateSchemas({...capture,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:capture.root,pointer}}))});
 const before=await evaluate(input,'/components/schemas/Value');assert.equal(before.complete,true,JSON.stringify(before.findings));
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(input.resources[0].text,text);
 const target={root:result.outputRoot,snapshot:'cold',resources:result.outputs.map(o=>({id:o.id,text:o.text,generation:0}))};assert.equal(analyse(target).status,'complete');
 const after=await evaluate(target,'/components/schemas/Value');assert.equal(after.complete,true,JSON.stringify(after.findings));assert.deepEqual(after.runtimeEvaluations.map(v=>v.valid),before.runtimeEvaluations.map(v=>v.valid));
 const selected='/components/schemas/'+(mode==='no-if'?'Inactive':'Condition');
 const independentBefore=await evaluate(input,selected),independentAfter=await evaluate(target,selected);
 assert.equal(independentAfter.complete,true,JSON.stringify(independentAfter.findings));assert.deepEqual(independentAfter.runtimeEvaluations.map(v=>v.valid),independentBefore.runtimeEvaluations.map(v=>v.valid));
 const doc=new SourceDocument(result.outputs.find(o=>o.id===target.root).text,target.root);assert.equal(doc.dataNode('/components/schemas/Value/if'),undefined);assert.equal(doc.dataNode('/components/schemas/Value/then'),undefined);assert.equal(doc.dataNode('/components/schemas/Value/else'),undefined);assert.equal(doc.dataJson('/x-kept'),new SourceDocument(text,root).dataJson('/x-kept'));
});

for(const [mode,targetVersion]of [['true','2.0'],['false','2.0'],['empty','2.0'],['static-false','2.0'],['dynamic-true','2.0'],['true','3.0.4'],['false','3.0.4']])
test(`${mode} constant condition retains independent targets through ${targetVersion}`,async()=>{
 const root='file:///constant-condition/api.yaml',positive=['true','empty','dynamic-true'].includes(mode);
 const condition=mode==='empty'?{}:mode==='static-false'?{$ref:'#/components/schemas/Guard'}:
  mode==='dynamic-true'?{$dynamicRef:'#guard'}:mode==='true';
 const active={type:'object',required:['n'],properties:{n:{type:'integer',enum:[0,'EXACT']},child:{$ref:'#/components/schemas/Value'}},description:'Active 雪'};
 const inactive={type:'object',patternProperties:{'^never':{type:'integer'}},description:'Unselected'};
 const document={openapi:'3.2.1',info:{title:'Constant conditions',version:'1'},paths:{},components:{schemas:{
  Value:{if:condition,then:positive?active:inactive,else:positive?inactive:active},
  Condition:{$ref:'#/components/schemas/Value/if'},Branch:{$ref:'#/components/schemas/Value/'+(positive?'then':'else')},
  ...(mode==='static-false'?{Guard:false}:mode==='dynamic-true'?{Guard:{$dynamicAnchor:'guard'}}:{}),
 }},'x-history':{if:condition,then:inactive,zero:0,flag:false,text:'雪'}};
 const text='# Keep constants\r\n'+YAML.stringify(document,{aliasDuplicateObjects:false}).replaceAll('\n','\r\n').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'constant-condition-'+mode+targetVersion,resources:[{id:root,text,generation:1}],targetVersion,destination:'file:///constant-output/'};
 assert.equal(analyse(input).status,'complete');
 const samples=['{}','{"n":0,"child":{"n":9007199254740993.00}}','{"n":9007199254740992}','false','null'];
 const evaluate=async(packet,pointer)=>{
  const result=await evaluateSchemas({...packet,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
 };
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-constant-condition',resources:review.outputs.map(value=>({id:value.id,text:value.text,generation:0}))};
 assert.equal(analyse(output).status,'complete');const prefix=targetVersion==='2.0'?'/definitions/':'/components/schemas/';
 for(const name of ['Value','Branch','Condition'])assert.deepEqual(await evaluate(output,prefix+name),await evaluate(input,'/components/schemas/'+name),name);
 assert.deepEqual(await evaluate(output,prefix+'Value'),[false,true,false,false,false]);
 const graph=createGraph(output).graph,owner=graph.docs.get(output.root);
 for(const field of ['if','then','else'])assert.equal(owner.dataNode(prefix+'Value/'+field),undefined);
 assert.equal(owner.dataJson('/x-history'),new SourceDocument(text,root).dataJson('/x-history'));
 assert(![...graph.entryScopes()].some(scope=>scope.kind==='schema'&&Object.hasOwn(graph.docs.get(scope.resource).dataNode(scope.pointer).value??{},'patternProperties')));
 if(mode==='dynamic-true'){
  assert(!graph.entryReferences().some(reference=>reference.keyword==='$dynamicRef'));
  assert(graph.entryReferences().some(reference=>reference.keyword==='$ref'&&reference.targetPointer===prefix+'Guard'));
 }
 assert.equal(input.resources[0].text,text);
});

test('an independently consumed inactive assertion remains a precise blocker rather than being discarded',async()=>{
 const root='file:///retained-condition/api.json',document={openapi:'3.2.1',info:{title:'Independent inactive branch',version:'1'},paths:{},components:{schemas:{
  Value:{if:true,then:{type:'string'},else:{type:'object',patternProperties:{'^n':{type:'integer'}}}},
  Independent:{$ref:'#/components/schemas/Value/else'},
 }}};
 const text=JSON.stringify(document),input={root,snapshot:'retained-inactive-condition',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///retained-output/'};
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code==='migration.schema.patternProperties'&&problem.reason==='implementation'));
 assert.equal(input.resources[0].text,text);
});

for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4'])for(const predicate of ['type','enum','const'])
test(`${format} equal conditional branches retain independent owners through ${targetVersion} predicate=${predicate}`,async()=>{
 const root='file:///equal-condition/api.'+format,condition=predicate==='type'?{type:'integer'}:predicate==='enum'?{enum:[0,'EXACT']}:{const:0};
 const branch={enum:[0,'EXACT','snow 雪'],description:'Same branch','x-number':'EXACT'};
 const document={openapi:'3.2.1',info:{title:'Equal conditional',version:'1'},paths:{},components:{schemas:{
  Value:{if:condition,then:branch,else:structuredClone(branch)},
  Condition:{$ref:'#/components/schemas/Value/if'},Then:{$ref:'#/components/schemas/Value/then'},Else:{$ref:'#/components/schemas/Value/else'},
 }},'x-history':{if:condition,then:branch,else:branch}};
 const text=(format==='yaml'?'# Keep equal condition\r\n'+YAML.stringify(document,{aliasDuplicateObjects:false}):JSON.stringify(document))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'equal-'+predicate,resources:[{id:root,text,generation:3}],targetVersion,destination:'file:///equal-output/'};
 assert.equal(analyse(input).status,'complete');
 const samples=['0','9007199254740993','9007199254740992','"snow 雪"','"other"','false','null','{}','[]'];
 const evaluate=async(packet,pointer)=>{
  const result=await evaluateSchemas({...packet,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
 };
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.equal((await planMigration(input)).identity,review.identity);
 const output={root:review.outputRoot,snapshot:'cold-equal',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 assert.equal(analyse(output).status,'complete');const group=targetVersion==='2.0'?'/definitions/':'/components/schemas/';
 for(const name of ['Value','Condition','Then','Else'])assert.deepEqual(await evaluate(output,group+name),await evaluate(input,'/components/schemas/'+name));
 assert.deepEqual(await evaluate(output,group+'Value'),[true,true,false,true,false,false,false,false,false]);
 const doc=createGraph(output).graph.docs.get(output.root);
 for(const field of ['if','then','else'])assert.equal(doc.dataNode(group+'Value/'+field),undefined);
 assert.equal(doc.dataJson('/x-history'),new SourceDocument(text,root).dataJson('/x-history'));
 assert.equal(input.resources[0].text,text);
});

test('equal branches do not discard conditional annotations',async()=>{
 const root='file:///annotated-equal/api.json',branch={type:'integer'},document={openapi:'3.2.1',info:{title:'Conditional annotation',version:'1'},paths:{},
  components:{schemas:{Value:{if:{type:'integer',description:'Applies only to a matching condition'},then:branch,else:branch}}}};
 const text=JSON.stringify(document),review=await planMigration({root,snapshot:'annotated-equal',resources:[{id:root,text,generation:0}],targetVersion:'2.0',destination:'file:///annotated-output/'});
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code==='migration.schema.conditional'&&problem.reason==='implementation'));
});

test('absent if leaves unsupported unconsumed then and else assertions inactive during Swagger conversion',async()=>{
 const root='file:///absent-condition/api.json',document={openapi:'3.2.1',info:{title:'Absent condition',version:'1'},paths:{},components:{schemas:{
  Value:{type:'integer',then:{patternProperties:{'^n':{type:'integer'}}},else:{contains:{type:'integer'}}},
 }}};
 const text=JSON.stringify(document),input={root,snapshot:'absent-conditional',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///absent-output/'};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-absent-condition',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 assert.equal(analyse(output).status,'complete');assert.deepEqual(createGraph(output).graph.docs.get(output.root).dataNode('/definitions/Value').value,{type:'integer'});
 const result=await evaluateSchemas({...output,runtimeInstances:['0','9007199254740993','false','null'].map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:output.root,pointer:'/definitions/Value'}}))});
 assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,true,false,false]);
 assert.equal(input.resources[0].text,text);
});

for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4'])for(const positive of [false,true])
test(`${format} ${targetVersion} composed constant predicates preserve independent children positive=${positive}`,async()=>{
 const root='file:///composed-condition/api.'+format;
 const condition={allOf:[{anyOf:[false,{not:false}]},{oneOf:[true,false]}]};
 if(!positive)condition.allOf.push({not:true});
 const active={type:'integer',enum:[0,'EXACT'],description:'Active branch'};
 const document={openapi:'3.2.1',info:{title:'Composed condition',version:'1'},paths:{},components:{schemas:{
  Value:{if:condition,then:positive?active:{patternProperties:{'^unselected':{contains:{const:0}}}},
   else:positive?{patternProperties:{'^unselected':{contains:{const:0}}}}:active},
  Condition:{$ref:'#/components/schemas/Value/if'},
  Independent:{$ref:'#/components/schemas/Value/if/allOf/0/anyOf/1/not'},
 }},'x-history':{if:condition,exact:'EXACT'}};
 const text=(format==='yaml'?'# Keep composed constants\r\n'+YAML.stringify(document,{aliasDuplicateObjects:false}):JSON.stringify(document))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'composed-'+positive,resources:[{id:root,text,generation:2}],targetVersion,destination:'file:///composed-output/'};
 assert.equal(analyse(input).status,'complete');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.equal(review.identity,(await planMigration(input)).identity);
 const output={root:review.outputRoot,snapshot:'cold-composed-condition',resources:review.outputs.map(resource=>({id:resource.id,text:resource.text,generation:0}))};
 const graph=createGraph(output).graph,group=targetVersion==='2.0'?'/definitions/':'/components/schemas/';
 assert(graph.entryReferences().every(reference=>reference.resolution==='resolved'));
 const samples=['0','9007199254740993','9007199254740992','"snow 雪"','null','{}','[]'];
 for(const name of ['Value','Condition','Independent']){
  const evaluate=async(packet,pointer)=>{
   const result=await evaluateSchemas({...packet,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer}}))});
   assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
  };
  assert.deepEqual(await evaluate(output,group+name),await evaluate(input,'/components/schemas/'+name),name);
 }
 assert.equal(graph.docs.get(output.root).dataJson('/x-history'),new SourceDocument(text,root).dataJson('/x-history'));
 assert.equal(input.resources[0].text,text);
});

for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4'])for(const present of [false,true])
test(`${format} ${targetVersion} inactive descendant reference closure retains children without activating the containing assertion present=${present}`,async()=>{
 const root='file:///inactive-descendants/api.'+format,child='/components/schemas/Value/'+(present?'else':'then')+'/properties';
 const branch={patternProperties:{'^unselected':{contains:{const:0}}},properties:{
  Kept:{type:'object',properties:{n:{$ref:'#'+child+'/Number'}},description:'Retain descendant'},
  Number:{type:'integer',enum:[0,'EXACT']},
 }};
 const document={openapi:'3.2.1',info:{title:'Inactive descendants',version:'1'},paths:{},components:{schemas:{
  Value:present?{type:'integer',if:true,then:{minimum:0},else:branch}:{type:'integer',then:branch},
  Independent:{$ref:'#'+child+'/Kept'},
 }},'x-history':branch};
 const text=(format==='yaml'?'# Keep inactive descendants\r\n'+YAML.stringify(document,{aliasDuplicateObjects:false}):JSON.stringify(document))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'descendant-condition-'+present,resources:[{id:root,text,generation:5}],targetVersion,destination:'file:///inactive-descendants-output/'};
 assert.equal(analyse(input).status,'complete');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-descendants',resources:review.outputs.map(resource=>({id:resource.id,text:resource.text,generation:0}))};
 const group=targetVersion==='2.0'?'/definitions/':'/components/schemas/',graph=createGraph(output).graph;
 assert(graph.entryReferences().every(reference=>reference.resolution==='resolved'));
 for(const name of ['Value','Independent']){
  const samples=['0','-1','9007199254740993','null','{}','{"n":0}','{"n":9007199254740993}','{"n":9007199254740992}'];
  const evaluate=async(packet,pointer)=>{
   const result=await evaluateSchemas({...packet,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer}}))});
   assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
  };
  assert.deepEqual(await evaluate(output,group+name),await evaluate(input,'/components/schemas/'+name),name);
 }
 assert.equal(graph.docs.get(output.root).dataJson('/x-history'),new SourceDocument(text,root).dataJson('/x-history'));
 assert.equal(input.resources[0].text,text);
});

for(const predicate of [{not:{description:'Conditional annotation'}},{anyOf:[true,{description:'Successful conditional annotation'}]}])
test('composed constant-like predicates retain their annotation blocker',async()=>{
 const root='file:///constant-annotation/api.json',text=JSON.stringify({openapi:'3.2.1',info:{title:'Annotations',version:'1'},paths:{},
  components:{schemas:{Value:{if:predicate,then:{type:'integer'},else:{type:'string'}}}}});
 const review=await planMigration({root,snapshot:'constant-annotation',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///constant-annotation-output/'});
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.reason==='implementation'));
});
