const assert=require('node:assert/strict'),{test}=require('node:test');
const base=process.env.BUSYAPI_FORM_DOWNGRADE_BASELINE||__dirname;
const {planMigration}=require(base+'/dist/migration.cjs');
const {SourceDocument}=require(base+'/dist/document.cjs');
const {createGraph,analyse}=require(base+'/dist/model.cjs');
const {requestOperation}=require(base+'/dist/execution.cjs');
const {evaluateSchemas}=require(base+'/dist/schema_evaluation.cjs');
for(const format of ['yaml','json'])test(`B05-R2 ${format} form group descriptions retain rendered documentation and exact metadata`,async()=>{
 const {render,reopened}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/group.'+format;
 const body={description:'[Group](./group.md)',required:true,'x-group':{flag:false,exact:'EXACT'},content:{'application/x-www-form-urlencoded':{
  schema:{type:'object',required:['name'],properties:{name:{type:'string'}}},encoding:{name:{style:'form',explode:true,allowReserved:false}},'x-media':{empty:'',flag:false}
 }}};
 const value={openapi:'3.0.4',info:{title:'Group',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/form':{post:{requestBody:body,responses:{204:{description:'Empty'}}}}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:'form-docs',targetVersion:'2.0',destination:'file:///review/group/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const after=reopened(result),plan=requestOperation({...after,resource:after.root,pointer:'/paths/~1form/post'});
 assert.equal(plan.requestBody.required,true);assert.equal(plan.requestBody.content[0].mediaType,'application/x-www-form-urlencoded');
 const {graph}=createGraph(after),descriptions=[...graph.entryScopes()].filter(scope=>scope.kind==='schema').map(scope=>graph.docs.get(scope.resource).dataNode(scope.pointer+'/description')?.value).filter(Boolean);
 assert(descriptions.some(value=>value.includes('file:///approved/group.md')));assert(result.outputs.some(output=>output.text.includes('9007199254740993.00')));assert.equal(input.resources[0].text,text);
});
for(const format of ['yaml','json'])test(`B05-R2 ${format} an inline reusable form target expands every occurrence and retains alias history`,async()=>{
 const {render,reopened}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/inline-form.'+format;
 const body={description:'Shared group',required:true,content:{'application/x-www-form-urlencoded':{schema:{type:'object',required:['name'],properties:{name:{type:'string'},count:{type:'integer'}}}}}};
 const reference={$ref:'#/paths/~1first/post/requestBody'},value={openapi:'3.0.4',info:{title:'Inline shared form',version:'1'},servers:[{url:'https://api.invalid'}],paths:{
  '/first':{post:{requestBody:body,responses:{204:{description:'Empty'}}}},'/second':{post:{requestBody:{$ref:'#/components/requestBodies/Alias'},responses:{204:{description:'Empty'}}}}
 },components:{requestBodies:{Alias:reference,Unused:{$ref:'#/components/requestBodies/Alias'}}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:'inline-form-aliases',targetVersion:'2.0',destination:'file:///review/inline-form/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));const after=reopened(result),graph=createGraph(after).graph;
 for(const operation of graph.operations()){
  const plan=requestOperation({...after,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
  assert.equal(plan.requestBody.required,true);assert.deepEqual(plan.requestBody.content[0].swaggerForm.map(p=>[p.name,p.required]),[['name',true],['count',false]]);
 }
 const history=result.outputs.map(output=>output.text).join('\n');assert(history.includes('#/paths/~1first/post/requestBody'));assert(history.includes('#/components/requestBodies/Alias'));assert.equal(input.resources[0].text,text);
});
for(const format of ['yaml','json'])test(`B05-R2 ${format} empty form examples suppress a shared schema sample without changing fields`,async()=>{
 const {render,reopened}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/empty-form.'+format;
 const value={openapi:'3.0.4',info:{title:'Empty form samples',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/form':{post:{requestBody:{required:true,content:{'application/x-www-form-urlencoded':{
  schema:{$ref:'#/components/schemas/Form'},examples:{}
 }}},responses:{204:{description:'Empty'}}}}},components:{schemas:{Form:{type:'object',required:['name'],properties:{name:{type:'string'}},example:{name:'keep'}}}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:'empty-form-examples',targetVersion:'2.0',destination:'file:///review/empty-form/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const after=reopened(result),plan=requestOperation({...after,resource:after.root,pointer:'/paths/~1form/post'});assert.equal(plan.requestBody.required,true);
 assert.deepEqual(plan.requestBody.content[0].examples,[]);assert.deepEqual(plan.requestBody.content[0].swaggerForm.map(p=>[p.name,p.required]),[['name',true]]);
 assert(result.outputs.some(output=>output.text.includes('keep')));assert.equal(input.resources[0].text,text);
});

for(const version of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])for(const singleton of [false,true,'tuple','intersection'])if(!(version==='3.0.4'&&singleton==='tuple'))
test(`R2 ${version} ${format} shared mixed form singleton=${singleton} retains file bytes and independent fields`,async()=>{
 const root='file:///approved/api.'+format,type='multipart/form-data; boundary=R2',raw=version==='3.0.4'?{type:'string',format:'binary'}:{};
 const field=singleton==='intersection'?{allOf:[{type:'array',minItems:0,maxItems:4,items:{$ref:'#/components/schemas/Raw'}},{minItems:1,maxItems:1}]}:singleton?{type:'array',minItems:1,maxItems:1,...(singleton==='tuple'?{prefixItems:[{$ref:'#/components/schemas/Raw'}]}:{items:{$ref:'#/components/schemas/Raw'}})}:{$ref:'#/components/schemas/Raw'};
 const body={required:true,content:{[type]:{schema:{$ref:'#/components/schemas/Form'},encoding:{file:{contentType:'application/octet-stream'},name:{contentType:'text/plain',headers:{'Content-Type':{schema:{type:'object',required:['n'],properties:{n:{type:'integer'}}}}},'x-retained':'encoding metadata'}}}}};
 const value={openapi:version,info:{title:'R2 mixed form',version:'1'},servers:[{url:'https://api.invalid'}],paths:Object.fromEntries(['/items','/again'].map(path=>[path,{post:{requestBody:{$ref:'#/components/requestBodies/Shared'},responses:{204:{description:'Empty'}}}}])),components:{requestBodies:{Shared:body},schemas:{Raw:raw,Form:{type:'object',required:['file'],properties:{file:field,name:{$ref:'#/components/schemas/Name'},numbers:{type:'array',items:{$ref:'#/components/schemas/Number'}}}},Name:{type:'string'},Number:{type:'integer',minimum:0},Independent:{$ref:'#/components/schemas/Form/properties/name'}}}};
 value.components.schemas.IndependentHeader={$ref:'#'+encodeURI('/components/requestBodies/Shared/content/'+type.replaceAll('~','~0').replaceAll('/','~1')+'/encoding/name/headers/Content-Type/schema')};
 const text=format==='json'?JSON.stringify(value):require(base+'/node_modules/yaml').stringify(value),input={root,snapshot:'R2-mixed-form',resources:[{id:root,text,generation:8}],targetVersion:'2.0',destination:'file:///reviewed/'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(input.resources[0].text,text);
 const after={root:result.outputRoot,snapshot:'cold-R2-form',resources:result.outputs.map(value=>({id:value.id,text:value.text,generation:0}))};
 assert.equal(analyse(after).complete,true);
 const doc=new SourceDocument(result.outputs.find(value=>value.id===after.root).text,after.root);
 for(const path of ['~1items','~1again']){
  const parameters=doc.dataNode('/paths/'+path+'/post/parameters').value;
  assert.deepEqual(parameters.map(value=>[value.name,value.type,value.required===true]),[['file','file',true],['name','string',false],['numbers','array',false]]);
  assert.equal(parameters[2].collectionFormat,'multi');assert.deepEqual({...parameters[2].items},{type:'integer',minimum:0});
 }
 const multipart=(bytes,extra='',omit=false)=>Buffer.concat([Buffer.from(omit?'':'--R2\r\nContent-Disposition: form-data; name="file"\r\nContent-Type: application/octet-stream\r\n\r\n'),omit?Buffer.alloc(0):bytes,Buffer.from((omit?'':'\r\n')+'--R2\r\nContent-Disposition: form-data; name="name"\r\n\r\n\r\n'+extra+'--R2--\r\n')]);
 async function check(input,bytes){
  const {graph}=createGraph(input),op=graph.operations().find(value=>value.path==='/items'),plan=requestOperation({...input,resource:op.source.resource,pointer:op.source.pointer,occurrence:op.occurrence}),media=plan.requestBody.content[0];
  const result=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:type,text:bytes.toString('base64'),mediaBase64:true,mediaType:type,form:media.swaggerForm?{resource:op.source.resource,pointer:op.source.pointer,occurrence:op.occurrence}:media.definition??media.source}]});
  assert.equal(result.complete,true,JSON.stringify(result.runtimeFindings));return result.runtimeEvaluations.every(value=>value.complete&&value.valid)&&!result.runtimeFindings.some(value=>value.severity==='error');
 }
 for(const bytes of [multipart(Buffer.alloc(0)),multipart(Buffer.from([0,255,128,195,169])),multipart(Buffer.from([0]),'--R2\r\nContent-Disposition: form-data; name="numbers"\r\n\r\n-1\r\n'),multipart(Buffer.alloc(0),'',true)])
  assert.equal(await check(after,bytes),await check(input,bytes));
 const schemas=await evaluateSchemas({...after,runtimeInstances:[{subject:'response-body',location:'independent',text:'""',schema:{resource:after.root,pointer:'/definitions/Independent'}}]});
 assert.equal(schemas.complete,true);assert(schemas.runtimeEvaluations.every(value=>value.valid));
 const header=await evaluateSchemas({...after,runtimeInstances:[{subject:'response-body',location:'independent-header',text:'{"n":7}',schema:{resource:after.root,pointer:'/definitions/IndependentHeader'}}]});
 assert.equal(header.complete,true);assert(header.runtimeEvaluations.every(value=>value.valid));
});

