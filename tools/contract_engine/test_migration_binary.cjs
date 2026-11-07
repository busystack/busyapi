const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');
const {createGraph}=require('./dist/model.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {requestOperation}=require('./dist/execution.cjs');
const escape=value=>value.replaceAll('~','~0').replaceAll('/','~1');
const legacy=['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4'];
const modern=['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
const render=(value,format)=>format==='yaml'?'# Keep exact source 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)+'\r\n';
for(const format of ['yaml','json'])for(const variant of ['budget','resource','dialect','dynamic','invalid'])
test(`R3 ${format} ${variant} refuses the complete binary transaction without partial output`,async()=>{
 const root='file:///approved/api.'+format,schema=variant==='budget'?{type:'string',format:'binary',allOf:Array.from({length:2050},()=>({}))}:
  variant==='resource'?{$ref:'unavailable.json'}:variant==='dynamic'?{$dynamicRef:'#bytes'}:
  variant==='invalid'?{type:'made-up-type'}:{type:'string',contentEncoding:'base64'};
 const value={openapi:variant==='budget'?'3.0.4':'3.2.1',info:{title:'B04 refusal',version:'1'},paths:{'/bytes':{post:{requestBody:{content:{'application/octet-stream':{schema}}},responses:{204:{description:'Empty'}}}}}};
 if(variant==='dialect')value.jsonSchemaDialect='https://unavailable.invalid/schema';
 if(variant==='dynamic')value.components={schemas:{Bytes:{$dynamicAnchor:'bytes'},Peer:{$id:'peer',$dynamicAnchor:'bytes',type:'string'}}};
 const text=render(value,format),input={root,snapshot:'R3-'+variant,resources:[{id:root,text,generation:0}],targetVersion:variant==='budget'?'3.2.1':'3.0.4',destination:'file:///reviewed/'};
 const result=await planMigration(input);assert.equal(result.complete,false);assert.equal(result.status,'blocked');
 assert.deepEqual(result.outputs,[]);assert.deepEqual(result.changes,[]);assert.equal(input.resources[0].text,text);
 assert(result.problems.some(problem=>problem.resource===root&&problem.range[1]>problem.range[0]),JSON.stringify(result.problems));
 if(variant==='budget')assert(result.problems.some(problem=>problem.code.startsWith('limit.migration.binary')&&problem.reason==='unavailable-proof'),JSON.stringify(result.problems));
 if(variant==='invalid')assert(result.problems.some(problem=>problem.code.startsWith('migration.validation.')&&problem.reason==='source-incomplete'),JSON.stringify(result.problems));
});
function capture(version,format,type,schema,targetVersion){
 const root='file:///approved/contracts/api.'+format,media={schema};
 const document={openapi:version,info:{title:'Keep binary café',version:'business'},servers:[{url:'https://api.invalid'}],paths:{'/bytes':{post:{requestBody:{content:{[type]:media}},responses:{200:{description:'Reply',content:{[type]:media}}}}}},'x-literal':{format:'binary',contentEncoding:'base64',number:'EXACT'}};
 return {root,snapshot:'binary-migration',targetVersion,destination:'file:///reviewed/copy/',resources:[{id:root,text:render(document,format).replace(/"?EXACT"?/g,'9007199254740993.00'),generation:4}]};
}
function cold(result){return {root:result.outputRoot,snapshot:'cold',resources:result.outputs.map(value=>({id:value.id,text:value.text,generation:0}))};}
for(const format of ['yaml','json'])test(`R3 ${format} mixed entries prepare private secondary binary certificates`,async()=>{
 const type='application/octet-stream',input=capture('3.2.1',format,'application/json',{$ref:'secondary.'+format+'#/components/schemas/Independent'},'3.2.1');
 const secondary=capture('3.0.4',format,type,{type:'string',format:'binary',enum:['','discarded'],maxLength:0,pattern:'^$'},'3.2.1');
 const id='file:///approved/contracts/secondary.'+format,doc=new SourceDocument(secondary.resources[0].text,id);
 secondary.resources[0]={...secondary.resources[0],id,text:doc.set('/components',{schemas:{Independent:{type:'integer',enum:[0]}}})};
 input.resources.push(secondary.resources[0]);const original=input.resources.map(resource=>resource.text),result=await planMigration(input);
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.deepEqual(await planMigration(input),result);
 const output=cold(result),secondaryOutput=result.changes.find(change=>change.resource===id).destination;
 assert(result.entryRoutes.some(route=>route.resource===id&&route.from.family==='3.0'));
 for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128])]){
  const before=await bodyWire({...secondary,root:id,resources:input.resources},type,bytes);
  assert(before.every(value=>value.complete&&value.valid===(bytes.length===0)));
  assert.deepEqual(await bodyWire({...output,root:secondaryOutput},type,bytes),before);
 }
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
});
async function bodyWire(input,type,bytes,path='/bytes'){
 const {graph}=createGraph(input),operation=graph.operations().find(value=>value.path===path);
 const plan=requestOperation({...input,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
 const content=[plan.requestBody.content.find(value=>value.mediaType===type),plan.responses.find(value=>value.status==='200').content.find(value=>value.mediaType===type)];
 const checked=await evaluateSchemas({...input,runtimeInstances:content.map((value,index)=>({subject:index?'response-body':'request-body',location:type,text:bytes.toString('base64'),mediaBase64:true,mediaType:type,media:value.definition??value.source}))});
 assert.equal(checked.complete,true,JSON.stringify(checked.runtimeFindings));assert.equal(checked.runtimeEvaluations.length,2);
 return checked.runtimeEvaluations.map(value=>({complete:value.complete,valid:value.valid}));
}
for(const format of ['yaml','json'])test(`R3 ${format} R1 certificates survive R2 media selection and a second migration`,async()=>{
 const type='application/octet-stream',leaf={type:'string',format:'binary',enum:['','discarded'],maxLength:0,pattern:'^$'};
 const input=capture('3.0.4',format,type,{$ref:'#/components/schemas/Shared'},'3.2.1');
 const value=YAML.parse(input.resources[0].text),operation=value.paths['/bytes'].post;
 value.components={schemas:{Shared:leaf}};
 for(const content of [operation.requestBody.content,operation.responses[200].content])content['image/png']={schema:{$ref:'#/components/schemas/Shared'}};
 const content={'application/json':{schema:{$ref:'#/components/schemas/Shared'}}};
 value.paths['/data']={post:{requestBody:{content},responses:{200:{description:'JSON data',content}}}};
 input.resources[0].text=render(value,format);
 const first=await planMigration(input);assert.equal(first.complete,true,JSON.stringify(first.problems));
 const middle=cold(first),last=await planMigration({...middle,targetVersion:'2.0',destination:'file:///final/'});
 assert.equal(last.complete,true,JSON.stringify(last.problems));const final=cold(last);
 for(const media of [type,'image/png'])for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128])]){
  const before=await bodyWire(input,media,bytes);assert(before.every(value=>value.valid===(bytes.length===0)));
  assert.deepEqual(await bodyWire(middle,media,bytes),before);assert.deepEqual(await bodyWire(final,media,bytes),before);
 }
 for(const text of ['""','"discarded"','false']){
  const bytes=Buffer.from(text),before=await bodyWire(input,'application/json',bytes,'/data');
  assert(before.every(value=>value.valid===(text==='""')));
  assert.deepEqual(await bodyWire(middle,'application/json',bytes,'/data'),before);
  assert.deepEqual(await bodyWire(final,'application/json',bytes,'/data'),before);
 }
});

