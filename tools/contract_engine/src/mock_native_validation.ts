import {MultipartEncoding} from './multipart_encoding';
import {capturedMimeHeaderContent} from './mime_header_content';
import {rawXmlBytes} from './xml_wire';
import {runtimeMediaBytes} from './runtime_media';
import {exampleRepresentation} from './example_representation';
import {parseLinkset} from './linkset';
import {capturedMockResponseMedia} from './mock_projection';
import {encodeRuntimeMedia} from './runtime_media';
import {SourceDocument} from './document';
import {createGraph,type Resource} from './engine';
import {requestOperation} from './execution';
import {authoredMockResponseExample,authoredMockResponseBytes} from './mock_response_examples';
import {CapturedExampleResources,type ExternalExampleResourcePacket} from './external_examples';
import {SourceError,limits} from './document';
import {EngineWorkerClient,record} from './engine_worker_client';
import {mediaTypes} from './media_types';
import {runtimeMediaKind,runtimeFormMedia} from './runtime_media';
import type {RuntimeFormTarget} from './runtime_form';
import type {OperationOccurrence} from './reference_graph';
import {nativeMedia,selectNativeMedia,schemaLocation,sourceLocation,type SchemaLocation,type SourceLocation,type NativeMedia,type NativeRuntimeInstance,type NativeMockCheck,type NativeRuntimeCheck,type NativeRuntimeEvaluation} from './mock_projection';
import {mockResponseProducer,validateMockResponse} from './mock_response_validation';
import {mockParameterProducer,validateMockParameters} from './mock_request_parameters';
import {schemaProducer} from './schema_evaluation';
import {mockSecurityProducer,validateMockSecurity} from './mock_request_security';
import {MockOperationProjection,mockWireMethod,mockMethodProducer} from './mock_operations';
import {maximumMockMethodBytes} from './mock_method_transport';
import {MockSchemaSamples,mockSampleProducer} from './mock_schema_samples';
export type {NativeMockCheck} from './mock_projection';

export type MockCapture={root:string;snapshot:string;resources:Resource[];exampleResources?:readonly ExternalExampleResourcePacket[]};
type BodyDeclaration={required:boolean;source:SourceLocation;content:NativeMedia[]};

export function mockCapture(value:unknown):MockCapture {
    if(!record(value)||typeof value.root!=='string'||typeof value.snapshot!=='string'||!/^[a-f0-9]{64}$/.test(value.snapshot)||!Array.isArray(value.resources)||!value.resources.length||value.resources.length>limits.resources)
        throw new SourceError('mock.capture','Expected one bounded captured native resource graph');
    const resources:Resource[]=value.resources.map(resource=>{
        if(!record(resource)||typeof resource.id!=='string'||typeof resource.text!=='string'||typeof resource.identity!=='string'||!/^[a-f0-9]{64}$/.test(resource.identity)||typeof resource.generation!=='number'||!Number.isSafeInteger(resource.generation)||resource.generation<0||
            resource.aliases!==undefined&&(!Array.isArray(resource.aliases)||!resource.aliases.every(alias=>typeof alias==='string')))
            throw new SourceError('mock.capture','A captured native resource is malformed');
        return {...resource,id:resource.id,text:resource.text,identity:resource.identity,generation:resource.generation,
            ...(Array.isArray(resource.aliases)?{aliases:resource.aliases}: {})};
    });
    if(!resources.some(resource=>resource.id===value.root)||new Set(resources.map(resource=>resource.id)).size!==resources.length)
        throw new SourceError('mock.capture','The captured native root is missing or resource identities repeat');
    const examples=new CapturedExampleResources(value.exampleResources??[]).packets();
    return {root:value.root,snapshot:value.snapshot,resources,...(examples.length?{exampleResources:examples}:{})};
}

/** Native request checks consume the original immutable graph. Prism receives
 * a derived document for its qualified routing/generation role only. */
export class MockNativeValidation {
    private readonly client=new EngineWorkerClient();
    private readonly context:ReturnType<typeof createGraph>;
    private readonly operations=new Map<string,OperationOccurrence>();
    private readonly plans=new Map<string,{operation:OperationOccurrence;description:ReturnType<typeof requestOperation>;body:BodyDeclaration|undefined}>();
    private producer?:{name:string;version:string;configuration:string};
    private operationProjection?:MockOperationProjection;
    private readonly samples:MockSchemaSamples;
    private readonly examples:CapturedExampleResources;

