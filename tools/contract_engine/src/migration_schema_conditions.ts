import type {GraphScope,ReferenceGraph} from './reference_graph';
import {pointerFragment} from './reference_graph';
import type {MigrationSource} from './migration_source';
import {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';

/** Core 2020-12 §10.2.2: one mutually exclusive branch applies. Hoisting the
 * condition keeps a single owner for independent references, exact values and
 * annotations. The negated branch collects no annotations from the condition;
 * the successful positive branch does, including when then is absent. */
export function migrateSchemaConditions(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,
    pointer:string,target:string,owners:MigrationSchemaOwners,issue:MigrationIssue):void {
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(!value||typeof value!=='object')return;
    const fields=['if','then','else'].filter(name=>Object.hasOwn(value,name));
    if(!fields.length)return;
    if(graph.literalContainer(scope.resource,scope.pointer)!==undefined||graph.hasOverlappingScope(scope.resource,scope.pointer)){
        issue(scope,'migration.schema.condition-owner','This conditional schema has an independent literal or object interpretation requiring a separate owner','implementation');return;
    }
    if(!Object.hasOwn(value,'if')){
        // Without if, neither keyword is evaluated, even for annotations. An
        // independently referenced subschema must retain its own target.
        for(const name of fields){
            const original=scope.pointer+'/'+name,at=source.current(original);
            if(at===undefined)continue;
            if(graph.references.some(reference=>reference.kind==='schema'&&reference.resolution==='resolved'&&
                reference.targetResource===scope.resource&&(reference.targetPointer===original||reference.targetPointer?.startsWith(original+'/'))))
                owners.move({resource:scope.resource,pointer:original},source,at,'inactive_condition');
            else source.remove(at,true,true,true);
        }
        return;
    }
    if(target!=='3.0'){
        issue({...scope,pointer:scope.pointer+'/if'},'migration.schema.conditional','Swagger has no conditional, disjunction or negation keyword; this condition needs a specific equivalent assertion mapping','implementation');
        return;
    }
    const condition=owners.move({resource:scope.resource,pointer:scope.pointer+'/if'},source,pointer+'/if','condition');
    const reference={$ref:condition.resource+pointerFragment(condition.pointer)};
    const allOf=pointer+'/allOf';
    owners.admit(source,4);
    if(!source.doc.dataNode(allOf))source.set(allOf,[]);
    const branch=allOf+'/'+source.doc.dataNode(allOf).children.size;
    source.set(branch,{anyOf:[{allOf:[reference]},{allOf:[{not:reference}]}]});
    for(const [name,index]of [['then',0],['else',1]] as const){
        const at=source.current(scope.pointer+'/'+name);
        if(at!==undefined)source.move(at,branch+'/anyOf/'+index+'/allOf/1',true);
    }
}
