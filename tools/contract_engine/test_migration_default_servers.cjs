const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const dist=process.env.BUSYAPI_DEFAULT_SERVER_DIST||require('node:path').join(__dirname,'dist');
const {analyse}=require(dist+'/model.cjs'),{planMigration}=require(dist+'/migration.cjs');
for(const version of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])for(const targetVersion of ['3.0.4','3.1.2','3.2.1'])for(const servers of [undefined,[]])test(`${version} ${format} implicit Server ${servers?'empty':'absent'} survives migration to ${targetVersion}`,async()=>{
 const root='https://contracts.example.invalid/source/api.'+format,value={openapi:version,info:{title:'Implicit Server',version:'API-1'},...(servers?{servers}:{}),paths:{'/items':{get:{responses:{204:{description:'No body'}}}}}},text=format==='json'?JSON.stringify(value,null,2):'# Keep implicit Server\n'+YAML.stringify(value);
 const input={root,snapshot:'implicit-server',resources:[{id:root,text,generation:3}]},result=await planMigration({...input,targetVersion,destination:'file:///output/default/'});
 assert.equal(result.status,'faithfully-convertible',JSON.stringify(result.problems));assert.equal(result.complete,true);
 const output=result.outputs.find(output=>output.id===result.outputRoot),converted=YAML.parse(output.text);
 assert.equal(converted.openapi,targetVersion);assert.deepEqual(converted.paths,value.paths);
 assert.equal(new URL(converted.servers[0].url,output.id).href,new URL('/',root).href);
 assert.equal(analyse({root:output.id,snapshot:'target',resources:[{id:output.id,text:output.text,generation:0}]}).status,'complete');
 if(format==='yaml')assert(output.text.includes('# Keep implicit Server'));
 assert.equal(input.resources[0].text,text);
});
for(const format of ['yaml','json'])for(const reverse of [false,true])test(`${format} implicit Servers retain independent mixed-root retrievals reverse=${reverse}`,async()=>{
 const root='https://first.example.invalid/source/api.'+format,child='https://second.example.invalid/shared/child.'+format;
 const values=[{openapi:'3.0.4',info:{title:'First API',version:'API-1'},paths:{'/items':{get:{responses:{204:{description:'First no body'}}}}}},{openapi:'3.1.2',info:{title:'Second API',version:'API-2'},servers:[],paths:{'/items':{get:{responses:{204:{description:'No body'}}}}}}];
 const resources=values.map((value,index)=>({id:index?child:root,text:format==='json'?JSON.stringify(value,null,2):YAML.stringify(value),generation:index+1}));
 if(reverse)resources.reverse();const before=resources.map(resource=>resource.text),input={root,snapshot:'mixed',resources},result=await planMigration({...input,targetVersion:'3.2.1',destination:'file:///output/mixed/'});
 for(const entry of [root,child])assert.equal(analyse({...input,root:entry}).status,'complete');
 assert.equal(result.status,'faithfully-convertible',JSON.stringify(result.problems));assert.equal(result.complete,true);
 for(const [title,origin]of [['First API','https://first.example.invalid/'],['Second API','https://second.example.invalid/']]){
  const output=result.outputs.find(output=>{if(!output.id.endsWith('.'+format))return false;return YAML.parse(output.text).info.title===title;});assert(output,title);
  const converted=YAML.parse(output.text);assert.equal(converted.openapi,'3.2.1');assert.equal(converted.servers[0].url,origin);
 }
 assert.deepEqual(resources.map(resource=>resource.text),before);
});
for(const format of ['yaml','json'])for(const reverse of [false,true])test(`${format} legacy cross-family Path Item refusal remains explicit reverse=${reverse}`,async()=>{
 const root='https://first.example.invalid/source/api.'+format,child='https://second.example.invalid/shared/child.'+format;
 const values=[{openapi:'3.0.4',info:{title:'First API',version:'API-1'},paths:{'/items':{$ref:child+'#/paths/~1items'}}},{openapi:'3.1.2',info:{title:'Second API',version:'API-2'},servers:[],paths:{'/items':{get:{responses:{204:{description:'No body'}}}}}}];
 const resources=values.map((value,index)=>({id:index?child:root,text:format==='json'?JSON.stringify(value,null,2):YAML.stringify(value),generation:index+1}));
 if(reverse)resources.reverse();const before=resources.map(resource=>resource.text),input={root,snapshot:'mixed',resources},result=await planMigration({...input,targetVersion:'3.2.1',destination:'file:///output/mixed/'});
 assert.equal(analyse(input).complete,false);assert(analyse(input).findings.some(finding=>finding.code==='reference.family.unsupported'));
 assert.equal(result.status,'blocked');assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.code==='migration.validation.incomplete'&&problem.reason==='source-incomplete'));
 assert.deepEqual(resources.map(resource=>resource.text),before);
});
for(const alias of [false,true])test(`YAML implicit Server alias=${alias} retains physical ownership`,async()=>{
 const root='https://contracts.example.invalid/alias.yaml',text='openapi: 3.0.4\ninfo: {title: "Aliased default", version: "1"}\nx-held: &held []\nservers: '+(alias?'*held':'[]')+'\nx-copy: *held\npaths: {/items: {get: {responses: {"204": {description: "No body"}}}}}\n',input={root,snapshot:'alias',resources:[{id:root,text,generation:1}]},result=await planMigration({...input,targetVersion:'3.1.2',destination:'file:///output/alias/'});
 assert.equal(result.status,'faithfully-convertible',JSON.stringify(result.problems));
 const output=result.outputs.find(output=>output.id===result.outputRoot),converted=YAML.parse(output.text);
 assert.deepEqual(converted['x-held'],[]);assert.deepEqual(converted['x-copy'],[]);
 assert(output.text.includes('x-held: &held []\n'));assert(output.text.includes('x-copy: *held\n'));
 assert.equal(converted.servers[0].url,'https://contracts.example.invalid/');
 if(alias)assert(result.presentationChanges.some(change=>change.resource===root&&change.pointer==='/servers'));
 assert.equal(input.resources[0].text,text);
});
for(const format of ['yaml','json'])test(`3.2 ${format} implicit Server uses captured retrieval rather than $self`,async()=>{
 const root='file:///approved/api.'+format,retrieval='https://retrieval.example.invalid/source/api.'+format,identity='https://logical.example.invalid/identity',value={openapi:'3.2.1',$self:identity,info:{title:'Logical identity',version:'API-1'},paths:{'/items':{get:{responses:{204:{description:'No body'}}}}}},text=format==='json'?JSON.stringify(value,null,2):YAML.stringify(value),resources=[{id:root,aliases:[retrieval],text,generation:7}],result=await planMigration({root,snapshot:'logical-default',resources,targetVersion:'3.2.1',destination:'file:///output/logical/'});
 assert.equal(result.status,'faithfully-convertible',JSON.stringify(result.problems));assert.equal(result.complete,true);
 const output=result.outputs.find(output=>output.id===result.outputRoot),converted=YAML.parse(output.text);
 assert.equal(converted.$self,identity);assert.equal(converted.servers[0].url,new URL('/',retrieval).href);assert.notEqual(converted.servers[0].url,new URL('/',identity).href);
 assert.equal(resources[0].text,text);assert.deepEqual(resources[0].aliases,[retrieval]);
});

