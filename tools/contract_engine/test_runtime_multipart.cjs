const {test}=require('node:test');
const assert=require('node:assert/strict');
const YAML=require('yaml');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const exact='__exact_decimal__';
const pointer=value=>value.replaceAll('~','~0').replaceAll('/','~1');
function capture(version,format,media,subject='request-body',type='multipart/mixed'){
 const root='file:///multipart/api.'+format;
 const content={[type]:media},value={openapi:version,info:{title:'MIME',version:'unchanged-api-version'},paths:{'/parts':{post:{requestBody:{content},responses:{200:{description:'OK',content}}}}}};
 const at='/paths/~1parts/post/'+(subject==='request-body'?'requestBody':'responses/200')+'/content/'+pointer(type);
 const text=(format==='json'?JSON.stringify(value):'# Keep 雪 and exact decimal\r\n'+YAML.stringify(value).replaceAll('\n','\r\n')).replaceAll(format==='json'?'"'+exact+'"':exact,'9007199254740993.00');
 return {root,snapshot:version+format+subject,resources:[{id:root,text,generation:7}],at,subject,hasSchema:Object.hasOwn(media,'schema'),hasItemSchema:Object.hasOwn(media,'itemSchema')};
}
function wire(parts,boundary='Fixture',prefix=''){
 return prefix+parts.map(part=>'--'+boundary+'\r\n'+Object.entries(part.headers??{}).map(([name,value])=>name+': '+value+'\r\n').join('')+'\r\n'+part.body+'\r\n').join('')+'--'+boundary+'--\r\nignored epilogue';
}
async function run(input,text,type='multipart/mixed; boundary="Fixture"'){
 const {at,subject,hasSchema,hasItemSchema,...source}=input;
 const result=await evaluateSchemas({...source,runtimeInstances:[{subject,location:type,text:Buffer.from(text).toString('base64'),mediaType:type,mediaBase64:true,
  form:{resource:source.root,pointer:at},
  ...(hasSchema?{schema:{resource:source.root,pointer:at+'/schema'}}:{}),
  ...(hasItemSchema?{itemSchema:{resource:source.root,pointer:at+'/itemSchema'}}:{}),
 }]});
 return {result,valid:result.runtimeEvaluations.every(value=>value.valid===true),findings:result.runtimeFindings};
}
const ordered={schema:{type:'array',minItems:2,maxItems:2,prefixItems:[{type:'object',required:['id'],properties:{id:{type:'integer',enum:[exact]}},additionalProperties:false},{type:'string',maxLength:0}],items:false},
 prefixEncoding:[{contentType:'application/json'},{contentType:'text/plain; charset=utf-8'}]};
