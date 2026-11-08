const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('node:fs');
const {planMigration}=require('./dist/migration.cjs'),{analyse}=require('./dist/model.cjs'),{evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');

for(const targetVersion of ['3.1.2','3.0.4'])test(`R3c-3 captured reserved form fields retain actual query bytes at ${targetVersion}`,async()=>{
 const input=require('./migration_b05_r3c3_fixture.cjs')('3.2.1','json',targetVersion),media=input.whole.content['application/x-www-form-urlencoded'];
 media.schema.properties.q.items.enum=['/','[x]'];media.encoding={q:{style:'form',explode:true,allowReserved:true}};
 input.refresh().configure('q=/&q=%5Bx%5D&flag=false');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const proof=review.configurationProjections.find(change=>change.pointer==='/tests/0/parameters').rawQueries[0];
 assert.equal(proof.targets.length,2);
 for(const at of proof.targets){const doc=new SourceDocument(review.outputs.find(output=>output.id===at.resource).text,at.resource);
  assert.equal(doc.dataNode(at.pointer+'/name').value,at.name);if(at.name==='q')assert.equal(doc.dataNode(at.pointer+'/allowReserved').value,true);}
});

test('R3c-3 equivalent reserved punctuation retains direct and composed Swagger codecs',async()=>{
 const input=require('./migration_b05_r3c3_fixture.cjs')(),media=input.whole.content['application/x-www-form-urlencoded'];
 media.schema.properties.q.items.enum=['!',"'"];media.encoding={q:{style:'form',explode:true,allowReserved:true}};
 input.refresh().configure("q=!&q='&flag=false");
 const modern=await planMigration(input);assert.equal(modern.complete,true,JSON.stringify(modern.problems));
 const direct=await planMigration({...input,targetVersion:'2.0'});assert.equal(direct.complete,true,JSON.stringify(direct.problems));
 const composed=await planMigration({root:modern.outputRoot,resources:modern.outputs.map(output=>({...output,generation:0})),snapshot:'reserved-composed',
  targetVersion:'2.0',destination:'file:///reserved-composed/'});assert.equal(composed.complete,true,JSON.stringify(composed.problems));
 delete media.encoding;input.refresh();const refused=await planMigration({...input,targetVersion:'2.0'});
 assert.equal(refused.complete,false);assert.deepEqual(refused.outputs,[]);assert(refused.problems.some(problem=>problem.code==='migration.parameter.querystring-proof'));
});

for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const targetVersion of ['3.1.2','3.0.4','2.0'])
test(`R3c-3 ${version} ${format} optional empty text retains selected/omitted cases → ${targetVersion}`,async()=>{
 const input=require('./migration_b05_r3c3_fixture.cjs')(version,format,targetVersion,true);
 input.whole.content={'text/plain; charset=us-ascii':{schema:{type:'string',maxLength:0},...(targetVersion==='2.0'?{}:{example:''})}};input.configure('').refresh();
 const settings=JSON.parse(input.configuration.text);settings.tests.push({name:'omitted',operation:{method:'get',path:'/p'},parameters:{}});input.configuration.text=JSON.stringify(settings);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const change=review.configurationProjections.find(change=>change.pointer==='/tests/0/parameters');assert.deepEqual(change.emptyQueries,['descriptionOnly']);
 assert.deepEqual(JSON.parse(change.after).query.descriptionOnly,[]);assert.deepEqual(review.manifest.tests[1].parameters,{});
 input.whole.required=true;input.refresh();const refused=await planMigration(input);assert.equal(refused.complete,false);assert.deepEqual(refused.outputs,[]);
 assert(refused.problems.some(problem=>problem.code==='migration.parameter.querystring-target'&&problem.reason==='target-representation'));
});

test('R3c-3 repeated literal cookie names retain an older-target delimiter restriction',async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')();input.value.components.parameters.Literal.schema={type:'array',enum:[['a','b']]};input.resources[0].text=input.encode(input.value);
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code==='migration.parameter.cookie-target'&&problem.reason==='target-representation'),JSON.stringify(review.problems));
});

for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])test(`R3c-3 ${version} ${format} explicit form style preserves spaces through RFC6570`,async()=>{
 const input=require('./migration_b05_r3c3_fixture.cjs')(version,format),media=input.whole.content['application/x-www-form-urlencoded'];
 media.schema.properties.q.items.enum=['a b','a+b'];media.encoding={q:{style:'form',explode:true}};input.refresh().configure('q=a%20b&q=a%2Bb&flag=false');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const change=review.configurationProjections.find(change=>change.pointer==='/tests/0/parameters');assert.deepEqual(JSON.parse(change.after).query.q,['a b','a+b']);
 delete media.encoding;input.refresh();const refused=await planMigration(input);assert.equal(refused.complete,false);assert.deepEqual(refused.outputs,[]);
 assert(refused.problems.some(problem=>problem.code==='migration.parameter.querystring-proof'),JSON.stringify(refused.problems));
});

for(const array of [false,true])test(`R3c-3 exact numeric cookie lexical language array=${array} uses JSON content`,async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')(),literal=input.value.components.parameters.Literal;
 const scalar={type:'number',enum:['EXACT']};literal.schema=array?{type:'array',minItems:1,maxItems:1,items:scalar}:scalar;
 input.resources[0].text=input.encode(input.value).replaceAll('"EXACT"','9007199254740993.00');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const doc=new SourceDocument(review.outputs.find(output=>output.id===review.outputRoot).text,review.outputRoot);
 assert(doc.dataNode('/components/parameters/Literal/content/application~1json/schema'));
 const cold={root:review.outputRoot,resources:review.outputs.map(output=>({...output,generation:0})),snapshot:'numeric-cookie'};
 const checked=await evaluateSchemas({...cold,runtimeInstances:[{subject:'request-parameter',location:'numeric',text:'literal=9007199254740993e+0',parameter:{resource:cold.root,pointer:'/components/parameters/Literal'}}]});
 assert.equal(checked.complete,true,JSON.stringify(checked.findings));assert.equal(checked.runtimeEvaluations[0].valid,true);
});

