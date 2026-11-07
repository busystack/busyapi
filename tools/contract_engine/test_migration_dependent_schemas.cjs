const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{analyse}=require('./dist/model.cjs'),{evaluateSchemas}=require('./dist/schema_evaluation.cjs'),{SourceDocument}=require('./dist/document.cjs');
const {evaluateMigrationAnnotations}=require('./dist/migration_annotations.cjs');
const modern=['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'],older=['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4'];
for(const field of ['enum','const'])test(`an object-guarded ${field} retains exact Cartesian values and conditional child metadata`,async()=>{
 const root='file:///guarded-finite/api.json',values=[{a:'EXACT',b:false},{a:'EXACT',b:true},{a:'NEXT',b:false},{a:'NEXT',b:true}];
 const body={type:'object',required:['a'],[field]:field==='enum'?values:values[0],properties:{b:{description:'Finite b'}}};
 const text=JSON.stringify({openapi:'3.2.1',info:{title:'Guarded finite objects',version:'1'},paths:{},components:{schemas:{
  Value:{required:['a'],dependentSchemas:{a:{$ref:'#/components/schemas/Body'}}},Body:body,
 }},'x-values':values}).replaceAll('"EXACT"','9007199254740993.00').replaceAll('"NEXT"','9007199254740994.0');
 const input={root,snapshot:'guarded-finite',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///guarded-finite-output/'};
 const samples=['null','false','{}','{"a":9007199254740993,"b":false}','{"a":9007199254740993,"b":true}',
  '{"a":9007199254740994,"b":true}','{"a":9007199254740993}','{"a":9007199254740992,"b":false}',
  '{"a":9007199254740993,"b":false,"extra":0}'];
 const evaluate=async(packet,prefix)=>{
  const result=await evaluateMigrationAnnotations({...packet,runtimeInstances:['Value','Body'].flatMap(name=>samples.map(text=>({
   subject:'response-body',text,location:name,schema:{resource:packet.root,pointer:prefix+'/'+name}})))});
  assert.equal(result.checked.complete,true,JSON.stringify(result.checked.findings));assert(result.checked.runtimeEvaluations.every(value=>value.complete));
  return {valid:result.checked.runtimeEvaluations.map(value=>value.valid),annotations:result.annotations};
 };
 const before=await evaluate(input,'/components/schemas');assert.deepEqual(before.valid.slice(0,9),[true,true,false,true,field==='enum',field==='enum',false,false,false]);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-guarded-finite',resources:review.outputs.map(value=>({...value,generation:0}))};
 assert.deepEqual(await evaluate(output,'/definitions'),before);assert.equal(input.resources[0].text,text);
});
for(const dependency of ['dependentRequired','dependentSchemas','if'])
test(`finite ${dependency} bodies retain their object guard and independent neutral owner before lowering`,async()=>{
 const root='file:///remaining-dependency/api.json';
 const body={type:'object',required:['a'],properties:{a:{type:'boolean'},b:{type:'boolean'}},additionalProperties:false,
  ...(dependency==='if'?{if:{required:['a']},then:{required:['b']}}:
   {[dependency]:dependency==='dependentRequired'?{a:['b']}:{a:{required:['b']}}})};
 const document={openapi:'3.2.1',info:{title:'Finite guarded dependency',version:'1'},paths:{},components:{schemas:{
  Value:{required:['a'],dependentSchemas:{a:body}},Independent:{$ref:'#/components/schemas/Value/dependentSchemas/a'},
 }}};
 const input={root,snapshot:'remaining-dependency',resources:[{id:root,text:JSON.stringify(document),generation:1}],targetVersion:'2.0',destination:'file:///remaining-dependency-output/'};
 const instances=['null','false','[]','{}','{"a":false}','{"a":false,"b":true}','{"a":false,"b":0}','{"a":false,"b":true,"c":false}'];
 const evaluate=async(packet,prefix)=>{
  const checked=await evaluateSchemas({...packet,runtimeInstances:['Value','Independent'].flatMap(name=>instances.map(text=>({
   subject:'response-body',text,location:name,schema:{resource:packet.root,pointer:prefix+'/'+name}})))});
  assert.equal(checked.complete,true,JSON.stringify(checked.findings));assert(checked.runtimeEvaluations.every(value=>value.complete));
  return checked.runtimeEvaluations.map(value=>value.valid);
 };
 const before=await evaluate(input,'/components/schemas');
 assert.deepEqual(before.slice(0,8),[true,true,true,false,false,true,false,false]);
 // A concrete standard Swagger witness establishes representability, including
 // the independent typed owner. A failed proof must not claim impossibility.
 const fields={required:['a','b'],properties:body.properties,additionalProperties:false};
 const witness={root,snapshot:'remaining-witness',resources:[{id:root,generation:0,text:JSON.stringify({swagger:'2.0',info:document.info,paths:{},
  definitions:{Value:fields,Independent:{type:'object',...fields}}})}]};
 assert.deepEqual(await evaluate(witness,'/definitions'),before);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'remaining-cold',resources:review.outputs.map(value=>({...value,generation:0}))};
 assert.deepEqual(await evaluate(output,'/definitions'),before);
});
for(const version of modern)for(const format of ['yaml','json'])for(const ownership of ['direct','referenced','composed','external'])
test(`${version} ${format} ${ownership} nested dependency/condition ownership retains predicates, branches and annotations`,async()=>{
 const root='file:///nested-composition/api.'+format,model='file:///nested-composition/model.yaml';
 const condition={if:{required:['a']},then:{required:['b'],properties:{b:{type:'integer',minimum:'EXACT',description:'Selected b'}}},
  else:{type:'string',enum:['unused'],description:'Independent inactive branch'}};
 const body=ownership==='composed'?{type:'object',allOf:[{required:['a']},condition],properties:{a:{type:'boolean'},b:{type:'integer'},next:{$ref:'#/components/schemas/Value'}}}:
  {type:'object',required:['a'],...condition,properties:{a:{type:'boolean'},b:{type:'integer'},next:{$ref:'#/components/schemas/Value'}}};
 const conditionPath=ownership==='composed'?'/allOf/1':'';
 const base=ownership==='external'?'./model.yaml#/$defs/Body':ownership==='referenced'?'#/components/schemas/Body':'#/components/schemas/Value/dependentSchemas/a';
 if(ownership==='external')body.properties.next={$ref:'./api.'+format+'#/components/schemas/Value'};
 const document={openapi:version,info:{title:'Nested ownership',version:'1'},paths:{},components:{schemas:{
  Value:{required:['a'],dependentSchemas:{a:ownership==='direct'||ownership==='composed'?body:{$ref:base}}},
  ...(ownership==='referenced'?{Body:body}:{}),Independent:{$ref:base},Predicate:{$ref:base+conditionPath+'/if'},
  Then:{$ref:base+conditionPath+'/then'},Else:{$ref:base+conditionPath+'/else'},
 }},'x-literal':{number:'EXACT',schema:body,literal:{$ref:'never-acquire.json'}}};
 const text=(format==='yaml'?YAML.stringify(document):JSON.stringify(document)).replace(/"?EXACT"?/g,'9007199254740993.00');
 const resources=[{id:root,text,generation:1}];
 if(ownership==='external')resources.push({id:model,generation:2,text:'$schema: https://json-schema.org/draft/2020-12/schema\r\n$id: model.yaml\r\n$defs:\r\n  Body: '+JSON.stringify(body).replace('"EXACT"','9007199254740993.00')+'\r\nx-data: &literal {n: 9007199254740993.00, flag: false}\r\nx-alias: *literal\r\n'});
 const input={root,snapshot:'nested-composition',resources,targetVersion:'2.0',destination:'file:///nested-composition-output/'};
 const samples=['null','false','[]','{}','{"a":false}','{"a":false,"b":9007199254740993}',
  '{"a":false,"b":9007199254740992}','{"a":false,"b":9007199254740993,"next":{"a":true}}','"unused"'];
 const names=['Value','Independent','Predicate','Then','Else'];
 const evaluate=async(packet,prefix)=>{
  const result=await evaluateMigrationAnnotations({...packet,runtimeInstances:['request-body','response-body'].flatMap(subject=>names.flatMap(name=>samples.map(text=>({
   subject,text,location:name,schema:{resource:packet.root,pointer:prefix+'/'+name}}))))});
  assert.equal(result.checked.complete,true,JSON.stringify(result.checked.findings));assert(result.checked.runtimeEvaluations.every(value=>value.complete));
  return {valid:result.checked.runtimeEvaluations.map(value=>value.valid),annotations:result.annotations};
 };
 const before=await evaluate(input,'/components/schemas');assert.deepEqual(before.valid.slice(0,9),[true,true,true,false,false,true,false,false,true]);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'cold-nested',resources:review.outputs.map(value=>({...value,generation:0}))};
 assert.deepEqual(await evaluate(output,'/definitions'),before);
 assert.equal(new SourceDocument(output.resources.find(value=>value.id===output.root).text,output.root).dataJson('/x-literal'),new SourceDocument(text,root).dataJson('/x-literal'));
 assert.deepEqual(input.resources,resources);assert.equal(input.resources[0].text,text);
 if(ownership==='external')assert(review.outputs.some(value=>value.text.includes('x-alias: *literal')));
});
for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4'])
test(`${format} ${targetVersion} fixed referenced dependency guards retain recursive neutral targets and conditional metadata`,async()=>{
 const root='file:///dependency-projection/api.'+format,rules='file:///dependency-projection/rules.yaml';
 const schema={$ref:'#/components/schemas/Model'};
 const document={openapi:'3.2.1',info:{title:'Projected reference',version:'1'},paths:{'/value':{post:{
  requestBody:{content:{'application/json':{schema}}},responses:{200:{description:'Value',content:{'application/json':{schema}}}},
 }}},components:{schemas:{Model:{dependentSchemas:{trigger:{$ref:'./rules.yaml#rule'}}},Independent:{$ref:'./rules.yaml#rule'}}}};
 const text=format==='yaml'?YAML.stringify(document):JSON.stringify(document);
 const rule={$anchor:'rule',allOf:[{type:['object','null'],required:['trigger']},{properties:{trigger:{
  type:'object',readOnly:true,description:'Only a present trigger',properties:{n:{type:'integer',exclusiveMinimum:'EXACT'},next:{$ref:'#rule'}},
 }}}]};
 const ruleText='$schema: https://json-schema.org/draft/2020-12/schema\r\n$id: rules.yaml\r\n$defs:\r\n  Rule: '+
  JSON.stringify(rule).replace('"EXACT"','9007199254740993.00')+'\r\n'+
  'x-literal: &literal {number: 9007199254740993.00, flag: false}\r\nx-alias: *literal\r\n';
 const input={root,snapshot:'projected-reference',resources:[{id:root,text,generation:1},{id:rules,text:ruleText,generation:2}],targetVersion,destination:'file:///dependency-projection-output/'};
 const values=['null','0','[]','{}','{"trigger":{}}','{"trigger":{"n":9007199254740994}}',
  '{"trigger":{"n":9007199254740993}}','{"trigger":{"next":{"trigger":{}}}}','{"trigger":{"next":{}}}'];
 const evaluate=async(packet,legacy)=>{
  const result=await evaluateMigrationAnnotations({...packet,runtimeInstances:['request-body','response-body'].flatMap(subject=>values.map(text=>({
   subject,text,location:subject,schema:{resource:packet.root,pointer:subject==='request-body'?
    legacy?'/paths/~1value/post/parameters/0/schema':'/paths/~1value/post/requestBody/content/application~1json/schema':
    legacy?'/paths/~1value/post/responses/200/schema':'/paths/~1value/post/responses/200/content/application~1json/schema'}})))});
  assert.equal(result.checked.complete,true,JSON.stringify(result.checked.findings));assert(result.checked.runtimeEvaluations.every(value=>value.complete));
  return {valid:result.checked.runtimeEvaluations.map(value=>value.valid),annotations:result.annotations};
 };
 const before=await evaluate(input,false),review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=after(review);assert.deepEqual(await evaluate(output,targetVersion==='2.0'),before);
 assert.deepEqual(before.valid.slice(0,values.length),[true,true,true,true,true,true,false,true,false]);
 assert.deepEqual(await outcomes(output,(targetVersion==='2.0'?'/definitions':'/components/schemas')+'/Independent',values),
  await outcomes(input,'/components/schemas/Independent',values));
 assert(review.outputs.some(value=>value.text.includes('x-alias: *literal')));assert.equal(input.resources[1].text,ruleText);
});
const samples=['null','false','0','""','[]','{}','{"trigger":false}','{"trigger":0}','{"trigger":null}','{"trigger":""}','{"trigger":false,"value":9007199254740993}','{"trigger":0,"value":9007199254740992}','{"value":9007199254740992}'];
function capture(version,format,mode='untyped'){
 const child={type:'object',required:['value'],properties:{value:{type:'integer',enum:['EXACT']}}};
 const schema={dependentSchemas:{trigger:mode==='false'?false:mode==='true'?true:child}};
 if(mode==='object'||mode==='required'||mode==='required-ref')schema.type='object';
 if(mode==='nullable')schema.type=['object','null'];
 if(mode==='required')schema.required=['trigger'];
 if(mode==='composition')schema.allOf=[{maxProperties:2}];
 if(mode==='recursive')child.properties.next={$ref:'#/components/schemas/Model'};
 if(mode==='escaped')schema.dependentSchemas=Object.fromEntries(['trig/~雪','__proto__',''].map(name=>[name,child]));
 if(mode==='nested')schema.dependentSchemas.trigger={dependentSchemas:{nested:child}};
 if(mode==='static-dynamic')schema.dependentSchemas.trigger={$dynamicRef:'#/components/schemas/Constraint'};
 if(mode==='required-ref')schema.allOf=[{$ref:'#/components/schemas/Required'}];
 if(mode==='empty')schema.dependentSchemas={};
 const document={openapi:version,info:{title:'Conditional schema 雪',version:'API-1'},paths:{},components:{schemas:{Model:schema,...(mode==='static-dynamic'?{Constraint:child}:{}),...(mode==='required-ref'?{Required:{required:['trigger']}}:{})}},'x-literal':{dependentSchemas:{trigger:false},exact:'EXACT',nil:null,empty:'',no:false,zero:0}};
 const root='file:///approved/api.'+format,text=(format==='json'?JSON.stringify(document):'# Keep CRLF 雪\r\n'+YAML.stringify(document,{aliasDuplicateObjects:false}).replaceAll('\n','\r\n')).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 return{root,snapshot:'captured-'+version+'-'+format+'-'+mode,resources:[{id:root,text,generation:1,identity:'owned'}],destination:'file:///output/dependent-schemas/'};
}
function after(result){return{root:result.outputRoot,snapshot:result.identity,resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0,aliases:Object.entries(result.manifest.resourceMappings).filter(([,path])=>path===output.path).map(([uri])=>uri)}))};}
async function outcomes(input,pointer,values=samples,subject='response-body'){
 const result=await evaluateSchemas({...input,runtimeInstances:values.map(text=>({subject,location:'application/json',text,schema:{resource:input.root,pointer}}))});
 assert.equal(result.complete,true,JSON.stringify(result.findings));assert(!result.findings.some(finding=>finding.severity==='error'),JSON.stringify(result.findings));return result.runtimeEvaluations.map(result=>result.valid);
}
async function faithful(input,targetVersion,values=samples){
 const original=input.resources.map(resource=>resource.text),result=await planMigration({...input,targetVersion});
 assert.equal(result.status,'faithfully-convertible',JSON.stringify(result.problems));assert.equal(result.complete,true);assert.equal(result.producerVersion,'89');assert(result.changes.length>0);
 const output=after(result),data=YAML.parse(result.outputs.find(output=>output.id===result.outputRoot).text),pointer=targetVersion==='2.0'?'/definitions/Model':'/components/schemas/Model';
 assert.equal(data.swagger??data.openapi,targetVersion);assert.equal(data.info.version,'API-1');assert.deepEqual(data['x-literal'].dependentSchemas,{trigger:false});assert(result.outputs.some(output=>output.text.includes('9007199254740993.00')));assert(!Object.hasOwn(data.swagger?data.definitions.Model:data.components.schemas.Model,'dependentSchemas'));
 assert.equal(analyse(output).status,'complete');
 for(const subject of ['request-body','response-body'])assert.deepEqual(await outcomes(output,pointer,values,subject),await outcomes(input,'/components/schemas/Model',values,subject));
 assert.deepEqual(input.resources.map(resource=>resource.text),original);return{result,output,pointer};
}
for(const version of modern)for(const format of ['yaml','json'])for(const targetVersion of older)for(const mode of ['untyped','object','nullable','false','true'])test(`${version} ${format} ${mode} dependentSchemas retains whole-instance conditions in ${targetVersion}`,async()=>{
 const input=capture(version,format,mode),{result}=await faithful(input,targetVersion);
 if(mode==='untyped')assert.deepEqual(await outcomes(input,'/components/schemas/Model'),[true,true,true,true,true,true,false,false,false,false,true,false,true]);
 if(format==='yaml')assert(result.outputs[0].text.startsWith('# Keep CRLF 雪\r\n'));
});
for(const version of modern)for(const format of ['yaml','json'])for(const mode of ['required','required-ref','untyped','object'])test(`${version} ${format} ${mode} dependentSchemas distinguishes faithful Swagger targets`,async()=>{
 const input=capture(version,format,mode);
 if(mode.startsWith('required'))await faithful(input,'2.0');
 else{const original=input.resources[0].text,result=await planMigration({...input,targetVersion:'2.0'});assert.equal(result.status,'blocked');assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert.deepEqual(result.changes,[]);const finding=result.problems.find(problem=>problem.code==='migration.schema.dependency-conditional');assert(finding,JSON.stringify(result.problems));assert.equal(finding.reason,'implementation');assert.equal(finding.pointer,'/components/schemas/Model/dependentSchemas/trigger');assert(finding.range[1]>finding.range[0]);assert.equal(input.resources[0].text,original);}
});
for(const format of ['yaml','json'])for(const mode of ['composition','recursive','nested','static-dynamic','escaped','empty'])test(`${format} ${mode} dependentSchemas keeps composition and source ownership`,async()=>{
 const values=[...samples,'{"trigger":false,"value":9007199254740993,"next":{"trigger":null}}','{"trigger":false,"nested":0}','{"trigger":false,"nested":0,"value":9007199254740993}','{"trig/~雪":false}','{"__proto__":0}','{"":null}','{"__proto__":false,"value":9007199254740993}'];
 await faithful(capture('3.2.1',format,mode),'3.0.4',values);
});
for(const format of ['yaml','json'])test(`${format} independently referenced dependent schema follows its moved owner`,async()=>{
 const input=capture('3.1.2',format),resource=input.resources[0];resource.text=new SourceDocument(resource.text,resource.id).set('/components/schemas/Alias',{$ref:'#/components/schemas/Model/dependentSchemas/trigger'});
 const {output}=await faithful(input,'3.0.4');assert.deepEqual(await outcomes(output,'/components/schemas/Alias'),await outcomes(input,'/components/schemas/Alias'));
});
for(const format of ['yaml','json'])test(`${format} external conditional schema retains exact content and repaired references`,async()=>{
 const input=capture('3.2.1',format),resource=input.resources[0],external='file:///approved/shared.json';resource.text=new SourceDocument(resource.text,resource.id).set('/components/schemas/Model/dependentSchemas/trigger',{$ref:'shared.json#/Constraint'});
 input.resources.push({id:external,text:'{"Constraint":{"required":["value"],"properties":{"value":{"enum":[9007199254740993.00]}}}}\r\n',generation:2,identity:'shared'});await faithful(input,'3.0.4');
});
for(const format of ['yaml','json'])for(const value of [false,[],{trigger:0},{trigger:null}])test(`${format} malformed dependentSchemas ${JSON.stringify(value)} cannot publish`,async()=>{
 const input=capture('3.1.2',format),resource=input.resources[0];resource.text=new SourceDocument(resource.text,resource.id).set('/components/schemas/Model/dependentSchemas',value);const original=resource.text,result=await planMigration({...input,targetVersion:'3.0.4'});
 assert.equal(result.status,'blocked');assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert.deepEqual(result.changes,[]);assert(result.problems.some(problem=>problem.resource===resource.id&&problem.pointer.startsWith('/components/schemas/Model')&&problem.range[1]>problem.range[0]));assert.equal(resource.text,original);
});
test('independent map schema interpretation is a located blocker instead of a guessed context split',async()=>{
 const input=capture('3.1.2','json'),resource=input.resources[0];resource.text=new SourceDocument(resource.text,resource.id).set('/components/schemas/Map',{$ref:'#/components/schemas/Model/dependentSchemas'});const original=resource.text,result=await planMigration({...input,targetVersion:'3.0.4'});
 assert.equal(result.status,'blocked');assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.pointer==='/components/schemas/Model/dependentSchemas'));assert.equal(resource.text,original);
});
for(const flow of [false,true])test(`YAML flow=${flow} conditional schema retains repeated comments once per authored occurrence`,async()=>{
 const input=capture('3.2.1','yaml'),resource=input.resources[0];
 resource.text='openapi: 3.2.1\r\ninfo: {title: Comments, version: API-1}\r\npaths: {}\r\nx-literal: {dependentSchemas: {trigger: false}, exact: 9007199254740993.00}\r\ncomponents:\r\n  schemas:\r\n    Model:\r\n      dependentSchemas: '+(flow?'{\r\n        # Repeated conditional comment\r\n        # Repeated conditional comment\r\n        trigger: {required: [value]}}\r\n':'\r\n        # Repeated conditional comment\r\n        # Repeated conditional comment\r\n        trigger: {required: [value]}\r\n');
 const {result}=await faithful(input,'3.0.4');assert.equal(result.outputs[0].text.split('# Repeated conditional comment').length-1,2,result.outputs[0].text);
});
for(const placement of ['key','value'])test(`YAML ${placement} comments move once and comment-looking strings remain values`,async()=>{
 const input=capture('3.1.2','yaml'),resource=input.resources[0],literal='# Repeated conditional comment';
 const child='{required: [value], description: "'+literal+'"}';
 resource.text='openapi: 3.1.2\r\ninfo: {title: Comments, version: API-1}\r\npaths: {}\r\nx-literal: {dependentSchemas: {trigger: false}, exact: 9007199254740993.00}\r\ncomponents:\r\n  schemas:\r\n    Model:\r\n      dependentSchemas:\r\n'+(placement==='key'?'        trigger: # Repeated conditional comment\r\n          # Repeated conditional comment\r\n          '+child+'\r\n':'        trigger: '+child+' # Repeated conditional comment\r\n        # Repeated conditional comment\r\n');
 const {result}=await faithful(input,'3.0.4'),text=result.outputs[0].text,doc=new SourceDocument(text,result.outputRoot);
 assert.equal(doc.comments('',true).filter(range=>text.slice(...range)===literal).length,2,text);
 assert.equal([...doc.nodes.values()].filter(node=>node.pointer.endsWith('/description')&&node.value===literal).length,1,text);
});
test('YAML shared conditional schema cannot be rewritten through an ambiguous alias',async()=>{
 const input=capture('3.1.2','yaml'),resource=input.resources[0];resource.text='openapi: 3.1.2\ninfo: {title: Shared, version: API-1}\npaths: {}\ncomponents:\n  schemas:\n    Model:\n      dependentSchemas:\n        trigger: &held {required: [value]}\n    Independent: *held\n';
 const original=resource.text,result=await planMigration({...input,targetVersion:'3.0.4'});assert.equal(result.status,'blocked');assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.range[1]>problem.range[0]&&problem.resource===resource.id));assert.equal(resource.text,original);
});

