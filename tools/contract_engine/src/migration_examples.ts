import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import {SourceError} from './document';
import {CapturedExampleResources,ExternalExampleError,externalExampleRequests,
    type ExternalExampleResourcePacket} from './external_examples';
import {documentUriBase,resolveUri,type ReferenceGraph,type GraphScope} from './reference_graph';
import {SourcePlan,type SourceLocation as PlannedLocation} from './source_plan';
import {runtimeMediaKind} from './runtime_media';
import {declaredPlainTextBytes} from './text_encoding';
import {mediaTypes} from './media_types';
import {rawXmlBytes} from './xml_wire';
import {prepareModeledMedia} from './modeled_media';
import {isNativeFamily} from './specification';

type CapturedBytes=ReturnType<CapturedExampleResources['read']>;
type SourceLocation=PlannedLocation&Readonly<{range:[number,number]}>;
type CapturedOwner=Readonly<{source:SourceLocation;namespace:string;scope:GraphScope}>;
type Binding=CapturedOwner&Readonly<{state:'available';bytes:CapturedBytes}>;
type Capture=Binding|(CapturedOwner&Readonly<{state:'unavailable';code:string;message:string}>);
type Occurrence=Readonly<{source:SourceLocation;destination:PlannedLocation}>;
export type MigrationExampleCopy=Readonly<{
    path:string;id:string;base64:string;identity:string;byteLength:number;
    source:Readonly<{resource:string;identity:string;generation:number}>;
    occurrences:readonly Occurrence[];
}>;
type Relocation=Readonly<{
    sources:ReadonlyMap<string,SourcePlan>;
    outputs:readonly MigrationExampleCopy[];
    resources:readonly ExternalExampleResourcePacket[];
    mappings:ReadonlyMap<string,string>;
    inlined:readonly MigrationInlineExampleProof[];
}>;
export type MigrationInlineExampleProof=Readonly<{location:PlannedLocation;media:string;source:SourceLocation;base64:string}>;
const key=(location:PlannedLocation)=>JSON.stringify([location.resource,location.pointer]);
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const parent=(pointer:string)=>pointer.slice(0,pointer.lastIndexOf('/'));
export function migrationExampleBytes(raw:string,media:string):Buffer {
    const kind=runtimeMediaKind(media),charset=mediaTypes(media)[0].parameters.get('charset');
    return kind==='text'?declaredPlainTextBytes(raw,charset):kind==='xml'?rawXmlBytes(raw,charset):Buffer.from(raw,'utf8');
}

/** Conversion uses the same original-schema evaluator and codec as Request.
 * Reuse this captured graph, including retrieval aliases and secondary roles;
 * reconstructing it from document text would lose those authorizations. */
export async function migrationModeledExampleBytes(graph:ReferenceGraph,media:string,text:string,
    schema?:PlannedLocation,header=false,packets:readonly ExternalExampleResourcePacket[]=[],itemSchema?:PlannedLocation):Promise<Buffer> {
    const family=graph.family;if(!isNativeFamily(family))throw new SourceError('migration.example.family','The captured example has no native family',[0,0],'unsupported');
    const resources=[...graph.docs.values()].map(doc=>({id:doc.id,text:doc.text,generation:0}));
    const input={root:graph.root,resources,snapshot:'migration-example',exampleResources:packets},
        context={docs:graph.docs,graph,family,exampleResources:new CapturedExampleResources([...packets])};
    const bytes=(await prepareModeledMedia(input,text,media,schema,header,undefined,context)).bytes;
    if(itemSchema){
        // Whole-content correspondence does not discharge itemSchema. Retain
        // its original captured owner through the ordinary runtime evaluator;
        // no converted array schema supplies this source-side evidence.
        const {evaluateSchemas}=await import('./schema_evaluation');
        const checked=await evaluateSchemas({...input,runtimeInstances:[{subject:'authored-example',location:'modeled-example',
            text:bytes.toString('base64'),mediaType:media,mediaBase64:true,schema,itemSchema}]},undefined,context);
        const evaluations=checked.runtimeEvaluations??[];
        if(checked.complete!==true||!evaluations.length||evaluations.some(value=>value.complete!==true||value.valid!==true)||
            checked.runtimeFindings?.length)
            throw new SourceError('migration.example.item-conformance','The encoded example has no complete proof against its original itemSchema ('+
                (checked.runtimeFindings?.[0]?.code??evaluations.find(value=>value.complete!==true||value.valid!==true)?.reason??'runtime.evaluation.incomplete')+')',[0,0],'unsupported',
                {...itemSchema,range:graph.docs.get(itemSchema.resource)!.dataNode(itemSchema.pointer)!.range});
    }
    return bytes;
}
const captureIdentity=(capture:Capture)=>capture.state==='available'?
    JSON.stringify([capture.bytes.id,capture.bytes.identity,capture.bytes.generation]):JSON.stringify([capture.code,capture.message]);

