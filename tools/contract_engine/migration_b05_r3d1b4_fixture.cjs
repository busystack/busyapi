const {test}=require('node:test'),assert=require('node:assert/strict');
const {planMigration}=require('./dist/migration.cjs'),{createGraph,analyse}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {capture}=require('./migration_b05_r3d1b_fixture.cjs');
const at='/paths/~1parts/post/requestBody/content/';
const escape=name=>name.replaceAll('~','~0').replaceAll('/','~1');
const part={type:'object',required:['tag'],additionalProperties:false,properties:{tag:{type:'string'}}};
function shared(version,format,target,rule={contentType:'text/plain; charset=utf-8'},types=['multipart/form-data','application/json']){
 const {input,value,encode}=capture(version,format,target,{schema:{type:'array',maxItems:3,items:part},itemEncoding:rule});
 const media=value.paths['/parts'].post.requestBody.content['multipart/form-data'];
 value.components={mediaTypes:{Shared:media,Chain:{$ref:'#/components/mediaTypes/Shared'}},schemas:{Original:{$ref:'#/components/mediaTypes/Shared/schema'}}};
 value.paths['/parts'].post.requestBody.content=Object.fromEntries(types.map(type=>[type,{$ref:'#/components/mediaTypes/Chain'}]));
 input.resources[0].text=encode(value);return {input,value,encode};
}
function terminal(graph,resource,pointer,kind='media'){
 for(let depth=0;depth<128;depth++){
  const edge=graph.referenceAs(resource,pointer,'$ref',kind);
  if(!edge)return {resource,pointer};assert.equal(edge.resolution,'resolved');resource=edge.targetResource;pointer=edge.targetPointer;
 }
 assert.fail('A fixture owner must terminate');
}
async function review(input){
 const original=JSON.stringify(input),result=await planMigration(input);assert.equal(JSON.stringify(input),original);
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.producerVersion,'107');
 const cold={root:result.outputRoot,resources:result.outputs,snapshot:'mixed-cold',exampleResources:result.exampleOutputs.map(output=>({
  version:1,id:output.id,generation:0,aliases:[],state:'available',identity:output.identity,base64:output.base64,byteLength:output.byteLength}))},graph=createGraph(cold).graph;
 assert.equal(analyse(cold).complete,true);assert.equal(graph.issues.length,0,JSON.stringify(graph.issues));
 assert(graph.entryReferences().every(edge=>edge.resolution==='resolved'));
 return {result,cold,graph};
}
async function valid(input,type,text,wire=false){
 const graph=createGraph(input).graph,owner=terminal(graph,input.root,at+escape(type));
 const checked=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:'mixed',
  text:wire?text.toString('base64'):text,schema:{...owner,pointer:owner.pointer+'/schema'},
  ...(wire?{form:{resource:input.root,pointer:at+escape(type)},mediaType:type+'; boundary=Mixed',mediaBase64:true}:{})}]});
 assert.equal(checked.complete,true,JSON.stringify(checked.runtimeFindings));return checked.runtimeEvaluations.every(value=>value.complete&&value.valid===true);
}
const wire=(binary=false)=>Buffer.concat([Buffer.from('--Mixed\r\nContent-Disposition: form-data; name="tag"\r\nContent-Type: '+
 (binary?'application/octet-stream\r\nContent-Transfer-Encoding: base64':'text/plain; charset=utf-8')+'\r\n\r\n'),
 binary?Buffer.from('AP+ADQo='):Buffer.from('雪'),Buffer.from('\r\n--Mixed--\r\n')]);

