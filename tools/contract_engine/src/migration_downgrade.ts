import type {GraphScope,ReferenceGraph} from './reference_graph';
import {MigrationSource} from './migration_source';
import type {MigrationIssue} from './migration_schema';
import {escape,SourceError} from './document';
import {downgradeFormBody} from './migration_form_downgrade';
import {formBinding} from './form_semantics';
import {isNativeFamily,modernFamily} from './specification';
import {securityFlowOrder} from './security_requirements';
import {MigrationSchemaOwners} from './migration_schema_owners';
import {materializeFlatSchema} from './migration_flat_items';
import {commonMediaSchema,retainFormHeaderOwners} from './migration_media_schema';

/** Inspect a captured Schema reference chain before a Header/parameter loses
 * its schema wrapper. A referenced object is just as unrepresentable in a
 * Swagger flat Header as a directly declared object. No target role may be
 * invented by moving a schema $ref into a Header Reference Object position. */
function flatSchema(graph:ReferenceGraph,owner:GraphScope):unknown {
    let scope=graph.scopeAs(owner.resource,owner.pointer+'/schema','schema');
    const seen=new Set<string>();
    while(scope){
        const identity=scope.resource+'#'+scope.pointer;
        if(seen.has(identity))return;
        if(seen.size>=128)throw new SourceError('limit.migration.header','Flat schema inspection exceeds 128 references');
        seen.add(identity);
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        const reference=graph.referenceAs(scope.resource,scope.pointer,'$ref','schema');
        if(!reference)return value;
        if(modernFamily(scope.family)&&Object.keys(value).some(name=>name!=='$ref'))return value;
        if(reference.resolution!=='resolved')return;
        scope=graph.scopeAs(reference.targetResource!,reference.targetPointer!,'schema');
    }
}

function retainMediaAlternatives(source:MigrationSource,pointer:string,media:readonly string[],graph:ReferenceGraph,owners:MigrationSchemaOwners,selected:string):void {
    for(const name of media.filter(name=>name!==selected)){
        const at=pointer+'/content/'+escape(name)+'/schema';
        const captured=owners.capturedSchema({resource:source.doc.id,pointer:at});
        if(captured)owners.move(captured,source,at,'media_alternative',{context:owners.contextOf(captured)??graph,layout:'array-item'});
    }
}

function retireFormBody(source:MigrationSource,pointer:string):void {
    if(pointer)source.remove(pointer);
    else {
        source.set('',{});
        for(const locations of source.originSets())locations.clear();
    }
}

function retainFormBodyHistory(source:MigrationSource,pointer:string,scope:GraphScope,owners:MigrationSchemaOwners):void {
    if(pointer){owners.retainLiteralValue(scope,source,pointer,'form_body',true);return;}
    const retained=owners.reserveSchema(scope,'form_body');
    retained.source.copy(source,'',retained.location.pointer+'/x-busyapi-retained-value',true);
    retireFormBody(source,'');
}

/** Evaluate actual target representation. A simple 3.x API can be faithfully
 * represented in Swagger; newer-only constructs receive located blockers. */