    constructor(private readonly capture:MockCapture) {
        this.context=createGraph(capture);
        this.examples=new CapturedExampleResources(capture.exampleResources??[]);
        this.samples=new MockSchemaSamples(this.context.graph,(instances,signal)=>this.evaluateInstances(instances,signal),capture.snapshot);
        for(const operation of this.context.graph.operations())if(operation.role==='operation') {
            const key=JSON.stringify([operation.path,mockWireMethod(operation)]);
            if(this.operations.has(key))throw new SourceError('mock.operation.ambiguous','The captured mock route has multiple operation owners');
            this.operations.set(key,operation);
        }
    }

    async prepare(output:{id:string;identity:string}):Promise<string> {
        const checked=await this.client.request('evaluateSchemas',this.capture);
        if(checked.snapshot!==this.capture.snapshot||typeof checked.complete!=='boolean'||!Array.isArray(checked.findings)||checked.findings.some(finding=>!record(finding)))
            throw new SourceError('mock.validation.protocol','Native validation returned an unrelated captured graph');
        if(!checked.complete||checked.findings.some(finding=>finding.severity==='error')){
            const finding=checked.findings.find(finding=>finding.severity==='error')??checked.findings[0];
            const target=schemaLocation(finding),node=target&&this.context.docs.get(target.resource)?.dataNode(target.pointer),range=node?.range??[0,0];
            throw new SourceError(checked.complete?'mock.validation.invalid':'mock.validation.unsupported',
                'Native validation could not qualify the captured mock graph'+(record(finding)?': '+finding.code:''),range,!checked.complete?'unsupported':undefined,target&&node?{...target,range:node.range}:undefined);
        }
        if(checked.producer!==schemaProducer.name||checked.producerVersion!==schemaProducer.version||checked.configuration!==schemaProducer.configuration)
            throw new SourceError('mock.validation.revision','The native evaluator revision differs from the captured mock implementation');
        this.producer={name:checked.producer,version:checked.producerVersion,configuration:checked.configuration};
        const result=await this.client.request('deriveBundle',{...this.capture,outputId:output.id});
        if(result.snapshot!==this.capture.snapshot||result.complete!==true||!record(result.output)||result.output.id!==output.id||result.output.identity!==output.identity||typeof result.output.text!=='string')
            throw new SourceError('mock.capture.changed','The child derived document differs from the reviewed captured graph');
        this.operationProjection=new MockOperationProjection(this.context.graph,output.id,result.provenance);
        return result.output.text;
    }

    get identity(){return this.producer;}
    get responseIdentity(){return this.producer&&{...mockResponseProducer,configuration:'response-wire-v5:'+this.producer.configuration};}
    get parameterIdentity(){return this.producer&&{...mockParameterProducer,configuration:'parameter-wire-v6:'+this.producer.configuration};}
    get securityIdentity(){return this.producer&&{...mockSecurityProducer,configuration:'security-wire-v1:'+this.producer.configuration};}
    get generationIdentity(){return this.producer&&{...mockSampleProducer,configuration:'captured-schema-candidates-v4:'+this.producer.configuration};}
    get methodIdentity(){return this.producer&&{...mockMethodProducer,configuration:'method-wire-v1:'+this.producer.configuration};}

    projectedOperations(document:Record<string,unknown>) {
        if(!this.operationProjection)throw new SourceError('mock.validation.protocol','The captured operation projection was not prepared');
        return this.operationProjection.document(document);
    }

    private declaration(value:unknown,operation:OperationOccurrence):BodyDeclaration|undefined {
        if(value===undefined)return;
        if(!record(value)||typeof value.required!=='boolean'||!Array.isArray(value.content))throw new SourceError('mock.validation.protocol','The native body projection is malformed');
        const source=sourceLocation(value.source);if(!source)throw new SourceError('mock.validation.protocol','The native body projection omitted its source');
        const content=nativeMedia(value.content,operation.occurrence);
        return {required:value.required,source,content};
    }