function nativeExampleLocators(graphs:readonly ReferenceGraph[]) {
    type Locator=Readonly<{request:ReturnType<typeof externalExampleRequests>[number];graph:ReferenceGraph;scope:GraphScope}>;
    const values=new Map<string,Locator>();let work=0;
    for(const graph of graphs)for(const request of externalExampleRequests(graph)){
        if(++work>200000)throw new SourceError('limit.migration.examples','Example ownership exceeds 200000 entry locators');
        const scope=graph.scopeAs(request.resource,parent(request.pointer),'example');
        const range=graph.docs.get(request.resource)!.dataNode(request.pointer)!.range;
        if(!scope)throw new SourceError('migration.example.context','The captured example has no native material owner',range,'unsupported',{...request,range});
        const id=key(request),previous=values.get(id);
        if(previous&&documentUriBase(previous.graph,previous.scope)!==documentUriBase(graph,scope))
            throw new SourceError('migration.example.shared-context','This locator still needs independently owned document bases',range,'unsupported',{...request,range});
        values.set(id,{request,graph,scope});
    }
    return values;
}

/** OAS Example Objects retain media/schema ownership at their occurrences.
 * Payload bytes stay opaque: acquisition and identity checks belong to the
 * captured resource owner, and interpretation stays in the media evaluator.
 * Migration publishes exact independent copies, never another payload loader. */
export class MigrationExamples {
    private readonly bindings=new Map<string,Capture>();
    private readonly inlined=new Map<string,Set<string>>();
    private readonly namespaces:readonly string[];
    constructor(graphs:readonly ReferenceGraph[],packets:readonly ExternalExampleResourcePacket[]=[]) {
        this.namespaces=[...new Set(graphs.map(graph=>graph.root))];
        const captured=new CapturedExampleResources(packets);
        for(const graph of graphs)for(const request of externalExampleRequests(graph)) {
            const source={resource:request.resource,pointer:request.pointer,
                range:graph.docs.get(request.resource)!.dataNode(request.pointer)!.range};
            const scope=graph.scopeAs(source.resource,parent(source.pointer),'example');
            if(!scope)throw new SourceError('migration.example.context','The source locator has no captured Example Object owner',source.range,'unsupported',source);
            const owner={source,namespace:graph.root,scope};
            let binding:Capture;
            try {binding={...owner,state:'available',bytes:captured.read(graph,source.resource,source.pointer)};}
            catch(error) {
                if(!(error instanceof ExternalExampleError))throw error;
                binding={...owner,state:'unavailable',code:error.code,message:error.message};
            }
            const identity=JSON.stringify([graph.root,source.resource,source.pointer]),previous=this.bindings.get(identity);
            if(previous&&captureIdentity(previous)!==captureIdentity(binding))binding={...owner,state:'unavailable',
                code:'migration.example.shared-context',message:'This shared external example selects different captured resources; occurrence specialization is required'};
            this.bindings.set(identity,binding);
        }
    }

    /** Expose only the already approved capture. Structural converters cannot
     * acquire bytes or substitute a URI/string for their wire representation. */
    inlineCapture(location:PlannedLocation,namespace:string):Readonly<{base64:string}>|undefined {
        const binding=this.bindings.get(JSON.stringify([namespace,location.resource,location.pointer]));
        return binding?.state==='available'?{base64:binding.bytes.base64}:undefined;
    }
    materialized(location:PlannedLocation,namespace:string,media:string):void {
        const capture=this.inlineCapture(location,namespace);if(!capture)return;
        for(const namespace of this.namespaces){
            const key=JSON.stringify([namespace,location.resource,location.pointer]),binding=this.bindings.get(key);
            if(binding?.state!=='available'||binding.bytes.base64!==capture.base64)continue;
            const types=this.inlined.get(key)??new Set<string>();types.add(media);this.inlined.set(key,types);
        }
    }
    hasMaterialization(location:PlannedLocation,namespace:string):boolean {return this.inlined.has(JSON.stringify([namespace,location.resource,location.pointer]));}

