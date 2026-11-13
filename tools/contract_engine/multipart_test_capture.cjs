const {requestMultipartPlan,requestOperation}=require('./dist/execution.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceError}=require('./dist/document.cjs');

// Exercise the production preparation and canonical actual-wire evaluator.
// Preparation itself no longer accepts a second copy of emitted MIME bytes.
async function prepareMultipart(input){
 const {wire,wireType,allowInvalid,...capture}=input;
 const prepared=await requestMultipartPlan(capture);
 if(wire===undefined)return prepared;
 const operation=requestOperation(capture),essence=input.mediaType.split(';')[0].trim().toLowerCase();
 const content=operation.requestBody.content.find(media=>media.mediaType.split(';')[0].trim().toLowerCase()===essence);
 const result=await evaluateSchemas({...capture,runtimeInstances:[{
  subject:'request-body',location:input.mediaType,text:wire,mediaBase64:true,mediaType:wireType,
  schema:content.schema,itemSchema:content.itemSchema,
  form:{...content.definition,partSchemas:prepared.partSchemas,fileShapes:prepared.fileShapes,partMediaTypes:input.choices??{}},
  originalData:prepared.original,originalFiles:prepared.files.map(file=>file.name),
  expectedData:prepared.raw===prepared.original?true:prepared.raw,omittedFields:prepared.intentOmissions,captureData:true,
 }]});
 const evaluations=result.runtimeEvaluations,findings=result.runtimeFindings;
 const complete=evaluations.length>0&&evaluations.every(value=>value.complete===true);
 const valid=complete&&evaluations.every(value=>value.valid===true)&&!findings.some(value=>value.severity==='error');
 const correspondence=findings.find(value=>value.code==='runtime.multipart.correspondence');
 if(correspondence||allowInvalid!==true&&!valid){
  const first=correspondence??findings[0];
  throw new SourceError(first?.code??'runtime.multipart.incomplete',first?.message??'Actual multipart evaluation is incomplete',
   first?.range??[0,0],complete?undefined:'unsupported',first?.source??first?.schema??content.definition);
 }
 const projection=evaluations.find(value=>typeof value.projectionData==='string');
 return {...prepared,checked:{complete,valid,...(content.formBinding==='multipart-named'&&!content.itemSchema&&!projection?.projectionBinary?.length?{instance:projection?.projectionData}:{})}};
}
module.exports={prepareMultipart};