for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const targetVersion of ['3.1.2','3.0.4','2.0'])for(const single of [false,true])
test(`R3c-3 ${version} ${format} raw ${single?'single':'multiple'} fields → ${targetVersion}`,async()=>{
 const raw=single?'q=a%2Bb&q=%2520':'count=9007199254740993e%2B0&q=a%2Bb&q=%2520&flag=false';
 const input=require('./migration_b05_r3c3_fixture.cjs')(version,format,targetVersion,single).configure(raw),before=JSON.stringify(input);
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));assert.equal(plan.producerVersion,'104');
 const projection=plan.configurationProjections.find(change=>change.pointer==='/tests/0/parameters');
 assert.equal(projection.rawQueries[0].name,'descriptionOnly');assert(projection.rawQueries[0].data.includes(single?'a+b':'9007199254740993e+0'));
 const after=new SourceDocument(projection.after,'file:///configuration.json',true,'json');
 assert.equal(after.dataNode('/querystring'),undefined);assert.equal(after.dataNode('/header/Keep').value,'literal%2B');
 assert.deepEqual(after.dataNode('/query/q').value,['a+b','%20']);
 assert.deepEqual([...after.dataNode('/query').children.keys()],single?['q']:['count','q','flag']);
 assert.equal(JSON.stringify(input),before);assert.equal((await planMigration(input)).identity,plan.identity);
 const cold={root:plan.outputRoot,resources:plan.outputs.map(output=>({...output,generation:0})),snapshot:'r3c3-cold'};
 assert.equal(analyse(cold).complete,true);assert.deepEqual(plan.manifest.environments.manual.variables,{held:'a+b%20'});
});

for(const raw of ['q=%','q=%GG','q=%FF','q=+','q=%20','q=%2b','q=a%2Bb&&flag=false','q=a%2Bb&flag=false&q=%2520','q=a%2Bb','q=a%2Bb&flag=FALSE',''])
test(`R3c-3 raw query ${JSON.stringify(raw)} retains precise failed inverse`,async()=>{
 const input=require('./migration_b05_r3c3_fixture.cjs')().configure(raw),before=input.configuration.text;
 const plan=await planMigration(input);assert.equal(plan.complete,false);assert.deepEqual(plan.outputs,[]);
 assert(plan.problems.some(problem=>problem.code==='migration.parameter.saved-proof'&&problem.reason==='unavailable-proof'),JSON.stringify(plan.problems));
 assert.equal(input.configuration.text,before);
});

for(const targetVersion of ['3.1.2','3.0.4'])for(const field of ['dataValue','serializedValue','value','externalValue'])
test(`R3c-3 single extracted array ${field} example → ${targetVersion}`,async()=>{
 const input=require('./migration_b05_r3c3_fixture.cjs')('3.2.1','yaml',targetVersion,true),media=input.whole.content['application/x-www-form-urlencoded'];
 const example={summary:'Repeated values',description:'Keep this choice',...(field==='dataValue'||field==='value'?{[field]:{q:['a+b','%20']}}:{[field]:field==='externalValue'?'./example.bin':'q=a%2Bb&q=%2520'})};
 media.examples={Repeated:example};
 if(field==='externalValue'){
  const bytes=Buffer.from('q=a%2Bb&q=%2520');input.exampleResources=[{version:1,id:'file:///captured/example.bin',generation:1,aliases:[],state:'available',byteLength:bytes.length,base64:bytes.toString('base64'),identity:require('node:crypto').createHash('sha256').update(bytes).digest('hex')}];
 }
 input.refresh();const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 const {requestOperation}=require('./dist/execution.cjs'),cold={root:plan.outputRoot,resources:plan.outputs.map(output=>({...output,generation:0})),exampleResources:plan.exampleOutputs.map(output=>({version:1,id:output.id,identity:output.identity,generation:0,aliases:[],state:'available',base64:output.base64,byteLength:output.byteLength})),snapshot:'r3c3-examples'};
 const parameter=requestOperation({...cold,resource:cold.root,pointer:'/paths/~1p/get'}).parameters[0];
 assert.equal(parameter.name,'q');assert.equal(parameter.examples[0].name,'Repeated');
 if(field==='externalValue')assert.equal(parameter.examples[0].wireBase64,Buffer.from('q=a%2Bb&q=%2520').toString('base64'));
 else assert.equal(parameter.examples[0].raw,'["a+b","%20"]');
});

for(const charset of ['utf-8','us-ascii','iso-8859-1','windows-1252'])test(`R3c-3 form charset ${charset} uses established codec rules`,async()=>{
 const input=require('./migration_b05_r3c3_fixture.cjs')(),media=input.whole.content['application/x-www-form-urlencoded'];
 media.schema.properties.q.items.enum=['','a+b'];input.whole.content={['application/x-www-form-urlencoded; charset='+charset]:media};input.refresh();
 const plan=await planMigration(input);assert.equal(plan.complete,['utf-8','us-ascii'].includes(charset),JSON.stringify(plan.problems));
 if(!plan.complete)assert(plan.problems.some(problem=>problem.code==='migration.parameter.querystring-media-proof'&&problem.reason==='unavailable-proof'));
});

for(const media of ['application/octet-stream','application/x-www-form-urlencoded; charset=iso-8859-1'])
test(`R3c ${media} without a complete codec certificate remains unavailable proof`,async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')();
 input.value.components.parameters.Whole.content={[media]:{schema:{type:'string',enum:['']}}};
 input.resources[0].text=input.encode(input.value);const result=await planMigration(input);
 assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
 assert(result.problems.some(problem=>problem.code==='migration.parameter.querystring-media-proof'&&problem.reason==='unavailable-proof'),JSON.stringify(result.problems));
});

