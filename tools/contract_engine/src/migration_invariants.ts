export {prepareNamedMultipart,NamedMultipartEquivalence,proveNamedMultipartWire} from './migration_named_multipart';
import {PositionalEncodingEquivalence} from './migration_positional_encoding';
import {formContentType} from './form_semantics';
import {NamedMultipartEquivalence,namedMultipartFields,proveNamedMultipartOutput} from './migration_named_multipart';
import {MigrationArrayBounds} from './migration_schema_arrays';
import {migrationMediaOccurrences} from './migration_media_objects';
import {migrationServerSignature} from './migration_servers';
import {migrationJoinedPath} from './migration_server_routes';
import {requestOperation} from './execution';
import type {ReferenceGraph,GraphScope} from './reference_graph';
import type {Resource} from './engine';
import {escape,SourceError} from './document';
import {finiteServerUrls} from './server_semantics';
import {securityFlowOrder,securityRequirementAlternatives,type SecurityAlternativeProjection} from './security_requirements';
import type {MigrationLocation} from './migration_source';
import type {MigrationIssue} from './migration_schema';
import {migrationOperationUses} from './migration_operation_contexts';
import {ParameterSemantics,parameterStyle} from './parameter_semantics';
import {ignoresRequestBody} from './operation_semantics';
import {swaggerMedia,swaggerFlat} from './swagger_operation';
import {inactiveReservedExpansion} from './migration_object_metadata';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {isNativeFamily} from './specification';
import {migrationExampleBytes} from './migration_examples';
import {runtimeMediaKind} from './runtime_media';
import {inactiveMigrationHeader} from './migration_media_schema';
import type {ParameterWireProfiles} from './migration_parameter_serialization';

export type MigrationOperationPair=Readonly<{before:ReturnType<ReferenceGraph['operations']>[number];after:ReturnType<ReferenceGraph['operations']>[number]}>;
/** Executable identity follows both captured operation and containing use.
 * Matching values or operationIds cannot authorize replacing one occurrence
 * with another. The bijection rejects lost, duplicated and extra operations. */
export function migrationOperationPairs(source:ReferenceGraph,target:ReferenceGraph,
 mapped:(location:MigrationLocation,scope:GraphScope|undefined)=>readonly MigrationLocation[],issue:MigrationIssue):MigrationOperationPair[] {
 const result:MigrationOperationPair[]=[],claimed=new Set<string>(),operations=target.operations();
 const wire=(operation:typeof operations[number])=>operation.customMethod?operation.method:operation.method.toUpperCase();
 const key=(operation:typeof operations[number],at:MigrationLocation)=>JSON.stringify([at.resource,at.pointer,wire(operation),operation.role]);
 const index=new Map<string,typeof operations[number][]>();let work=0;
 for(const operation of operations){const id=key(operation,operation.source),values=index.get(id)??[];values.push(operation);index.set(id,values);}
 for(const before of source.operations()){
  const owners=mapped(before.source,source.scopeAs(before.source.resource,before.source.pointer,'operation'));
  const items=new Set(mapped(before.pathItem,source.scopeAs(before.pathItem.resource,before.pathItem.pointer,'path-item')).map(at=>JSON.stringify([at.resource,at.pointer])));
  const candidates=new Map<string,typeof operations[number]>();
  for(const at of owners)for(const after of index.get(key(before,at))??[]){
   if(++work>2000000)throw new SourceError('limit.migration.operations','Operation identity proof exceeds 2000000 owner states');
   if(items.has(JSON.stringify([after.pathItem.resource,after.pathItem.pointer])))candidates.set(after.occurrence,after);
  }
  const matches=[...candidates.values()];
  if(matches.length!==1||claimed.has(matches[0]?.occurrence)){
   issue(before.source,'migration.invariant.operations','A captured operation has no unique target occurrence with its original method, role and semantic owners','implementation');continue;
  }
  const id=(graph:ReferenceGraph,operation:typeof operations[number])=>graph.docs.get(operation.source.resource)!.dataNode(operation.source.pointer)?.value?.operationId;
  if(id(source,before)!==id(target,matches[0]))issue(before.source,'migration.invariant.operation-id','A captured operation changed its operationId','implementation');
  claimed.add(matches[0].occurrence);result.push({before,after:matches[0]});
 }
 if(claimed.size!==operations.length)issue({resource:source.root,pointer:''},'migration.invariant.operations','The target contains an unclaimed or duplicated executable operation','implementation');
 return result;
}

