const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {analyse,createGraph}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {referencePage}=require('./dist/reference_projection.cjs');
const {readFileSync}=require('node:fs'),{join}=require('node:path');
const official=(file,description)=>{
 const value=JSON.parse(readFileSync(join(__dirname,'../../fixtures/json_schema_2020_12',file+'.json'),'utf8')).find(value=>value.description===description);
 assert(value,description);return value;
};
const cases=[official('dynamicRef','A $dynamicRef to a $dynamicAnchor in the same schema resource behaves like a normal $ref to an $anchor'),
 official('dynamicRef','A $dynamicRef resolves to the first $dynamicAnchor still in scope that is encountered when the schema is evaluated'),
 official('unevaluatedProperties','unevaluatedProperties with $ref')];
for(const version of ['3.1.2','3.2.1'])for(const format of ['json','yaml'])
test(`${version} ${format} native schema-map roots share an equal applicator resource context`,async()=>{
 const root='file:///approved/schema-map.'+format,value={openapi:version,info:{title:'Schema map uses',version:'1'},paths:{},components:{schemas:{
  additionalProperties:{type:'integer',minimum:'EXACT'},propertyNames:{enum:['a','雪']},View:{$ref:'#/components/schemas'}
 }}};
 const text=(format==='json'?JSON.stringify(value):YAML.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'shared-native-map',resources:[{id:root,text,generation:1}]},analysis=analyse(input);
 assert.equal(analysis.status,'complete',JSON.stringify(analysis.findings));
 const graph=createGraph(input).graph;
 assert(graph.scopeAs(root,'/components/schemas','schema'));assert(graph.scopeAs(root,'/components/schemas','schema-map'));
 assert.equal(graph.scopeAs(root,'/components/schemas/additionalProperties','schema').schemaParent,undefined,'The native root keeps independent meta-validation');
 assert.deepEqual(graph.schemaParentsOf({resource:root,pointer:'/components/schemas/additionalProperties'}).map(scope=>scope.pointer),['/components/schemas']);
 const samples=['{}','{"a":9007199254740993.00}','{"雪":9007199254740994}','{"a":0}','{"bad":9007199254740993}','null'];
 const result=await evaluateSchemas({...input,runtimeInstances:[
  ...samples.map(text=>({subject:'response-body',location:'map-use',text,schema:{resource:root,pointer:'/components/schemas/View'}})),
  ...['9007199254740993.00','0'].map(text=>({subject:'response-body',location:'native-member',text,schema:{resource:root,pointer:'/components/schemas/additionalProperties'}}))
 ]});
 assert.equal(result.complete,true,JSON.stringify(result.findings));
 assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,true,true,false,false,true,true,false]);
 assert.equal(input.resources[0].text,text);
});
test('all captured intrinsic schema parents retain incomplete child dependencies',async()=>{
 const root='file:///approved/schema-map-unavailable.json',value={openapi:'3.2.1',info:{title:'Unavailable schema use',version:'1'},paths:{},components:{schemas:{
  additionalProperties:{$ref:'not-loaded.json#/Schema'},propertyNames:{enum:['a']},View:{$ref:'#/components/schemas'}
 }}};
 const input={root,snapshot:'shared-native-map-unavailable',resources:[{id:root,text:JSON.stringify(value),generation:1}]};
 const result=await evaluateSchemas({...input,runtimeInstances:[
  {subject:'response-body',location:'dependent',text:'{"a":1}',schema:{resource:root,pointer:'/components/schemas/View'}},
  {subject:'response-body',location:'independent',text:'"a"',schema:{resource:root,pointer:'/components/schemas/propertyNames'}}
 ]});
 assert.equal(result.complete,false);assert.deepEqual(result.runtimeEvaluations.map(value=>[value.complete,value.valid]),[[false,false],[true,true]]);
});
for(const identified of [false,true])test(`native-root/subschema dialect declarations retain applicability, identified=${identified}`,async()=>{
 const root='file:///approved/schema-map-dialect.json',pointer='/components/schemas/additionalProperties',value={openapi:'3.2.1',info:{title:'Dialect context',version:'1'},paths:{},components:{schemas:{
  additionalProperties:{...(identified?{$id:'https://schemas.invalid/member'}:{}),$schema:'https://json-schema.org/draft/2020-12/schema',type:'integer'},
  View:{$ref:'#/components/schemas'}
 }}};
 const input={root,snapshot:'shared-root-declaration',resources:[{id:root,text:JSON.stringify(value),generation:1}]};
 if(!identified){
  assert.throws(()=>createGraph(input),error=>error.code==='reference.schema.context'&&error.source.resource===root&&error.source.pointer===pointer+'/$schema');
  return;
 }
 const graph=createGraph(input).graph;
 assert.equal(graph.scopeAs(root,pointer,'schema').resourcePointer,pointer);
 assert.equal(graph.scopeAs(root,pointer,'schema').dialect,'https://json-schema.org/draft/2020-12/schema');
 const result=await evaluateSchemas({...input,runtimeInstances:['{"a":1}','{"a":"wrong"}'].map(text=>({subject:'response-body',location:'map-use',text,schema:{resource:root,pointer:'/components/schemas/View'}}))});
 assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);
});
for(const version of ['3.1.2','3.2.1'])for(const fixture of cases)
test(`${version} captured executable views retain official resource/dynamic/unevaluated semantics: ${fixture.description}`,async()=>{
 const root='file:///approved/views.json',model='file:///approved/official.json';
 const value={openapi:version,info:{title:'Captured views',version:'1'},paths:{},components:{schemas:{
  Model:{$ref:'official.json'},Trigger:{$ref:'#/x-data/always'}}},'x-data':{always:true}};
 const input={root,snapshot:'official-resource-views',resources:[{id:root,text:JSON.stringify(value),generation:1},
  {id:model,text:JSON.stringify(fixture.schema),generation:1}]},before=input.resources.map(resource=>resource.text);
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));
 const checked=await evaluateSchemas({...input,runtimeInstances:fixture.tests.map(value=>({subject:'response-body',location:value.description,text:JSON.stringify(value.data),schema:{resource:root,pointer:'/components/schemas/Model'}}))});
 assert.equal(checked.complete,true,JSON.stringify(checked.findings));
 assert.deepEqual(checked.runtimeEvaluations.map(result=>result.valid),fixture.tests.map(value=>value.valid));
 assert(!JSON.stringify(checked).includes('busyapi-schema-view:'),'Executable coordinates remain internal');
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});
for(const version of ['2.0','3.0.4','3.2.1'])for(const format of ['yaml','json'])
test(`${version} ${format} literal schema views retain exact numbers, annotations and capture replacement`,async()=>{
 const root='file:///approved/exact-views.'+format,swagger=version==='2.0',prefix=swagger?'/definitions':'/components/schemas';
 const value={...(swagger?{swagger:version}:{openapi:version}),info:{title:'Exact views',version:'1'},paths:{},
  ...(swagger?{definitions:{Use:{$ref:'#/x-data/Model'}}}:{components:{schemas:{Use:{$ref:'#/x-data/Model'}}}}),
  'x-data':{Model:{type:'object',properties:{n:{type:'integer',enum:['EXACT']}},required:['n'],default:{$id:'literal-id',$ref:'literal-ref',n:'EXACT'}}}};
 const text=(format==='yaml'?'# Literal schema views 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,resources:[{id:root,text,generation:0}],snapshot:'view-generation'};
 // The default remains literal data and also conforms to the restricted
 // families' default-type requirement. No annotation policy is requested.
 const run=packet=>evaluateSchemas({...packet,runtimeInstances:['{"n":9007199254740993}','{"n":9007199254740992}'].map(text=>({subject:'response-body',location:text,text,schema:{resource:root,pointer:prefix+'/Use'}}))});
 const result=await run(input);
 assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(result=>result.valid),[true,false]);
 const replaced={...input,resources:[{id:root,text:text.replaceAll('9007199254740993.00','9007199254740992.00'),generation:1}]};
 const next=await run(replaced);assert.equal(next.complete,true,JSON.stringify(next.findings));assert.deepEqual(next.runtimeEvaluations.map(result=>result.valid),[false,true]);
 const graph=createGraph(input).graph;
 assert.equal(graph.docs.get(root).dataJson('/x-data/Model/default'),new SourceDocument(text,root).dataJson('/x-data/Model/default'));
 assert.equal(input.resources[0].text,text);
});
test('a malformed independently owned schema cannot turn a valid sibling into a placeholder result',async()=>{
 const root='file:///approved/invalid-view.json',value={openapi:'3.2.1',info:{title:'Independent validity',version:'1'},paths:{},
  components:{schemas:{Good:{$ref:'#/x-data/Good'},Bad:{$ref:'#/x-data/Bad'}}},'x-data':{Good:{type:'integer',enum:[7]},Bad:{type:7}}};
 const result=await evaluateSchemas({root,snapshot:'malformed-view',resources:[{id:root,text:JSON.stringify(value),generation:0}],runtimeInstances:[
  {subject:'response-body',location:'valid',text:'7',schema:{resource:root,pointer:'/components/schemas/Good'}},
  {subject:'response-body',location:'invalid',text:'0',schema:{resource:root,pointer:'/components/schemas/Good'}},
  {subject:'response-body',location:'unavailable',text:'7',schema:{resource:root,pointer:'/components/schemas/Bad'}},
 ]});
 assert(result.findings.some(finding=>finding.code==='schema.keyword.invalid'));
 assert.deepEqual(result.runtimeEvaluations.slice(0,2).map(value=>[value.complete,value.valid]),[[true,true],[true,false]]);
 assert.equal(result.complete,false);
 assert.deepEqual(result.runtimeEvaluations.filter(value=>value.location==='unavailable').map(value=>[value.complete,value.valid]),[[false,false]]);
});
for(const version of ['2.0','3.0.4'])test(`${version} boolean fields keep native eligibility without becoming standalone reference targets`,async()=>{
 const root='file:///approved/boolean-eligibility.json',swagger=version==='2.0',prefix=swagger?'/definitions':'/components/schemas';
 const schemas={Model:{type:'object',additionalProperties:false},Use:{$ref:'#'+prefix+'/Model/additionalProperties'}};
 const value={...(swagger?{swagger:version}:{openapi:version}),info:{title:'Boolean context',version:'1'},paths:{},...(swagger?{definitions:schemas}:{components:{schemas}})};
 const input={root,resources:[{id:root,text:JSON.stringify(value),generation:0}],snapshot:'boolean-eligibility'};
 assert(analyse(input).findings.some(finding=>finding.code==='reference.target.schema'&&finding.pointer===prefix+'/Use/$ref'));
 const result=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'native-owner',text:'{}',schema:{resource:root,pointer:prefix+'/Model'}}]});
 assert(result.findings.some(finding=>finding.code==='reference.target.schema'));
 assert.deepEqual(result.runtimeEvaluations.map(value=>[value.complete,value.valid]),[[true,true]]);
});
test('native and schema descriptions keep their selected bases through Reference scalar navigation',()=>{
 const root='file:///approved/markdown-views.json',pointer='/components/schemas/Resource/$defs/Shared';
 const value={openapi:'3.2.1',info:{title:'Rendering owners',version:'1'},paths:{},components:{
  schemas:{Resource:{$id:'https://schemas.invalid/base/resource',$defs:{Shared:{description:'[Guide](guide.md)'}}}},
  responses:{Use:{$ref:'#'+pointer}}}};
 const input={root,resources:[{id:root,text:JSON.stringify(value),generation:0}],snapshot:'rendering-owners'};
 for(const kind of ['schema','response']){
  const page=referencePage({...input,resource:root,pointer,contextKind:kind});
  const field=page.entries.find(entry=>entry.name==='description');assert.equal(field.parentKind,kind);
  const expected=kind==='schema'?'https://schemas.invalid/base/resource':true;
  assert.equal(field.markdownBase,expected);
  const scalar=referencePage({...input,resource:root,pointer:pointer+'/description',data:true,parentKind:field.parentKind});
  assert.equal(scalar.richText,true);assert.equal(scalar.markdownBase,expected);
 }
 assert.throws(()=>referencePage({...input,resource:root,pointer:pointer+'/description',data:true,parentKind:'parameter'}),error=>error.code==='inspect.context.stale');
});

