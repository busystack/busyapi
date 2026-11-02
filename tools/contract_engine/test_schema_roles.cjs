const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {createGraph,analyse,inspect}=require('./dist/model.cjs'),{evaluateSchemas}=require('./dist/schema_evaluation.cjs'),{planSchemaDefinitionRename}=require('./dist/refactoring.cjs'),{deriveBundle}=require('./dist/derived_bundle.cjs'),{planMigration}=require('./dist/migration.cjs');
const versions=['3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
function packet(version,format,keyword,mode){
 const root='file:///approved/api.'+format,map=mode==='not'?{not:{type:'integer'}}:mode==='properties'?{properties:{Leaf:{type:'integer'}}}:mode==='bad-type'?{type:{type:'integer'}}:{Leaf:{type:'integer'}},data={openapi:version,info:{title:'Schema interpretations 雪',version:'API-1'},paths:{},components:{schemas:{Model:{[keyword]:map},Use:{$ref:'#/components/schemas/Model/'+keyword}}}},text=format==='json'?JSON.stringify(data):'# Preserve shared roles\r\n'+YAML.stringify(data).replaceAll('\n','\r\n');return{root,snapshot:version+format+keyword+mode,resources:[{id:root,text,generation:1}]};
}
async function outcomes(input,pointer){return evaluateSchemas({...input,runtimeInstances:['null','0','{}','{"Leaf":1}','{"Leaf":"bad"}'].map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:input.root,pointer}}))});}
for(const version of versions)for(const format of ['yaml','json'])for(const keyword of ['$defs','definitions'])for(const mode of ['plain','not','properties','bad-type'])test(`${version} ${format} ${keyword} dual schema role ${mode} retains its independent meaning and source`,async()=>{
 const input=packet(version,format,keyword,mode),original=input.resources[0].text,{graph}=createGraph(input),pointer='/components/schemas/Model/'+keyword;assert.deepEqual(graph.issues,[]);assert.equal(graph.scope(input.root,pointer).kind,'schema-map');assert.equal(graph.scopeAs(input.root,pointer,'schema').kind,'schema');assert.equal(inspect({...input,resource:input.root,pointer}).memberNamePolicy,undefined);assert(!analyse(input).findings.some(f=>f.code==='reference.target.context'));const r=await outcomes(input,'/components/schemas/Use');
 if(mode==='bad-type'){assert.equal(r.complete,false);assert(r.findings.some(f=>f.code==='schema.keyword.invalid'&&f.pointer.startsWith(pointer+'/type')&&f.range[1]>f.range[0]),JSON.stringify(r.findings));assert(r.runtimeEvaluations.every(e=>!e.complete&&!e.valid));}
 else{assert.equal(r.complete,true,JSON.stringify(r.findings));assert.deepEqual(r.findings,[]);assert.deepEqual(r.runtimeEvaluations.map(e=>e.valid),mode==='not'?[true,false,true,true,true]:mode==='properties'?[true,true,true,true,false]:[true,true,true,true,true]);}
 assert.equal(input.resources[0].text,original);
});
for(const version of versions)for(const keyword of ['$defs','definitions'])for(const directFirst of [false,true])test(`${version} ${keyword} external map discovery order direct=${directFirst} retains native ownership`,async()=>{
 const root='file:///approved/api.json',model='file:///approved/model.json',Direct={$ref:'model.json#/Envelope/'+keyword},Envelope={$ref:'model.json#/Envelope'},input={root,snapshot:version+keyword+directFirst,resources:[{id:root,text:JSON.stringify({openapi:version,info:{title:'Order',version:'1'},paths:{},components:{schemas:directFirst?{Direct,Envelope}:{Envelope,Direct}}}),generation:1},{id:model,text:JSON.stringify({Envelope:{[keyword]:{Leaf:{type:'integer'}}}}),generation:1}]},g=createGraph(input).graph;assert.deepEqual(g.issues,[]);assert.equal(g.scope(model,'/Envelope/'+keyword).kind,'schema-map');assert.equal(g.scopeAs(model,'/Envelope/'+keyword,'schema').kind,'schema');const r=await outcomes(input,'/components/schemas/Direct');assert(r.complete,JSON.stringify(r.findings));assert(r.runtimeEvaluations.every(e=>e.valid));
});
for(const keyword of ['$defs','definitions'])test(`${keyword} shared map rename is refused before changing an independent schema keyword`,()=>{
 const input=packet('3.2.1','json',keyword,'plain'),original=input.resources[0].text,pointer='/components/schemas/Model/'+keyword+'/Leaf';input.contexts=[{root:input.root,resources:[input.root]}];assert.throws(()=>planSchemaDefinitionRename({...input,target:{root:input.root,resource:input.root,pointer,generation:1},name:'type'}),e=>e.code==='refactor.shared-role'&&e.source.pointer===pointer.slice(0,pointer.lastIndexOf('/')));assert.equal(input.resources[0].text,original);
});
for(const version of versions)for(const format of ['yaml','json'])test(`${version} ${format} one reference retains native and schema bases while rewriting refuses ambiguous ownership`,async()=>{
 const root='file:///approved/api.'+format,fragment='#/components/schemas/Answer',api={openapi:version,info:{title:'Two reference contexts',version:'1'},paths:{'/x':{get:{responses:{200:{$ref:'#/components/responses/Shared'}}}}},components:{responses:{Shared:{$ref:'native.json'+fragment,$id:'https://schemas.invalid/base/'}},schemas:{Use:{$ref:'#/components/responses/Shared'}}}},native={openapi:version,info:{title:'Native',version:'1'},paths:{},components:{schemas:{Answer:{description:'Native response'}}}},schema={openapi:version,info:{title:'Schema target',version:'1'},paths:{},components:{schemas:{Answer:{type:'integer'}}}},text=format==='json'?JSON.stringify(api):YAML.stringify(api),input={root,snapshot:version+format,resources:[{id:root,text,generation:1},{id:'file:///approved/native.json',text:JSON.stringify(native),generation:1},{id:'https://schemas.invalid/base/native.json',text:JSON.stringify(schema),generation:1}]},before=input.resources.map(r=>r.text),g=createGraph(input).graph;
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));assert.deepEqual(g.issues,[]);const refs=g.references.filter(r=>r.resource===root&&r.pointer==='/components/responses/Shared');assert.equal(refs.length,2);assert.deepEqual(new Set(refs.map(r=>r.kind)),new Set(['response','schema']));assert.deepEqual(new Set(refs.map(r=>r.targetResource)),new Set(['file:///approved/native.json','https://schemas.invalid/base/native.json']));const r=await evaluateSchemas({...input,runtimeInstances:['0','null'].map(text=>({subject:'response-body',location:'application/json',text,schema:{resource:root,pointer:'/components/schemas/Use'}}))});assert.equal(r.complete,true,JSON.stringify(r.findings));assert.deepEqual(r.runtimeEvaluations.map(e=>e.valid),[true,false]);
 assert.throws(()=>deriveBundle({...input,outputId:'file:///derived/api.json'}),e=>e.code==='reference.edit.context'&&e.kind==='unsupported'&&e.source.pointer==='/components/responses/Shared/$ref');const migration=await planMigration({...input,targetVersion:'3.0.4',destination:'file:///output/roles/'});assert.equal(migration.complete,false);assert.deepEqual(migration.outputs,[]);assert.deepEqual(migration.changes,[]);assert(migration.problems.some(p=>p.code.includes('reference.edit.context')&&p.pointer==='/components/responses/Shared/$ref'),JSON.stringify(migration.problems));const {MockSchemaSamples}=require('./dist/mock_schema_samples.cjs'),{requestOperation}=require('./dist/execution.cjs');
 const nativePlan=requestOperation({...input,resource:root,pointer:'/paths/~1x/get'});assert.equal(nativePlan.responses[0].description,'Native response');
 const {referencePage}=require('./dist/reference_projection.cjs'),page=referencePage({...input,resource:root,pointer:'/paths/~1x/get'});assert(page.previews.some(p=>p.text==='Native response'),JSON.stringify(page.previews));
 api.paths['/payload']={get:{responses:{200:{description:'Schema role response',content:{'application/json':{schema:{$ref:'#/components/schemas/Use'}}}}}}};
 const runtimeInput={...input,resources:input.resources.map(resource=>resource.id===root?{...resource,text:format==='json'?JSON.stringify(api):YAML.stringify(api)}:resource)},runtimeGraph=createGraph(runtimeInput).graph,plan=requestOperation({...runtimeInput,resource:root,pointer:'/paths/~1payload/get'}),samples=new MockSchemaSamples(runtimeGraph,async instances=>{const checked=await evaluateSchemas({...runtimeInput,runtimeInstances:instances});return{complete:checked.complete,valid:checked.runtimeEvaluations.every(e=>e.complete&&e.valid),evaluations:checked.runtimeEvaluations,findings:checked.runtimeFindings};},runtimeInput.snapshot);
 const generated=await samples.response(plan,'200','application/json',true,new AbortController().signal);assert(['0','1','-1'].includes(generated),generated);const checked=await evaluateSchemas({...runtimeInput,runtimeInstances:[{subject:'response-body',location:'generated',schema:plan.responses[0].content[0].schema,text:generated}]});assert.equal(checked.runtimeEvaluations[0].valid,true);
 const contexts=[{root,resources:input.resources.map(r=>r.id)}],target={root,resource:root,pointer:'/components/schemas/Use',generation:1};
 for(const [module,method,extra]of [['refactoring.cjs','planRename',{name:'Renamed'}],['refactoring_copy.cjs','planInline',{}],['refactoring_file.cjs','planFileMove',{destinationResource:'file:///derived/api.'+format}]])assert.throws(()=>require('./dist/'+module)[method]({...input,contexts,target,...extra}),e=>e.code==='reference.edit.context'&&e.source.pointer==='/components/responses/Shared/$ref');
 assert.deepEqual(input.resources.map(r=>r.text),before);
});
for(const version of versions)for(const format of ['yaml','json'])for(const relative of [false,true])test(`${version} ${format} overlapping contact annotations ${relative?'refuse changed':'retain exact'} URI data`,async()=>{
 const root='file:///approved/api.'+format,data={openapi:version,info:{title:'Annotation and URI roles',version:'1',contact:{url:relative?'contact':'https://example.invalid/contact'}},paths:{},components:{schemas:{Use:{$ref:'#/info/contact'}}}},text=format==='json'?JSON.stringify(data):'# Contact annotation remains source-owned\n'+YAML.stringify(data),input={root,snapshot:version+format+relative,resources:[{id:root,text,generation:1}]};
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));const evaluated=await evaluateSchemas(input);assert(evaluated.complete,JSON.stringify(evaluated.findings));assert.deepEqual(evaluated.findings,[]);
 if(relative)assert.throws(()=>deriveBundle({...input,outputId:'file:///derived/api.json'}),e=>e.code==='schema.role.annotation'&&e.source.pointer==='/info/contact/url'&&e.kind==='unsupported');
 else{const bundle=deriveBundle({...input,outputId:'file:///derived/api.json'});assert(bundle.output.text.includes('https://example.invalid/contact'));}
 const migrated=await planMigration({...input,targetVersion:'3.2.1',destination:'file:///migrated/contact/'});
 if(relative){assert.equal(migrated.complete,false);assert.deepEqual(migrated.outputs,[]);assert(migrated.problems.some(p=>p.code==='schema.role.annotation'&&p.pointer==='/info/contact/url'),JSON.stringify(migrated.problems));}
 else{assert(migrated.complete,JSON.stringify(migrated.problems));assert(migrated.outputs.some(o=>o.text.includes('https://example.invalid/contact')));}
 const {planFileMove}=require('./dist/refactoring_file.cjs');
 const move={...input,contexts:[{root,resources:[root]}],target:{root,resource:root,generation:1,pointer:''},destinationResource:'file:///derived/api.'+format};
 if(relative)assert.throws(()=>planFileMove(move),e=>e.code==='schema.role.annotation'&&e.source.pointer==='/info/contact/url');
 else assert.equal(planFileMove(move).kind,'file-move');
 assert.equal(input.resources[0].text,text);
});
for(const keyword of ['$defs','definitions'])test(`${keyword} local overlapping map can be bundled without changing unknown annotation data`,()=>{
 const input=packet('3.2.1','json',keyword,'plain'),original=input.resources[0].text,bundle=deriveBundle({...input,outputId:'file:///derived/api.json'}),data=JSON.parse(bundle.output.text);assert.deepEqual(data.components.schemas.Model[keyword],{Leaf:{type:'integer'}});assert.equal(input.resources[0].text,original);
});