for(const from of ['3.0.4','3.1.2','3.2.1'])for(const target of ['2.0','3.0.4','3.1.2','3.2.1'])if(from!==target)
for(const format of ['yaml','json'])for(const type of ['application/octet-stream','text/plain','application/json'])
test(`R2 ${from} -> ${target} ${format} established encoded whole body ${type} preserves actual wire strings`,async()=>{
 const input=capture(from,format,type,{type:'string',...(from==='3.0.4'?{format:'byte'}:{contentEncoding:'base64'}),minLength:4,maxLength:8},target);
 const original=input.resources[0].text,result=await planMigration(input);
 assert.equal(result.complete,true,JSON.stringify(result.problems));const after=cold(result);
 for(const value of ['AP+A','', 'too-long-a-value']){
  const bytes=Buffer.from(type==='application/json'?JSON.stringify(value):value);
  const before=await bodyWire(input,type,bytes);assert.deepEqual(await bodyWire(after,type,bytes),before);
  assert(before.every(item=>item.valid===(value==='AP+A')));
 }
 if(type!=='application/json')assert.deepEqual(await bodyWire(after,type,Buffer.from([255,128])),await bodyWire(input,type,Buffer.from([255,128])));
 assert.equal(input.resources[0].text,original);
});

for(const version of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])for(const rejecting of [false,true])
test(`R2 ${version} ${format} raw whole-body content annotations stay inactive rejecting=${rejecting}`,async()=>{
 const type='application/octet-stream',leaf={...(rejecting?{type:'integer'}:{}),contentEncoding:'base64url',contentMediaType:'text/plain',contentSchema:{type:'integer'},minLength:100};
 const input=capture(version,format,type,leaf,'3.0.4'),result=await planMigration(input);
 assert.equal(result.complete,true,JSON.stringify(result.problems));const after=cold(result);
 for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128])]){
  assert.deepEqual(await bodyWire(after,type,bytes),await bodyWire(input,type,bytes));
  assert((await bodyWire(after,type,bytes)).every(value=>value.valid===!rejecting));
 }
});

for(const encoding of ['base64url','quoted-printable'])test(`R2 ${encoding} whole-body strings never acquire a false base64 label`,async()=>{
 const input=capture('3.2.1','yaml','application/octet-stream',{type:'string',contentEncoding:encoding},'3.0.4');
 const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
 assert(result.problems.some(problem=>problem.code==='migration.schema.contentEncoding'&&problem.reason==='target-representation'));
});

for(const targetVersion of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])test(`R2 Swagger ${format} inherited base64 whole-body media -> ${targetVersion}`,async()=>{
 const root='file:///approved/api.'+format,schema={type:'string',format:'byte',minLength:4,maxLength:8};
 const value={swagger:'2.0',info:{title:'Encoded body',version:'1'},host:'api.invalid',schemes:['https'],consumes:['application/octet-stream','application/json'],produces:['application/octet-stream','application/json'],paths:{'/bytes':{post:{parameters:[{$ref:'#/parameters/Body'}],responses:{200:{$ref:'#/responses/Encoded'}}}}},parameters:{Body:{name:'payload',in:'body',schema}},responses:{Encoded:{description:'Encoded response',schema}}};
 const text=render(value,format),input={root,snapshot:'R2-byte',resources:[{id:root,text,generation:2}],targetVersion,destination:'file:///reviewed/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));const after=cold(result);
 for(const type of value.consumes)for(const text of ['AP+A','','too-long-for-bounds']){
  const bytes=Buffer.from(type==='application/json'?JSON.stringify(text):text);
  assert.deepEqual(await bodyWire(after,type,bytes),await bodyWire(input,type,bytes));
 }
 assert.equal(input.resources[0].text,text);
});
function schema(input,type){return createGraph(input).graph.docs.get(input.root).dataNode('/paths/~1bytes/post/requestBody/content/'+escape(type)+'/schema').value;}
async function wire(input,type,bytes,form=false){
 const request='/paths/~1bytes/post/requestBody/content/'+escape(type),response='/paths/~1bytes/post/responses/200/content/'+escape(type);
 const checked=await evaluateSchemas({...input,runtimeInstances:['request-body','response-body'].map((subject,index)=>({subject,location:type,text:bytes.toString('base64'),mediaBase64:true,mediaType:type,media:{resource:input.root,pointer:index?response:request},...(form?{form:{resource:input.root,pointer:index?response:request}}:{})}))});
 assert.equal(checked.complete,true,JSON.stringify(checked.runtimeFindings));
 return checked.runtimeEvaluations.map(value=>({complete:value.complete,valid:value.valid}));
}
for(const from of legacy)for(const target of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])
test(`${from} -> ${target} ${format} raw body mapping retains exact non-Unicode and empty bytes`,async()=>{
 const type='application/octet-stream',input=capture(from,format,type,{type:'string',format:'binary',description:'Keep leaf'},target),before=input.resources[0].text;
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));assert.equal(plan.producerVersion,'93');
 const output=cold(plan);assert.deepEqual(schema(output,type),{description:'Keep leaf'});
 for(const bytes of [Buffer.from([0,255,128,195,169]),Buffer.alloc(0)]){
  assert.deepEqual(await wire(output,type,bytes),await wire(input,type,bytes));assert((await wire(output,type,bytes)).every(value=>value.valid));
 }
 assert(plan.outputs[0].text.includes('9007199254740993.00'));
 if(format==='yaml')assert(plan.outputs[0].text.startsWith('# Keep exact source 雪\r\n'));
 assert.equal(input.resources[0].text,before);
});

for(const from of legacy)for(const target of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])
test(`${from} -> ${target} ${format} byte mapping retains string bounds, nullability and data values`,async()=>{
 const type='application/json',input=capture(from,format,type,{type:'object',required:['bytes'],properties:{bytes:{type:'string',format:'byte',nullable:true,minLength:4,maxLength:8,pattern:'^[A-Za-z0-9+/=]+$'}}},target),before=input.resources[0].text;
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));const output=cold(plan),leaf=schema(output,type).properties.bytes;
 assert.equal(leaf.contentEncoding,'base64');assert.equal(leaf.contentMediaType,undefined);assert.equal(leaf.format,undefined);assert.deepEqual(leaf.type,['string','null']);
 for(const text of ['{"bytes":"AP/DqQ==","zero":0,"false":false,"empty":"","unicode":"雪😀"}','{"bytes":null}','{"bytes":""}','{"bytes":false}','{}'])
  assert.deepEqual(await wire(output,type,Buffer.from(text)),await wire(input,type,Buffer.from(text)),text);
 assert.equal(input.resources[0].text,before);
});

for(const from of legacy)for(const format of ['yaml','json'])for(const binary of [true,false])
test(`${from} ${format} named multipart ${binary?'raw':'base64'} mapping retains wire representation`,async()=>{
 const type='multipart/form-data; boundary=Fixture',input=capture(from,format,type,{type:'object',required:['payload'],properties:{payload:{type:'string',format:binary?'binary':'byte'}}},'3.2.1'),before=input.resources[0].text;
 const bytes=Buffer.concat([Buffer.from('--Fixture\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/octet-stream\r\n'+(binary?'':'Content-Transfer-Encoding: base64\r\n')+'\r\n'),binary?Buffer.from([0,255,128]):Buffer.from('AP+A'),Buffer.from('\r\n--Fixture--\r\n')]);
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));const output=cold(plan);
 assert.deepEqual(await wire(output,type,bytes,true),await wire(input,type,bytes,true));assert((await wire(output,type,bytes,true)).every(value=>value.valid));
 const leaf=schema(output,type).properties.payload;
 if(binary){assert.equal(leaf.type,undefined);assert.equal(leaf.format,undefined);}else{assert.equal(leaf.type,'string');assert.equal(leaf.contentEncoding,'base64');}
 assert.equal(input.resources[0].text,before);
});