for(const version of ['3.1.2','3.2.1'])for(const declaration of [undefined,'https://json-schema.org/draft/2020-12/schema'])
test(`${version} an independently interpreted native schema has its own meta root, declaration=${declaration}`,async()=>{
 const root='file:///approved/native-meta.json',owner='/components/schemas/Envelope',response=owner+'/$defs/Response',pointer=response+'/content/application~1json/schema';
 const value={openapi:version,info:{title:'Independent meta roots',version:'1'},paths:{'/p':{get:{responses:{200:{$ref:'#'+response}}}}},
  components:{schemas:{Envelope:{type:7,$defs:{Response:{description:'Native response',content:{'application/json':{schema:{...(declaration?{$schema:declaration}:{}),type:'integer',enum:[7]}}}}}}}}};
 const input={root,snapshot:'native-meta',resources:[{id:root,text:JSON.stringify(value),generation:0}]},graph=createGraph(input).graph;
 assert.equal(graph.scopeAs(root,pointer,'schema').schemaParent,undefined);
 assert(!graph.issues.some(issue=>issue.code==='schema.dialect.location'&&issue.pointer===pointer+'/$schema'));
 const result=await evaluateSchemas({...input,runtimeInstances:['7','0'].map(text=>({subject:'response-body',location:text,text,schema:{resource:root,pointer}}))});
 assert(result.findings.some(finding=>finding.code==='schema.keyword.invalid'&&finding.pointer===owner+'/type'));
 assert.deepEqual(result.runtimeEvaluations.map(value=>[value.complete,value.valid]),[[true,true],[true,false]],JSON.stringify(result));
 // A missing implementation must not let a malformed independent occurrence
 // escape meta-validation merely because a physical ancestor is a schema.
 value.components.schemas.Envelope.type='object';
 value.components.schemas.Envelope.$defs.Response.content['application/json'].schema.type=7;
 const bad=await evaluateSchemas({...input,resources:[{id:root,text:JSON.stringify(value),generation:1}],runtimeInstances:[
  {subject:'response-body',location:'bad-native-schema',text:'7',schema:{resource:root,pointer}}]});
 assert(bad.findings.some(finding=>finding.code==='schema.keyword.invalid'&&finding.pointer===pointer+'/type'));
 assert.deepEqual(bad.runtimeEvaluations.map(value=>[value.complete,value.valid]),[[false,false]]);
});

