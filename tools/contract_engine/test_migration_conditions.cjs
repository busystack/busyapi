const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {createGraph}=require('./dist/model.cjs');
const {evaluateMigrationAnnotations}=require('./dist/migration_annotations.cjs');
for(const format of ['yaml','json'])for(const mode of ['dominated','inactive-metadata','terminal-conjunct','native-annotations'])
test(`${format} ${mode} logical branch applications compose through their native guard`,async()=>{
 const root='file:///logical-application/api.'+format;
 const body=mode==='native-annotations'?{type:'object',anyOf:[{properties:{a:{description:'Present a'}}},{properties:{b:{description:'Present b'}}}]}:
  mode==='terminal-conjunct'?{allOf:[{type:'object'}]}:{type:'array',items:{type:'integer',description:'Applied item'},
  [mode==='inactive-metadata'?'oneOf':'anyOf']:mode==='inactive-metadata'?
   [{type:'object',description:'Independent object branch'},{type:'array',maxItems:4}]:[{maxItems:2},{maxItems:4}]};
 const document={openapi:'3.2.1',info:{title:'Logical application guards',version:'1'},paths:{},components:{schemas:{
  Value:{if:{type:mode==='native-annotations'?'object':'array'},then:body},Independent:{$ref:'#/components/schemas/Value/then'},
  ...(mode==='inactive-metadata'?{Inactive:{$ref:'#/components/schemas/Value/then/oneOf/0'}}:{}),
 }}};
 const text=format==='yaml'?YAML.stringify(document):JSON.stringify(document);
 const input={root,snapshot:'logical-applications',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///logical-application-output/'};
 const samples=['null','false','{}','[]','[0]','[0,1,2]','[0,1,2,3,4]','[false]','{"a":false,"b":0}'];
 const evaluate=async(packet,prefix)=>{
  const result=await evaluateMigrationAnnotations({...packet,runtimeInstances:Object.keys(document.components.schemas).flatMap(name=>samples.map(text=>({
   subject:'response-body',text,location:name,schema:{resource:packet.root,pointer:prefix+'/'+name}})))});
  assert.equal(result.checked.complete,true,JSON.stringify(result.checked.findings));assert(result.checked.runtimeEvaluations.every(value=>value.complete));
  return {valid:result.checked.runtimeEvaluations.map(value=>value.valid),annotations:result.annotations};
 };
 const before=await evaluate(input,'/components/schemas');
 assert.deepEqual(before.valid.slice(0,8),mode==='native-annotations'?Array(8).fill(true):mode==='terminal-conjunct'?[true,true,true,false,false,false,false,false]:[true,true,true,true,true,true,false,false]);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-logical-applications',resources:review.outputs.map(value=>({...value,generation:0}))};
 assert.deepEqual(await evaluate(output,'/definitions'),before);assert.equal(input.resources[0].text,text);
});
for(const format of ['yaml','json'])test(`${format} contextual logical predicates retain successful metadata and independent unused children`,async()=>{
 const root='file:///contextual-predicate/api.'+format;
 const document={openapi:'3.2.1',info:{title:'Contextual annotation',version:'1'},paths:{},components:{schemas:{
  Value:{type:'object',if:{not:{type:'array',description:'Independent array'},description:'Only successful objects'}},
  Child:{$ref:'#/components/schemas/Value/if/not'},
 }}};
 const text=format==='yaml'?YAML.stringify(document):JSON.stringify(document);
 const input={root,snapshot:'contextual-predicate',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///contextual-predicate-output/'};
 const evaluate=async(packet,prefix)=>{
  const result=await evaluateMigrationAnnotations({...packet,runtimeInstances:['Value','Child'].flatMap(name=>['{}','[]','null','0'].map(text=>({
   subject:'response-body',text,location:name,schema:{resource:packet.root,pointer:prefix+'/'+name}})))});
  assert.equal(result.checked.complete,true,JSON.stringify(result.checked.findings));assert(result.checked.runtimeEvaluations.every(value=>value.complete));
  return {valid:result.checked.runtimeEvaluations.map(value=>value.valid),annotations:result.annotations};
 };
 const before=await evaluate(input,'/components/schemas');assert.deepEqual(before.valid,[true,false,false,false,false,true,false,false]);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-contextual',resources:review.outputs.map(value=>({...value,generation:0}))};
 assert.deepEqual(await evaluate(output,'/definitions'),before);assert.equal(input.resources[0].text,text);
});
for(const selector of ['presence','not-array','one-of'])test(`an outer dependency trigger remains distinct from its ${selector} inner predicate`,async()=>{
 const root='file:///joined-predicates/api.json';
 const predicate=selector==='presence'?{required:['c']}:selector==='not-array'?{not:{type:'array'}}:{oneOf:[{type:'array'},{type:'object'}]};
 const then=selector==='presence'?{properties:{c:{type:'boolean',description:'Only present c'}}}:{required:['b'],properties:{b:{type:'boolean',description:'Selected b'}}};
 const body={type:'object',required:['a'],if:predicate,then,else:{},properties:{a:{type:'boolean'}}};
 const text=JSON.stringify({openapi:'3.2.1',info:{title:'Separate guards',version:'1'},paths:{},components:{schemas:{
  Value:{required:['a'],dependentSchemas:{a:body}},Independent:{$ref:'#/components/schemas/Value/dependentSchemas/a'},
  Then:{$ref:'#/components/schemas/Value/dependentSchemas/a/then'},
 }}});
 const input={root,snapshot:'joined-predicates',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///joined-predicates-output/'};
 const samples=['null','[]','{}','{"a":false}','{"a":false,"c":false}','{"a":false,"c":0}',
  '{"a":false,"b":true}','{"a":false,"b":0}','{"c":false}'];
 const evaluate=async(packet,prefix)=>{
  const result=await evaluateMigrationAnnotations({...packet,runtimeInstances:['Value','Independent','Then'].flatMap(name=>samples.map(text=>({
   subject:'response-body',text,location:name,schema:{resource:packet.root,pointer:prefix+'/'+name}})))});
  assert.equal(result.checked.complete,true,JSON.stringify(result.checked.findings));assert(result.checked.runtimeEvaluations.every(value=>value.complete));
  return {valid:result.checked.runtimeEvaluations.map(value=>value.valid),annotations:result.annotations};
 };
 const before=await evaluate(input,'/components/schemas');
 assert.deepEqual(before.valid.slice(0,9),selector==='presence'?[true,true,false,true,true,false,true,true,false]:[true,true,false,false,false,false,true,false,false]);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-joined-predicates',resources:review.outputs.map(value=>({...value,generation:0}))};
 assert.deepEqual(await evaluate(output,'/definitions'),before);assert.equal(input.resources[0].text,text);
});
for(const dependency of ['dependentRequired','dependentSchemas'])for(const finite of [false,true])for(const composed of [false,true])
test(`guarded ${dependency} retains its native object conjunction, finite=${finite}, composed=${composed}`,async()=>{
 const dependencyMap=dependency==='dependentRequired'?{a:['b']}:{a:{type:'object',required:['b']}};
 const branch={type:'object',...(composed?{allOf:[{required:['a']},{[dependency]:dependencyMap}]}:{required:['a'],[dependency]:dependencyMap}),
  ...(finite?{properties:{a:{type:'boolean'},b:{type:'boolean'}},additionalProperties:false}:{})};
 const root='file:///remaining-guard/api.json',document={openapi:'3.2.1',info:{title:'Guarded dependency',version:'1'},paths:{},components:{schemas:{
  Value:{if:{type:'object'},then:branch},
 }}};
 const input={root,snapshot:'remaining-guard-'+dependency,resources:[{id:root,text:JSON.stringify(document),generation:1}],targetVersion:'2.0',destination:'file:///remaining-guard-output/'};
 const values=['null','false','[]','{}','{"a":false}','{"a":false,"b":false}','{"a":false,"b":0}'];
 const evaluate=async(packet,pointer)=>{
  const result=await evaluateSchemas({...packet,runtimeInstances:values.map(text=>({subject:'response-body',text,location:dependency,schema:{resource:packet.root,pointer}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
 };
 const before=await evaluate(input,'/components/schemas/Value');assert.deepEqual(before,[true,true,true,false,false,true,!finite]);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-guard',resources:review.outputs.map(value=>({...value,generation:0}))};
 assert.deepEqual(await evaluate(output,'/definitions/Value'),before);
});
for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4'])
test(`${format} ${targetVersion} an externally retained inactive descendant is converted at its mapped material coordinate`,async()=>{
 const root='file:///external-inactive/api.'+format,model='file:///external-inactive/model.yaml';
 const document={openapi:'3.2.1',info:{title:'Retained external branch',version:'1'},paths:{},components:{schemas:{
  Value:{$ref:'./model.yaml#/$defs/Value'},Independent:{$ref:'./model.yaml#/$defs/Value/else/properties/Kept'},
 }}};
 const text=format==='yaml'?YAML.stringify(document):JSON.stringify(document),external='$schema: https://json-schema.org/draft/2020-12/schema\r\n'+
  '$id: model.yaml\r\n$defs:\r\n  Value:\r\n    if: true\r\n    then: {type: string}\r\n    else:\r\n'+
  '      contains: {const: unused}\r\n      properties:\r\n        Kept: {type: integer, const: 9007199254740993.00}\r\n'+
  'x-kept: &literal {n: 9007199254740993.00, flag: false}\r\nx-alias: *literal\r\n';
 const input={root,snapshot:'external-inactive',resources:[{id:root,text,generation:1},{id:model,text:external,generation:2}],targetVersion,destination:'file:///external-inactive-output/'};
 const values=['null','{}','"snow 雪"','9007199254740993','9007199254740992'];
 const evaluate=async(packet,prefix)=>{
  const result=await evaluateSchemas({...packet,runtimeInstances:['Value','Independent'].flatMap(name=>values.map(text=>({
   subject:'response-body',text,location:name,schema:{resource:packet.root,pointer:prefix+'/'+name}})))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert(result.runtimeEvaluations.every(value=>value.complete));return result.runtimeEvaluations.map(value=>value.valid);
 };
 const before=await evaluate(input,'/components/schemas'),review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-inactive',resources:review.outputs.map(value=>({...value,generation:0}))};
 assert.deepEqual(await evaluate(output,targetVersion==='2.0'?'/definitions':'/components/schemas'),before);
 assert.deepEqual(before,[false,false,true,false,false,false,false,false,true,false]);
 assert(review.outputs.some(value=>value.text.includes('x-alias: *literal')));assert.equal(input.resources[1].text,external);
});
for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4'])
for(const field of ['minimum','exclusiveMinimum','maximum','exclusiveMaximum','minLength','maxLength','minItems','maxItems','minProperties','maxProperties'])
test(`${format} ${targetVersion} referenced ${field} predicates retain exact scalar/count complements`,async()=>{
 const root='file:///condition-complement/api.'+format,numeric=/minimum|maximum/i.test(field);
 const document={openapi:'3.2.1',info:{title:'Complements',version:'1'},paths:{},components:{schemas:{
  Value:{if:{$ref:'#/components/schemas/Guard'},then:false,else:{description:'Complement branch'}},
  Guard:{[field]:numeric?'EXACT':1},Branch:{$ref:'#/components/schemas/Value/else'},
 }},'x-literal':{[field]:'EXACT'}};
 const text=(format==='yaml'?YAML.stringify(document):JSON.stringify(document)).replace(/"?EXACT"?/g,'9007199254740993.00');
 const input={root,snapshot:'complement-'+field,resources:[{id:root,text,generation:1}],targetVersion,destination:'file:///condition-complement-output/'};
 const values=['null','false','{}','{"a":0}','{"a":0,"b":false}','[]','[0]','[0,false]','""','"x"','"xy"',
  '9007199254740992','9007199254740993','9007199254740994'];
 const evaluate=async(packet,prefix)=>{
  const result=await evaluateMigrationAnnotations({...packet,runtimeInstances:['Value','Guard','Branch'].flatMap(name=>values.map(text=>({
   subject:'response-body',location:name,text,schema:{resource:packet.root,pointer:prefix+'/'+name}})))});
  assert.equal(result.checked.complete,true,JSON.stringify(result.checked.findings));
  assert(result.checked.runtimeEvaluations.every(value=>value.complete));
  return {valid:result.checked.runtimeEvaluations.map(value=>value.valid),annotations:result.annotations};
 };
 const before=await evaluate(input,'/components/schemas'),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-complement',resources:review.outputs.map(value=>({id:value.id,text:value.text,generation:0}))};
 assert.deepEqual(await evaluate(output,targetVersion==='2.0'?'/definitions':'/components/schemas'),before);
 assert(before.valid.slice(0,values.length).some(Boolean));assert(before.valid.slice(0,values.length).some(value=>!value));
 assert.equal(input.resources[0].text,text);
});
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

test('branches that force the predicate retain its annotations through Swagger reduction',async()=>{
 const root='file:///annotated-equal/api.json',branch={type:'integer'},document={openapi:'3.2.1',info:{title:'Conditional annotation',version:'1'},paths:{},
  components:{schemas:{Value:{if:{type:'integer',description:'Applies only to a matching condition'},then:branch,else:branch}}}};
 const text=JSON.stringify(document),review=await planMigration({root,snapshot:'annotated-equal',resources:[{id:root,text,generation:0}],targetVersion:'2.0',destination:'file:///annotated-output/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert(review.outputs.some(output=>output.text.includes('Applies only to a matching condition')));
});

test('absent if leaves unsupported unconsumed then and else assertions inactive during Swagger conversion',async()=>{
 const root='file:///absent-condition/api.json',document={openapi:'3.2.1',info:{title:'Absent condition',version:'1'},paths:{},components:{schemas:{
  Value:{type:'integer',then:{patternProperties:{'^n':{type:'integer'}}},else:{contains:{type:'integer'}}},
 }}};
 const text=JSON.stringify(document),input={root,snapshot:'absent-conditional',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///absent-output/'};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-absent-condition',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 assert.equal(analyse(output).status,'complete');assert.deepEqual(JSON.parse(createGraph(output).graph.docs.get(output.root).dataJson('/definitions/Value')),{type:'integer'});
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
test('annotation-aware constant predicates preserve selection through Swagger',async()=>{
 const root='file:///constant-annotation/api.json',text=JSON.stringify({openapi:'3.2.1',info:{title:'Annotations',version:'1'},paths:{},
  components:{schemas:{Value:{if:predicate,then:{type:'integer'},else:{type:'string'}}}}});
 const review=await planMigration({root,snapshot:'constant-annotation',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///constant-annotation-output/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));
});

const conditionalVersions=['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
const conditionalSamples=['null','false','0','"x"','"雪雪"','[]','{}','{"flag":true}',
 '{"value":"snow 雪"}','{"value":false}','{"flag":true,"value":"snow 雪"}',
 '{"flag":true,"value":9007199254740993}','{"flag":true,"value":9007199254740992}',
 '{"flag":false,"label":"雪"}','{"flag":false,"label":0}','"prefix"'];
for(const version of conditionalVersions)for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4'])
for(const mode of ['domain','presence','guarded-domain','guarded-presence','guarded-nonobject','inactive-array','inert-array','inactive-dependency','forced','negative','finite','if-only'])
test(`${version} ${format} ${targetVersion} nonconstant ${mode} preserves selection, annotations and independent owners`,async()=>{
 const root='file:///bounded-condition/api.'+format;
 const schema=mode==='inert-array'?{if:{type:'object'},then:{prefixItems:[{type:'string',enum:['prefix'],description:'Retained prefix'}],items:{type:'integer'}}}:
  mode==='inactive-dependency'?{if:{type:'string'},then:{type:'string',minLength:2,dependentRequired:{flag:['value']},
   dependentSchemas:{flag:{properties:{flag:{type:'boolean',description:'Independent dependency value'}}}}}}:
  mode==='inactive-array'?{if:{type:'object'},then:{required:['value'],properties:{value:{type:'integer',description:'Selected object value'}},prefixItems:[{type:'string'}],items:{type:'integer'}}}:
  mode==='guarded-domain'?{if:{type:'object'},then:{type:'object',required:['value'],properties:{value:{type:'integer',minimum:'EXACT',description:'Selected object value'}}}}:
  mode==='guarded-presence'?{if:{required:['flag']},then:{type:'object',required:['flag'],properties:{flag:{type:'boolean',description:'Present guarded flag'}}}}:
  mode==='guarded-nonobject'?{if:{required:['flag']},then:{type:'array',items:{type:'integer'}}}:
  mode==='domain'?{if:{type:'object'},then:{properties:{value:{type:'string',description:'Selected field'}}}}:
  mode==='presence'?{if:{required:['flag']},then:{properties:{flag:{type:'boolean',description:'Present flag'}}}}:
  mode==='forced'?{type:'object',required:['flag'],if:{required:['flag']},
   then:{properties:{value:{type:'string',description:'Forced branch'}}},else:{contains:{const:'unused'}}}:
  mode==='negative'?{if:{required:['flag']},then:false,else:{properties:{value:{type:'string',description:'Negative branch'}}}}:
  mode==='if-only'?{if:{allOf:[{type:'integer'},{minimum:0}]}}:
  {type:'object',properties:{flag:{type:'boolean'},value:{type:'integer'},label:{}},
   enum:[{flag:true,value:'EXACT'},{flag:true,value:9007199254740992},{flag:true},{flag:false,label:'雪'},{flag:false,label:0},{}],
   if:{required:['flag'],properties:{flag:{enum:[true]}}},then:{required:['value'],properties:{value:{minimum:'EXACT'}}},
   else:{properties:{label:{type:'string'}}}};
 const models={Value:schema,Condition:{$ref:'#/components/schemas/Value/if'}};
 if(schema.then!==undefined&&!['inactive-array','inert-array','inactive-dependency'].includes(mode))models.Then={$ref:'#/components/schemas/Value/then'};
 if(mode==='inert-array')models.IndependentPrefix={$ref:'#/components/schemas/Value/then/prefixItems/0'};
 if(mode==='inactive-dependency')models.IndependentDependency={$ref:'#/components/schemas/Value/then/dependentSchemas/flag/properties/flag'};
 if(schema.else!==undefined&&mode!=='forced')models.Else={$ref:'#/components/schemas/Value/else'};
 const document={openapi:version,info:{title:'Bounded conditions',version:'1'},paths:{},components:{schemas:models},
  'x-history':{predicate:schema.if,number:'EXACT',literal:{$ref:'never-fetch.json#/data'}}};
 const text=(format==='yaml'?'# Keep conditional aliases\r\n'+YAML.stringify(document).replaceAll('\n','\r\n'):JSON.stringify(document))
  .replace(/"?EXACT"?/g,'9007199254740993.000');
 const input={root,snapshot:'bounded-condition-'+mode,resources:[{id:root,text,generation:4}],targetVersion,destination:'file:///bounded-condition-output/'};
 const evaluate=async(packet,prefix)=>{
  const runtimeInstances=Object.keys(models).flatMap(name=>conditionalSamples.map(text=>({subject:'response-body',location:name,text,
   schema:{resource:packet.root,pointer:prefix+'/'+name}})));
  const result=await evaluateMigrationAnnotations({...packet,runtimeInstances});
  assert.equal(result.checked.complete,true,JSON.stringify(result.checked.findings));
  assert(result.checked.runtimeEvaluations.every(value=>value.complete),JSON.stringify(result.checked.runtimeFindings));
  assert.equal(result.annotations.length,runtimeInstances.length);
  return {valid:result.checked.runtimeEvaluations.map(value=>value.valid),annotations:result.annotations};
 };
 const before=await evaluate(input,'/components/schemas'),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-bounded-conditional',resources:review.outputs.map(output=>({...output,generation:0}))};
 assert.deepEqual(await evaluate(output,targetVersion==='2.0'?'/definitions':'/components/schemas'),before);
 assert.equal(createGraph(output).graph.docs.get(output.root).dataJson('/x-history'),new SourceDocument(text,root).dataJson('/x-history'));
 assert.equal(input.resources[0].text,text);
 const repeated=await planMigration(input);assert.deepEqual(repeated.outputs,review.outputs);
});

for(const targetVersion of ['2.0','3.0.4'])test(`${targetVersion} an annotation without branches remains conditional rather than being discarded`,async()=>{
 const root='file:///conditional-metadata/api.json',text=JSON.stringify({openapi:'3.2.1',info:{title:'Conditional metadata',version:'1'},paths:{},
  components:{schemas:{Value:{if:{type:'integer',description:'Only integer instances'}}}}});
 const input={root,snapshot:'conditional-metadata',resources:[{id:root,text,generation:1}],targetVersion,destination:'file:///conditional-metadata-output/'};
 const review=await planMigration(input);
 if(targetVersion==='2.0'){assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert(review.problems.some(problem=>problem.code==='migration.schema.conditional'&&problem.reason==='target-representation'));}
 else{
  assert.equal(review.complete,true,JSON.stringify(review.problems));
  const output={root:review.outputRoot,resources:review.outputs.map(output=>({...output,generation:0})),snapshot:'metadata-cold'};
  const evaluate=packet=>evaluateMigrationAnnotations({...packet,runtimeInstances:['0','"x"','null'].map(text=>({subject:'response-body',location:text,text,
   schema:{resource:packet.root,pointer:'/components/schemas/Value'}}))});
  const before=await evaluate(input),after=await evaluate(output);
  assert.equal(before.checked.complete,true);assert.equal(after.checked.complete,true);assert.deepEqual(after.annotations,before.annotations);
  assert.equal(before.annotations[0].length,1);assert.equal(before.annotations[1].length,0);assert.equal(before.annotations[2].length,0);
 }
});