for(const version of versions)for(const format of ['yaml','json'])test(`${version} ${format} whole OpenAPI document may also be a referenced schema without losing native ownership`,async()=>{
 const root='file:///approved/api.'+format,data={openapi:version,info:{title:'Whole document schema',version:'1'},paths:{},components:{schemas:{Use:{$ref:'#'}}}},text=format==='json'?JSON.stringify(data):YAML.stringify(data),input={root,snapshot:version+format,resources:[{id:root,text,generation:1}]},graph=createGraph(input).graph;
 assert.deepEqual(graph.issues,[]);assert.equal(graph.scope(root,'').kind,'root');assert.equal(graph.scopeAs(root,'','schema').kind,'schema');const result=await outcomes(input,'/components/schemas/Use');assert(result.complete,JSON.stringify(result.findings));assert(result.runtimeEvaluations.every(e=>e.complete&&e.valid));assert.equal(analyse(input).status,'complete');const bundle=deriveBundle({...input,outputId:'file:///derived/api.json'});assert.equal(JSON.parse(bundle.output.text).openapi,version);assert.equal(input.resources[0].text,text);
});

for(const version of ['2.0','3.0.4'])for(const format of ['yaml','json'])for(const chain of version==='2.0'?[false]:[false,true])
test(`${version} ${format} chain=${chain} restricted schema overlaps retain native validation, exact instances and migration ownership`,async()=>{
 const root='file:///approved/restricted.'+format,swagger=version==='2.0';
 const pointer=swagger?'/responses/Shared/headers/X-Count':'/components/responses/Shared';
 const response={description:'[Shared](../guide.md)',...(swagger?{headers:{'X-Count':{type:'integer',enum:['EXACT']}}}:{})};
 const use={$ref:'#'+pointer},value={...(swagger?{swagger:version}:{openapi:version}),info:{title:'Restricted roles',version:'business'},
  paths:{'/p':{get:{responses:{200:{$ref:'#'+(swagger?'/responses/Shared':'/components/responses/Shared')}}}}},
  ...(swagger?{definitions:{Use:use},responses:{Shared:response}}:{components:{schemas:{Use:use},responses:chain?{Shared:{$ref:'#/components/responses/Real'},Real:response}:{Shared:response}}})};
 const text=(format==='yaml'?'# Keep restricted roles 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,resources:[{id:root,text,generation:3}],snapshot:'restricted-roles'};
 const graph=createGraph(input).graph,primary=swagger?'header':'response';
 assert.equal(graph.scope(root,pointer).kind,primary);assert.equal(graph.scopeAs(root,pointer,'schema').kind,'schema');
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));
 const page=inspect({...input,resource:root,pointer,contextKind:'schema'});
 assert.equal(page.kind,'schema');assert.equal(page.customSchemaKeywords,false);
 assert(page.fields.some(field=>field.name==='type'&&field.schemaTypeChoices.scalarTypes.includes('integer')));
 const samples=['9007199254740993','9007199254740992','null','false','"雪"'];
 const evaluate=(packet,pointer)=>evaluateSchemas({...packet,runtimeInstances:samples.map(text=>({subject:'response-body',location:text,text,schema:{resource:packet.root,pointer}}))});
 const before=await evaluate(input,(swagger?'/definitions':'/components/schemas')+'/Use');
 assert.equal(before.complete,true,JSON.stringify(before.findings));assert.deepEqual(before.runtimeEvaluations.map(result=>result.valid),swagger?[true,false,false,false,false]:samples.map(()=>true));
 const review=await planMigration({...input,targetVersion:'3.2.1',destination:'file:///delivered/restricted/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={root:review.outputRoot,resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0})),snapshot:'cold-restricted'};
 const after=await evaluate(cold,'/components/schemas/Use');assert.equal(after.complete,true,JSON.stringify(after.findings));
 assert.deepEqual(after.runtimeEvaluations.map(result=>result.valid),before.runtimeEvaluations.map(result=>result.valid));
 assert.equal(analyse(cold).status,'complete',JSON.stringify(analyse(cold).findings));
 assert.equal(input.resources[0].text,text);
 const {referencePage}=require('./dist/reference_projection.cjs');
 assert.equal(referencePage({...input,resource:root,pointer,contextKind:'schema'}).kind,'schema');
});
for(const version of ['2.0','3.0.4'])test(`${version} retaining a Schema role does not widen its restricted vocabulary`,async()=>{
 const root='file:///approved/invalid-role.json',swagger=version==='2.0';
 const value={...(swagger?{swagger:version}:{openapi:version}),info:{title:'Restricted metadata',version:'1'},paths:{},
  ...(swagger?{responses:{Shared:{description:'Native',headers:{'X-Count':{type:'integer',collectionFormat:'csv'}}}},
   definitions:{Use:{$ref:'#/responses/Shared/headers/X-Count'}}}:
   {components:{responses:{Shared:{description:'Native',headers:{'X-Count':{schema:{type:'integer'}}}}},schemas:{Use:{$ref:'#/components/responses/Shared'}}}})};
 const input={root,resources:[{id:root,text:JSON.stringify(value),generation:0}],snapshot:'invalid-restricted-role'};
 const findings=analyse(input).findings;
 assert(findings.some(finding=>finding.code==='schema.additionalProperties'&&finding.severity==='error'&&finding.range[1]>finding.range[0]),JSON.stringify(findings));
 const checked=await evaluateSchemas(input);assert(checked.findings.some(finding=>finding.code==='schema.keyword.invalid'),JSON.stringify(checked.findings));
});

for(const version of ['3.1.2','3.2.1'])test(`${version} a native reference into a primary identified schema retains document URI and dialect context`,async()=>{
 const {requestOperation}=require('./dist/execution.cjs'),{referencePage}=require('./dist/reference_projection.cjs');
 const root='file:///approved/primary-schema.json',native='file:///approved/target.json',schema='https://schemas.invalid/base/target.json';
 const pointer='/components/schemas/Shared';
 const value={openapi:version,info:{title:'Independent native URI context',version:'1'},
  paths:{'/p':{get:{responses:{200:{$ref:'#/components/responses/Use'}}}}},
  components:{schemas:{Shared:{$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://schemas.invalid/base/shared',$ref:'target.json#/Thing'}},
   responses:{Use:{$ref:'#/components/schemas/Shared'}}}};
 const input={root,snapshot:'primary-schema-native-role',resources:[{id:root,text:JSON.stringify(value),generation:1},
  {id:native,text:JSON.stringify({Thing:{description:'Native response URI'}}),generation:2},
  {id:schema,text:'{"Thing":{"type":"integer","enum":[9007199254740993.00]}}',generation:3}]};
 const graph=createGraph(input).graph,source=input.resources.map(resource=>resource.text);
 assert.equal(graph.scope(root,pointer).kind,'schema');
 const nativeScope=graph.scopeAs(root,pointer,'response');
 assert.equal(nativeScope.base,root);assert.equal(nativeScope.dialect,graph.scope(root,'').dialect);
 assert.equal(graph.scopeAs(root,pointer,'schema').base,'https://schemas.invalid/base/shared');
 const edges=graph.references.filter(reference=>reference.resource===root&&reference.pointer===pointer&&reference.keyword==='$ref');
 assert.deepEqual(new Set(edges.map(edge=>edge.targetResource)),new Set([native,schema]));
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));
 const checked=await evaluateSchemas({...input,runtimeInstances:['9007199254740993','0'].map(text=>({subject:'response-body',location:text,text,schema:{resource:root,pointer}}))});
 assert.equal(checked.complete,true,JSON.stringify(checked.findings));assert.deepEqual(checked.runtimeEvaluations.map(result=>result.valid),[true,false]);
 assert.equal(requestOperation({...input,resource:root,pointer:'/paths/~1p/get'}).responses[0].description,'Native response URI');
 assert(referencePage({...input,resource:root,pointer:'/paths/~1p/get'}).previews.some(preview=>preview.text==='Native response URI'));
 const review=await planMigration({...input,targetVersion:'3.2.1',destination:'file:///delivered/native-context/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={root:review.outputRoot,snapshot:'cold-native-context',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0,
  aliases:Object.entries(review.manifest.resourceMappings).filter(([,path])=>path===output.path).map(([uri])=>uri)}))};
 assert.equal(analyse(cold).status,'complete',JSON.stringify(analyse(cold).findings));
 assert.equal(requestOperation({...cold,resource:cold.root,pointer:'/paths/~1p/get'}).responses[0].description,'Native response URI');
 assert.deepEqual(input.resources.map(resource=>resource.text),source);
 // Different meanings of the original authored field still require a split
 // before refactoring; the graph must not waive this guard because both roles
 // are now valid and individually inspectable.
 const target={root,resource:root,pointer,generation:1},contexts=[{root,resources:input.resources.map(resource=>resource.id)}];
 assert.throws(()=>planSchemaDefinitionRename({...input,target,contexts,name:'Renamed'}),error=>error.code==='reference.edit.context');
});