    private plan(path:string,method:string) {
        const key=JSON.stringify([path,method]);
        const cached=this.plans.get(key);if(cached)return cached;
        const operation=this.operations.get(key);
        if(!operation)throw new SourceError('mock.operation.owner','The selected mock route has no captured native owner');
        const description=requestOperation({...this.capture,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence},this.context);
        const plan={operation,description,body:this.declaration(description.requestBody,operation)};
        if(this.plans.size>=128)this.plans.clear();
        this.plans.set(key,plan);return plan;
    }

    qualify(operations:readonly {path:string;method:string}[]):void {
        const covered=new Set(operations.map(operation=>JSON.stringify([operation.path,operation.method])));
        for(const [key,operation]of this.operations)if(!covered.has(key)||mockWireMethod(operation).length>maximumMockMethodBytes||operation.customMethod&&operation.method==='CONNECT') {
            const source=operation.source,node=this.context.docs.get(source.resource)!.dataNode(source.pointer)!;
            const limit=mockWireMethod(operation).length>maximumMockMethodBytes;
            const tunnel=operation.customMethod&&operation.method==='CONNECT';
            throw new SourceError(tunnel?'mock.method.tunnel':limit?'mock.method.limit':'mock.operation.unsupported',
                tunnel?'CONNECT requires a tunnel-capable transport; this mock returns ordinary HTTP responses':
                limit?'The declared method exceeds the mock HTTP parser\'s 16 KiB method budget':'The derived mock routes omit this captured operation',
                node.range,'unsupported',{...source,range:node.range});
        }
    }

    async body(path:string,method:string,bytes:Buffer,contentType:string|undefined,present:boolean,signal:AbortSignal):Promise<NativeMockCheck> {
        const {operation,body:declaration}=this.plan(path,method);
        const source=declaration?.source??{resource:operation.source.resource,pointer:operation.source.pointer,range:this.context.docs.get(operation.source.resource)!.dataNode(operation.source.pointer)!.range};
        const invalid=(code:string,message:string):NativeMockCheck=>({complete:true,valid:false,findings:[{code,message,pointer:'',severity:'error',subject:'request-body',source}]});
        if(!present)return declaration?.required?invalid('runtime.request.body.required','The captured operation requires a request body'):{complete:true,valid:true,findings:[]};
        const actual=contentType??'application/octet-stream';
        let parsed:ReturnType<typeof mediaTypes>;
        try{parsed=mediaTypes(actual,false);}
        catch(error){
            if(!(error instanceof SourceError))throw error;
            return error.kind==='unsupported'?{complete:false,valid:false,findings:[{code:'runtime.request.body.unchecked',kind:'unsupported',severity:'warning',subject:'request-body',pointer:'',source,message:error.message}]}:
                invalid('runtime.request.content-type','The request Content-Type is malformed');
        }
        if(parsed.length!==1)return invalid('runtime.request.content-type','The request must provide one concrete Content-Type');
        // An ignored/absent declaration imposes no schema assertions. Known
        // HTTP media framing still applies, as for schema-free outgoing JSON.
        if(!declaration)return runtimeMediaKind(actual)==='opaque'?{complete:true,valid:true,findings:[]}:
            this.evaluate(bytes,actual,signal);
        const media=selectNativeMedia(declaration.content,actual);
        if(!media)return invalid('runtime.request.content-type','The request Content-Type does not match the captured operation');
        const {schema,itemSchema}=media;
        const form=runtimeFormMedia(actual)?media.formOwner:undefined;
        const mediaOwner=form?undefined:media.mediaOwner;
        if(!schema&&!itemSchema&&!form&&!mediaOwner&&runtimeMediaKind(actual)==='opaque')return {complete:true,valid:true,findings:[]};
        return this.evaluate(bytes,actual,signal,schema,itemSchema,form,mediaOwner);
    }

    isAdditional(path:string,method:string):boolean {
        return this.plan(path,method).operation.customMethod===true;
    }

    async response(path:string,method:string,status:number,headers:unknown,bytes:Buffer,signal:AbortSignal):Promise<NativeMockCheck> {
        const {description}=this.plan(path,method);
        return validateMockResponse(this.context.graph,description,description.operation.method,status,headers,bytes,instances=>this.evaluateInstances(instances,signal));
    }

    generatedResponse(path:string,method:string,status:string,actual:string,dynamic:boolean,signal:AbortSignal):Promise<string|undefined> {
        return this.samples.response(this.plan(path,method).description,status,actual,dynamic,signal);
    }

