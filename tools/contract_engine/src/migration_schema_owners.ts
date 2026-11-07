import {createHash} from 'node:crypto';
import {children,standardOperationMethods} from './contexts';
import {componentLocation,richTextField} from './authoring';
import {escape,segments,SourceError,type Range,type SourceDocument} from './document';
import {documentUriOccurrences,type DocumentUriOccurrence} from './document_uris';
import {documentUriBase,resolveUri,pointerFragment,schemaResourceContextIdentity,type ReferenceGraph,type GraphScope,type GraphReference} from './reference_graph';
import type {MigrationLocation,MigrationSource} from './migration_source';
import {migrationLogicalPointers} from './migration_yaml_ownership';
import {modernFamily} from './specification';
import {projectSchemaReference} from './schema_reference_projection';

type SemanticOwner=Readonly<{source:GraphScope;owner:GraphScope;location:MigrationLocation}>;
export type MigrationOwnerLayout='array-item'|'callback-path-item'|'callback-operation'|'path-item-operation'|'response-media'|'response-header'|'parameter-path-item'|'parameter-operation';
export type MigrationApplicationKind='condition'|'dependency'|'allOf'|'anyOf'|'oneOf';
export type MigrationOperationSlot=Readonly<{
    method:string;additional:boolean;
    parameters?:readonly MigrationLocation[];
    servers?:Readonly<{source?:MigrationSource;pointer?:string;urls:readonly string[]}>;
}>;

/** Generated schema and OpenAPI object owners share one reservation/provenance boundary. A label
 * describes the reviewed restructuring; identity comes from the captured use,
 * never from payload keys or whichever entry happened to be visited first. */
export class MigrationSchemaOwners {
    private readonly reserved=new Set<string>();
    private readonly resourceIdentities=new Set<string>();
    private readonly externalIdentities:ReadonlySet<string>;
    private edits=0;
    private work=0;
    private readonly entryUses=new Map<string,SemanticOwner[]>();
    private readonly roleUses=new Map<string,SemanticOwner[]>();
    private readonly additionalUses=new Map<string,{location:MigrationLocation;excludedFields:ReadonlySet<string>}[]>();
    private readonly copiedOperationIds=new Set<string>();
    private readonly connectionAliases=new Map<string,string>();
    private readonly nativeReleases:{family:string;source:MigrationSource;material:MigrationLocation;retirement:MigrationLocation;
        container:string;destination:{source:MigrationSource;location:MigrationLocation}}[]=[];
    private readonly copiedOwners=new Map<string,{location:MigrationLocation;retirement:MigrationLocation;schemaIdentity:boolean;nativeAnnotation?:string}>();
    private readonly resourceReferences:{slot:MigrationLocation;scope:GraphScope;
        parent:{scope:GraphScope;location:MigrationLocation}}[]=[];
    private readonly documentUris=new WeakMap<ReferenceGraph,readonly DocumentUriOccurrence[]>();
    private identityConsumers?:readonly MigrationLocation[];
    private useWork=0;
    constructor(private readonly graph:ReferenceGraph,
        private readonly sources:ReadonlyMap<string,MigrationSource>,
        private readonly generatedResource?:(format?:SourceDocument['format'])=>MigrationSource,reservedIdentities:Iterable<string>=[],
        private readonly contexts:readonly ReferenceGraph[]=[graph],
        private readonly connectionNames:ReadonlySet<string>=new Set()){
        this.contexts=[...contexts].sort((a,b)=>a.root.localeCompare(b.root));
        this.externalIdentities=new Set([...reservedIdentities].map(uri=>new URL(uri).href));
    }

    private inspectUse():void {
        if(++this.useWork>2000000)throw new SourceError('limit.migration.owners','Semantic owner lookup exceeds 2000000 captured use states');
    }
    private useKey(namespace:string,origin:MigrationLocation,kind:string):string {
        return JSON.stringify([namespace,origin.resource,origin.pointer,kind]);
    }
    private remember(index:Map<string,SemanticOwner[]>,id:string,origin:GraphScope,destination:MigrationLocation,owner:GraphScope):void {
        this.inspectUse();const uses=index.get(id)??[];
        if(!uses.some(use=>{
            this.inspectUse();return use.location.resource===destination.resource&&use.location.pointer===destination.pointer&&
                use.owner.resource===owner.resource&&use.owner.pointer===owner.pointer&&use.owner.kind===owner.kind&&
                schemaResourceContextIdentity(use.owner)===schemaResourceContextIdentity(owner);
        }))uses.push({source:origin,owner,location:destination});
        index.set(id,uses);
    }
    rememberEntry(namespace:string,origin:GraphScope,destination:MigrationLocation,owner:GraphScope=origin,mode:'refine'|'capture'='refine'):void {
        const id=this.useKey(namespace,origin,origin.kind);
        const previousUses=(this.entryUses.get(id)??[]).filter(previous=>{
            this.inspectUse();return schemaResourceContextIdentity(previous.source)===schemaResourceContextIdentity(origin)&&
                previous.source.schemaParent===origin.schemaParent;
        });
        // Re-admitting a previously captured role must not undo an entry's
        // later refinement or introduce an edge back to an older material copy.
        if(mode==='capture'&&previousUses.length)return;
        // Preparing a role and then its entry use refines the same captured
        // occurrence. Compose those material transitions in this namespace;
        // another entry can keep the earlier owner. Distinct source resource
        // contexts remain separate and retain the ordinary ambiguity guard.
        for(const previous of previousUses){
            this.inspectUse();
            if(previous.location.resource===destination.resource&&previous.location.pointer===destination.pointer)continue;
            this.remember(this.entryUses,this.useKey(namespace,previous.location,origin.kind),
                {...origin,...previous.location},destination,owner);
        }
        this.remember(this.entryUses,id,origin,destination,owner);
        if(origin.kind==='operation'&&(origin.resource!==destination.resource||origin.pointer!==destination.pointer)){
            const name=this.sources.get(origin.resource)?.doc.dataNode(origin.pointer)?.value?.operationId;
            if(typeof name==='string')this.copiedOperationIds.add(name);
        }
    }
    operationNameHasVariants(name:string):boolean{return this.copiedOperationIds.has(name);}
    rememberResourceHolder(location:MigrationLocation):void {
        this.copiedOwners.set(JSON.stringify([location.resource,location.pointer]),{location,retirement:location,schemaIdentity:true});
    }
    entryOwner(namespace:string,origin:MigrationLocation,kind:string):MigrationLocation {
        const pending=[{location:origin,leave:false}],seen=new Set<string>(),active=new Set<string>(),terminal=new Map<string,MigrationLocation>();
        while(pending.length){
            this.inspectUse();const {location,leave}=pending.pop()!,id=this.useKey(namespace,location,kind);
            if(leave){active.delete(id);seen.add(id);continue;}
            if(active.has(id))throw new SourceError('migration.owners.cycle','The material ownership relation is cyclic');
            if(seen.has(id))continue;
            active.add(id);pending.push({location,leave:true});
            const next=this.entryUses.get(id);
            if(!next?.length)terminal.set(id,location);
            else pending.push(...next.map(use=>({location:use.location,leave:false})));
        }
        if(terminal.size===1)return terminal.values().next().value!;
        const range:Range=this.sources.get(origin.resource)?.doc.dataNode(origin.pointer)?.range??[0,0];
        throw new SourceError(terminal.size?'migration.owners.ambiguous-use':'migration.owners.cycle',
            terminal.size?'This connection needs a specific material occurrence among independent typed owners':'The material ownership relation has no terminal owner',range,'unsupported',{...origin,range});
    }
    /** Project a typed occurrence or one of its fields, then apply the same
     * CST provenance used by conversion. Payload copies from another entry
     * cannot become this occurrence's connection fields or dynamic candidates. */
    entryLocations(namespace:string,location:MigrationLocation,scope:GraphScope|undefined,
        current:ReadonlyMap<string,readonly MigrationLocation[]>):readonly MigrationLocation[] {
        this.inspectUse();
        const uses:MigrationLocation[]=[];
        if(scope){
            if(location.resource!==scope.resource||location.pointer!==scope.pointer&&!location.pointer.startsWith(scope.pointer+'/'))
                throw new SourceError('migration.owners.field-context','A connection field is outside its captured semantic owner');
            const suffix=location.pointer.slice(scope.pointer.length),pending:MigrationLocation[]=[scope],seen=new Set<string>();
            // Multiple independently named consumers can need the same native
            // definition. They are additional material occurrences, rather
            // than competing refinements of its canonical owner. Fields keep
            // their captured suffix and ordinary CST conversion coordinates.
            for(let index=0;index<pending.length;index++){
                this.inspectUse();const owner=this.entryOwner(namespace,pending[index],scope.kind),id=this.useKey(namespace,owner,scope.kind);
                if(seen.has(id))continue;seen.add(id);
                uses.push({resource:owner.resource,pointer:owner.pointer+suffix});
                for(const copy of this.additionalUses.get(id)??[]){
                    this.inspectUse();
                    if(suffix&&copy.excludedFields.has(segments(suffix)[0]))continue;
                    pending.push(copy.location);
                }
            }
        }else uses.push(location);
        return uses.flatMap(at=>current.get(JSON.stringify([at.resource,at.pointer]))??[]);
    }
    rememberAdditionalUse(namespace:string,origin:GraphScope,destination:MigrationLocation,excludedFields:ReadonlySet<string>=new Set()):void {
        this.inspectUse();const owner=this.entryOwner(namespace,origin,origin.kind),id=this.useKey(namespace,owner,origin.kind);
        const uses=this.additionalUses.get(id)??[];
        if(!uses.some(use=>use.location.resource===destination.resource&&use.location.pointer===destination.pointer&&
            JSON.stringify([...use.excludedFields].sort())===JSON.stringify([...excludedFields].sort())))uses.push({location:destination,excludedFields});
        this.additionalUses.set(id,uses);
    }
    private roleKey(scope:GraphScope):string {
        return JSON.stringify([scope.resource,scope.pointer,scope.kind,schemaResourceContextIdentity(scope),scope.schemaParent]);
    }
    rememberRole(scope:GraphScope,destination:MigrationLocation,owner:GraphScope):void {
        this.remember(this.roleUses,this.roleKey(scope),scope,destination,owner);
    }
    roleOwners(scope:GraphScope):readonly SemanticOwner[] {
        this.inspectUse();return this.roleUses.get(this.roleKey(scope))??[];
    }

