import {createHash} from 'node:crypto';
import {componentLocation} from './authoring';
import {SourceError} from './document';
import type {ReferenceGraph} from './reference_graph';
import type {MigrationLocation,MigrationSource} from './migration_source';
import {migrationLogicalPointers} from './migration_yaml_ownership';

/** Generated schema owners share one reservation/provenance boundary. A label
 * describes the reviewed restructuring; identity comes from the captured use,
 * never from payload keys or whichever entry happened to be visited first. */
export class MigrationSchemaOwners {
    private readonly reserved=new Set<string>();
    private edits=0;
    private work=0;
    constructor(private readonly graph:ReferenceGraph,
        private readonly sources:ReadonlyMap<string,MigrationSource>,
        private readonly generatedResource?:()=>MigrationSource){ }

    admit(source:MigrationSource,edits=1):void {
        this.edits+=edits;this.work+=source.doc.text.length*edits*2;
        if(this.edits>4096||this.work>128*1024*1024)
            throw new SourceError('limit.migration.owners','Schema specialization exceeds its bounded CST edit work');
    }

    reserve(origin:MigrationLocation,label:string):{source:MigrationSource;location:MigrationLocation} {
        const entry=this.generatedResource?.()??this.sources.get(this.graph.root)!;
        const container=this.generatedResource?'':componentLocation('schemas',this.graph.family)!;
        return {source:entry,location:this.allocate(entry,container,label,JSON.stringify([origin.resource,origin.pointer]))};
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
    separate(origin:MigrationLocation,label:string,container?:MigrationLocation,captured?:MigrationSource):Readonly<{
        location:MigrationLocation;provenance:ReadonlyMap<string,MigrationLocation>;
    }> {
        const input=captured??this.sources.get(origin.resource)!;
        const owner=container?{source:this.sources.get(container.resource)!,location:this.allocate(
            this.sources.get(container.resource)!,container.pointer,label,JSON.stringify([origin.resource,origin.pointer]))}:this.reserve(origin,label);
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