for(const from of modern)for(const format of ['yaml','json'])for(const binary of [true,false])
test(`${from} -> 3.0.4 ${format} faithful ${binary?'raw':'encoded'} lowering retains values and media`,async()=>{
 const type=binary?'image/png':'application/json',leaf=binary?{contentMediaType:'image/png',description:'Keep raw'}:{type:'string',contentEncoding:'base64',minLength:4,maxLength:8},input=capture(from,format,type,leaf,'3.0.4'),before=input.resources[0].text;
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));const output=cold(plan),converted=schema(output,type);
 assert.equal(converted.type,'string');assert.equal(converted.format,binary?'binary':'byte');assert.equal(converted.contentEncoding,undefined);assert.equal(converted.contentMediaType,undefined);
 for(const bytes of binary?[Buffer.alloc(0),Buffer.from([0,255,128])]:[Buffer.from('"AP+A"'),Buffer.from('""'),Buffer.from('false')])
  assert.deepEqual(await wire(output,type,bytes),await wire(input,type,bytes));
 assert.equal(input.resources[0].text,before);
});

for(const format of ['yaml','json'])test(`${format} chained escaped cross-file raw references retain their physical owners`,async()=>{
 const type='application/octet-stream',input=capture('3.0.4',format,type,{$ref:'models.'+format+'#/Alias'},'3.2.1');
 input.resources.push({id:'file:///approved/contracts/models.'+format,generation:7,text:render({Alias:{$ref:'#/file~1~0'},'file/~':{type:'string',format:'binary'}},format)});
 const before=input.resources.map(value=>value.text),plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 const output=cold(plan);assert.equal(createGraph(output).graph.references.every(value=>value.resolution==='resolved'),true);
 assert.deepEqual(await wire(output,type,Buffer.from([0,255,128])),await wire(input,type,Buffer.from([0,255,128])));
 assert.deepEqual(input.resources.map(value=>value.text),before);
});

for(const format of ['yaml','json'])test(`${format} JSON binary-looking format retains its actual string model`,async()=>{
 const type='application/json',input=capture('3.0.4',format,type,{type:'string',format:'binary',maxLength:5},'3.2.1');
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));const output=cold(plan);
 assert.equal(schema(output,type).type,'string');
 for(const text of ['"café"','"雪😀"','false','null','"too long"'])assert.deepEqual(await wire(output,type,Buffer.from(text)),await wire(input,type,Buffer.from(text)));
});

for(const format of ['yaml','json'])for(const target of ['3.1.2','3.2.1'])for(const alias of [false,true])
test(`${format} ${target} mixed raw and JSON forwarding consumers retain independent owners alias=${alias}`,async()=>{
 const type='application/octet-stream',input=capture('3.0.4',format,type,{$ref:'models.'+format+'#/Alias'},target);
 const models='file:///approved/contracts/models.'+format,doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 const scheme={type:'string',format:'binary',description:'[Binary](./guide.md)','x-number':'EXACT'};
 const collision='_migrated_binary_use_'+createHash('sha256').update(JSON.stringify([input.root,models,'/Binary','raw'])).digest('hex').slice(0,24);
 doc.components={schemas:{[collision]:{type:'integer',description:'Unrelated collision'}}};
 for(const content of [doc.paths['/bytes'].post.requestBody.content,doc.paths['/bytes'].post.responses[200].content]){
  content[type].schema={$ref:'models.'+format+(alias?'#/Alias':'#/Binary')};
  content['application/json']={schema:{$ref:'models.'+format+'#/Binary'}};
 }
 doc['x-history']=structuredClone(scheme);
 input.resources[0].text=render(doc,format).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 input.resources.push({id:models,text:render({Alias:{$ref:'#/Binary'},Binary:scheme},format)
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00'),generation:8});
 const original=input.resources.map(resource=>resource.text),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.equal((await planMigration(input)).identity,review.identity);
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
 const output=cold(review),{graph}=createGraph(output);
 assert(graph.references.every(reference=>reference.resolution==='resolved'));
 const entry=graph.docs.get(output.root),names=[...entry.dataNode('/components/schemas').children.keys()];
 assert(names.includes(collision));assert(names.includes(collision+'_1'),'The common allocator retains an occupied native name');
 const delivered=review.changes.find(change=>change.resource===models).destination,neutral=graph.docs.get(delivered).dataNode('/Binary').value;
 assert.equal(neutral.type,'string');assert.equal(neutral.format,'binary');
 assert.equal(entry.dataNode('/components/schemas/'+collision).value.type,'integer');
 assert.equal(entry.dataJson('/x-history'),new SourceDocument(original[0],input.root).dataJson('/x-history'));
 assert(review.outputs.some(resource=>resource.text.includes('9007199254740993.00')));
 for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128,195,169])]){
  assert.deepEqual(await wire(output,type,bytes),await wire(input,type,bytes));
  assert((await wire(output,type,bytes)).every(value=>value.complete&&value.valid));
 }
 for(const text of ['"snow 雪"','false','null','{"bytes":0}'])
  assert.deepEqual(await wire(output,'application/json',Buffer.from(text)),await wire(input,'application/json',Buffer.from(text)));
});

for(const format of ['yaml','json'])for(const array of [false,true])
test(`${format} multipart raw ${array?'array items':'property'} and JSON consumers retain their separate schema models`,async()=>{
 const type='multipart/form-data; boundary=Shared',reference={$ref:'#/components/schemas/Binary'};
 const value=array?{type:'array',items:reference}:reference;
 const object={type:'object',required:['payload'],properties:{payload:value,count:{type:'integer'}}};
 const input=capture('3.0.4',format,type,object,'3.2.1'),doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 doc.components={schemas:{Binary:{type:'string',format:'binary',description:'[Payload](./payload.md)'}}};
 for(const content of [doc.paths['/bytes'].post.requestBody.content,doc.paths['/bytes'].post.responses[200].content]){
  content[type].encoding={payload:{contentType:'application/octet-stream'}};
  content['application/json']={schema:structuredClone(object)};
 }
 input.resources[0].text=render(doc,format);const original=input.resources[0].text;
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output=cold(review),{graph}=createGraph(output);
 assert.equal(graph.docs.get(output.root).dataNode('/components/schemas/Binary/type').value,'string');
 assert.equal(graph.docs.get(output.root).dataNode('/components/schemas/Binary/format').value,'binary');
 for(const invalid of [false,true]){
  const bytes=Buffer.concat([Buffer.from('--Shared\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/octet-stream\r\n\r\n'),
   Buffer.from([0,255,128]),Buffer.from('\r\n--Shared\r\nContent-Disposition: form-data; name="count"\r\n\r\n'+(invalid?'wrong':'7')+'\r\n--Shared--\r\n')]);
  const before=await wire(input,type,bytes,true),after=await wire(output,type,bytes,true);
  assert.deepEqual(after,before);assert(after.every(value=>value.complete&&value.valid===!invalid));
 }
 for(const payload of [array?['snow 雪']:'snow 雪',array?[false]:false]){
  const bytes=Buffer.from(JSON.stringify({payload,count:7}));
  assert.deepEqual(await wire(output,'application/json',bytes),await wire(input,'application/json',bytes));
 }
 assert.equal(input.resources[0].text,original);
});

