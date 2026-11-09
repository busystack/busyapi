import {createHash} from 'node:crypto';
import {SourceDocument,SourceError,escape} from './document';
import type {GraphTarget,ReferenceGraph} from './reference_graph';
import {FormSemantics,multipartStyleText,multipartArrayBinding,multipartExpandedObject,type FormShape} from './form_semantics';
import {MultipartEncoding,supportsMultipartTransfer,type MultipartTransfer} from './multipart_encoding';
import {mediaTypes,mediaTypeChoice,mediaTypeOptions} from './media_types';
import {multipartHeaderValues} from './multipart_header_values';
import {declaredPlainTextBytes,encodePlainText} from './text_encoding';
import {encodeRuntimeMedia,runtimeMediaKind,runtimeMediaBytes} from './runtime_media';
import {mimeParts,mimeSingleton} from './mime_parts';
import {decodeMultipartTransfer} from './multipart_transfer';
import {decodeRuntimeForm} from './runtime_form';
import {decimal} from './exact_numbers';
import {evaluateSchemas} from './schema_evaluation';
import {capturedMimeHeaderContent} from './mime_header_content';
import {runtimeFormMedia} from './runtime_media';
import {MultipartFileShapes} from './multipart_file_shapes';

type Hint={schema:GraphTarget;path:({property:string}|{item:number|undefined})[];shape:FormShape;selection?:GraphTarget};
type Content=Record<string,any>;
type Part={pointer:string;name?:string;contentType:string;rule:GraphTarget;schemas:GraphTarget[];transfer:MultipartTransfer;
    headers:{name:string;value:string}[];allowDisposition:boolean;bytes?:string;text?:string;file?:number;children?:Entity;urlencoded?:{raw:string;declaration:Content;mediaTypes:Record<string,string>}};
type Entity={contentType:string;parts:Part[]};
const object=(v:unknown):v is Content=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
// Projection never activates an unused Encoding Object just to discover an
// editor mode. Syntax/codec errors belong to the actual selected instance.
const mediaMatches=(raw:unknown,predicate:(type:ReturnType<typeof mediaTypes>[number])=>boolean)=>{
    if(typeof raw!=='string')return false;
    try{return mediaTypes(raw).some(predicate);}catch(error){if(error instanceof SourceError)return false;throw error;}
};

export async function proveNamedMultipart(graph:ReferenceGraph,content:Content,input:any){
    const transfers=new MultipartEncoding(graph),at:GraphTarget={...(content.definition??content.source),kind:content.swaggerForm?'operation':'media'};
    const fail=(code:string,message:string)=>transfers.failure(code,message,at);
    mediaTypeChoice(input.mediaType,input.wireType);
    const bytes=runtimeMediaBytes(input.wire,true),parts=mimeParts(bytes,input.wireType);
    if(!Array.isArray(input.files)||input.files.length>2048)fail('request.multipart.files','Expected captured named file identities');
    for(const file of input.files){
        if(!object(file)||!Number.isSafeInteger(file.position)||typeof file.name!=='string'||typeof file.identity!=='string')fail('request.multipart.files','Expected bounded named file identities');
        const part=parts[file.position];
        if(!part)fail('request.multipart.file.identity','An emitted file position is absent');
        const disposition=mimeSingleton(part.headers,'content-disposition');
        if(disposition===undefined||mediaTypes('x/'+disposition,false)[0].parameters.get('name')!==file.name)fail('request.multipart.file.identity','The emitted file name differs from its captured binding');
        if(file.filename!==undefined&&mediaTypes('x/'+disposition,false)[0].parameters.get('filename')!==file.filename)fail('request.multipart.file.identity','The emitted filename differs from the captured file input');
        const payload=decodeMultipartTransfer(part.bytes,mimeSingleton(part.headers,'content-transfer-encoding')??'binary');
        if(hash(payload.bytes)!==file.identity)fail('request.multipart.file.identity','The emitted file bytes differ from the approved capture');
    }
    const decoded=decodeRuntimeForm(input.wire,'file:///busyapi-generated-named',input.wireType,true,{...at,occurrence:input.occurrence,fileShapes:input.fileShapes},'request-body',graph);
    if(typeof input.expected==='string'){
        const intended=new SourceDocument(input.expected,'file:///busyapi-intended-named',true,'json');
        if(intended.issues.length)throw intended.issues[0];
        const skipped=new Set<string>(input.partialFiles?input.files.map(file=>'/'+escape(file.name)):[]);
        const actualBinary=decoded.binaryInstances?.get(decoded.document);
        const equal=(pointer:string):boolean=>{
            if(skipped.has(pointer))return true;
            const left=intended.dataNode(pointer),right=decoded.document.dataNode(pointer);
            if(!left||!right||left.kind!==right.kind||actualBinary?.has(pointer))return false;
            if(left.kind==='number')return intended.dataJson(pointer)===decoded.document.dataJson(pointer);
            if(left.kind==='object'||left.kind==='array'){
                if(pointer===''&&input.partialFiles)return [...left.children.values()].every(child=>equal(child.pointer))&&[...right.children].every(([name])=>left.children.has(name)||skipped.has('/'+escape(name)));
                return left.children.size===right.children.size&&[...left.children.values()].every(child=>equal(child.pointer));
            }
            return left.value===right.value;
        };
        if(!equal(''))fail('request.multipart.roundtrip','The generated named body does not decode to its intended typed values');
    }
    const result=await evaluateSchemas({...input,runtimeInstances:[{subject:'request-body',location:input.mediaType,
        text:input.wire,mediaBase64:true,mediaType:input.wireType,form:{...at,occurrence:input.occurrence,fileShapes:input.fileShapes},
        schema:content.schema,itemSchema:content.itemSchema}]});
    if(!result.runtimeEvaluations.length||result.runtimeEvaluations.some(value=>!value.complete||!value.valid)||result.runtimeFindings.some(value=>value.severity==='error')){
        const first=result.runtimeFindings.find(value=>value.severity==='error')??result.runtimeFindings[0];
        transfers.failure('request.multipart.conformance',first?.message??'Generated named multipart does not completely satisfy the original captured declaration',first?.schema??first?.source??at);
    }
    return {complete:true,valid:true};
}

