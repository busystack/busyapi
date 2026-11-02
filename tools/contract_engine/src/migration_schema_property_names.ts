import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {MigrationSource} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';

/** Core 2020-12 §10.3.2.4 always evaluates property names as strings. For
 * annotation-free finite enum/const/type schemas, a closed properties map
 * expresses exactly the same object assertion in both restricted families.
 * Its own allOf branch leaves existing value schemas and additionalProperties
 * in their original evaluation scope. Non-objects remain unaffected.
 * General patterns and annotated name schemas need different mappings. */
export function migrateSchemaPropertyNames(graph:ReferenceGraph,scope:GraphScope,
    source:MigrationSource,pointer:string,owners:MigrationSchemaOwners,issue:MigrationIssue):void {
    const original=scope.pointer+'/propertyNames',node=graph.docs.get(scope.resource)!.dataNode(original);
    if(!node)return;
    const value=node.value;
    let names:string[]|undefined;
    if(typeof value==='boolean')names=value?undefined:[];
    else if(value&&typeof value==='object'&&!Array.isArray(value)){
        // Unknown keywords can carry independently interpreted annotations;
        // no such field is discarded by this finite assertion mapping.
        if(Object.keys(value).some(name=>!['type','enum','const'].includes(name)))return;
        if(Array.isArray(value.enum))names=value.enum.filter((name:unknown):name is string=>typeof name==='string');
        if(Object.hasOwn(value,'const')){
            const constant=value.const;
            names=typeof constant==='string'&&(names===undefined||names.includes(constant))?[constant]:[];
        }
        if(Object.hasOwn(value,'type')&&!(Array.isArray(value.type)?value.type.includes('string'):value.type==='string'))names=[];
    }else return; // Source validation reports malformed schemas separately.
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
    const at=source.current(original);
    if(at===undefined){
        issue({...scope,pointer:original},'migration.schema.property-name-owner','The property-name schema has no unique surviving planning owner','implementation');return;
    }
    const referenced=graph.references.some(reference=>reference.kind==='schema'&&reference.resolution==='resolved'&&
        reference.targetResource===scope.resource&&(reference.targetPointer===original||reference.targetPointer?.startsWith(original+'/')));
    // The closed-properties branch represents the assertion, but does not own
    // its exact enum/const data operands. Retain that schema through the common
    // owner even without an independent reference, rather than dropping data
    // provenance or altering a separately interpreted operand's consumers.
    const literalOperands=node.kind==='object'&&(node.children.has('enum')||node.children.has('const'));
    if(referenced||literalOperands)owners.move({resource:scope.resource,pointer:original},source,at,'property_names');
    else {owners.admit(source);source.remove(at,true,true,true);}
    if(names===undefined)return;
    owners.admit(source,4);
    const collection=pointer+'/allOf';
    if(!source.doc.dataNode(collection))source.set(collection,[]);
    const branch=collection+'/'+source.doc.dataNode(collection).children.size;
    source.set(branch,names.length?{properties:Object.fromEntries(names.map(name=>[name,{}])),additionalProperties:false}:{maxProperties:0});
    source.presentationChanges.push(branch);
}
