const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{analyse}=require('./dist/model.cjs'),{evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');

for(const mutation of ['encoding','domain','required','name'])test(`R3c final parameter wire proof rejects ${mutation}`,async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')(),result=await planMigration(input);
 assert.equal(result.complete,true,JSON.stringify(result.problems));
 const {createGraph}=require('./dist/model.cjs'),{proveMigrationParameterSerialization}=require('./dist/migration_invariants.cjs');
 const before=createGraph(input).graph;
 let resources=result.outputs.map(output=>({id:output.id,text:output.text,generation:0}));
 const resource=resources.find(resource=>resource.id===result.outputRoot),doc=new SourceDocument(resource.text,resource.id),base='/components/parameters/Literal';
 if(mutation==='encoding'){
  const value=JSON.parse(doc.dataJson(base));value.schema=value.content['text/plain'].schema;delete value.content;value.style='form';value.explode=true;
  resource.text=doc.set(base,value);
 }
 if(mutation==='domain')resource.text=doc.set(base+'/content/text~1plain/schema/enum',['a%20b']);
 if(mutation==='required')resource.text=doc.set(base+'/required',true);
 if(mutation==='name')resource.text=doc.set(base+'/name','renamed');
 const after=createGraph({root:result.outputRoot,resources,snapshot:'r3c-mutated'}).graph,problems=[];
 await proveMigrationParameterSerialization(before,after,at=>[{resource:result.outputRoot,pointer:at.pointer}],(at,code,message,reason)=>problems.push({at,code,message,reason}));
 assert(problems.some(problem=>problem.code==='migration.invariant.parameter-wire'),JSON.stringify(problems));
});