const parts=[{headers:{'Content-Type':'application/json'},body:'{"id":9007199254740993.00}'},{headers:{'Content-Type':'text/plain; charset=utf-8'},body:''}];
for(const version of ['3.2.0','3.2.1'])for(const format of ['json','yaml'])for(const subject of ['request-body','response-body'])test(`${version} ${format} ${subject} ordered parts keep exact values and empty strings`,async()=>{
 const input=capture(version,format,ordered,subject),original=input.resources[0].text;
 const valid=await run(input,wire(parts,'Fixture','ignored preamble\r\n'));
 assert.equal(valid.result.complete,true,JSON.stringify(valid.findings));assert.equal(valid.valid,true,JSON.stringify(valid.findings));
 for(const text of [wire(parts).replace('9007199254740993.00','9007199254740992'),wire(parts).replace('"id":','"missing":'),wire(parts.slice(0,1)),wire([...parts,{body:'extra'}])]){
  const bad=await run(input,text);assert.equal(bad.result.complete,true,JSON.stringify(bad.findings));assert.equal(bad.valid,false,JSON.stringify(bad.findings));
 }
 assert.equal(input.resources[0].text,original);
});
for(const version of ['3.2.0','3.2.1'])for(const format of ['json','yaml'])test(`${version} ${format} nested positional and named parts use the whole original schema`,async()=>{
 const nested={schema:{type:'array',minItems:2,maxItems:2,prefixItems:[{type:'array',items:{type:'integer'},const:[0,1]},{type:'object',required:['flag','number'],properties:{flag:{type:'boolean',const:false},number:{type:'integer',const:exact}},additionalProperties:false}]},
  prefixEncoding:[{contentType:'application/json'},{contentType:'multipart/form-data',encoding:{flag:{contentType:'text/plain'},number:{contentType:'text/plain'}}}]};
 const input=capture(version,format,nested);
 const body=wire([{headers:{'Content-Type':'application/json'},body:'[0,1]'},{headers:{'Content-Type':'multipart/form-data; boundary=Inner'},body:wire([
  {headers:{'Content-Disposition':'form-data; name="flag"','Content-Type':'text/plain'},body:'false'},
  {headers:{'Content-Disposition':'form-data; name="number"','Content-Type':'text/plain'},body:'9007199254740993'},
 ],'Inner')}]);
 const positive=await run(input,body);assert.equal(positive.result.complete,true,JSON.stringify(positive.findings));assert.equal(positive.valid,true,JSON.stringify(positive.findings));
 const negative=await run(input,body.replace('false','true'));assert.equal(negative.result.complete,true);assert.equal(negative.valid,false);
 const rounded=await run(input,body.replace('9007199254740993','9007199254740992'));assert.equal(rounded.result.complete,true);assert.equal(rounded.valid,false);
});
for(const version of ['3.2.0','3.2.1'])test(`${version} independent itemSchema and surplus prefixEncoding retain their own checks`,async()=>{
 const input=capture(version,'yaml',{schema:{type:'array',minItems:1},itemSchema:{type:'integer',minimum:exact},prefixEncoding:[{contentType:'text/plain'},{contentType:'application/unsupported'}],itemEncoding:{contentType:'text/plain'}});
 const positive=await run(input,wire([{body:'9007199254740993'}]));assert.equal(positive.result.complete,true,JSON.stringify(positive.findings));assert.equal(positive.valid,true,JSON.stringify(positive.findings));assert.equal(positive.result.runtimeEvaluations.length,2);
 const negative=await run(input,wire([{body:'9007199254740992'}]));assert.equal(negative.result.complete,true);assert.equal(negative.valid,false);assert(negative.findings.some(f=>f.schema?.pointer===input.at+'/itemSchema'));
});
test('generic MIME part headers enforce required, false schemas and exact simple-style numbers',async()=>{
 const input=capture('3.2.1','json',{schema:{type:'array',items:{type:'string'}},itemEncoding:{contentType:'text/plain',headers:{'Content-Location':{required:true,schema:{type:'string',const:'https://example.invalid/%E9%9B%AA'}},'Content-ID':{schema:false},'X-Count':{schema:{type:'integer',enum:[exact]}}}}});
 const part={headers:{'Content-Location':'https://example.invalid/%E9%9B%AA','X-Count':'9007199254740993'},body:'value'};
 const valid=await run(input,wire([part]));assert.equal(valid.result.complete,true,JSON.stringify(valid.findings));assert.equal(valid.valid,true,JSON.stringify(valid.findings));
 for(const headers of [{...part.headers,'Content-ID':'forbidden'},{'X-Count':'9007199254740993'},{...part.headers,'X-Count':'9007199254740992'}]){
  const invalid=await run(input,wire([{...part,headers}]));assert.equal(invalid.result.complete,true,JSON.stringify(invalid.findings));assert.equal(invalid.valid,false);assert(invalid.findings.some(f=>f.source?.resource===input.root||f.schema?.resource===input.root));
 }
});
for(const format of ['json','yaml'])test(`${format} ordered form-data keeps repeated names as distinct array positions`,async()=>{
 const schema={type:'array',minItems:3,maxItems:3,prefixItems:[
  {type:'object',required:['item'],properties:{item:{type:'integer',const:0}},additionalProperties:false},
  {type:'object',required:['item'],properties:{item:{type:'boolean',const:false}},additionalProperties:false},
  {type:'object',required:['雪'],properties:{'雪':{type:'string',const:'café 東京'}},additionalProperties:false},
 ],items:false};
 const input=capture('3.2.1',format,{schema,prefixEncoding:[{contentType:'text/plain'},{contentType:'text/plain'},{contentType:'text/plain; charset=utf-8'}]},'request-body','multipart/form-data');
 const body=wire([['item','0'],['item','false'],['雪','café 東京']].map(([name,body])=>({headers:{'Content-Disposition':'form-data; name="'+name+'"','Content-Type':'text/plain; charset=utf-8'},body})));
 const valid=await run(input,body,'multipart/form-data; boundary=Fixture');assert.equal(valid.result.complete,true,JSON.stringify(valid.findings));assert.equal(valid.valid,true,JSON.stringify(valid.findings));
 const invalid=await run(input,body.replace('false','true'),'multipart/form-data; boundary=Fixture');assert.equal(invalid.result.complete,true);assert.equal(invalid.valid,false);
});
test('nested unnamed parts retain scalar types, encoded strings and annotation ownership through references',async()=>{
 const input=capture('3.2.1','yaml',{schema:{type:'array',minItems:1,maxItems:1,prefixItems:[{$ref:'values.yaml#/Values'}]},prefixEncoding:[{contentType:'multipart/mixed',prefixEncoding:[{contentType:'application/octet-stream'}],itemEncoding:{contentType:'text/plain'}}]});
 input.resources.push({id:'file:///multipart/values.yaml',generation:2,text:'Values:\n  type: array\n  minItems: 4\n  maxItems: 4\n  prefixItems:\n    - {type: string, contentEncoding: base64, const: AP8=}\n    - {type: "null"}\n    - {type: boolean, const: false}\n    - {type: integer, const: 0}\n  items: false\n'});
 const inner=wire([{headers:{'Content-Type':'application/octet-stream','Content-Transfer-Encoding':'base64'},body:'AP8='},{body:'null'},{body:'false'},{body:'0'}],'Nested');
 const body=wire([{headers:{'Content-Type':'multipart/mixed; boundary=Nested'},body:inner}]);
 const valid=await run(input,body);assert.equal(valid.result.complete,true,JSON.stringify(valid.findings));assert.equal(valid.valid,true,JSON.stringify(valid.findings));
 const invalid=await run(input,body.replace('AP8=','AP4='));assert.equal(invalid.result.complete,true);assert.equal(invalid.valid,false);
 const conflict=await run(input,body.replace('Content-Transfer-Encoding: base64','Content-Transfer-Encoding: binary'));assert.equal(conflict.result.complete,false);assert(conflict.findings.some(f=>f.detailCode==='runtime.form.transfer.undefined'&&f.source?.resource==='file:///multipart/values.yaml'));
});
for(const [label,mutate]of [
 ['missing closing delimiter',text=>text.replace('--Fixture--','--Other--')],
 ['duplicate content type',text=>text.replace('Content-Type: application/json','Content-Type: application/json\r\nContent-Type: text/plain')],
 ['invalid header',text=>text.replace('Content-Type: application/json','bad header: application/json')],
 ['unfinished header',text=>text.replace('Content-Type: application/json\r\n\r\n','Content-Type: application/json\r\n')],
])test(`${label} is invalid MIME, never a clean schema result`,async()=>{
 const input=capture('3.2.1','json',ordered),original=input.resources[0].text,result=await run(input,mutate(wire(parts)));
 assert.equal(result.result.complete,true,JSON.stringify(result.findings));assert.equal(result.valid,false);assert(result.findings.some(f=>f.code==='runtime.body.syntax'));assert.equal(input.resources[0].text,original);
});
test('unimplemented part media, unresolved annotations and bounded nesting stay incomplete and located',async()=>{
 const source=capture('3.2.1','json',{schema:{type:'array',items:{}},itemEncoding:{contentType:'application/xml'}});
 const unsupported=await run(source,wire([{headers:{'Content-Type':'application/xml'},body:'<value/>'}]));assert.equal(unsupported.result.complete,false);assert.equal(unsupported.valid,false);assert(unsupported.findings.some(f=>f.kind==='unsupported'));
 const missing=capture('3.2.1','json',{schema:{type:'array',items:{$ref:'missing.yaml#/Part'}},itemEncoding:{contentType:'application/json'}});
 const unresolved=await run(missing,wire([{headers:{'Content-Type':'application/json'},body:'false'}]));assert.equal(unresolved.result.complete,false);assert.equal(unresolved.valid,false);
 let rule={contentType:'text/plain'};
 for(let depth=0;depth<10;depth++)rule={contentType:'multipart/mixed',itemEncoding:rule};
 // Different boundaries avoid accepting a parent delimiter as a nested one.
 const make=(depth,boundary)=>depth===0?wire([{body:'x'}],boundary):wire([{headers:{'Content-Type':'multipart/mixed; boundary=Level'+depth},body:make(depth-1,'Level'+depth)}],boundary);
 const deep=capture('3.2.1','json',{schema:{type:'array'},itemEncoding:rule});
 const limited=await run(deep,make(10,'Fixture'));assert.equal(limited.result.complete,false);assert.equal(limited.valid,false);assert(limited.findings.some(f=>f.code==='runtime.body.limit'));
});
test('generic MIME headers require ASCII while form-data retains UTF-8 name support',async()=>{
 const input=capture('3.2.1','json',{schema:{type:'array',items:{type:'string'}},itemEncoding:{contentType:'text/plain'}});
 const result=await run(input,wire([{headers:{'Content-Location':'https://example.invalid/雪'},body:'value'}]));
 assert.equal(result.result.complete,true);assert.equal(result.valid,false);assert(result.findings.some(f=>f.code==='runtime.body.syntax'));
});
test('a nested multipart entity cannot be base64 transfer-encoded',async()=>{
 const input=capture('3.2.1','json',{schema:{type:'array',items:{type:'array',items:{type:'string'}}},itemEncoding:{contentType:'multipart/mixed',itemEncoding:{contentType:'text/plain'}}});
 const inner=wire([{body:'value'}],'Inner');
 const result=await run(input,wire([{headers:{'Content-Type':'multipart/mixed; boundary=Inner','Content-Transfer-Encoding':'base64'},body:Buffer.from(inner).toString('base64')}]));
 assert.equal(result.result.complete,true);assert.equal(result.valid,false);assert(result.findings.some(f=>f.code==='runtime.body.syntax'));
});
for(const headers of [{},{'Content-Type':'text/plain'}])test(`MIME text without an explicit charset defaults to ASCII: ${JSON.stringify(headers)}`,async()=>{
 const input=capture('3.2.1','json',{schema:{type:'array',items:{type:'string'}},itemEncoding:{contentType:'text/plain'}});
 const result=await run(input,wire([{headers,body:'雪'}]));assert.equal(result.result.complete,true);assert.equal(result.valid,false);
 const utf8=await run(input,wire([{headers:{'Content-Type':'text/plain; charset=utf-8'},body:'雪'}]));assert.equal(utf8.result.complete,true);assert.equal(utf8.valid,true);
});
test('an empty MIME part can omit both its headers and body area',async()=>{
 const input=capture('3.2.1','json',{schema:{type:'array',minItems:1,maxItems:1,items:{type:'string',maxLength:0}},itemEncoding:{contentType:'text/plain'}});
 const result=await run(input,'--Fixture\r\n\r\n--Fixture--\r\n');assert.equal(result.result.complete,true);assert.equal(result.valid,true,JSON.stringify(result.findings));
});
test('a MIME part may contain headers without a body area',async()=>{
 const input=capture('3.2.1','json',{schema:{type:'array',minItems:1,maxItems:1,items:{type:'string',maxLength:0}},itemEncoding:{contentType:'text/plain'}});
 const result=await run(input,'--Fixture\r\nContent-Type: text/plain\r\n\r\n--Fixture--\r\n');assert.equal(result.result.complete,true);assert.equal(result.valid,true,JSON.stringify(result.findings));
});
test('multipart digest keeps its message/rfc822 default instead of fabricating a text value',async()=>{
 const input=capture('3.2.1','json',{schema:{type:'array',items:{}},itemEncoding:{contentType:'message/rfc822'}},'response-body','multipart/digest');
 const result=await run(input,wire([{body:'Subject: message\r\n\r\nbody'}]),'multipart/digest; boundary=Fixture');
 assert.equal(result.result.complete,false);assert.equal(result.valid,false);assert(result.findings.some(f=>f.kind==='unsupported'));
});
for(const version of ['3.1.2','3.2.1'])for(const format of ['json','yaml'])test(`${version} ${format} contentEncoding does not apply to an object instance`,async()=>{
 const input=capture(version,format,{schema:{type:'object',properties:{value:{type:'object',contentEncoding:'base64',required:['flag'],properties:{flag:{const:false}}}},required:['value']},encoding:{value:{contentType:'application/json'}}},'request-body','multipart/form-data');
 const body=wire([{headers:{'Content-Disposition':'form-data; name="value"','Content-Type':'application/json'},body:'{"flag":false}'}]);
 const result=await run(input,body,'multipart/form-data; boundary=Fixture');assert.equal(result.result.complete,true,JSON.stringify(result.findings));assert.equal(result.valid,true,JSON.stringify(result.findings));
});
test('positional contentEncoding does not apply to an object instance',async()=>{
 const input=capture('3.2.1','json',{schema:{type:'array',items:{type:'object',contentEncoding:'base64',required:['flag'],properties:{flag:{const:false}}}},itemEncoding:{contentType:'application/json'}});
 const result=await run(input,wire([{headers:{'Content-Type':'application/json'},body:'{"flag":false}'}]));
 assert.equal(result.result.complete,true,JSON.stringify(result.findings));assert.equal(result.valid,true,JSON.stringify(result.findings));
});
test('an encoded schema string still needs valid decoded JSON media framing',async()=>{
 for(const [encoded,valid]of [['ZmFsc2U=',true],['AP8=',false]]){
  const input=capture('3.2.1','json',{schema:{type:'array',items:{type:'string',contentEncoding:'base64',const:encoded}},itemEncoding:{contentType:'application/json'}});
  const result=await run(input,wire([{headers:{'Content-Type':'application/json','Content-Transfer-Encoding':'base64'},body:encoded}]));
  assert.equal(result.result.complete,true,JSON.stringify(result.findings));assert.equal(result.valid,valid,JSON.stringify(result.findings));
 }
});
test('an encoded schema string still needs the declared text charset',async()=>{
 const input=capture('3.2.1','json',{schema:{type:'array',items:{type:'string',contentEncoding:'base64',const:'AP8='}},itemEncoding:{contentType:'text/plain'}});
 const result=await run(input,wire([{headers:{'Content-Type':'text/plain','Content-Transfer-Encoding':'base64'},body:'AP8='}]));
 assert.equal(result.result.complete,true);assert.equal(result.valid,false);
});