    /** A generated Swagger parameter can retain an otherwise unplaceable
     * foreign native owner in a new schema annotation. That annotation has no
     * authored literal consumer. Only its captured typed containment is exempt
     * from another role copy; original payloads and independent schema roles
     * still require the ordinary separation proofs. */
    isPrivateNativeAnnotation(scope:GraphScope):boolean {
        for(const owner of this.copiedOwners.values()){
            this.inspectUse();if(!owner.nativeAnnotation||owner.location.resource!==scope.resource||
                scope.pointer!==owner.location.pointer&&!scope.pointer.startsWith(owner.location.pointer+'/'))continue;
            let pointer=owner.location.pointer,kind=owner.nativeAnnotation;
            const doc=this.sources.get(scope.resource)!.doc;
            for(const name of segments(scope.pointer.slice(pointer.length))){
                this.inspectUse();const child=children(doc.dataNode(pointer)?.value,kind,scope.family).find(([field])=>field===name);
                if(!child){kind='';break;}kind=child[2];pointer+='/'+escape(name);
            }
            if(kind===scope.kind)return true;
        }
        return false;
    }

    contextOf(scope:GraphScope):ReferenceGraph|undefined {
        return this.contexts.find(context=>{
            this.inspectUse();const captured=context.scopeAs(scope.resource,scope.pointer,scope.kind);
            return captured!==undefined&&context.isEntryUse(captured)&&captured.schemaParent===scope.schemaParent&&
                captured.sourceKind===scope.sourceKind&&schemaResourceContextIdentity(captured)===schemaResourceContextIdentity(scope);
        });
    }

    /** A reference to the exact root can enter it without its lexical parent,
     * including recursive entries from child instances. Descendant consumers
     * do not, by themselves, invalidate a parent's same-instance assumptions. */
    hasRootConsumer(origin:MigrationLocation,references:readonly GraphReference[]):boolean {
        const value=this.graph.docs.get(origin.resource)?.dataNode(origin.pointer)?.value;
        if(['$id','$anchor','$dynamicAnchor'].some(name=>typeof value?.[name]==='string'))return true;
        const matches=(at:MigrationLocation)=>at.resource===origin.resource&&at.pointer===origin.pointer;
        return references.some(reference=>{
            this.inspectUse();if(reference.kind!=='schema')return false;
            return reference.resolution==='resolved'&&matches({resource:reference.targetResource!,pointer:reference.targetPointer!})||
                reference.dynamic?.candidates.some(matches)===true||reference.candidateTargets?.some(matches)===true;
        });
    }

    /** Inactive assertions can retire only when no other captured use needs
     * their material schemas or connection proofs. Callers supply all entry
     * captures; the first graph's namespace cannot choose their targets. */
    hasConsumers(at:MigrationLocation,references:readonly GraphReference[]):boolean {
        const within=(target:MigrationLocation)=>target.resource===at.resource&&
            (target.pointer===at.pointer||target.pointer.startsWith(at.pointer+'/'));
        // A declared resource/anchor remains an independent address even when
        // the captured project contains no incoming reference to it. Inactive
        // assertion pruning must not erase that published schema identity.
        if(this.identityConsumers===undefined){
            const identities=new Map<string,MigrationLocation>();
            for(const context of this.contexts)for(const scope of context.entryScopes()){
                this.inspectUse();if(scope.kind!=='schema')continue;
                const value=context.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
                if(['$id','$anchor','$dynamicAnchor'].some(name=>typeof value?.[name]==='string'))
                    identities.set(JSON.stringify([scope.resource,scope.pointer]),scope);
            }
            this.identityConsumers=[...identities.values()];
        }
        if(this.identityConsumers.some(identity=>{this.inspectUse();return within(identity);}))return true;
        return references.some(reference=>{
            this.inspectUse();
            if(within(reference))return reference.connection!==undefined||reference.keyword==='$dynamicRef';
            if(reference.kind!=='schema')return false;
            return reference.resolution==='resolved'&&within({resource:reference.targetResource!,pointer:reference.targetPointer!})||
                reference.dynamic?.candidates.some(target=>{this.inspectUse();return within(target);})===true||
                reference.candidateTargets?.some(target=>{this.inspectUse();return within(target);})===true;
        });
    }

    /** Retire private preparation copies after every entry has refined
     * them. An internal cycle is not an external consumer. Keep every terminal
     * typed owner, actual entering connection and authored schema identity.
     * Only this allocator can establish a private generated identity. */
    retireSuperseded(graphs:readonly ReferenceGraph[]):void {
        const terminals:MigrationLocation[]=[],admitted=new Set<string>(),states=new Set<string>();
        for(const [id,uses]of this.entryUses){
            const [namespace,,,kind]=JSON.parse(id) as [string,string,string,string];
            for(const use of uses){
                this.inspectUse();const state=this.useKey(namespace,use.location,kind);
                admitted.add(JSON.stringify([use.location.resource,use.location.pointer]));
                if(states.has(state))continue;states.add(state);
                terminals.push(this.entryOwner(namespace,use.location,kind));
            }
        }
        for(const [id,uses]of this.additionalUses){
            const [namespace,,,kind]=JSON.parse(id) as [string,string,string,string];
            for(const use of uses){
                this.inspectUse();admitted.add(JSON.stringify([use.location.resource,use.location.pointer]));
                terminals.push(this.entryOwner(namespace,use.location,kind));
            }
        }
        const within=(at:MigrationLocation,parent:MigrationLocation)=>at.resource===parent.resource&&
            (at.pointer===parent.pointer||at.pointer.startsWith(parent.pointer+'/'));
        const admittedLocations=[...admitted].map(id=>{const [resource,pointer]=JSON.parse(id) as [string,string];return {resource,pointer};});
        const schemas=graphs.flatMap(graph=>graph.scopesFor('schema'));
        const candidates:{retirement:MigrationLocation;privateIdentity:boolean}[]=[];
        for(const [id,{location:copy,retirement,schemaIdentity}]of this.copiedOwners){
            this.inspectUse();if(!this.sources.get(copy.resource)!.doc.dataNode(copy.pointer)||
                !admitted.has(id)&&!admittedLocations.some(at=>{this.inspectUse();return within(at,retirement);})||
                terminals.some(at=>{this.inspectUse();return within(at,retirement);}))continue;
            let declared=false,authored=false;
            for(const schema of schemas){
                this.inspectUse();if(!within(schema,retirement))continue;
                const value=this.sources.get(schema.resource)!.doc.dataNode(schema.pointer)?.value;
                if(!['$id','$anchor','$dynamicAnchor'].some(name=>typeof value?.[name]==='string'))continue;
                declared=true;if(!this.resourceIdentities.has(schema.base)){authored=true;break;}
            }
            // Authored identities stay published, even without captured incoming
            // edges. Only IDs reserved by this allocator are private preparation
            // identities; absent context cannot prove an identified copy dead.
            if(authored||schemaIdentity&&!declared||graphs.some(graph=>graph.literalContainer(retirement.resource,retirement.pointer)!==undefined))continue;
            candidates.push({retirement,privateIdentity:declared});
        }
        // Retain the closure reachable from non-retiring consumers. References
        // between obsolete copies (including cycles) do not keep one another
        // alive. A private dynamic candidate with no entering edge cannot occur
        // on an evaluation path; a static dynamic starting point still can.
        const retained=new Set<number>(),references=graphs.flatMap(graph=>graph.entryReferences());
        let changed=true;
        while(changed){
            changed=false;
            for(const reference of references){
                this.inspectUse();const consumers:number[]=[];
                for(const [index,candidate]of candidates.entries()){
                    this.inspectUse();if(within(reference,candidate.retirement))consumers.push(index);
                }
                if(consumers.length&&!consumers.some(index=>retained.has(index)))continue;
                for(const [index,candidate]of candidates.entries()){
                    this.inspectUse();if(retained.has(index))continue;
                    const needed=reference.resolution==='resolved'&&within({resource:reference.targetResource!,pointer:reference.targetPointer!},candidate.retirement)||
                        reference.candidateTargets?.some(target=>{this.inspectUse();return within(target,candidate.retirement);})||
                        !candidate.privateIdentity&&reference.dynamic?.candidates.some(target=>{this.inspectUse();return within(target,candidate.retirement);});
                    if(needed){retained.add(index);changed=true;}
                }
            }
        }
        for(const [index,{retirement}]of candidates.entries()){
            if(retained.has(index))continue;
            const source=this.sources.get(retirement.resource)!;
            if(source.doc.dataNode(retirement.pointer)){this.admit(source,8);source.remove(retirement.pointer);}
        }
    }

