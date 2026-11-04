import type {ExternalExampleResourcePacket} from './external_examples';
import {externalExampleRequests} from './external_examples';
import {assertRoleAnnotations} from './schema_role_annotations';
import {createHash} from 'node:crypto';
import {analyse,createGraph,Resource} from './engine';
import {SourceDocument,SourceError,escape,segments} from './document';
import {specificationDeclaration,modernFamily} from './specification';
import {MigrationSource,MigrationLocation,migrationValueIdentity,migrationLocations} from './migration_source';
import {migrateSchemas,MigrationProblem,MigrationIssue,type MigrationChoose,type MigrationIssueLocation} from './migration_schema';
import {upgradeSwagger} from './migration_swagger';
import {downgradeSwagger} from './migration_downgrade';
import {evaluateSchemas} from './schema_evaluation';
import {referenceValue} from './reference_choices';
import {coldGraph} from './reference_selection';
import {documentUriBase,resolveUri,pointerFragment as fragment,type GraphScope,type GraphReference} from './reference_graph';
import {documentUriOccurrences} from './document_uris';
import {serverTemplate} from './derived_bundle';
import {captureMigrationMarkdown,rewriteMigrationMarkdown,proveMigrationMarkdown} from './migration_markdown';
import {migrationRequestSignatures} from './migration_invariants';
import {migrateEncodings} from './migration_encoding';
import {migrateBinarySchemas} from './migration_binary';
import {checkOperationTarget,checkRequestBodyTarget,migrateOperationBodies} from './migration_operation';
import {checkSecurityRequirementTarget} from './migration_security';
import {migrationDocumentContexts,migrationScopes,migrationReferences,proveMigrationConnections} from './migration_documents';
import {migrationBatches,entryMigrationRoutes,type MigrationBatch} from './migration_routes';
import {MigrationAccess} from './migration_access';
import {migrateDirectionalSchemas} from './migration_direction';
import {migrateDiscriminatorDefaults} from './migration_discriminator_defaults';
import {migrateDocumentIdentities} from './migration_identity';
import {migrateRequiredPresence} from './migration_required_presence';
import {migrateSwaggerDiscriminators} from './migration_discriminator';
import {MigrationExamples,proveMigrationExamples,type MigrationExampleCopy} from './migration_examples';
import {migrateTerms} from './migration_terms';
import {migrateServerVariableDefaults,retainDefaultServers} from './migration_servers';
import {migrationLogicalPointers} from './migration_yaml_ownership';
import {separateMigrationRoles,separateMigrationEntryUses,materializeMigrationOperationConnections} from './migration_schema_uses';
import {MigrationSchemaOwners,MigrationSemanticOrigins} from './migration_schema_owners';
import {projectSchemaReference} from './schema_reference_projection';

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const migrationProducerVersion='69';
const key=(resource:string,pointer:string)=>JSON.stringify([resource,pointer]);
const referenceLocator=(reference:GraphReference)=>!reference.connection&&['$ref','$dynamicRef'].includes(reference.keyword)||
    reference.connection==='operationRef'&&reference.keyword==='operationRef';
const patch:Record<string,string>={'2.0':'2.0','3.0':'3.0.4','3.1':'3.1.2','3.2':'3.2.1'};
export type MigrationInput=Readonly<{
    root:string;
    snapshot:string;
    resources:Resource[];
    exampleResources?:readonly ExternalExampleResourcePacket[];
    targetVersion:string;
    destination:string;
    decisions?:Readonly<Record<string,string>>;
}>;
export type MigrationDisposition='faithfully-convertible'|'requires-decision'|'blocked';

/** Explicit, bounded graph transformation over captured CST planning copies.
 * Opening/checking/exporting never invokes this operation. Every successful
 * stage and the relocated output receive their own native validation. */