// W4.01: generation directives and proof use the same captured media owner as
// the existing request/response decoder above. These sources are held, not run.
for(const version of ['3.2.0','3.2.1'])for(const format of ['json','yaml'])test(`${version} ${format} typed prefix, item and nested generation prove actual bytes`,async()=>{
 const {requestMultipartPlan}=require('./dist/execution.cjs');
 const media={schema:{type:'array',minItems:1,maxItems:3,prefixItems:[{type:'object',required:['id'],properties:{id:{type:'integer',const:exact}}},{type:'array',items:{type:'boolean'}}],items:{type:'string'}},
  prefixEncoding:[{contentType:'application/json'},{contentType:'multipart/mixed',itemEncoding:{contentType:'text/plain'}}],itemEncoding:{contentType:'text/plain'}};
 const source=capture(version,format,media),input={...source,resource:source.root,pointer:'/paths/~1parts/post',mediaType:'multipart/mixed',text:'[{"id":9007199254740993.00},[false,true],""]',files:[]};
 const before=JSON.stringify(input.resources),plan=await requestMultipartPlan(input);
 assert.deepEqual(plan.tree.parts.map(part=>part.pointer),['/0','/1','/2']);
 assert.equal(plan.tree.parts[0].text,'{"id":9007199254740993.00}');
 assert.deepEqual(plan.tree.parts[1].children.parts.map(part=>part.text),['false','true']);
 assert(plan.tree.parts.every(part=>part.name===undefined));
 const body=wire([{headers:{'Content-Type':'application/json'},body:'{"id":9007199254740993.00}'},
  {headers:{'Content-Type':'multipart/mixed; boundary=Inner'},body:wire([{headers:{'Content-Type':'text/plain'},body:'false'},{headers:{'Content-Type':'text/plain'},body:'true'}],'Inner')},
  {headers:{'Content-Type':'text/plain'},body:''}]);
 const proof=await requestMultipartPlan({...input,wire:Buffer.from(body).toString('base64'),wireType:'multipart/mixed; boundary=Fixture'});
 assert.deepEqual(proof.proof,{complete:true,valid:true});
 for(const changed of [body.replace('9007199254740993.00','9007199254740992'),body.replace('false','true')])
  await assert.rejects(requestMultipartPlan({...input,wire:Buffer.from(changed).toString('base64'),wireType:'multipart/mixed; boundary=Fixture'}),error=>error.code==='request.multipart.identity'||error.code==='request.multipart.roundtrip');
 const short=await requestMultipartPlan({...input,text:'[{"id":9007199254740993.00}]'});
 assert.equal(short.tree.parts.length,1);assert.equal(JSON.stringify(input.resources),before);
});
for(const version of ['3.2.0','3.2.1'])test(`${version} typed itemSchema is independent and checked against the original declaration`,async()=>{
 const {requestMultipartPlan}=require('./dist/execution.cjs');
 const source=capture(version,'json',{itemSchema:{type:'integer',minimum:1},itemEncoding:{contentType:'text/plain'}});
 const input={...source,resource:source.root,pointer:'/paths/~1parts/post',mediaType:'multipart/mixed',text:'[0]',files:[]};
 const bad=wire([{headers:{'Content-Type':'text/plain'},body:'0'}]);
 await assert.rejects(requestMultipartPlan({...input,wire:Buffer.from(bad).toString('base64'),wireType:'multipart/mixed; boundary=Fixture'}),error=>error.code==='request.multipart.conformance'&&error.source.resource===source.root);
 const good=wire([{headers:{'Content-Type':'text/plain'},body:'1'}]);
 assert.equal((await requestMultipartPlan({...input,text:'[1]',wire:Buffer.from(good).toString('base64'),wireType:'multipart/mixed; boundary=Fixture'})).proof.valid,true);
});

