import {schemaDefinitionKeywords} from './schema_definitions';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import {MigrationSource,type MigrationLocation} from './migration_source';
import {modernFamily} from './specification';
import {escape} from './document';
import {compare,decimal} from './exact_numbers';
import {MigrationSchemaReferences} from './migration_schema_references';
import {MigrationPropertyPresence} from './migration_property_presence';
import {migrateDependentRequired,migrateDependentSchemas,discardInactiveSchemaDependencies,nativeSchemaDependencies,dependencyProjectionScopes} from './migration_schema_dependencies';
import {migrateInactiveSchemaAnnotations} from './migration_inactive_annotations';
import {BooleanSchemaMigration} from './migration_boolean_schema';
import {MigrationSchemaOwners} from './migration_schema_owners';
import {discardInactiveSchemaConditions,migrateSchemaConditions,lowerConstantSchemaApplicators,conditionalProjectionScopes} from './migration_schema_conditions';
import {migrateSchemaTuple,discardUnreachableTupleSchemas,migrateComposedUnevaluatedTuple} from './migration_schema_tuples';
import {migrateSchemaPropertyNames,type MigrationNameRestriction} from './migration_schema_property_names';
import {MigrationPatternProperties} from './migration_schema_patterns';
import {MigrationPropertyDomains} from './migration_schema_name_domains';
import {finitePropertyNameSet} from './migration_schema_property_names';
import {MigrationEvaluatedProperties} from './migration_schema_evaluated_properties';
import {MigrationEvaluatedItems} from './migration_schema_evaluated_items';
import {migrateSchemaContains} from './migration_schema_contains';
import {discardInactiveContent} from './migration_schema_content';
import {migrateSchemaStringComplement} from './migration_schema_string_complements';
import {discardInactiveUnevaluated,migrateSchemaUnevaluated} from './migration_schema_unevaluated';
import {MigrationArrayBounds,migrateConstantContains,migrateArrayAlternatives} from './migration_schema_arrays';
import {migrationScopes,migrationReferences} from './migration_documents';
import {migrateFiniteSchemaDomain} from './migration_finite_domain';
import type {Resource} from './engine';
import {createHash} from 'node:crypto';
import type {ExternalExampleResourcePacket} from './external_examples';
import {flatSchemaScopes} from './migration_flat_items';

export type MigrationChoice=Readonly<{value:string;label:string;target:MigrationLocation&{range:readonly number[]}}>;
export type MigrationProblem={resource:string;pointer:string;range:number[];code:string;message:string;reason:'target-representation'|'implementation'|'source-incomplete'|'decision';choices?:string[];choiceDetails?:readonly MigrationChoice[];id?:string};
export type MigrationIssueLocation=MigrationLocation&{original?:MigrationLocation;decisionKey?:string};
export type MigrationIssue=(scope:MigrationIssueLocation,code:string,message:string,reason:MigrationProblem['reason'],choices?:string[],choiceDetails?:readonly MigrationChoice[])=>boolean;
export type MigrationChoose=(scope:MigrationIssueLocation,code:string,message:string,choices:readonly MigrationChoice[])=>string|undefined;

/** Normative schema mappings. No schema is evaluated under another family's
 * dialect to make a migration pass. These edits affect planning copies only. */
