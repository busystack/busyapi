import type {GraphScope,ReferenceGraph,GraphReference} from './reference_graph';
import {pointerFragment} from './reference_graph';
import {SourceError} from './document';
import {projectSchemaReference} from './schema_reference_projection';
import type {MigrationSource} from './migration_source';
import {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';

/** Prove only annotation-free constants, through captured fixed references.
 * Resource metadata does not produce instance annotations. An assertion,
 * annotation, competing dynamic target or cycle keeps the ordinary mapping.
 * This finite proof is not a satisfiability search. */
function constantCondition(graph:ReferenceGraph,initial:GraphScope):boolean|undefined {
    let scope=initial;
    const seen=new Set<string>();
    for(let work=0;work<128;work++){
        const id=JSON.stringify([scope.resource,scope.pointer]);if(seen.has(id))return;seen.add(id);
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(typeof value==='boolean')return value;
        if(value===null||typeof value!=='object'||Array.isArray(value)||
            Object.keys(value).some(name=>!['$id','$schema','$anchor','$dynamicAnchor','$ref','$dynamicRef'].includes(name)))return;
        const keywords=['$ref','$dynamicRef'].filter(name=>Object.hasOwn(value,name));
        if(!keywords.length)return true;
        if(keywords.length!==1)return;
        const reference=graph.referenceAs(scope.resource,scope.pointer,keywords[0],'schema');
        if(!reference)return;
        const projected=projectSchemaReference(reference);if(projected.state!=='fixed')return;
        const target=graph.scopeAs(projected.target.resource,projected.target.pointer,'schema');if(!target)return;
        scope=target;
    }
    const range=graph.docs.get(initial.resource)!.dataNode(initial.pointer)!.range;
    throw new SourceError('limit.migration.condition','Constant-condition proof exceeds 128 captured reference links',range,'unsupported',
        {resource:initial.resource,pointer:initial.pointer,range});
}

/** Remove a proved inactive, unconsumed branch before vocabulary conversion.
 * Otherwise an assertion that never runs could incorrectly block migration.
 * Consumed branches remain intact for normal conversion and later hoisting. */
export function discardInactiveSchemaConditions(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,owners:MigrationSchemaOwners,
    references:readonly GraphReference[]):void {
    if(graph.literalContainer(scope.resource,scope.pointer)!==undefined||graph.hasOverlappingScope(scope.resource,scope.pointer))return;
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(value===null||typeof value!=='object'||Array.isArray(value))return;
    const condition=graph.scopeAs(scope.resource,scope.pointer+'/if','schema');
    const constant=condition?constantCondition(graph,condition):undefined;
    const inactive=!Object.hasOwn(value,'if')?['then','else']:constant===undefined?[]:[constant?'else':'then'];
    for(const name of inactive){
        const original=scope.pointer+'/'+name,pointer=source.current(original);
        if(pointer!==undefined&&!owners.hasConsumers({resource:scope.resource,pointer:original},references)){
            owners.admit(source,4);source.remove(pointer,true,true,true);
        }
    }
}

/** Core 2020-12 §10.2.2: one mutually exclusive branch applies. Hoisting the
 * condition keeps a single owner for independent references, exact values and
 * annotations. The negated branch collects no annotations from the condition;
 * the successful positive branch does, including when then is absent. */
export function migrateSchemaConditions(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,
    pointer:string,target:string,owners:MigrationSchemaOwners,issue:MigrationIssue,references:readonly GraphReference[]):void {
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
            if(owners.hasConsumers({resource:scope.resource,pointer:original},references))
                owners.move({resource:scope.resource,pointer:original},source,at,'inactive_condition',{context:graph,layout:'array-item'});
            else {owners.admit(source,4);source.remove(at,true,true,true);}
        }
        return;
    }
    const conditionScope=graph.scopeAs(scope.resource,scope.pointer+'/if','schema');
    const constant=conditionScope?constantCondition(graph,conditionScope):undefined;
    if(constant!==undefined){
        // The condition contributes no instance annotations. Keep its converted
        // target for independent uses and captured reference/scope proofs;
        // apply only the selected branch at the original instance location.
        const at=source.current(scope.pointer+'/if');
        if(at!==undefined)owners.move({resource:scope.resource,pointer:scope.pointer+'/if'},source,at,'condition',{context:graph,layout:'array-item'});
        const allOf=pointer+'/allOf',selected=constant?'then':'else';
        for(const name of ['then','else']){
            const original=scope.pointer+'/'+name,current=source.current(original);if(current===undefined)continue;
            if(name===selected){
                owners.admit(source,2);if(!source.doc.dataNode(allOf))source.set(allOf,[]);
                source.move(current,allOf+'/'+source.doc.dataNode(allOf).children.size,true);
            }else if(owners.hasConsumers({resource:scope.resource,pointer:original},references))
                owners.move({resource:scope.resource,pointer:original},source,current,'inactive_condition',{context:graph,layout:'array-item'});
            else {owners.admit(source,4);source.remove(current,true,true,true);}
        }
        return;
    }
    if(target!=='3.0'){
        issue({...scope,pointer:scope.pointer+'/if'},'migration.schema.conditional','Swagger has no conditional, disjunction or negation keyword; this condition needs a specific equivalent assertion mapping','implementation');
        return;
    }
    const condition=owners.move({resource:scope.resource,pointer:scope.pointer+'/if'},source,pointer+'/if','condition',{context:graph,layout:'array-item'});
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
