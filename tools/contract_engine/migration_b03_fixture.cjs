const assert=require('node:assert/strict'),YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs'),{analyse,createGraph}=require('./dist/model.cjs');
const {evaluateMigrationAnnotations}=require('./dist/migration_annotations.cjs');
const {SourceDocument}=require('./dist/document.cjs');

/** Shared production-path oracle. Source and target use their own captured
 * dialects; metadata is compared only for successful whole-schema evaluations.
 * Exact literals are source text, including values outside IEEE-754 integers. */
async function assertB03({schema,models={},samples,expected,independent,format='json',version='3.2.1',targetVersion='3.0.4'}){
 const root='file:///b03/api.'+format,schemas={Value:schema,...models,
  ...(independent?{Independent:{$ref:'#/components/schemas/Value/'+independent}}:{})};
 const document={openapi:version,info:{title:'B03 雪',version:'1'},paths:{},components:{schemas},'x-history':{schema,exact:'EXACT'}};
 const text=(format==='yaml'?'# Preserve B03 aliases 雪\r\n'+YAML.stringify(document).replaceAll('\n','\r\n'):JSON.stringify(document))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const input={root,snapshot:'b03-'+format+version+targetVersion,resources:[{id:root,text,generation:7}],targetVersion,destination:'file:///b03-output/'};
 const run=async(packet,prefix)=>{
  const result=await evaluateMigrationAnnotations({...packet,runtimeInstances:Object.keys(schemas).flatMap(name=>samples.map(text=>({
   subject:'response-body',location:name,text,schema:{resource:packet.root,pointer:prefix+name}})))});
  assert.equal(result.checked.complete,true,JSON.stringify(result.checked.findings));
  assert(result.checked.runtimeEvaluations.every(value=>value.complete));return result;
 };
 assert.equal(analyse(input).status,'complete');const before=await run(input,'/components/schemas/');
 if(expected)assert.deepEqual(before.checked.runtimeEvaluations.slice(0,samples.length).map(value=>value.valid),expected);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 assert.equal(review.producerVersion,'91');
 const output={root:review.outputRoot,snapshot:'b03-cold',resources:review.outputs.map(output=>({...output,generation:0}))};
 assert.equal(analyse(output).status,'complete',JSON.stringify(analyse(output).findings));
 const after=await run(output,targetVersion==='2.0'?'/definitions/':'/components/schemas/');
 assert.deepEqual(after.checked.runtimeEvaluations.map(value=>value.valid),before.checked.runtimeEvaluations.map(value=>value.valid));
 assert.deepEqual(after.annotations,before.annotations,'Successful value metadata must retain its instance location and multiplicity');
 const graph=createGraph(output).graph;assert(graph.entryReferences().every(reference=>reference.resolution==='resolved'));
 assert.equal(graph.docs.get(output.root).dataJson('/x-history'),new SourceDocument(text,root).dataJson('/x-history'));
 assert.equal(input.resources[0].text,text);assert.deepEqual((await planMigration(input)).outputs,review.outputs);
 return {input,review,output,graph};
}
module.exports={assertB03};