for(const format of ['yaml','json'])for(const target of ['3.1.2','3.2.1'])for(const multipart of [false,true])
test(`${format} ${target} data references to an inline raw ${multipart?'part':'body'} retain neutral string assertions`,async()=>{
 const type=multipart?'multipart/form-data; boundary=Neutral':'application/octet-stream',leaf={type:'string',format:'binary',description:'Keep inline'};
 const input=capture('3.0.4',format,type,multipart?{type:'object',required:['payload'],properties:{payload:leaf}}:leaf,target);
 const doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 for(const [content,pointer]of [
  [doc.paths['/bytes'].post.requestBody.content,'/paths/~1bytes/post/requestBody/content/'],
  [doc.paths['/bytes'].post.responses[200].content,'/paths/~1bytes/post/responses/200/content/']]){
  content['application/json']={schema:{$ref:'#'+pointer+escape(type)+'/schema'+(multipart?'/properties/payload':'')}};
  if(multipart)content[type].encoding={payload:{contentType:'application/octet-stream'}};
 }
 input.resources[0].text=render(doc,format);const original=input.resources[0].text;
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));const output=cold(review);
 for(const text of ['"snow 雪"','false','null'])assert.deepEqual(await wire(output,'application/json',Buffer.from(text)),await wire(input,'application/json',Buffer.from(text)));
 let bytes=Buffer.from([0,255,128]);
 if(multipart)bytes=Buffer.concat([Buffer.from('--Neutral\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/octet-stream\r\n\r\n'),bytes,Buffer.from('\r\n--Neutral--\r\n')]);
 const before=await wire(input,type,bytes,multipart),after=await wire(output,type,bytes,multipart);
 assert.deepEqual(after,before);assert(after.every(value=>value.complete&&value.valid));assert.equal(input.resources[0].text,original);
});

for(const format of ['yaml','json'])for(const mode of ['opaque','unbound'])
test(`${format} incomplete ${mode} binary mapping retains a located refusal without output`,async()=>{
 const type=mode==='opaque'?'application/unknown-binary':'application/octet-stream';
 let leaf={type:'string',format:'binary'};
 const input=capture('3.0.4',format,type,leaf,'3.2.1');
 if(mode==='unbound'){
  const doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
  doc.components={schemas:{Shared:{type:'string',format:'binary'}}};
  doc.paths={};
  input.resources[0].text=render(doc,format);
 }
 const before=input.resources[0].text,plan=await planMigration(input);assert.equal(plan.status,'blocked');assert.equal(plan.complete,false);assert.deepEqual(plan.outputs,[]);assert.deepEqual(plan.changes,[]);
 const issue=plan.problems.find(value=>value.code==='migration.schema.binary-context');assert(issue,JSON.stringify(plan.problems));assert.equal(issue.reason,'unavailable-proof');assert.equal(issue.resource,input.root);assert(issue.range[1]>issue.range[0]);
 assert.equal(input.resources[0].text,before);
});


for(const targetVersion of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])
test(`Swagger 2.0 -> ${targetVersion} ${format} opaque file response composes through native 3.0 binary mapping`,async()=>{
 const root='file:///approved/api.'+format,type='application/octet-stream';
 const document={swagger:'2.0',info:{title:'File',version:'business'},host:'api.invalid',schemes:['https'],produces:[type],paths:{'/file':{get:{responses:{200:{description:'Reply',schema:{type:'file'}}}}}}};
 const input={root,snapshot:'swagger-file',targetVersion,destination:'file:///reviewed/',resources:[{id:root,text:render(document,format),generation:1}]};
 const before=input.resources[0].text,plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 for(const [capture,pointer]of [[input,'/paths/~1file/get/responses/200'],[cold(plan),'/paths/~1file/get/responses/200/content/'+escape(type)]]){
  for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128])]){
   const checked=await evaluateSchemas({...capture,runtimeInstances:[{subject:'response-body',location:type,mediaType:type,mediaBase64:true,text:bytes.toString('base64'),media:{resource:capture.root,pointer}}]});
   assert.equal(checked.complete,true,JSON.stringify(checked.runtimeFindings));assert(checked.runtimeEvaluations.every(value=>value.complete&&value.valid));
  }
 }
 assert.equal(input.resources[0].text,before);
});

for(const format of ['yaml','json'])
test(`${format} an active nested decoded media annotation keeps its binding refusal`,async()=>{
 const type='application/json',leaf={type:'object',properties:{data:{type:'string',contentEncoding:'base64',contentMediaType:'image/png'}}};
 const input=capture('3.1.2',format,type,leaf,'3.0.4'),before=input.resources[0].text,plan=await planMigration(input);
 assert.equal(plan.complete,false);assert.equal(plan.status,'blocked');assert.deepEqual(plan.outputs,[]);
 assert(plan.problems.some(value=>value.code==='migration.schema.binary-context'&&value.reason==='unavailable-proof'),JSON.stringify(plan.problems));
 assert.equal(input.resources[0].text,before);
});

for(const format of ['yaml','json'])test(`${format} raw constraints in another allOf branch retain byte counts`,async()=>{
 const type='application/octet-stream',input=capture('3.0.4',format,type,{allOf:[{type:'string',format:'binary'},{type:'string',minLength:1,maxLength:3}]},'3.2.1');
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 for(const bytes of [Buffer.alloc(0),Buffer.from([0]),Buffer.from([0,255,128]),Buffer.from([0,255,128,255])])
  assert.deepEqual(await wire(cold(plan),type,bytes),await wire(input,type,bytes));
});

for(const format of ['yaml','json'])for(const target of ['3.1.2','3.2.1'])for(const composition of [false,true])
test(`${format} ${target} shared containing multipart schemas preserve independent JSON and nested consumers composition=${composition}`,async()=>{
 const type='multipart/form-data; boundary=Container',models='file:///approved/contracts/models.'+format;
 const input=capture('3.0.4',format,type,{$ref:'models.'+format+'#/Alias'},target);
 const doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 const binary={$ref:'#/Binary'},container={type:'object',required:['payload','count'],properties:{payload:binary,count:{type:'integer'},nested:{type:'object',properties:{value:binary}},next:{$ref:'#/Shared'}}};
 const shared=composition?{allOf:[container,{description:'Keep composed annotation',properties:{count:{minimum:1}}}]}:container;
 for(const content of [doc.paths['/bytes'].post.requestBody.content,doc.paths['/bytes'].post.responses[200].content]){
  content[type].encoding={payload:{contentType:'application/octet-stream'}};
  content['application/json']={schema:{$ref:'models.'+format+'#/Shared'}};
 }
 doc['x-history']=structuredClone(shared);
 input.resources[0].text=render(doc,format);
 input.resources.push({id:models,generation:8,text:render({Alias:{$ref:'#/Shared'},Shared:shared,
  Binary:{type:'string',format:'binary',description:'[Wire](./wire.md)','x-exact':'EXACT'}},format)
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00')});
 const original=input.resources.map(resource=>resource.text),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));assert.equal(review.identity,(await planMigration(input)).identity);
 const output=cold(review),{graph}=createGraph(output);
 assert(graph.references.every(reference=>reference.resolution==='resolved'));
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
 assert.equal(graph.docs.get(output.root).dataJson('/x-history'),new SourceDocument(original[0],input.root).dataJson('/x-history'));
 for(const count of ['3','wrong']){
  const bytes=Buffer.concat([Buffer.from('--Container\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/octet-stream\r\n\r\n'),
   Buffer.from([0,255,128]),Buffer.from('\r\n--Container\r\nContent-Disposition: form-data; name="count"\r\n\r\n'+count+'\r\n--Container--\r\n')]);
  const before=await wire(input,type,bytes,true),after=await wire(output,type,bytes,true);
  assert.deepEqual(after,before);assert(after.every(value=>value.complete&&value.valid===(count==='3')));
 }
 for(const value of [{payload:'snow 雪',count:3,nested:{value:'data'}},{payload:false,count:3},{payload:'x',count:3,nested:{value:false}},{payload:'x',count:3,next:{payload:'nested',count:2,next:{payload:'deep',count:1}}},{payload:'x',count:3,next:{payload:false,count:2}}])
  assert.deepEqual(await wire(output,'application/json',Buffer.from(JSON.stringify(value))),await wire(input,'application/json',Buffer.from(JSON.stringify(value))));
 assert(review.outputs.some(resource=>resource.text.includes('9007199254740993.00')));
});

