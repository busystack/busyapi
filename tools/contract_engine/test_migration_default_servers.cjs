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
for(const mode of ['ordinal','variable'])test(`B05-R3 changed configured Server ${mode} cannot silently select another target`,async()=>{
 const root='https://contracts.invalid/configured.json',value={openapi:'3.2.1',info:{title:'Configured Servers',version:'1'},servers:[{url:'{scheme}://api.invalid/base',variables:{scheme:{default:'https',enum:['https','http']}}},{url:'https://api.invalid/base'}],paths:{'/p':{get:{responses:{204:{description:'Done'}}}}}};
 const configuration={id:'file:///captured/busyapi.yaml',generation:1,identity:'configured-selector',text:JSON.stringify({version:1,
  ...(mode==='variable'?{environments:{manual:{variables:{scheme:'http'}}}}:{}),tests:[{name:'selected',operation:{method:'get',path:'/p'},server:mode==='ordinal'?1:0}]})};
 const review=await planMigration({root,snapshot:'configured-selector',resources:[{id:root,text:JSON.stringify(value),generation:1}],configuration,targetVersion:'2.0',destination:'file:///configured-servers/'});
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert(review.problems.some(problem=>problem.code==='migration.server.configured-selection'&&problem.resource===configuration.id),JSON.stringify(review.problems));
});