    /** A specialized resource has its own identity; copying the old $id would
     * make independent target owners ambiguous. This identity is embedded in
     * its owning document and never grants permission to acquire another file. */
    resourceIdentity(entry:string,identity:string):string {
        if(this.resourceIdentities.size>=2048)throw new SourceError('limit.migration.owners','Resource specialization exceeds 2048 identities');
        const stem=createHash('sha256').update(JSON.stringify([entry,identity])).digest('hex');
        let index=0;
        for(;;){
            const uri=new URL(entry);uri.hash='';uri.searchParams.append('busyapi-schema-owner',stem+(index?'_'+index:''));
            const value=uri.href;
            if(!this.contexts.some(context=>context.identities.has(value))&&!this.externalIdentities.has(value)&&!this.resourceIdentities.has(value)){
                this.resourceIdentities.add(value);return value;
            }
            if(++index>2048)throw new SourceError('limit.migration.owners','No bounded collision-free resource identity is available');
        }
    }

    admit(source:MigrationSource,edits=1):void {
        this.edits+=edits;this.work+=source.doc.text.length*edits*2;
        if(this.edits>4096||this.work>128*1024*1024)
            throw new SourceError('limit.migration.owners','Schema specialization exceeds its bounded CST edit work');
    }

    /** Retired native fields are exact literal values under an allocator-owned
     * Schema annotation. Later converters must not reinterpret their old CST
     * provenance as a surviving native role. Reuse the common reservations. */
    retainedValue(location:MigrationLocation):boolean {
        const parts=segments(location.pointer);
        for(let index=0;index<parts.length;index++)if(parts[index]==='x-busyapi-retained-value'){
            const owner='/'+parts.slice(0,index).map(escape).join('/');
            if(this.reserved.has(JSON.stringify([location.resource,owner]))||owner.endsWith('/items')&&
                this.reserved.has(JSON.stringify([location.resource,owner.slice(0,-6)])))return true;
        }
        return false;
    }

    reserve(origin:MigrationLocation,label:string,identity=JSON.stringify([origin.resource,origin.pointer]),destination?:MigrationLocation):{source:MigrationSource;location:MigrationLocation} {
        if(destination){
            const source=this.sources.get(destination.resource)!;
            return {source,location:this.allocate(source,destination.pointer,label,identity)};
        }
        const entry=this.generatedResource?.(this.sources.get(origin.resource)?.doc.format)??this.sources.get(this.graph.root)!;
        const container=this.generatedResource?'':componentLocation('schemas',this.graph.specifications.has(entry.doc.id)&&entry.doc.dataNode('/swagger')?.value==='2.0'?'2.0':this.graph.family)!;
        return {source:entry,location:this.allocate(entry,container,label,identity)};
    }
    reserveSchema(origin:MigrationLocation,label:string):{source:MigrationSource;location:MigrationLocation}{
        return this.materialOwner(this.reserve(origin,label),'array-item');
    }
    reserveDocumentation(origin:MigrationLocation,context:ReferenceGraph,label:string):{source:MigrationSource;location:MigrationLocation}{
        const entry=this.sources.get(context.root)!,family=entry.doc.dataNode('/swagger')?.value==='2.0'?'2.0':context.family;
        return this.materialOwner(this.reserve(origin,label,JSON.stringify([context.root,origin.resource,origin.pointer]),
            {resource:context.root,pointer:componentLocation('schemas',family)!}),'array-item');
    }
    markProjectionSource(scope:GraphScope):void {
        this.rememberEntry('guard-source',scope,{resource:scope.resource,pointer:scope.pointer},scope,'capture');
    }
    isProjectionSource(scope:GraphScope):boolean{return this.entryUses.has(this.useKey('guard-source',scope,scope.kind));}
    retireApplication(scope:GraphScope,kind:MigrationApplicationKind):void {
        this.rememberEntry('schema-application-retired:'+kind,scope,{resource:scope.resource,pointer:scope.pointer});
    }
    applicationRetired(scope:GraphScope,kind:MigrationApplicationKind):boolean {
        return this.entryUses.has(this.useKey('schema-application-retired:'+kind,scope,scope.kind));
    }

    materialLocations(origin:MigrationLocation):readonly {source:MigrationSource;location:MigrationLocation}[] {
        const found:{source:MigrationSource;location:MigrationLocation}[]=[];
        for(const [resource,source]of this.sources){
            const pointers=resource===origin.resource?source.origins.get(origin.pointer):source.foreignOrigins.get(origin.resource+'#'+origin.pointer);
            for(const pointer of pointers??[]){this.inspectUse();found.push({source,location:{resource,pointer}});}
        }
        return found;
    }
    uniqueLocation(origin:MigrationLocation):{source:MigrationSource;location:MigrationLocation} {
        const found=this.materialLocations(origin);
        // A prepared canonical scope can retain an explicit forwarding use
        // alongside historical copy provenance. Its exact captured coordinate
        // selects that interpretation; relocated scopes need a unique survivor.
        const captured=found.filter(value=>value.location.resource===origin.resource&&value.location.pointer===origin.pointer);
        if(captured.length===1)return captured[0];
        if(found.length!==1)throw new SourceError('migration.owners.source-coordinate','A projected schema or field requires one surviving captured material coordinate');
        return found[0];
    }
    capturedSchema(location:MigrationLocation):GraphScope|undefined {
        let selected:GraphScope|undefined;
        const source=this.sources.get(location.resource);if(!source)return;
        for(const context of this.contexts)for(const scope of context.entryScopes())if(scope.kind==='schema'){
            this.inspectUse();const pointers=scope.resource===source.original.id?source.origins.get(scope.pointer):source.foreignOrigins.get(scope.resource+'#'+scope.pointer);
            if(!pointers?.has(location.pointer))continue;
            if(selected&&(selected.family!==scope.family||schemaResourceContextIdentity(selected)!==schemaResourceContextIdentity(scope)))return;
            selected=scope;
        }
        return selected;
    }