for(const format of ['yaml','json'])for(const target of ['3.1.2','3.2.1'])for(const descendant of [false,true])
test(`${format} ${target} composed JSON consumers target an inline raw ${descendant?'descendant':'root'} independently`,async()=>{
 const type=descendant?'multipart/form-data; boundary=Target':'application/octet-stream',leaf={type:'string',format:'binary',description:'Keep target'};
 const input=capture('3.0.4',format,type,descendant?{type:'object',required:['payload'],properties:{payload:leaf}}:leaf,target);
 const doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 for(const [content,pointer]of [
  [doc.paths['/bytes'].post.requestBody.content,'/paths/~1bytes/post/requestBody/content/'],
  [doc.paths['/bytes'].post.responses[200].content,'/paths/~1bytes/post/responses/200/content/']]){
  content['application/json']={schema:{allOf:[{$ref:'#'+pointer+escape(type)+'/schema'+(descendant?'/properties/payload':'')}]}};
  if(descendant)content[type].encoding={payload:{contentType:'application/octet-stream'}};
 }
 input.resources[0].text=render(doc,format);const original=input.resources[0].text,review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));const output=cold(review),{graph}=createGraph(output);
 assert(graph.references.every(reference=>reference.resolution==='resolved'));
 for(const text of ['"snow 雪"','false','null'])assert.deepEqual(await wire(output,'application/json',Buffer.from(text)),await wire(input,'application/json',Buffer.from(text)));
 let bytes=Buffer.from([0,255,128]);
 if(descendant)bytes=Buffer.concat([Buffer.from('--Target\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/octet-stream\r\n\r\n'),bytes,Buffer.from('\r\n--Target--\r\n')]);
 const after=await wire(output,type,bytes,descendant);assert.deepEqual(after,await wire(input,type,bytes,descendant));assert(after.every(value=>value.valid));
 assert.equal(input.resources[0].text,original);
});

for(const from of legacy)for(const target of modern)for(const format of ['yaml','json'])
for(const leaf of [
 {type:'string',format:'binary',minLength:1,maxLength:3},
 {type:'string',format:'binary',nullable:true,minLength:0,maxLength:0},
 {type:'string',format:'binary',enum:['']},
 {type:'string',format:'binary',enum:[false,null,9007199254740992]},
 {type:'string',format:'binary',pattern:'^[\\s\\S]*$',maxLength:3},
 {type:'string',format:'binary',pattern:'^[\\s\\S]{1,3}(?![\\s\\S])'},
 {anyOf:[{type:'string',format:'binary',maxLength:1},{type:'string',maxLength:3}]},
 {oneOf:[{type:'string',format:'binary',maxLength:3},{type:'string',maxLength:1}]},
 {type:'string',format:'binary',not:{type:'string',maxLength:1}},
])test(`${from} -> ${target} ${format} constrained raw ${JSON.stringify(leaf)}`,async()=>{
 const type='application/octet-stream',input=capture(from,format,type,leaf,target),original=input.resources[0].text;
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 for(const bytes of [Buffer.alloc(0),Buffer.from([255]),Buffer.from([0,255]),Buffer.from([0,255,128]),Buffer.from([0,255,128,0])])
  assert.deepEqual(await wire(cold(plan),type,bytes),await wire(input,type,bytes));
 assert.equal(input.resources[0].text,original);
});

for(const target of modern)for(const format of ['yaml','json'])for(const composed of [false,true,'union'])
test(`${target} ${format} shared constrained raw and JSON occurrences composed=${composed}`,async()=>{
 const type='application/octet-stream',input=capture('3.0.4',format,type,{$ref:'#/components/schemas/Shared'},target);
 const doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 const model={type:'string',format:'binary',nullable:true,minLength:1,maxLength:3};
 doc.components={schemas:{Shared:composed==='union'?{anyOf:[model,{type:'object',required:['value'],properties:{value:{type:'integer'}}}]}:composed?{allOf:[model,{type:'string'}]}:model}};
 for(const content of [doc.paths['/bytes'].post.requestBody.content,doc.paths['/bytes'].post.responses[200].content])
  content['application/json']={schema:{$ref:'#/components/schemas/Shared'}};
 input.resources[0].text=render(doc,format);const original=input.resources[0].text,plan=await planMigration(input);
 assert.equal(plan.complete,true,JSON.stringify(plan.problems));const output=cold(plan);
 for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128]),Buffer.from([0,255,128,255])])
  assert.deepEqual(await wire(output,type,bytes),await wire(input,type,bytes));
 for(const text of ['null','false','""','"雪"','"long string"','{}','{"value":2}','{"value":"wrong"}'])
  assert.deepEqual(await wire(output,'application/json',Buffer.from(text)),await wire(input,'application/json',Buffer.from(text)));
 assert.equal(input.resources[0].text,original);
});

for(const from of modern)for(const target of ['3.0.4','2.0'])for(const format of ['yaml','json'])
test(`${from} -> ${target} ${format} raw JSON types remain rejecting and inactive string assertions stay inactive`,async()=>{
 for(const leaf of [{type:'string',minLength:1},{type:['string','null']},{enum:['',null,false]},
  {contentMediaType:'image/png',minLength:100,pattern:'never',maxLength:3}]){
  const type='application/octet-stream',input=capture(from,format,type,leaf,target),plan=await planMigration(input);
  assert.equal(plan.complete,true,JSON.stringify(plan.problems));
  const output=cold(plan);
  for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128]),Buffer.from([0,255,128,255])]){
   const before=await wire(input,type,bytes);
   if(target==='2.0'){
    const result=await evaluateSchemas({...output,runtimeInstances:['request-body','response-body'].map(subject=>({subject,location:type,mediaType:type,mediaBase64:true,text:bytes.toString('base64'),schema:{resource:output.root,pointer:subject==='request-body'?'/paths/~1bytes/post/parameters/0/schema':'/paths/~1bytes/post/responses/200/schema'}}))});
    assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));
    assert.deepEqual(result.runtimeEvaluations.map(value=>({complete:value.complete,valid:value.valid})),before);
   }else assert.deepEqual(await wire(output,type,bytes),before);
  }
 }
});

for(const format of ['yaml','json'])for(const constraint of [{pattern:'^PNG'},{enum:['abc']},{enum:['\u0000\u00ff']}])
test(`${format} nontransferable raw ${JSON.stringify(constraint)} keeps a precise constraint blocker`,async()=>{
 const input=capture('3.0.4',format,'application/octet-stream',{type:'string',format:'binary',...constraint},'3.2.1');
 const plan=await planMigration(input);assert.equal(plan.complete,false);assert.deepEqual(plan.outputs,[]);
 assert(plan.problems.some(value=>value.code==='migration.schema.binary-constraint'&&value.reason==='target-representation'),JSON.stringify(plan.problems));
});