for(const targetVersion of ['3.1.2','3.0.4'])for(const required of [false,true])
test(`R3c empty whole-query data languages retain JSON media and required=${required} at ${targetVersion}`,async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')('3.2.1','json',targetVersion),whole=input.value.components.parameters.Whole;
 whole.required=required;whole.content={'application/json':{schema:false}};
 input.resources[0].text=input.encode(input.value);const result=await planMigration(input);
 assert.equal(result.complete,true,JSON.stringify(result.problems));
 const output=new SourceDocument(result.outputs.find(output=>output.id===result.outputRoot).text,result.outputRoot);
 assert.equal(output.dataNode('/components/parameters/Whole/in').value,'query');
 assert(output.dataNode('/components/parameters/Whole/content/application~1json/schema'));
 assert.equal(output.dataNode('/components/parameters/Whole/required').value,required);
});

test('R3c optional empty whole form objects preserve absence without inventing a field',async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')(),whole=input.value.components.parameters.Whole;
 whole.required=false;whole.content={'application/x-www-form-urlencoded':{schema:{type:'object',enum:[{}]}}};
 input.resources[0].text=input.encode(input.value);const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert(review.parameterChanges.some(change=>change.name==='descriptionOnly'&&change.before.startsWith('querystring')));
 const output=new SourceDocument(review.outputs.find(output=>output.id===review.outputRoot).text,review.outputRoot);
 assert.equal(output.dataNode('/components/parameters/Whole/name').value,'descriptionOnly');
 assert.equal(output.dataNode('/components/parameters/Whole/required').value,false);
});

for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const targetVersion of ['3.1.2','3.0.4'])
test(`R3c ${version} ${format} finite whole queries and literal cookies publish to ${targetVersion}`,async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')(version,format,targetVersion),original=input.resources[0].text;
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.producerVersion,'104');
 assert.equal(input.resources[0].text,original);assert.equal(analyse(input).complete,true);
 const resources=result.outputs.map(output=>({id:output.id,text:output.text,generation:0}));
 const packet={root:result.outputRoot,resources,snapshot:'r3c-cold'},doc=new SourceDocument(result.outputs.find(output=>output.id===result.outputRoot).text,result.outputRoot);
 assert.equal(analyse(packet).complete,true);
 assert.equal(doc.dataNode('/components/parameters/Whole/in').value,'query');
 assert.equal(doc.dataNode('/components/parameters/Whole/style').value,'form');
 assert.equal(doc.dataNode('/components/parameters/Whole/name').value,'descriptionOnly');
 assert.equal(doc.dataNode('/components/parameters/Whole/schema/additionalProperties').value,false);
 assert.equal(doc.dataNode('/components/parameters/Whole/examples/Plus/value/q').value,'a+b');
 assert(doc.dataNode('/components/parameters/Literal/content/text~1plain/schema'));
 assert.equal(doc.dataNode('/paths/~1p/get/parameters/1/style').value,'form');
 const values=['{"q":"a+b"}','{"q":"%20","flag":false}','{"q":""}','{}','{"q":"space here"}','{"q":"x","unknown":true}'];
 for(const [root,resources,pointer]of [[input.root,input.resources,'/components/parameters/Whole/content/application~1x-www-form-urlencoded/schema'],
  [packet.root,packet.resources,'/components/parameters/Whole/schema']]){
  const evaluated=await evaluateSchemas({root,resources,snapshot:'r3c-values',runtimeInstances:values.map(text=>({subject:'request-parameter',location:'whole',text,schema:{resource:root,pointer}}))});
  assert.equal(evaluated.complete,true,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.runtimeEvaluations.map(value=>value.valid),[true,true,true,false,false,false]);
 }
 if(targetVersion==='3.1.2'){
  const composed=await planMigration({...packet,targetVersion:'3.0.4',destination:'file:///composed-r3c/'});
  assert.equal(composed.complete,true,JSON.stringify(composed.problems));
 }
});

for(const [kind,value,code,reason]of [
 ['space',{q:'a b'},'migration.parameter.querystring-proof','unavailable-proof'],
 ['untyped-array',{q:['a']},'migration.parameter.querystring-proof','unavailable-proof'],
 ['nested',{q:{x:'a'}},'migration.parameter.querystring-proof','unavailable-proof'],
 ['empty',{},'migration.parameter.querystring-factorization','target-representation'],
])test(`R3c ${kind} whole-query values retain a precise unpublished boundary`,async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')(),whole=input.value.components.parameters.Whole;
 whole.content={'application/x-www-form-urlencoded':{schema:{type:'object',enum:[value]}}};
 input.resources[0].text=input.encode(input.value);
 const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
 assert(result.problems.some(problem=>problem.code===code&&problem.reason===reason),JSON.stringify(result.problems));
});