for(const format of ['yaml','json'])test(`R3c ${format} saved whole-query values have exact reviewed key moves`,async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')('3.2.1',format,'3.0.4');
 const configuration={version:1,roots:[{name:'api',path:'api.'+format}],environments:{local:{variables:{held:'unchanged'}}},tests:[
  {name:'saved',operation:{method:'get',path:'/p'},environment:'local',parameters:{querystring:{descriptionOnly:{q:'%20',flag:false}},cookie:{literal:'a%20b',one:['safe'],object:{left:'L'}}}},
 ]};
 input.configuration={id:'file:///captured/busyapi.yaml',text:JSON.stringify(configuration),generation:7};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const projection=result.configurationProjections.find(change=>change.pointer==='/tests/0/parameters');assert(projection);
 assert.deepEqual(JSON.parse(projection.before),configuration.tests[0].parameters);
 assert.deepEqual(JSON.parse(projection.after),{query:{descriptionOnly:{q:'%20',flag:false}},cookie:configuration.tests[0].parameters.cookie});
 assert.deepEqual(result.manifest.tests[0].parameters,JSON.parse(projection.after));
 assert.deepEqual(result.manifest.environments.local.variables,{held:'unchanged'});
 for(const mutation of ['occupied','outside-domain','raw']){
  const changed=JSON.parse(input.configuration.text);
  if(mutation==='occupied')changed.tests[0].parameters.query={descriptionOnly:{q:'keep'}};
  if(mutation==='outside-domain')changed.tests[0].parameters.querystring.descriptionOnly={q:'a b'};
  if(mutation==='raw')changed.tests[0].parameters.querystring.descriptionOnly='q=%20';
  const refused=await planMigration({...input,configuration:{...input.configuration,text:JSON.stringify(changed)}});
  assert.equal(refused.complete,false);assert.deepEqual(refused.outputs,[]);
  assert(refused.problems.some(problem=>problem.code.startsWith('migration.parameter.saved-')),JSON.stringify(refused.problems));
 }
});
for(const format of ['yaml','json'])test(`B05-R1 ${format} cleared global media has independent request and response ownership across entries`,async()=>{
 const input=require('./migration_operation_contexts_fixture.cjs')(format,{empty:true}),before=input.resources.map(resource=>resource.text);
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const {createGraph}=require('./dist/model.cjs'),{requestOperation}=require('./dist/execution.cjs');
 const resources=result.outputs.map(output=>({id:output.id,text:output.text,generation:0}));
 for(const [index,resource]of input.resources.slice(0,2).entries()){
  const root=result.changes.find(change=>change.resource===resource.id).destination,packet={root,resources,snapshot:'cold-cleared-media'};
  const operation=createGraph(packet).graph.operations().find(operation=>operation.path==='/inherited');
  const plan=requestOperation({...packet,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
  assert.deepEqual(plan.requestBody.content.map(media=>media.mediaType),index?['*/*']:['application/json']);
  assert.deepEqual(plan.responses[0].content.map(media=>media.mediaType),index?['application/json']:['application/vnd.reply-a+json']);
 }
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});
const versions=['2.0','3.0.4','3.1.2','3.2.1'];
function document(version,name){
 const defs=version==='2.0'?'/definitions':'/components/schemas',schema={$ref:'#'+defs+'/Model'};
 return {...(version==='2.0'?{swagger:version,host:name+'.example.invalid',schemes:['https'],basePath:'/v1',produces:['application/json']}:{openapi:version,servers:[{url:'https://'+name+'.example.invalid/v1'}]}),info:{title:name+' 雪',version:'api-version'},paths:{['/'+name]:{get:{operationId:'read_'+name,responses:{200:{description:'[Guide](/guide)',...(version==='2.0'?{schema}:{content:{'application/json':{schema}}})}}}}},...(version==='2.0'?{definitions:{Model:{type:'integer',minimum:'EXACT'}}}:{components:{schemas:{Model:{type:'integer',minimum:'EXACT'}}}}),'x-kept':{n:'EXACT',flag:false,empty:'',literal:{$ref:'not a contract reference'}}};
}
function fixture(primary,secondary,format,targetVersion){
 const root='file:///approved/primary.'+format,part='file:///approved/secondary.'+format;
 const encode=value=>(format==='json'?JSON.stringify(value):'# Keep comments 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n')).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 return {root,snapshot:'entry-routes',targetVersion,destination:'file:///reviewed/output/',resources:[{id:root,text:encode(document(primary,'primary')),generation:1},{id:part,text:encode(document(secondary,'secondary')),generation:2}]};
}
for(const primary of versions)for(const secondary of versions)for(const targetVersion of versions)for(const format of ['yaml','json'])test(`${primary} + ${secondary} ${format} captured entries follow their own route to ${targetVersion}`,async()=>{
 const input=fixture(primary,secondary,format,targetVersion),before=input.resources.map(r=>r.text);
 assert.equal(analyse(input).status,'complete');const result=await planMigration(input);
 assert.equal(result.status,'faithfully-convertible',JSON.stringify(result.problems));assert.equal(result.complete,true);assert.equal(result.manifest.roots.length,2);assert.equal(result.entryRoutes.length,2);
 for(const [index,entry]of result.entryRoutes.entries()){const source=input.resources.find(r=>r.id===entry.resource);assert(source);const declaration=new SourceDocument(source.text,source.id).root.value;assert.equal(entry.from.declaredVersion,declaration.swagger??declaration.openapi);assert.equal(entry.target.declaredVersion,targetVersion);assert(Array.isArray(entry.stages));}
 assert.equal(result.outputs.length,2);assert.deepEqual(input.resources.map(r=>r.text),before);
 const resources=result.outputs.map(o=>({id:o.id,text:o.text,generation:0,aliases:Object.entries(result.manifest.resourceMappings).filter(([,path])=>path===o.path).map(([uri])=>uri)}));
 for(const name of ['primary','secondary']){
  const output=result.outputs.find(o=>new SourceDocument(o.text,o.id).node('/info/title').value===name+' 雪');assert(output);
  const target=new SourceDocument(output.text,output.id);assert.equal(target.node(targetVersion==='2.0'?'/swagger':'/openapi').value,targetVersion);assert.equal(target.node('/info/version').value,'api-version');
  const original=input.resources.find(r=>new SourceDocument(r.text,r.id).node('/info/title').value===name+' 雪');assert.equal(target.dataJson('/x-kept'),new SourceDocument(original.text,original.id).dataJson('/x-kept'));
  assert.equal(analyse({root:output.id,snapshot:'cold-'+name,resources}).status,'complete');
  const pointer=targetVersion==='2.0'?'/definitions/Model':'/components/schemas/Model';
  const evaluated=await evaluateSchemas({root:output.id,snapshot:'exact-'+name,resources,runtimeInstances:['9007199254740993.00','9007199254740992.00'].map(text=>({subject:'response-body',text,location:'application/json',schema:{resource:output.id,pointer}}))});
  assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.runtimeEvaluations.map(e=>e.valid),[true,false]);
  if(format==='yaml')assert(output.text.startsWith('# Keep comments 雪\r\n'));
 }
});
for(const primary of ['2.0','3.0.4'])for(const targetVersion of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])test(`${primary} ${format} ignored-body decision follows the original entry in composed routes to ${targetVersion}`,async()=>{
 const secondary=primary==='2.0'?'3.0.4':'2.0',input=fixture(primary,secondary,format,targetVersion),ignoredBodyEntry=input.resources.find((_,index)=>(index===0?primary:secondary)==='3.0.4');
 for(const [index,resource]of input.resources.entries()){
  const version=index===0?primary:secondary,name=index===0?'primary':'secondary',pointer='/paths/~1'+name+'/get',schema={$ref:'#'+(version==='2.0'?'/definitions':'/components/schemas')+'/Model'};
  let doc=new SourceDocument(resource.text,resource.id);
  resource.text=version==='2.0'?new SourceDocument(doc.set('/consumes',['application/json']),resource.id).set(pointer+'/parameters',[{name:'body',in:'body',schema}]):doc.set(pointer+'/requestBody',{content:{'application/json':{schema}}});
 }
 const before=input.resources.map(r=>r.text),review=await planMigration(input);
 assert.equal(review.status,'requires-decision',JSON.stringify(review.problems));assert.deepEqual(review.outputs,[]);
 const choices=review.problems.filter(p=>p.code==='migration.body.ignored-activation');assert.equal(choices.length,1);assert.equal(choices[0].resource,ignoredBodyEntry.id);
 const accepted=await planMigration({...input,decisions:{[choices[0].id]:'omit-ignored-body'}});assert.equal(accepted.complete,true,JSON.stringify(accepted.problems));
 for(const [index,name]of ['primary','secondary'].entries()){
  const output=accepted.outputs.find(o=>new SourceDocument(o.text,o.id).node('/info/title').value===name+' 雪'),doc=new SourceDocument(output.text,output.id);
  assert.equal(doc.dataNode('/paths/~1'+name+'/get').children.has('requestBody'),(index===0?primary:secondary)==='2.0');
 }
 assert.deepEqual(input.resources.map(r=>r.text),before);
});
for(const format of ['yaml','json'])test(`${format} a modern-only secondary operation blocks an unrepresentable target without output`,async()=>{
 const input=fixture('3.0.4','3.2.1',format,'3.0.4'),resource=input.resources[1],doc=new SourceDocument(resource.text,resource.id);
 resource.text=doc.set('/paths/~1secondary/query',{responses:{204:{description:'Query'}}});const before=input.resources.map(r=>r.text),result=await planMigration(input);
 assert.equal(result.complete,false);assert.equal(result.status,'blocked');assert.deepEqual(result.outputs,[]);assert.deepEqual(result.changes,[]);
 const issue=result.problems.find(p=>p.code==='migration.operation.method');assert(issue,JSON.stringify(result.problems));assert.equal(issue.resource,resource.id);assert.equal(issue.pointer,'/paths/~1secondary/query');assert(issue.range[1]>issue.range[0]);assert.deepEqual(input.resources.map(r=>r.text),before);
});

