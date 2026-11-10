const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const patches=['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','2.0','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
for(const version of patches.filter(version=>version!=='2.0'))test(`${version} simple Header objects retain empty collections and exploded empty property values`,async()=>{
 const fixture=input(version,'json',{'X-Empty':{schema:{type:'object',maxProperties:0}},
  'X-Value':{explode:true,schema:{type:'object',required:['k'],additionalProperties:false,properties:{k:{type:'string',enum:['']}}}}});
 const checked=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire('X-Empty',['']),fixture.wire('X-Value',['k'])]});
 assert.equal(checked.complete,true,JSON.stringify(checked.runtimeFindings));assert(checked.runtimeEvaluations.every(proof=>proof.valid),JSON.stringify(checked.runtimeFindings));
});
for(const version of patches.filter(version=>version!=='2.0'))for(const format of ['yaml','json'])test(`${version} ${format} repeated content field lines combine in received order and retain exact data`,async()=>{
 const fixture=input(version,format,{'Cache-Control':{content:{'text/plain':{schema:{type:'string',enum:['private="a,b", max-age=9007199254740993']}}}}});
 const result=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire('Cache-Control',[' private="a,b"\t',' max-age=9007199254740993 '],'good'),fixture.wire('Cache-Control',['private="a,b"','max-age=9007199254740992'],'bad')]});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);
});
for(const name of ['Content-Type','Content-Length','Date','Location','ETag','Last-Modified','Retry-After','Content-Range'])test(`repeated singleton content header ${name} is invalid rather than a comma-combined value`,async()=>{
 const fixture=input('3.2.1','json',{[name]:{content:{'text/plain':{schema:{type:'string'}}}}});
 const result=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire(name,['first','second'])]});
 assert.equal(result.complete,true);assert.equal(result.runtimeEvaluations[0].valid,false);assert(result.runtimeFindings.some(f=>f.detailCode==='runtime.header.repeated'));
});
for(const version of ['2.0','3.0.4','3.1.2','3.2.1'])for(const representation of version==='2.0'?['schema']:['schema','content'])test(`${version} ${representation} unknown repeated extensions retain lines and incomplete interpretation`,async()=>{
 const rule=representation==='content'?{content:{'text/plain':{schema:{type:'string',enum:['a, b']}}}}:
  version==='2.0'?{type:'array',items:{type:'string'},collectionFormat:'csv'}:{schema:{type:'array',items:{type:'string'}}};
 const fixture=input(version,'json',{'X-Unknown':rule}),lines=['a','b'],before=JSON.stringify(fixture.resources);
 const result=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire('X-Unknown',lines)]});
 assert.equal(result.complete,false);assert.equal(result.runtimeEvaluations[0].complete,false);assert.equal(result.runtimeEvaluations[0].valid,false);
 assert(result.runtimeFindings.some(finding=>finding.detailCode==='runtime.header.unchecked'));
 assert.deepEqual(lines,['a','b']);assert.equal(JSON.stringify(fixture.resources),before);
});
for(const version of patches)test(`${version} known list simple/header collection values preserve received order`,async()=>{
 const schema={type:'array',minItems:2,maxItems:2,items:{type:'integer',enum:[0,'EXACT']}};
 const fixture=input(version,'json',{Vary:version==='2.0'?{...schema,collectionFormat:'csv'}:{schema}});
 const result=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire('Vary',['0','9007199254740993'])]});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.equal(result.runtimeEvaluations[0].valid,true);
});
for(const version of ['3.0.4','3.1.2','3.2.1'])test(`${version} content header JSON evaluates UTF-8 field octets before schema assertions`,async()=>{
 const fixture=input(version,'json',{'X-Json':{content:{'application/json':{schema:{type:'string',enum:['雪']}}}}});
 const result=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire('X-Json',[Buffer.from('"雪"').toString('latin1')],'good'),fixture.wire('X-Json',['"雪"'],'not-octets')]});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);
});
function input(version,format,headers,shared){
 const root='file:///runtime-headers/api.'+format,fragment='file:///runtime-headers/shared.'+format;
 const document={...(version==='2.0'?{swagger:version}:{openapi:version}),info:{title:'Captured header wire',version:'api-version'},paths:{'/data':{get:{responses:{204:{description:'Header values',headers}}}}}};
 const encode=value=>(format==='yaml'?YAML.stringify(value):JSON.stringify(value)).replaceAll(format==='json'?'"EXACT"':'EXACT','9007199254740993.00');
 const resources=[{id:root,text:encode(document),generation:7},...(shared?[{id:fragment,text:encode(shared),generation:5}]:[])];
 const wire=(name,values,location=name)=>({subject:'response-header',location,text:'',header:{resource:root,pointer:'/paths/~1data/get/responses/204/headers/'+name.replaceAll('~','~0').replaceAll('/','~1'),name,values}});
 return {root,snapshot:'captured-native-header',resources,wire};
}
for(const version of patches)for(const format of ['yaml','json'])test(`${version} ${format} response header wire uses original native schema and exact values`,async()=>{
 const schema={type:'array',minItems:2,maxItems:2,items:{type:'integer',enum:[0,'EXACT']}},fixture=input(version,format,{'X-Values':version==='2.0'?{...schema,collectionFormat:'csv'}:{schema}});
 const original=JSON.stringify(fixture.resources),result=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire('X-Values',['0,9007199254740993'],'good'),fixture.wire('X-Values',['0,9007199254740992'],'bad')]});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.deepEqual(result.runtimeEvaluations.map(value=>[value.location,value.complete,value.valid]),[['good',true,true],['bad',true,false]]);
 assert.ok(result.runtimeFindings.some(value=>value.code==='runtime.schema.incompatible'&&value.location==='bad'&&value.schema.resource===fixture.root&&value.schema.range[1]>value.schema.range[0]));
 assert.equal(JSON.stringify(fixture.resources),original);
});
for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])test(`${version} ${format} boolean header schemas retain assertion and unconstrained ownership`,async()=>{
 const fixture=input(version,format,{'X-False':{schema:false},'X-True':{schema:true}}),result=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire('X-False',['literal,false'],'false'),fixture.wire('X-True',['literal,false'],'true')]});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.deepEqual(result.runtimeEvaluations.map(value=>[value.location,value.complete,value.valid]),[['false',true,false],['true',true,true]]);
 assert.ok(result.runtimeFindings.some(value=>value.code==='runtime.schema.incompatible'&&value.location==='false'&&value.schema.pointer.endsWith('/X-False/schema')));
 assert.equal(result.runtimeFindings.some(value=>value.location==='true'),false);
});
for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const representation of ['schema','content'])test(`${version} ${format} native ${representation} Set-Cookie keeps full lines and commas`,async()=>{
 const lines=['lang=en-US; Expires=Wed, 09 Jun 2021 10:18:14 GMT','foo=bar'];
 const header=representation==='content'?{content:{'text/plain':{schema:{type:'string',enum:[lines.join('\n')]}}}}:{explode:true,schema:{type:'object',required:['lang','foo'],properties:{lang:{type:'string',enum:[lines[0].slice(5)]},foo:{type:'string',enum:['bar']}}}};
 const fixture=input(version,format,{'Set-Cookie':header}),result=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire('Set-Cookie',lines,'good'),fixture.wire('Set-Cookie',[lines[0],'foo=wrong'],'bad')]});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.deepEqual(result.runtimeEvaluations.map(value=>[value.location,value.complete,value.valid]),[['good',true,true],['bad',true,false]]);
 assert.ok(result.runtimeFindings.some(value=>value.code==='runtime.schema.incompatible'&&value.location==='bad'));
});
for(const version of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])test(`${version} ${format} header references retain captured occurrence and external schema ownership`,async()=>{
 const shared={Header:{content:{'application/json':{schema:{type:'integer',enum:['EXACT']}}}}},fixture=input(version,format,{'X-Ref':{$ref:'shared.'+format+'#/Header'}},shared);
 const result=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire('X-Ref',['9007199254740993'],'good'),fixture.wire('X-Ref',['9007199254740992'],'bad')]});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);
 const finding=result.runtimeFindings.find(value=>value.location==='bad');assert.equal(finding.code,'runtime.schema.incompatible');assert.equal(finding.schema.resource,fixture.resources[1].id);assert.equal(finding.schema.pointer,'/Header/content/application~1json/schema');assert.ok(finding.schema.range[1]>finding.schema.range[0]);
});
test('header wire cannot replace captured context, field identity or evaluator inputs',async()=>{
 const fixture=input('3.2.1','json',{'X-Value':{schema:{type:'integer'}}}),original=fixture.wire('X-Value',['0']);
 for(const mutation of [
  {...original,header:{...original.header,pointer:'/info'}},
  {...original,header:{...original.header,name:'Set-Cookie'}},
  {...original,header:{...original.header,values:[]}},
  {...original,header:{...original.header,values:Array(2049).fill('0')}},
  {...original,text:'0'},
  {...original,schema:{resource:fixture.root,pointer:'/paths/~1data/get/responses/204/headers/X-Value/schema'}},
  {...original,mediaType:'application/json'},
  {...original,alternatives:['0']},
  {...original,subject:'request-parameter'},
 ])await assert.rejects(evaluateSchemas({...fixture,runtimeInstances:[mutation]}),{code:'runtime.instance'});
 const clean=await evaluateSchemas({...fixture,runtimeInstances:[original]});assert.equal(clean.complete,true);assert.equal(clean.runtimeEvaluations[0].valid,true);
});

