const {test}=require('node:test');
const assert=require('node:assert/strict');
const YAML=require('yaml');
const {analyse}=require('./dist/model.cjs');
const {requestOperation}=require('./dist/execution.cjs');
const {planMigration}=require('./dist/migration.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {createHash}=require('node:crypto');

function capture(version,method,format,referenced=false) {
 const root='file:///ignored-body/api.'+format,bodyId='file:///ignored-body/body.'+format;
 const body={description:'[Guide](/guide)',required:true,content:{'application/json':{schema:{type:'string'},example:'snow 雪'}}};
 const value={openapi:version,info:{title:'Ignored body 雪',version:'api-version'},servers:[{url:'https://api.invalid/v1'}],paths:{'/payload':{[method]:{requestBody:referenced?{$ref:'body.'+format}:body,responses:{204:{description:'Empty'}}}}},'x-kept':{empty:'',flag:false,zero:0,exact:'EXACT'}};
 const encode=value=>(format==='yaml'?'# Preserve comments 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)).replace(/"?EXACT"?/g,'9007199254740993.00');
 return {root,snapshot:'ignored-body-'+version+method+format+referenced,targetVersion:'2.0',destination:'file:///reviewed/converted/',resources:[{id:root,generation:3,text:encode(value)},...(referenced?[{id:bodyId,generation:7,text:encode(body)}]:[])]};
}
function outputs(result){return result.outputs.map(output=>({id:output.id,text:output.text,generation:0,aliases:Object.entries(result.manifest.resourceMappings).filter(([,path])=>path===output.path).map(([uri])=>uri)}));}
function operation(input){const found=analyse(input).operations[0];return requestOperation({...input,resource:found.resource,pointer:found.pointer,occurrence:found.occurrence});}

for(const format of ['yaml','json'])test(`B05-R1 ${format} referenced literal operations retain their declared method slots and body decisions`,async()=>{
 const root=`file:///referenced-applicability/api.${format}`,body={required:true,content:{'application/json':{schema:{type:'integer'}}}},op={requestBody:body,responses:{204:{description:'Empty'}}};
 const value={openapi:'3.0.4',info:{title:'Referenced bodies',version:'1'},paths:{},components:{links:{Ignored:{operationRef:'#/x-data/get'},Active:{operationRef:'#/x-data/post'}}},'x-data':{get:op,post:op,exact:'EXACT'}};
 const text=(format==='yaml'?YAML.stringify(value):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'referenced-applicability',resources:[{id:root,text,generation:1}],targetVersion:'3.2.1',destination:'file:///reviewed/referenced/'},review=await planMigration(input);
 assert.equal(review.status,'requires-decision',JSON.stringify(review.problems));
 const choices=review.problems.filter(problem=>problem.code==='migration.body.ignored-activation');assert.equal(choices.length,1);assert.equal(choices[0].pointer,'/x-data/get/requestBody');
 const result=await planMigration({...input,decisions:{[choices[0].id]:'omit-ignored-body'}});assert.equal(result.complete,true,JSON.stringify(result.problems));
 const packet={root:result.outputRoot,snapshot:'cold-referenced-bodies',resources:outputs(result)},{graph}=require('./dist/model.cjs').createGraph(packet);
 assert.equal(graph.operations().length,0);
 for(const [name,active]of [['Ignored',false],['Active',true]]){
  const link=graph.referenceAs(packet.root,'/components/links/'+name,'operationRef','operation');assert.equal(link.resolution,'resolved');
  assert.equal(!!graph.docs.get(link.targetResource).dataNode(link.targetPointer+'/requestBody'),active);
  assert.equal(link.targetPointer.split('/').at(-1),active?'post':'get');
 }
 const original=new SourceDocument(text,root),target=new SourceDocument(result.outputs.find(output=>output.id===packet.root).text,packet.root);
 assert.equal(target.dataJson('/x-data'),original.dataJson('/x-data'));assert.equal(input.resources[0].text,text);
});

test('B05-R1 a detached 3.0 body without a captured method retains a located proof refusal',async()=>{
 const root='file:///unknown-method/api.json',value={openapi:'3.0.4',info:{title:'Unknown method',version:'1'},paths:{},components:{links:{Use:{operationRef:'#/x-data/Operation'}}},'x-data':{Operation:{requestBody:{content:{'application/json':{schema:{type:'string'}}}},responses:{204:{description:'Empty'}}}}};
 const text=JSON.stringify(value),result=await planMigration({root,snapshot:'unknown-method',resources:[{id:root,text,generation:1}],targetVersion:'3.2.1',destination:'file:///reviewed/unknown/'});
 assert.equal(result.complete,false);assert.deepEqual(result.outputs,[]);const problem=result.problems.find(problem=>problem.code==='migration.body.method-context');assert(problem,JSON.stringify(result.problems));
 assert.equal(problem.reason,'unavailable-proof');assert.equal(problem.pointer,'/x-data/Operation/requestBody');assert(problem.range[1]>problem.range[0]);
});

for(const format of ['yaml','json'])for(const targetVersion of ['2.0','3.0.4','3.1.2','3.2.1'])test(`B05-R1 ${format} shared 3.0/3.1 operation and body owners preserve active and ignored uses in ${targetVersion}`,async()=>{
 const root=`file:///shared-applicability/ignored.${format}`,other=`file:///shared-applicability/active.${format}`,shared=`file:///shared-applicability/shared.${format}`;
 const api=version=>({openapi:version,info:{title:version,version:'business'},servers:[{url:'https://api.invalid/v1'}],paths:{'/payload':{$ref:`shared.${format}#/Path`}}});
 const body={required:true,content:{'application/json':{schema:{type:'object',properties:{n:{type:'integer',enum:['EXACT']},next:{$ref:'#/Body/content/application~1json/schema'}}}}}};
 const op={requestBody:{$ref:'#/Body'},parameters:[{name:'q',in:'query',schema:{type:'integer'}}],security:[],responses:{204:{description:'Empty'}}};
 const value={Path:{get:op,post:op},Body:body,Literal:{empty:'',flag:false,exact:'EXACT',$ref:'untouched'}};
 const encode=value=>(format==='yaml'?'# Keep applicability 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'shared-applicability',targetVersion,destination:'file:///reviewed/applicability/',resources:[api('3.0.4'),api('3.1.2'),value].map((value,index)=>({id:[root,other,shared][index],text:encode(value),generation:index+1}))};
 const before=input.resources.map(resource=>resource.text),review=await planMigration(input);
 if(targetVersion==='3.0.4'){
  assert.equal(review.status,'blocked');assert.deepEqual(review.outputs,[]);
  const problem=review.problems.find(problem=>problem.code==='migration.body.target-ignored');assert(problem,JSON.stringify(review.problems));
  assert.equal(problem.reason,'target-representation');assert.equal(problem.pointer,'/Path/get/requestBody');
  assert(!review.problems.some(problem=>problem.reason==='decision'));assert.deepEqual(input.resources.map(resource=>resource.text),before);return;
 }
 assert.equal(review.status,'requires-decision',JSON.stringify(review.problems));assert.deepEqual(review.outputs,[]);
 const decisions=Object.fromEntries(review.problems.filter(problem=>problem.code==='migration.body.ignored-activation').map(problem=>[problem.id,'omit-ignored-body']));
 assert.equal(Object.keys(decisions).length,1);assert(review.problems.every(problem=>problem.reason==='decision'),JSON.stringify(review.problems));
 const result=await planMigration({...input,decisions});assert.equal(result.complete,true,JSON.stringify(result.problems));
 const resources=outputs(result),identities=[];
 for(const original of [root,other]){
  const destination=result.changes.find(change=>change.resource===original).destination,packet={root:destination,snapshot:'cold-applicability',resources};
  const analysis=analyse(packet);assert.equal(analysis.complete,true,JSON.stringify(analysis.findings));
  for(const occurrence of analysis.operations){
   const plan=requestOperation({...packet,resource:occurrence.resource,pointer:occurrence.pointer,occurrence:occurrence.occurrence});
   const active=original===other||plan.operation.method==='POST';
   assert.equal(!!plan.requestBody,active);assert.equal(plan.operation.path,'/payload');assert.equal(plan.parameters[0].name,'q');assert.equal(plan.responses[0].status,'204');
   if(plan.operation.method==='GET')identities.push([occurrence.resource,occurrence.pointer]);
   if(active){assert.equal(plan.requestBody.required,true);assert.deepEqual(plan.requestBody.content.map(media=>media.mediaType),['application/json']);}
  }
 }
 assert.notDeepEqual(identities[0],identities[1]);assert.deepEqual(input.resources.map(resource=>resource.text),before);
 const reversed=await planMigration({...input,resources:[...input.resources].reverse(),decisions});assert.equal(reversed.complete,true,JSON.stringify(reversed.problems));
 assert.deepEqual([...reversed.outputs].sort((a,b)=>a.path.localeCompare(b.path)),[...result.outputs].sort((a,b)=>a.path.localeCompare(b.path)));
});

for(const format of ['yaml','json'])test(`${format} reviewed ignored-body omission retires examples and leaves detached schema data unchanged`,async()=>{
 const input=capture('3.0.4','get',format,true);input.targetVersion='3.1.2';
 const source=new SourceDocument(input.resources[1].text,input.resources[1].id);
 input.resources[1].text=source.set('/content/application~1json/schema/nullable',true);
 const body=new SourceDocument(input.resources[1].text,input.resources[1].id);
 input.resources[1].text=body.remove('/content/application~1json/example');
 const example=new SourceDocument(input.resources[1].text,input.resources[1].id);
 input.resources[1].text=example.set('/content/application~1json/examples',{Wire:{externalValue:'payload.bin'}});
 const bytes=Buffer.from('"snow 雪"'),id='file:///ignored-body/payload.bin';
 input.exampleResources=[{version:1,id,aliases:[],generation:0,state:'available',identity:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length,base64:bytes.toString('base64')}];
 const before=input.resources.map(resource=>resource.text),review=await planMigration(input);
 const problem=review.problems.find(problem=>problem.code==='migration.body.ignored-activation');assert(problem,JSON.stringify(review.problems));
 const result=await planMigration({...input,decisions:{[problem.id]:'omit-ignored-body'}});
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.deepEqual(result.exampleOutputs,[]);
 assert.equal(result.outputs.find(output=>output.id===result.changes.find(change=>change.resource===input.resources[1].id).destination).text,before[1]);
 const cold={root:result.outputRoot,snapshot:'cold-retired-examples',resources:outputs(result)};
 assert.equal(analyse(cold).status,'complete',JSON.stringify(analyse(cold).findings));assert.equal(operation(cold).requestBody,undefined);
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

for(const version of ['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4'])for(const format of ['yaml','json'])for(const referenced of [false,true])for(const method of ['get','head','delete','options'])test(`${version} ${format} ${method} ${referenced?'referenced':'inline'} ignored body needs explicit omission before Swagger publication`,async()=>{
 const input=capture(version,method,format,referenced),before=input.resources.map(r=>r.text),pointer='/paths/~1payload/'+method+'/requestBody';
 assert.equal(analyse(input).status,'complete');assert.equal(operation(input).requestBody,undefined);
 const review=await planMigration(input);assert.equal(review.status,'requires-decision',JSON.stringify(review.problems));assert.deepEqual(review.outputs,[]);assert.deepEqual(review.changes,[]);
 const problem=review.problems.find(p=>p.code==='migration.body.ignored-activation');assert(problem);assert.equal(review.problems.length,1);assert.equal(problem.resource,input.root);assert.equal(problem.pointer,pointer);assert(problem.range[1]>problem.range[0]);assert.deepEqual(problem.choices,['omit-ignored-body']);
 const result=await planMigration({...input,decisions:{[problem.id]:'omit-ignored-body'}});assert.equal(result.complete,true,JSON.stringify(result.problems));assert.deepEqual(result.acceptedDecisions,[problem.id]);
 const resources=outputs(result),target={root:result.outputRoot,snapshot:'cold-swagger',resources};assert.equal(analyse(target).status,'complete');
 const doc=new SourceDocument(resources.find(r=>r.id===target.root).text,target.root),source=new SourceDocument(before[0],input.root);assert.equal(doc.node('/swagger').value,'2.0');assert.equal(doc.node('/info/version').value,'api-version');assert.equal(doc.dataNode(pointer),undefined);assert.equal(doc.dataJson('/x-kept'),source.dataJson('/x-kept'));
 const plan=operation(target);assert.equal(plan.operation.method,method.toUpperCase());assert.equal(plan.requestBody,undefined);assert.equal(plan.ignoredRequestBody,undefined);
 if(referenced)assert.equal(result.outputs.find(o=>o.id!==result.outputRoot).text,before[1]);
 if(format==='yaml')assert(doc.text.startsWith('# Preserve comments 雪\r\n'));
 assert.deepEqual(input.resources.map(r=>r.text),before);
 const changed={...input,resources:input.resources.map((r,i)=>i? r:{...r,generation:r.generation+1,text:r.text.replace('Ignored body 雪','Changed 雪')})};
 await assert.rejects(planMigration({...changed,decisions:{[problem.id]:'omit-ignored-body'}}),{code:'migration.decisions.stale'});assert.deepEqual(input.resources.map(r=>r.text),before);
});

for(const format of ['yaml','json'])for(const referenced of [false,true])for(const method of ['post','put','patch'])test(`${format} ${method} ${referenced?'referenced':'inline'} active 3.0 body stays active in Swagger`,async()=>{
 const input=capture('3.0.4',method,format,referenced),index=referenced?1:0,doc=new SourceDocument(input.resources[index].text,input.resources[index].id);
 input.resources[index].text=doc.remove((referenced?'':'/paths/~1payload/'+method+'/requestBody')+'/content/application~1json/example');const before=input.resources.map(r=>r.text);
 const result=await planMigration(input);assert.equal(result.complete,true,JSON.stringify(result.problems));assert.deepEqual(result.acceptedDecisions,[]);
 const plan=operation({root:result.outputRoot,snapshot:'active-swagger',resources:outputs(result)});assert.equal(plan.requestBody.required,true);assert.equal(plan.ignoredRequestBody,undefined);assert.equal(plan.operation.method,method.toUpperCase());assert.deepEqual(plan.requestBody.content.map(m=>m.mediaType),['application/json']);assert.deepEqual(input.resources.map(r=>r.text),before);
});

for(const format of ['yaml','json'])test(`${format} missing ignored-body dependencies remain incomplete and cannot publish`,async()=>{
 const input=capture('3.0.4','get',format,true);input.resources.pop();const before=input.resources[0].text,result=await planMigration(input);
 assert.equal(result.status,'blocked');assert.deepEqual(result.outputs,[]);assert(result.problems.some(p=>p.reason==='source-incomplete'));assert.equal(input.resources[0].text,before);
});

for(const version of ['3.1.2','3.2.1'])for(const ignoredPrimary of [false,true])for(const format of ['yaml','json'])test(`${version} + 3.0 ${format} Swagger downgrade only omits the original ignored entry body (root ${ignoredPrimary?'3.0':version})`,async()=>{
 const ignored=capture('3.0.4','get',format),active=capture(version,'get',format),modernId='file:///ignored-body/modern.'+format;
 const modernDoc=new SourceDocument(active.resources[0].text,modernId);active.resources[0]={...active.resources[0],id:modernId,text:modernDoc.remove('/paths/~1payload/get/requestBody/content/application~1json/example')};
 const input={...ignored,root:ignoredPrimary?ignored.root:modernId,resources:ignoredPrimary?[...ignored.resources,...active.resources]:[...active.resources,...ignored.resources]},before=input.resources.map(r=>r.text),review=await planMigration(input);
 assert.equal(review.status,'requires-decision',JSON.stringify(review.problems));const problem=review.problems.find(p=>p.code==='migration.body.ignored-activation');assert(problem);assert.equal(problem.resource,ignored.root);
 const result=await planMigration({...input,decisions:{[problem.id]:'omit-ignored-body'}});assert.equal(result.complete,true,JSON.stringify(result.problems));assert.equal(result.entryRoutes.length,2);
 const resources=outputs(result);for(const original of input.resources){const route=result.changes.find(change=>change.resource===original.id),output=result.outputs.find(o=>o.id===route.destination);assert(output);const plan=operation({root:output.id,snapshot:original.id,resources});assert.equal(!!plan.requestBody,original.id===modernId);}
 assert.deepEqual(input.resources.map(r=>r.text),before);
});

for(const version of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])test(`${version} ${format} TRACE cannot be represented by Swagger and never offers an omission decision`,async()=>{
 const input=capture(version,'trace',format),before=input.resources.map(r=>r.text),result=await planMigration(input);assert.equal(result.status,'blocked');assert.deepEqual(result.outputs,[]);assert.deepEqual(result.changes,[]);assert.deepEqual(result.acceptedDecisions,[]);const problem=result.problems.find(p=>p.code==='migration.operation.method');assert(problem,JSON.stringify(result.problems));assert.equal(problem.pointer,'/paths/~1payload/trace');assert.equal(problem.reason,'target-representation');assert(problem.range[1]>problem.range[0]);assert(!result.problems.some(p=>p.reason==='decision'));assert.deepEqual(input.resources.map(r=>r.text),before);
});

for(const format of ['yaml','json'])for(const metadata of ['schema','example','relative-description'])test(`${format} shared ignored/active body keeps the active owner's ${metadata} conversion proof`,async()=>{
 const input=capture('3.0.4','get',format,true),root=input.resources[0],fragment=input.resources[1];
 root.text=new SourceDocument(root.text,root.id).set('/paths/~1payload/post',{requestBody:{$ref:'body.'+format},responses:{204:{description:'Empty'}}});
 if(metadata!=='example')fragment.text=new SourceDocument(fragment.text,fragment.id).remove('/content/application~1json/example');
 if(metadata==='relative-description')fragment.text=new SourceDocument(fragment.text,fragment.id).set('/description','[Guide](guide.md)');
 const before=input.resources.map(r=>r.text),review=await planMigration(input);assert.equal(review.status,'requires-decision',JSON.stringify(review.problems));const problem=review.problems.find(p=>p.code==='migration.body.ignored-activation');assert(problem);
 const result=await planMigration({...input,decisions:{[problem.id]:'omit-ignored-body'}});
 if(metadata==='schema'){
  assert.equal(result.complete,true,JSON.stringify(result.problems));const resources=outputs(result),analysis=analyse({root:result.outputRoot,snapshot:'shared-swagger',resources});assert.equal(analysis.status,'complete');
  for(const op of analysis.operations){const plan=requestOperation({root:result.outputRoot,snapshot:'shared-swagger',resources,resource:op.resource,pointer:op.pointer,occurrence:op.occurrence});assert.equal(!!plan.requestBody,op.method==='post');}
 }else{
  assert.equal(result.status,'blocked');assert.deepEqual(result.outputs,[]);assert(result.problems.some(p=>p.code===(metadata==='example'?'migration.body.media-metadata':'migration.description.relative-links')),JSON.stringify(result.problems));
 }
 assert.deepEqual(input.resources.map(r=>r.text),before);
});

test('an ignored body anchor shared by an active operation still needs ownership-preserving edits',async()=>{
 const input=capture('3.0.4','get','yaml');input.resources[0].text='openapi: 3.0.4\ninfo: {title: Shared, version: "1"}\nservers: [{url: https://api.invalid}]\npaths:\n  /payload:\n    get:\n      requestBody: &body\n        content:\n          application/json:\n            schema: {type: string}\n      responses: {204: {description: Empty}}\n    post:\n      requestBody: *body\n      responses: {204: {description: Empty}}\n';
 const before=input.resources[0].text,review=await planMigration(input),problem=review.problems.find(p=>p.code==='migration.body.ignored-activation');assert(problem);
 const result=await planMigration({...input,decisions:{[problem.id]:'omit-ignored-body'}});
 assert.equal(result.complete,true,JSON.stringify(result.problems));assert.deepEqual(result.acceptedDecisions,[problem.id]);
 const target={root:result.outputRoot,snapshot:'cold-shared-body',resources:outputs(result)},analysis=analyse(target);
 assert.equal(analysis.status,'complete',JSON.stringify(analysis.findings));
 for(const method of ['get','post']){
  const source=analysis.operations.find(operation=>operation.method===method);assert(source);
  const description=requestOperation({...target,resource:source.resource,pointer:source.pointer,occurrence:source.occurrence});
  assert.equal(description.requestBody!==undefined,method==='post');
  if(method==='post')assert.deepEqual(description.requestBody.content.map(media=>media.mediaType),['application/json']);
 }
 assert.equal(input.resources[0].text,before);
});
