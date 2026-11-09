const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planYamlOwnership}=require('./dist/refactoring_ownership.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {inspect,createGraph}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
for(const bytes of ['serialized-example','saved-upload'])test(`exact YAML value identity does not permit changing independently consumed ${bytes} bytes`,()=>{
 const root='file:///owned/api.yaml';
 const text='openapi: 3.2.1\ninfo: &info {title: Bytes, version: "1", description: "[Guide](guide.md)", x-number: 9007199254740993.00, x-bytes: "AAECA/7/AA=="}\n'+
  'paths: {}\nx-data: *info\n'+(bytes==='serialized-example'?'components: {examples: {Raw: {externalValue: api.yaml}}}\n':'');
 const resources=[{id:root,text,generation:1}],manifest={id:'file:///owned/busyapi.yaml',generation:2,text:'version: 1\nroots: [{name: API, path: api.yaml}]\ntests: [{name: Raw, body: {files: [{name: input, path: api.yaml}]}}]\n'};
 const input={snapshot:'byte-owner',resources,contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:'/info'},...(bytes==='saved-upload'?{manifest}:{})};
 assert.throws(()=>planYamlOwnership(input),error=>error.code==='refactor.literal.bytes'&&error.source?.pointer===(bytes==='saved-upload'?'/tests/0/body/files/0/path':'/components/examples/Raw/externalValue'));
 assert.equal(resources[0].text,text);
});
test('explicit YAML independence composes with contract/literal extraction through original source coordinates',()=>{
 const {planExtract}=require('./dist/refactoring_copy.cjs'),root='file:///owned/api.yaml',pointer='/components/schemas/Holder/default';
 const text='openapi: 3.2.1\ninfo: {title: Owners, version: "1"}\npaths: {}\n'+
  'x-data: &data {type: integer, enum: [9007199254740993.00], description: "[Guide](guide.md)", x-bytes: "AAECA/7/AA=="}\n'+
  'components:\n  schemas:\n    Holder: {default: *data}\n    Use: {$ref: "#/components/schemas/Holder/default"}\n';
 const resources=[{id:root,text,generation:5}],contexts=[{root,resources:[root]}],doc=new SourceDocument(text,root);
 const owned=planYamlOwnership({snapshot:'ownership',resources,contexts,target:{root,resource:root,generation:5,pointer,range:doc.node(pointer).range}});
 const prepared=apply(resources,owned),plan=planExtract({snapshot:'extraction',resources:prepared,contexts,target:{root,resource:root,generation:5,pointer},name:'Separate'}),output=apply(prepared,plan);
 const after=new SourceDocument(output[0].text,root);
 assert.equal(after.dataJson(pointer),doc.dataJson(pointer));assert.equal(after.dataJson('/x-data'),doc.dataJson('/x-data'));
 assert.equal(after.dataJson('/components/schemas/Separate/enum'),doc.dataJson(pointer+'/enum'));
 assert.equal(createGraph({root,resources:output}).graph.referenceAs(root,'/components/schemas/Use','$ref','schema').targetPointer,'/components/schemas/Separate');
 assert.equal(resources[0].text,text);
});
const apply=(resources,plan)=>resources.map(resource=>{
 let text=resource.text;
 for(const edit of plan.edits.filter(edit=>edit.buffer===resource.id).sort((a,b)=>b.start-a.start)){
  assert.equal(edit.generation,resource.generation);assert.equal(text.slice(edit.start,edit.end),edit.expected);
  text=text.slice(0,edit.start)+edit.replacement+text.slice(edit.end);
 }
 return {...resource,text};
});
for(const version of ['2.0','3.0.4','3.1.2','3.2.1'])test(`reviewed YAML draft ownership opens native Info editing ${version}`,()=>{
 const root='file:///owned/api.yaml',other='file:///owned/other.yaml';
 const declaration=version==='2.0'?'swagger: "2.0"':'openapi: '+version;
 const text='# retained 雪😀\r\n'+declaration+'\r\nx-info: &info {title: "Original", version: "1", x-exact: 9007199254740993.00}\r\ninfo: *info\r\npaths: {}\r\nx-history: *info\r\n';
 const resources=[{id:root,text,generation:7},{id:other,text:declaration+'\ninfo: {title: Other, version: "1"}\npaths: {}\n',generation:9}];
 const packet=inspect({root,snapshot:'before',resources,resource:root,pointer:'/info'});
 assert.equal(packet.yamlOwnershipAvailable,true);assert.equal(packet.reviewedCopySource.nodeKind,'object');assert.equal(packet.nodeKind,'scalar');
 const target={root,resource:root,generation:7,pointer:'/info',kind:'info',range:packet.range,expected:text.slice(...packet.range)};
 const input={snapshot:'captured-info',resources,contexts:[{root,resources:[root,other]},{root:other,resources:[root,other]}],target};
 const plan=planYamlOwnership(input),after=apply(resources,plan);
 assert.deepEqual(plan,planYamlOwnership(input));assert.equal(plan.kind,'yaml-ownership');assert.deepEqual(plan.transitions,[]);
 assert.equal(resources[0].text,text);assert.equal(after[1].text,resources[1].text);
 assert(after[0].text.includes('# retained 雪😀\r\n'));assert(after[0].text.includes('x-history: *info\r\n'));
 const doc=new SourceDocument(after[0].text,root),before=new SourceDocument(text,root);
 assert.equal(doc.dataJson(''),before.dataJson(''));assert(doc.dataJson('/info').includes('9007199254740993.00'));
 assert.equal(doc.sharedNode('/info',true),undefined);assert.equal(doc.node('/x-history').alias.pointer,'/x-info');
 const fresh=inspect({root,snapshot:'after',resources:after,resource:root,pointer:'/info'});
 assert.equal(fresh.nodeKind,'object');assert.equal(fresh.yamlOwnershipAvailable,undefined);
 const edited=new SourceDocument(doc.set('/info/title','Independent 雪'),root);
 assert.equal(edited.dataNode('/info/title').value,'Independent 雪');assert.equal(edited.dataNode('/x-history/title').value,'Original');
 assert.throws(()=>planYamlOwnership({...input,target:{...target,range:[0,1]}}),error=>error.code==='edit.stale');
 assert.throws(()=>planYamlOwnership({...input,target:{...target,generation:8}}),error=>error.code==='edit.stale');
 assert.throws(()=>planYamlOwnership({...input,target:{...target,pointer:'/info/title',range:undefined,expected:undefined}}),error=>error.code==='refactor.ownership.source');
 assert.throws(()=>planYamlOwnership({...input,target:{...target,root:'file:///unknown.yaml'}}),error=>error.code==='refactor.ownership.source');
 const noop=planYamlOwnership({...input,resources:after,target:{...target,range:fresh.range,expected:after[0].text.slice(...fresh.range)}});
 assert.deepEqual(noop.edits,[]);assert.deepEqual(noop.changes,[]);
});
for(const version of ['3.1.2','3.2.1'])test(`YAML schema ownership retains resource, recursive and incomplete connections ${version}`,async()=>{
 const root='file:///owned/resource.yaml',pointer='/components/schemas/Model';
 const text='openapi: '+version+'\ninfo: {title: Identity, version: "1"}\npaths: {}\ncomponents:\n  schemas:\n    Model: &model\n      $id: https://identity.invalid/model\n      $dynamicAnchor: node\n      type: object\n      properties:\n        n: {type: integer, minimum: &number 9007199254740993.00}\n        next: {$dynamicRef: "#node"}\n      required: [n]\n    Missing: {$ref: "missing.yaml#/Schema"}\nx-model: *model\nx-number: *number\n';
 const resources=[{id:root,text,generation:1}],input={snapshot:'resource-ownership',resources,contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer,kind:'schema'}};
 const packet=inspect({root,resources,resource:root,pointer});assert.equal(packet.yamlOwnershipAvailable,true);
 assert.throws(()=>new SourceDocument(text,root).set(pointer+'/title','ordinary'),error=>error.code==='edit.shared');
 const plan=planYamlOwnership(input),after=apply(resources,plan),doc=new SourceDocument(after[0].text,root);
 assert.equal(doc.dataJson(''),new SourceDocument(text,root).dataJson(''));assert.equal(doc.sharedNode(pointer,true),undefined);
 assert(doc.text.includes('9007199254740993.00'));assert.equal(doc.dataNode('/x-model/$id').value,'https://identity.invalid/model');
 for(const captured of [resources,after]){
  const graph=createGraph({root,resources:captured}).graph,ref=graph.references.find(ref=>ref.dynamic);
  assert.equal(ref.targetResource,root);assert.equal(ref.targetPointer,pointer);assert.equal(ref.dynamic.anchor,'node');
  assert(graph.references.some(ref=>ref.resolution==='missing'));
  const result=await evaluateSchemas({root,resources:captured,snapshot:'owned-resource',runtimeInstances:[
   '{"n":9007199254740993,"next":{"n":9007199254740994}}','{"n":9007199254740992}'
  ].map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:root,pointer}}))});
  assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);
 }
 const changed=new SourceDocument(doc.set(pointer+'/title','Edited independently'),root);
 assert.equal(changed.dataNode('/x-model/title'),undefined);
});
