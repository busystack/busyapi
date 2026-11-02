const {test}=require('node:test');
const assert=require('node:assert/strict');
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
 assert.equal(review.producerVersion,'41');
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
test('an independently copied active dynamic scope remains a located implementation blocker',async()=>{
 const input=capture('json',{
  Model:{default:{$dynamicAnchor:'node',type:'object',properties:{next:{$dynamicRef:'#node'}}}},
  Value:{$ref:'#/components/schemas/Model/default'},
 });
 const before=input.resources[0].text,result=await planMigration(input);
 assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
 const problem=result.problems.find(problem=>['migration.owners.dynamic-scope','migration.owners.anchor-base'].includes(problem.code));
 assert(problem,JSON.stringify(result.problems));assert.equal(problem.pointer,'/components/schemas/Model/default');
 assert.equal(problem.resource,input.root);assert(problem.range[1]>problem.range[0]);
 assert.equal(input.resources[0].text,before);
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