    /** All schema and object variants use this reservation boundary, including
     * finite request/response and discriminator states. The caller supplies
     * the captured semantic state; payload member names never choose identity. */
    allocate(source:MigrationSource,container:string,label:string,identity:string,excludedNames:ReadonlySet<string>=new Set()):MigrationLocation {
        const stem='_migrated_'+label+'_'+createHash('sha256')
            .update(identity).digest('hex').slice(0,24);
        let pointer=container+'/'+stem,index=0;
        const key=(pointer:string)=>JSON.stringify([source.doc.id,pointer]);
        while(source.doc.dataNode(pointer)||this.reserved.has(key(pointer))||excludedNames.has(segments(pointer).at(-1)!)){
            if(++index>65536)throw new SourceError('limit.migration.owners','No bounded collision-free material owner name is available');
            pointer=container+'/'+stem+'_'+index;
        }
        if(this.reserved.size>=2048)throw new SourceError('limit.migration.owners','Schema specialization exceeds 2048 generated owners');
        this.reserved.add(key(pointer));
        return {resource:source.doc.id,pointer};
    }
    /** Newly generated references use the coordinated target component name.
     * Captured references retain the existing provenance-based repair path. */
    reference(location:MigrationLocation,targetFamily:string):string {
        const prefix='/components/schemas/';
        const native=this.graph.specifications.get(location.resource);
        const pointer=targetFamily==='2.0'&&native&&location.pointer.startsWith(prefix)?
            '/definitions/'+location.pointer.slice(prefix.length):targetFamily!=='2.0'&&native?.family==='2.0'&&location.pointer.startsWith('/definitions/')?
                prefix+location.pointer.slice('/definitions/'.length):location.pointer;
        return location.resource+pointerFragment(pointer);
    }

    /** Own an in-place applicator separately from its containing assertions.
     * Guard composition replaces this use, while ordinary/independent entries
     * keep the original effect. Both the holder and use live in the existing
     * semantic-owner index; field provenance follows subsequent CST moves. */
    isolateApplication(scope:GraphScope,source:MigrationSource,pointer:string,kind:MigrationApplicationKind,
        fields:readonly string[],target:string):{source:MigrationSource;location:MigrationLocation} {
        const namespace='schema-application:'+kind;
        if(this.entryUses.has(this.useKey(namespace,scope,scope.kind))){
            const location=this.entryOwner(namespace,scope,scope.kind);
            return {source:this.sources.get(location.resource)!,location};
        }
        const effect=this.reserveSchema(scope,kind+'_application');this.admit(effect.source);effect.source.set(effect.location.pointer,{});
        for(const field of fields){
            const at=pointer+'/'+escape(field);if(!source.doc.dataNode(at))continue;
            this.admit(source,4);this.admit(effect.source,4);
            const destination=effect.location.pointer+'/'+escape(field);
            if(source===effect.source)source.move(at,destination,true);
            else {effect.source.copy(source,at,destination,true);source.remove(at);}
        }
        this.admit(source,2);const collection=pointer+'/allOf';
        if(!source.doc.dataNode(collection))source.set(collection,[]);
        const use=collection+'/'+source.doc.dataNode(collection).children.size+'/$ref';
        source.set(use.slice(0,-5),{$ref:this.reference(effect.location,target)});
        // The origin is inside a newly reserved holder, so it cannot shadow
        // an authored field whose former array index was reused by this use.
        const origin={...effect.location,pointer:effect.location.pointer+'/use/$ref'};
        if(origin.resource===source.original.id)source.origins.set(origin.pointer,new Set([use]));
        else source.foreignOrigins.set(origin.resource+'#'+origin.pointer,new Set([use]));
        this.rememberEntry(namespace,scope,effect.location);
        this.rememberEntry(namespace+':use',scope,origin);
        return effect;
    }
    applicationUse(scope:GraphScope,kind:MigrationApplicationKind):MigrationLocation|undefined {
        const namespace='schema-application:'+kind+':use';
        if(!this.entryUses.has(this.useKey(namespace,scope,scope.kind)))return;
        return this.entryOwner(namespace,scope,scope.kind);
    }

    /** Resolve a converted schema use against captured fixed bindings first.
     * Generated references have no authored locator; their absolute physical
     * addresses use the allocator's target component spelling. No URI search
     * through literal values or new dynamic-binding assumption is involved. */
    materialReference(source:MigrationSource,pointer:string,targetFamily:string):MigrationLocation|undefined {
        const destinations=new Map<string,MigrationLocation>();
        for(const context of this.contexts)for(const reference of context.entryReferences()){
            this.inspectUse();if(reference.kind!=='schema'||reference.connection||!['$ref','$dynamicRef'].includes(reference.keyword))continue;
            const field=reference.pointer+'/'+escape(reference.keyword);
            const locations=source.original.id===reference.resource?source.origins.get(field):source.foreignOrigins.get(reference.resource+'#'+field);
            if(!locations?.has(pointer+'/$ref')&&!locations?.has(pointer+'/$dynamicRef'))continue;
            const projected=projectSchemaReference(reference);if(projected.state!=='fixed')return;
            const material=this.uniqueLocation(projected.target).location;
            destinations.set(JSON.stringify([material.resource,material.pointer]),material);
        }
        if(destinations.size)return destinations.size===1?[...destinations.values()][0]:undefined;
        const value=source.doc.dataNode(pointer)?.value,ref=value?.$ref;
        if(typeof ref!=='string')return;
        const url=new URL(ref,source.doc.id),fragment=decodeURIComponent(url.hash.slice(1));url.hash='';
        if(fragment&&!fragment.startsWith('/'))return;
        const material=this.sources.get(url.href);if(!material)return;
        if(material.doc.dataNode(fragment))return {resource:url.href,pointer:fragment};
        const prefix=targetFamily==='2.0'?'/definitions/':'/components/schemas/';
        if(!fragment.startsWith(prefix))return;
        const pointerAt=(targetFamily==='2.0'?'/components/schemas/':'/definitions/')+fragment.slice(prefix.length);
        return material.doc.dataNode(pointerAt)?{resource:url.href,pointer:pointerAt}:undefined;
    }

    /** A flat declaration copies value fields, not the independent Schema
     * Object's target identity. Preserve exact CST data/comments and retire
     * schema-target provenance only in the new use. */
    copyAssertionField(source:MigrationSource,pointer:string,input:MigrationSource,from:string):void {
        const captured=input.fork();this.admit(source,4);
        if(source.doc.dataNode(pointer))source.remove(pointer,true,true,true);
        source.copy(captured,from,pointer,true);
        for(const context of this.contexts)for(const scope of context.entryScopes())if(scope.kind==='schema'){
            this.inspectUse();const locations=scope.resource===source.original.id?source.origins.get(scope.pointer):source.foreignOrigins.get(scope.resource+'#'+scope.pointer);
            for(const at of [...locations??[]])if(at===pointer||at.startsWith(pointer+'/'))locations!.delete(at);
        }
    }

    materializeHeaderUse(scope:GraphScope,source:MigrationSource,pointer:string,input:MigrationSource,from:string):void {
        const captured=input.fork();
        // Retain the authored reference object as literal history. Its ignored
        // siblings must never acquire Header constraints during inlining.
        this.retainLiteralValue(scope,source,pointer,'header_reference',true);
        for(const current of this.sources.values()){
            const roots=current.original.id===scope.resource?current.origins.get(scope.pointer):current.foreignOrigins.get(scope.resource+'#'+scope.pointer);
            roots?.clear();
            const locations=current.original.id===scope.resource?current.origins.get(scope.pointer+'/$ref'):
                current.foreignOrigins.get(scope.resource+'#'+scope.pointer+'/$ref');
            locations?.clear();
        }
        this.admit(source,4);source.copy(captured,from,pointer,true);
        for(const context of this.contexts)for(const original of context.entryScopes())if(['schema','header'].includes(original.kind)){
            this.inspectUse();const locations=original.resource===source.original.id?source.origins.get(original.pointer):source.foreignOrigins.get(original.resource+'#'+original.pointer);
            for(const at of [...locations??[]])if(at===pointer||at.startsWith(pointer+'/'))locations!.delete(at);
        }
        // The use retains its own native identity. The source target's schema
        // and Header identities stay with their independent neutral owners.
        const locations=source.original.id===scope.resource?source.origins:source.foreignOrigins;
        const id=source.original.id===scope.resource?scope.pointer:scope.resource+'#'+scope.pointer;
        locations.set(id,new Set([pointer]));
    }

    /** Retiring an unapplied assertion does not authorize deleting its exact
     * enum/default/extension data. Keep those values as literal annotations in
     * a neutral standard Schema Object, through the common reservation and CST
     * provenance path. Reference-looking members remain literal data. */
    retainLiteralValue(origin:MigrationLocation,source:MigrationSource,pointer:string,label='retired_value',anonymous=false):MigrationLocation {
        const owner=anonymous?this.reserveSchema(origin,label):this.reserve(origin,label,JSON.stringify([origin.resource,origin.pointer]));
        this.admit(source,4);this.admit(owner.source,4);
        owner.source.set(owner.location.pointer,{});
        const location={...owner.location,pointer:owner.location.pointer+'/x-busyapi-retained-value'};
        owner.source.copy(source,pointer,location.pointer,true);source.remove(pointer,true,false);
        owner.source.presentationChanges.push(owner.location.pointer);return location;
    }