for(const from of ['3.0.4','3.1.2','3.2.1'])for(const target of ['3.0.4','3.1.2','3.2.1'])
if(from!==target)for(const format of ['yaml','json'])test(`${from} -> ${target} ${format} encoded opaque MIME part retains encoded-text constraints and exact bytes`,async()=>{
 const type='multipart/form-data; boundary=Encoded',input=capture(from,format,type,
  {type:'object',required:['payload'],properties:{payload:{type:'string',...(from==='3.0.4'?{format:'byte'}:{contentEncoding:'base64'}),minLength:4,maxLength:4}}},target);
 const doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 for(const content of [doc.paths['/bytes'].post.requestBody.content,doc.paths['/bytes'].post.responses[200].content])
  content[type].encoding={payload:{contentType:'application/octet-stream'}};
 input.resources[0].text=render(doc,format);const plan=await planMigration(input);
 assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 for(const payload of ['AP+A','','AP+AAA==']){
  const bytes=Buffer.from('--Encoded\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: base64\r\n\r\n'+payload+'\r\n--Encoded--\r\n');
  assert.deepEqual(await wire(cold(plan),type,bytes,true),await wire(input,type,bytes,true));
 }
});

for(const from of modern)for(const format of ['yaml','json'])test(`${from} ${format} coexisting format and base64 annotations retain separate conjuncts`,async()=>{
 const input=capture(from,format,'application/json',{type:'string',format:'uuid',contentEncoding:'base64',minLength:1},'3.0.4');
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 const output=cold(plan);assert.equal(schema(output,'application/json').format,'byte');
 assert.equal(schema(output,'application/json').allOf[0].format,'uuid');
 for(const payload of ['"AP+A"','"literal text"','""','false'])
  assert.deepEqual(await wire(output,'application/json',Buffer.from(payload)),await wire(input,'application/json',Buffer.from(payload)));
});

for(const from of modern)for(const format of ['yaml','json'])for(const dynamic of [false,true])
test(`${from} ${format} modern shared raw predicates and JSON strings retain independent fixed ${dynamic?'dynamic':'static'} references`,async()=>{
 const type='application/octet-stream',input=capture(from,format,type,{[dynamic?'$dynamicRef':'$ref']:'#/components/schemas/Shared'},'3.0.4');
 const doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 doc.components={schemas:{Shared:{type:'string',minLength:1,maxLength:3}}};
 for(const content of [doc.paths['/bytes'].post.requestBody.content,doc.paths['/bytes'].post.responses[200].content])
  content['application/json']={schema:{$ref:'#/components/schemas/Shared'}};
 input.resources[0].text=render(doc,format);const plan=await planMigration(input);
 assert.equal(plan.complete,true,JSON.stringify(plan.problems));const output=cold(plan);
 for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128])]){
  assert.deepEqual(await wire(output,type,bytes),await wire(input,type,bytes));
  assert((await wire(output,type,bytes)).every(value=>!value.valid));
 }
 for(const text of ['""','"雪"','"too long"','false'])
  assert.deepEqual(await wire(output,'application/json',Buffer.from(text)),await wire(input,'application/json',Buffer.from(text)));
});

for(const from of modern)for(const format of ['yaml','json'])test(`${from} ${format} raw conditional predicates lower in the projected octet domain`,async()=>{
 const type='application/octet-stream',input=capture(from,format,type,
  {if:{type:'string'},then:{maxLength:0},else:{maxLength:3}},'3.0.4');
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128]),Buffer.from([0,255,128,0])])
  assert.deepEqual(await wire(cold(plan),type,bytes),await wire(input,type,bytes));
});