module.exports=function register(group){
 if(group==='owners')test('R3d1b4 an actual form content definition referenced by JSON retains its own occurrence',async()=>{
  const {input,value,encode}=capture('3.2.1','yaml','3.1.2');
  value.paths['/parts'].post.requestBody.content['application/json']={$ref:'#'+at+escape('multipart/form-data')};
  input.resources[0].text=encode(value);const {cold}=await review(input);
  assert.equal(await valid(input,'application/json','[{"tag":"snow"}]'),true);assert.equal(await valid(cold,'application/json','[{"tag":"snow"}]'),true);
  assert.equal(await valid(cold,'multipart/form-data',wire(),true),true);
 });

 if(group==='owners')test('R3d1b4 JSON Parameter/Header uses and itemSchema do not acquire a form array projection',async()=>{
  const {input,value,encode}=shared('3.2.1','json','3.1.2');
  value.components.mediaTypes.Shared.itemSchema=part;
  value.components.parameters={JSON:{name:'payload',in:'query',content:{'application/json':{$ref:'#/components/mediaTypes/Shared'}}}};
  value.components.headers={JSON:{content:{'application/json':{$ref:'#/components/mediaTypes/Shared'}}}};
  value.paths['/parts'].post.parameters=[{$ref:'#/components/parameters/JSON'}];
  value.paths['/parts'].post.responses={200:{description:'JSON Header',headers:{Payload:{$ref:'#/components/headers/JSON'}}}};
  input.resources[0].text=encode(value);const {cold,graph}=await review(input),doc=graph.docs.get(cold.root);
  for(const parent of ['/components/parameters/JSON','/components/headers/JSON']){
   const pointer=parent+'/content/application~1json';assert.equal(doc.dataNode(pointer+'/itemSchema'),undefined);assert.equal(doc.dataNode(pointer+'/encoding'),undefined);
   const schema=terminal(graph,cold.root,pointer+'/schema','schema');assert.equal(graph.docs.get(schema.resource).dataNode(schema.pointer).value.type,'array');
  }
 });

 if(group==='media')for(const target of ['3.1.2','3.0.4'])test(`R3d1b4 ${target} inactive named Encoding stays separate from active form style rules`,async()=>{
  const {input,value,encode}=shared('3.2.1','yaml',target),media=value.components.mediaTypes.Shared;
  media.schema={type:'object',properties:{tag:{type:'array',items:{type:'string'}}}};delete media.itemEncoding;
  media.encoding={tag:{style:'form',explode:true,headers:{'X-Mode':{schema:{type:'string',enum:['keep']}}}}};
  input.resources[0].text=encode(value);const {cold,graph}=await review(input),doc=graph.docs.get(cold.root);
  assert(doc.dataNode(at+escape('multipart/form-data')+'/encoding/tag'));
  assert.equal(doc.dataNode(at+escape('application/json')+'/encoding'),undefined);
 });

 if(group==='owners')test('R3d1b4 unchanged mixed JSON examples retain external bytes and reference-looking literal values',async()=>{
  const {input,value,encode}=shared('3.2.1','json','3.1.2',{},['application/json','application/problem+json']);
  value.components.mediaTypes.Shared.schema={type:'object'};
  value.components.mediaTypes.Shared.examples={External:{$ref:'#/components/examples/External'},Literal:{$ref:'#/components/examples/Literal'}};
  value.components.examples={External:{externalValue:'payload.bin'},Literal:{value:{$ref:'literal.json',amount:'EXACT'}}};
  const bytes=Buffer.from('{"$ref":"literal.json","amount":9007199254740993.00}'),id=new URL('payload.bin',input.root).href;
  input.exampleResources=[{version:1,id,generation:9,aliases:[],state:'available',identity:require('node:crypto').createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64'),byteLength:bytes.length}];
  input.resources[0].text=encode(value);const {result,graph}=await review(input);
  assert.equal(result.exampleOutputs.length,1);assert.equal(result.exampleOutputs[0].base64,bytes.toString('base64'));
  assert(!graph.entryReferences().some(edge=>edge.value==='literal.json'));assert(result.outputs.some(output=>output.text.includes('9007199254740993.00')));
 });

 if(group==='media')for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const target of ['3.1.0','3.1.2','3.0.0','3.0.4'])
 test(`R3d1b4 ${version} ${format} ${target} chained form/JSON occurrences retain independent schemas and bytes`,async()=>{
  const {input}=shared(version,format,target),{result,cold,graph}=await review(input),doc=graph.docs.get(cold.root);
  assert.equal(doc.dataNode(at+escape('multipart/form-data')+'/schema').value.type,'object');
  const jsonSchema=terminal(graph,cold.root,at+escape('application/json')+'/schema','schema');
  assert.equal(graph.docs.get(jsonSchema.resource).dataNode(jsonSchema.pointer).value.type,'array');
  assert.equal(doc.dataNode(at+escape('application/json')+'/encoding'),undefined);
  for(const value of ['[]','[{"tag":"雪"}]','[{"other":"x"}]','[{"tag":1}]'])assert.equal(await valid(input,'application/json',value),await valid(cold,'application/json',value));
  assert.equal(await valid(input,'multipart/form-data',wire(),true),true);assert.equal(await valid(cold,'multipart/form-data',wire(),true),true);
  assert.deepEqual(await planMigration(input),result);
 });

 if(group==='media')for(const rule of [{}, {contentType:'application/json'}])for(const target of ['3.1.2','3.0.4'])
 test(`R3d1b4 ${target} compatible form/mixed ${JSON.stringify(rule)} keeps ordered unnamed parts`,async()=>{
  const {input}=shared('3.2.1','json',target,rule,['multipart/form-data','multipart/mixed']),{cold,graph}=await review(input);
  const mixed=at+escape('multipart/mixed'),schema=terminal(graph,cold.root,mixed+'/schema','schema');
  assert.equal(graph.docs.get(schema.resource).dataNode(schema.pointer).value.type,'array');assert.equal(graph.docs.get(cold.root).dataNode(mixed+'/encoding'),undefined);
  for(const value of ['[]','[{"tag":"x"}]','[{"tag":"x"},{"tag":"y"}]'])assert.equal(await valid(input,'multipart/mixed',value),await valid(cold,'multipart/mixed',value));
  const content=rule.contentType?'"雪"':'雪',type=rule.contentType??'text/plain; charset=utf-8';
  const bytes=Buffer.from('--Mixed\r\nContent-Disposition: form-data; name="tag"\r\nContent-Type: '+type+'\r\n\r\n'+content+'\r\n--Mixed--\r\n');
  assert.equal(await valid(input,'multipart/form-data',bytes,true),true);assert.equal(await valid(cold,'multipart/form-data',bytes,true),true);
 });

 if(group==='owners')for(const format of ['yaml','json'])test(`R3d1b4 ${format} cross-file identified children and mixed-family entries keep neutral identities`,async()=>{
  const {input,value,encode}=shared('3.2.0',format,'3.1.2'),media=value.components.mediaTypes.Shared;
  media.schema={type:'array',maxItems:3,items:{$ref:'children.json#/Part'}};
  media.itemEncoding.headers={'X-Mode':{$ref:'children.json#/Header'}};
  value.components.mediaTypes.Shared={$ref:'media.json#/Shared'};
  value.components.schemas.Value={$ref:'children.json#/Part/properties/tag'};
  value.components.headers={Independent:{$ref:'children.json#/Header'}};
  value.components.examples={Independent:{$ref:'children.json#/Example'}};
  value.paths['/parts'].post.responses={200:{description:'JSON',content:{'application/json':{$ref:'#/components/mediaTypes/Chain'}}}};
  input.resources[0].text=encode(value);
  input.resources.push({id:new URL('media.json',input.root).href,text:JSON.stringify({Shared:media}),generation:4},
   {id:new URL('children.json',input.root).href,text:JSON.stringify({Part:{$id:'https://example.test/part',$anchor:'part',...part},
    Header:{required:true,schema:{type:'string',enum:['keep']}},Example:{value:{$ref:'literal.json',amount:'EXACT'}}}).replace('"EXACT"','9007199254740993.00'),generation:5},
   {id:new URL('older.json',input.root).href,text:JSON.stringify({openapi:'3.1.2',info:{title:'Other family',version:'1'},paths:{},components:{schemas:{Part:{$ref:'children.json#/Part'}}}}),generation:3});
  const {result,cold,graph}=await review(input);
  const ids=[];for(const doc of graph.docs.values())for(const node of doc.nodes.values())if(node.pointer.endsWith('/$id'))ids.push(node.value);
  assert.equal(new Set(ids).size,ids.length);assert(ids.includes('https://example.test/part'));
  assert(result.outputs.some(output=>output.text.includes('9007199254740993.00')));
  assert(result.outputs.some(output=>output.text.includes('literal.json')));
  assert(!graph.entryReferences().some(edge=>edge.value==='literal.json'));
  const response='/paths/~1parts/post/responses/200/content/application~1json';assert(graph.docs.get(cold.root).dataNode(response+'/schema'));
 });

 if(group==='owners')test('R3d1b4 different form media parameters share neutral schemas without sharing the projected envelope',async()=>{
  const types=['multipart/form-data','Multipart/Form-Data; Charset="UTF-8"','multipart/form-data; charset=iso-8859-1; profile="latin"','application/json'];
  const {input}=shared('3.2.1','yaml','3.0.4',{contentType:'text/plain; charset=utf-8'},types),{cold,graph}=await review(input),doc=graph.docs.get(cold.root);
  assert.deepEqual([...doc.dataNode('/paths/~1parts/post/requestBody/content').children.keys()],types);
  const targets=types.slice(0,3).map(type=>terminal(graph,cold.root,at+escape(type)+'/schema/properties/tag/items/allOf/0','schema'));
  assert(targets.every(target=>JSON.stringify(target)===JSON.stringify(targets[0])));
  for(const type of types.slice(0,3))assert.equal(doc.dataNode(at+escape(type)+'/encoding/tag/contentType').value,'text/plain; charset=utf-8');
 });

 if(group==='multipart')test('R3d1b4 binary form bytes and inactive JSON values preserve independent transfer owners',async()=>{
  const {input,value,encode}=shared('3.2.1','yaml','3.1.2',{contentType:'application/octet-stream',headers:{'Content-Transfer-Encoding':{required:true,schema:{type:'string',enum:['base64']}}}});
  value.components.mediaTypes.Shared.schema.items={...part,properties:{tag:{type:'string',contentEncoding:'base64'}}};input.resources[0].text=encode(value);
  const {cold}=await review(input);assert.equal(await valid(input,'multipart/form-data',wire(true),true),true);assert.equal(await valid(cold,'multipart/form-data',wire(true),true),true);
  assert.equal(await valid(input,'application/json','[{"tag":"AP+ADQo="}]'),true);assert.equal(await valid(cold,'application/json','[{"tag":"AP+ADQo="}]'),true);
 });

 if(group==='downgrade')for(const type of ['multipart/mixed','multipart/mixed; charset=utf-8'])test(`R3d1b4 one active incompatible ${type} occurrence blocks every output`,async()=>{
  const {input}=shared('3.2.1','json','3.0.4',{contentType:'text/plain'},['multipart/form-data','application/json',type]),original=JSON.stringify(input),result=await planMigration(input);
  assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert.deepEqual(result.changes,[]);assert.equal(JSON.stringify(input),original);
  assert(result.problems.some(problem=>problem.reason==='target-representation'&&problem.pointer.includes(escape(type))),JSON.stringify(result.problems));
 });

 if(group==='downgrade')test('R3d1b4 empty positional rules cannot hide incompatible nested-array defaults',async()=>{
  const {input,value,encode}=shared('3.2.1','json','3.1.2',{},['multipart/mixed','application/json']);
  value.components.mediaTypes.Shared.schema={type:'array',items:{type:'array',items:{type:'string'}}};input.resources[0].text=encode(value);
  const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
  assert(result.problems.some(problem=>problem.reason==='target-representation'&&problem.pointer.includes('multipart~1mixed')),JSON.stringify(result.problems));
 });

 if(group==='downgrade')test('R3d1b4 active response form conversion retains the separately assigned proof boundary',async()=>{
  const {input,value,encode}=shared('3.2.1','json','3.1.2');value.paths['/parts'].post.responses={200:{description:'Active',content:{'multipart/form-data':{$ref:'#/components/mediaTypes/Shared'}}}};
  input.resources[0].text=encode(value);const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
  assert(result.problems.some(problem=>problem.reason==='unavailable-proof'&&problem.pointer.includes('/responses/200/')),JSON.stringify(result.problems));
 });

 if(group==='owners')test('R3d1b4 final occurrence proofs reject activating JSON rules or stealing a projected schema',async()=>{
  const {input}=shared('3.2.1','json','3.1.2'),{result,cold,graph:baseline}=await review(input),source=createGraph(input).graph;
  const {prepareNamedMultipart,proveMigrationPositionalEncoding}=require('./dist/migration_invariants.cjs');await prepareNamedMultipart([source],'3.1');
  const original='/components/mediaTypes/Shared/schema',neutral=terminal(baseline,cold.root,at+escape('application/json')+'/schema','schema');
  for(const mutation of ['encoding','schema']){
   const outputs=result.outputs.map(output=>{if(output.id!==result.outputRoot)return output;const value=JSON.parse(output.text),content=value.paths['/parts'].post.requestBody.content;
    content['application/json'][mutation]=content['multipart/form-data'][mutation];return {...output,text:JSON.stringify(value)};});
   const target=createGraph({root:result.outputRoot,resources:outputs}).graph,problems=[];
   proveMigrationPositionalEncoding(source,target,location=>[{resource:neutral.resource,
    pointer:location.pointer.startsWith(original)?neutral.pointer+location.pointer.slice(original.length):location.pointer}],
    (location,code,message,reason)=>problems.push({location,code,message,reason}));
   assert(problems.some(problem=>problem.code==='migration.invariant.media-context'),JSON.stringify(problems));
  }
 });

 if(group==='swagger')test('R3d1b4 positional form plus JSON does not authorize a Swagger array/body collapse',async()=>{
  const {input}=shared('3.2.1','json','2.0'),result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
  assert(result.problems.some(problem=>problem.reason==='target-representation'||problem.reason==='unavailable-proof'));
 });
};
