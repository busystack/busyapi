import {createHash} from 'node:crypto';
import {createGraph,type Resource} from './engine';
import {SourceDocument,SourceError,type Range} from './document';
import {MigrationSource,migrationValueIdentity} from './migration_source';
import {editBudget,editsFor} from './refactoring_copy';
import {type ReferenceGraph,type GraphScope,type GraphTarget} from './reference_graph';
import {assertRefactoringByteConsumers,assertRefactoringCaseFiles} from './refactoring_graph';

type Context={root:string;resources:string[]};
type OwnershipInput={snapshot:string;resources:Resource[];contexts:Context[];target:{
    root?:string;resource:string;pointer:string;kind?:string;generation:number;range?:Range;expected?:string;
};manifest?:Resource};
const targetIdentity=(target:GraphTarget)=>[target.resource,target.pointer,target.kind];
const scopeIdentity=(scope:GraphScope)=>[...targetIdentity(scope),scope.family,scope.dialect,scope.base,scope.resourcePointer,scope.sourceKind,scope.schemaParent];

/** A presentation-only ownership change must retain even unresolved connections
 * and competing interpretations. Do not require a complete/valid contract just
 * to make an aliased draft editable. No acquisition or reference repair occurs. */
function semanticIdentity(graph:ReferenceGraph,admit:(size:number)=>void):string {
    const rows:string[]=[];
    const add=(kind:string,value:unknown)=>{const row=JSON.stringify([kind,value]);admit(row.length);rows.push(row);};
    for(const [resource,retrieval]of graph.retrievals)add('retrieval',[resource,retrieval]);
    for(const [resource,specification]of graph.specifications)add('specification',[resource,specification]);
    for(const scope of graph.interpretedScopes())add('scope',[scopeIdentity(scope),graph.isEntryUse(scope),
        scope.kind==='schema'?graph.schemaParentsOf(scope).map(scopeIdentity).sort():[]]);
    for(const ref of graph.references)add('reference',[scopeIdentity(ref),ref.keyword,ref.value,ref.connection,ref.resolution,
        ref.targetUri,ref.targetResource,ref.targetPointer,ref.targetFamily,[...(ref.candidateResources??[])].sort(),
        (ref.candidateTargets??[]).map(targetIdentity).sort(),ref.dynamic&&[ref.dynamic.anchor,ref.dynamic.candidates.map(targetIdentity).sort()]]);
    for(const [kind,values]of [['identity',graph.identities],['anchor',graph.anchors],['dynamic-anchor',graph.dynamicAnchors]] as const)
        for(const [uri,targets]of values)add(kind,[uri,targets.map(targetIdentity).sort()]);
    for(const issue of graph.issues)add('issue',[targetIdentity(issue),issue.code,issue.message,issue.incomplete,issue.severity,issue.connection]);
    return createHash('sha256').update(JSON.stringify(rows.sort())).digest('hex');
}

/** Explicit YAML source ownership, using the same token/provenance mechanism as
 * migration and structural maintenance. Ordinary proposal guards stay intact.
 * Only captured physical occurrences can be selected, never virtual alias keys. */
export function planYamlOwnership(input:OwnershipInput) {
    const {resources,contexts}=input;
    if(!Array.isArray(resources)||!Array.isArray(contexts)||!contexts.length||contexts.length>128)
        throw new SourceError('refactor.context','Choose the configured roots whose occurrences are being reviewed');
    const target=input.target,resource=resources.find(resource=>resource.id===target?.resource);
    if(!resource||resource.generation!==target.generation)throw new SourceError('edit.stale','The captured YAML occurrence changed');
    const graphs=contexts.map(context=>{
        if(!context||!Array.isArray(context.resources)||!context.resources.includes(context.root)||context.resources.some(id=>!resources.some(resource=>resource.id===id)))
            throw new SourceError('refactor.context','A captured root contains an unavailable resource');
        return {context,...createGraph({root:context.root,resources:resources.filter(resource=>context.resources.includes(resource.id))})};
    });
    const selected=graphs.find(({context,graph})=>(target.root===undefined||target.root===context.root)&&graph.scopesAt(resource.id,target.pointer).some(scope=>target.kind===undefined||scope.kind===target.kind));
    const doc=selected?.docs.get(resource.id),node=doc?.nodes.get(target.pointer);
    if(!doc||!node||doc.format!=='yaml'||!doc.dataSyntaxSafe(target.pointer))
        throw new SourceError('refactor.ownership.source','Choose an unambiguous physical YAML occurrence in a captured contract');
    if(target.range!==undefined&&JSON.stringify(target.range)!==JSON.stringify(node.range)||
        target.expected!==undefined&&target.expected!==doc.text.slice(...node.range))
        throw new SourceError('edit.stale','The captured YAML source coordinates changed');
    const source=new MigrationSource(doc),admitEdit=editBudget(resources,'limit.refactor.ownership');
    source.own(target.pointer,true,true);
    admitEdit(resource.id,source.doc.text.length);
    if(migrationValueIdentity(doc,'')!==migrationValueIdentity(source.doc,''))
        throw new SourceError('refactor.ownership.value','Independent ownership would change a captured value; no edits were prepared');
    const outputs=new Map([[resource.id,source.doc.text]]),prepared=resources.map(value=>value.id===resource.id?{...value,text:source.doc.text}:value);
    const finalDocs=new Map(prepared.map(value=>[value.id,new SourceDocument(value.text,value.id)]));
    let work=0,proofBytes=0;
    const admit=(size:number)=>{
        if(++work>2000000||(proofBytes+=size*2)>128*1024*1024)
            throw new SourceError('limit.refactor.ownership','The ownership review exceeds its bounded semantic proof budget');
    };
    for(const before of graphs){
        const after=createGraph({root:before.context.root,resources:prepared.filter(resource=>before.context.resources.includes(resource.id))});
        if(semanticIdentity(before.graph,admit)!==semanticIdentity(after.graph,admit))
            throw new SourceError('refactor.ownership.context','Independent YAML ownership would change a captured interpretation or connection; no edits were prepared',node.range,'unsupported',{resource:resource.id,pointer:target.pointer,range:node.range});
        assertRefactoringByteConsumers(before.graph,resources,id=>finalDocs.get(id)!);
    }
    assertRefactoringCaseFiles(input.manifest,resources,id=>finalDocs.get(id)!);
    const edits=editsFor(resources,outputs);
    return {version:1,snapshot:input.snapshot,kind:'yaml-ownership',from:target,to:target,edits,transitions:[],usages:[],warnings:[],checkedRoots:contexts.map(context=>context.root),
        sourceOwnership:source.presentationChanges,
        changes:edits.length?[{resource:resource.id,before:doc.text,after:source.doc.text}]:[],
        identity:createHash('sha256').update(JSON.stringify({snapshot:input.snapshot,target,edits})).digest('hex')};
}