/** One captured structure for presentation, typed generation and runtime
 * interpretation. No wire encoder or file acquisition lives in this owner. */
export function multipartStructure(graph:ReferenceGraph,content:Content){
    let type:ReturnType<typeof mediaTypes>[number];
    try{type=mediaTypes(content.mediaType)[0];}
    catch(error){if(error instanceof SourceError)return;throw error;}
    if(type.type!=='multipart')return;
    const forms=new FormSemantics(graph),at=content.definition;
    const binding=forms.multipartBinding(content.family,at.resource,at.pointer,content.mediaType);
    const rule=graph.docs.get(at.resource)?.dataNode(at.pointer)?.value??{};
    const rootChoices=content.family==='3.2'?forms.multipartRootChoices({...at,kind:'media'},content.schema,content.mediaType):[];
    const shape=forms.shape(at.resource,at.pointer+'/schema');
    const source=(pointer:string)=>{const node=graph.docs.get(at.resource)?.dataNode(pointer);return {resource:at.resource,pointer:node?.pointer??at.pointer,range:node?.range??at.range};};
    const positions=Array.isArray(rule.prefixEncoding)?rule.prefixEncoding:shape.prefixItems??[];
    const parts=binding==='multipart-ordered'?positions.map((_:unknown,index:number)=>({
        position:index,schemas:content.schema?forms.partSchemas({...content.schema,kind:'schema'},[{item:index}]):[],itemSchema:content.itemSchema,
        required:index<(shape.minItems??0),encoding:rule.prefixEncoding?.[index]??rule.itemEncoding,
        source:source(at.pointer+'/prefixEncoding/'+index)})):
        (content.schema?forms.propertyNames({...content.schema,kind:'schema'}):[]).map(name=>({name,schemas:content.schema?forms.partSchemas({...content.schema,kind:'schema'},[{property:name}]):[],
            required:shape.required?.includes(name)===true,encoding:rule.encoding?.[name],source:source(at.pointer+'/encoding/'+escape(name))}));
    const needsChoices=content.schema&&forms.propertyNames({...content.schema,kind:'schema'}).some(name=>{
        const nullable=(shape:FormShape,depth=0):boolean=>depth<128&&((shape.types?.length??0)>1&&shape.types!.includes('null')||
            !!shape.items&&nullable(shape.items,depth+1)||!!shape.prefixItems?.some(shape=>nullable(shape,depth+1)));
        // A named repeated array can itself have tuple schemas. Its Encoding
        // repeats, while schema/type defaults still belong to each index.
        if(shape.properties?.[name]?.prefixItems?.length)return true;
        if(nullable(shape.properties?.[name]??{}))return true;
        if(content.form?.parts?.[name]?.fileShapes?.length)return false;
        const choices=forms.partRepresentations({...at,kind:'media'},{...content.schema,kind:'schema'},[{property:name}]);
        return new Set(choices.map(choice=>JSON.stringify([choice.shape.defaultContentType,choice.shape.literalType,choice.shape.contentEncoding,choice.shape.format]))).size>1;
    });
    const encoding=Object.values(forms.namedEncoding(rule.encoding,content.schema?[{schema:{...content.schema,kind:'schema'},path:[]}]:[]));
    const nestedForm=encoding.some(value=>object(value)&&mediaMatches(value.contentType,type=>type.type==='application'&&type.subtype==='x-www-form-urlencoded'));
    const usesTree=binding==='multipart-ordered'||rootChoices.length>1||needsChoices||shape.additionalProperties!==undefined||Object.keys(shape.patternProperties??{}).length>0||nestedForm||content.family==='3.2'&&encoding.some(value=>object(value)&&(value.encoding!==undefined||value.prefixEncoding!==undefined||value.itemEncoding!==undefined||mediaMatches(value.contentType,type=>type.type==='multipart')));
    const typedTree=usesTree||Object.values(content.form?.parts??{}).some((part:any)=>part.fileShapes?.length>0);
    return {binding,usesTree,typedTree,rootChoices,
        schema:content.schema,itemSchema:content.itemSchema,source:at,parts,
        shape,encoding:binding==='multipart-named'?content.encoding:undefined,
        prefixEncoding:binding==='multipart-ordered'?rule.prefixEncoding:undefined,itemEncoding:binding==='multipart-ordered'?rule.itemEncoding:undefined,
        maximumDepth:8,maximumParts:2048,fileAddressing:usesTree?'instance-json-pointer':'named-fields'};
}

/** Produces only serialization directives. Core feeds these directives to its
 * existing MIME serializer and transfer codecs, retaining resource ownership. */
