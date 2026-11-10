const {test}=require('node:test'),assert=require('node:assert/strict');
const {planMigration}=require('./dist/migration.cjs'),{createGraph,analyse}=require('./dist/model.cjs');
const {SourceDocument}=require('./dist/document.cjs'),{evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {capture}=require('./migration_b05_r3d1b_fixture.cjs');
const at='/paths/~1parts/post/requestBody/content/multipart~1form-data';
const singleton=(name,value={type:'string'})=>({type:'object',required:[name],additionalProperties:false,properties:{[name]:value}});
const alternatives=names=>({anyOf:names.map(name=>singleton(name))});
const bytes=parts=>Buffer.concat([...parts.flatMap(({name,value,type='text/plain; charset=utf-8',transfer,headers=[]})=>[
 Buffer.from('--Multi\r\nContent-Disposition: form-data; name="'+name.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"\r\nContent-Type: '+type+'\r\n'+
 (transfer?'Content-Transfer-Encoding: '+transfer+'\r\n':'')+headers.map(([name,value])=>name+': '+value+'\r\n').join('')+'\r\n'),
 Buffer.isBuffer(value)?value:Buffer.from(value),Buffer.from('\r\n')]),Buffer.from('--Multi--\r\n')]);
async function valid(input,text,schema=at+'/schema',wire=false){
 const result=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:'multi',text:wire?text.toString('base64'):text,
  schema:{resource:input.root,pointer:schema},...(wire?{form:{resource:input.root,pointer:at},mediaType:'multipart/form-data; boundary=Multi',mediaBase64:true}:{})}]});
 assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));return result.runtimeEvaluations.every(value=>value.complete&&value.valid===true);
}
async function review(input){
 const before=JSON.stringify(input),result=await planMigration(input);assert.equal(JSON.stringify(input),before);
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.producerVersion,'105');
 const cold={root:result.outputRoot,resources:result.outputs,snapshot:'multi-cold'};assert.equal(analyse(cold).complete,true);
 return {result,cold,graph:createGraph(cold).graph};
}
const project=parts=>Object.fromEntries([...new Set(parts.map(part=>Object.keys(part)[0]))].map(name=>[name,parts.filter(part=>name in part).map(part=>part[name])]));
module.exports=function register(group){
 if(group==='media')for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const target of ['3.1.2','3.0.4'])for(const names of [['a','b'],['a','雪/"\\~','third']])test(`R3d1b2 ${version} ${format} ${target} ${names.length} names preserve the complete bounded language`,async()=>{
  const {input}=capture(version,format,target,{schema:{type:'array',maxItems:3,uniqueItems:true,items:alternatives(names)},itemEncoding:{contentType:'text/plain; charset=utf-8'}});
  const {cold,graph}=await review(input),media=graph.docs.get(cold.root).dataNode(at).value;
  assert.deepEqual(Object.keys(media.schema.properties),[...names].sort());assert.equal(media.schema.additionalProperties,false);
  for(const parts of [[],[{[names[0]]:'x'}],[{[names[0]]:'x'},{[names[1]]:'y'},{[names[0]]:'z'}],[{[names[0]]:'x'},{[names[0]]:'x'}],names.map(name=>({[name]:'雪'})),[{other:'x'}],Array.from({length:4},()=>({[names[0]]:'x'}))]){
   const mapped=project(parts),source=await valid(input,JSON.stringify(parts)),destination=await valid(cold,JSON.stringify(mapped));assert.equal(destination,source);
   if(parts.length){const wire=bytes(parts.map(part=>({name:Object.keys(part)[0],value:Object.values(part)[0]})));assert.equal(await valid(input,wire,undefined,true),await valid(cold,wire,undefined,true));}
  }
  for(const object of [{},{[names[0]]:[]},{[names[0]]:[],[names[1]]:[] }])assert.equal(await valid(cold,JSON.stringify(object)),true);
 });
 if(group==='media')for(const target of ['3.1.2','3.0.4'])for(const field of ['enum','const'])test(`R3d1b2 ${target} discovers names from finite part ${field}`,async()=>{
  const choices=[{type:'object',[field]:field==='enum'?[{left:'snow'}]:{left:'snow'}},{type:'object',[field]:field==='enum'?[{right:'雪'}]:{right:'雪'}}];
  const {input}=capture('3.2.1','json',target,{schema:{type:'array',maxItems:2,items:{anyOf:choices}},itemEncoding:{contentType:'text/plain'}}),{cold}=await review(input);
  for(const parts of [[{left:'snow'},{right:'雪'}],[{right:'雪'},{left:'snow'}],[{left:'different'}]])assert.equal(await valid(input,JSON.stringify(parts)),await valid(cold,JSON.stringify(project(parts))));
 });
 if(group==='media')for(const target of ['3.1.2','3.0.4'])test(`R3d1b2 ${target} exact correlated enums preserve numbers and omission`,async()=>{
  const language=[[],[{a:'EXACT'},{b:'雪'}],[{b:'雪'},{a:'EXACT'}],[{a:0},{b:'zero'}],[{b:'zero'},{a:0}]];
  const {input}=capture('3.2.1','yaml',target,{schema:{type:'array',enum:language},itemEncoding:{contentType:'application/json'}}),{cold}=await review(input);
  for(const [source,destination,expected]of [
   ['[{"a":9007199254740993.00},{"b":"雪"}]','{"a":[9007199254740993.00],"b":["雪"]}',true],
   ['[{"a":0},{"b":"雪"}]','{"a":[0],"b":["雪"]}',false],
   ['[{"a":9007199254740992},{"b":"雪"}]','{"a":[9007199254740992],"b":["雪"]}',false],
   ['[]','{"a":[],"b":[]}',true],['[]','{}',true],
  ]){assert.equal(await valid(input,source),expected);assert.equal(await valid(cold,destination),expected);}
  const wire=bytes([{name:'b',value:'"雪"',type:'application/json'},{name:'a',value:'9007199254740993.00',type:'application/json'}]);
  assert.equal(await valid(input,wire,undefined,true),true);assert.equal(await valid(cold,wire,undefined,true),true);
 });
 if(group==='media')test('R3d1b2 finite composition preserves required fields and value correlations',async()=>{
  const pair=[{a:'x'},{b:'y'}],reverse=[...pair].reverse();
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',allOf:[{enum:[pair,reverse,[{a:'bad'}]]},{oneOf:[{enum:[pair,reverse]},{const:[]}]}]},itemEncoding:{contentType:'text/plain'}}),{cold}=await review(input);
  for(const [parts,expected]of [[pair,true],[reverse,true],[[{a:'bad'}],false],[[],false]]){assert.equal(await valid(input,JSON.stringify(parts)),expected);assert.equal(await valid(cold,JSON.stringify(project(parts))),expected);}
 });
 if(group==='downgrade')for(const [label,schema,reason]of [
  ['finite fixed order',{type:'array',const:[{a:'x'},{b:'y'}]},'target-representation'],
  ['value-dependent order',{type:'array',enum:[[{a:'x'},{b:'y'}],[{b:'z'},{a:'x'}]]},'target-representation'],
  ['unbounded name language',{type:'array',items:alternatives(['a','b'])},'unavailable-proof'],
  ['open wrapper',{type:'array',maxItems:2,items:{type:'object',properties:{a:{type:'string'},b:{type:'string'}}}},'unavailable-proof'],
  ['unserializable name alternative',{type:'array',maxItems:2,items:alternatives(['a','invalid\nname'])},'unavailable-proof'],
  ['invalid finite bound',{type:'array',maxItems:-1,items:alternatives(['a','b'])},'source-incomplete'],
  ['cyclic identities',{type:'array',maxItems:2,items:{$ref:'#'+at+'/schema/items'}},'unavailable-proof'],
 ])test(`R3d1b2 ${label} has precise ${reason}`,async()=>{
  const {input}=capture('3.2.1','yaml','3.1.2',{schema,itemEncoding:{contentType:'text/plain'}}),result=await planMigration(input);
  assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.reason===reason),JSON.stringify(result.problems));
 });
 if(group==='downgrade')for(const rule of [{contentType:'application/json'},{contentType:'text/plain',headers:{'X-Mode':{required:true,schema:{type:'string',enum:['x']}}}},{}, {contentType:'text/plain; charset=iso-8859-1'}])test(`R3d1b2 one field cannot merge incompatible positional wire rules ${JSON.stringify(rule)}`,async()=>{
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',maxItems:2,items:alternatives(['a','b'])},prefixEncoding:[{contentType:'text/plain'},rule],itemEncoding:{contentType:'text/plain'}}),result=await planMigration(input);
  assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.reason==='target-representation'||problem.reason==='unavailable-proof'));
 });
 if(group==='multipart')for(const target of ['3.1.2','3.0.4'])test(`R3d1b2 ${target} multi-name binary and Header rules retain actual octets`,async()=>{
  const properties={a:{type:'string',contentEncoding:'base64'},b:{type:'string',contentEncoding:'base64'}};
  const part={type:'object',properties,additionalProperties:false,minProperties:1,maxProperties:1};
  const rule={contentType:'application/octet-stream, image/png',headers:{'Content-Transfer-Encoding':{required:true,schema:{type:'string',enum:['base64']}}}};
  const {input}=capture('3.2.1','json',target,{schema:{type:'array',maxItems:3,items:part},itemEncoding:rule}),{cold}=await review(input);
  for(const type of ['application/octet-stream','image/png']){
   const octets=Buffer.from([0,255,128,13,10]),wire=bytes([{name:'a',value:octets.toString('base64'),type,transfer:'base64'},{name:'b',value:'',type,transfer:'base64'},{name:'a',value:'AQI=',type,transfer:'base64'}]);
   assert.equal(await valid(input,wire,undefined,true),true);assert.equal(await valid(cold,wire,undefined,true),true);
  }
 });
 if(group==='owners')for(const format of ['yaml','json'])test(`R3d1b2 ${format} shared schema resources and independent Header consumers survive`,async()=>{
  const {input,value,encode}=capture('3.2.0',format,'3.1.2'),media=value.paths['/parts'].post.requestBody.content['multipart/form-data'];
  media.schema={type:'array',maxItems:2,items:{$ref:'names.json#/Part'}};media.prefixEncoding=[];media.itemEncoding={contentType:'text/plain',headers:{'X-Mode':{$ref:'names.json#/Header'}}};
  value.components={schemas:{Independent:{$ref:'names.json#/Part'}}};
  input.resources[0].text=encode(value);input.resources.push({id:'file:///named/names.json',generation:4,text:JSON.stringify({Part:{type:'object',minProperties:1,maxProperties:1,additionalProperties:false,properties:{a:{$ref:'#/Value'},b:{$ref:'#/Value'}}},Value:{type:'string'},Header:{required:true,schema:{type:'string',enum:['keep']}}})});
  const {cold,graph}=await review(input);assert(graph.entryReferences().filter(edge=>['schema','header'].includes(edge.kind)).every(edge=>edge.resolution==='resolved'));
  const wire=bytes([{name:'b',value:'雪',headers:[['X-Mode','keep']]},{name:'a',value:'x',headers:[['X-Mode','keep']]}]);assert.equal(await valid(input,wire,undefined,true),true);assert.equal(await valid(cold,wire,undefined,true),true);
 });
 if(group==='media')test('R3d1b2 saved grouping retains exact order, empty and omitted selections; interleaved choices refuse',async()=>{
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',maxItems:3,items:{type:'object',properties:{a:{type:'integer'},b:{type:'string'}},minProperties:1,maxProperties:1,additionalProperties:false}},itemEncoding:{contentType:'application/json'}});
  input.configuration={id:'file:///named/busyapi.yaml',generation:8,text:'version: 1\nroots: [{name: api, path: api.json}]\nenvironments: {dev: {variables: {keep: original}}}\ntests:\n- name: ordered\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: [{b: 雪}, {a: 9007199254740993.00}, {a: 9007199254740994e0}], partMediaTypes: {a: application/json, b: application/json}}\n- name: empty\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: []}\n- name: omitted\n  operation: {entry: api, method: POST, path: /parts}\n- name: named\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: {a: [], b: [雪]}}\n'};
  const {result}=await review(input);assert.equal(result.configurationProjections.filter(record=>record.multipart).length,2);
  assert(result.manifestText.includes('9007199254740993.00'));assert(result.manifestText.includes('9007199254740994e0'));assert.deepEqual(Object.keys(result.manifest.tests[0].body.value),['b','a']);
  assert.deepEqual(result.manifest.tests[1].body.value,{a:[],b:[]});assert.equal(result.manifest.tests[2].body,undefined);assert.deepEqual(result.manifest.tests[3].body.value,{a:[],b:['雪']});
  input.configuration.text=input.configuration.text.replace('[{b: 雪}, {a: 9007199254740993.00}, {a: 9007199254740994e0}]','[{a: 9007199254740993.00}, {b: 雪}, {a: 9007199254740994e0}]');
  const refused=await planMigration(input);assert.equal(refused.complete,false);assert(refused.problems.some(problem=>problem.code==='migration.multipart.saved-proof'));assert.deepEqual(refused.outputs,[]);
 });
 if(group==='media')test('R3d1b2 final correspondence rejects changed correlations, field bounds and Encoding activation',async()=>{
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',maxItems:2,items:alternatives(['a','b'])},itemEncoding:{contentType:'text/plain'}}),{result,cold}=await review(input);
  const source=createGraph(input).graph,baseline=createGraph(cold).graph;await require('./dist/migration_invariants.cjs').prepareNamedMultipart([source],'3.1');
  const neutral=name=>{const edge=baseline.referenceAs(cold.root,at+'/schema/properties/'+name+'/items/allOf/0','$ref','schema');assert.equal(edge.resolution,'resolved');return {resource:edge.targetResource,pointer:edge.targetPointer};};
  for(const [pointer,value]of [[at+'/schema/anyOf',[{properties:{a:{maxItems:99}}}]],[at+'/schema/properties/b/items',{type:'integer'}],[at+'/encoding/b/contentType','application/json'],[at+'/encoding/other',{}]]){
   const outputs=result.outputs.map(output=>({...output,text:output.id===cold.root?new SourceDocument(output.text,output.id).set(pointer,value):output.text}));
   const target=createGraph({...cold,resources:outputs}).graph,problems=[];
   require('./dist/migration_invariants.cjs').proveMigrationPositionalEncoding(source,target,(location,scope)=>scope.kind==='media'?[{resource:cold.root,pointer:at}]:[neutral(location.pointer.endsWith('/a')?'a':'b')],(location,code,message,reason)=>problems.push({code,message,reason}));
   assert(problems.some(problem=>problem.code==='migration.invariant.named-multipart'),JSON.stringify(problems));
  }
 });
 if(group==='multipart')test('R3d1b2 actual MIME correspondence preserves per-field octets, Headers and repeat order',async()=>{
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',maxItems:3,items:alternatives(['a','b'])},itemEncoding:{contentType:'text/plain'}});
  const graph=createGraph(input).graph,{prepareNamedMultipart,NamedMultipartEquivalence,proveNamedMultipartWire}=require('./dist/migration_invariants.cjs');
  await prepareNamedMultipart([graph],'3.1');const certificate=new NamedMultipartEquivalence(graph).prove(graph.scopeAs(input.root,at,'media'),['multipart/form-data'],'3.1').certificate;
  assert(certificate);
  const a={name:'a',value:'first',headers:[['X-Keep','original']]},b={name:'b',value:'雪'},c={name:'a',value:'second'};
  const inputWire={bytes:bytes([a,b,c]),contentType:'multipart/form-data; boundary=Multi'};
  const output=parts=>({bytes:bytes(parts),contentType:inputWire.contentType});
  assert.equal(proveNamedMultipartWire(certificate,inputWire,output([b,a,c])),true);
  for(const parts of [[b,c,a],[a,b],[a,b,{...c,value:'changed'}],[{...a,headers:[['X-Keep','changed']]},b,c]])assert.equal(proveNamedMultipartWire(certificate,inputWire,output(parts)),false);
 });

 if(group==='media')for(const target of ['3.1.2','3.0.4'])test(`R3d1b2 ${target} repeated-order correlations retain homogeneous per-field value owners`,async()=>{
  const a0={a:0},a1={a:1},b={b:'雪'},language=[[a0,a1,b],[a0,b,a1],[b,a0,a1]];
  const part={type:'object',properties:{a:{type:'integer'},b:{type:'string'}},minProperties:1,maxProperties:1,additionalProperties:false};
  const {input}=capture('3.2.1','json',target,{schema:{type:'array',items:part,enum:language},itemEncoding:{contentType:'application/json'}}),{cold}=await review(input);
  for(const parts of [...language,[a1,a0,b],[a0,b],[a0,a0,b]])assert.equal(await valid(input,JSON.stringify(parts)),await valid(cold,JSON.stringify(project(parts))));
  const wire=bytes([{name:'a',value:'0',type:'application/json'},{name:'b',value:'"雪"',type:'application/json'},{name:'a',value:'1',type:'application/json'}]);
  assert.equal(await valid(input,wire,undefined,true),true);assert.equal(await valid(cold,wire,undefined,true),true);
 });
 if(group==='media')test('R3d1b2 symbolic field counts preserve minimum total and distinct per-name defaults',async()=>{
  const part={type:'object',properties:{a:{type:'string'},b:{type:'object',additionalProperties:false,properties:{x:{type:'integer'}},required:['x']}},minProperties:1,maxProperties:1,additionalProperties:false};
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',minItems:2,maxItems:3,items:part},itemEncoding:{}}),{cold}=await review(input);
  for(const parts of [[],[{a:'x'}],[{a:'x'},{b:{x:1}}],[{b:{x:1}},{a:'x'}],[{a:'x'},{a:'y'},{b:{x:1}}],[{a:'x'},{a:'y'},{a:'z'},{b:{x:1}}]])
   assert.equal(await valid(input,JSON.stringify(parts)),await valid(cold,JSON.stringify(project(parts))));
  const wire=bytes([{name:'b',value:'{"x":1}',type:'application/json'},{name:'a',value:'snow',type:'text/plain'}]);
  assert.equal(await valid(input,wire,undefined,true),true);assert.equal(await valid(cold,wire,undefined,true),true);
 });
 if(group==='owners')test('R3d1b2 multi-name YAML aliases and shared same-media consumers keep local envelopes',async()=>{
  const {input,value,encode}=capture('3.2.1','yaml','3.1.2',{schema:{type:'array',maxItems:2,items:alternatives(['a','b'])},itemEncoding:{contentType:'text/plain'}});
  const media=value.paths['/parts'].post.requestBody.content['multipart/form-data'];media.prefixEncoding=[media.itemEncoding];
  value.components={mediaTypes:{Shared:media},schemas:{Original:{$ref:'#/components/mediaTypes/Shared/schema'}}};
  value.paths['/parts'].post.requestBody.content['multipart/form-data']={$ref:'#/components/mediaTypes/Shared'};
  value.paths['/other']={post:{requestBody:{content:{'multipart/form-data; charset=utf-8':{$ref:'#/components/mediaTypes/Shared'}}},responses:{204:{description:'Empty'}}}};
  input.resources[0].text=encode(value);assert(input.resources[0].text.includes('&'));
  const {cold,graph}=await review(input);assert(graph.entryReferences().filter(edge=>['schema','header'].includes(edge.kind)).every(edge=>edge.resolution==='resolved'));
  const wire=bytes([{name:'b',value:'snow'},{name:'a',value:'雪'}]);assert.equal(await valid(input,wire,undefined,true),true);assert.equal(await valid(cold,wire,undefined,true),true);
 });
 if(group==='downgrade')test('R3d1b2 active mixed-media positional differences retain a target restriction',async()=>{
  const {input,value,encode}=capture('3.2.1','json','3.1.2',{schema:{type:'array',maxItems:2,items:alternatives(['a','b'])},itemEncoding:{contentType:'text/plain'}});
  const media=value.paths['/parts'].post.requestBody.content['multipart/form-data'];value.components={mediaTypes:{Shared:media}};
  value.paths['/parts'].post.requestBody.content={'multipart/form-data':{$ref:'#/components/mediaTypes/Shared'},'multipart/mixed':{$ref:'#/components/mediaTypes/Shared'}};
  input.resources[0].text=encode(value);const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
  assert(result.problems.some(problem=>problem.reason==='target-representation'&&problem.pointer.includes('multipart~1mixed')),JSON.stringify(result.problems));
 });
 if(group==='downgrade')test('R3d1b2 a JSON consumer does not block a faithful multi-name form occurrence',async()=>{
  const {input,value,encode}=capture('3.2.1','json','3.1.2',{schema:{type:'array',maxItems:2,items:alternatives(['a','b'])},itemEncoding:{contentType:'text/plain'}});
  const media=value.paths['/parts'].post.requestBody.content['multipart/form-data'];value.components={mediaTypes:{Shared:media}};
  value.paths['/parts'].post.requestBody.content={'multipart/form-data':{$ref:'#/components/mediaTypes/Shared'},'application/json':{$ref:'#/components/mediaTypes/Shared'}};
  input.resources[0].text=encode(value);const {cold,graph}=await review(input);
  assert.equal(graph.docs.get(cold.root).dataNode(at+'/schema').value.type,'object');
  const edge=graph.referenceAs(cold.root,at.replace('multipart~1form-data','application~1json')+'/schema','$ref','schema');assert.equal(edge.resolution,'resolved');
  assert.equal(graph.docs.get(edge.targetResource).dataNode(edge.targetPointer).value.type,'array');
 });
 if(group==='downgrade')test('R3d1b2 large finite name products refuse completeness without a finite approximation',async()=>{
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',maxItems:32,items:alternatives(['a','b','c'])},itemEncoding:{contentType:'text/plain'}}),result=await planMigration(input);
  assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.reason==='unavailable-proof'));
 });

 if(group==='downgrade')test('R3d1b2 finite accepted values establish the incompatible same-name Header restriction',async()=>{
  const part={type:'object',minProperties:1,maxProperties:1,additionalProperties:false,properties:{a:{type:'string',enum:['x']},b:{type:'string',enum:['y']}}};
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',maxItems:2,items:part},prefixEncoding:[{contentType:'text/plain'},{contentType:'text/plain',headers:{'X-Mode':{required:true,schema:{type:'string',enum:['different']}}}}]}),result=await planMigration(input);
  assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.reason==='target-representation'),JSON.stringify(result.problems));
 });

 if(group==='media')for(const target of ['3.1.2','3.0.4'])test(`R3d1b2 ${target} finite null values reuse the established null-only mapping`,async()=>{
  const {input}=capture('3.2.1','json',target,{schema:{type:'array',enum:[[{a:null},{b:'snow'}],[{b:'snow'},{a:null}]]},itemEncoding:{contentType:'application/json'}}),{cold}=await review(input);
  for(const [object,expected]of [[{a:[null],b:['snow']},true],[{a:['null'],b:['snow']},false],[{a:[],b:['snow']},false]])assert.equal(await valid(cold,JSON.stringify(object)),expected);
  const wire=bytes([{name:'a',value:'null',type:'application/json'},{name:'b',value:'"snow"',type:'application/json'}]);assert.equal(await valid(input,wire,undefined,true),true);assert.equal(await valid(cold,wire,undefined,true),true);
 });

 if(group==='media')test('R3d1b2 assertion-looking field names keep schema references and literal data distinct',async()=>{
  const names=['enum','const','properties'];
  const {input}=capture('3.2.1','json','3.1.2',{schema:{type:'array',maxItems:3,items:alternatives(names)},itemEncoding:{contentType:'text/plain'}}),{cold}=await review(input);
  const wire=bytes(names.map(name=>({name,value:'snow'})));assert.equal(await valid(input,wire,undefined,true),true);assert.equal(await valid(cold,wire,undefined,true),true);
 });

};
