import {escape,SourceError,SourceDocument} from './document';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import {SourcePlan,sourceValueIdentity,type SourceLocation} from './source_plan';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {schemaExampleCandidates} from './schema_examples';
import {runtimeMediaKind,decodeRuntimeMedia} from './runtime_media';
import {exampleRepresentation} from './example_representation';
import {retainFormHeaderOwners} from './migration_media_schema';
import {migrationExampleBytes} from './migration_examples';

type Value=Readonly<{source:SourcePlan;pointer:string;raw?:string;external?:SourceLocation;bytes?:string;literal?:boolean;equivalents?:readonly Value[]}>;
const literalWireIdentity=(value:Value,media:string):string=>migrationExampleBytes(
    exampleRepresentation('value',value.source.doc.dataNode(value.pointer)!.value,media)==='serialized'
        ?value.source.doc.dataNode(value.pointer)!.value:value.raw??value.source.doc.dataJson(value.pointer),media).toString('base64');
const wireIdentity=(value:Value,media:string):string=>value.bytes??literalWireIdentity(value,media);

/** A finite or Boolean domain can make reserved expansion inapplicable. The
 * certificate follows the existing fixed-conjunction owner; examples never
 * establish a parameter's value language. */
export function inactiveReservedExpansion(graph:ReferenceGraph,owner:GraphScope):boolean {
    const schema=graph.scopeAs(owner.resource,owner.pointer+'/schema','schema');if(!schema)return false;
    const proofs=new MigrationSchemaProofs(graph),active=new Set<string>();
    const safe=(schema:GraphScope):boolean=>{
        const key=JSON.stringify([schema.resource,schema.pointer]);if(active.has(key)||active.size>=128)return false;
        active.add(key);
        try{
            const domains=proofs.domains(schema);if([...domains].every(type=>type==='boolean'))return true;
            for(const part of proofs.conjuncts(schema)){
                const doc=graph.docs.get(part.resource)!,values=doc.dataNode(part.pointer+'/enum');
                if(values?.kind==='array'&&[...values.children.values()].every(node=>typeof node.value==='boolean'||
                    typeof node.value==='string'&&!/[:/?#\[\]@!$&'()*+,;=%]/u.test(node.value)))return true;
                if(domains.size===1&&domains.has('array')){
                    const items=graph.scopeAs(part.resource,part.pointer+'/items','schema');
                    if(items&&safe(items))return true;
                }
            }
            return false;
        }finally{active.delete(key);}
    };
    return safe(schema);
}
export type MigrationInlineExamples=Readonly<{
    read:(location:SourceLocation,namespace:string)=>Readonly<{base64:string}>|undefined;
    materialized:(location:SourceLocation,namespace:string,media:string)=>void;
    represented:(location:SourceLocation,namespace:string)=>boolean;
    literal:(location:SourceLocation)=>string|undefined;
}>;

/** R2 metadata uses captured graph roles and the common CST allocator. It does
 * not acquire examples, evaluate schemas, or interpret payload-looking refs.
 * A unique example means one exact value/byte representation, not the first
 * convenient member of a named map. */
export class SwaggerObjectMetadata {
    private readonly captured:ReadonlyMap<string,SourcePlan>;
    private proofWork=0;
    private proofBytes=0;
    constructor(private readonly graph:ReferenceGraph,private readonly sources:ReadonlyMap<string,SourcePlan>,
        private readonly owners:MigrationSchemaOwners,private readonly issue:MigrationIssue,
        private readonly external?:MigrationInlineExamples,captured?:ReadonlyMap<string,SourcePlan>){
        this.captured=captured??new Map([...sources].map(([id,source])=>[id,source.fork()]));
    }

    private charge(bytes=0):void {
        if(++this.proofWork>50000||(this.proofBytes+=bytes)>128*1024*1024)
            throw new SourceError('limit.migration.examples','Example equivalence exceeds 50000 states or 128 MiB of literal proof work');
    }

    private wire(value:Value,media:string,literal=false):string {
        const result=literal?literalWireIdentity(value,media):wireIdentity(value,media);this.charge(result.length);return result;
    }

    private history(scope:SourceLocation,source:SourcePlan,pointer:string,label:string):void {
        if(source.doc.dataNode(pointer))this.owners.retainNativeHistory(scope,source,pointer,label,this.graph);
    }

    private literal(source:SourcePlan,pointer:string,origin:SourceLocation):Value {
        const raw=this.external?.literal(origin);
        if(raw!==undefined){
            this.charge(raw.length);
            const value=new SourceDocument(raw,'file:///migration-authored-value.json',true,'json');
            if(!value.issues.length&&sourceValueIdentity(value,'')===sourceValueIdentity(source.doc,pointer))return {source,pointer,raw};
        }
        return {source,pointer};
    }

    parameter(scope:GraphScope,source:SourcePlan,pointer:string,declaration:Record<string,unknown>,schemaOwner=scope):void {
        const field=(name:string)=>({...schemaOwner,pointer:schemaOwner.pointer+'/'+name});
        for(const name of ['deprecated','allowReserved','required','allowEmptyValue']){
            if(!Object.hasOwn(declaration,name)||name==='required'&&scope.kind!=='header'||
                name==='allowEmptyValue'&&scope.kind==='parameter'&&declaration.in==='query')continue;
            const active=name==='allowReserved'?scope.kind==='parameter'&&declaration.in==='query'&&declaration.content===undefined:
                name==='allowEmptyValue'?false:true;
            if(declaration[name]===true&&active&&!(name==='allowReserved'&&inactiveReservedExpansion(this.graph,schemaOwner))){
                const schema=name==='allowReserved'&&this.graph.scopeAs(schemaOwner.resource,schemaOwner.pointer+'/schema','schema');
                const unknown=schema&&new MigrationSchemaProofs(this.graph).constantInDomains(schema,new Set(['string']))!==true;
                this.issue(field(name),'migration.parameter.'+name,
                    name==='deprecated'?'Swagger Parameter and Header Objects have no standard deprecation annotation':
                    name==='required'?'Swagger response Headers cannot declare required header presence':
                    unknown?'No certificate establishes that reserved expansion is inactive for this constrained query language':
                    'Swagger has no reserved-expansion instruction for query values',unknown?'unavailable-proof':'target-representation');
            }else this.history(field(name),source,pointer+'/'+name,'inactive_parameter_'+name);
        }
        for(const name of ['example','examples'])if(Object.hasOwn(declaration,name)){
            const empty=name==='examples'&&Object.keys((declaration.examples as Record<string,unknown>|undefined)??{}).length===0;
            const schema=this.graph.scopeAs(schemaOwner.resource,schemaOwner.pointer+'/schema','schema');
            const fallback=schema&&schemaExampleCandidates(this.graph,schema);
            if(empty&&(!fallback||fallback.complete)){
                if(fallback?.values.length&&!this.exampleSchema(schemaOwner,source,pointer+'/schema',true,schema))continue;
                this.history(field(name),source,pointer+'/'+name,'empty_parameter_examples');
            }
            else this.issue(field(name),'migration.parameter.examples',
                empty?'Removing this empty examples override would reactivate Schema Object examples':
                'Swagger flat Parameter and Header Objects have no standard example field; a schema annotation cannot replace a parameter serialization example','target-representation');
        }
    }

    ignoredHeader(scope:GraphScope,source:SourcePlan,pointer:string):void {
        // An earlier stage may already have archived this occurrence. Its
        // historical value must never be interpreted as a Header again.
        if(!/\/headers\/[^/]+$/.test(pointer))return;
        const schemas=[...this.graph.entryScopes()].filter(schema=>schema.kind==='schema'&&schema.resource===scope.resource&&schema.pointer.startsWith(scope.pointer+'/'));
        for(const schema of schemas)if(!schemas.some(parent=>parent!==schema&&schema.pointer.startsWith(parent.pointer+'/'))){
            const at=pointer+schema.pointer.slice(scope.pointer.length);if(!source.doc.dataNode(at))continue;
            const retained=this.owners.move(schema,source,at,'ignored_header_schema',{context:this.owners.contextOf(schema)??this.graph,layout:'array-item'});
            source.set(at,{$ref:this.owners.reference(retained,'2.0')});
        }
        this.history(scope,source,pointer,'ignored_header');
    }

    /** Text strings and JSON numeric/Boolean scalars have equivalent native
     * scalar serializations. JSON strings need quotes, and objects/arrays need
     * a media decoder that flat Swagger declarations cannot bind. */
    parameterContent(scope:GraphScope,source:SourcePlan,pointer:string,schemaOwner=scope):Readonly<{schema:GraphScope;types:readonly string[]}>|undefined {
        const content=source.doc.dataNode(pointer+'/content');if(!content)return;
        retainFormHeaderOwners(this.graph,this.owners,source,scope,pointer);
        const names=[...content.children.keys()],name=names[0];
        const text=/^text\/plain(?:\s*;\s*charset\s*=\s*"?utf-8"?)?$/i.test(name);
        const json=/^application\/(?:json|[^;\s]+\+json)(?:\s*;\s*charset\s*=\s*"?utf-8"?)?$/i.test(name);
        if(names.length!==1||!text&&!json){
            this.issue(scope,'migration.parameter.content-media','Swagger flat parameters cannot bind this media decoder; no equivalent scalar serialization certificate is available','unavailable-proof');return;
        }
        const media=pointer+'/content/'+escape(name),schema=this.graph.scopeAs(schemaOwner.resource,schemaOwner.pointer+'/content/'+escape(name)+'/schema','schema');
        if(!schema){this.issue(scope,'migration.parameter.content-schema','A schema-less content parameter has no established flat scalar domain','unavailable-proof');return;}
        // The flat Items compiler follows the fixed schema chain and proves the
        // concrete type. The caller admits only its resulting string domain.
        for(const field of source.doc.dataNode(media)?.children.keys()??[])if(field!=='schema'){
            if(field==='encoding'||field.startsWith('x-'))this.history({...schemaOwner,pointer:schemaOwner.pointer+'/content/'+escape(name)+'/'+escape(field)},source,media+'/'+escape(field),'parameter_media_metadata');
            else this.issue({...schemaOwner,pointer:schemaOwner.pointer+'/content/'+escape(name)+'/'+escape(field)},'migration.parameter.content-examples',
                'Swagger flat parameters cannot retain media-specific examples','target-representation');
        }
        source.move(media+'/schema',pointer+'/schema');
        this.history({...schemaOwner,pointer:schemaOwner.pointer+'/content'},source,pointer+'/content','parameter_content');
        return {schema,types:text?['string']:['number','integer','boolean']};
    }

    private value(scope:GraphScope,media:string,field:string):Value|undefined {
        const source=this.captured.get(scope.resource)!,pointer=source.current(scope.pointer);
        if(pointer===undefined)return;
        const at=pointer+'/'+field,node=source.doc.dataNode(at);
        if(!node)return;
        if(field!=='externalValue')return this.literal(source,at,{resource:scope.resource,pointer:scope.pointer+'/'+field});
        const location={resource:scope.resource,pointer:scope.pointer+'/externalValue'},captured=this.external?.read(location,this.graph.root);
        if(!captured){this.issue(location,'migration.example.capture','No approved captured byte binding is established for this example occurrence','unavailable-proof');return;}
        this.charge(captured.base64.length);
        const bytes=Buffer.from(captured.base64,'base64');let text:string;
        try{text=runtimeMediaKind(media)==='text'?decodeRuntimeMedia(captured.base64,'file:///migration-text-example',media,true).document.root.value:
            new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{
            this.issue(location,'migration.example.wire-representation','These example bytes have no established lossless Swagger literal representation','unavailable-proof');return;
        }
        // A literal is admitted only when its target execution projection can
        // reproduce every byte. JSON whitespace/number spellings are not parsed
        // through JavaScript values; non-JSON text stays serialized text.
        const json=runtimeMediaKind(media)==='json';
        let document:SourceDocument;
        try{document=new SourceDocument(json?text:JSON.stringify(text),'file:///migration-inline-example.json');
            if(document.issues.length)throw new Error('invalid JSON');
        }catch{this.issue(location,'migration.example.wire-representation','The captured bytes have no valid exact Swagger example literal','unavailable-proof');return;}
        const literal=new SourcePlan(document);
        return {source:literal,pointer:'',external:location,bytes:captured.base64};
    }

    private terminal(at:SourceLocation):GraphScope|undefined {
        const seen=new Set<string>();
        for(let depth=0;depth<128;depth++){
            const id=JSON.stringify([at.resource,at.pointer]);if(seen.has(id))break;seen.add(id);
            const scope=this.graph.scopeAs(at.resource,at.pointer,'example');if(!scope)break;
            const edge=this.graph.referenceAs(at.resource,at.pointer,'$ref','example');
            if(!edge)return scope;
            if(edge.resolution!=='resolved')break;
            at={resource:edge.targetResource!,pointer:edge.targetPointer!};
        }
        this.issue(at,'migration.example.reference','The Example reference chain has no bounded captured concrete owner','source-incomplete');
    }

    private unique(scope:GraphScope,source:SourcePlan,pointer:string,media:string):{value?:Value;authored:boolean;valid:boolean} {
        const direct=source.doc.dataNode(pointer+'/example');
        if(direct)return {value:this.literal(source.fork(),pointer+'/example',{resource:scope.resource,pointer:scope.pointer+'/example'}),authored:true,valid:true};
        const examples=source.doc.dataNode(pointer+'/examples');if(!examples)return {authored:false,valid:true};
        const values:Value[]=[];let valid=true;
        if(examples.children.size>2048)throw new SourceError('limit.migration.examples','Named example comparison exceeds 2048 captured members');
        for(const name of examples.children.keys()){
            const target=this.terminal({...scope,pointer:scope.pointer+'/examples/'+escape(name)});if(!target){valid=false;continue;}
            const node=this.graph.docs.get(target.resource)!.dataNode(target.pointer)!,value=node.value;
            const field=Object.hasOwn(value,'value')?'value':target.family==='3.2'&&Object.hasOwn(value,'dataValue')?'dataValue':
                target.family==='3.2'&&Object.hasOwn(value,'serializedValue')?'serializedValue':Object.hasOwn(value,'externalValue')?'externalValue':undefined;
            if(!field){this.issue(target,'migration.example.value','This named Example has no established payload; removing it could activate a fallback example','unavailable-proof');valid=false;continue;}
            if(field==='serializedValue'||field==='dataValue'&&runtimeMediaKind(media)!=='json'){
                this.issue(target,'migration.example.representation','This explicit example representation needs a separately proved older-version mapping','unavailable-proof');valid=false;continue;
            }
            const selected=this.value(target,media,field);if(selected)values.push(selected);else valid=false;
        }
        if(values.some(value=>this.wire(value,media)!==this.wire(values[0],media))){
            this.issue({...scope,pointer:scope.pointer+'/examples'},'migration.response.named-examples',
                'Swagger permits one example per media type; these distinct authored values cannot be collapsed losslessly','target-representation');valid=false;
        }
        return {value:valid&&values.length?{...values[0],equivalents:values.slice(1)}:undefined,authored:true,valid};
    }

    private install(value:Value,source:SourcePlan,pointer:string,media:string):boolean {
        this.owners.admit(source,4);
        // Synthetic literal inputs have no authored CST provenance. Ordinary
        // values retain their original payload and exact numeric lexemes.
        if(!source.doc.dataNode(pointer)){
            if(value.external||value.literal)source.exact(pointer,value.raw??value.source.doc.dataJson(value.pointer));
            else {
                source.copy(value.source,value.pointer,pointer,true);
                // JSON entity whitespace belongs to an authored JSON example.
                // Preserve it after CST placement rather than re-indenting it.
                if(runtimeMediaKind(media)==='json')source.exact(pointer,value.raw??value.source.doc.dataJson(value.pointer));
            }
        }
        const node=source.doc.dataNode(pointer)!,raw=exampleRepresentation('value',node.value,media)==='serialized'?node.value:source.doc.dataJson(pointer);
        if(typeof raw!=='string'||migrationExampleBytes(raw,media).toString('base64')!==this.wire(value,media)){
            this.issue(value.external??{resource:value.source.doc.id,pointer:value.pointer},'migration.example.wire-bytes','This Swagger literal would change the authored example entity bytes','target-representation');return false;
        }
        if(value.bytes!==undefined){
            this.external!.materialized(value.external!,this.graph.root,media);
            // Preserve the captured locator's provenance on its new exact
            // payload, for the existing final/cold example ownership proof.
            const input=this.sources.get(value.external!.resource)!,at=input.current(value.external!.pointer);
            if(at!==undefined)source.associate(input,at,pointer);
        }
        return value.equivalents?.every(value=>this.install(value,source,pointer,media))??true;
    }

    /** A media example overrides schema candidates. Keep their neutral owners
     * intact, and specialize only the body's same-instance assertion graph.
     * Value schemas (properties/items) retain their own examples and identities.
     * Memoized allocator variants preserve recursive fixed-reference graphs. */
    private withoutBodyExamples(root:SourceLocation):SourceLocation {
        const variants=new Map<string,SourceLocation>();let work=0;
        const inspect=()=>{if(++work>50000)throw new SourceError('limit.migration.media-schema','Body example specialization exceeds 50000 captured states');};
        const clone=(at:SourceLocation):SourceLocation=>{
            inspect();const key=JSON.stringify([at.resource,at.pointer]),previous=variants.get(key);if(previous)return previous;
            if(variants.size>=2048)throw new SourceError('limit.migration.media-schema','Body examples exceed 2048 schema variants');
            const scope=this.owners.capturedSchema(at)??this.graph.scopeAs(at.resource,at.pointer,'schema');
            if(!scope)throw new SourceError('migration.body.example-owner','A body example override has no captured assertion owner');
            const context=this.owners.contextOf(scope)??this.graph,input=this.sources.get(at.resource)!;
            const variant=this.owners.assertionVariant(context,scope,input,at.pointer,'body_example_assertions','2.0',['/example','/examples']);
            variants.set(key,variant);
            const source=this.sources.get(variant.resource)!;
            const visit=(pointer:string,depth=0)=>{
                inspect();if(depth>=128)throw new SourceError('limit.migration.media-schema','Body example specialization exceeds 128 applicator levels');
                for(const name of ['example','examples'])if(source.doc.dataNode(pointer+'/'+name)){
                    this.owners.admit(source,2);source.remove(pointer+'/'+name,true,true,true);
                }
                if(source.doc.dataNode(pointer+'/$ref')){
                    const target=this.owners.materialReference(source,pointer,'2.0');
                    if(!target)throw new SourceError('migration.body.example-reference','A body example override has no captured fixed assertion target');
                    const selected=clone(target);this.owners.referenceUse(source,pointer,selected);
                    source.set(pointer+'/$ref',this.owners.reference(selected,'2.0'));return;
                }
                for(const name of ['allOf','anyOf','oneOf'])for(const child of source.doc.dataNode(pointer+'/'+name)?.children.keys()??[])
                    visit(pointer+'/'+name+'/'+child,depth+1);
            };
            visit(variant.pointer);return variant;
        };
        return clone(root);
    }

    private exampleSchema(scope:GraphScope,source:SourcePlan,pointer:string,omit:boolean,schema?:GraphScope):boolean {
        if(!source.doc.dataNode(pointer)){source.set(pointer,{});return true;}
        const owner=this.owners.capturedSchema({resource:source.doc.id,pointer})??schema;
        if(!owner){
            if(source.doc.dataNode(pointer)?.kind==='object'&&!source.doc.dataNode(pointer)!.children.size)return true;
            this.issue(scope,'migration.example.schema-owner','The example mapping has no captured independent schema owner','unavailable-proof');return false;
        }
        try{
            const retained=this.owners.move(owner,source,pointer,'example_schema',{context:this.owners.contextOf(owner)??this.graph,layout:'array-item'});
            const assertions=omit?this.withoutBodyExamples(retained):retained;
            source.set(pointer,{allOf:[{$ref:this.owners.reference(assertions,'2.0')}]});return true;
        }catch(error){
            if(!(error instanceof SourceError))throw error;
            if(!error.code.startsWith('limit.')&&!error.code.startsWith('migration.owners.variant-')&&!error.code.startsWith('migration.body.example-'))throw error;
            this.issue(scope,error.code,error.message,'unavailable-proof');return false;
        }
    }

    private schemaValues(schema:GraphScope):{complete:boolean;values:Value[]} {
        const selected=schemaExampleCandidates(this.graph,schema),values:Value[]=[];
        for(const value of selected.values){
            const source=this.captured.get(value.resource),pointer=source?.current(value.pointer);
            if(!source||pointer===undefined)return {complete:false,values:[]};
            values.push(this.literal(source,pointer,value));
        }
        return {complete:selected.complete,values};
    }

    private plainTextSchema(schema:GraphScope|undefined):boolean {
        if(!schema)return false;
        const proofs=new MigrationSchemaProofs(this.graph),domains=proofs.domains(schema);
        return domains.size===1&&domains.has('string')&&proofs.conjuncts(schema).every(part=>{
            const rule=this.graph.docs.get(part.resource)!.dataNode(part.pointer)!.value;
            return rule.contentEncoding===undefined&&!['byte','binary'].includes(rule.format);
        });
    }

    media(scope:GraphScope,source:SourcePlan,pointer:string,request:boolean):void {
        // Encoding outside form request bodies is ignored by the normative
        // Media Type grammar. Retain independent Header/schema owners first.
        retainFormHeaderOwners(this.graph,this.owners,source,scope,pointer);
        const content=source.doc.dataNode(pointer+'/content');if(!content)return;
        const selections:{media:string;scope:GraphScope;pointer:string;value?:Value;authored:boolean;valid:boolean}[]=[];
        for(const media of content.children.keys()){
            const at=pointer+'/content/'+escape(media),owner={...scope,pointer:scope.pointer+'/content/'+escape(media),kind:'media'};
            selections.push({media,scope:owner,pointer:at,...this.unique(owner,source,at,media)});
            for(const name of [...source.doc.dataNode(at)!.children.keys()])if(!['schema','example','examples'].includes(name)){
                if(name==='encoding'||name.startsWith('x-'))this.history({...owner,pointer:owner.pointer+'/'+escape(name)},source,at+'/'+escape(name),'inactive_media_metadata');
                else this.issue({...owner,pointer:owner.pointer+'/'+escape(name)},'migration.media.field','This media field needs its assigned version-specific conversion','implementation');
            }
        }
        if(selections.some(value=>!value.valid))return;
        if(request){
            const fallback=selections.map(value=>this.graph.scopeAs(scope.resource,value.scope.pointer+'/schema','schema'))
                .map(schema=>schema&&this.schemaValues(schema));
            if(fallback.some(value=>value&&!value.complete)){
                this.issue(scope,'migration.body.example-proof','The captured schema example selection did not complete','unavailable-proof');return;
            }
            // Existing binary/form owners retain their schema data examples.
            // This path does not reinterpret them as serialized media values.
            if(selections.every(value=>!value.authored)&&selections.some(value=>!['json','text'].includes(runtimeMediaKind(value.media))||
                runtimeMediaKind(value.media)==='text'&&!this.plainTextSchema(this.graph.scopeAs(scope.resource,value.scope.pointer+'/schema','schema'))))return;
            for(const [index,selection]of selections.entries())if(!selection.authored&&fallback[index]?.values.length&&
                fallback[index]!.values.every(value=>this.wire(value,selection.media)===this.wire(fallback[index]!.values[0],selection.media)))
                selection.value={...fallback[index]!.values[0],equivalents:fallback[index]!.values.slice(1)};
            const authored=selections.filter(value=>value.authored||value.value),values=authored.filter(value=>value.value);
            if(!authored.length)return;
            if(!values.length&&fallback.every(value=>!value||value.complete&&!value.values.length)){
                for(const value of authored)this.history({...value.scope,pointer:value.scope.pointer+'/examples'},source,value.pointer+'/examples','empty_body_examples');return;
            }
            if(!values.length&&selections.every((value,index)=>value.authored||!fallback[index]?.values.length)&&fallback.every(value=>!value||value.complete)){
                for(const selection of selections){
                    const schema=this.graph.scopeAs(scope.resource,selection.scope.pointer+'/schema','schema');
                    if(!this.exampleSchema(scope,source,selection.pointer+'/schema',true,schema))return;
                    this.history({...selection.scope,pointer:selection.scope.pointer+'/examples'},source,selection.pointer+'/examples','empty_body_examples');
                }
                return;
            }
            const equivalent=(value:typeof values[number])=>{
                if(runtimeMediaKind(value.media)==='json')return true;
                if(runtimeMediaKind(value.media)!=='text'||typeof value.value!.source.doc.dataNode(value.value!.pointer)!.value!=='string')return false;
                return this.plainTextSchema(this.graph.scopeAs(scope.resource,value.scope.pointer+'/schema','schema'));
            };
            const exemplar=values.find(candidate=>values.every(value=>{
                try{return this.wire(candidate.value!,value.media,true)===this.wire(value.value!,value.media);}
                catch(error){if(!(error instanceof SourceError)||error.code.startsWith('limit.'))throw error;return false;}
            }));
            if(values.length!==selections.length||values.some(value=>!equivalent(value))||!exemplar||
                fallback.some(value=>value&&!value.complete)){
                const missing=fallback.some(value=>value&&!value.complete)||values.some(value=>!equivalent(value));
                this.issue(scope,'migration.body.media-metadata','Swagger has one schema example for every consumed media type; these media-selected or serialized examples have no proved equivalent schema annotation',missing?'unavailable-proof':'target-representation');return;
            }
            // Each wrapper receives the common data annotation before the
            // common-schema proof. Overridden annotations cannot make otherwise
            // identical assertions look different or affect another consumer.
            for(const [index,selection]of selections.entries()){
                const schema=this.graph.scopeAs(scope.resource,selection.scope.pointer+'/schema','schema');
                if(!this.exampleSchema(scope,source,selection.pointer+'/schema',!!fallback[index]?.values.length,schema))return;
                const rendered={...exemplar.value!,external:undefined,bytes:undefined,equivalents:undefined,literal:!!exemplar.value!.external};
                if(!this.install(rendered,source,selection.pointer+'/schema/example',selection.media))return;
                if(!this.install(selection.value!,source,selection.pointer+'/schema/example',selection.media))return;
            }
        }else for(const selection of selections){
            const schema=this.graph.scopeAs(scope.resource,selection.scope.pointer+'/schema','schema');
            const fallback=schema&&this.schemaValues(schema);
            if(fallback&&!fallback.complete){this.issue(scope,'migration.response.example-proof','The captured schema example selection did not complete','unavailable-proof');return;}
            let value=selection.value;
            // One schema candidate has the same JSON/text value at its media
            // occurrence. Distinct collected schema candidates stay on their
            // Schema Objects; the common-schema proof still governs them.
            if(!selection.authored&&fallback?.complete&&fallback.values.length&&
                (runtimeMediaKind(selection.media)==='json'||runtimeMediaKind(selection.media)==='text'&&this.plainTextSchema(schema)&&fallback.values.every(value=>typeof value.source.doc.dataNode(value.pointer)!.value==='string'))&&
                fallback.values.every(value=>this.wire(value,selection.media)===this.wire(fallback.values[0],selection.media)))
                value={...fallback.values[0],equivalents:fallback.values.slice(1)};
            if((selection.authored||value)&&fallback?.values.length&&
                !this.exampleSchema(scope,source,selection.pointer+'/schema',true,schema))return;
            if(value&&!this.install(value,source,pointer+'/examples/'+escape(selection.media),selection.media))return;
        }
        for(const selection of selections)for(const name of ['example','examples'])
            this.history({...selection.scope,pointer:selection.scope.pointer+'/'+name},source,selection.pointer+'/'+name,'media_'+name);
    }

    reusableExamples(scope:SourceLocation,source:SourcePlan,pointer:string):void {
        for(const example of this.graph.entryScopes())if(example.kind==='example'&&example.resource===scope.resource&&example.pointer.startsWith(scope.pointer+'/')){
            const location={resource:example.resource,pointer:example.pointer+'/externalValue'};
            if(this.graph.docs.get(example.resource)!.dataNode(location.pointer)&&!this.external?.represented(location,this.graph.root))
                this.issue(location,'migration.example.reusable-external','Swagger has no reusable external Example Object category and this byte owner has no materialized standard occurrence','target-representation');
        }
        this.history(scope,source,pointer,'reusable_examples');
    }

    retainMediaEnvelope(scope:GraphScope,source:SourcePlan,pointer:string):void {
        // Applicable schemas/examples already have their target owners. Keep
        // authored media names as historical information as well, including
        // independently reusable wrappers without an executable consumer.
        this.history({...scope,pointer:scope.pointer+'/content'},source,pointer+'/content','media_envelope');
    }

    prepareFormExamples(scope:GraphScope,source:SourcePlan,pointer:string):void {
        const media=[...source.doc.dataNode(pointer+'/content')?.children.values()??[]];
        if(media.some(value=>value.children.has('example')||value.children.get('examples')?.children.size))return;
        if(media.some(value=>value.children.has('examples')))this.media(scope,source,pointer,true);
    }

    coalesceBodyExamples(scope:GraphScope,source:SourcePlan,pointer:string,media:readonly string[],selected:string):void {
        const target=pointer+'/content/'+escape(selected)+'/schema/example';if(!source.doc.dataNode(target))return;
        for(const name of media)if(name!==selected){
            const from=pointer+'/content/'+escape(name)+'/schema/example';
            if(source.doc.dataNode(from)){
                if(this.wire({source,pointer:from},name,true)!==this.wire({source,pointer:target},name,true)){
                    this.issue(scope,'migration.body.media-metadata','A shared Swagger body schema cannot reproduce these media-selected schema example bytes','target-representation');continue;
                }
                source.associate(source,from,target);
            }
        }
    }
}
