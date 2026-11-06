import type {GraphScope,ReferenceGraph,GraphReference} from './reference_graph';
import type {MigrationSource} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';

/** A finite assertion on string property names; undefined names means no
 * restriction, while an absent proof means this shape has no finite mapping.
 * Shared with finite pattern selection, so the two mappings cannot disagree. */
export function finitePropertyNameSet(value:unknown):Readonly<{names:readonly string[]|undefined}>|undefined {
    if(typeof value==='boolean')return {names:value?undefined:[]};
    if(value===null||typeof value!=='object'||Array.isArray(value))return;
    const fields=new Map<string,unknown>(Object.entries(value));
    if([...fields.keys()].some(name=>!['type','enum','const'].includes(name)))return;
    let names:string[]|undefined;
    const enumeration=fields.get('enum');
    if(Array.isArray(enumeration))names=enumeration.filter((name:unknown):name is string=>typeof name==='string');
    if(fields.has('const')){
        const constant=fields.get('const');
        names=typeof constant==='string'&&(names===undefined||names.includes(constant))?[constant]:[];
    }
    const type=fields.get('type');
    if(fields.has('type')&&!(Array.isArray(type)?type.includes('string'):type==='string'))names=[];
    return {names};
}

/** Core 2020-12 §10.3.2.4 always evaluates property names as strings. For
 * annotation-free finite enum/const/type schemas, a closed properties map
 * expresses exactly the same object assertion in both restricted families.
 * Its own allOf branch leaves existing value schemas and additionalProperties
 * in their original evaluation scope. Non-objects remain unaffected.
 * General patterns and annotated name schemas need different mappings. */
export function migrateSchemaPropertyNames(graph:ReferenceGraph,scope:GraphScope,
    source:MigrationSource,pointer:string,owners:MigrationSchemaOwners,issue:MigrationIssue,references:readonly GraphReference[]):void {
    const original=scope.pointer+'/propertyNames',node=graph.docs.get(scope.resource)!.dataNode(original);
    if(!node)return;
    const value=node.value;
    const proof=finitePropertyNameSet(value);if(!proof)return;
    const names=proof.names;
    if(names&&names.length>2048){
        issue({...scope,pointer:original},'limit.migration.property-names','Finite property-name conversion exceeds 2048 named properties','implementation');return;
    }
    const overlapping=graph.literalContainer(scope.resource,scope.pointer)!==undefined||
        graph.hasOverlappingScope(scope.resource,scope.pointer)||
        [...graph.interpretedScopes()].some(use=>use.resource===scope.resource&&
            (use.pointer===original||use.pointer.startsWith(original+'/'))&&
            (graph.hasOverlappingScope(use.resource,use.pointer)||use.kind==='schema'&&graph.literalContainer(use.resource,use.pointer)!==undefined));
    if(overlapping){
        issue({...scope,pointer:original},'migration.schema.property-name-owner','This property-name schema also has literal or object uses requiring semantic owner specialization','implementation');return;
    }
    const at=source.current(original,scope.resource);
    if(at===undefined){
        issue({...scope,pointer:original},'migration.schema.property-name-owner','The property-name schema has no unique surviving planning owner','implementation');return;
    }
    const referenced=owners.hasConsumers({resource:scope.resource,pointer:original},references);
    // The closed-properties branch represents the assertion, but does not own
    // its exact enum/const data operands. Retain that schema through the common
    // owner even without an independent reference, rather than dropping data
    // provenance or altering a separately interpreted operand's consumers.
    const literalOperands=node.kind==='object'&&(node.children.has('enum')||node.children.has('const'));
    if(referenced||literalOperands)owners.move({resource:scope.resource,pointer:original},source,at,'property_names',{context:graph});
    else {owners.admit(source);source.remove(at,true,true,true);}
    if(names===undefined)return;
    owners.admit(source,4);
    const collection=pointer+'/allOf';
    if(!source.doc.dataNode(collection))source.set(collection,[]);
    const branch=collection+'/'+source.doc.dataNode(collection).children.size;
    source.set(branch,names.length?{properties:Object.fromEntries(names.map(name=>[name,{}])),additionalProperties:false}:{maxProperties:0});
    source.presentationChanges.push(branch);
}
