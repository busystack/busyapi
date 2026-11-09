const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {Parser}=require('commonmark');
const {planExtract,planInline,planMoveDefinition}=require('./dist/refactoring_copy.cjs');
const {planFileMove}=require('./dist/refactoring_file.cjs');
const {createGraph,analyse}=require('./dist/model.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {documentUriBase,resolveUri}=require('./dist/reference_graph.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const versions=['2.0','3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
const rich=['[Guide](../guide(a).md?q=0&amp;empty=#雪 "Keep title")','![図][image] [query](?q=2#part) [local](#section)',
 '[image]: ./caf%C3%A9.svg "Keep image title"','','[unused]: ./literal-unused.md','@TICK@[code](./literal-code.md)@TICK@',
 '','@TICK@@TICK@@TICK@md','[code](./literal-fence.md)','@TICK@@TICK@@TICK@','Keep plain ./literal-prose.md'].join('\n').replaceAll('@TICK@',String.fromCharCode(96));
const render=(value,format)=>(format==='json'?JSON.stringify(value):'# Keep organization\r\n'+YAML.stringify(value).replaceAll('\n','\r\n')).replace(/"?EXACT"?/g,'9007199254740993.00');
function document(version,schemas={}){return {...(version==='2.0'?{swagger:version}:{openapi:version}),info:{title:'Markdown',version:'business'},paths:{},...(version==='2.0'?{definitions:schemas}:{components:{schemas}})};}
function apply(resources,plan){return resources.map(resource=>{
 let text=resource.text;
 for(const edit of [...plan.edits].filter(value=>value.buffer===resource.id).sort((a,b)=>b.start-a.start)){
  assert.equal(text.slice(edit.start,edit.end),edit.expected);text=text.slice(0,edit.start)+edit.replacement+text.slice(edit.end);
 }
 return {...resource,text};
});}
function rendered(value,base){
 const walker=new Parser().parse(value).walker(),events=[];let event;
 while((event=walker.next())){
  const node=event.node;
  events.push([event.entering,node.type,node.literal,node.title,node.info,node.destination===null?null:node.destination===undefined?undefined:node.destination.startsWith('#')?node.destination:resolveUri(node.destination,base).href]);
 }
 return events;
}
async function values(root,resources,resource,pointer){
 const result=await evaluateSchemas({root,snapshot:'maintenance-values',resources,runtimeInstances:['{"id/~雪":9007199254740993.00}','{"id/~雪":9007199254740992}','{}'].map(text=>({subject:'response-body',location:'application/json',text,schema:{resource,pointer}}))});
 assert.equal(result.complete,true,JSON.stringify(result.findings));return result.runtimeEvaluations.map(value=>value.valid);
}
for(const version of versions)for(const format of ['yaml','json'])for(const mode of ['extract','move-definition','inline','file-move'])
test(`${version} ${format} ${mode} preserves rendered Markdown, exact values and reference bindings`,async()=>{
 const legacy=version==='2.0',group=legacy?'/definitions':'/components/schemas';
 const root='file:///approved/source/api.'+format,destination='file:///approved/target/api.'+format;
 const model={type:'object',description:rich,required:['id/~雪'],properties:{'id/~雪':{$ref:'#'+group+'/Number'}},'x-exact':'EXACT','x-data':{description:'[literal](./payload-only.md)'}};
 const source=document(version,{Model:model,Number:{type:'integer',minimum:'EXACT'}}),other=document(version);
 let selected=group+'/Model';
 if(mode==='extract'){
  source.paths={'/value':{get:{responses:{200:{description:'Reply',...(legacy?{schema:model}:{content:{'application/json':{schema:model}}})}}}}};
  delete (legacy?source.definitions:source.components.schemas).Model;
  selected='/paths/~1value/get/responses/200'+(legacy?'/schema':'/content/application~1json/schema');
 }
 if(mode==='inline')(legacy?other.definitions:other.components.schemas).Use={$ref:'../source/api.'+format+'#'+group+'/Model'};
 const resources=[{id:root,text:render(source,format),generation:3},...(mode==='file-move'?[]:[{id:destination,text:render(other,format),generation:5}])];
 const owning=mode==='inline'?destination:root,contexts=[{root:owning,resources:resources.map(value=>value.id)}],before=resources.map(value=>value.text);
 const common={root:owning,snapshot:'markdown-maintenance',resources,contexts};
 const plan=mode==='file-move'?planFileMove({...common,target:{resource:root,generation:3},destinationResource:destination}):
  mode==='inline'?planInline({...common,target:{root:owning,resource:destination,generation:5,pointer:group+'/Use'}}):
  (mode==='extract'?planExtract:planMoveDefinition)({...common,target:{root,resource:root,generation:3,pointer:selected},destinationResource:destination,name:'Copied'});
 let output=apply(resources,plan),nextRoot=owning,nextResource=destination,nextPointer=group+(mode==='inline'?'/Use':mode==='file-move'?'/Model':'/Copied');
 if(mode==='file-move'){output=output.map(value=>({...value,id:destination}));nextRoot=destination;}
 const from=createGraph({root:owning,resources}).graph,to=createGraph({root:nextRoot,resources:output}).graph;
 const oldScope=from.scopes.get(root+'#'+selected),newScope=to.scopes.get(nextResource+'#'+nextPointer);assert(oldScope&&newScope);
 const actual=to.docs.get(nextResource).dataNode(nextPointer+'/description').value;
 assert.deepEqual(rendered(actual,documentUriBase(to,newScope)),rendered(rich,documentUriBase(from,oldScope)));
 for(const unchanged of ['[unused]: ./literal-unused.md','[code](./literal-code.md)','[code](./literal-fence.md)','Keep plain ./literal-prose.md'])assert(actual.includes(unchanged));
 assert(actual.includes('[local](#section)'));
 assert.equal(to.docs.get(nextResource).dataNode(nextPointer+'/x-data/description').value,'[literal](./payload-only.md)');
 assert(to.docs.get(nextResource).dataJson(nextPointer+'/x-exact').includes('9007199254740993.00'));
 const edge=to.references.find(value=>value.resource===nextResource&&value.pointer===nextPointer+'/properties/id~1~0雪');assert(edge);
 assert.equal(edge.resolution,'resolved');assert.equal(edge.targetResource,mode==='file-move'?destination:root);assert.equal(edge.targetPointer,group+'/Number');
 assert.deepEqual(await values(nextRoot,output,nextResource,nextPointer),await values(owning,resources,root,selected));
 assert.equal(analyse({root:nextRoot,resources:output}).status,'complete');
 if(mode==='inline')assert.equal(output.find(value=>value.id===root).text,before[0]);
 assert.deepEqual(resources.map(value=>value.text),before);
});

for(const version of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])
test(`${version} ${format} inline Reference Object description override retains its occurrence base`,()=>{
 const root='file:///approved/use/api.'+format,shared='file:///approved/shared/api.'+format;
 const source=document(version);source.components.responses={Shared:{description:'[Definition](./definition.md)',content:{'application/json':{schema:{type:'string',description:'[Schema](./schema.md)'}}}}};
 const use=document(version);use.paths={'/value':{get:{responses:{200:{$ref:'../shared/api.'+format+'#/components/responses/Shared',description:'[Override](./local.md)'}}}}};
 const resources=[{id:root,text:render(use,format),generation:1},{id:shared,text:render(source,format),generation:2}],input={root,snapshot:'override-markdown',resources,contexts:[{root,resources:[root,shared]}],target:{root,resource:root,generation:1,pointer:'/paths/~1value/get/responses/200'}};
 const plan=planInline(input),output=apply(resources,plan),doc=new SourceDocument(output[0].text,root);
 assert.equal(doc.dataNode(input.target.pointer+'/description').value,'[Override](./local.md)');
 assert.equal(doc.dataNode(input.target.pointer+'/content/application~1json/schema/description').value,'[Schema](<file:///approved/shared/schema.md>)');
 assert.equal(output[1].text,resources[1].text);
});

for(const format of ['yaml','json'])test(`${format} moving a rendered description separates its contract consumer from the literal data`,()=>{
 const root='file:///approved/api.'+format,model={type:'object',default:{description:'[Literal](./data.md)'}},source=document('3.1.2',{Model:model});
 source.paths={'/value':{get:{responses:{200:{$ref:'#/components/schemas/Model/default'}}}}};
 const text=render(source,format),input={root,snapshot:'dual-markdown',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{resource:root,generation:1},destinationResource:'file:///reviewed/api.'+format};
 const plan=planFileMove(input),output=apply(input.resources,plan),doc=new SourceDocument(output[0].text,input.destinationResource);
 assert.equal(doc.dataNode('/components/schemas/Model/default/description').value,'[Literal](./data.md)');
 assert.equal(doc.dataNode('/paths/~1value/get/responses/200/description').value,'[Literal](<file:///approved/data.md>)');
 assert.equal(plan.sourceOwnership[0].effect,'separated-contract-use');assert.equal(input.resources[0].text,text);
});
for(const anchor of ['description: &docs "[Guide](./guide.md)"\nx-data: *docs\n','description: "[Guide](./guide.md)"\n'])
test('file relocation separates anchored Markdown from its literal alias',()=>{
 const root='file:///approved/api.yaml',shared=anchor.includes('&docs');
 const text='openapi: 3.1.2\ninfo:\n  title: Shared\n  version: "1"\n  '+anchor+'paths: {}\n';
 const input={root,snapshot:'yaml-markdown',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{resource:root,generation:1},destinationResource:'file:///reviewed/api.yaml'};
 const plan=planFileMove(input),output=apply(input.resources,plan),doc=new SourceDocument(output[0].text,root);
 assert.equal(doc.dataNode('/info/description').value,'[Guide](<file:///approved/guide.md>)');
 if(shared)assert.equal(doc.dataNode('/x-data').value,'[Guide](./guide.md)');
 assert.equal(input.resources[0].text,text);
});

for(const version of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])for(const compatible of [false,true])
test(`${version} ${format} shared native/schema Markdown uses every rendered base compatible=${compatible}`,()=>{
 const root='file:///approved/api.'+format,destination='file:///reviewed/api.'+format;
 const pointer='/components/schemas/Owner/properties/Reply',description='[Guide](guide.md) ![image][image]\n\n[image]: image.svg "Title"\n\n`[code](code.md)`';
 const source=document(version,{Owner:{$id:'https://schema.invalid/'+(compatible?'approved':'other')+'/base',properties:{Reply:{description}}}});
 source.paths={'/value':{get:{responses:{200:{$ref:'#'+pointer}}}}};
 const resources=[{id:root,text:render(source,format),generation:1}],input={snapshot:'shared-roles',resources,
  contexts:[{root,resources:[root]}],target:{resource:root,generation:1},destinationResource:destination};
 const original=createGraph({root,resources}).graph;
 assert(original.scopeAs(root,pointer,'schema'));assert(original.scopeAs(root,pointer,'response'));
 const plan=planFileMove(input),output=apply(resources,plan).map(value=>({...value,id:destination}));
 const after=createGraph({root:destination,resources:output}).graph,value=after.docs.get(destination).dataNode(pointer+'/description').value;
 if(compatible)assert(value.includes('../approved/guide.md'));
 else {assert.equal(value,description);assert.equal(plan.sourceOwnership[0].effect,'separated-contract-use');}
 assert(value.includes('`[code](code.md)`'));
 for(const kind of ['schema','response']){
  const nextPointer=kind==='response'&&!compatible?'/paths/~1value/get/responses/200':pointer;
  const nextValue=after.docs.get(destination).dataNode(nextPointer+'/description').value;
  assert.deepEqual(rendered(nextValue,documentUriBase(after,after.scopeAs(destination,nextPointer,kind))),
  rendered(description,documentUriBase(original,original.scopeAs(root,pointer,kind))));
 }
 assert.equal(after.scopeAs(destination,pointer,'schema').base,original.scopeAs(root,pointer,'schema').base);
 assert.equal(resources[0].text,render(source,format));
});