export async function migrateSchemas(graph:ReferenceGraph,sources:Map<string,MigrationSource>,from:string,to:string,issue:MigrationIssue,contexts:readonly ReferenceGraph[]=[graph],
    resources:readonly Resource[]=[...graph.docs].map(([id,doc])=>({id,text:doc.text,generation:0,identity:createHash('sha256').update(doc.text).digest('hex')})),
    exampleResources:readonly ExternalExampleResourcePacket[]=[]):Promise<void> {
    const references=new MigrationSchemaReferences(graph,contexts);
    const owners=new MigrationSchemaOwners(graph,sources,undefined,[],contexts);
    const capturedReferences=[...migrationReferences(contexts)];
    const nameDomains=new Map<ReferenceGraph,MigrationPropertyDomains>(),patternMappings=new Map<ReferenceGraph,MigrationPatternProperties>();
    const nameProofs=new Map<string,MigrationNameRestriction>();
    const evaluatedProperties=new Map<ReferenceGraph,MigrationEvaluatedProperties>();
    const evaluatedItems=new Map<ReferenceGraph,MigrationEvaluatedItems>();
    const namesFor=(context:ReferenceGraph)=>{
        let proof=nameDomains.get(context);if(!proof){proof=new MigrationPropertyDomains(context);nameDomains.set(context,proof);}return proof;
    };
    const evaluatedFor=(context:ReferenceGraph)=>{
        let mapping=evaluatedProperties.get(context);
        if(!mapping){mapping=new MigrationEvaluatedProperties(context,owners,namesFor(context));evaluatedProperties.set(context,mapping);}return mapping;
    };
    const patternsFor=(context:ReferenceGraph)=>{
        let mapping=patternMappings.get(context);
        if(!mapping){mapping=new MigrationPatternProperties(context,owners,capturedReferences,issue,namesFor(context));patternMappings.set(context,mapping);}return mapping;
    };
    const booleans=new BooleanSchemaMigration(graph,sources,to,owners,contexts);
    const requirements=new Map<ReferenceGraph,MigrationPropertyPresence>(),bounds=new Map<ReferenceGraph,MigrationArrayBounds>();
    const projections:(()=>void)[]=[];
    const guardedBodies=new Set<string>();
    const requirementsFor=(context:ReferenceGraph)=>{
        let proof=requirements.get(context);
        if(!proof){proof=new MigrationPropertyPresence(context,scope=>!owners.hasRootConsumer(scope,capturedReferences));requirements.set(context,proof);}
        return proof;
    };
    const boundsFor=(context:ReferenceGraph)=>{
        let proof=bounds.get(context);
        if(!proof){proof=new MigrationArrayBounds(context,2048,scope=>!owners.hasRootConsumer(scope,capturedReferences));bounds.set(context,proof);}
        return proof;
    };
    const evaluatedItemsFor=(context:ReferenceGraph)=>{
        let mapping=evaluatedItems.get(context);
        if(!mapping){mapping=new MigrationEvaluatedItems(context,owners,boundsFor(context));evaluatedItems.set(context,mapping);}return mapping;
    };
    // Coordinated entries own their active schemas independently. A detached
    // original schema file remains literal source history after specialization;
    // parsing its identity does not authorize converting that dormant owner.
    const captured=new Map<string,GraphScope>();
    for(const scope of migrationScopes(contexts))if(scope.kind==='schema'&&scope.family===from)
        captured.set(JSON.stringify([scope.resource,scope.pointer]),scope);
    const scopes=[...captured.values()].sort((a,b)=>b.pointer.length-a.pointer.length);
    if(modernFamily(from)&&!modernFamily(to))for(const scope of scopes){
        const context=owners.contextOf(scope);if(!context)continue;
        const name=context.docs.get(scope.resource)!.dataNode(scope.pointer+'/propertyNames');
        if(name&&finitePropertyNameSet(name.value)===undefined){
            const proof=await namesFor(context).restriction(scope,resources,exampleResources);
            if(proof)nameProofs.set(JSON.stringify([scope.resource,scope.pointer]),proof);
        }
    }
    const flatItems=to==='2.0'?new Set(contexts.flatMap(context=>[...flatSchemaScopes(context)])):new Set<string>();
    if(modernFamily(from)&&to==='2.0')for(const scope of scopes){
        const context=owners.contextOf(scope);if(!context)continue;
        for(const guarded of [...conditionalProjectionScopes(context,scope,to),...dependencyProjectionScopes(context,scope,requirementsFor(context))])
            {guardedBodies.add(JSON.stringify([guarded.resource,guarded.pointer]));owners.markProjectionSource(guarded);}
    }
    if(!modernFamily(to))for(const scope of [...scopes].reverse()){
        const material=owners.materialLocations(scope);if(!material.length)continue;
        const {source}=owners.uniqueLocation(scope);
        if(source.current(scope.pointer,scope.resource)!==undefined){
            const context=owners.contextOf(scope);
            if(!context){issue(scope,'migration.schema.context','Schema conversion requires its captured entry, role and resource context','implementation');continue;}
            discardUnreachableTupleSchemas(context,scope,source,owners,capturedReferences,boundsFor(context));
            if(modernFamily(from))discardInactiveUnevaluated(context,scope,source,owners,capturedReferences);
            if(modernFamily(from))discardInactiveContent(context,scope,source,owners,capturedReferences);
            if(modernFamily(from)){
                evaluatedFor(context).discardInactive(scope,source,capturedReferences);
                evaluatedItemsFor(context).discardInactive(scope,source,capturedReferences);
                const at=source.current(scope.pointer,scope.resource);
                if(at!==undefined)migrateComposedUnevaluatedTuple(context,scope,source,at,to,owners,capturedReferences,boundsFor(context));
            }
            if(modernFamily(from))for(const guarded of conditionalProjectionScopes(context,scope,to))
                guardedBodies.add(JSON.stringify([guarded.resource,guarded.pointer]));
            const nativeDependency=to==='2.0'&&nativeSchemaDependencies(context,scope,requirementsFor(context));
            if(!nativeDependency&&!guardedBodies.has(JSON.stringify([scope.resource,scope.pointer]))&&
                await migrateFiniteSchemaDomain(context,scope,source,to,owners,capturedReferences,resources,exampleResources,flatItems.has(JSON.stringify([scope.resource,scope.pointer]))))continue;
            if(!modernFamily(from))continue;
            discardInactiveSchemaConditions(context,scope,source,owners,capturedReferences,to);
            discardInactiveSchemaDependencies(context,scope,source,requirementsFor(context),owners,capturedReferences,to);
            lowerConstantSchemaApplicators(context,scope,source,to,owners,capturedReferences);
            // Give authored conjuncts their own application use before other
            // lowerings append independent condition/dependency effects.
            // Projection then composes child variants, including terminal
            // guards, without relying on their old inline coordinates.
            const at=source.current(scope.pointer,scope.resource),allOf=source.current(scope.pointer+'/allOf',scope.resource);
            if(owners.isProjectionSource(scope)&&at!==undefined&&allOf===at+'/allOf'&&source.doc.dataNode(allOf))
                owners.isolateApplication(scope,source,at,'allOf',['allOf'],to);
            discardInactiveUnevaluated(context,scope,source,owners,capturedReferences);
            const nameProof=nameProofs.get(JSON.stringify([scope.resource,scope.pointer]));
            const namePointer=source.current(scope.pointer,scope.resource);
            if(nameProof!==undefined&&namePointer!==undefined)
                migrateSchemaPropertyNames(context,scope,source,namePointer,owners,issue,capturedReferences,nameProof,to);
            patternsFor(context).discardInactive(scope,source);
        }
    }
    for(const scope of scopes){
        const material=owners.materialLocations(scope);if(!material.length)continue;
        const {source,location:{pointer}}=owners.uniqueLocation(scope);
        const original=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!,value=original.value;
        if(typeof value==='boolean'){
            if(!modernFamily(to))booleans.lower(scope,source,pointer,value);
            continue;
        }
        if(!value||typeof value!=='object'||Array.isArray(value))continue;
        const context=owners.contextOf(scope);
        if(!context){issue(scope,'migration.schema.context','Schema conversion requires its captured entry, role and resource context','implementation');continue;}
        const field=(name:string)=>({...scope,pointer:scope.pointer+'/'+escape(name)});
        if(from==='2.0'&&to!=='2.0'&&Array.isArray(value.type)&&value.type.includes('file'))
            issue(field('type'),'migration.schema.file-union','This Swagger file/data union needs occurrence-specific alternative schemas and media decoding before conversion','implementation');
        const typeComposition=(types:string[])=>{
            const branches=types.map(type=>type==='null'?{type:'string',nullable:true,enum:[null]}:type==='array'?{type,items:{}}:{type});
            source.remove(pointer+'/type');
            if(source.doc.dataNode(pointer+'/anyOf')){
                if(!source.doc.dataNode(pointer+'/allOf'))source.set(pointer+'/allOf',[]);
                const index=source.doc.dataNode(pointer+'/allOf').children.size;source.set(pointer+'/allOf/'+index,{});source.move(pointer+'/anyOf',pointer+'/allOf/'+index+'/anyOf');
            }
            source.set(pointer+'/anyOf',branches);
        };
        if(!modernFamily(to)&&Object.hasOwn(value,'$schema'))source.remove(pointer+'/$schema');
        if(!modernFamily(to)&&Array.isArray(value.required)&&value.required.length===0)source.remove(pointer+'/required');
        if(modernFamily(from)&&!modernFamily(to)){
            // Static resource/anchor addresses have already been resolved by
            // the captured graph. Reference repair below maps their physical
            // owners before the target is evaluated without modern identities.
            for(const name of ['$id','$anchor'])source.remove(pointer+'/'+name);
            for(const keyword of schemaDefinitionKeywords)if(source.doc.dataNode(pointer+'/'+keyword)){
                for(const name of [...source.doc.dataNode(pointer+'/'+keyword).children.keys()]){
                    const at=pointer+'/'+keyword+'/'+escape(name);
                    owners.move({...scope,pointer:scope.pointer+'/'+keyword+'/'+escape(name)},source,at,'definition',{context,layout:'array-item'});
                }
                source.remove(pointer+'/'+keyword);
            }
        }
        let unevaluatedTail:string|undefined;
        if(modernFamily(from)&&!modernFamily(to)){
            references.lower(scope,source,pointer,issue);
            unevaluatedTail=migrateSchemaUnevaluated(context,scope,source,pointer,owners,capturedReferences);
            evaluatedFor(context).lower(scope,source,pointer,to,apply=>projections.push(apply));
            evaluatedItemsFor(context).lower(scope,source,pointer,to,apply=>projections.push(apply));
            migrateDependentRequired(context,scope,source,pointer,to,requirementsFor(context),issue,owners);
            migrateDependentSchemas(context,scope,source,pointer,to,requirementsFor(context),issue,owners,capturedReferences,sources,projection=>projections.push(projection));
            migrateSchemaConditions(context,scope,source,pointer,to,owners,issue,capturedReferences,sources,projection=>projections.push(projection));
            migrateSchemaPropertyNames(context,scope,source,pointer,owners,issue,capturedReferences,nameProofs.get(JSON.stringify([scope.resource,scope.pointer])),to);
            patternsFor(context).lower(scope,source,pointer,to);
            migrateConstantContains(context,scope,source,pointer,owners,capturedReferences);
            migrateSchemaContains(context,scope,source,pointer,to,owners,boundsFor(context));
            migrateSchemaStringComplement(context,scope,source,pointer,owners,to);
            if(to==='2.0')migrateArrayAlternatives(context,scope,source,pointer,owners,capturedReferences);
        }
        if(!modernFamily(to)&&Object.hasOwn(value,'$dynamicAnchor')){
            if(!references.requiresDynamicAnchor(scope))source.remove(pointer+'/$dynamicAnchor');
            else issue(field('$dynamicAnchor'),'migration.schema.dynamic-anchor','A captured dynamic reference can select this anchor; older-family scope specialization remains required','implementation');
        }
        const pending:Readonly<Record<string,string>>={
            patternProperties:'No captured finite name domain, universal selector or equivalent uniform value proof establishes this pattern mapping; this is not a proof of target impossibility',
            contains:'No exact structural match-count, supported existential/complement or exhaustive finite-language certificate establishes this containment mapping',
            minContains:'No exact matching-item lower-count certificate is available; arbitrary array lengths cannot be truncated',
            maxContains:'No exact matching-item upper-count certificate is available; arbitrary array lengths cannot be truncated',
            unevaluatedItems:'The captured successful-applicator graph has no supported item-selection certificate (including positional or dynamic contributions)',
            unevaluatedProperties:'The captured successful-applicator graph has no supported name-selection certificate; referenced, recursive or dynamically selected coverage cannot be guessed',
            propertyNames:'No annotation-free string-domain, finite regex-language or closed-property-domain certificate preserves this name assertion and its applicable annotations',
            contentSchema:'The older Schema Object vocabulary has no decoded-content-schema annotation; retaining an independent schema does not preserve its active decoded-content binding',
            contentEncoding:'The content encoding annotation has no proved mapping at every captured occurrence',
            contentMediaType:'The decoded media annotation has no proved binding at every captured occurrence',
        };
        if(!modernFamily(to))for(const [name,message]of Object.entries(pending))
            if(Object.hasOwn(value,name)&&source.doc.dataNode(pointer+'/'+name))issue(field(name),'migration.schema.'+name,message+' for '+to,
                name==='contentSchema'||name==='contentEncoding'&&value.contentEncoding!=='base64'?'target-representation':'implementation');
        if(!modernFamily(to)){
            migrateSchemaTuple(context,scope,source,pointer,to,owners,issue,boundsFor(context),unevaluatedTail);
        }
        migrateInactiveSchemaAnnotations(graph,scope,source,sources,to,owners);
        if(to==='2.0'&&value.writeOnly===true&&!graph.referenceObject(value,scope)&&source.doc.dataNode(pointer+'/writeOnly'))
            issue(field('writeOnly'),'migration.schema.write-only','Swagger 2.0 has no standard writeOnly annotation; directional required-list specialization cannot preserve this active annotation','target-representation');
        if(to==='2.0')for(const name of ['oneOf','anyOf','not','deprecated'])if(Object.hasOwn(value,name)&&source.doc.dataNode(pointer+'/'+name))issue(field(name),'migration.schema.keyword','This Schema Object field requires an explicit faithful Swagger mapping','implementation');
        if(!modernFamily(from)&&modernFamily(to)){
            if(from==='3.0'){
                if(value.nullable===true&&typeof value.type==='string')source.set(pointer+'/type',[value.type,'null']);
                if(Object.hasOwn(value,'nullable'))source.remove(pointer+'/nullable');
            }
            for(const [exclusive,bound]of [['exclusiveMinimum','minimum'],['exclusiveMaximum','maximum']]){
                if(value[exclusive]===true){
                    source.exact(pointer+'/'+exclusive,source.doc.dataJson(pointer+'/'+bound));
                    source.remove(pointer+'/'+bound);
                }
                else if(Object.hasOwn(value,exclusive))source.remove(pointer+'/'+exclusive);
            }
        }
        if(modernFamily(from)&&!modernFamily(to)){
            if(Object.hasOwn(value,'nullable')&&issue(field('nullable'),'migration.schema.annotation-activation','The target would activate the nonstandard nullable annotation; explicitly discard it or revise the source','decision',['discard-unrecognized-schema-keyword']))source.remove(pointer+'/nullable');
            for(const [exclusive,bound]of [['exclusiveMinimum','minimum'],['exclusiveMaximum','maximum']])if(typeof value[exclusive]==='number'){
                if(Object.hasOwn(value,bound)){
                    const comparison=compare(decimal(source.doc.dataJson(pointer+'/'+exclusive)),decimal(source.doc.dataJson(pointer+'/'+bound)));
                    const strict=exclusive==='exclusiveMinimum'?comparison>=0:comparison<=0;
                    if(strict)source.exact(pointer+'/'+bound,source.doc.dataJson(pointer+'/'+exclusive));
                    source.set(pointer+'/'+exclusive,strict);continue;
                }
                source.exact(pointer+'/'+bound,source.doc.dataJson(pointer+'/'+exclusive));source.set(pointer+'/'+exclusive,true);
            }
            if(Array.isArray(value.type)&&to==='3.0'){
                const types=value.type.filter((type:string)=>type!=='null');
                if(types.length===1&&value.type.includes('null')){source.set(pointer+'/type',types[0]);source.set(pointer+'/nullable',true);}
                else typeComposition(value.type);
            }
            if(value.type==='null'&&to==='3.0')typeComposition(['null']);
            if(to==='3.0'&&source.doc.dataNode(pointer)?.value?.type==='array'&&!source.doc.dataNode(pointer+'/items'))
                source.set(pointer+'/items',{});
            if(Object.hasOwn(value,'const')){
                if(Object.hasOwn(value,'enum')){
                    if(!source.doc.dataNode(pointer+'/allOf'))source.set(pointer+'/allOf',[]);
                    const branch=pointer+'/allOf/'+source.doc.dataNode(pointer+'/allOf').children.size;
                    source.set(branch,{});source.move(pointer+'/const',branch+'/enum');source.exact(branch+'/enum','['+graph.docs.get(scope.resource)!.dataJson(scope.pointer+'/const')+']');
                }
                else source.rename(pointer+'/const','enum'),source.exact(pointer+'/enum','['+graph.docs.get(scope.resource)!.dataJson(scope.pointer+'/const')+']');
            }
            if(typeof value.$ref==='string'&&Object.keys(value).length>1){
                source.ensure(pointer+'/allOf');
                // Existing allOf must remain an array; otherwise source is invalid.
                const existing=source.doc.dataNode(pointer+'/allOf');
                if(existing?.kind==='object'&&existing.children.size===0)source.set(pointer+'/allOf',[]);
                const index=source.doc.dataNode(pointer+'/allOf').children.size;
                source.set(pointer+'/allOf/'+index,{});source.move(pointer+'/$ref',pointer+'/allOf/'+index+'/$ref');
            }
        }
        if(from==='2.0'&&to==='3.0'){
            if(Array.isArray(value.type)||value.type==='null')typeComposition(Array.isArray(value.type)?value.type:['null']);
            if(value.type==='array'&&!Object.hasOwn(value,'items'))source.set(pointer+'/items',{});
            if(value.type==='file'){source.set(pointer+'/type','string');source.set(pointer+'/format','binary');}
        }
        if(from==='2.0'&&modernFamily(to)&&Array.isArray(value.items)){
            // Draft 4 tuple items do not constrain the tail. 2020-12 prefixItems
            // has the same assertion/annotation scope, including short arrays.
            // An empty tuple is a no-op; prefixItems itself must be nonempty.
            if(value.items.length)source.rename(pointer+'/items','prefixItems');
            else source.remove(pointer+'/items');
        }
        if(from==='3.0'&&to==='2.0'){
            if(value.nullable===true&&typeof value.type==='string')source.set(pointer+'/type',[value.type,'null']);
            if(Object.hasOwn(value,'nullable'))source.remove(pointer+'/nullable');
        }
    }
    // Projections may copy external fixed targets whose lexical coordinates
    // sort before or after the consumer. Finish every captured schema first.
    for(const project of projections)project();
}