    /** A retired native object is history, so its former typed locators must
     * not be repaired inside the literal copy. Independent live consumers
     * retain their own provenance and continue through ordinary edge repair. */
    retainNativeHistory(origin:MigrationLocation,source:MigrationSource,pointer:string,label:string,context?:ReferenceGraph):MigrationLocation {
        const captured=source.fork();
        const retained=this.retainLiteralValue(origin,source,pointer,label,true);
        const output=this.sources.get(retained.resource)!;
        const contexts=context?[...this.contexts,context]:this.contexts;
        for(const context of contexts)for(const edge of context.entryReferences()){
            this.inspectUse();
            if(edge.resource!==origin.resource||edge.pointer!==origin.pointer&&!edge.pointer.startsWith(origin.pointer+'/'))continue;
            const field=retained.pointer+edge.pointer.slice(origin.pointer.length)+'/'+escape(edge.keyword);
            for(const locations of output.originSets())locations.delete(field);
        }
        // Descriptions keep a rendered standard Schema Object owner as well
        // as their exact historical spelling. This preserves relative links
        // through the existing Markdown relocation/proof, without interpreting
        // reference-looking data in the historical object.
        const descriptions=new Set<string>();
        for(const context of contexts)for(const scope of context.entryScopes()){
            this.inspectUse();
            if(scope.resource!==origin.resource||scope.pointer!==origin.pointer&&!scope.pointer.startsWith(origin.pointer+'/'))continue;
            const value=context.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(typeof value?.description!=='string'||!richTextField(scope.kind,scope.family,value,'description',segments(scope.pointer).at(-1)??'',context.allowsReference(scope)))continue;
            const id=JSON.stringify([context.root,scope.resource,scope.pointer]);if(descriptions.has(id))continue;descriptions.add(id);
            const from=pointer+scope.pointer.slice(origin.pointer.length)+'/description';
            if(!captured.doc.dataNode(from))continue;
            const owner=this.reserveDocumentation(scope,context,label+'_documentation');
            this.admit(owner.source,4);
            owner.source.set(owner.location.pointer,{});
            owner.source.copy(captured,from,owner.location.pointer+'/description',true);
            const root=pointer+scope.pointer.slice(origin.pointer.length);
            captured.own(root,false);owner.source.associate(captured,root,owner.location.pointer);
        }
        return retained;
    }

    /** An assertion variant has new schema identities but retains the source
     * fields' exact data/rendering provenance. Existing references continue to
     * select the neutral schemas; the caller explicitly selects the variant.
     * All fixed references use captured targets and current CST coordinates. */
    assertionVariant(context:ReferenceGraph,scope:GraphScope,source:MigrationSource,pointer:string,label:string,targetFamily:string,
        removed:readonly string[]=[]):MigrationLocation {
        const captured=source.fork(),container=componentLocation('schemas',context.family);
        if(!container)throw new SourceError('migration.owners.variant-container','This assertion variant has no native Schema Object container');
        const variant=this.separate({...scope,pointer},label,{captured,layout:'array-item',
            container:{resource:context.root,pointer:container},identity:JSON.stringify([scope.resource,scope.pointer,label])}).location;
        const output=this.sources.get(variant.resource)!;
        for(const field of migrationLogicalPointers(captured.doc))if(field===pointer||field.startsWith(pointer+'/')){
            this.inspectUse();output.associate(captured,field,variant.pointer+field.slice(pointer.length));
        }
        const inside=(at:string)=>at===variant.pointer||at.startsWith(variant.pointer+'/');
        const capturedField=(origin:MigrationLocation)=>{
            const fields=origin.resource===captured.original.id?captured.origins.get(origin.pointer):captured.foreignOrigins.get(origin.resource+'#'+origin.pointer);
            return [...fields??[]].find(field=>field.startsWith(pointer+'/'));
        };
        // Schema-target provenance is intentionally neutral. Metadata fields
        // retain both copies for exact-data and Markdown/URI proofs.
        for(const schema of context.entryScopes())if(schema.kind==='schema'&&schema.resource===scope.resource&&
            (schema.pointer===scope.pointer||schema.pointer.startsWith(scope.pointer+'/'))){
            this.inspectUse();
            const locations=variant.resource===schema.resource?output.origins.get(schema.pointer):output.foreignOrigins.get(schema.resource+'#'+schema.pointer);
            for(const at of [...locations??[]])if(inside(at))locations!.delete(at);
        }
        // Value schemas have independent resource/discriminator identities.
        // Guard and conjunct projections change their containing assertions,
        // so retain these untouched bodies through their neutral targets.
        const valueSchemas:{scope:GraphScope;pointer:string}[]=[];
        for(const schema of context.entryScopes())if(schema.kind==='schema'&&schema.resource===scope.resource&&
            schema.pointer.startsWith(scope.pointer+'/')){
            this.inspectUse();
            const valueApplication=context.schemaParentsOf(schema).some(parent=>parent.resource===schema.resource&&
                /^\/(?:properties\/[^/]*|patternProperties\/[^/]*|(?:prefixItems|items)\/\d+|items|additionalProperties|contains|unevaluatedItems|unevaluatedProperties|propertyNames)$/.test(schema.pointer.slice(parent.pointer.length)));
            if(!valueApplication)continue;
            const material=this.uniqueLocation(schema);
            if(material.source===source&&material.location.pointer.startsWith(pointer+'/')&&
                captured.doc.dataNode(material.location.pointer)?.kind==='object')valueSchemas.push({scope:schema,pointer:material.location.pointer});
        }
        const retained:string[]=[];
        for(const child of valueSchemas.sort((a,b)=>a.pointer.length-b.pointer.length)){
            if(retained.some(parent=>child.pointer.startsWith(parent+'/')))continue;
            const destination=variant.pointer+child.pointer.slice(pointer.length);
            if(!output.doc.dataNode(destination))continue;
            this.referenceUse(output,destination,{resource:source.doc.id,pointer:child.pointer});
            output.set(destination+'/$ref',this.reference({resource:source.doc.id,pointer:child.pointer},targetFamily));
            retained.push(child.pointer);
        }
        for(const reference of context.entryReferences())if(reference.kind==='schema'&&!reference.connection&&
            reference.resource===scope.resource&&(reference.pointer===scope.pointer||reference.pointer.startsWith(scope.pointer+'/'))&&
            ['$ref','$dynamicRef'].includes(reference.keyword)){
            this.inspectUse();
            if(reference.resolution!=='resolved')throw new SourceError('migration.owners.variant-reference','An assertion variant needs a resolved captured schema reference');
            if(projectSchemaReference(reference).state!=='fixed')throw new SourceError('migration.owners.variant-dynamic','An assertion variant needs a proved fixed schema reference');
            const field=capturedField({resource:reference.resource,pointer:reference.pointer+'/'+escape(reference.keyword)});
            if(field===undefined||!field.startsWith(pointer+'/'))continue;
            if(retained.some(parent=>field.startsWith(parent+'/')))continue;
            const destinations:MigrationLocation[]=[];
            for(const [resource,current]of this.sources){
                const pointers=resource===reference.targetResource?current.origins.get(reference.targetPointer!):
                    current.foreignOrigins.get(reference.targetResource+'#'+reference.targetPointer!);
                for(const pointer of pointers??[])destinations.push({resource,pointer});
            }
            const unique=new Map(destinations.map(at=>[JSON.stringify([at.resource,at.pointer]),at]));
            if(unique.size!==1)throw new SourceError('migration.owners.variant-target','An assertion variant needs one neutral captured target');
            this.admit(output);output.set(variant.pointer+field.slice(pointer.length),this.reference([...unique.values()][0],targetFamily));
        }
        for(const occurrence of documentUriOccurrences(context))if(occurrence.scope.resource===scope.resource&&
            (occurrence.pointer===scope.pointer||occurrence.pointer.startsWith(scope.pointer+'/'))){
            const field=capturedField({resource:occurrence.scope.resource,pointer:occurrence.pointer});
            if(field!==undefined&&field.startsWith(pointer+'/')&&!retained.some(parent=>field.startsWith(parent+'/'))){
                this.admit(output);output.set(variant.pointer+field.slice(pointer.length),resolveUri(occurrence.value,documentUriBase(context,occurrence.scope)).href);
            }
        }
        for(const suffix of removed){
            const field=variant.pointer+suffix,parent=field.slice(0,field.lastIndexOf('/'));
            this.admit(output,2);output.remove(field,true,true,true);
            if(output.doc.dataNode(parent)?.kind==='array'&&!output.doc.dataNode(parent)!.children.size)output.remove(parent,true,true,true);
        }
        return variant;
    }

