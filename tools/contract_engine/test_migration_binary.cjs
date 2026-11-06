const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');
const {createGraph}=require('./dist/model.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const escape=value=>value.replaceAll('~','~0').replaceAll('/','~1');
const legacy=['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4'];
const modern=['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
const render=(value,format)=>format==='yaml'?'# Keep exact source 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)+'\r\n';
function capture(version,format,type,schema,targetVersion){
 const root='file:///approved/contracts/api.'+format,media={schema};
 const document={openapi:version,info:{title:'Keep binary café',version:'business'},servers:[{url:'https://api.invalid'}],paths:{'/bytes':{post:{requestBody:{content:{[type]:media}},responses:{200:{description:'Reply',content:{[type]:media}}}}}},'x-literal':{format:'binary',contentEncoding:'base64',number:'EXACT'}};
 return {root,snapshot:'binary-migration',targetVersion,destination:'file:///reviewed/copy/',resources:[{id:root,text:render(document,format).replace(/"?EXACT"?/g,'9007199254740993.00'),generation:4}]};
}
function cold(result){return {root:result.outputRoot,snapshot:'cold',resources:result.outputs.map(value=>({id:value.id,text:value.text,generation:0}))};}
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
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));assert.equal(plan.producerVersion,'85');
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

for(const format of ['yaml','json'])for(const mode of ['constraint','ancestor','mixed','opaque','unbound'])
test(`${format} incomplete ${mode} binary mapping retains a located refusal without output`,async()=>{
 const type=mode==='opaque'?'application/unknown-binary':'application/octet-stream';
 let leaf={type:'string',format:'binary'};
 if(mode==='constraint')leaf.maxLength=4;
 if(mode==='ancestor')leaf={type:'string',allOf:[leaf]};
 const input=capture('3.0.4',format,type,leaf,'3.2.1');
 if(mode==='mixed'||mode==='unbound'){
  const doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
  doc.components={schemas:{Shared:{type:'string',format:'binary',...(mode==='mixed'?{maxLength:4}:{})}}};
  if(mode==='unbound')doc.paths={};
  else for(const content of [doc.paths['/bytes'].post.requestBody.content,doc.paths['/bytes'].post.responses[200].content]){
   content[type].schema={$ref:'#/components/schemas/Shared'};content['application/json']={schema:{$ref:'#/components/schemas/Shared'}};
  }
  input.resources[0].text=render(doc,format);
 }
 const before=input.resources[0].text,plan=await planMigration(input);assert.equal(plan.status,'blocked');assert.equal(plan.complete,false);assert.deepEqual(plan.outputs,[]);assert.deepEqual(plan.changes,[]);
 const issue=plan.problems.find(value=>value.code==='migration.schema.binary-context');assert(issue,JSON.stringify(plan.problems));assert.equal(issue.reason,'implementation');assert.equal(issue.resource,input.root);assert(issue.range[1]>issue.range[0]);
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

for(const format of ['yaml','json'])for(const mode of ['decoded-media','custom-format','encoded-opaque-body'])
test(`${format} ${mode} does not discard an unmapped encoded representation`,async()=>{
 const type=mode==='encoded-opaque-body'?'application/octet-stream':'application/json';
 let leaf={type:'string',contentEncoding:'base64'};
 if(mode==='decoded-media')leaf={type:'object',properties:{data:{...leaf,contentMediaType:'image/png'}}};
 if(mode==='custom-format')leaf.format='uuid';
 const input=capture('3.1.2',format,type,leaf,'3.0.4'),before=input.resources[0].text,plan=await planMigration(input);
 assert.equal(plan.complete,false);assert.equal(plan.status,'blocked');assert.deepEqual(plan.outputs,[]);
 assert(plan.problems.some(value=>value.code==='migration.schema.binary-context'&&value.reason==='implementation'),JSON.stringify(plan.problems));
 assert.equal(input.resources[0].text,before);
});

for(const format of ['yaml','json'])test(`${format} raw constraints in another allOf branch remain a publication blocker`,async()=>{
 const input=capture('3.0.4',format,'application/octet-stream',{allOf:[{type:'string',format:'binary'},{maxLength:3}]},'3.2.1'),before=input.resources[0].text;
 const plan=await planMigration(input);assert.equal(plan.complete,false);assert.deepEqual(plan.outputs,[]);
 assert(plan.problems.some(value=>value.code==='migration.schema.binary-context'));
 assert.equal(input.resources[0].text,before);
});

for(const format of ['yaml','json'])for(const target of ['3.1.2','3.2.1'])for(const composition of [false,true])
test(`${format} ${target} shared containing multipart schemas preserve independent JSON and nested consumers composition=${composition}`,async()=>{
 const type='multipart/form-data; boundary=Container',models='file:///approved/contracts/models.'+format;
 const input=capture('3.0.4',format,type,{$ref:'models.'+format+'#/Alias'},target);
 const doc=format==='json'?JSON.parse(input.resources[0].text):YAML.parse(input.resources[0].text);
 const binary={$ref:'#/Binary'},container={type:'object',required:['payload','count'],properties:{payload:binary,count:{type:'integer'},nested:{type:'object',properties:{value:binary}}}};
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
 for(const value of [{payload:'snow 雪',count:3,nested:{value:'data'}},{payload:false,count:3},{payload:'x',count:3,nested:{value:false}}])
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