for(const [path,code]of [
 [{query:{responses:{204:{description:'QUERY'}}}},'migration.operation.method'],
 [{additionalOperations:{gEt:{responses:{204:{description:'Exact case'}}}}},'migration.operation.method'],
 [{get:{parameters:[{name:'whole',in:'querystring',content:{'application/json':{schema:{type:'object'}}}}],responses:{204:{description:'Done'}}}},'migration.parameter.querystring-target'],
])test(`B05-R3 an older route cannot acquire different request semantics: ${code}`,async()=>{
 const root='https://contracts.invalid/r3-method.json',value={openapi:'3.2.1',info:{title:'Exact requests',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/p':path}};
 const text=JSON.stringify(value),review=await planMigration({root,snapshot:'method-proof',resources:[{id:root,text,generation:1}],targetVersion:'3.1.2',destination:'file:///refused-method/'});
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert(review.problems.some(problem=>problem.code===code),JSON.stringify(review.problems));
});

for(const format of ['yaml','json'])test(`R3a ${format} retrieval aliases and mixed entries retain independent relocated routes`,async()=>{
 const root='file:///captured/a.'+format,second='file:///captured/b.'+format,shared='file:///captured/shared.'+format;
 const response={204:{description:'Empty'}},entry=(version,title,path)=>({openapi:version,info:{title,version:'1'},paths:{[path]:{$ref:'./shared.'+format+'#/Item'}}});
 const values=[entry('3.0.4','A','/a'),entry('3.2.1','B','/b'),{Item:{servers:[{url:'../get'}],get:{responses:response},post:{servers:[{url:'https://api.invalid/post'}],responses:response}}}];
 const resources=values.map((value,index)=>({id:[root,second,shared][index],aliases:['https://api.invalid/capture/'+['a','b','shared'][index]+'.'+format],generation:index+1,
  text:format==='yaml'?'# Keep aliases and external ownership\n'+YAML.stringify(value):JSON.stringify(value)}));
 const before=resources.map(resource=>resource.text),result=await planMigration({root,resources,snapshot:'r3a-mixed',targetVersion:'2.0',destination:'file:///mixed-r3a/'});
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.deepEqual(resources.map(resource=>resource.text),before);
 const delivered=result.outputs.map(output=>({id:output.id,text:output.text,generation:0,aliases:Object.entries(result.manifest.resourceMappings).filter(([,path])=>path===output.path).map(([uri])=>uri)}));
 const {createGraph}=require('./dist/model.cjs');
 for(const [title,suffix]of [['A','/a'],['B','/b']]){
  const output=result.outputs.find(output=>new SourceDocument(output.text,output.id).dataNode('/info/title')?.value===title);
  const packet={root:output.id,snapshot:'cold-mixed',resources:delivered};assert.equal(analyse(packet).complete,true);
  assert.deepEqual(createGraph(packet).graph.operations().map(operation=>[operation.method,operation.path]).sort(),[['get','/get'+suffix],['post','/post'+suffix]].sort());
 }
});

for(const mutation of ['lost','extra','method','path','operationId','url','body'])test(`R3a semantic identity invariant rejects ${mutation}`,()=>{
 const {createGraph}=require('./dist/model.cjs'),{migrationOperationPairs,migrationRequestSignatures}=require('./dist/migration_invariants.cjs');
 const root='https://api.invalid/source.json',target='https://api.invalid/target.json',response={204:{description:'Empty'}};
 const operation={operationId:'kept',requestBody:{required:true,content:{'application/json':{schema:{type:'boolean'}}}},responses:response};
 const a={root,snapshot:'before',resources:[{id:root,generation:1,text:JSON.stringify({openapi:'3.1.2',info:{title:'Invariant',version:'1'},servers:[{url:'https://api.invalid/base'}],paths:{'/p':{post:operation}}})}]};
 const body={name:'body',in:'body',required:mutation!=='body',schema:{type:'boolean'}};
 const native={operationId:mutation==='operationId'?'changed':'kept',consumes:['application/json'],parameters:[body],responses:response};
 const paths=mutation==='lost'?{}:{[mutation==='path'?'/wrong':'/base/p']:{[mutation==='method'?'put':'post']:native}};
 if(mutation==='extra')paths['/extra']={post:{...native,operationId:'extra'}};
 const b={root:target,snapshot:'after',resources:[{id:target,generation:1,text:JSON.stringify({swagger:'2.0',info:{title:'Invariant',version:'1'},host:mutation==='url'?'other.invalid':'api.invalid',basePath:'/',schemes:['https'],paths})}]};
 const source=createGraph(a).graph,output=createGraph(b).graph,issues=[];
 const pairs=migrationOperationPairs(source,output,location=>[{resource:target,pointer:location.pointer.replace('/paths/~1p','/paths/~1base~1p')}],(_location,code)=>issues.push(code));
 if(['url','body'].includes(mutation)){
  assert.equal(issues.length,0);assert.equal(pairs.length,1);
  assert.notDeepEqual(migrationRequestSignatures(source,a.resources),migrationRequestSignatures(output,b.resources));
 }else assert(issues.some(code=>code.startsWith('migration.invariant.operation')),JSON.stringify(issues));
});

for(const sharedSelector of [false,true])test(`R3a mixed-entry saved selectors ${sharedSelector?'refuse incompatible paths':'retain their captured occurrence owner'}`,async()=>{
 const root='file:///source/a.json',other='file:///source/b.json',response={204:{description:'Empty'}};
 const entry=(title,prefix)=>({openapi:'3.1.2',info:{title,version:'1'},servers:[{url:'https://api.invalid/root'}],paths:{
  '/p':{get:{servers:[{url:'https://api.invalid/'+prefix},{url:'https://api.invalid/'+prefix}],responses:response}},'/anchor':{get:{responses:response}}}});
 const configuration={id:'file:///source/busyapi.yaml',generation:3,identity:'mixed-cases',text:JSON.stringify({version:1,roots:[{name:'A',path:'a.json'},{name:'B',path:'b.json'}],
  tests:[{name:'held',operation:sharedSelector?{method:'get',path:'/p'}:{occurrence:root+'#/paths/~1p/get',method:'post',path:'/ignored','x-exact':'EXACT'},server:1}]})
  .replace('"EXACT"','9007199254740993.00')};
 const result=await planMigration({root,snapshot:'mixed-cases-'+sharedSelector,configuration,resources:[{id:root,text:JSON.stringify(entry('A','a')),generation:1},
  {id:other,text:JSON.stringify(entry('B','b')),generation:2}],targetVersion:'2.0',destination:'file:///mixed-cases/'});
 if(sharedSelector){assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>
  ['migration.server.configured-selection','migration.server.case-identity'].includes(problem.code)&&problem.reason==='target-representation'),JSON.stringify(result.problems));}
 else {assert.equal(result.complete,true,JSON.stringify(result.problems));const saved=JSON.parse(result.manifestText).tests[0];
  assert.equal(saved.operation.entry,'migrated');assert.equal(saved.operation.method,'GET');assert.equal(saved.operation.path,'/a/p');assert.equal(saved.operation.occurrence,undefined);
  assert.equal(saved.server,0);assert(result.manifestText.includes('9007199254740993.00'));}
});
for(const kind of ['path-item','media'])
for(const version of kind==='media'?['3.2.0','3.2.1']:['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])
test(`R3b ${version} ${format} unused ${kind} has a final Swagger restriction without output`,async()=>{
 const root='file:///unused/r3b.'+format,object=kind==='path-item'?{get:{operationId:'inactive',responses:{204:{description:'Empty'}}}}:{schema:{type:'boolean'},example:false};
 const group=kind==='path-item'?'pathItems':'mediaTypes',value={openapi:version,info:{title:'Unused owner',version:'1'},paths:{},components:{[group]:{Unused:object}}};
 const text=format==='yaml'?YAML.stringify(value):JSON.stringify(value),input={root,snapshot:'r3b-unused',resources:[{id:root,text,generation:9}],targetVersion:'2.0',destination:'file:///unused-output/'};
 const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert.deepEqual(result.changes,[]);
 const code=kind==='path-item'?'migration.path-item.unused-owner':'migration.media.unbound-owner',problem=result.problems.find(problem=>problem.code===code);
 assert(problem,JSON.stringify(result.problems));assert.equal(problem.reason,'target-representation');assert.equal(problem.pointer,'/components/'+group+'/Unused');
 assert(problem.range[1]>problem.range[0]);assert.equal(input.resources[0].text,text);
});
for(const format of ['yaml','json'])test(`R3b ${format} a chain among unused Path Items does not establish an executable consumer`,async()=>{
 const root='file:///unused/chain.'+format,value={openapi:'3.2.1',info:{title:'Unused chain',version:'1'},paths:{},components:{pathItems:{A:{$ref:'#/components/pathItems/B'},B:{get:{responses:{204:{description:'Empty'}}}}}}};
 const text=format==='yaml'?YAML.stringify(value):JSON.stringify(value),review=await planMigration({root,snapshot:'unused-chain',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///unused-chain/'});
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 const problems=review.problems.filter(p=>p.code==='migration.path-item.unused-owner');assert.equal(problems.length,2);
 assert(problems.every(p=>p.reason==='target-representation'));
});



for(const format of ['yaml','json'])for(const version of ['3.0.0','3.0.4','3.1.0','3.1.2'])
test(`R3b ${format} ${version} Paths and 3.2 reusable definitions retain one coordinated Swagger route`,async()=>{
 const fixture=require('./migration_b05_r3b_fixture.cjs'),{input,entry}=fixture.capture(format);
 entry.openapi=version;input.resources[0].text=fixture.render(entry,format);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold=fixture.reopened(review),{createGraph}=require('./dist/model.cjs');
 const {migrationRequestSignatures}=require('./dist/migration_invariants.cjs');
 assert.deepEqual(migrationRequestSignatures(createGraph(cold).graph,cold.resources),migrationRequestSignatures(createGraph(input).graph,input.resources));
 assert.equal(createGraph(cold).graph.operations().length,2);
});

for(const format of ['yaml','json'])test(`R3b ${format} a separately referenced child schema cannot activate its unused Path Item`,async()=>{
 const root='file:///unused/child.'+format,child='/components/pathItems/Unused/get/responses/200/content/application~1json/schema';
 const value={openapi:'3.2.1',info:{title:'Independent child',version:'1'},paths:{},components:{
  pathItems:{Unused:{get:{responses:{200:{description:'Boolean',content:{'application/json':{schema:{type:'boolean'},example:false}}}}}}},
  schemas:{Child:{$ref:'#'+child}}}};
 const text=format==='yaml'?YAML.stringify(value):JSON.stringify(value),input={root,snapshot:'unused-child',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///unused-child/'};
 const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
 assert(result.problems.some(problem=>problem.code==='migration.path-item.unused-owner'&&problem.reason==='target-representation'),JSON.stringify(result.problems));
 assert.equal(input.resources[0].text,text);
});
