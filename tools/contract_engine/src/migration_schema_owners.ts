import {createHash} from 'node:crypto';
import {componentLocation,richTextField} from './authoring';
import {escape,segments,SourceError,type Range} from './document';
import {documentUriOccurrences} from './document_uris';
import {pointerFragment,schemaResourceContextIdentity,type ReferenceGraph,type GraphScope} from './reference_graph';
import type {MigrationLocation,MigrationSource} from './migration_source';
import {migrationLogicalPointers} from './migration_yaml_ownership';

type SemanticOwner=Readonly<{source:GraphScope;owner:GraphScope;location:MigrationLocation}>;

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
    private readonly copiedOperationIds=new Set<string>();
    private readonly copiedOwners=new Map<string,{location:MigrationLocation;schemaIdentity:boolean}>();
    private useWork=0;
    constructor(private readonly graph:ReferenceGraph,
        private readonly sources:ReadonlyMap<string,MigrationSource>,
        private readonly generatedResource?:()=>MigrationSource,reservedIdentities:Iterable<string>=[]){
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
        this.inspectUse();let material=location;
        if(scope){
            if(location.resource!==scope.resource||location.pointer!==scope.pointer&&!location.pointer.startsWith(scope.pointer+'/'))
                throw new SourceError('migration.owners.field-context','A connection field is outside its captured semantic owner');
            const owner=this.entryOwner(namespace,scope,scope.kind);
            material={resource:owner.resource,pointer:owner.pointer+location.pointer.slice(scope.pointer.length)};
        }
        return current.get(JSON.stringify([material.resource,material.pointer]))??[];
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

    /** Retire anonymous preparation copies after every entry has refined
     * them. An internal cycle is not an external consumer. Keep every terminal
     * typed owner, external connection/dynamic candidate and declared schema
     * identity; this never removes authored definitions or guesses that an
     * independently identified resource is disposable. */
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
        const within=(at:MigrationLocation,parent:MigrationLocation)=>at.resource===parent.resource&&
            (at.pointer===parent.pointer||at.pointer.startsWith(parent.pointer+'/'));
        for(const [id,{location:copy,schemaIdentity}]of [...this.copiedOwners].sort(([,a],[,b])=>a.location.pointer.length-b.location.pointer.length)){
            this.inspectUse();const source=this.sources.get(copy.resource)!;
            // Capture identity ownership before a copy becomes unreachable:
            // a later graph need not index its dormant schema descendants.
            if(schemaIdentity||!admitted.has(id)||!source.doc.dataNode(copy.pointer)||terminals.some(at=>{this.inspectUse();return within(at,copy);}))continue;
            let retained=false;
            for(const graph of graphs){
                if(graph.literalContainer(copy.resource,copy.pointer)!==undefined){retained=true;break;}
                for(const schema of graph.scopesFor('schema')){
                    this.inspectUse();if(!within(schema,copy))continue;
                    const value=graph.docs.get(schema.resource)!.dataNode(schema.pointer)?.value;
                    if(['$id','$anchor','$dynamicAnchor'].some(name=>typeof value?.[name]==='string')){retained=true;break;}
                }
                if(retained)break;
                for(const reference of graph.entryReferences()){
                    this.inspectUse();if(within(reference,copy))continue;
                    if(reference.resolution==='resolved'&&within({resource:reference.targetResource!,pointer:reference.targetPointer!},copy)||
                        reference.dynamic?.candidates.some(candidate=>{this.inspectUse();return within(candidate,copy);})||
                        reference.candidateTargets?.some(candidate=>{this.inspectUse();return within(candidate,copy);})){retained=true;break;}
                }
                if(retained)break;
            }
            if(!retained){this.admit(source,8);source.remove(copy.pointer);}
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
            if(!this.graph.identities.has(value)&&!this.externalIdentities.has(value)&&!this.resourceIdentities.has(value)){
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

    reserve(origin:MigrationLocation,label:string,identity=JSON.stringify([origin.resource,origin.pointer])):{source:MigrationSource;location:MigrationLocation} {
        const entry=this.generatedResource?.()??this.sources.get(this.graph.root)!;
        const container=this.generatedResource?'':componentLocation('schemas',this.graph.family)!;
        return {source:entry,location:this.allocate(entry,container,label,identity)};
    }

    /** All schema and object variants use this reservation boundary, including
     * finite request/response and discriminator states. The caller supplies
     * the captured semantic state; payload member names never choose identity. */
    allocate(source:MigrationSource,container:string,label:string,identity:string):MigrationLocation {
        const stem='_migrated_'+label+'_'+createHash('sha256')
            .update(identity).digest('hex').slice(0,24);
        let pointer=container+'/'+stem,index=0;
        const key=(pointer:string)=>JSON.stringify([source.doc.id,pointer]);
        while(source.doc.dataNode(pointer)||this.reserved.has(key(pointer)))pointer=container+'/'+stem+'_'+(++index);
        if(this.reserved.size>=2048)throw new SourceError('limit.migration.owners','Schema specialization exceeds 2048 generated owners');
        this.reserved.add(key(pointer));
        return {resource:source.doc.id,pointer};
    }
    /** Newly generated references use the coordinated target component name.
     * Captured references retain the existing provenance-based repair path. */
    reference(location:MigrationLocation,targetFamily:string):string {
        const prefix='/components/schemas/';
        const pointer=targetFamily==='2.0'&&this.graph.specifications.has(location.resource)&&location.pointer.startsWith(prefix)?
            '/definitions/'+location.pointer.slice(prefix.length):location.pointer;
        return location.resource+pointerFragment(pointer);
    }

    move(origin:MigrationLocation,source:MigrationSource,pointer:string,label:string):MigrationLocation {
        const owner=this.reserve(origin,label);
        this.admit(source,8);
        if(owner.source!==source)this.admit(owner.source,8);
        if(owner.source===source)source.move(pointer,owner.location.pointer,true);
        else {owner.source.copy(source,pointer,owner.location.pointer,true);source.remove(pointer);}
        owner.source.presentationChanges.push(owner.location.pointer);
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

    /** A separately interpreted use has its own conversion coordinates. Keep
     * its original provenance for review, without making later reference repair
     * choose between the structural/data owner and the schema copy. The caller
     * composes this relation with the final coordinates after conversion. */
    separate(origin:GraphScope,label:string,options:Readonly<{
        container?:MigrationLocation;captured?:MigrationSource;identity?:string;
        retained?:readonly MigrationLocation[];schemaIdentity?:boolean;
    }>={}):Readonly<{
        location:MigrationLocation;provenance:ReadonlyMap<string,MigrationLocation>;
    }> {
        const {container,captured,identity=JSON.stringify([origin.resource,origin.pointer]),retained=[]}=options;
        const input=captured??this.sources.get(origin.resource)!;
        const owner=container?{source:this.sources.get(container.resource)!,location:this.allocate(
            this.sources.get(container.resource)!,container.pointer,label,identity)}:this.reserve(origin,label,identity);
        this.copiedOwners.set(JSON.stringify([owner.location.resource,owner.location.pointer]),{
            location:owner.location,schemaIdentity:options.schemaIdentity===true});
        this.admit(input,8);if(owner.source!==input)this.admit(owner.source,8);
        owner.source.copy(input,origin.pointer,owner.location.pointer,true);
        const retainedPointers:string[]=[];
        for(const material of retained){
            this.inspectUse();
            if(material.resource!==origin.resource||material.pointer===origin.pointer||!material.pointer.startsWith(origin.pointer+'/'))
                throw new SourceError('migration.owners.retained','A retained material schema must be a captured child of this occurrence');
            const pointer=owner.location.pointer+material.pointer.slice(origin.pointer.length);
            retainedPointers.push(pointer);this.referenceUse(owner.source,pointer,material);
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
        owner.source.presentationChanges.push(owner.location.pointer);
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
                else if(record.field==='reference')scope=fields.get(this.key(record.namespace,location,record.kind));
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