    relocate(graph:ReferenceGraph,mapped:(source:PlannedLocation,namespace:string,scope:GraphScope)=>readonly PlannedLocation[],
        destination:string,documentPaths:Iterable<string>,contexts:readonly ReferenceGraph[]=[graph],retired:ReadonlySet<string>=new Set()):Relocation {
        const expected=new Map<string,Binding>(),inlined:MigrationInlineExampleProof[]=[];
        const locators=nativeExampleLocators(contexts),nativeLocators=new Set(locators.keys());
        let inlineWork=0;
        for(const binding of this.bindings.values()){
          const locations=mapped(binding.source,binding.namespace,binding.scope),surviving=locations.filter(location=>nativeLocators.has(key(location)));
          const materialized=this.hasMaterialization(binding.source,binding.namespace);
          if(materialized){
            if(binding.state!=='available')throw new SourceError('migration.example.capture',binding.message,binding.source.range,'unsupported',binding.source);
            const proofs:MigrationInlineExampleProof[]=[];
            for(const location of locations){
                if(++inlineWork>200000)throw new SourceError('limit.migration.examples','Inline example ownership exceeds 200000 captured locations',binding.source.range,'unsupported',binding.source);
                const parent=location.pointer.slice(0,location.pointer.lastIndexOf('/'));
                const response=parent.slice(0,parent.lastIndexOf('/'));
                const schema=graph.scopeAs(location.resource,parent,'schema');
                const media=location.pointer.endsWith('/example')&&schema?
                    [...this.inlined.get(JSON.stringify([binding.namespace,binding.source.resource,binding.source.pointer]))??[]].find(media=>{
                        const doc=graph.docs.get(location.resource)!,node=doc.dataNode(location.pointer)!;
                        const raw=runtimeMediaKind(media)==='json'?doc.dataJson(location.pointer):node.value;
                        try{return typeof raw==='string'&&migrationExampleBytes(raw,media).toString('base64')===binding.bytes.base64;}catch(error){if(!(error instanceof SourceError))throw error;return false;}
                    }):
                    parent.endsWith('/examples')&&graph.scopeAs(location.resource,response,'response')?
                        location.pointer.slice(parent.length+1).replaceAll('~1','/').replaceAll('~0','~'):undefined;
                if(media!==undefined)proofs.push({location,media,source:binding.source,base64:binding.bytes.base64});
            }
            if(!proofs.length)throw new SourceError('migration.example.inline-owner','The captured bytes lost their materialized standard example owner',binding.source.range,'unsupported',binding.source);
            proveInlinedMigrationExamples(graph,proofs);inlined.push(...proofs);
          }
          if(!surviving.length&&retired.has(key(binding.source)))continue;
          if(locations.length&&!surviving.length&&!materialized)throw new SourceError('migration.example.context',
              'A surviving external example lost its native Example Object context',binding.source.range,'unsupported',binding.source);
          for(const location of surviving) {
            // Source validation already guards required interpretation. An
            // explicit reviewed omission can retire an ignored declaration;
            // only surviving locators need byte copies in the target.
            if(binding.state==='unavailable')throw new SourceError(binding.code,binding.message,
                binding.source.range,'unsupported',binding.source);
            const previous=expected.get(key(location));
            if(previous&&previous.bytes.id!==binding.bytes.id)
                throw new SourceError('migration.example.ownership','Different source examples share one target locator',
                    binding.source.range,'unsupported',binding.source);
            expected.set(key(location),binding);
          }
        }
        const sources=new Map<string,SourcePlan>(),mappings=new Map<string,string>();
        const copies=new Map<string,{output:MigrationExampleCopy;aliases:Set<string>;occurrences:Occurrence[]}>();
        const paths=new Set([...documentPaths,'busyapi.yaml','migration.json']);
        const visited=new Set<string>();
        let edits=0,work=0;
        for(const {request,scope,graph}of locators.values()) {
            const location={resource:request.resource,pointer:request.pointer},binding=expected.get(key(location));
            if(!binding)throw new SourceError('migration.example.provenance',
                'The target external example has no captured source occurrence',undefined,'unsupported',
                {...location,range:graph.docs.get(location.resource)!.dataNode(location.pointer)!.range});
            visited.add(key(location));
            let copy=copies.get(binding.bytes.id);
            if(!copy) {
                const path='examples/'+digest(binding.bytes.id).slice(0,24)+'.bin',id=new URL(path,destination).href;
                if(paths.has(path)||graph.identities.has(id))throw new SourceError('migration.destination.collision',
                    'An external example copy collides with another output resource',binding.source.range,'unsupported',binding.source);
                paths.add(path);
                const occurrences:Occurrence[]=[];
                const output:MigrationExampleCopy={path,id,base64:binding.bytes.base64,identity:binding.bytes.identity,
                    byteLength:binding.bytes.byteLength,source:{resource:binding.bytes.id,identity:binding.bytes.identity,
                        generation:binding.bytes.generation},occurrences};
                copy={output,occurrences,aliases:new Set()};copies.set(binding.bytes.id,copy);
            }
            if(graph.literalContainer(scope.resource,scope.pointer)!==undefined)
                throw new SourceError('migration.example.literal-context',
                    'This example locator also belongs to literal data; separate source ownership is required',binding.source.range,'unsupported',binding.source);
            const physical=new URL(location.resource),target=new URL(copy.output.id);
            if(physical.protocol!==target.protocol||physical.host!==target.host)
                throw new SourceError('migration.example.destination','The copied payload needs a common output retrieval boundary',binding.source.range,'unsupported',binding.source);
            let value=posix.relative(posix.dirname(physical.pathname),target.pathname);
            if(value.split('/')[0].includes(':'))value='./'+value;
            const uri=resolveUri(value,documentUriBase(graph,scope)).href;
            // A retained $self/document identity needs a local mapping. Its
            // relative locator and mapping path survive moving the output
            // directory; transient source aliases are never copied here.
            const previous=mappings.get(uri);
            if(graph.identities.has(uri)||previous!==undefined&&previous!==copy.output.path)
                throw new SourceError('migration.example.identity','A copied example URI conflicts with an existing resource identity',binding.source.range,'unsupported',binding.source);
            // Ordinary retrieval mappings also retain their URI after a move.
            // Include the payload route even when it currently equals its
            // physical URI, so those document bases can still acquire it.
            mappings.set(uri,copy.output.path);copy.aliases.add(uri);
            let source=sources.get(location.resource);
            if(!source){source=new SourcePlan(graph.docs.get(location.resource)!);sources.set(location.resource,source);}
            if(source.doc.dataNode(location.pointer)?.value!==value) {
                if(++edits>4096||(work+=source.doc.text.length*2)>128*1024*1024)
                    throw new SourceError('limit.migration.examples','External example relocation exceeds its bounded CST edit work',binding.source.range,'unsupported',binding.source);
                source.set(location.pointer,value);
            }
            copy.occurrences.push({source:binding.source,destination:location});
        }
        for(const [coordinate,binding]of expected)if(!visited.has(coordinate))
            throw new SourceError('migration.example.context','A surviving external example lost its native Example Object context',binding.source.range,'unsupported',binding.source);
        const ordered=[...copies.values()].sort((a,b)=>a.output.path.localeCompare(b.output.path));
        return {sources,mappings,inlined,outputs:ordered.map(copy=>copy.output),resources:ordered.map((copy):ExternalExampleResourcePacket=>({
            version:1,id:copy.output.id,identity:copy.output.identity,generation:0,state:'available',
            aliases:[...copy.aliases].sort(),base64:copy.output.base64,byteLength:copy.output.byteLength}))};
    }
}