for(const version of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])test(`${version} ${format} Link field lines preserve quoted commas and repeated links`,async()=>{
 const data={linkset:[{anchor:'https://example.org/context',next:[
  {href:'https://example.org/one',title:'a,b; c'},
  {href:'https://example.org/two','title*':[{value:'雪',language:'ja'}]}
 ]}]};
 const fixture=input(version,format,{Link:{content:{'application/linkset':{schema:{type:'object',enum:[data]}}}}});
 const lines=['<https://example.org/one>; rel="next"; anchor="https://example.org/context"; title="a,b; c"',
  '<https://example.org/two>; rel=next; anchor="https://example.org/context"; title*=UTF-8\'ja\'%E9%9B%AA'];
 const result=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire('Link',lines)]});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));
 assert.equal(result.runtimeEvaluations.every(v=>v.valid),true,JSON.stringify(result.runtimeFindings));
});
test('HTTP Link field cannot serialize the JSON Linkset representation',async()=>{
 const fixture=input('3.2.1','json',{Link:{content:{'application/linkset+json':{schema:{}}}}});
 const result=await evaluateSchemas({...fixture,runtimeInstances:[fixture.wire('Link',['{"linkset":[]}'])]});
 assert.equal(result.runtimeEvaluations.every(v=>v.valid),false);
});