/** The reviewed selector projection uses this invariant's captured bijection. */
export {projectMigrationServerSelections as proveMigrationServerSelections} from './migration_server_configuration';
export {proveMigrationParameterSerialization} from './migration_parameter_serialization';

/** Independently reusable Parameters and Headers need the same metadata proof
 * as executable occurrences. Literal history is not an active target owner. */
export function proveMigrationObjectMetadata(source:ReferenceGraph,target:ReferenceGraph,
    mapped:(location:MigrationLocation,scope:GraphScope)=>readonly MigrationLocation[],issue:MigrationIssue,
    wire?:Readonly<{before:ParameterWireProfiles;after:ParameterWireProfiles}>):void {
    const headerTargets=new Set(source.entryReferences().filter(edge=>edge.kind==='header'&&edge.resolution==='resolved')
        .map(edge=>JSON.stringify([edge.targetResource,edge.targetPointer])));
    const parameters=new ParameterSemantics(source);
    const profile=(graph:ReferenceGraph,scope:GraphScope):string=>{
        const proved=(graph===source?wire?.before:wire?.after)?.get(JSON.stringify([scope.resource,scope.pointer]));
        if(proved!==undefined)return proved;
        const seen=new Set<string>();
        while(true){
            const id=JSON.stringify([scope.resource,scope.pointer]);
            if(seen.has(id)||seen.size>=128)throw new SourceError('migration.invariant.object-reference','A metadata proof has no bounded concrete owner');
            seen.add(id);const edge=graph.referenceAs(scope.resource,scope.pointer,'$ref',scope.kind);
            if(!edge)break;
            const next=edge.resolution==='resolved'&&graph.scopeAs(edge.targetResource!,edge.targetPointer!,scope.kind);
            if(!next)throw new SourceError('migration.invariant.object-reference','A metadata proof lost its captured reference target');
            scope=next;
        }
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.value;
        if(!isNativeFamily(scope.family))throw new SourceError('migration.invariant.object-family','The object metadata has no supported specification owner');
        const schema=graph.scopeAs(scope.resource,scope.pointer+'/schema','schema');
        const domains=schema?new MigrationSchemaProofs(graph).domains(schema):new Set([value.type]);
        const serialization=scope.family==='2.0'?swaggerFlat(value,{resource:scope.resource,pointer:scope.pointer,range:[0,0]}):
            parameterStyle(scope.family,value.in,value.content?{}:value);
        return JSON.stringify({name:scope.kind==='parameter'?value.name:undefined,in:scope.kind==='parameter'?value.in:undefined,
            required:value.required===true||scope.kind==='parameter'&&value.in==='path',deprecated:value.deprecated===true,
            allowEmptyValue:scope.kind==='parameter'&&value.in==='query'&&value.allowEmptyValue===true,
            style:serialization.style,explode:serialization.style!=='simple'&&(domains.has('array')||domains.has('object'))&&serialization.explode,
            allowReserved:scope.kind==='parameter'&&value.in==='query'&&!value.content&&value.allowReserved===true&&!inactiveReservedExpansion(graph,scope)});
    };
    for(const scope of source.entryScopes())if(scope.kind==='parameter'||scope.kind==='header'){
        // Body/form Parameter identity changes belong to the existing operation
        // applicability and media proof, including occurrence-specific forms.
        const value=source.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(scope.kind==='parameter'&&scope.family==='2.0'&&['body','formData'].includes(parameters.occurrence(scope).location??value?.in))continue;
        if(scope.kind==='header'&&inactiveMigrationHeader(source,scope)&&!headerTargets.has(JSON.stringify([scope.resource,scope.pointer])))continue;
        const actual=mapped(scope,scope).map(at=>target.scopeAs(at.resource,at.pointer,scope.kind)).filter((scope):scope is GraphScope=>scope!==undefined&&target.isEntryUse(scope));
        if(!actual.length||actual.some(at=>profile(source,scope)!==profile(target,at)))
            issue(scope,'migration.invariant.object-metadata','A Parameter or Header changed its location, requiredness, deprecation or serialization instructions','implementation');
    }
}