for(const [schema,code]of [
 [{type:'string',enum:['bad;value']},'migration.parameter.cookie-proof'],
 [{type:'string'},'migration.parameter.cookie-proof'],
])test(`R3c cookie octets/delimiters/lexical proof refusal ${JSON.stringify(schema)}`,async()=>{
 const input=require('./migration_b05_r3c_fixture.cjs')();input.value.components.parameters.Literal.schema=schema;
 input.resources[0].text=input.encode(input.value);const result=await planMigration(input);
 assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.code===code&&problem.reason==='unavailable-proof'),JSON.stringify(result.problems));
});
const versions={'2.0':'2.0','3.0':'3.0.4','3.1':'3.1.2','3.2':'3.2.1'};
for(const version of require('./migration_b05_r2_fixture.cjs').versions)for(const format of ['yaml','json'])test(`B05-R2 ${version} ${format} inactive parameter metadata and text content retain wire roles`,async()=>{
 const {render,reopened}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/parameters.'+format;
 const value={openapi:version,info:{title:'Parameter metadata',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/items':{get:{parameters:[
  {$ref:'#/components/parameters/Alias'},{name:'text',in:'query',content:{'text/plain':{schema:{type:'string',enum:['one','two']}}}},
  {name:'jsonFlag',in:'query',content:{'application/json':{schema:{type:'boolean'}}}}
 ],responses:{204:{description:'Empty',headers:{'X-Values':{$ref:'#/components/headers/Values'}}}}}}},components:{parameters:{
  Alias:{$ref:'#/components/parameters/Flag'},Flag:{name:'flag',in:'query',required:true,deprecated:false,allowReserved:true,examples:{},schema:{type:'boolean',example:false}}
 },headers:{Values:{deprecated:false,required:false,style:'simple',explode:true,schema:{type:'array',items:{type:'integer'}}}}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:'R2-parameters',targetVersion:'2.0',destination:'file:///review/parameters/'};
 const plan=await planMigration(input);assert.equal(plan.complete,true,JSON.stringify(plan.problems));
 const target=reopened(plan),doc=new SourceDocument(plan.outputs.find(o=>o.id===plan.outputRoot).text,plan.outputRoot);
 assert.equal(analyse(target).complete,true);const flat=doc.dataNode('/parameters/Flag').value;
 assert.equal(flat.in,'query');assert.equal(flat.required,true);assert.equal(flat.type,'boolean');
 for(const field of ['deprecated','allowReserved','examples','schema','content','style','explode'])assert.equal(Object.hasOwn(flat,field),false,field);
 const {requestOperation}=require('./dist/execution.cjs'),after=requestOperation({...target,resource:target.root,pointer:'/paths/~1items/get'});
 assert.deepEqual(after.parameters.map(p=>[p.name,p.in,p.required]),[['flag','query',true],['text','query',false],['jsonFlag','query',false]]);
 assert.equal(after.responses[0].headers[0].required,false);assert.equal(input.resources[0].text,text);
});
for(const format of ['yaml','json'])for(const kind of ['deprecated','reserved','example','named','required-header','json-content'])test(`B05-R2 ${format} active ${kind} retains a located precise refusal`,async()=>{
 const {render}=require('./migration_b05_r2_fixture.cjs'),root='file:///approved/refusal.'+format;
 const parameter={name:'q',in:'query',schema:{type:'string'}},header={schema:{type:'string'}};
 let code,reason='target-representation';
 if(kind==='deprecated'){parameter.deprecated=true;code='migration.parameter.deprecated';}
 if(kind==='reserved'){parameter.allowReserved=true;code='migration.parameter.allowReserved';}
 if(kind==='example'){parameter.example='';code='migration.parameter.examples';}
 if(kind==='named'){parameter.examples={Zero:{value:'0'},Other:{value:'1'}};code='migration.parameter.examples';}
 if(kind==='required-header'){header.required=true;code='migration.parameter.required';}
 if(kind==='json-content'){delete parameter.schema;parameter.content={'application/json':{schema:{type:'string'}}};code='migration.parameter.content-domain';}
 const value={openapi:'3.0.4',info:{title:'Active metadata',version:'1'},paths:{'/items':{get:{parameters:[parameter],responses:{204:{description:'Empty',headers:{'X-Value':header}}}}}}};
 const text=render(value,format),input={root,resources:[{id:root,text,generation:1}],snapshot:kind,targetVersion:'2.0',destination:'file:///review/refused/'};
 const result=await planMigration(input);assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
 const problem=result.problems.find(p=>p.code===code);assert(problem,JSON.stringify(result.problems));assert.equal(problem.reason,reason);assert(problem.range[1]>problem.range[0]);assert.equal(input.resources[0].text,text);
});
function capture(text,format='yaml',extras=[]){const root='file:///approved/api.'+format;return{root,snapshot:'migration',targetVersion:'3.2.1',destination:'file:///output/review/',resources:[{id:root,text,generation:1,identity:'source'},...extras]};}
for(const family of Object.keys(versions))for(const format of ['yaml','json'])for(const targetVersion of Object.values(versions))test(`migration ${family} ${format} → ${targetVersion} uses native target rules and preserves source`,async()=>{
 const text=fs.readFileSync(`${__dirname}/fixtures/native-families/${family}-valid.${format}`,'utf8'),input={...capture(text,format),targetVersion},result=await planMigration(input);
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.status,'faithfully-convertible');assert(result.identity);assert.equal(result.target.declaredVersion,targetVersion);
 assert.equal(input.resources[0].text,text);assert(result.outputs[0].text.includes('9007199254740993.00'));assert(result.invariants.requests);
 const resources=result.outputs.map(output=>({id:output.id,text:output.text,generation:0,aliases:Object.entries(result.manifest.resourceMappings).filter(([,path])=>path===output.path).map(([uri])=>uri)}));
 const after={root:result.outputRoot,snapshot:'after',resources};assert.equal(analyse(after).status,'complete');assert.equal((await evaluateSchemas(after)).complete,true);
});
test('3.0 nullable/composition and exact boolean bounds migrate with behavior-sensitive runtime comparisons and comments',async()=>{
 const input=capture('# Top\r\nopenapi: 3.0.4\r\ninfo: {title: Exact, version: "1"}\r\npaths: {}\r\ncomponents:\r\n  schemas:\r\n    N:\r\n      type: integer\r\n      minimum: 9007199254740993 # bound\r\n      exclusiveMinimum: true # strict\r\n    S: {type: string, nullable: true, enum: [text]}\r\n    F: {type: integer, exclusiveMaximum: false} # keep\r\nx-number: 9007199254740993.00\r\n');
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));const text=result.outputs[0].text;assert(text.includes('# bound'));assert(text.includes('# strict'));assert(text.includes('# keep'));assert(text.startsWith('# Top\r\n'));
 for(const [pointer,samples]of [['/components/schemas/N',['9007199254740993','9007199254740994','9007199254740993.1']],['/components/schemas/S',['null','"text"','"other"']]]){
  const instances=samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:input.root,pointer}})),before=await evaluateSchemas({...input,runtimeInstances:instances}),after=await evaluateSchemas({root:result.outputRoot,snapshot:'after',resources:[{id:result.outputs[0].id,text,generation:0}],runtimeInstances:instances.map(instance=>({...instance,schema:{...instance.schema,resource:result.outputRoot}}))});
  assert.equal(after.complete,true);assert.deepEqual(before.runtimeEvaluations.map(e=>e.valid),after.runtimeEvaluations.map(e=>e.valid));
 }
});
test('migration rewrites recursive cross-file references and escaped pointers without rewriting literal payload refs',async()=>{
 const input=capture('openapi: 3.0.4\ninfo: {title: External, version: "1"}\npaths: {}\ncomponents:\n  schemas:\n    Model: {$ref: "model.yaml#/a~1b"}\nx-data: {$ref: "model.yaml#/a~1b"}\n','yaml',[{id:'file:///approved/model.yaml',generation:2,text:'# Keep model\na/b: {type: object, properties: {next: {$ref: "#/a~1b"}}}\n'}]);
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.outputs.length,2);assert(result.outputs[0].text.includes('model.yaml#/a~1b'));assert(result.outputs[1].text.includes('# Keep model'));assert(result.outputs.some(output=>output.text.includes('resources/')));
});
test('ignored reference siblings require a bound explicit decision, never silent activation or source loss',async()=>{
 const input=capture('openapi: 3.0.4\ninfo: {title: Reference, version: "1"}\npaths: {}\ncomponents:\n  schemas:\n    Value: {type: string}\n    Use: {$ref: "#/components/schemas/Value", type: integer}\n');
 const review=await planMigration(input);assert.equal(review.status,'requires-decision');assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert.equal(review.problems[0].pointer,'/components/schemas/Use');
 const accepted=await planMigration({...input,decisions:{[review.problems[0].id]:'discard-ignored-siblings'}});assert.equal(accepted.complete,true,JSON.stringify(accepted.problems));assert.equal(input.resources[0].text.includes('type: integer'),true);
 await assert.rejects(planMigration({...input,decisions:{unrelated:'discard-ignored-siblings'}}),e=>e.code==='migration.decisions.stale');
});
test('modern nullable annotation is never activated by a downgrade without a decision',async()=>{
 const input={...capture('openapi: 3.1.2\ninfo: {title: Annotation, version: "1"}\npaths: {}\ncomponents: {schemas: {Value: {type: string, nullable: true}}}\n'),targetVersion:'3.0.4'};
 const result=await planMigration(input);assert.equal(result.status,'requires-decision');assert(result.problems.some(p=>p.code==='migration.schema.annotation-activation'));
});
test('genuine target incompatibilities and incomplete converter mappings remain located blockers with no output',async()=>{
 for(const [text,targetVersion,code]of [
  ['openapi: 3.2.1\ninfo: {title: Query, version: "1"}\npaths: {/x: {query: {responses: {204: {description: Empty}}}}}\n','3.1.2','migration.operation.method'],
  ['openapi: 3.1.2\ninfo: {title: Resource, version: "1"}\npaths: {}\ncomponents: {schemas: {Value: {$id: value, $dynamicAnchor: tree, type: object, properties: {child: {$dynamicRef: "#tree"}}}, Peer: {$id: peer, $dynamicAnchor: tree, type: string}}}\n','3.0.4','migration.schema.dynamic-anchor'],
 ]){const input={...capture(text),targetVersion},result=await planMigration(input);assert.equal(result.status,'blocked');assert.equal(result.outputs.length,0);assert(result.problems.some(p=>p.code===code&&p.resource===input.root&&p.pointer&&p.range[1]>p.range[0]),JSON.stringify(result.problems));assert.equal(input.resources[0].text,text);}
});
test('Swagger body inheritance, media, primitive parameters, security and response examples migrate structurally',async()=>{
 const input=capture('swagger: "2.0"\ninfo: {title: Body, version: "1"}\nhost: api.invalid\nbasePath: /v1\nschemes: [https]\nconsumes: [application/json]\nproduces: [application/json]\nsecurityDefinitions:\n  Basic: {type: basic}\n  OAuth: {type: oauth2, flow: application, tokenUrl: https://api.invalid/token, scopes: {write: Write}}\nsecurity: [{Basic: []}]\nparameters:\n  Body:\n    name: payload\n    in: body\n    required: true\n    description: Body\n    schema: {$ref: "#/definitions/Pet"}\npaths:\n  /pets:\n    parameters: [{$ref: "#/parameters/Body"}]\n    post:\n      parameters: [{name: q, in: query, type: array, items: {type: string}, collectionFormat: multi}]\n      responses:\n        "200":\n          description: Created\n          schema: {$ref: "#/definitions/Pet"}\n          examples: {application/json: {id: 9007199254740993.00, $ref: literal}}\ndefinitions:\n  Pet: {type: object, properties: {id: {type: integer}}}\n');
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));const out=new SourceDocument(result.outputs[0].text,result.outputRoot);
 assert(out.dataNode('/paths/~1pets/post/requestBody'));assert(!out.dataNode('/paths/~1pets/parameters/0'));assert(out.dataNode('/components/requestBodies'));assert.equal(out.dataNode('/components/securitySchemes/Basic/type').value,'http');assert(out.dataNode('/components/securitySchemes/OAuth/flows/clientCredentials/tokenUrl'));
 assert(result.outputs[0].text.includes('9007199254740993.00'));assert(result.outputs[0].text.includes('$ref: literal'));
});
test('Swagger formData becomes a media-specific request schema and encoding, including file properties',async()=>{
 const input={...capture('swagger: "2.0"\ninfo: {title: Form, version: "1"}\nhost: api.invalid\nschemes: [https]\nconsumes: [multipart/form-data]\nproduces: [application/json]\npaths:\n  /upload:\n    post:\n      parameters:\n        - {name: file, in: formData, required: true, type: file}\n        - {name: tags, in: formData, type: array, items: {type: string}, collectionFormat: multi}\n      responses: {204: {description: Empty}}\n'),targetVersion:'3.0.4'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));const doc=new SourceDocument(result.outputs[0].text,result.outputRoot),base='/paths/~1upload/post/requestBody/content/multipart~1form-data';
 assert.equal(doc.dataNode(base+'/schema/properties/file/format').value,'binary');assert.equal(doc.dataNode(base+'/encoding/tags'),undefined);assert.deepEqual(doc.dataNode(base+'/schema/required').value,['file']);assert.equal(result.invariants.requests,'effective-url-serialization-security-and-media');
});
test('a changed source graph cannot reuse a previous decision identity',async()=>{
 const input=capture('openapi: 3.0.4\ninfo: {title: Bound, version: "1"}\npaths: {}\ncomponents: {schemas: {A: {type: string}, B: {$ref: "#/components/schemas/A", type: integer}}}\n');
 const review=await planMigration(input),changed={...input,resources:input.resources.map(resource=>({...resource,text:resource.text.replace('type: integer','type: number')})),decisions:{[review.problems[0].id]:'discard-ignored-siblings'}};
 await assert.rejects(planMigration(changed),error=>error.code==='migration.decisions.stale');
});
for(const targetVersion of ['3.0.4','2.0'])test(`static resource identities, anchors, nested definitions and const intersections migrate faithfully to ${targetVersion}`,async()=>{
 const input={...capture('openapi: 3.2.1\ninfo: {title: Static resource, version: "1"}\npaths: {}\ncomponents: {schemas: {Model: {$ref: "models.json"}}}\n','yaml',[{id:'file:///approved/models.json',generation:2,text:'{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://schemas.invalid/tree","type":"object","properties":{"value":{"$ref":"#needle"}},"$defs":{"a/b":{"$anchor":"needle","type":"integer","enum":[9007199254740992,9007199254740993],"const":9007199254740993}}}'}]),targetVersion};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.outputs.length,2);
 const pointer=targetVersion==='2.0'?'/definitions/Model':'/components/schemas/Model',samples=['{"value":9007199254740993}','{"value":9007199254740992}','{"value":9007199254740994}'];
 const before=await evaluateSchemas({...input,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:input.root,pointer:'/components/schemas/Model'}}))});
 const resources=result.outputs.map(output=>({id:output.id,text:output.text,generation:0}));
 const after=await evaluateSchemas({root:result.outputRoot,snapshot:'target',resources,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:result.outputRoot,pointer}}))});
 assert.equal(before.complete,true,JSON.stringify(before.findings));assert.equal(after.complete,true,JSON.stringify(after.findings));assert.deepEqual(after.runtimeEvaluations.map(e=>e.valid),[true,false,false]);assert.deepEqual(after.runtimeEvaluations.map(e=>e.valid),before.runtimeEvaluations.map(e=>e.valid));
 assert.equal(analyse({root:result.outputRoot,snapshot:'cold',resources}).status,'complete');assert(result.outputs.some(output=>output.text.includes('9007199254740993')));
});
test('Swagger downgrade represents a closed positional tuple by exact maxItems and native tuple items',async()=>{
 const input={...capture('{"openapi":"3.2.1","info":{"title":"Tuple","version":"1"},"paths":{},"components":{"schemas":{"Tuple":{"type":"array","prefixItems":[{"type":"integer"},{"type":"string"}],"items":false,"maxItems":1e999}}}}','json'),targetVersion:'2.0'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const samples=['[]','[1]','[1,"x"]','[1,"x",3]','["x"]'];
 const before=await evaluateSchemas({...input,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:input.root,pointer:'/components/schemas/Tuple'}}))});
 const after=await evaluateSchemas({root:result.outputRoot,snapshot:'target',resources:result.outputs.map(output=>({id:output.id,text:output.text,generation:0})),runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:result.outputRoot,pointer:'/definitions/Tuple'}}))});
 assert.equal(after.complete,true,JSON.stringify(after.findings));assert.deepEqual(after.runtimeEvaluations.map(e=>e.valid),[true,true,true,false,false]);assert.deepEqual(before.runtimeEvaluations.map(e=>e.valid),after.runtimeEvaluations.map(e=>e.valid));
});

