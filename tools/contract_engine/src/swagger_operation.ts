import {escape,SourceError} from './document';
import type {ReferenceGraph} from './reference_graph';
import {swaggerFileSchemas} from './swagger_file';
import {exampleRepresentation} from './example_representation';
import {schemaExampleCandidates} from './schema_examples';

export type LocatedSource={resource:string;pointer:string;generation:number;range:number[]};
type Locate=(resource:string,pointer:string)=>LocatedSource;

/** OAS 2.0 §6.4.1/6.4.7: operation overrides are independent of Path Items.
 * These located execution values never become authored 3.x objects. */
export function swaggerMedia(graph:ReferenceGraph,resource:string,pointer:string,field:'consumes'|'produces'):string[] {
    const operation=graph.docs.get(resource)!.dataNode(pointer)!,root=graph.docs.get(graph.root)!;
    const selected=operation.children.has(field)?operation.value[field]:root.root.value[field];
    if(selected===undefined||Array.isArray(selected)&&!selected.length)return ['*/*'];
    if(!Array.isArray(selected)||selected.some(value=>typeof value!=='string'))throw new SourceError('request.media','The effective Swagger '+field+' declaration must be a string array');
    return selected;
}
export {swaggerServers} from './swagger_servers';
export function swaggerFlat<Source extends Pick<LocatedSource,'resource'|'pointer'|'range'>>(value:any,source:Source) {
    const collectionFormat=value.collectionFormat??'csv';
    return {family:'2.0',type:value.type,collectionFormat,
        items:value.items?{type:value.items.type,collectionFormat:value.items.collectionFormat??'csv',items:swaggerItems(value.items.items)}:undefined,
        style:({ssv:'spaceDelimited',tsv:'tabDelimited',pipes:'pipeDelimited'} as Record<string,string>)[collectionFormat]??(value.in==='query'||value.in==='formData'?'form':'simple'),
        explode:collectionFormat==='multi',schema:{...source,kind:'schema',file:value.type==='file',unconstrained:false}};
}
function swaggerItems(value:any):any {
    return value?{type:value.type,collectionFormat:value.collectionFormat??'csv',items:swaggerItems(value.items)}:undefined;
}
/** Native response examples are media-keyed data, including null/false/zero.
 * No Reference Object interpretation is applied inside the payload. */
export function swaggerResponseContent(graph:ReferenceGraph,resource:string,pointer:string,media:string[],locate:Locate) {
    const doc=graph.docs.get(resource)!,node=doc.dataNode(pointer)!,value=node.value;
    const examples=doc.dataNode(pointer+'/examples');
    const names=[...new Set([...media,...(examples?.children.keys()??[])])];
    const scope=graph.scopes.get(resource+'#'+pointer+'/schema');
    let file=false,fileIssue:{code:string;message:string;source:LocatedSource}|undefined;
    if(scope)try{file=swaggerFileSchemas(graph)(scope)!==undefined;}catch(error){
        if(!(error instanceof SourceError)||error.kind!=='unsupported')throw error;
        fileIssue={code:error.code,message:error.message,source:locate(scope.resource,scope.pointer)};
    }
    return names.map(mediaType=>{
        const examplePointer=pointer+'/examples/'+escape(mediaType),entry=doc.dataNode(examplePointer);
        const representation=entry?exampleRepresentation('swagger-response',entry.value,mediaType):undefined;
        const example=entry?{mediaType,source:locate(resource,examplePointer),raw:representation==='serialized'?entry.value:doc.dataJson(examplePointer),text:typeof entry.value==='string'?entry.value:doc.dataJson(examplePointer),dataKind:typeof entry.value==='string'?'string':entry.kind,representation,level:'media'}:undefined;
        // A file has no JSON data instance to serialize as a schema candidate.
        // Media-keyed wire examples above remain independent of that annotation.
        const fallback=!example&&scope&&!file?schemaExampleCandidates(graph,scope):undefined;
        const candidates=fallback?.values.map(source=>{
            const owner=graph.docs.get(source.resource)!,node=owner.dataNode(source.pointer)!;
            const representation=exampleRepresentation('example',node.value,mediaType);
            return {mediaType,name:source.name,source:locate(source.resource,source.pointer),
                raw:representation==='serialized'?node.value:owner.dataJson(source.pointer),
                text:typeof node.value==='string'?node.value:owner.dataJson(source.pointer),
                dataKind:typeof node.value==='string'?'string':node.kind,representation,level:'media',origin:'schema',
                schemaApplicability:'not-evaluated',schemaContext:source.context.map(step=>({keyword:step.keyword,
                    ...('selector' in step?{selector:step.selector}:{}),source:locate(step.resource,step.pointer)}))};
        })??[];
        const selected=example?[example]:candidates;
        return {mediaType,source:locate(resource,pointer),definition:locate(resource,pointer),schema:Object.hasOwn(value,'schema')?{...locate(resource,pointer+'/schema'),kind:'schema',file,...(fileIssue?{fileIssue}:{}),unconstrained:Object.keys(value.schema??{}).length===0}:undefined,
            example:selected[0],examples:selected,...(fallback?{schemaExamples:{complete:fallback.complete,issues:fallback.issues.map(issue=>({code:issue.code,message:issue.message,source:locate(issue.resource,issue.pointer)}))}}:{})};
    });
}