function r1LiteralCapture(version,format,target,{array=false,composition=false,impossible=false,constant=false,untyped=false}={}){
 const type='multipart/form-data; boundary=Literal',input=capture(version,format,type,{$ref:'#/components/schemas/Box'},target);
 const doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text),models='file:///approved/contracts/literal-model.'+format;
 const literal={payload:array?['','']:'',exact:'EXACT',flag:false,meta:{type:'literal type',$ref:'literal.json',values:[null,1.25,'雪']}};
 const object={type:'object',required:['payload','exact','flag','meta'],properties:{payload:array?{type:'array',items:{$ref:'#/Binary'}}:{$ref:'#/Binary'},exact:{type:'integer'},flag:{type:'boolean'},meta:{type:'object'}}};
 const constraint=constant?{const:literal}:{enum:[literal]};
 const box=composition?{allOf:[object,constraint]}:{...object,...constraint};
 doc.components={schemas:{Box:{$ref:'literal-alias.'+format+'#/Box'}}};doc['x-history']=literal;
 for(const content of [doc.paths['/bytes'].post.requestBody.content,doc.paths['/bytes'].post.responses[200].content]){
  content[type].encoding={payload:{contentType:'application/octet-stream'},exact:{contentType:'text/plain'},flag:{contentType:'text/plain'},meta:{contentType:'application/json'}};
  content['application/json']={schema:{$ref:'#/components/schemas/Box'}};
 }
 const binary=version.startsWith('3.0.')&&!untyped?{type:'string',format:'binary',...(impossible?{minLength:1}:{})}:{};
 const encode=value=>render(value,format).replace(/"?EXACT"?/g,'9007199254740993.00');
 input.resources[0].text=encode(doc);
 input.resources.push({id:models,aliases:['file:///approved/contracts/literal-alias.'+format],text:encode({Box:box,Binary:binary,'x-literal':literal}),generation:12});
 return {input,type,array};
}
function r1LiteralWire(bytes,{array=false,number='9007199254740993.00',flag='false',extra=false}={}){
 const part=(name,type,bytes)=>Buffer.concat([Buffer.from('--Literal\r\nContent-Disposition: form-data; name="'+name+'"\r\nContent-Type: '+type+'\r\n\r\n'),Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes),Buffer.from('\r\n')]);
 return Buffer.concat([part('payload','application/octet-stream',bytes),...(array?[part('payload','application/octet-stream',bytes)]:[]),
  part('exact','text/plain',number),part('flag','text/plain',flag),part('meta','application/json','{"type":"literal type","$ref":"literal.json","values":[null,1.25,"雪"]}'),
  ...(extra?[part('extra','text/plain','unrelated')]:[]),Buffer.from('--Literal--\r\n')]);
}
for(const version of legacy)for(const target of modern)for(const format of ['yaml','json'])for(const array of [false,true])
test(`R1 ${version} -> ${target} ${format} containing ${array?'array-item':'property'} equality retains independent exact JSON literals`,async()=>{
 const {input,type}=r1LiteralCapture(version,format,target,{array,composition:array}),original=input.resources.map(resource=>resource.text);
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));assert.equal(plan.identity,(await planMigration(input)).identity);
 const output=cold(plan),graph=createGraph(output).graph;assert(graph.references.every(reference=>reference.resolution==='resolved'));
 assert.equal(graph.docs.get(output.root).dataJson('/x-history'),new SourceDocument(original[0],input.root).dataJson('/x-history'));
 for(const [bytes,options,valid]of [[Buffer.alloc(0),{},true],[Buffer.from([0,255,128]),{},false],
  [Buffer.alloc(0),{number:'9007199254740992'},false],[Buffer.alloc(0),{flag:'true'},false],[Buffer.alloc(0),{extra:true},false]]){
  const payload=r1LiteralWire(bytes,{array,...options}),before=await wire(input,type,payload,true),after=await wire(output,type,payload,true);
  assert.deepEqual(after,before);assert(after.every(value=>value.valid===valid));
 }
 const json='{"payload":'+(array?'["",""]':'""')+',"exact":9007199254740993.00,"flag":false,"meta":{"type":"literal type","$ref":"literal.json","values":[null,1.25,"雪"]}}';
 for(const text of [json,json.replace('9007199254740993.00','9007199254740992'),json.replace('"flag":false','"flag":true')])
  assert.deepEqual(await wire(output,'application/json',Buffer.from(text)),await wire(input,'application/json',Buffer.from(text)));
 assert(output.resources.some(resource=>resource.text.includes('9007199254740993.00')));
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
});
for(const format of ['yaml','json'])for(const composition of [false,true])test(`R1 ${format} an inherited leaf assertion makes a containing literal impossible composition=${composition}`,async()=>{
 const {input,type}=r1LiteralCapture('3.0.4',format,'3.2.1',{composition,impossible:true});
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128])]){
  const before=await wire(input,type,r1LiteralWire(bytes),true),after=await wire(cold(plan),type,r1LiteralWire(bytes),true);
  assert.deepEqual(after,before);assert(after.every(value=>!value.valid));
 }
});
for(const version of modern)for(const format of ['yaml','json'])test(`R1 ${version} ${format} a containing const never equates raw bytes with its JSON string member`,async()=>{
 const {input,type}=r1LiteralCapture(version,format,'3.0.4',{constant:true});
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));const output=cold(plan);
 for(const bytes of [Buffer.alloc(0),Buffer.from([255])]){
  const before=await wire(input,type,r1LiteralWire(bytes),true),after=await wire(output,type,r1LiteralWire(bytes),true);
  assert.deepEqual(after,before);assert(after.every(value=>!value.valid));
 }
 const text='{"payload":"","exact":9007199254740993.00,"flag":false,"meta":{"type":"literal type","$ref":"literal.json","values":[null,1.25,"雪"]}}';
 assert.deepEqual(await wire(output,'application/json',Buffer.from(text)),await wire(input,'application/json',Buffer.from(text)));
});
for(const version of legacy)for(const target of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])
for(const schema of [
 {type:'string',format:'binary',maxLength:0,pattern:'^$'},
 {type:'string',format:'binary',enum:['','PNG'],maxLength:0,pattern:'^$'},
 {allOf:[{type:'string',format:'binary',minLength:3},{maxLength:1,pattern:'^PNG'}]},
 {allOf:[{type:'string',format:'binary',enum:['','PNG']},{not:{enum:['PNG']}}]},
 {type:'string',format:'binary',enum:['','a'],oneOf:[{pattern:'^$'},{pattern:'^a$'}],maxLength:0},
 {type:'string',format:'binary',pattern:'(?!)'},
 {type:'string',format:'binary',pattern:'.*'},
])test(`R1 ${version} -> ${target} ${format} complete raw constraint certificate ${JSON.stringify(schema)}`,async()=>{
 const type='application/octet-stream',input=capture(version,format,type,schema,target),original=input.resources[0].text;
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 for(const bytes of [Buffer.alloc(0),Buffer.from('a'),Buffer.from('PNG'),Buffer.from([0,255,128]),Buffer.from('\r\n')])
  assert.deepEqual(await wire(cold(plan),type,bytes),await wire(input,type,bytes));
 assert.equal(input.resources[0].text,original);
});
for(const format of ['yaml','json'])test(`R1 ${format} an exhaustive one-octet language is length-equivalent; a proper subset stays blocked`,async()=>{
 const type='application/octet-stream',language=['',...Array.from({length:256},(_,value)=>String.fromCharCode(value))];
 const input=capture('3.0.4',format,type,{type:'string',format:'binary',enum:language},'3.2.1'),plan=await planMigration(input);
 assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 for(const bytes of [Buffer.alloc(0),Buffer.from([0]),Buffer.from([255]),Buffer.from([0,255])])
  assert.deepEqual(await wire(cold(plan),type,bytes),await wire(input,type,bytes));
 const refused=await planMigration(capture('3.0.4',format,type,{type:'string',format:'binary',enum:language.slice(0,-1)},'3.2.1'));
 assert.equal(refused.complete,false);assert.deepEqual(refused.outputs,[]);
});
for(const format of ['yaml','json'])test(`R1 ${format} rejected containing nonempty byte equality retains its exact source`,async()=>{
 const {input}=r1LiteralCapture('3.0.4',format,'3.2.1'),original=input.resources.map(resource=>resource.text);
 input.resources[1].text=input.resources[1].text.replaceAll(format==='json'?'"payload":""':'payload: \'\'',format==='json'?'"payload":"PNG"':"payload: PNG");
 const captured=input.resources.map(resource=>resource.text),plan=await planMigration(input);
 assert.equal(plan.complete,false,JSON.stringify(plan.problems));assert.deepEqual(plan.outputs,[]);assert.deepEqual(plan.changes,[]);
 assert(plan.problems.some(problem=>problem.code==='migration.schema.binary-literal'&&problem.reason==='unavailable-proof'&&problem.range[1]>problem.range[0]));
 assert.deepEqual(input.resources.map(resource=>resource.text),captured);assert.notDeepEqual(captured,original);
});
for(const version of modern)for(const format of ['yaml','json'])test(`R1 ${version} ${format} a raw containing-const predicate preserves conditional applicability`,async()=>{
 const type='multipart/form-data; boundary=Conditional';
 const model={type:'object',properties:{payload:{}},if:{const:{payload:''}},then:{required:['impossible']},else:{required:['payload']}};
 const input=capture(version,format,type,{$ref:'#/components/schemas/Box'},'3.0.4'),doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 doc.components={schemas:{Box:model}};
 for(const content of [doc.paths['/bytes'].post.requestBody.content,doc.paths['/bytes'].post.responses[200].content]){
  content[type].encoding={payload:{contentType:'application/octet-stream'}};
  content['application/json']={schema:{$ref:'#/components/schemas/Box'}};
 }
 input.resources[0].text=render(doc,format);const plan=await planMigration(input);
 assert.equal(plan.complete,true,JSON.stringify(plan.problems));const output=cold(plan);
 for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128])]){
  const payload=Buffer.concat([Buffer.from('--Conditional\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/octet-stream\r\n\r\n'),bytes,Buffer.from('\r\n--Conditional--\r\n')]);
  assert.deepEqual(await wire(output,type,payload,true),await wire(input,type,payload,true));
 }
 for(const text of ['{"payload":""}','{"payload":"x"}','{}','{"payload":"","impossible":true}'])
  assert.deepEqual(await wire(output,'application/json',Buffer.from(text)),await wire(input,'application/json',Buffer.from(text)));
});
for(const format of ['yaml','json'])test(`R1 ${format} exact contradictory bounds retain their original lexemes`,async()=>{
 const type='application/octet-stream',input=capture('3.0.4',format,type,{type:'string',format:'binary',minLength:'LOWER',maxLength:0},'3.2.1');
 input.resources[0].text=input.resources[0].text.replace(/"?LOWER"?/g,'1e10000');
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));assert(plan.outputs.some(output=>output.text.includes('1e10000')));
 for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128])])assert.deepEqual(await wire(cold(plan),type,bytes),await wire(input,type,bytes));
});
for(const format of ['yaml','json'])test(`R1 ${format} independently referenced predicates keep their JSON meaning beside a raw length intersection`,async()=>{
 const type='application/octet-stream',input=capture('3.0.4',format,type,{$ref:'predicate-alias.'+format+'#/Binary'},'3.2.1');
 const root=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 for(const content of [root.paths['/bytes'].post.requestBody.content,root.paths['/bytes'].post.responses[200].content])
  content['application/json']={schema:{$ref:'predicate-alias.'+format+'#/Predicate'}};
 input.resources[0].text=render(root,format);
 input.resources.push({id:'file:///approved/contracts/predicate.'+format,aliases:['file:///approved/contracts/predicate-alias.'+format],generation:19,
  text:render({Binary:{allOf:[{$ref:'#/Bounds'},{$ref:'#/Predicate'}]},Bounds:{type:'string',format:'binary',maxLength:0},Predicate:{pattern:'^$'}},format)});
 const original=input.resources.map(resource=>resource.text),plan=await planMigration(input);
 assert.equal(plan.complete,true,JSON.stringify(plan.problems));const output=cold(plan);
 for(const bytes of [Buffer.alloc(0),Buffer.from('\n'),Buffer.from([0,255,128])])
  assert.deepEqual(await wire(output,type,bytes),await wire(input,type,bytes));
 for(const text of ['""','"\\n"','"PNG"','false'])
  assert.deepEqual(await wire(output,'application/json',Buffer.from(text)),await wire(input,'application/json',Buffer.from(text)));
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
});
for(const format of ['yaml','json'])test(`R1 ${format} finite raw equivalence preserves successful branch metadata`,async()=>{
 const {evaluateMigrationAnnotations}=require('./dist/migration_annotations.cjs');
 const type='application/octet-stream',input=capture('3.0.4',format,type,{type:'string',format:'binary',enum:['','a'],maxLength:0,
  description:'Root metadata',default:'',oneOf:[{pattern:'^$',description:'Empty metadata'},{pattern:'^a$',title:'Nonempty metadata'}]},'3.2.1');
 input.resources[0].text=input.resources[0].text.replace(/"?EXACT"?/g,'9007199254740993.00');
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 const annotations=async(packet,bytes)=>{
  const checked=await evaluateMigrationAnnotations({...packet,runtimeInstances:['request-body','response-body'].map((subject,index)=>({subject,location:type,
   text:bytes.toString('base64'),mediaBase64:true,mediaType:type,media:{resource:packet.root,pointer:index?'/paths/~1bytes/post/responses/200/content/'+escape(type):'/paths/~1bytes/post/requestBody/content/'+escape(type)}}))});
  assert.equal(checked.checked.complete,true,JSON.stringify(checked.checked.runtimeFindings));return checked.annotations;
 };
 for(const bytes of [Buffer.alloc(0),Buffer.from('a'),Buffer.from([255])])assert.deepEqual(await annotations(cold(plan),bytes),await annotations(input,bytes));
});
for(const format of ['yaml','json'])for(const targetVersion of modern)test(`R1 Swagger ${format} -> ${targetVersion} raw string intersections use the same exact certificate`,async()=>{
 const root='file:///approved/swagger.'+format,type='application/octet-stream';
 const doc={swagger:'2.0',info:{title:'Raw string proof',version:'1'},host:'api.invalid',schemes:['https'],consumes:[type],produces:[type],
  paths:{'/bytes':{post:{parameters:[{in:'body',name:'body',schema:{$ref:'#/definitions/Raw'}}],responses:{200:{description:'Reply',schema:{$ref:'#/definitions/Raw'}}}}}},
  definitions:{Raw:{type:'string',format:'binary',enum:['','PNG'],maxLength:0,pattern:'^$'}}};
 const input={root,snapshot:'swagger-r1',targetVersion,destination:'file:///swagger-r1-copy/',resources:[{id:root,text:render(doc,format),generation:2}]};
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 for(const bytes of [Buffer.alloc(0),Buffer.from('PNG'),Buffer.from([0,255,128])]){
  const before=await evaluateSchemas({...input,runtimeInstances:['request-body','response-body'].map(subject=>({subject,location:type,mediaType:type,mediaBase64:true,text:bytes.toString('base64'),
   schema:{resource:root,pointer:subject==='request-body'?'/paths/~1bytes/post/parameters/0/schema':'/paths/~1bytes/post/responses/200/schema'}}))});
  assert.equal(before.complete,true,JSON.stringify(before.runtimeFindings));
  assert.deepEqual(await wire(cold(plan),type,bytes),before.runtimeEvaluations.map(value=>({complete:value.complete,valid:value.valid})));
 }
});
for(const format of ['yaml','json'])test(`R1 ${format} representation-neutral leaves still give their containing literal independent raw and JSON owners`,async()=>{
 const {input,type}=r1LiteralCapture('3.0.4',format,'3.2.1',{untyped:true}),original=input.resources.map(resource=>resource.text);
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));const output=cold(plan);
 for(const bytes of [Buffer.alloc(0),Buffer.from([0,255,128])])assert.deepEqual(await wire(output,type,r1LiteralWire(bytes),true),await wire(input,type,r1LiteralWire(bytes),true));
 const text='{"payload":"","exact":9007199254740993.00,"flag":false,"meta":{"type":"literal type","$ref":"literal.json","values":[null,1.25,"雪"]}}';
 const before=await wire(input,'application/json',Buffer.from(text)),after=await wire(output,'application/json',Buffer.from(text));
 assert.deepEqual(after,before);assert(after.every(value=>value.valid));assert.deepEqual(input.resources.map(resource=>resource.text),original);
});
for(const format of ['yaml','json'])test(`R1 ${format} enclosing nonbinary assertions can make byte equality and patterns irrelevant`,async()=>{
 const {input,type}=r1LiteralCapture('3.0.4',format,'3.2.1');
 const model=format==='json'?JSON.parse(input.resources[1].text):YAML.parse(input.resources[1].text);
 model.Box.enum[0].payload='PNG';model.Box.enum[0].exact='EXACT';model.Box.properties.flag={type:'boolean',enum:[true]};model.Binary.pattern='^PNG';
 input.resources[1].text=render(model,format).replace(/"?EXACT"?/g,'9007199254740993.00');
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 for(const bytes of [Buffer.alloc(0),Buffer.from('PNG'),Buffer.from([0,255,128])]){
  const before=await wire(input,type,r1LiteralWire(bytes),true),after=await wire(cold(plan),type,r1LiteralWire(bytes),true);
  assert.deepEqual(after,before);assert(after.every(value=>!value.valid));
 }
});
for(const format of ['yaml','json'])test(`R1 ${format} a legacy forced-octet part is not mistaken for an ordinary JSON consumer`,async()=>{
 const type='multipart/form-data; boundary=Binding',input=capture('3.0.4',format,type,{type:'object',required:['payload'],properties:{payload:{type:'string',format:'binary',enum:['']}}},'3.2.1');
 const doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 for(const content of [doc.paths['/bytes'].post.requestBody.content,doc.paths['/bytes'].post.responses[200].content])content[type].encoding={payload:{contentType:'application/json'}};
 input.resources[0].text=render(doc,format);const original=input.resources[0].text;
 const plan=await planMigration(input);assert.equal(plan.complete,false);assert.deepEqual(plan.outputs,[]);
 assert(plan.problems.some(problem=>problem.code==='migration.schema.binary-context'));assert.equal(input.resources[0].text,original);
});
