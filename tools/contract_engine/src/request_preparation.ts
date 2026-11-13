import {createGraph} from './source_capture';
import {SourceError} from './document';
import {selectRequestMedia} from './request_media_selection';
import {requestOperation,requestContentParameters,requestParameterValues,requestFormBytes,requestMultipartPlan,requestMediaBytes,requestFormDataValues,requestFormMediaTypes,requestMultipartEncoding} from './execution';

/** One source capture and semantic operation interpret an immutable request
 * input. Files, credentials, TLS, dispatch and authority stay in Core. */
export async function requestInputPreparation(input:any){
 const captured=createGraph(input),plan=requestOperation(input,captured),parameters=await requestContentParameters(input,captured,plan);
 const structured=requestParameterValues({values:input.values}).values;
 const body=input.body;
 if(!body||!['none','raw','form','multipart','binaryFile'].includes(body.kind))throw new SourceError('request.preparation.input','Expected one captured request body input');
 let prepared:Record<string,unknown>|undefined;
 const selected=body.mediaType===undefined?undefined:selectRequestMedia<Record<string,any>&{mediaType:string}>(plan.requestBody?.content??[],body.mediaType);
 const options={...input,...body,literalFields:body.fields};
 if(body.kind==='form'&&!selected?.swaggerForm)prepared={form:await requestFormBytes(options,captured,plan)};
 else if(body.kind==='multipart'&&!selected?.swaggerForm)prepared={multipart:await requestMultipartPlan({...options,text:body.text??'{}'},captured,plan)};
 else if(body.kind==='raw'&&body.modeled)prepared={media:await requestMediaBytes(options,captured,plan)};
 else if(body.kind==='form'||body.kind==='multipart'){
  const data=body.text===undefined?undefined:requestFormDataValues({text:body.text});
  const fields=data?data.fields.flatMap((field:any)=>(field.kind==='array'?field.items:[field]).map((value:any)=>({name:field.name,kind:(field.kind==='array'?'item-':'')+(value.kind==='string'?'string':'other')}))):(body.fields??[]).map((field:any)=>({name:field.name,kind:'literal'}));
  const media=requestFormMediaTypes({...options,parts:[...new Set<string>(fields.map((value:any)=>value.name))]},captured,plan);
  const transfers=body.kind==='multipart'?await requestMultipartEncoding({...options,parts:fields,files:body.files.map((file:any)=>file.name)},captured,plan):undefined;
  prepared={data,media,transfers};
 }
 return {version:1,snapshot:input.snapshot,identity:plan.identity,parameters,structured,body:prepared};
}