for(const format of ['yaml','json'])test(`${format} incompatible shared Markdown without an editable contract-use owner remains an unavailable proof`,()=>{
 const root='file:///approved/api.'+format,pointer='/components/schemas/Owner/properties/Reply';
 const source=document('3.2.1',{Owner:{$id:'https://schema.invalid/other/base',properties:{Reply:{description:'[Guide](guide.md)'}}},
  Holder:{default:{NativeUse:{$ref:'#'+pointer}}}});
 source.paths={'/value':{get:{responses:{200:{$ref:'#/components/schemas/Holder/default/NativeUse'}}}}};
 const text=render(source,format),input={snapshot:'no-editable-owner',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{resource:root,generation:1},destinationResource:'file:///reviewed/api.'+format};
 assert.throws(()=>planFileMove(input),error=>error.code==='refactor.markdown.context'&&error.kind==='unsupported'&&error.source?.pointer===pointer+'/description'&&error.message.includes('No independently editable incoming contract reference'));
 assert.equal(input.resources[0].text,text);
});

for(const version of versions)for(const mode of ['extract','move-definition','inline','file-move'])
test(`${version} YAML ${mode} specializes shared descriptions without changing literal and independent owners`,()=>{
 const root='file:///approved/source/api.yaml',destination='file:///approved/target/api.yaml',legacy=version==='2.0';
 const group=legacy?'/responses':'/components/responses',at='/paths/~1value/get/responses/200';
 const response={description:rich,'x-exact':'EXACT','x-bytes':'AAECA/7/AA=='};
 const source=document(version);source.paths={'/value':{get:{responses:{200:mode==='extract'?response:{$ref:'#'+group+'/Stored'}}}}};
 if(mode!=='extract'){if(legacy)source.responses={Stored:response};else source.components.responses={Stored:response};}
 let text=render(source,'yaml');
 // Anchor the actual parsed scalar, not a regex match on Markdown content.
 const parsed=new SourceDocument(text,root),description=(mode==='extract'?at:group+'/Stored')+'/description',field=parsed.node(description);
 text=parsed.replace(field.range[0],field.range[0],'&docs ')+"x-literal: *docs\r\n";
 if(!legacy&&/^3\.[12]/.test(version))text+='x-independent: &independent {description: *docs, type: string}\r\n';
 const other=document(version);if(mode==='inline')other.paths={'/value':{get:{responses:{200:{$ref:'../source/api.yaml#'+group+'/Stored'}}}}};
 const resources=[{id:root,text,generation:1},...(mode==='file-move'?[]:[{id:destination,text:render(other,'yaml'),generation:2}])];
 const owning=mode==='inline'?destination:root,common={snapshot:'shared-markdown',resources,contexts:[{root:owning,resources:resources.map(value=>value.id)}]};
 const plan=mode==='file-move'?planFileMove({...common,target:{resource:root,generation:1},destinationResource:destination}):
  mode==='inline'?planInline({...common,target:{root:owning,resource:destination,generation:2,pointer:at}}):
  (mode==='extract'?planExtract:planMoveDefinition)({...common,target:{root,resource:root,generation:1,pointer:mode==='extract'?at:group+'/Stored'},destinationResource:destination,name:'Copied'});
 const output=apply(resources,plan),copied=new SourceDocument(output.find(value=>value.id===(mode==='file-move'?root:destination)).text,destination);
 const pointer=mode==='inline'?at:mode==='file-move'?group+'/Stored':group+'/Copied';
 assert.deepEqual(rendered(copied.dataNode(pointer+'/description').value,destination),rendered(rich,root));
 const retained=new SourceDocument(output[0].text,root);assert.equal(retained.dataNode('/x-literal').value,rich);
 assert.equal(copied.dataJson(pointer+'/x-exact'),'9007199254740993.00');assert.equal(copied.dataNode(pointer+'/x-bytes').value,'AAECA/7/AA==');
 if(mode==='inline')assert.equal(output[0].text,text);
 assert.equal(resources[0].text,text);
});


test('an unchanged declared Markdown base does not require touching its anchored scalar',()=>{
 const root='file:///approved/api.yaml',text='openapi: 3.2.1\n$self: https://docs.invalid/original/api\ninfo:\n  title: Keep\n  version: "1"\n  description: &docs "[Guide](./guide.md)"\nx-copy: *docs\npaths: {}\n';
 const input={root,snapshot:'stable-markdown-base',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{resource:root,generation:1},destinationResource:'file:///reviewed/api.yaml'};
 const plan=planFileMove(input);assert(plan.file);assert.equal(plan.changes.find(value=>value.resource===root).after,text);
 assert.equal(input.resources[0].text,text);
});