export async function multipartGeneration(graph:ReferenceGraph,content:Content,input:any){
    const forms=new FormSemantics(graph),transfers=new MultipartEncoding(graph),at:GraphTarget={...content.definition,kind:'media'};
    const fail=(code:string,message:string,source=at,unsupported=false):never=>transfers.failure(code,message,source,unsupported);
    if(typeof input.text!=='string'||Buffer.byteLength(input.text)>16*1024*1024)fail('limit.request.form','Typed multipart JSON exceeds 16 MiB');
    let doc=new SourceDocument(input.text,'file:///busyapi-multipart-input.json',true,'json');
    if(doc.issues.length)throw doc.issues[0];
    let files=input.files??[];
    const choices=input.choices??{},headers=input.headers??{},rawSelections=input.partSchemas??{},rawShapes=input.fileShapes??{};
    if(!Array.isArray(files)||files.length>2048||files.some(file=>!object(file)||typeof file.name!=='string'||
        file.selected!==undefined&&typeof file.selected!=='string'))fail('request.multipart.files','Files require bounded instance JSON pointers');
    for(const [name,map]of Object.entries({choices,headers,partSchemas:rawSelections,fileShapes:rawShapes}))
        if(!object(map)||Object.keys(map).length>2048||Object.keys(map).some(key=>key.length>4096))fail('request.multipart.input','Expected bounded '+name+' choices');
    const selections:Record<string,string>={...rawSelections};
    if(Object.values(choices).some(value=>typeof value!=='string')||Object.values(selections).some(value=>typeof value!=='string'))
        fail('request.multipart.input','Part choices must be captured strings');
    if(Object.values(rawShapes).some(value=>!['single','array'].includes(value as string)))fail('request.multipart.file-shape','Expected captured single or array file choices');
    if(Object.values(headers).some(fields=>!Array.isArray(fields)||fields.length>61||fields.some(field=>!object(field)||typeof field.name!=='string'||typeof field.value!=='string')))
        fail('request.multipart.headers','Expected bounded explicit MIME header fields');
    const groups=new Map<string,boolean>(),fileShapes:Record<string,'single'|'array'>={},literalOrder=new Map<string,number>();
    const rootShape=forms.shape(at.resource,at.pointer+'/schema');
    const literals=input.literalFields??[];
    if(!Array.isArray(literals)||literals.length>2048||literals.some(field=>!object(field)||typeof field.name!=='string'||typeof field.value!=='string'))fail('request.multipart.input','Expected bounded literal fields');
    if(literals.length){
        if(content.formBinding!=='multipart-named')fail('request.multipart.shape','Ordered multipart requires an explicit typed JSON array');
        const members=new Map<string,string[]>(),orders=new Map<string,number[]>();
        for(const [index,field]of literals.entries()){
            const property=rootShape.properties?.[field.name]??{},shape=property.types?.includes('array')?property.items??{}:property;
            const rule=content.encoding?.[field.name],selected=choices[field.name]??rule?.contentType??shape.defaultContentType??'text/plain';
            const json=typeof selected==='string'&&mediaTypes(selected).every(type=>type.subtype==='json'||type.subtype.endsWith('+json'));
            const parsed=json||shape.literalType!==undefined&&shape.literalType!=='string';
            const value=parsed?new SourceDocument(field.value,'file:///busyapi-multipart-literal.json',true,'json'):undefined;
            if(value?.issues.length)throw value.issues[0];
            const raw=value?value.dataJson(''):JSON.stringify(field.value);
            const values=members.get(field.name)??[];values.push(raw);members.set(field.name,values);
            const positions=orders.get(field.name)??[];positions.push(index);orders.set(field.name,positions);
        }
        for(const [name,positions]of orders){const array=rootShape.properties?.[name]?.types?.includes('array')||positions.length>1;
            positions.forEach((position,index)=>literalOrder.set('/'+escape(name)+(array?'/'+index:''),position));}
        doc=new SourceDocument('{'+[...members].map(([name,values])=>JSON.stringify(name)+':'+(rootShape.properties?.[name]?.types?.includes('array')||values.length>1?'['+values.join(',')+']':values[0])).join(',')+'}',doc.id,true,'json');
    }
    const legacy=files.filter(file=>!file.name.startsWith('/'));
    if(legacy.length){
        if(content.formBinding!=='multipart-named'||doc.root.kind!=='object')fail('request.multipart.files','Named file groups require the captured named multipart object binding');
        const shapes=new MultipartFileShapes(graph),members=new Map([...doc.root.children].map(([name,node])=>[name,doc.dataJson(node.pointer)]));
        files=files.map(file=>({...file}));
        for(const name of new Set<string>(legacy.map(file=>file.name))){
            const candidates=shapes.choices({...content.schema,kind:'schema'},name),selected=input.fileShapes?.[name];
            if(selected!==undefined&&!candidates.includes(selected))fail('request.multipart.file-shape','The selected named file shape is absent from this captured declaration');
            if(selected===undefined&&candidates.length>1)fail('request.multipart.file-shape','Choose the single or array shape for this named file group');
            const array=(selected??candidates[0])==='array'||rootShape.properties?.[name]?.types?.includes('array')===true;
            const node=doc.dataNode('/'+escape(name)),values=node?.kind==='array'?[...node.children.values()].map(child=>doc.dataJson(child.pointer)):node?[doc.dataJson(node.pointer)]:[];
            const indexes=files.flatMap((file,index)=>file.name===name?[index]:[]);
            if(!array&&values.length+indexes.length!==1)fail('request.multipart.file-shape','A single file value cannot contain repeated inputs');
            groups.set(name,array);
            if(candidates.length&&!content.form?.parts?.[name]?.styled)fileShapes[name]=array?'array':'single';
            for(const index of indexes){files[index].name='/'+escape(name)+(array?'/'+values.length:'');values.push('null');}
            members.set(name,array?'['+values.join(',')+']':values[0]);
        }
        doc=new SourceDocument('{'+[...members].map(([name,raw])=>JSON.stringify(name)+':'+raw).join(',')+'}',doc.id,true,'json');
    }
    if(Object.keys(input.fileShapes??{}).some(name=>!groups.has(name)))fail('request.multipart.file-shape.stale','A file shape choice has no selected named file group');
    const byFile=new Map<string,number>();
    files.forEach((file,index)=>{if(byFile.has(file.name))fail('request.multipart.files','Each ordered file needs its own instance position');byFile.set(file.name,index);});
    const used=new Set<string>(),usedFiles=new Set<number>(),controls:any[]=[],selectedChecks:{pointer:string;schema:GraphTarget}[]=[],intentOmissions=new Set<string>();
    const descend=(hint:Hint,step:Hint['path'][number]):Hint=>({...hint,path:[...hint.path,step],
        shape:forms.pathShape(hint.schema,[...hint.path,step],'property' in step?hint.shape.properties?.[step.property]??{}:step.item===undefined?hint.shape.items??{}:hint.shape.prefixItems?.[step.item]??hint.shape.items??{})});
    const hints:Hint[]=[content.schema,content.itemSchema].filter(Boolean).map(schema=>({schema:{...schema,kind:'schema'},path:[],shape:forms.shape(schema.resource,schema.pointer)}));
    const whole=hints.find(hint=>hint.schema.pointer.endsWith('/schema'));
    const rootChoices=content.multipart?.rootChoices??[];
    const rootChoice=rootChoices.find(choice=>choice.id===selections['']);
    if(rootChoices.length&& !rootChoice&&!input.inspect)fail('request.multipart.representation','Select the captured named or ordered whole-body representation');
    if(rootChoices.length)controls.push({name:'',styled:false,...mediaTypeOptions(input.mediaType),schemas:rootChoices.map(choice=>({...choice.schema,id:choice.id})),source:at});
    if(rootChoice){used.add('');if(whole)whole.shape=rootChoice.shape;selectedChecks.push({pointer:'',schema:rootChoice.schema});}
    let count=0;
    const build=async(node:any,type:string,rule:Content,ruleAt:GraphTarget,values:Hint[],depth:number,root=false):Promise<Entity>=>{
        if(depth>8)fail('limit.request.multipart.depth','Multipart generation exceeds eight nested levels',ruleAt);
        if(depth>0&&content.family!=='3.2')rule={};
        const form=mediaTypes(type,false)[0].subtype==='form-data';
        const ordered=root?(rootChoice?.binding??content.formBinding)==='multipart-ordered':multipartArrayBinding(type,values[0]?.shape??{},rule);
        if(!ordered)rule={...rule,encoding:forms.namedEncoding(rule.encoding,values)};
        if(node.kind!==(ordered?'array':'object'))fail('request.multipart.shape',ordered?'This declaration requires an ordered JSON array':'This declaration requires a named JSON object',ruleAt);
        const entries:{node:any;name?:string;hints:Hint[];rule:Content;at:GraphTarget;expanded?:boolean;groupPointer?:string}[]=[];
        for(const [key,physical]of node.children){
            let child=doc.dataNode(physical.pointer)!,name:string|undefined=ordered?undefined:key;
            const index=Number(key),prefix=Array.isArray(rule.prefixEncoding)?rule.prefixEncoding:[];
            const pointer=ordered?ruleAt.pointer+(index<prefix.length?'/prefixEncoding/'+index:'/itemEncoding'):ruleAt.pointer+'/encoding/'+escape(key);
            const entry=ordered?(index<prefix.length?prefix[index]:rule.itemEncoding):rule.encoding?.[key],encoding=object(entry)?entry:{};
            let childHints=values.map(hint=>descend(hint,ordered?{item:index}:{property:key}));
            if(root&&!ordered&&groups.has(key))childHints=childHints.map(hint=>({...hint,shape:{...hint.shape,types:[groups.get(key)?'array':'string'],literalType:groups.get(key)?'array':'string',
                items:groups.get(key)?forms.pathShape(hint.schema,[...hint.path,{item:undefined}],hint.shape.items):hint.shape.items}}));
            if(root&&ordered){const item=hints.find(hint=>hint.schema.pointer.endsWith('/itemSchema'));if(item)childHints.push(item);}
            if(ordered&&form){
                if(child.kind!=='object'||child.children.size!==1)fail('request.multipart.name','Each ordered form-data item must contain exactly one named property',ruleAt);
                const [field,physical]=[...child.children][0] as [string,any];name=field;child=doc.dataNode(physical.pointer)!;
                childHints=childHints.map(hint=>descend(hint,{property:field}));
            }
            if(!ordered&&child.kind==='array'&&!groups.has(name!)){
                const options=childHints.flatMap(hint=>forms.partRepresentations(at,hint.schema,hint.path));
                let choice=options.find(choice=>choice.id===selections[child.pointer]);
                if(!choice&&!Object.hasOwn(selections,child.pointer)){
                    const arrays=options.filter(choice=>choice.type==='array'||choice.type===undefined&&choice.shape.types?.length===1&&choice.shape.types[0]==='array');
                    if(arrays.length===1&&options.every(choice=>choice.shape.types?.length===1||choice.type!==undefined))choice=arrays[0];
                }
                if(choice){
                    selections[child.pointer]=choice.id;used.add(child.pointer);
                    childHints=childHints.map(hint=>({...hint,selection:choice!.schema,shape:forms.selectedShape(hint.shape,choice!.shape,choice!.schema)}));
                }
            }
            // Named arrays repeat the Encoding once per item; an array-valued
            // item itself can be a nested multipart entity.
            if(!ordered&&childHints[0]?.shape.types?.includes('array')&&child.kind==='array'){
                const alternatives=[...new Map(values.map(hint=>descend(hint,{property:name!})).flatMap(hint=>forms.partRepresentations(at,hint.schema,hint.path)).map(choice=>[choice.id,choice])).values()];
                controls.push({name:child.pointer,styled:true,emitted:false,formData:form,source:{...ruleAt,pointer},selected:selections[child.pointer],
                    schemas:alternatives.map(choice=>({...choice.schema,id:choice.id,type:choice.type}))});
                if(!child.children.size)intentOmissions.add(child.pointer);
                for(const [index,physical]of child.children.entries())entries.push({node:doc.dataNode(physical.pointer)!,name,hints:childHints.map(hint=>descend(hint,{item:Number(index)})),rule:encoding,at:{...ruleAt,pointer},groupPointer:child.pointer});
            }else entries.push({node:child,name,hints:childHints,rule:encoding,at:{...ruleAt,pointer}});
        }
        const parts:Part[]=[];
        for(let entryIndex=0;entryIndex<entries.length;entryIndex++){
            const entry=entries[entryIndex];
            const pointer=entry.node.pointer;used.add(pointer);
            let partHints=entry.hints;
            const representations=[...new Map(partHints.flatMap(hint=>forms.partRepresentations(at,hint.schema,hint.path)).map(choice=>[choice.id,choice])).values()];
            const candidates=representations.map(choice=>choice.schema);
            let choice=Object.hasOwn(selections,pointer)?representations.find(choice=>choice.id===selections[pointer]):undefined;
            // The explicitly entered JSON kind selects a unique captured type.
            // Same-kind alternatives still require a branch choice; values,
            // filenames and schema branch order never select a representation.
            if(!choice&&!Object.hasOwn(selections,pointer)&&representations.length>0&&representations.every(choice=>choice.type!==undefined||choice.shape.types?.length===1)){
                const kind=byFile.has(pointer)?'string':entry.node.kind;
                const matching=representations.filter(choice=>{
                    const type=choice.type??choice.shape.types?.[0];
                    return type===kind||type==='integer'&&kind==='number'&&decimal(doc.dataJson(pointer)).exponent>=0n;
                });
                if(matching.length===1){choice=matching[0];selections[pointer]=choice.id;}
            }
            const selected=choice?.schema;
            if(Object.hasOwn(selections,pointer)&&!selected&&!input.inspect)fail('request.multipart.representation.stale','The selected schema representation is absent from this captured part',entry.at);
            if(selected){partHints=entry.hints.map(hint=>({...hint,selection:selected,shape:forms.selectedShape(hint.shape,choice!.shape,selected)}));selectedChecks.push({pointer,schema:selected});}
            const shape=partHints.find(hint=>hint.shape.types?.length||hint.shape.contentEncoding!==undefined)?.shape??partHints[0]?.shape??{};
            const file=byFile.get(pointer),fileChoice=file===undefined?undefined:files[file].selected;
            const alias=root&&!ordered?entry.name:undefined;
            if(alias!==undefined)for(const map of [choices,headers])if(Object.hasOwn(map,alias))used.add(alias);
            if(entry.groupPointer)for(const map of [choices,headers])if(Object.hasOwn(map,entry.groupPointer))used.add(entry.groupPointer);
            const mediaChoice=choices[pointer]??(entry.groupPointer?choices[entry.groupPointer]:undefined)??(alias===undefined?undefined:choices[alias]);
            const headerInput=Object.hasOwn(headers,pointer)?headers[pointer]:entry.groupPointer&&Object.hasOwn(headers,entry.groupPointer)?headers[entry.groupPointer]:alias===undefined?undefined:headers[alias];
            const styled=content.family!=='3.0'&&(form||content.family!=='3.2'&&!ordered)&&['style','explode','allowReserved'].some(key=>Object.hasOwn(entry.rule,key));
            if(entry.expanded&&['object','array'].includes(entry.node.kind)&&!input.inspect)
                fail('request.multipart.style.nested','RFC6570 does not define nested values inside an expanded object',entry.at,true);
            if(!choice&&entry.rule.contentType===undefined&&new Set(representations.map(choice=>choice.shape.defaultContentType)).size>1&&!input.inspect)
                fail('request.multipart.representation','Choose one captured part representation before preparing its default media type',entry.at);
            const declared=styled?'text/plain':typeof entry.rule.contentType==='string'?entry.rule.contentType:shape.defaultContentType??'application/octet-stream';
            if(styled&&mediaChoice!==undefined&&!input.inspect)fail('request.multipart.media.ignored','Remove the part media choice: explicit style fields ignore Encoding.contentType',entry.at);
            const options=mediaTypeOptions(declared);
            const control:any={name:pointer,styled:false,...options,schemas:representations.map(choice=>({...choice.schema,id:choice.id,type:choice.type})),
                required:ordered||values[0]?.shape.required?.includes(entry.name!)===true,position:parts.length,partName:entry.name,source:entry.at,shape,formData:form,
                headers:entry.rule.headers,selected:choice?.id};
            control.headerControls=Object.keys(entry.rule.headers??{}).map(name=>{
                const lower=name.toLowerCase(),source={...entry.at,pointer:entry.at.pointer+'/headers/'+escape(name),kind:'header'};
                const ignored=lower==='content-type'||form&&!['content-disposition','content-transfer-encoding'].includes(lower);
                if(ignored)return {name,editable:false,reason:lower==='content-type'?'Content-Type uses the part media control':'RFC 7578 requires this form-data Header to be ignored',source};
                const owner=transfers.follow(source,'header'),value=graph.docs.get(owner.resource)!.dataNode(owner.pointer)!.value;
                const controlled=lower==='content-transfer-encoding'||lower==='content-disposition'&&(form||entry.name!==undefined||file!==undefined);
                return {name,required:value?.required===true,editable:!controlled,source:owner,schema:value?.schema,content:value?.content,
                    ...(controlled?{reason:lower==='content-transfer-encoding'?'The captured transfer policy prepares this Header':'The name/file control prepares Content-Disposition'}:{})};
            });
            controls.push(control);
            const expansion=!ordered&&styled&&!entry.expanded?multipartExpandedObject(entry.rule,shape):undefined;
            if(expansion&&entry.node.kind==='object'){
                if(file!==undefined)fail('request.multipart.style.file','An expanded object needs structured property values rather than one file',entry.at);
                if(Object.hasOwn(headers,pointer)&&headers[pointer].length&&!input.inspect)fail('request.multipart.style.headers','Supply headers at each emitted child instance pointer',entry.at);
                control.emitted=false;
                const children=[...entry.node.children.entries()] as [string,any][];
                if(!children.length)intentOmissions.add(pointer);
                entries.splice(entryIndex,1,...children.map(([key,node])=>({node:doc.dataNode(node.pointer)!,
                    name:expansion==='deepObject'?entry.name+'['+key+']':key,
                    hints:partHints.map(hint=>descend(hint,{property:key})),rule:entry.rule,at:entry.at,expanded:true})));
                entryIndex--;continue;
            }
            if(++count>2048)fail('limit.request.multipart.parts','Multipart generation exceeds 2048 total parts',entry.at);
            let selectedType:string;
            try{selectedType=mediaTypeChoice(declared,fileChoice??mediaChoice);}
            catch(error){if(!(error instanceof SourceError))throw error;if(!input.inspect)fail(error.code,error.message,entry.at,error.kind==='unsupported');control.choiceMessage=error.message;selectedType=options.concreteTypes[0]??'application/octet-stream';}
            const media=mediaTypes(selectedType!,false)[0];
            const implicit=input.inspect?[]:entry.hints.map(hint=>transfers.schemaPathEncoding(hint.schema,hint.path,file!==undefined||entry.node.kind==='string'?'string':'other',selected!==undefined||hint.selection!==undefined||rootChoice!==undefined||alias!==undefined&&groups.has(alias),false,selected??hint.selection??rootChoice?.schema));
            const tokens=new Set(implicit.flatMap(value=>value.encoding===undefined?[]:[value.encoding.toLowerCase()]));
            if(tokens.size>1)fail('request.multipart.encoding.undefined','Applicable schemas have conflicting transfer encodings',entry.at,true);
            const transfer:MultipartTransfer={...(implicit.find(value=>value.schemaEncoded||value.instanceEncoding)??{schemaEncoded:false})};
            const candidate=input.inspect?undefined:transfers.headerAt(entry.at,pointer,transfer,form);
            if(candidate){
                const headerContent=candidate.header?capturedMimeHeaderContent(graph,transfers)(candidate.header):undefined;
                const instances=candidate.values.map((value,index)=>headerContent?{subject:'request-part-transfer-'+index,location:pointer,text:value,mediaType:headerContent.type,
                    schema:headerContent.captured.schema,itemSchema:headerContent.captured.itemSchema,...(runtimeFormMedia(headerContent.type)?{form:headerContent.captured.source}:{})}:
                    {subject:'request-part-transfer-'+index,location:pointer,text:JSON.stringify(value),schema:candidate.schema});
                const evaluated=await evaluateSchemas({...input,runtimeInstances:instances});
                const results=candidate.values.map((_,index)=>evaluated.runtimeEvaluations.filter(value=>value.subject==='request-part-transfer-'+index));
                if(results.some(values=>!values.length||values.some(value=>value.complete!==true)))fail('request.multipart.encoding.unsupported','The transfer Header could not be completely evaluated',candidate.source,true);
                const valid=results.findIndex(values=>values.every(value=>value.valid===true));
                if(valid<0)fail(candidate.implicit?'request.multipart.encoding.undefined':candidate.literalExample?'request.multipart.header.invalid':'request.multipart.encoding.unsupported',
                    'No implemented transfer token satisfies the captured Header',candidate.source,!candidate.literalExample);
                transfer.encoding=candidate.values[valid];
            }
            if(transfer.encoding!==undefined&&!supportsMultipartTransfer(transfer.encoding))fail('request.multipart.encoding.unsupported','The selected transfer encoding has no native codec',transfer.source?{...transfer.source,kind:'schema'}:entry.at,true);
            const allowDisposition=!form&&entry.name===undefined&&file===undefined;
            const lines=input.inspect?[]:multipartHeaderValues(graph,at,new Set([pointer]),headerInput!==undefined?{[pointer]:headerInput}:{},form,()=>entry.at,allowDisposition).get(pointer)??[];
            const part:Part={pointer,name:entry.name,contentType:selectedType!,rule:entry.at,schemas:candidates,transfer,headers:lines,allowDisposition};
            if(media.type==='multipart'){
                if(file!==undefined)fail('request.multipart.file.entity','A nested typed multipart entity needs structured child values',entry.at);
                if(!['binary','7bit','8bit'].includes((transfer.encoding??'binary').toLowerCase()))fail('request.multipart.transfer','Multipart entities permit only binary, 7bit or 8bit transfer encoding',entry.at);
                part.children=await build(entry.node,selectedType!,entry.rule,entry.at,partHints,depth+1);
            }else if(media.type==='application'&&media.subtype==='x-www-form-urlencoded'){
                if(entry.node.kind!=='object'||file!==undefined)fail('request.multipart.form.shape','A typed nested URL-encoded form requires a named JSON object',entry.at);
                if(Object.entries(headers).some(([name,fields])=>name.startsWith(pointer+'/')&&(fields as any[]).length))
                    fail('request.multipart.form.headers','URL-encoded values do not have MIME part headers',entry.at);
                const types:Record<string,string>={},encoding=content.family==='3.2'?forms.namedEncoding(entry.rule.encoding,partHints):{};
                const fieldShapes:Record<string,FormShape>={...shape.properties};
                for(const [name,physical]of entry.node.children){
                    const field=doc.dataNode(physical.pointer)!,pointer=field.pointer;used.add(pointer);
                    const hint=partHints.map(hint=>descend(hint,{property:name})).find(hint=>hint.shape.types?.length)??partHints.map(hint=>descend(hint,{property:name}))[0];
                    const representations=hint?forms.partRepresentations(at,hint.schema,hint.path):[];
                    let selected=representations.find(choice=>choice.id===selections[pointer]);
                    if(!selected&&!Object.hasOwn(selections,pointer)){
                        const matching=representations.filter(choice=>(choice.type??choice.shape.types?.[0])===field.kind||choice.type==='integer'&&field.kind==='number'&&decimal(doc.dataJson(pointer)).exponent>=0n);
                        if(matching.length===1){selected=matching[0];selections[pointer]=selected.id;}
                    }
                    if(Object.hasOwn(selections,pointer)&&!selected&&!input.inspect)fail('request.multipart.representation.stale','The selected nested form representation is absent from this captured field',entry.at);
                    const fieldShape=selected?forms.selectedShape(hint?.shape??{},selected.shape,selected.schema):hint?.shape??{};
                    fieldShapes[name]=fieldShape;
                    const item=fieldShape.types?.includes('array')?fieldShape.items??{}:fieldShape;
                    const rule=object(encoding[name])?encoding[name]:{},styled=['style','explode','allowReserved'].some(key=>Object.hasOwn(rule,key));
                    if(field.kind==='array'&&!field.children.size||styled&&field.kind==='object'&&!field.children.size)intentOmissions.add(pointer);
                    const declared=typeof rule.contentType==='string'?rule.contentType:item.defaultContentType??'text/plain';
                    const fieldAt={...entry.at,pointer:entry.at.pointer+'/encoding/'+escape(name)};
                    const options=mediaTypeOptions(styled?'text/plain':declared);
                    controls.push({name:pointer,styled,...options,formData:true,source:fieldAt,
                        schemas:representations.map(choice=>({...choice.schema,id:choice.id,type:choice.type})),selected:selected?.id});
                    if(field.kind==='array'&&hint)for(const [index,physical]of field.children.entries()){
                        const itemNode=doc.dataNode(physical.pointer)!,itemPointer=itemNode.pointer;
                        used.add(itemPointer);
                        const alternatives=forms.partRepresentations(at,hint.schema,[...hint.path,{item:Number(index)}]);
                        let itemChoice=alternatives.find(choice=>choice.id===selections[itemPointer]);
                        if(!itemChoice&&!Object.hasOwn(selections,itemPointer)){
                            const matching=alternatives.filter(choice=>(choice.type??choice.shape.types?.[0])===itemNode.kind||choice.type==='integer'&&itemNode.kind==='number'&&decimal(doc.dataJson(itemPointer)).exponent>=0n);
                            if(matching.length===1){itemChoice=matching[0];selections[itemPointer]=itemChoice.id;}
                        }
                        if(Object.hasOwn(selections,itemPointer)&&!itemChoice&&!input.inspect)fail('request.multipart.representation.stale','The selected URL-form item representation is absent from the captured schema',fieldAt);
                        if(Object.hasOwn(choices,itemPointer)&&!input.inspect)fail('request.multipart.media.ignored','URL-form array items share the containing field media selection',fieldAt);
                        controls.push({name:itemPointer,styled:true,formData:true,source:fieldAt,selected:itemChoice?.id,
                            schemas:alternatives.map(choice=>({...choice.schema,id:choice.id,type:choice.type}))});
                    }
                    if(Object.hasOwn(headers,pointer)&&headers[pointer].length)fail('request.multipart.form.headers','URL-encoded values do not have MIME part headers',fieldAt);
                    if(styled){if(Object.hasOwn(choices,pointer)&&!input.inspect)fail('request.multipart.media.ignored','Style serialization ignores this field contentType choice',fieldAt);continue;}
                    try{types[name]=mediaTypeChoice(declared,choices[pointer]);}
                    catch(error){if(!(error instanceof SourceError))throw error;if(!input.inspect)fail(error.code,error.message,fieldAt,error.kind==='unsupported');}
                }
                part.urlencoded={raw:doc.dataJson(pointer),mediaTypes:types,declaration:{encoding,
                    form:{shape:{...shape,properties:fieldShapes},defaultContentType:'text/plain',multipartStyle:content.family!=='3.0',legacyBinary:content.family==='3.0',styles:['form','spaceDelimited','pipeDelimited','deepObject']}}};
            }else if(input.inspect){if(file!==undefined)usedFiles.add(file);parts.push(part);continue;}
            else if(file!==undefined){
                if(entry.node.kind!=='null')fail('request.multipart.file.placeholder','A selected file replaces an explicit null at its instance pointer',entry.at);
                part.file=file;usedFiles.add(file);
            }else{
                const kind=runtimeMediaKind(selectedType!);
                if(!['xml','json','linkset','linkset-json','text'].includes(kind)&&!transfer.schemaEncoded&&transfer.instanceEncoding!=='octets')fail('request.multipart.codec.unsupported','This typed part media has no native data encoder; select a declared JSON/text representation or a file',entry.at,true);
                if(!styled&&kind==='text'&&['array','object'].includes(entry.node.kind))fail('request.multipart.text.shape','Structured values require a declared structured media codec',entry.at);
                let text:string;
                try{text=styled&&!entry.expanded?multipartStyleText(doc,entry.node,entry.rule):['xml','linkset','linkset-json'].includes(kind)?encodeRuntimeMedia(new SourceDocument(doc.dataJson(pointer),'urn:busyapi:linkset-part',true,'json'),selectedType!,false,selected?{graph,schema:selected}:undefined).toString('utf8'):kind==='json'?doc.dataJson(pointer):entry.node.kind==='string'?entry.node.value:doc.dataJson(pointer);}
                catch(error){if(!(error instanceof SourceError))throw error;fail(error.code,error.message,entry.at,error.kind==='unsupported');}
                part.text=text;
                try{
                    if(transfer.instanceEncoding==='octets'){
                        // Existing native text entry uses UTF-8. Its legacy
                        // binary-string model counts those octets; files keep
                        // their independently captured raw representation.
                        part.bytes=Buffer.from(text,'utf8').toString('base64');
                    }else if(kind==='text'&&!transfer.schemaEncoded&&!form){
                        const encoded=encodePlainText(text,selectedType!,media.parameters.get('charset'));
                        part.contentType=encoded.contentType;part.bytes=encoded.bytes.toString('base64');
                    }else part.bytes=(transfer.schemaEncoded?Buffer.from(text,'ascii'):kind==='text'?declaredPlainTextBytes(text,media.parameters.get('charset')??(form?'utf-8':undefined)):Buffer.from(text,'utf8')).toString('base64');
                }
                catch(error){if(!(error instanceof SourceError))throw error;fail(error.code,error.message,entry.at,error.kind==='unsupported');}
            }
            parts.push(part);
        }
        if(!parts.length)fail('request.multipart.empty','RFC 2046 multipart entities require at least one part; omit the optional body instead',ruleAt);
        return {contentType:type,parts};
    };
    const tree=await build(doc.root,input.mediaType,graph.docs.get(at.resource)!.dataNode(at.pointer)!.value,at,whole?[whole]:[],0,true);
    if(content.formBinding==='multipart-named'&&(legacy.length||literals.length)){
        const order=(part:Part)=>part.file!==undefined?literals.length+2048+part.file:
            [...literalOrder].find(([pointer])=>part.pointer===pointer||part.pointer.startsWith(pointer+'/'))?.[1]??-1;
        tree.parts.sort((left,right)=>order(left)-order(right));
    }
    const positions=(entity:Entity)=>entity.parts.forEach((part,index)=>{
        const control=controls.find(control=>control.name===part.pointer&&control.emitted!==false);
        if(control)control.position=index;
        if(part.children)positions(part.children);
    });
    positions(tree);
    if(controls.length>2048)fail('limit.request.multipart.controls','Multipart representation inspection exceeds 2048 captured controls');
    if(!input.inspect){
        for(const map of [choices,headers,selections])for(const pointer of Object.keys(map))if(!used.has(pointer))fail('request.multipart.choice.stale','Part input '+pointer+' has no emitted position');
        if(usedFiles.size!==files.length)fail('request.multipart.file.stale','A selected file has no emitted instance position');
    }
    return {tree,controls,selectedChecks,input:hash(Buffer.from(input.text)),raw:doc.dataJson(''),partSchemas:selections,files,fileShapes,intentOmissions:[...intentOmissions]};
}

