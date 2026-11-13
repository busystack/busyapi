const {test}=require('node:test');
const assert=require('node:assert/strict');
const YAML=require('yaml');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const separators={csv:',',ssv:' ',tsv:'\t',pipes:'|'};
function fixture(format,outer='csv',inner='pipes',name='X-Values'){
 const root='file:///swagger-header/api.'+format,pointer='/paths/~1p/get/responses/204/headers/'+name;
 const header={type:'array',minItems:2,maxItems:2,collectionFormat:outer,items:{type:'array',minItems:2,maxItems:2,collectionFormat:inner,items:{type:'integer',enum:[0,'EXACT_VALUE']}}};
 const document={swagger:'2.0',info:{title:'Native header wire',version:'1'},paths:{'/p':{get:{responses:{204:{description:'No content',headers:{[name]:header}}}}}}};
 const serialized=format==='yaml'?YAML.stringify(document):JSON.stringify(document),text=serialized.replaceAll(format==='json'?'"EXACT_VALUE"':'EXACT_VALUE','9007199254740993.00');
 const input={root,snapshot:'header-wire',resources:[{id:root,text,generation:4}]};
 const instance=(location,values)=>({subject:'response-header',location,text:values.join(','),swaggerHeader:{resource:root,pointer,name,values}});
 return {input,instance,pointer};
}
for(const format of ['yaml','json'])for(const outer of ['csv','ssv','tsv','pipes'])test(`Swagger ${format} runtime response headers retain nested ${outer} collections and exact values`,async()=>{
 const inner=outer==='pipes'?'csv':'pipes',{input,instance,pointer}=fixture(format,outer,inner),row=['0'+separators[inner]+'9007199254740993','9007199254740993'+separators[inner]+'0'];
 const good=row.join(separators[outer]),result=await evaluateSchemas({...input,runtimeInstances:[instance('good',[good]),instance('bad',[good.replace('0993','0992')])]});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));
 assert.deepEqual(result.runtimeEvaluations.map(value=>[value.location,value.complete,value.valid]),[['good',true,true],['bad',true,false]]);
 assert.ok(result.runtimeFindings.length>0);
 assert.ok(result.runtimeFindings.every(finding=>finding.location==='bad'&&finding.schema.resource===input.root&&finding.schema.pointer===pointer&&finding.schema.range[1]>finding.schema.range[0]));
});
for(const format of ['yaml','json'])test(`Swagger ${format} repeated CSV fields and identical nested delimiters require original schema proof`,async()=>{
 const {input,instance}=fixture(format,'csv','csv','Vary');
 const result=await evaluateSchemas({...input,runtimeInstances:[instance('single',['0,9007199254740993,9007199254740993,0']),instance('repeated',['0,9007199254740993','9007199254740993,0']),instance('bad',['0,9007199254740992','9007199254740993,0'])]});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,true,false]);
});
test('Swagger repeated non-CSV values and undecodable nested wire limits remain incomplete',async()=>{
 const {input,instance}=fixture('json','ssv','csv');
 const result=await evaluateSchemas({...input,runtimeInstances:[instance('repeated',['0,9007199254740993','9007199254740993,0'])]});
 assert.equal(result.complete,false);assert.equal(result.runtimeEvaluations[0].complete,false);assert.equal(result.runtimeEvaluations[0].valid,false);
 assert.ok(result.runtimeFindings.some(finding=>finding.kind==='unsupported'&&finding.code==='runtime.response.header.unchecked'));
});
test('wire target context and media alternatives cannot bypass captured schema ownership',async()=>{
 const {input,instance}=fixture('json');
 await assert.rejects(evaluateSchemas({...input,runtimeInstances:[{...instance('wrong',['0|0,0|0']),swaggerHeader:{resource:input.root,pointer:'/info',name:'X',values:['0']}}]}),{code:'runtime.instance'});
 await assert.rejects(evaluateSchemas({...input,runtimeInstances:[{subject:'response-header',location:'media',text:'0',mediaType:'application/json',alternatives:['1']}]}),{code:'runtime.instance'});
 const clean=await evaluateSchemas({...input,runtimeInstances:[instance('correct',['0|9007199254740993,9007199254740993|0'])]});
 assert.equal(clean.complete,true);assert.equal(clean.runtimeEvaluations[0].valid,true);
});

for(const format of ['yaml','json'])test(`Swagger ${format} a native Header retains wire ownership when independently used as a Schema`,async()=>{
 const root='file:///swagger-header/shared.'+format,pointer='/responses/Shared/headers/X-Count';
 const value={swagger:'2.0',info:{title:'Shared Header',version:'1'},paths:{'/p':{get:{responses:{200:{$ref:'#/responses/Shared'}}}}},
  responses:{Shared:{description:'Reply',headers:{'X-Count':{type:'integer',enum:['EXACT']}}}},definitions:{Use:{$ref:'#'+pointer}}};
 const text=(format==='yaml'?YAML.stringify(value):JSON.stringify(value)).replaceAll(format==='json'?'"EXACT"':'EXACT','9007199254740993.00');
 const input={root,snapshot:'shared-native-header',resources:[{id:root,text,generation:1}]};
 const runtimeInstances=['9007199254740993.00','9007199254740992'].flatMap((text,index)=>[
  {subject:'response-header',location:'header-'+index,text:'',header:{resource:root,pointer,name:'X-Count',values:[text]}},
  {subject:'response-body',location:'schema-'+index,text,schema:{resource:root,pointer:'/definitions/Use'}},
 ]);
 const checked=await evaluateSchemas({...input,runtimeInstances});assert.equal(checked.complete,true,JSON.stringify(checked.runtimeFindings));
 assert.deepEqual(checked.runtimeEvaluations.map(value=>[value.complete,value.valid]),[[true,true],[true,true],[true,false],[true,false]]);
 await assert.rejects(evaluateSchemas({...input,runtimeInstances:[{subject:'response-header',location:'mismatch',text:'0',swaggerHeader:{resource:root,pointer,name:'X-Count',values:['0']},schema:{resource:root,pointer:'/definitions/Use'}}]}),{code:'runtime.instance'});
});