    /** A projected applicator deliberately selects a specialized target.
     * Its neutral original remains the captured reference consumer; keep the
     * replacement out of ordinary neutral-target reference repair. */
    replaceAssertionReference(variant:MigrationLocation,origin:MigrationLocation,target:MigrationLocation,family:string):void {
        const source=this.sources.get(variant.resource)!;
        const locations=origin.resource===variant.resource?source.origins.get(origin.pointer):
            source.foreignOrigins.get(origin.resource+'#'+origin.pointer);
        const fields=[...locations??[]].filter(field=>field.startsWith(variant.pointer+'/'));
        if(fields.length!==1)throw new SourceError('migration.owners.projection-reference','A projected reference requires one local captured applicator');
        this.admit(source);source.set(fields[0],this.reference(target,family));locations!.delete(fields[0]);
    }

    /** A named security connection in a foreign native owner must select the
     * same definition in every entry. Bare Reference Object aliases retain
     * native definitions; an explicitly proved common concrete representation
     * uses the same CST-copy/provenance owner when family substitution is barred.
     * Names and CST work still pass through the common reservation boundary. */
    securityAlias(containers:readonly MigrationLocation[],target:MigrationLocation,identity:string,
        excludedNames:ReadonlySet<string>,definition?:Readonly<{scope:GraphScope;origin:GraphScope;captured:MigrationSource}>):string {
        const previous=this.connectionAliases.get(identity);if(previous!==undefined)return previous;
        let name:string|undefined;
        for(const container of containers){
            this.inspectUse();const source=this.sources.get(container.resource)!;
            const excluded=new Set([...excludedNames,...this.connectionNames]);
            const at=definition?this.separate(definition.scope,'security_owner',{
                container,captured:definition.captured,identity,excludedNames:excluded}).location:
                this.allocate(source,container.pointer,'security_owner',identity,excluded);
            const selected=segments(at.pointer).at(-1)!;
            if(name!==undefined&&name!==selected)
                throw new SourceError('migration.owners.connection-name','No common collision-free security alias name is available');
            name=selected;
            if(definition){
                this.rememberAdditionalUse(container.resource,definition.scope,at);
                if(definition.origin.resource!==definition.scope.resource||definition.origin.pointer!==definition.scope.pointer)
                    this.rememberAdditionalUse(container.resource,definition.origin,at);
            }else{
                this.admit(source);source.set(at.pointer,{$ref:target.resource+pointerFragment(target.pointer)});
                for(const pointer of [at.pointer,at.pointer+'/$ref'])source.origins.set(pointer,new Set([pointer]));
            }
            source.presentationChanges.push(at.pointer);
        }
        if(name===undefined)throw new SourceError('migration.owners.connection-name','A security alias needs captured native entry containers');
        this.connectionAliases.set(identity,name);return name;
    }

    private materialOwner(reservation:{source:MigrationSource;location:MigrationLocation},layout:MigrationOwnerLayout|undefined,
        operation?:MigrationOperationSlot):{
        source:MigrationSource;location:MigrationLocation;retirement:MigrationLocation;
    } {
        const method=operation?.method??'get',slot=(operation?.additional?'/additionalOperations':'')+'/'+escape(method);
        const pathItem=operation?.additional?{additionalOperations:{[method]:{}}}:{[method]:{}};
        const suffix=layout==='array-item'?'/items':layout==='response-header'?'/headers/Header':layout==='callback-path-item'?'/{$url}':
            layout==='callback-operation'?'/{$url}'+slot:layout==='path-item-operation'?slot:
                layout==='parameter-path-item'?'/schema/items/x-migrated-native':layout==='parameter-operation'?'/schema/items/x-migrated-native'+slot:
                layout==='response-media'?'/content/application~1octet-stream':'';
        if(layout){
            this.admit(reservation.source,8);reservation.source.set(reservation.location.pointer,
                layout==='parameter-path-item'||layout==='parameter-operation'?{in:'body',name:'_migrated_native',schema:{type:'array',items:{'x-migrated-native':layout==='parameter-operation'?pathItem:{}}}}:
                layout==='array-item'?{type:'array',items:{}}:layout==='response-header'?{description:'',headers:{Header:{}}}:layout==='response-media'?{description:'',content:{'application/octet-stream':{}}}:
                    layout==='path-item-operation'?pathItem:
                    {'{$url}':layout==='callback-operation'?pathItem:{}});
        }
        if(operation){
            const path=reservation.location.pointer+(layout==='callback-operation'?'/{$url}':layout==='parameter-operation'?'/schema/items/x-migrated-native':'');
            if(operation.servers){
                this.admit(reservation.source,4);
                if(operation.servers.source&&operation.servers.pointer!==undefined)
                    reservation.source.copy(operation.servers.source,operation.servers.pointer,path+'/servers');
                else reservation.source.set(path+'/servers',operation.servers.urls.map(url=>({url})));
                for(const [index,url]of operation.servers.urls.entries())reservation.source.set(path+'/servers/'+index+'/url',url);
            }
        }
        return {...reservation,retirement:reservation.location,
            location:{...reservation.location,pointer:reservation.location.pointer+suffix}};
    }

    /** Mixed modern entries reach Swagger in one coordinated stage. Keep the
     * native family holder until its fields have been converted, then move the
     * converted material into the same anonymous registry used by ordinary
     * Swagger fragments. Only generated wrappers/containers may retire here;
     * authored callbacks, Path Items and their target checks remain intact. */
    releaseNativeHolders(family:string):void {
        for(const holder of this.nativeReleases){
            this.inspectUse();if(holder.family!==family)continue;
            if(holder.source.doc.dataNode(holder.material.pointer)){
                const {source,location}=holder.destination;
                this.admit(source,8);this.admit(holder.source,8);
                source.copy(holder.source,holder.material.pointer,location.pointer,true);
                holder.source.remove(holder.retirement.pointer);source.presentationChanges.push(location.pointer);
            }
            if(!holder.source.original.dataNode(holder.container)&&holder.source.doc.dataNode(holder.container)?.children.size===0){
                this.admit(holder.source);holder.source.remove(holder.container);
            }
        }
    }

    move(origin:MigrationLocation,source:MigrationSource,pointer:string,label:string,
        options:Readonly<{layout?:'array-item'|'response-header';context?:ReferenceGraph}>={}):MigrationLocation {
        const context=options.context??this.graph;
        let uris=this.documentUris.get(context);
        if(!uris){uris=[...documentUriOccurrences(context)];this.documentUris.set(context,uris);}
        for(const occurrence of uris){
            this.inspectUse();
            if(occurrence.scope.resource!==origin.resource||occurrence.scope.kind==='server'||
                occurrence.scope.pointer!==origin.pointer&&!occurrence.scope.pointer.startsWith(origin.pointer+'/'))continue;
            const at=source.current(occurrence.pointer,origin.resource);
            if(at===undefined||at!==pointer&&!at.startsWith(pointer+'/')||source.doc.dataNode(at)?.value!==occurrence.value)continue;
            const absolute=resolveUri(occurrence.value,documentUriBase(context,occurrence.scope)).href;
            if(absolute!==occurrence.value){this.admit(source);source.set(at,absolute);}
        }
        // A converter can retain the actual entry namespace when hoisting an
        // independently consumed fragment. The existing allocator and storage
        // layout still own its reservation and exact CST provenance.
        const destination=options.context?{resource:context.root,pointer:componentLocation(options.layout==='response-header'?'responses':'schemas',
            this.graph.specifications.has(context.root)&&this.sources.get(context.root)!.doc.dataNode('/swagger')?.value==='2.0'?'2.0':context.family)!}:undefined;
        const owner=this.materialOwner(this.reserve(origin,label,JSON.stringify([origin.resource,origin.pointer]),destination),options.layout);
        this.admit(source,8);
        if(owner.source!==source)this.admit(owner.source,8);
        // Layouts reserve a generated empty material slot. CST copy/move
        // requires an absent destination; release only that fresh placeholder.
        if(options.layout&&owner.source.doc.dataNode(owner.location.pointer)){
            this.admit(owner.source);owner.source.remove(owner.location.pointer);
        }
        if(owner.source===source)source.move(pointer,owner.location.pointer,true);
        else {owner.source.copy(source,pointer,owner.location.pointer,true);source.remove(pointer);}
        owner.source.presentationChanges.push(owner.retirement.pointer);
        return owner.location;
    }