for(const style of ['form','deepObject'])test(`nested named ${style} expansion reuses exact typed fields without URL encoding`,async()=>{
 const {requestMultipartPlan}=require('./dist/execution.cjs');
 const source=capture('3.2.1','json',{schema:{type:'array',items:{type:'object',required:['options'],properties:{options:{type:'object',required:['big','flag'],properties:{big:{type:'integer',const:exact},flag:{type:'boolean',const:false}}}}}},
  itemEncoding:{contentType:'multipart/form-data',encoding:{options:{style,explode:true,contentType:'application/ignored'}}}});
 const input={...source,resource:source.root,pointer:'/paths/~1parts/post',mediaType:'multipart/mixed',text:'[{"options":{"big":9007199254740993.00,"flag":false}}]',files:[]};
 const plan=await requestMultipartPlan(input),children=plan.tree.parts[0].children.parts;
 assert.deepEqual(children.map(part=>part.name),style==='form'?['big','flag']:['options[big]','options[flag]']);
 const inner=wire(children.map(part=>({headers:{'Content-Disposition':'form-data; name="'+part.name+'"','Content-Type':'text/plain'},body:part.text})),'Inner');
 const body=wire([{headers:{'Content-Type':'multipart/form-data; boundary=Inner'},body:inner}]);
 const result=await requestMultipartPlan({...input,wire:Buffer.from(body).toString('base64'),wireType:'multipart/mixed; boundary=Fixture'});
 assert.equal(result.proof.valid,true);
});
for(const version of ['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2'])test(`${version} named union media choices remain native and explicit`,async()=>{
 const {requestMultipartPlan,requestOperation}=require('./dist/execution.cjs');
 const source=capture(version,'json',{schema:{type:'object',properties:{value:{anyOf:[{type:'string'},{type:'object',required:['n'],properties:{n:{type:'integer',enum:[exact]}}}]}}}},'request-body','multipart/form-data');
 const input={...source,resource:source.root,pointer:'/paths/~1parts/post',mediaType:'multipart/form-data',text:'{"value":{"n":9007199254740993.00}}',files:[]};
 assert.equal(requestOperation(input).requestBody.content[0].multipart.usesTree,true);
 const options=await requestMultipartPlan({...input,inspect:true});
 const selection=options.controls[0].schemas.find(schema=>schema.pointer.endsWith('/anyOf/1')).id;
 const body=wire([{headers:{'Content-Disposition':'form-data; name="value"','Content-Type':'application/json'},body:'{"n":9007199254740993.00}'}]);
 assert.equal((await requestMultipartPlan({...input,partSchemas:{'/value':selection},wire:Buffer.from(body).toString('base64'),wireType:'multipart/form-data; boundary=Fixture'})).proof.valid,true);
});