for(const media of ['application/x-www-form-urlencoded','multipart/form-data'])for(const format of ['csv','ssv','pipes','multi'])test(`Swagger ${media} ${format} migration checks actual target encoding rules`,async()=>{
 const text=`swagger: '2.0'
info: {title: Encoding, version: '1'}
host: api.invalid
schemes: [https]
consumes: [${media}]
paths:
  /form:
    post:
      parameters: [{in: formData, name: tags, type: array, items: {type: string}, collectionFormat: ${format}}]
      responses: {'204': {description: ok}}
`;
 const input={...capture(text),targetVersion:'3.0.4'},result=await planMigration(input);
 if(media==='multipart/form-data'&&format!=='multi'){
  assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);
  assert(result.problems.some(problem=>problem.code==='migration.form.collection'&&problem.reason==='target-representation'&&problem.pointer.endsWith('/collectionFormat')));
 }else{
  assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.invariants.requests,'effective-url-serialization-security-and-media');
  const doc=new SourceDocument(result.outputs[0].text,result.outputRoot),pointer='/paths/~1form/post/requestBody/content/'+media.replaceAll('~','~0').replaceAll('/','~1')+'/encoding/tags';
  if(media==='multipart/form-data')assert.equal(doc.dataNode(pointer),undefined);
  else {assert.equal(doc.dataNode(pointer+'/style').value,format==='ssv'?'spaceDelimited':format==='pipes'?'pipeDelimited':'form');assert.equal(doc.dataNode(pointer+'/explode').value,format==='multi');}
 }
 assert.equal(input.resources[0].text,text);
});