for(const format of ['yaml','json'])for(const mode of ['false','true'])
test(`${format} untyped ${mode} schema dependency has an exact Swagger property mapping and independent owner`,async()=>{
 const input=capture('3.2.1',format,mode),resource=input.resources[0];
 resource.text=new SourceDocument(resource.text,resource.id).set('/components/schemas/Independent',{$ref:'#/components/schemas/Model/dependentSchemas/trigger'});
 const {output}=await faithful(input,'2.0');
 assert.deepEqual(await outcomes(output,'/definitions/Independent'),await outcomes(input,'/components/schemas/Independent'));
});
for(const format of ['yaml','json'])for(const positive of [false,true])
test(`${format} composed dependency constant ${positive} retains optional trigger and all JSON instance types`,async()=>{
 const input=capture('3.2.1',format),resource=input.resources[0];
 const guard=positive?{allOf:[{not:false},{oneOf:[false,true]}]}:{not:{anyOf:[false,{not:false}]}};
 resource.text=new SourceDocument(resource.text,resource.id).set('/components/schemas/Model/dependentSchemas/trigger',guard);
 resource.text=new SourceDocument(resource.text,resource.id).set('/components/schemas/Independent',{$ref:'#/components/schemas/Model/dependentSchemas/trigger/not'});
 if(positive)resource.text=new SourceDocument(resource.text,resource.id).set('/components/schemas/Independent',{$ref:'#/components/schemas/Model/dependentSchemas/trigger/allOf/0/not'});
 const {output}=await faithful(input,'2.0');
 assert.deepEqual(await outcomes(output,'/definitions/Independent'),await outcomes(input,'/components/schemas/Independent'));
});