test('nested URL-encoded content applies its own form codec and ignores MIME-only field Headers',async()=>{
 const {requestMultipartPlan}=require('./dist/execution.cjs');
 const media={schema:{type:'array',items:{type:'object',required:['n','note','metadata','ids'],properties:{n:{type:'integer',const:exact},note:{type:'string'},metadata:{type:'object',properties:{ok:{type:'boolean'}}},ids:{type:'array',items:{type:'integer'}}}}},
  itemEncoding:{contentType:'application/x-www-form-urlencoded',encoding:{metadata:{contentType:'application/json'},ids:{style:'form',explode:false},note:{contentType:'text/plain',headers:{'X-Ignored':{required:true,schema:false}}}}}};
 const source=capture('3.2.1','json',media),text='[{"n":9007199254740993.00,"note":"a+b &雪","metadata":{"ok":false},"ids":[1,2]}]';
 const input={...source,resource:source.root,pointer:'/paths/~1parts/post',mediaType:'multipart/mixed',text,files:[]};
 const plan=await requestMultipartPlan(input);assert.equal(plan.tree.parts[0].urlencoded.raw,text.slice(1,-1));
 const encoded='n=9007199254740993.00&note=a%2Bb+%26%E9%9B%AA&metadata=%7B%22ok%22%3Afalse%7D&ids=1,2';
 const body=wire([{headers:{'Content-Type':'application/x-www-form-urlencoded'},body:encoded}]);
 assert.equal((await requestMultipartPlan({...input,wire:Buffer.from(body).toString('base64'),wireType:'multipart/mixed; boundary=Fixture'})).proof.valid,true);
 await assert.rejects(requestMultipartPlan({...input,wire:Buffer.from(body.replace('a%2Bb','a+b')).toString('base64'),wireType:'multipart/mixed; boundary=Fixture'}),error=>error.code==='request.multipart.roundtrip');
});

