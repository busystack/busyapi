const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {analyse,createGraph}=require('./dist/model.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {planMigration}=require('./dist/migration.cjs');
const {requestOperation}=require('./dist/execution.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');

function fixture(format,foreignVersion,kind,entryOverride){
 const root=`file:///mixed-holders/a.${format}`,other=`file:///mixed-holders/b.${format}`;
 const entryVersion=entryOverride??(foreignVersion==='3.2.1'?'3.1.2':'3.2.1');
 const api=(version,name)=>({openapi:version,info:{title:name,version:'business'},servers:[{url:'https://api.invalid'}],paths:{},
  components:{securitySchemes:{Access:{type:'apiKey',in:'header',name:'X-'+name}},schemas:{Choice:{type:'object','x-entry':name}},links:{Next:{operationId:'shared'}}}});
 const first=api(entryVersion,'First'),second=api(foreignVersion,'Second');
 const schema={...(foreignVersion==='3.0.4'?{}:{$dynamicAnchor:'node'}),type:'object',required:['entry','n'],properties:{entry:{type:'string'},n:{type:'integer',enum:['EXACT']},...(foreignVersion==='3.0.4'?{}:{child:{$dynamicRef:'#node'}})},
  discriminator:{propertyName:'entry',mapping:{chosen:'Choice'}},description:'[Guide](guide.md)'};
 second.paths['/p']={post:{operationId:'shared',security:[{Access:[]}],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/paths/~1p/post/responses/200/content/application~1json/schema'}}}},
  responses:{200:{description:'Value',content:{'application/json':{schema}},links:{Next:{$ref:'#/components/links/Next'}}}}}};
 second['x-history']={path:second.paths['/p'],zero:0,empty:'',flag:false,lookalike:{$ref:'literal-only'},exact:'EXACT'};
 if(kind==='path-item')first.paths['/p']={$ref:`b.${format}#/paths/~1p`};
 else first.components.links.Use={operationRef:`b.${format}#/paths/~1p/post`};
 // Capture both entries without granting meaning to reference-looking data.
 if(foreignVersion!=='3.0.4'){first.components.examples={Other:{$ref:`b.${format}#/components/examples/Here`}};second.components.examples={Here:{value:false}};}
 const encode=value=>(format==='yaml'?'# Preserve 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 return {root,snapshot:`mixed-holders-${format}-${foreignVersion}-${kind}`,targetVersion:entryVersion,destination:'file:///mixed-holders-output/',
  resources:[first,second].map((value,index)=>({id:[root,other][index],generation:index+1,text:encode(value)}))};
}
async function inspect(packet,name,kind){
 const analysis=analyse(packet);assert.equal(analysis.status,'complete',JSON.stringify(analysis.findings));
 const graph=createGraph(packet).graph;
 const operation=kind==='path-item'?graph.operations().find(value=>value.path==='/p'&&value.role==='operation'):undefined;
 const at=operation?.source??(()=>{
  const link=graph.entryReferences().find(reference=>reference.connection==='operationRef'&&reference.pointer==='/components/links/Use');
  assert.equal(link.resolution,'resolved');return {resource:link.targetResource,pointer:link.targetPointer};
 })();
 const bindings=graph.entryReferences().filter(reference=>reference.connection==='security'&&reference.resource===at.resource&&reference.pointer===at.pointer+'/security/0');
 assert.equal(bindings.length,1);assert.equal(bindings[0].resolution,'resolved');
 let scheme={resource:bindings[0].targetResource,pointer:bindings[0].targetPointer};
 for(let count=0;count<32;count++){
  const edge=graph.referenceAs(scheme.resource,scheme.pointer,'$ref','security');if(!edge)break;
  assert.equal(edge.resolution,'resolved');scheme={resource:edge.targetResource,pointer:edge.targetPointer};
  if(count===31)assert.fail('Security alias chains must remain finite');
 }
 assert.equal(graph.docs.get(scheme.resource).dataNode(scheme.pointer+'/name').value,'X-'+name);
 let material={resource:at.resource,pointer:at.pointer+'/responses/200/content/application~1json/schema'};
 for(let count=0;count<64;count++){
  const edge=graph.referenceAs(material.resource,material.pointer,'$ref','schema');if(!edge)break;
  assert.equal(edge.resolution,'resolved');material={resource:edge.targetResource,pointer:edge.targetPointer};
  if(count===63)assert.fail('Schema material owners must remain finite');
 }
 const mapping=graph.entryReferences().filter(reference=>reference.connection==='discriminator'&&reference.resource===material.resource&&reference.pointer===material.pointer+'/discriminator/mapping');
 assert(mapping.length>=1);for(const binding of mapping){assert.equal(binding.resolution,'resolved');assert.equal(graph.docs.get(binding.targetResource).dataNode(binding.targetPointer+'/x-entry').value,name);}
 const links=graph.entryReferences().filter(reference=>['operationId','operationRef'].includes(reference.connection)&&reference.pointer.endsWith('/components/links/Next'));
 assert(links.length);for(const link of links){assert.equal(link.resolution,'resolved');assert.equal(link.targetResource,at.resource);assert.equal(link.targetPointer,at.pointer);}
 const schema={resource:at.resource,pointer:at.pointer+'/responses/200/content/application~1json/schema'};
 const values=['{"entry":"chosen","n":9007199254740993.00}','{"entry":"chosen","n":9007199254740992}','{"n":9007199254740993}','false'];
 const dynamic=graph.docs.get(material.resource).dataNode(material.pointer+'/$dynamicAnchor')!==undefined;
 if(dynamic)values.push('{"entry":"chosen","n":9007199254740993,"child":{"entry":"chosen","n":9007199254740993}}','{"entry":"chosen","n":9007199254740993,"child":{"n":0}}');
 const evaluated=await evaluateSchemas({...packet,runtimeInstances:values.map(text=>({subject:'response-body',location:text,text,schema}))});
 assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.runtimeEvaluations.map(value=>value.valid),[true,false,false,false,...(dynamic?[true,false]:[])]);
 if(operation){
  const plan=requestOperation({...packet,resource:at.resource,pointer:at.pointer,occurrence:operation.occurrence});
  assert.equal(plan.operation.method,'POST');assert.equal(plan.operation.path,'/p');
  assert(Object.values(plan.security.schemes).some(scheme=>scheme.parameterName==='X-'+name));
 }
 return {graph,at};
}
for(const format of ['json','yaml'])for(const foreignVersion of ['3.0.4','3.1.2','3.2.1'])for(const kind of foreignVersion==='3.0.4'?['operation']:['path-item','operation'])
test(`${format} foreign ${foreignVersion} ${kind} acquires a standard typed holder and retains entry connections`,async()=>{
 const input=fixture(format,foreignVersion,kind),before=input.resources.map(resource=>resource.text);
 const history=new SourceDocument(before[1],input.resources[1].id).dataJson('/x-history');
 await inspect(input,'First',kind);await inspect({...input,root:input.resources[1].id},'Second','path-item');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.equal(review.producerVersion,'102');
 const cold={snapshot:'cold-mixed-holders',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 const first=await inspect({...cold,root:review.outputRoot},'First',kind);
 const other=review.changes.find(change=>change.resource===input.resources[1].id).destination;
 await inspect({...cold,root:other},'Second','path-item');
 assert.equal(first.graph.scopeAs(first.at.resource,first.at.pointer,'operation').family,input.targetVersion.slice(0,3));
 if(foreignVersion==='3.0.4')assert(first.at.pointer.includes('/components/callbacks/_migrated_entry_use_'));
 if(kind==='operation')assert(first.at.pointer.endsWith('/post'),'Native storage keeps the authored Operation method');
 else if(kind==='operation')assert(first.at.pointer.includes('/components/pathItems/_migrated_entry_use_'));
 const doc=new SourceDocument(review.outputs.find(output=>output.id===other).text,other);
 assert.equal(doc.dataJson('/x-history'),history);
 assert.equal(first.graph.operations().filter(operation=>operation.role==='operation').length,kind==='path-item'?1:0,'Unused holders must not add public routes');
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
 assert.deepEqual((await planMigration({...input,resources:[...input.resources].reverse()})).outputs.slice().sort((a,b)=>a.id.localeCompare(b.id)),review.outputs.slice().sort((a,b)=>a.id.localeCompare(b.id)),'Entry/resource order must not choose ownership');
 assert.deepEqual((await planMigration(input)).outputs,review.outputs);
});
for(const failure of ['dialect','reference','newer-field'])test(`mixed holders retain ${failure} refusal and produce no output`,async()=>{
 const input=fixture('json','3.2.1','path-item'),second=JSON.parse(input.resources[1].text);
 if(failure==='dialect')second.jsonSchemaDialect='https://dialect.invalid/unknown';
 if(failure==='reference')second.paths['/p'].post.responses[200].content['application/json'].schema={$ref:'#/missing'};
 if(failure==='newer-field')second.paths['/p'].additionalOperations={REPORT:{responses:{204:{description:'Empty'}}}};
 input.resources[1].text=JSON.stringify(second);const before=input.resources.map(resource=>resource.text);
 const review=await planMigration(input);assert.equal(review.complete,false);assert.equal(review.status,'blocked');
 assert(review.problems.length);assert.deepEqual(review.outputs,[]);assert.deepEqual(review.changes,[]);
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

for(const format of ['json','yaml'])for(const foreignVersion of ['3.1.2','3.2.1'])
test(`${format} mixed ${foreignVersion} native holders release only converted generated wrappers for Swagger`,async()=>{
 const input=fixture(format,foreignVersion,'path-item');input.targetVersion='2.0';
 for(const resource of input.resources){
  const value=YAML.parse(resource.text);delete value.components.links;delete value.components.examples;
  const operation=value.paths['/p']?.post;
  if(operation){
   delete operation.responses[200].links;
   const schema=operation.responses[200].content['application/json'].schema;
   delete schema.discriminator;delete schema.$dynamicAnchor;delete schema.properties.child;
  }
  resource.text=(format==='json'?JSON.stringify(value):YAML.stringify(value)).replaceAll('9007199254740992','9007199254740993.00');
 }
 const before=input.resources.map(resource=>resource.text),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const resources=review.outputs.map(output=>({id:output.id,text:output.text,generation:0}));
 for(const source of input.resources){
  const root=review.changes.find(change=>change.resource===source.id).destination,packet={root,resources,snapshot:'cold-swagger-holders'};
  const analysis=analyse(packet);assert.equal(analysis.status,'complete',JSON.stringify(analysis.findings));
  const graph=createGraph(packet).graph,operation=graph.operations().find(operation=>operation.role==='operation'&&operation.path==='/p');
  assert(operation);const plan=requestOperation({...packet,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
  assert(Object.values(plan.security.schemes).some(scheme=>scheme.parameterName==='X-'+(source.id===input.root?'First':'Second')));
  const body=plan.responses[0].content[0].schema;
  const result=await evaluateSchemas({...packet,runtimeInstances:['{"entry":"chosen","n":9007199254740993.00}','{"n":"wrong"}'].map(text=>({subject:'response-body',location:text,text,schema:body}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);
  for(const scope of graph.entryScopes())assert(!['callback','path-item-component-map'].includes(scope.kind),'No generated native wrapper can survive as an invalid Swagger component');
 }
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

for(const format of ['json','yaml'])for(const foreignVersion of ['3.1.2'])for(const roleOnly of [false,true])
test(`${format} foreign ${foreignVersion} Media uses retain ordinary Response holders and literal data, roleOnly=${roleOnly}`,async()=>{
 const root=`file:///media-holders/a.${format}`,other=`file:///media-holders/b.${format}`,third=`file:///media-holders/c.${format}`;
 const api=name=>({openapi:'3.2.1',info:{title:name,version:'business'},paths:{'/p':{get:{responses:{200:{description:'Value',content:{'application/json':{$ref:`b.${format}#/x-native/Media`}}}}}}},
  components:{schemas:{Choice:{type:'object','x-entry':name}}}});
 const media={schema:{type:'object',nullable:true,properties:{kind:{type:'string'},n:{type:'integer',enum:['EXACT']}},required:['kind','n'],
  discriminator:{propertyName:'kind',mapping:{chosen:'Choice'}}},'x-value':{flag:false,empty:'',number:'EXACT',$ref:'literal-only'}};
 if(roleOnly){delete media.schema.discriminator;if(foreignVersion==='3.1.2'){media.schema.$dynamicAnchor='node';media.schema.properties.child={$dynamicRef:'#node'};}}
 const foreign={openapi:foreignVersion,info:{title:'Holder',version:'business'},paths:{},'x-native':{Media:media}};
 if(foreignVersion==='3.1.2')foreign.jsonSchemaDialect='https://json-schema.org/draft/2020-12/schema';
 const encode=value=>(format==='json'?JSON.stringify(value):YAML.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'mixed-media-holder-'+format+foreignVersion,targetVersion:'3.2.1',destination:'file:///media-holder-output/',
  resources:[api('First'),foreign,api('Third')].map((value,index)=>({id:[root,other,third][index],text:encode(value),generation:index+1}))};
 const before=input.resources.map(resource=>resource.text),literal=new SourceDocument(before[1],other).dataJson('/x-native');
 const inspect=async(packet,name)=>{
  assert.equal(analyse(packet).status,'complete',JSON.stringify(analyse(packet).findings));
  const graph=createGraph(packet).graph,plan=requestOperation({...packet,resource:packet.root,pointer:'/paths/~1p/get'});
  const schema=plan.responses[0].content[0].schema;let at=schema;
  for(let count=0;count<64;count++){
   const edge=graph.referenceAs(at.resource,at.pointer,'$ref','schema');if(!edge)break;
   assert.equal(edge.resolution,'resolved');at={resource:edge.targetResource,pointer:edge.targetPointer};
   if(count===63)assert.fail('Media schemas must keep bounded material forwarding');
  }
  const binding=graph.entryReferences().find(reference=>reference.connection==='discriminator'&&reference.resource===at.resource&&reference.pointer===at.pointer+'/discriminator/mapping');
  if(!roleOnly){assert.equal(binding.resolution,'resolved');assert.equal(graph.docs.get(binding.targetResource).dataNode(binding.targetPointer+'/x-entry').value,name);}
  const result=await evaluateSchemas({...packet,runtimeInstances:['{"kind":"chosen","n":9007199254740993.00}','null','{"n":0}'].map(text=>({subject:'response-body',location:text,text,schema}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,foreignVersion==='3.0.4',false]);
 };
 await inspect(input,'First');await inspect({...input,root:third},'Third');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={snapshot:'cold-mixed-media',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 for(const [source,name]of [[root,'First'],[third,'Third']])await inspect({...cold,root:review.changes.find(change=>change.resource===source).destination},name);
 const delivered=review.outputs.find(output=>output.id===review.changes.find(change=>change.resource===other).destination);
 const doc=new SourceDocument(delivered.text,delivered.id);assert.equal(doc.dataJson('/x-native'),literal);
 assert([...doc.dataNode('/components/responses').children.keys()].some(name=>name.startsWith('_migrated_entry_use_')||name.startsWith('_migrated_object_use_')));
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

test('security holder aliases reserve configured names and preserve distinct captured settings',async()=>{
 const input=fixture('json','3.1.2','path-item'),first=await planMigration(input);
 assert.equal(first.complete,true,JSON.stringify(first.problems));
 const native=first.outputs.find(output=>output.id===first.outputRoot),names=Object.keys(JSON.parse(native.text).components.securitySchemes);
 const occupied=names.find(name=>name.startsWith('_migrated_security_owner_'));assert(occupied);
 const text=JSON.stringify({version:1,roots:[{name:'first',path:'a.json'},{name:'second',path:'b.json'}],environments:{manual:{authentication:{alternative:0,
  schemes:{Access:{secretRef:'11111111-1111-4111-8111-111111111111'},[occupied]:{secretRef:'22222222-2222-4222-8222-222222222222'}}}}}});
 input.configuration={id:'file:///mixed-holders/busyapi.yaml',text,generation:3,identity:require('node:crypto').createHash('sha256').update(text).digest('hex')};
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const renamed=review.configurationBindings.filter(binding=>binding.before==='Access').map(binding=>binding.after);
 assert(renamed.length);assert(renamed.every(name=>name!==occupied));
 assert.equal(input.configuration.text,text);
});

test('an independently interpreted native holder container receives its own Example owner',async()=>{
 const input=fixture('json','3.1.2','path-item'),first=JSON.parse(input.resources[0].text),second=JSON.parse(input.resources[1].text);
 second.components.pathItems={};first.components.examples.Dictionary={$ref:'b.json#/components/pathItems'};
 input.resources[0].text=JSON.stringify(first);input.resources[1].text=JSON.stringify(second);
 const before=input.resources.map(resource=>resource.text),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const packet={root:review.outputRoot,snapshot:'cold-container-example',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 const graph=createGraph(packet).graph,edge=graph.referenceAs(packet.root,'/components/examples/Dictionary','$ref','example');
 assert.equal(edge.resolution,'resolved');assert(edge.targetPointer.startsWith('/components/examples/_migrated_object_use_'));
 assert.equal(graph.docs.get(edge.targetResource).dataJson(edge.targetPointer),'{}');
 await inspect(packet,'First','path-item');
 const other=review.changes.find(change=>change.resource===input.resources[1].id).destination;
 await inspect({...packet,root:other},'Second','path-item');
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

for(const reverse of [false,true])test(`independent 3.2 URI bases retain container, dynamic and named connections, reverse=${reverse}`,async()=>{
 const input=fixture('json','3.2.1','path-item','3.2.1');
 const first=JSON.parse(input.resources[0].text.replaceAll('9007199254740993.00','"EXACT"'));
 const second=JSON.parse(input.resources[1].text.replaceAll('9007199254740993.00','"EXACT"'));
 first.$self='https://first.invalid/entry/api.json';second.$self='https://second.invalid/other/api.json';
 first.paths['/p'].$ref=input.resources[1].id+'#/paths/~1p';
 first.components.examples.Other.$ref=input.resources[1].id+'#/components/examples/Here';
 for(const api of [first,second]){
  api.components.pathItems={};api.components.examples.Dictionary={$ref:'#/components/pathItems'};
 }
 for(const [index,value]of [first,second].entries())input.resources[index].text=JSON.stringify(value).replaceAll('"EXACT"','9007199254740993.00');
 if(reverse)input.resources.reverse();
 const before=input.resources.map(resource=>resource.text),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const packet={root:review.outputRoot,snapshot:'independent-container-bases',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 await inspect(packet,'First','path-item');
 const other=review.changes.find(change=>change.resource==='file:///mixed-holders/b.json').destination;
 await inspect({...packet,root:other},'Second','path-item');
 for(const root of [packet.root,other]){
  const graph=createGraph({...packet,root}).graph,edge=graph.referenceAs(root,'/components/examples/Dictionary','$ref','example');
  assert.equal(edge.resolution,'resolved');assert.equal(graph.docs.get(edge.targetResource).dataJson(edge.targetPointer),'{}');
 }
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

test('a declared 3.0 Path Item cannot be substituted through a modern Reference Object',async()=>{
 const input=fixture('json','3.0.4','path-item'),review=await planMigration(input);
 assert.equal(review.complete,false);assert.equal(review.status,'blocked');assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code.includes('reference.family')),JSON.stringify(review.problems));
});

test('unproved legacy native authentication annotations retain a located family-mapping blocker',async()=>{
 const input=fixture('json','3.0.4','operation'),first=JSON.parse(input.resources[0].text);
 first.components.securitySchemes.Access.description='[Captured annotation](guide.md)';input.resources[0].text=JSON.stringify(first);
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert.deepEqual(review.changes,[]);
 const failure=review.problems.find(problem=>problem.code==='migration.owners.connection-family');assert(failure,JSON.stringify(review.problems));
 assert.equal(failure.resource,input.resources[1].id);assert.equal(failure.pointer,'/paths/~1p/post/security/0/Access');assert.equal(failure.reason,'implementation');
});

for(const format of ['json','yaml'])test(`${format} modern Operation holders remain legal through both downgrade stages to 3.0`,async()=>{
 const input=fixture(format,'3.2.1','operation','3.0.4');
 for(const resource of input.resources){
  const value=YAML.parse(resource.text);delete value.components.examples;
  if(value.paths['/p']?.post){
   const schema=value.paths['/p'].post.responses[200].content['application/json'].schema;
   delete schema.$dynamicAnchor;delete schema.properties.child;
  }
  resource.text=(format==='json'?JSON.stringify(value):YAML.stringify(value)).replaceAll('9007199254740992','9007199254740993.00');
 }
 await inspect(input,'First','operation');const before=input.resources.map(resource=>resource.text);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={root:review.outputRoot,snapshot:'cold-two-stage-30-holder',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 const owned=await inspect(cold,'First','operation');assert(owned.at.pointer.includes('/components/callbacks/'));
 assert.equal(owned.graph.docs.get(owned.at.resource).dataNode('/components/pathItems'),undefined);
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

test('legacy native security copies retain plain description annotations through the common owner',async()=>{
 const input=fixture('json','3.0.4','operation'),first=JSON.parse(input.resources[0].text);
 first.components.securitySchemes.Access.description='First key';input.resources[0].text=JSON.stringify(first);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const packet={root:review.outputRoot,snapshot:'cold-plain-security-description',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 await inspect(packet,'First','operation');
 const graph=createGraph(packet).graph;
 const aliases=graph.entryScopes().filter(scope=>scope.kind==='security'&&scope.pointer.includes('_migrated_security_owner_'));
 assert(aliases.some(scope=>graph.docs.get(scope.resource).dataNode(scope.pointer+'/description')?.value==='First key'));
});

for(const inherited of ['servers','parameters'])test(`an independent Operation retains a located unproved ${inherited} inheritance blocker`,async()=>{
 const input=fixture('json','3.0.4','operation'),second=JSON.parse(input.resources[1].text);
 second.paths['/p'][inherited]=inherited==='servers'?[{url:'https://override.invalid'}]:[{name:'n',in:'query',schema:{type:'integer'}}];
 input.resources[1].text=JSON.stringify(second);
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 const failure=review.problems.find(problem=>problem.code==='migration.owners.operation-context');assert(failure,JSON.stringify(review.problems));
 assert.equal(failure.resource,input.resources[1].id);assert.equal(failure.pointer,'/paths/~1p/post');
});
