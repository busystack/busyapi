const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');
const engine=process.env.BUSYAPI_SOURCE_TYPE_BASELINE||__dirname;
const {assistSource}=require(path.join(engine,'dist/source_assistance.cjs'));
const {analyse}=require(path.join(engine,'dist/model.cjs'));
const {SourceDocument}=require(path.join(engine,'dist/document.cjs'));
const YAML=require(path.join(engine,'node_modules/yaml'));

for(const version of ['2.0','3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const json of [false,true]){
 test(`${version} ${json?'JSON':'YAML'} Source type choices produce legal original-family schemas`,()=>{
  const swagger=version==='2.0',nullType=version==='2.0'||version.startsWith('3.1.')||version.startsWith('3.2.');
  const schema='/'+(swagger?'definitions':'components/schemas')+'/Value';
  const document={...(swagger?{swagger:version}:{openapi:version}),info:{title:'Keep 雪',version:'unrelated'},paths:{},
   ...(swagger?{definitions:{Value:{type:'string',items:{type:'string'}}}}:{components:{schemas:{Value:{type:'string',items:{type:'string'}}}}})};
  const text=json?JSON.stringify(document,null,2):'# Keep comment\r\n'+YAML.stringify(document).replace(/\n/g,'\r\n');
  const root='file:///approved/api.'+(json?'json':'yaml'),parsed=new SourceDocument(text,root);
  const input={root,resource:root,caret:parsed.dataNode(schema+'/type').range[0]+2,snapshot:'type-choices',resources:[{id:root,text,generation:7,identity:'captured'}]};
  const suggestions=assistSource(input).completions;
  // Swagger Schema Object inherits Draft 4's type; its flat parameter and
  // Items Objects do not. OAS 2.0 §6.4.18 / OAS 3.0 §4.7.24.
  const expected=['object','array','string','number','integer','boolean',...(nullType?['null']:[])];
  assert.deepEqual(suggestions.map(value=>value.label).sort(),expected.filter(value=>value!=='string').sort());
  for(const suggestion of suggestions){
   let changed=text;
   for(const edit of [...suggestion.edits].reverse()){
    assert.equal(edit.buffer,root);assert.equal(edit.generation,7);
    assert.equal(changed.slice(edit.start,edit.end),edit.expected);
    changed=changed.slice(0,edit.start)+edit.replacement+changed.slice(edit.end);
   }
   const captured={...input,resources:[{...input.resources[0],text:changed,generation:8}]};
   const report=analyse(captured);
   assert(!report.findings.some(value=>value.severity==='error'),JSON.stringify(report.findings));
   const edited=new SourceDocument(changed,root);
   assert.equal(edited.dataNode(schema+'/type').value,suggestion.label);
   assert.equal(edited.dataNode(swagger?'/swagger':'/openapi').value,version);
   assert.equal(edited.dataNode('/info/version').value,'unrelated');
   if(!json)assert(changed.startsWith('# Keep comment\r\n')&&!/(?<!\r)\n/.test(changed));
  }
  assert.equal(input.resources[0].text,text);
  const illegal={...document,...(swagger?{definitions:{Value:{type:'null'}}}:{components:{schemas:{Value:{type:'null'}}}})};
  const report=analyse({...input,resources:[{...input.resources[0],text:json?JSON.stringify(illegal):YAML.stringify(illegal)}]});
  assert.equal(report.findings.some(value=>value.severity==='error'),!nullType,JSON.stringify(report.findings));
 });
}

for(const kind of ['query','header','path','formData','response-header','items'])for(const json of [false,true]){
 test(`Swagger ${kind} ${json?'JSON':'YAML'} Source choices keep flat object restrictions`,()=>{
  const parameter={name:kind==='path'?'id':'value',in:kind==='items'?'query':kind,type:'string',items:{type:'string'},...(kind==='path'?{required:true}:{})};
  if(kind==='items'){
   parameter.type='array';
   parameter.items.items={type:'string'};
  }
  const name=kind==='path'?'/value/{id}':'/value';
  const operation={responses:{200:{description:'Keep response'}}};
  if(kind==='response-header')operation.responses[200].headers={'X-Value':{type:'string',items:{type:'string'}}};
  else operation.parameters=[parameter];
  const document={swagger:'2.0',info:{title:'Keep 雪',version:'unrelated'},consumes:['multipart/form-data'],paths:{[name]:{get:operation}}};
  const base='/paths/'+name.replace(/~/g,'~0').replace(/\//g,'~1')+'/get';
  const pointer=base+(kind==='response-header'?'/responses/200/headers/X-Value':kind==='items'?'/parameters/0/items':'/parameters/0');
  const text=json?JSON.stringify(document,null,2):YAML.stringify(document);
  const root='file:///approved/flat.'+(json?'json':'yaml'),parsed=new SourceDocument(text,root);
  const input={root,resource:root,caret:parsed.dataNode(pointer+'/type').range[0]+2,snapshot:'flat-choices',resources:[{id:root,text,generation:7}]};
  const suggestions=assistSource(input).completions;
  const allowed=['array','boolean','integer','number',...(kind==='formData'?['file']:[])];
  assert.deepEqual(suggestions.map(value=>value.label).sort(),allowed.sort());
  for(const suggestion of suggestions){
   let changed=text;
   for(const edit of [...suggestion.edits].reverse()){
    assert.equal(edit.buffer,root);assert.equal(edit.generation,7);assert.equal(changed.slice(edit.start,edit.end),edit.expected);
    changed=changed.slice(0,edit.start)+edit.replacement+changed.slice(edit.end);
   }
   const report=analyse({...input,resources:[{...input.resources[0],text:changed,generation:8}]});
   assert(!report.findings.some(value=>value.severity==='error'),JSON.stringify({choice:suggestion.label,findings:report.findings}));
  }
  assert.equal(input.resources[0].text,text);
 });
}

// Schema value completions consume the same occurrence policy as Design.
for(const version of ['2.0','3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'])for(const json of [false,true])for(const mode of ['insert','partial','replace']) {
 test(`${version} ${json?'JSON':'YAML'} ${mode} Source schema forms preserve native semantics`,()=>{
  const swagger=version==='2.0',modern=/^3\.[12]\./.test(version);
  for(const field of ['additionalProperties','items']) {
   const schema='/'+(swagger?'definitions':'components/schemas')+'/Value';
   const values=field==='additionalProperties'||modern?[{},true,false]:swagger?[{},[]]:[{}];
   const marker=mode==='replace'?`"${field}": null`:mode==='partial'?`"${field.slice(0,4)}`:'§';
   const head=swagger?'"swagger":"2.0"':`"openapi":"${version}"`;
   const jsonText=`{${head},"info":{"title":"Keep 雪","version":"unrelated"},"paths":{},${swagger?'"definitions"':'"components":{"schemas"'}:{"Value":{${marker}}}${swagger?'':'}'},"x-literal":{"$ref":"payload","number":9007199254740993}}`;
   let text,caret;
   if(json){text=jsonText.replace('§','');caret=mode==='insert'?jsonText.indexOf('§'):mode==='partial'?text.indexOf(marker)+marker.length:text.indexOf('null')+2;}
   else {
    const key=mode==='replace'?`${field}: null`:mode==='partial'?field.slice(0,4):'§';
    text=`# Keep comment\r\n${swagger?'swagger':'openapi'}: "${version}"\r\ninfo: {title: Keep 雪, version: unrelated}\r\npaths: {}\r\n${swagger?'definitions:':'components:\r\n  schemas:'}\r\n${swagger?'  ':'    '}Value:\r\n${swagger?'    ':'      '}type: object\r\n${swagger?'    ':'      '}${key}\r\nx-literal: {$ref: payload, number: 9007199254740993}\r\n`;
    caret=mode==='insert'?text.indexOf('§'):mode==='partial'?text.indexOf(key)+key.length:text.indexOf('null')+2;
    text=text.replace('§','');
   }
   const root='file:///approved/forms.'+(json?'json':'yaml');
   const input={root,resource:root,caret,snapshot:'schema-forms',resources:[{id:root,text,generation:7,identity:'capture'}]};
   const choices=assistSource(input).completions.filter(c=>mode==='replace'||c.label===field||c.label.startsWith(field+' = '));
   assert.equal(choices.length,values.length,JSON.stringify({version,json,mode,field,choices}));
   for(let i=0;i<choices.length;i++) {
    let changed=text;
    for(const edit of [...choices[i].edits].reverse()) {
     assert.equal(edit.generation,7);assert.equal(edit.buffer,root);assert.equal(changed.slice(edit.start,edit.end),edit.expected);
     changed=changed.slice(0,edit.start)+edit.replacement+changed.slice(edit.end);
    }
    const parsed=new SourceDocument(changed,root);
    assert.deepEqual(parsed.dataNode(schema+'/'+field).value,values[i]);
    assert.equal(parsed.dataNode(swagger?'/swagger':'/openapi').value,version);
    assert.equal(parsed.dataNode('/info/version').value,'unrelated');
    assert(changed.includes('9007199254740993'));
    if(!json)assert(changed.startsWith('# Keep comment\r\n')&&!/(?<!\r)\n/.test(changed));
    const report=analyse({...input,resources:[{...input.resources[0],text:changed,generation:8}]});
    assert(!report.findings.some(f=>f.severity==='error'),JSON.stringify(report.findings));
   }
   assert.equal(input.resources[0].text,text);
  }
 });
}

test('Source schema form assistance does not infer custom dialects or payload contexts',()=>{
 for(const pointer of ['schema','payload']) {
  const text=pointer==='schema'
   ? '{"openapi":"3.2.1","info":{"title":"Keep","version":"1"},"paths":{},"components":{"schemas":{"Value":{"$schema":"https://example.invalid/dialect", § }}}}'
   : '{"openapi":"3.2.1","info":{"title":"Keep","version":"1"},"paths":{},"components":{"examples":{"Value":{"value":{ § }}}}}';
  const root='file:///approved/root.json',caret=text.indexOf('§');
  assert.deepEqual(assistSource({root,resource:root,caret,snapshot:'negative',resources:[{id:root,text:text.replace('§',''),generation:1}]}).completions,[]);
 }
});
