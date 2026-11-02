import {escape,SourceError} from './document';
import type {GraphReference,GraphScope,ReferenceGraph} from './reference_graph';
import type {MigrationIssue} from './migration_schema';
import type {MigrationSource} from './migration_source';
import {projectSchemaReference} from './schema_reference_projection';

/** Older OAS Reference Objects ignore siblings. Retain each proved fixed
 * applicator in its own allOf branch, including recursive references. Use the
 * canonical fixed-target projection also consumed by media/discriminators;
 * scope is never selected by samples or by choosing the first candidate. */
export class MigrationSchemaReferences {
    private readonly references=new Map<string,GraphReference>();
    private readonly requiredAnchors=new Set<string>();
    constructor(graph:ReferenceGraph,contexts:readonly ReferenceGraph[]=[graph]){
        let work=0;
        const key=(reference:GraphReference)=>JSON.stringify([reference.resource,reference.pointer]);
        const retained=new Set(graph.references.filter(reference=>reference.kind==='schema'&&reference.keyword==='$dynamicRef'&&!reference.connection).map(key));
        for(const context of contexts)for(const reference of context.entryReferences())if(reference.kind==='schema'&&reference.keyword==='$dynamicRef'&&!reference.connection&&retained.has(key(reference))){
            work+=1+(reference.dynamic?.candidates.length??0);
            if(work>2000000)throw new SourceError('limit.migration.dynamic','Dynamic binding inspection exceeds 2000000 captured candidates');
            const id=key(reference),previous=this.references.get(id);
            if(previous&&(previous.resolution!==reference.resolution||previous.targetResource!==reference.targetResource||previous.targetPointer!==reference.targetPointer)){
                const pointer=reference.pointer+'/$dynamicRef',range=graph.docs.get(reference.resource)!.dataNode(pointer)!.range;
                throw new SourceError('migration.dynamic.context','This shared dynamic starting point requires independent entry ownership',range,'unsupported',{resource:reference.resource,pointer,range});
            }
            const dynamic=previous?.dynamic??reference.dynamic;
            const merged:GraphReference=dynamic?{...reference,dynamic:{anchor:dynamic.anchor,candidates:[...new Map([
                ...(previous?.dynamic?.candidates??[]),...(reference.dynamic?.candidates??[]),
            ].map(candidate=>[JSON.stringify([candidate.resource,candidate.pointer]),candidate])).values()]}}:reference;
            this.references.set(id,merged);
        }
        for(const reference of this.references.values())if(reference.dynamic&&projectSchemaReference(reference).state!=='fixed')for(const candidate of reference.dynamic.candidates)
            this.requiredAnchors.add(JSON.stringify([candidate.resource,candidate.pointer]));
    }
    requiresDynamicAnchor(scope:GraphScope):boolean {
        return this.requiredAnchors.has(JSON.stringify([scope.resource,scope.pointer]));
    }
    lower(scope:GraphScope,source:MigrationSource,pointer:string,issue:MigrationIssue):void {
        if(!source.doc.dataNode(pointer+'/$dynamicRef'))return;
        const location={...scope,pointer:scope.pointer+'/'+escape('$dynamicRef')};
        const reference=this.references.get(JSON.stringify([scope.resource,scope.pointer]));
        const projection=reference&&projectSchemaReference(reference);
        if(!projection||projection.state==='unresolved'){
            issue(location,'migration.schema.dynamic-reference','The captured schema reference must resolve before conversion to an older family','source-incomplete');return;
        }
        if(projection.state!=='fixed'){
            issue(location,'migration.schema.dynamic-reference','Captured matching anchors can select different schemas; older-family dynamic-scope specialization is not implemented','implementation');return;
        }
        const allOf=pointer+'/allOf';
        if(!source.doc.dataNode(allOf))source.set(allOf,[]);
        const branch=allOf+'/'+source.doc.dataNode(allOf).children.size;
        source.set(branch,{});
        source.move(pointer+'/$dynamicRef',branch+'/$ref');
    }
}