for(const source of ['3.0.4','3.1.2'])for(const explode of [false,true])test(`multipart migration ${source} explode=${explode} preserves the active serialization`,async()=>{
 const target=source==='3.0.4'?'3.1.2':'3.0.4',text=`openapi: ${source}
info: {title: Encoding, version: '1'}
servers: [{url: 'https://api.invalid'}]
paths:
  /form:
    post:
      requestBody:
        content:
          multipart/form-data:
            schema: {type: object, properties: {tags: {type: array, items: {type: string}}}}
            encoding: {tags: {contentType: application/json, style: form, explode: ${explode}}}
      responses: {'204': {description: ok}}
`;
 const result=await planMigration({...capture(text),targetVersion:target});
 if(source==='3.1.2'&&!explode){assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);assert(result.problems.some(problem=>problem.code==='migration.encoding.multipart'&&problem.reason==='target-representation'));}
 else {
  assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.invariants.requests,'effective-url-serialization-security-and-media');
  const doc=new SourceDocument(result.outputs[0].text,result.outputRoot),at='/paths/~1form/post/requestBody/content/multipart~1form-data/encoding/tags';
  assert.equal(doc.dataNode(at+'/style'),undefined);assert.equal(doc.dataNode(at+'/explode'),undefined);
  assert.equal(doc.dataNode(at+'/contentType').value,source==='3.0.4'?'application/json':'text/plain');
 }
});

