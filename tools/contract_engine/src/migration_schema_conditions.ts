import type {GraphScope,ReferenceGraph,GraphReference} from './reference_graph';
import {pointerFragment,schemaResourceContextIdentity,supportedSchemaDialect} from './reference_graph';
import {SourceError} from './document';
import {migrationValueIdentity,type MigrationSource} from './migration_source';
import {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';
import {constantSchemaAssertion} from './schema_constant_assertions';
import {restrictedBooleanSchema} from './migration_schema_values';

/** Prove only annotation-free constants, through captured fixed references.
 * Resource metadata does not produce instance annotations. An assertion,
 * annotation, competing dynamic target or cycle keeps the ordinary mapping.
 * This finite proof is not a satisfiability search. */
function constantCondition(graph:ReferenceGraph,initial:GraphScope):boolean|undefined {
    return constantSchemaAssertion(graph,initial);
}

/** Keep independently addressed descendants of an inactive branch without
 * converting the branch's never-applied assertions. Close over references from
 * retained children before moving them. Identity/dynamic/implicit connections
 * retain their existing whole-resource guard until that scope is represented.
 */
function discardInactiveCondition(graph:ReferenceGraph,origin:{resource:string;pointer:string},source:MigrationSource,
    owners:MigrationSchemaOwners,references:readonly GraphReference[]):void {
    const within=(at:{resource:string;pointer:string})=>at.resource===origin.resource&&
        (at.pointer===origin.pointer||at.pointer.startsWith(origin.pointer+'/'));
    const at=source.current(origin.pointer);if(at===undefined)return;
    if(!owners.hasConsumers(origin,references)){
        owners.admit(source,4);source.remove(at,true,true,true);return;
    }
    let work=0;
    const inspect=()=>{if(++work>50000)throw new SourceError('limit.migration.condition','Inactive descendant ownership exceeds 50000 captured states');};
    for(const scope of graph.scopesFor('schema')){inspect();if(within(scope)){
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(['$id','$anchor','$dynamicAnchor'].some(name=>typeof value?.[name]==='string'))return;
    }}
    if(references.some(reference=>{
        inspect();return within(reference)&&(reference.connection!==undefined||reference.keyword==='$dynamicRef')||
            reference.dynamic?.candidates.some(at=>{inspect();return within(at);})||reference.candidateTargets?.some(at=>{inspect();return within(at);});
    }))return;
    const selected=new Set<string>();
    const add=(reference:GraphReference)=>{
        inspect();
        if(reference.resolution!=='resolved')return true;
        const target={resource:reference.targetResource!,pointer:reference.targetPointer!};
        if(!within(target))return true;
        if(reference.kind!=='schema'||target.pointer===origin.pointer)return false;
        selected.add(target.pointer);return true;
    };
    for(const reference of references){inspect();if(!within(reference)&&!add(reference))return;}
    // References from retained descendants can reach another inactive sibling.
    // Follow that closure before erasing any original containing assertion.
    let count=-1;
    while(count!==selected.size){
        count=selected.size;
        for(const reference of references){
            inspect();if(reference.resource===origin.resource&&[...selected].some(pointer=>{
                inspect();return reference.pointer===pointer||reference.pointer.startsWith(pointer+'/');
            })&&!add(reference))return;
        }
    }
    if(!selected.size)return;
    const roots:string[]=[];
    for(const pointer of [...selected].sort((a,b)=>a.length-b.length||a.localeCompare(b)))
        if(!roots.some(parent=>pointer.startsWith(parent+'/')))roots.push(pointer);
    for(const pointer of roots){
        const current=source.current(pointer);if(current!==undefined)
            owners.move({resource:origin.resource,pointer},source,current,'inactive_condition_child',{context:graph,layout:'array-item'});
    }
    const current=source.current(origin.pointer);
    if(current!==undefined){owners.admit(source,4);source.remove(current,true,true,true);}
}

/** Restricted families can express every proved annotation-free constant.
 * Lower before child conversion so unsupported Boolean applicators do not
 * obstruct their equivalent constant. Independently used children retain CST
 * owners and ordinary reference repair; surviving root metadata stays put.
 */
export function lowerConstantSchemaApplicators(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,target:string,
    owners:MigrationSchemaOwners,references:readonly GraphReference[]):void {
    if(graph.literalContainer(scope.resource,scope.pointer)!==undefined||graph.hasOverlappingScope(scope.resource,scope.pointer))return;
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    const fields=['allOf','anyOf','oneOf','not'].filter(field=>Object.hasOwn(value??{},field));
    if(!fields.length)return;
    const constant=constantSchemaAssertion(graph,scope);if(constant===undefined)return;
    const pointer=source.current(scope.pointer);if(pointer===undefined)return;
    for(const name of fields){
        const children=name==='not'?[scope.pointer+'/not']:
            [...graph.docs.get(scope.resource)!.dataNode(scope.pointer+'/'+name)!.children.keys()].map(index=>scope.pointer+'/'+name+'/'+index);
        for(const original of children){
            const at=source.current(original);if(at===undefined)continue;
            if(owners.hasConsumers({resource:scope.resource,pointer:original},references))
                owners.move({resource:scope.resource,pointer:original},source,at,'constant_applicator',{context:graph,layout:'array-item'});
        }
        const at=source.doc.dataNode(pointer+'/'+name)?.pointer;
        if(at!==undefined){owners.admit(source,4);source.remove(at,true,true,true);}
    }
    // Keep captured reference fields even when their constant target is known;
    // those independent connections still participate in publication proofs.
    if(!constant)for(const [field,assertion]of Object.entries(restrictedBooleanSchema(false,target))){
        owners.admit(source);source.set(pointer+'/'+field,assertion);
    }
}

/** Type/enum/const assertions collect no instance-location annotations. When
 * both branches have the same exact schema and resource context, selection
 * cannot change either assertions or annotations. Keep all three authored
 * schemas as material owners while applying the shared branch once. */
function equivalentConditionBranches(graph:ReferenceGraph,scope:GraphScope):boolean {
    const doc=graph.docs.get(scope.resource)!,condition=graph.scopeAs(scope.resource,scope.pointer+'/if','schema');
    const value=doc.dataNode(scope.pointer+'/if')?.value;
    if(!condition||!supportedSchemaDialect(condition)||!value||typeof value!=='object'||Array.isArray(value)||
        Object.keys(value).some(name=>!['type','enum','const'].includes(name)))return false;
    const positive=graph.scopeAs(scope.resource,scope.pointer+'/then','schema'),negative=graph.scopeAs(scope.resource,scope.pointer+'/else','schema');
    return positive!==undefined&&negative!==undefined&&
        schemaResourceContextIdentity(positive)===schemaResourceContextIdentity(negative)&&
        migrationValueIdentity(doc,positive.pointer)===migrationValueIdentity(doc,negative.pointer);
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
        if(pointer!==undefined)discardInactiveCondition(graph,{resource:scope.resource,pointer:original},source,owners,references);
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
    if(equivalentConditionBranches(graph,scope)){
        const at=source.current(scope.pointer+'/if');
        if(at!==undefined)owners.move({resource:scope.resource,pointer:scope.pointer+'/if'},source,at,'condition',{context:graph,layout:'array-item'});
        const positive=source.current(scope.pointer+'/then'),negative=source.current(scope.pointer+'/else');
        if(positive===undefined||negative===undefined)throw new SourceError('migration.schema.condition-owner','Equivalent conditional branches lost their captured material owners');
        const allOf=pointer+'/allOf';owners.admit(source,4);
        if(!source.doc.dataNode(allOf))source.set(allOf,[]);
        source.move(positive,allOf+'/'+source.doc.dataNode(allOf).children.size,true);
        owners.move({resource:scope.resource,pointer:scope.pointer+'/else'},source,negative,'equivalent_condition',{context:graph,layout:'array-item'});
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
