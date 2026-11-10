const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');

for(const format of ['yaml','json'])test(`R3c-3 ${format} independent Example references and distinct Parameter/media layers survive`,async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')('3.2.1',format),whole=input.value.components.parameters.Whole;
 whole.examples={ParameterChoice:{dataValue:{q:'%20'},summary:'Parameter metadata'}};
 const media=whole.content['application/x-www-form-urlencoded'];media.examples.Plus.summary='Media metadata';
 media.examples.Plus.description='Keep [guide](./guide.md#part)';
 input.value.components.examples={Independent:{$ref:'#/components/parameters/Whole/content/application~1x-www-form-urlencoded/examples/Plus'}};
 input.value['x-literal-example']=media.examples.Plus;
 input.resources[0].text=input.encode(input.value);const original=input.resources[0].text;
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={root:review.outputRoot,resources:review.outputs.map(output=>({...output,generation:0})),snapshot:'independent-query-examples'};
 const operation=requestOperation({...cold,resource:cold.root,pointer:'/paths/~1p/get'}),parameter=operation.parameters.find(parameter=>parameter.in==='query');
 assert.deepEqual(parameter.examples.map(example=>example.name),['ParameterChoice','Plus']);
 const graph=createGraph(cold).graph,edge=graph.referenceAs(cold.root,'/components/examples/Independent','$ref','example');
 assert.equal(edge.resolution,'resolved');assert.equal(graph.docs.get(edge.targetResource).dataNode(edge.targetPointer+'/value/q').value,'a+b');
 assert.equal(graph.docs.get(cold.root).dataNode('/x-literal-example/dataValue/q').value,'a+b');
 const {documentUriBase}=require('./dist/reference_graph.cjs');
 const at=graph.scopeAs(parameter.definition.resource,parameter.definition.pointer+'/examples/Plus','example');
 assert.equal(new URL(/\]\(([^)]+)\)/u.exec(graph.docs.get(at.resource).dataNode(at.pointer+'/description').value)[1],documentUriBase(graph,at)).href,
  new URL('./guide.md#part',input.root).href);
 assert.equal(input.resources[0].text,original);
 whole.examples={Plus:{dataValue:{q:'%20'}}};input.resources[0].text=input.encode(input.value);
 const refused=await planMigration(input);assert.equal(refused.complete,false);assert.deepEqual(refused.outputs,[]);
 assert(refused.problems.some(problem=>problem.code==='migration.parameter.querystring-example-target'&&problem.reason==='target-representation'),JSON.stringify(refused.problems));
});
const {analyse,createGraph}=require('./dist/model.cjs');
const {requestOperation}=require('./dist/execution.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {resolveUri}=require('./dist/reference_graph.cjs');

for(const format of ['yaml','json'])for(const version of ['3.2.0','3.2.1'])for(const targetVersion of ['3.1.2','3.0.4'])
test(`${version} ${format} XML and Linkset Example choices retain canonical bytes in ${targetVersion}`,async()=>{
 const {requestMediaBytes}=require('./dist/execution.cjs'),{prepareMigrationRequestProfiles}=require('./dist/migration_invariants.cjs');
 for(const kind of ['xml-object','xml-string','xml-utf16','linkset','linkset-json'])for(const choice of ['data','serialized','paired','external']){
  const root='file:///modeled-examples/api.'+format,xml=kind.startsWith('xml'),scalar=xml&&kind!=='xml-object';
  const mediaType=kind==='xml-utf16'?'application/xml; charset=utf-16':xml?'application/xml':kind==='linkset'?'application/linkset':'application/linkset+json';
  const sample=xml?scalar?'雪 & value':{n:'EXACT',label:'雪'}:{linkset:[{anchor:'https://example.org/context',next:[{href:'https://example.org/a,b','title*':[{value:'雪',language:'ja'}]}]}]};
  const schema=xml?{type:scalar?'string':'object',xml:{name:'payload',nodeType:'element'},...(!scalar?{required:['n','label'],properties:{n:{type:'integer'},label:{type:'string'}}}:{})}:{type:'object'};
  const value={openapi:version,info:{title:'Modeled choices',version:'1'},servers:[{url:'https://api.invalid'}],
   paths:{'/p':{post:{requestBody:{content:{[mediaType]:{$ref:'#/components/mediaTypes/Payload'}}},responses:{200:{description:'Echo',content:{[mediaType]:{$ref:'#/components/mediaTypes/Payload'}}}}}}},
   components:{mediaTypes:{Payload:{schema}},examples:{Choice:{dataValue:sample}}},'x-literal':{dataValue:sample,$ref:'literal-only'}};
  const render=()=> (format==='yaml'?YAML.stringify(value):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
  const input={root,snapshot:kind+'-'+choice,resources:[{id:root,text:render(),generation:0}],targetVersion,destination:'file:///delivered/modeled/'};
  const raw=new SourceDocument(input.resources[0].text,root).dataJson('/components/examples/Choice/dataValue');
  const prepared=await requestMediaBytes({...input,resource:root,pointer:'/paths/~1p/post',mediaType,text:raw});
  const bytes=Buffer.from(prepared.base64,'base64'),wire=new TextDecoder(kind==='xml-utf16'?'utf-16le':'utf-8',{fatal:true}).decode(bytes);
  if(choice==='serialized')value.components.examples.Choice={serializedValue:wire};
  if(choice==='paired')value.components.examples.Choice.serializedValue=wire;
  if(choice==='external'){
   value.components.examples.Choice.externalValue='payload.bin';
   input.exampleResources=[{version:1,id:'file:///modeled-examples/payload.bin',generation:1,aliases:[],state:'available',base64:prepared.base64,byteLength:bytes.length,identity:createHash('sha256').update(bytes).digest('hex')}];
  }
  value.components.mediaTypes.Payload.examples={Choice:{$ref:'#/components/examples/Choice'}};
  input.resources[0].text=render();const before=JSON.stringify(input);
  const review=await planMigration(input);assert.equal(review.complete,true,kind+' '+choice+' '+JSON.stringify(review.problems));
  const cold={root:review.outputRoot,snapshot:'cold-'+input.snapshot,resources:review.outputs.map(output=>({...output,generation:0})),
   exampleResources:review.exampleOutputs.map(output=>({version:1,id:output.id,aliases:[],identity:output.identity,generation:0,state:'available',base64:output.base64,byteLength:output.byteLength}))};
  const original=await prepareMigrationRequestProfiles(createGraph(input).graph,input.resources,undefined,undefined,input.exampleResources);
  const delivered=await prepareMigrationRequestProfiles(createGraph(cold).graph,cold.resources,undefined,undefined,cold.exampleResources);
  assert.deepEqual([...delivered.values()].sort(),[...original.values()].sort());
  assert.equal(JSON.stringify(input),before);assert.equal((await evaluateSchemas(cold)).complete,true);
  const projection=requestOperation({...cold,resource:cold.root,pointer:'/paths/~1p/post'}).requestBody.content[0];
  assert.equal(projection.examples.length,1);assert.equal(projection.examples[0].name,'Choice');
  if(choice==='external')assert.equal(projection.examples[0].wireBase64,prepared.base64);
 }
});

test('modeled Example conversion retains context and differing-byte refusals without output',async()=>{
 const root='file:///example-controls/api.json';
 const base={openapi:'3.2.1',info:{title:'Controls',version:'1'},paths:{},components:{examples:{Unused:{dataValue:'雪'}}}};
 const capture=value=>({root,snapshot:'controls',resources:[{id:root,text:JSON.stringify(value),generation:0}],targetVersion:'3.1.2',destination:'file:///example-controls/output/'});
 const unbound=await planMigration(capture(base));assert.equal(unbound.complete,false);assert.deepEqual(unbound.outputs,[]);
 assert(unbound.problems.some(problem=>problem.code==='migration.example.representation-context'&&problem.reason==='unavailable-proof'));
 delete base.components.examples;
 base.paths={'/p':{post:{requestBody:{content:{'application/xml':{schema:{type:'string',xml:{name:'payload',nodeType:'element'}},examples:{Choice:{dataValue:'雪',serializedValue:'<payload>雪</payload>\n'}}}}},responses:{204:{description:'Empty'}}}}};
 const mismatch=await planMigration(capture(base));assert.equal(mismatch.complete,false);assert.deepEqual(mismatch.outputs,[]);
 assert(mismatch.problems.some(problem=>problem.code==='migration.example.paired-bytes'&&problem.reason==='unavailable-proof'));
});

for(const format of ['yaml','json'])for(const version of ['3.2.0','3.2.1'])for(const targetVersion of ['3.1.2','3.0.4','2.0'])
test(`${version} ${format} inferred XML array instructions retain their literal older applicability in ${targetVersion}`,async()=>{
 const {requestMediaBytes}=require('./dist/execution.cjs');
 const root='file:///xml-array/api.'+format;
 for(const shape of ['reference','conjunction','singleton-type']){
  const model=shape==='reference'?{$ref:'#/components/schemas/Base'}:shape==='conjunction'?{allOf:[{type:'array',items:{type:'string',xml:{name:'value'}}}]}:{type:['array'],items:{type:'string',xml:{name:'value'}}};
  model.xml={nodeType:'element',name:'values'};
  const value={openapi:version,info:{title:'XML applicability',version:'1'},paths:{'/p':{post:{requestBody:{content:{'application/xml':{schema:{$ref:'#/components/schemas/Values'}}}},responses:{204:{description:'Empty'}}}}},
   components:{schemas:{Base:{type:'array',items:{type:'string',xml:{name:'value'}}},Values:model}}};
  const text=format==='yaml'?YAML.stringify(value):JSON.stringify(value),input={root,snapshot:'xml-array-'+shape,resources:[{id:root,text,generation:0}]};
  const before=await requestMediaBytes({...input,resource:root,pointer:'/paths/~1p/post',mediaType:'application/xml',text:'["A","雪"]'});
  const result=await planMigration({...input,targetVersion,destination:'file:///delivered/xml-array/'});
  assert.equal(result.complete,true,JSON.stringify(result.problems));
  const cold={root:result.outputRoot,snapshot:'cold-'+shape,resources:result.outputs.map(output=>({...output,generation:0,aliases:Object.entries(result.manifest.resourceMappings).filter(([,path])=>path===output.path).map(([uri])=>uri)}))};
  const after=await requestMediaBytes({...cold,resource:cold.root,pointer:'/paths/~1p/post',mediaType:'application/xml',text:'["A","雪"]'});
  assert.equal(after.base64,before.base64);
  const graph=createGraph(cold).graph,wrapped=graph.scopesFor('xml').filter(scope=>graph.docs.get(scope.resource).dataNode(scope.pointer+'/wrapped')?.value===true);
  assert(wrapped.length);for(const xml of wrapped)assert.equal(graph.docs.get(xml.resource).dataNode(xml.pointer.slice(0,-4)+'/type').value,'array');
  assert.equal(input.resources[0].text,text);
 }
});

for(const format of ['yaml','json'])for(const version of ['3.2.0','3.2.1'])for(const targetVersion of ['2.0','3.0.4','3.1.2'])
test(`R3b ${version} ${format} reusable parents retain occurrences and independent children in ${targetVersion}`,async()=>{
 const fixture=require('./migration_b05_r3b_fixture.cjs'),{input}=fixture.capture(format,version),before=JSON.stringify(input);
 const {migrationRequestSignatures}=require('./dist/migration_invariants.cjs');
 const review=await planMigration({...input,targetVersion});assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold=fixture.reopened(review),source=createGraph(input).graph,target=createGraph(cold).graph;
 assert.equal(analyse(cold).complete,true,JSON.stringify(analyse(cold).findings));
 assert.deepEqual(migrationRequestSignatures(target,cold.resources),migrationRequestSignatures(source,input.resources));
 assert.deepEqual(target.operations().map(op=>[op.method,op.path]).sort(),[['post','/first'],['post','/second']]);
 for(const op of target.operations()){
  const plan=requestOperation({...cold,resource:op.source.resource,pointer:op.source.pointer,occurrence:op.occurrence});
  assert.deepEqual(plan.requestBody.content.map(media=>[media.mediaType,media.examples[0].raw]),[['application/json','9007199254740993.00']]);
  assert.deepEqual(plan.responses[0].content.map(media=>[media.mediaType,media.examples[0].raw]),[['application/vnd.count+json','9007199254740993.00']]);
  assert.equal(plan.responses[1].content.length,0);
 }
 const library=review.changes.find(change=>change.resource===input.resources[1].id),path=review.outputs.find(output=>output.id===library.destination).path;
 const libraryRoot=new URL(path,'file:///cold/r3b/').href,packet={...cold,root:libraryRoot};
 assert.equal(createGraph(packet).graph.operations().length,0,'The library adds no endpoint or callback');
 const pointer=targetVersion==='2.0'?'/definitions/Independent':'/components/schemas/Independent';
 const check=await evaluateSchemas({...packet,runtimeInstances:['9007199254740993.00','0'].map(text=>({subject:'response-body',location:text,text,schema:{resource:libraryRoot,pointer}}))});
 assert.equal(check.complete,true,JSON.stringify(check.findings));assert.deepEqual(check.runtimeEvaluations.map(value=>value.valid),[true,false]);
 const original=new SourceDocument(input.resources[1].text,input.resources[1].id),output=target.docs.get(libraryRoot);
 for(const field of ['/x-exact','/x-alias'])assert.equal(output.dataJson(field),original.dataJson(field));
 assert(target.entryReferences().filter(edge=>edge.keyword==='$ref').every(edge=>edge.resolution==='resolved'));
 assert.equal(JSON.stringify(input),before);assert.equal((await planMigration({...input,targetVersion})).identity,review.identity);
});

for(const format of ['yaml','json'])test(`B05-R1 ${format} a foreign Swagger operationRef retains a private media owner without a new route`,async()=>{
 const root=`file:///foreign-operations/modern.${format}`,legacy=`file:///foreign-operations/legacy.${format}`;
 const modern={openapi:'3.1.2',info:{title:'Modern',version:'1'},paths:{},components:{links:{Use:{operationRef:`legacy.${format}#/paths/~1payload/post`}},securitySchemes:{Key:{type:'apiKey',in:'header',name:'X-modern'}}}};
 const swagger={swagger:'2.0',info:{title:'Swagger',version:'1'},consumes:['application/json'],produces:['application/vnd.reply+json'],securityDefinitions:{Key:{type:'apiKey',in:'header',name:'X-legacy'}},paths:{'/payload':{parameters:[{name:'n',in:'query',type:'integer'}],post:{operationId:'payload',security:[{Key:[]}],parameters:[{in:'body',name:'body',schema:{}}],responses:{200:{description:'Reply',schema:{}}}}}},'x-kept':{exact:'EXACT',flag:false}};
 const encode=value=>(format==='yaml'?YAML.stringify(value):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'foreign-operation',targetVersion:'3.2.1',destination:'file:///reviewed/foreign/',resources:[modern,swagger].map((value,index)=>({id:[root,legacy][index],text:encode(value),generation:index+1}))};
 const before=input.resources.map(resource=>resource.text),review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const resources=review.outputs.map(output=>({id:output.id,text:output.text,generation:0})),packet={root:review.outputRoot,snapshot:'cold-foreign-operation',resources};
 const graph=createGraph(packet).graph,link=graph.referenceAs(packet.root,'/components/links/Use','operationRef','operation');
 assert.equal(link.resolution,'resolved');assert.equal(graph.operations().length,0);
 const body=graph.referenceAs(link.targetResource,link.targetPointer+'/requestBody','$ref','request-body');assert.equal(body.resolution,'resolved');
 assert.deepEqual([...graph.docs.get(body.targetResource).dataNode(body.targetPointer+'/content').children.keys()],['*/*']);
 const inherited=graph.referenceAs(link.targetResource,link.targetPointer+'/parameters/0','$ref','parameter');assert.equal(inherited.resolution,'resolved');
 assert.equal(graph.docs.get(inherited.targetResource).dataNode(inherited.targetPointer+'/name').value,'n');
 const requirement=graph.entryReferences().find(reference=>reference.connection==='security'&&reference.resource===link.targetResource&&reference.pointer===link.targetPointer+'/security/0');
 assert.equal(requirement.resolution,'resolved');assert.equal(graph.docs.get(requirement.targetResource).dataNode(requirement.targetPointer+'/name').value,'X-modern');
 const legacyRoot=review.changes.find(change=>change.resource===legacy).destination,legacyPacket={...packet,root:legacyRoot};
 const operation=createGraph(legacyPacket).graph.operations().find(operation=>operation.path==='/payload');
 assert.notDeepEqual([operation.source.resource,operation.source.pointer],[link.targetResource,link.targetPointer]);
 const plan=requestOperation({...legacyPacket,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
 assert.deepEqual(plan.requestBody.content.map(media=>media.mediaType),['application/json']);assert.deepEqual(plan.responses[0].content.map(media=>media.mediaType),['application/vnd.reply+json']);
 assert.equal(analyse(packet).complete,true,JSON.stringify(analyse(packet).findings));assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

for(const format of ['yaml','json'])test(`R3c ${format} shared Media/Parameter/schema owners survive finite lowering`,async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')('3.2.1',format,'3.0.4'),components=input.value.components;
 const media=components.parameters.Whole.content['application/x-www-form-urlencoded'];
 media.examples.Plus={value:{q:'a+b'}};
 components.schemas={WholeValue:media.schema};media.schema={$ref:'#/components/schemas/WholeValue'};
 components.mediaTypes={Form:media};components.parameters.Whole.content['application/x-www-form-urlencoded']={$ref:'#/components/mediaTypes/Form'};
 components.parameters.Alias={$ref:'#/components/parameters/Whole'};
 input.value.paths['/shared'].get.parameters[0]={$ref:'#/components/parameters/Alias'};
 input.value['x-literal']={parameter:components.parameters.Whole,schema:components.schemas.WholeValue};
 input.resources[0].text=input.encode(input.value);const captured=new SourceDocument(input.resources[0].text,input.root);
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const packet={root:result.outputRoot,snapshot:'r3c-owners',resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0}))},graph=createGraph(packet).graph;
 assert.equal(analyse(packet).complete,true);assert.equal(graph.operations().length,2);
 const output=graph.docs.get(packet.root);assert.equal(output.dataJson('/x-literal'),captured.dataJson('/x-literal'));
 for(const operation of graph.operations()){
  const plan=requestOperation({...packet,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
  const whole=plan.parameters.find(value=>value.name==='descriptionOnly');assert.equal(whole.in,'query');
 }
});

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ref=name=>({$ref:'#/x-data/'+name});
const node=()=>({$ref:'#/components/schemas/Count'});
const payload=(id,bytes,aliases=[])=>({version:1,id,aliases,generation:3,state:'available',identity:hash(bytes),byteLength:bytes.length,base64:bytes.toString('base64')});
function fixture(version,format){
 const root='file:///approved/contracts/api.'+format;
 const media=()=>({schema:node(),examples:{External:ref('example')}});
 const data={
  example:{description:'[Example](../example.md)',externalValue:'count.bin'},
  queryExample:{externalValue:'query.bin'},
  parameter:{name:'n',in:'query',required:true,schema:node(),examples:{External:ref('queryExample')}},
  header:{description:'[Header](../header.md)',content:{'application/json':{schema:node()}},examples:{External:ref('example')}},
  media:media(),
  body:{required:true,content:{'application/json':version.startsWith('3.2')?ref('media'):media()}},
  response:{description:'[Reply](../reply.md)',headers:{'X-Count':ref('header')},
   content:{'application/json':version.startsWith('3.2')?ref('media'):media()},links:{Next:ref('link')}},
  operation:{operationId:'detached',responses:{204:{description:'Done'}}},
  link:{description:'[Next](../next.md)',operationRef:'#/x-data/operation'},
  callback:{'https://callback.invalid/':{post:{responses:{204:{description:'Callback'}}}}},
  pathItem:{servers:[{url:'../api/{tenant}',variables:{tenant:{default:'one',enum:['one','two']}}}],post:{
   parameters:[ref('parameter')],requestBody:ref('body'),responses:{200:ref('response')},callbacks:{Notify:ref('callback')},
  }},
 };
 if(version.startsWith('3.2')){
  data.security={type:'apiKey',in:'header',name:'X-Secret',description:'Captured key'};
  data.pathItem.post.security=[{'#/x-data/security':['reader'],[root+'#/x-data/security']:['writer']}];
 }
 const value={openapi:version,info:{title:'Independent native uses',version:'business'},
  ...(version.startsWith('3.2')?{$self:'https://contracts.invalid/api.'+format}:{}),
  paths:{'/echo':ref('pathItem')},components:{schemas:{Count:{type:'integer',enum:['EXACT']},
   ...(!version.startsWith('3.0')?{HeaderAsSchema:ref('header')}:{})}},'x-data':data,'x-alias':data};
 const text=(format==='yaml'?'# Keep native/data ownership 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 return {root,snapshot:'native-object-uses',resources:[{id:root,text,generation:4,aliases:['https://retrieval.invalid/contracts/api.'+format]}],
  exampleResources:[payload('file:///approved/contracts/count.bin',Buffer.from('9007199254740993.00'),
   ['https://retrieval.invalid/contracts/count.bin','https://contracts.invalid/count.bin']),
   payload('file:///approved/contracts/query.bin',Buffer.from('n=9007199254740993'),
    ['https://retrieval.invalid/contracts/query.bin','https://contracts.invalid/query.bin'])],
  targetVersion:'3.2.1',destination:'file:///delivered/'};
}
function delivered(review,destination='file:///cold/elsewhere/'){
 const aliases=path=>Object.entries(review.manifest.resourceMappings).filter(([,mapped])=>mapped===path).map(([uri])=>uri).sort();
 return {root:new URL(review.entry,destination).href,snapshot:'cold-native-uses',
  resources:review.outputs.map(output=>({id:new URL(output.path,destination).href,text:output.text,generation:0,aliases:aliases(output.path)})),
  exampleResources:review.exampleOutputs.map(output=>payload(new URL(output.path,destination).href,Buffer.from(output.base64,'base64'),aliases(output.path)))};
}
async function wire(input){
 const {graph}=createGraph(input),operation=graph.operations().find(operation=>operation.path==='/echo');
 const plan=requestOperation({...input,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
 const header=graph.references.find(reference=>reference.kind==='header'&&reference.pointer.endsWith('/headers/X-Count'));
 assert(header);assert.equal(plan.parameters[0].name,'n');
 const runtimeInstances=[...['n=9007199254740993','n=9007199254740992'].map((text,index)=>({
  subject:'request-parameter',location:'query:'+index,text,parameter:{resource:plan.parameters[0].source.resource,pointer:plan.parameters[0].source.pointer}})),
  ...['9007199254740993','9007199254740992'].map((text,index)=>({subject:'response-header',location:'header:'+index,text:'',
   header:{resource:header.resource,pointer:header.pointer,name:'X-Count',values:[text]}})),
  ...['request-body','response-body'].flatMap(subject=>['9007199254740993','9007199254740992'].map((text,index)=>({
   subject,location:subject+':'+index,text,schema:subject==='request-body'?plan.requestBody.content[0].schema:plan.responses[0].content[0].schema})))];
 const result=await evaluateSchemas({...input,runtimeInstances});
 assert.equal(result.complete,true,JSON.stringify(result.findings));
 assert(result.serializedEvaluations.length>=4);assert(result.serializedEvaluations.every(value=>value.complete&&value.valid),JSON.stringify(result.findings));
 assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false,true,false,true,false,true,false]);
 return result;
}
for(const version of ['3.0.4','3.1.2','3.2.0'])for(const format of ['yaml','json'])
test(`${version} ${format} native objects and literal values share one specialization/publication path`,async()=>{
 const input=fixture(version,format),original=input.resources[0].text,doc=new SourceDocument(original,input.root);
 assert.equal(analyse(input).status,'complete');await wire(input);
 const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));assert.equal(review.producerVersion,'106');
 assert.equal(review.exampleOutputs.length,2);assert.equal(input.resources[0].text,original);
 const output=delivered(review),{graph}=createGraph(output);
 assert.equal(analyse(output).status,'complete');await wire(output);
 const root=graph.docs.get(output.root);
 for(const pointer of ['/x-data','/x-alias'])assert.equal(root.dataJson(pointer),doc.dataJson(pointer));
 for(const kind of ['path-item','parameter','request-body','response','header','example','link','callback','operation',...(version.startsWith('3.2')?['media','security']:[])]){
  const reference=graph.references.find(reference=>reference.kind===kind&&reference.resolution==='resolved'&&reference.targetPointer.includes('/_migrated_object_use_'));
  assert(reference,kind+' retains its independently owned target');
  assert.equal(graph.literalContainer(reference.targetResource,reference.targetPointer),undefined);
 }
 if(version.startsWith('3.2')){
  const bindings=graph.references.filter(reference=>reference.connection==='security');
  assert.equal(bindings.length,2);assert(bindings.every(reference=>reference.resolution==='resolved'&&reference.targetUri!==undefined));
  assert.notEqual(bindings[0].keyword,bindings[1].keyword);
  assert.deepEqual(bindings.map(binding=>graph.docs.get(binding.resource).dataNode(binding.pointer+'/'+binding.keyword.replaceAll('~','~0').replaceAll('/','~1')).value),[['reader'],['writer']]);
 }
 const native=graph.references.find(reference=>reference.kind==='header'&&reference.pointer.endsWith('/headers/X-Count'));
 const header=graph.docs.get(native.targetResource).dataNode(native.targetPointer).value;
 const sourceHeader=createGraph(input).graph.scopeAs(input.root,'/x-data/header','header');
 const descriptionTarget=header.description.match(/\]\(([^)]+)\)/)[1];
 assert.equal(resolveUri(descriptionTarget,graph.scopeAs(native.targetResource,native.targetPointer,'header').base).href,resolveUri('../header.md',sourceHeader.base).href);
 if(!version.startsWith('3.0')){
  const schema=graph.referenceAs(output.root,'/components/schemas/HeaderAsSchema','$ref','schema');
  assert.notEqual(schema.targetPointer,native.targetPointer);
  assert.equal(graph.docs.get(schema.targetResource).dataJson(schema.targetPointer+'/content'),doc.dataJson('/x-data/header/content'));
  assert(!graph.references.some(reference=>reference.resource===schema.targetResource&&reference.pointer.startsWith(schema.targetPointer+'/content/')));
 }
 if(version.startsWith('3.2'))assert.deepEqual(review.stages,[],'A same-family patch update is not a family conversion');
 if(format==='yaml')assert(root.text.includes('*'),'The unaffected literal alias remains authored as an alias');
});
test('anchored schemas inside native Header data retain the original resource through the common allocator',async()=>{
 const root='file:///approved/headers.json';
 const value={openapi:'3.1.2',info:{title:'Anchored Header',version:'business'},paths:{'/p':{get:{responses:{204:{description:'No body',headers:{'X-N':{$ref:'#/x-data'}}}}}}},
  components:{schemas:{Anchor:{$ref:'#count'}}},'x-data':{schema:{$anchor:'count',type:'integer',enum:['EXACT']}}};
 const text=JSON.stringify(value).replaceAll('"EXACT"','9007199254740993.00');
 const input={root,snapshot:'anchored-header',resources:[{id:root,text,generation:0}],targetVersion:'3.2.1',destination:'file:///delivered/'};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=delivered(review),{graph}=createGraph(output),header=graph.references.find(reference=>reference.kind==='header');
 assert.equal(header.targetResource,output.root);assert(header.targetPointer.startsWith('/components/headers/_migrated_object_use_'));
 const anchor=graph.referenceAs(output.root,'/components/schemas/Anchor','$ref','schema');
 assert.equal(anchor.targetPointer,header.targetPointer+'/schema');
 assert.equal(graph.docs.get(output.root).dataJson('/x-data'),new SourceDocument(text,root).dataJson('/x-data'));
 const evaluated=await evaluateSchemas({...output,runtimeInstances:['9007199254740993','9007199254740992'].map(text=>({subject:'response-header',location:text,text:'',
  header:{resource:output.root,pointer:'/paths/~1p/get/responses/204/headers/X-N',name:'X-N',values:[text]}}))});
 assert.equal(evaluated.complete,true);assert.deepEqual(evaluated.runtimeEvaluations.map(value=>value.valid),[true,false]);
});
for(const condition of ['missing','denied'])test(`${condition} external bytes remain an incomplete condition through native literal ownership`,async()=>{
 const input=fixture('3.1.2','json'),before=input.resources[0].text;
 input.exampleResources=condition==='missing'?[]:input.exampleResources.map(resource=>({version:1,id:resource.id,aliases:resource.aliases,generation:resource.generation,
  state:'unavailable',identity:resource.identity,problem:{condition:'unavailable',code:'example.external-value.denied',message:'Controlled denial'}}));
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert.deepEqual(review.exampleOutputs,[]);
 assert(review.problems.some(problem=>problem.code.startsWith('migration.validation.')));assert.equal(input.resources[0].text,before);
});