/** Supplement executable request signatures with the same media/applicability
 * rules at independently referenced Operations, reusable Path Items, callbacks
 * and webhooks. Static connections and schema/resource proofs remain separate;
 * a detached operation is never made executable just to obtain a request plan. */
export function proveMigrationOperationMedia(source:ReferenceGraph,target:ReferenceGraph,
    mapped:(location:MigrationLocation,scope:GraphScope)=>readonly MigrationLocation[],issue:MigrationIssue):void {
    let work=0;
    const profiles=(graph:ReferenceGraph)=>{
        const result=new Map<string,Set<string>>(),parameters=new ParameterSemantics(graph);
        const terminal=(at:MigrationLocation,kind:string):any=>{
            const seen=new Set<string>();
            for(let depth=0;depth<128;depth++){
                if(++work>2000000)throw new SourceError('limit.migration.owners','Operation media proof exceeds its bounded work');
                const id=JSON.stringify([at.resource,at.pointer]);
                if(seen.has(id))break;seen.add(id);
                const value=graph.docs.get(at.resource)?.dataNode(at.pointer)?.value;
                const edge=graph.referenceAs(at.resource,at.pointer,'$ref',kind);
                if(!edge)return value;
                if(edge.resolution!=='resolved')break;
                at={resource:edge.targetResource!,pointer:edge.targetPointer!};
            }
            throw new SourceError('migration.invariant.operation-reference','An operation media proof has no captured concrete owner');
        };
        const media=(values:readonly string[])=>[...new Set(values)].sort();
        for(const use of migrationOperationUses(graph)){
            const scope=use.source,value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.value;
            let body:unknown;
            if(scope.family==='2.0'){
                const entries=parameters.operation(scope.resource,scope.pointer,use.pathItem).visible;
                const declared=entries.find(parameter=>parameter.location==='body');
                const forms=entries.filter(parameter=>parameter.location==='formData');
                if(declared||forms.length)body={required:declared?terminal(declared.source,'parameter')?.required===true:
                    forms.some(parameter=>terminal(parameter.source,'parameter')?.required===true),media:media(swaggerMedia(graph,scope.resource,scope.pointer,'consumes'))};
            }else if(Object.hasOwn(value,'requestBody')&&!(use.method&&ignoresRequestBody(scope.family,use.method.toUpperCase()))){
                const declared=terminal({...scope,pointer:scope.pointer+'/requestBody'},'request-body');
                body={required:declared?.required===true,media:media(Object.keys(declared?.content??{}))};
            }
            const responses=Object.keys(value.responses??{}).filter(name=>!name.startsWith('x-')).sort().map(status=>{
                const declared=terminal({...scope,pointer:scope.pointer+'/responses/'+escape(status)},'response');
                const names=scope.family==='2.0'?Object.hasOwn(declared??{},'schema')?
                    [...swaggerMedia(graph,scope.resource,scope.pointer,'produces'),...Object.keys(declared.examples??{})]:[]:
                    Object.keys(declared?.content??{});
                return {status,media:media(names)};
            });
            const id=JSON.stringify([scope.resource,scope.pointer]),values=result.get(id)??new Set<string>();
            values.add(JSON.stringify({body,responses}));result.set(id,values);
        }
        return result;
    };
    const before=profiles(source),after=profiles(target);
    for(const scope of source.entryScopes())if(scope.kind==='operation'){
        const expected=before.get(JSON.stringify([scope.resource,scope.pointer]));
        const actual=new Set(mapped(scope,scope).flatMap(location=>[...after.get(JSON.stringify([location.resource,location.pointer]))??[]]));
        if(JSON.stringify([...expected??[]].sort())!==JSON.stringify([...actual].sort()))
            issue(scope,'migration.invariant.operation-media','The migrated operation changed captured request-body applicability, requiredness or request/response media','implementation');
    }
}

