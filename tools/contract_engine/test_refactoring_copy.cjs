const assert=require('node:assert/strict');
const {test}=require('node:test');
const YAML=require('yaml');
const {planExtract,planExtractToFile,planInline,planMoveDefinition}=require('./dist/refactoring_copy.cjs');
const {createGraph,analyse}=require('./dist/model.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const pointer='/paths/~1items/get/responses/200/content/application~1json/schema';

for(const version of ['2.0','3.0.4','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const external of [false,true])
test(`${version} ${format} one-step schema inlining retains recursive definitions external=${external}`,async()=>{
 const root='file:///inline/api.'+format,model='file:///inline/models/node.'+format;
 const group=version==='2.0'?'/definitions':'/components/schemas';
 const ref=external?'models/node.'+format:'#'+group+'/Node';
 const node={type:'object',required:['n'],properties:{n:{type:'integer',minimum:'EXACT'},next:{$ref:external?'#':'#'+group+'/Node'}}};
 const positions=['response','parameter','property','items','allOf',...(version==='2.0'?[]:['callback','mimeHeader']),
  ...(/^3\.[12]/.test(version)?['contains','dependentSchemas','webhook']:[]),...(version.startsWith('3.2')?['itemSchema']:[])];
 for(const position of positions){
  const value={...(version==='2.0'?{swagger:version}:{openapi:version}),info:{title:'Retained recursive graph',version:'business'},
   paths:{'/p':{post:{responses:{200:{description:'Node'}}}}},'x-payload':{$ref:'literal',exact:'EXACT'}};
  if(version==='2.0')value.definitions={...(!external?{Node:node}:{})};else value.components={schemas:{...(!external?{Node:node}:{})}};
  const schemas=version==='2.0'?value.definitions:value.components.schemas,operation=value.paths['/p'].post;
  let target;
  const use={$ref:ref};
  if(position==='response'){
   if(version==='2.0'){operation.responses[200].schema=use;target='/paths/~1p/post/responses/200/schema';}
   else{operation.responses[200].content={'application/json':{schema:use}};target='/paths/~1p/post/responses/200/content/application~1json/schema';}
  }else if(position==='parameter'){
   operation.parameters=[version==='2.0'?{name:'node',in:'body',schema:use}:{name:'node',in:'query',content:{'application/json':{schema:use}}}];
   target='/paths/~1p/post/parameters/0'+(version==='2.0'?'/schema':'/content/application~1json/schema');
  }else if(['property','items','allOf','contains','dependentSchemas'].includes(position)){
   schemas.Use=position==='property'?{type:'object',properties:{value:use}}:position==='items'?{type:'array',items:use}:
    position==='allOf'?{allOf:[use]}:position==='contains'?{type:'array',contains:use}:{type:'object',dependentSchemas:{flag:use}};
   target=group+'/Use/'+({property:'properties/value',items:'items',allOf:'allOf/0',contains:'contains',dependentSchemas:'dependentSchemas/flag'})[position];
  }else if(position==='callback'){
   operation.parameters=[{name:'callback',in:'query',schema:{type:'string'}}];
   operation.callbacks={Event:{'{$request.query.callback}':{post:{responses:{200:{description:'Node',content:{'application/json':{schema:use}}}}}}}};
   target='/paths/~1p/post/callbacks/Event/{$request.query.callback}/post/responses/200/content/application~1json/schema';
  }else if(position==='webhook'){
   value.webhooks={Event:{post:{requestBody:{content:{'application/json':{schema:use}}},responses:{204:{description:'Empty'}}}}};
   target='/webhooks/Event/post/requestBody/content/application~1json/schema';
  }else if(position==='mimeHeader'){
   operation.requestBody={content:{'multipart/mixed':{schema:{type:'object',properties:{value:{type:'string'}}},encoding:{value:{headers:{'X-Data':{content:{'application/json':{schema:use}}}}}}}}};
   target='/paths/~1p/post/requestBody/content/multipart~1mixed/encoding/value/headers/X-Data/content/application~1json/schema';
  }else{
   operation.responses[200].content={'application/jsonl':{itemSchema:use}};
   target='/paths/~1p/post/responses/200/content/application~1jsonl/itemSchema';
  }
  const render=value=>(format==='json'?JSON.stringify(value):'# Retain comments 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n')).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
  const resources=[{id:root,text:render(value),generation:0},...(external?[{id:model,text:render(node),generation:0}]:[])];
  const input={root,snapshot:position+version,resources,contexts:[{root,resources:resources.map(value=>value.id)}],target:{root,resource:root,pointer:target,generation:0}};
  const before=new SourceDocument(resources[0].text,root),plan=planInline(input),output=apply(input,plan),after=new SourceDocument(output[0].text,root);
  assert.equal(after.dataNode(target+'/type').value,'object');assert.equal(after.dataJson('/x-payload'),before.dataJson('/x-payload'));
  if(external)assert.equal(output[1].text,resources[1].text);else assert.equal(after.dataJson(group+'/Node'),before.dataJson(group+'/Node'));
  const graph=createGraph({root,resources:output}).graph,edge=graph.referenceAs(root,target+'/properties/next','$ref','schema');
  assert.equal(edge.targetResource,external?model:root);assert.equal(edge.targetPointer,external?'':group+'/Node');
  const runtimeInstances=['{"n":9007199254740993,"next":{"n":9007199254740994}}','{"n":9007199254740992}','{"n":9007199254740993,"next":{"n":"bad"}}']
   .map(text=>({subject:'response-body',location:position,text,schema:{resource:root,pointer:target}}));
  for(const captured of [resources,output]){
   const proof=await evaluateSchemas({root,snapshot:position,resources:captured,runtimeInstances});
   assert.equal(proof.complete,true,JSON.stringify(proof.runtimeFindings));assert.deepEqual(proof.runtimeEvaluations.map(value=>value.valid),[true,false,false]);
  }
 }
});
for(const version of ['2.0','3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])
test(`${version} ${format} extraction to a new fragment retains the original literal and source provenance`,()=>{
 const root='file:///project/source/api.'+format,destination='file:///project/target/model.'+format,group=version==='2.0'?'/definitions':'/components/schemas',at=group+'/Holder/default';
 const schemas={Holder:{default:{type:'integer',minimum:'EXACT',description:'[Guide](guide.md) ![image][i]\n\n[i]: image.svg', 'x-bytes':'AAECA/7/AA=='}},Use:{$ref:'#'+at}};
 const data={...(version==='2.0'?{swagger:version}:{openapi:version}),info:{title:'Fragment ownership',version:'1'},paths:{},...(version==='2.0'?{definitions:schemas}:{components:{schemas}})};
 const text=(format==='json'?JSON.stringify(data):YAML.stringify(data)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={snapshot:'literal-fragment',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:at},name:'Independent',destinationResource:destination};
 const plan=planExtractToFile(input),output=[...apply(input,plan),...plan.creations.map(value=>({...value,id:value.resource,generation:0}))];
 const before=new SourceDocument(text,root),after=new SourceDocument(output[0].text,root),fragment=new SourceDocument(output[1].text,destination);
 assert.equal(after.dataJson(at),before.dataJson(at));assert.equal(fragment.dataJson('/minimum'),'9007199254740993.00');assert.equal(fragment.dataNode('/x-bytes').value,'AAECA/7/AA==');
 assert(fragment.dataNode('/description').value.includes('file:///project/source/guide.md'));
 assert.equal(plan.sourceOwnership[0].pointer,at);assert.equal(plan.transitions[0].from,at);assert.equal(plan.transitions[0].toResource,destination);
 const graph=createGraph({root,resources:output}).graph;assert.equal(graph.issues.length,0);assert.equal(graph.referenceAs(root,group+'/Independent','$ref','schema').targetResource,destination);
 if(version!=='2.0'){
  const pending={...data,components:{...data.components,examples:{Pending:{externalValue:destination}}}};
  const pendingText=(format==='json'?JSON.stringify(pending):YAML.stringify(pending)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
  const blocked={...input,resources:[{...input.resources[0],text:pendingText}]};
  assert.throws(()=>planExtractToFile(blocked),error=>error.code==='refactor.byte-context'&&error.kind==='unsupported'&&error.source?.pointer==='/components/examples/Pending/externalValue');
  assert.equal(blocked.resources[0].text,pendingText);
 }
});
for(const version of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])for(const cross of [false,true])for(const dynamic of [false,true])
test(`${version} ${format} literal specialization retains resource identity and evaluation scope cross=${cross} dynamic=${dynamic}`,async()=>{
 const root='file:///project/source/dual.'+format,destination=cross?'file:///project/target/dual.'+format:root,at='/components/schemas/Holder/default',to='/components/schemas/Independent';
 const payload={$id:'https://schemas.invalid/dual',$schema:'https://json-schema.org/draft/2020-12/schema',$anchor:'public',
  ...(dynamic?{$dynamicAnchor:'node'}:{}),type:'object',required:['n'],
  properties:{n:{type:'integer',minimum:'EXACT'},child:{[dynamic?'$dynamicRef':'$ref']:dynamic?'#node':'#public'}},
  description:'[Guide](guide.md) ![image](image.svg)','x-bytes':'AAECA/7/AA=='};
 const api=schemas=>({openapi:version,info:{title:'Dual resources',version:'1'},paths:{},components:{schemas}});
 const encode=value=>(format==='json'?JSON.stringify(value):YAML.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const resources=[{id:root,text:encode(api({Holder:{default:payload},Use:{$ref:'#'+at},Static:{$dynamicRef:'#'+at},
  ...(dynamic?{DynamicUse:{$dynamicRef:payload.$id+'#node'}}:{})})),generation:1},...(cross?[{id:destination,text:encode(api({})),generation:2}]:[])];
 const input={root,snapshot:'identified-literal',resources,contexts:[{root,resources:[root]},...(cross?[{root:destination,resources:[destination]}]:[])],target:{root,resource:root,generation:1,pointer:at},name:'Independent',destinationResource:destination};
 const samples=['{"n":9007199254740993,"child":{"n":9007199254740994}}','{"n":9007199254740992}','{"n":9007199254740993,"child":{"n":0}}'];
 const evaluate=values=>evaluateSchemas({root,snapshot:'identified-literal-oracle',resources:values,runtimeInstances:samples.map(text=>({subject:'response-body',location:'json',text,schema:{resource:root,pointer:'/components/schemas/Use'}}))});
 const before=await evaluate(resources),plan=planExtract(input),output=apply(input,plan),after=await evaluate(output),graph=createGraph({root,resources:output}).graph;
 assert.equal(before.complete,true,JSON.stringify(before.findings));assert.equal(after.complete,true,JSON.stringify(after.findings));
 assert.deepEqual(before.runtimeEvaluations.map(value=>value.valid),[true,false,false]);assert.deepEqual(after.runtimeEvaluations.map(value=>value.valid),[true,false,false]);
 assert.equal(graph.identities.get(payload.$id).length,1);assert.equal(graph.identities.get(payload.$id)[0].pointer,to);
 assert.equal(graph.scopeAs(destination,to,'schema').dialect,payload.$schema);
 assert.equal(new SourceDocument(output[0].text,root).dataJson(at),new SourceDocument(resources[0].text,root).dataJson(at));
 const copy=new SourceDocument(output.find(value=>value.id===destination).text,destination);assert.equal(copy.dataNode(to+'/description').value,payload.description);
 assert.equal(copy.dataNode(to+'/x-bytes').value,payload['x-bytes']);
 assert.equal(graph.referenceAs(destination,to+'/properties/child',dynamic?'$dynamicRef':'$ref','schema').targetPointer,to);
 assert.equal(graph.referenceAs(root,'/components/schemas/Static','$dynamicRef','schema').targetPointer,to);
 assert.equal(graph.referenceAs(root,'/components/schemas/Static','$dynamicRef','schema').dynamic,undefined);
 if(dynamic){const entry=graph.referenceAs(root,'/components/schemas/DynamicUse','$dynamicRef','schema');assert.equal(entry.value,payload.$id+'#node');assert.equal(entry.targetPointer,to);assert(entry.dynamic);}
});
for(const version of ['2.0','3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])for(const cross of [false,true])
test(`${version} ${format} extraction separates a contract from its exact literal owner cross=${cross}`,()=>{
 const root='file:///project/source/api.'+format,destination=cross?'file:///project/target/api.'+format:root,other='file:///project/consumer.'+format;
 const group=version==='2.0'?'/definitions':'/components/schemas',at=group+'/Holder/default',to=group+'/Independent';
 const payload={type:'integer',minimum:'EXACT',description:'[Guide](guide.md) ![image](image.svg)',enum:['EXACT'],
  'x-payload':{$ref:'literal only','x-bytes':'AAECA/7/AA=='}};
 const api=schemas=>({...(version==='2.0'?{swagger:version}:{openapi:version}),info:{title:'Owners',version:'1'},paths:{},
  ...(version==='2.0'?{definitions:schemas}:{components:{schemas}})});
 const encode=value=>(format==='json'?JSON.stringify(value):'# Keep source 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const resources=[{id:root,text:encode(api({Holder:{default:payload},Use:{$ref:'#'+at}})),generation:1},
  {id:other,text:encode(api({Use:{$ref:'source/api.'+format+'#'+at}})),generation:2},
  ...(cross?[{id:destination,text:encode(api({})),generation:3}]:[])];
 const input={snapshot:'literal-contract-separation',resources,contexts:[{root,resources:[root]},
  {root:other,resources:[other,root]},...(cross?[{root:destination,resources:[destination]}]:[])],target:{root,resource:root,generation:1,pointer:at},name:'Independent',destinationResource:destination};
 const original=new SourceDocument(resources[0].text,root),plan=planExtract(input),output=apply(input,plan),graph=createGraph({root,resources:output}).graph;
 const retained=new SourceDocument(output[0].text,root),copy=new SourceDocument(output.find(value=>value.id===destination).text,destination);
 assert.equal(retained.dataJson(at),original.dataJson(at));assert.equal(copy.dataJson(to+'/minimum'),'9007199254740993.00');
 assert.equal(copy.dataJson(to+'/enum'),original.dataJson(at+'/enum'));assert.equal(copy.dataJson(to+'/x-payload'),original.dataJson(at+'/x-payload'));
 assert.equal(graph.references.some(ref=>ref.resource===root&&ref.pointer===at),false);
 for(const context of input.contexts.filter(context=>context.root!==destination||!cross)){
  const next=createGraph({root:context.root,resources:output}).graph,edge=next.references.find(ref=>ref.resource===context.root&&ref.pointer===group+'/Use');
  assert.equal(edge.targetResource,destination);assert.equal(edge.targetPointer,to);assert.equal(edge.resolution,'resolved');
 }
 assert.equal(copy.dataNode(to+'/description').value,cross?'[Guide](<file:///project/source/guide.md>) ![image](<file:///project/source/image.svg>)':payload.description);
 assert.equal(plan.sourceOwnership[0].effect,'retained-literal');assert.equal(resources[0].text,encode(api({Holder:{default:payload},Use:{$ref:'#'+at}})));
});
for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const json of [false,true])for(const mode of ['ref','static-dynamic','dynamic'])for(const cross of [false,true])
test(`${version} ${json?'JSON':'YAML'} reviewed schema applicator extraction preserves siblings ${mode} cross=${cross}`,async()=>{
 const ext=json?'json':'yaml',root='file:///project/applicators.'+ext,destination=cross?'file:///project/models.'+ext:root;
 const keyword=mode==='ref'?'$ref':'$dynamicRef',reference=mode==='dynamic'?'#node':'#/components/schemas/Bound';
 const schema={[keyword]:reference,maximum:'MAX',description:'Keep sibling 雪',examples:['MIN'],'x-payload':{$ref:'literal',n:'MIN'}};
 const data={openapi:version,info:{title:'Applicator extraction',version:'unrelated'},paths:{'/items':{get:{responses:{200:{description:'Kept',content:{'application/json':{schema}}}}}}},
  components:{schemas:{Bound:{type:'integer',minimum:'MIN',...(mode==='dynamic'?{$dynamicAnchor:'node'}:{})}}}};
 const encode=value=>(json?JSON.stringify(value,null,2):'# Keep comments\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'))
  .replaceAll('"MIN"','9007199254740993.00').replaceAll('MIN','9007199254740993.00').replaceAll('"MAX"','9007199254740994.00').replaceAll('MAX','9007199254740994.00');
 const resources=[{id:root,generation:2,text:encode(data)},...(cross?[{id:destination,generation:1,text:encode({openapi:version,info:{title:'Models',version:'1'},paths:{}})}]:[])];
 const input={root,snapshot:'schema-applicator-copy',resources,contexts:[{root,resources:resources.map(r=>r.id)}],target:{root,resource:root,pointer,generation:2},name:'Extracted',destinationResource:destination};
 const frozen=resources.map(r=>r.text),page=require('./dist/model.cjs').inspect({...input,resource:root,pointer});
 assert.equal(page.schemaReferenceSiblings,true);
 if(cross&&mode==='dynamic') {
  assert.throws(()=>planExtract(input),error=>error.code==='refactor.copy.schema-resource');
  assert.deepEqual(resources.map(r=>r.text),frozen);return;
 }
 const samples=['9007199254740992.00','9007199254740993.00','9007199254740994.00','9007199254740995.00','"wrong"'];
 const evaluate=resources=>evaluateSchemas({root,snapshot:'applicator-oracle',resources,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:root,pointer}}))});
 const before=await evaluate(resources);assert.equal(before.complete,true,JSON.stringify(before.findings));
 assert.deepEqual(before.runtimeEvaluations.map(e=>e.valid),[false,true,true,false,false]);
 const plan=planExtract(input),after=apply(input,plan),graph=createGraph({root,resources:after}).graph;
 const copied=new SourceDocument(after.find(r=>r.id===destination).text,destination),at='/components/schemas/Extracted';
 assert.equal(copied.dataJson(at+'/maximum'),'9007199254740994.00');
 assert.equal(copied.dataJson(at+'/x-payload'),new SourceDocument(resources[0].text,root).dataJson(pointer+'/x-payload'));
 const edge=graph.referenceAs(destination,at,keyword,'schema');
 assert.equal(edge.targetResource,root);assert.equal(edge.targetPointer,'/components/schemas/Bound');
 assert.equal(!!edge.dynamic,mode==='dynamic');
 const checked=await evaluate(after);assert.equal(checked.complete,true,JSON.stringify(checked.findings));
 assert.deepEqual(checked.runtimeEvaluations.map(e=>e.valid),[false,true,true,false,false]);
 assert.deepEqual(resources.map(r=>r.text),frozen);
});
for(const kind of ['response','parameter'])for(const cross of [false,true])test(`Swagger definition move retains binding comments ${kind} cross=${cross}`,()=>{
 const root='file:///project/api.yaml',destination=cross?'file:///project/other.yaml':root,group=kind==='response'?'responses':'parameters';
 const text='swagger: "2.0"\ninfo: {title: Comments, version: "1"}\npaths:\n  /p:\n    get:\n'+(kind==='response'?'      responses:\n        "200": {$ref: "#/responses/Stored"}\n':'      parameters: [{$ref: "#/parameters/Stored"}]\n      responses: {"204": {description: Empty}}\n')+group+':\n  # named definition documentation\n  Stored: # binding note 雪\n'+(kind==='response'?'    description: Kept # value note\n':'    name: q # value note\n    in: query\n    type: string\n');
 const resources=[{id:root,text,generation:1},...(cross?[{id:destination,text:'swagger: "2.0"\ninfo: {title: Other, version: "1"}\npaths: {}\n',generation:2}]:[])];
 const input={snapshot:'binding-comments',resources,contexts:[{root,resources:resources.map(r=>r.id)}],target:{root,resource:root,pointer:'/'+group+'/Stored',generation:1},name:'Moved',destinationResource:destination};
 const plan=planMoveDefinition(input),after=apply(input,plan),moved=new SourceDocument(after.find(r=>r.id===destination).text,destination);
 assert(moved.text.includes('# binding note 雪'),'the removed definition key comment must survive at its destination');
 assert(moved.text.includes('# value note'));
 // The leading comment belongs to the original map's CST, outside the
 // selected definition entry. Preserve it with that untouched owner.
 assert(after.find(r=>r.id===root).text.includes('# named definition documentation'));
 assert.equal(moved.node('/'+group+'/Moved/'+(kind==='response'?'description':'name')).value,kind==='response'?'Kept':'q');
 assert.equal(analyse({root,resources:after}).status,'complete');assert.equal(input.resources[0].text,text);
});
for(const json of [false,true])for(const kind of ['response','parameter'])for(const sameName of [false,true])test(`Swagger definition move repairs consumers without an invalid forwarder ${kind} ${json?'JSON':'YAML'} sameName=${sameName}`,()=>{
 const ext=json?'json':'yaml',root='file:///project/api.'+ext,destination='file:///project/other.'+ext,group=kind==='parameter'?'parameters':'responses';
 const authored=kind==='parameter'?{name:'q',in:'query',type:'array',items:{type:'integer'},collectionFormat:'multi'}:{description:'Stored',schema:{$ref:'#/definitions/Model'},examples:{'application/json':{id:'EXACT_NUMBER',$ref:'literal'}}};
 const operation=kind==='parameter'?{parameters:[{$ref:'#/'+group+'/Stored'}],responses:{204:{description:'Empty'}}}:{responses:{200:{$ref:'#/'+group+'/Stored'},201:{$ref:'#/'+group+'/Stored'}}};
 const document={swagger:'2.0',info:{title:'Move',version:'1'},paths:{'/items':{get:operation}},[group]:{Stored:authored},definitions:{Model:{type:'object',properties:{id:{type:'integer',minimum:'EXACT_NUMBER'}}}}};
 const encode=value=>(json?JSON.stringify(value,null,2):'# keep 雪\n'+YAML.stringify(value)).replaceAll('"EXACT_NUMBER"','9007199254740993.00').replaceAll('EXACT_NUMBER','9007199254740993.00');
 const resources=[{id:root,text:encode(document),generation:1},{id:destination,text:encode({swagger:'2.0',info:{title:'Destination',version:'1'},paths:{}}),generation:2}];
 const name=sameName?'Stored':'Moved',input={snapshot:'move-swagger-definition',resources,contexts:[{root,resources:[root,destination]}],target:{root,resource:root,pointer:'/'+group+'/Stored',generation:1},name,destinationResource:destination};
 const frozen=JSON.stringify(resources),plan=planMoveDefinition(input),after=apply(input,plan),api=new SourceDocument(after[0].text,root),other=new SourceDocument(after[1].text,destination);
 assert.equal(plan.preservedBinding,undefined);assert.deepEqual(plan.removedBinding,{resource:root,pointer:'/'+group+'/Stored'});
 assert.equal(api.nodes.has('/'+group+'/Stored'),false);assert(other.nodes.has('/'+group+'/'+name));
 assert(plan.usages.every(usage=>!usage.bindingRetained));
 const graph=createGraph({root,resources:after}).graph;assert.deepEqual(graph.issues,[]);
 assert(graph.references.filter(ref=>ref.resource===root&&ref.kind===kind).every(ref=>ref.targetResource===destination&&ref.targetPointer==='/'+group+'/'+name));
 if(kind==='response'){assert.equal(other.node('/responses/'+name+'/schema/$ref').value,'api.'+ext+'#/definitions/Model');assert(other.text.includes('9007199254740993.00'));}
 assert.equal(analyse({root,resources:after}).status,'complete');assert.equal(JSON.stringify(resources),frozen);
});
test('Swagger security definition relocation reports its unrepresentable reference binding',()=>{
 const root='file:///project/api.json',destination='file:///project/other.json';
 const resources=[{id:root,text:JSON.stringify({swagger:'2.0',info:{title:'Security',version:'1'},paths:{},securityDefinitions:{Key:{type:'apiKey',in:'header',name:'X-Key'}},security:[{Key:[]}]}),generation:1},{id:destination,text:JSON.stringify({swagger:'2.0',info:{title:'Other',version:'1'},paths:{}}),generation:2}];
 const frozen=JSON.stringify(resources);
 assert.throws(()=>planMoveDefinition({snapshot:'security-relocation',resources,contexts:[{root,resources:[root,destination]}],target:{root,resource:root,pointer:'/securityDefinitions/Key',generation:1},destinationResource:destination,name:'Key'}),error=>error.code==='refactor.copy.binding');
 assert.equal(JSON.stringify(resources),frozen);
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`inline response retains the reachable dynamic-scope refusal ${version} ${json?'JSON':'YAML'}`,()=>{
 const root='file:///project/dynamic.'+(json?'json':'yaml'),at='/paths/~1p/get/responses/200';
 const value={openapi:version,info:{title:'Dynamic scope',version:'1'},paths:{'/p':{get:{responses:{200:{$ref:'#/components/responses/Shared'}}}}},components:{responses:{Shared:{description:'Shared',content:{'application/json':{schema:{$ref:'#/components/schemas/Node'}}}}},schemas:{Node:{$id:'https://schemas.invalid/node',$dynamicAnchor:'node',type:'object',properties:{next:{$dynamicRef:'#node'}}}}}};
 const text=json?JSON.stringify(value):YAML.stringify(value),input={root,snapshot:'dynamic-inline',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:at}};
 assert.throws(()=>planInline(input),error=>error.code==='refactor.inline.schema-resource');assert.equal(input.resources[0].text,text);
});
for(const version of ['2.0','3.0.4','3.1.2','3.2.1'])for(const json of [false,true])for(const external of [false,true])test(`inline response retains its unchanged recursive schema target ${version} ${json?'JSON':'YAML'} external=${external}`,async()=>{
 const legacy=version==='2.0',ext=json?'json':'yaml',root='file:///project/api.'+ext,shared='file:///project/responses.'+ext;
 const nodePointer=legacy?'/definitions/Node':'/components/schemas/Node',responsePointer=legacy?'/responses/Shared':'/components/responses/Shared',at='/paths/~1p/get/responses/200';
 const schema={$ref:(external?'api.'+ext:'')+'#'+nodePointer},example={value:'EXACT_NUMBER',$ref:'literal data'};
 const response={description:'Recursive response',...(legacy?{schema,examples:{'application/json':example}}:{content:{'application/json':{schema,example}}})};
 const node={type:'object',required:['value'],properties:{value:{type:'integer',minimum:'EXACT_NUMBER'},next:{$ref:'#'+nodePointer}}};
 const value={...(legacy?{swagger:version}:{openapi:version}),info:{title:'Recursive response',version:'1'},...(legacy?{produces:['application/json']}:{}),
  paths:{'/p':{get:{responses:{200:{$ref:external?'responses.'+ext+'#/Shared':'#'+responsePointer}}}}},
  ...(legacy?{definitions:{Node:node},...(!external?{responses:{Shared:response}}:{})}:{components:{schemas:{Node:node},...(!external?{responses:{Shared:response}}:{})}})};
 const encode=value=>(json?JSON.stringify(value):'# Keep 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n')).replaceAll('"EXACT_NUMBER"','9007199254740993.00').replaceAll('EXACT_NUMBER','9007199254740993.00');
 const resources=[{id:root,text:encode(value),generation:1},...(external?[{id:shared,text:encode({Shared:response}),generation:2}]:[])];
 const input={root,snapshot:'recursive-response',resources,contexts:[{root,resources:resources.map(r=>r.id)}],target:{root,resource:root,generation:1,pointer:at}};
 const before=new SourceDocument(resources[0].text,root),plan=planInline(input),after=apply(input,plan),doc=new SourceDocument(after[0].text,root);
 assert.equal(plan.changes.length,1);assert.equal(plan.changes[0].resource,root);
 assert.equal(doc.text.slice(...doc.node(nodePointer).range),before.text.slice(...before.node(nodePointer).range));
 if(external)assert.equal(after[1].text,resources[1].text);
 else assert.equal(doc.text.slice(...doc.node(responsePointer).range),before.text.slice(...before.node(responsePointer).range));
 const graph=createGraph({root,resources:after}).graph,schemaPointer=at+(legacy?'/schema':'/content/application~1json/schema');
 const reference=graph.references.find(r=>r.resource===root&&r.pointer===schemaPointer&&r.keyword==='$ref');
 assert.equal(reference.targetResource,root);assert.equal(reference.targetPointer,nodePointer);assert.equal(graph.issues.length,0);
 const raw=doc.dataJson(at);assert(raw.includes('9007199254740993.00'));assert(raw.includes('literal data'));
 const instances=['{"value":9007199254740993}','{"value":9007199254740993,"next":{"value":9007199254740994}}','{"value":9007199254740992}'];
 for(const [capture,resource,pointer]of [[resources,external?shared:root,(external?'/Shared':responsePointer)+(legacy?'/schema':'/content/application~1json/schema')],[after,root,schemaPointer]]){
  const evaluated=await evaluateSchemas({root,snapshot:'inline-invariants',resources:capture,runtimeInstances:instances.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource,pointer}}))});
  assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.runtimeEvaluations.map(e=>e.valid),[true,true,false]);
 }
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`inlining a selected literal value cannot silently change its data meaning ${version} ${json}`,()=>{
 const root='file:///project/root.'+(json?'json':'yaml'),value={openapi:version,info:{title:'Selected data',version:'1'},paths:{},components:{schemas:{Value:{type:'string'},Literal:{const:{$ref:'#/components/schemas/Value'}},Use:{$ref:'#/components/schemas/Literal/const'}}}},text=json?JSON.stringify(value):YAML.stringify(value),input={snapshot:'inline-selected-data',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:'/components/schemas/Literal/const'}};
 assert.throws(()=>planInline(input),error=>error.code==='refactor.literal.ownership');assert.equal(input.resources[0].text,text);
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])for(const identified of [false,true])test(`inline keeps a copied payload distinct from its separate schema consumer ${version} ${json} identified=${identified}`,async()=>{
 const ext=json?'json':'yaml',root='file:///project/source/root.'+ext,destination='file:///project/destination/root.'+ext,other=(identified?'https://identities.invalid/':'file:///project/source/')+'other.'+ext,api=components=>({openapi:version,info:{title:'Occurrence ownership',version:'1'},paths:{},components});
 const payload={...(identified?{$id:'https://identities.invalid/data',$dynamicAnchor:'data'}:{}),$ref:'other.'+ext+'#/Thing',description:'Literal [link](../not-loaded)','x-number':111},source=api({schemas:{Model:{const:payload,examples:[{...payload},{...payload,'x-number':222}]},Inner:{$ref:'#/components/schemas/Model/const'}}}),target=api({schemas:{Use:{$ref:'../source/root.'+ext+'#/components/schemas/Model'}}});
 const render=value=>(json?JSON.stringify(value):'# preserved 雪😀\r\n'+YAML.stringify(value).replaceAll('\n','\r\n')).replaceAll('111','9007199254740993.00').replaceAll('222','9007199254740992'),resources=[{id:root,text:render(source),generation:1},{id:destination,text:render(target),generation:2},{id:other,text:render({Thing:{type:'string'}}),generation:3}],input={snapshot:'inline-data-occurrence',resources,contexts:[{root,resources:resources.map(value=>value.id)},{root:destination,resources:resources.map(value=>value.id)}],target:{root:destination,resource:destination,generation:2,pointer:'/components/schemas/Use'}},frozen=resources.map(value=>value.text);
 const evaluated=await evaluateSchemas({root:destination,snapshot:'inline-original',resources});assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.evaluations.map(value=>value.valid),[true,false]);
 const plan=planInline(input),after=apply(input,plan),before=new SourceDocument(resources[0].text,root),copied=new SourceDocument(after[1].text,destination);
 assert.equal(copied.dataJson('/components/schemas/Use/const'),before.dataJson('/components/schemas/Model/const'));assert.equal(copied.dataJson('/components/schemas/Use/examples'),before.dataJson('/components/schemas/Model/examples'));
 assert.equal(after[0].text,resources[0].text);assert.equal(after[2].text,resources[2].text);assert.equal(plan.changes.length,1);
 assert.equal(createGraph({root:destination,resources:after}).graph.references.some(ref=>ref.pointer==='/components/schemas/Use/const'),false,'An external schema interpretation must not be invented in a copied literal payload');
 const checked=await evaluateSchemas({root:destination,snapshot:'inline-copied',resources:after});assert.equal(checked.complete,true,JSON.stringify(checked.findings));assert.deepEqual(checked.evaluations.map(value=>value.valid),[true,false,true,false]);
 if(identified){const graph=createGraph({root:destination,resources:after}).graph;assert.equal(graph.identities.get('https://identities.invalid/data').length,1);assert.equal(graph.dynamicAnchors.get('data').length,1);}
 assert.deepEqual(resources.map(value=>value.text),frozen);
});
function fixture(version,json=false){
 const root='file:///project/root.'+(json?'json':'yaml'),part='file:///project/part.'+(json?'json':'yaml');
 const schema={type:'object',properties:{value:{type:['integer','null'],minimum:0},other:{$ref:'#/components/schemas/Other'}},required:['value'],description:'Line one\n😀 Line two\n',examples:[{value:123,$ref:'payload data'}],'x-kept':{$ref:'not a dependency'}};
 const data={openapi:version,info:{title:'Copy',version:'1'},paths:{'/items':{get:{responses:{'200':{description:'OK',content:{'application/json':{schema,example:{$ref:'payload data'}}}},'204':{description:'No body'}}}}},components:{schemas:{Other:{type:'string'},Use:{$ref:'part.'+(json?'json':'yaml')+'#/Use'}}},'x-value':{$ref:'#'+pointer}};
 let text=json?JSON.stringify(data,null,2):'# retained\r\n'+YAML.stringify(data).replaceAll('\n','\r\n').replace('          schema:', '          schema:');
 text=text.replace('minimum: 0','minimum: 0 # exact comment').replace(json?'"value": 123':'value: 123',json?'"value": 900719925474099312345':'value: 900719925474099312345');
 const external={Use:{$ref:'root.'+(json?'json':'yaml')+'#'+pointer+'/properties/value'}};
 return {snapshot:'copy',root,resources:[{id:root,text,generation:4,identity:'root'},{id:part,text:json?JSON.stringify(external,null,2):YAML.stringify(external),generation:7,identity:'part'}],contexts:[{root,resources:[root,part]}],target:{root,resource:root,generation:4,pointer}};
}
function apply(input,plan){return input.resources.map(r=>{let text=r.text;for(const edit of plan.edits.filter(e=>e.buffer===r.id).sort((a,b)=>b.start-a.start)){assert.equal(text.slice(edit.start,edit.end),edit.expected);text=text.slice(0,edit.start)+edit.replacement+text.slice(edit.end);}return {...r,text};});}
for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const json of [false,true])for(const cross of [false,true])for(const dynamic of [false,true])
test(`complete nested resource extraction preserves canonical identities and evaluation ${version} json=${json} cross=${cross} dynamic=${dynamic}`,async()=>{
 const {schemaAddress}=require('./dist/reference_graph.cjs'),{coldGraph}=require('./dist/reference_selection.cjs');
 const ext=json?'json':'yaml',root='file:///project/source/api.'+ext,destination=cross?'file:///project/destination/models.'+ext:root,entry='file:///project/consumer.'+ext;
 const at='/components/schemas/Owner/properties/child',to='/components/schemas/Stored',dialect='https://json-schema.org/draft/2020-12/schema';
 const schema={$id:'node',$schema:dialect,$anchor:'public',...(dynamic?{$dynamicAnchor:'node'}:{}),type:'object',
  $defs:{Leaf:{$id:'leaf',$schema:dialect,$anchor:'leaf',type:'integer',minimum:'EXACT'}},
  properties:{n:{$dynamicRef:'leaf#leaf'},child:{[dynamic?'$dynamicRef':'$ref']:dynamic?'#node':'#public'}},required:['n'],unevaluatedProperties:false,
  description:'[Guide](guide.md) 雪','x-unrelated':{$ref:'literal',n:'EXACT'}};
 const api=schemas=>({openapi:version,info:{title:'Resources',version:'1'},paths:{},components:{schemas}});
 const source=api({Owner:{$id:'https://schemas.invalid/parent/',type:'object',properties:{child:schema}}});
 const render=value=>(json?JSON.stringify(value,null,2):'# Keep resource comments\r\n'+YAML.stringify(value).replaceAll('\n','\r\n')).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const resources=[{id:root,text:render(source),generation:1},...(cross?[{id:destination,text:render({...api({}),jsonSchemaDialect:dialect}),generation:2}]:[]),
  {id:entry,text:render(api({Independent:{$ref:'source/api.'+ext+'#'+at+'/$defs/Leaf'}})),generation:3}];
 const input={root,snapshot:'nested-resource',resources,contexts:[{root,resources:[root]},...(cross?[{root:destination,resources:[destination]}]:[]),{root:entry,resources:[entry,root]}],target:{root,resource:root,pointer:at,generation:1},name:'Stored',destinationResource:destination};
 const samples=['{"n":9007199254740993,"child":{"n":9007199254740994}}','{"n":9007199254740992}','{"n":9007199254740993,"child":{"n":"bad"}}'];
 const evaluate=resources=>evaluateSchemas({root,resources,snapshot:'resource-oracle',runtimeInstances:samples.map(text=>({subject:'response-body',location:'resource',text,schema:{resource:root,pointer:at}}))});
 const beforeGraph=createGraph({root,resources}).graph,before=await evaluate(resources);
 assert.equal(before.complete,true,JSON.stringify(before.findings));assert.deepEqual(before.runtimeEvaluations.map(result=>result.valid),[true,false,false]);
 const plan=planExtract(input),afterResources=apply(input,plan),afterGraph=createGraph({root,resources:afterResources}).graph;
 assert.equal(afterGraph.issues.length,0);
 for(const old of beforeGraph.scopesFor('schema').filter(scope=>scope.pointer===at||scope.pointer.startsWith(at+'/'))){
  const next=afterGraph.scopeAs(destination,to+old.pointer.slice(at.length),'schema');
  assert.equal(schemaAddress(next),schemaAddress(old));assert.equal(next.dialect,old.dialect);
 }
 const copied=new SourceDocument(afterResources.find(resource=>resource.id===destination).text,destination);
 assert.equal(copied.node(to+'/$id').value,'https://schemas.invalid/parent/node');
 assert.equal(copied.node(to+'/$defs/Leaf/$id').value,'leaf');assert.equal(copied.node(to+'/$schema').value,dialect);
 assert.equal(copied.node(to+'/description').value,schema.description);assert(copied.dataJson(to+'/x-unrelated').includes('9007199254740993.00'));
 assert.equal(afterGraph.identities.get('https://schemas.invalid/parent/node').length,1);
 assert.equal(afterGraph.anchors.get('https://schemas.invalid/parent/node#public').length,1);
 for(const rootId of [root,entry]){
  const cold=coldGraph(rootId,afterResources);assert.equal(cold.issues.length,0);
  if(rootId===entry){const edge=cold.referenceAs(entry,'/components/schemas/Independent','$ref','schema');assert.equal(edge.targetResource,destination);assert.equal(edge.targetPointer,to+'/$defs/Leaf');}
 }
 const after=await evaluate(afterResources);assert.equal(after.complete,true,JSON.stringify(after.findings));assert.deepEqual(after.runtimeEvaluations.map(result=>result.valid),[true,false,false]);
 assert.equal(resources[0].text,render(source));
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`dynamic candidates alone do not authorize an added binding frame ${version} ${json}`,()=>{
 const root='file:///project/scope.'+(json?'json':'yaml'),at='/components/schemas/Owner/properties/child';
 const data={openapi:version,info:{title:'Scope proof',version:'1'},paths:{},components:{schemas:{Owner:{$id:'https://schemas.invalid/owner',$dynamicAnchor:'node',
  properties:{child:{$id:'child',$dynamicAnchor:'node',type:'object',properties:{next:{$dynamicRef:'#node'}}}}}}}};
 const text=json?JSON.stringify(data):YAML.stringify(data),input={root,snapshot:'binding-frame',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,pointer:at,generation:1},name:'Stored'};
 const graph=createGraph(input).graph;assert.equal(graph.issues.length,0);assert.equal(graph.dynamicAnchors.get('node').length,2);
 assert.throws(()=>planExtract(input),error=>error.code==='refactor.schema.dynamic-scope');assert.equal(input.resources[0].text,text);
});
for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const json of [false,true])for(const id of ['https://schemas.invalid/public','./public'])for(const cross of [false,true])
test(`complete definition movement retains authored IDs, anchors and static recursion ${version} ${json} ${id} cross=${cross}`,async()=>{
 const {coldGraph}=require('./dist/reference_selection.cjs'),ext=json?'json':'yaml',root='file:///project/source/api.'+ext,destination=cross?'file:///project/deep/models.'+ext:root;
 const model={$id:id,$anchor:'public',type:'object',properties:{n:{type:'integer'},next:{$ref:'#public'}},required:['n']};
 const api=schemas=>({openapi:version,info:{title:'Move identity',version:'1'},paths:{},components:{schemas}}),render=data=>json?JSON.stringify(data):YAML.stringify(data);
 const resources=[{id:root,text:render(api({Public:model,Use:{$ref:'#/components/schemas/Public'}})),generation:1},...(cross?[{id:destination,text:render(api({})),generation:2}]:[])];
 const input={root,resources,snapshot:'identified-move',contexts:[{root,resources:resources.map(resource=>resource.id)},...(cross?[{root:destination,resources:[destination]}]:[])],target:{root,resource:root,pointer:'/components/schemas/Public',generation:1},name:'Stored',destinationResource:destination};
 const plan=planMoveDefinition(input),after=apply(input,plan),cold=coldGraph(root,after),stored=new SourceDocument(after.find(resource=>resource.id===destination).text,destination);
 assert.equal(cold.issues.length,0);assert.equal(cold.scope(destination,'/components/schemas/Stored').base,new URL(id,root).href);
 assert.equal(stored.node('/components/schemas/Stored/$id').value,cross&&id==='./public'?new URL(id,root).href:id);
 assert.equal(stored.node('/components/schemas/Stored/properties/next/$ref').value,'#public');
 assert.equal(cold.identities.get(new URL(id,root).href).length,1);assert.equal(cold.anchors.get(new URL(id,root).href+'#public').length,1);
 const runtimeInstances=['{"n":1,"next":{"n":2}}','{"n":1,"next":{"n":"bad"}}'].map(text=>({subject:'response-body',location:'recursive',text,schema:{resource:root,pointer:'/components/schemas/Use'}}));
 for(const values of [resources,after]){const result=await evaluateSchemas({root,resources:values,snapshot:'move-oracle',runtimeInstances});assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);}
});
for(const version of ['3.1.2','3.2.1'])test(`same-resource named anchor extraction retains canonical binding ${version}`,()=>{
 const root='file:///project/anchors.json',at='/components/schemas/Owner/properties/child',schema={$anchor:'named',type:'integer'};
 const data={openapi:version,info:{title:'Anchors',version:'1'},paths:{},components:{schemas:{Owner:{properties:{child:schema}},Use:{$ref:'#named'}}}};
 const input={root,snapshot:'anchor',resources:[{id:root,text:JSON.stringify(data),generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,pointer:at,generation:1},name:'Stored'};
 const after=apply(input,planExtract(input)),graph=createGraph({root,resources:after}).graph;
 assert.equal(graph.anchors.get(root+'#named').length,1);assert.equal(graph.referenceAs(root,'/components/schemas/Use','$ref','schema').targetPointer,'/components/schemas/Stored');
 const destination='file:///project/models.json',cross={...input,destinationResource:destination,resources:[...input.resources,{id:destination,text:JSON.stringify({...data,components:{schemas:{}}}),generation:1}]};
 assert.throws(()=>planExtract(cross),error=>error.code==='refactor.copy.schema-resource');
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])for(const relative of [false,true])test(`independently interpreted literal resources require faithful identifier ownership ${version} ${json} relative=${relative}`,()=>{
 const ext=json?'json':'yaml',root='file:///project/source/api.'+ext,destination='file:///project/destination/api.'+ext,at='/components/schemas/Container';
 const payload={$id:relative?'data':'https://schemas.invalid/data',$anchor:'data',type:'integer'},api=schemas=>({openapi:version,info:{title:'Independent resource',version:'1'},paths:{},components:{schemas}}),render=data=>json?JSON.stringify(data):YAML.stringify(data);
 const resources=[{id:root,text:render(api({Container:{const:payload},Independent:{$ref:'#'+at+'/const'}})),generation:1},{id:destination,text:render(api({})),generation:1}];
 const input={root,resources,snapshot:'independent-identity',contexts:[{root,resources:[root]},{root:destination,resources:[destination]}],target:{root,resource:root,generation:1,pointer:at},destinationResource:destination,name:'Stored'};
 if(relative){assert.throws(()=>planMoveDefinition(input),error=>error.code==='refactor.literal.ownership');return;}
 const after=apply(input,planMoveDefinition(input)),graph=createGraph({root,resources:after}).graph;
 assert.equal(graph.issues.length,0);assert.equal(graph.identities.get(payload.$id).length,1);
 assert.equal(graph.referenceAs(root,'/components/schemas/Independent','$ref','schema').targetPointer,'/components/schemas/Stored/const');
 assert.equal(new SourceDocument(after[1].text,destination).dataJson('/components/schemas/Stored/const'),new SourceDocument(resources[0].text,root).dataJson(at+'/const'));
});
for(const version of ['2.0','3.0.4'])for(const json of [false,true])test(`older families retain literal identifier-like payloads when extracting ${version} ${json}`,()=>{
 const swagger=version==='2.0',root='file:///project/legacy.'+(json?'json':'yaml'),at='/paths/~1/get/responses/200'+(swagger?'/schema':'/content/application~1json/schema');
 const schema={type:'integer','x-data':{$id:'literal',$anchor:'literal',$dynamicRef:'literal'}},response={description:'Value',...(swagger?{schema}:{content:{'application/json':{schema}}})};
 const data={...(swagger?{swagger:version}:{openapi:version}),info:{title:'Legacy control',version:'1'},paths:{'/':{get:{responses:{200:response}}}}};
 const input={root,resources:[{id:root,text:json?JSON.stringify(data):YAML.stringify(data),generation:1}],snapshot:'legacy-identity',contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:at},name:'Stored'};
 const after=apply(input,planExtract(input)),graph=createGraph({root,resources:after}).graph;
 assert.equal(graph.issues.length,0);assert.equal(graph.identities.has('file:///project/literal'),false);
 assert.deepEqual(new SourceDocument(after[0].text,root).node((swagger?'/definitions':'/components/schemas')+'/Stored/x-data').value,schema['x-data']);
});
test('relocation cannot introduce conflicting identities from separately captured entry graphs',()=>{
 const root='file:///project/a.json',destination='file:///project/b.json',schema={$id:'https://schemas.invalid/duplicate',$anchor:'public',type:'integer'};
 const api=schemas=>JSON.stringify({openapi:'3.2.1',info:{title:'Collision',version:'1'},paths:{},components:{schemas}});
 const resources=[{id:root,text:api({Public:schema}),generation:1},{id:destination,text:api({Existing:schema}),generation:1}],frozen=resources.map(resource=>resource.text);
 const input={root,resources,snapshot:'collision',contexts:[{root,resources:[root]},{root:destination,resources:[destination]}],target:{root,resource:root,generation:1,pointer:'/components/schemas/Public'},name:'Stored',destinationResource:destination};
 assert.throws(()=>planMoveDefinition(input),error=>error.code==='refactor.proof');assert.deepEqual(resources.map(resource=>resource.text),frozen);
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`complete independently referenced schema roots can be extracted without duplicate IDs ${version} ${json}`,async()=>{
 const {coldGraph}=require('./dist/reference_selection.cjs'),ext=json?'json':'yaml',root='file:///project/api.'+ext,external='file:///project/schemas/independent.'+ext;
 const data={openapi:version,info:{title:'Independent root',version:'1'},paths:{},components:{schemas:{Use:{$ref:'schemas/independent.'+ext}}}};
 const schema={$id:'https://schemas.invalid/independent',$schema:'https://json-schema.org/draft/2020-12/schema',$anchor:'public',type:'integer',minimum:1};
 const render=value=>json?JSON.stringify(value):YAML.stringify(value),resources=[{id:root,text:render(data),generation:1},{id:external,text:render(schema),generation:1}];
 const input={root,resources,snapshot:'independent-root',contexts:[{root,resources:[root,external]}],target:{root,resource:external,pointer:'',generation:1},name:'Stored',destinationResource:root};
 const after=apply(input,planExtract(input)),graph=coldGraph(root,after);
 assert.equal(graph.issues.length,0);assert.equal(graph.identities.get(schema.$id).length,1);
 assert.equal(graph.referenceAs(root,'/components/schemas/Use','$ref','schema').targetPointer,'/components/schemas/Stored');
 assert.equal(new SourceDocument(after[0].text,root).node('/components/schemas/Stored/$id').value,schema.$id);
 for(const values of [resources,after]){const result=await evaluateSchemas({root,resources:values,snapshot:'independent-root-oracle',runtimeInstances:['1','0'].map(text=>({subject:'response-body',location:'independent',text,schema:{resource:root,pointer:'/components/schemas/Use'}}))});assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);}
});
for(const identified of [false,true])test(`partial independent file-root resources are not anonymous native contexts identified=${identified}`,()=>{
 const root='file:///project/api.json',external='file:///project/schema.json';
 const resources=[{id:root,generation:1,text:JSON.stringify({openapi:'3.2.1',info:{title:'Boundary',version:'1'},paths:{},components:{schemas:{Use:{$ref:'schema.json'}}}})},
  {id:external,generation:1,text:JSON.stringify({...(identified?{$id:'https://schemas.invalid/root'}:{$schema:'https://json-schema.org/draft/2020-12/schema'}),properties:{child:{type:'integer'}}})}];
 const input={root,resources,snapshot:'independent-boundary',contexts:[{root,resources:[root,external]}],target:{root,resource:external,pointer:'/properties/child',generation:1},destinationResource:root,name:'Child'};
 assert.throws(()=>planExtract(input),error=>error.code==='refactor.copy.schema-resource');
});
for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const json of [false,true])test(`unrelated dynamic resources do not block a proved static dynamicRef extraction ${version} ${json}`,async()=>{
 const ext=json?'json':'yaml',root='file:///project/source/api.'+ext,destination='file:///project/deep/models.'+ext;
 const schema={$dynamicRef:'#/components/schemas/Bound',maximum:10},api=schemas=>({openapi:version,info:{title:'Static and dynamic',version:'1'},paths:{},components:{schemas}});
 const data={...api({Bound:{type:'integer',minimum:1},Dynamic:{$id:'https://schemas.invalid/dynamic',$dynamicAnchor:'node',properties:{next:{$dynamicRef:'#node'}}}}),paths:{'/items':{get:{responses:{200:{description:'Value',content:{'application/json':{schema}}}}}}}};
 const render=value=>json?JSON.stringify(value):YAML.stringify(value),resources=[{id:root,text:render(data),generation:1},{id:destination,text:render(api({})),generation:1}];
 const input={root,resources,snapshot:'static-with-unrelated-dynamic',contexts:[{root,resources:[root]},{root:destination,resources:[destination]}],target:{root,resource:root,generation:1,pointer},name:'Stored',destinationResource:destination};
 const after=apply(input,planExtract(input)),graph=createGraph({root,resources:after}).graph;
 assert.equal(graph.issues.length,0);assert.equal(graph.referenceAs(destination,'/components/schemas/Stored','$dynamicRef','schema').dynamic,undefined);
 assert.equal(graph.referenceAs(root,'/components/schemas/Dynamic/properties/next','$dynamicRef','schema').dynamic.anchor,'node');
 for(const values of [resources,after]){
  const result=await evaluateSchemas({root,resources:values,snapshot:'static-oracle',runtimeInstances:['1','0','11','"1"'].map(text=>({subject:'response-body',location:'static',text,schema:{resource:root,pointer}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false,false,false]);
 }
});
for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const json of [false,true])for(const dialect of [undefined,'https://json-schema.org/draft/2020-12/schema'])test(`${version} ${json?'JSON':'YAML'} inline preserves a static dynamicRef and explicit dialect=${dialect!==undefined}`,async()=>{
 const root='file:///project/api.'+(json?'json':'yaml'),data={openapi:version,info:{title:'Static reference',version:'api'},paths:{},components:{schemas:{
  Bound:{type:'integer',minimum:'EXACT'},Model:{...(dialect?{$schema:dialect}:{}),$dynamicRef:'#/components/schemas/Bound'},Use:{$ref:'#/components/schemas/Model'}
 }},'x-literal':{$dynamicRef:'not-a-contract-reference',n:'EXACT'}};
 const text=(json?JSON.stringify(data):'# Keep source 雪\r\n'+YAML.stringify(data).replaceAll('\n','\r\n')).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'static-inline',resources:[{id:root,text,generation:3}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:3,pointer:'/components/schemas/Use'}};
 assert.equal(analyse(input).status,'complete');const plan=planInline(input),after=apply(input,plan),graph=createGraph({...input,resources:after}).graph;
 const edge=graph.referenceAs(root,'/components/schemas/Use','$dynamicRef','schema');assert.equal(edge.resolution,'resolved');assert.equal(edge.targetPointer,'/components/schemas/Bound');assert.equal(edge.dynamic,undefined);
 const doc=new SourceDocument(after[0].text,root);assert.equal(doc.dataNode('/components/schemas/Use/$schema')?.value,dialect);assert.equal(doc.dataJson('/x-literal'),new SourceDocument(text,root).dataJson('/x-literal'));
 const values=['9007199254740993.00','9007199254740992.00','"wrong"'];
 const evaluate=resources=>evaluateSchemas({...input,resources,runtimeInstances:values.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:root,pointer:'/components/schemas/Use'}}))});
 const before=await evaluate(input.resources),converted=await evaluate(after);assert.equal(before.complete,true,JSON.stringify(before.findings));assert.equal(converted.complete,true,JSON.stringify(converted.findings));assert.deepEqual(converted.runtimeEvaluations.map(v=>v.valid),before.runtimeEvaluations.map(v=>v.valid));
 assert.equal(input.resources[0].text,text);assert.equal(analyse({...input,resources:after}).status,'complete');
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`same-file inline preserves documentation across different schema URI bases ${version} ${json}`,async()=>{
 const root='file:///project/api.'+(json?'json':'yaml'),at='/components/schemas/Owner/properties/child';
 const data={openapi:version,info:{title:'Inline URI base',version:'1'},paths:{},components:{schemas:{Model:{type:'integer',description:'[Guide](guide.md)'},Owner:{$id:'https://schemas.invalid/owner',properties:{child:{$ref:root+'#/components/schemas/Model'}}}}}};
 const text=json?JSON.stringify(data):YAML.stringify(data),input={root,resources:[{id:root,text,generation:1}],snapshot:'inline-base',contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:at}};
 const after=apply(input,planInline(input)),doc=new SourceDocument(after[0].text,root);
 assert(doc.node(at+'/description').value.includes('file:///project/guide.md'));assert.equal(doc.node('/components/schemas/Model/description').value,'[Guide](guide.md)');
 for(const resources of [input.resources,after]){
  const result=await evaluateSchemas({root,resources,snapshot:'inline-base-oracle',runtimeInstances:['1','"1"'].map(text=>({subject:'response-body',location:'inline',text,schema:{resource:root,pointer:at}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);
 }
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])for(const external of [false,true])test(`inline preserves acyclic internal references without expanding their shared targets ${version} ${json} external=${external}`,async()=>{
 const ext=json?'json':'yaml',source='file:///project/source/root.'+ext,destination=external?'file:///project/destination/root.'+ext:source;
 const model={type:'object',$defs:{'a/b~1':{type:'integer',minimum:111}},properties:{value:{$ref:'#/components/schemas/Model/$defs/a~1b~01'}},required:['value'],unevaluatedProperties:false};
 const samples=[{value:111},{value:222},{value:'not an integer'}],use={$ref:(external?'../source/root.'+ext:'')+'#/components/schemas/Model',examples:samples};
 const api=schemas=>({openapi:version,info:{title:'Acyclic inline',version:'1'},paths:{},components:{schemas}}),render=value=>(json?JSON.stringify(value):'# retain 雪😀\r\n'+YAML.stringify(value).replaceAll('\n','\r\n')).replaceAll('111','9007199254740993').replaceAll('222','9007199254740992');
 const resources=[{id:source,text:render(api({Model:model,...(external?{}:{Use:use})})),generation:1},...(external?[{id:destination,text:render(api({Use:use})),generation:2}]:[])],input={snapshot:'acyclic-inline',resources,contexts:[{root:destination,resources:resources.map(value=>value.id)},...(external?[{root:source,resources:[source]}]:[])],target:{root:destination,resource:destination,pointer:'/components/schemas/Use',generation:external?2:1}},original=resources.map(value=>value.text);
 const before=await evaluateSchemas({root:destination,snapshot:'acyclic-original',resources});assert.equal(before.complete,true,JSON.stringify(before.findings));assert.deepEqual(before.evaluations.map(value=>value.valid),[true,false,false]);
 const plan=planInline(input),after=apply(input,plan),copied=new SourceDocument(after.at(-1).text,destination),graph=createGraph({root:destination,resources:after}).graph;
 assert.equal(graph.issues.length,0);const consumer=graph.references.find(value=>value.resource===destination&&value.pointer==='/components/schemas/Use/allOf/0/properties/value');assert(consumer);assert.equal(consumer.targetResource,source);assert.equal(consumer.targetPointer,'/components/schemas/Model/$defs/a~1b~01');
 assert.equal(copied.dataJson('/components/schemas/Use/allOf/0/$defs/a~1b~01'),new SourceDocument(resources[0].text,source).dataJson('/components/schemas/Model/$defs/a~1b~01'));
 assert(plan.usages.some(value=>value.effect==='retained-inline-target'&&value.resource===source&&value.pointer==='/components/schemas/Model/properties/value/$ref'&&value.target.pointer==='/components/schemas/Model/$defs/a~1b~01'));
 if(external)assert.equal(after[0].text,resources[0].text);assert.deepEqual(resources.map(value=>value.text),original);
 const checked=await evaluateSchemas({root:destination,snapshot:'acyclic-copied',resources:after});assert.equal(checked.complete,true,JSON.stringify(checked.findings));assert.deepEqual(checked.evaluations.map(value=>value.valid),[true,false,false]);
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`cross-file extraction and inline retain passive URI and Server meanings ${version} ${json?'JSON':'YAML'}`,()=>{
 const ext=json?'json':'yaml',root='file:///project/source/root.'+ext,destination='file:///project/destination/models.'+ext;
 const sourceSelf='file:///project/source-identity/entry',destinationSelf='file:///project/destination-identity/entry';
 const response={description:'Response 雪😀',content:{'application/json':{schema:false,examples:{External:{externalValue:'./payload.txt#opaque%7E%2Fdata'},Literal:{value:{externalValue:'literal payload',$ref:'literal ref',number:111}},Ignored:{$ref:'#/components/examples/Payload',externalValue:'ignored-relative-data'}}}},links:{Follow:{operationId:'readItems',server:{url:'../{region}/../service',variables:{region:{default:'a/b'}}}}},'x-extra':{externalValue:'extension data',url:'extension url'}};
 const api={openapi:version,...(version.startsWith('3.2')?{$self:sourceSelf}:{}),info:{title:'Copy URI',version:'1'},paths:{'/items':{get:{operationId:'readItems',responses:{200:response}}}},components:{examples:{Payload:{value:{$ref:'literal payload'}}}}};
 const target={openapi:version,...(version.startsWith('3.2')?{$self:destinationSelf}:{}),info:{title:'Destination',version:'1'},paths:{}};
 const encode=value=>(json?JSON.stringify(value,null,2):YAML.stringify(value)).replace('111','900719925474099312345678901');
 const resources=[{id:root,generation:1,text:encode(api),aliases:[root,...(version.startsWith('3.2')?[sourceSelf]:[])]},{id:destination,generation:2,text:encode(target),aliases:[destination,...(version.startsWith('3.2')?[destinationSelf]:[])]}];
 const from='/paths/~1items/get/responses/200',to='/components/responses/Stored';
 const input={root,snapshot:'copy-uri',resources,contexts:[{root,resources:[root,destination]},{root:destination,resources:[destination]}],target:{root,resource:root,pointer:from,generation:1},name:'Stored',destinationResource:destination};
 const frozen=resources.map(resource=>resource.text),plan=planExtract(input),after=apply(input,plan),definition=new SourceDocument(after[1].text,destination);
 const external='/content/application~1json/examples/External/externalValue',literal='/content/application~1json/examples/Literal/value',ignored='/content/application~1json/examples/Ignored/externalValue';
 const expected=new URL(response.content['application/json'].examples.External.externalValue,version.startsWith('3.2')?sourceSelf:root).href;
 assert.equal(definition.node(to+external).value,expected);assert.equal(definition.node(to+ignored).value,'ignored-relative-data');
 const oldDoc=new SourceDocument(resources[0].text,root);assert.equal(definition.dataJson(to+literal),oldDoc.dataJson(from+literal));assert(definition.dataJson(to+literal).includes('900719925474099312345678901'));
 assert.equal(definition.dataJson(to+'/x-extra'),oldDoc.dataJson(from+'/x-extra'));
 const server=definition.node(to+'/links/Follow/server/url').value;
 for(const region of ['a/b','x/../../z','{literal}'])assert.equal(new URL(server.replace('{region}',region),destination).href,new URL(response.links.Follow.server.url.replace('{region}',region),root).href);
 const inlineInput={...input,resources:after,contexts:input.contexts.map(context=>({...context,resources:[root,destination]}))},inline=planInline(inlineInput),inlined=apply(inlineInput,inline),local=new SourceDocument(inlined[0].text,root);
 assert.equal(inlined[1].text,after[1].text,'Inlining must not edit the shared definition');
 assert.equal(new URL(local.node(from+external).value,version.startsWith('3.2')?sourceSelf:root).href,expected);
 assert.equal(local.dataJson(from+literal),oldDoc.dataJson(from+literal));assert.equal(local.node(from+ignored).value,'ignored-relative-data');
 for(const region of ['a/b','../z'])assert.equal(new URL(local.node(from+'/links/Follow/server/url').value.replace('{region}',region),root).href,new URL(response.links.Follow.server.url.replace('{region}',region),root).href);
 assert.deepEqual(resources.map(resource=>resource.text),frozen);assert.equal(createGraph({...input,resources:inlined}).graph.issues.length,0);
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`move a component definition, preserve its public binding and repair descendant consumers ${version} ${json?'JSON':'YAML'}`,()=>{
 const input=fixture(version,json),extracted=apply(input,planExtract({...input,name:'Public'}));
 const destination='file:///project/models.'+(json?'json':'yaml');
 const output={openapi:version,info:{title:'Models',version:'1'},paths:{}};
 const original={...input,resources:[...extracted,{id:destination,text:json?JSON.stringify(output,null,2):YAML.stringify(output),generation:2,identity:'models'}],
  contexts:[{root:input.root,resources:[input.root,input.resources[1].id,destination]},{root:destination,resources:[destination]}],
  target:{...input.target,pointer:'/components/schemas/Public'},destinationResource:destination,name:'Stored'};
 const plan=planMoveDefinition(original),resources=apply(original,plan),doc=new SourceDocument(resources[0].text,input.root),target=new SourceDocument(resources[2].text,destination);
 assert.equal(plan.kind,'component-move');assert.equal(plan.preservedBinding.pointer,'/components/schemas/Public');
 assert.equal(doc.node(pointer+'/$ref').value,'#/components/schemas/Public');
 assert.equal(doc.node('/components/schemas/Public/$ref').value,'models.'+(json?'json':'yaml')+'#/components/schemas/Stored');
 assert(target.dataJson('/components/schemas/Stored').includes('900719925474099312345'));
 assert.equal(target.node('/components/schemas/Stored/properties/other/$ref').value,'root.'+(json?'json':'yaml')+'#/components/schemas/Other');
 assert.equal(new SourceDocument(resources[1].text,resources[1].id).node('/Use/$ref').value,'models.'+(json?'json':'yaml')+'#/components/schemas/Stored/properties/value');
 assert(plan.usages.some(u=>u.bindingRetained===true));
 assert.equal(createGraph({...input,resources}).graph.issues.length,0);
 assert(!original.resources[0].text.includes('Stored'));
 const noOp=planMoveDefinition({...original,destinationResource:input.root,name:'Public'});
 assert.deepEqual(noOp.edits,[]);assert.deepEqual(noOp.changes,[]);
});
for(const version of ['3.1.2','3.2.1'])test(`security component definition move preserves alternatives and combined implicit bindings ${version}`,()=>{
 const root='file:///project/root.json',destination='file:///project/models.json';
 const doc={openapi:version,info:{title:'Security',version:'1'},paths:{},security:[{Key:[],Basic:[]},{}],components:{securitySchemes:{Key:{type:'apiKey',in:'header',name:'X-Key'},Basic:{type:'http',scheme:'basic'}}}};
 const input={root,snapshot:'move-security',resources:[{id:root,text:JSON.stringify(doc),generation:2},{id:destination,text:JSON.stringify({openapi:version,info:{title:'Models',version:'1'},paths:{}}),generation:3}],contexts:[{root,resources:[root,destination]},{root:destination,resources:[destination]}],target:{root,resource:root,pointer:'/components/securitySchemes/Key',generation:2},destinationResource:destination,name:'StoredKey'};
 const plan=planMoveDefinition(input),resources=apply(input,plan),after=JSON.parse(resources[0].text);
 assert.deepEqual(after.security,doc.security);assert.deepEqual(after.components.securitySchemes.Key,{$ref:'models.json#/components/securitySchemes/StoredKey'});
 assert.deepEqual(JSON.parse(resources[1].text).components.securitySchemes.StoredKey,doc.components.securitySchemes.Key);
 assert(plan.usages.some(u=>u.connection==='security'&&u.bindingRetained));
 assert.equal(createGraph({...input,resources}).graph.issues.length,0);
});
test('a moved allOf definition retains its discriminator wire mapping without normalizing existing mappings',()=>{
 const root='file:///project/root.yaml',destination='file:///project/models.yaml';
 const text='openapi: 3.2.1\ninfo: {title: Move, version: "1"}\npaths: {}\ncomponents:\n  schemas:\n    Parent:\n      type: object\n      discriminator:\n        propertyName: kind\n        mapping:\n          Other: "#/components/schemas/Other" # retain quote/comment\n    Other: false\n    Public:\n      allOf:\n        - $ref: "#/components/schemas/Parent"\n        - type: object\n';
 const input={root,snapshot:'move-wire',resources:[{id:root,text,generation:1},{id:destination,text:'openapi: 3.2.1\ninfo: {title: Models, version: "1"}\npaths: {}\n',generation:2}],contexts:[{root,resources:[root,destination]},{root:destination,resources:[destination]}],target:{root,resource:root,pointer:'/components/schemas/Public',generation:1},destinationResource:destination,name:'Stored'};
 const plan=planMoveDefinition(input),resources=apply(input,plan),after=new SourceDocument(resources[0].text,root);
 assert.equal(after.node('/components/schemas/Parent/discriminator/mapping/Public').value,'#/components/schemas/Public');
 assert(resources[0].text.includes('Other: "#/components/schemas/Other" # retain quote/comment'));
 assert.equal(createGraph({...input,resources}).graph.issues.length,0);
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`definition moves retain each legal component family ${version} ${json?'JSON':'YAML'}`,()=>{
 const root='file:///project/root.'+(json?'json':'yaml'),destination='file:///project/models.'+(json?'json':'yaml');
 const families={schemas:false,parameters:{name:'q',in:'query',schema:false},headers:{description:'Header',schema:{type:'string'}},responses:{description:'Bodyless'},requestBodies:{content:{'application/json':{schema:false}}},examples:{value:{$ref:'payload data',empty:null}},links:{operationId:'getItems'},callbacks:{'{$request.query.callback}':{post:{responses:{204:{description:'Callback'}}}}},pathItems:{get:{responses:{204:{description:'None'}}}},securitySchemes:{type:'oauth2',flows:{clientCredentials:{tokenUrl:'../token',scopes:{read:'Read'}}}},...(version.startsWith('3.2')?{mediaTypes:{schema:false,example:{$ref:'data'}}}:{})};
 for(const [family,value]of Object.entries(families)){
  const document={openapi:version,info:{title:'Family',version:'1'},paths:{'/items':{get:{operationId:'getItems',responses:{204:{description:'No body'}}}}},components:{[family]:{Public:value}}};
  const output={openapi:version,info:{title:'Models',version:'1'},paths:{}};
  const input={root,snapshot:'families',resources:[{id:root,text:json?JSON.stringify(document,null,2):YAML.stringify(document),generation:1},{id:destination,text:json?JSON.stringify(output,null,2):YAML.stringify(output),generation:2}],contexts:[{root,resources:[root,destination]},{root:destination,resources:[destination]}],target:{root,resource:root,pointer:'/components/'+family+'/Public',generation:1},destinationResource:destination,name:'Stored'};
  let plan;try{plan=planMoveDefinition(input);}catch(error){error.message=family+': '+error.message;throw error;}
  const resources=apply(input,plan),source=new SourceDocument(resources[0].text,root),target=new SourceDocument(resources[1].text,destination);
  if(family==='links'){
   assert.equal(target.nodes.has('/components/links/Stored/operationId'),false);
   assert.equal(target.node('/components/links/Stored/operationRef').value,'root.'+(json?'json':'yaml')+'#/paths/~1items/get');
  }else assert.equal(target.dataJson('/components/'+family+'/Stored'),new SourceDocument(input.resources[0].text,root).dataJson(input.target.pointer),family);
  assert.equal(source.node(input.target.pointer+'/$ref').value,'models.'+(json?'json':'yaml')+'#/components/'+family+'/Stored',family);
  assert.equal(createGraph({...input,resources}).graph.issues.length,0,family);
 }
});
for(const version of ['3.1.2','3.2.1'])test(`moving an owned recursive dynamic resource retains exact positive and negative instance outcomes ${version}`,async()=>{
 const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
 const root='file:///project/root.json',destination='file:///project/models.json';
 const schema={$id:'https://models.test/node',$dynamicAnchor:'node',type:'object',properties:{n:{type:'integer'},child:{$dynamicRef:'#node'}},required:['n'],unevaluatedProperties:false};
 const media={schema:{$ref:'#/components/schemas/Public'},examples:{valid:{value:{n:'EXACT',child:{n:'EXACT'}}},invalid:{value:{n:'not an integer'}}}};
 const value={openapi:version,info:{title:'Dynamic',version:'1'},paths:{'/items':{get:{responses:{200:{description:'OK',content:{'application/json':media}}}}}},components:{schemas:{Public:schema}}};
 const input={root,snapshot:'dynamic-move',resources:[{id:root,text:JSON.stringify(value).replaceAll('"EXACT"','900719925474099312345'),generation:1},{id:destination,text:JSON.stringify({openapi:version,info:{title:'Models',version:'1'},paths:{}}),generation:2}],contexts:[{root,resources:[root,destination]},{root:destination,resources:[destination]}],target:{root,resource:root,pointer:'/components/schemas/Public',generation:1},destinationResource:destination,name:'Stored'};
 const before=await evaluateSchemas(input),resources=apply(input,planMoveDefinition(input)),after=await evaluateSchemas({...input,resources});
 assert.equal(before.complete,true);assert.equal(after.complete,true);
 assert.equal(before.findings.filter(f=>f.code==='example.schema.incompatible').length,1);
 assert.equal(after.findings.filter(f=>f.code==='example.schema.incompatible').length,1);
 assert.deepEqual(before.evaluations.map(e=>e.valid),[true,false]);
 assert.deepEqual(after.evaluations.map(e=>e.valid),[true,false]);
 assert(resources[0].text.includes('900719925474099312345'));
 assert.equal(new SourceDocument(resources[1].text,destination).node('/components/schemas/Stored/$id').value,'https://models.test/node');
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`extract exact schema and all known consumers ${version} ${json?'JSON':'YAML'}`,()=>{
 const input=fixture(version,json),before=new SourceDocument(input.resources[0].text,input.root),plan=planExtract({...input,name:'Reusable'}),resources=apply(input,plan),doc=new SourceDocument(resources[0].text,input.root),parse=json?JSON.parse:YAML.parse;
 assert.equal(plan.kind,'component-extract');assert.equal(plan.edits.length,2);assert.equal(plan.usages.length,2);
 assert.equal(doc.node(pointer+'/$ref').value,'#/components/schemas/Reusable');
 assert(doc.dataJson('/components/schemas/Reusable').includes('900719925474099312345'));
 assert.equal(doc.node('/components/schemas/Reusable/description').value,before.node(pointer+'/description').value);
 assert.equal(parse(resources[1].text).Use.$ref,'root.'+(json?'json':'yaml')+'#/components/schemas/Reusable/properties/value');
 assert.equal(doc.node('/x-value/$ref').value,'#'+pointer);assert.equal(doc.node('/components/schemas/Reusable/examples/0/$ref').value,'payload data');
 assert.equal(doc.node('/paths/~1items/get/responses/204').value.content,undefined);
 assert.equal(createGraph({...input,resources}).graph.issues.length,0);
 assert.deepEqual(plan.transitions,[{resource:input.root,from:pointer,to:'/components/schemas/Reusable'}]);
 if(!json){assert(resources[0].text.startsWith('# retained\r\n'));assert(resources[0].text.includes('minimum: 0 # exact comment'));}
 assert(!input.resources[0].text.includes('Reusable'));
 assert.throws(()=>planExtract({...input,name:'Other'}),e=>e.code==='edit.collision');
 assert.throws(()=>planExtract({...input,name:'bad/name'}),e=>e.code==='refactor.copy.context');
 assert.throws(()=>planExtract({...input,name:'Reusable',target:{...input.target,generation:3}}),e=>e.code==='edit.stale');
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`extract bodyless response, boolean schema and legal component collections ${version} ${json?'JSON':'YAML'}`,()=>{
 const input=fixture(version,json),target={...input.target,pointer:'/paths/~1items/get/responses/204'};
 const plan=planExtract({...input,target,name:'Empty'}),resources=apply(input,plan),doc=new SourceDocument(resources[0].text,input.root);
 assert.deepEqual(JSON.parse(doc.dataJson('/components/responses/Empty')),{description:'No body'});
 assert.deepEqual(JSON.parse(doc.dataJson(target.pointer)),{$ref:'#/components/responses/Empty'});
 const base={openapi:version,info:{title:'Boolean',version:'1'},paths:{},components:{schemas:{Container:{properties:{no:false}}}}};
 const simple={...input,resources:[{...input.resources[0],text:json?JSON.stringify(base):YAML.stringify(base)}],contexts:[{root:input.root,resources:[input.root]}],target:{...input.target,pointer:'/components/schemas/Container/properties/no'}};
 const next=new SourceDocument(apply(simple,planExtract({...simple,name:'Never'}))[0].text,input.root);
 assert.equal(next.node('/components/schemas/Never').value,false);
});
test('YAML block replacement keeps following siblings and last-newline state',()=>{
 for(const ending of ['', '\n','\r\n']){
  const root='file:///project/root.yaml',text='openapi: 3.2.1\ninfo: {title: Copy, version: "1"}\npaths: {}\ncomponents:\n  schemas:\n    Container:\n      properties:\n        before:\n          description: |\n            exact\n          type: string # kept\n        after: false\n    Last: true'+ending;
  const input={snapshot:'captured',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:'/components/schemas/Container/properties/before'},name:'Extracted'};
  const result=apply(input,planExtract(input))[0].text,doc=new SourceDocument(result,root);
  assert.equal(doc.node('/components/schemas/Container/properties/after').value,false);
  assert.equal(doc.node('/components/schemas/Extracted/description').value,'exact\n');assert(result.includes('type: string # kept'));
  assert.equal(/[\r\n]$/.test(result),!!ending);
 }
});
test('empty explicit flow component collection can receive an authored block',()=>{
 const input=fixture('3.2.1');input.resources=[input.resources[0]];input.contexts[0].resources=[input.root];
 input.resources[0].text=input.resources[0].text.slice(0,input.resources[0].text.indexOf('components:')).replace('$ref: "#/components/schemas/Other"','type: string')+'components: {}\r\n';
 const resources=apply(input,planExtract({...input,name:'Model'}));
 assert(new SourceDocument(resources[0].text,input.root).node('/components/schemas/Model').value.properties);
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`inline one occurrence preserves definition, exact values and reference siblings ${version} ${json?'JSON':'YAML'}`,()=>{
 const input=fixture(version,json),extraction=planExtract({...input,name:'Reusable'}),resources=apply(input,extraction);
 // The inline definition's external same-root schema ref must stay shared.
 const next={...input,resources},plan=planInline(next),after=apply(next,plan),doc=new SourceDocument(after[0].text,input.root),before=new SourceDocument(resources[0].text,input.root);
 assert.equal(plan.kind,'reference-inline');assert.equal(plan.edits.length,1);
 assert.equal(doc.dataJson('/components/schemas/Reusable'),before.dataJson('/components/schemas/Reusable'));
 assert.equal(doc.node(pointer+'/properties/other/$ref').value,'#/components/schemas/Other');
 assert(doc.dataJson(pointer).includes('900719925474099312345'));assert.equal(doc.node(pointer+'/description').value,'Line one\n😀 Line two\n');
 assert.equal(createGraph({...input,resources:after}).graph.issues.length,0);
 // Schema siblings remain conjunctive, not last-key-wins object merging.
 const parsed=json?JSON.parse(resources[0].text):YAML.parse(resources[0].text);
 parsed.paths['/items'].get.responses['200'].content['application/json'].schema.maxProperties=1;
 const withSibling={...next,resources:[{...resources[0],text:json?JSON.stringify(parsed,null,2):YAML.stringify(parsed)},resources[1]]};
 const result=new SourceDocument(apply(withSibling,planInline(withSibling))[0].text,input.root);
 assert.equal(result.node(pointer+'/maxProperties').value,1);assert.equal(result.node(pointer+'/allOf/0/type').value,'object');
});
test('Reference Object description override does not merge ignored siblings',()=>{
 const root='file:///project/root.yaml',text='openapi: 3.2.1\ninfo: {title: Test, version: "1"}\npaths:\n  /:\n    get:\n      responses:\n        "204":\n          $ref: "#/components/responses/Empty"\n          description: Local\ncomponents:\n  responses:\n    Empty:\n      description: Shared # retained\n';
 const input={snapshot:'captured',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:'/paths/~1/get/responses/204'}};
 const doc=new SourceDocument(apply(input,planInline(input))[0].text,root);
 assert.deepEqual(doc.node(input.target.pointer).value,{description:'Local'});assert.equal(doc.node('/components/responses/Empty/description').value,'Shared');
 const unsafe={...input,resources:[{...input.resources[0],text:text.replace('description: Local','description: Local\n          x-ignored: true')}]};
 assert.throws(()=>planInline(unsafe),e=>e.code==='refactor.inline.ignored');
});
test('identified, dynamic and ancestor-owned recursive definitions need explicit ownership, never silent duplication',()=>{
 for(const schema of [{$id:'https://models.test/A',type:'string'},{$anchor:'named',type:'string'},{$dynamicAnchor:'node',type:'object'},{type:'object',properties:{self:{$ref:'#/components/schemas/A'}}}]){
  const root='file:///project/root.json',data={openapi:'3.2.1',info:{title:'Test',version:'1'},paths:{},components:{schemas:{A:schema,B:{$ref:'#/components/schemas/A'}}}};
  const input={snapshot:'current',resources:[{id:root,text:JSON.stringify(data),generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:schema.properties?'/components/schemas/A/properties/self':'/components/schemas/B'}};
  assert.throws(()=>planInline(input),e=>['refactor.inline.schema-resource','refactor.inline.recursive'].includes(e.code));
 }
});
test('extracting out of an inherited embedded schema resource fails precisely',()=>{
 const root='file:///project/root.json',data={openapi:'3.2.1',info:{title:'Test',version:'1'},paths:{},components:{schemas:{Owner:{$id:'https://models.test/A',properties:{child:{type:'string'}}}}}};
 const input={snapshot:'current',resources:[{id:root,text:JSON.stringify(data),generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:'/components/schemas/Owner/properties/child'},name:'Child'};
 assert.throws(()=>planExtract(input),e=>e.code==='refactor.copy.schema-resource');
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`independent instance oracles survive extraction and sibling inlining ${version} ${json?'JSON':'YAML'}`,async()=>{
 const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
 const root='file:///project/oracle.'+(json?'json':'yaml');
 const schema={type:'object',properties:{n:{type:'integer',minimum:9007199254740992}},required:['n'],unevaluatedProperties:false};
 const samples=[{n:9007199254740992},{n:9007199254740991},{n:9007199254740992,extra:true},{}];
 const media={schema,examples:Object.fromEntries(samples.map((value,i)=>['case'+i,{value}]))};
 const data={openapi:version,info:{title:'Exact copy oracle',version:'1'},paths:{'/':{get:{responses:{200:{description:'Read',content:{'application/json':media}}}}}}};
 const text=(json?JSON.stringify(data,null,2):YAML.stringify(data)).replaceAll('9007199254740992','9007199254740993').replaceAll('9007199254740991','9007199254740992');
 const at='/paths/~1/get/responses/200/content/application~1json/schema';
 let input={root,snapshot:'oracles',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:at}};
 const evaluated=await evaluateSchemas(input);assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.evaluations.map(e=>e.valid),[true,false,false,false]);
 const extracted=planExtract({...input,name:'Exact'});input={...input,resources:apply(input,extracted)};
 const checked=await evaluateSchemas(input);assert.equal(checked.complete,true,JSON.stringify(checked.findings));assert.deepEqual(checked.evaluations.map(e=>e.valid),[true,false,false,false]);
 let doc=new SourceDocument(input.resources[0].text,root);
 doc=new SourceDocument(doc.set(at+'/allOf',[{minProperties:1}]),root);
 doc=new SourceDocument(doc.set(at+'/description','Authored local annotation'),root);
 input={...input,resources:[{...input.resources[0],text:doc.text}]};
 const originalBranches=doc.text.slice(...doc.node(at+'/allOf/0').range);
 const inline=planInline(input),resources=apply(input,inline),after=new SourceDocument(resources[0].text,root);
 assert.equal(after.text.slice(...after.node(at+'/allOf/0').range),originalBranches);
 assert.equal(after.node(at+'/allOf/1/type').value,'object');
 assert.equal(after.node(at+'/description').value,'Authored local annotation');
 const result=await evaluateSchemas({...input,resources});assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.evaluations.map(e=>e.valid),[true,false,false,false]);
});
test('external inline repairs relative reference addresses but leaves the shared definition byte-identical',()=>{
 const root='file:///project/root.json',definition='file:///project/models/value.json',other='file:///project/models/other.json';
 const source='{"openapi":"3.2.1","info":{"title":"Inline","version":"1"},"paths":{},"components":{"schemas":{"Use":{"$ref":"models/value.json#/Value"}}}}';
 const valueText='{ "Value": { "type": "object", "properties": { "item": { "$ref": "other.json#/Other" } }, "examples": [{"n":900719925474099312345,"$ref":"literal"}] } }\r\n';
 const input={snapshot:'cross-file',resources:[{id:root,text:source,generation:1},{id:definition,text:valueText,generation:2},{id:other,text:'{"Other":false}',generation:3}],contexts:[{root,resources:[root,definition,other]}],target:{root,resource:root,generation:1,pointer:'/components/schemas/Use'}};
 const plan=planInline(input),resources=apply(input,plan),doc=new SourceDocument(resources[0].text,root);
 assert.equal(plan.edits.length,1);assert.equal(resources[1].text,valueText);
 assert.equal(doc.node('/components/schemas/Use/properties/item/$ref').value,'models/other.json#/Other');
 assert(doc.dataJson('/components/schemas/Use/examples').includes('900719925474099312345'));
 assert.equal(createGraph({root,resources}).graph.issues.length,0);
});
test('edited transitive recursive targets, ignored summary and conflicting Path Item siblings are explicit non-success',()=>{
 const root='file:///project/root.json';
 const data={openapi:'3.1.2',info:{title:'Blocked',version:'1'},paths:{'/':{$ref:'#/components/pathItems/Shared'}},components:{pathItems:{Shared:{summary:'Shared'}},responses:{Empty:{description:'No body'},Use:{$ref:'#/components/responses/Empty',summary:'Ignored'}},schemas:{A:{properties:{b:{$ref:'#/components/schemas/B'}}},B:{properties:{a:{$ref:'#/components/schemas/A'}}},Use:{$ref:'#/components/schemas/A'}}}};
 const input={snapshot:'blocked',resources:[{id:root,text:JSON.stringify(data),generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:'/components/schemas/Use'}};
 const unfolded=planInline(input),safe=new SourceDocument(apply(input,unfolded)[0].text,root);
 assert.equal(safe.dataNode('/components/schemas/Use/properties/b/$ref').value,'#/components/schemas/B');
 assert.throws(()=>planInline({...input,target:{...input.target,pointer:'/components/schemas/A/properties/b'}}),e=>e.code==='refactor.inline.recursive'&&e.kind==='unsupported');
 assert.throws(()=>planInline({...input,target:{...input.target,pointer:'/components/responses/Use'}}),e=>e.code==='refactor.inline.ignored');
 // Overlap is now a source-located graph ambiguity before any refactoring
 // plan, not only a late inlining check. Keep the two independent refusals
 // above reachable instead of letting this fixture mask them.
 data.paths['/'].summary='Local';
 const conflict={...input,resources:[{...input.resources[0],text:JSON.stringify(data)}]};
 const overlaps=createGraph({root,resources:conflict.resources}).graph.issues.filter(issue=>issue.code==='path.reference.overlap');
 assert.deepEqual(overlaps.map(issue=>issue.pointer).sort(),['/components/pathItems/Shared/summary','/paths/~1/summary']);
 assert.throws(()=>planInline({...conflict,target:{...input.target,pointer:'/paths/~1'}}),e=>e.code==='refactor.graph');
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`extraction retains owned nested identifiers and recursive dynamic anchors ${version} ${json?'JSON':'YAML'}`,async()=>{
 const {evaluateSchemas}=require('./dist/schema_evaluation.cjs'),root='file:///project/root.'+(json?'json':'yaml');
 const schema={$id:'models/node',$dynamicAnchor:'node',type:'object',properties:{value:{type:'integer'},child:{$dynamicRef:'#node'}},required:['value'],unevaluatedProperties:false};
 const media={schema,examples:{valid:{value:{value:1,child:{value:2}}},invalid:{value:{value:1,child:{value:'not integer'}}}}};
 const data={openapi:version,info:{title:'Identity extraction',version:'1'},paths:{'/':{get:{responses:{200:{description:'Read',content:{'application/json':media}}}}}}};
 const at='/paths/~1/get/responses/200/content/application~1json/schema',text=json?JSON.stringify(data,null,2):YAML.stringify(data);
 const input={root,snapshot:'owned-scope',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:at}};
 const before=await evaluateSchemas(input);assert.equal(before.complete,true,JSON.stringify(before.findings));assert.deepEqual(before.evaluations.map(e=>e.valid),[true,false]);
 const plan=planExtract({...input,name:'Node'}),resources=apply(input,plan),graph=createGraph({root,resources}).graph;
 assert.equal(graph.scope(root,'/components/schemas/Node').base,'file:///project/models/node');
 assert.equal(graph.references.find(ref=>ref.pointer==='/components/schemas/Node/properties/child').targetPointer,'/components/schemas/Node');
 const after=await evaluateSchemas({...input,resources});assert.equal(after.complete,true,JSON.stringify(after.findings));assert.deepEqual(after.evaluations.map(e=>e.valid),[true,false]);
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`all reusable inline object families use typed destination collections ${version} ${json?'JSON':'YAML'}`,()=>{
 const root='file:///project/families.'+(json?'json':'yaml');
 const media={schema:false,examples:{named:{value:{n:'EXACT_NUMBER',$ref:'payload'}}}};
 const response={description:'Bodyless',headers:{'X-Count':{schema:{type:'integer'}}},links:{next:{operationId:'read'}}};
 const operation={operationId:'read',parameters:[{name:'count',in:'query',schema:{type:'integer'}}],requestBody:{content:{'application/json':media}},responses:{204:response},callbacks:{changed:{'{$request.query.callback}':{post:{responses:{204:{description:'Done'}}}}}}};
 const data={openapi:version,info:{title:'Families',version:'1'},paths:{'/':{get:operation}}};
 const at='/paths/~1/get',cases=[
  [at+'/parameters/0','parameters'],[at+'/requestBody','requestBodies'],[at+'/responses/204','responses'],
  [at+'/responses/204/headers/X-Count','headers'],[at+'/responses/204/links/next','links'],
  [at+'/requestBody/content/application~1json/examples/named','examples'],[at+'/callbacks/changed','callbacks'],
  ['/paths/~1','pathItems'],...(version.startsWith('3.2')?[[at+'/requestBody/content/application~1json','mediaTypes']]:[]),
 ];
 for(const [pointer,collection]of cases){
  const text=(json?JSON.stringify(data,null,2):YAML.stringify(data)).replaceAll('"EXACT_NUMBER"','900719925474099312345').replaceAll('EXACT_NUMBER','900719925474099312345');
  const input={snapshot:'families',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer}};
  const plan=planExtract({...input,name:'Reusable'}),resources=apply(input,plan),doc=new SourceDocument(resources[0].text,root);
  assert.equal(plan.to.pointer,'/components/'+collection+'/Reusable');
  assert(doc.nodes.has(plan.to.pointer));assert.equal(createGraph({root,resources}).graph.issues.length,0);
  assert.equal(doc.node(pointer+'/$ref').value,'#/components/'+collection+'/Reusable');
 }
});
test('inlining retains removed reference comments without interpreting comment-looking strings',()=>{
 const root='file:///project/comments.yaml';
 for(const siblings of ['', '      maxLength: 10 # local constraint\n']){
  const text='openapi: 3.2.1\ninfo: {title: Comments, version: "1"}\npaths: {}\ncomponents:\n  schemas:\n    Use:\n      $ref: "#/components/schemas/Value" # why this use\n'+siblings+'    Value:\n      type: string # shared comment\n      description: |\n        # ordinary string, not a source comment\n';
  const input={snapshot:'comments',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:'/components/schemas/Use'}};
  const before=new SourceDocument(text,root);
  assert(!before.comments('/components/schemas/Value').map(range=>text.slice(...range)).includes('# ordinary string, not a source comment'));
  const plan=planInline(input),after=apply(input,plan)[0].text,doc=new SourceDocument(after,root);
  assert.equal(after.split('# why this use').length,2);
  assert.equal(after.split('# local constraint').length,siblings?2:1);
  assert.equal(doc.dataJson('/components/schemas/Value'),before.dataJson('/components/schemas/Value'));
  assert.equal(doc.node('/components/schemas/Use'+(siblings?'/allOf/0':'')+'/description').value,'# ordinary string, not a source comment\n');
 }
});
for(const version of ['3.1.2','3.2.1'])for(const json of [false,true])test(`cross-resource extraction reopens with exact targets and owned dynamic identities ${version} ${json?'JSON':'YAML'}`,async()=>{
 const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
 for(const identified of [false,true]){
  const ext=json?'json':'yaml',root='file:///project/a.'+ext,destination='file:///project/b.'+ext,consumer='file:///project/consumer.'+ext;
  const schema={...(identified?{$id:'schemas/node',$dynamicAnchor:'node'}:{}),type:'object',properties:{value:{$ref:'#/components/schemas/Number'},...(identified?{child:{$dynamicRef:'#node'}}:{})},required:['value'],examples:[{value:'EXACT_NUMBER',$ref:'literal payload'}]};
  // References inside an identified resource must explicitly retain the
  // entry document's address rather than borrowing that resource's base.
  if(identified)schema.properties.value.$ref='../a.'+ext+'#/components/schemas/Number';
  const media={schema,examples:{valid:{value:{value:2,...(identified?{child:{value:3}}:{})}},invalid:{value:{value:'wrong'}}}};
  const a={openapi:version,info:{title:'A',version:'1'},paths:{'/':{get:{responses:{200:{description:'Read',content:{'application/json':media}}}}}},components:{schemas:{Number:{type:'integer'},External:{$ref:'consumer.'+ext+'#/Use'}}}};
  const b={openapi:version,info:{title:'B',version:'1'},paths:{}};
  const at='/paths/~1/get/responses/200/content/application~1json/schema';
  const render=value=>(json?JSON.stringify(value,null,2):YAML.stringify(value)).replaceAll('"EXACT_NUMBER"','900719925474099312345').replaceAll('EXACT_NUMBER','900719925474099312345');
  const input={root,snapshot:'cross',resources:[{id:root,text:render(a),generation:1},{id:destination,text:render(b),generation:2},{id:consumer,text:render({Use:{$ref:'a.'+ext+'#'+at+'/properties/value'}}),generation:3}],contexts:[{root,resources:[root,consumer]},{root:destination,resources:[destination]}],target:{root,resource:root,generation:1,pointer:at},destinationResource:destination,name:'Node'};
  const errors=[];
  const before=await evaluateSchemas({...input,resources:input.resources.filter(r=>r.id!==destination)},error=>{
   const chain=[];for(let at=error;at;at=at.cause)chain.push(String(at));errors.push(chain);
  });
  assert.equal(before.complete,true,JSON.stringify({identified,findings:before.findings,errors}));
  assert.deepEqual(before.evaluations.filter(e=>e.interpretation!=='schema-annotation').map(e=>e.valid),[true,false]);
  const plan=planExtract(input),resources=apply(input,plan);
  assert.equal(plan.edits.length,3);assert.equal(plan.to.resource,destination);assert.equal(plan.transitions[0].toResource,destination);
  const graph=createGraph({root,resources}).graph;
  assert.equal(graph.references.find(ref=>ref.resource===root&&ref.pointer===at).targetResource,destination);
  assert.equal(graph.references.find(ref=>ref.resource===consumer).targetPointer,'/components/schemas/Node/properties/value');
  const copied=new SourceDocument(resources.find(r=>r.id===destination).text,destination);
  assert(copied.dataJson('/components/schemas/Node/examples').includes('900719925474099312345'));
  if(identified)assert.equal(copied.node('/components/schemas/Node/$id').value,'schemas/node');
  const after=await evaluateSchemas({...input,resources});assert.equal(after.complete,true,JSON.stringify(after.findings));
  assert.deepEqual(after.evaluations.filter(e=>e.interpretation!=='schema-annotation').map(e=>e.valid),[true,false]);
  assert.equal(input.resources[1].text,render(b));
 }
});
test('cross-resource extraction requires a cold retrieval route for a declared OpenAPI identity',()=>{
 const root='file:///project/a.json',destination='file:///project/b.json';
 const input={root,snapshot:'mapping',resources:[{id:root,text:'{"openapi":"3.2.1","info":{"title":"A","version":"1"},"paths":{},"components":{"schemas":{"Owner":{"properties":{"child":false}}}}}',generation:1},{id:destination,text:'{"openapi":"3.2.1","$self":"https://identity.invalid/b","info":{"title":"B","version":"1"},"paths":{}}',generation:2}],contexts:[{root,resources:[root]},{root:destination,resources:[destination]}],target:{root,resource:root,generation:1,pointer:'/components/schemas/Owner/properties/child'},destinationResource:destination,name:'Child'};
 assert.throws(()=>planExtract(input),e=>e.code==='refactor.copy.retrieval');
 const mapped={...input,resources:[input.resources[0],{...input.resources[1],aliases:['https://identity.invalid/b']}]};
 const plan=planExtract(mapped),resources=apply(mapped,plan);
 assert.equal(createGraph({root,resources}).graph.issues.length,0);
 assert.equal(new SourceDocument(resources[0].text,root).node(input.target.pointer+'/$ref').value,'https://identity.invalid/b#/components/schemas/Child');
});
for(const version of ['3.1.2','3.2.1'])test(`cross-file scheme inlining keeps OAuth URLs Server-relative ${version}`,()=>{
 const root='file:///project/api.json',part='file:///project/security/schemes.json';
 const scheme={type:'oauth2',flows:{clientCredentials:{tokenUrl:'token',refreshUrl:'../refresh',scopes:{read:'Read'}}},...(version.startsWith('3.2')?{oauth2MetadataUrl:'oauth-metadata'}:{})};
 const api={openapi:version,info:{title:'OAuth declarations',version:'1'},paths:{},servers:[{url:'https://api.invalid/v1/'}],security:[{Use:['read']}],components:{securitySchemes:{Use:{$ref:'security/schemes.json#/OAuth'}}}};
 const input={snapshot:'server-relative',resources:[{id:root,text:JSON.stringify(api),generation:1},{id:part,text:JSON.stringify({OAuth:scheme}),generation:2}],contexts:[{root,resources:[root,part]}],target:{root,resource:root,generation:1,pointer:'/components/securitySchemes/Use'}};
 const plan=planInline(input),resources=apply(input,plan),value=JSON.parse(resources[0].text);
 assert.deepEqual(value.components.securitySchemes.Use,scheme);assert.deepEqual(value.security,[{Use:['read']}]);
 assert.equal(new URL(value.components.securitySchemes.Use.flows.clientCredentials.tokenUrl,value.servers[0].url).href,'https://api.invalid/v1/token');
 assert.equal(resources[1].text,input.resources[1].text);
});
test('a dual OpenAPI/schema root cannot be extracted into itself or replaced by an inline occurrence',()=>{
 const root='file:///project/root.json',text='{"openapi":"3.2.1","info":{"title":"Root","version":"1"},"paths":{},"components":{"schemas":{"Root":{"$ref":"#"}}}}';
 const input={snapshot:'root',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:''},name:'NestedRoot'};
 assert.throws(()=>planExtract(input),e=>e.code==='refactor.copy.context');
 assert.throws(()=>planInline(input),e=>e.code==='refactor.copy.context');assert.equal(input.resources[0].text,text);
});
for(const version of ['2.0','3.0.4','3.1.2','3.2.1'])test(`reviewed YAML copy ownership preserves aliases and exact values ${version}`,async()=>{
 const legacy=version==='2.0',root='file:///project/source/api.yaml',destination='file:///project/models/v2/api.yaml';
 const group=legacy?'definitions':'components:\n  schemas',prefix=legacy?'  ':'    ';
 const schemaPointer=legacy?'/definitions/Owner/properties/value':'/components/schemas/Owner/properties/value';
 const text=(legacy?'swagger: "2.0"':'openapi: '+version)+'\ninfo: {title: Copies, version: "1"}\npaths: {}\nx-kind: &kind integer\nx-unrelated: &unrelated {kept: "雪"}\nx-other: *unrelated\n'+group+':\n'+prefix+'Owner:\n'+prefix+'  type: object\n'+prefix+'  properties:\n'+prefix+'    value: &selected\n'+prefix+'      type: *kind\n'+prefix+'      minimum: 9007199254740993.00 # exact lower bound\n'+prefix+'      description: "[guide](../guide.md)"\nx-history: *selected # literal consumer\n';
 const targetText=(legacy?'swagger: "2.0"':'openapi: '+version)+'\ninfo: {title: Models, version: "1"}\npaths: {}\n'+(legacy?'definitions: &definitions {}':'components:\n  schemas: &definitions {}')+'\nx-history: *definitions # literal collection\n';
 const input={root,snapshot:'owned-copy',resources:[{id:root,text,generation:1},{id:destination,text:targetText,generation:2}],contexts:[{root,resources:[root]},{root:destination,resources:[destination]}],target:{root,resource:root,pointer:schemaPointer,generation:1},destinationResource:destination,name:'Value'};
 const source=new SourceDocument(text,root),location=source.node(schemaPointer);
 input.target.range=location.range;input.target.expected=text.slice(...location.range);
 const plan=planExtract(input),resources=apply(input,plan),after=new SourceDocument(resources[0].text,root),copied=new SourceDocument(resources[1].text,destination);
 const to=(legacy?'/definitions':'/components/schemas')+'/Value';
 assert.deepEqual(plan.from,input.target);assert.equal(plan.edits.length,2);
 assert.equal(after.dataJson('/x-history'),source.dataJson('/x-history'));
 assert.equal(copied.dataJson('/x-history'),'{}','a destination alias must not gain the new definition');
 assert(after.text.includes('x-unrelated: &unrelated {kept: "雪"}\nx-other: *unrelated\n'));
 assert(copied.dataJson(to).includes('9007199254740993.00'));
 assert(copied.text.includes('# exact lower bound'));
 assert.equal(new URL(copied.node(to+'/description').value.match(/\]\(([^)]*)\)/)[1],destination).href,'file:///project/guide.md');
 const graph=createGraph({root,resources}).graph;
 assert.equal(graph.issues.length,0);assert.equal(graph.referenceAs(root,schemaPointer,'$ref','schema').targetPointer,to);
 const instances=['9007199254740993.00','9007199254740992.00','"wrong"'];
 const evaluate=capture=>evaluateSchemas({root,resources:capture,runtimeInstances:instances.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:root,pointer:schemaPointer}}))});
 const old=await evaluate(input.resources),converted=await evaluate(resources);
 assert.equal(old.complete,true,JSON.stringify(old.findings));assert.equal(converted.complete,true,JSON.stringify(converted.findings));
 assert.deepEqual(old.runtimeEvaluations.map(value=>value.valid),[true,false,false]);assert.deepEqual(converted.runtimeEvaluations.map(value=>value.valid),[true,false,false]);
 assert.equal(input.resources[0].text,text);assert.equal(input.resources[1].text,targetText);
 assert.throws(()=>planExtract({...input,target:{...input.target,expected:'stale'}}),error=>error.code==='edit.stale');
});
test('inline owns only the selected alias token and reads an anchored definition privately',()=>{
 const root='file:///project/api.yaml',text='openapi: 3.2.1\ninfo: {title: Alias, version: "1"}\npaths: {}\ncomponents:\n  schemas:\n    Value: &value\n      type: integer # retained definition comment\n      minimum: 9007199254740993.00\n    Use: &reference {$ref: "#/components/schemas/Value"}\n    Copy: *reference # this occurrence\nx-history: *value\nx-reference: *reference\n';
 const original=new SourceDocument(text,root),at='/components/schemas/Copy',input={snapshot:'inline-alias',resources:[{id:root,text,generation:3}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:3,pointer:at,range:original.node(at).range,expected:'*reference'}};
 const inspected=require('./dist/model.cjs').inspect({...input,root,resource:root,pointer:at});
 assert.equal(inspected.shared,true);assert.equal(inspected.nodeKind,'scalar');assert.equal(inspected.reviewedCopySource.nodeKind,'object');
 const plan=planInline(input),after=new SourceDocument(apply(input,plan)[0].text,root);
 assert.equal(after.dataJson(at),original.dataJson('/components/schemas/Value'));
 assert(after.text.includes('Value: &value\n      type: integer # retained definition comment\n      minimum: 9007199254740993.00\n'));
 assert(after.text.includes('Use: &reference {$ref: "#/components/schemas/Value"}'));
 assert(after.text.includes('x-history: *value\nx-reference: *reference\n'));
 assert(after.text.includes('# this occurrence'));assert.equal(createGraph({root,resources:apply(input,plan)}).graph.issues.length,0);
 const noOp=planMoveDefinition({...input,target:{...input.target,pointer:'/components/schemas/Value',range:original.node('/components/schemas/Value').range,expected:text.slice(...original.node('/components/schemas/Value').range)},name:'Value'});
 assert.deepEqual(noOp.edits,[]);assert.deepEqual(noOp.changes,[]);
});
test('moving an alias definition retains its distinct public binding and ordinary edit guards',()=>{
 const root='file:///project/api.yaml',text='openapi: 3.2.1\ninfo: {title: Alias move, version: "1"}\npaths: {}\ncomponents:\n  schemas:\n    Value: &value {type: integer, minimum: 1}\n    Alias: *value\n    Consumer: {$ref: "#/components/schemas/Alias"}\nx-history: *value\n';
 const input={snapshot:'alias-move',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:'/components/schemas/Alias'},name:'Moved'};
 const result=planMoveDefinition(input),after=new SourceDocument(apply(input,result)[0].text,root);
 assert.equal(after.node('/components/schemas/Alias/$ref').value,'#/components/schemas/Moved');
 assert.equal(after.dataJson('/components/schemas/Moved'),new SourceDocument(text,root).dataJson('/components/schemas/Value'));
 assert.equal(after.node('/components/schemas/Consumer/$ref').value,'#/components/schemas/Alias');
 assert(after.text.includes('Value: &value {type: integer, minimum: 1}'));assert(after.text.includes('x-history: *value'));
 const {propose}=require('./dist/model.cjs');
 assert.throws(()=>propose({...input,root,target:{...input.target,pointer:'/components/schemas/Value'},actions:[{kind:'set',pointer:'/components/schemas/Value/type',value:'string'}]}),error=>error.code==='edit.shared');
});
test('extraction to a new file composes alias ownership with the existing cold relocation proof',()=>{
 const {planExtractToFile}=require('./dist/refactoring_copy.cjs'),root='file:///project/api.yaml',destination='file:///project/schema.yaml';
 const text='openapi: 3.2.1\ninfo: {title: New file, version: "1"}\npaths: {}\nx-model: &model {type: integer, minimum: 9007199254740993.00}\ncomponents:\n  schemas:\n    Owner:\n      properties:\n        value: *model # extracted occurrence\nx-history: *model\n';
 const input={snapshot:'owned-file',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:'/components/schemas/Owner/properties/value'},name:'Value',destinationResource:destination};
 const plan=planExtractToFile(input),resources=[...apply(input,plan),...plan.creations.map(value=>({...value,generation:0}))];
 assert.equal(plan.creations.length,1);assert(plan.creations[0].text.includes('9007199254740993.00'));
 const graph=createGraph({root,resources}).graph;assert.equal(graph.issues.length,0);
 assert.equal(graph.referenceAs(root,'/components/schemas/Value','$ref','schema').targetResource,destination);
 const after=new SourceDocument(resources[0].text,root);
 assert(after.text.includes('x-model: &model {type: integer, minimum: 9007199254740993.00}'));assert(after.text.includes('x-history: *model'));
 assert(after.text.includes('# extracted occurrence'));assert.equal(input.resources[0].text,text);
});