test('nested URL form retains captured schema and media alternatives through generated-byte proof',async()=>{
 const {requestMultipartPlan}=require('./dist/execution.cjs');
 const media={schema:{type:'array',items:{type:'object',required:['value'],properties:{value:{oneOf:[{type:'integer',minimum:1},{type:'string',minLength:1}]}}}},
  itemEncoding:{contentType:'application/x-www-form-urlencoded',encoding:{value:{contentType:'text/plain, application/json'}}}};
 const source=capture('3.2.1','json',media),input={...source,resource:source.root,pointer:'/paths/~1parts/post',mediaType:'multipart/mixed',text:'[{"value":9007199254740993.00}]',files:[],choices:{'/0/value':'application/json'}};
 const options=await requestMultipartPlan({...input,inspect:true});
 const selection=options.controls.find(part=>part.name==='/0/value').schemas.find(schema=>schema.type==='integer').id;
 const body=wire([{headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'value=9007199254740993.00'}]);
 assert.equal((await requestMultipartPlan({...input,partSchemas:{'/0/value':selection},wire:Buffer.from(body).toString('base64'),wireType:'multipart/mixed; boundary=Fixture'})).proof.valid,true);
 await assert.rejects(requestMultipartPlan({...input,choices:{}}),error=>error.code==='request.form.content-type');
 await assert.rejects(requestMultipartPlan({...input,partSchemas:{'/0/value':'choice:absent'}}),error=>error.code==='request.multipart.representation.stale');
});