/** Project configured alternative indices through the same captured effective
 * request-operation owner. Intersect permissible target branches across uses;
 * invalid source selections must not become valid after array expansion. */
export function migrationSecurityAlternativeProjection(source:ReferenceGraph,target:ReferenceGraph,resources:Resource[],
    mapped:(location:MigrationLocation,scope:GraphScope|undefined)=>readonly MigrationLocation[]):SecurityAlternativeProjection {
    const choices=new Map<number,Set<number>>(),bounds:{before:number;after:number}[]=[];
    const seen=new Set<string>();let work=0;
    const captured:{array:MigrationLocation;requirements:readonly {source:MigrationLocation}[]}[]=[];
    for(const operation of source.operations().filter(operation=>operation.role==='operation')){
        const plan=requestOperation({root:source.root,resources,snapshot:'migration-security-alternatives',resource:operation.source.resource,
            pointer:operation.source.pointer,occurrence:operation.occurrence});
        const requirements=plan.security.requirements;
        if(!requirements.length)continue;
        const first=requirements[0].source,array={resource:first.resource,pointer:first.pointer.slice(0,first.pointer.lastIndexOf('/'))};
        captured.push({array,requirements});
    }
    // A declared root without request operations still retains its configured
    // authentication choice when subsequently used by a new operation.
    if(!captured.length){
        const array=source.docs.get(source.root)?.dataNode('/security');
        if(array?.kind==='array'&&array.children.size)captured.push({array:{resource:source.root,pointer:'/security'},requirements:
            [...array.children.values()].map(node=>({source:{resource:source.root,pointer:node.pointer}}))});
    }
    for(const {array,requirements}of captured){
        const id=JSON.stringify([array.resource,array.pointer]);
        if(seen.has(id))continue;seen.add(id);
        const arrays=mapped(array,source.scopeAs(array.resource,array.pointer,'security-array'));
        if(!arrays.length)throw new SourceError('migration.invariant.security-alternative','An effective security array lost its captured owner');
        for(const at of arrays){
            const node=target.docs.get(at.resource)?.dataNode(at.pointer);
            if(node?.kind!=='array')throw new SourceError('migration.invariant.security-alternative','An effective security owner is not a target requirement array');
            bounds.push({before:requirements.length,after:node.children.size});
        }
        for(const [index,requirement]of requirements.entries()){
            const at=requirement.source,locations=mapped(at,source.scopeAs(at.resource,at.pointer,'security-requirement'));
            let allowed:Set<number>|undefined;
            for(const array of arrays){
                const indices=new Set<number>();
                for(const location of locations){
                    if(++work>2000000)throw new SourceError('limit.migration.security','Authentication selection projection exceeds its bounded work');
                    if(location.resource!==array.resource||location.pointer.slice(0,location.pointer.lastIndexOf('/'))!==array.pointer)continue;
                    const tail=location.pointer.slice(location.pointer.lastIndexOf('/')+1);
                    if(/^\d+$/.test(tail))indices.add(Number(tail));
                }
                allowed=allowed===undefined?indices:new Set([...allowed].filter(index=>indices.has(index)));
            }
            const previous=choices.get(index);
            choices.set(index,previous?new Set([...previous].filter(index=>allowed!.has(index))):allowed!);
        }
    }
    return {choices,bounds};
}