for(const format of ['yaml','json'])test(`${format} a Swagger base-only discriminator has a real selection mapping`,async()=>{
 const value={swagger:'2.0',info:{title:'Model',version:'1'},paths:{},definitions:{Base:{type:'object',required:['kind'],properties:{kind:{type:'string'}},discriminator:'kind'}}};
 const text=format==='json'?JSON.stringify(value):require('yaml').stringify(value),input={...capture(text,format),targetVersion:'3.0.4'};
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));
 const before=await evaluateSchemas({...input,runtimeInstances:['{}','{"kind":"Base"}','{"kind":"Unknown"}'].map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:input.root,pointer:'/definitions/Base'}}))});
 const after=await evaluateSchemas({root:result.outputRoot,snapshot:'single-dispatch',resources:result.outputs.map(value=>({...value,generation:0})),runtimeInstances:['{}','{"kind":"Base"}','{"kind":"Unknown"}'].map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:result.outputRoot,pointer:'/components/schemas/Base'}}))});
 assert.equal(after.complete,true);assert.deepEqual(after.runtimeEvaluations.map(value=>value.valid),[false,true,false]);assert.deepEqual(after.runtimeEvaluations.map(value=>value.valid),before.runtimeEvaluations.map(value=>value.valid));assert.equal(input.resources[0].text,text);
});

for(const version of ['3.2.0','3.2.1'])for(const format of ['yaml','json'])for(const targetVersion of ['3.1.2','3.0.4'])for(const required of [false,true])
test(`R3c-1 ${version} ${format} repeated array → ${targetVersion}, required=${required}`,async()=>{
 const input=require('./migration_b05_r3c1_fixture.cjs')(version,format,targetVersion,required),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const resources=review.outputs.map(output=>({id:output.id,text:output.text,generation:0})),root=review.outputRoot;
 const doc=new SourceDocument(resources.find(value=>value.id===root).text,root),base='/components/parameters/Whole';
 assert.equal(doc.dataNode(base+'/name').value,'q');assert.equal(doc.dataNode(base+'/required').value,required);
 assert.equal(doc.dataNode(base+'/explode').value,true);
 const values=['[]','[""]','["a+b","a+b"]','["%20","雪"]','["a","a","a"]','["other"]'];
 const results=[];
 for(const [packet,pointer,wrap]of [[input,base+'/content/application~1x-www-form-urlencoded/schema',true],[{root,resources,snapshot:'cold-array'},base+'/schema',false]]){
  const result=await evaluateSchemas({...packet,runtimeInstances:values.map(text=>({subject:'request-parameter',location:'array',text:wrap?'{"q":'+text+'}':text,schema:{resource:packet.root,pointer}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));results.push(result.runtimeEvaluations.map(value=>value.valid));
 }
 assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],[!required,true,true,true,false,false]);
 if(targetVersion==='3.1.2')assert.equal((await planMigration({root,resources,snapshot:'array-composed',targetVersion:'3.0.4',destination:'file:///composed-array/'})).complete,true);
});

for(const mutation of ['space','correlation','required-empty','unbounded'])test(`R3c-1 ${mutation} retains unpublished proof boundary`,async()=>{
 const input=require('./migration_b05_r3c1_fixture.cjs')(),whole=input.value.components.parameters.Whole,schema=whole.content['application/x-www-form-urlencoded'].schema;
 if(mutation==='space')input.value.components.schemas.Item.enum=['a b'];
 if(mutation==='correlation'){schema.properties.flag={type:'boolean'};schema.dependentRequired={q:['flag']};}
 if(mutation==='required-empty'){whole.required=true;schema.required=['q'];}
 if(mutation==='unbounded')delete schema.properties.q.maxItems;
 input.resources[0].text=input.encode(input.value);const review=await planMigration(input);
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code===(['correlation','required-empty'].includes(mutation)?'migration.parameter.querystring-factorization':'migration.parameter.querystring-proof')&&problem.reason===(['correlation','required-empty'].includes(mutation)?'target-representation':'unavailable-proof')),JSON.stringify(review.problems));
});

for(const targetVersion of ['3.1.2','3.0.4'])test(`R3c-1 exact numeric array elements at ${targetVersion}`,async()=>{
 const input=require('./migration_b05_r3c1_fixture.cjs')('3.2.1','json',targetVersion,true);
 input.value.components.schemas.Item={type:'integer',enum:['EXACT']};
 input.resources[0].text=input.encode(input.value).replaceAll('"EXACT"','9007199254740993.00');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const packet={root:review.outputRoot,resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0})),snapshot:'exact-array'};
 assert(review.outputs.some(output=>output.text.includes('9007199254740993.00')));
 for(const capture of [input,packet]){
  const result=await evaluateSchemas({...capture,runtimeInstances:['q=9007199254740993.00&q=9007199254740993.00','q=9007199254740992'].map(text=>({subject:'request-parameter',location:text,text,parameter:{resource:capture.root,pointer:'/components/parameters/Whole'}}))});
  assert.equal(result.complete,true);assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[true,false]);
 }
});