for(const version of ['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])test(`${version} named repeated tuple values retain index schemas and one-item multiplicity`,async()=>{
 const {requestMultipartPlan}=require('./dist/execution.cjs');
 const source=capture(version,'json',{schema:{type:'object',required:['values'],properties:{values:{type:'array',minItems:1,maxItems:2,prefixItems:[{type:'integer',enum:[exact]},{type:'boolean'}],items:false}}}},'request-body','multipart/form-data');
 const input={...source,resource:source.root,pointer:'/paths/~1parts/post',mediaType:'multipart/form-data',text:'{"values":[9007199254740993.00,false]}',files:[]};
 const body=wire([{headers:{'Content-Disposition':'form-data; name="values"','Content-Type':'text/plain'},body:'9007199254740993.00'},
  {headers:{'Content-Disposition':'form-data; name="values"','Content-Type':'text/plain'},body:'false'}]);
 assert.equal((await requestMultipartPlan({...input,wire:Buffer.from(body).toString('base64'),wireType:'multipart/form-data; boundary=Fixture'})).proof.valid,true);
 const one=wire([{headers:{'Content-Disposition':'form-data; name="values"','Content-Type':'text/plain'},body:'9007199254740993.00'}]);
 assert.equal((await requestMultipartPlan({...input,text:'{"values":[9007199254740993.00]}',wire:Buffer.from(one).toString('base64'),wireType:'multipart/form-data; boundary=Fixture'})).proof.instance,'{"values":[9007199254740993.00]}');
 await assert.rejects(requestMultipartPlan({...input,text:'{"values":[]}',wire:Buffer.from(one).toString('base64'),wireType:'multipart/form-data; boundary=Fixture'}),error=>error.code==='request.multipart.empty');
});

for(const styled of [false,true])test(`nested URL form ${styled?'style':'content'} arrays preserve selected item kinds`,async()=>{
 const {requestMultipartPlan}=require('./dist/execution.cjs');
 const source=capture('3.2.1','json',{schema:{type:'array',items:{type:'object',properties:{values:{type:'array',items:{anyOf:[{type:'string'},{type:'integer'}]}}}}},
  itemEncoding:{contentType:'application/x-www-form-urlencoded',encoding:{values:styled?{style:'form',explode:false}:{contentType:'text/plain'}}}});
 const input={...source,resource:source.root,pointer:'/paths/~1parts/post',mediaType:'multipart/mixed',text:'[{"values":["x",9007199254740993.00]}]',files:[]};
 const body=wire([{headers:{'Content-Type':'application/x-www-form-urlencoded'},body:styled?'values=x,9007199254740993.00':'values=x&values=9007199254740993.00'}]);
 const plan=await requestMultipartPlan({...input,wire:Buffer.from(body).toString('base64'),wireType:'multipart/mixed; boundary=Fixture'});
 assert.equal(plan.proof.valid,true);assert(plan.partSchemas['/0/values/0']);assert(plan.partSchemas['/0/values/1']);
});