function formSignatures(media:any,graph?:ReferenceGraph,namedTarget?:string):unknown {
    const type=media.mediaType.split(';')[0].trim().toLowerCase(),multipart=type==='multipart/form-data';
    if(!multipart&&type!=='application/x-www-form-urlencoded')return;
    if(multipart&&graph&&namedTarget&&media.family==='3.2'){
        const scope=graph.scopeAs(media.source.resource,media.source.pointer,'media');
        const c=scope&&new NamedMultipartEquivalence(graph).prove(scope,[media.mediaType],namedTarget).certificate;
        if(c){
            return namedMultipartFields(c).map(field=>{
                const rule=field.rule&&graph.docs.get(field.rule.resource)!.dataNode(field.rule.pointer)?.value;
                const part=field.parts[0];
                const fallback=part.literalType?formContentType({types:[part.literalType]},'3.2'):new PositionalEncodingEquivalence(graph).defaults(part.values,'3.2');
                return {name:field.name,mode:'content',array:true,contentType:rule?.contentType??fallback,required:field.required};
            }).sort((a,b)=>a.name.localeCompare(b.name));
        }
    }
    const content=(shape:any)=>shape?.defaultContentType??'text/plain';
    const signature=(name:string,shape:any,rule:any,styled:boolean)=>{
        const types=shape?.types??[],item=shape?.items??(shape?.prefixItems?.length===1?shape.prefixItems[0]:undefined);
        const singletonFile=multipart&&types.includes('array')&&shape.minItems===1&&shape.maxItems===1&&
            (!item?.types?.length||item?.types?.includes('string')&&item?.format==='binary')&&
            item?.contentEncoding===undefined&&content(item)==='application/octet-stream';
        const array=types.includes('array')&&!singletonFile,object=types.includes('object');
        const style=rule?.style??'form',explode=rule?.explode??(style==='form');
        if(styled&&(array||object))return {name,mode:'style',style,explode,allowReserved:multipart?false:rule?.allowReserved===true};
        const encoded=!multipart&&(shape?.contentEncoding!==undefined||shape?.format==='byte');
        const contentType=styled||encoded?'text/plain':rule?.contentType??content(array||singletonFile?item:shape);
        // Text-based array contents are repeated primitive fields. JSON
        // contents keep their media representation instead of becoming style.
        if(!multipart&&array&&contentType==='text/plain')return {name,mode:'style',style:'form',explode:true,allowReserved:false};
        return {name,mode:'content',array,contentType};
    };
    if(media.swaggerForm)return media.swaggerForm.map((parameter:any)=>{
        const array=parameter.type==='array',format=parameter.collectionFormat??'csv';
        const shape={types:[parameter.type],defaultContentType:parameter.type==='file'?'application/octet-stream':'text/plain',items:{defaultContentType:'text/plain'}};
        if(array&&!(multipart&&format==='multi'))return {...signature(parameter.name,shape,{style:format==='ssv'?'spaceDelimited':format==='pipes'?'pipeDelimited':'form',explode:format==='multi'},true),required:parameter.required===true};
        return {...signature(parameter.name,shape,undefined,false),required:parameter.required===true};
    }).sort((a:any,b:any)=>a.name.localeCompare(b.name));
    return Object.entries(media.form?.shape?.properties??{}).map(([name,shape])=>{
        const rule=media.encoding?.[name],styled=(!multipart||media.form.multipartStyle)&&['style','explode','allowReserved'].some(field=>Object.hasOwn(rule??{},field));
        // Repeated primitive form fields have the same decoded values as
        // content-based parts; the remaining style cases retain separators.
        const required=(media.form?.shape?.required??[]).includes(name);
        if(multipart&&styled&&(rule.style??'form')==='form'&&(rule.explode??true)===true)return {...signature(name,shape,{contentType:'text/plain'},false),required};
        return {...signature(name,shape,rule,styled),required};
    }).sort((a:any,b:any)=>a.name.localeCompare(b.name));
}

function effectiveUrl(value:string,path:string):string {
 const url=new URL(value);url.hash='';
 // Preserve template names and encoded segments as opaque route tokens.
 return url.href.slice(0,url.href.length-url.pathname.length-url.search.length)+migrationJoinedPath(url.pathname,path)+url.search;
}

/** Representation-sensitive checks supplement native target validation. The
 * signature contains API declarations, never environments or credentials. */