for(const version of ['3.1.2','3.2.1'])test(`${version} native media under a schema resource uses document context and separate Markdown owners`,async()=>{
 const {requestOperation}=require('./dist/execution.cjs'),{resolveUri}=require('./dist/reference_graph.cjs');
 const root='file:///approved/native-media.json',model='file:///approved/target.json',pointer='/components/schemas/Resource/$defs/Shared';
 const body={description:'[Guide](guide.md)',content:{'application/json':{schema:{$ref:'target.json#/Thing'}}}};
 const value={openapi:version,info:{title:'Nested native role',version:'1'},paths:{'/p':{get:{responses:{200:{$ref:'#'+pointer}}}}},
  components:{schemas:{Resource:{$id:'https://schemas.invalid/base/resource',$schema:'https://json-schema.org/draft/2020-12/schema',$defs:{Shared:body}}}}};
 const input={root,snapshot:'native-schema-resource',resources:[{id:root,text:JSON.stringify(value),generation:0},
  {id:model,text:'{"Thing":{"type":"integer","enum":[9007199254740993.00]}}',generation:0}]};
 const original=input.resources.map(resource=>resource.text),graph=createGraph(input).graph;
 assert.equal(graph.scopeAs(root,pointer,'schema').base,'https://schemas.invalid/base/resource');
 assert.equal(graph.scopeAs(root,pointer,'response').base,root);
 const mediaPointer=pointer+'/content/application~1json/schema',schema=graph.scopeAs(root,mediaPointer,'schema');
 assert.equal(schema.base,root);assert.equal(schema.dialect,graph.scope(root,'').dialect);
 assert.equal(graph.referenceAs(root,mediaPointer,'$ref','schema').targetResource,model);
 assert.equal(analyse(input).status,'complete',JSON.stringify(analyse(input).findings));
 const beforePlan=requestOperation({...input,resource:root,pointer:'/paths/~1p/get'});
 const check=async(packet,plan)=>{
  const result=await evaluateSchemas({...packet,runtimeInstances:['9007199254740993','0'].map(text=>({subject:'response-body',location:text,text,schema:plan.responses[0].content[0].schema}))});
  assert.equal(result.complete,true,JSON.stringify(result.findings));assert.deepEqual(result.runtimeEvaluations.map(result=>result.valid),[true,false]);
 };
 await check(input,beforePlan);
 const review=await planMigration({...input,targetVersion:'3.2.1',destination:'file:///delivered/native-media/'});
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const cold={root:review.outputRoot,snapshot:'cold-nested-native',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0,
  aliases:Object.entries(review.manifest.resourceMappings).filter(([,path])=>path===output.path).map(([uri])=>uri)}))};
 assert.equal(analyse(cold).status,'complete',JSON.stringify(analyse(cold).findings));
 await check(cold,requestOperation({...cold,resource:cold.root,pointer:'/paths/~1p/get'}));
 const after=createGraph(cold).graph,reference=after.referenceAs(cold.root,'/paths/~1p/get/responses/200','$ref','response');
 assert(reference.targetPointer.startsWith('/components/responses/_migrated_object_use_'));
 const nativeDescription=after.docs.get(reference.targetResource).dataNode(reference.targetPointer+'/description').value;
 const schemaDescription=after.docs.get(cold.root).dataNode(pointer+'/description').value;
 assert.equal(resolveUri(nativeDescription.match(/\]\(([^)]+)\)/)[1],after.scopeAs(reference.targetResource,reference.targetPointer,'response').base).href,'file:///approved/guide.md');
 assert.equal(schemaDescription,'[Guide](guide.md)');
 assert.equal(after.docs.get(cold.root).dataJson(pointer+'/content'),graph.docs.get(root).dataJson(pointer+'/content'),'The schema annotation remains exact literal data');
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
});