for(const variant of ['many-files','file-bounds','part-media','part-header','missing-binding'])test(`R2 ${variant} retains a precise no-output form refusal`,async()=>{
 const root='file:///approved/api.yaml',type='multipart/form-data',field={},encoding={};
 if(variant==='many-files')Object.assign(field,{type:'array',items:{}});
 if(variant==='file-bounds')field.maxLength=4;
 if(variant==='part-media')encoding.contentType='image/png';
 if(variant==='part-header')encoding.headers={'Content-Transfer-Encoding':{schema:{type:'string',enum:['base64']}}};
 if(variant==='missing-binding')field.$ref='./missing.yaml';
 const value={openapi:'3.2.1',info:{title:'Refusal',version:'1'},paths:{'/items':{post:{requestBody:{required:true,content:{[type]:{schema:{type:'object',required:['file'],properties:{file:field}},encoding:{file:encoding}}}},responses:{204:{description:'Empty'}}}}}};
 const text=require(base+'/node_modules/yaml').stringify(value),result=await planMigration({root,snapshot:'R2-refusal',resources:[{id:root,text,generation:0}],targetVersion:'2.0',destination:'file:///reviewed/'});
 assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(value=>value.range[1]>value.range[0]));
 if(variant!=='missing-binding')assert(result.problems.some(value=>value.reason==='target-representation'),JSON.stringify(result.problems));
});
for(const version of ['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const style of format==='yaml'?['block','flow']:['json'])for(const query of [true,false]){
 test(`${version} ${format} ${style} query=${query} primitive URL-encoded form downgrade retains source values and native request invariants`,async()=>{
  const root='file:///approved/api.'+format;
  const document={openapi:version,info:{title:'Form 雪',version:'unrelated'},servers:[{url:'https://api.invalid'}],paths:{'/items':{post:{parameters:[{name:'tenant',in:'query',schema:{type:'string'}}],requestBody:{required:true,content:{'application/x-www-form-urlencoded':{schema:{type:'object',required:['name'],properties:{count:{type:'integer',minimum:0,default:0},name:{type:'string',minLength:1,description:'Name 雪'},flag:{type:'boolean',default:false},exact:{type:'integer',enum:['EXACT']}}}}}},responses:{204:{description:'No body'}}}}}};
  if(!query)delete document.paths['/items'].post.parameters;
  const YAML=require(base+'/node_modules/yaml');
  const serialized=style==='block'?YAML.stringify(document).replace('EXACT','9007199254740993.00'):JSON.stringify(document,null,2).replace('"EXACT"','9007199254740993.00');
  const text=format==='json'?serialized:style==='block'?'# Keep form source\r\n'+serialized.replaceAll('\n','\r\n'):'# Keep form source\r\n'+Object.entries(document).map(([name,value])=>name+': '+JSON.stringify(value)).join('\r\n').replace('"EXACT"','9007199254740993.00')+'\r\n';
  const input={root,snapshot:'form-downgrade-'+version+'-'+format,targetVersion:'2.0',destination:'file:///output/review/',resources:[{id:root,text,generation:1,identity:'source'}]};
  const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.status,'faithfully-convertible');assert.equal(input.resources[0].text,text);assert.equal(result.invariants.requests,'effective-url-serialization-security-and-media');
  const output=result.outputs.find(resource=>resource.id===result.outputRoot);assert(output);const doc=new SourceDocument(output.text,output.id);
  assert.equal(doc.node('/swagger').value,'2.0');assert(!doc.nodes.has('/openapi'));assert(!doc.nodes.has('/paths/~1items/post/requestBody'));
  assert.deepEqual(doc.node('/paths/~1items/post/consumes').value,['application/x-www-form-urlencoded']);
  const parameters=doc.node('/paths/~1items/post/parameters').value;
  assert.deepEqual(parameters.map(p=>[p.in,p.name]),[...(query?[['query','tenant']]:[]),['formData','count'],['formData','name'],['formData','flag'],['formData','exact']]);
  const offset=query?1:0;
  assert.equal(parameters[offset].required===true,false);assert.equal(parameters[offset+1].required,true);assert.equal(parameters[offset+2].required===true,false);
  assert.equal(parameters[offset].default,0);assert.equal(parameters[offset+2].default,false);assert.equal(parameters[offset+1].minLength,1);assert.equal(parameters[offset+1].description,'Name 雪');
  assert.equal(doc.dataJson('/paths/~1items/post/parameters/'+(offset+3)+'/enum/0'),'9007199254740993.00');
  if(format==='yaml')assert(output.text.startsWith('# Keep form source\r\n'));
 });
}
for(const format of ['yaml','json'])for(const variant of ['closed','object-field','binary-field','optional-required','missing-required-flag']){
 test(`${format} ${variant} form mapping reports an exact blocker and never publishes a partial result`,async()=>{
  const root='file:///approved/api.'+format,media='application/x-www-form-urlencoded';
  const schema={type:'object',required:['name'],properties:{name:{type:'string'}}};
  const body={required:true,content:{[media]:{schema}}};
  const document={openapi:'3.0.4',info:{title:'Located refusal',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/items':{post:{requestBody:body,responses:{204:{description:'No body'}}}}}};
  let code;
  if(variant==='closed'){schema.additionalProperties=false;code='migration.form.object-constraint';}
  if(variant==='object-field'){schema.properties.name={type:'object'};code='migration.form.field-type';}
  if(variant==='binary-field'){schema.properties.name.format='binary';code='migration.form.binary';}
  if(variant==='optional-required'){body.required=false;code='migration.form.presence';}
  if(variant==='missing-required-flag'){delete body.required;code='migration.form.presence';}
  const YAML=require(base+'/node_modules/yaml'),text=format==='json'?JSON.stringify(document):YAML.stringify(document),resources=[{id:root,text,generation:1}];
  const result=await planMigration({root,snapshot:'refusal',resources,targetVersion:'2.0',destination:'file:///output/review/'});
  assert.equal(result.complete,false);assert.equal(result.status,'blocked');assert.deepEqual(result.outputs,[]);
  assert(result.problems.some(p=>p.code===code&&p.resource===root&&p.pointer&&p.range[1]>p.range[0]),JSON.stringify(result.problems));
  assert.equal(resources[0].text,text);
 });
}

for(const version of ['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const format of ['yaml','json']){
 test(`${version} ${format} explicit primitive array encodings preserve Swagger collection rules`,async()=>{
  const root='file:///approved/api.'+format,media='application/x-www-form-urlencoded';
  const properties=Object.fromEntries(['multi','csv','ssv','pipes'].map(name=>[name,{type:'array',minItems:1,maxItems:4,uniqueItems:true,items:{type:'string',minLength:1,enum:['one','two']}}]));
  const encoding={multi:{style:'form'},csv:{explode:false},ssv:{style:'spaceDelimited',explode:false},pipes:{style:'pipeDelimited',allowReserved:false}};
  const document={openapi:version,info:{title:'Arrays',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/items':{post:{requestBody:{required:true,content:{[media]:{schema:{type:'object',required:['multi'],properties},encoding}}},responses:{204:{description:'No body'}}}}}};
  const YAML=require(base+'/node_modules/yaml'),text=format==='json'?JSON.stringify(document):YAML.stringify(document);
  const result=await planMigration({root,snapshot:'arrays',targetVersion:'2.0',destination:'file:///output/review/',resources:[{id:root,text,generation:1}]});
  assert.equal(result.complete,true,JSON.stringify(result.problems));
  const output=result.outputs.find(resource=>resource.id===result.outputRoot),doc=new SourceDocument(output.text,output.id);
  const parameters=doc.node('/paths/~1items/post/parameters').value;
  assert.deepEqual(parameters.map(p=>[p.name,p.type,p.collectionFormat]),['multi','csv','ssv','pipes'].map(name=>[name,'array',name]));
  for(const parameter of parameters){assert.equal(parameter.allowEmptyValue,true);assert.equal(parameter.minItems,1);assert.equal(parameter.maxItems,4);assert.equal(parameter.uniqueItems,true);assert.deepEqual({...parameter.items},properties.multi.items);}
 });
}
for(const variant of ['nested-content','reserved','exploded-delimited','nested','item-description','content-encoding','separator-in-item','unbounded-separated'])test(`array form ${variant} never claims faithful conversion`,async()=>{
 const root='file:///approved/api.yaml',media='application/x-www-form-urlencoded',property={type:'array',items:{type:'string'}},rule={style:'form'};
 const content={schema:{type:'object',required:['values'],properties:{values:property}},encoding:{values:rule}};
 const document={openapi:variant==='nested-content'?'3.2.1':'3.0.4',info:{title:'Arrays',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/items':{post:{requestBody:{required:true,content:{[media]:content}},responses:{204:{description:'No body'}}}}}};
 if(variant==='nested-content'){delete content.encoding;property.items={type:'array',items:{type:'string'}};}
 if(variant==='reserved')rule.allowReserved=true;
 if(variant==='exploded-delimited'){rule.style='spaceDelimited';rule.explode=true;}
 if(variant==='nested')property.items={type:'array',items:{type:'string'}};
 if(variant==='item-description')property.items.description='Do not drop';
 if(variant==='content-encoding')content.encoding.values={contentType:'application/json'};
 if(variant==='separator-in-item'){rule.explode=false;property.items.enum=['one,two'];}
 if(variant==='unbounded-separated')rule.explode=false;
 const text=require(base+'/node_modules/yaml').stringify(document),resources=[{id:root,text,generation:1}];
 const result=await planMigration({root,snapshot:'array-refusal',resources,targetVersion:'2.0',destination:'file:///output/review/'});
 assert.equal(result.complete,false);assert.equal(result.status,'blocked');assert.deepEqual(result.outputs,[]);
 assert(result.problems.some(p=>p.code.startsWith('migration.form.')&&p.resource===root&&p.pointer&&p.range[1]>p.range[0]),JSON.stringify(result.problems));assert.equal(resources[0].text,text);
});

require('./migration_b05_r3d1_fixture.cjs')('downgrade');