export function migrationRequestProfiles(graph:ReferenceGraph,resources:Resource[],wire?:ParameterWireProfiles,namedTarget?:string):ReadonlyMap<string,string> {
    const securityBindings=new Map(graph.references.filter(reference=>reference.connection==='security').map(reference=>[
        JSON.stringify([reference.resource,reference.pointer,reference.keyword]),reference]));
    return new Map(graph.operations().filter(operation=>operation.role==='operation').map(operation=>{
        const plan=requestOperation({root:graph.root,resources,snapshot:'migration-invariant',resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
        const normalize=(value:any):any=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).filter(name=>!['source','definition','base','origin','sources'].includes(name)).sort().map(name=>[name,normalize(value[name])])):value;
        const groups=new Map<string,Set<string>>();
        const parameters:any[]=plan.parameters.flatMap((parameter:any):any[]=>{
            const proved=wire?.get(JSON.stringify([parameter.definition.resource,parameter.definition.pointer]));
            if(proved!==undefined){
                const profile=JSON.parse(proved);
                if(profile.fields){
                    const names=groups.get(proved)??new Set<string>();
                    names.add(parameter.name);groups.set(proved,names);return [];
                }
                return [{wire:proved}];
            }
            const definition=graph.scopeAs(parameter.definition.resource,parameter.definition.pointer,'parameter');
            const schema=definition&&graph.scopeAs(definition.resource,definition.pointer+'/schema','schema');
            const domains=schema?new MigrationSchemaProofs(graph).domains(schema):new Set([parameter.type]);
            return [{name:parameter.name,in:parameter.in,required:parameter.required,deprecated:parameter.deprecated,
                allowEmptyValue:parameter.in==='query'&&parameter.allowEmptyValue,
                style:parameter.style,explode:parameter.style!=='simple'&&(domains.has('array')||domains.has('object'))?parameter.explode:false,
                allowReserved:parameter.in==='query'&&!parameter.content.length&&parameter.allowReserved&&
                    !(definition&&inactiveReservedExpansion(graph,definition))}];
        });
        for(const [proved,names]of groups){
            const expected=JSON.parse(proved).fields as string[];
            // One whole-query owner and its full target group share a profile.
            // A partial operation group must never collapse to that profile.
            const whole=plan.parameters.some((parameter:any)=>{
                if(wire?.get(JSON.stringify([parameter.definition.resource,parameter.definition.pointer]))!==proved)return false;
                if(parameter.in==='querystring')return true;
                const schema=parameter.in==='cookie'&&graph.scopeAs(parameter.definition.resource,parameter.definition.pointer+'/schema','schema');
                return schema&&new MigrationSchemaProofs(graph).domains(schema).has('object');
            });
            parameters.push(whole||expected.length===names.size&&expected.every(name=>names.has(name))?{wire:proved}:{incompleteGroup:proved,names:[...names].sort()});
        }
        parameters.sort((a:any,b:any)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const media=(values:any[])=>values.map(value=>value.mediaType).sort();
        const examples=(values:any[],includeSchema:boolean)=>values.map(value=>({mediaType:value.mediaType,
            values:[...new Set((value.examples??[]).filter((value:any)=>includeSchema||value.origin!=='schema')
                .map((example:any)=>example.wireBase64??migrationExampleBytes(runtimeMediaKind(value.mediaType)==='text'&&example.representation==='json'&&example.dataKind==='string'?example.text:example.raw,value.mediaType).toString('base64')))].sort()})).sort((a,b)=>a.mediaType.localeCompare(b.mediaType));
        // A 3.2 URI security key is a contract locator, rather than an HTTP
        // authentication name. Its relocation may change spelling. Keep
        // entry-component names, every declaration field and each required
        // scope/role attached to its own captured binding in the proof.
        const security={anonymous:plan.security.anonymous,requirements:plan.security.requirements.flatMap((requirement:any)=>{
            const choices=requirement.schemes.map((name:string)=>{
                const binding=securityBindings.get(JSON.stringify([requirement.source.resource,requirement.source.pointer,name]));
                if(!binding||binding.resolution!=='resolved')throw new SourceError('migration.invariant.security','A request signature has no captured security binding');
                // Spelling may become a component name on downgrade. The
                // independent connection proof retains the exact captured
                // definition; this proof retains ordered AND/OR bindings,
                // declarations and each distinct scope/role array.
                const declaration=Object.fromEntries(Object.entries(plan.security.schemes[name]).filter(([field])=>field!=='name'&&field!=='description'));
                if(declaration.type==='http'&&typeof declaration.scheme==='string')declaration.scheme=declaration.scheme.toLowerCase();
                const flows=declaration.type==='oauth2'?declaration.flows as Record<string,Record<string,unknown>>:undefined;
                const names=flows?securityFlowOrder.filter(name=>Object.hasOwn(flows,name)):[];
                return (names.length?names.map(name=>({...declaration,flows:{[name]:{...flows![name],
                    refreshUrl:flows![name].refreshUrl??flows![name].tokenUrl,
                    // Scope names are literal dictionary keys, including
                    // "source" and "definition". Tuple entries keep them out
                    // of the projection-location metadata normalizer.
                    scopes:Object.entries(flows![name].scopes??{}).sort(([a],[b])=>a<b?-1:a>b?1:0)}}})):[declaration])
                    .map(declaration=>({declaration,scopes:requirement.scopes[name]}));
            });
            return securityRequirementAlternatives(choices).map(schemes=>({schemes}));
        })};
        const finite=plan.servers.map(server=>finiteServerUrls(server,server.base));
        const effective=finite.every((values):values is readonly string[]=>values!==undefined)?{
            default:finite[0]?.[0]&&effectiveUrl(finite[0][0],operation.path),
            urls:[...new Set(finite.flat().map(url=>effectiveUrl(url,operation.path)))].sort(),
        }:{path:operation.path,servers:migrationServerSignature(plan.servers)};
        return [operation.occurrence,JSON.stringify(normalize({method:plan.operation.method,effective,
            parameters,security,body:plan.requestBody?{required:plan.requestBody.required,media:media(plan.requestBody.content),examples:examples(plan.requestBody.content,true),forms:plan.requestBody.content.map((value:any)=>({mediaType:value.mediaType,fields:formSignatures(value,graph,namedTarget)})).sort((a:any,b:any)=>a.mediaType.localeCompare(b.mediaType))}:undefined,
            responses:plan.responses.map((response:any)=>({status:response.status,headers:response.headers.map((header:any)=>({name:header.name,required:header.required})),bodyAllowed:response.bodyAllowed??response.content.length>0,media:response.bodyAllowed===false?[]:media(response.content),examples:response.bodyAllowed===false?[]:examples(response.content,true)}))}))] as const;
    }));
}

/** Stable aggregate used by independent regression controls. Production pairs
 * compare these same profiles by captured identity rather than by sort order. */
export function migrationRequestSignatures(graph:ReferenceGraph,resources:Resource[]):string[] {
 return [...migrationRequestProfiles(graph,resources).values()].sort();
}

/** Default certificates are re-derived from the delivered owners, after all
 * schema/binary conversions and reference repair. Schema invariants retain the
 * value language; this compares the positional media/byte interpretation. */
export function proveMigrationPositionalEncoding(source:ReferenceGraph,target:ReferenceGraph,
 mapped:(location:MigrationLocation,scope:GraphScope)=>readonly MigrationLocation[],issue:MigrationIssue):void {
 if(target.specifications.get(target.root)?.family==='3.2')return;
 const before=new PositionalEncodingEquivalence(source),after=new PositionalEncodingEquivalence(target);
 const bounds=new MigrationArrayBounds(source);
 for(const {use:scope,definition,mediaType}of migrationMediaOccurrences(source))if(scope.family==='3.2'){
  const value=source.docs.get(definition.resource)!.dataNode(definition.pointer)?.value;
  if(value?.prefixEncoding===undefined&&value?.itemEncoding===undefined)continue;
  const media=[mediaType];
  const outputs=mapped(scope,scope).map(at=>target.scopeAs(at.resource,at.pointer,'media')).filter((at):at is GraphScope=>!!at&&at.family!=='3.2');
  if(!outputs.length)issue(scope,'migration.invariant.positional-encoding','A captured multipart or inactive media occurrence has no delivered Media Type owner','implementation');
  if(!mediaType.split(';')[0].trim().toLowerCase().startsWith('multipart/')){
   // A consumer which ignores positional instructions cannot acquire the
   // named projection selected by a different consumer of the same definition.
   for(const at of outputs){
    const delivered=target.docs.get(at.resource)!.dataNode(at.pointer)?.value;
    if(delivered?.prefixEncoding!==undefined||delivered?.itemEncoding!==undefined)
     issue(scope,'migration.invariant.positional-encoding','An inactive positional declaration survived in an older Media Type occurrence','implementation');
    if(value?.encoding===undefined&&Object.keys(delivered?.encoding??{}).length)
     issue(scope,'migration.invariant.media-context','An inactive consumer acquired another occurrence\'s named Encoding rules','implementation');
    if(scope.resource!==definition.resource||scope.pointer!==definition.pointer){
     const schema=source.scopeAs(definition.resource,definition.pointer+'/schema','schema');
     if(schema){
      const neutral=mapped(schema,schema),edge=target.referenceAs(at.resource,at.pointer+'/schema','$ref','schema');
      if(edge?.resolution!=='resolved'||!neutral.some(owner=>owner.resource===edge.targetResource&&owner.pointer===edge.targetPointer))
       issue(scope,'migration.invariant.media-context','An inactive consumer lost its independent whole-content schema owner','implementation');
     }
    }
   }
   continue;
  }
  const schema=source.scopeAs(definition.resource,definition.pointer+'/schema','schema');
  const item=source.scopeAs(definition.resource,definition.pointer+'/itemSchema','schema');
  const fields=(['prefixEncoding','itemEncoding'] as const).filter(field=>Object.hasOwn(value??{},field)&&
   (schema||item||(field==='prefixEncoding'?value[field]:[value[field]]).some((rule:Record<string,unknown>)=>Object.keys(rule).length)));
  if(!fields.length&&!(media.some(type=>type.split(';')[0].trim().toLowerCase()==='multipart/form-data')&&
   (value?.prefixEncoding!==undefined||value?.itemEncoding!==undefined)))continue;
  const maximum=schema?bounds.maximum(schema):undefined;
  for(const output of outputs){
   if(proveNamedMultipartOutput(source,target,scope,output,mapped,issue,media))continue;
   const targetValue=target.docs.get(output.resource)!.dataNode(output.pointer)?.value;
   if(Object.keys(targetValue?.encoding??{}).length)issue(scope,'migration.invariant.positional-encoding','The delivered unnamed multipart owner activates a named Encoding rule','implementation');
   for(const field of fields){
    const proof=before.prove(definition,field,media,output.family,scope);
    if(!proof.equivalent){issue(scope,'migration.invariant.positional-encoding',proof.reason,'implementation');continue;}
    if(Object.hasOwn(targetValue??{},field)){
     issue(scope,'migration.invariant.positional-encoding','An older target retains an active positional Encoding declaration','implementation');continue;
    }
    if(proof.inactive)continue;
    const a=before.boundary(definition),b=after.boundary(output);
    if(a===undefined||b===undefined){issue(scope,'migration.invariant.positional-encoding','Delivered schemas no longer establish the positional default partition','implementation');continue;}
    const prefix=value.prefixEncoding?.length??0;
    const end=Math.max(a,b,prefix)+1;
    for(let index=0;index<end&&(maximum===undefined||index<maximum);index++){
     const rule=index<prefix?value.prefixEncoding[index]:value.itemEncoding;
     const expected=rule?.contentType??before.defaultAt(definition,index,'3.2'),actual=after.defaultAt(output,index,output.family);
     if(expected===undefined||expected!==actual){
      issue(scope,'migration.invariant.positional-encoding','A delivered part changed its effective positional media or encoded representation','implementation');break;
     }
    }
   }
  }
 }
}
