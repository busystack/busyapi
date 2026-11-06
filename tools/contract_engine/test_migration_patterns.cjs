const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{analyse,createGraph}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');

for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4'])for(const additional of [false,{type:'string'}])
test(`${format} finite overlapping patterns preserve additionalProperties and independent values in ${targetVersion}, additional=${JSON.stringify(additional)}`,async()=>{
 const root='file:///finite-pattern/api.'+format,patterns={
  '^n':{type:'integer',minimum:0},'2$':{type:'integer',maximum:20},'^.$':{type:'integer'},
  '^a/~雪$':{type:'integer',enum:['EXACT']},'^foo$':{type:'boolean'},'^__proto__$':{type:'boolean'},
  '^child$':{$ref:'#/components/schemas/Value'},'^never':{contains:{type:'integer'}},
 };
 const model={propertyNames:{enum:['n','n2','free','a/~雪','😀','foo\n','__proto__','child']},
  properties:{n:{enum:[0,'EXACT']}},patternProperties:patterns,additionalProperties:additional};
 const value={openapi:'3.2.1',info:{title:'Finite patterns',version:'1'},paths:{},'x-patterns':patterns,components:{schemas:{
  Value:model,Independent:{$ref:'#/components/schemas/Value/patternProperties/%5En'},
 }}};
 const text=(format==='yaml'?'# Keep pattern aliases 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 if(format==='yaml')assert(text.includes('*'),'The literal anchor and its Schema alias must exercise independent token ownership');
 const input={root,snapshot:'finite-patterns-'+format+targetVersion+JSON.stringify(additional),resources:[{id:root,text,generation:1}],targetVersion,destination:'file:///finite-output/'};
 assert.equal(analyse(input).status,'complete');
 const samples=['{}','{"n":9007199254740993.00}','{"n":-1}','{"n2":10}','{"n2":30}','{"n2":"10"}',
  '{"😀":0}','{"😀":"text"}','{"foo\\n":false}','{"__proto__":false}',
  '{"a/~雪":9007199254740993.00}','{"a/~雪":9007199254740992}',
  '{"free":"雪"}','{"free":0}','{"other":0}','{"child":{"n":0}}','null','false','0','[]','"text"'];
 const expected=[true,true,false,true,false,false,true,false,true,true,true,false,additional!==false,false,false,true,true,true,true,true,true];
 async function evaluate(packet,pointer,texts){
  const result=await evaluateSchemas({...packet,runtimeInstances:texts.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
 }
 assert.deepEqual(await evaluate(input,'/components/schemas/Value',samples),expected);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-finite-patterns',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 assert.equal(analyse(output).status,'complete');const prefix=targetVersion==='2.0'?'/definitions/':'/components/schemas/';
 assert.deepEqual(await evaluate(output,prefix+'Value',samples),expected);
 const independent=['0','-1','null','false','9007199254740993'];
 assert.deepEqual(await evaluate(output,prefix+'Independent',independent),await evaluate(input,'/components/schemas/Independent',independent));
 const graph=createGraph(output).graph,doc=graph.docs.get(output.root),reference=graph.referenceAs(output.root,prefix+'Independent','$ref','schema');
 assert.equal(reference.resolution,'resolved');assert(reference.targetPointer.endsWith('/items'));
 assert.equal(doc.dataJson('/x-patterns'),new SourceDocument(text,root).dataJson('/x-patterns'));
 assert.equal(doc.dataNode(prefix+'Value/patternProperties'),undefined);
 assert.equal(doc.dataJson(prefix+'Value/properties/n'),'{"enum":[0,9007199254740993.00]}');
 assert.deepEqual(doc.dataNode(prefix+'Value/properties/n2').value,{});assert.deepEqual(doc.dataNode(prefix+'Value/properties/😀').value,{});
 assert(!graph.entryReferences().some(reference=>reference.pointer.startsWith('/x-patterns')));
 assert.equal(input.resources[0].text,text);assert.deepEqual((await planMigration(input)).outputs,review.outputs);
});

for(const propertyNames of [false,{type:'integer'},undefined])test(`empty pattern selections retain only independent consumers, names=${JSON.stringify(propertyNames)}`,async()=>{
 const root='file:///empty-pattern/api.json',document={openapi:'3.2.1',info:{title:'Empty patterns',version:'1'},paths:{},components:{schemas:{
  Value:{...(propertyNames===undefined?{}:{propertyNames}),patternProperties:propertyNames===undefined?{}:{'^n':{contains:{type:'integer'}}}},
 }}};
 const text=JSON.stringify(document),input={root,snapshot:'empty-pattern',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///empty-pattern-output/'};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-empty-pattern',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 assert.equal(analyse(output).status,'complete');
 const result=await evaluateSchemas({...output,runtimeInstances:['{}','{"n":0}','null','0'].map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:output.root,pointer:'/definitions/Value'}}))});
 assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,propertyNames===undefined,true,true]);
 assert.equal(input.resources[0].text,text);
});

