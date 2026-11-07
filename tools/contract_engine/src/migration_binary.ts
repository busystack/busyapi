import {segments,escape,SourceError} from './document';
import {mediaTypes} from './media_types';
import {FormSemantics,formContentType} from './form_semantics';
import {runtimeMediaKind} from './runtime_media';
import {runtimeBinaryMedia} from './runtime_binary';
import {schemaResourceContextIdentity,type GraphScope,type ReferenceGraph} from './reference_graph';
import type {MigrationSource} from './migration_source';
import type {MigrationIssue} from './migration_schema';
import {modernFamily} from './specification';
import {ParameterSemantics} from './parameter_semantics';
import {swaggerMedia} from './swagger_operation';
import {migrationScopes} from './migration_documents';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {MigrationSchemaOwners} from './migration_schema_owners';
import {MultipartEncoding,type MultipartSchemaStep} from './multipart_encoding';
import {projectSchemaReference} from './schema_reference_projection';
import {rawConstraintBlocker,projectRawConstraints,rawContainerLiteralUnchanged,rawConstraintReason} from './migration_binary_constraints';
import {BinaryConstraintProofs} from './migration_binary_proofs';
import {wholeBodyEncoding} from './whole_body_encoding';
import {migrationOperationUses} from './migration_operation_contexts';

export type BinaryUse=Readonly<{kind:'body'|'part'|'data';representation?:'data'|'unknown';mediaType?:string;source:GraphScope;schema:GraphScope;path:readonly BinaryStep[]}>;
export type BinaryStep=Readonly<{property:string}>|'item'|'nested';
type Use=BinaryUse;
type Step=BinaryStep;
type Visit=Readonly<{scope:GraphScope;path:readonly Step[]}>;
const identity=(scope:Pick<GraphScope,'resource'|'pointer'>)=>JSON.stringify([scope.resource,scope.pointer]);

/** Occurrence context comes from the canonical graph, not the schema's file
 * name or its reusable component name. A reference preserves the instance path;
 * properties/items change it. No resource acquisition occurs in this proof. */
