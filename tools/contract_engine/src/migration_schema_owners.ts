import {createHash} from 'node:crypto';
import {componentLocation} from './authoring';
import {SourceError,type Range} from './document';
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
    rememberEntry(namespace:string,origin:GraphScope,destination:MigrationLocation,owner:GraphScope=origin):void {
        this.remember(this.entryUses,this.useKey(namespace,origin,origin.kind),origin,destination,owner);
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
    private roleKey(scope:GraphScope):string {
        return JSON.stringify([scope.resource,scope.pointer,scope.kind,schemaResourceContextIdentity(scope),scope.schemaParent]);
    }
    rememberRole(scope:GraphScope,destination:MigrationLocation,owner:GraphScope):void {
        this.remember(this.roleUses,this.roleKey(scope),scope,destination,owner);
    }
    roleOwners(scope:GraphScope):readonly SemanticOwner[] {
        this.inspectUse();return this.roleUses.get(this.roleKey(scope))??[];
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

    /** A separately interpreted use has its own conversion coordinates. Keep
     * its original provenance for review, without making later reference repair
     * choose between the structural/data owner and the schema copy. The caller
     * composes this relation with the final coordinates after conversion. */
    separate(origin:MigrationLocation,label:string,container?:MigrationLocation,captured?:MigrationSource,identity=JSON.stringify([origin.resource,origin.pointer])):Readonly<{
        location:MigrationLocation;provenance:ReadonlyMap<string,MigrationLocation>;
    }> {
        const input=captured??this.sources.get(origin.resource)!;
        const owner=container?{source:this.sources.get(container.resource)!,location:this.allocate(
            this.sources.get(container.resource)!,container.pointer,label,identity)}:this.reserve(origin,label,identity);
        this.admit(input,8);if(owner.source!==input)this.admit(owner.source,8);
        owner.source.copy(input,origin.pointer,owner.location.pointer,true);
        const inside=(at:string)=>at===owner.location.pointer||at.startsWith(owner.location.pointer+'/');
        for(const locations of owner.source.originSets())for(const at of [...locations])if(inside(at))locations.delete(at);
        const provenance=new Map<string,MigrationLocation>();
        for(const pointer of migrationLogicalPointers(owner.source.doc))if(inside(pointer)){
            owner.source.origins.set(pointer,new Set([pointer]));
            provenance.set(origin.pointer+pointer.slice(owner.location.pointer.length),{...owner.location,pointer});
        }
        owner.source.presentationChanges.push(owner.location.pointer);
        return {location:owner.location,provenance};
    }
}
