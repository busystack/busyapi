import {finiteServerVariableValues} from './server_semantics';
import {requestOperation} from './execution';
import type {ReferenceGraph,GraphScope} from './reference_graph';
import type {Resource} from './engine';
import {serverTemplate} from './derived_bundle';
import {escape,SourceError} from './document';
import {securityFlowOrder,securityRequirementAlternatives,type SecurityAlternativeProjection} from './security_requirements';
import type {MigrationLocation} from './migration_source';
import type {MigrationIssue} from './migration_schema';
import {migrationOperationUses} from './migration_operation_contexts';
import {ParameterSemantics} from './parameter_semantics';
import {ignoresRequestBody} from './operation_semantics';
import {swaggerMedia} from './swagger_operation';

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

function formSignatures(media:any):unknown {
    const type=media.mediaType.split(';')[0].trim().toLowerCase(),multipart=type==='multipart/form-data';
    if(!multipart&&type!=='application/x-www-form-urlencoded')return;
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

/** Representation-sensitive checks supplement native target validation. The
 * signature contains API declarations, never environments or credentials. */
export function migrationRequestSignatures(graph:ReferenceGraph,resources:Resource[]):string[] {
    const securityBindings=new Map(graph.references.filter(reference=>reference.connection==='security').map(reference=>[
        JSON.stringify([reference.resource,reference.pointer,reference.keyword]),reference]));
    return graph.operations().filter(operation=>operation.role==='operation').map(operation=>{
        const plan=requestOperation({root:graph.root,resources,snapshot:'migration-invariant',resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
        const normalize=(value:any):any=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).filter(name=>!['source','definition','base','origin','sources'].includes(name)).sort().map(name=>[name,normalize(value[name])])):value;
        const parameters=plan.parameters.map((parameter:any)=>({name:parameter.name,in:parameter.in,required:parameter.required,
            style:parameter.style,explode:['array','object'].includes(parameter.type)?parameter.explode:false,allowReserved:parameter.allowReserved})).sort((a:any,b:any)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const media=(values:any[])=>values.map(value=>value.mediaType).sort();
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
        return JSON.stringify(normalize({method:plan.operation.method,path:plan.operation.path,
            servers:plan.servers.map((server:any)=>{
                const source=server.urlSource??server.source;
                const variables=Object.fromEntries(Object.entries(server.variables).map(([name,definition])=>{
                    if(definition===null||typeof definition!=='object'||Array.isArray(definition))throw new Error('Expected captured Server variable semantics');
                    const choices=finiteServerVariableValues(definition);
                    return [name,{...Object.fromEntries(Object.entries(definition).filter(([field])=>field!=='enum'&&field!=='defaultOutsideEnumAllowed')),...(choices?{enum:[...choices].sort()}: {})}];
                }));
                return {url:serverTemplate(server.url,server.base,server.variables,source),variables:Object.entries(variables).sort(([a],[b])=>a<b?-1:a>b?1:0)};
            }),
            parameters,security,body:plan.requestBody?{required:plan.requestBody.required,media:media(plan.requestBody.content),forms:plan.requestBody.content.map((value:any)=>({mediaType:value.mediaType,fields:formSignatures(value)})).sort((a:any,b:any)=>a.mediaType.localeCompare(b.mediaType))}:undefined,
            responses:plan.responses.map((response:any)=>({status:response.status,headers:response.headers.map((header:any)=>({name:header.name,required:header.required})),bodyAllowed:response.bodyAllowed??response.content.length>0,media:response.bodyAllowed===false?[]:media(response.content)}))}));
    }).sort();
}
