const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');
const {analyse,createGraph}=require('./dist/model.cjs');
const {requestOperation}=require('./dist/execution.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {resolveUri}=require('./dist/reference_graph.cjs');
const {migrationRequestSignatures}=require('./dist/migration_invariants.cjs');

const encode=(value,format)=>format==='json'?JSON.stringify(value):'# Preserve security owners 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n');
const escaped=value=>value.replaceAll('~','~0').replaceAll('/','~1');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const secret='11111111-1111-4111-8111-111111111111';
function fixture(format,target,roles=false){
 const root='file:///captured/api.'+format,external='file:///captured/security.'+format;
 const logical='https://contracts.invalid/v1/api.'+format,relative='./security.'+format+'#/Alias',absolute='https://contracts.invalid/v1/security.'+format+'#/Access';
 const scheme=roles?{type:'apiKey',in:'header',name:'X-Roles'}:
  {type:'oauth2',flows:{clientCredentials:{tokenUrl:'https://auth.invalid/token',scopes:{read:'[Read](./read.md)',write:'Write'}}}};
 scheme.description='[Security](./security.md)';scheme['x-exact']={number:'EXACT',literal:relative};
 const requirement={oauth:[],[relative]:roles?['reader']:['read'],[absolute]:roles?['writer']:['write']};
 const value={openapi:'3.2.1',$self:logical,info:{title:'Original',version:'business'},servers:[{url:'https://api.invalid/v1'}],
  paths:{'/p':{get:{responses:{204:{description:'Done'}}}}},security:[requirement,{}, {[absolute]:roles?[]:['write','read']}],
  components:{securitySchemes:{oauth:{type:'apiKey',in:'header',name:'X-Precedence'}}},
  'x-literal':{security:[JSON.parse(JSON.stringify(requirement))]},'x-data':scheme,'x-alias':scheme};
 const collision='_migrated_security_binding_'+digest([root,root,'/security/0',relative,external,'/Alias']);
 value.components.securitySchemes[collision]={type:'apiKey',in:'header',name:'X-Unrelated'};
 const resources=[{id:root,text:encode(value,format).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00'),generation:7},
  {id:external,text:encode({Access:scheme,Alias:{$ref:'#/Access'},Literal:{$ref:'./not-a-contract',roles:['literal']}},format)
   .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00'),generation:2,
   aliases:['https://contracts.invalid/v1/security.'+format]}];
 const configuration={id:'file:///captured/busyapi.yaml',generation:4,identity:'captured-configuration',text:
  'version: 1\nenvironments:\n  manual:\n    baseUrl: https://api.invalid/v1\n    authentication:\n      alternative: 0\n      schemes:\n'+
  [relative,absolute].map(name=>'        '+JSON.stringify(name)+': {secretRef: '+secret+', x-exact: 9007199254740993.00}\n').join('')};
 return {root,resources,snapshot:'security-'+format+'-'+target,targetVersion:target,destination:'file:///delivered/security/',configuration};
}
function reopen(review,destination='file:///cold/security/'){
 return {root:new URL(review.entry,destination).href,snapshot:'cold-security',resources:review.outputs.map(output=>({
  id:new URL(output.path,destination).href,text:output.text,generation:0,
  aliases:Object.entries(review.manifest.resourceMappings).filter(([,path])=>path===output.path).map(([uri])=>uri).sort(),
 }))};
}
function security(input){
 const {graph}=createGraph(input),operation=graph.operations().find(operation=>operation.path==='/p');
 const plan=requestOperation({...input,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
 return {graph,plan:plan.security};
}
for(const format of ['json','yaml'])for(const self of [false,true])
test(`${format} retained URI bindings keep distinct configuration across OR entries self=${self}`,async()=>{
 const input=fixture(format,'3.2.1'),doc=new SourceDocument(input.resources[0].text,input.root);
 const relative='./security.'+format+'#/Access',absolute='https://contracts.invalid/v1/security.'+format+'#/Access';
 let text=doc.set('/security',[{[relative]:['read']},{[absolute]:['write']},{}]);
 if(!self)text=new SourceDocument(text,input.root).remove('/$self');
 input.resources[0].text=text;
 const other='22222222-2222-4222-8222-222222222222';
 input.configuration.text='version: 1\nenvironments:\n  manual:\n    authentication:\n      alternative: 1\n      schemes:\n'+
  '        '+JSON.stringify(relative)+': {secretRef: '+secret+'}\n'+
  '        '+JSON.stringify(absolute)+': {secretRef: '+other+'}\n';
 const original=input.resources.map(resource=>resource.text),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.equal((await planMigration(input)).identity,review.identity);
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
 const cold=reopen(review),after=security(cold),names=after.plan.requirements.slice(0,2).map(row=>row.schemes[0]);
 assert.equal(analyse(cold).status,'complete');assert.notEqual(names[0],names[1]);
 assert.deepEqual(after.plan.requirements.map(row=>row.schemes.map(name=>row.scopes[name])),[[['read']],[['write']],[]]);
 const config=new SourceDocument(review.manifestText,'file:///cold/busyapi.yaml'),owner='/environments/manual/authentication';
 assert.equal(config.dataNode(owner+'/alternative').value,1);
 assert.equal(config.dataNode(owner+'/schemes/'+escaped(names[0])+'/secretRef').value,secret);
 assert.equal(config.dataNode(owner+'/schemes/'+escaped(names[1])+'/secretRef').value,other);
 assert.equal(after.plan.schemes[names[0]].definition.resource,after.plan.schemes[names[1]].definition.resource);
 assert.equal(after.plan.schemes[names[0]].definition.pointer,after.plan.schemes[names[1]].definition.pointer);
});
for(const format of ['json','yaml'])for(const target of ['3.1.0','3.1.2','3.0.0','3.0.4','2.0'])
test(`${format} URI security downgrades to ${target} through native planning and cold reopening`,async()=>{
 const input=fixture(format,target),before=input.resources.map(source=>source.text),configuration=input.configuration.text;
 assert.equal(analyse(input).status,'complete');
 const original=security(input),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));assert.equal(review.producerVersion,'86');
 assert.deepEqual(input.resources.map(source=>source.text),before);assert.equal(input.configuration.text,configuration);
 assert.equal((await planMigration(input)).identity,review.identity,'Allocation and review identity are deterministic');
 const cold=reopen(review),after=security(cold),entry=after.graph.docs.get(cold.root);
 assert.equal(analyse(cold).status,'complete');assert.equal(entry.dataNode('/$self'),undefined);
 assert.deepEqual(after.plan.requirements.map(requirement=>requirement.schemes.length),[3,0,1]);
 assert.equal(after.plan.anonymous,true);assert.equal(after.plan.requirements[0].schemes[0],'oauth');
 assert.equal(after.plan.schemes.oauth.parameterName,'X-Precedence','Component-name precedence remains authoritative');
 assert.deepEqual(after.plan.requirements.map(requirement=>requirement.schemes.map(name=>requirement.scopes[name])),[[[],['read'],['write']],[],[['write','read']]]);
 const first=after.plan.requirements[0].schemes;
 assert.notEqual(first[1],first[2]);assert.notEqual(first[2],after.plan.requirements[2].schemes[0]);
 assert(first[1].endsWith('_1'),'The occupied deterministic component name must not be overwritten');
 const group=target==='2.0'?'/securityDefinitions/':'/components/securitySchemes/';
 for(const name of first.slice(1)){
  assert(entry.dataNode(group+name));
  assert.deepEqual(after.plan.schemes[name].flows.clientCredentials.scopes,{read:'[Read](./read.md)',write:'Write'});
  assert.equal(after.plan.schemes[name].flows.clientCredentials.tokenUrl,'https://auth.invalid/token');
 }
 const sourceDoc=new SourceDocument(before[0],input.root);
 for(const pointer of ['/x-literal','/x-data','/x-alias'])assert.equal(entry.dataJson(pointer),sourceDoc.dataJson(pointer));
 if(format==='yaml')assert(entry.text.includes('*'),'Unrelated YAML aliases survive');
 assert(review.manifestText.includes('9007199254740993.00'));
 const deliveredConfig=new SourceDocument(review.manifestText,'file:///cold/busyapi.yaml');
 for(const binding of review.configurationBindings){
  const previous=new SourceDocument(configuration,input.configuration.id).dataNode('/environments/manual/authentication/schemes/'+escaped(binding.before));
  if(!previous)continue;
  const at='/environments/manual/authentication/schemes/'+escaped(binding.after);
  assert.equal(deliveredConfig.dataNode(at+'/secretRef').value,secret);
  assert.equal(deliveredConfig.dataJson(at+'/x-exact'),'9007199254740993.00');
 }
 const copied=after.graph.entryReferences().find(reference=>reference.connection==='security'&&reference.keyword===first[1]);
 assert(copied);assert.equal(copied.targetUri,undefined);
 const declaration=after.plan.schemes[first[1]],definition=declaration.definition;
 const description=after.graph.docs.get(definition.resource).dataNode(definition.pointer+'/description').value;
 const destination=description.match(/\]\(([^)]+)\)/)[1];
 assert.equal(resolveUri(destination,after.graph.scopeAs(definition.resource,definition.pointer,'security').base).href,
  resolveUri('./security.md',original.graph.scopeAs(input.resources[1].id,'/Access','security').base).href);
 assert.equal(original.plan.requirements.length,after.plan.requirements.length);
});
for(const format of ['json','yaml'])test(`${format} distinct non-OAuth role bindings remain distinct in 3.1`,async()=>{
 const input=fixture(format,'3.1.2',true),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));const after=security(reopen(review));
 assert.deepEqual(after.plan.requirements[0].schemes.map(name=>after.plan.requirements[0].scopes[name]),[[],['reader'],['writer']]);
});
for(const target of ['3.0.4','2.0'])test(`${target} retains precise non-OAuth role blockers`,async()=>{
 const input=fixture('json',target,true),before=input.resources.map(source=>source.text),review=await planMigration(input);
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 const roles=review.problems.filter(problem=>problem.code==='migration.security.roles');
 assert.equal(roles.length,2);assert(roles.every(problem=>problem.reason==='target-representation'&&problem.pointer.startsWith('/security/0/')));
 assert.deepEqual(input.resources.map(source=>source.text),before);
});
test('Swagger cannot silently replace a cookie API key with a header credential',async()=>{
 const input=fixture('json','2.0'),value=JSON.parse(input.resources[0].text);
 value.components.securitySchemes.oauth.in='cookie';input.resources[0].text=JSON.stringify(value);
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code==='migration.security.location'&&problem.reason==='target-representation'));
});
test('Swagger OpenID Connect blockers describe the unavailable scheme rather than misclassifying scopes as roles',async()=>{
 const input=fixture('json','2.0'),external=JSON.parse(input.resources[1].text);
 external.Access={type:'openIdConnect',openIdConnectUrl:'https://issuer.invalid/.well-known/openid-configuration'};
 input.resources[1].text=JSON.stringify(external);
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code==='migration.security.type'&&problem.reason==='target-representation'));
 assert(!review.problems.some(problem=>problem.code==='migration.security.roles'));
});
test('unavailable URI scheme targets do not acquire a component or publish configuration',async()=>{
 const input=fixture('json','3.1.2');input.resources.pop();const review=await planMigration(input);
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert.equal(review.manifestText,undefined);
 assert(review.problems.some(problem=>problem.reason==='source-incomplete'));
});
for(const keyword of ['$ref','$dynamicRef','operationRef'])for(const target of ['3.1.2','3.0.4','2.0'])
test(`${target} URI security key ${keyword} never becomes a reference-value edit`,async()=>{
 const input=fixture('json',target),value=JSON.parse(input.resources[0].text);
 value.security.push({[keyword]:[]});input.resources[0].text=JSON.stringify(value);
 input.resources.push({id:'file:///captured/'+keyword,aliases:['https://contracts.invalid/v1/'+keyword],generation:0,
  text:'{"type":"apiKey","in":"header","name":"X-Meta"}'});
 assert.equal(analyse(input).status,'complete');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const after=security(reopen(review)),last=after.plan.requirements.at(-1);
 assert.equal(last.schemes.length,1);assert.deepEqual(last.scopes[last.schemes[0]],[]);
 assert.equal(after.plan.schemes[last.schemes[0]].parameterName,'X-Meta');
});
for(const header of ['Authorization','Proxy-Authorization','Cookie','X-Precedence'])
test(`literal ${header} credentials remain in the source configuration and cannot enter migration output`,async()=>{
 const input=fixture('json','3.1.2'),before=input.configuration.text;
 const doc=new SourceDocument(before,input.configuration.id);
 input.configuration.text=doc.set('/environments/manual/headers/'+escaped(header),'controlled-private-value');
 const review=await planMigration(input);
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert.equal(review.manifestText,undefined);
 assert(review.problems.some(problem=>problem.resource===input.configuration.id&&problem.code==='migration.configuration.representation'&&
  problem.pointer==='/environments/manual/headers/'+escaped(header)));
 assert(!JSON.stringify(review).includes('controlled-private-value'));
 assert(input.configuration.text.includes('controlled-private-value'));
});
test('environment alias reservation avoids adopting unrelated settings',async()=>{
 const input=fixture('json','3.1.2'),first=await planMigration(input);
 assert.equal(first.complete,true,JSON.stringify(first.problems));
 const binding=first.configurationBindings[0],doc=new SourceDocument(input.configuration.text,input.configuration.id);
 input.configuration.text=doc.set('/environments/manual/authentication/schemes/'+escaped(binding.after),{secretRef:'22222222-2222-4222-8222-222222222222'});
 input.configuration.identity='changed-configuration';input.configuration.generation++;
 const next=await planMigration(input);assert.equal(next.complete,true,JSON.stringify(next.problems));
 assert.notEqual(next.configurationBindings[0].after,binding.after);assert.notEqual(next.identity,first.identity);
});
test('component allocation also reserves unchanged security bindings in other captured entries',async()=>{
 const input=fixture('json','3.1.2'),value=JSON.parse(input.resources[0].text);
 const stem=Object.keys(value.components.securitySchemes).find(name=>name.startsWith('_migrated_security_binding_'));
 const name=stem+'_1',other='file:///captured/other.json';
 input.resources.push({id:other,generation:0,text:JSON.stringify({openapi:'3.2.1',info:{title:'Other',version:'1'},paths:{},
  components:{securitySchemes:{[name]:{type:'apiKey',in:'header',name:'X-Other'}}},security:[{[name]:[]}]})});
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert(review.configurationBindings.some(binding=>binding.before==='./security.json#/Alias'&&binding.after===stem+'_2'));
 assert.equal(new SourceDocument(review.manifestText,'file:///cold/busyapi.yaml').dataNode('/environments/manual/authentication/schemes/'+escaped(name)),undefined);
});
for(const target of ['3.1.2','3.0.4','2.0'])test(`${target} a generated component cannot hijack another URI key`,async()=>{
 const input=fixture('json',target),value=JSON.parse(input.resources[0].text);
 const occupied=Object.keys(value.components.securitySchemes).find(name=>name.startsWith('_migrated_security_binding_'));
 const uri=occupied+'_1';value.security[0][uri]=[];
 input.resources[0].text=JSON.stringify(value);
 input.resources.push({id:'file:///captured/'+uri,aliases:['https://contracts.invalid/v1/'+uri],generation:0,
  text:'{"type":"apiKey","in":"header","name":"X-Independent"}'});
 const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const after=security(reopen(review)),requirement=after.plan.requirements[0];
 assert.equal(requirement.schemes.length,4);
 assert.equal(after.plan.schemes[requirement.schemes[3]].parameterName,'X-Independent');
 assert(requirement.schemes[1].endsWith('_2'));
});
for(const target of ['3.1.2','3.0.4','2.0'])test(`${target} component-name precedence and the dot-segment URI escape select different exact schemes`,async()=>{
 const input=fixture('json',target),value=JSON.parse(input.resources[0].text);
 value.security.push({'./oauth':[]});input.resources[0].text=JSON.stringify(value);
 input.resources.push({id:'file:///captured/oauth',aliases:['https://contracts.invalid/v1/oauth'],generation:0,
  text:'{"type":"apiKey","in":"header","name":"X-URI"}'});
 const source=security(input);
 assert.equal(source.plan.schemes.oauth.parameterName,'X-Precedence');
 assert.equal(source.plan.schemes['./oauth'].parameterName,'X-URI');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const after=security(reopen(review)),last=after.plan.requirements.at(-1);
 assert.equal(after.plan.schemes.oauth.parameterName,'X-Precedence');
 assert.equal(after.plan.schemes[last.schemes[0]].parameterName,'X-URI');
});
for(const target of ['3.1.2','3.0.4','2.0'])test(`${target} shared URI security receives entry-owned native occurrences`,async()=>{
 const root='file:///shared/a.json',other='file:///shared/b.json',uses='file:///shared/uses.json';
 const api=name=>({openapi:'3.2.1',info:{title:name,version:'1'},servers:[{url:'https://'+name+'.invalid'}],
  paths:{'/p':{$ref:'uses.json#/Path'}}});
 const input={root,snapshot:'shared-security',targetVersion:target,destination:'file:///shared-output/',
  resources:[{id:root,text:JSON.stringify(api('a')),generation:0},{id:other,text:JSON.stringify(api('b')),generation:0},
   {id:uses,generation:0,text:JSON.stringify({Path:{get:{security:[{'#/Key':[]},{'uses.json#/Key':[]}],
    responses:{204:{description:'Done'}}}},Key:{type:'apiKey',in:'header',name:'X-Key'},Literal:{security:[{'#/Key':['data']}]}})}]};
 const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold=reopen(review);
 const entries=review.manifest.roots.map(entry=>new URL(entry.path,'file:///cold/security/').href);
 const names=[];
 for(const root of entries){
  const selected={...cold,root},after=security(selected);
  assert.equal(analyse(selected).status,'complete');
  assert.deepEqual(after.plan.requirements.map(requirement=>requirement.schemes.length),[1,1]);
  names.push(after.plan.requirements.map(requirement=>requirement.schemes[0]));
  assert(after.plan.requirements.every(requirement=>after.plan.schemes[requirement.schemes[0]].parameterName==='X-Key'));
 }
 assert.notDeepEqual(names[0],names[1]);
});
for(const target of ['3.0.4','2.0'])test(`${target} materializes Security Scheme description overrides with the original Markdown base`,async()=>{
 const input=fixture('json',target),external=JSON.parse(input.resources[1].text);
 external.Alias.description='[Alias](../alias-guide.md)';
 input.resources[1].text=JSON.stringify(external);
 const source=security(input),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const after=security(reopen(review)),name=after.plan.requirements[0].schemes[1],at=after.plan.schemes[name].definition;
 const description=after.graph.docs.get(at.resource).dataNode(at.pointer+'/description').value;
 assert.equal(resolveUri(description.match(/\]\(([^)]+)\)/)[1],after.graph.scopeAs(at.resource,at.pointer,'security').base).href,
  resolveUri('../alias-guide.md',source.graph.scopeAs(input.resources[1].id,'/Alias','security').base).href);
});
function multipleFlows(format='json'){
 const input=fixture(format,'2.0'),external=YAML.parse(input.resources[1].text);
 external.Access.flows.authorizationCode={authorizationUrl:'https://auth.invalid/authorize',tokenUrl:'https://auth.invalid/code',
  scopes:{read:'Read',write:'Write'}};
 input.resources[1].text=encode(external,format);
 input.configuration.text=input.configuration.text.replace('alternative: 0','alternative: 2');
 return input;
}
for(const format of ['json','yaml'])test(`${format} Swagger flow variants preserve ordered AND/OR scopes and project environment selection`,async()=>{
 const input=multipleFlows(format),original=input.resources.map(source=>source.text),before=security(input);
 const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.deepEqual(input.resources.map(source=>source.text),original);
 assert.deepEqual(review.configurationAlternatives,[{environment:'manual',before:2,after:5}]);
 const after=security(reopen(review)),requirements=after.plan.requirements;
 assert.deepEqual(requirements.map(requirement=>requirement.schemes.length),[3,3,3,3,0,1,1]);
 assert.deepEqual(requirements.slice(0,4).map(requirement=>requirement.schemes.map(name=>requirement.scopes[name])),
  Array.from({length:4},()=>[[],['read'],['write']]));
 assert.deepEqual(requirements.slice(0,4).map(requirement=>requirement.schemes.slice(1).map(name=>Object.keys(after.plan.schemes[name].flows).join())),
  [['authorizationCode','authorizationCode'],['authorizationCode','clientCredentials'],['clientCredentials','authorizationCode'],['clientCredentials','clientCredentials']]);
 assert.deepEqual(requirements.slice(5).map(requirement=>requirement.scopes[requirement.schemes[0]]),[['write','read'],['write','read']]);
 const manifest=new SourceDocument(review.manifestText,'file:///cold/busyapi.yaml');
 assert.equal(manifest.dataNode('/environments/manual/authentication/alternative').value,5);
 for(const binding of review.configurationBindings){
  const source=new SourceDocument(input.configuration.text,input.configuration.id).dataNode('/environments/manual/authentication/schemes/'+escaped(binding.before));
  if(source)assert.equal(manifest.dataNode('/environments/manual/authentication/schemes/'+escaped(binding.after)+'/secretRef').value,secret);
 }
 assert.equal(before.plan.requirements.length,3);
});
test('compatible environment choices intersect complete target branches rather than only the first expansion',async()=>{
 const input=multipleFlows(),value=JSON.parse(input.resources[0].text),uri='https://contracts.invalid/v1/security.json#/Access';
 value.paths['/other']={get:{security:[{[uri]:['read']},{[uri]:['write']},{[uri]:['write','read']}],responses:{204:{description:'Done'}}}};
 input.resources[0].text=JSON.stringify(value);
 const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.deepEqual(review.configurationAlternatives,[{environment:'manual',before:2,after:5}]);
});
test('a single environment choice cannot silently change an independently expanded operation requirement',async()=>{
 const input=multipleFlows(),value=JSON.parse(input.resources[0].text);
 value.paths['/other']={get:{security:[{}, {oauth:[]}],responses:{204:{description:'Done'}}}};
 input.resources[0].text=JSON.stringify(value);
 input.configuration.text=input.configuration.text.replace('alternative: 2','alternative: 1');
 const cfg=new SourceDocument(input.configuration.text,input.configuration.id);
 input.configuration.text=cfg.set('/environments/manual/authentication/schemes/oauth',{secretRef:secret});
 const review=await planMigration(input);
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code==='migration.configuration.alternative'&&problem.reason==='target-representation'&&
  problem.resource===input.configuration.id&&problem.pointer==='/environments/manual/authentication/alternative'));
});
test('an ignored decimal authentication selection is not activated by expansion',async()=>{
 const input=multipleFlows();input.configuration.text=input.configuration.text.replace('alternative: 2','alternative: 2.0');
 const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));assert.deepEqual(review.configurationAlternatives,[]);
 assert.equal(new SourceDocument(review.manifestText,'file:///cold/busyapi.yaml').dataJson('/environments/manual/authentication/alternative'),'2.0');
});
test('a refresh declaration equal to the token endpoint retains the same effective refresh URL in Swagger',async()=>{
 const input=fixture('json','2.0'),external=JSON.parse(input.resources[1].text);
 external.Access.flows.clientCredentials.refreshUrl=external.Access.flows.clientCredentials.tokenUrl;
 input.resources[1].text=JSON.stringify(external);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
});
test('case-insensitive Basic authentication retains its native request semantics in Swagger',async()=>{
 const input=fixture('json','2.0'),value=JSON.parse(input.resources[0].text),external=JSON.parse(input.resources[1].text);
 external.Access={type:'http',scheme:'BaSiC',description:'[Basic](./basic.md)'};
 for(const requirement of value.security)for(const name of Object.keys(requirement))requirement[name]=[];
 input.resources[0].text=JSON.stringify(value);input.resources[1].text=JSON.stringify(external);
 input.configuration.text=input.configuration.text.replaceAll('{secretRef:','{username: manual, passwordRef:');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const after=security(reopen(review)),name=after.plan.requirements[0].schemes[1];
 assert.equal(after.plan.schemes[name].type,'http');assert.equal(after.plan.schemes[name].scheme,'basic');
});
for(const format of ['json','yaml'])test(`${format} legacy ignored security siblings retain literal owners through mixed-format publication`,async()=>{
 const otherFormat=format==='json'?'yaml':'json',root='file:///legacy/a.'+format,other='file:///legacy/b.'+otherFormat,external='file:///legacy/scheme.'+format;
 const api=(name,fields={})=>({openapi:'3.0.4',info:{title:name,version:'1'},servers:[{url:'https://'+name+'.invalid'}],paths:{},...fields});
 const alias={$ref:'scheme.'+format+'#/Key',description:'ignored [literal](./literal.md)',summary:'Ignored summary',
  $id:'ignored-id',type:'ignored-type','x-number':'EXACT','x-data':{$ref:'literal',roles:['literal']}};
 const a=encode(api('a'),format);
 let b=encode(api('b',{paths:{'/p':{get:{responses:{204:{description:'Done'}}}}},
  security:[{Alias:[]}],components:{securitySchemes:{Alias:alias}}}),otherFormat)
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 if(otherFormat==='yaml')b=b.replace('x-number: 9007199254740993.00','x-number: 9007199254740993.00 # Keep ignored reference comment 雪');
 const input={root,snapshot:'legacy-ignored-security',targetVersion:'2.0',destination:'file:///legacy-output/',resources:[
  {id:root,text:a,generation:0},{id:other,text:b,generation:0},
  {id:external,text:encode({Key:{type:'apiKey',in:'header',name:'X-Key',description:'Terminal'}},format),generation:0}]};
 assert.equal(analyse({...input,root:other}).status,'complete');
 const before=input.resources.map(source=>source.text),original=new SourceDocument(b,other);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.deepEqual(input.resources.map(source=>source.text),before);
 const cold=reopen(review),{graph}=createGraph(cold);
 let retained;
 for(const doc of graph.docs.values())for(const [name]of doc.root.children)
  if(name.startsWith('_migrated_ignored_reference_'))retained={doc,pointer:'/'+escaped(name)};
 assert(retained,'Ignored author data has one ordinary material owner');
 assert.equal(retained.doc.format,otherFormat);
 if(otherFormat==='yaml')assert(retained.doc.text.includes('# Keep ignored reference comment 雪'));
 assert.equal(retained.doc.dataJson(retained.pointer),original.dataJson('/components/securitySchemes/Alias'));
 assert(!graph.references.some(reference=>reference.resource===retained.doc.id&&reference.pointer.startsWith(retained.pointer)));
 const entry=review.manifest.roots.find(entry=>entry.name!=='migrated'),selected={...cold,root:new URL(entry.path,'file:///cold/security/').href};
 const after=security(selected);assert.equal(analyse(selected).status,'complete');
 assert.equal(after.plan.schemes.Alias.type,'apiKey');assert.equal(after.plan.schemes.Alias.parameterName,'X-Key');
 assert.equal(after.plan.schemes.Alias.description,'Terminal');
});
for(const wrapper of [false,true])test(`Swagger retains a precise blocker for OAuth metadata without its standard container wrapper=${wrapper}`,async()=>{
 const input=fixture('json','2.0'),external=JSON.parse(input.resources[1].text);
 (wrapper?external.Access.flows:external.Access.flows.clientCredentials)['x-owner']={literal:'retained'};
 input.resources[1].text=JSON.stringify(external);
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code==='migration.security.flow-metadata'&&problem.reason==='target-representation'));
});
test('request authentication invariants retain scope names that resemble projection metadata',async()=>{
 const input=fixture('json','2.0'),external=JSON.parse(input.resources[1].text);
 external.Access.flows.clientCredentials.scopes.source='Original source scope';
 external.Access.flows.clientCredentials.scopes.definition='Original definition scope';
 input.resources[1].text=JSON.stringify(external);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold=reopen(review),before=security(input),after=security(cold);
 const expected=migrationRequestSignatures(before.graph,input.resources);
 assert.deepEqual(migrationRequestSignatures(after.graph,cold.resources),expected);
 const name=after.plan.requirements[0].schemes[1],at=after.plan.schemes[name].definition;
 const document=cold.resources.find(resource=>resource.id===at.resource);
 document.text=new SourceDocument(document.text,document.id).set(at.pointer+'/scopes/source','Changed source scope');
 assert.equal(analyse(cold).status,'complete');
 assert.notDeepEqual(migrationRequestSignatures(createGraph(cold).graph,cold.resources),expected);
});
test('request invariants retain Server variable names that resemble projection metadata',async()=>{
 const input=fixture('json','3.2.1'),value=JSON.parse(input.resources[0].text);
 value.servers=[{url:'https://{source}.invalid',variables:{source:{default:'original'}}}];
 input.resources[0].text=JSON.stringify(value);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold=reopen(review),before=security(input),after=security(cold);
 const expected=migrationRequestSignatures(before.graph,input.resources);
 assert.deepEqual(migrationRequestSignatures(after.graph,cold.resources),expected);
 const document=cold.resources.find(resource=>resource.id===cold.root);
 document.text=new SourceDocument(document.text,document.id).set('/servers/0/variables/source/default','changed');
 assert.equal(analyse(cold).status,'complete');
 assert.notDeepEqual(migrationRequestSignatures(createGraph(cold).graph,cold.resources),expected);
});
