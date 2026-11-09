const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {requestMediaBytes,requestContentParameters,planExecutionCase,executionCaseValues}=require('./dist/execution.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const root='file:///modeled-wire/api.json';
function capture(schema,version='3.2.1',yaml=false,components={}){
 const legacy=version==='2.0',document={...(legacy?{swagger:version,consumes:['application/xml']}:{openapi:version}),info:{title:'Modeled wire',version:'1'},paths:{'/p':{post:{
  ...(legacy?{parameters:[{name:'body',in:'body',schema}]}:{requestBody:{content:{'application/xml':{schema}}}}),responses:{200:{description:'OK',...(legacy?{schema}:{content:{'application/xml':{schema}}})}}}}},...(legacy?{definitions:components}:{components:{schemas:components}})};
 return {root,snapshot:'modeled-wire',resource:root,pointer:'/paths/~1p/post',resources:[{id:root,text:(yaml?YAML.stringify(document):JSON.stringify(document)).replaceAll(yaml?'EXACT':'"EXACT"','9007199254740993'),generation:1}]};
}
async function wire(input,text,mediaType='application/xml'){
 const prepared=await requestMediaBytes({...input,text,mediaType});
 const decoded=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'body',text:prepared.base64,mediaType,mediaBase64:true,schema:{resource:root,pointer:'/paths/~1p/post/responses/200/content/application~1xml/schema'}}]});
 return {prepared,bytes:Buffer.from(prepared.base64,'base64'),decoded};
}
for(const version of ['2.0','3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const yaml of [false,true])test(`${version} ${yaml?'YAML':'JSON'} allOf/reference XML generation retains complete assertions`,async()=>{
 const schema={type:'object',xml:{name:'payload'},allOf:[{$ref:version==='2.0'?'#/definitions/Base':'#/components/schemas/Base'},{required:['value'],properties:{value:{type:'number',enum:['EXACT']}}}]};
 const input=capture(schema,version,yaml,{Base:{type:'object',required:['id'],properties:{id:{type:'string',xml:{attribute:true}}}}});
 const result=await requestMediaBytes({...input,text:'{"id":"a&b","value":9007199254740993}',mediaType:'application/xml'});
 const bytes=Buffer.from(result.base64,'base64').toString();assert.match(bytes,/id="a&amp;b"/);assert.match(bytes,/>9007199254740993</);
 await assert.rejects(requestMediaBytes({...input,text:'{"id":"a&b","value":9007199254740992}',mediaType:'application/xml'}),error=>error.code==='request.media.conformance');
});
for(const keyword of ['anyOf','oneOf'])test(`${keyword} selects applicable XML interpretation through canonical schema proofs`,async()=>{
 const input=capture({type:'object',xml:{name:'payload'},[keyword]:[
  {required:['kind','a'],properties:{kind:{type:'string',const:'a'},a:{type:'number'}}},
  {required:['kind','b'],properties:{kind:{type:'string',const:'b'},b:{type:'string'}}}
 ]});
 const value='{"kind":"b","b":"second"}',result=await wire(input,value);
 assert(result.bytes.toString().includes('<b'));assert.equal(result.decoded.runtimeEvaluations.every(value=>value.valid),true,JSON.stringify(result.decoded.runtimeFindings));
 assert.deepEqual(JSON.parse(result.decoded.runtimeEvaluations[0].modeledData),JSON.parse(value));
});
test('conditional XML uses the actual discriminator value and preserves sibling assertions',async()=>{
 const input=capture({type:'object',xml:{name:'payload'},properties:{kind:{type:'string'}},required:['kind'],if:{properties:{kind:{const:'a'}}},then:{required:['a'],properties:{a:{type:'number'}}},else:{required:['b'],properties:{b:{type:'string'}}}});
 const result=await wire(input,'{"kind":"b","b":"ok"}');assert.match(result.bytes.toString(),/<b[^>]*>ok<\/b>/);
 assert.equal(result.decoded.runtimeEvaluations.every(v=>v.valid),true,JSON.stringify(result.decoded.runtimeFindings));
});
test('finite recursive XML follows captured references lazily',async()=>{
 const node={type:'object',xml:{name:'node'},required:['value'],properties:{value:{type:'number'},child:{$ref:'#/components/schemas/Node'}}};
 const input=capture({$ref:'#/components/schemas/Node'},'3.2.1',false,{Node:node});
 const value='{"value":1,"child":{"value":2,"child":{"value":9007199254740993}}}',result=await wire(input,value);
 assert.equal(result.decoded.runtimeEvaluations.every(v=>v.valid),true,JSON.stringify(result.decoded.runtimeFindings));
 assert.equal(result.decoded.runtimeEvaluations[0].modeledData.includes('9007199254740993'),true);
});
for(const charset of ['utf-8','utf-16','utf-16le','utf-16be','us-ascii','iso-8859-1'])test(`typed XML honors outbound ${charset}`,async()=>{
 const input=capture({type:'string',xml:{name:'value'}}),value=charset==='us-ascii'?'"plain"':'"é"';
 const result=await requestMediaBytes({...input,mediaType:'application/xml; charset='+charset,text:value});
 const response=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'body',text:result.base64,mediaBase64:true,mediaType:'application/xml; charset='+charset,schema:{resource:root,pointer:'/paths/~1p/post/requestBody/content/application~1xml/schema'}}]});
 assert.equal(response.runtimeEvaluations[0].valid,true,JSON.stringify(response.runtimeFindings));assert.equal(response.runtimeEvaluations[0].modeledData,value);
});
test('Linkset rejects non-ASCII textual attributes but accepts RFC 8187 and JSON Unicode',async()=>{
 const input=capture({}),schema={resource:root,pointer:'/paths/~1p/post/requestBody/content/application~1xml/schema'};
 for(const [mediaType,text,valid]of [['application/linkset','</p>; rel=next; title="雪"',false],['application/linkset',"</p>; rel=next; title*=UTF-8'ja'%E9%9B%AA",true],['application/linkset+json','{"linkset":[{"next":[{"href":"/p","title":"雪"}]}]}',true]]){
  const result=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'body',mediaType,text,schema}]});assert.equal(result.runtimeEvaluations[0].valid,valid,JSON.stringify(result.runtimeFindings));
 }
});
test('structured Link parameter emits HTTP text with quoted delimiters and repeated attributes',async()=>{
 const input=capture({}),document=JSON.parse(input.resources[0].text);
 document.paths['/p'].post.parameters=[{in:'header',name:'Link',content:{'application/linkset':{schema:{type:'object',required:['linkset']}}}}];input.resources[0].text=JSON.stringify(document);
 const values={'header\0Link':'{"linkset":[{"anchor":"/context","next":[{"href":"/p","title":"a,b; c","hreflang":["en","fr"],"title*":[{"value":"雪","language":"ja"}]}]}]}'},result=await requestContentParameters({...input,values});
 assert.match(result.values['header\0Link'],/^<\/p>; rel="next"/);assert.match(result.values['header\0Link'],/title="a,b; c"/);assert.match(result.values['header\0Link'],/title\*=UTF-8'ja'%E9%9B%AA/);assert(!/[\r\n]/.test(result.values['header\0Link']));
});
test('saved request proposals preserve exact numeric data, representation and unrelated configuration',()=>{
 const source={id:'file:///modeled-wire/busyapi.yaml',text:'version: 1\nroots: [{name: api, path: api.json}]\nx-keep: 9007199254740993.00\ntests: []\n',generation:1};
 const result=planExecutionCase({root,snapshot:'save',source,name:'xml',definition:{operation:{method:'post',path:'/p'},body:{mediaType:'application/xml',representation:'data',value:'{"value":9007199254740993}'}}});
 const after=result.changes[0].after;assert.match(after,/x-keep: 9007199254740993.00/);
 const reopened=executionCaseValues({source:{...source,text:after},name:'xml'});assert.equal(reopened.body.json,true);assert.equal(reopened.body.text,'{"value":9007199254740993}');
});
test('JSON Linkset extension metadata is retained; lossy text transcoding is refused',async()=>{
 const input=capture({}),schema={resource:root,pointer:'/paths/~1p/post/requestBody/content/application~1xml/schema'};
 const value='{"@context":"https://example.org/context","linkset":[{"@id":"context-metadata","next":[{"href":"../p","@id":"target-metadata","title":"雪"}]}]}';
 const result=await evaluateSchemas({...input,mediaPreparations:[{schema,mediaType:'application/linkset+json',text:value}]});
 assert.equal(Buffer.from(result.mediaPreparations[0].base64,'base64').toString(),value);
 await assert.rejects(evaluateSchemas({...input,mediaPreparations:[{schema,mediaType:'application/linkset',text:value}]}),error=>error.kind==='unsupported');
});
for(const media of ['application/xml','application/linkset','application/linkset+json'])test(`authored and approved external ${media} examples use original captured schemas`,async()=>{
 const {createHash}=require('node:crypto'),xml=media==='application/xml';
 const schema=xml?{type:'object',xml:{name:'payload'},required:['value'],properties:{value:{type:'number',enum:['EXACT']}}}:{type:'object',required:['linkset']};
 const input=capture(schema),document=JSON.parse(input.resources[0].text),declaration=document.paths['/p'].post.requestBody;
 const structured=xml?{value:'EXACT'}:{linkset:[{next:[{href:'../p','title*':[{value:'雪',language:'ja'}]}]}]};
 const text=xml?'<payload><value>9007199254740993</value></payload>':media==='application/linkset'?"<../p>; rel=next; title*=UTF-8'ja'%E9%9B%AA":JSON.stringify(structured);
 declaration.content={[media]:{schema,examples:{data:{dataValue:structured},wire:{serializedValue:text},approved:{externalValue:'body.bin'}}}};
 input.resources[0].text=JSON.stringify(document).replaceAll('"EXACT"','9007199254740993');
 const bytes=Buffer.from(text),identity=createHash('sha256').update(bytes).digest('hex');
 const example={version:1,generation:0,state:'available',aliases:[],id:'file:///modeled-wire/body.bin',identity,byteLength:bytes.length,base64:bytes.toString('base64')};
 const result=await evaluateSchemas({...input,exampleResources:[example]});
 assert.equal(result.complete,true,JSON.stringify(result.findings));assert(result.serializedEvaluations.every(value=>value.valid),JSON.stringify(result.findings));
 const invalid=Buffer.from(xml?text.replace('9007199254740993','9007199254740992'):'malformed');
 const bad=await evaluateSchemas({...input,exampleResources:[{...example,identity:createHash('sha256').update(invalid).digest('hex'),byteLength:invalid.length,base64:invalid.toString('base64')}]});
 assert(bad.serializedEvaluations.some(value=>!value.valid),JSON.stringify(bad));
});
test('dynamic reference XML uses captured resource scope for a finite instance',async()=>{
 const node={$id:'https://example.org/node',$dynamicAnchor:'node',type:'object',xml:{name:'node'},properties:{value:{type:'number'},child:{$dynamicRef:'#node'}},required:['value']};
 const input=capture({$ref:'https://example.org/node'},'3.2.1',false,{Node:node});
 const result=await wire(input,'{"value":1,"child":{"value":2}}');assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));
});
test('XML xsi:nil, omitted nullable attributes, absent arrays and empty character nodes follow the documented policy',async()=>{
 const input=capture({type:'object',xml:{name:'payload'},properties:{
  optional:{type:['number','null'],xml:{nodeType:'attribute'}},empty:{type:'array',items:{type:'string'}},
  text:{type:'string',xml:{nodeType:'text'}},nil:{type:['object','null'],xml:{name:'nil'},properties:{}}
 }});
 const result=await wire(input,'{"optional":null,"empty":[],"text":"","nil":null}');
 assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));assert.match(result.bytes.toString(),/nil="true"/);
 assert.deepEqual(JSON.parse(result.decoded.runtimeEvaluations[0].modeledData),{nil:null});
});
test('XML ambiguous adjacent text and finite resource overflows never claim successful correspondence',async()=>{
 const input=capture({type:'object',xml:{name:'payload'},properties:{a:{type:'string',xml:{nodeType:'text'}},b:{type:'string',xml:{nodeType:'text'}}}});
 await assert.rejects(requestMediaBytes({...input,mediaType:'application/xml',text:'{"a":"one","b":"two"}'}),error=>error.kind==='unsupported'||error.code==='request.media.conformance');
 const recursive={type:'object',xml:{name:'n'},properties:{child:{$ref:'#/components/schemas/Node'}}};
 const deep=capture({$ref:'#/components/schemas/Node'},'3.2.1',false,{Node:recursive});
 await assert.rejects(requestMediaBytes({...deep,mediaType:'application/xml',text:'{"child":'.repeat(130)+'{}'+'}'.repeat(130)}),error=>error.code.startsWith('limit.'));
});
test('ordered multipart XML and Linkset parts keep their own schemas and modeled Link Header',async()=>{
 const {requestMultipartPlan}=require('./dist/execution.cjs');
 const xml={type:'object',xml:{name:'payload'},properties:{n:{type:'number',const:'EXACT'}},required:['n']};
 const link={type:'object',required:['linkset']},media={schema:{type:'array',prefixItems:[xml,link],items:false,minItems:2,maxItems:2},prefixEncoding:[
  {contentType:'application/xml',headers:{Link:{required:true,content:{'application/linkset':{schema:link}}}}},
  {contentType:'application/linkset'}
 ]};
 const input=capture({}),document=JSON.parse(input.resources[0].text);
 document.paths['/p'].post.requestBody.content={'multipart/mixed':media};input.resources[0].text=JSON.stringify(document).replaceAll('"EXACT"','9007199254740993');
 const text='[{"n":9007199254740993},{"linkset":[{"next":[{"href":"../p","title":"a,b"}]}]}]';
 const selection={...input,mediaType:'multipart/mixed',text,headers:{'/0':[{name:'Link',value:'{"linkset":[{"next":[{"href":"/next","title":"a,b"}]}]}',modeled:true}]}};
 const generated=await requestMultipartPlan(selection),parts=generated.tree.parts;
 assert.match(Buffer.from(parts[0].bytes,'base64').toString(),/payload/);
 assert.equal(parts[0].headers[0].value,'</next>; rel="next"; title="a,b"');
 assert.match(Buffer.from(parts[1].bytes,'base64').toString(),/^<\.\.\/p>/);
 const buffers=[];for(const part of parts){buffers.push(Buffer.from('--Wire\r\nContent-Type: '+part.contentType+'\r\n'+part.headers.map(field=>field.name+': '+field.value+'\r\n').join('')+'\r\n'));buffers.push(Buffer.from(part.bytes,'base64'),Buffer.from('\r\n'));}buffers.push(Buffer.from('--Wire--\r\n'));
 const bytes=Buffer.concat(buffers),proof=await requestMultipartPlan({...selection,wire:bytes.toString('base64'),wireType:'multipart/mixed; boundary=Wire'});
 assert.equal(proof.proof.valid,true);
 await assert.rejects(requestMultipartPlan({...selection,text:text.replace('9007199254740993','9007199254740992')}),error=>error.code==='request.media.conformance');
});
test('explicit reference wrappers retain sibling attributes and nested namespace context through forwarding',async()=>{
 const input=capture({$ref:'#/components/schemas/Alias',type:'object',xml:{nodeType:'element',name:'Envelope',namespace:'urn:outer'},required:['extra'],properties:{extra:{type:'string',xml:{nodeType:'attribute'}}}},'3.2.1',false,{
  Alias:{$ref:'#/components/schemas/Base'},
  Base:{type:'object',xml:{name:'Item',namespace:'urn:inner',prefix:'i'},required:['n'],properties:{n:{type:'number'}}}
 });
 const result=await wire(input,'{"n":9007199254740993,"extra":"a&b"}');
 assert.match(result.bytes.toString(),/^<Envelope[^>]*extra="a&amp;b"[^>]*><i:Item/);
 assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));
 assert.deepEqual(JSON.parse(result.decoded.runtimeEvaluations[0].modeledData.replace('9007199254740993','"exact"')),{n:'exact',extra:'a&b'});
});
// Full-root assertions, rather than local primitive guessing, establish inversion.
test('root const disambiguates composed primitive and default array-item interpretations exactly',async()=>{
 const input=capture({type:'object',xml:{name:'payload'},const:{value:'EXACT',items:[1,'two',false]},allOf:[
  {properties:{value:{anyOf:[{type:'string'},{type:'number'}]}}},
  {properties:{items:{type:'array',xml:{wrapped:true}}}}
 ]});
 const value='{"value":9007199254740993,"items":[1,"two",false]}',result=await wire(input,value);
 assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));
 assert.equal(result.decoded.runtimeEvaluations[0].modeledData,value);
 assert.match(result.bytes.toString(),/>9007199254740993</);
 // Same XML with no full-root type evidence must not invent a single scalar.
 const ambiguous=capture({type:'object',xml:{name:'payload'},properties:{value:{type:['string','number']}}});
 await assert.rejects(requestMediaBytes({...ambiguous,mediaType:'application/xml',text:'{"value":1}'}),error=>error.kind==='unsupported');
});
test('adjacent text uses captured boundaries and full-root optional presence constraints',async()=>{
 const input=capture({type:'object',xml:{name:'p'},required:['first','last'],properties:{
  first:{type:'string',const:'ab',xml:{nodeType:'text'}},
  optional:{type:'string',const:'x',xml:{nodeType:'text'}},
  last:{type:'string',minLength:2,maxLength:2,xml:{nodeType:'text'}}
 }});
 const result=await wire(input,'{"first":"ab","last":"cd"}');
 assert.match(result.bytes.toString(),/>abcd<\/p>/);assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));
 assert.deepEqual(JSON.parse(result.decoded.runtimeEvaluations[0].modeledData),{first:'ab',last:'cd'});
 const unconstrained=capture({type:'object',xml:{name:'p'},required:['a','b'],properties:{a:{type:'string',xml:{nodeType:'text'}},b:{type:'string',xml:{nodeType:'text'}}}});
 await assert.rejects(requestMediaBytes({...unconstrained,mediaType:'application/xml',text:'{"a":"a","b":"b"}'}),error=>error.kind==='unsupported');
});
test('ordered CDATA splitting, empty text slots and nested namespace attributes retain modeled data',async()=>{
 const input=capture({type:'object',xml:{name:'Root',namespace:'urn:root'},required:['id','sequence'],properties:{
  id:{type:'string',xml:{nodeType:'attribute',namespace:'urn:attribute'}},
  sequence:{type:'array',xml:{nodeType:'element',name:'Sequence',namespace:'urn:sequence',prefix:'s'},prefixItems:[
   {type:'string',const:'',xml:{nodeType:'text'}},
   {type:'string',xml:{nodeType:'cdata'}},
   {type:'number',xml:{name:'Number',namespace:'urn:number',prefix:'n'}}
  ],items:false,minItems:3,maxItems:3}
 }});
 const value='{"id":"a\\n&b","sequence":["","a]]>b",9007199254740993]}',result=await wire(input,value);
 assert.match(result.bytes.toString(),/xmlns:xmlattr0="urn:attribute"/);assert.match(result.bytes.toString(),/&#10;&amp;/);
 assert.match(result.bytes.toString(),/\]\]\]\]><!\[CDATA\[>/);
 assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));
 assert.equal(result.decoded.runtimeEvaluations[0].modeledData,value);
});
test('raw XML and serialized examples honor declared charsets without replacing their markup',async()=>{
 const {requestRawMediaBytes}=require('./dist/execution.cjs');
 const input=capture({type:'string',xml:{name:'value'}}),schema={resource:root,pointer:'/paths/~1p/post/requestBody/content/application~1xml/schema'};
 const text='<?xml version="1.0" encoding="ISO-8859-1"?><value>é</value>';
 const prepared=requestRawMediaBytes({...input,text,mediaType:'application/xml'});
 assert.deepEqual(Buffer.from(prepared.base64,'base64'),Buffer.from(text,'latin1'));
 const decoded=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:'raw',schema,mediaType:'application/xml',text:prepared.base64,mediaBase64:true}]});
 assert.equal(decoded.runtimeEvaluations[0].modeledData,'"é"');assert.equal(decoded.runtimeEvaluations[0].valid,true);
 const malformed=requestRawMediaBytes({...input,text:'<value>',mediaType:'application/xml; charset=utf-16'});
 assert.deepEqual([...Buffer.from(malformed.base64,'base64').subarray(0,2)],[255,254]);
 const invalid=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:'raw',schema,mediaType:'application/xml',text:malformed.base64,mediaBase64:true}]});
 assert.equal(invalid.runtimeEvaluations[0].reason,'malformed-content');
 const document=JSON.parse(input.resources[0].text);document.paths['/p'].post.requestBody.content['application/xml'].examples={wire:{serializedValue:text}};input.resources[0].text=JSON.stringify(document);
 const authored=await evaluateSchemas(input);assert(authored.serializedEvaluations.every(value=>value.valid),JSON.stringify(authored.findings));
 const noBom=Buffer.from('<?xml version="1.0" encoding="UTF-16"?><value>é</value>','utf16le');
 const missing=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'no-bom',schema,mediaType:'application/xml',text:noBom.toString('base64'),mediaBase64:true}]});
 assert.equal(missing.runtimeEvaluations[0].valid,false);assert(missing.runtimeFindings.some(value=>value.detailCode==='runtime.xml.syntax'));
 const explicit=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'explicit-le',schema,mediaType:'application/xml; charset=utf-16le',text:noBom.toString('base64'),mediaBase64:true}]});
 assert.equal(explicit.runtimeEvaluations[0].valid,true,JSON.stringify(explicit.runtimeFindings));
 await assert.rejects(requestMediaBytes({...input,text:'"雪"',mediaType:'application/xml; charset=x-no-codec'}),error=>error.kind==='unsupported');
});
test('Linkset unfamiliar JSON metadata survives and reserved relation structures still fail',async()=>{
 const input=capture({}),schema={resource:root,pointer:'/paths/~1p/post/requestBody/content/application~1xml/schema'};
 const text='{"linkset":[{"metadata":{"owner":"雪"},"next":[{"href":"../p","title*":[{"value":"雪","language":"ja","metadata":1}],"internal":{"active":true}}]}]}';
 const result=await evaluateSchemas({...input,mediaPreparations:[{schema,text,mediaType:'application/linkset+json'}]});
 assert.equal(Buffer.from(result.mediaPreparations[0].base64,'base64').toString(),text);
 for(const bad of ['{"linkset":[{"edit":{"href":"/p"}}]}','{"linkset":[{"next":[{"href":"/p","hreflang":"en"}]}]}']){
  const invalid=await evaluateSchemas({...input,runtimeInstances:[{schema,subject:'response-body',location:'invalid',mediaType:'application/linkset+json',text:bad}]});
  assert.equal(invalid.runtimeEvaluations[0].valid,false);
 }
 const data=JSON.stringify({linkset:[{anchor:'../context','https://example.org/relation':[{href:'?p=1',custom:['a,b; c','quote"slash\\'],'custom*':[{value:'雪',language:'ja'}]}]}]});
 const prepared=await evaluateSchemas({...input,mediaPreparations:[{schema,text:data,mediaType:'application/linkset',header:true}]});
 const bytes=Buffer.from(prepared.mediaPreparations[0].base64,'base64').toString();assert(!/[\r\n\u0080-\uffff]/.test(bytes));
 assert.match(bytes,/anchor="\.\.\/context"/);assert.match(bytes,/custom\*=UTF-8'ja'%E9%9B%AA/);
 for(const bad of ['</p>; rel=next; custom="雪"',"</p>; rel=next; title*=\"UTF-8'ja'%E9%9B%AA\"",'</p>; rel=next; anchor']){
  const invalid=await evaluateSchemas({...input,runtimeInstances:[{schema,subject:'response-body',location:'invalid-text',mediaType:'application/linkset',text:bad}]});assert.equal(invalid.runtimeEvaluations[0].valid,false);
 }
});
test('inline object groups propagate namespaced attributes to the enclosing XML element',async()=>{
 const input=capture({type:'object',xml:{name:'R',namespace:'urn:root'},required:['group'],properties:{group:{type:'object',xml:{nodeType:'none'},required:['id','value'],properties:{
  id:{type:'string',xml:{nodeType:'attribute',namespace:'urn:attribute'}},
  value:{$ref:'#/components/schemas/Value'}
 }}}},'3.2.1',false,{Value:{type:'number',xml:{name:'V',namespace:'urn:value',prefix:'v'}}});
 const result=await wire(input,'{"group":{"id":"a&b","value":9007199254740993}}');
 assert.match(result.bytes.toString(),/xmlattr0:id="a&amp;b"/);assert.match(result.bytes.toString(),/<v:V/);
 assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));
 assert.equal(result.decoded.runtimeEvaluations[0].modeledData,'{"group":{"id":"a&b","value":9007199254740993}}');
});
test('actual prepared repeated Link field lines use the existing HTTP combination owner',async()=>{
 const input=capture({}),document=JSON.parse(input.resources[0].text);
 const schema={type:'object',required:['linkset'],properties:{linkset:{type:'array',minItems:1,maxItems:1,items:{type:'object',properties:{next:{type:'array',minItems:2,maxItems:2}}}}}};
 document.paths['/p'].post.parameters=[{in:'header',name:'Link',content:{'application/linkset':{schema}}}];input.resources[0].text=JSON.stringify(document);
 const data='{"linkset":[{"next":[{"href":"/a","title":"a,b; c"},{"href":"/b","title*":[{"value":"雪","language":"ja"}]}]}]}';
 const prepared=await requestContentParameters({...input,values:{'header\0Link':data}});
 const actual=prepared.values['header\0Link'];assert.equal(Buffer.from(prepared.bodies['header\0Link'],'base64').toString(),actual);
 const lines=['</a>; rel=next; title="a,b; c"',"</b>; rel=next; title*=UTF-8'ja'%E9%9B%AA"];
 const parameter={resource:root,pointer:'/paths/~1p/post/parameters/0',values:lines};
 const checked=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-parameter',location:'header:Link',text:'',parameter}]});
 assert(checked.runtimeEvaluations.every(value=>value.complete&&value.valid),JSON.stringify(checked.runtimeFindings));
 assert.deepEqual(checked.runtimeEvaluations[0].parameter,{resource:root,pointer:parameter.pointer});
 const invalid=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-parameter',location:'header:Link',text:'',parameter:{...parameter,values:[...lines,'</c>; rel=next']}}]});
 assert(invalid.runtimeEvaluations.some(value=>!value.valid));
});
test('literal XML media parameters retain MIME charset bytes and single URI escaping',async()=>{
 const input=capture({}),document=JSON.parse(input.resources[0].text);
 document.paths['/p'].post.parameters=[{in:'query',name:'xml',content:{'application/xml; charset=iso-8859-1':{schema:{type:'string',xml:{name:'V'}}}}}];input.resources[0].text=JSON.stringify(document);
 const prepared=await requestContentParameters({...input,values:{},rawValues:{'query\0xml':'<V>é</V>'}});
 assert.equal(prepared.percentEncoded['query\0xml'],true);assert.equal(prepared.values['query\0xml'],'%3CV%3E%E9%3C%2FV%3E');
 assert.deepEqual(Buffer.from(prepared.bodies['query\0xml'],'base64'),Buffer.from('<V>é</V>','latin1'));
});
test('named XML/Linkset multipart preparation enters the same captured tree and full wire proof',async()=>{
 const {requestMultipartPlan,requestOperation}=require('./dist/execution.cjs');
 const input=capture({}),document=JSON.parse(input.resources[0].text),xml={type:'object',xml:{name:'Part'},required:['n'],properties:{n:{type:'number',enum:['EXACT']}}},link={type:'object',required:['linkset']};
 document.paths['/p'].post.requestBody.content={'multipart/mixed':{schema:{type:'object',required:['xml','links'],properties:{xml,links:link}},encoding:{xml:{contentType:'application/xml; charset=utf-16be',headers:{Link:{content:{'application/linkset':{schema:link}}}}},links:{contentType:'application/linkset'}}}};
 input.resources[0].text=JSON.stringify(document).replaceAll('"EXACT"','9007199254740993');
 const plan=requestOperation(input);assert.equal(plan.requestBody.content[0].multipart.usesTree,true);
 const selection={...input,mediaType:'multipart/mixed',text:'{"xml":{"n":9007199254740993},"links":{"linkset":[{"next":[{"href":"/p"}]}]}}',headers:{'/xml':[{name:'Link',modeled:true,value:'{"linkset":[{"next":[{"href":"/n","title":"a,b"}]}]}'}]}};
 const prepared=await requestMultipartPlan(selection),chunks=[];
 for(const part of prepared.tree.parts){chunks.push(Buffer.from('--Named\r\nContent-Type: '+part.contentType+'\r\nContent-Disposition: form-data; name="'+part.name+'"\r\n'+part.headers.map(field=>field.name+': '+field.value+'\r\n').join('')+'\r\n'),Buffer.from(part.bytes,'base64'),Buffer.from('\r\n'));}chunks.push(Buffer.from('--Named--\r\n'));
 const result=await requestMultipartPlan({...selection,wireType:'multipart/mixed; boundary=Named',wire:Buffer.concat(chunks).toString('base64')});
 assert.equal(result.proof.valid,true);assert.equal(result.proof.instance,selection.text);
 // A different Linkset also passes this schema. That is insufficient evidence
 // that it is the body generated from this exact captured typed input.
 const changed=Buffer.from(Buffer.concat(chunks).toString('latin1').replace('</p>','</q>'),'latin1');
 const validDifferent=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:'part',schema:{resource:root,pointer:'/paths/~1p/post/requestBody/content/multipart~1mixed/schema/properties/links'},mediaType:'application/linkset',text:'</q>; rel=next'}]});
 assert(validDifferent.runtimeEvaluations.every(value=>value.complete&&value.valid),JSON.stringify(validDifferent.runtimeFindings));
 await assert.rejects(requestMultipartPlan({...selection,wireType:'multipart/mixed; boundary=Named',wire:changed.toString('base64')}),error=>error.code==='request.multipart.identity');
});
test('dependentSchemas XML layouts follow actual property presence and retain original assertions',async()=>{
 const input=capture({type:'object',xml:{name:'p'},properties:{enabled:{type:'boolean'}},dependentSchemas:{enabled:{required:['value'],properties:{value:{type:'number',xml:{nodeType:'attribute'}}}}}});
 const result=await wire(input,'{"enabled":true,"value":42}');assert.match(result.bytes.toString(),/value="42"/);assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));
 await assert.rejects(requestMediaBytes({...input,mediaType:'application/xml',text:'{"enabled":true}'}),error=>error.code==='request.media.conformance');
});
test('nullable attribute omission is normalized only when the full schema permits it',async()=>{
 const input=capture({type:'object',xml:{name:'p'},minProperties:1,maxProperties:1,properties:{id:{type:['string','null'],xml:{nodeType:'attribute'}}}});
 const result=await wire(input,'{"id":null}');assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));assert.equal(result.decoded.runtimeEvaluations[0].modeledData,'{"id":null}');
});
test('URL-form media fields use their own XML/Linkset schemas and actual charset octets',async()=>{
 const {requestFormContentValue}=require('./dist/execution.cjs');
 const input=capture({}),document=JSON.parse(input.resources[0].text),xml={type:'object',xml:{name:'Value'},properties:{n:{type:'number',enum:['EXACT']}},required:['n']},links={type:'object',required:['linkset']};
 document.paths['/p'].post.requestBody.content={'application/x-www-form-urlencoded':{schema:{type:'object',required:['xml','links'],properties:{xml,links}},encoding:{xml:{contentType:'application/xml; charset=utf-16be'},links:{contentType:'application/linkset'}}}};
 input.resources[0].text=JSON.stringify(document).replaceAll('"EXACT"','9007199254740993');
 const formType='application/x-www-form-urlencoded',bodyText='{"xml":{"n":9007199254740993},"links":{"linkset":[{"next":[{"href":"/n","title":"a,b"}]}]}}';
 const a=await requestFormContentValue({...input,formType,bodyText,name:'xml',index:0,mediaType:'application/xml; charset=utf-16be',text:'{"n":9007199254740993}',structured:true});
 const b=await requestFormContentValue({...input,formType,bodyText,name:'links',index:0,mediaType:'application/linkset',text:'{"linkset":[{"next":[{"href":"/n","title":"a,b"}]}]}',structured:true});
 assert.match(a.value,/%00%3C/);assert.match(b.value,/%3C%2Fn%3E/);
 const at={resource:root,pointer:'/paths/~1p/post/requestBody/content/application~1x-www-form-urlencoded'};
 const result=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:formType,text:'xml='+a.value+'&links='+b.value,mediaType:formType,form:at,schema:{...at,pointer:at.pointer+'/schema'}}]});
 assert(result.runtimeEvaluations.every(value=>value.complete&&value.valid),JSON.stringify(result.runtimeFindings));
 await assert.rejects(requestFormContentValue({...input,formType,bodyText,name:'xml',index:0,mediaType:'application/xml; charset=utf-16be',text:'{"n":9007199254740992}',structured:true}),error=>error.code==='request.media.conformance');
});
test('positional XML attribute/element arrays retain order from the schema and reject unmodeled attributes',async()=>{
 const schema={type:'array',xml:{nodeType:'element',name:'p'},prefixItems:[{type:'string',xml:{nodeType:'attribute',name:'id'}},{type:'number',xml:{nodeType:'element',name:'n'}}],items:false,minItems:2,maxItems:2};
 const input=capture(schema),result=await wire(input,'["a&b",9007199254740993]');assert.match(result.bytes.toString(),/id="a&amp;b"/);assert.equal(result.decoded.runtimeEvaluations[0].modeledData,'["a&b",9007199254740993]');
 const invalid=await evaluateSchemas({...input,runtimeInstances:[{subject:'response-body',location:'xml',mediaType:'application/xml',text:'<p id="a" unmodeled="b"><n>1</n></p>',schema:{resource:root,pointer:'/paths/~1p/post/requestBody/content/application~1xml/schema'}}]});
 assert.equal(invalid.runtimeEvaluations[0].valid,false);
});
test('structured XML Header text uses character references for HTTP-prohibited line breaks',async()=>{
 const input=capture({}),document=JSON.parse(input.resources[0].text),schema={type:'string',enum:['a\nb\tc'],xml:{name:'V'}};
 document.paths['/p'].post.parameters=[{in:'header',name:'X-Data',content:{'application/xml':{schema}}}];input.resources[0].text=JSON.stringify(document);
 const prepared=await requestContentParameters({...input,values:{'header\0X-Data':'"a\\nb\\tc"'}});
 assert.match(prepared.values['header\0X-Data'],/a&#10;b&#9;c/);assert(!/[\r\n\t]/.test(prepared.values['header\0X-Data']));
 const checked=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-parameter',location:'header:X-Data',text:'',parameter:{resource:root,pointer:'/paths/~1p/post/parameters/0',values:[prepared.values['header\0X-Data']]}}]});
 assert(checked.runtimeEvaluations.every(value=>value.complete&&value.valid),JSON.stringify(checked.runtimeFindings));
});
test('fixed repeated text arrays and empty required text items have schema-established boundaries',async()=>{
 for(const [schema,value]of [
  [{type:'array',xml:{nodeType:'element',name:'p'},items:{type:'string',xml:{nodeType:'text'},minLength:2,maxLength:2},minItems:2,maxItems:2},'["ab","cd"]'],
  [{type:'array',xml:{nodeType:'element',name:'p'},items:{type:'string',xml:{nodeType:'text'}},minItems:1,maxItems:1},'[""]'],
  [{type:'array',xml:{nodeType:'element',name:'p'},prefixItems:[{type:'string',const:'a',xml:{nodeType:'text'}}],items:{type:'string',const:'bc',xml:{nodeType:'text'}},minItems:2,maxItems:2},'["a","bc"]'],
  [{type:'object',xml:{name:'p'},const:{empty:[]},properties:{empty:{type:'array',items:{type:'string'}}}},'{"empty":[]}']
 ]){
  const result=await wire(capture(schema),value);assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));assert.equal(result.decoded.runtimeEvaluations[0].modeledData,value);
 }
});