for(const version of ['3.2.0','3.2.1'])for(const format of ['json','yaml'])for(const targetVersion of ['3.1.2','3.0.4','2.0'])for(const mode of ['independent','required','all-required'])
test(`R3c-2 ${version} ${format} ${mode} complete field product → ${targetVersion}`,async()=>{
 const input=require('./migration_b05_r3c2_fixture.cjs')(version,format,targetVersion,mode),text=input.resources[0].text;
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));assert.equal(input.resources[0].text,text);
 const {requestOperation}=require('./dist/execution.cjs'),packet={root:review.outputRoot,resources:review.outputs.map(output=>({...output,generation:0})),snapshot:'factor-cold'};
 assert.equal(analyse(packet).complete,true,JSON.stringify(analyse(packet).findings));
 for(const pointer of ['/paths/~1p/get','/paths/~1shared/get']){
  const plan=requestOperation({...packet,resource:packet.root,pointer}),fields=plan.parameters;
  assert.deepEqual(new Set(fields.map(field=>field.name)),new Set(['q','flag','text']));assert(fields.every(field=>field.in==='query'));
  assert.equal(fields.find(field=>field.name==='q').required,mode==='all-required');
  assert.equal(fields.find(field=>field.name==='flag').required,mode!=='independent');
  assert.equal(fields.find(field=>field.name==='text').required,mode==='all-required');
 }
 assert(review.parameterChanges.some(change=>change.after.endsWith(' · q')));
 assert(review.parameterChanges.some(change=>change.after.endsWith(' · flag')));
 if(targetVersion==='3.1.2')for(const next of ['3.0.4','2.0']){
  const composed=await planMigration({...packet,targetVersion:next,destination:'file:///factor-composed/'});assert.equal(composed.complete,true,JSON.stringify(composed.problems));
 }
});

for(const mode of ['optional-group','required-empty','dependent','conditional','exclusive','counts','correlated'])for(const targetVersion of ['3.1.2','3.0.4','2.0'])
test(`R3c-2 ${mode} retains a precise target restriction at ${targetVersion}`,async()=>{
 const input=require('./migration_b05_r3c2_fixture.cjs')('3.2.1','json',targetVersion,mode),review=await planMigration(input);
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);assert.deepEqual(review.changes,[]);
 assert(review.problems.some(problem=>problem.code==='migration.parameter.querystring-factorization'&&problem.reason==='target-representation'),JSON.stringify(review.problems));
});

for(const targetVersion of ['3.1.2','3.0.4','2.0'])test(`R3c-2 finite composition and exact scalar/array numbers at ${targetVersion}`,async()=>{
 const input=require('./migration_b05_r3c2_fixture.cjs')('3.2.1','json',targetVersion,'required');
 input.schema.properties.count={type:'integer',enum:['EXACT']};
 input.schema.allOf=[{if:{required:['flag'],properties:{flag:{const:true}}},then:{properties:{text:{enum:['','%20','雪']}}}}];
 input.value.components.schemas.Item={type:'integer',enum:['EXACT']};
 input.resources[0].text=input.encode(input.value).replaceAll('"EXACT"','9007199254740993.00');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert(review.outputs.some(output=>output.text.includes('9007199254740993.00')));
});

for(const targetVersion of ['3.1.2','3.0.4','2.0'])test(`R3c-2 ${targetVersion} several independent scalar fields`,async()=>{
 const input=require('./migration_b05_r3c2_fixture.cjs')('3.2.1','json',targetVersion);
 input.schema.properties.q={type:'string',enum:['','a+b']};
 input.resources[0].text=input.encode(input.value);const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const {requestOperation}=require('./dist/execution.cjs'),packet={root:review.outputRoot,resources:review.outputs.map(output=>({...output,generation:0})),snapshot:'scalar-factors'};
 const plan=requestOperation({...packet,resource:packet.root,pointer:'/paths/~1p/get'});
 assert.equal(plan.parameters.length,3);assert(plan.parameters.every(parameter=>parameter.in==='query'&&!parameter.required));
});

for(const targetVersion of ['3.1.2','3.0.4','2.0'])for(const layer of ['media','schema'])test(`R3c-2 ${targetVersion} extracted ${layer} examples retain missing-field selection restriction`,async()=>{
 const input=require('./migration_b05_r3c2_fixture.cjs')('3.2.1','json',targetVersion);
 if(layer==='media')input.whole.content['application/x-www-form-urlencoded'].examples={Empty:{dataValue:{q:[],flag:false}}};
 else input.schema.examples=[{q:[],flag:false}];
 input.resources[0].text=input.encode(input.value);const review=await planMigration(input);
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code==='migration.parameter.querystring-example-target'&&problem.reason==='target-representation'),JSON.stringify(review.problems));
});

for(const targetVersion of ['3.1.2','3.0.4','2.0'])test(`R3c-2 ${targetVersion} required whole group cannot become one optional array`,async()=>{
 const input=require('./migration_b05_r3c1_fixture.cjs')('3.2.1','json',targetVersion,false);
 input.value.components.parameters.Whole.required=true;
 if(targetVersion==='2.0'){
  delete input.value.components.parameters.Literal;
  delete input.value.paths['/p'].get.parameters;
  input.value.paths['/shared'].get.parameters.pop();
 }
 input.resources[0].text=input.encode(input.value);const review=await planMigration(input);
 assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(problem=>problem.code==='migration.parameter.querystring-factorization'&&problem.reason==='target-representation'),JSON.stringify(review.problems));
});

for(const targetVersion of ['3.1.2','3.0.4','2.0'])test(`R3c-2 ${targetVersion} preserves Unicode and delimiter field names and required empty strings`,async()=>{
 const input=require('./migration_b05_r3c2_fixture.cjs')('3.2.1','json',targetVersion,'required'),name='tag+雪&%[]';
 input.schema.properties[name]=input.schema.properties.q;delete input.schema.properties.q;
 input.schema.properties.flag={type:'string',enum:['']};
 input.resources[0].text=input.encode(input.value);const review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const {requestOperation}=require('./dist/execution.cjs'),packet={root:review.outputRoot,resources:review.outputs.map(output=>({...output,generation:0})),snapshot:'named-factors'};
 const plan=requestOperation({...packet,resource:packet.root,pointer:'/paths/~1p/get'});
 assert(plan.parameters.some(parameter=>parameter.name===name));assert(plan.parameters.find(parameter=>parameter.name==='flag').required);
});
