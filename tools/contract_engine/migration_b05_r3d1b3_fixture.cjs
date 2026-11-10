const {test}=require('node:test'),assert=require('node:assert/strict');
const {planMigration}=require('./dist/migration.cjs'),{createGraph,analyse}=require('./dist/model.cjs');
const {SourceDocument}=require('./dist/document.cjs'),{evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {capture}=require('./migration_b05_r3d1b_fixture.cjs');
const at='/paths/~1parts/post/requestBody/content/multipart~1form-data';
const part=value=>({type:'object',properties:{tag:value},required:['tag'],additionalProperties:false});
const tuple=(values,extra={})=>({schema:{type:'array',prefixItems:values.map(part),items:false,...extra},itemEncoding:{contentType:'application/json'}});
const wire=(values,type='application/json')=>Buffer.from(values.map(value=>'--Tuple\r\nContent-Disposition: form-data; name="tag"\r\nContent-Type: '+type+'\r\n\r\n'+value+'\r\n').join('')+'--Tuple--\r\n');
async function valid(input,text,bytes=false,pointer=at+'/schema'){
 const checked=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:'tuple',text:bytes?text.toString('base64'):text,
  schema:{resource:input.root,pointer},...(bytes?{form:{resource:input.root,pointer:at},mediaType:'multipart/form-data; boundary=Tuple',mediaBase64:true}:{})}]});
 assert.equal(checked.complete,true,JSON.stringify(checked.runtimeFindings));
 assert.equal(checked.runtimeEvaluations.length,1);assert.equal(checked.runtimeEvaluations[0].complete,true);
 return checked.runtimeEvaluations[0].valid;
}
async function review(input){
 const original=JSON.stringify(input),result=await planMigration(input);assert.equal(JSON.stringify(input),original);
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.producerVersion,'106');
 const cold={root:result.outputRoot,resources:result.outputs,snapshot:'tuple-cold'},analysis=analyse(cold);
 assert.equal(analysis.complete,true,JSON.stringify(analysis.findings));
 assert(!analysis.findings.some(value=>value.severity==='error'),JSON.stringify(analysis.findings));
 return {result,cold,graph:createGraph(cold).graph};
}
async function equivalent(input,cold,values,expected){
 const source='['+values.map(value=>'{"tag":'+value+'}').join(',')+']',target='{"tag":['+values.join(',')+']}';
 assert.equal(await valid(input,source),expected);assert.equal(await valid(cold,target),expected);
 const bytes=wire(values);assert.equal(await valid(input,bytes,true),expected);assert.equal(await valid(cold,bytes,true),expected);
}
module.exports=function register(group){
 if(group==='media')for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const target of ['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4'])for(const count of [2,3])test(`R3d1b3 ${version} ${format} ${target} ${count} finite heterogeneous positions`,async()=>{
  const values=[{type:'integer',enum:['EXACT',2]},{type:'string',enum:['','雪']},{type:'boolean'}].slice(0,count);
  const {input}=capture(version,format,target,tuple(values)),{cold,graph}=await review(input),schema=graph.docs.get(cold.root).dataNode(at+'/schema').value;
  assert(schema.enum.length>0);assert.equal(schema.properties.tag.items.prefixItems,undefined);assert(!Array.isArray(schema.properties.tag.items));
  for(const [values,expected]of [[[],true],[['9007199254740993.00'],true],[['9007199254740993.00','"雪"'],true],[['2','""','true'].slice(0,count),true],
   [['"雪"','2'],false],[['9007199254740992'],false],[['2','"snow"'],false],[['2','"雪"','true','false'],false]])await equivalent(input,cold,values,expected);
  assert.equal(await valid(cold,'{}'),true);assert.equal(await valid(cold,'{"tag":[]}'),true);
 });
 if(group==='media')for(const keyword of ['anyOf','oneOf'])test(`R3d1b3 finite ${keyword}, allOf and whole-array not preserve correlations`,async()=>{
  const media=tuple([{type:'integer',[keyword]:[{const:1},{const:2}]},{type:'string',enum:['x','y']}],{minItems:2,
   allOf:[{not:{const:[{tag:1},{tag:'y'}]}},{enum:[[{tag:1},{tag:'x'}],[{tag:1},{tag:'y'}],[{tag:2},{tag:'y'}]]}]});
  const {input}=capture('3.2.1','json','3.0.4',media),{cold}=await review(input);
  for(const [values,expected]of [[['1','"x"'],true],[['2','"y"'],true],[['1','"y"'],false],[['2','"x"'],false],[['1'],false],[[],false]])await equivalent(input,cold,values,expected);
 });
 if(group==='media')test('R3d1b3 closed finite tail, optional and absent positions preserve cardinality',async()=>{
  const media={schema:{type:'array',prefixItems:[part({type:'integer',const:1})],items:part({type:'string',enum:['','雪']}),maxItems:3},itemEncoding:{contentType:'application/json'}};
  const {input}=capture('3.2.0','yaml','3.0.3',media),{cold}=await review(input);
  for(const [values,expected]of [[[],true],[['1'],true],[['1','"雪"','""'],true],[['1','1'],false],[['1','"雪"','""','"雪"'],false]])await equivalent(input,cold,values,expected);
 });
 if(group==='media')test('R3d1b3 const-only positions do not inherit another position type hint',async()=>{
  const {input}=capture('3.2.1','json','3.0.4',tuple([{type:'integer',const:1},{const:'雪'}])),{cold,graph}=await review(input);
  assert.equal(graph.docs.get(cold.root).dataNode(at+'/schema/properties/tag/items/type'),undefined);
  await equivalent(input,cold,['1','"雪"'],true);await equivalent(input,cold,['1','1'],false);
 });
 if(group==='media')test('R3d1b3 nonhomogeneous repeats retain shuffle closure, null and cross-field correlations',async()=>{
  const a={tag:1},b={tag:'雪'},c={side:null},language=[[a,b,c],[a,c,b],[c,a,b],[]];
  const {input}=capture('3.2.1','json','3.0.4',{schema:{type:'array',enum:language},itemEncoding:{contentType:'application/json'}}),{cold}=await review(input);
  for(const [parts,projected,expected]of [[language[0],{tag:[1,'雪'],side:[null]},true],[language[2],{side:[null],tag:[1,'雪']},true],
   [[b,a,c],{tag:['雪',1],side:[null]},false],[[a,b],{tag:[1,'雪']},false],[[],{},true],[[],{tag:[],side:[]},true]]){
   assert.equal(await valid(input,JSON.stringify(parts)),expected);assert.equal(await valid(cold,JSON.stringify(projected)),expected);
  }
 });
 if(group==='multipart')test('R3d1b3 uniform text hints retain nonhomogeneous finite strings and exact bytes',async()=>{
  const media=tuple([{type:'string',const:''},{type:'string',enum:['雪','snow']}]);media.itemEncoding={contentType:'text/plain; charset=utf-8'};
  const {input}=capture('3.2.1','json','3.0.4',media),{cold}=await review(input);
  for(const values of [[],[''],['','雪'],['雪','']]){
   const bytes=wire(values,'text/plain; charset=utf-8');assert.equal(await valid(input,bytes,true),await valid(cold,bytes,true));
  }
 });
 if(group==='multipart')test('R3d1b3 byte certificate rejects reordered heterogeneous repetitions and Header changes',async()=>{
  const {input}=capture('3.2.1','json','3.0.4',tuple([{type:'integer',const:1},{type:'string',const:'雪'}]));
  const graph=createGraph(input).graph,{prepareNamedMultipart,NamedMultipartEquivalence,proveNamedMultipartWire}=require('./dist/migration_invariants.cjs');
  await prepareNamedMultipart([graph],'3.0');
  const certificate=new NamedMultipartEquivalence(graph).prove(graph.scopeAs(input.root,at,'media'),['multipart/form-data'],'3.0').certificate;
  assert(certificate.language.tuples.length);const buffer=bytes=>({bytes,contentType:'multipart/form-data; boundary=Tuple'});
  const before=buffer(wire(['1','"雪"']));assert.equal(proveNamedMultipartWire(certificate,before,before),true);
  assert.equal(proveNamedMultipartWire(certificate,before,buffer(wire(['"雪"','1']))),false);
  assert.equal(proveNamedMultipartWire(certificate,before,buffer(Buffer.from(before.bytes.toString().replace('Content-Type:', 'X-Changed: value\r\nContent-Type:')))),false);
 });
 if(group==='owners')for(const format of ['yaml','json'])test(`R3d1b3 ${format} annotated disjoint values keep guarded and independent owners`,async()=>{
  const media=tuple([{type:'integer',const:1,default:1,example:1},{type:'string',const:'雪',default:'雪',example:'雪'}]);
  const {input,value,encode}=capture('3.2.1',format,'3.0.4',media);
  value.components={schemas:{First:{$ref:'values.json#/First'},Second:{$ref:'values.json#/Second'},Original:{$ref:'#'+at+'/schema'}}};
  for(const [index,name]of ['First','Second'].entries())media.schema.prefixItems[index].properties.tag={$ref:'values.json#/'+name};
  input.resources[0].text=encode(value);input.resources.push({id:'file:///named/values.json',generation:2,text:JSON.stringify({
   First:{$id:'https://example.test/first',type:'integer',const:1,default:1,example:1,title:'Number',description:'First value'},
   Second:{type:'string',const:'雪',default:'雪',example:'雪',title:'Text',description:'Second value'}})});
  const {cold,graph}=await review(input);assert(graph.entryReferences().filter(edge=>edge.kind==='schema').every(edge=>edge.resolution==='resolved'));
  await equivalent(input,cold,['1','"雪"'],true);await equivalent(input,cold,['"雪"','1'],false);
  const independent=graph.referenceAs(cold.root,'/components/schemas/Original','$ref','schema');
  assert.equal(independent.resolution,'resolved');
  const instance='[{"tag":1},{"tag":"雪"}]';
  assert.equal(await valid({...cold,root:independent.targetResource},instance,false,independent.targetPointer),true);
  const branches=graph.docs.get(cold.root).dataNode(at+'/schema/properties/tag/items/anyOf').value;
  assert(branches.every(branch=>branch.allOf[0].enum.length===1));
  const {evaluateMigrationAnnotations}=require('./dist/migration_annotations.cjs');
  const annotations=async(packet,text)=>{
   const result=await evaluateMigrationAnnotations({...packet,runtimeInstances:[{subject:'request-body',location:'annotations',text,schema:{resource:packet.root,pointer:at+'/schema'}}]});
   assert(result.checked.complete);assert(result.checked.runtimeEvaluations[0].valid);return result.annotations[0];
  };
  const before=(await annotations(input,instance)).map(text=>{
   const [keyword,path,value]=JSON.parse(text);return JSON.stringify([keyword,path.replace(/^#\/(\d+)\/tag$/,'#/tag/$1'),value]);
  }).sort();
  assert(before.length>=6);assert.deepEqual(await annotations(cold,'{"tag":[1,"雪"]}'),before);
 });
 if(group==='owners')test('R3d1b3 YAML aliases keep original schemas neutral',async()=>{
  const shared={type:'integer',const:1},media=tuple([shared,{type:'string',const:'雪'}]);
  const {input,value,encode}=capture('3.2.1','yaml','3.0.4',media);value.components={schemas:{Shared:shared}};input.resources[0].text=encode(value);
  assert(input.resources[0].text.includes('&'));const {cold}=await review(input);await equivalent(input,cold,['1','"雪"'],true);
 });
 if(group==='owners')test('R3d1b3 final correspondence rejects changed guards, complete tuples and codecs',async()=>{
  const {input}=capture('3.2.1','json','3.0.4',tuple([{type:'integer',const:1},{type:'string',const:'雪'}])),{result,cold,graph:baseline}=await review(input);
  const source=createGraph(input).graph,{prepareNamedMultipart,NamedMultipartEquivalence,proveMigrationPositionalEncoding}=require('./dist/migration_invariants.cjs');
  await prepareNamedMultipart([source],'3.0');
  const certificate=new NamedMultipartEquivalence(source).prove(source.scopeAs(input.root,at,'media'),['multipart/form-data'],'3.0').certificate;
  const delivered=baseline.docs.get(cold.root);
  assert.deepEqual([...delivered.dataNode(at+'/schema/enum').children.values()].map(node=>delivered.dataJson(node.pointer)),certificate.language.projected);
  for(const text of certificate.language.accepted)assert.equal(await valid(input,text),true);
  for(const text of certificate.language.projected)assert.equal(await valid(cold,text),true);
  const locations=new Map(certificate.language.tuples[0].alternatives.flatMap((branch,index)=>branch.part.values.map((scope,child)=>{
   const edge=baseline.referenceAs(cold.root,at+'/schema/properties/tag/items/anyOf/'+index+'/allOf/1/allOf/'+child,'$ref','schema');
   assert.equal(edge.resolution,'resolved');return [JSON.stringify([scope.resource,scope.pointer]),{resource:edge.targetResource,pointer:edge.targetPointer}];
  })));
  for(const [pointer,value]of [[at+'/schema/enum',[{tag:['雪',1]}]],[at+'/schema/properties/tag/items/anyOf/0/allOf/0',{}],
   [at+'/schema/properties/tag/items/type','string'],[at+'/encoding/tag/contentType','text/plain']]){
   const resources=result.outputs.map(output=>({...output,text:output.id===cold.root?new SourceDocument(output.text,output.id).set(pointer,value):output.text}));
   const target=createGraph({...cold,resources}).graph,problems=[];
   proveMigrationPositionalEncoding(source,target,(location,scope)=>scope.kind==='media'?[{resource:cold.root,pointer:at}]:[locations.get(JSON.stringify([location.resource,location.pointer]))].filter(Boolean),
    (location,code,message,reason)=>problems.push({code,message,reason}));
   assert(problems.some(problem=>problem.code==='migration.invariant.named-multipart'),JSON.stringify(problems));
  }
 });
 if(group==='downgrade')for(const [label,media,reason]of [
  ['unbounded values',tuple([{type:'integer'},{type:'string'}]),'unavailable-proof'],
  ['unbounded positional tail',{schema:{type:'array',prefixItems:[part({type:'integer',const:1})],items:part({type:'string',const:'雪'})},itemEncoding:{contentType:'application/json'}},'unavailable-proof'],
  ['incompatible text hints',{...tuple([{type:'integer',const:1},{type:'string',const:'雪'}]),itemEncoding:{contentType:'text/plain'}},'unavailable-proof'],
  ['unsupported target codec',{...tuple([{type:'integer',const:1},{type:'string',const:'雪'}]),itemEncoding:{contentType:'application/json-seq'}},'unavailable-proof'],
  ['conditional binary bindings',tuple([{type:'string',const:'',contentEncoding:'base64'},{type:'string',const:'AP8=',contentEncoding:'base64'}]),'unavailable-proof'],
  ['annotation relocation',tuple([{type:'string',enum:['x','y'],default:'x'},{type:'string',const:'x',default:'y'}]),'unavailable-proof'],
  ['array default',tuple([{type:'integer',const:1},{type:'string',const:'雪'}],{default:[]}), 'unavailable-proof'],
  ['same-value documentation',tuple([{type:'string',const:'x',title:'First'},{type:'string',const:'x',title:'Second'}]),'unavailable-proof'],
  ['access semantics',tuple([{type:'integer',const:1,readOnly:true},{type:'string',const:'雪'}]),'unavailable-proof'],
  ['incompatible media',{...tuple([{type:'integer',const:1},{type:'string',const:'雪'}]),prefixEncoding:[{contentType:'application/json'},{contentType:'application/json; charset=iso-8859-1'}]},'target-representation'],
  ['incompatible Headers',{...tuple([{type:'integer',const:1},{type:'string',const:'雪'}]),prefixEncoding:[{contentType:'application/json'},{contentType:'application/json',headers:{'X-Rule':{required:true,schema:{const:'changed'}}}}]},'target-representation'],
 ])test(`R3d1b3 ${label} retains ${reason}`,async()=>{
  const {input}=capture('3.2.1','yaml','3.0.4',media),result=await planMigration(input);
  assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.reason===reason),JSON.stringify(result.problems));
 });
 if(group==='media')test('R3d1b3 structured saved values retain exact spelling, positions, empty and omitted selections',async()=>{
  const {input}=capture('3.2.1','yaml','3.0.4',tuple([{type:'integer',const:'EXACT'},{type:'string',enum:['','雪']} ]));
  input.configuration={id:'file:///named/busyapi.yaml',generation:8,text:'version: 1\nroots: [{name: api, path: api.yaml}]\ntests:\n- name: exact\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: [{tag: 9007199254740993.00}, {tag: 雪}], partMediaTypes: {tag: application/json}, partHeaders: []}\n- name: empty\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: []}\n- name: omitted\n  operation: {entry: api, method: POST, path: /parts}\n'};
  const {result}=await review(input);assert(result.manifestText.includes('9007199254740993.00'));
  assert.deepEqual(result.manifest.tests[0].body.partMediaTypes,{tag:'application/json'});assert.deepEqual(result.manifest.tests[0].body.partHeaders,[]);
  assert.deepEqual(result.manifest.tests[1].body.value,{tag:[]});assert.equal(result.manifest.tests[2].body,undefined);
  input.configuration.text=input.configuration.text.replace('[{tag: 9007199254740993.00}, {tag: 雪}]','[{tag: 雪}, {tag: 9007199254740993.00}]');
  const refused=await planMigration(input);assert.equal(refused.complete,false);assert(refused.problems.some(problem=>problem.code==='migration.multipart.saved-proof'));
 });
 if(group==='swagger')test('R3d1b3 finite tuples do not authorize a Swagger positional Encoding owner',async()=>{
  const {input}=capture('3.2.1','json','2.0',tuple([{type:'integer',const:1},{type:'string',const:'雪'}]));
  const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
 });
};