export class BinaryUses {
    private readonly incoming=new Map<string,GraphScope[]>();
    private readonly swaggerUses=new Map<string,{mediaType:string;source:GraphScope}[]>();
    private readonly forms:FormSemantics;
    private readonly transfers:MultipartEncoding;
    readonly constraints:BinaryConstraintProofs;
    constructor(private readonly graph:ReferenceGraph,private readonly contexts:readonly ReferenceGraph[]=[graph]){
        this.forms=new FormSemantics(graph);
        this.transfers=new MultipartEncoding(graph);
        this.constraints=new BinaryConstraintProofs(graph);
        for(const edge of graph.references){
            const projection=projectSchemaReference(edge);
            if(projection.state!=='fixed')continue;
            const scope=graph.scopeAs(edge.resource,edge.pointer,'schema');
            if(!scope)continue;
            const key=identity(projection.target);
            const scopes=this.incoming.get(key)??[];
            scopes.push(scope);this.incoming.set(key,scopes);
        }
        let inspections=0,uses=0;
        const inspect=()=>{if(++inspections>2000000)throw new SourceError('limit.migration.binary','Swagger media discovery exceeds its bounded work');};
        const add=(owner:Pick<GraphScope,'resource'|'pointer'>,source:GraphScope,media:readonly string[])=>{
            const key=identity(owner),values=this.swaggerUses.get(key)??[];
            for(const mediaType of media){
                inspect();
                if(++uses>20000)throw new SourceError('limit.migration.binary','Swagger media discovery exceeds 20000 captured uses');
                values.push({source,mediaType});
            }
            this.swaggerUses.set(key,values);
        };
        for(const context of contexts){
            const parameters=new ParameterSemantics(context);
            for(const operation of migrationOperationUses(context)){
                inspect();
                const source=graph.scope(operation.source.resource,operation.source.pointer);
                if(source.family!=='2.0')continue;
                for(const parameter of parameters.operation(source.resource,source.pointer,operation.pathItem).visible)
                    if(parameter.location==='body'&&parameter.definition)
                        add(parameter.definition,source,swaggerMedia(context,source.resource,source.pointer,'consumes'));
                for(const name of graph.docs.get(source.resource)!.dataNode(source.pointer+'/responses')?.children.keys()??[]){
                    if(name.startsWith('x-'))continue;
                    let at={resource:source.resource,pointer:source.pointer+'/responses/'+escape(name)};
                    const seen=new Set<string>();
                    for(let depth=0;depth<128;depth++){
                        inspect();
                        if(seen.has(identity(at)))break;
                        seen.add(identity(at));
                        const reference=context.referenceAs(at.resource,at.pointer,'$ref','response');
                        if(!reference){add(at,source,swaggerMedia(context,source.resource,source.pointer,'produces'));break;}
                        if(reference.resolution!=='resolved')break;
                        at={resource:reference.targetResource!,pointer:reference.targetPointer!};
                    }
                }
            }
        }
    }
    async prepare():Promise<void>{
        const uses:BinaryUse[]=[];
        // Conversion visits every captured entry. Private consumers of a
        // secondary API need certificates even when the primary entry reaches
        // only one unrelated schema in that same physical document.
        for(const scope of migrationScopes(this.contexts))if(scope.kind==='schema')uses.push(...this.inspect(scope).filter(rawBinaryUse));
        await this.constraints.prepare(uses);
    }
    rawCompatible(use:Use,family:string):boolean {
        const seen=new Set<string>();
        const visit=(scope:GraphScope,path:readonly Step[]):boolean=>{
            const key=JSON.stringify([scope.resource,scope.pointer,path]);
            if(seen.has(key))return true;
            if(seen.size>=2048)throw new SourceError('limit.migration.binary','Raw-schema assertion inspection exceeds 2048 occurrences');
            seen.add(key);
            const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(value===true)return true;
            if(value===false)return true;
            if(value===null||typeof value!=='object'||Array.isArray(value))return false;
            const child=(pointer:string,steps=path)=>{
                const at=this.graph.scopeAs(scope.resource,pointer,'schema');
                return at!==undefined&&visit(at,steps);
            };
            for(const keyword of modernFamily(scope.family)?['$ref','$dynamicRef']:['$ref'])if(typeof value[keyword]==='string'){
                const edge=this.graph.referenceAs(scope.resource,scope.pointer,keyword,'schema');
                const projection=edge&&projectSchemaReference(edge);
                const target=projection?.state==='fixed'&&this.graph.scopeAs(projection.target.resource,projection.target.pointer,'schema');
                if(!target||!visit(target,path))return false;
                if(!modernFamily(scope.family))return true;
            }
            if(path.length){
                // Container enums compare literal JSON data, whose embedded
                // octet strings are not modern raw leaves. They need a separate
                // whole-instance mapping rather than a leaf annotation edit.
                if(!rawContainerLiteralUnchanged(value,path)&&!this.constraints.compatible(use,scope,path))return false;
            }else{
                if(!modernFamily(scope.family)&&rawConstraintBlocker(value)!==undefined&&!this.constraints.compatible(use,scope,path))return false;
            }
            for(const keyword of ['allOf','anyOf','oneOf'])if(Array.isArray(value[keyword]))
                for(let index=0;index<value[keyword].length;index++)if(!child(scope.pointer+'/'+keyword+'/'+index))return false;
            for(const name of ['not',...(modernFamily(scope.family)?['if','then','else']:[])])
                if(Object.hasOwn(value,name)&&!child(scope.pointer+'/'+name))return false;
            if(path.length){
                const [step,...rest]=path;
                if(typeof step==='object'&&Object.hasOwn(value.properties??{},step.property))
                    return child(scope.pointer+'/properties/'+escape(step.property),rest);
                if(step==='item'&&Object.hasOwn(value,'items'))return child(scope.pointer+'/items',rest);
                if(step==='nested')return false;
            }
            return true;
        };
        return visit(use.schema,use.path);
    }
    inspect(scope:GraphScope):readonly Use[]{
        const pending:Visit[]=[{scope,path:[]}],seen=new Set<string>(),uses:Use[]=[];
        while(pending.length){
            const current=pending.pop()!,at=current.scope,{resource,pointer}=at,path=current.path;
            const key=JSON.stringify([resource,pointer,path]);
            if(seen.has(key))continue;
            if(seen.size>=2048)throw new SourceError('limit.migration.binary','Binary representation inspection exceeds 2048 captured occurrences');
            seen.add(key);
            for(const incoming of this.incoming.get(identity(at))??[])pending.push({scope:incoming,path});
            const tokens=segments(pointer),last=tokens.at(-1),parent=pointer.slice(0,pointer.lastIndexOf('/'));
            const owner=this.graph.scopes.get(resource+'#'+parent);
            if(last==='schema'&&owner?.family==='2.0'&&['response','parameter'].includes(owner.kind)){
                for(const use of this.swaggerUses.get(identity(owner))??[])
                    uses.push({...use,kind:path.length?'data':'body',representation:path.length?undefined:this.bodyRepresentation(at,use.mediaType),schema:at,path});
                continue;
            }
            if(last==='schema'&&owner?.kind==='media'){
                const mediaType=segments(owner.pointer).at(-1)!;
                const essence=mediaType.split(';')[0].trim().toLowerCase();
                const part=path[0];
                if(essence.startsWith('multipart/')||essence==='application/x-www-form-urlencoded'){
                    if(part&&typeof part==='object'&&path.slice(1).every(step=>step==='item')){
                        const value=this.graph.docs.get(resource)!.dataNode(owner.pointer)!.value;
                        let shape=this.forms.shape(resource,pointer).properties?.[part.property];
                        if(shape?.types?.includes('array')){
                            // Named MIME encoding applies to each array item.
                            // The array container is modeled data, not a raw
                            // part instance, even when all of its items are raw.
                            if(path.length===1){uses.push({kind:'data',source:owner,schema:at,path});continue;}
                            shape=shape.items;
                        }
                        const rule=value.encoding?.[part.property];
                        // Styled encodings use their RFC6570 text representation.
                        const styled=essence==='application/x-www-form-urlencoded'&&
                            ['style','explode','allowReserved'].some(name=>Object.hasOwn(rule??{},name));
                        const contentType=styled?'text/plain':rule?.contentType??shape?.defaultContentType??formContentType({},at.family);
                        let representation:'data'|'unknown'|undefined=essence==='application/x-www-form-urlencoded'?'data':undefined;
                        if(representation===undefined){
                            const steps:MultipartSchemaStep[]=path.map(step=>step==='item'?{item:undefined}:{property:(step as {property:string}).property});
                            try{
                                const transfer=this.transfers.schemaPathEncoding(at,steps);
                                if(transfer.schemaEncoded)representation='data';
                                else if(transfer.instanceEncoding==='octets'&&!mediaTypes(contentType).every(type=>
                                    runtimeMediaKind(type.text)==='opaque'&&runtimeBinaryMedia(type.text)))
                                    // A legacy binary annotation can force an
                                    // octet view even for a JSON/text MIME part.
                                    // The target codec binding is not established
                                    // by a JSON-compatible media label alone.
                                    representation='unknown';
                            }
                            catch(error){
                                if(!(error instanceof SourceError)||error.code.startsWith('limit.'))throw error;
                                representation='unknown';
                            }
                        }
                        uses.push({kind:'part',representation,mediaType:contentType,source:owner,schema:at,path});
                    }else uses.push({kind:'data',source:owner,schema:at,path});
                }else uses.push({kind:path.length?'data':'body',representation:path.length?undefined:this.bodyRepresentation(at,mediaType),mediaType,source:owner,schema:at,path});
                continue;
            }
            if(last==='schema'&&owner&&['parameter','header'].includes(owner.kind)){
                uses.push({kind:'data',source:owner,schema:at,path});continue;
            }
            let ancestor:GraphScope|undefined,next=path;
            const container=tokens.at(-2);
            if(container==='properties'){
                const above=parent.slice(0,parent.lastIndexOf('/'));
                ancestor=this.graph.scopeAs(resource,above,'schema');
                next=[{property:last!},...path];
            }else if(['allOf','anyOf','oneOf'].includes(container??''))
                ancestor=this.graph.scopeAs(resource,parent.slice(0,parent.lastIndexOf('/')),'schema');
            else if(['items','additionalProperties','not',...(modernFamily(at.family)?['if','then','else']:[])].includes(last??'')){
                ancestor=this.graph.scopeAs(resource,parent,'schema');
                if(last==='items')next=['item',...path];
                else if(last==='additionalProperties')next=['nested',...path];
            }
            if(ancestor){
                // Once more than one nested property is crossed, the value is
                // ordinary data rather than the MIME part itself. Collapse only
                // that classification state; recursive references remain bounded.
                if(next.length>8||next.filter(step=>typeof step==='object').length>1)next=['nested'];
                pending.push({scope:ancestor,path:next});
            }
        }
        return uses;
    }
    private bodyRepresentation(schema:GraphScope,mediaType:string|undefined):'data'|'unknown'|undefined {
        try{
            if(mediaType===undefined)return 'unknown';
            if(runtimeMediaKind(mediaType)!=='opaque')return;
            return wholeBodyEncoding(this.graph,schema)!==undefined?'data':undefined;
        }
        catch(error){
            if(!(error instanceof SourceError)||error.code.startsWith('limit.'))throw error;
            return 'unknown';
        }
    }
}