test('intrinsic subschemas still require a resource boundary for a dialect declaration',()=>{
 const root='file:///approved/intrinsic-dialect.json',pointer='/components/schemas/Model/properties/value';
 const input={root,resources:[{id:root,text:JSON.stringify({openapi:'3.2.1',info:{title:'Intrinsic context',version:'1'},paths:{},components:{schemas:{Model:{
  type:'object',properties:{value:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'integer'}}}}}}),generation:0}]};
 const graph=createGraph(input).graph;
 assert.equal(graph.scopeAs(root,pointer,'schema').schemaParent,'/components/schemas/Model');
 assert(graph.issues.some(issue=>issue.code==='schema.dialect.location'&&issue.pointer===pointer+'/$schema'));
});

for(const directFirst of [false,true])test(`native schema context discovery stabilizes after direct fragment discovery, directFirst=${directFirst}`,()=>{
 const root='file:///approved/order.json',model='file:///approved/model.json',pointer='/$defs/Response/content/application~1json/schema';
 const Direct={$ref:'model.json#'+pointer},Indirect={$ref:'model.json#/$defs/Response'};
 const components=directFirst?{schemas:{Direct},responses:{Indirect}}:{responses:{Indirect},schemas:{Direct}};
 const input={root,resources:[{id:root,text:JSON.stringify({openapi:'3.2.1',info:{title:'Discovery order',version:'1'},paths:{},components}),generation:0},
  {id:model,text:JSON.stringify({$id:'https://schemas.invalid/base/model',$schema:'https://json-schema.org/draft/2020-12/schema',
   $defs:{Response:{description:'Native',content:{'application/json':{schema:{$ref:'target.json#/Thing'}}}}}}),generation:0},
  {id:'file:///approved/target.json',text:'{"Thing":{"type":"integer"}}',generation:0}]};
 const graph=createGraph(input).graph,scope=graph.scopeAs(model,pointer,'schema');
 assert.deepEqual(graph.issues,[]);assert.equal(scope.base,model);assert.equal(scope.dialect,graph.scope(root,'').dialect);
 assert.equal(scope.schemaParent,undefined);assert.equal(graph.referenceAs(model,pointer,'$ref','schema').targetResource,'file:///approved/target.json');
});

for(const dialect of ['https://spec.openapis.org/oas/3.2/dialect/base','https://custom.invalid/schema',7])
test(`an entry dialect override does not leak into an unversioned external fragment: ${dialect}`,async()=>{
 const root='file:///approved/default.json',model='file:///approved/model.json',pointer='/Thing';
 const input={root,snapshot:'entry-default',resources:[{id:root,text:JSON.stringify({openapi:'3.1.2',jsonSchemaDialect:dialect,info:{title:'Entry default',version:'1'},paths:{},
  components:{schemas:{Model:{$ref:'model.json#/Thing'}}}}),generation:0},{id:model,text:'{"Thing":{"type":"integer"}}',generation:0}]};
 const graph=createGraph(input).graph,scope=graph.scopeAs(model,pointer,'schema');
 assert.equal(scope.family,'3.1');assert.equal(scope.dialect,'https://spec.openapis.org/oas/3.1/dialect/base');
 const result=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'fragment',text:'7',schema:{resource:model,pointer}}]});
 assert.deepEqual(result.runtimeEvaluations.map(value=>[value.complete,value.valid]),[[true,true]]);
});