test('inline array object groups use finite schema-proven boundaries',async()=>{
 const schema={type:'array',xml:{nodeType:'element',name:'p'},items:{type:'object',xml:{nodeType:'none'},required:['a','b'],properties:{a:{type:'string'},b:{type:'number'}}},minItems:2,maxItems:2};
 const result=await wire(capture(schema),'[{"a":"first","b":1},{"a":"second","b":2}]');
 assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));
 assert.equal(result.decoded.runtimeEvaluations[0].modeledData,'[{"a":"first","b":1},{"a":"second","b":2}]');
});
test('empty optional text array positions are refused when no unique inverse exists',async()=>{
 const input=capture({type:'array',xml:{nodeType:'element',name:'p'},items:{type:'string',xml:{nodeType:'text'}},maxItems:1});
 const schema={resource:root,pointer:'/paths/~1p/post/requestBody/content/application~1xml/schema'};
 const result=await evaluateSchemas({...input,runtimeInstances:[{schema,subject:'response-body',location:'xml',mediaType:'application/xml',text:'<p/>'}]});
 assert(result.runtimeEvaluations.some(value=>!value.complete||!value.valid),JSON.stringify(result.runtimeFindings));
 assert(result.runtimeFindings.some(value=>/ambiguous|inversion/.test(value.code+' '+value.message)));
});

