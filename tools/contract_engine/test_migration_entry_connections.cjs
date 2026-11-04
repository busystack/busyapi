const {test}=require('node:test'),assert=require('node:assert/strict'),YAML=require('yaml');
const {analyse,createGraph}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {planMigration}=require('./dist/migration.cjs');

for(const format of ['json','yaml'])test(`entry-owned map connections preserve native annotations and recursive assertions, ${format}`,async()=>{
 const root=`file:///entry-connections/a.${format}`,other=`file:///entry-connections/b.${format}`;
 const ref=`b.${format}#/components/schemas`;
 const fallback=entry=>({allOf:[{$ref:ref}],properties:{entry:{const:entry}},'x-entry':entry});
 const api=entry=>({openapi:entry==='First'?'3.2.0':'3.2.1',info:{title:entry,version:'1'},paths:{'/dictionary':{get:{responses:{200:{description:'Map',content:{'application/json':{schema:{$ref:ref}}}}}}}},
  components:{schemas:{Fallback:fallback(entry),...(entry==='First'?{Target:{$ref:ref}}:{})}}});
 const first=api('First'),second=api('Second');
 Object.assign(second.components.schemas,{
  properties:{kind:{type:'string'}},
  discriminator:{propertyName:'kind',defaultMapping:'Fallback'},
  additionalProperties:{allOf:[{$ref:ref}]},
 });
 second['x-history']=structuredClone(second.components.schemas);
 const encode=value=>(format==='yaml'?'# captured 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 first['x-number']='EXACT';second['x-number']='EXACT';
 const resources=[first,second].map((value,index)=>({id:[root,other][index],text:encode(value),generation:index+3}));
 const before=resources.map(resource=>resource.text),input={root,snapshot:'entry-map-connections-'+format,resources,targetVersion:'3.2.1',destination:'file:///connection-output/'};
 const schema='/paths/~1dictionary/get/responses/200/content/application~1json/schema';
 const inspect=async(packet,entryRoot,name)=>{
  assert.equal(analyse({...packet,root:entryRoot}).status,'complete');
  const graph=createGraph({...packet,root:entryRoot}).graph;
  let at={resource:entryRoot,pointer:schema};
  for(let count=0;count<64;count++){
   const reference=graph.referenceAs(at.resource,at.pointer,'$ref','schema');if(!reference)break;
   assert.equal(reference.resolution,'resolved');at={resource:reference.targetResource,pointer:reference.targetPointer};
   if(count===63)assert.fail('The map forwarding chain must remain finite');
  }
  const discriminator=graph.referenceAs(at.resource,at.pointer+'/discriminator','defaultMapping','schema');
  assert.equal(discriminator.resolution,'resolved');
  const model=graph.docs.get(discriminator.targetResource).dataNode(discriminator.targetPointer).value;
  assert.equal(model['x-entry'],name);
  const values=['{}','{"entry":"neither"}','{"nested":{"kind":"ok"}}','{"kind":0}','{"nested":{"kind":0}}'];
  const evaluation=await evaluateSchemas({...packet,root:entryRoot,runtimeInstances:values.map(text=>({subject:'response-body',location:'dictionary',text,schema:{resource:entryRoot,pointer:schema}}))});
  assert.equal(evaluation.complete,true,JSON.stringify(evaluation.findings));
  assert.deepEqual(evaluation.runtimeEvaluations.map(value=>value.valid),[true,true,true,false,false]);
  return {graph,at};
 };
 await inspect(input,root,'First');await inspect(input,other,'Second');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.equal(review.producerVersion,'76');
 const cold={root:review.outputRoot,snapshot:'cold-entry-map-connections',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
 const firstOwner=await inspect(cold,cold.root,'First'),secondRoot=review.changes.find(change=>change.resource===other).destination;
 const secondOwner=await inspect(cold,secondRoot,'Second');
 assert.notDeepEqual(firstOwner.at,secondOwner.at);
 const document=secondOwner.graph.docs.get(secondRoot);
 assert.deepEqual(document.dataNode('/components/schemas/discriminator').value,second.components.schemas.discriminator);
 assert.deepEqual(document.dataNode('/x-history').value,second['x-history']);
 for(const id of [cold.root,secondRoot])assert(review.outputs.find(output=>output.id===id).text.includes('9007199254740993.00'));
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});
