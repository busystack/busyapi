import {SourceDocument,SourceError,escape,segments} from './document';
import type {GraphTarget,ReferenceGraph} from './reference_graph';
import {FormSemantics,formLiteralType,multipartStyleData,multipartArrayBinding,multipartExpandedObject,namedFileShapeSelection,type FormShape} from './form_semantics';
import {MultipartFileShapes} from './multipart_file_shapes';
import {decimal} from './exact_numbers';
import {MultipartEncoding,type MultipartSchemaStep,type MultipartTransfer} from './multipart_encoding';
import {mediaTypes,mediaTypeChoice} from './media_types';
import {mimeParts,mimeSingleton,mimePartDecodingType} from './mime_parts';
import {decodeMultipartTransfer,multipartTextSerialization} from './multipart_transfer';
import {decodeRuntimeMedia,runtimeMediaBytes,runtimeMediaKind,type TextSerialization} from './runtime_media';
import {mimeHeaders} from './mime_headers';
import type {MimeHeaderFormDecoder} from './mime_header_content';
import {prefixBinary,type BinaryLocations} from './runtime_binary';
import type {FormCheck,FormIssue,RuntimeFormData,RuntimeFormTarget,RuntimeFormModel} from './runtime_form';

type ObjectValue=Record<string,unknown>;
type Hint={schema:GraphTarget;shape:FormShape;path:MultipartSchemaStep[];selection?:GraphTarget};
const object=(value:unknown):value is ObjectValue=>value!==null&&typeof value==='object'&&!Array.isArray(value);

/** OAS 3.2 §§4.14.3/4.14.5/4.15.2: wire positions and nested encodings
 * project into exact CST instances. The original captured schemas, including
 * itemSchema, remain the only authority for their constraints. */