test('Linkset internationalized attribute syntax and profiles retain their defined semantics',async()=>{
 const input=capture({}),schema={resource:root,pointer:'/paths/~1p/post/requestBody/content/application~1xml/schema'};
 for(const language of ['ja','zh-Hant-TW','en-US-u-ca-gregory','x-internal','i-klingon']) {
  const text=JSON.stringify({linkset:[{next:[{href:'/p','custom*':[{value:'雪',language}]}]}]});
  const prepared=await evaluateSchemas({...input,mediaPreparations:[{schema,text,mediaType:'application/linkset; profile="https://example.org/profile https://example.org/other"'}]});
  assert.match(Buffer.from(prepared.mediaPreparations[0].base64,'base64').toString(),/custom\*=UTF-8/);
 }
 for(const language of ['123','a--b','en-abcdefghi','en-u-ca-u-nu','sl-rozaj-rozaj']) {
  const text=JSON.stringify({linkset:[{next:[{href:'/p','custom*':[{value:'雪',language}]}]}]});
  const result=await evaluateSchemas({...input,runtimeInstances:[{schema,subject:'response-body',location:'invalid-language',text,mediaType:'application/linkset+json'}]});
  assert.equal(result.runtimeEvaluations[0].valid,false);
 }
 const text='{"linkset":[]}';
 for(const profile of ['','../relative']) {
  const result=await evaluateSchemas({...input,runtimeInstances:[{schema,subject:'response-body',location:'invalid-profile',text,mediaType:'application/linkset+json; profile="'+profile+'"'}]});
  assert.equal(result.runtimeEvaluations[0].valid,false);
 }
});