/** A MIME body and a simplified schema are insufficient evidence. Decode the
 * actual emitted bytes, check leaf identity and exact typed values, then run
 * the existing evaluator against the original media/whole/item declarations. */
export async function proveMultipartGeneration(graph:ReferenceGraph,content:Content,input:any,generated:Awaited<ReturnType<typeof multipartGeneration>>){
    const transfers=new MultipartEncoding(graph),at:GraphTarget={...content.definition,kind:'media'};
    const fail=(code:string,message:string,source=at):never=>transfers.failure(code,message,source);
    mediaTypeChoice(input.mediaType,input.wireType);
    const wire=runtimeMediaBytes(input.wire,true);
    const check=(entity:Entity,bytes:Buffer,type:string)=>{
        const parts=mimeParts(bytes,type);
        if(parts.length!==entity.parts.length)fail('request.multipart.identity','Emitted part count differs from typed input');
        entity.parts.forEach((part,index)=>{
            const actual=parts[index],actualType=mimeSingleton(actual.headers,'content-type')??'text/plain';
            mediaTypeChoice(part.contentType,actualType);
            const transfer=mimeSingleton(actual.headers,'content-transfer-encoding')??'binary';
            if(transfer.toLowerCase()!==(part.transfer.encoding??'binary').toLowerCase())fail('request.multipart.identity','The emitted transfer token differs from the captured selection',part.rule);
            for(const name of new Set(part.headers.map(header=>header.name.toLowerCase()))){
                const intended=part.headers.filter(header=>header.name.toLowerCase()===name).map(header=>header.value);
                if(JSON.stringify(actual.headers.get(name)??[])!==JSON.stringify(intended))fail('request.multipart.identity','The emitted Header values differ from the captured input',part.rule);
            }
            const disposition=mimeSingleton(actual.headers,'content-disposition');
            if(part.name!==undefined||part.file!==undefined){
                if(disposition===undefined)fail('request.multipart.identity','An emitted named/file part omitted its disposition',part.rule);
                const parsed=mediaTypes('x/'+disposition,false)[0];
                if(part.name!==undefined&&(parsed.subtype!=='form-data'||parsed.parameters.get('name')!==part.name))fail('request.multipart.identity','The emitted part name differs from its typed position',part.rule);
                if(part.file!==undefined&&input.files[part.file].filename!==undefined){
                    let filename=parsed.parameters.get('filename');
                    if(filename===undefined&&parsed.parameters.has('filename*')){
                        const encoded=parsed.parameters.get('filename*')!;
                        try{if(encoded.toLowerCase().startsWith("utf-8''"))filename=decodeURIComponent(encoded.slice(7));}
                        catch{fail('request.multipart.identity','The emitted filename parameter is malformed',part.rule);}
                    }
                    if(filename!==input.files[part.file].filename)fail('request.multipart.identity','The emitted filename differs from the approved file input',part.rule);
                }
            }
            const payload=decodeMultipartTransfer(actual.bytes,transfer);
            if(part.children)check(part.children,payload.bytes,actualType);
            else if(part.urlencoded){ /* The shared form decoder below proves these values through the original nested schema context. */ }
            else if(part.file!==undefined){
                const identity=input.files[part.file].identity;
                if(typeof identity!=='string'||hash(payload.bytes)!==identity)fail('request.multipart.file.identity','Emitted file bytes differ from the approved capture',part.rule);
            }else if(part.transfer.schemaEncoded){
                if((payload.encoded??payload.bytes.toString('utf8'))!==part.text)fail('request.multipart.identity','The encoded schema string changed during preparation',part.rule);
            }else if(!payload.bytes.equals(runtimeMediaBytes(part.bytes!,true)))fail('request.multipart.identity','The part payload changed during preparation',part.rule);
        });
    };
    check(generated.tree,wire,input.wireType);
    const form={...at,partSchemas:generated.partSchemas,fileShapes:generated.fileShapes,partMediaTypes:input.choices??{}};
    const decoded=decodeRuntimeForm(input.wire,'file:///busyapi-generated-multipart',input.wireType,true,form,'request-body',graph);
    const intended=new SourceDocument(generated.raw,'file:///busyapi-intended-multipart',true,'json');
    const files=new Set<string>(generated.files.map(file=>file.name));
    const octets=new Map<string,string>();
    const omissions=new Set(generated.intentOmissions);
    const collect=(entity:Entity)=>{for(const part of entity.parts){if(part.children)collect(part.children);else if(part.file===undefined&&part.transfer.instanceEncoding==='octets')octets.set(part.pointer,runtimeMediaBytes(part.bytes!,true).toString('latin1'));}};
    collect(generated.tree);
    const equal=(pointer:string):boolean=>{
        if(files.has(pointer))return true;
        if(octets.has(pointer))return decoded.document.dataNode(pointer)?.value===octets.get(pointer);
        const left=intended.dataNode(pointer),right=decoded.document.dataNode(pointer);
        if(!left||!right||left.kind!==right.kind)return false;
        if(left.kind==='number')return intended.dataJson(pointer)===decoded.document.dataJson(pointer);
        if(left.kind==='object'){
            const members=[...left.children.values()].filter(child=>!(omissions.has(child.pointer)&&!decoded.document.dataNode(child.pointer)));
            return members.length===right.children.size&&members.every(child=>equal(child.pointer));
        }
        if(left.kind==='array')return left.children.size===right.children.size&&[...left.children.values()].every(child=>equal(child.pointer));
        return left.value===right.value;
    };
    if(!equal(''))fail('request.multipart.roundtrip','The emitted body does not decode to the intended typed input');
    const runtimeInstances:any[]=[{subject:'request-body',location:input.mediaType,text:input.wire,mediaBase64:true,mediaType:input.wireType,form,
        schema:content.schema,itemSchema:content.itemSchema}];
    const result=await evaluateSchemas({...input,runtimeInstances});
    if(!result.runtimeEvaluations.length||result.runtimeEvaluations.some(value=>!value.complete||!value.valid)||result.runtimeFindings.some(value=>value.severity==='error')){
        const first=result.runtimeFindings.find(value=>value.severity==='error')??result.runtimeFindings[0];
        const source=first?.schema??first?.source??at;
        fail('request.multipart.conformance',first?.message??'Generated multipart does not completely satisfy the original captured declaration',source);
    }
    return {complete:true,valid:true,...(content.formBinding==='multipart-named'&&!content.itemSchema&&
        !(decoded.binaryInstances?.get(decoded.document)?.size)?{instance:decoded.document.dataJson('')}:{})};
}
