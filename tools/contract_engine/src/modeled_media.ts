import {SourceError} from './document';
import type {XmlTarget} from './xml_model';
import type {createGraph} from './engine';
/** All generation consumers share one canonical evaluator/codec lifetime. */
export async function prepareModeledMedia(input:any,text:string,mediaType:string,schema?:XmlTarget,header=false,direction?:'request'|'response',context?:ReturnType<typeof createGraph>):Promise<{bytes:Buffer;text:string}> {
 const {evaluateSchemas}=await import('./schema_evaluation');
 const result=await evaluateSchemas({...input,runtimeInstances:[],mediaPreparations:[{text,mediaType,schema,header,direction}]},undefined,context);
 const prepared=result.mediaPreparations?.[0];
 if(!prepared?.complete||!prepared.valid)throw new SourceError('runtime.media.preparation','The canonical media preparation did not complete',[0,0],'unsupported');
 return {bytes:Buffer.from(prepared.base64,'base64'),text:prepared.text};
}