test('whole-schema assertions can establish necessary empty XML properties',async()=>{
 const schema={type:'object',xml:{name:'p'},minProperties:2,maxProperties:2,properties:{empty:{type:'array',items:{type:'string'}},text:{type:'string',xml:{nodeType:'text'}}}};
 const result=await wire(capture(schema),'{"empty":[],"text":""}');
 assert.equal(result.decoded.runtimeEvaluations[0].valid,true,JSON.stringify(result.decoded.runtimeFindings));
 assert.equal(result.decoded.runtimeEvaluations[0].modeledData,'{"empty":[],"text":""}');
});

test('legacy XML/Linkset octet schemas retain bytes and independently reject malformed documents',async()=>{
 for(const [mediaType,text]of [['application/xml','<p>é</p>'],['application/linkset','</p>; rel=next'],['application/linkset+json','{"linkset":[{"next":[{"href":"/p","title":"雪"}]}]}']]) {
  const input=capture({type:'string',format:'binary'},'3.0.4'),schema={resource:root,pointer:'/paths/~1p/post/requestBody/content/application~1xml/schema'};
  const valid=await evaluateSchemas({...input,runtimeInstances:[{schema,subject:'request-body',location:'octets',mediaType,text:Buffer.from(text).toString('base64'),mediaBase64:true}]});
  assert(valid.runtimeEvaluations.every(value=>value.complete&&value.valid),JSON.stringify(valid.runtimeFindings));
  const invalid=await evaluateSchemas({...input,runtimeInstances:[{schema,subject:'request-body',location:'octets',mediaType,text:'malformed'}]});
  assert.equal(invalid.runtimeEvaluations[0].valid,false);
 }
});

test('two schema-valid values do not prove XML serialization correspondence',async()=>{
 const input=capture({type:'object',xml:{name:'p'},required:['content'],properties:{content:{type:'string',xml:{nodeType:'cdata'}}}});
 const schema={resource:root,pointer:'/paths/~1p/post/requestBody/content/application~1xml/schema'};
 for(const text of ['{"content":"\\r"}','{"content":"\\n"}']) {
  const result=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:'typed',schema,text}]});
  assert(result.runtimeEvaluations.every(value=>value.complete&&value.valid));
 }
 await assert.rejects(requestMediaBytes({...input,mediaType:'application/xml',text:'{"content":"\\r"}'}),error=>error.code==='runtime.media.correspondence');
});
