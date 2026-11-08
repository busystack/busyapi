const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {evaluateSchemas,schemaProducer}=require('./dist/schema_evaluation.cjs');

test('R3c-3 present empty exploded fields cannot witness omitted empty arrays',async()=>{
 const input=require('./migration_b05_r3c3_fixture.cjs')();input.schema.properties.q.items.enum=['a+b'];input.refresh();
 const plan=await require('./dist/migration.cjs').planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 const packet={root:plan.outputRoot,resources:plan.outputs.map(output=>({...output,generation:0})),snapshot:'empty-field-presence'};
 const parameters=require('./dist/execution.cjs').requestOperation({...packet,resource:packet.root,pointer:'/paths/~1p/get'}).parameters;
 const selected=parameters.find(parameter=>parameter.name==='q');
 const source=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-parameter',location:'source',text:'flag=false&q=',parameter:{resource:input.root,pointer:'/components/parameters/Whole'}}]});
 const target=await evaluateSchemas({...packet,runtimeInstances:[{subject:'request-parameter',location:'target',text:'flag=false&q=',parameter:selected.definition}]});
 assert.equal(source.complete,true);assert.equal(target.complete,true);
 assert.equal(source.runtimeEvaluations[0].valid,false);assert.equal(target.runtimeEvaluations[0].valid,false);
});

for(const version of ['3.0.4','3.1.2','3.2.1'])test(`R3c ${version} cookie content preserves literal percent octets during evaluation`,async()=>{
 const root='file:///captured/cookie.json',pointer='/paths/~1p/get/parameters/0';
 const value={openapi:version,info:{title:'Literal content',version:'1'},paths:{'/p':{get:{parameters:[
  {name:'literal',in:'cookie',content:{'text/plain':{schema:{type:'string',enum:['a%20b']}}}}
 ],responses:{204:{description:'Empty'}}}}}};
 const input={root,snapshot:'literal-cookie',resources:[{id:root,text:JSON.stringify(value),generation:1}]};
 const result=await evaluateSchemas({...input,runtimeInstances:['literal=a%20b','literal=a%2520b','literal=a+b'].map(text=>({subject:'request-parameter',location:text,text,parameter:{resource:root,pointer}}))});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false,false]);
 assert.equal(schemaProducer.version,'1.18.0+62');assert(schemaProducer.configuration.includes('literal-cookie-content-v1'));
});
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
 assert.equal(schemaProducer.version,'1.18.0+62');assert(schemaProducer.configuration.includes('parameter-runtime-serialization-v1'));
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

for(const version of ['3.2.0','3.2.1'])for(const targetVersion of ['3.1.2','3.0.4'])
test(`R3c-1 ${version} → ${targetVersion} complete repeated query inversion`,async()=>{
 const input=require('./migration_b05_r3c1_fixture.cjs')(version,'json',targetVersion),review=await require('./dist/migration.cjs').planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 for(const packet of [input,{root:review.outputRoot,resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0})),snapshot:'array-wire-cold'}]){
  const result=await evaluateSchemas({...packet,runtimeInstances:['q=a%2Bb&q=a%2Bb','q=','q=%2520&q=%E9%9B%AA','q=%2F%3F%26%3D%23','q=a%2Bb&q=a%2Bb&q=a%2Bb','q=wrong'].map(text=>({subject:'request-parameter',location:text,text,parameter:{resource:packet.root,pointer:'/components/parameters/Whole'}}))});
  assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));
  assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,true,true,true,false,false]);
 }
});

for(const targetVersion of ['3.1.2','3.0.4','2.0'])test(`R3c-2 ${targetVersion} complete named scalar/array inversion`,async()=>{
 const input=require('./migration_b05_r3c2_fixture.cjs')('3.2.1','json',targetVersion),review=await require('./dist/migration.cjs').planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const packet={root:review.outputRoot,resources:review.outputs.map(output=>({...output,generation:0})),snapshot:'factor-codecs'};
 const {requestOperation}=require('./dist/execution.cjs'),plan=requestOperation({...packet,resource:packet.root,pointer:'/paths/~1p/get'});
 for(const parameter of plan.parameters){
  const values=parameter.name==='q'?['q=','q=a%2Bb&q=a%2Bb','q=other']:parameter.name==='text'?['text=','text=%E9%9B%AA','text=other']:['flag=true','flag=false','flag=other'];
  const result=await evaluateSchemas({...packet,runtimeInstances:values.map(text=>({subject:'request-parameter',location:text,text,parameter:parameter.definition}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,true,false]);
 }
});