    async responseHeaders(path:string,method:string,status:number,headers:Record<string,unknown>,signal:AbortSignal,declarations?:any[]):Promise<Record<string,unknown>> {
        const description=this.plan(path,method).description;
        const response=description.responses.find(item=>item.status===String(status))??description.responses.find(item=>item.status===String(status)[0]+'XX')??description.responses.find(item=>item.status==='default');
        const output={...headers};
        for(const header of declarations??response?.headers??[]){
            if(!Array.isArray(header.content)||header.content.length!==1)continue;
            const media=header.content[0],kind=runtimeMediaKind(media.mediaType);
            if(!['json','xml','linkset','linkset-json'].includes(kind))continue;
            if(header.name.toLowerCase()==='link'&&kind==='linkset-json')throw this.generationFailure(path,method,'runtime.linkset.header','HTTP Link content must declare application/linkset');
            let source=header.definition??header.source,owner=this.context.docs.get(source.resource)?.dataNode(source.pointer)?.value;
            const mediaSource=media.definition??media.source;
            if(!Object.hasOwn(owner??{},'example')&&!owner?.examples&&mediaSource){const value=this.context.docs.get(mediaSource.resource)?.dataNode(mediaSource.pointer)?.value;if(value){source=mediaSource;owner=value;}}
            let raw:string|undefined,serialized=false,external=false;
            if(owner&&Object.hasOwn(owner,'example')){
                const document=this.context.docs.get(source.resource)!;
                serialized=exampleRepresentation('example',owner.example,media.mediaType)==='serialized';
                raw=serialized?owner.example:document.dataJson(source.pointer+'/example');
            }
            if(raw===undefined&&owner?.examples&&typeof owner.examples==='object'){
                const first=Object.keys(owner.examples)[0];
                if(first!==undefined){
                    let at={resource:source.resource,pointer:source.pointer+'/examples/'+first.replace(/~/g,'~0').replace(/\//g,'~1')};
                    const seen=new Set<string>();
                    for(let depth=0;depth<128;depth++){
                        const key=at.resource+'#'+at.pointer;if(seen.has(key))throw this.generationFailure(path,method,'mock.header.example','Header example reference cycle');seen.add(key);
                        const value=this.context.docs.get(at.resource)?.dataNode(at.pointer)?.value;
                        if(typeof value?.$ref==='string'){
                            const edge=this.context.graph.referenceAs(at.resource,at.pointer,'$ref','example');
                            if(edge?.resolution!=='resolved')throw this.generationFailure(path,method,'mock.header.example','Header example reference is unresolved');
                            at={resource:edge.targetResource!,pointer:edge.targetPointer!};continue;
                        }
                        const family=this.context.graph.scope(at.resource,at.pointer).family;
                        const field=family==='3.2'&&Object.hasOwn(value??{},'dataValue')?'dataValue':Object.hasOwn(value??{},'value')?'value':family==='3.2'&&Object.hasOwn(value??{},'serializedValue')?'serializedValue':undefined;
                        if(field){serialized=exampleRepresentation(field,value[field],media.mediaType)==='serialized';raw=serialized?value[field]:this.context.docs.get(at.resource)!.dataJson(at.pointer+'/'+field);}
                        else if(typeof value?.externalValue==='string'){
                            const bytes=this.examples.read(this.context.graph,at.resource,at.pointer+'/externalValue');
                            raw=Buffer.from(bytes.base64,'base64').toString('latin1');serialized=true;external=true;
                        }
                        break;
                    }
                }
            }
            if(raw===undefined&&Array.isArray(media.examples)&&media.examples.length){const example=media.examples[0];raw=example.raw;serialized=example.representation==='serialized';}
            if(raw===undefined&&media.schema)raw=await this.samples.value(media.schema,signal,media.mediaType);
            if(raw===undefined)continue;
            if(serialized&&kind==='linkset')raw=parseLinkset(raw,'urn:busyapi:mock-header').dataJson('');
            else if(serialized){
                if(!external)raw=(kind==='xml'?rawXmlBytes(raw,mediaTypes(media.mediaType,false)[0].parameters.get('charset')):runtimeMediaBytes(raw,false)).toString('latin1');
                if(/[\x00-\x08\x0a-\x1f\x7f]/.test(raw))throw this.generationFailure(path,method,'runtime.header.syntax','Serialized mock Header contains prohibited line breaks');
                for(const key of Object.keys(output))if(key.toLowerCase()===header.name.toLowerCase())delete output[key];
                output[header.name]=raw;continue;
            }
            const result=await this.client.request('evaluateSchemas',{...this.capture,mediaPreparations:[{text:raw,mediaType:media.mediaType,schema:media.schema,header:true,direction:'response'}]},signal);
            if(result.snapshot!==this.capture.snapshot||result.producer!==this.producer?.name||result.producerVersion!==this.producer?.version||result.configuration!==this.producer?.configuration||!Array.isArray(result.mediaPreparations)||!record(result.mediaPreparations[0])||typeof result.mediaPreparations[0].base64!=='string')throw new SourceError('mock.validation.protocol','Header materialization returned unrelated data');
            const prepared=result.mediaPreparations[0],bytes=Buffer.from(prepared.base64,'base64');
            if(result.mediaPreparations.length!==1||prepared.complete!==true||prepared.valid!==true||prepared.mediaType!==media.mediaType||bytes.toString('base64')!==prepared.base64||bytes.length!==prepared.byteLength)throw new SourceError('mock.validation.protocol','Header materialization omitted its byte proof');
            const wire=bytes.toString('latin1');
            if(/[\x00-\x08\x0a-\x1f\x7f]/.test(wire))throw this.generationFailure(path,method,'runtime.header.syntax','Generated mock Header is not HTTP-compatible');
            for(const key of Object.keys(output))if(key.toLowerCase()===header.name.toLowerCase())delete output[key];
            output[header.name]=wire;
        }
        return output;
    }

    private readonly wireMediaTypes=new WeakMap<Buffer,string>();
    responseMediaType(bytes:Buffer):string|undefined {return this.wireMediaTypes.get(bytes);}

    private async multipartResponse(path:string,method:string,status:string,actual:string,raw:string,signal?:AbortSignal):Promise<Buffer> {
        if(!signal)throw new SourceError('mock.multipart.cancel','Multipart response preparation requires its request cancellation owner');
        const operation=this.plan(path,method).description.operation,source=operation.source;
        const input={...this.capture,resource:source.resource,pointer:source.pointer,occurrence:operation.occurrence,status,mediaType:actual,text:raw};
        const check=(result:any)=>{
            if(result.version!==1||result.snapshot!==this.capture.snapshot||result.identity!==this.plan(path,method).description.identity||result.producer!==this.producer?.name||result.producerVersion!==this.producer?.version||result.configuration!==this.producer?.configuration)throw new SourceError('mock.validation.protocol','Multipart response preparation returned unrelated producer data');
        };
        const projected=await this.client.request('mockMultipartBytes',{...input,inspect:true},signal);check(projected);
        const headers:Record<string,any[]>={},transfers=new MultipartEncoding(this.context.graph),capture=capturedMimeHeaderContent(this.context.graph,transfers);
        const visit=async(entity:any,depth=0)=>{
            if(depth>8||!Array.isArray(entity?.parts))throw new SourceError('mock.validation.protocol','Malformed captured mock part tree');
            for(const part of entity.parts){
                const fields:any[]=[],declarations:any[]=[],rule=part.rule;
                const authored=this.context.docs.get(rule.resource)?.dataNode(rule.pointer)?.value;
                const formData=mediaTypes(entity.contentType,false)[0].subtype==='form-data';
                for(const name of Object.keys(authored?.headers??{})){
                    const lower=name.toLowerCase();
                    if(lower==='content-type'||lower==='content-transfer-encoding'||lower==='content-disposition'&&!part.allowDisposition||formData)continue;
                    const at=transfers.follow({...rule,pointer:rule.pointer+'/headers/'+name.replace(/~/g,'~0').replace(/\//g,'~1'),kind:'header'},'header');
                    const value=this.context.docs.get(at.resource)?.dataNode(at.pointer)?.value;
                    if(value?.content){const selected=capture(at);declarations.push({name,definition:at,source:at,content:[{mediaType:selected.type,definition:selected.captured.source,schema:selected.captured.schema}]});}
                    else if(value?.schema){
                        const sample=await this.samples.value({...at,pointer:at.pointer+'/schema'},signal);
                        if(sample!==undefined){const document=new SourceDocument(sample,'urn:busyapi:mock-part-header',true,'json');if(['string','number','boolean','null'].includes(document.root.kind))fields.push({name,value:document.root.kind==='string'?document.root.value:document.dataJson('')});}
                    }
                }
                const prepared=await this.responseHeaders(path,method,Number(status),{},signal,declarations);
                fields.push(...Object.entries(prepared).map(([name,value])=>({name,value})));headers[part.pointer]=fields;
                if(part.children)await visit(part.children,depth+1);
            }
        };await visit(projected.tree);
        const result=await this.client.request('mockMultipartBytes',{...input,headers},signal);check(result);
        if(typeof result.base64!=='string'||typeof result.mediaType!=='string'||result.proof?.complete!==true||result.proof?.valid!==true)throw new SourceError('mock.validation.protocol','Multipart response omitted its actual wire proof');
        const bytes=Buffer.from(result.base64,'base64');if(bytes.toString('base64')!==result.base64||bytes.length!==result.byteLength)throw new SourceError('mock.validation.protocol','Multipart response byte identity is malformed');
        this.wireMediaTypes.set(bytes,result.mediaType);return bytes;
    }

    async responseBytes(path:string,method:string,status:string,actual:string,raw:string,signal?:AbortSignal):Promise<Buffer> {
        if(actual.split(';')[0].trim().toLowerCase()==='application/x-www-form-urlencoded'){
            const {operation}=this.plan(path,method).description;
            const result=await this.client.request('mockFormBytes',{...this.capture,resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence,status,mediaType:actual,text:raw},signal);
            if(result.snapshot!==this.capture.snapshot||result.identity!==this.plan(path,method).description.identity||result.producer!==this.producer?.name||result.producerVersion!==this.producer?.version||result.configuration!==this.producer?.configuration||typeof result.base64!=='string'||result.proof?.complete!==true||result.proof?.valid!==true)throw new SourceError('mock.validation.protocol','URL-form preparation returned unrelated data');
            const bytes=Buffer.from(result.base64,'base64');if(bytes.toString('base64')!==result.base64||bytes.length!==result.byteLength)throw new SourceError('mock.validation.protocol','URL-form byte identity is malformed');return bytes;
        }
        if(actual.split(';')[0].trim().toLowerCase().startsWith('multipart/'))return this.multipartResponse(path,method,status,actual,raw,signal);
        const media=capturedMockResponseMedia(this.plan(path,method).description,status,actual),schema=media&&schemaLocation(media.schema);
        const result=await this.client.request('evaluateSchemas',{...this.capture,mediaPreparations:[{text:raw,mediaType:actual,schema,direction:'response'}]},signal);
        if(result.producer!==this.producer?.name||result.producerVersion!==this.producer?.version||result.configuration!==this.producer?.configuration||result.snapshot!==this.capture.snapshot||!Array.isArray(result.mediaPreparations)||!record(result.mediaPreparations[0])||typeof result.mediaPreparations[0].base64!=='string')throw new SourceError('mock.validation.protocol','Media preparation returned unrelated data');
        const prepared=result.mediaPreparations[0],bytes=Buffer.from(prepared.base64,'base64');
        if(result.mediaPreparations.length!==1||prepared.complete!==true||prepared.valid!==true||prepared.mediaType!==actual||bytes.toString('base64')!==prepared.base64||bytes.length!==prepared.byteLength)throw new SourceError('mock.validation.protocol','Media preparation omitted its byte proof');
        return bytes;
    }

    authoredResponse(path:string,method:string,status:string,actual:string,keys:readonly string[],signal:AbortSignal):string|undefined {
        if(signal.aborted)throw new SourceError('cancelled','Mock example selection was cancelled');
        return authoredMockResponseExample(this.plan(path,method).description,status,actual,keys);
    }

    authoredResponseBytes(path:string,method:string,status:string,actual:string,keys:readonly string[],signal:AbortSignal):Buffer|undefined {
        if(signal.aborted)throw new SourceError('cancelled','Mock example selection was cancelled');
        return authoredMockResponseBytes(this.plan(path,method).description,status,actual,keys,this.context.graph,this.examples);
    }

    generationFailure(path:string,method:string,code:string,message:string):SourceError {
        const source=this.operationSource(path,method);
        return new SourceError(code,message,source.range,'unsupported',source);
    }

    operationSource(path:string,method:string):SourceLocation {
        const {operation}=this.plan(path,method),source=operation.source;
        const range=this.context.docs.get(source.resource)!.dataNode(source.pointer)!.range;
        return {resource:source.resource,pointer:source.pointer,range};
    }

    async parameters(template:string,method:string,path:string,query:string,headers:Readonly<Record<string,string>>,signal:AbortSignal,rawHeaders?:readonly string[]):Promise<NativeMockCheck> {
        const {description}=this.plan(template,method);
        const lines=rawHeaders===undefined?undefined:new Map<string,string[]>();
        if(rawHeaders)for(let index=0;index<rawHeaders.length;index+=2){
            const name=rawHeaders[index].toLowerCase(),values=lines!.get(name)??[];
            values.push(rawHeaders[index+1]);lines!.set(name,values);
        }
        return validateMockParameters(this.context.graph,description,template,path,query,headers,instances=>this.evaluateInstances(instances,signal),undefined,undefined,'octets',lines);
    }

    security(template:string,method:string,query:string,rawHeaders:readonly string[],signal:AbortSignal):NativeMockCheck {
        const {description}=this.plan(template,method);
        const checked=validateMockSecurity(description.security,query,rawHeaders,signal);
        return {...checked,findings:checked.findings.map(finding=>({...finding,
            producer:mockSecurityProducer.name,producerVersion:mockSecurityProducer.version,
            source:record(finding.source)?{...finding.source,snapshot:this.capture.snapshot}:finding.source,
            ...(record(finding.definition)?{definition:{...finding.definition,snapshot:this.capture.snapshot}}:{}),
        }))};
    }

    private async evaluate(bytes:Buffer,actual:string,signal:AbortSignal,schema?:SchemaLocation,itemSchema?:SchemaLocation,form?:RuntimeFormTarget,media?:SchemaLocation):Promise<NativeMockCheck> {
        return this.evaluateInstances([{
            subject:'request-body',location:actual,text:bytes.toString('base64'),mediaType:actual,mediaBase64:true,
            ...(schema?{schema}:{}),...(itemSchema?{itemSchema}:{}),...(form?{form}:{}),...(media?{media}:{})}],signal);
    }

    private async evaluateInstances(runtimeInstances:NativeRuntimeInstance[],signal:AbortSignal):Promise<NativeRuntimeCheck> {
        const result=await this.client.request('evaluateSchemas',{...this.capture,runtimeInstances},signal);
        if(result.snapshot!==this.capture.snapshot||result.producer!==this.producer?.name||result.producerVersion!==this.producer?.version||result.configuration!==this.producer?.configuration||typeof result.complete!=='boolean'||!Array.isArray(result.runtimeEvaluations)||!Array.isArray(result.runtimeFindings))
            throw new SourceError('mock.validation.protocol','Native validation returned an unrelated runtime result');
        const evaluations:NativeRuntimeEvaluation[]=[],findings:Record<string,unknown>[]=[];
        for(const value of result.runtimeFindings){if(!record(value)||typeof value.code!=='string'||typeof value.message!=='string')throw new SourceError('mock.validation.protocol','Native validation returned a malformed finding');findings.push(value);}
        for(const value of result.runtimeEvaluations){
            if(!record(value)||typeof value.complete!=='boolean'||typeof value.valid!=='boolean'||typeof value.subject!=='string'||typeof value.location!=='string')throw new SourceError('mock.validation.protocol','Native validation returned a malformed evaluation');
            if(value.chosen!==undefined&&(typeof value.chosen!=='number'||!Number.isSafeInteger(value.chosen)||value.chosen<0||value.chosen>255))
                throw new SourceError('mock.validation.protocol','Native validation returned an invalid selected-candidate index');
            evaluations.push({subject:value.subject,location:value.location,complete:value.complete,valid:value.valid,
                ...(typeof value.chosen==='number'?{chosen:value.chosen}:{}),
                ...(typeof value.modeledData==='string'&&Buffer.byteLength(value.modeledData)<=1024*1024?{modeledData:value.modeledData}:{})});
        }
        const complete=result.complete&&evaluations.length>0&&evaluations.every(value=>value.complete===true);
        return {complete,valid:complete&&evaluations.every(value=>value.valid===true),findings,evaluations};
    }

    close(){return this.client.close();}
}