const {requestOperation}=require(dist+'/execution.cjs');
for(const version of ['2.0','3.0.0','3.0.4','3.1.0','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])
test(`B05-R3 ${version} ${format} Server alternatives and inherited overrides survive the Swagger boundary`,async()=>{
 const root='https://contracts.invalid/source/api.'+format;
 const value={...(version==='2.0'?{swagger:version,host:'api.invalid',basePath:'/base',schemes:['https','http']}:
  {openapi:version,servers:[{url:'{transport}://api.invalid/base',description:'Both supported protocols',variables:{transport:{default:'https',enum:['http','https']}}},{url:'https://api.invalid/base/../base'}]}),
  info:{title:'Equivalent targets',version:'1'},paths:{'/items':{...(version==='2.0'?{}:{servers:[{url:'http://api.invalid/base'}]}),get:{...(version==='2.0'?{schemes:['http']}:{}),responses:{204:{description:'No body'}}}},'/root':{get:{responses:{204:{description:'No body'}}}}}};
 const text=format==='yaml'?'# Preserve choices and exact data\n'+YAML.stringify(value):JSON.stringify(value),input={root,snapshot:'r3-server',resources:[{id:root,text,generation:7}]};
 const review=await planMigration({...input,targetVersion:version==='2.0'?'3.2.1':'2.0',destination:'file:///delivered/r3/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));assert.equal(input.resources[0].text,text);
 const resources=review.outputs.map(output=>({id:output.id,text:output.text,generation:0,aliases:Object.entries(review.manifest.resourceMappings).filter(([,path])=>path===output.path).map(([uri])=>uri)}));
 const cold={root:review.outputRoot,snapshot:'cold-r3',resources};assert.equal(analyse(cold).complete,true);
 const plan=path=>requestOperation({...cold,resource:cold.root,pointer:'/paths/'+path.replaceAll('/','~1')+'/get'});
 const inherited=plan('/items'),global=plan('/root');
 assert.deepEqual(inherited.servers.map(server=>server.url),['http://api.invalid/base']);
 assert.deepEqual(global.servers.map(server=>server.url),['https://api.invalid/base','http://api.invalid/base']);
 assert.equal(inherited.operation.method,'GET');assert.equal(inherited.operation.path,'/items');
 if(version!=='2.0')assert(review.outputs.some(output=>output.text.includes('Both supported protocols')),'Server documentation retains a standard documentation owner');
 const reverse=await planMigration({...cold,targetVersion:version==='2.0'?'2.0':version,destination:'file:///roundtrip/r3/'});
 assert.equal(reverse.complete,true,JSON.stringify(reverse.problems));
});
for(const [servers,code,reason]of [
 [[{url:'https://one.invalid/base'},{url:'https://two.invalid/base'}],'migration.server.targets','target-representation'],
 [[{url:'https://api.invalid/{tenant}',variables:{tenant:{default:'one'}}}],'migration.server.variable-domain','unavailable-proof'],
])test(`B05-R3 distinct/unbounded Server proof refuses ${code}`,async()=>{
 const root='https://contracts.invalid/api.json',value={openapi:'3.2.1',info:{title:'Restriction',version:'1'},servers,paths:{'/p':{get:{responses:{204:{description:'Done'}}}}}};
 const input={root,snapshot:'restriction',resources:[{id:root,text:JSON.stringify(value),generation:1}],targetVersion:'2.0',destination:'file:///refused/'};
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code===code&&problem.reason===reason),JSON.stringify(review.problems));
});
test('B05-R3 protocol-default ports retain an equivalent common Swagger authority',async()=>{
 const root='https://contracts.invalid/api.json',value={openapi:'3.1.2',info:{title:'Ports',version:'1'},servers:[{url:'https://api.invalid/base'},{url:'http://api.invalid:443/base'}],paths:{'/p':{get:{responses:{204:{description:'Done'}}}}}};
 const review=await planMigration({root,snapshot:'ports',resources:[{id:root,text:JSON.stringify(value),generation:1}],targetVersion:'2.0',destination:'file:///ports/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));const target=YAML.parse(review.outputs.find(output=>output.id===review.outputRoot).text);
 assert.equal(target.host,'api.invalid:443');assert.deepEqual(target.schemes,['https','http']);
});
for(const url of [undefined,'../api'])test(`B05-R3 local retrieval retains unresolved-host semantics for ${url??'implicit /'}`,async()=>{
 const root='file:///approved/contracts/api.json',value={openapi:'3.1.2',info:{title:'Local context',version:'1'},...(url?{servers:[{url}]}:{}),paths:{'/p':{get:{responses:{204:{description:'Done'}}}}}};
 const input={root,snapshot:'local-context',resources:[{id:root,text:JSON.stringify(value),generation:1}]},review=await planMigration({...input,targetVersion:'2.0',destination:'file:///different/directory/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));const target=YAML.parse(review.outputs.find(output=>output.id===review.outputRoot).text);
 assert.equal(target.host,undefined);assert.equal(target.schemes,undefined);assert.equal(target.basePath,url?'/approved/api':'/');
});
for(const mode of ['ordinal','variable'])test(`B05-R3 changed configured Server ${mode} receives an explicit reviewed projection`,async()=>{
 const root='https://contracts.invalid/configured.json',value={openapi:'3.2.1',info:{title:'Configured Servers',version:'1'},servers:[{url:'{scheme}://api.invalid/base',variables:{scheme:{default:'https',enum:['https','http']}}},{url:'https://api.invalid/base'}],paths:{'/p':{get:{responses:{204:{description:'Done'}}}}}};
 const configuration={id:'file:///captured/busyapi.yaml',generation:1,identity:'configured-selector',text:JSON.stringify({version:1,
  ...(mode==='variable'?{environments:{manual:{variables:{scheme:'http'}}}}:{}),tests:[{name:'selected',operation:{method:'get',path:'/p'},server:mode==='ordinal'?1:0}]})};
 const review=await planMigration({root,snapshot:'configured-selector',resources:[{id:root,text:JSON.stringify(value),generation:1}],configuration,targetVersion:'2.0',destination:'file:///configured-servers/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));assert(review.configurationProjections.length>0);
 const manifest=JSON.parse(review.manifestText);
 if(mode==='ordinal')assert.equal(manifest.tests[0].server,0);
 else {assert.equal(manifest.tests[0].servers.manual,1);assert.equal(Object.values(manifest.environments.manual.servers)[0],1);}
 assert.equal(configuration.identity,'configured-selector');
});

const {migrationRequestSignatures}=require(dist+'/migration_invariants.cjs');
const {createGraph}=require(dist+'/model.cjs');
for(const version of ['3.0.0','3.0.4','3.1.0','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])
test(`B05-R3a ${version} ${format} splits methods with opaque segments, inherited parameters, bodies and authentication`,async()=>{
 const root='https://api.invalid/source/api.'+format,empty={description:'No body'};
 const value={openapi:version,info:{title:'Server relocation',version:'1'},servers:[{url:'https://api.invalid/root'},{url:'http://api.invalid/root'}],
  security:[{Basic:[]}],components:{securitySchemes:{Basic:{type:'http',scheme:'basic'}}},paths:{
   '/items/{id}':{servers:[{url:'../one%2Fv'},{url:'https://api.invalid/one%2Fv'}],parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}}],
    'x-held':{exact:'EXACT'},get:{operationId:'read',responses:{204:empty}},
    post:{operationId:'write',servers:[{url:'http://api.invalid/two'}],requestBody:{required:true,content:{'application/json':{schema:{type:'boolean'},example:false}}},responses:{204:empty}}},
   '/inherited':{get:{operationId:'inherited',responses:{204:empty}}}},'x-untouched':{reference:{$ref:'literal-only'},exact:'EXACT'}};
 const text=(format==='yaml'?'# Keep relocation and aliases\n'+YAML.stringify(value):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const resources=[{id:root,text,generation:11}],input={root,resources,snapshot:'r3a-split'};
 const result=await planMigration({...input,targetVersion:'2.0',destination:'file:///new/r3a/'});
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(resources[0].text,text);
 const cold={root:result.outputRoot,snapshot:'r3a-cold',resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 assert.equal(analyse(cold).complete,true,JSON.stringify(analyse(cold).findings));
 const sourceGraph=createGraph(input).graph,graph=createGraph(cold).graph;
 assert.deepEqual(migrationRequestSignatures(sourceGraph,resources),migrationRequestSignatures(graph,cold.resources));
 assert.deepEqual(graph.operations().map(operation=>[operation.method,operation.path]).sort(),[
  ['get','/one%2Fv/items/{id}'],['get','/root/inherited'],['post','/two/items/{id}']].sort());
 for(const operation of graph.operations()){
  const plan=requestOperation({...cold,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
  assert.equal(plan.security.schemes.Basic.type,'http');assert.equal(plan.security.schemes.Basic.scheme,'basic');
  if(operation.path.includes('{id}'))assert(plan.parameters.some(parameter=>parameter.name==='id'&&parameter.in==='path'&&parameter.required));
  if(operation.method==='post'){assert(plan.requestBody.required);assert.deepEqual(plan.requestBody.content.map(media=>media.mediaType),['application/json']);assert.deepEqual(plan.servers.map(server=>server.url),['http://api.invalid/']);}
 }
 const output=result.outputs.find(output=>output.id===result.outputRoot);assert(output.text.includes('9007199254740993.00'));
 if(format==='yaml')assert(output.text.includes('# Keep relocation and aliases'));
});
for(const mode of ['collision','template','alternatives','authority'])test(`B05-R3a ${mode} retains a precise target restriction`,async()=>{
 const responses={204:{description:'No body'}},operation={responses},paths=mode==='template'?{
  '/a/{id}':{servers:[{url:'https://api.invalid/v'}],get:{...operation,parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}}]}},
  '/v/a/{name}':{get:{...operation,parameters:[{name:'name',in:'path',required:true,schema:{type:'string'}}]}}}:
  mode==='collision'?{'/a':{servers:[{url:'https://api.invalid/v'}],get:operation},'/v/a':{get:operation}}:
  {'/a':{get:{...operation,servers:mode==='alternatives'?[{url:'https://api.invalid/v1'},{url:'https://api.invalid/v2'}]:[{url:'https://other.invalid/v'}]}},...(mode==='authority'?{'/root':{get:operation}}:{})};
 const root='https://api.invalid/source.json',text=JSON.stringify({openapi:'3.2.1',info:{title:'Restrictions',version:'1'},servers:[{url:'https://api.invalid/'}],paths});
 const result=await planMigration({root,resources:[{id:root,text,generation:1}],snapshot:mode,targetVersion:'2.0',destination:'file:///refused/'+mode+'/'});
 assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.reason==='target-representation'&&
  problem.code===(mode==='alternatives'?'migration.server.operation-path':mode==='authority'?'migration.server.targets':'migration.server.route-collision')),JSON.stringify(result.problems));
});
test('B05-R3a disjoint methods may meet without inheriting another route\'s query parameter',async()=>{
 const root='https://api.invalid/api.json',parameter=name=>({name,in:'query',schema:{type:'string'}}),responses={204:{description:'Empty'}};
 const input={root,snapshot:'meet',resources:[{id:root,generation:1,text:JSON.stringify({openapi:'3.1.2',info:{title:'Meet',version:'1'},servers:[{url:'https://api.invalid/'}],paths:{
  '/a':{servers:[{url:'https://api.invalid/v'}],parameters:[parameter('first')],get:{responses}},'/v/a':{parameters:[parameter('second')],post:{responses}}}})}]};
 const result=await planMigration({...input,targetVersion:'2.0',destination:'file:///meet/'});assert.equal(result.complete,true,JSON.stringify(result.problems));
 const packet={root:result.outputRoot,snapshot:'cold',resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 for(const method of ['get','post']){
  const plan=requestOperation({...packet,resource:packet.root,pointer:'/paths/~1v~1a/'+method});
  assert.deepEqual(plan.parameters.map(parameter=>parameter.name),[method==='get'?'first':'second']);
 }
});
for(const environment of [{variables:{scheme:'http'}},{variables:{scheme:'invalid'}},{baseUrl:'https://override.invalid/base',variables:{scheme:'invalid'}}])
test(`B05-R3a saved defaults, ordinal collapse and invalid variables ${JSON.stringify(environment)}`,async()=>{
 const root='https://api.invalid/api.json',value={openapi:'3.1.2',info:{title:'Saved',version:'1'},servers:[{url:'{scheme}://api.invalid/base',variables:{scheme:{default:'https',enum:['https','http']}}},{url:'https://api.invalid/base'}],paths:{'/a':{get:{responses:{204:{description:'Empty'}}}}}};
 const configuration={id:'file:///source/busyapi.yaml',identity:'exact-config',generation:9,text:JSON.stringify({version:1,environments:{manual:{...environment,tls:{verify:true},authentication:{schemes:{}},'x-exact':'EXACT'}},tests:[
  {name:'default',operation:{path:'/a',method:'get'}},{name:'collapsed',operation:{path:'/a',method:'get'},server:1},{name:'invalid',operation:{path:'/a',method:'get'},server:99}],'x-kept':'EXACT'}).replaceAll('"EXACT"','9007199254740993.00')};
 const input={root,snapshot:'saved-selections',resources:[{id:root,text:JSON.stringify(value),generation:1}],configuration};
 const result=await planMigration({...input,targetVersion:'2.0',destination:'file:///saved/'});assert.equal(result.complete,true,JSON.stringify(result.problems));
 const saved=JSON.parse(result.manifestText);assert.equal(saved.tests[1].server,0);assert.equal(saved.tests[2].server,99);
 assert(result.manifestText.includes('9007199254740993.00'));assert.deepEqual(saved.environments.manual.tls,environment.tls??{verify:true});
 if(!environment.baseUrl){const expected=environment.variables.scheme==='http'?1:2;assert.equal(Object.values(saved.environments.manual.servers)[0],expected);assert.equal(saved.tests[0].servers,undefined);}
 else {assert.equal(saved.environments.manual.baseUrl,environment.baseUrl);assert.equal(saved.tests[0].servers,undefined);}
 const repeat=await planMigration({...input,targetVersion:'2.0',destination:'file:///saved/'});assert.equal(repeat.identity,result.identity);
});

test('R3a an overridden unused root Server does not invent an authority or path restriction',async()=>{
 const root='https://contracts.invalid/source.json',configuration={id:'file:///source/busyapi.yaml',generation:1,identity:'override',text:JSON.stringify({version:1,
  environments:{manual:{baseUrl:'https://override.invalid/manual',variables:{unused:'kept'},tls:{'x-exact':'literal'}}},
  tests:[{name:'held',operation:{method:'get',path:'/p'}}]})};
 const value={openapi:'3.2.1',info:{title:'Unused root',version:'1'},servers:[{url:'https://unused.invalid/root'}],paths:{'/p':{get:{servers:[{url:'https://api.invalid/base'}],responses:{204:{description:'Empty'}}}}}};
 const result=await planMigration({root,snapshot:'unused-root',resources:[{id:root,text:JSON.stringify(value),generation:1}],configuration,targetVersion:'2.0',destination:'file:///unused-root/'});
 assert.equal(result.complete,true,JSON.stringify(result.problems));const output=YAML.parse(result.outputs.find(output=>output.id===result.outputRoot).text);
 assert.equal(output.host,'api.invalid');assert.equal(output.basePath,'/base');assert.deepEqual(JSON.parse(result.manifestText).environments,JSON.parse(configuration.text).environments);
 assert(result.configurationProjections.every(change=>change.pointer==='/tests/0/operation'));
});

for(const compatible of [true,false])test(`R3a explicit environment interpolation has ${compatible?'a reviewed factor':'a precise path restriction'}`,async()=>{
 const root='https://api.invalid/source.json',value={openapi:'3.1.2',info:{title:'Override factoring',version:'1'},servers:[{url:'https://api.invalid/root'}],paths:{
  '/p':{get:{servers:[{url:'https://api.invalid/one'}],responses:{204:{description:'Empty'}}}},
  '/q':{get:{servers:[{url:'https://api.invalid/'+(compatible?'one':'two')}],responses:{204:{description:'Empty'}}}}}};
 value.paths['/root']={get:{responses:{204:{description:'Empty'}},servers:[{url:'https://api.invalid/one'}]}};
 // A trailing slash is a distinct Server spelling with equivalent request
 // appending. It requires the same factored override for the third operation.
 value.paths['/root'].get.servers=[{url:'https://api.invalid/one/'}];
 const configuration={id:'file:///source/busyapi.yaml',generation:1,identity:'factored',text:JSON.stringify({version:1,
  environments:{manual:{baseUrl:'https://override.invalid/${prefix}/one',variables:{prefix:'captured'},authentication:{schemes:{}},tls:{'x-kept':true}}}})};
 const result=await planMigration({root,resources:[{id:root,text:JSON.stringify(value),generation:1}],configuration,snapshot:'factor-'+compatible,targetVersion:'2.0',destination:'file:///factor/'});
 if(compatible){assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(JSON.parse(result.manifestText).environments.manual.baseUrl,'https://override.invalid/${prefix}');assert(result.configurationProjections.some(change=>change.pointer==='/environments/manual/baseUrl'));}
 else {assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.code==='migration.server.override-path'&&problem.reason==='target-representation'));}
});

test('R3a a saved invalid entry selector cannot activate when delivered entry names change',async()=>{
 const root='file:///source/api.json',value={openapi:'3.1.2',info:{title:'Invalid entry',version:'1'},servers:[{url:'https://api.invalid/base'}],paths:{'/p':{get:{responses:{204:{description:'Empty'}}}}}};
 const configuration={id:'file:///source/busyapi.yaml',generation:1,identity:'invalid-entry',text:JSON.stringify({version:1,roots:[{name:'api',path:'api.json'}],tests:[{name:'invalid',operation:{entry:'migrated',method:'get',path:'/p'}}]})};
 const result=await planMigration({root,snapshot:'invalid-entry',resources:[{id:root,text:JSON.stringify(value),generation:1}],configuration,targetVersion:'2.0',destination:'file:///invalid-entry/'});
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert(JSON.parse(result.manifestText).tests[0].operation.occurrence.startsWith('busyapi-invalid-operation:'));
});
