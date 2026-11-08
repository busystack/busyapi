const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml'),{createHash}=require('node:crypto');
const {planMigration}=require('./dist/migration.cjs'),{analyse}=require('./dist/model.cjs'),{evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');
const {readFileSync}=require('node:fs'),{join}=require('node:path');
const modern=['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'],older=['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','2.0'];
function packet(version,format,mode){
 const root='file:///approved/api.'+format,base={type:'integer',enum:['EXACT_A','EXACT_B']},use={$dynamicRef:'#/components/schemas/Base'},schemas={Base:base,Use:use,Minimum:{minimum:'EXACT_B'}},resources=[];
 if(mode==='siblings')use.minimum='EXACT_B';
 if(mode==='both')use.$ref='#/components/schemas/Minimum';
 if(mode==='allOf')use.allOf=[{minimum:'EXACT_B'}];
 if(mode==='static-anchor'){base.$anchor='base';use.$dynamicRef='#base';}
 if(mode==='identified'){base.$id='base-resource';use.$dynamicRef='base-resource';}
 if(mode==='recursive')schemas.Base={type:'object',required:['value'],properties:{value:base,next:{$dynamicRef:'#/components/schemas/Base'}}};
 if(mode==='one-anchor'){base.$dynamicAnchor='base';use.$dynamicRef='#base';}
 if(mode==='recursive-anchor'){
  schemas.Base={$id:'tree',$dynamicAnchor:'base',type:'object',required:['value'],properties:{value:base,next:{$dynamicRef:'#base'}}};
  use.$dynamicRef='tree#base';
 }
 if(mode==='external-anchor'){
  delete schemas.Base;use.$dynamicRef='model.yaml#needle';
  resources.push({id:'file:///approved/model.yaml',text:'# Preserve external owner\r\n$schema: https://json-schema.org/draft/2020-12/schema\r\n$id: model.yaml\r\n$defs:\r\n  "雪/~": '+JSON.stringify({...base,$anchor:'needle'})+'\r\n',generation:2});
 }
 const doc={openapi:version,info:{title:'Exact migration 雪',version:'API-1'},paths:{},components:{schemas},'x-payload':{$dynamicRef:'literal space',number:'EXACT_B',false:false,zero:0,nil:null}};
 const exact=text=>text.replaceAll('"EXACT_A"','9007199254740992').replaceAll('"EXACT_B"','9007199254740993.00').replaceAll('EXACT_A','9007199254740992').replaceAll('EXACT_B','9007199254740993.00');
 resources.unshift({id:root,text:format==='json'?JSON.stringify(doc):'# Preserve source and CRLF\r\n'+YAML.stringify(doc).replaceAll('\n','\r\n'),generation:1});
 for(const resource of resources){resource.text=exact(resource.text);resource.identity=createHash('sha256').update(resource.text).digest('hex');}
 return {root,resources,snapshot:createHash('sha256').update(JSON.stringify(resources)).digest('hex'),destination:'file:///output/review/'};
}
function changed(input,edits){for(const [pointer,value]of edits)input.resources[0].text=new SourceDocument(input.resources[0].text,input.root).set(pointer,value);input.resources[0].generation++;input.resources[0].identity=createHash('sha256').update(input.resources[0].text).digest('hex');input.snapshot=input.resources[0].identity;return input;}
function output(result){return {root:result.outputRoot,snapshot:'after-'+result.identity,resources:result.outputs.map(resource=>({id:resource.id,text:resource.text,generation:0,aliases:Object.entries(result.manifest.resourceMappings).filter(([,p])=>p===resource.path).map(([uri])=>uri)}))};}
async function outcomes(input,pointer,samples){
 const checked=await evaluateSchemas({...input,runtimeInstances:samples.map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:input.root,pointer}}))});
 assert.equal(checked.complete,true,JSON.stringify(checked.findings));assert(!checked.findings.some(f=>f.severity==='error'),JSON.stringify(checked.findings));assert.equal(checked.runtimeEvaluations.length,samples.length);return checked.runtimeEvaluations.map(result=>result.valid);
}
for(const version of modern)for(const format of ['yaml','json'])for(const targetVersion of older)for(const mode of ['plain','siblings','both','allOf','static-anchor','identified','recursive','external-anchor'])test(`${version} ${format} ${mode} static dynamicRef converts to ${targetVersion} with exact assertions and reference owners`,async()=>{
 const input={...packet(version,format,mode),targetVersion},original=input.resources.map(r=>r.text),result=await planMigration(input);
 assert.equal(result.status,'faithfully-convertible',JSON.stringify(result.problems));assert.equal(result.complete,true);assert.equal(result.producerVersion,'97');assert.equal(result.target.declaredVersion,targetVersion);
 const after=output(result);assert.equal(analyse(after).status,'complete',JSON.stringify(analyse(after).findings));const entry=result.outputs.find(r=>r.id===result.outputRoot),data=YAML.parse(entry.text);assert.equal(data.info.version,'API-1');assert.equal(data[targetVersion==='2.0'?'swagger':'openapi'],targetVersion);assert.equal(data['x-payload'].$dynamicRef,'literal space');assert(entry.text.includes('9007199254740993.00'));if(format==='yaml')assert(entry.text.includes('# Preserve source and CRLF'));
 const schemas=targetVersion==='2.0'?data.definitions:data.components.schemas;assert(schemas.Use.allOf.some(branch=>typeof branch.$ref==='string'));assert(!Object.hasOwn(schemas.Use,'$dynamicRef'));if(mode==='both')assert(schemas.Use.allOf.filter(branch=>branch.$ref).length>=2);if(mode==='allOf')assert.equal(new SourceDocument(entry.text,entry.id).dataJson((targetVersion==='2.0'?'/definitions':'/components/schemas')+'/Use/allOf/0/minimum'),'9007199254740993.00');
 const samples=mode==='recursive'?['{"value":9007199254740993,"next":{"value":9007199254740992}}','{"value":9007199254740993,"next":{"value":9007199254740994}}','{"next":{}}','null','false','0']:['9007199254740993','9007199254740992','9007199254740994','"雪"','null','false','0'];
 const before=await outcomes(input,'/components/schemas/Use',samples),actual=await outcomes(after,targetVersion==='2.0'?'/definitions/Use':'/components/schemas/Use',samples);
 assert.deepEqual(before,mode==='recursive'?[true,false,false,false,false,false]:[true,!['siblings','both','allOf'].includes(mode),false,false,false,false,false]);assert.deepEqual(actual,before);assert.deepEqual(input.resources.map(r=>r.text),original);
});
for(const version of modern)for(const format of ['yaml','json'])for(const targetVersion of ['3.0.4','2.0'])for(const value of [false,true])test(`${version} ${format} static dynamicRef to boolean ${value} retains target ${targetVersion} validity`,async()=>{
 const input=changed(packet(version,format,'plain'),[['/components/schemas/Base',value]]);
 const result=await planMigration({...input,targetVersion});assert.equal(result.complete,true,JSON.stringify(result.problems));const samples=['null','false','0','"雪"','{}','[]'];assert.deepEqual(await outcomes(output(result),targetVersion==='2.0'?'/definitions/Use':'/components/schemas/Use',samples),Array(samples.length).fill(value));
});
for(const version of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])for(const targetVersion of ['3.0.4','2.0'])for(const mode of ['one-anchor','recursive-anchor'])
test(`${version} ${format} ${mode} keeps its unique captured dynamic target through ${targetVersion} publication`,async()=>{
 const input={...packet(version,format,mode),targetVersion},before=input.resources.map(resource=>resource.text);
 const samples=mode==='one-anchor'?['9007199254740993','9007199254740992','null','false','{}']:
  ['{"value":9007199254740993,"next":{"value":9007199254740992}}','{"value":9007199254740993,"next":{"value":1}}','{"next":{}}','null'];
 const expected=mode==='one-anchor'?[true,true,false,false,false]:[true,false,false,false];
 assert.deepEqual(await outcomes(input,'/components/schemas/Use',samples),expected);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const result=output(review),prefix=targetVersion==='2.0'?'/definitions':'/components/schemas';
 assert.equal(analyse(result).status,'complete');
 assert.deepEqual(await outcomes(result,prefix+'/Use',samples),expected);
 const graph=require('./dist/model.cjs').createGraph(result).graph;
 assert(graph.references.every(reference=>reference.keyword!=='$dynamicRef'));
 if(mode==='recursive-anchor')assert(graph.references.some(reference=>reference.pointer.includes('/properties/next/')));
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});
// The fixture and validity oracle are the unmodified pinned official suite.
const official=JSON.parse(readFileSync(join(__dirname,'../../fixtures/json_schema_2020_12/dynamicRef.json'),'utf8'));
for(const description of [
 'A $dynamicRef to a $dynamicAnchor in the same schema resource behaves like a normal $ref to an $anchor',
 'A $ref to a $dynamicAnchor in the same schema resource behaves like a normal $ref to an $anchor',
])for(const targetVersion of ['3.0.4','2.0'])test(`official single-anchor binding lowers to ${targetVersion}: ${description}`,async()=>{
 const fixture=official.find(fixture=>fixture.description===description);assert(fixture);
 const input=packet('3.2.1','json','plain');
 input.resources[0].text=JSON.stringify({openapi:'3.2.1',info:{title:'Official resource',version:'1'},paths:{},components:{schemas:{Use:fixture.schema}}});
 const values=fixture.tests.map(test=>JSON.stringify(test.data)),expected=fixture.tests.map(test=>test.valid);
 assert.deepEqual(await outcomes(input,'/components/schemas/Use',values),expected);
 const review=await planMigration({...input,targetVersion});assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.deepEqual(await outcomes(output(review),(targetVersion==='2.0'?'/definitions':'/components/schemas')+'/Use',values),expected);
});
for(const version of modern)for(const format of ['yaml','json'])for(const targetVersion of ['3.0.4','2.0'])for(const mode of ['dynamic-peer','unresolved'])test(`${version} ${format} ${mode} refuses unproved ${targetVersion} conversion with original locations and no outputs`,async()=>{
 const edits=mode==='unresolved'?[['/components/schemas/Use/$dynamicRef','missing.yaml#base']]:[['/components/schemas/Base/$dynamicAnchor','base'],['/components/schemas/Use/$dynamicRef','#base'],...(mode==='dynamic-peer'?[['/components/schemas/Peer',{$id:'peer',$dynamicAnchor:'base',type:'string'}]]:[])],input=changed(packet(version,format,'plain'),edits),original=input.resources[0].text;
 const result=await planMigration({...input,targetVersion});assert.equal(result.complete,false);assert.equal(result.status,'blocked');assert.deepEqual(result.outputs,[]);assert.deepEqual(result.changes,[]);const found=result.problems.find(p=>p.resource===input.root&&p.pointer.includes(mode==='unresolved'?'Use':'Base'));assert(found,JSON.stringify(result.problems));assert(found.range[1]>found.range[0]);assert.equal(input.resources[0].text,original);
});

for(const description of ['multiple dynamic paths to the $dynamicRef keyword','after leaving a dynamic scope, it is not used by a $dynamicRef'])
for(const targetVersion of ['3.1.2','3.2.1'])test(`whole resource ownership preserves ${description} through ${targetVersion}`,async()=>{
 const fixture=official.find(value=>value.description===description);assert(fixture,description);
 const input=packet('3.2.1','json','plain');
 input.resources[0].text=JSON.stringify({openapi:'3.2.1',info:{title:'Dynamic paths',version:'1'},paths:{},components:{schemas:{Use:fixture.schema}}});
 const texts=fixture.tests.map(value=>JSON.stringify(value.data)),expected=fixture.tests.map(value=>value.valid);
 assert.deepEqual(await outcomes(input,'/components/schemas/Use',texts),expected);
 const review=await planMigration({...input,targetVersion});assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.deepEqual(await outcomes(output(review),'/components/schemas/Use',texts),expected);
 assert(require('./dist/model.cjs').createGraph(output(review)).graph.entryReferences().some(reference=>reference.keyword==='$dynamicRef'&&reference.dynamic));
});