export function decodeRuntimeMultipart(text:string,id:string,contentType:string,base64:boolean,target:RuntimeFormTarget,graph:ReferenceGraph,decodeHeaderForm:MimeHeaderFormDecoder,textSerialization?:TextSerialization,
    decodeNestedForm?:(text:string,id:string,type:string,target:RuntimeFormTarget,model:RuntimeFormModel)=>RuntimeFormData):RuntimeFormData|undefined {
    const unicode=textSerialization==='unicode'?'unicode':undefined;
    const owner=graph.docs.get(target.resource)?.dataNode(target.pointer),media=owner?.value;
    if(!object(media))throw new SourceError('runtime.form.owner','The captured multipart Media Type Object is unavailable',owner?.range??[0,0]);
    const forms=new FormSemantics(graph);
    const family=graph.scopeAs(target.resource,target.pointer,'media')?.family??'3.2';
    const transfers=new MultipartEncoding(graph),headers=mimeHeaders(graph,id+'/headers',transfers,decodeHeaderForm),checks:FormCheck[]=[],issues:FormIssue[]=[];
    const location=(pointer:string):GraphTarget=>({resource:target.resource,pointer,kind:'schema'});
    const hints:Hint[]=['schema','itemSchema'].filter(key=>graph.scopes.has(target.resource+'#'+target.pointer+'/'+key))
        .map(key=>({schema:location(target.pointer+'/'+key),shape:forms.shape(target.resource,target.pointer+'/'+key),path:[]}));
    const whole=hints.find(hint=>hint.schema.pointer.endsWith('/schema'));
    const rootChoices=family==='3.2'?forms.multipartRootChoices({...target,kind:'media'},whole?.schema,contentType):[];
    const rootChoice=rootChoices.find(choice=>choice.id===target.partSchemas?.['']);
    if(target.partSchemas?.['']!==undefined&&!rootChoice)transfers.failure('runtime.form.representation','The selected whole-body representation is absent from the captured declaration',target);
    if(rootChoice&&whole)whole.shape=rootChoice.shape;
    const named=(rootChoice?.binding??forms.multipartBinding(family,target.resource,target.pointer,contentType))==='multipart-named';
    const nested=(rule:unknown)=>{
        if(!object(rule))return false;
        if(family==='3.2'&&(rule.encoding!==undefined||rule.prefixEncoding!==undefined||rule.itemEncoding!==undefined))return true;
        if(typeof rule.contentType!=='string')return false;
        try{return mediaTypes(rule.contentType).some(type=>family==='3.2'&&type.type==='multipart'||type.type==='application'&&type.subtype==='x-www-form-urlencoded');}
        catch(error){if(error instanceof SourceError)return false;throw error;}
    };
    if(named&&!Object.keys(target.partSchemas??{}).length&&!(family==='3.2'&&(media.prefixEncoding!==undefined||media.itemEncoding!==undefined))&&!Object.values(forms.namedEncoding(media.encoding,whole?[whole]:[])).some(nested))return;
    for(const [name,shape]of Object.entries(target.fileShapes??{})){
        const styled=family!=='3.0'&&['style','explode','allowReserved'].some(key=>Object.hasOwn(media.encoding?.[name]??{},key));
        if(!named||!whole||!namedFileShapeSelection(family,contentType,styled)||!new MultipartFileShapes(graph).choices(whole.schema,name).includes(shape))
            transfers.failure('runtime.form.file-shape','The selected file shape is absent from the captured named MIME content binding',target,true);
    }
    let work=0,serial=0;
    const branchChecks:{schema:GraphTarget;pointer:string;valid:boolean}[]=[];
    const binaryInstances=new Map<SourceDocument,BinaryLocations>();
    const parse=(raw:string,binary?:BinaryLocations)=>{
        const doc=new SourceDocument(raw,id+'/'+serial++,true,'json');if(doc.issues.length)throw doc.issues[0];
        if(binary?.size)binaryInstances.set(doc,binary);return doc;
    };
    const fail=(code:string,message:string,at:GraphTarget,unsupported=true):never=>transfers.failure(code,message,at,unsupported);
    const descend=(hint:Hint,step:MultipartSchemaStep):Hint=>({...hint,path:[...hint.path,step],
        shape:forms.pathShape(hint.schema,[...hint.path,step],'property' in step?hint.shape.properties?.[step.property]??{}:step.item===undefined?hint.shape.items??{}:hint.shape.prefixItems?.[step.item]??hint.shape.items??{})});
    const selectBranches=(values:Hint[],selected:GraphTarget,pointer:string)=>{
        for(const hint of values){
            const actual=segments(pointer),base=actual.slice(0,actual.length-hint.path.length);
            for(const assertion of forms.partSchemaAssertions(hint.schema,hint.path,selected)){
                const path=assertion.path.map((step,index)=>'property' in step?step.property:step.item===undefined?actual[base.length+index]:String(step.item));
                branchChecks.push({schema:assertion.schema,pointer:[...base,...path].map(escape).map(segment=>'/'+segment).join(''),valid:assertion.valid});
            }
        }
    };
    const decode=(bytes:Buffer,type:string,rule:ObjectValue,at:GraphTarget,values:Hint[],prefix:string,depth:number,serialization:TextSerialization|undefined):{raw:string;binary:BinaryLocations;items?:SourceDocument[]}=>{
        if(depth>8)fail('limit.runtime.multipart.depth','Nested multipart decoding exceeds eight levels',at);
        if(depth>0&&family!=='3.2')rule={};
        const concrete=mediaTypes(type,false)[0],form=concrete.subtype==='form-data';
        const array=depth===0?!named:multipartArrayBinding(type,values[0]?.shape??{},rule);
        if(!array)rule={...rule,encoding:forms.namedEncoding(rule.encoding,values)};
        const parts=mimeParts(bytes,type),members=new Map<string,{raw:string;binary:BinaryLocations}[]>(),items:SourceDocument[]=[],binary=new Map<string,Buffer>(),repeatedNames=new Set<string>();
        const expandedMembers=new Map<string,Map<string,{raw:string;binary:BinaryLocations}>>();
        for(const [index,part]of parts.entries()){
            if(++work>2048)fail('limit.runtime.form','Nested multipart decoding exceeds 2048 total parts',at);
            let name:string|undefined;
            let expandedProperty:string|undefined;
            let expandedHints:Hint[]|undefined;
            if(form||!array){
                const disposition=mimeSingleton(part.headers,'content-disposition');
                if(disposition===undefined)fail('runtime.form.syntax','A multipart form-data part needs Content-Disposition',at,false);
                const parsed=mediaTypes('x/'+disposition,false);
                if(parsed[0].subtype!=='form-data'||!parsed[0].parameters.has('name'))fail('runtime.form.syntax','A multipart form-data part needs a name',at,false);
                name=parsed[0].parameters.get('name')!;
            }
            if(!array&&family!=='3.0'){
                const actualName=name!,matches:{name:string;key:string;hints:Hint[];selection?:GraphTarget}[]=[];
                for(const field of Object.keys(values[0]?.shape.properties??{})){
                    const encoding=object(rule.encoding?.[field])?rule.encoding[field]:{};
                    if(!['style','explode','allowReserved'].some(key=>Object.hasOwn(encoding,key)))continue;
                    let hints=values.map(hint=>descend(hint,{property:field}));
                    const pointer=prefix+'/'+escape(field),selection=target.partSchemas?.[pointer];
                    const choice=selection===undefined?undefined:hints.flatMap(hint=>forms.partRepresentations({...target,kind:'media'},hint.schema,hint.path)).find(choice=>choice.id===selection);
                    if(choice)hints=hints.map(hint=>({...hint,selection:choice.schema,shape:forms.selectedShape(hint.shape,choice.shape,choice.schema)}));
                    const expansion=multipartExpandedObject(encoding,hints[0]?.shape??{});
                    const key=expansion==='deepObject'&&actualName.startsWith(field+'[')&&actualName.endsWith(']')?actualName.slice(field.length+1,-1):
                        expansion==='form'&&Object.hasOwn(hints[0]?.shape.properties??{},actualName)?actualName:undefined;
                    if(key!==undefined)matches.push({name:field,key,hints,selection:choice?.schema});
                }
                if(matches.length>1||matches.length&&Object.hasOwn(values[0]?.shape.properties??{},actualName))fail('runtime.form.ambiguous','Several named declarations claim this expanded MIME field',at,false);
                if(matches.length){
                    const match=matches[0];name=match.name;expandedProperty=match.key;expandedHints=match.hints;
                    if(match.selection){
                        const pointer=prefix+'/'+escape(name);selectBranches(values.map(hint=>descend(hint,{property:name!})),match.selection,pointer);
                        branchChecks.push({schema:match.selection,pointer,valid:true});
                    }
                }
            }
            const prefixRules=Array.isArray(rule.prefixEncoding)?rule.prefixEncoding:[];
            const entry=array?(index<prefixRules.length?prefixRules[index]:rule.itemEncoding):object(rule.encoding)?rule.encoding[name!]:undefined;
            const encoding=object(entry)?entry:{};
            const entryAt={...at,pointer:array?at.pointer+(index<prefixRules.length?'/prefixEncoding/'+index:'/itemEncoding'):at.pointer+'/encoding/'+escape(name!)};
            const styled=family!=='3.0'&&(form||family!=='3.2'&&!array)&&['style','explode','allowReserved'].some(key=>Object.hasOwn(encoding,key));
            let itemHints=expandedHints??values.map(hint=>array?descend(hint,{item:index}):descend(hint,{property:name!}));
            if(expandedProperty!==undefined)itemHints=itemHints.map(hint=>descend(hint,{property:expandedProperty!}));
            if(depth===0&&array){const item=hints.find(hint=>hint.schema.pointer.endsWith('/itemSchema'));if(item)itemHints.push(item);}
            if(form&&array)itemHints=itemHints.map(hint=>descend(hint,{property:name!}));
            if(!array&&expandedProperty===undefined){
                const pointer=prefix+'/'+escape(name!),selection=target.partSchemas?.[pointer];
                const choice=selection===undefined?undefined:itemHints.flatMap(hint=>forms.partRepresentations({...target,kind:'media'},hint.schema,hint.path)).find(choice=>choice.id===selection);
                if(choice?.shape.types?.includes('array')){
                    selectBranches(itemHints,choice.schema,pointer);
                    branchChecks.push({schema:choice.schema,pointer,valid:true});
                    itemHints=itemHints.map(hint=>({...hint,selection:choice.schema,shape:forms.selectedShape(hint.shape,choice.shape,choice.schema)}));
                }
            }
            const fileShape=depth===0&&!array?target.fileShapes?.[name!]:undefined;
            if(fileShape)itemHints=itemHints.map(hint=>({...hint,shape:{...hint.shape,types:[fileShape==='array'?'array':'string'],literalType:fileShape==='array'?'array':'string',
                items:fileShape==='array'?forms.pathShape(hint.schema,[...hint.path,{item:undefined}],hint.shape.items):hint.shape.items}}));
            const repeated=expandedProperty===undefined&&!array&&itemHints[0]?.shape.types?.includes('array');
            if(repeated)repeatedNames.add(name!);
            if(repeated)itemHints=itemHints.map(hint=>descend(hint,{item:members.get(name!)?.length??0}));
            const partPrefix=prefix+'/'+(array?index:escape(name!));
            const instancePointer=expandedProperty!==undefined?partPrefix+'/'+escape(expandedProperty):form&&array?partPrefix+'/'+escape(name!):repeated?partPrefix+'/'+(members.get(name!)?.length??0):partPrefix;
            const selection=target.partSchemas?.[instancePointer];
            const originalHints=itemHints;
            let selected:GraphTarget|undefined;
            let selectedType:string|undefined;
            if(selection!==undefined){
                const choice=itemHints.flatMap(hint=>forms.partRepresentations({...target,kind:'media'},hint.schema,hint.path)).find(choice=>choice.id===selection);
                selected=choice?.schema;selectedType=choice?.type;
                if(!selected)fail('runtime.form.representation','The selected representation is absent from this captured part',entryAt,false);
                selectBranches(originalHints,selected!,instancePointer);
                itemHints=originalHints.map(hint=>({...hint,selection:selected,shape:forms.selectedShape(hint.shape,choice!.shape,selected!)}));
            }
            const field=itemHints.find(hint=>hint.shape.types?.length||hint.shape.contentEncoding!==undefined)?.shape??itemHints[0]?.shape??{};
            const declared=styled?'text/plain':typeof encoding.contentType==='string'?encoding.contentType:field.defaultContentType??'application/octet-stream';
            const actual=mimeSingleton(part.headers,'content-type')??(concrete.subtype==='digest'?'message/rfc822':'text/plain');
            mediaTypeChoice(declared,actual);
            const actualType=mediaTypes(actual,false)[0];
            const decodingType=mimePartDecodingType(actual,form);
            const decodeMedia=(...args:Parameters<typeof decodeRuntimeMedia>)=>{
                try{return decodeRuntimeMedia(...args);}
                catch(error){if(!(error instanceof SourceError)||error.source)throw error;return fail(error.code,error.message,entryAt,error.kind==='unsupported');}
            };
            const checkedHeaders=headers(part.headers,encoding.headers,entryAt,partPrefix,form);
            checks.push(...checkedHeaders.checks);issues.push(...checkedHeaders.issues);
            const literalType=formLiteralType(field);
            const implicit=originalHints.map(hint=>transfers.schemaPathEncoding(hint.schema,hint.path,literalType!==undefined&&literalType!=='string'?'other':undefined,selected!==undefined||hint.selection!==undefined||rootChoice!==undefined||fileShape!==undefined,false,selected??hint.selection??rootChoice?.schema));
            const encodings=new Set(implicit.flatMap(value=>value.encoding===undefined?[]:[value.encoding.toLowerCase()]));
            if(encodings.size>1)fail('runtime.form.transfer.undefined','Applicable part schemas specify conflicting transfer encodings',entryAt);
            const transfer:MultipartTransfer=implicit.find(value=>value.schemaEncoded||value.instanceEncoding!==undefined)??{schemaEncoded:false};
            const explicit=mimeSingleton(part.headers,'content-transfer-encoding'),expected=transfer.encoding;
            if(explicit!==undefined&&expected!==undefined&&explicit.toLowerCase()!==expected.toLowerCase())fail('runtime.form.transfer.undefined','The part header conflicts with its schema transfer encoding',transfer.source?{...transfer.source,kind:'schema'}:entryAt);
            if(actualType.type==='multipart'&&!['binary','7bit','8bit'].includes((explicit??expected??'binary').toLowerCase()))
                fail('runtime.form.syntax','A multipart entity permits only binary, 7bit or 8bit transfer encoding',entryAt,false);
            const transferEncoding=explicit??expected??'binary',payload=decodeMultipartTransfer(part.bytes,transferEncoding);
            const partSerialization=multipartTextSerialization(part.bytes,transferEncoding,payload,serialization==='unicode');
            let raw:string;
            let partBinary:BinaryLocations=new Map();
            if(transfer.schemaEncoded){
                if(partSerialization||runtimeMediaKind(actual)!=='opaque')decodeMedia(payload.bytes.toString('base64'),id+'/encoded-media/'+serial++,decodingType,true,'unsupported',partSerialization);
                raw=JSON.stringify(payload.encoded??decodeMedia(payload.bytes.toString('base64'),id+'/encoded/'+serial++,'text/plain; charset=utf-8',true).document.root.value);
            }
            else if(transfer.instanceEncoding==='octets'){
                if(partSerialization)decodeMedia(payload.bytes.toString('base64'),id+'/octet-media/'+serial++,decodingType,true,'octets',partSerialization);
                raw=JSON.stringify(payload.bytes.toString('latin1'));
            }
            else if(mediaTypes(actual,false)[0].type==='multipart'){
                const child=decode(payload.bytes,actual,encoding,entryAt,itemHints,instancePointer,depth+1,partSerialization);raw=child.raw;partBinary=child.binary;
            }
            else if(actualType.type==='application'&&actualType.subtype==='x-www-form-urlencoded'){
                const hint=itemHints.find(hint=>hint.shape.types?.includes('object'))??itemHints[0];
                if(!decodeNestedForm)fail('runtime.form.owner','The nested form decoder is unavailable',entryAt);
                const child=decodeNestedForm!(payload.bytes.toString('base64'),id+'/nested-form/'+serial++,actual,{...entryAt,partSchemas:target.partSchemas,partMediaTypes:target.partMediaTypes},
                    {schema:hint?.schema??location(target.pointer+'/schema'),path:hint?.path??[],shape:field,prefix:instancePointer,encoding:family==='3.2'&&object(encoding.encoding)?encoding.encoding:{}});
                raw=child.document.dataJson('');partBinary=child.binaryInstances?.get(child.document)??new Map();
                checks.push(...child.checks.map(check=>({...check,prefix:instancePointer+check.prefix})));
                issues.push(...child.issues.map(issue=>({...issue,pointer:instancePointer+issue.pointer})));
                for(const [pointer,selection]of Object.entries(target.partSchemas??{})){
                    if(!pointer.startsWith(instancePointer+'/'))continue;
                    const relative=segments(pointer.slice(instancePointer.length));
                    if(relative.length<1||relative.length>2||relative.length===2&&!/^(0|[1-9]\d*)$/.test(relative[1]))continue;
                    let hints=itemHints.map(hint=>descend(hint,{property:relative[0]}));
                    if(relative.length===2)hints=hints.map(hint=>descend(hint,{item:Number(relative[1])}));
                    const choice=hints.flatMap(hint=>forms.partRepresentations({...target,kind:'media'},hint.schema,hint.path)).find(choice=>choice.id===selection);
                    if(choice)selectBranches(hints,choice.schema,pointer);
                }
            }
            else{
                const decoded=decodeMedia(payload.bytes.toString('base64'),id+'/part/'+serial++,decodingType,true,transfer.instanceEncoding==='octets'?'octets':'binary',partSerialization);
                partBinary=decoded.binaryInstances?.get(decoded.document)??partBinary;
                const value=decoded.document.dataJson(''),type=formLiteralType(field);
                if(decoded.kind==='text'&&type!==undefined&&type!=='string'){
                    const literal=decoded.document.root.value;
                    if(typeof literal!=='string')throw new SourceError('runtime.form.protocol','A text decoder returned another data kind');
                    raw=styled&&expandedProperty===undefined?multipartStyleData(literal,field,encoding):parse(literal).dataJson('');
                }else raw=value;
            }
            if(selected){
                const document=parse(raw,partBinary);
                const matches=!partBinary.has('')&&(selectedType==='integer'?document.root.kind==='number'&&decimal(document.dataJson('')).exponent>=0n:document.root.kind===selectedType);
                if(selectedType!==undefined&&!matches)
                    fail('runtime.form.representation.type','The decoded value does not have the selected captured representation type',selected,false);
                checks.push({document,schema:selected,prefix:instancePointer,binary:partBinary});
            }
            if(form&&array){
                raw='{'+JSON.stringify(name)+':'+raw+'}';const wrapped=new Map<string,Buffer>();prefixBinary(wrapped,'/'+escape(name!),partBinary);partBinary=wrapped;
            }
            if(expandedProperty!==undefined){
                const values=expandedMembers.get(name!)??new Map();
                if(values.has(expandedProperty))fail('runtime.form.style','An expanded object property occurs more than once',entryAt,false);
                values.set(expandedProperty,{raw,binary:partBinary});expandedMembers.set(name!,values);
            }else if(array){items.push(parse(raw,partBinary));prefixBinary(binary,'/'+index,partBinary);}
            else{const entries=members.get(name!)??[];entries.push({raw,binary:partBinary});members.set(name!,entries);}
        }
        if(array)return {raw:'['+items.map(doc=>doc.dataJson('')).join(',')+']',items,binary};
        for(const [name,values]of expandedMembers){
            if(members.has(name))fail('runtime.form.ambiguous','Expanded and ordinary fields claim the same object property',at,false);
            const nestedBinary=new Map<string,Buffer>();
            for(const [key,value]of values)prefixBinary(nestedBinary,'/'+escape(key),value.binary);
            members.set(name,[{raw:'{'+[...values].map(([key,value])=>JSON.stringify(key)+':'+value.raw).join(',')+'}',binary:nestedBinary}]);
        }
        const fields=[...members].map(([name,entries])=>{
            const repeated=entries.length>1||repeatedNames.has(name);
            entries.forEach((entry,index)=>prefixBinary(binary,'/'+escape(name)+(repeated?'/'+index:''),entry.binary));
            return JSON.stringify(name)+':'+(repeated?'['+entries.map(entry=>entry.raw).join(',')+']':entries[0].raw);
        });
        return {raw:'{'+fields.join(',')+'}',binary};
    };
    const result=decode(runtimeMediaBytes(text,base64),contentType,media,{resource:target.resource,pointer:target.pointer,kind:'media'},whole?[whole]:[], '',0,unicode);
    const document=parse(result.raw,result.binary);
    if(rootChoice){
        checks.push({document,schema:rootChoice.schema,prefix:'',binary:result.binary});
        for(const assertion of forms.partSchemaAssertions(whole!.schema,[],rootChoice.schema))checks.push({document,schema:assertion.schema,prefix:'',binary:result.binary,expectedValid:assertion.valid});
    }
    for(const assertion of branchChecks){
        if(!document.dataNode(assertion.pointer))fail('runtime.form.representation','The selected representation has no corresponding instance',assertion.schema,false);
        const binary=new Map<string,Buffer>();
        for(const [pointer,bytes]of result.binary)if(pointer===assertion.pointer||pointer.startsWith(assertion.pointer+'/'))binary.set(pointer.slice(assertion.pointer.length),bytes);
        checks.push({document:parse(document.dataJson(assertion.pointer),binary),schema:assertion.schema,prefix:assertion.pointer,binary,expectedValid:assertion.valid});
    }
    return {document,items:result.items,binaryInstances,kind:result.items?'multipart-sequence':'multipart-form',checks,issues};
}
