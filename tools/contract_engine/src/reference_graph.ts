import { children, isReferenceObject, referenceKinds, supportsReference } from './contexts';
import { SourceDocument, SourceError, escape, limits, type Range } from './document';
import {swaggerFileChoiceTargets} from './swagger_file';
import {resolveIri} from '@hyperjump/uri';
import {specificationDeclaration, defaultSchemaDialect, modernFamily, restrictedSchemaDialect, swaggerSchemaDialect, isNativeFamily, capabilitiesFor, Specification,declaredSchemaDialect} from './specification';

export const schemaRoleContextRevision='9';

export const knownDialects = new Set([
    restrictedSchemaDialect,
    swaggerSchemaDialect,
    'https://json-schema.org/draft/2020-12/schema',
    'https://spec.openapis.org/oas/3.1/dialect/base',
    'https://spec.openapis.org/oas/3.1/dialect/2024-11-10',
    'https://spec.openapis.org/oas/3.2/dialect/base',
    'https://spec.openapis.org/oas/3.2/dialect/2025-09-17',
    'https://spec.openapis.org/oas/3.2/dialect/2026-02-26',
]);
/** JSON Schema Core 8.2.1: an empty fragment identifies the same schema
 * resource. Preserve the declared spelling separately from its lookup key. */
export const schemaDialectIdentity = (uri:string):string => uri.endsWith('#')?uri.slice(0,-1):uri;
export const sameSchemaDialect=(a:string|null,b:string|null):boolean=>a===b||
    typeof a==='string'&&typeof b==='string'&&schemaDialectIdentity(a)===schemaDialectIdentity(b);

export type GraphTarget = { resource: string; pointer: string; kind: string };
export type GraphScope = GraphTarget & {
    base: string; resourcePointer: string; dialect: string|null; family: string; sourceKind?:string;
    /** Primary meta-validation boundary. All intrinsic applicator parents are
     * retained separately by ReferenceGraph.schemaParentsOf(). */
    schemaParent?:string;
};
/** Canonical resource interpretation, separate from the authored spelling of
 * a dialect declaration and from per-entry/role/directional use ownership. */
export const schemaResourceContextIdentity=(scope:GraphScope):string=>JSON.stringify([
    scope.resource,scope.base,scope.resourcePointer,scope.family,
    typeof scope.dialect==='string'?schemaDialectIdentity(scope.dialect):scope.dialect,
]);
/** Restricted OpenAPI evaluation is an owning-family capability, not a
 * general-purpose additional JSON Schema dialect promised in modern roots. */
export const supportedSchemaDialect = (scope: Pick<GraphScope, 'family' | 'dialect'>): boolean =>
    scope.family === '2.0' ? scope.dialect === swaggerSchemaDialect : scope.family === '3.0' ? scope.dialect === restrictedSchemaDialect : modernFamily(scope.family) && typeof scope.dialect==='string' && knownDialects.has(schemaDialectIdentity(scope.dialect)) && ![restrictedSchemaDialect,swaggerSchemaDialect].includes(schemaDialectIdentity(scope.dialect));
export type GraphIssue = GraphTarget & { code: string; message: string; incomplete?: boolean; severity?: 'warning'|'error';connection?:GraphReference['connection'] };
export type PathItemView = {source:GraphTarget;chain:readonly GraphTarget[];fields:ReadonlyMap<string,GraphTarget>;complete:boolean;chainComplete:boolean;conflicts:readonly string[];cyclic:boolean};
export type OperationOccurrence = {source:GraphTarget;pathItem:GraphTarget;path:string;method:string;role:string;occurrence:string;shared:boolean;customMethod?:boolean};
export type GraphReference = GraphScope & {
    keyword: string; value: string; targetUri?: string;
    targetResource?: string; targetPointer?: string;
    targetFamily?: string;
    candidateResources?: string[];
    resolution: string; dynamic?: { anchor: string; candidates: GraphTarget[] };
    connection?: 'security' | 'discriminator' | 'operationId' | 'operationRef';
    candidateTargets?: GraphTarget[];
};

/** Resolved name bindings have no URI target. In particular, a security
 * connection can instead be a 3.2 URI; its map-key syntax does not make it an
 * implicit name (OAS 3.2 §4.30). The graph's namespace lookup decides this. */
export const implicitNameReference=(reference:Pick<GraphReference,'connection'|'targetUri'>):boolean=>
    (reference.connection==='security'||reference.connection==='discriminator')&&reference.targetUri===undefined;

/** An address for an already established schema occurrence. This is not
 * resolution or acquisition; both pointer escaping and resource ownership
 * come from the canonical graph. */
/** RFC 6901 pointer text still needs RFC 3986 fragment encoding. */
export const pointerFragment=(pointer:string)=>'#'+encodeURI(pointer).replaceAll('#','%23').replaceAll('?','%3F');
export const schemaAddress=(scope:GraphScope)=>scope.base+pointerFragment(scope.pointer.slice(scope.resourcePointer.length));

/** Description URI fields retain their canonical occurrence base, including
 * OAS 3.2 $self. Server/API URLs deliberately use the original retrieval
 * location instead (OAS 3.2 §4.1.2.2 / §4.5.2; OAS 3.1 §4.6 / §4.7).
 * Selecting a base grants no permission to retrieve the resulting URI. */
export const documentUriBase=(graph:ReferenceGraph,scope:GraphScope)=>scope.kind==='server'?graph.retrievals.get(scope.resource)!:scope.base;


/** BusyAPI's native CommonMark rendering context follows the captured logical
 * occurrence (OAS 3.1 §4.6 / 3.2 §4.1.2.2.3 leave rendering context to tools).
 * Physical alias ranges remain source coordinates, never a substitute base. */
export function referenceMarkdownBase(graph:ReferenceGraph,resource:string,pointer:string,context?:GraphScope):string|undefined {
    const scope=context??graph.scope(resource,pointer);
    return scope?documentUriBase(graph,scope):undefined;
}


/** Compact wire context: true explicitly selects the descriptor's captured
 * resource URI. Absence never implies a base. Distinct logical/$id bases stay
 * strings; repeating the same URI per field would exhaust bounded projections. */
export type ReferenceMarkdownContext = string | true;
export function referenceMarkdownContext(graph:ReferenceGraph,resource:string,pointer:string,context?:GraphScope):ReferenceMarkdownContext|undefined {
    const base=referenceMarkdownBase(graph,resource,pointer,context);
    return base===resource?true:base;
}

