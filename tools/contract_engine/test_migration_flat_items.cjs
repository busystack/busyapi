const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{analyse,createGraph}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs'),{SourceDocument}=require('./dist/document.cjs');
const versions=['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
function concrete(packet,pointer,kind){
 const {graph}=createGraph(packet);let resource=packet.root;const seen=new Set();
 while(true){const id=resource+'#'+pointer;assert(!seen.has(id));seen.add(id);
  const edge=graph.referenceAs(resource,pointer,'$ref',kind);if(!edge)return {resource,pointer,graph};
  assert.equal(edge.resolution,'resolved');resource=edge.targetResource;pointer=edge.targetPointer;
 }
}
function flat(node){
 assert(node&&node.kind==='object');assert.equal(typeof node.value.type,'string');
 for(const field of ['$ref','$dynamicRef','allOf','anyOf','oneOf','not','prefixItems','properties'])assert.equal(node.children.has(field),false);
 if(node.value.type==='array')flat(node.children.get('items'));
}
for(const version of versions)for(const format of ['yaml','json'])for(const mode of ['homogeneous','constrained','composed','nested','finite','finite-condition','unreachable','closed-tail','empty']){
 if(version.startsWith('3.0')&&['finite','finite-condition','closed-tail','empty'].includes(mode))continue;
 test(`${version} ${format} ${mode} flat Items retain shared Header/parameter and neutral schema owners`,async()=>{
  const root='file:///flat-items/api.'+format,modern=!version.startsWith('3.0');
  const item=mode==='nested'?{type:'array',minItems:1,maxItems:2,items:{type:'integer',minimum:0,maximum:2}}:
   mode==='composed'?{allOf:[{type:'integer',format:'int64',minimum:'EXACT'},{maximum:'LIMIT',multipleOf:2}]}:
   mode.startsWith('finite')?{type:'integer',enum:[0,1,2]}:{type:'integer',format:'int64',minimum:'EXACT'};
  const ref={$ref:'#/components/schemas/Item'};
  const tuple={type:'array',...(modern?{prefixItems:[ref]}:{}),items:ref,
   ...(['constrained','nested','finite','finite-condition','unreachable'].includes(mode)?{maxItems:mode==='unreachable'?0:3}:{})};
  if(mode.startsWith('finite')){tuple.prefixItems=[{type:'integer',enum:[1]}];tuple.items={type:'integer',enum:[0,2]};}
  if(mode==='finite-condition'){tuple.if={maxItems:1};tuple.then={minItems:1};}
  if(mode==='closed-tail')tuple.items=false;
  if(mode==='empty'){delete tuple.prefixItems;tuple.items=false;}
  const document={openapi:version,info:{title:'Flat Items',version:'1'},paths:{'/value':{get:{
   parameters:[{$ref:'#/components/parameters/Values'}],responses:{200:{description:'Values',headers:{'X-Values':{$ref:'#/components/headers/Alias'}}}},
  }}},components:{schemas:{Tuple:tuple,Item:item},parameters:{Values:{name:'values',in:'query',style:'form',explode:true,schema:{$ref:'#/components/schemas/Tuple'}}},
   headers:{Actual:{schema:{$ref:'#/components/schemas/Tuple'}},Alias:{$ref:'#/components/headers/Actual',...(version.startsWith('3.0')?{'x-ignored':{n:'EXACT',flag:false}}:{})}}},
   'x-history':{tuple,item,n:'EXACT',flag:false,literal:{$ref:'not-a-dependency.json'}}};
  const text=(format==='yaml'?'# Shared item aliases\r\n'+YAML.stringify(document).replaceAll('\n','\r\n'):JSON.stringify(document))
   .replace(/"?EXACT"?/g,'9007199254740993.00').replace(/"?LIMIT"?/g,'9007199254740996.00');
  const input={root,snapshot:'flat-items-'+mode,resources:[{id:root,text,generation:3}],targetVersion:'2.0',destination:'file:///flat-items-output/'};
  const samples=mode==='nested'?['null','[]','[[]]','[[0]]','[[2,1],[0]]','[[3]]','[[0,1,2]]','[0]']:
   mode.startsWith('finite')?['null','[]','[1]','[0]','[1,0]','[1,1]','[1,2,0]','[1,0,2,0]']:
   ['null','[]','[9007199254740993]','[9007199254740992]','[9007199254740994,9007199254740996]',
    '[9007199254740994,9007199254740994,9007199254740994,9007199254740994]','[false]'];
  const bindings=packet=>{
   const header=concrete(packet,'/paths/~1value/get/responses/200/headers/X-Values','header');
   const parameter=concrete(packet,'/paths/~1value/get/parameters/0','parameter');
   const legacy=header.graph.family==='2.0';
   return [{resource:header.resource,pointer:header.pointer+(legacy?'':'/schema')},
    {resource:parameter.resource,pointer:parameter.pointer+(legacy?'':'/schema')},
    {resource:packet.root,pointer:(legacy?'/definitions':'/components/schemas')+'/Tuple'},
    {resource:packet.root,pointer:(legacy?'/definitions':'/components/schemas')+'/Item'}];
  };
  const evaluate=async packet=>{
   const independent=mode==='nested'?['[]','[0]','[3]','[[0]]']:mode.startsWith('finite')?['0','1','2','3','null']:
    ['9007199254740993','9007199254740992','9007199254740994','false','null'];
   const result=await evaluateSchemas({...packet,runtimeInstances:bindings(packet).flatMap((schema,index)=>(index===3?independent:samples).map(text=>({
    subject:'response-body',text,location:String(index),schema})))});
   assert.equal(result.complete,true,JSON.stringify(result.findings));assert(result.runtimeEvaluations.every(value=>value.complete));return result.runtimeEvaluations.map(value=>value.valid);
  };
  const before=await evaluate(input);assert(before.slice(0,samples.length).some(Boolean));assert(before.slice(0,samples.length).some(value=>!value));
  if(mode.startsWith('finite'))assert.deepEqual(before.slice(0,8),[false,mode!=='finite-condition',true,false,true,false,true,false]);
  const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
  const output={root:review.outputRoot,snapshot:'cold-flat-items',resources:review.outputs.map(value=>({...value,generation:0}))};
  assert.equal(analyse(output).status,'complete');assert.deepEqual(await evaluate(output),before);
  const header=concrete(output,'/paths/~1value/get/responses/200/headers/X-Values','header');
  const parameter=concrete(output,'/paths/~1value/get/parameters/0','parameter');
  flat(header.graph.docs.get(header.resource).dataNode(header.pointer));flat(parameter.graph.docs.get(parameter.resource).dataNode(parameter.pointer));
  assert.equal(header.graph.docs.get(output.root).dataNode('/components'),undefined);
  assert.equal(header.graph.docs.get(output.root).dataJson('/x-history'),new SourceDocument(text,root).dataJson('/x-history'));
  if(!['nested','empty'].includes(mode)){
   const wireSamples=mode.startsWith('finite')?['1','1,0','0','1,1']:['9007199254740993','9007199254740992','9007199254740994,9007199254740996'];
   const wire=async packet=>{
    const result=await evaluateSchemas({...packet,runtimeInstances:wireSamples.flatMap(value=>[
     {subject:'response-header',location:value,text:'',header:{resource:packet.root,pointer:'/paths/~1value/get/responses/200/headers/X-Values',name:'X-Values',values:[value]}},
     {subject:'request-parameter',location:value,text:value.split(',').map(value=>'values='+value).join('&'),parameter:{resource:packet.root,pointer:'/paths/~1value/get/parameters/0'}},
    ])});
    assert.equal(result.complete,true,JSON.stringify(result.findings));assert(result.runtimeEvaluations.every(value=>value.complete));return result.runtimeEvaluations.map(value=>value.valid);
   };
   assert.deepEqual(await wire(output),await wire(input));
  }
  assert.equal(input.resources[0].text,text);
 });
}

for(const mode of ['object','null','annotation','recursive','order'])test(`flat Items retain a precise ${mode} representation refusal`,async()=>{
 const root='file:///flat-negative/api.json';
 const item=mode==='object'?{type:'object',properties:{n:{type:'integer'}}}:mode==='null'?{type:'null'}:
  mode==='annotation'?{type:'integer',description:'Applicable item annotation'}:
  mode==='recursive'?{type:'array',items:{$ref:'#/components/schemas/Item'}}:{type:'integer'};
 const tuple={type:'array',prefixItems:[mode==='order'?{type:'string'}:{$ref:'#/components/schemas/Item'}],items:{$ref:'#/components/schemas/Item'}};
 const text=JSON.stringify({openapi:'3.2.1',info:{title:'Flat refusals',version:'1'},paths:{'/value':{get:{responses:{200:{description:'Values',headers:{X:{schema:tuple}}}}}}},components:{schemas:{Item:item}}});
 const input={root,snapshot:'flat-negative',resources:[{id:root,text,generation:1}],targetVersion:'2.0',destination:'file:///flat-negative-output/'};
 const review=await planMigration(input);assert.equal(review.complete,false);assert.deepEqual(review.outputs,[]);
 assert(review.problems.some(value=>value.reason==='target-representation'),JSON.stringify(review.problems));
 if(mode==='annotation')assert(review.problems.some(value=>value.code==='migration.flat-items.keyword'&&value.message.includes('description')));
 assert.equal(input.resources[0].text,text);
});

for(const format of ['yaml','json'])for(const firstVersion of ['3.0.4','3.2.1'])
test(`${format} ${firstVersion} mixed native entries retain shared flat Header owners after either root is downgraded`,async()=>{
 const root='file:///mixed-flat/a.'+format,other='file:///mixed-flat/b.'+format;
 const secondVersion=firstVersion==='3.0.4'?'3.2.1':'3.0.4';
 const api=(version,foreign)=>({openapi:version,info:{title:foreign?'First':'Second',version:'1'},paths:{'/value':{get:{responses:{200:{description:'Values',headers:{
  X:{$ref:foreign?'./b.'+format+'#/components/headers/Alias':'#/components/headers/Alias'},
 }}}}}},components:{headers:{...(foreign?{}:{Alias:{$ref:'#/components/headers/Actual'},Actual:{schema:{$ref:'#/components/schemas/Tuple'}}})},
  schemas:foreign?{}:{Tuple:{type:'array',items:{$ref:'#/components/schemas/Item'},maxItems:2},Item:{type:'integer',minimum:0,format:'int64'}}},
  'x-history':{n:'EXACT',literal:{$ref:'never-load.json'}}});
 const encode=value=>(format==='yaml'?YAML.stringify(value):JSON.stringify(value)).replace(/"?EXACT"?/g,'9007199254740993.00');
 const resources=[{id:root,generation:1,text:encode(api(firstVersion,true))},{id:other,generation:2,text:encode(api(secondVersion,false))}];
 const originals=resources.map(value=>value.text),input={root,snapshot:'mixed-flat',resources,targetVersion:'2.0',destination:'file:///mixed-flat-output/'};
 const inspect=async(packet,entry)=>{
  const header=concrete({...packet,root:entry},'/paths/~1value/get/responses/200/headers/X','header');
  const legacy=header.graph.family==='2.0',pointer=header.pointer+(legacy?'':'/schema');
  if(legacy)flat(header.graph.docs.get(header.resource).dataNode(header.pointer));
  const result=await evaluateSchemas({...packet,root:entry,runtimeInstances:['null','[]','[0]','[-1]','[0,1,2]','[false]'].map(text=>({
   subject:'response-body',location:'X',text,schema:{resource:header.resource,pointer}}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(value=>value.valid),[false,true,true,false,false,false]);
  return result.runtimeEvaluations.map(value=>value.valid);
 };
 const before=await inspect(input,root);assert.deepEqual(await inspect(input,other),before);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const output={root:review.outputRoot,snapshot:'mixed-flat-cold',resources:review.outputs.map(value=>({...value,generation:0}))};
 const otherRoot=review.changes.find(value=>value.resource===other).destination;
 assert.deepEqual(await inspect(output,output.root),before);assert.deepEqual(await inspect(output,otherRoot),before);
 assert.deepEqual(input.resources.map(value=>value.text),originals);
 assert.deepEqual((await planMigration({...input,resources:[...resources].reverse()})).outputs.slice().sort((a,b)=>a.id.localeCompare(b.id)),review.outputs.slice().sort((a,b)=>a.id.localeCompare(b.id)));
});