export function downgradeSwagger(graph:ReferenceGraph,sources:Map<string,MigrationSource>,from:string,issue:MigrationIssue,
    releaseNativeHolders?:()=>void,owners=new MigrationSchemaOwners(graph,sources)):void {
    // Capture and relocate every operation's body before processing reusable
    // definitions. A form Request Body reference expands to several Parameters;
    // it cannot survive as a reference to one misleading body Parameter.
    const formUses=new Map<string,{source:MigrationSource;pointer:string}[]>(),preparedOperations=new Set<string>();
    for(const operation of graph.operations()){
        const scope=graph.scope(operation.source.resource,operation.source.pointer);if(scope.family!==from)continue;
        const id=scope.resource+'#'+scope.pointer;if(preparedOperations.has(id))continue;preparedOperations.add(id);
        const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer),body=source.current(scope.pointer+'/requestBody');
        if(pointer===undefined||body===undefined)continue;
        if(!source.doc.dataNode(pointer+'/parameters'))source.set(pointer+'/parameters',[]);
        const destination=pointer+'/parameters/'+source.doc.node(pointer+'/parameters').children.size;
        source.move(body,destination);
        let request=graph.scopeAs(scope.resource,scope.pointer+'/requestBody','request-body');const seen=new Set<string>();
        while(request){
            const id=request.resource+'#'+request.pointer;
            if(seen.has(id)||seen.size>=128){issue(request,'migration.body.reference','The body reference chain has no bounded concrete owner','source-incomplete');request=undefined;break;}
            seen.add(id);const value=graph.docs.get(request.resource)!.dataNode(request.pointer)?.value;
            if(typeof value?.$ref!=='string')break;
            const ref=graph.referenceAs(request.resource,request.pointer,'$ref','request-body');
            request=ref?.resolution==='resolved'?graph.scopeAs(ref.targetResource!,ref.targetPointer!,'request-body'):undefined;
        }
        if(!request)continue;
        const value=graph.docs.get(request.resource)!.dataNode(request.pointer)!.value;
        if(value?.content)source.set(pointer+'/consumes',Object.keys(value.content));
        if(Object.keys(value?.content??{}).some(media=>formBinding(scope.family as '3.0'|'3.1'|'3.2',media)!==undefined)){
            const id=request.resource+'#'+request.pointer,uses=formUses.get(id)??[];
            if(!uses.some(use=>use.source===source&&use.pointer===destination))uses.push({source,pointer:destination});
            formUses.set(id,uses);
        }
    }
    const expandedForms=new Set<string>();
    for(const scope of graph.scopes.values()){
        if(scope.family!==from)continue;
        const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);if(pointer===undefined)continue;
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.value;
        if(scope.kind==='parameter'||scope.kind==='header'){
            let declaration=value,schemaOwner=scope;
            if(typeof value?.$ref==='string'){
                if(scope.kind==='parameter')continue;
                const seen=new Set<string>();let target:GraphScope|undefined=scope;
                while(target&&typeof graph.docs.get(target.resource)!.dataNode(target.pointer)?.value?.$ref==='string'){
                    const id=target.resource+'#'+target.pointer;
                    if(seen.has(id)||seen.size>=128){target=undefined;break;}seen.add(id);
                    const ref=graph.referenceAs(target.resource,target.pointer,'$ref','header');
                    target=ref?.resolution==='resolved'?graph.scopeAs(ref.targetResource!,ref.targetPointer!,'header'):undefined;
                }
                if(!target){issue(scope,'migration.header.reference','The captured Header chain has no bounded concrete target','source-incomplete');continue;}
                const material=owners.uniqueLocation(target);
                owners.materializeHeaderUse(scope,source,pointer,material.source,material.location.pointer);
                declaration=graph.docs.get(target.resource)!.dataNode(target.pointer)!.value;schemaOwner=target;
            }
            if(declaration.content||scope.kind==='parameter'&&declaration.in==='cookie')issue(scope,'migration.parameter.representation','This parameter representation has no implemented faithful Swagger mapping','implementation');
            const style=declaration.style??(['query','cookie'].includes(declaration.in)?'form':'simple'),explode=declaration.explode??style==='form';
            const shape=flatSchema(graph,schemaOwner) as {type?:unknown}|undefined;
            if(shape?.type==='object'||Array.isArray(shape?.type)){
                issue(scope,'migration.parameter.type','Swagger flat parameters cannot represent this schema type','target-representation');continue;
            }
            const type=source.doc.dataNode(pointer+'/schema')?
                materializeFlatSchema(graph,sources,owners,source,pointer+'/schema',scope,issue,graph.scopeAs(schemaOwner.resource,schemaOwner.pointer+'/schema','schema')):
                source.doc.dataNode(pointer+'/type')?.value;
            if(type===undefined){if(!declaration.content)issue(scope,'migration.parameter.schema','Swagger requires a concrete flat primitive declaration','implementation');continue;}
            if(type==='array'){
                const format=style==='simple'?'csv':style==='form'?explode?'multi':'csv':style==='spaceDelimited'?'ssv':style==='pipeDelimited'?'pipes':undefined;
                if(!format||format==='multi'&&!['query','formData'].includes(declaration.in))issue(scope,'migration.parameter.style','This style/explode combination cannot be faithfully represented by Swagger collectionFormat','target-representation');
                else source.set(pointer+'/collectionFormat',format);
            }else if(!['simple','form'].includes(style))issue(scope,'migration.parameter.style','This primitive parameter serialization is unavailable in Swagger','target-representation');
            const schema=source.doc.dataNode(pointer+'/schema');
            if(schema?.kind==='object'){
                for(const name of [...schema.children.keys()]){
                    const from=pointer+'/schema/'+escape(name),to=pointer+'/'+escape(name);
                    if(source.doc.dataNode(to)){
                        if(source.doc.dataJson(from)!==source.doc.dataJson(to)){
                            issue(scope,'migration.parameter.annotation-collision','The Schema Object and flat declaration have different '+name+' values with no single faithful target field','target-representation');continue;
                        }
                        source.associate(source,from,to);source.remove(from,true,true,true);
                    }else source.move(from,to);
                }
                source.remove(pointer+'/schema');
            }else if(!declaration.content&&!source.doc.dataNode(pointer+'/type'))issue(scope,'migration.parameter.schema','Swagger requires a concrete flat primitive declaration','implementation');
            for(const name of ['style','explode'])source.remove(pointer+'/'+name);
            for(const name of ['deprecated','allowReserved','example','examples'])if(Object.hasOwn(declaration,name))issue({...schemaOwner,pointer:schemaOwner.pointer+'/'+name},'migration.parameter.metadata','This authored parameter field needs an explicit Swagger mapping','implementation');
        }
        if(scope.kind==='request-body'&&typeof value?.$ref!=='string'){
            const family=scope.family;
            if(!isNativeFamily(family)){issue(scope,'migration.body.family','This request body has no supported owning specification family','source-incomplete');continue;}
            const content=source.doc.dataNode(pointer+'/content'),media=[...content?.children.keys()??[]];
            if(!media.length){issue(scope,'migration.body.content','A Swagger body needs a schema-bearing representation','implementation');continue;}
            if(media.some(name=>formBinding(family,name)!==undefined)){
                if(media.some(name=>!['application/x-www-form-urlencoded','multipart/form-data'].includes(name.split(';')[0].trim().toLowerCase()))){issue(scope,'migration.body.form-media','Swagger cannot combine a body parameter and formData parameters or describe generic multipart field framing','target-representation');continue;}
                const uses=formUses.get(scope.resource+'#'+scope.pointer)??[];
                expandedForms.add(scope.resource+'#'+scope.pointer);
                const inline=uses.some(use=>use.source===source&&use.pointer===pointer);
                if(inline){downgradeFormBody(graph,source,scope,pointer,media[0],issue,owners,sources);continue;}
                retainFormHeaderOwners(graph,owners,source,scope,pointer);
                for(const name of media){
                    const at=pointer+'/content/'+escape(name)+'/schema',schema=owners.capturedSchema({resource:scope.resource,pointer:at});
                    if(schema){
                        const retained=owners.move(schema,source,at,'reusable_form_schema',{context:owners.contextOf(schema)??graph,layout:'array-item'});
                        // This generated edge has no authored locator. Keep
                        // the old $ref's provenance on its neutral schema and
                        // use the allocator's final target-family spelling.
                        source.set(at,{$ref:owners.reference(retained,'2.0')});
                    }
                }
                const captured=source.fork();
                for(const use of uses){
                    use.source.remove(use.pointer);
                    use.source.copy(captured,pointer,use.pointer,true);
                    downgradeFormBody(graph,use.source,scope,use.pointer,media[0],issue,owners,sources);
                }
                retainFormBodyHistory(source,pointer,scope,owners);
                continue;
            }
            const selected=commonMediaSchema(graph,sources,owners,source,pointer,scope,media);
            if(selected===undefined){issue(scope,'migration.body.media-schema','Swagger has one body schema; no common captured schema certificate establishes these representations','unavailable-proof');continue;}
            retainMediaAlternatives(source,pointer,media,graph,owners,selected);
            source.move(pointer+'/content/'+escape(selected)+'/schema',pointer+'/schema');
            if(media.some(name=>Object.keys(value.content[name]).some(field=>field!=='schema')))issue(scope,'migration.body.media-metadata','Request media annotations/examples need an explicit Swagger representation','implementation');
            source.remove(pointer+'/content');source.set(pointer+'/name','body');source.set(pointer+'/in','body');
        }
        if(scope.kind==='operation'){
            const represented:string[][]=[];
            for(const name of Object.keys(value.responses??{}).filter(name=>!name.startsWith('x-'))){
                let response=value.responses[name],at={resource:scope.resource,pointer:scope.pointer+'/responses/'+escape(name)};
                const seen=new Set<string>();
                while(typeof response?.$ref==='string'){
                    const id=at.resource+'#'+at.pointer;
                    if(seen.has(id)||seen.size>=128){issue(at,'migration.response.reference','The response media has no bounded concrete owner','source-incomplete');break;}
                    seen.add(id);const reference=graph.referenceAs(at.resource,at.pointer,'$ref','response');
                    if(reference?.resolution!=='resolved'){issue(at,'migration.response.reference','The response media binding was not captured','source-incomplete');break;}
                    at={resource:reference.targetResource!,pointer:reference.targetPointer!};response=graph.docs.get(at.resource)!.dataNode(at.pointer)!.value;
                }
                const media=Object.keys(response?.content??{}).sort();
                // A bodyless status has no schema in Swagger and therefore
                // does not acquire a body from operation-wide produces.
                if(media.length)represented.push(media);
            }
            if(represented.some(media=>JSON.stringify(media)!==JSON.stringify(represented[0])))issue(scope,'migration.response.media-context','Different response media sets need a status-specific Swagger representation that its global produces field cannot supply','target-representation');
            else if(represented[0]?.length)source.set(pointer+'/produces',represented[0]);
            if(value.callbacks)issue({...scope,pointer:scope.pointer+'/callbacks'},'migration.callbacks','Swagger has no standard Callback Object representation','target-representation');
        }
        if(scope.kind==='response'&&typeof value?.$ref!=='string'){
            const media=Object.keys(value.content??{}),selected=commonMediaSchema(graph,sources,owners,source,pointer,scope,media);
            if(media.length&&selected===undefined){issue(scope,'migration.response.media-schema','Swagger has one response schema; no common captured schema certificate establishes these representations','unavailable-proof');continue;}
            if(selected!==undefined){
                retainMediaAlternatives(source,pointer,media,graph,owners,selected);
                source.move(pointer+'/content/'+escape(selected)+'/schema',pointer+'/schema');
            }
            for(const name of media){
                const at=pointer+'/content/'+escape(name),value=source.doc.dataNode(at)?.value;
                if(Object.hasOwn(value??{},'example'))source.move(at+'/example',pointer+'/examples/'+escape(name));
                if(value?.examples)issue({...scope,pointer:scope.pointer+'/content/'+escape(name)+'/examples'},'migration.response.named-examples','Swagger permits one payload per media type; select an authored example explicitly','implementation');
            }
            source.remove(pointer+'/content');
            if(value.links)issue({...scope,pointer:scope.pointer+'/links'},'migration.links','Swagger has no standard Link Object representation','target-representation');
        }
        if(scope.kind==='security'){
            if(value.type==='http'&&value.scheme?.toLowerCase()==='basic'){source.set(pointer+'/type','basic');source.remove(pointer+'/scheme');}
            else if(value.type==='oauth2'){
                const flows=securityFlowOrder.filter(name=>Object.hasOwn(value.flows??{},name));
                if(Object.keys(value.flows??{}).some(name=>name.startsWith('x-')))
                    issue({...scope,pointer:scope.pointer+'/flows'},'migration.security.flow-metadata','Swagger has no OAuth Flows Object in which to retain this authored extension','target-representation');
                if(flows.length!==1){issue(scope,'migration.security.flows',flows.length?'The OAuth flow specialization did not produce a single captured flow':'Swagger requires one declared OAuth flow; an unspecified acquisition mechanism cannot be invented',flows.length?'implementation':'target-representation');continue;}
                const flow=flows[0],name=({implicit:'implicit',password:'password',clientCredentials:'application',authorizationCode:'accessCode'} as Record<string,string>)[flow];
                if(!name){issue(scope,'migration.security.flow','Swagger cannot express this OAuth flow','target-representation');continue;}
                source.set(pointer+'/flow',name);
                for(const field of ['authorizationUrl','tokenUrl','scopes'])if(source.doc.nodes.has(pointer+'/flows/'+flow+'/'+field))source.move(pointer+'/flows/'+flow+'/'+field,pointer+'/'+field);
                if(Object.hasOwn(value.flows[flow],'refreshUrl')&&value.flows[flow].refreshUrl!==value.flows[flow].tokenUrl)issue(scope,'migration.security.refresh','A distinct OAuth refresh endpoint is not described by Swagger','target-representation');
                for(const name of Object.keys(value.flows[flow]).filter(name=>name.startsWith('x-')))
                    issue({...scope,pointer:scope.pointer+'/flows/'+flow+'/'+name},'migration.security.flow-metadata','Swagger has no OAuth Flow Object in which to retain this authored extension','target-representation');
                source.remove(pointer+'/flows');
            }else if(value.type!=='apiKey')issue(scope,'migration.security.type','Swagger has no equivalent standard security scheme for this authentication type','target-representation');
            if(value.type==='apiKey'&&!['query','header'].includes(value.in))issue(scope,'migration.security.location','Swagger API keys must be query or header parameters','target-representation');
        }
    }
    // All occurrences of form reference chains now own flat parameters. Their
    // intermediate Request Body wrappers have no Swagger Parameter equivalent.
    for(const scope of graph.scopes.values())if(scope.family===from&&scope.kind==='request-body'){
        let target:GraphScope|undefined=scope;const seen=new Set<string>();
        while(target){
            const id=target.resource+'#'+target.pointer;if(seen.has(id)||seen.size>=128)break;seen.add(id);
            if(expandedForms.has(id)){
                const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);
                if(pointer!==undefined&&source.doc.dataNode(pointer)&&typeof source.doc.dataNode(pointer)!.value?.$ref==='string')retireFormBody(source,pointer);
                break;
            }
            const ref=graph.referenceAs(target.resource,target.pointer,'$ref','request-body');
            target=ref?.resolution==='resolved'?graph.scopeAs(ref.targetResource!,ref.targetPointer!,'request-body'):undefined;
        }
    }
    // Swagger has no Header component map or Header Reference Object. Retain
    // independent native owners in unused, standard Response.headers slots.
    for(const scope of graph.scopes.values())if(scope.family===from&&scope.kind==='header'&&scope.pointer.startsWith('/components/headers/')&&
        scope.pointer.slice('/components/headers/'.length).indexOf('/')<0){
        const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);if(pointer===undefined||!source.doc.dataNode(pointer))continue;
        owners.move(scope,source,pointer,'header_owner',{context:owners.contextOf(scope)??graph,layout:'response-header'});
    }
    releaseNativeHolders?.();
    for(const [resource,specification]of graph.specifications){
        if(specification.family!==from)continue;
        const source=sources.get(resource)!,servers=source.doc.dataNode('/servers')?.value;
        const headerMap=source.doc.dataNode('/components/headers');
        if(headerMap){
            for(const name of [...headerMap.children.keys()])if(name.startsWith('x-')){
                const pointer='/components/headers/'+escape(name);
                owners.retainLiteralValue({resource,pointer},source,pointer,'header_map_extension',true);
            }
            if(!source.doc.dataNode('/components/headers')?.children.size){owners.admit(source);source.remove('/components/headers',true,true,true);}
        }
        if(servers!==undefined){
            if(!Array.isArray(servers)||servers.length!==1||servers[0].variables){issue({resource,pointer:'/servers'},'migration.servers','Swagger needs one fixed host/basePath; these Server choices cannot be collapsed faithfully','target-representation');}
            else {
                const url=new URL(servers[0].url,graph.retrievals.get(resource));
                if(!['http:','https:','ws:','wss:'].includes(url.protocol)||!url.host||url.search||url.hash||url.username||url.password)issue({resource,pointer:'/servers/0/url'},'migration.server.url','This Server URL cannot be expressed by Swagger host/basePath/schemes','target-representation');
                else {source.set('/host',url.host);source.set('/basePath',url.pathname);source.set('/schemes',[url.protocol.slice(0,-1)]);source.remove('/servers');}
            }
        }
        for(const [from,to]of [['schemas','definitions'],['parameters','parameters'],['responses','responses'],['securitySchemes','securityDefinitions']])if(source.doc.nodes.has('/components/'+from))source.move('/components/'+from,'/'+to);
        if(source.doc.dataNode('/components/requestBodies')){
            source.ensure('/parameters');
            for(const name of [...source.doc.node('/components/requestBodies').children.keys()])source.move('/components/requestBodies/'+escape(name),'/parameters/'+escape(name));
            source.remove('/components/requestBodies');
        }
        const components=source.doc.dataNode('/components');
        if(components?.children.size)issue({resource,pointer:'/components'},'migration.components','These reusable component families need an additional Swagger representation','implementation');
        else source.remove('/components');
        for(const name of ['webhooks','$self'])if(source.doc.nodes.has('/'+name))issue({resource,pointer:'/'+name},'migration.root.field','This document feature needs a faithful Swagger mapping','implementation');
        source.remove('/openapi');source.set('/swagger','2.0');
    }
}