for(const version of modern)for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4'])
for(const mode of ['self-property','guarded-required','required-untyped','required-untyped-object','composed-seed','absent-trigger'])
test(`${version} ${format} ${targetVersion} ${mode} dependent schemas preserve conditional annotations and independent targets`,async()=>{
 const root='file:///dependent-proof/api.'+format;
 const dependency=['self-property','guarded-required'].includes(mode)?{
  ...(mode==='guarded-required'?{type:'object',required:['trigger']}:{}),properties:{trigger:{type:'integer',description:'Only a present trigger'}}}:
  mode==='absent-trigger'?{contains:{const:'unreachable'}}:
  {...(mode==='required-untyped-object'?{type:'object'}:{}),required:['value'],properties:{value:{type:'integer',minimum:'EXACT',description:'Required value'}}};
 const model=mode==='composed-seed'?{type:'object',required:['seed'],allOf:[
  {dependentRequired:{seed:['trigger']}},{dependentSchemas:{trigger:dependency}},
 ]}:mode.startsWith('required-untyped')?{required:['trigger'],dependentSchemas:{trigger:dependency}}:
  mode==='absent-trigger'?{properties:{trigger:false},dependentSchemas:{trigger:dependency}}:{dependentSchemas:{trigger:dependency}};
 const branch=mode==='composed-seed'?'/allOf/1/dependentSchemas/trigger':'/dependentSchemas/trigger';
 const schemas={Model:model};
 if(mode!=='absent-trigger')schemas.Independent={$ref:'#/components/schemas/Model'+branch};
 const document={openapi:version,info:{title:'Dependent proofs',version:'1'},paths:{},components:{schemas},'x-data':{dependency,number:'EXACT'}};
 const text=(format==='yaml'?'# Preserve conditional annotations\r\n'+YAML.stringify(document).replaceAll('\n','\r\n'):JSON.stringify(document)).replace(/"?EXACT"?/g,'9007199254740993.00');
 const input={root,snapshot:'dependent-proof-'+mode,resources:[{id:root,text,generation:4}],targetVersion,destination:'file:///dependent-proof-output/'};
 const values=['null','false','0','[]','{}','{"trigger":0}','{"trigger":false}',
  '{"trigger":0,"value":9007199254740993}','{"trigger":0,"value":9007199254740992}',
  '{"seed":false,"trigger":0,"value":9007199254740993}','{"seed":false,"value":9007199254740993}'];
 const evaluate=async(packet,prefix)=>{
  const runtimeInstances=Object.keys(schemas).flatMap(name=>values.map(text=>({subject:'response-body',location:name,text,
   schema:{resource:packet.root,pointer:prefix+'/'+name}})));
  const result=await evaluateMigrationAnnotations({...packet,runtimeInstances});
  assert.equal(result.checked.complete,true,JSON.stringify(result.checked.findings));assert(result.checked.runtimeEvaluations.every(value=>value.complete));
  assert.equal(result.annotations.length,runtimeInstances.length);
  return {valid:result.checked.runtimeEvaluations.map(value=>value.valid),annotations:result.annotations};
 };
 const before=await evaluate(input,'/components/schemas'),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=after(review);assert.deepEqual(await evaluate(output,targetVersion==='2.0'?'/definitions':'/components/schemas'),before);
 const doc=new SourceDocument(output.resources.find(resource=>resource.id===output.root).text,output.root);
 assert.equal(doc.dataJson('/x-data'),new SourceDocument(text,root).dataJson('/x-data'));assert.equal(input.resources[0].text,text);
 if(['self-property','guarded-required'].includes(mode)){assert.equal(before.valid[4],true);assert.equal(before.valid[5],true);assert.equal(before.valid[6],false);}
 if(mode==='composed-seed'){assert.equal(before.valid[9],true);assert.equal(before.valid[10],false);}
});

