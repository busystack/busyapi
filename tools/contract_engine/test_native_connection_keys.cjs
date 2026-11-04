const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {analyse,createGraph,inspect}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {planMigration}=require('./dist/migration.cjs');
const {assistSource}=require('./dist/source_assistance.cjs');
const {referenceChoices}=require('./dist/reference_choices.cjs');
const {planFileMove}=require('./dist/refactoring_file.cjs');
const {deriveBundle}=require('./dist/derived_bundle.cjs');
const {escape}=require('./dist/document.cjs');
const keys=['chosen','$ref','$dynamicRef','operationRef'];
function capture(format,named=false,external=false){
 const root='file:///native-keys/api.'+format,model='file:///native-keys/model.'+format;
 const choice={...(named?{}:{$dynamicAnchor:'choice'}),type:'object',required:['kind'],properties:{kind:{type:'string'},n:{enum:['EXACT']}}};
 const target=named?'Choice':(external?'model.'+format:'')+'#choice';
 const data={openapi:'3.2.1',info:{title:'Native connection keys',version:'1'},paths:{},components:{schemas:{
  Parent:{type:'object',required:['kind'],properties:{kind:{type:'string'}},oneOf:[{$ref:named?'#/components/schemas/Choice':target}],
   discriminator:{propertyName:'kind',mapping:Object.fromEntries(keys.map(key=>[key,target]))}},
  ...(!external?{Choice:choice}:{}),Peer:{$id:'peer',$dynamicAnchor:'choice',type:'integer'},
 }},'x-literal':{mapping:{$ref:'literal',$dynamicRef:'literal'},security:{operationRef:['literal']}}};
 const encode=value=>(format==='json'?JSON.stringify(value):'# Keep native keys 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n')).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 return {root,snapshot:'native-keys',resources:[{id:root,text:encode(data),generation:1},...(external?[{id:model,text:encode(choice),generation:2}]:[])]};
}
function mappings(packet){return createGraph(packet).graph.entryReferences().filter(reference=>reference.connection==='discriminator');}
async function outcomes(packet){
 const result=await evaluateSchemas({...packet,runtimeInstances:['{"kind":"chosen","n":9007199254740993.00}','{"kind":"$dynamicRef"}','{"kind":"unknown"}','{"kind":0}','{}','{"kind":"chosen","n":9007199254740992}'].map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:packet.root,pointer:'/components/schemas/Parent'}}))});
 assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
}
for(const format of ['json','yaml'])for(const named of [false,true])test(`${format} native wire keys retain static URI or friendly-name connections through migration, names=${named}`,async()=>{
 const input=capture(format,named),frozen=input.resources.map(resource=>resource.text);
 assert.equal(analyse(input).status,'complete');
 const before=mappings(input);assert.deepEqual(before.map(reference=>reference.keyword).sort(),[...keys].sort());
 for(const reference of before){assert.equal(reference.resolution,'resolved');assert.equal(reference.targetPointer,'/components/schemas/Choice');assert.equal(reference.dynamic,undefined);}
 const document=createGraph(input).docs.get(input.root);
 for(const key of keys){
  const node=document.dataNode('/components/schemas/Parent/discriminator/mapping/'+escape(key));
  const help=assistSource({...input,resource:input.root,caret:node.range[0]+1,action:'definition'});
  assert.equal(help.definition.pointer,'/components/schemas/Choice');assert.equal(help.dynamic,undefined);
 }
 const expected=[true,true,true,false,false,false];assert.deepEqual(await outcomes(input),expected);
 const review=await planMigration({...input,targetVersion:named?'3.2.0':'3.0.4',destination:'file:///native-keys-output/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-native-keys',resources:review.outputs.map(resource=>({id:resource.id,text:resource.text,generation:0}))};
 assert.equal(analyse(output).status,'complete');assert.deepEqual(await outcomes(output),expected);
 for(const reference of mappings(output)){assert.equal(reference.resolution,'resolved');assert.equal(reference.dynamic,undefined);if(named)assert.equal(reference.value,'Choice');}
 assert.deepEqual(createGraph(output).docs.get(output.root).dataNode('/x-literal').value,document.dataNode('/x-literal').value);
 assert.deepEqual(input.resources.map(resource=>resource.text),frozen);
 // The same spelling in a real Schema Object retains dynamic candidates.
 if(!named){
  const original=YAML.parse(input.resources[0].text);original.components.schemas.RealUse={$dynamicRef:'#choice'};
  const graph=createGraph({...input,resources:[{...input.resources[0],text:JSON.stringify(original)}]}).graph;
  assert.equal(graph.referenceAs(input.root,'/components/schemas/RealUse','$dynamicRef','schema').dynamic.candidates.length,2);
 }
});
for(const format of ['json','yaml'])test(`${format} external model relocation and bundling preserve keyword-shaped mapping keys`,async()=>{
 const input=capture(format,false,true),model=input.resources[1].id,destination='file:///native-keys/moved/model.'+format;
 const contexts=[{root:input.root,resources:input.resources.map(resource=>resource.id)}],frozen=input.resources.map(resource=>resource.text);
 const plan=planFileMove({...input,contexts,target:{resource:model,generation:2},destinationResource:destination});
 const resources=input.resources.map(resource=>{
  let text=resource.text;
  for(const edit of plan.edits.filter(edit=>edit.buffer===resource.id).sort((a,b)=>b.start-a.start)){
   assert.equal(text.slice(edit.start,edit.end),edit.expected);text=text.slice(0,edit.start)+edit.replacement+text.slice(edit.end);
  }
  return {...resource,id:resource.id===model?destination:resource.id,text};
 });
 const moved={...input,resources};assert.equal(analyse(moved).status,'complete');
 for(const reference of mappings(moved)){assert.equal(reference.targetResource,destination);assert.equal(reference.dynamic,undefined);}
 assert.deepEqual(await outcomes(moved),await outcomes(input));
 const bundled=deriveBundle({...moved,outputId:'file:///portable/native-keys.json'});
 const cold={root:bundled.output.id,snapshot:'cold-native-bundle',resources:[{...bundled.output,generation:0}]};
 assert.equal(analyse(cold).status,'complete');assert.deepEqual(await outcomes(cold),await outcomes(input));
 assert.deepEqual(input.resources.map(resource=>resource.text),frozen);
});
for(const sourceVersion of ['2.0','3.0.4','3.1.2','3.2.1'])test(`${sourceVersion} named operationRef security bindings remain arrays on every family route`,async()=>{
 const root='file:///named-security/api.json',scheme={type:'apiKey',in:'header',name:'X-Key'};
 const document={...(sourceVersion==='2.0'?{swagger:sourceVersion,securityDefinitions:{operationRef:scheme}}:{openapi:sourceVersion,components:{securitySchemes:{operationRef:scheme}}}),info:{title:'Named security',version:'1'},paths:{},security:[{operationRef:[]}],'x-data':{operationRef:[]}};
 const text=JSON.stringify(document),input={root,snapshot:'named-security',resources:[{id:root,text,generation:1}]};
 for(const targetVersion of ['2.0','3.0.4','3.1.2','3.2.1']){
  const review=await planMigration({...input,targetVersion,destination:'file:///named-security-output/'});assert.equal(review.complete,true,JSON.stringify(review.problems));
  const output={root:review.outputRoot,snapshot:'cold-named-security',resources:review.outputs.map(resource=>({...resource,generation:0}))};
  assert.equal(analyse(output).status,'complete');const graph=createGraph(output).graph;
  assert.deepEqual(graph.docs.get(output.root).dataNode('/security/0').value,{operationRef:[]});
  assert.equal(graph.entryReferences().find(reference=>reference.connection==='security').resolution,'resolved');
 }
 assert.equal(input.resources[0].text,text);
});
for(const format of ['json','yaml'])test(`${format} URI security key normalization preserves separate role arrays and native choices`,async()=>{
 const root='file:///uri-security/api.'+format,scheme='file:///uri-security/$ref',names=['$ref','./$ref','././$ref'];
 const data={openapi:'3.2.1',info:{title:'URI security',version:'1'},paths:{},security:[Object.fromEntries(names.map((name,index)=>[name,['role-'+index]]))]};
 const encode=value=>format==='json'?JSON.stringify(value):YAML.stringify(value);
 const input={root,snapshot:'uri-security',resources:[{id:root,text:encode(data),generation:1},{id:scheme,text:encode({type:'apiKey',in:'header',name:'X-Key'}),generation:2}]};
 const selected=referenceChoices({...input,resource:root,pointer:'/security/0',keyword:'security',query:'',bindingForm:'uri'});
 assert(selected.entries.some(entry=>entry.target.resource===scheme));
 const original=input.resources.map(resource=>resource.text),review=await planMigration({...input,targetVersion:'3.2.0',destination:'file:///uri-security-output/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-uri-security',resources:review.outputs.map(resource=>({...resource,generation:0}))};
 const graph=createGraph(output).graph;assert.equal(analyse(output).status,'complete');
 const requirement=graph.docs.get(output.root).dataNode('/security/0').value;
 assert.deepEqual(Object.values(requirement),[['role-0'],['role-1'],['role-2']]);assert.equal(new Set(Object.keys(requirement)).size,3);
 const references=graph.entryReferences().filter(reference=>reference.connection==='security');assert.equal(references.length,3);
 for(const reference of references){assert.equal(reference.resolution,'resolved');assert.equal(reference.dynamic,undefined);assert.equal(reference.targetPointer,'');assert.equal(reference.targetResource,references[0].targetResource);}
 const view=inspect({...output,resource:output.root,pointer:'/security/0'});assert.equal(view.references.length,3);
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
});
