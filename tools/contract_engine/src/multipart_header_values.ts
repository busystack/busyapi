import {SourceError,escape,type Range} from './document';
import type {GraphTarget,ReferenceGraph} from './reference_graph';
import {mediaTypes} from './media_types';

export type MultipartHeaderLine={name:string;value:string;source?:{resource:string;pointer:string;range:Range}};
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const token=/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** Explicit field lines are transport inputs, never replacement Header Objects.
 * Schema conformance belongs to the captured MIME evaluator after preparation.
 * RFC 2046 §5.1 requires ASCII generic MIME headers; RFC 7578 §4.8 restricts
 * form-data fields. Structural fields stay with their existing owning controls. */
export function multipartHeaderValues(graph:ReferenceGraph,media:GraphTarget,names:ReadonlySet<string>,raw:unknown,formData:boolean,ruleFor?:(part:string)=>GraphTarget,allowDisposition=false):ReadonlyMap<string,MultipartHeaderLine[]> {
    if(raw===undefined)return new Map();
    if(!object(raw)||Object.keys(raw).length>2048)throw new SourceError('request.multipart.headers','Expected a bounded map of explicit MIME header fields');
    const result=new Map<string,MultipartHeaderLine[]>();
    for(const [part,fields]of Object.entries(raw)){
        if(!names.has(part))throw new SourceError('request.multipart.header.stale','The part header input no longer belongs to a selected body part');
        if(!Array.isArray(fields)||fields.length>61)throw new SourceError('request.multipart.headers','A part requires at most 61 explicit MIME header fields');
        const rule=ruleFor?.(part)??{...media,pointer:media.pointer+'/encoding/'+escape(part)};
        const rulesAt=rule.pointer+'/headers',rules=graph.docs.get(rule.resource)?.dataNode(rulesAt);
        const declarations=new Map<string,{resource:string;pointer:string;range:Range}>();
        for(const [name,node]of rules?.children??[]){
            const lower=name.toLowerCase();
            if(declarations.has(lower))throw new SourceError('request.multipart.headers','MIME header declarations repeat without regard to case',node.range,undefined,{resource:media.resource,pointer:node.pointer,range:node.range});
            declarations.set(lower,{resource:rule.resource,pointer:rulesAt+'/'+escape(name),range:node.range});
        }
        const values:MultipartHeaderLine[]=[];let bytes=0,disposition=false;
        for(const field of fields){
            if(!object(field)||typeof field.name!=='string'||typeof field.value!=='string'||!token.test(field.name)||field.name.length>1024||/[^\x20-\x7e]/.test(field.value))
                throw new SourceError('request.multipart.header.syntax','Explicit MIME headers require token names and printable ASCII values');
            const lower=field.name.toLowerCase(),source=declarations.get(lower);
            if(['content-type','content-transfer-encoding'].includes(lower)||lower==='content-disposition'&&!allowDisposition)
                throw new SourceError('request.multipart.header.controlled','Use the existing part media, file and transfer controls for structural MIME fields',source?.range??[0,0],undefined,source);
            if(lower==='content-disposition'){
                if(disposition)throw new SourceError('request.multipart.header.singleton','Content-Disposition occurs once per part',source?.range??[0,0],undefined,source);
                disposition=true;
                try{if(mediaTypes('x/'+field.value,false).length!==1)throw new SourceError('request.multipart.header.syntax','A disposition requires one MIME value');}
                catch(error){if(!(error instanceof SourceError))throw error;throw new SourceError(error.code,error.message,source?.range??[0,0],error.kind,source);}
            }
            if(formData)throw new SourceError('request.multipart.header.forbidden','RFC 7578 forbids this additional form-data header',source?.range??[0,0],undefined,source);
            bytes+=field.name.length+field.value.length+4;
            if(bytes>8192)throw new SourceError('limit.request.multipart.headers','Explicit MIME header input exceeds 8 KiB per part',source?.range??[0,0],undefined,source);
            values.push({name:field.name,value:field.value,...(source?{source}:{})});
        }
        if(values.length)result.set(part,values);
    }
    return result;
}