for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4'])
test(`${format} ${targetVersion} independently interpreted extension-named dependency maps keep their literal schema annotations`,async()=>{
 const input=capture('3.2.1',format,'required'),resource=input.resources[0];
 resource.text=new SourceDocument(resource.text,resource.id).set('/components/schemas/Model',{
  type:'object',required:['x-trigger'],dependentSchemas:{'x-trigger':{required:['value'],properties:{value:{enum:['EXACT']}}}},
 }).replace(/"?EXACT"?/g,'9007199254740993.00');
 resource.text=new SourceDocument(resource.text,resource.id).set('/components/schemas/Map',{$ref:'#/components/schemas/Model/dependentSchemas'});
 const original=resource.text,review=await planMigration({...input,targetVersion});
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=after(review),prefix=targetVersion==='2.0'?'/definitions':'/components/schemas';
 const values=['null','{}','{"x-trigger":false}','{"x-trigger":false,"value":9007199254740993}','{"x-trigger":false,"value":9007199254740992}'];
 for(const name of ['Model','Map'])assert.deepEqual(await outcomes(output,prefix+'/'+name,values),await outcomes(input,'/components/schemas/'+name,values));
 const {createGraph}=require('./dist/model.cjs'),graph=createGraph(output).graph;
 let at={resource:output.root,pointer:prefix+'/Map'};
 for(let index=0;index<128;index++){
  const reference=graph.referenceAs(at.resource,at.pointer,'$ref','schema');if(!reference)break;
  assert.equal(reference.resolution,'resolved');at={resource:reference.targetResource,pointer:reference.targetPointer};
 }
 assert.equal(graph.docs.get(at.resource).dataJson(at.pointer),new SourceDocument(original,resource.id).dataJson('/components/schemas/Model/dependentSchemas'));
 assert.equal(resource.text,original);
});