export async function planMigration(input:MigrationInput) {
    const targetDeclaration=specificationDeclaration(input.targetVersion==='2.0'?{swagger:input.targetVersion}:{openapi:input.targetVersion});
    if(targetDeclaration.status!=='supported')throw new SourceError('migration.target','Select an approved target specification version');
    const target=targetDeclaration.specification;
    const initial=createGraph(input),original=initial.docs,from=initial.graph.specifications.get(input.root)!;
    if(typeof input.destination!=='string'||!input.destination.endsWith('/')||!['file:','https:'].includes(new URL(input.destination).protocol))throw new SourceError('migration.destination','Choose an independent absolute output directory identity');
    if(input.resources.length>256)throw new SourceError('limit.migration.resources','Migration is bounded to 256 captured resources');
    const decisions=input.decisions??{};
    if(!decisions||typeof decisions!=='object'||Array.isArray(decisions)||Object.keys(decisions).length>2048)throw new SourceError('migration.decisions','Expected bounded explicit migration decisions');
    let resources:Resource[]=input.resources.map((resource:Resource)=>({...resource}));
    const exampleOwnership=(input.exampleResources??[]).map(resource=>({id:resource.id,identity:resource.identity,
        generation:resource.generation,aliases:resource.aliases,state:resource.state})).sort((a,b)=>a.id.localeCompare(b.id));
    const documentOwnership=input.resources.map(resource=>({id:resource.id,generation:resource.generation,
        text:resource.text,aliases:resource.aliases})).sort((a,b)=>a.id.localeCompare(b.id));
    const decisionRevision=digest(JSON.stringify({producerVersion:migrationProducerVersion,snapshot:input.snapshot,
        targetVersion:input.targetVersion,resources:documentOwnership,examples:exampleOwnership}));
    const decisionChoices=new Map<string,string[]>();
    const problems:MigrationProblem[]=[],accepted=new Set<string>(),stages:{from:string;to:string}[]=[],presentationChanges:{resource:string;pointer:string}[]=[];
    const ignoredBodyOmissions:MigrationLocation[]=[];
    const omittedMarkdownOwners=new Set<string>();
    const retiredExampleLocators=new Set<string>();
    const relocatedResources=new Map<string,string>();
    const createdResources=new Map<string,string>();
    const planningOrigins=new Map<string,{resource:string;pointer:string;range:number[]}>();
    let origins=new Map<string,MigrationLocation[]>();
    for(const doc of original.values())for(const pointer of migrationLogicalPointers(doc))origins.set(key(doc.id,pointer),[{resource:doc.id,pointer}]);
    const sourceLocation=(resource:string,pointer:string)=>{
        resource=relocatedResources.get(resource)??resource;
        let at=pointer;
        while(true){
            const specialized=planningOrigins.get(key(resource,at));
            if(specialized)return specialized;
            for(const [origin,locations]of origins)if(locations.some(location=>location.resource===resource&&location.pointer===at)){
                const [id,source]=JSON.parse(origin) as [string,string],node=original.get(id)?.dataNode(source);
                return {resource:id,pointer:source,range:node?.range??original.get(id)!.root.range};
            }
            if(!at)break;at=at.slice(0,at.lastIndexOf('/'));
        }
        return {resource:input.root,pointer:'',range:original.get(input.root)!.root.range};
    };
    const issueIdentity=(location:MigrationIssueLocation,code:string)=>{
        const source=location.original?{...location.original,range:original.get(location.original.resource)!.dataNode(location.original.pointer)!.range}:sourceLocation(location.resource,location.pointer);
        return {source,id:digest(JSON.stringify([source.resource,source.pointer,location.decisionKey??'',code,decisionRevision])).slice(0,24)};
    };
    const issue:MigrationIssue=(location,code,message,reason,choices,choiceDetails)=>{
        const {source,id}=issueIdentity(location,code);
        if(reason==='decision'&&choices)decisionChoices.set(id,choices);
        if(reason==='decision'&&choices?.includes(decisions[id])){accepted.add(id);return true;}
        if(!problems.some(problem=>problem.id===id))problems.push({...source,id,code,message,reason,...(choices?{choices}:{}),...(choiceDetails?{choiceDetails}:{})});
        return false;
    };
    const choose:MigrationChoose=(location,code,message,choices)=>{
        if(!issue(location,code,message,'decision',choices.map(choice=>choice.value),choices))return;
        return decisions[issueIdentity(location,code).id];
    };
    const refused=(error:unknown,location:MigrationLocation)=>{
        if(!(error instanceof SourceError))throw error;
        issue(error.source??location,error.code,error.message,'implementation');
    };
    const validate=async(values:Resource[],root:string,phase:'source'|'target'='target',exampleResources=input.exampleResources)=>{
        const roots=[root,...values.filter(value=>value.id!==root&&specificationDeclaration(new SourceDocument(value.text,value.id).root.value).status==='supported').map(value=>value.id)];
        for(const root of roots){
            const capture={...input,resources:values,root,exampleResources},analysis=analyse(capture),schemas=await evaluateSchemas(capture);
            if(!analysis.complete||!schemas.complete)issue({resource:root,pointer:''},'migration.validation.incomplete','Native validation did not complete; no migration can be published','source-incomplete');
            // Incomplete warnings identify evaluator limitations, not invalid
            // source. Preserve their locations alongside the overall refusal.
            for(const finding of [...analysis.findings,...schemas.findings])if(finding.severity==='error'||finding.incomplete===true)
                issue(finding,'migration.validation.'+finding.code,finding.message,finding.incomplete===true?'implementation':phase==='source'?'source-incomplete':'target-representation');
        }
    };
    const initialContexts=migrationDocumentContexts(input,initial,issue,true);
    let semanticOrigins:MigrationSemanticOrigins|undefined;
    await validate(resources,input.root,'source');
    if(!problems.length)try{semanticOrigins=new MigrationSemanticOrigins(initialContexts.map(context=>context.graph));}
    catch(error){refused(error,{resource:input.root,pointer:''});}
    let externalExamples:MigrationExamples|undefined;
    if(!problems.length)try{externalExamples=new MigrationExamples(initialContexts.map(context=>context.graph),input.exampleResources);}
    catch(error){refused(error,{resource:input.root,pointer:''});}
    const markdownContexts=problems.length?[]:captureMigrationMarkdown(initial.graph,issue,initialContexts.map(context=>context.graph));
    for(const {original:location}of markdownContexts)if(!origins.has(key(location.resource,location.pointer)))
        origins.set(key(location.resource,location.pointer),[location]);
    if(!problems.length)for(const context of initialContexts){checkOperationTarget(context.graph,target.family,issue);checkRequestBodyTarget(context,resources,target.family,issue);}
    if(!problems.length)for(const context of initialContexts)checkSecurityRequirementTarget(context.graph,target.family,issue);
    const route=migrationBatches(initial.graph.specifications,target.family);
    // Publication also relocates same-family patch updates. Their independent
    // semantic uses need ownership preparation without a conversion stage.
    const batches:readonly MigrationBatch[]=route.length?route:[{sources:[],to:target.family}];
    for(const stage of batches){
        if(problems.length)break;
        const after=stage.to,context=createGraph({...input,resources});
        let contexts=migrationDocumentContexts({...input,resources},context,issue,true);
        if(problems.length)break;
        const active=contexts.find(context=>stage.sources.length?stage.sources.includes(context.graph.specifications.get(context.graph.root)!.family):context.graph.root===input.root);
        if(!active)throw new SourceError('migration.route.owner','The conversion stage has no captured source entry');
        let graph=active.graph;
        const sources=new Map([...context.docs].map(([id,doc])=>[id,new MigrationSource(doc)]));
        // Virtual description fields keep logical alias provenance through
        // existing container moves; they do not acquire ordinary edit rights.
        for(const captured of markdownContexts)for(const location of origins.get(key(captured.original.resource,captured.original.pointer))??[]){
            const source=sources.get(location.resource);
            if(source?.doc.dataNode(location.pointer)&&!source.origins.has(location.pointer))
                source.origins.set(location.pointer,new Set([location.pointer]));
        }
        try {
            let schemaResource:MigrationSource|undefined;
            const createSchemaResource=():MigrationSource=>{
                if(schemaResource)return schemaResource;
                if(sources.size>=256)throw new SourceError('limit.migration.resources','Generated schema resources exceed the 256-resource migration bound');
                const format=sources.get(graph.root)!.doc.format;
                const stem='migration-schemas-'+digest(JSON.stringify([graph.root,after,migrationProducerVersion])).slice(0,24);
                let id=new URL(stem+'.'+format,graph.root).href,index=0;
                const unavailable=(id:string)=>sources.has(id)||graph.identities.has(id)||
                    input.exampleResources?.some(resource=>resource.id===id||resource.aliases?.includes(id));
                while(unavailable(id))id=new URL(stem+'-'+(++index)+'.'+format,graph.root).href;
                schemaResource=new MigrationSource(new SourceDocument('{}\n',id));
                sources.set(id,schemaResource);createdResources.set(id,graph.root);
                return schemaResource;
            };
            const contextProofs:{scope:GraphScope;destination:MigrationLocation;preserveBase:boolean;expectedBase?:string;namespace:string}[]=[];
            const owners=new MigrationSchemaOwners(graph,sources,createSchemaResource,
                (input.exampleResources??[]).flatMap(resource=>[resource.id,...resource.aliases]));
            const sourceContexts=contexts;
            const specialized=new Map<string,readonly MigrationLocation[]>();
            let ownershipWork=0;
            const admitOwnership=()=>{
                if(++ownershipWork>2000000)throw new SourceError('limit.migration.owners','Composed ownership exceeds 2000000 source/proof states');
            };
            const captureContext=(scope:GraphScope,destination:MigrationLocation,preserveBase:boolean,expectedBase?:string,namespace=graph.root)=>
                contextProofs.push({scope,destination,preserveBase,expectedBase,namespace});
            const retainCopies=(copies:ReadonlyMap<string,readonly MigrationLocation[]>)=>{
                const unique=(locations:Iterable<MigrationLocation>)=>{
                    const selected=new Map<string,MigrationLocation>();
                    for(const location of locations){admitOwnership();selected.set(key(location.resource,location.pointer),location);}
                    return [...selected.values()];
                };
                for(const [origin,locations]of specialized)specialized.set(origin,unique(locations.flatMap(location=>[
                    location,...copies.get(key(location.resource,location.pointer))??[]])));
                for(const [origin,locations]of copies)specialized.set(origin,unique([...specialized.get(origin)??[],...locations]));
            };
            const preparationInput=()=>({...input,root:graph.root,resources:[...sources].map(([id,source])=>({
                ...resources.find(resource=>resource.id===id),id,text:source.doc.text,generation:0}))});
            // Different entry contexts acquire owners before role/literal
            // copying. Otherwise the first parsed entry could choose another
            // use's family or overwrite a shared incoming locator.
            retainCopies(separateMigrationEntryUses(contexts,sources,issue,createSchemaResource,captureContext,owners));
            if(problems.length)break;
            const roleInput=preparationInput(),roleContext=createGraph(roleInput);
            const roleContexts=migrationDocumentContexts(roleInput,roleContext,issue,true);
            retainCopies(separateMigrationRoles(roleContexts,sources,issue,createSchemaResource,captureContext,owners));
            if(problems.length)break;
            // A new anonymous owner can itself need entry specialization.
            // Reuse the same reservations and compose its source relation;
            // this is one bounded preparation pass, never an expansion loop.
            const entryInput=preparationInput(),entryContext=createGraph(entryInput);
            const entryContexts=migrationDocumentContexts(entryInput,entryContext,issue,true);
            retainCopies(separateMigrationEntryUses(entryContexts,sources,issue,createSchemaResource,captureContext,owners));
            if(problems.length)break;
            const materializedConnections=materializeMigrationOperationConnections(sourceContexts,sources,owners,issue);
            if(problems.length)break;
            const retainedInput=preparationInput();
            owners.retireSuperseded(sourceContexts.map(context=>createGraph({...retainedInput,root:context.graph.root}).graph));
            if(specialized.size||materializedConnections){
                for(const [origin,copies]of specialized){
                    const [resource,pointer]=JSON.parse(origin) as [string,string];
                    const original=sourceLocation(resource,pointer);
                    for(const copy of copies)planningOrigins.set(key(copy.resource,copy.pointer),original);
                }
                for(const [id]of createdResources)if(!resources.some(resource=>resource.id===id))
                    resources.push({id,text:sources.get(id)!.doc.text,generation:0,identity:digest(sources.get(id)!.doc.text)});
                const ownedInput=preparationInput();
                const owned=createGraph(ownedInput);
                contexts=migrationDocumentContexts(ownedInput,owned,issue);
                owned.graph.assertReferenceEditsSupported();
                const proofIssue:MigrationIssue=(location,code,message,reason)=>
                    issue({resource:location.resource,pointer:location.pointer},code,message,reason);
                // No omission or family conversion has happened yet: prove
                // every typed static edge as well as dynamic/implicit ones.
                const prepared=migrationLocations(sources);
                for(const sourceContext of sourceContexts){
                    const targetContext=contexts.find(context=>context.graph.root===sourceContext.graph.root)!;
                    proveMigrationConnections(sourceContext.graph,targetContext.graph,
                        (location,scope)=>owners.entryLocations(sourceContext.graph.root,location,scope,prepared),proofIssue,true);
                }
                graph=owned.graph;
                const contextKey=(namespace:string,location:MigrationLocation,scope:GraphScope,base:string)=>JSON.stringify([
                    namespace,location.resource,location.pointer,scope.kind,scope.family,scope.dialect,base,
                ]);
                const transitions=new Map<string,{destination:MigrationLocation;base:string}[]>();
                for(const proof of contextProofs){
                    admitOwnership();const id=contextKey(proof.namespace,proof.scope,proof.scope,proof.scope.base),next=transitions.get(id)??[];
                    next.push({destination:proof.destination,base:proof.expectedBase??proof.scope.base});transitions.set(id,next);
                }
                for(const {scope,destination,preserveBase,expectedBase,namespace}of contextProofs){
                    // Base changes are admitted only by a captured ownership
                    // transition, including a later entry-owned resource copy.
                    // Provenance alone cannot authorize substituting a URI.
                    const terminal=owners.entryOwner(namespace,scope,scope.kind);
                    const terminalLocations=new Set((prepared.get(key(terminal.resource,terminal.pointer))??[]).map(location=>key(location.resource,location.pointer)));
                    const ownerContext=contexts.find(context=>context.graph.root===namespace);
                    // Role preparation and an entry refinement can start from
                    // the same captured occurrence. Both are authorized edges;
                    // only this entry's final material owner proves retention.
                    const pending=[{destination,base:expectedBase??scope.base},
                        ...transitions.get(contextKey(namespace,scope,scope,scope.base))??[]],seen=new Set<string>();let retained=false;
                    for(let index=0;index<pending.length&&!retained;index++){
                        admitOwnership();const state=pending[index],id=contextKey(namespace,state.destination,scope,state.base);
                        if(seen.has(id))continue;seen.add(id);
                        const destinations=[state.destination,...specialized.get(key(state.destination.resource,state.destination.pointer))??[]]
                            .flatMap(location=>prepared.get(key(location.resource,location.pointer))??[]);
                        retained=destinations.some(destination=>{
                            admitOwnership();if(!terminalLocations.has(key(destination.resource,destination.pointer)))return false;
                            const retained=ownerContext?.graph.scopeAs(destination.resource,destination.pointer,scope.kind);
                            return retained&&ownerContext?.graph.isEntryUse(retained)&&(!preserveBase||retained.base===state.base)&&retained.dialect===scope.dialect&&retained.family===scope.family;
                        });
                        pending.push(...transitions.get(id)??[]);
                    }
                    if(!retained)
                        issue(scope,'migration.owners.resource-context','The independent owner did not retain its captured role, dialect, family or required schema resource URI','implementation');
                }
                if(problems.length)break;
            }
            for(const context of contexts)context.graph.assertReferenceEditsSupported();
            const terms=new Map<string,string>();
            for(const context of contexts)migrateTerms(context.graph,sources,stage.sources,terms,issue);
            if(problems.length)break;
            const priorOmissions=ignoredBodyOmissions.length;
            for(const before of stage.sources)for(const context of contexts)ignoredBodyOmissions.push(...migrateOperationBodies(context.graph,sources,before,after,scope=>{
                const origin=sourceLocation(scope.resource,scope.pointer),entry=initialContexts.find(entry=>entry.graph.root===context.graph.root)!.graph;
                return (entry.scopeAs(origin.resource,origin.pointer,scope.kind)??entry.scope(origin.resource,origin.pointer)).family;
            },issue));
            // An omitted use can detach a fragment. Only surviving graph
            // occurrences retain a dialect and participate in conversion;
            // the captured fragment bytes still belong to the output copy.
            if(ignoredBodyOmissions.length!==priorOmissions){
                const beforeContexts=contexts,retainedInput=preparationInput(),retained=createGraph(retainedInput);
                contexts=migrationDocumentContexts(retainedInput,retained,issue);
                const useKey=(scope:GraphScope)=>JSON.stringify([scope.resource,scope.pointer,scope.kind]);
                const activeUses=new Set([...migrationScopes(contexts.map(context=>context.graph))].map(useKey));
                const detached=new Set([...migrationScopes(beforeContexts.map(context=>context.graph))]
                    .filter(scope=>!activeUses.has(useKey(scope))).map(scope=>key(scope.resource,scope.pointer)));
                const examples=new Set(contexts.flatMap(context=>externalExampleRequests(context.graph)).map(location=>key(location.resource,location.pointer)));
                for(const context of beforeContexts)for(const location of externalExampleRequests(context.graph))if(!examples.has(key(location.resource,location.pointer))){
                    const original=sourceLocation(location.resource,location.pointer);
                    retiredExampleLocators.add(key(original.resource,original.pointer));
                }
                // The explicit omission also removes these rendered uses.
                // Detached resource bytes remain intact, while shared uses
                // still present in the canonical graph retain their proofs.
                for(const [origin,locations]of origins)if(locations.length&&locations.every(location=>detached.has(key(location.resource,location.pointer))))omittedMarkdownOwners.add(origin);
                graph=retained.graph;
            }
            const presence=new Set<string>();
            for(const before of stage.sources)for(const id of migrateRequiredPresence(graph,sources,before,after,contexts.map(context=>context.graph)))presence.add(id);
            const access=new MigrationAccess(graph,presence);
            for(const scope of migrationScopes(contexts.map(context=>context.graph))){
                const doc=graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value,source=sources.get(scope.resource)!;
                const before=scope.family;
                if(!stage.sources.some(family=>family===before)||source.current(scope.pointer)===undefined)continue;
                if(graph.referenceObject(value,scope)&&scope.kind!=='path-item'){
                    const siblings=Object.keys(value).filter(name=>name!=='$ref');
                    if(siblings.length&&modernFamily(after)&&!modernFamily(before)&&issue(scope,'migration.reference.ignored-siblings','The target would activate ignored Reference Object siblings; explicitly discard those preserved values or revise the source','decision',['discard-ignored-siblings']))for(const name of siblings)source.remove(scope.pointer+'/'+escape(name));
                    if(siblings.length&&!modernFamily(after)&&modernFamily(before)&&scope.kind!=='schema')issue(scope,'migration.reference.annotations','The target cannot retain these Reference Object annotation overrides','target-representation');
                }
                const directionalUpgrade=before==='2.0'&&after!=='2.0'||before==='3.0'&&modernFamily(after);
                if(scope.kind==='schema'&&!directionalUpgrade&&!access.preserves(scope,before,after))issue(scope,'migration.schema.direction','Access annotations need a direction-specific schema mapping to preserve their captured property and required-list semantics in the target family','implementation');
                if(before==='3.2'&&after!=='3.2'){
                    const newer:Record<string,string[]>={'path-item':['query','additionalOperations'],media:['itemSchema','prefixEncoding','itemEncoding'],encoding:['prefixEncoding','itemEncoding'],tag:['summary','kind','parent'],xml:['nodeType'],discriminator:['defaultMapping']};
                    for(const name of newer[scope.kind]??[])if(Object.hasOwn(value??{},name))issue({...scope,pointer:scope.pointer+'/'+escape(name)},'migration.feature.newer','This 3.2 construct has no implemented faithful mapping to the selected older family','implementation');
                }
                if(before==='3.1'&&after==='3.0'&&scope.kind==='root'){
                    for(const name of ['webhooks'])if(Object.hasOwn(value??{},name))issue({...scope,pointer:'/'+name},'migration.root.newer','This root construct needs an explicit faithful 3.0 mapping','implementation');
                }
            }
            if(problems.length)break;
            if(stage.sources.includes('3.2')){
                const identities=migrateDocumentIdentities(graph,sources,after,issue);
                resources=resources.map(resource=>identities.has(resource.id)?
                    {...resource,aliases:[...new Set([...identities.get(resource.id)!,...(resource.aliases??[])])]}:resource);
            }
            if(problems.length)break;
            for(const before of stage.sources)migrateServerVariableDefaults(graph,sources,before,after,issue);
            for(const before of stage.sources)migrateBinarySchemas(graph,sources,before,after,issue,contexts.map(context=>context.graph));
            if(problems.length)break;
            for(const before of stage.sources)migrateSchemas(graph,sources,before,after,issue,contexts.map(context=>context.graph));
            for(const before of stage.sources)migrateEncodings(graph,sources,before,after,issue,contexts.map(context=>context.graph));
            const referenceTargets=stage.sources.includes('2.0')?upgradeSwagger(graph,sources,issue,contexts.map(context=>context.graph),after):undefined;
            if(problems.length)break;
            const discriminator=stage.sources.includes('2.0')?migrateSwaggerDiscriminators(graph,sources,issue,contexts.map(context=>context.graph),location=>{
                const original=sourceLocation(location.resource,location.pointer);
                presentationChanges.push({resource:original.resource,pointer:original.pointer});
            }):undefined;
            if(after==='2.0')for(const before of stage.sources)downgradeSwagger(graph,sources,before,issue);
            if(problems.length)break;
            for(const [id,specification]of graph.specifications){
                if(!stage.sources.includes(specification.family))continue;
                const source=sources.get(id)!;
                if(!modernFamily(after))source.remove('/jsonSchemaDialect');
                if(after!=='2.0')source.set('/openapi',after===target.family?target.declaredVersion:patch[after]);
                if(specification.family==='3.1'&&after==='3.2'&&!source.doc.nodes.has('/jsonSchemaDialect'))source.set('/jsonSchemaDialect',specification.schemaDialect);
            }
            // Repair only established contract references at their mapped CST
            // occurrences. Example and extension payloads are never searched.
            const retainedInput={...input,resources:resources.map(resource=>({...resource,text:sources.get(resource.id)!.doc.text}))};
            const retained=createGraph(retainedInput);
            // An unchanged spelling must be proved in its actual entry's
            // namespace. A foreign document's dormant interpretation in the
            // first graph cannot qualify another entry's model names.
            const retainedContexts=migrationDocumentContexts(retainedInput,retained,issue,true);
            const retainedReferences=new Set([...migrationReferences(retainedContexts.map(context=>context.graph))].filter(reference=>reference.resolution==='resolved').map(reference=>
                JSON.stringify([reference.resource,reference.pointer,reference.kind,reference.connection,reference.keyword,reference.value,reference.targetResource,reference.targetPointer])));
            for(const reference of migrationReferences(contexts.map(context=>context.graph))){
                if(!referenceLocator(reference)&&reference.connection!=='discriminator'||reference.resolution!=='resolved')continue;
                // Discriminator mapping keys are arbitrary wire values. A key
                // spelled $dynamicRef is still a native connection, not a
                // dynamic schema applicator. Repair moved targets before the
                // converted graph is captured and validated.
                if(!reference.connection&&reference.keyword==='$dynamicRef'&&(modernFamily(after)||projectSchemaReference(reference).state!=='fixed'))continue;
                const destinations=[...sources].flatMap(([id,source])=>[...(id===reference.targetResource?source.origins.get(reference.targetPointer!):source.foreignOrigins.get(reference.targetResource+'#'+reference.targetPointer!))??[]].map(pointer=>({resource:id,pointer})));
                const primary=(!reference.connection?referenceTargets?.get(reference.resource+'#'+reference.pointer):undefined)??
                    (reference.kind==='schema'?discriminator?.primaryTargets.get(key(reference.targetResource!,reference.targetPointer!)):undefined)??
                    (destinations.length===1?destinations[0]:undefined);
                for(const [id,source]of sources){
                    const locations=id===reference.resource?source.origins.get(reference.pointer+'/'+escape(reference.keyword)):source.foreignOrigins.get(reference.resource+'#'+reference.pointer+'/'+escape(reference.keyword));
                    for(const pointer of locations??[]){
                        const destination=(!reference.connection?discriminator?.referenceTargets.get(key(id,pointer)):undefined)??primary;
                        if(destination===undefined){issue(reference,'migration.reference.target','An established target has no surviving mapped source owner','implementation');continue;}
                        // An unchanged locator with the same proved target
                        // needs no physical edit, including shared YAML text.
                        const owner=pointer.slice(0,pointer.lastIndexOf('/'));
                        if(source.doc.dataNode(pointer)?.value===reference.value&&retainedReferences.has(JSON.stringify([id,owner,reference.kind,reference.connection,reference.keyword,reference.value,destination.resource,destination.pointer])))continue;
                        source.set(pointer,destination.resource+fragment(destination.pointer));
                    }
                }
            }
            if(problems.length)break;
            const convertedInput={...input,root:graph.root,resources:resources.map(resource=>({...resource,text:sources.get(resource.id)!.doc.text}))};
            const converted=createGraph(convertedInput);
            const convertedContexts=migrationDocumentContexts(convertedInput,converted,issue);
            if(problems.length)break;
            migrateDirectionalSchemas(graph,converted.graph,sources,stage.sources,after,issue,createSchemaResource,convertedContexts.map(context=>context.graph),contexts.map(context=>context.graph));
            if(problems.length)break;
            for(const scope of graph.scopesFor('schema')){
                const source=sources.get(scope.resource)!,at=source.current(scope.pointer);
                if(at!==undefined||graph.hasOverlappingScope(scope.resource,scope.pointer))assertRoleAnnotations(graph,scope,source.doc,at??scope.pointer);
            }
            const next=new Map<string,MigrationLocation[]>();
            const current=migrationLocations(sources);
            for(const [origin,locations]of origins){
                const mapped:MigrationLocation[]=[];
                for(const location of locations){
                    mapped.push(...(current.get(key(location.resource,location.pointer))??[]));
                    for(const copy of specialized.get(key(location.resource,location.pointer))??[])
                        mapped.push(...(current.get(key(copy.resource,copy.pointer))??[]));
                }
                next.set(origin,mapped);
            }
            origins=next;
            for(const [resource,source]of sources)for(const pointer of source.presentationChanges)presentationChanges.push({resource,pointer});
            resources=resources.map(resource=>({...resource,text:sources.get(resource.id)!.doc.text}));
            for(const [id]of createdResources)if(!resources.some(resource=>resource.id===id))
                resources.push({id,text:sources.get(id)!.doc.text,generation:0,identity:digest(sources.get(id)!.doc.text)});
            if(after==='3.2'&&stage.sources.length){
                const migrated=createGraph({...input,resources});
                await migrateDiscriminatorDefaults({...input,resources},migrated.graph,sources,issue,choose,location=>{
                    const source=sourceLocation(location.resource,location.pointer);
                    const value=original.get(source.resource)!.dataNode(source.pointer)?.value;
                    const name=typeof value?.title==='string'?value.title:segments(source.pointer).at(-1)??new URL(source.resource).pathname.split('/').at(-1)??'#';
                    return {...source,label:Array.from(name||'#'+source.pointer).slice(0,240).join('')};
                });
                if(problems.length)break;
                resources=resources.map(resource=>({...resource,text:sources.get(resource.id)!.doc.text}));
            }
            semanticOrigins?.advance(sourceContexts.map(context=>context.graph),owners,migrationLocations(sources));
            stages.push(...stage.sources.map(from=>({from,to:after})));await validate(resources,input.root);
        }catch(error){
            refused(error,{resource:input.root,pointer:''});
        }
    }
    const status=():MigrationDisposition=>problems.some(problem=>problem.reason!=='decision')?'blocked':problems.length?'requires-decision':'faithfully-convertible';
    const common=()=>{
        for(const [id,choice]of Object.entries(decisions)) {
            if(!decisionChoices.has(id))throw new SourceError('migration.decisions.stale','A supplied decision does not belong to this captured migration graph and target');
            if(!decisionChoices.get(id)!.includes(String(choice)))throw new SourceError('migration.decisions.choice','Choose a listed migration decision');
        }
        return ({version:1,snapshot:input.snapshot,producer:'busyapi-native-migration',producerVersion:migrationProducerVersion,from,target,stages,entryRoutes:entryMigrationRoutes(initial.graph.specifications,target),status:status(),complete:!problems.length,problems,acceptedDecisions:[...accepted],presentationChanges,
        affectedResources:input.resources.map(resource=>({resource:resource.id,generation:resource.generation,identity:resource.identity})),
        affectedExampleResources:exampleOwnership,exampleOutputs:[],coverage:{source:'captured-native-graph',target:'native-structure-and-schema-evaluation',externalConsumers:'Only captured resources and their established connections are known'}});
    };
    if(problems.length)return {...common(),changes:[],outputs:[]};
    try{
        const context=createGraph({...input,resources});
        context.graph.assertReferenceEditsSupported();
        resources=resources.map(resource=>{
            if(!context.graph.specifications.has(resource.id))return resource;
            const source=new MigrationSource(context.docs.get(resource.id)!);
            source.set(target.declaration==='swagger'?'/swagger':'/openapi',target.declaredVersion);
            for(const pointer of source.presentationChanges){
                const original=sourceLocation(resource.id,pointer);
                presentationChanges.push({resource:original.resource,pointer:original.pointer});
            }
            return {...resource,text:source.doc.text};
        });
    }catch(error){refused(error,{resource:input.root,pointer:''});}
    if(problems.length)return {...common(),changes:[],outputs:[]};
    const context=createGraph({...input,resources}),sources=new Map([...context.docs].map(([id,doc])=>[id,new MigrationSource(doc)]));
    const finalOwnerContexts=migrationDocumentContexts({...input,resources},context,issue).map(context=>context.graph);
    const useKey=(scope:{resource:string;pointer:string;kind:string})=>JSON.stringify([scope.resource,scope.pointer,scope.kind]);
    const finalOwners=new Set([...migrationScopes(finalOwnerContexts)].map(useKey));
    try {
        retainDefaultServers(context.graph,sources);
        for(const scope of migrationScopes(finalOwnerContexts)){
            const source=sources.get(scope.resource)!,value=context.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(scope.kind==='schema'&&typeof value?.$id==='string')source.set(scope.pointer+'/$id',scope.base);
            if(scope.kind==='root'&&scope.family==='3.2'&&typeof value?.$self==='string')source.set('/$self',scope.base);
            if(scope.kind==='server'&&typeof value?.url==='string')source.set(scope.pointer+'/url',serverTemplate(value.url,documentUriBase(context.graph,scope),value.variables,{resource:scope.resource,pointer:scope.pointer+'/url',range:context.docs.get(scope.resource)!.dataNode(scope.pointer+'/url')!.range}));
        }
        for(const occurrence of documentUriOccurrences(context.graph))if(finalOwners.has(useKey(occurrence.scope))&&occurrence.scope.kind!=='server')sources.get(occurrence.scope.resource)!.set(occurrence.pointer,resolveUri(occurrence.value,documentUriBase(context.graph,occurrence.scope)).href);
        const securityNames=new Map<string,Set<string>>();
        for(const reference of migrationReferences(finalOwnerContexts)){
            if(reference.resolution!=='resolved')continue;
            const source=sources.get(reference.resource)!;
            if(reference.connection==='security'&&reference.targetUri!==undefined){
                const identity=key(reference.resource,reference.pointer),scope=context.graph.referenceOwner(reference)??reference;
                const names=securityNames.get(identity)??new Set(source.doc.dataNode(reference.pointer)!.children.keys());
                securityNames.set(identity,names);
                const target=context.graph.scopeAs(reference.targetResource!,reference.targetPointer!,'security');
                const excluded=new Set([...names,...(context.docs.get(context.graph.root)!.dataNode('/components/securitySchemes')?.children.keys()??[])]);
                excluded.delete(reference.value);
                const value=target&&referenceValue(context.graph,{...scope,kind:'security'},target,'security',excluded,{absolute:true,connection:'security'});
                if(value===undefined){issue(reference,'migration.security.uri','This captured URI binding has no proved absolute spelling before publication','implementation');continue;}
                if(value!==reference.value){
                    source.rename(reference.pointer+'/'+escape(reference.keyword),value);names.delete(reference.value);names.add(value);
                }
            }else if(referenceLocator(reference)||reference.connection==='discriminator'&&reference.targetUri!==undefined)
                source.set(reference.pointer+'/'+escape(reference.keyword),resolveUri(reference.value,reference.base).href);
        }
        const normalized=migrationLocations(sources);
        semanticOrigins?.projectLocations(location=>normalized.get(key(location.resource,location.pointer))??[]);
        for(const [origin,locations]of origins)origins.set(origin,locations.flatMap(location=>normalized.get(key(location.resource,location.pointer))??[]));
        for(const scope of migrationScopes(finalOwnerContexts))if(scope.kind==='schema')assertRoleAnnotations(context.graph,scope,sources.get(scope.resource)!.doc,scope.pointer);
        for(const [resource,source]of sources)for(const pointer of source.presentationChanges){
            const original=sourceLocation(resource,pointer);
            presentationChanges.push({resource:original.resource,pointer:original.pointer});
        }
    }catch(error){refused(error,{resource:input.root,pointer:''});}
    if(problems.length)return {...common(),changes:[],outputs:[]};
    // Each declared API must reopen with its containing directory as the
    // standalone access boundary, including references to another API's owners.
    const paths=new Map(resources.map(resource=>[resource.id,(resource.id===input.root?'openapi':(context.graph.specifications.has(resource.id)?'openapi-':'resources/')+digest(resource.id).slice(0,24))+'.'+sources.get(resource.id)!.doc.format]));
    if(new Set(paths.values()).size!==paths.size)throw new SourceError('migration.destination.collision','Migrated resources need distinct output names');
    const identifiers=new Map([...paths].map(([id,path])=>[id,new URL(path,input.destination).href]));
    for(const [source,destination]of identifiers)relocatedResources.set(destination,source);
    if([...identifiers.values()].some(id=>context.graph.identities.has(id)))throw new SourceError('migration.destination','The output would replace a captured source identity');
    // Ordinary copied documents use their new retrieval location. Explicit
    // $id/$self identities and approved aliases remain available separately;
    // an optional project mapping must not be needed for a local self-reference.
    const outputResources=resources.map(resource=>({...resource,id:identifiers.get(resource.id)!,text:sources.get(resource.id)!.doc.text,aliases:[identifiers.get(resource.id)!,resource.id,...resource.aliases??[]],generation:0}));
    const outputRoot=identifiers.get(input.root)!;
    let relocated=createGraph({...input,root:outputRoot,resources:outputResources});
    const markdownOwnerContexts=migrationDocumentContexts({...input,root:outputRoot,resources:outputResources},relocated,issue).map(context=>context.graph);
    const retainedMarkdown=markdownContexts.filter(context=>!omittedMarkdownOwners.has(key(context.owner.resource,context.owner.pointer)));
    const mappedSemanticOutputLocations=(location:MigrationLocation,namespace:string,scope:GraphScope)=>(semanticOrigins?.locations(namespace,location,scope)??[])
        .map(location=>({resource:identifiers.get(location.resource)!,pointer:location.pointer}));
    const rewrittenMarkdown=rewriteMigrationMarkdown(retainedMarkdown,relocated.graph,mappedSemanticOutputLocations,issue,location=>{
        const original=sourceLocation(location.resource,location.pointer);
        presentationChanges.push({resource:original.resource,pointer:original.pointer});
    },markdownOwnerContexts,identifiers);
    try{
        for(const scope of relocated.graph.scopesFor('schema')){
            const changed=rewrittenMarkdown.get(scope.resource);
            if(changed)assertRoleAnnotations(relocated.graph,scope,changed,scope.pointer);
        }
    }catch(error){refused(error,{resource:input.root,pointer:''});}
    if(problems.length)return {...common(),changes:[],outputs:[]};
    for(const resource of outputResources){
        const changed=rewrittenMarkdown.get(resource.id);
        if(changed)resource.text=changed.text;
    }
    relocated=createGraph({...input,root:outputRoot,resources:outputResources});
    const relocatedOwnerContexts=migrationDocumentContexts({...input,root:outputRoot,resources:outputResources},relocated,issue).map(context=>context.graph);
    proveMigrationMarkdown(retainedMarkdown,relocated.graph,mappedSemanticOutputLocations,issue,relocatedOwnerContexts,identifiers);
    if(problems.length)return {...common(),changes:[],outputs:[]};
    const mappings=new Map([...paths].map(([id,path])=>[identifiers.get(id)!,path]));
    for(const scope of relocated.graph.scopes.values())if(scope.pointer===''){
        const value=relocated.docs.get(scope.resource)!.root.value;
        const declared=scope.kind==='schema'&&typeof value?.$id==='string'||scope.kind==='root'&&scope.family==='3.2'&&typeof value?.$self==='string';
        const path=[...paths].find(([id])=>identifiers.get(id)===scope.resource)?.[1];
        if(declared&&path){
            // A configured mapping selects one retrieval identity per file.
            // Its physical output URI already exists as the resource's id;
            // retaining it as a second configured base would make reopen
            // ambiguous even though the declared identity is unchanged.
            mappings.delete(scope.resource);
            mappings.set(scope.base,path);
        }
    }
    if(mappings.size>256)issue({resource:input.root,pointer:''},'limit.migration.mappings','The migrated identity map exceeds the configured 256 URI mappings','source-incomplete');
    if(problems.length)return {...common(),changes:[],outputs:[]};
    const coldResources=()=>outputResources.map(resource=>({...resource,aliases:[...mappings].filter(([,path])=>new URL(path,input.destination).href===resource.id).map(([uri])=>uri).sort()}));
    // Prove retained static spellings without transient source-file aliases.
    // The final cold proof below still checks every repaired connection.
    const portable=coldGraph(outputRoot,coldResources());
    const portableReferences=new Set(portable.references.filter(reference=>reference.resolution==='resolved'&&(!referenceLocator(reference)||reference.keyword!=='$dynamicRef')).map(reference=>
        JSON.stringify([reference.resource,reference.pointer,reference.keyword,reference.value,reference.targetResource,reference.targetPointer])));
    const securityNames=new Map<string,Set<string>>();
    const portableOwners=new Map<string,MigrationSource>();
    for(const reference of migrationReferences(relocatedOwnerContexts)){
        const security=reference.connection==='security'&&reference.targetUri!==undefined;
        const relocatable=referenceLocator(reference)||reference.connection==='discriminator'||security;
        if(!relocatable||reference.resolution!=='resolved')continue;
        if(portableReferences.has(JSON.stringify([reference.resource,reference.pointer,reference.keyword,reference.value,reference.targetResource,reference.targetPointer])))continue;
        const scope=relocated.graph.referenceOwner(reference)??reference,
            destination=relocated.graph.scopeAs(reference.targetResource!,reference.targetPointer!,reference.kind);
        const addressKeyword=security?'security':reference.connection==='discriminator'||reference.keyword==='$dynamicRef'&&!reference.dynamic?'$ref':reference.keyword;
        let names:Set<string>|undefined,excluded:Set<string>|undefined;
        if(security){
            const identity=key(reference.resource,reference.pointer);
            names=securityNames.get(identity)??new Set(relocated.docs.get(reference.resource)!.dataNode(reference.pointer)!.children.keys());
            securityNames.set(identity,names);
            excluded=new Set([...names,...(relocated.docs.get(relocated.graph.root)!.dataNode('/components/securitySchemes')?.children.keys()??[])]);
            excluded.delete(reference.value);
        }
        const value=destination&&referenceValue(relocated.graph,security?{...scope,kind:'security'}:scope,destination,addressKeyword,excluded,
            security?{connection:'security'}:reference.connection==='discriminator'?{connection:'discriminator'}:{});
        const location={resource:reference.resource,pointer:reference.pointer+'/'+escape(reference.keyword)};
        if(value===undefined){issue(location,'migration.reference.relocation','A captured reference has no proved portable target spelling','implementation');continue;}
        if(reference.connection==='discriminator'||security){
            const rebound=relocated.graph.resolveConnection({...reference,...scope,kind:reference.kind,keyword:security?value:reference.keyword,value});
            if(rebound.resolution!=='resolved'||rebound.targetResource!==reference.targetResource||rebound.targetPointer!==reference.targetPointer){
                issue(location,'migration.reference.binding','The proposed native connection does not preserve its captured target','implementation');continue;
            }
        }
        if(!reference.connection&&reference.keyword==='$dynamicRef'){
            const rebound=relocated.graph.resolveReference(value,scope,'$dynamicRef');
            if(rebound.resolution!=='resolved'||rebound.targetResource!==reference.targetResource||rebound.targetPointer!==reference.targetPointer||Boolean(rebound.dynamic)!==Boolean(reference.dynamic)){
                issue(location,'migration.reference.binding','The proposed spelling changes the captured dynamic reference binding','implementation');continue;
            }
        }
        if(value===reference.value)continue;
        const source=outputResources.find(resource=>resource.id===reference.resource)!;
        try{
            let owner=portableOwners.get(source.id);
            if(!owner){owner=new MigrationSource(new SourceDocument(source.text,source.id));portableOwners.set(source.id,owner);}
            const prior=owner.presentationChanges.length;
            if(security){
                owner.rename(location.pointer,value);
                names!.delete(reference.value);names!.add(value);
            }else owner.set(location.pointer,value);
            source.text=owner.doc.text;
            for(const pointer of owner.presentationChanges.slice(prior)){
                const original=sourceLocation(source.id,pointer);
                presentationChanges.push({resource:original.resource,pointer:original.pointer});
            }
        }
        catch(error){refused(error,location);}
    }
    try{
        const portable=migrationLocations(portableOwners);
        const project=(location:MigrationLocation):readonly MigrationLocation[]=>{
            const resource=identifiers.get(location.resource)!;
            if(!portableOwners.has(resource))return [location];
            return (portable.get(key(resource,location.pointer))??[]).map(location=>({
                resource:relocatedResources.get(location.resource)!,pointer:location.pointer}));
        };
        semanticOrigins?.projectLocations(project);
        for(const [origin,locations]of origins)origins.set(origin,locations.flatMap(location=>{
            return project(location);
        }));
    }catch(error){refused(error,{resource:input.root,pointer:''});}
    if(problems.length)return {...common(),changes:[],outputs:[]};
    let exampleOutputs:readonly MigrationExampleCopy[]=[],outputExampleResources:readonly ExternalExampleResourcePacket[]=[];
    try{
        const capture={...input,root:outputRoot,resources:outputResources},primary=createGraph(capture),graph=primary.graph;
        const ownerContexts=migrationDocumentContexts(capture,primary,issue).map(context=>context.graph);
        const copied=externalExamples!.relocate(graph,mappedSemanticOutputLocations,input.destination,paths.values(),ownerContexts,retiredExampleLocators);
        for(const scope of graph.scopesFor('schema')){
            const changed=copied.sources.get(scope.resource);
            if(changed)assertRoleAnnotations(graph,scope,changed.doc,scope.pointer);
        }
        for(const [uri,path]of copied.mappings){
            if(mappings.has(uri)&&mappings.get(uri)!==path)throw new SourceError('migration.example.identity','An example URI conflicts with a contract mapping');
            mappings.set(uri,path);
        }
        if(mappings.size>256)throw new SourceError('limit.migration.mappings','The migrated identity map exceeds the configured 256 URI mappings');
        for(const resource of outputResources){const changed=copied.sources.get(resource.id);if(changed)resource.text=changed.doc.text;}
        exampleOutputs=copied.outputs;outputExampleResources=copied.resources;
    }catch(error){refused(error,{resource:input.root,pointer:''});}
    if(problems.length)return {...common(),changes:[],outputs:[]};
    await validate(outputResources,outputRoot,'target',outputExampleResources);
    const finalContext=createGraph({...input,root:outputRoot,resources:outputResources});
    const operationKeys=(graph:typeof initial.graph)=>graph.operations().map(operation=>JSON.stringify([operation.role,operation.method,operation.customMethod===true,operation.path])).sort();
    try {
        for(const context of initialContexts){
            const root=context.graph.root,output=identifiers.get(root)!,targetGraph=root===input.root?finalContext.graph:createGraph({...input,root:output,resources:outputResources}).graph;
            if(JSON.stringify(operationKeys(context.graph))!==JSON.stringify(operationKeys(targetGraph)))issue({resource:root,pointer:''},'migration.invariant.operations','The migrated graph changed an operation method, path, role or occurrence count','implementation');
            if(JSON.stringify(migrationRequestSignatures(context.graph,input.resources))!==JSON.stringify(migrationRequestSignatures(targetGraph,outputResources)))issue({resource:root,pointer:''},'migration.invariant.request','The migrated graph changed effective URL, serialization, authentication, request media or response declarations','implementation');
            proveMigrationConnections(context.graph,targetGraph,(location,scope)=>(semanticOrigins?.locations(root,location,scope)??[])
                .map(location=>({resource:identifiers.get(location.resource)!,pointer:location.pointer})),issue);
        }
    }catch(error){
        if(!(error instanceof SourceError))throw error;
        issue({resource:input.root,pointer:''},error.code,'Request invariants could not be established for this migration','implementation');
    }
    const exactPayloads=new Set<string>();
    for(const scope of initial.graph.scopes.values()){
        const doc=original.get(scope.resource)!,node=doc.dataNode(scope.pointer)!;
        for(const name of Object.keys(node.value??{}))if(name.startsWith('x-'))exactPayloads.add(key(scope.resource,scope.pointer+'/'+escape(name)));
        const fields=scope.kind==='example'?['value','dataValue','serializedValue']:scope.kind==='schema'?['example','default','enum']:['media','parameter','header'].includes(scope.kind)?['example']:[];
        for(const name of fields)if(node.children.has(name))exactPayloads.add(key(scope.resource,scope.pointer+'/'+name));
        if(scope.family==='2.0'&&scope.kind==='response')for(const name of doc.dataNode(scope.pointer+'/examples')?.children.keys()??[])exactPayloads.add(key(scope.resource,scope.pointer+'/examples/'+escape(name)));
    }
    for(const origin of exactPayloads){
        const [resource,pointer]=JSON.parse(origin) as [string,string],expected=migrationValueIdentity(original.get(resource)!,pointer);
        // A schema interpretation of a payload has a separate semantic owner.
        // Exact-data invariants apply to the surviving literal occurrences,
        // including literals inside copied schemas, not the converted schema
        // root that happens to share the original source coordinates.
        const locations=(origins.get(origin)??[]).filter(location=>
            !finalContext.graph.scopeAs(identifiers.get(location.resource)!,location.pointer,'schema')||
            finalContext.graph.literalContainer(identifiers.get(location.resource)!,location.pointer)!==undefined);
        // Only an explicit, graph-bound omission decision can remove values
        // inside an ignored declaration. Originals remain independent inputs.
        if(ignoredBodyOmissions.some(location=>location.resource===resource&&(pointer===location.pointer||pointer.startsWith(location.pointer+'/'))))continue;
        if(!locations.length)issue({resource,pointer},'migration.invariant.payload','An authored payload or extension lost its captured source owner','implementation');
        for(const location of locations){
            const node=finalContext.docs.get(identifiers.get(location.resource)!)?.dataNode(location.pointer);
            if(!node||migrationValueIdentity(finalContext.docs.get(identifiers.get(location.resource)!)!,location.pointer)!==expected)issue({resource,pointer},'migration.invariant.payload','An authored payload, default, enum or extension changed its exact value','implementation');
        }
    }
    if(problems.length)return {...common(),changes:[],outputs:[]};
    // Cold reopen proves that relative files and explicit identity mappings are
    // sufficient; no original-source disk access is a migration dependency.
    // Core sorts approved mappings before choosing a retrieval identity. Prove
    // the delivered manifest with that same ordering, not transient old aliases.
    for(const context of initialContexts){
        const root=context.graph.root,reopened=coldGraph(identifiers.get(root)!,coldResources());
        if(reopened.issues.length)issue({resource:root,pointer:''},'migration.reference.cold-reopen','The copied files and root identity mappings cannot reopen every captured dependency; a nested-resource relocation needs an additional mapping','implementation');
        try{proveMigrationExamples(reopened,exampleOutputs,outputExampleResources);}
        catch(error){refused(error,{resource:root,pointer:''});}
    }
    if(problems.length)return {...common(),changes:[],outputs:[]};
    const manifest={version:1,roots:initialContexts.map(({graph})=>({name:graph.root===input.root?'migrated':'resource_'+digest(graph.root).slice(0,24),path:paths.get(graph.root)})),resourceMappings:Object.fromEntries(mappings)};
    const outputs=outputResources.map(resource=>({path:[...paths].find(([id])=>identifiers.get(id)===resource.id)![1],id:resource.id,text:resource.text,hasBom:input.resources.find((source:Resource)=>identifiers.get(source.id)===resource.id)?.hasBom===true,identity:digest(resource.text)}));
    const changes=resources.map(resource=>{
        const source=original.get(resource.id),createdFrom=createdResources.get(resource.id);
        if(!source&&!createdFrom)throw new SourceError('migration.resource.owner','A planned resource has no captured or derived owner');
        const destination=identifiers.get(resource.id)!;
        const output=outputResources.find(output=>output.id===destination);
        if(!output)throw new SourceError('migration.resource.output','A reviewed resource has no validated output');
        return {resource:resource.id,destination,before:source?.text??'',after:output.text,...(createdFrom?{createdFrom}:{})};
    });
    for(const decision of Object.keys(decisions))if(!accepted.has(decision))throw new SourceError('migration.decisions.stale','A supplied decision does not belong to this captured migration plan');
    return {...common(),entry:paths.get(input.root),outputRoot,outputs,exampleOutputs,changes,manifest,identity:digest(JSON.stringify([migrationProducerVersion,input.snapshot,target,outputs,exampleOwnership,exampleOutputs,manifest,decisions])),validation:{complete:true,family:target.family},invariants:{operations:'preserved-method-and-path',requests:'effective-url-serialization-security-and-media',references:'canonical-target-relocation',examples:'exact-cst-values-and-captured-wire-bytes'}};
}
