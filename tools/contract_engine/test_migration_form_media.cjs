const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{SourceDocument}=require('./dist/document.cjs');
const versions=['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
const mediaTypes=['application/x-www-form-urlencoded','Application/X-WWW-Form-Urlencoded','application/x-www-form-urlencoded; charset=utf-8','Application/X-WWW-Form-Urlencoded; Charset="UTF-8"'];
for(const format of ['yaml','json'])test(`R3 ${format} equivalent exact form bounds retain each media and literal owner`,async()=>{
 const root='file:///approved/api.'+format,content=Object.fromEntries(['application/x-www-form-urlencoded','multipart/form-data'].map((media,index)=>[media,{schema:{type:'object',required:['count'],properties:{count:{type:'integer',minimum:'BOUND'+index}}}}]));
 const value={openapi:'3.0.4',info:{title:'Exact alternatives',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/items':{post:{requestBody:{required:true,content},responses:{204:{description:'Empty'}}}}}};
 const text=(format==='json'?JSON.stringify(value):YAML.stringify(value)).replaceAll(format==='json'?'"BOUND0"':'BOUND0','9007199254740993.00').replaceAll(format==='json'?'"BOUND1"':'BOUND1','900719925474099300e-2');
 const input={root,snapshot:'R3-form-media',resources:[{id:root,text,generation:0}],targetVersion:'2.0',destination:'file:///reviewed/'},result=await planMigration(input);
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.deepEqual(await planMigration(input),result);
 assert(result.outputs.some(output=>output.text.includes('9007199254740993.00')));assert(result.outputs.some(output=>output.text.includes('900719925474099300e-2')));
 assert.equal(input.resources[0].text,text);
});
for(const version of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])test(`R2 ${version} ${format} compatible form media retain each selection and one flat field set`,async()=>{
 const root='file:///approved/api.'+format,schema={type:'object',required:['name'],properties:{name:{type:'string'},flags:{type:'array',items:{type:'boolean'}}}};
 const types=['application/x-www-form-urlencoded','multipart/form-data'];
 const content=Object.fromEntries(types.map(type=>[type,{schema,encoding:{name:{contentType:'text/plain','x-kept':{empty:'',zero:0}},flags:{contentType:'text/plain'}}}]));
 const value={openapi:version,info:{title:'R2 alternatives',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/items':{post:{requestBody:{required:true,content},responses:{204:{description:'Empty'}}}}}};
 const text=format==='json'?JSON.stringify(value):YAML.stringify(value),result=await planMigration({root,snapshot:'R2-form-media',resources:[{id:root,text,generation:2}],targetVersion:'2.0',destination:'file:///reviewed/'});
 assert.equal(result.complete,true,JSON.stringify(result.problems));const doc=new SourceDocument(result.outputs.find(value=>value.id===result.outputRoot).text,result.outputRoot);
 assert.deepEqual(doc.dataNode('/paths/~1items/post/consumes').value,types);assert.deepEqual(doc.dataNode('/paths/~1items/post/parameters').value.map(value=>[value.name,value.type,value.collectionFormat]),[['name','string',undefined],['flags','array','multi']]);
});
for(const version of versions)for(const format of ['yaml','json'])for(const media of mediaTypes)test(`${version} ${format} ${media} keeps its authored media declaration through form conversion`,async()=>{
 const root='file:///approved/api.'+format;
 const schema={type:'object',required:['name'],properties:{name:{type:'string'},flags:{type:'array',items:{type:'boolean'}}}};
 const document={openapi:version,info:{title:'Media 雪',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/items':{post:{requestBody:{required:true,content:{[media]:{schema}}},responses:{204:{description:'Empty'}}}}}};
 const text=format==='json'?JSON.stringify(document):'# Keep media organization\r\n'+YAML.stringify(document).replaceAll('\n','\r\n'),resources=[{id:root,text,generation:1}];
 const result=await planMigration({root,resources,snapshot:'media',targetVersion:'2.0',destination:'file:///output/'});
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.status,'faithfully-convertible');assert.equal(resources[0].text,text);
 const output=result.outputs.find(resource=>resource.id===result.outputRoot),doc=new SourceDocument(output.text,output.id);
 assert.deepEqual(doc.node('/paths/~1items/post/consumes').value,[media]);
 const parameters=doc.node('/paths/~1items/post/parameters').value;
 assert.deepEqual(parameters.map(parameter=>[parameter.name,parameter.in]),[['name','formData'],['flags','formData']]);
 assert.equal(parameters[1].collectionFormat,'multi');
 if(format==='yaml')assert(output.text.startsWith('# Keep media organization\r\n'));
});

for(const version of ['3.0.4','3.2.1'])for(const format of ['yaml','json'])for(const media of mediaTypes.slice(1,3))test(`${version} ${format} ${media} retains an exact media-key blocker for an object-wide constraint`,async()=>{
 const root='file:///approved/api.'+format,escape=value=>value.replaceAll('~','~0').replaceAll('/','~1');
 const document={openapi:version,info:{title:'Media',version:'1'},paths:{'/items':{post:{requestBody:{required:true,content:{[media]:{schema:{type:'object',required:['name'],maxProperties:1,properties:{name:{type:'string'}}}}}},responses:{204:{description:'Empty'}}}}}};
 const text=format==='json'?JSON.stringify(document):YAML.stringify(document),resources=[{id:root,text,generation:1}];
 const result=await planMigration({root,resources,snapshot:'media-blocker',targetVersion:'2.0',destination:'file:///output/'});
 assert.equal(result.complete,false);assert.equal(result.status,'blocked');assert.deepEqual(result.outputs,[]);assert.equal(resources[0].text,text);
 const problem=result.problems.find(problem=>problem.code==='migration.form.object-constraint');
 assert(problem,JSON.stringify(result.problems));assert.equal(problem.resource,root);
 assert.equal(problem.pointer,'/paths/~1items/post/requestBody/content/'+escape(media)+'/schema/maxProperties');
 assert(problem.range[1]>problem.range[0]);
});

require('./migration_b05_r3d1_fixture.cjs')('media');

test('R3d1 publication invariant rejects changed delivered positional defaults',async()=>{
 const {capture}=require('./migration_b05_r3d1_fixture.cjs'),{createGraph}=require('./dist/model.cjs');
 const {input}=capture('3.2.1','json',{schema:{type:'array',items:{type:'string'}},itemEncoding:{contentType:'text/plain'}});
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const pointer='/paths/~1parts/post/requestBody/content/multipart~1mixed';
 const outputs=review.outputs.map(output=>{
  if(output.id!==review.outputRoot)return output;
  const value=JSON.parse(output.text);value.paths['/parts'].post.requestBody.content['multipart/mixed'].schema.items.type='object';
  return {...output,text:JSON.stringify(value)};
 });
 const source=createGraph(input).graph,target=createGraph({root:review.outputRoot,resources:outputs,snapshot:'mutated'}).graph,problems=[];
 require('./dist/migration_invariants.cjs').proveMigrationPositionalEncoding(source,target,
  location=>[{resource:review.outputRoot,pointer:location.pointer}],(location,code,message,reason)=>problems.push({location,code,message,reason}));
 assert(problems.some(problem=>problem.code==='migration.invariant.positional-encoding'),JSON.stringify(problems));
});

require('./migration_b05_r3d1b_fixture.cjs')('media');