// One value can satisfy more than one native Object definition. Its roles
// share source bytes, never the interpretation of their incoming references.
for(const version of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])
test(`${version} ${format} shared Response/Request Body roles remain editable and migrate independently`,async()=>{
 const {inspect,propose}=require('./dist/model.cjs'),{referencePage,referenceDocument}=require('./dist/reference_projection.cjs');
 const root='file:///approved/roles.'+format,pointer='/components/responses/Shared';
 const value={openapi:version,info:{title:'Native roles',version:'business'},paths:{'/echo':{post:{
  requestBody:{$ref:'#/components/requestBodies/Body'},responses:{200:{$ref:'#/components/responses/Shared'}}}}},
  components:{responses:{Shared:{description:'[Guide](../guide.md)',content:{'application/json':{
   schema:{type:'integer',enum:['EXACT']},examples:{Sample:{value:'EXACT'}}}}}},requestBodies:{Body:{$ref:'#/components/responses/Shared'}}}};
 const text=(format==='yaml'?'# Roles 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'native-roles',resources:[{id:root,text,generation:7}],targetVersion:'3.2.1',destination:'file:///delivered/roles/'};
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));
 const graph=createGraph(input).graph;
 assert.deepEqual(new Set(graph.scopesAt(root,pointer).map(scope=>scope.kind)),new Set(['response','request-body']));
 for(const kind of ['response','request-body']){
  const page=inspect({...input,resource:root,pointer,contextKind:kind});
  assert.equal(page.kind,kind);assert.equal(page.interpretations.length,2);
  assert(page.fields.some(field=>field.name===(kind==='response'?'headers':'required')));
  assert.equal(page.fields.some(field=>field.name===(kind==='response'?'required':'headers')),false);
  assert.equal(referencePage({...input,resource:root,pointer,contextKind:kind}).kind,kind);
 }
 assert.throws(()=>inspect({...input,resource:root,pointer,contextKind:'parameter'}),error=>error.code==='inspect.context.stale');
 const documentation=referenceDocument(input),section=documentation.sections.find(section=>section.source.pointer===pointer);
 assert.deepEqual(new Set(section.interpretations.map(role=>role.kind)),new Set(['response','request-body']));
 const before=requestOperation({...input,resource:root,pointer:'/paths/~1echo/post'});
 const check=async(packet,plan)=>{
  const result=await evaluateSchemas({...packet,runtimeInstances:['request-body','response-body'].flatMap(subject=>
   ['9007199254740993','9007199254740992'].map(text=>({subject,location:subject+text,text,
    schema:subject==='request-body'?plan.requestBody.content[0].schema:plan.responses[0].content[0].schema})))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));
  assert.deepEqual(result.runtimeEvaluations.map(result=>result.valid),[true,false,true,false]);
 };
 await check(input,before);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=delivered(review),after=requestOperation({...output,resource:output.root,pointer:'/paths/~1echo/post'}),owned=createGraph(output).graph;
 await check(output,after);
 assert.equal(analyse(output).status,'complete',JSON.stringify(analyse(output).findings));
 const binding=owned.referenceAs(output.root,'/components/requestBodies/Body','$ref','request-body');
 assert(binding.targetPointer.startsWith('/components/requestBodies/_migrated_object_use_'));
 assert.notEqual(binding.targetPointer,pointer);
 assert.equal(owned.scopeAs(binding.targetResource,binding.targetPointer,'request-body').kind,'request-body');
 const page=inspect({...output,resource:binding.targetResource,pointer:binding.targetPointer,contextKind:'request-body'});
 assert(page.fields.some(field=>field.name==='required'));
 const edit=propose({...output,target:page,actions:[{kind:'set',pointer:page.pointer+'/required',value:true}]});
 assert(edit.edits.length>0);assert.equal(input.resources[0].text,text);
});

