import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {SourcePlan} from './source_plan';
import {restrictedBooleanSchema} from './migration_schema_values';
import {MigrationSchemaOwners} from './migration_schema_owners';

/** Restricted Schema Objects allow a boolean additionalProperties field but
 * not a standalone boolean schema. Preserve both roles when a captured modern
 * reference targets that field (OAS 3.0.4 §4.7.24.1; Core 2020-12 §4.3.2).
 * Schema provenance moves to a generated definition; the field's syntax and
 * value remain with its original object. No references are searched in data. */
export class BooleanSchemaMigration {
    private readonly referenced=new Set<string>();
    private readonly owners:MigrationSchemaOwners;

    constructor(private readonly graph:ReferenceGraph,
        sources:ReadonlyMap<string,SourcePlan>,private readonly target:string,owners=new MigrationSchemaOwners(graph,sources),contexts:readonly ReferenceGraph[]=[graph]){
        this.owners=owners;
        for(const reference of contexts.flatMap(context=>context.entryReferences())){
            if(reference.kind==='schema'&&!reference.connection&&reference.resolution==='resolved')
                this.referenced.add(JSON.stringify([reference.targetResource,reference.targetPointer]));
        }
    }

    lower(scope:GraphScope,source:SourcePlan,pointer:string,value:boolean):void {
        const context=this.owners.contextOf(scope)??this.graph;
        const parent=scope.pointer.slice(0,scope.pointer.lastIndexOf('/'));
        const field=scope.pointer.endsWith('/additionalProperties')&&
            pointer===source.current(parent,scope.resource)+'/additionalProperties'&&
            context.scopeAs(scope.resource,parent,'schema')!==undefined;
        if(!field){source.set(pointer,restrictedBooleanSchema(value,this.target));return;}
        if(!this.referenced.has(JSON.stringify([scope.resource,scope.pointer])))return;

        const owner=this.owners.reserve(scope,'additional'),entry=owner.source,destination=owner.location.pointer;
        this.owners.admit(source,4);if(entry!==source)this.owners.admit(entry,4);
        entry.copy(source,pointer,destination);
        // The copy now owns incoming schema references. Leaving this physical
        // field in its target set would make reference repair ambiguous. Its
        // containing object's provenance still retains the unchanged field.
        for(const locations of source.originSets())locations.delete(pointer);
        entry.set(destination,restrictedBooleanSchema(value,this.target));
        entry.presentationChanges.push(destination);
    }
}