/** Standard literal materialization has no external locator to reopen. Prove
 * its exact entity bytes in the final and cold graphs using the same capture. */
export function proveInlinedMigrationExamples(graph:ReferenceGraph,proofs:readonly MigrationInlineExampleProof[]):void {
    for(const proof of proofs){
        const doc=graph.docs.get(proof.location.resource);if(!doc)continue;
        const node=doc.dataNode(proof.location.pointer);
        const raw=node&&(runtimeMediaKind(proof.media)==='json'?doc.dataJson(proof.location.pointer):node.value);
        if(typeof raw!=='string'||migrationExampleBytes(raw,proof.media).toString('base64')!==proof.base64)
            throw new SourceError('migration.example.inline-bytes','The delivered example does not reproduce its exact captured entity bytes',proof.source.range,'unsupported',proof.source);
    }
}

/** Prove acquisition using only the delivered byte set and its local mappings.
 * Cold contract resolution alone does not discover opaque external examples. */
export function proveMigrationExamples(graph:ReferenceGraph,outputs:readonly MigrationExampleCopy[],
    packets:readonly ExternalExampleResourcePacket[]):void {
    const captured=new CapturedExampleResources(packets),expected=new Map<string,MigrationExampleCopy>();
    for(const output of outputs)for(const occurrence of output.occurrences)expected.set(key(occurrence.destination),output);
    for(const request of externalExampleRequests(graph)) {
        const location={resource:request.resource,pointer:request.pointer},output=expected.get(key(location));
        let bytes:CapturedBytes;
        try {bytes=captured.read(graph,location.resource,location.pointer);}
        catch(error) {
            if(!(error instanceof ExternalExampleError))throw error;
            const source={...location,range:graph.docs.get(location.resource)!.dataNode(location.pointer)!.range};
            throw new SourceError('migration.example.cold-reopen',error.message,source.range,'unsupported',source);
        }
        if(!output||bytes.id!==output.id||bytes.identity!==output.identity||bytes.base64!==output.base64)
            throw new SourceError('migration.example.cold-reopen','The delivered example locator does not select its exact reviewed bytes',undefined,'unsupported',
                {...location,range:graph.docs.get(location.resource)!.dataNode(location.pointer)!.range});
    }
}
