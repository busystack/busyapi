const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');
const {analyse,createGraph}=require('./dist/model.cjs');
const {requestOperation}=require('./dist/execution.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {resolveUri}=require('./dist/reference_graph.cjs');

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
for(const format of ['json','yaml'])for(const target of ['3.1.0','3.1.2','3.0.0','3.0.4','2.0'])
test(`${format} URI security downgrades to ${target} through native planning and cold reopening`,async()=>{
 const input=fixture(format,target),before=input.resources.map(source=>source.text),configuration=input.configuration.text;
 assert.equal(analyse(input).status,'complete');
 const original=security(input),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));assert.equal(review.producerVersion,'71');
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
test('unavailable URI scheme targets do not acquire a component or publish configuration',async()=>{
 const input=fixture('json','3.1.2');input.resources.pop();const review=await planMigration(input);
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert.equal(review.manifestText,undefined);
 assert(review.problems.some(problem=>problem.reason==='source-incomplete'));
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