    /** A typed use can refer to its retained material owner. Retire the old
     * child fields before installing the locator: their provenance belongs to
     * the material schema, never to this newly generated reference. */
    referenceUse(source:MigrationSource,pointer:string,target:MigrationLocation):void {
        for(const locations of source.originSets())for(const at of [...locations]){
            this.inspectUse();if(at!==pointer&&(at.startsWith(pointer+'/')))locations.delete(at);
        }
        this.admit(source);source.set(pointer,{$ref:target.resource+pointerFragment(target.pointer)});
        source.origins.set(pointer+'/$ref',new Set([pointer+'/$ref']));
    }

    /** A native Schema slot moved into another document must not contribute
     * that document's unrelated dynamic anchors before entering its material
     * owner. An anchorless, explicitly dialected resource is a neutral frame
     * on every dynamic path. Its identity uses the common reservation set. */
    resourceReferenceUse(source:MigrationSource,pointer:string,target:MigrationLocation,scope:GraphScope,
        parent:{scope:GraphScope;location:MigrationLocation}):void {
        this.referenceUse(source,pointer,target);
        this.inspectUse();this.resourceReferences.push({slot:{resource:source.doc.id,pointer},scope,parent});
        if(!modernFamily(scope.family)||!scope.dialect)return;
        const base=this.resourceIdentity(source.doc.id,JSON.stringify(['schema-slot',source.doc.id,pointer,schemaResourceContextIdentity(scope)]));
        this.admit(source,2);source.set(pointer+'/$id',base);source.set(pointer+'/$schema',scope.dialect);
        for(const name of ['$id','$schema'])source.origins.set(pointer+'/'+name,new Set([pointer+'/'+name]));
    }

    /** Generated slots have no authored $ref provenance. Keep their edges in
     * this same owner boundary and compose refinements before any retirement. */
    repairResourceReferences():void {
        const edits=new Map<string,{source:MigrationSource;field:string;value:string}>();
        const same=(a:MigrationLocation,b:MigrationLocation)=>a.resource===b.resource&&a.pointer===b.pointer;
        for(const reference of this.resourceReferences){
            for(const graph of this.contexts){
                this.inspectUse();const namespace=graph.root;
                if(!this.entryUses.has(this.useKey(namespace,reference.parent.scope,reference.parent.scope.kind)))continue;
                const slot=this.entryOwner(namespace,reference.slot,'schema');
                const parent=this.entryOwner(namespace,reference.parent.scope,reference.parent.scope.kind);
                // A fresh native copy may come directly from immutable source,
                // without this generated shell. Only its exact schema-owner
                // transition can project the shell into a later occurrence.
                if(same(slot,reference.slot)&&!same(parent,reference.parent.location))continue;
                const target=this.entryOwner(namespace,reference.scope,'schema');
                const source=this.sources.get(slot.resource)!,field=source.current(slot.pointer+'/$ref');
                const failure=(code:string,message:string)=>{
                    const range:Range=source.doc.dataNode(slot.pointer)?.range??[0,0];
                    return new SourceError(code,message,range,'unsupported',{...slot,range});
                };
                if(field===undefined||typeof source.doc.dataNode(field)?.value!=='string')
                    throw failure('migration.owners.resource-reference','A generated schema slot has no retained reference field');
                const value=target.resource+pointerFragment(target.pointer),id=JSON.stringify([source.doc.id,field]),previous=edits.get(id);
                if(previous&&previous.value!==value)
                    throw failure('migration.owners.resource-reference-context','This shared generated slot still needs independent entry ownership for its resource targets');
                edits.set(id,{source,field,value});
            }
        }
        for(const {source,field,value}of edits.values()){
            if(source.doc.dataNode(field)!.value!==value){this.admit(source);source.set(field,value);}
        }
    }

