import {createHash} from 'node:crypto';
import {componentLocation} from './authoring';
import {SourceError} from './document';
import type {ReferenceGraph} from './reference_graph';
import type {MigrationLocation,MigrationSource} from './migration_source';

/** Generated schema owners share one reservation/provenance boundary. A label
 * describes the reviewed restructuring; identity comes from the captured use,
 * never from payload keys or whichever entry happened to be visited first. */
export class MigrationSchemaOwners {
    private readonly reserved=new Set<string>();
    private edits=0;
    private work=0;
    constructor(private readonly graph:ReferenceGraph,
        private readonly sources:ReadonlyMap<string,MigrationSource>){ }

    admit(source:MigrationSource,edits=1):void {
        this.edits+=edits;this.work+=source.doc.text.length*edits*2;
        if(this.edits>4096||this.work>128*1024*1024)
            throw new SourceError('limit.migration.owners','Schema specialization exceeds its bounded CST edit work');
    }

    reserve(origin:MigrationLocation,label:string):{source:MigrationSource;location:MigrationLocation} {
        const entry=this.sources.get(this.graph.root)!;
        const container=componentLocation('schemas',this.graph.family)!;
        const stem='_migrated_'+label+'_'+createHash('sha256')
            .update(JSON.stringify([origin.resource,origin.pointer])).digest('hex').slice(0,24);
        let pointer=container+'/'+stem,index=0;
        while(entry.doc.dataNode(pointer)||this.reserved.has(pointer))pointer=container+'/'+stem+'_'+(++index);
        if(this.reserved.size>=2048)throw new SourceError('limit.migration.owners','Schema specialization exceeds 2048 generated owners');
        this.reserved.add(pointer);
        return {source:entry,location:{resource:entry.doc.id,pointer}};
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
}