export function binaryUseRepresentation(use:Use):'raw'|'data'|'unknown' {
    if(use.representation!==undefined)return use.representation;
    if(use.kind==='data')return 'data';
    if(use.mediaType===undefined)return 'unknown';
    const kinds=mediaTypes(use.mediaType).map(type=>{
        if(type.type==='*'||type.subtype==='*')return 'unknown';
        return runtimeMediaKind(type.text)!=='opaque'?'data':runtimeBinaryMedia(type.text)?'raw':'unknown';
    });
    return kinds.every(kind=>kind==='raw')?'raw':kinds.every(kind=>kind==='data')?'data':'unknown';
}
export const rawBinaryUse=(use:Use)=>binaryUseRepresentation(use)==='raw';
const annotation=(name:string)=>name.startsWith('x-')||['title','description','externalDocs','xml','deprecated','readOnly','writeOnly'].includes(name);

/** OAS 3.0.4 §4.4.2 / 3.1.2 §§4.4.2–4.4.2.1. Encoded strings retain
 * their type and base64 spelling. Raw leaves are outside JSON types in modern
 * OAS; only proved raw occurrences can lose the legacy octet-string type.
 * Assertions with no established raw-instance mapping remain located blockers. */
export async function migrateBinarySchemas(graph:ReferenceGraph,sources:Map<string,MigrationSource>,from:string,to:string,issue:MigrationIssue,contexts:readonly ReferenceGraph[]=[graph]):Promise<ReadonlySet<string>> {
    const rawScopes=new Set<string>();
    if(!((from==='2.0'||from==='3.0')&&modernFamily(to)||from==='2.0'&&to==='3.0'||modernFamily(from)&&(to==='3.0'||to==='2.0')))return rawScopes;
    const uses=new BinaryUses(graph,contexts),owners=new MigrationSchemaOwners(graph,sources,undefined,[],contexts);
    if(modernFamily(from)!==modernFamily(to)){
        await uses.prepare();
        uses.constraints.projectGuards(sources,from);
        uses.constraints.projectLiterals(sources,owners,from,to,issue);
    }
    for(const scope of migrationScopes(contexts)){
        if(scope.kind!=='schema')continue;
        if(scope.family!==from)continue;
        const doc=graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value;
        if(value===null||typeof value!=='object'||Array.isArray(value)||!modernFamily(from)&&typeof value.$ref==='string')continue;
        const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);
        if(pointer===undefined)continue;
        const field=(name:string)=>({...scope,pointer:scope.pointer+'/'+escape(name)});
        const fail=(name:string,message:string,reason:'implementation'|'unavailable-proof'|'target-representation'|'source-incomplete'='unavailable-proof')=>issue(field(name),'migration.schema.binary-context',message,reason);
        if(from==='2.0'&&to==='3.0'){
            if(value.type==='file'){
                const contexts=uses.inspect(scope);
                if(!contexts.length||contexts.some(use=>!rawBinaryUse(use)||!uses.rawCompatible(use,from)))
                    fail('type','Swagger file bypasses data decoding; every occurrence needs captured raw-media evidence to preserve arbitrary entity bytes',
                        contexts.some(use=>binaryUseRepresentation(use)==='data')?'target-representation':'unavailable-proof');
                else if(Object.hasOwn(value,'format'))owners.retainLiteralValue(field('format'),source,pointer+'/format','file_format');
            }
            continue;
        }
        if((from==='2.0'||from==='3.0')&&modernFamily(to)){
            const contexts=uses.inspect(scope),raw=contexts.filter(rawBinaryUse);
            if(from==='2.0'&&value.type==='file'){
                if(!contexts.length||raw.length!==contexts.length){
                    fail('type','Swagger file bypasses data decoding; every target occurrence needs a captured raw-media binding to preserve arbitrary entity bytes',
                        contexts.some(use=>binaryUseRepresentation(use)==='data')?'target-representation':'unavailable-proof');continue;
                }
                // Swagger file has no internal data model. Its permitted fields
                // contain metadata, not string assertions (§6.4.12). Its format
                // cannot activate the encoded-string branch, even when byte.
                if(Object.hasOwn(value,'format'))owners.retainLiteralValue(field('format'),source,pointer+'/format','file_format');
                source.remove(pointer+'/type');source.remove(pointer+'/format');continue;
            }
            if(value.format==='byte'){
                if(contexts.some(use=>binaryUseRepresentation(use)==='unknown'||use.kind==='body'&&rawBinaryUse(use))){
                    fail('format','A whole encoded binary body needs its media-aware encoded-string interpretation before conversion');continue;
                }
                source.remove(pointer+'/format');source.set(pointer+'/contentEncoding','base64');continue;
            }
            const sensitive=['type','minLength','pattern','enum','const'].some(name=>Object.hasOwn(value,name))||value.format==='binary';
            if(!sensitive)continue;
            if(!raw.length){
                if(value.format==='binary'&&(!contexts.length||contexts.some(use=>binaryUseRepresentation(use)==='unknown')))
                    fail('format','The binary schema needs a captured concrete raw or modeled-data media binding');
                continue;
            }
            const blocker=rawConstraintBlocker(value);
            const equivalent=uses.constraints.scalar(scope);
            if(blocker&&equivalent===undefined){
                issue(field(blocker),'migration.schema.binary-constraint',
                    blocker==='pattern'?'No length-language or redundant-constraint certificate establishes this octet-string pattern; the target has no direct raw-byte pattern assertion':
                        'Nonempty octet literals have no JSON literal spelling for equality with modern raw instances', rawConstraintReason(value,blocker));continue;
            }
            if(raw.length!==contexts.length){
                fail('format','This raw/data occurrence still needs independent schema ownership for its applicable assertions');continue;
            }
            if(!contexts.every(use=>uses.rawCompatible(use,from))){
                fail('format','A containing literal assertion or referenced constraint lacks a complete raw-instance mapping');continue;
            }
            projectRawConstraints(source,pointer,value,name=>owners.retainLiteralValue(
                {...scope,pointer:scope.pointer+'/'+name},source,pointer+'/'+name,'binary_constraint'),equivalent);continue;
        }
        if(from==='2.0'||from==='3.0')continue;
        const capturedUses=uses.inspect(scope),rawUses=capturedUses.filter(rawBinaryUse);
        if(rawUses.length&&rawUses.length===capturedUses.length)rawScopes.add(JSON.stringify([scope.resource,scope.pointer]));
        const rawSensitive=rawUses.some(use=>use.kind==='part')||['type','format','minLength','pattern','enum','const','contentMediaType','contentEncoding'].some(name=>Object.hasOwn(value,name));
        if(rawUses.length&&rawSensitive){
            if(rawUses.length!==capturedUses.length){
                fail('type','Modern raw and JSON consumers still need independent schema owners before lowering');continue;
            }
            if(!rawUses.every(use=>uses.rawCompatible(use,from))){
                fail('type','Containing literal equality needs a complete raw/data projection before lowering');continue;
            }
            if(Object.hasOwn(value,'contentEncoding'))
                // This occurrence was proved raw, rather than an explicitly
                // modeled encoded string. Content annotations cannot apply to
                // it, including when a JSON type assertion rejects the body.
                owners.retainLiteralValue(field('contentEncoding'),source,pointer+'/contentEncoding','raw_inactive_encoding');
            if(Object.hasOwn(value,'contentSchema')){
                const schema={...scope,pointer:scope.pointer+'/contentSchema'};
                owners.move(schema,source,pointer+'/contentSchema','raw_inactive_content',{context:owners.contextOf(scope)??graph,layout:'array-item'});
            }
            if(Object.hasOwn(value,'format')&&value.format!=='binary')
                owners.retainLiteralValue(field('format'),source,pointer+'/format','raw_inactive_format');
            for(const name of ['minLength','pattern'])if(source.doc.dataNode(pointer+'/'+name))
                owners.retainLiteralValue({...scope,pointer:scope.pointer+'/'+name},source,pointer+'/'+name,'raw_inactive_constraint');
            if(Object.hasOwn(value,'type')||Object.hasOwn(value,'enum')||Object.hasOwn(value,'const')){
                // No JSON literal/type can match a modern raw instance. A
                // numeric type likewise rejects every legacy octet string.
                source.set(pointer+'/type','number');
            }
            if(Object.hasOwn(value,'contentMediaType')||rawUses.some(use=>use.kind==='part')){
                if(to==='3.0'&&!Object.hasOwn(value,'type')&&!Object.hasOwn(value,'enum')&&!Object.hasOwn(value,'const')){
                    if(Object.hasOwn(value,'format')&&value.format!=='binary')owners.retainLiteralValue({...scope,pointer:scope.pointer+'/format'},source,pointer+'/format','raw_format');
                    source.set(pointer+'/type','string');source.set(pointer+'/format','binary');
                }
                source.remove(pointer+'/contentMediaType');
            }
            continue;
        }
        if(rawUses.length)continue;
        // Content annotations do not apply to non-strings. Their inactive
        // values/independent schemas are retained by the vocabulary owner;
        // they do not authorize introducing a binary runtime representation.
        if(['contentEncoding','contentMediaType','contentSchema'].some(field=>Object.hasOwn(value,field))){
            const context=contexts.find(context=>{
                const captured=context.scopeAs(scope.resource,scope.pointer,'schema');
                return captured&&context.isEntryUse(captured)&&schemaResourceContextIdentity(captured)===schemaResourceContextIdentity(scope);
            })??graph;
            if(!new MigrationSchemaProofs(context).domains(scope).has('string'))continue;
        }
        // An active decoded-schema binding belongs to the content vocabulary
        // owner. A legacy byte/binary label cannot carry that schema binding.
        if(Object.hasOwn(value,'contentSchema')&&Object.hasOwn(value,'contentMediaType'))continue;
        const encoded=value.contentEncoding==='base64';
        if(Object.hasOwn(value,'contentEncoding')&&!encoded)continue;
        if(!encoded&&!Object.hasOwn(value,'contentMediaType'))continue;
        const contexts=uses.inspect(scope);
        if(encoded){
            if(value.format==='binary'){
                fail('format','The legacy binary format would activate an octet transfer alongside base64; no single faithful encoding binds both annotations','target-representation');continue;
            }
            if(typeof value.format==='string'&&value.format!=='byte'){
                // Both annotations apply to the same string. The legacy byte
                // annotation owns transfer/default media selection; retain the
                // authored format as a separate conjunct with exact CST data.
                const at=pointer+'/allOf';if(!source.doc.dataNode(at))source.set(at,[]);
                const branch=at+'/'+source.doc.dataNode(at)!.children.size;
                source.set(branch,{});source.move(pointer+'/format',branch+'/format');
            }
            if(contexts.some(use=>binaryUseRepresentation(use)==='unknown'||use.kind==='body'&&rawBinaryUse(use))){
                fail('contentEncoding','A whole encoded binary body needs its captured string/media representation before lowering');continue;
            }
            source.remove(pointer+'/contentEncoding');source.set(pointer+'/format','byte');
        }
        if(Object.hasOwn(value,'contentMediaType')){
            // OAS requires ignoring a redundant/contradicting contentMediaType
            // at a concrete Media Type/Encoding occurrence. A nested JSON value
            // has no such binding; dropping its annotation is not equivalent.
            if(!contexts.length||contexts.some(use=>use.kind==='data'||use.mediaType===undefined)){
                fail('contentMediaType','The decoded content media type has no proved concrete media binding at every occurrence');continue;
            }
            source.remove(pointer+'/contentMediaType');
        }
    }
    return rawScopes;
}