test('patterns over an unbounded property-name domain retain an explicit implementation blocker',async()=>{
 const root='file:///unbounded-pattern/api.json',text=JSON.stringify({openapi:'3.2.1',info:{title:'Unbounded pattern',version:'1'},paths:{},components:{schemas:{Value:{patternProperties:{'^n':{type:'integer'}}}}}});
 const review=await planMigration({root,snapshot:'unbounded-pattern',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///unbounded-pattern-output/'});
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert(review.problems.some(problem=>problem.code==='migration.schema.patternProperties'&&problem.reason==='implementation'));
});

const {assertB03}=require('./migration_b03_fixture.cjs');
for(const targetVersion of ['2.0','3.0.4'])for(const format of ['yaml','json'])
test(`${format} ${targetVersion} patterns reuse a referenced closed domain and intersect every match`,async()=>{
 await assertB03({format,targetVersion,schema:{allOf:[{$ref:'#/components/schemas/Closed'}],
  properties:{n:{minimum:0}},patternProperties:{'^n':{$ref:'#/components/schemas/Number'},'2$':{maximum:3}}},
  models:{Closed:{properties:{n:{},n2:{},free:{},next:{$ref:'#/components/schemas/Value'}},additionalProperties:false},
   Number:{allOf:[{type:'integer'},{maximum:10}],description:'Pattern value'}},independent:'patternProperties/%5En',
  samples:['null','[]','{}','{"n":2}','{"n":-1}','{"n2":3}','{"n2":4}','{"n2":"3"}','{"free":false}','{"other":0}','{"next":{"n2":4}}']});
});
for(const targetVersion of ['2.0','3.0.4'])for(const format of ['yaml','json'])
test(`${format} ${targetVersion} universal patterns preserve overlapping value metadata on unbounded names`,async()=>{
 await assertB03({format,targetVersion,schema:{properties:{special:{minimum:1}},
  patternProperties:{'':{type:'integer',description:'First match'},'^':{maximum:3,title:'Second match'}},
  additionalProperties:{patternProperties:{'^unsupported':{type:'number'}}}},
  independent:'patternProperties/',samples:['null','[]','{}','{"":2}','{"special":0}','{"special":2}','{"x\\n":2}','{"arbitrary name":4}','{"z":"2"}']});
});
for(const targetVersion of ['2.0','3.0.4'])test(`equivalent value schemas permit unbounded regex selection in ${targetVersion}`,async()=>{
 await assertB03({targetVersion,schema:{properties:{n:{minimum:1}},patternProperties:{'^n':{type:'integer'},'z$':{type:'integer'}},
  additionalProperties:{type:'integer'}},independent:'patternProperties/%5En',samples:[
   'null','{}','{"n":0}','{"n":1}','{"n":"1"}','{"arbitrarily long name":2}','{"z":"2"}','{"nzz":2}',
  ]});
});
for(const targetVersion of ['2.0','3.0.4'])for(const format of ['yaml','json'])
test(`${format} ${targetVersion} finite regex selectors keep an unbounded additional-property language`,async()=>{
 await assertB03({targetVersion,format,schema:{properties:{n:{minimum:0}},
  patternProperties:{'^(?:n|m)$':{type:'integer',description:'Selected finite name'},'^n$':{maximum:3}},additionalProperties:{type:'string'}},
  independent:'patternProperties/%5En%24',samples:[
   'null','{}','{"n":1}','{"n":4}','{"n":-1}','{"n":"1"}','{"m":2}','{"n\\n":2}',
   '{"arbitrarily long additional name":"雪"}','{"arbitrarily long additional name":1}','{"unbounded\\n":"雪"}',
  ]});
});

test('foreign pattern fragments retain their actual entry namespace, passive URIs and Markdown base',async()=>{
 const root='file:///namespace-pattern/a.json',other='file:///namespace-pattern/b.json',models='file:///namespace-pattern/defs/models.yaml';
 const first={openapi:'3.2.1',info:{title:'First',version:'1'},paths:{},components:{examples:{Bridge:{$ref:'b.json#/components/examples/Bridge'}}}};
 const second={openapi:'3.1.2',info:{title:'Second',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/value':{get:{responses:{200:{description:'Reply',content:{'application/json':{schema:{$ref:'#/components/schemas/Value'}}}}}}}},components:{
  examples:{Bridge:{value:'bridge'}},schemas:{Value:{$ref:'defs/models.yaml#/Value'},Choice:{allOf:[{$ref:'defs/models.yaml#/Value/patternProperties/%5Ename%24'}],'x-entry':'Second'}},
 }};
 const model={Value:{propertyNames:{const:'name'},patternProperties:{'^name$':{type:'object',required:['kind'],properties:{kind:{type:'string'}},
  discriminator:{propertyName:'kind',mapping:{chosen:'Choice'}},externalDocs:{url:'./pattern.html'},description:'[Guide](./guide.md)',
 }}}};
 const input={root,snapshot:'pattern-entry-context',targetVersion:'3.0.4',destination:'file:///namespace-output/',resources:[first,second,model].map((value,index)=>({id:[root,other,models][index],text:index===2?YAML.stringify(value):JSON.stringify(value),generation:1}))};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.changes.find(change=>change.resource===other).destination,snapshot:'cold-pattern-context',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 assert.equal(analyse(output).status,'complete');const graph=createGraph(output).graph;
 const mapping=graph.entryReferences().find(reference=>reference.connection==='discriminator'&&reference.keyword==='chosen');assert(mapping);
 assert.equal(mapping.resource,output.root);assert(mapping.pointer.includes('/items/discriminator/mapping'));
 assert.equal(mapping.resolution,'resolved');assert.equal(mapping.targetResource,output.root);assert.equal(mapping.targetPointer,'/components/schemas/Choice');
 const pointer=mapping.pointer.slice(0,-'/discriminator/mapping'.length),doc=graph.docs.get(mapping.resource);
 assert.equal(doc.dataNode(pointer+'/externalDocs/url').value,'file:///namespace-pattern/defs/pattern.html');
 assert.equal(doc.dataNode(pointer+'/description').value,'[Guide](file:///namespace-pattern/defs/guide.md)');
 const sample=['{"name":{"kind":"chosen"}}','{"name":{"kind":0}}','{"other":null}','null'];
 for(const packet of [{...input,root:other},output]){
  const result=await evaluateSchemas({...packet,runtimeInstances:sample.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer:'/components/schemas/Value'}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false,false,true]);
 }
 const firstOutput=review.outputs.find(value=>value.id===review.outputRoot),native=new SourceDocument(firstOutput.text,firstOutput.id).dataNode('/components/schemas');
 assert(![...native?.children.keys()??[]].some(name=>name.startsWith('_migrated_pattern_')));
});

test('hoisted definition models retain discriminator URI targets and reference-looking wire keys',async()=>{
 const root='file:///definition-model/api.json',target='#/components/schemas/Container/$defs/Choice';
 const document={openapi:'3.2.1',info:{title:'Definition model',version:'1'},paths:{},components:{schemas:{
  Container:{$defs:{Choice:{type:'object',required:['kind'],properties:{kind:{type:'string'}}}}},
  Parent:{type:'object',required:['kind'],properties:{kind:{type:'string'}},oneOf:[{$ref:target}],discriminator:{propertyName:'kind',mapping:{chosen:target,$ref:target,$dynamicRef:target}}},
 }},'x-literal':{mapping:{$ref:'data-only',$dynamicRef:'data-only'}}};
 const text=JSON.stringify(document),input={root,snapshot:'definition-connections',resources:[{id:root,text,generation:1}],targetVersion:'3.0.4',destination:'file:///definition-output/'};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-definition-connections',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 assert.equal(analyse(output).status,'complete');const graph=createGraph(output).graph,connections=graph.entryReferences().filter(reference=>reference.connection==='discriminator');
 assert.deepEqual(connections.map(reference=>reference.keyword).sort(),['$dynamicRef','$ref','chosen']);
 for(const reference of connections){assert.equal(reference.resolution,'resolved');assert(reference.targetPointer.endsWith('/items'));}
 const samples=['{"kind":"chosen"}','{"kind":"unknown"}','{"kind":0}','{}'];
 for(const packet of [input,output]){
  const result=await evaluateSchemas({...packet,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer:'/components/schemas/Parent'}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,true,false,false]);
 }
 assert.deepEqual(graph.docs.get(output.root).dataNode('/x-literal').value,document['x-literal']);assert.equal(input.resources[0].text,text);
});
