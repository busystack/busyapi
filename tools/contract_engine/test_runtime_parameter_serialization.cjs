const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {evaluateSchemas,schemaProducer}=require('./dist/schema_evaluation.cjs');
for(const version of ['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])test(`${version} ${format} runtime parameter serializations use captured schemas and actual header octets`,async()=>{
 const root='file:///approved/api.'+format,q='/paths/~1p/get/parameters/0',header='/paths/~1p/get/parameters/1';
 const value={openapi:version,info:{title:'Runtime serialized fields',version:'business'},paths:{'/p':{get:{parameters:[
  {name:'q',in:'query',schema:{type:'integer',enum:['EXACT']}},{$ref:'#/components/parameters/Header'}
 ],responses:{204:{description:'No body'}}}}},components:{parameters:{Header:{name:'X-Json',in:'header',content:{'application/json':{schema:{type:'string',enum:['雪']}}}}}}};
 const text=(format==='yaml'?YAML.stringify(value):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'serialized-runtime',resources:[{id:root,text,generation:7}]};
 const wire=(pointer,text,location)=>({subject:'request-parameter',location,text,parameter:{resource:root,pointer}});
 const inputs=[wire(q,'%71=9007199254740993','good'),wire(q,'q=9007199254740992','bad'),
  wire(header,Buffer.from('"雪"','utf8').toString('latin1'),'header'),wire(header,'"雪"','not-header-octets'),
  wire(header,'\r\n"\\u96ea"','header-control')];
 const result=await evaluateSchemas({...input,runtimeInstances:inputs});assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));
 assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false,true,false,false]);
 for(const [index,proof]of result.runtimeEvaluations.entries())assert.deepEqual(proof.parameter,inputs[index].parameter);
 assert(result.runtimeFindings.some(finding=>finding.location==='bad'&&finding.source.pointer===q));
 for(const mutation of [
  {...inputs[0],subject:'response-header'}, {...inputs[0],schema:{resource:root,pointer:q+'/schema'}},
  {...inputs[0],mediaType:'application/json'}, {...inputs[0],alternatives:['0']},
  {...inputs[0],parameter:{resource:root,pointer:'/info'}},
  {...inputs[0],parameter:{resource:root,pointer:q,family:'2.0'}},
 ])await assert.rejects(evaluateSchemas({...input,runtimeInstances:[mutation]}),{code:'runtime.instance'});
 assert.equal(input.resources[0].text,text);
});
test('serialized runtime semantics have a distinct producer and configuration identity',()=>{
 assert.equal(schemaProducer.version,'1.18.0+55');assert(schemaProducer.configuration.includes('parameter-runtime-serialization-v1'));
});
test('Swagger serialized parameter runtime retains its narrower Items and collectionFormat interpretation',async()=>{
 const root='file:///approved/api.json',pointer='/paths/~1p/get/parameters/0';
 const text=JSON.stringify({swagger:'2.0',info:{title:'Flat serialized field',version:'1'},paths:{'/p':{get:{parameters:[
  {name:'ids',in:'query',type:'array',collectionFormat:'ssv',minItems:2,maxItems:2,items:{type:'integer',enum:[0,'EXACT']}}
 ],responses:{204:{description:'No content'}}}}}}).replaceAll('"EXACT"','9007199254740993.00');
 const input={root,snapshot:'swagger-wire',resources:[{id:root,text,generation:0}]};
 const result=await evaluateSchemas({...input,runtimeInstances:['ids=0%209007199254740993','ids=0%209007199254740992'].map((text,index)=>({subject:'request-parameter',location:String(index),text,parameter:{resource:root,pointer}}))});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);assert.equal(input.resources[0].text,text);
});
