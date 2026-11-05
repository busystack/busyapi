import {escape,SourceError} from './document';
import {schemaResourceContextIdentity,type GraphReference,type GraphScope,type ReferenceGraph} from './reference_graph';
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
        const binding=(reference:GraphReference)=>JSON.stringify([schemaResourceContextIdentity(reference),reference.resolution,
            reference.targetResource,reference.targetPointer,reference.dynamic?.anchor,
            reference.dynamic?.candidates.map(candidate=>[candidate.resource,candidate.pointer])
                .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
        const retained=new Set(graph.references.filter(reference=>reference.kind==='schema'&&reference.keyword==='$dynamicRef'&&!reference.connection).map(key));
        for(const context of contexts)for(const reference of context.entryReferences())if(reference.kind==='schema'&&reference.keyword==='$dynamicRef'&&!reference.connection&&retained.has(key(reference))){
            work+=1+(reference.dynamic?.candidates.length??0);
            if(work>2000000)throw new SourceError('limit.migration.dynamic','Dynamic binding inspection exceeds 2000000 captured candidates');
            const id=key(reference),previous=this.references.get(id);
            if(previous&&binding(previous)!==binding(reference)){
                const pointer=reference.pointer+'/$dynamicRef',range=graph.docs.get(reference.resource)!.dataNode(pointer)!.range;
                throw new SourceError('migration.dynamic.context','This dynamic applicator has distinct captured resource contexts or binding sets; independent owners are required before lowering',range,'unsupported',{resource:reference.resource,pointer,range});
            }
            // Ownership must establish one binding before lowering. Combining
            // unrelated entry candidate sets is not a resolution proof.
            this.references.set(id,previous??reference);
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