for(const format of ['yaml','json'])for(const [restrictedVersion,target]of [['2.0','3.2.1'],['2.0','2.0'],['3.0.4','3.2.1'],['3.0.4','3.0.4']])
test(`${format} ${restrictedVersion}/modern mixed entries retain anonymous Path Item/Operation owners when migrating to ${target}`,async()=>{
 const input=target==='3.2.1'?require('./migration_overlapping_containers_fixture.cjs')(format,restrictedVersion):
  require('./migration_mixed_holders_fixture.cjs')(format,target,restrictedVersion);
 const before=input.resources.map(resource=>resource.text);
 const inspect=async(packet,name)=>{
  const checked=analyse(packet);assert.equal(checked.status,'complete',JSON.stringify(checked.findings));
  const graph=createGraph(packet).graph,operation=graph.operations().find(operation=>operation.path==='/p');
  assert(operation);const plan=requestOperation({...packet,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
  assert.equal(plan.operation.method,'POST');assert.equal(plan.responses[0].status,'204');
  assert.equal(Object.values(plan.security.schemes)[0].parameterName,'X-'+name);
  assert.equal(graph.operations().length,2);
  const value=graph.operations().find(operation=>operation.path==='/value');
  const valuePlan=requestOperation({...packet,resource:value.source.resource,pointer:value.source.pointer,occurrence:value.occurrence});
  const result=await evaluateSchemas({...packet,runtimeInstances:['9007199254740993.00','9007199254740992','"wrong"'].map(text=>({subject:'response-body',location:text,text,schema:valuePlan.responses[0].content[0].schema}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false,false]);
 };
 await inspect(input,'First');await inspect({...input,root:input.resources[1].id},'Second');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={snapshot:'cold-mixed-legacy-owners',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 for(const [source,name]of [[input.root,'First'],[input.resources[1].id,'Second']])await inspect({...cold,root:review.changes.find(change=>change.resource===source).destination},name);
 const original=review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===input.resources[2].id).destination);
 assert.equal(original.text,before[2]);assert.deepEqual(input.resources.map(resource=>resource.text),before);
 const repeated=await planMigration({...input,resources:[...input.resources].reverse()});assert.equal(repeated.complete,true,JSON.stringify(repeated.problems));
 assert.deepEqual(repeated.outputs.slice().sort((a,b)=>a.id.localeCompare(b.id)),review.outputs.slice().sort((a,b)=>a.id.localeCompare(b.id)));
});

for(const format of ['yaml','json'])test(`${format} anonymous Operation entry uses retain isolated named security consumers`,async()=>{
 const root=`file:///anonymous-operations/a.${format}`,other=`file:///anonymous-operations/b.${format}`,shared=`file:///anonymous-operations/shared.${format}`;
 const api=name=>({openapi:'3.0.4',info:{title:name,version:'business'},paths:{},components:{
  links:{Use:{operationRef:`shared.${format}#/Operation`}},securitySchemes:{Access:{type:'apiKey',in:'header',name:'X-'+name}}}});
 const fragment={Operation:{operationId:'detached',security:[{Access:[]}],responses:{204:{description:'Empty'}}},Literal:{flag:false,empty:'',exact:'EXACT'}};
 const encode=value=>(format==='yaml'?YAML.stringify(value):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'anonymous-operation-owners',targetVersion:'3.2.1',destination:'file:///anonymous-output/',
  resources:[api('First'),api('Second'),fragment].map((value,index)=>({id:[root,other,shared][index],generation:index+1,text:encode(value)}))};
 const before=input.resources.map(resource=>resource.text),review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const resources=review.outputs.map(output=>({id:output.id,text:output.text,generation:0})),owners=[];
 for(const [source,name]of [[root,'First'],[other,'Second']]){
  const root=review.changes.find(change=>change.resource===source).destination,packet={root,resources,snapshot:'cold-anonymous-operations'};
  assert.equal(analyse(packet).status,'complete');const graph=createGraph(packet).graph;
  const link=graph.referenceAs(root,'/components/links/Use','operationRef','operation');assert.equal(link.resolution,'resolved');
  owners.push([link.targetResource,link.targetPointer]);
  assert.equal(graph.specifications.has(link.targetResource),false,'The material Operation remains an anonymous fragment');
  const requirement=graph.entryReferences().find(reference=>reference.connection==='security'&&reference.resource===link.targetResource&&reference.pointer===link.targetPointer+'/security/0');
  assert.equal(requirement.resolution,'resolved');assert.equal(graph.docs.get(requirement.targetResource).dataNode(requirement.targetPointer+'/name').value,'X-'+name);
  assert.equal(graph.operations().length,0);
 }
 assert.notDeepEqual(owners[0],owners[1]);
 assert.equal(review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===shared).destination).text,before[2]);
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});
for(const format of ['yaml','json'])test(`B05-R2 ${format} mixed entry consumers retain shared parameter, body, response, Header and Example identities`,async()=>{
 const fixture=require('./migration_b05_r2_fixture.cjs'),{input,value}=fixture.capture('3.1.2',format),other='file:///approved/other.'+format;
 value.components.parameters.Second={$ref:'other.'+format+'#/components/parameters/Second'};
 const secondary={openapi:'3.0.4',info:{title:'Second entry',version:'1'},servers:[{url:'https://second.invalid'}],paths:{'/shared':{post:{
  parameters:[{$ref:'api.'+format+'#/components/parameters/Shared'}],requestBody:{$ref:'api.'+format+'#/components/requestBodies/Shared'},responses:{200:{$ref:'api.'+format+'#/components/responses/Alias'},304:{description:'Empty'}}
 }}},components:{parameters:{Second:{name:'second',in:'header',deprecated:false,schema:{type:'boolean'}}}}};
 input.resources[0].text=fixture.render(value,format);input.resources.push({id:other,text:fixture.render(secondary,format),generation:3});
 const before=JSON.stringify(input),review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold=fixture.reopened(review),{requestOperation}=require('./dist/execution.cjs');
 for(const source of input.resources){
  const root=review.changes.find(change=>change.resource===source.id).destination,packet={...cold,root},graph=createGraph(packet).graph;
  assert.equal(analyse(packet).complete,true,JSON.stringify(analyse(packet).findings));
  const operation=graph.operations()[0],plan=requestOperation({...packet,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
  assert.deepEqual(plan.parameters.map(p=>[p.name,p.in,p.required]),[['n','query',true]]);
  assert.equal(plan.requestBody.content[0].examples[0].raw,'9007199254740993.00');assert.equal(plan.responses[0].content[0].examples[0].raw,'9007199254740993.00');
  assert.equal(plan.responses[0].headers[0].name,'X-Count');assert.equal(plan.responses[1].content.length,0);
  assert(graph.entryReferences().filter(edge=>edge.keyword==='$ref').every(edge=>edge.resolution==='resolved'));
 }
 const reversed=await planMigration({...input,resources:[...input.resources].reverse()});assert.equal(reversed.complete,true,JSON.stringify(reversed.problems));
 assert.deepEqual([...reversed.outputs].sort((a,b)=>a.path.localeCompare(b.path)),[...review.outputs].sort((a,b)=>a.path.localeCompare(b.path)));assert.equal(JSON.stringify(input),before);
});

for(const format of ['yaml','json'])for(const targetVersion of ['3.1.2','3.0.4'])
test(`B05-R3 ${format} reusable media, Path Items, Links and Callbacks retain independent native owners in ${targetVersion}`,async()=>{
 const root='https://retrieval.invalid/r3/api.'+format,objects='https://retrieval.invalid/r3/objects.'+format;
 const response={description:'Boolean payload',content:{'application/json':{$ref:'#/components/mediaTypes/Payload'}},links:{Next:{$ref:'#/components/links/Next'}}};
 const library={openapi:'3.2.1',info:{title:'Reusable library',version:'1'},servers:[{url:'https://api.invalid/base'}],paths:{},components:{
  mediaTypes:{Payload:{schema:{type:'boolean'},examples:{False:{$ref:'#/components/examples/False'}}}},examples:{False:{dataValue:false,serializedValue:'false'}},
  pathItems:{Item:{get:{operationId:'items',tags:['items'],responses:{200:response},callbacks:{Notify:{$ref:'#/components/callbacks/Notify'}}}}},
  links:{Next:{operationId:'items',parameters:{id:'$response.body#/id'},description:'Retain runtime expressions'}},
  callbacks:{Notify:{'https://callback.invalid/':{post:{responses:{204:{description:'Acknowledged'}}}}}},
  schemas:{XmlList:{type:'array',xml:{nodeType:'element',name:'values'},items:{type:'string',xml:{name:'value'}}},
   Choice:{type:'object',required:['kind'],properties:{kind:{type:'string',enum:['one','other']}},oneOf:[{$ref:'#/components/schemas/One'},{$ref:'#/components/schemas/Other'}],discriminator:{propertyName:'kind',mapping:{one:'#/components/schemas/One'},defaultMapping:'#/components/schemas/Other'}},
   One:{type:'object',required:['kind'],properties:{kind:{const:'one'}}},Other:{type:'object',required:['kind'],properties:{kind:{const:'other'}}}}},tags:[{name:'items',summary:'items',description:'Keep tag documentation'}]};
 const entry={openapi:'3.2.1',$self:'https://identity.invalid/r3/api.'+format,info:{title:'R3 objects',version:'1'},servers:[{url:'https://api.invalid/base'}],paths:{'/items':{$ref:objects+'#/components/pathItems/Item'}}};
 const encode=value=>format==='yaml'?'# Preserve object owners\n'+YAML.stringify(value):JSON.stringify(value);
 const input={root,snapshot:'r3-objects',resources:[entry,library].map((value,index)=>({id:[root,objects][index],text:encode(value),generation:index+2}))},before=input.resources.map(resource=>resource.text);
 const review=await planMigration({...input,targetVersion,destination:'file:///delivered/r3-objects/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));assert.deepEqual(input.resources.map(resource=>resource.text),before);
 const cold={root:review.outputRoot,snapshot:'cold-r3-objects',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0,aliases:Object.entries(review.manifest.resourceMappings).filter(([,path])=>path===output.path).map(([uri])=>uri)}))};
 assert.equal(analyse(cold).complete,true,JSON.stringify(analyse(cold).findings));
 const graph=createGraph(cold).graph,operation=graph.operations().find(operation=>operation.path==='/items'&&operation.role==='operation');assert(operation);
 const plan=requestOperation({...cold,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
 assert.equal(plan.operation.method,'GET');assert.equal(plan.responses[0].content[0].examples[0].raw,'false');
 assert.equal(graph.operations().filter(operation=>operation.role==='callback').length,1);
 assert(graph.entryReferences().some(reference=>reference.connection==='operationId'||reference.connection==='operationRef'));
 assert(graph.entryScopes().some(scope=>scope.kind==='link'&&graph.docs.get(scope.resource).dataNode(scope.pointer+'/parameters/id')?.value==='$response.body#/id'));
 for(const scope of graph.entryScopes())if(scope.kind==='xml')assert.equal(graph.docs.get(scope.resource).dataNode(scope.pointer+'/nodeType'),undefined);
 const checked=await evaluateSchemas({...cold,runtimeInstances:[{subject:'response-body',location:'good',text:'false',media:plan.responses[0].content[0].source,mediaType:'application/json'},{subject:'response-body',location:'bad',text:'42',media:plan.responses[0].content[0].source,mediaType:'application/json'}]});
 assert.equal(checked.complete,true,JSON.stringify(checked.findings));assert.deepEqual(checked.runtimeEvaluations.map(value=>value.valid),[true,false]);
});
for(const format of ['yaml','json'])test(`B05-R3 ${format} itemSchema becomes a whole sequential-content array constraint`,async()=>{
 const root='https://contracts.invalid/sequence.'+format,media={itemSchema:{type:'integer',minimum:2}};
 const value={openapi:'3.2.1',info:{title:'Sequential constraint',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/log':{get:{responses:{200:{description:'Log',content:{'application/x-ndjson':media}}}}}}};
 const input={root,snapshot:'r3-sequence',resources:[{id:root,text:format==='yaml'?YAML.stringify(value):JSON.stringify(value),generation:1}]};
 const review=await planMigration({...input,targetVersion:'3.1.2',destination:'file:///sequence/'});assert.equal(review.complete,true,JSON.stringify(review.problems));
 for(const packet of [input,{root:review.outputRoot,snapshot:'cold-sequence',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))}]){
  const checked=await evaluateSchemas({...packet,runtimeInstances:['2\n3\n','1\n3\n'].map((text,index)=>({subject:'response-body',location:String(index),text,media:{resource:packet.root,pointer:'/paths/~1log/get/responses/200/content/application~1x-ndjson'},mediaType:'application/x-ndjson'}))});
  assert.equal(checked.complete,true,JSON.stringify(checked.findings));
  assert(checked.runtimeEvaluations.filter(value=>value.location==='0').every(value=>value.valid));assert(checked.runtimeEvaluations.some(value=>value.location==='1'&&!value.valid));
 }
});

test('B05-R3 simple ASCII Header data and serialization retain one older example',async()=>{
 const root='https://contracts.invalid/header.json',value={openapi:'3.2.1',info:{title:'Header example',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/p':{get:{responses:{200:{description:'Header',headers:{'X-Mode':{schema:{type:'string'},examples:{Ready:{dataValue:'ready',serializedValue:'ready'}}}}}}}}}};
 const review=await planMigration({root,snapshot:'header-example',resources:[{id:root,text:JSON.stringify(value),generation:1}],targetVersion:'3.1.2',destination:'file:///header-example/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));const target=YAML.parse(review.outputs.find(output=>output.id===review.outputRoot).text);
 assert.equal(target.paths['/p'].get.responses[200].headers['X-Mode'].examples.Ready.value,'ready');
});
for(const [extra,code]of [
 [{tags:[{name:'child',parent:'parent'},{name:'parent'}]},'migration.tag.parent'],
 [{tags:[{name:'items',kind:'audience'}]},'migration.tag.kind'],
 [{components:{schemas:{Text:{type:'string',xml:{nodeType:'cdata'}}}}},'migration.xml.node-type'],
 [{webhooks:{event:{post:{responses:{204:{description:'Accepted'}}}}}},'migration.webhooks'],
])test(`B05-R3 active ${code} keeps its target restriction`,async()=>{
 const root='https://contracts.invalid/newer.json',value={openapi:'3.2.1',info:{title:'Newer semantics',version:'1'},servers:[{url:'https://api.invalid'}],paths:{},...extra};
 const review=await planMigration({root,snapshot:'newer-restriction',resources:[{id:root,text:JSON.stringify(value),generation:1}],targetVersion:'3.0.4',destination:'file:///newer-restriction/'});
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert(review.problems.some(problem=>problem.code===code&&problem.reason==='target-representation'),JSON.stringify(review.problems));
});

for(const format of ['yaml','json'])test(`R3a ${format} references follow a body schema through conversion and split-route ownership`,async()=>{
 const root='https://api.invalid/owners.'+format,body='/paths/~1p/post/requestBody/content/application~1json/schema';
 const value={openapi:'3.1.2',info:{title:'Terminal owners',version:'1'},servers:[{url:'https://api.invalid/root'}],paths:{'/p':{
  servers:[{url:'https://api.invalid/read'}],get:{responses:{204:{description:'Empty'}}},post:{operationId:'write',servers:[{url:'https://api.invalid/write'}],
   requestBody:{required:true,content:{'application/json':{schema:{type:'boolean',enum:[false]}}}},responses:{200:{$ref:'#/components/responses/Reply'}}}}},
  components:{schemas:{Flag:{$ref:'#'+body}},responses:{Reply:{description:'Same flag',content:{'application/json':{schema:{$ref:'#/components/schemas/Flag'}}}}}}};
 const text=format==='yaml'?'# Keep reference owners\n'+YAML.stringify(value):JSON.stringify(value),input={root,snapshot:'r3a-terminal',resources:[{id:root,text,generation:1}]};
 const result=await planMigration({...input,targetVersion:'2.0',destination:'file:///terminal-r3a/'});assert.equal(result.complete,true,JSON.stringify(result.problems));
 const {createGraph}=require('./dist/model.cjs'),{requestOperation}=require('./dist/execution.cjs');
 const packet={root:result.outputRoot,snapshot:'cold-terminal',resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 assert.equal(analyse(packet).complete,true);const graph=createGraph(packet).graph;
 const edge=graph.entryReferences().find(edge=>edge.resource===packet.root&&edge.pointer==='/definitions/Flag'&&edge.keyword==='$ref');
 assert.equal(edge.resolution,'resolved');assert(graph.scopeAs(edge.targetResource,edge.targetPointer,'schema'));
 const operation=graph.operations().find(operation=>operation.method==='post');assert.equal(operation.path,'/write/p');
 const plan=requestOperation({...packet,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
 assert.equal(plan.requestBody.required,true);assert.equal(plan.operation.method,'POST');
 const checked=await evaluateSchemas({...packet,runtimeInstances:['false','true'].map(text=>({subject:'response-body',location:'application/json',text,
  schema:{resource:edge.targetResource,pointer:edge.targetPointer}}))});
 assert.equal(checked.complete,true);assert.deepEqual(checked.runtimeEvaluations.map(result=>result.valid),[true,false]);
 assert.equal(input.resources[0].text,text);
});

for(const format of ['yaml','json'])for(const targetVersion of ['3.1.2','3.0.4'])
test(`R3b ${format} independently referenced Operations retain parent parameters and operation connections in ${targetVersion}`,async()=>{
 const fixture=require('./migration_b05_r3b_fixture.cjs'),{input,entry,objects}=fixture.capture(format);
 delete entry.paths['/second'];objects.components.pathItems.Item.post.operationId='write';
 entry.components={links:{Operation:{operationRef:'library.'+format+'#/components/pathItems/Item/post'}}};
 input.resources[0].text=fixture.render(entry,format);input.resources[1].text=fixture.render(objects,format);
 const result=await planMigration({...input,targetVersion});assert.equal(result.complete,true,JSON.stringify(result.problems));
 const cold=fixture.reopened(result),graph=createGraph(cold).graph;
 assert.equal(graph.operations().length,1);assert.equal(graph.operations()[0].path,'/first');
 const edge=graph.referenceAs(cold.root,'/components/links/Operation','operationRef','operation');assert.equal(edge.resolution,'resolved');
 assert.equal(graph.docs.get(edge.targetResource).dataNode(edge.targetPointer+'/operationId').value,'write');
 assert(graph.scopeAs(edge.targetResource,edge.targetPointer,'operation'));
});

for(const format of ['yaml','json'])for(const targetVersion of ['3.1.2','2.0'])
test(`R3b ${format} reusable itemSchema keeps both sequential media occurrences and child schema owners in ${targetVersion}`,async()=>{
 const fixture=require('./migration_b05_r3b_fixture.cjs'),{input,objects}=fixture.capture(format);
 objects.components.mediaTypes.Payload={schema:{type:'array'},itemSchema:{type:'integer',minimum:2}};
 delete objects.components.headers;
 const operation=objects.components.pathItems.Item.post;
 operation.requestBody.content={'application/x-ndjson':{$ref:'#/components/mediaTypes/Alias'}};
 operation.responses[200].content={'application/json-seq':{$ref:'#/components/mediaTypes/Payload'}};
 input.resources[1].text=fixture.render(objects,format);
 const result=await planMigration({...input,targetVersion});assert.equal(result.complete,true,JSON.stringify(result.problems));
 for(const packet of [input,fixture.reopened(result)]){
  const graph=createGraph(packet).graph,op=graph.operations()[0];
  const plan=requestOperation({...packet,resource:op.source.resource,pointer:op.source.pointer,occurrence:op.occurrence});
  const media=plan.requestBody.content[0];
  const checked=await evaluateSchemas({...packet,runtimeInstances:['2\n3\n','1\n3\n'].map((text,index)=>({subject:'request-body',location:String(index),text,media:media.source,mediaType:media.mediaType}))});
  assert.equal(checked.complete,true,JSON.stringify(checked.findings));
  assert(checked.runtimeEvaluations.filter(value=>value.location==='0').every(value=>value.valid));
  assert(checked.runtimeEvaluations.some(value=>value.location==='1'&&!value.valid));
 }
});

for(const format of ['yaml','json'])test(`R3c-1 ${format} independent object/item aliases retain live schema owners`,async()=>{
 const input=require('./migration_b05_r3c1_fixture.cjs')('3.2.1',format);
 const whole=input.value.components.parameters.Whole,object=whole.content['application/x-www-form-urlencoded'].schema;
 input.value.components.schemas.Object=object;
 whole.content['application/x-www-form-urlencoded'].schema={$ref:'#/components/schemas/Object'};
 input.value.components.parameters.Alias={$ref:'#/components/parameters/Whole'};
 input.value.paths['/shared'].get.parameters=[{$ref:'#/components/parameters/Alias'}];
 input.value.components.schemas.IndependentItem={$ref:'#/components/schemas/Item'};
 input.resources[0].text=input.encode(input.value);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const packet={root:review.outputRoot,resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0})),snapshot:'array-alias-cold'};
 const graph=createGraph(packet).graph;
 for(const name of ['Object','Item','IndependentItem'])assert(graph.scopeAs(packet.root,'/components/schemas/'+name,'schema'));
 assert(graph.entryReferences().filter(edge=>edge.keyword==='$ref').every(edge=>edge.resolution==='resolved'));
});

for(const format of ['yaml','json'])test(`R3c-2 ${format} schema resources and reusable alias factor owners survive cold references`,async()=>{
 const input=require('./migration_b05_r3c2_fixture.cjs')('3.2.1',format);
 input.value.components.schemas.Item.$id='https://schemas.invalid/factor-item';
 input.value.components.schemas.Item.$anchor='Item';
 input.schema.properties.q.items={$ref:'https://schemas.invalid/factor-item#Item'};
 input.resources[0].text=input.encode(input.value);const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const packet={root:review.outputRoot,resources:review.outputs.map(output=>({...output,generation:0})),snapshot:'factor-resource'};
 const {createGraph}=require('./dist/model.cjs'),graph=createGraph(packet).graph;
 assert(graph.identities.has('https://schemas.invalid/factor-item'));
 assert(graph.entryReferences().every(reference=>reference.resolution==='resolved'));
 assert(review.parameterChanges.filter(change=>change.pointer==='/components/parameters/Alias').some(change=>change.after.endsWith(' · flag')));
});

for(const targetVersion of ['3.1.2','3.0.4','2.0'])test(`R3c-2 ${targetVersion} factor references retain surrounding captured Parameter edges`,async()=>{
 const input=require('./migration_b05_r3c2_fixture.cjs')('3.2.1','json',targetVersion);
 input.value.components.parameters.Other={name:'X-Other',in:'header',schema:{type:'string'}};
 const list=input.value.paths['/shared'].get.parameters;
 list.unshift({name:'X-Before',in:'header',schema:{type:'integer'}});list.push({$ref:'#/components/parameters/Other'});
 input.resources[0].text=input.encode(input.value);const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const {requestOperation}=require('./dist/execution.cjs'),{createGraph}=require('./dist/model.cjs');
 const packet={root:review.outputRoot,resources:review.outputs.map(output=>({...output,generation:0})),snapshot:'surrounding-edges'};
 const plan=requestOperation({...packet,resource:packet.root,pointer:'/paths/~1shared/get'});
 assert.deepEqual(plan.parameters.filter(parameter=>parameter.in==='header').map(parameter=>parameter.name),['X-Before','X-Other']);
 assert.equal(plan.parameters.filter(parameter=>parameter.in==='query').length,3);
 assert(createGraph(packet).graph.entryReferences().every(reference=>reference.resolution==='resolved'));
});

require('./migration_b05_r3d1_fixture.cjs')('owners');

require('./migration_b05_r3d1b_fixture.cjs')('owners');
