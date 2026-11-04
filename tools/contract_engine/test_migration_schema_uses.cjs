const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');
const {analyse,createGraph}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');

function capture(format,schemas,version='3.2.1'){
 const root='file:///approved/api.'+format;
 const value={openapi:version,info:{title:'Independent uses 雪',version:'business'},paths:{},components:{schemas}};
 const text=(format==='yaml'?'# Retain CRLF\r\n'+YAML.stringify(value,{aliasDuplicateObjects:false}).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 return {root,snapshot:'independent-schema-uses',resources:[{id:root,text,generation:7}],targetVersion:'3.0.4',destination:'file:///delivered/'};
}
const delivered=result=>({root:result.outputRoot,snapshot:'cold:'+result.identity,resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0}))});
async function outcomes(input,pointer,values){
 const result=await evaluateSchemas({...input,runtimeInstances:values.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:input.root,pointer}}))});
 assert.equal(result.complete,true,JSON.stringify(result.findings));
 return result.runtimeEvaluations.map(result=>result.valid);
}
async function migrate(input){
 const before=input.resources.map(resource=>resource.text);
 const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.equal(review.producerVersion,'70');
 const output=delivered(review);
 assert.equal(analyse(output).status,'complete');
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
 return {review,output};
}
for(const format of ['yaml','json'])for(const keyword of ['dependentRequired','dependentSchemas'])
test(`${format} ${keyword} dictionary and independent schema retain distinct consumers`,async()=>{
 const dictionary=keyword==='dependentRequired'?{required:['value']}:{not:{required:['value']}};
 const input=capture(format,{
  Model:{type:'object',[keyword]:dictionary,properties:{value:{enum:['EXACT']}}},
  Dictionary:{$ref:'#/components/schemas/Model/'+keyword},
  ...(keyword==='dependentSchemas'?{Child:{$ref:'#/components/schemas/Model/dependentSchemas/not'}}:{}),
 });
 const {output}=await migrate(input);
 const values=['null','false','0','[]','{}','{"required":false}','{"not":null}','{"value":9007199254740993}','{"value":9007199254740992}','{"required":0,"value":9007199254740993}','{"not":0,"value":9007199254740993}'];
 for(const name of keyword==='dependentSchemas'?['Model','Dictionary','Child']:['Model','Dictionary'])
  assert.deepEqual(await outcomes(output,'/components/schemas/'+name,values),await outcomes(input,'/components/schemas/'+name,values),name);
 const {graph}=createGraph(output);
 const reference=graph.referenceAs(output.root,'/components/schemas/Dictionary','$ref','schema');
 assert.equal(reference.resolution,'resolved');
 assert(reference.targetPointer.startsWith('/_migrated_schema_use_'));
});
for(const format of ['yaml','json'])for(const version of ['3.1.2','3.2.1'])
test(`${version} ${format} literal schema identity, exact data and Markdown retain separate ownership`,async()=>{
 const input=capture(format,{
  Model:{default:{$id:'models/value',type:'number',exclusiveMinimum:'EXACT',description:'[Guide](../guide)'}},
  Value:{$ref:'#/components/schemas/Model/default'},
 },version);
 const before=new SourceDocument(input.resources[0].text,input.root).dataJson('/components/schemas/Model/default');
 const {review,output}=await migrate(input);
 const doc=new SourceDocument(output.resources.find(resource=>resource.id===output.root).text,output.root);
 assert.equal(doc.dataJson('/components/schemas/Model/default'),before);
 assert.deepEqual(await outcomes(output,'/components/schemas/Value',['9007199254740992','9007199254740993','9007199254740994','null','false','{}']),
  await outcomes(input,'/components/schemas/Value',['9007199254740992','9007199254740993','9007199254740994','null','false','{}']));
 assert(review.presentationChanges.length>0);
 const reference=createGraph(output).graph.referenceAs(output.root,'/components/schemas/Value','$ref','schema');
 const definition=new SourceDocument(output.resources.find(resource=>resource.id===reference.targetResource).text,reference.targetResource).dataNode(reference.targetPointer).value;
 assert.equal(definition.exclusiveMinimum,true);
 assert.equal(definition.description,'[Guide](file:///approved/guide)');
});
for(const format of ['yaml','json'])test(`${format} recursive literal schema copies repair only semantic reference consumers`,async()=>{
 const input=capture(format,{
  Model:{default:{type:'object',properties:{n:{enum:['EXACT']},next:{$ref:'#/components/schemas/Model/default'}}}},
  Value:{$ref:'#/components/schemas/Model/default'},
 });
 const before=new SourceDocument(input.resources[0].text,input.root).dataJson('/components/schemas/Model/default');
 const {output}=await migrate(input),doc=new SourceDocument(output.resources[0].text,output.root);
 assert.equal(doc.dataJson('/components/schemas/Model/default'),before);
 const values=['{}','{"n":9007199254740993,"next":{}}','{"next":{"n":9007199254740992}}','null'];
 assert.deepEqual(await outcomes(output,'/components/schemas/Value',values),await outcomes(input,'/components/schemas/Value',values));
});
for(const format of ['yaml','json'])test(`${format} uniquely bound recursive dynamic data uses lower through shared ownership`,async()=>{
 const input=capture(format,{
  Model:{default:{$dynamicAnchor:'node',type:'object',properties:{next:{$dynamicRef:'#node'}}}},
  Value:{$ref:'#/components/schemas/Model/default'},
 });
 const literal=new SourceDocument(input.resources[0].text,input.root).dataJson('/components/schemas/Model/default');
 const {output}=await migrate(input),doc=new SourceDocument(output.resources.find(resource=>resource.id===output.root).text,output.root);
 assert.equal(doc.dataJson('/components/schemas/Model/default'),literal);
 const samples=['{}','{"next":{}}','{"next":false}','null'];
 assert.deepEqual(await outcomes(output,'/components/schemas/Value',samples),await outcomes(input,'/components/schemas/Value',samples));
});
test('competing dynamic targets retain their located specialization blocker after ownership separation',async()=>{
 const input=capture('json',{
  Model:{default:{$dynamicAnchor:'node',type:'object',properties:{next:{$dynamicRef:'#node'}}}},
  Value:{$ref:'#/components/schemas/Model/default'},
  Peer:{$id:'peer',$dynamicAnchor:'node',type:'string'},
 });
 const before=input.resources[0].text,result=await planMigration(input);
 assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
 const problem=result.problems.find(problem=>problem.code==='migration.schema.dynamic-reference');
 assert(problem,JSON.stringify(result.problems));assert(problem.pointer.startsWith('/components/schemas/Model/default'));
 assert.equal(problem.resource,input.root);assert(problem.range[1]>problem.range[0]);
 assert.equal(input.resources[0].text,before);
});
for(const format of ['yaml','json'])for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const identified of [false,true])
test(`${version} ${format} ${identified?'identified':'inherited'} dynamic resources keep actual recursive call scope`,async()=>{
 const input=capture(format,{},version);
 const schema={...(identified?{$id:'node'}:{}),$dynamicAnchor:'node',type:'object',required:['n'],
  properties:{n:{type:'integer',enum:['EXACT']},next:{$dynamicRef:'#node'}}};
 const value={openapi:version,info:{title:'Scoped resources',version:'business'},paths:{},components:{schemas:{
  Model:{$id:'https://schemas.invalid/model',type:'object',default:schema},
  Value:{$ref:'#/components/schemas/Model/default'},
  Strict:{$id:'https://schemas.invalid/strict',$dynamicAnchor:'node',$ref:input.root+'#/components/schemas/Value',required:['strict'],properties:{strict:{const:true}}},
 }}};
 input.resources[0].text=(format==='yaml'?YAML.stringify(value,{aliasDuplicateObjects:false}):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 input.targetVersion=version.startsWith('3.1.')?'3.2.1':'3.1.2';
 const original=new SourceDocument(input.resources[0].text,input.root).dataJson('/components/schemas/Model/default');
 const samples=['{}','null','{"n":9007199254740993}',
  '{"n":9007199254740993,"strict":true}',
  '{"n":9007199254740993,"strict":true,"next":{"n":9007199254740993}}',
  '{"n":9007199254740993,"strict":true,"next":{"n":9007199254740993,"strict":true}}',
  '{"n":9007199254740992,"strict":true}'];
 const strict=await outcomes(input,'/components/schemas/Strict',samples);
 assert.deepEqual(strict,[false,false,false,true,false,true,false]);
 const {output}=await migrate(input);
 for(const name of ['Value','Strict'])assert.deepEqual(await outcomes(output,'/components/schemas/'+name,samples),await outcomes(input,'/components/schemas/'+name,samples),name);
 const doc=new SourceDocument(output.resources.find(resource=>resource.id===output.root).text,output.root);
 assert.equal(doc.dataJson('/components/schemas/Model/default'),original);
 const {graph}=createGraph(output),reference=graph.referenceAs(output.root,'/components/schemas/Value','$ref','schema');
 const target=graph.scopeAs(reference.targetResource,reference.targetPointer,'schema');
 assert.equal(target.base,'https://schemas.invalid/'+(identified?'node':'model'));
 const nested=graph.referenceAs(target.resource,target.pointer+'/properties/next','$dynamicRef','schema');
 assert(nested.dynamic);assert.equal(nested.value,target.base+'#node');
 assert.equal(graph.docs.get(output.root).dataNode('/components/schemas/Model/$id').value,'https://schemas.invalid/model');
 if(!identified)assert(reference.targetPointer.startsWith('/components/schemas/Model/$defs/'));
});
for(const format of ['yaml','json'])for(const targetVersion of ['3.1.2','3.0.4','2.0'])test(`${format} static anchors use the resource-preserving owner before conversion to ${targetVersion}`,async()=>{
 const input=capture(format,{
  Model:{$id:'https://schemas.invalid/model',default:{$anchor:'node',type:'integer',enum:['EXACT']}},
  Value:{$ref:'#/components/schemas/Model/default'},Anchor:{$ref:'https://schemas.invalid/model#node'},
 });
 input.targetVersion=targetVersion;
 const {output}=await migrate(input);
 const container=targetVersion==='2.0'?'/definitions':'/components/schemas';
 for(const name of ['Value','Anchor'])assert.deepEqual(await outcomes(output,container+'/'+name,['9007199254740993','9007199254740992','null']),[true,false,false]);
 const reference=createGraph(output).graph.referenceAs(output.root,container+'/Value','$ref','schema');
 if(targetVersion==='3.1.2')assert(reference.targetPointer.startsWith('/components/schemas/Model/$defs/'));
});
// Use the unmodified, pinned official suite and its expected validity values;
// these self-contained resources require no network or synthetic remote data.
const officialDynamic=JSON.parse(fs.readFileSync(path.join(__dirname,'../../fixtures/json_schema_2020_12/dynamicRef.json'),'utf8'));
for(const description of [
 'A $dynamicRef resolves to the first $dynamicAnchor still in scope that is encountered when the schema is evaluated',
 "A $dynamicRef with intermediate scopes that don't include a matching $dynamicAnchor does not affect dynamic scope resolution",
])test(`independent schema use preserves official dynamic scope: ${description}`,async()=>{
 const fixture=officialDynamic.find(candidate=>candidate.description===description);
 assert(fixture,'Pinned official dynamicRef case must remain present');
 const input=capture('json',{Model:{default:fixture.schema},Value:{$ref:'#/components/schemas/Model/default'}},'3.1.2');
 input.targetVersion='3.2.1';
 const samples=fixture.tests.map(test=>JSON.stringify(test.data)),expected=fixture.tests.map(test=>test.valid);
 assert.deepEqual(await outcomes(input,'/components/schemas/Value',samples),expected);
 const {output}=await migrate(input);
 assert.deepEqual(await outcomes(output,'/components/schemas/Value',samples),expected);
 const root=new SourceDocument(output.resources.find(resource=>resource.id===output.root).text,output.root);
 assert.deepEqual(JSON.parse(root.dataJson('/components/schemas/Model/default')),fixture.schema);
});
test('resource holders do not leak earlier generated definitions into another schema annotation',async()=>{
 const input=capture('json',{
  Data:{$ref:'#/x-data'},Metadata:{$ref:'#/components/headers/LongHeaderMetadata'},
 });
 const document=JSON.parse(input.resources[0].text);
 document['x-data']={$anchor:'data',type:'integer',enum:['EXACT']};
 document.components.headers={LongHeaderMetadata:{description:'Header',schema:{type:'string'}}};
 input.resources[0].text=JSON.stringify(document).replaceAll('"EXACT"','9007199254740993.00');
 input.targetVersion='3.1.2';
 const {output}=await migrate(input),{graph}=createGraph(output);
 const reference=graph.referenceAs(output.root,'/components/schemas/Metadata','$ref','schema');
 const copy=graph.docs.get(reference.targetResource);
 assert.equal(copy.dataJson(reference.targetPointer+'/schema'),'{"type":"string"}');
 const root=graph.docs.get(output.root);
 assert.equal(root.dataJson('/x-data'),new SourceDocument(input.resources[0].text,input.root).dataJson('/x-data'));
 assert.deepEqual(await outcomes(output,'/components/schemas/Data',['9007199254740993','9007199254740992']),[true,false]);
});
test('a static forwarding use retains its resource when a downstream schema uses dynamic scope',async()=>{
 const input=capture('json',{
  Model:{$id:'https://schemas.invalid/model',$defs:{node:{$dynamicAnchor:'node',type:'string'}},default:{$ref:'https://schemas.invalid/list'}},
  Value:{$ref:'#/components/schemas/Model/default'},
  List:{$id:'https://schemas.invalid/list',type:'array',items:{$dynamicRef:'#node'},$defs:{node:{$dynamicAnchor:'node'}}},
 },'3.1.2');input.targetVersion='3.2.1';
 const samples=['[]','["雪"]','[false]','null'];
 assert.deepEqual(await outcomes(input,'/components/schemas/Value',samples),[true,true,false,false]);
 const literal=new SourceDocument(input.resources[0].text,input.root).dataJson('/components/schemas/Model/default');
 const {output}=await migrate(input),graph=createGraph(output).graph;
 assert.deepEqual(await outcomes(output,'/components/schemas/Value',samples),[true,true,false,false]);
 const reference=graph.referenceAs(output.root,'/components/schemas/Value','$ref','schema');
 const scope=graph.scopeAs(reference.targetResource,reference.targetPointer,'schema');
 assert.equal(scope.base,'https://schemas.invalid/model');assert(reference.targetPointer.startsWith('/components/schemas/Model/$defs/'));
 assert.equal(graph.docs.get(output.root).dataJson('/components/schemas/Model/default'),literal);
});
test('ignored legacy reference siblings keep independent schema owners before an explicit discard decision',async()=>{
 const input=capture('json',{
  Base:{type:'string'},Model:{default:{$ref:'#/components/schemas/Base',properties:{n:{type:'integer',enum:[0]}}}},
  Value:{$ref:'#/components/schemas/Model/default'},Independent:{$ref:'#/components/schemas/Model/default/properties/n'},
 },'3.0.4');
 input.targetVersion='3.1.2';
 const original=new SourceDocument(input.resources[0].text,input.root).dataJson('/components/schemas/Model/default');
 const pending=await planMigration(input);
 assert.equal(pending.status,'requires-decision',JSON.stringify(pending.problems));
 assert(pending.problems.every(problem=>problem.reason==='decision'&&problem.choices.includes('discard-ignored-siblings')));
 input.decisions=Object.fromEntries(pending.problems.map(problem=>[problem.id,'discard-ignored-siblings']));
 const {output}=await migrate(input);
 for(const name of ['Value','Independent'])assert.deepEqual(await outcomes(output,'/components/schemas/'+name,['"text"','0','1','null','{}']),await outcomes(input,'/components/schemas/'+name,['"text"','0','1','null','{}']));
 assert.equal(new SourceDocument(output.resources.find(resource=>resource.id===output.root).text,output.root).dataJson('/components/schemas/Model/default'),original);
});
test('document and schema interpretations retain separate identity and declaration meanings',async()=>{
 const input=capture('json',{Document:{$ref:'other.json'}});
 input.targetVersion='3.1.2';
 const other='file:///approved/other.json';
 input.resources.push({id:other,generation:4,text:JSON.stringify({
  openapi:'3.2.1',$self:'https://contracts.invalid/other',info:{title:'Other',version:'business'},paths:{},
 })});
 const {review,output}=await migrate(input);
 assert.equal(review.manifest.roots.length,2);
 const {graph}=createGraph(output),reference=graph.referenceAs(output.root,'/components/schemas/Document','$ref','schema');
 assert.equal(reference.resolution,'resolved');
 const doc=new SourceDocument(output.resources.find(resource=>resource.id===reference.targetResource).text,reference.targetResource);
 const value=doc.dataNode(reference.targetPointer).value;
 assert.equal(value.openapi,'3.2.1');assert.equal(value.$self,'https://contracts.invalid/other');
 const actual=review.changes.find(change=>change.resource===other);
 assert.equal(new SourceDocument(actual.after,actual.destination).dataNode('/openapi').value,'3.1.2');
 assert.equal(new SourceDocument(actual.after,actual.destination).dataNode('/$self'),undefined);
});
test('shared Header reference syntax separates native-object and schema consumers before rewriting',async()=>{
 const input=capture('json',{HeaderSchema:{$ref:'#/components/headers/Alias'}});
 input.targetVersion='3.1.2';
 const document=JSON.parse(input.resources[0].text);
 document.components.headers={
  Header:{description:'Header',schema:{type:'integer',enum:[0]}},
  Alias:{$ref:'#/components/headers/Header'},
 };
 document.paths={'/value':{get:{responses:{200:{description:'Reply',headers:{'X-Count':{$ref:'#/components/headers/Alias'}}}}}}};
 input.resources[0].text=JSON.stringify(document);
 const {output}=await migrate(input),{graph}=createGraph(output);
 graph.assertReferenceEditsSupported();
 const header=graph.referenceAs(output.root,'/components/headers/Alias','$ref','header');
 assert.equal(header.targetPointer,'/components/headers/Header');
 const schema=graph.referenceAs(output.root,'/components/schemas/HeaderSchema','$ref','schema');
 assert.notEqual(schema.targetResource,output.root);
 const values=['null','false','0','1','{}','[]'];
 assert.deepEqual(await outcomes(output,'/components/schemas/HeaderSchema',values),await outcomes(input,'/components/schemas/HeaderSchema',values));
});