    /** A separately interpreted use has its own conversion coordinates. Keep
     * its original provenance for review, without making later reference repair
     * choose between the structural/data owner and the schema copy. The caller
     * composes this relation with the final coordinates after conversion. */
    separate(origin:GraphScope,label:string,options:Readonly<{
        container?:MigrationLocation;captured?:MigrationSource;identity?:string;
        layout?:MigrationOwnerLayout;
        operationSlot?:MigrationOperationSlot;
        retained?:readonly GraphScope[];schemaIdentity?:boolean;
        excludedNames?:ReadonlySet<string>;
        releaseNativeHolder?:boolean;
    }>={}):Readonly<{
        location:MigrationLocation;provenance:ReadonlyMap<string,MigrationLocation>;
    }> {
        const {container,captured,layout,identity=JSON.stringify([origin.resource,origin.pointer]),retained=[]}=options;
        if(layout==='array-item'&&(origin.kind!=='schema'||!container||!['2.0','3.0','3.1','3.2'].includes(origin.family)))
            throw new SourceError('migration.owners.layout','An anonymous array-item owner requires a compatible native Schema Object container');
        if(layout==='response-header'&&(!container||origin.kind!=='header'||
            container.pointer!==componentLocation('responses',origin.family)||this.graph.specifications.get(container.resource)?.family!==origin.family))
            throw new SourceError('migration.owners.layout','A Header owner requires a compatible Response component container');
        const parameterLayout=layout==='parameter-path-item'||layout==='parameter-operation';
        if(parameterLayout&&(!container||origin.family!=='2.0'||
            origin.kind!==(layout==='parameter-operation'?'operation':'path-item')||container.pointer!=='/parameters'||
            this.graph.specifications.get(container.resource)?.family!=='2.0'))
            throw new SourceError('migration.owners.layout','A foreign Swagger native owner requires an unused body Parameter holder');
        if(layout&&layout!=='array-item'&&layout!=='response-header'&&!parameterLayout&&(!container||
            (layout==='response-media'?origin.kind!=='media'||!['3.0','3.1'].includes(origin.family):
                layout==='callback-path-item'?origin.kind!=='path-item'||!['3.0','3.1','3.2'].includes(origin.family):
                origin.kind!=='operation'||(layout==='callback-operation'?!['3.0','3.1','3.2'].includes(origin.family):!['3.1','3.2'].includes(origin.family)))||
            container.pointer!==componentLocation(layout==='response-media'?'responses':layout==='path-item-operation'?'pathItems':'callbacks',origin.family)||
            this.graph.specifications.get(container.resource)?.family!==origin.family))
            throw new SourceError('migration.owners.layout','This native owner layout does not support the captured object kind and family');
        if(options.operationSlot&&(!['callback-operation','path-item-operation','parameter-operation'].includes(layout??'')||
            (options.operationSlot.additional?origin.family!=='3.2'||
                options.operationSlot.method.match(/^[-!#$%&'*+.^_`|~0-9A-Za-z]+$/)?.[0]!==options.operationSlot.method:
                !standardOperationMethods(origin.family).includes(options.operationSlot.method))))
            throw new SourceError('migration.owners.layout','The captured Operation method has no legal slot in this native holder');
        const input=captured??this.sources.get(origin.resource)!;
        const reservation=container?{source:this.sources.get(container.resource)!,location:this.allocate(
            this.sources.get(container.resource)!,container.pointer,label,identity,options.excludedNames)}:this.reserve(origin,label,identity);
        // Restricted Schema Objects have no $defs storage. A fresh array's
        // item is an anonymous Schema Object without becoming a property or an
        // allOf model. Consumers address the item directly, never the wrapper.
        // The shared reservation, CST copy, provenance and retirement guards
        // own every layout; there is no second specialization mechanism.
        const owner=this.materialOwner(reservation,layout,options.operationSlot);
        if(options.releaseNativeHolder){
            if(!container||!this.generatedResource||!['path-item','operation'].includes(origin.kind)||!['3.0','3.1','3.2'].includes(origin.family))
                throw new SourceError('migration.owners.layout','Only a generated modern native holder can release a converted fragment');
            this.nativeReleases.push({family:origin.family,source:owner.source,material:owner.location,retirement:reservation.location,
                container:container.pointer,destination:this.reserve(origin,label+'_converted',identity)});
        }
        this.copiedOwners.set(JSON.stringify([owner.location.resource,owner.location.pointer]),{
            location:owner.location,retirement:reservation.location,schemaIdentity:options.schemaIdentity===true,
            ...(parameterLayout?{nativeAnnotation:origin.kind}:{})});
        this.admit(input,8);if(owner.source!==input)this.admit(owner.source,8);
        if(layout&&owner.source.doc.dataNode(owner.location.pointer)){
            this.admit(owner.source);owner.source.remove(owner.location.pointer);
        }
        owner.source.copy(input,origin.pointer,owner.location.pointer,true);
        if(options.operationSlot?.parameters?.length){
            // A directly referenced Operation need not admit its lexical Path
            // Item to the graph. Bind only unoverridden inherited parameters
            // locally, through references to their existing material owners.
            const parameters=owner.location.pointer+'/parameters';
            if(!owner.source.doc.dataNode(parameters))owner.source.set(parameters,[]);
            for(const parameter of options.operationSlot.parameters){
                this.admit(owner.source);owner.source.set(parameters+'/'+owner.source.doc.dataNode(parameters)!.children.size,
                    {$ref:parameter.resource+pointerFragment(parameter.pointer)});
            }
        }
        const retainedPointers:string[]=[];
        for(const material of retained){
            this.inspectUse();
            if(material.resource!==origin.resource||material.pointer===origin.pointer||!material.pointer.startsWith(origin.pointer+'/'))
                throw new SourceError('migration.owners.retained','A retained material schema must be a captured child of this occurrence');
            const pointer=owner.location.pointer+material.pointer.slice(origin.pointer.length);
            retainedPointers.push(pointer);this.resourceReferenceUse(owner.source,pointer,material,material,
                {scope:origin,location:owner.location});
        }
        const inside=(at:string)=>at===owner.location.pointer||at.startsWith(owner.location.pointer+'/');
        for(const locations of owner.source.originSets())for(const at of [...locations])if(inside(at))locations.delete(at);
        const provenance=new Map<string,MigrationLocation>();
        for(const pointer of migrationLogicalPointers(owner.source.doc))if(inside(pointer)){
            owner.source.origins.set(pointer,new Set([pointer]));
            // The forwarding use has new fields and no copied resource
            // identity. Original child targets/candidates stay with the
            // retained material owner, not with an anonymous reference shell.
            if(!retainedPointers.some(parent=>{this.inspectUse();return pointer===parent||pointer.startsWith(parent+'/');}))
                provenance.set(origin.pointer+pointer.slice(owner.location.pointer.length),{...owner.location,pointer});
        }
        owner.source.presentationChanges.push(reservation.location.pointer);
        return {location:owner.location,provenance};
    }
}

type UseOriginKind='reference'|'description'|'uri'|'target';
type SemanticOrigin={
    namespace:string;kind:string;field:UseOriginKind;locations:readonly MigrationLocation[];
};

/** Entry/role-qualified semantic provenance across conversion stages. This
 * is a view of the common material-owner relation and MigrationSource's CST
 * coordinates, not another resolver. Literal/history provenance stays intact
 * for exact source review, while each semantic proof follows its own entry. */
export class MigrationSemanticOrigins {
    private readonly records=new Map<string,SemanticOrigin>();
    private work=0;
    constructor(graphs:readonly ReferenceGraph[]){
        const add=(graph:ReferenceGraph,location:MigrationLocation,kind:string,field:UseOriginKind)=>{
            this.inspect();const id=this.key(graph.root,location,kind);
            const previous=this.records.get(id);
            if(previous){
                if(previous.field!==field)throw new SourceError('migration.owners.connection-context','One typed coordinate has conflicting semantic field and target roles');
                return;
            }
            this.records.set(id,{namespace:graph.root,kind,field,locations:[location]});
        };
        for(const graph of graphs)for(const reference of graph.entryReferences()){
            this.inspect();if(reference.resolution!=='resolved')continue;
            const owner=graph.referenceOwner(reference);if(!owner)continue;
            add(graph,{resource:reference.resource,pointer:reference.pointer+'/'+escape(reference.keyword)},owner.kind,'reference');
            add(graph,{resource:reference.targetResource!,pointer:reference.targetPointer!},reference.kind,'target');
            for(const candidate of reference.dynamic?.candidates??[])add(graph,candidate,'schema','target');
        }
        // Resource and operation-media proofs need every captured member,
        // including unused definitions and operations without incoming Links.
        // Typed provenance uses the same relation as reference targets.
        for(const graph of graphs)for(const scope of graph.entryScopes())
            if(['schema','operation','parameter','header','request-body','response','example'].includes(scope.kind))add(graph,scope,scope.kind,'target');
        for(const graph of graphs)for(const scope of graph.entryScopes())
            if(scope.kind==='security-array'||scope.kind==='security-requirement')add(graph,scope,scope.kind,'target');
        for(const graph of graphs)for(const {location,scope,field}of this.valueFields(graph)){
            add(graph,location,scope.kind,field);add(graph,scope,scope.kind,'target');
        }
    }
    private inspect():void {
        if(++this.work>2000000)throw new SourceError('limit.migration.owners','Semantic ownership exceeds 2000000 captured provenance states');
    }
    private key(namespace:string,location:MigrationLocation,kind:string):string {
        return JSON.stringify([namespace,location.resource,location.pointer,kind]);
    }
    locations(namespace:string,origin:MigrationLocation,scope:GraphScope|undefined):readonly MigrationLocation[] {
        this.inspect();return scope?this.records.get(this.key(namespace,origin,scope.kind))?.locations??[]:[];
    }
    projectLocations(project:(location:MigrationLocation)=>readonly MigrationLocation[]):void {
        for(const record of this.records.values()){
            this.inspect();const locations=new Map<string,MigrationLocation>();
            for(const location of record.locations)for(const current of project(location)){
                this.inspect();locations.set(JSON.stringify([current.resource,current.pointer]),current);
            }
            record.locations=[...locations.values()];
        }
    }
    private *valueFields(graph:ReferenceGraph):Generator<{location:MigrationLocation;scope:GraphScope;field:'description'|'uri'}> {
        for(const scope of graph.entryScopes()){
            this.inspect();const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(typeof value?.description==='string'&&richTextField(scope.kind,scope.family,value,'description',segments(scope.pointer).at(-1)??'',graph.allowsReference(scope)))
                yield {location:{resource:scope.resource,pointer:scope.pointer+'/description'},scope,field:'description'};
        }
        for(const {scope,pointer}of documentUriOccurrences(graph)){
            this.inspect();if(graph.isEntryUse(scope))yield {location:{resource:scope.resource,pointer},scope,field:'uri'};
        }
    }
    advance(graphs:readonly ReferenceGraph[],owners:MigrationSchemaOwners,
        current:ReadonlyMap<string,readonly MigrationLocation[]>):void {
        const contexts=new Map(graphs.map(graph=>[graph.root,graph]));
        const fields=new Map<string,GraphScope>();
        const values=new Map<string,GraphScope[]>();
        const valueKey=(namespace:string,location:MigrationLocation,field:UseOriginKind)=>JSON.stringify([namespace,location.resource,location.pointer,field]);
        for(const graph of graphs)for(const reference of graph.entryReferences()){
            this.inspect();const owner=graph.referenceOwner(reference);if(!owner)continue;
            const pointer=reference.pointer+'/'+escape(reference.keyword);
            fields.set(this.key(graph.root,{resource:reference.resource,pointer},owner.kind),owner);
        }
        for(const graph of graphs)for(const {location,scope,field}of this.valueFields(graph)){
            const id=valueKey(graph.root,location,field),owners=values.get(id)??[];
            owners.push(scope);values.set(id,owners);
        }
        for(const record of this.records.values()){
            this.inspect();const graph=contexts.get(record.namespace);
            if(!graph){record.locations=[];continue;}
            const locations=new Map<string,MigrationLocation>();
            for(const location of record.locations){
                this.inspect();let scope:GraphScope|undefined;
                if(record.field==='target')scope=graph.scopeAs(location.resource,location.pointer,record.kind);
                else if(record.field==='reference'){
                    scope=fields.get(this.key(record.namespace,location,record.kind));
                    // A proved finite 3.2 defaultMapping lowers into ordinary
                    // discriminator mapping entries. Both are schema dispatch
                    // connections; retain the exact field/target proof through
                    // the native container-role transition on later stages.
                    if(!scope&&record.kind==='discriminator')scope=fields.get(this.key(record.namespace,location,'discriminator-map'));
                }
                else{
                    const candidates=values.get(valueKey(record.namespace,location,record.field))??[];
                    const matching=candidates.filter(scope=>{this.inspect();return scope.kind===record.kind;});
                    const choices=matching.length?matching:candidates;
                    if(choices.length>1){
                        const range:Range=graph.docs.get(location.resource)!.dataNode(location.pointer)?.range??[0,0];
                        throw new SourceError('migration.owners.field-context','This converted field still has multiple rendered or URI owners',range,'unsupported',{...location,range});
                    }
                    // Explicit CST movement can change a native object kind,
                    // such as a body parameter becoming a Request Body. A
                    // unique actual field capability owns the next stage.
                    scope=choices[0];
                }
                if(!scope||!graph.isEntryUse(scope))continue;
                for(const mapped of owners.entryLocations(record.namespace,location,scope,current)){
                    this.inspect();locations.set(JSON.stringify([mapped.resource,mapped.pointer]),mapped);
                }
            }
            record.locations=[...locations.values()];
        }
    }
}