// URI identity never grants access. The caller supplies immutable, approved
// resources; this module has no filesystem, HTTP or resolver dependency.
export function resolveUri(value: string, base: string): URL {
    if (/[\s\\\u0000-\u001f]/u.test(value) || /%(?![a-f\d]{2})/i.test(value))
        throw Error('Invalid URI reference');
    // WHATWG URL cannot resolve empty or query-only references against an
    // opaque identifier. Use the evaluator's RFC resolver for those bases.
    let uri:URL;
    try { uri=new URL(value,base); }
    catch { uri=new URL(resolveIri(value,base.replace(/#.*$/,''))); }
    // RFC 3986 6.2.2.2: percent-encoded unreserved characters identify the
    // same resource. Keep reserved token boundaries encoded and normalize
    // remaining hex digits. This is identity normalization, not acquisition.
    return new URL(uri.href.replace(/%[\da-f]{2}/gi,token=>{
        const character=String.fromCharCode(parseInt(token.slice(1),16));
        return /^[A-Za-z0-9._~-]$/.test(character)?character:token.toUpperCase();
    }));
}

const key = (resource: string, pointer: string) => resource + '#' + pointer;
/** The approval/configuration registry uses the graph's URI primitive, not
 * another resolver. Normalization never acquires or executes a resource. */
export function normalizeResourceUris(input:any) {
    const values=input.values,base=input.base;
    if(!Array.isArray(values)||values.length>256||values.some((value:any)=>typeof value!=='string'||value.length>65536)||base!==null&&base!==undefined&&(typeof base!=='string'||base.length>65536))
        throw new SourceError('resource.identity','Invalid bounded resource URI normalization request');
    const uris=values.map((value:string)=>{
        try{
            if(value.includes('#'))throw Error();
            const uri=resolveUri(value,base??value);
            if(uri.username||uri.password)throw Error();
            return uri.href;
        }catch{throw new SourceError('resource.identity','Use a retrieval URI without a fragment, credentials or invalid escapes');}
    });
    return {version:1,base:base??null,values,uris};
}
const same = (a: GraphTarget, b: GraphTarget) => a.resource === b.resource && a.pointer === b.pointer;

/** A context-aware, located graph, including embedded JSON Schema resources.
 * Dynamic references retain their static target and possible scope entries.
 * Evaluation must supply its dynamic call stack; navigation cannot choose it.
 */
export class ReferenceGraph {
    readonly specifications = new Map<string, Specification>();
    readonly scopes = new Map<string, GraphScope>();
    private readonly documentScopes = new Map<string, GraphScope>();
    private readonly roleScopes = new Map<string, GraphScope>();
    private readonly roleKinds = new Map<string, Set<string>>();
    private readonly intrinsicSchemaParents = new Map<string,Set<string>>();
    private intrinsicSchemaEdges=0;
    private readonly overlappingScopes = new Set<string>();
    private entryUses?:ReadonlySet<string>;
    private dynamicCandidateWork=0;
    private useIdentity(scope:GraphTarget):string{return JSON.stringify([scope.resource,scope.pointer,scope.kind]);}
    /** All parsed declarations remain available for identities and source
     * inspection. Semantic validation belongs to the selected entry's typed
     * uses, plus explicitly captured maintenance occurrences. A foreign OpenAPI
     * document's unused branches have their own entry/dialect/namespace. */
    isEntryUse(scope:GraphTarget):boolean{return this.entryUses===undefined||this.entryUses.has(this.useIdentity(scope));}
    *entryScopes():IterableIterator<GraphScope>{for(const scope of this.interpretedScopes())if(this.isEntryUse(scope))yield scope;}
    referenceOwner(reference:Pick<GraphReference,'resource'|'pointer'|'kind'|'connection'>):GraphScope|undefined {
        const kind=reference.connection==='discriminator'?'discriminator':reference.connection==='security'?'security-requirement':reference.connection?'link':reference.kind;
        return this.scopeAs(reference.resource,reference.pointer,kind)??
            (reference.connection==='discriminator'?this.scopeAs(reference.resource,reference.pointer,'discriminator-map'):undefined);
    }
    entryReferences():readonly GraphReference[] {
        return this.references.filter(reference=>{
            const owner=this.referenceOwner(reference);
            return owner!==undefined&&this.isEntryUse(owner);
        });
    }
    private captureEntryUses(occurrences:readonly GraphTarget[]):void {
        const edges=new Map<string,GraphScope[]>();
        const dynamicReferences=new Map<string,GraphReference[]>();
        let work=0;
        const admit=()=>{if(++work>2000000)throw new SourceError('limit.graph.uses','Entry ownership exceeds 2000000 graph steps');};
        const connect=(source:GraphTarget,target:GraphScope)=>{
            admit();const id=this.useIdentity(source),values=edges.get(id)??[];values.push(target);edges.set(id,values);
        };
        for(const reference of this.references){
            admit();if(reference.resolution!=='resolved')continue;
            const owner=this.referenceOwner(reference);
            const target=this.scopeAs(reference.targetResource!,reference.targetPointer!,reference.kind);
            if(owner&&target)connect(owner,target);
            if(owner&&reference.dynamic){
                const id=this.useIdentity(owner),values=dynamicReferences.get(id)??[];
                values.push(reference);dynamicReferences.set(id,values);
            }
        }
        const selected=new Set<string>(),pending:GraphScope[]=[this.scopeAs(this.root,'','root')!];
        const enteredResources=new Set<string>(),waiting=new Map<string,GraphScope[]>();
        for(const occurrence of occurrences){const scope=this.scopeAs(occurrence.resource,occurrence.pointer,occurrence.kind);if(scope)pending.push(scope);}
        for(let index=0;index<pending.length;index++){
            admit();const scope=pending[index],id=this.useIdentity(scope);
            if(selected.has(id))continue;
            selected.add(id);pending.push(...edges.get(id)??[]);
            if(scope.kind==='schema'){
                const resource=schemaResourceContextIdentity(scope);
                if(!enteredResources.has(resource)){
                    enteredResources.add(resource);pending.push(...waiting.get(resource)??[]);waiting.delete(resource);
                }
            }
            for(const reference of dynamicReferences.get(id)??[])for(const candidate of reference.dynamic!.candidates){
                admit();const schema=this.scopeAs(candidate.resource,candidate.pointer,'schema');if(!schema)continue;
                const resource=schemaResourceContextIdentity(schema);
                if(enteredResources.has(resource))pending.push(schema);
                else {const values=waiting.get(resource)??[];values.push(schema);waiting.set(resource,values);}
            }
            const value=this.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(scope.kind==='schema'&&scope.pointer!==scope.resourcePointer){
                const resource=this.scopeAs(scope.resource,scope.resourcePointer,'schema');
                if(resource&&schemaResourceContextIdentity(resource)===schemaResourceContextIdentity(scope))pending.push(resource);
            }
            if(this.referenceObject(value,scope)&&scope.kind!=='path-item')continue;
            for(const [name,,kind]of children(value,scope.kind,scope.family)){
                admit();const child=this.scopeAs(scope.resource,scope.pointer+'/'+escape(name),kind);
                if(child)pending.push(child);
            }
        }
        this.entryUses=selected;
        // Dynamic anchors are resource-wide, including declarations outside
        // the immediate static path. Only entered resource contexts can
        // contribute overrides; another captured API is not an entered scope.
        for(const reference of this.entryReferences())if(reference.dynamic){
            reference.dynamic={...reference.dynamic,candidates:reference.dynamic.candidates.filter(candidate=>{
                admit();const scope=this.scopeAs(candidate.resource,candidate.pointer,'schema');
                return scope!==undefined&&this.isEntryUse(scope);
            })};
        }
        // Located semantic findings use their nearest captured role, not an
        // arbitrary physical document. Ambiguous identities still diagnose
        // every active reference that encounters the ambiguity.
        const retained=this.issues.filter(issue=>{
            if(issue.connection){
                const owner=this.referenceOwner({...issue,pointer:issue.pointer.slice(0,issue.pointer.lastIndexOf('/'))});
                if(owner)return this.isEntryUse(owner);
            }
            let pointer=issue.pointer;
            for(;;){
                const exact=this.scopeAs(issue.resource,pointer,issue.kind);
                if(exact)return this.isEntryUse(exact);
                const scopes=this.scopesAt(issue.resource,pointer);
                if(scopes.length)return scopes.some(scope=>this.isEntryUse(scope));
                if(!pointer)return issue.resource===this.root;
                pointer=pointer.slice(0,pointer.lastIndexOf('/'));
            }
        });
        this.issues.length=0;for(const issue of retained)this.issues.push(issue);
    }
    private fileTypeChoices:ReadonlySet<string>|undefined;
    /** Reference discovery finishes in the constructor. Reuse one transitive
     * consumer proof across this capture's authoring and Reference fields.
     * Changed roots, declarations and resources create separate graphs. */
    swaggerFileTypeChoices():ReadonlySet<string> {
        return this.fileTypeChoices??=swaggerFileChoiceTargets(this);
    }
    /** Keep the physical authoring context and every explicitly reached role.
     * Each role is validated independently; shared bytes do not imply shared
     * object semantics (OAS 3.0/3.1 Structural Interoperability). */
    scopeAs(resource:string,pointer:string,kind:string):GraphScope|undefined {
        const scope=this.scopes.get(key(resource,pointer));
        return scope?.kind===kind?scope:this.roleScopes.get(key(resource,pointer)+':'+kind);
    }
    /** All intrinsic schema uses, including a child that is independently a
     * native schema root. schemaParent retains its primary meta-validation
     * boundary; executable dependencies follow every captured typed edge. */
    schemaParentsOf(scope:Pick<GraphTarget,'resource'|'pointer'>):readonly GraphScope[] {
        return [...this.intrinsicSchemaParents.get(key(scope.resource,scope.pointer))??[]]
            .flatMap(pointer=>{const parent=this.scopeAs(scope.resource,pointer,'schema');return parent?[parent]:[];});
    }
    scopesAt(resource:string,pointer:string):readonly GraphScope[] {
        const primary=this.scopes.get(key(resource,pointer));
        return [...(primary?[primary]:[]),...[...(this.roleKinds.get(key(resource,pointer))??[])].map(kind=>this.roleScopes.get(key(resource,pointer)+':'+kind)!)];
    }
    /** An optional authoring/documentation choice must name a captured role.
     * It cannot turn data or an unavailable interpretation into a contract. */
    selectedScope(resource:string,pointer:string,kind?:unknown):GraphScope|undefined {
        if(kind===undefined)return this.scopes.get(key(resource,pointer));
        const scope=typeof kind==='string'?this.scopeAs(resource,pointer,kind):undefined;
        if(!scope){
            const range:Range=this.docs.get(resource)?.dataNode(pointer)?.range??[0,0];
            throw new SourceError('inspect.context.stale','The selected object interpretation is no longer established',range,'unsupported',{resource,pointer,range});
        }
        return scope;
    }
    referencesAt(resource:string,pointer:string,kind:string):readonly GraphReference[] {
        return this.references.filter(reference=>reference.resource===resource&&reference.pointer===pointer&&
            (reference.connection==='security'?kind==='security-requirement':
                reference.connection==='discriminator'?['discriminator','discriminator-map'].includes(kind):
                reference.connection?kind==='link':reference.kind===kind));
    }
    /** A single authored reference can have different object-context meanings.
     * Source inspection/evaluation retain both; rewriting needs an explicit
     * split/repair plan rather than choosing one physical-field interpretation. */
    assertReferenceEditsSupported():void {
        const meanings=new Map<string,GraphReference>();
        for(const reference of this.references){
            if(reference.resolution!=='resolved')continue;
            const id=key(reference.resource,reference.pointer)+'/'+escape(reference.keyword),previous=meanings.get(id);
            if(previous&&(previous.kind!==reference.kind||previous.connection!==reference.connection)){
                const pointer=reference.pointer+'/'+escape(reference.keyword),range=this.docs.get(reference.resource)!.dataNode(pointer)!.range;
                throw new SourceError('reference.edit.context','This authored reference is used in multiple object contexts; a faithful shared-field rewrite has not been established',range,'unsupported',{resource:reference.resource,pointer,range});
            }
            meanings.set(id,reference);
        }
    }
    hasOverlappingScope(resource:string,pointer:string):boolean {
        return this.overlappingScopes.has(key(resource,pointer));
    }
    scopesFor(kind:string):GraphScope[] {
        return [...this.interpretedScopes()].filter(scope=>scope.kind===kind);
    }
    /** Every established interpretation, retaining the physical authoring
     * owner and additional explicitly referenced roles as separate uses. */
    *interpretedScopes():IterableIterator<GraphScope> {
        yield* this.scopes.values();yield* this.roleScopes.values();
    }
    readonly references: GraphReference[] = [];
    private referenceRoles?:Map<string,GraphReference>;
    /** Select an established applicator by its object interpretation. A native
     * Reference Object and a Schema reference can share text but have distinct
     * URI bases; insertion order cannot choose their meaning. */
    referenceAs(resource:string,pointer:string,keyword:string,kind:string):GraphReference|undefined {
        if(!this.referenceRoles)this.referenceRoles=new Map(this.references.filter(reference=>!reference.connection).map(reference=>[JSON.stringify([reference.resource,reference.pointer,reference.keyword,reference.kind]),reference]));
        return this.referenceRoles.get(JSON.stringify([resource,pointer,keyword,kind]));
    }

    readonly issues: GraphIssue[] = [];
    readonly identities = new Map<string, GraphTarget[]>();
    readonly anchors = new Map<string, GraphTarget[]>();
    readonly dynamicAnchors = new Map<string, GraphTarget[]>();
    // Retrieval/display/API URL context is distinct from declared $self/$id.
    // The first approved mapping supplies the original expected location; a
    // local cache path is not the document's remote retrieval identity.
    readonly retrievals = new Map<string, string>();
    private indexed = new Set<string>();
    private pending: GraphReference[] = [];
    private issueKeys = new Set<string>();
    private scopeLimited = false;
    private literalIndex?: Map<string, Set<string>>;
    private readonly noLiteralContainers = new Set<string>();
    private pathItems = new Map<string,PathItemView>();
    private pathReferences?: Map<string,GraphReference>;
    private operationIndex?: readonly OperationOccurrence[];
    private operationContextsIndex = new Map<string,OperationOccurrence[]>();
    private schemaAdmissions = new Map<string,{target:GraphTarget;inherited:GraphScope;root:boolean}>();
    private nativeAdmissions = new Map<string,GraphTarget>();
    private contextChanges = new Map<string,GraphTarget>();
    private static readonly scopeBudget=400000;

    /** A pointer may reach a fragment before another edge establishes its
     * enclosing schema resource. OAS 3.1.2 §4.3.1 requires complete context
     * discovery before a reference is deemed missing. Rebuild this same graph
     * from proven enclosing occurrences; never guess schema keywords in data. */
    static capture(docs:Map<string,SourceDocument>,root:string,family:string,aliases:Map<string,string[]>=new Map(),occurrences:GraphTarget[]=[]):ReferenceGraph {
        const seeds=new Map(occurrences.map(target=>[key(target.resource,target.pointer)+':'+target.kind,target]));
        let work=0;
        for(let pass=0;pass<=limits.depth;pass++) {
            const graph=new ReferenceGraph(docs,root,family,aliases,[...seeds.values()]);
            work+=graph.scopes.size+graph.roleScopes.size;
            if(work>2*ReferenceGraph.scopeBudget)break;
            if(!graph.contextChanges.size)return graph;
            const before=seeds.size;
            // A native interpretation can establish schema roots inside data
            // that an enclosing schema treats as an opaque annotation. Admit
            // that proved owner before retrying direct schema pointers.
            for(const [id,target]of graph.nativeAdmissions)seeds.set(id,target);
            for(const {target,root:entry} of graph.schemaAdmissions.values()) {
                if(!entry)continue;
                seeds.set(key(target.resource,target.pointer)+':schema',target);
            }
            if(seeds.size===before)break;
        }
        const range=docs.get(root)!.root.range;
        throw new SourceError('limit.graph.context','The captured schema contexts could not stabilize within the bounded graph budget',range,'unsupported',{resource:root,pointer:'',range});
    }

    constructor(readonly docs: Map<string, SourceDocument>, readonly root: string, readonly family: string, aliases: Map<string, string[]> = new Map(), occurrences: GraphTarget[] = []) {
        // Register identities before resolving any edge, so ordering cannot
        // make duplicate identifiers pick an arbitrary physical document.
        for (const doc of docs.values()) {
            const data = doc.root.value;
            // The containing OpenAPI Object owns the feature set and default
            // dialect. Entry-description namespaces for implicit names are a
            // separate decision; they do not change a referenced document's
            // authored version. Unversioned fragments use the entry context.
            const declaration = specificationDeclaration(data);
            const specification = declaration.status === 'supported' ? declaration.specification : undefined;
            if (specification) this.specifications.set(doc.id, specification);
            const declared = specification?.family ?? (Object.hasOwn(data ?? {}, 'openapi')
                ? declaration.status === 'unsupported' && typeof data.openapi === 'string' && /^(\d+\.\d+)\.\d+$/.test(data.openapi) ? data.openapi.slice(0, data.openapi.lastIndexOf('.')) : 'unknown'
                : Object.hasOwn(data ?? {}, 'swagger') ? 'unknown' : undefined);
            const documentFamily = declared ?? family;
            if (!specification && (Object.hasOwn(data ?? {}, 'openapi') || Object.hasOwn(data ?? {}, 'swagger')) && declaration.status !== 'supported')
                this.issue({resource: doc.id, pointer: declaration.pointer, kind: 'root'}, declaration.code, declaration.message, true);
            // jsonSchemaDialect applies to the containing OpenAPI document.
            // Unversioned external fragments use the OAS dialect (3.1.2
            // §4.8.24.5 / 3.2.1 §4.24.7), not an entry document's override.
            const defaultDialect = defaultSchemaDialect(documentFamily);
            const approvedIdentity = aliases.get(doc.id)?.[0];
            let base = resolveUri(approvedIdentity??doc.id, doc.id).href;
            this.retrievals.set(doc.id, base);
            if (String(data?.openapi).startsWith('3.2.') && typeof data?.$self === 'string') {
                try {
                    const uri = resolveUri(data.$self, base);
                    if (uri.hash) throw Error('Document identity must not contain a fragment');
                    base = uri.href;
                } catch {
                    this.issue({ resource: doc.id, pointer: '/$self', kind: 'root' }, 'reference.uri', 'Invalid OpenAPI document identity');
                }
            }
            const target = { resource: doc.id, pointer: '', kind: 'root' };
            this.register(this.identities, doc.id, target);
            this.register(this.identities, base, target);
            for (const alias of aliases.get(doc.id) ?? []) this.register(this.identities, resolveUri(alias, doc.id).href, target);
            const scope = { ...target, base, resourcePointer: '', dialect: specification ? specification.schemaDialect : defaultDialect, family: documentFamily };
            this.documentScopes.set(doc.id,scope);
            if(specification&&modernFamily(documentFamily)&&specification.schemaDialect===null)
                this.issue({...target,pointer:'/jsonSchemaDialect'},'schema.dialect.malformed','A schema dialect declaration must be a URI string; no default dialect was selected',true,'error');
            this.scopes.set(key(doc.id, ''), scope);
            if (doc.id === root || specification)
                this.index(doc.id, '', 'root', scope);
            else if (data && typeof data === 'object' && ['$id', '$schema', '$anchor', '$dynamicAnchor'].some(k => Object.hasOwn(data, k)))
                this.index(doc.id, '', 'schema', scope);
        }
        // Refactoring may temporarily disconnect an already proven occurrence
        // while repairing its incoming locator. Re-index only those captured
        // typed positions; final/cold proofs use ordinary closure without seeds.
        for (const occurrence of [...occurrences].sort((a,b)=>a.pointer.length-b.pointer.length)) {
            if (!docs.get(occurrence.resource)?.dataNode(occurrence.pointer))
                throw Error('Captured semantic occurrence is absent');
            this.index(occurrence.resource, occurrence.pointer, occurrence.kind, this.scope(occurrence.resource, occurrence.pointer));
        }
        // Referenced fragments receive their actual occurrence context, rather
        // than interpreting every key in an arbitrary fragment as a schema.
        for (let pass = 0; pass <= limits.depth; pass++) {
            const before = this.indexed.size;
            for (let i = 0; i < this.pending.length; i++) {
                const ref = this.pending[i];
                const resolved = this.resolveConnection(ref);
                Object.assign(ref, resolved);
                if (ref.targetResource !== undefined && ref.targetPointer !== undefined && ref.resolution === 'resolved') {
                    const scope = this.scope(ref.targetResource, ref.targetPointer);
                    this.index(ref.targetResource, ref.targetPointer, ref.kind, scope);
                }
            }
            if (this.indexed.size === before) break;
            if (pass === limits.depth) this.issue(this.scope(root, ''), 'limit.graph.depth', 'Semantic graph closure exceeds the bounded limit', true);
        }
        // A later reached fragment may declare an identifier/anchor needed by
        // an earlier edge. Re-resolve all edges against the complete index.
        for (const ref of this.references) {
            delete ref.targetResource; delete ref.targetPointer; delete ref.targetFamily; delete ref.dynamic;
            Object.assign(ref, this.resolveConnection(ref));
            if(ref.resolution==='resolved'&&ref.kind==='schema'&&!modernFamily(ref.family)){
                const value=this.docs.get(ref.targetResource!)!.dataNode(ref.targetPointer!)?.value;
                if(value===null||typeof value!=='object'||Array.isArray(value))
                    this.issue({...ref,pointer:ref.pointer+'/'+escape(ref.keyword)},'reference.target.schema',
                        'This family requires a Schema or Reference Object target; a permitted boolean field is not a standalone Schema Object');
            }
            if (ref.resolution !== 'resolved') {
                const code = ref.resolution === 'unavailable' ? 'reference.unavailable' :
                    ref.resolution === 'ambiguous' ? 'reference.ambiguous' :
                    ref.resolution === 'invalid' ? 'reference.uri' :
                    ref.resolution === 'incompatible-family' ? 'reference.family.unsupported' :
                    ref.resolution === 'unsupported' ? 'reference.dialect.unsupported' : 'reference.missing';
                this.issue({ ...ref, pointer: ref.pointer + '/' + escape(ref.keyword) }, code,
                    ref.resolution === 'unavailable' ? 'Referenced identity is unavailable or outside approved access' :
                    ref.resolution === 'ambiguous' ? 'Reference identity has multiple definitions' :
                    ref.resolution === 'incompatible-family' ? `This reference combines OpenAPI ${ref.family} and ${ref.targetFamily} object semantics; cross-family evaluation involving a legacy specification is unsupported. Use a definition authored for the referring family.` :
                    ref.resolution === 'unsupported' ? 'Reference evaluation requires support for the declared schema dialect' :
                    ref.resolution === 'invalid' ? 'Invalid URI reference or JSON Pointer fragment' : 'Reference target does not exist',
                    ['unavailable', 'ambiguous', 'unsupported', 'incompatible-family'].includes(ref.resolution),
                    ref.resolution === 'incompatible-family' ? 'warning' : undefined);
            }
        }
        this.checkReferenceChains();
        for(const scope of this.scopes.values())if(scope.kind==='path-item')this.pathItem(scope);
        this.operations();
        this.captureEntryUses(occurrences);
    }

    /** Located Path Item fields, not a merged API object. Non-overlapping
     * fields retain their own authored owner along a captured $ref chain.
     * Overlap has undefined behavior in both supported families: withhold that
     * field and report both owners rather than choosing a winner. */
    pathItem(source:GraphTarget):PathItemView {
        const identity=key(source.resource,source.pointer),cached=this.pathItems.get(identity);
        if(cached)return cached;
        this.pathReferences??=new Map(this.references.filter(ref=>ref.kind==='path-item'&&ref.keyword==='$ref'&&!ref.connection).map(ref=>[key(ref.resource,ref.pointer),ref]));
        const chain:GraphTarget[]=[],fields=new Map<string,GraphTarget>(),seen=new Set<string>(),conflicts=new Set<string>();
        let current:GraphTarget={resource:source.resource,pointer:source.pointer,kind:'path-item'},complete=true,chainComplete=true,cyclic=false;
        for(let depth=0;depth<=limits.depth;depth++) {
            const at=key(current.resource,current.pointer);
            if(seen.has(at)||depth===limits.depth) {
                complete=false;chainComplete=false;cyclic=seen.has(at);
                this.issue({...current,pointer:current.pointer+'/$ref'},seen.has(at)?'path.reference.cycle.incomplete':'limit.path.reference.depth',
                    seen.has(at)?'The Path Item reference chain is cyclic; no unconditional field inheritance is inferred':'Path Item reference inheritance exceeds the bounded depth',true,'warning');
                break;
            }
            seen.add(at);chain.push(current);
            const doc=this.docs.get(current.resource),node=doc?.dataNode(current.pointer);
            if(!doc||!node||node.kind!=='object') {complete=false;chainComplete=false;break;}
            const kinds=new Map(children(node.value,'path-item',this.scope(current.resource,current.pointer).family).map(([name,,kind])=>[name,kind]));
            for(const name of node.children.keys()) {
                if(name==='$ref')continue;
                const field={resource:current.resource,pointer:current.pointer+'/'+escape(name),kind:kinds.get(name)??'data'};
                const previous=fields.get(name);
                if(previous||conflicts.has(name)) {
                    complete=false;conflicts.add(name);fields.delete(name);
                    const message='This field occurs in both a Path Item and its referenced definition; their combined behavior is undefined';
                    if(previous)this.issue(previous,'path.reference.overlap',message,true,'warning');
                    this.issue(field,'path.reference.overlap',message,true,'warning');
                }else fields.set(name,field);
            }
            if(typeof node.value.$ref!=='string')break;
            const edge=this.pathReferences.get(at);
            if(!edge||edge.resolution!=='resolved') {complete=false;chainComplete=false;break;}
            current={resource:edge.targetResource!,pointer:edge.targetPointer!,kind:'path-item'};
        }
        const result={source:{resource:source.resource,pointer:source.pointer,kind:'path-item'},chain,fields,complete,chainComplete,conflicts:[...conflicts],cyclic};
        this.pathItems.set(identity,result);return result;
    }

    /** One semantic operation inventory for all projections. Physical source,
     * logical Path Item occurrence and callback/webhook role stay separate;
     * this never copies or merges authored Operation Objects. */
    operations():readonly OperationOccurrence[] {
        if(this.operationIndex)return this.operationIndex;
        const result:OperationOccurrence[]=[],callbacks=new Map(this.references.filter(ref=>ref.kind==='callback'&&ref.keyword==='$ref'&&!ref.connection).map(ref=>[key(ref.resource,ref.pointer),ref]));
        const collect=(pathItem:GraphTarget,path:string,occurrence:string,role:string,ancestors:ReadonlySet<string>,forceShared=false)=>{
            const owner=key(pathItem.resource,pathItem.pointer);
            if(this.scopes.get(owner)?.kind!=='path-item')return;
            if(ancestors.has(owner))return;
            if(ancestors.size>=32){this.issue(pathItem,'limit.callback.depth','Callback navigation exceeds the bounded depth',true,'warning');return;}
            const nested=new Set(ancestors);nested.add(owner);
            const view=this.pathItem(pathItem);
            const add=(method:string,source:GraphTarget,suffix:string,customMethod=false)=>{
                if(result.length>=40000){this.issue(pathItem,'limit.operation.occurrences','Operation navigation exceeds 40000 occurrences',true,'warning');return;}
                const shared=forceShared||source.resource!==pathItem.resource||source.pointer!==pathItem.pointer+suffix;
                result.push({source,pathItem,path,method,role,occurrence:occurrence+suffix,shared,customMethod});
                const doc=this.docs.get(source.resource)!;
                for(const name of doc.dataNode(source.pointer+'/callbacks')?.children.keys()??[]){
                    let at:GraphTarget={resource:source.resource,pointer:source.pointer+'/callbacks/'+escape(name),kind:'callback'};
                    const seen=new Set<string>();let resolved=true;
                    while(typeof this.docs.get(at.resource)?.dataNode(at.pointer)?.value?.$ref==='string'){
                        const identity=key(at.resource,at.pointer),edge=callbacks.get(identity);
                        if(seen.has(identity)){
                            this.issue({...at,pointer:at.pointer+'/$ref'},'callback.reference.cycle.incomplete','The Callback reference cycle has no concrete runtime-expression map',true,'warning');resolved=false;break;
                        }
                        seen.add(identity);
                        if(!edge||edge.resolution!=='resolved'){resolved=false;break;}
                        at={resource:edge.targetResource!,pointer:edge.targetPointer!,kind:'callback'};
                    }
                    if(!resolved)continue;
                    const callback=this.docs.get(at.resource)?.dataNode(at.pointer);
                    for(const [expression,,kind]of children(callback?.value,'callback',this.scope(at.resource,at.pointer).family)){
                        if(kind!=='path-item')continue;
                        const child='/'+escape(expression);
                        collect({resource:at.resource,pointer:at.pointer+child,kind},expression,occurrence+suffix+'/callbacks/'+escape(name)+child,'callback',nested,seen.size>0||shared);
                    }
                }
            };
            for(const [name,field]of view.fields){
                if(field.kind==='operation')add(name,field,'/'+escape(name));
                else if(field.kind==='operation-map')for(const method of this.docs.get(field.resource)?.dataNode(field.pointer)?.children.keys()??[])
                    add(method,{resource:field.resource,pointer:field.pointer+'/'+escape(method),kind:'operation'},'/additionalOperations/'+escape(method),true);
            }
        };
        const doc=this.docs.get(this.root)!;
        for(const collection of ['paths','webhooks'])for(const name of doc.dataNode('/'+collection)?.children.keys()??[]){
            if(collection==='paths'&&name.startsWith('x-'))continue;
            const pointer='/'+collection+'/'+escape(name);
            collect({resource:this.root,pointer,kind:'path-item'},name,this.root+'#'+pointer,collection==='paths'?'operation':'webhook',new Set());
        }
        for(const occurrence of result){
            const identity=key(occurrence.source.resource,occurrence.source.pointer),values=this.operationContextsIndex.get(identity)??[];
            values.push(occurrence);this.operationContextsIndex.set(identity,values);
        }
        return this.operationIndex=result;
    }
    operationContexts(resource:string,pointer:string):readonly OperationOccurrence[] {
        this.operations();return this.operationContextsIndex.get(key(resource,pointer))??[];
    }

    /** Containers outside semantic traversal, including instance data and
     * ignored Reference Object siblings. This is occurrence ownership, not a
     * declaration that every non-schema keyword has no structural semantics.
     * The completed graph supplies it to exporters and semantic repair guards.
     */
    literalContainers(resource: string): ReadonlySet<string> {
        if (!this.literalIndex) {
            this.literalIndex = new Map();
            for (const scope of this.scopes.values()) {
                const doc = this.docs.get(scope.resource)!;
                if (scope.kind === 'root' && !this.specifications.has(doc.id)) continue;
                const node = doc.dataNode(scope.pointer)!;
                const typed = new Set(this.referenceObject(node.value, scope) ? [] : children(node.value, scope.kind, scope.family).map(([name]) => name));
                for (const [name, authored] of node.children) {
                    if (typed.has(name)) continue;
                    const pointer = scope.pointer + '/' + escape(name);
                    const child = authored.alias ? doc.dataNode(pointer) ?? authored : authored;
                    // Boolean payloads are also legal schema targets. An
                    // alias keeps the literal occurrence's ownership without
                    // granting any permission to expand/edit canonical YAML.
                    if (child.kind !== 'object' && child.kind !== 'array' && typeof child.value !== 'boolean') continue;
                    const values = this.literalIndex.get(scope.resource) ?? new Set<string>();
                    values.add(pointer);
                    this.literalIndex.set(scope.resource, values);
                }
            }
        }
        return this.literalIndex.get(resource) ?? this.noLiteralContainers;
    }
    literalContainer(resource: string, pointer: string): string | undefined {
        const containers = this.literalContainers(resource);
        let at = pointer;
        while (true) {
            if (containers.has(at)) return at;
            if (!at) return;
            at = at.slice(0, at.lastIndexOf('/'));
        }
    }
    scope(resource: string, pointer: string): GraphScope {
        let at = pointer;
        while (!this.scopes.has(key(resource, at)) && at) at = at.slice(0, at.lastIndexOf('/'));
        return this.scopes.get(key(resource, at))!;
    }

    /** Prove a proposed connection using the same namespace/URI rules as
     * captured edges. This grants no acquisition or source-edit permission. */
    resolveConnection(ref: GraphScope & Pick<GraphReference,'connection'|'keyword'|'value'>): Partial<GraphReference> {
        if (ref.connection === 'operationId') {
            const targets = this.scopesFor('operation').filter(scope => this.docs.get(scope.resource)?.dataNode(scope.pointer)?.value?.operationId === ref.value);
            if (targets.length !== 1) return {resolution: targets.length ? 'ambiguous' : 'missing', candidateTargets: targets, candidateResources: [...new Set(targets.map(t => t.resource))]};
            return {resolution: 'resolved', targetResource: targets[0].resource, targetPointer: targets[0].pointer};
        }
        if (ref.connection === 'security' || ref.connection === 'discriminator') {
            // BusyAPI follows the OAS-recommended entry-description namespace
            // for implicit names in referenced fragments. URI identity remains
            // separate, and a matching component name takes precedence in 3.2.
            const group = ref.connection === 'security' ? 'securitySchemes' : 'schemas';
            const pointer = (this.family==='2.0'?ref.connection==='security'?'/securityDefinitions':'/definitions':'/components/'+group) + '/' + escape(ref.value);
            if (this.docs.get(this.root)?.dataNode(pointer)) return {resolution: 'resolved', targetResource: this.root, targetPointer: pointer};
            if (ref.connection === 'security' && (!isNativeFamily(ref.family) || !capabilitiesFor(ref.family).securityRequirementUris)) return {resolution: 'missing', targetResource: this.root, targetPointer: pointer};
            // A mapping/member name is data, including "$ref" and
            // "$dynamicRef". Native URI connections use static identity and
            // their captured native base; their spelling cannot activate a
            // Schema Object applicator or Reference Object restrictions.
            return this.resolve(ref.value,{...ref,kind:ref.connection==='security'?'security-requirement':'discriminator'});
        }
        return this.resolveReference(ref.value, ref, ref.keyword);
    }

    /** Swagger's reusable Parameters/Responses definitions contain Objects,
     * not Reference Objects (2.0 §§6.4.21–22). An unversioned fragment can use
     * the same key spelling without becoming an OpenAPI definitions namespace.
     * Schema references and usage-site references retain their own rules. */
    private referencePositionAllowed(scope: GraphScope): boolean {
        return !(scope.family === '2.0' && this.specifications.has(scope.resource) &&
            (scope.kind === 'parameter' && /^\/parameters\/[^/]+$/.test(scope.pointer) ||
             scope.kind === 'response' && /^\/responses\/[^/]+$/.test(scope.pointer)));
    }

    allowsReference(scope: GraphScope): boolean {
        return supportsReference(scope.kind, scope.family) && (scope.kind !== 'media' || scope.family === '3.2') && this.referencePositionAllowed(scope);
    }

    referenceObject(value: unknown, scope: GraphScope): boolean {
        return this.referencePositionAllowed(scope) && isReferenceObject(value, scope.kind, scope.family);
    }

    /** Object-context resolution shared by graph edges, authoring choices,
     * evaluation adapters and refactoring proofs. operationRef identifies an
     * operation without substituting its object into the referring context. */
    resolveReference(value: string, scope: GraphScope, keyword = '$ref'): Partial<GraphReference> {
        if (keyword === '$ref' && !this.referencePositionAllowed(scope)) return {resolution: 'invalid-position'};
        const resolved = this.resolve(value, scope, keyword === '$dynamicRef');
        if (keyword === '$ref' && resolved.resolution === 'resolved') {
            const target = this.scope(resolved.targetResource!, resolved.targetPointer!);
            // Legacy Reference Objects do not switch schema dialects (3.0
            // §§4.3.1,4.7.23; 2.0 §§6.4.17–18). Preserve the declared family
            // of both documents and report this ambiguous combination instead
            // of evaluating one under the other's rules. Modern document
            // ownership and JSON Schema dialect boundaries remain intact.
            if (isNativeFamily(target.family) && target.family !== scope.family &&
                (!modernFamily(scope.family) || !modernFamily(target.family)))
                return {...resolved, targetFamily: target.family, resolution: 'incompatible-family'};
        }
        return resolved;
    }

    /** URI/Pointer identity primitive. Contract substitutions and address
     * choices must use resolveReference to retain the object context. */
    resolve(value: string, scope: GraphScope, dynamic = false): Partial<GraphReference> {
        if (scope.kind === 'schema' && !supportedSchemaDialect(scope))
            return { resolution: 'unsupported' };
        let uri: URL, fragment: string;
        try {
            uri = resolveUri(value, scope.base);
            fragment = decodeURIComponent(uri.hash.slice(1));
            if (fragment.startsWith('/') && /~(?![01])/u.test(fragment)) throw Error('Invalid pointer escape');
            uri.hash = '';
        } catch { return { resolution: 'invalid' }; }
        const targetUri = uri.href;
        const identities = this.identities.get(targetUri);
        if (!identities?.length) return { targetUri, targetResource: targetUri, resolution: 'unavailable' };
        if (identities.length !== 1) return { targetUri, candidateResources: [...new Set(identities.map(t => t.resource))], resolution: 'ambiguous' };
        let target = identities[0];
        if (fragment && !fragment.startsWith('/')) {
            // Retrieval aliases of a schema resource share its anchors, not
            // only its JSON Pointer locations. The alias must identify this
            // resource root; it does not expose anchors in arbitrary nested
            // resources. Conflicting identifiers/anchors remain ambiguous.
            const canonical=this.scope(target.resource,target.pointer);
            const anchorBase=canonical.resourcePointer===target.pointer?canonical.base:targetUri;
            const anchors = this.anchors.get(anchorBase + '#' + fragment);
            if (!anchors?.length) return { targetUri, targetResource: target.resource, resolution: 'missing' };
            if (anchors.length !== 1) return { targetUri, candidateResources: [...new Set(anchors.map(t => t.resource))], resolution: 'ambiguous' };
            target = anchors[0];
        } else {
            target = { ...target, pointer: target.pointer + fragment };
        }
        const doc = this.docs.get(target.resource);
        if (!doc?.dataNode(target.pointer)) return { targetUri, targetResource: target.resource, targetPointer: target.pointer, resolution: 'missing' };
        const result: Partial<GraphReference> = { targetUri, targetResource: target.resource, targetPointer: target.pointer, resolution: 'resolved' };
        if (dynamic && fragment && !fragment.startsWith('/') &&
            this.dynamicAnchors.get(fragment)?.some(t => same(t, target))){
            const candidates=this.dynamicAnchors.get(fragment)!;
            if((this.dynamicCandidateWork+=candidates.length)>2000000){
                const range:Range=this.docs.get(scope.resource)?.dataNode(scope.pointer)?.range??[0,0];
                throw new SourceError('limit.graph.dynamic-candidates','Dynamic reference capture exceeds 2000000 candidate steps',range,'unsupported',{resource:scope.resource,pointer:scope.pointer,range});
            }
            result.dynamic = { anchor: fragment, candidates: [...candidates] };
        }
        return result;
    }

    private register(index: Map<string, GraphTarget[]>, identity: string, target: GraphTarget) {
        const values = index.get(identity) ?? [];
        if (values.some(t => same(t, target))) return;
        values.push(target); index.set(identity, values);
        if (values.length > 1)
            for (const value of values)
                this.issue(value, 'reference.identity.duplicate', 'Multiple source locations declare the same resource or anchor identity', true);
    }

    private issue(target: GraphTarget&{connection?:GraphReference['connection']}, code: string, message: string, incomplete = false,severity?:'warning'|'error') {
        const id = JSON.stringify([target.resource,target.pointer,target.kind,target.connection??'',code]);
        if (this.issueKeys.has(id)) return;
        this.issueKeys.add(id); this.issues.push({ ...target, code, message, incomplete,...(severity?{severity}:{}) });
    }

    /** Schema maps in Components are roots; maps/arrays reached through an
     * actual Schema Object keyword are intrinsic subschema containment. A
     * physical schema ancestor alone cannot decide an independently parsed
     * native object's dialect-declaration rules. */
    private schemaChildContext(inherited:GraphScope):GraphScope|undefined {
        if(inherited.kind==='schema')return inherited;
        if(!['schema-map','schema-array'].includes(inherited.kind))return;
        const parent=inherited.pointer.slice(0,inherited.pointer.lastIndexOf('/'));
        const owner=this.scopeAs(inherited.resource,parent,'schema');
        return owner&&children(this.docs.get(owner.resource)!.dataNode(parent)?.value,'schema',owner.family)
            .some(([name,,kind])=>kind===inherited.kind&&parent+'/'+escape(name)===inherited.pointer)?owner:undefined;
    }

    private index(resource: string, pointer: string, kind: string, inherited: GraphScope, depth = 0) {
        // An independently reached OpenAPI Object does not inherit a Schema
        // Object's $id/$schema merely because those bytes were indexed first.
        // Native URI fields use the document context; its nested schemas then
        // establish their own resource identities and dialects as usual.
        if(depth===0&&kind!=='schema'&&inherited.kind==='schema')
            inherited=this.documentScopes.get(resource)!;
        const schemaOwner=kind==='schema'&&depth>0?this.schemaChildContext(inherited):undefined;
        const intrinsic=schemaOwner!==undefined;
        // Preserve unavailable feature sets as source, not a compatibility
        // layer interpreted using one of the supported authoring families.
        if (!isNativeFamily(inherited.family)) return;
        const id = key(resource, pointer) + ':' + kind;
        if(schemaOwner){
            const location=key(resource,pointer),parents=this.intrinsicSchemaParents.get(location)??new Set<string>();
            if(!parents.has(schemaOwner.pointer)){
                if(++this.intrinsicSchemaEdges>2000000)
                    throw new SourceError('limit.graph.schema-uses','Intrinsic schema ownership exceeds 2000000 typed edges');
                parents.add(schemaOwner.pointer);this.intrinsicSchemaParents.set(location,parents);
            }
        }
        if (this.indexed.has(id)) {
            const previous=kind==='schema'&&depth>0?this.schemaAdmissions.get(id):undefined;
            const sameContext=previous&&(['base','resourcePointer','dialect','family'] as const).every(field=>previous.inherited[field]===inherited[field]);
            const value=previous&&this.docs.get(resource)!.dataNode(pointer)?.value;
            // A native Components schema map can also be an independently
            // referenced Schema Object. Its applicators may reach a member
            // already admitted as a native schema root. Equal resource/dialect
            // contexts share that executable schema while both typed container
            // edges remain captured. Retain the native root for independent
            // meta-validation. A $schema without its own $id has different
            // root/subschema applicability and cannot use this equivalence.
            const nativeRootUse=previous!==undefined&&sameContext&&intrinsic&&previous.root&&
                previous.inherited.kind==='schema-map'&&schemaOwner?.pointer===previous.inherited.pointer&&
                this.scopeAs(resource,previous.inherited.pointer,'schema-map')!==undefined;
            const sharedNativeRoot=nativeRootUse&&(!Object.hasOwn(value??{},'$schema')||typeof value?.$id==='string');
            if(nativeRootUse&&!sharedNativeRoot){
                const at=pointer+'/$schema',range=this.docs.get(resource)!.dataNode(at)!.range;
                throw new SourceError('reference.schema.context','This dialect declaration has both native-root and intrinsic-subschema interpretations; the latter requires its own schema resource identity',range,'unsupported',{resource,pointer:at,range});
            }
            if(previous&&(!sameContext||previous.root&&intrinsic&&!sharedNativeRoot))
                this.contextChanges.set(id,previous.target);
            return;
        }
        if(this.indexed.size>=ReferenceGraph.scopeBudget) {
            if(!this.scopeLimited) {
                this.scopeLimited=true;
                this.issue({resource:this.root,pointer:'',kind:'root'},'limit.graph.scopes','Semantic occurrences exceed the bounded scope budget',true);
            }
            return;
        }
        this.indexed.add(id);
        const target = { resource, pointer, kind };
        if(kind==='schema')this.schemaAdmissions.set(id,{target,inherited,root:!intrinsic});
        else if(depth===0&&kind!=='root')this.nativeAdmissions.set(id,target);
        const established=this.scopes.get(key(resource,pointer));
        const differentRole=established&&established.kind!==kind&&this.indexed.has(key(resource,pointer)+':'+established.kind);
        const separateRole=differentRole&&
            (established.kind!=='root'||this.specifications.has(resource));
        // A whole OpenAPI document can also be a JSON Schema: its OpenAPI
        // members are extension keywords in that use. Other typed positions
        // retain the context declared by their containing specification object.
        if(differentRole&&!separateRole&&!(established.kind==='root'&&kind==='schema')) {
            this.issue(established,'reference.target.context','This location is used as incompatible OpenAPI object kinds; its original context is retained');
            return;
        }
        if (depth > limits.depth) {
            this.issue(target, 'limit.graph.depth', 'Semantic graph nesting exceeds the bounded limit', true); return;
        }
        const doc = this.docs.get(resource)!;
        const value = doc.dataNode(pointer)?.value;
        let scope = { ...inherited, ...target };
        // Interpretation provenance belongs to this occurrence, not its children.
        delete scope.sourceKind;
        delete scope.schemaParent;
        if(schemaOwner)scope.schemaParent=schemaOwner.pointer;
        if (kind === 'schema' && modernFamily(scope.family) && value && typeof value === 'object') {
            if (typeof value.$id === 'string') {
                try {
                    const uri = resolveUri(value.$id, inherited.base);
                    if (uri.hash) throw Error('Schema resource identity must not contain a fragment');
                    // 2020-12 Core 8.2.1 permits an empty fragment, but the
                    // canonical resource/base URI is always fragment-free.
                    // Generic URL normalization does not establish this
                    // schema-specific equivalence. Keep authored text intact.
                    uri.hash = '';
                    scope = { ...scope, base: uri.href, resourcePointer: pointer };
                    // The retrieval URI and an explicit root $id are aliases.
                    if (!pointer && this.identities.get(uri.href)?.every(t => same(t, target)))
                        this.identities.set(uri.href, [target]);
                    else this.register(this.identities, uri.href, target);
                } catch { this.issue({ ...target, pointer: pointer + '/$id' }, 'reference.uri', 'Invalid schema resource identity'); }
            }
            if (Object.hasOwn(value,'$schema')) {
                const dialect=declaredSchemaDialect(value.$schema);
                if(dialect===null) {
                    scope.dialect=null;
                    this.issue({...target,pointer:pointer+'/$schema'},'schema.dialect.malformed','A schema dialect declaration must be a URI string; no inherited dialect was selected',true,'error');
                } else if (intrinsic && scope.resourcePointer !== pointer)
                    this.issue({ ...target, pointer: pointer + '/$schema' }, 'schema.dialect.location', 'A nested dialect declaration requires a schema resource root');
                else scope.dialect = dialect;
            }
            for (const keyword of ['$anchor', '$dynamicAnchor']) {
                if (typeof value[keyword] !== 'string') continue;
                const anchor = value[keyword];
                if (!/^[A-Za-z_][-A-Za-z0-9._]*$/u.test(anchor)) {
                    this.issue({ ...target, pointer: pointer + '/' + keyword }, 'schema.anchor', 'Invalid JSON Schema anchor name'); continue;
                }
                this.register(this.anchors, scope.base + '#' + anchor, target);
                if (keyword === '$dynamicAnchor') {
                    const candidates = this.dynamicAnchors.get(anchor) ?? [];
                    if (!candidates.some(t => same(t, target))) candidates.push(target);
                    this.dynamicAnchors.set(anchor, candidates);
                }
            }
            if (!supportedSchemaDialect(scope))
                this.issue(target, 'dialect.unsupported', 'The declared JSON Schema dialect is not supported', true);
        }
        if(separateRole){
            this.overlappingScopes.add(key(resource,pointer));
            const roles=this.roleKinds.get(key(resource,pointer))??new Set<string>();
            const primarySchema=established.kind==='schema'&&kind!=='schema'&&depth>0&&this.schemaAdmissions.get(key(resource,pointer)+':schema')?.root;
            if(primarySchema){
                this.roleScopes.set(key(resource,pointer)+':schema',{...established,sourceKind:kind});
                roles.add('schema');
                this.scopes.set(key(resource,pointer),scope);
            }else {this.roleScopes.set(id,{...scope,sourceKind:established.kind});roles.add(kind);}
            this.roleKinds.set(key(resource,pointer),roles);
        }else this.scopes.set(key(resource, pointer), scope);
        if (!value || typeof value !== 'object') return;
        const refKind = this.allowsReference(scope);
        for (const keyword of kind === 'schema' && modernFamily(scope.family) ? ['$ref', '$dynamicRef'] : ['$ref']) {
            if (!refKind || typeof value[keyword] !== 'string') continue;
            const ref: GraphReference = { ...scope, keyword, value: value[keyword], resolution: 'pending' };
            this.references.push(ref); this.pending.push(ref);
        }
        // Reference Object siblings are summary/description, never object
        // definitions. Schema $ref is an applicator with ordinary siblings.
        if (this.referenceObject(value,scope)) return;
        const connection = (pointer: string, keyword: string, name: string, targetKind: string, type: GraphReference['connection']) => {
            const ref: GraphReference = {...scope, pointer, kind: targetKind, keyword, value: name, resolution: 'pending', connection: type};
            this.references.push(ref); this.pending.push(ref);
        };
        if (kind === 'security-requirement')
            for (const name of Object.keys(value)) connection(pointer, name, name, 'security', 'security');
        if (kind === 'link') {
            if (typeof value.operationRef === 'string') connection(pointer, 'operationRef', value.operationRef, 'operation', 'operationRef');
            if (typeof value.operationId === 'string') connection(pointer, 'operationId', value.operationId, 'operation', 'operationId');
        }
        if (kind === 'discriminator') {
            for (const [name, target] of Object.entries(value.mapping ?? {}))
                if (typeof target === 'string') connection(pointer + '/mapping', name, target, 'schema', 'discriminator');
            if (scope.family === '3.2' && typeof value.defaultMapping === 'string') connection(pointer, 'defaultMapping', value.defaultMapping, 'schema', 'discriminator');
        }
        for (const [name, , next] of children(value, kind, scope.family))
            this.index(resource, pointer + '/' + escape(name), next, scope, depth + 1);
    }

    /** Reference Objects need a concrete target. Schema applicator recursion
     * and Path Item inheritance have separate semantics and remain eligible. */
    private checkReferenceChains() {
        const id=(ref:GraphTarget)=>key(ref.resource,ref.pointer)+':'+ref.kind;
        const edges=new Map(this.references.filter(ref=>ref.keyword==='$ref'&&!ref.connection&&ref.kind!=='path-item'&&(ref.kind!=='schema'||!modernFamily(ref.family))).map(ref=>[id(ref),ref]));
        const cyclic=new Map<string,boolean>();
        for(const [start,first] of edges) {
            if(cyclic.has(start))continue;
            const path:GraphReference[]=[],seen=new Set<string>();
            let ref:GraphReference|undefined=first,cycle=false;
            while(ref) {
                const at=id(ref);
                if(cyclic.has(at)){cycle=cyclic.get(at)!;break;}
                if(seen.has(at)){cycle=true;break;}
                seen.add(at);path.push(ref);
                if(ref.resolution!=='resolved')break;
                ref=edges.get(id({resource:ref.targetResource!,pointer:ref.targetPointer!,kind:ref.kind}));
            }
            for(const edge of path) {
                cyclic.set(id(edge),cycle);
                if(cycle)this.issue({...edge,pointer:edge.pointer+'/$ref'},'reference.cycle','This Reference Object chain cannot reach a concrete object');
            }
        }
    }
}
