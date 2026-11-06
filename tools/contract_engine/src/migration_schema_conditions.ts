import type {GraphScope,ReferenceGraph,GraphReference} from './reference_graph';
import {pointerFragment,schemaResourceContextIdentity,supportedSchemaDialect} from './reference_graph';
import {SourceError,segments} from './document';
import {migrationValueIdentity,type MigrationSource} from './migration_source';
import {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';
import {constantSchemaAssertion} from './schema_constant_assertions';
import {restrictedBooleanSchema} from './migration_schema_values';
import {MigrationSchemaProofs,type SchemaGuardAssumptions} from './migration_schema_proofs';
import {decimal} from './exact_numbers';
import {requiredInBothDirections} from './schema_access';
import {MigrationPropertyPresence} from './migration_property_presence';
import {schemaGuardProjection,deferGuardProjection,guardProjectionScopes,type GuardProjection} from './migration_guard_projection';

export type ConditionPlan=Readonly<{selected?:'then'|'else'|'both';assertCondition?:boolean;complement?:Record<string,unknown>;
    exactComplement?:Readonly<{field:string;raw:string}>;erase?:boolean;
    projected?:readonly Readonly<{name:'then'|'else';plan:GuardProjection}>[]}>;

/** Prove reductions using sibling assertions and the actual branch languages.
 * No then/else assertion becomes an unconditional assumption merely because
 * it is physically nested beneath the same Schema Object. */
function conditionalPlan(graph:ReferenceGraph,scope:GraphScope,target:string,active=new Set<string>(),assumptions:readonly GraphScope[]=[],guard?:SchemaGuardAssumptions):ConditionPlan|undefined {
    const doc=graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value;
    const predicate=graph.scopeAs(scope.resource,scope.pointer+'/if','schema');if(!predicate)return;
    const proofs=new MigrationSchemaProofs(graph);
    let selectedPredicate=predicate,conditionDoc=doc,condition=doc.dataNode(predicate.pointer)?.value;
    const followed=new Set<string>();
    while(condition&&typeof condition==='object'&&!Array.isArray(condition)){
        const fields=Object.keys(condition).filter(field=>!['$id','$schema','$anchor','$dynamicAnchor'].includes(field));
        if(fields.length!==1)break;
        const id=JSON.stringify([selectedPredicate.resource,selectedPredicate.pointer]);
        if(followed.has(id)||followed.size>=128)break;followed.add(id);
        let resolved:GraphScope|undefined;
        if(['$ref','$dynamicRef'].includes(fields[0]))resolved=proofs.fixed(selectedPredicate,fields[0]);
        else if(['allOf','anyOf','oneOf'].includes(fields[0]))resolved=proofs.equivalentBranch(selectedPredicate,fields[0]);
        else if(fields[0]==='not'){
            const child=graph.scopeAs(selectedPredicate.resource,selectedPredicate.pointer+'/not','schema');
            const body=child&&graph.docs.get(child.resource)!.dataNode(child.pointer)?.value;
            if(body&&Object.keys(body).filter(field=>!['$id','$schema','$anchor','$dynamicAnchor'].includes(field)).every(field=>field==='not'))
                resolved=graph.scopeAs(child.resource,child.pointer+'/not','schema');
        }
        if(!resolved)break;
        selectedPredicate=resolved;conditionDoc=graph.docs.get(resolved.resource)!;condition=conditionDoc.dataNode(resolved.pointer)?.value;
    }
    if(proofs.conjuncts(predicate).some(part=>part.resource===scope.resource&&part.pointer===scope.pointer))return;
    const positive=graph.scopeAs(scope.resource,scope.pointer+'/then','schema'),negative=graph.scopeAs(scope.resource,scope.pointer+'/else','schema');
    const presence=new MigrationPropertyPresence(graph);
    const domains=new Set([...proofs.domains(scope)].filter(kind=>assumptions.every(parent=>proofs.domains(parent).has(kind))));
    const selection=guard??{domains,present:(name:string)=>[scope,...assumptions].some(parent=>presence.requires(parent,name)),
        absent:(name:string)=>[scope,...assumptions].some(parent=>presence.absent(parent,name))};
    const guarded=proofs.guardedTruth(predicate,selection,[scope,...assumptions]);
    if(guarded===true)return {selected:'then',assertCondition:!proofs.annotationFree(predicate)&&!proofs.annotationsInactiveIn(predicate,selection.domains)};
    if(guarded===false)return {selected:'else'};
    if([scope,...assumptions].some(parent=>proofs.implies(parent,predicate))||negative&&proofs.implies(negative,predicate))return {selected:'then',assertCondition:true};
    if([scope,...assumptions].some(parent=>proofs.disjoint(parent,predicate)))return {selected:'else'};
    if(target!=='2.0')return;
    const constant=(child:GraphScope|undefined)=>child?
        child===positive&&(proofs.disjoint(predicate,child)||proofs.disjoint(scope,child))?false:constantCondition(graph,child):true;
    if(constant(negative)===false)return {selected:'then',assertCondition:true};
    const fields=condition&&typeof condition==='object'&&!Array.isArray(condition)?
        Object.keys(condition).filter(field=>!['$id','$schema','$anchor','$dynamicAnchor'].includes(field)):[];
    const plainType=fields.length===1&&fields[0]==='type'&&typeof condition.type==='string'&&condition.type!=='integer';
    const plainPresence=fields.length===1&&fields[0]==='required'&&Array.isArray(condition.required)&&condition.required.length===1;
    if(constant(positive)===false){
        if(plainType){
            const types=['null','boolean','object','array','number','string'].filter(type=>type!==condition.type);
            return {selected:'else',complement:{type:types}};
        }
        if(plainPresence)return {selected:'else',complement:{type:'object',properties:{[condition.required[0]]:restrictedBooleanSchema(false,target)}}};
        if(fields.length===1){
            const field=fields[0],numeric=['minimum','maximum','exclusiveMinimum','exclusiveMaximum'].includes(field);
            if(numeric&&typeof condition[field]==='number'){
                const lower=field==='minimum'||field==='exclusiveMinimum',bound=lower?'maximum':'minimum';
                return {selected:'else',complement:{type:'number',[lower?'exclusiveMaximum':'exclusiveMinimum']:!field.startsWith('exclusive')},
                    exactComplement:{field:bound,raw:conditionDoc.dataJson(selectedPredicate.pointer+'/'+field)}};
            }
            const domain=field.endsWith('Length')?'string':field.endsWith('Items')?'array':field.endsWith('Properties')?'object':undefined;
            if(domain&&/^(?:min|max)(?:Length|Items|Properties)$/.test(field)){
                const exact=decimal(conditionDoc.dataJson(selectedPredicate.pointer+'/'+field));
                if(exact.exponent>=0n&&exact.exponent<=4096n){
                    const lower=field.startsWith('min'),bound=exact.coefficient*10n**exact.exponent+(lower?-1n:1n);
                    return bound<0n?{selected:'else',complement:restrictedBooleanSchema(false,target)}:
                        {selected:'else',complement:{type:domain,...(domain==='array'?{items:{}}:{})},
                            exactComplement:{field:(lower?'max':'min')+field.slice(3),raw:String(bound)}};
                }
            }
        }
    }
    if(!proofs.annotationsCoveredByProperties(predicate,new Set(Object.keys(value.properties??{}))))return;
    const inactive=(child:GraphScope|undefined)=>!child||constant(child)===true;
    if(inactive(negative)&&positive&&proofs.annotationsInactiveIn(positive,proofs.domains(predicate))&&proofs.implies(predicate,positive))return {erase:true};
    if(inactive(negative)&&positive&&proofs.annotationFree(positive)&&proofs.implies(predicate,positive))return {erase:true};
    if(plainType&&positive&&negative&&proofs.neutralOutside(positive,new Set([condition.type]))&&
        proofs.neutralOutside(negative,new Set(['null','boolean','object','array','number','string'].filter(type=>type!==condition.type))))return {selected:'both'};
    if(inactive(negative)&&positive&&(
        plainType&&proofs.neutralOutside(positive,new Set([condition.type]))||
        plainPresence&&proofs.neutralWithoutProperty(positive,condition.required[0])))return {selected:'then'};
    if(inactive(positive)&&negative&&plainType&&proofs.neutralOutside(negative,
        new Set(['null','boolean','object','array','number','string'].filter(type=>type!==condition.type))))return {selected:'else'};
    if(plainType){
        const domains=new Set<string>([condition.type]),opposite=new Set(['null','boolean','object','array','number','string'].filter(type=>type!==condition.type));
        const then=positive?schemaGuardProjection(graph,positive,{domains},proofs,active):undefined;
        const otherwise=negative?schemaGuardProjection(graph,negative,{domains:opposite},proofs,active):undefined;
        if(inactive(negative)&&then)return {selected:'then',projected:[{name:'then',plan:then}]};
        if(inactive(positive)&&otherwise)return {selected:'else',projected:[{name:'else',plan:otherwise}]};
        if(then&&otherwise)return {selected:'both',projected:[{name:'then',plan:then},{name:'else',plan:otherwise}]};
    }
    if(plainPresence&&positive&&inactive(negative)){
        const explicit=new MigrationPropertyPresence(graph),plan=schemaGuardProjection(graph,positive,
            {property:condition.required[0],conditionalPresence:true,unconditional:name=>explicit.unconditional(scope,name)},proofs,active);
        if(plan)return {selected:'then',projected:[{name:'then',plan}]};
    }
    if([positive,negative].every(child=>!child||
        (proofs.annotationsInactiveIn(child,proofs.domains(scope))||proofs.annotationsCoveredByProperties(child,new Set(Object.keys(value.properties??{}))))&&
            proofs.implies(scope,child)))return {erase:true};
}

/** Shared source selection certificate for ordinary lowering and outer guard
 * composition. Unselected branches remain independent schemas; this describes
 * only the applicator's effect on the containing instance. */
export function capturedConditionalPlan(graph:ReferenceGraph,scope:GraphScope,target:string,active=new Set<string>(),assumptions:readonly GraphScope[]=[],guard?:SchemaGuardAssumptions):ConditionPlan|undefined {
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(!Object.hasOwn(value??{},'if'))return {erase:true};
    const predicate=graph.scopeAs(scope.resource,scope.pointer+'/if','schema');
    const constant=predicate?constantCondition(graph,predicate):undefined;
    if(constant!==undefined)return {selected:constant?'then':'else'};
    return conditionalPlan(graph,scope,target,active,assumptions,guard)??(equivalentConditionBranches(graph,scope)?{selected:'then'}:undefined);
}

function conditionalAssumptions(graph:ReferenceGraph,scope:GraphScope,owners:MigrationSchemaOwners,references:readonly GraphReference[]):readonly GraphScope[]{
    const pending=[scope],seen=new Set<string>(),parents:GraphScope[]=[];
    while(pending.length){
        const child=pending.pop()!,id=JSON.stringify([child.resource,child.pointer]);
        if(seen.has(id)||owners.hasRootConsumer(child,references))continue;
        if(seen.size>=128)break;seen.add(id);
        for(const parent of graph.schemaParentsOf(child))if(parent.resource===child.resource&&
            /^\/(?:allOf\/\d+|anyOf\/\d+|oneOf\/\d+|dependentSchemas\/[^/]+|if|then|else|not)$/.test(child.pointer.slice(parent.pointer.length))){
            parents.push(parent);pending.push(parent);
        }
    }
    return parents;
}
function conditionalEntryGuard(graph:ReferenceGraph,scope:GraphScope,owners:MigrationSchemaOwners,references:readonly GraphReference[]):SchemaGuardAssumptions|undefined {
    const parents=conditionalAssumptions(graph,scope,owners,references),children=[scope,...parents],triggers=new Set<string>();
    for(const child of children){
        if(owners.hasRootConsumer(child,references))continue;
        for(const parent of graph.schemaParentsOf(child)){
            if(parent.resource!==child.resource)continue;
            const path=segments(child.pointer.slice(parent.pointer.length));
            if(path.length===2&&path[0]==='dependentSchemas')triggers.add(path[1]);
        }
    }
    if(!triggers.size)return;
    const presence=new MigrationPropertyPresence(graph,child=>!owners.hasRootConsumer(child,references));
    return {domains:new Set(['object']),present:name=>triggers.has(name)||presence.requires(scope,name),absent:name=>presence.absent(scope,name)};
}

/** Contextual constant reduction needs facts outside the applicator being
 * removed. Stop at the conditional/dependency boundary; using its own allOf
 * constraints as premises would erase the cause of a contradiction. */
function conditionalApplicatorContext(graph:ReferenceGraph,scope:GraphScope,owners:MigrationSchemaOwners,references:readonly GraphReference[]):
    Readonly<{guard:SchemaGuardAssumptions;assumptions:readonly GraphScope[]}>|undefined {
    const pending=[scope],seen=new Set<string>();
    while(pending.length){
        const child=pending.pop()!,id=JSON.stringify([child.resource,child.pointer]);
        if(seen.has(id)||owners.hasRootConsumer(child,references))continue;
        if(seen.size>=128)return;seen.add(id);
        for(const parent of graph.schemaParentsOf(child)){
            if(parent.resource!==child.resource)continue;
            const path=segments(child.pointer.slice(parent.pointer.length));
            if(path.length===1&&['if','then','else'].includes(path[0])||path.length===2&&path[0]==='dependentSchemas'){
                const presence=new MigrationPropertyPresence(graph),proofs=new MigrationSchemaProofs(graph);
                const predicate=graph.scopeAs(parent.resource,parent.pointer+'/if','schema');
                const domains=new Set([...proofs.domains(parent)].filter(kind=>path[0]==='then'&&predicate?proofs.domains(predicate).has(kind):
                    path[0]==='else'&&predicate?proofs.constantInDomains(predicate,new Set([kind]))!==true:true));
                return {guard:{domains:path[0]==='dependentSchemas'?new Set(['object']):domains,
                    present:name=>path[0]==='dependentSchemas'&&path[1]===name||presence.unconditional(parent,name)||path[0]==='then'&&!!predicate&&presence.unconditional(predicate,name),
                    absent:name=>presence.absent(parent,name)},assumptions:[]};
            }
            if(/^(allOf|anyOf|oneOf|not)$/.test(path[0]??''))pending.push(parent);
        }
    }
}

/** Prefer an established native-applicability representation over folding a
 * branch's type into a whole-instance finite enum. The latter loses the guard
 * needed to admit non-objects/non-arrays outside the selected branch. These
 * are the same plans consumed below, not another conditional proof. */
export function conditionalProjectionScopes(graph:ReferenceGraph,scope:GraphScope,target:string):readonly GraphScope[] {
    if(target!=='2.0')return [];
    if(!Object.hasOwn(graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value??{},'if'))return [];
    const plan=capturedConditionalPlan(graph,scope,target);if(!plan)return [];
    return [scope,...(plan.projected??[]).flatMap(projected=>guardProjectionScopes(graph,projected.plan))];
}

/** Prove only annotation-free constants, through captured fixed references.
 * Resource metadata does not produce instance annotations. An assertion,
 * annotation, competing dynamic target or cycle keeps the ordinary mapping.
 * This finite proof is not a satisfiability search. */
function constantCondition(graph:ReferenceGraph,initial:GraphScope):boolean|undefined {
    const existing=constantSchemaAssertion(graph,initial);if(existing!==undefined)return existing;
    const proof=new MigrationSchemaProofs(graph),truth=proof.validationConstant(initial);
    return truth===false?false:truth===true&&proof.annotationFree(initial)?true:undefined;
}

function conditionalContext(graph:ReferenceGraph,scope:GraphScope,seen=new Set<string>(),initial=true):boolean {
    const id=JSON.stringify([scope.resource,scope.pointer]);if(seen.has(id)||seen.size>=128)return false;
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(initial&&(Object.hasOwn(value??{},'if')||Object.hasOwn(value??{},'dependentSchemas')))return true;
    const next=new Set(seen).add(id);
    return graph.schemaParentsOf(scope).some(parent=>parent.resource===scope.resource&&(
        /^\/(?:if|then|else|dependentSchemas\/[^/]*)$/.test(scope.pointer.slice(parent.pointer.length))||conditionalContext(graph,parent,next,false)));
}

/** Keep independently addressed descendants of an inactive branch without
 * converting the branch's never-applied assertions. Close over references from
 * retained children before moving them. Identity/dynamic/implicit connections
 * retain their existing whole-resource guard until that scope is represented.
 */
export function discardInactiveMigrationSchema(graph:ReferenceGraph,origin:{resource:string;pointer:string},source:MigrationSource,
    owners:MigrationSchemaOwners,references:readonly GraphReference[]):void {
    const within=(at:{resource:string;pointer:string})=>at.resource===origin.resource&&
        (at.pointer===origin.pointer||at.pointer.startsWith(origin.pointer+'/'));
    const at=source.current(origin.pointer,origin.resource);if(at===undefined)return;
    const connected=references.some(reference=>within(reference)&&(reference.connection!==undefined||reference.keyword==='$dynamicRef'));
    if(!owners.hasConsumers(origin,references)&&!connected){
        for(const scope of graph.entryScopes())if(scope.kind==='schema'&&within(scope)){
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            for(const field of Object.keys(value??{}))if(['enum','default','example','examples'].includes(field)||field.startsWith('x-')){
                const original=scope.pointer+'/'+field.replace(/~/g,'~0').replace(/\//g,'~1'),current=source.current(original,origin.resource);
                if(current!==undefined)owners.retainLiteralValue({resource:scope.resource,pointer:original},source,current);
            }
        }
        const current=source.current(origin.pointer,origin.resource);
        if(current!==undefined){owners.admit(source,4);source.remove(current,true,true,true);}return;
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
        const current=source.current(pointer,origin.resource);if(current!==undefined)
            owners.move({resource:origin.resource,pointer},source,current,'inactive_condition_child',{context:graph,layout:'array-item'});
    }
    const current=source.current(origin.pointer,origin.resource);
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
    const conditional=conditionalContext(graph,scope)||owners.isProjectionSource(scope),proofs=new MigrationSchemaProofs(graph);
    const retained=proofs.conjuncts(scope),presence=new MigrationPropertyPresence(graph);
    // These facts survive a true reduction: direct assertions, fixed references
    // and allOf are retained. Facts established only by a removed logical
    // choice or dependency cannot erase their own cause.
    const contextual=conditional?(conditionalApplicatorContext(graph,scope,owners,references)??{
        guard:{domains:proofs.domains(scope),present:(name:string)=>retained.some(part=>{
            const body=graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
            return !graph.referenceObject(body,part)&&body?.required?.includes(name)&&requiredInBothDirections(graph,part,name);
        }),absent:(name:string)=>presence.absent(scope,name)},assumptions:[],
    }):undefined;
    const contextualTruth=contextual?proofs.guardedTruth(scope,contextual.guard,contextual.assumptions):undefined;
    const childrenInactive=()=>fields.every(field=>field==='not'||[...graph.docs.get(scope.resource)!.dataNode(scope.pointer+'/'+field)!.children.keys()].every(index=>{
        const child=graph.scopeAs(scope.resource,scope.pointer+'/'+field+'/'+index,'schema');
        return child&&proofs.annotationsInactiveIn(child,contextual!.guard.domains);
    }));
    const constant=(conditional?constantCondition(graph,scope):constantSchemaAssertion(graph,scope))??
        (contextualTruth===false?false:contextualTruth===true&&childrenInactive()?true:undefined);
    const retireChild=(child:GraphScope,label:string)=>{
        discardInactiveMigrationSchema(graph,child,source,owners,references);
        const at=source.current(child.pointer,child.resource),parent=source.current(scope.pointer,scope.resource);
        if(at!==undefined&&parent!==undefined&&at.startsWith(parent+'/'))
            owners.move(child,source,at,label,{context:owners.contextOf(scope)??graph,layout:'array-item'});
    };
    if(constant===undefined){
        if(!conditional)return;
        for(const keyword of ['anyOf','oneOf'] as const)if(Array.isArray(value?.[keyword])){
            const field=source.current(scope.pointer+'/'+keyword,scope.resource);
            const parent=source.current(scope.pointer,scope.resource);
            if(field===undefined||parent===undefined||field!==parent+'/'+keyword)continue;
            const children:GraphScope[]=value[keyword].map((_:unknown,index:number)=>graph.scopeAs(scope.resource,scope.pointer+'/'+keyword+'/'+index,'schema'));
            if(children.some(child=>!child))continue;
            const falseInContext=(child:GraphScope)=>proofs.validationConstant(child)===false||
                !!contextual&&proofs.guardedTruth(child,contextual.guard,contextual.assumptions)===false;
            const selected=proofs.equivalentBranch(scope,keyword,contextual?.guard,contextual?.assumptions);
            let successful:GraphScope[]|undefined;
            if(selected&&children.every(child=>child.pointer===selected.pointer||falseInContext(child)||proofs.annotationFree(child)))
                successful=[selected];
            else {
                const truth=children.map(child=>proofs.validationConstant(child)??
                    (contextual?proofs.guardedTruth(child,contextual.guard,contextual.assumptions):undefined));
                if(truth.every(value=>value!==undefined)&&truth.some(Boolean)&&(keyword==='anyOf'||truth.filter(Boolean).length===1))
                    successful=children.filter((_,index)=>truth[index]);
            }
            if(!successful)continue;
            const selectedOwners=successful.map(child=>{
                const current=source.current(child.pointer,child.resource);
                if(current===undefined)throw new SourceError('migration.schema.logical-owner','A selected logical branch lost its material schema');
                return owners.move(child,source,current,'logical_choice',{context:owners.contextOf(scope)??graph,layout:'array-item'});
            });
            for(const child of children)if(!successful.includes(child))retireChild(child,'logical_original');
            const at=source.current(scope.pointer+'/'+keyword,scope.resource);if(at!==undefined)source.remove(at,true,true,true);
            const current=source.current(scope.pointer,scope.resource);
            const effect=owners.isolateApplication(scope,source,current!,keyword,[],target);
            owners.admit(effect.source);effect.source.set(effect.location.pointer,{allOf:selectedOwners.map(owner=>({$ref:owners.reference(owner,target)}))});
        }
        return;
    }
    const pointer=source.current(scope.pointer,scope.resource);if(pointer===undefined)return;
    for(const name of fields){
        // A contextual truth certificate can depend on these retained
        // conjuncts. Keeping allOf also preserves its successful annotations.
        if(constant&&name==='allOf')continue;
        const children=name==='not'?[scope.pointer+'/not']:
            [...graph.docs.get(scope.resource)!.dataNode(scope.pointer+'/'+name)!.children.keys()].map(index=>scope.pointer+'/'+name+'/'+index);
        for(const original of children){
            const child=graph.scopeAs(scope.resource,original,'schema');if(child)retireChild(child,'constant_applicator');
        }
        const at=source.doc.dataNode(pointer+'/'+name)?.pointer;
        if(at!==undefined){owners.admit(source,4);source.remove(at,true,true,true);}
        if(constant&&(name==='anyOf'||name==='oneOf'))owners.retireApplication(scope,name);
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
    if(!condition||!supportedSchemaDialect(condition)||!new MigrationSchemaProofs(graph).annotationsCoveredByProperties(condition,
        new Set(Object.keys(doc.dataNode(scope.pointer)?.value?.properties??{}))))return false;
    const positive=graph.scopeAs(scope.resource,scope.pointer+'/then','schema'),negative=graph.scopeAs(scope.resource,scope.pointer+'/else','schema');
    return positive!==undefined&&negative!==undefined&&
        schemaResourceContextIdentity(positive)===schemaResourceContextIdentity(negative)&&
        migrationValueIdentity(doc,positive.pointer)===migrationValueIdentity(doc,negative.pointer);
}

/** Remove a proved inactive, unconsumed branch before vocabulary conversion.
 * Otherwise an assertion that never runs could incorrectly block migration.
 * Consumed branches remain intact for normal conversion and later hoisting. */
export function discardInactiveSchemaConditions(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,owners:MigrationSchemaOwners,
    references:readonly GraphReference[],target='2.0'):void {
    if(graph.literalContainer(scope.resource,scope.pointer)!==undefined||graph.hasOverlappingScope(scope.resource,scope.pointer))return;
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(value===null||typeof value!=='object'||Array.isArray(value))return;
    const condition=graph.scopeAs(scope.resource,scope.pointer+'/if','schema');
    const constant=condition?constantCondition(graph,condition):undefined;
    const plan=constant===undefined?conditionalPlan(graph,scope,target,new Set(),conditionalAssumptions(graph,scope,owners,references),conditionalEntryGuard(graph,scope,owners,references)):undefined;
    // Inactive native applications can be retired before either restricted
    // target's child conversion. The main 3.0 mapping still uses its applicators.
    const preparation=constant===undefined&&target!=='2.0'?conditionalPlan(graph,scope,'2.0',new Set(),conditionalAssumptions(graph,scope,owners,references),conditionalEntryGuard(graph,scope,owners,references)):plan;
    for(const projected of preparation?.projected??[]){
        const root=projected.plan.scope;
        if(owners.hasRootConsumer(root,references))continue;
        for(const inactive of projected.plan.discarded){
            if(!['array','object'].includes(inactive.domain)||inactive.scope.resource!==root.resource||
                inactive.scope.pointer!==root.pointer&&!inactive.scope.pointer.startsWith(root.pointer+'/'))continue;
            const pending=[inactive.scope],visited=new Set<string>();let sharedAncestor=false;
            while(pending.length&&!sharedAncestor){
                const parent=pending.pop()!;
                if(parent.resource!==root.resource||parent.pointer!==root.pointer&&!parent.pointer.startsWith(root.pointer+'/'))continue;
                if(visited.has(parent.pointer))continue;visited.add(parent.pointer);
                sharedAncestor=owners.hasRootConsumer(parent,references);pending.push(...graph.schemaParentsOf(parent));
            }
            if(sharedAncestor)continue;
            if(inactive.domain==='object'){
                const original=inactive.scope.pointer+'/dependentRequired',current=source.current(original,root.resource);
                const owner=source.current(inactive.scope.pointer,root.resource);
                if(current!==undefined&&owner!==undefined&&current===owner+'/dependentRequired'&&
                    !owners.hasRootConsumer({resource:root.resource,pointer:original},references))
                    owners.retainLiteralValue({resource:root.resource,pointer:original},source,current,'inactive_dependency_names');
            }
            for(const field of inactive.domain==='array'?['prefixItems','items']:['dependentSchemas']){
                const original=inactive.scope.pointer+'/'+field,node=graph.docs.get(root.resource)!.dataNode(original);
                if(!node)continue;
                if(owners.hasRootConsumer({resource:root.resource,pointer:original},references))continue;
                const collection=node.kind==='array'||field==='dependentSchemas';
                const schemas=collection?[...node.children.keys()].reverse().map(index=>original+'/'+index.replace(/~/g,'~0').replace(/\//g,'~1')):[original];
                for(const pointer of schemas){
                    const current=source.current(pointer,root.resource);
                    const owner=source.current(inactive.scope.pointer,root.resource);
                    if(current===undefined||owner===undefined||!current.startsWith(owner+'/'))continue;
                    discardInactiveMigrationSchema(graph,{resource:root.resource,pointer},source,owners,references);
                    const retained=source.current(pointer,root.resource);
                    if(retained!==undefined&&retained.startsWith(owner+'/'))
                        owners.move({resource:root.resource,pointer},source,retained,'inactive_native_schema',{context:graph,layout:'array-item'});
                }
                const current=source.current(original,root.resource),owner=source.current(inactive.scope.pointer,root.resource);
                if(collection&&current!==undefined&&owner!==undefined&&current===owner+'/'+field){owners.admit(source);source.remove(current,true,true,true);}
            }
        }
    }
    const inactive=!Object.hasOwn(value,'if')?['then','else']:constant!==undefined?[constant?'else':'then']:
        (plan?.erase||preparation?.erase)?['if','then','else']:plan?.selected&&plan.selected!=='both'?[plan.selected==='then'?'else':'then']:[];
    if(plan?.selected&&!plan.assertCondition&&condition&&new MigrationSchemaProofs(graph).annotationFree(condition))inactive.push('if');
    for(const name of inactive){
        const original=scope.pointer+'/'+name,pointer=source.current(original,scope.resource);
        if(pointer!==undefined)discardInactiveMigrationSchema(graph,{resource:scope.resource,pointer:original},source,owners,references);
    }
}

/** Core 2020-12 §10.2.2: one mutually exclusive branch applies. Hoisting the
 * condition keeps a single owner for independent references, exact values and
 * annotations. The negated branch collects no annotations from the condition;
 * the successful positive branch does, including when then is absent. */
export function migrateSchemaConditions(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,
    pointer:string,target:string,owners:MigrationSchemaOwners,issue:MigrationIssue,references:readonly GraphReference[],
    sources:ReadonlyMap<string,MigrationSource>,defer:(projection:()=>void)=>void):void {
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(!value||typeof value!=='object')return;
    const fields=['if','then','else'].filter(name=>Object.hasOwn(value,name)&&source.doc.dataNode(pointer+'/'+name));
    if(!fields.length)return;
    if(graph.literalContainer(scope.resource,scope.pointer)!==undefined||graph.hasOverlappingScope(scope.resource,scope.pointer)){
        issue(scope,'migration.schema.condition-owner','This conditional schema has an independent literal or object interpretation requiring a separate owner','implementation');return;
    }
    const effect=owners.isolateApplication(scope,source,pointer,'condition',fields,target);
    source=effect.source;pointer=effect.location.pointer;
    if(!Object.hasOwn(value,'if')){
        // Without if, neither keyword is evaluated, even for annotations. An
        // independently referenced subschema must retain its own target.
        for(const name of fields){
            const original=scope.pointer+'/'+name,at=source.current(original,scope.resource);
            if(at===undefined)continue;
            if(owners.hasConsumers({resource:scope.resource,pointer:original},references))
                owners.move({resource:scope.resource,pointer:original},source,at,'inactive_condition',{context:graph,layout:'array-item'});
            else {owners.admit(source,4);source.remove(at,true,true,true);}
        }
        return;
    }
    const conditionScope=graph.scopeAs(scope.resource,scope.pointer+'/if','schema');
    const constant=conditionScope?constantCondition(graph,conditionScope):undefined;
    const plan=constant===undefined?conditionalPlan(graph,scope,target,new Set(),conditionalAssumptions(graph,scope,owners,references),conditionalEntryGuard(graph,scope,owners,references)):undefined;
    if(plan){
        const collection=pointer+'/allOf';
        const append=()=>{
            owners.admit(source,2);if(!source.doc.dataNode(collection))source.set(collection,[]);
            return collection+'/'+source.doc.dataNode(collection).children.size;
        };
        for(const name of ['if','then','else']){
            const original=scope.pointer+'/'+name,at=source.current(original,scope.resource);if(at===undefined)continue;
            // The preparation pass may already have retained an independent
            // inactive owner outside this containing conditional.
            if(!at.startsWith(pointer+'/'))continue;
            if(name===plan.selected||plan.selected==='both'&&name!=='if'||name==='if'&&plan.assertCondition){
                const projected=plan.projected?.find(value=>value.name===name);
                if(projected){
                    const variant=deferGuardProjection(graph,projected.plan,target,owners,sources,defer);
                    owners.move({resource:scope.resource,pointer:original},source,at,'conditional_original',{context:graph,layout:'array-item'});
                    source.set(append(),{$ref:owners.reference(variant,target)});
                }else source.move(at,append(),true);
            }
            else {
                discardInactiveMigrationSchema(graph,{resource:scope.resource,pointer:original},source,owners,references);
                const retained=source.current(original,scope.resource);
                if(retained!==undefined&&retained.startsWith(pointer+'/'))
                    owners.move({resource:scope.resource,pointer:original},source,retained,'inactive_condition',{context:graph,layout:'array-item'});
            }
        }
        if(plan.complement){
            const branch=append();source.set(branch,plan.complement);
            if(plan.exactComplement)source.exact(branch+'/'+plan.exactComplement.field,plan.exactComplement.raw);
        }
        return;
    }
    if(constant!==undefined){
        // The condition contributes no instance annotations. Keep its converted
        // target for independent uses and captured reference/scope proofs;
        // apply only the selected branch at the original instance location.
        const at=source.current(scope.pointer+'/if',scope.resource);
        if(at!==undefined)owners.move({resource:scope.resource,pointer:scope.pointer+'/if'},source,at,'condition',{context:graph,layout:'array-item'});
        const allOf=pointer+'/allOf',selected=constant?'then':'else';
        for(const name of ['then','else']){
            const original=scope.pointer+'/'+name,current=source.current(original,scope.resource);if(current===undefined)continue;
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
        const at=source.current(scope.pointer+'/if',scope.resource);
        if(at!==undefined)owners.move({resource:scope.resource,pointer:scope.pointer+'/if'},source,at,'condition',{context:graph,layout:'array-item'});
        const positive=source.current(scope.pointer+'/then',scope.resource),negative=source.current(scope.pointer+'/else',scope.resource);
        if(positive===undefined||negative===undefined)throw new SourceError('migration.schema.condition-owner','Equivalent conditional branches lost their captured material owners');
        const allOf=pointer+'/allOf';owners.admit(source,4);
        if(!source.doc.dataNode(allOf))source.set(allOf,[]);
        source.move(positive,allOf+'/'+source.doc.dataNode(allOf).children.size,true);
        owners.move({resource:scope.resource,pointer:scope.pointer+'/else'},source,negative,'equivalent_condition',{context:graph,layout:'array-item'});
        return;
    }
    if(target!=='3.0'){
        const predicate=value.if;
        const annotationOnly=Object.keys(value).every(field=>['if','$id','$schema','$anchor','$dynamicAnchor'].includes(field))&&
            predicate&&typeof predicate==='object'&&!Array.isArray(predicate)&&
            Object.keys(predicate).every(field=>['type','description','title'].includes(field))&&typeof predicate.type==='string'&&
            ['null','boolean','object','array','number','integer','string'].includes(predicate.type)&&
            ['description','title'].some(field=>Object.hasOwn(predicate,field));
        issue({...scope,pointer:scope.pointer+'/if'},'migration.schema.conditional',annotationOnly?
            'Swagger 2.0 cannot conditionally collect a root annotation while accepting every JSON instance type':
            'The bounded implication, domain, complement and exhaustive finite-domain proofs did not establish an equivalent Swagger assertion and annotation mapping',
            annotationOnly?'target-representation':'implementation');
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
        const at=source.current(scope.pointer+'/'+name,scope.resource);
        if(at!==undefined)source.move(at,branch+'/anyOf/'+index+'/allOf/1',true);
    }
}
