import {schemaDefinitionKeywords} from './schema_definitions';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import {MigrationSource,type MigrationLocation} from './migration_source';
import {modernFamily} from './specification';
import {escape} from './document';
import {compare,decimal} from './exact_numbers';
import {MigrationSchemaReferences} from './migration_schema_references';
import {SchemaPropertyRequirements} from './schema_property_requirements';
import {migrateDependentRequired,migrateDependentSchemas} from './migration_schema_dependencies';
import {migrateInactiveSchemaAnnotations} from './migration_inactive_annotations';
import {BooleanSchemaMigration} from './migration_boolean_schema';
import {MigrationSchemaOwners} from './migration_schema_owners';
import {discardInactiveSchemaConditions,migrateSchemaConditions} from './migration_schema_conditions';
import {migrateSchemaTuple} from './migration_schema_tuples';
import {migrateSchemaPropertyNames} from './migration_schema_property_names';
import {MigrationPatternProperties} from './migration_schema_patterns';
import {discardInactiveUnevaluated,migrateSchemaUnevaluated} from './migration_schema_unevaluated';
import {MigrationArrayBounds,migrateConstantContains,migrateArrayAlternatives} from './migration_schema_arrays';
import {migrationScopes,migrationReferences} from './migration_documents';

export type MigrationChoice=Readonly<{value:string;label:string;target:MigrationLocation&{range:readonly number[]}}>;
export type MigrationProblem={resource:string;pointer:string;range:number[];code:string;message:string;reason:'target-representation'|'implementation'|'source-incomplete'|'decision';choices?:string[];choiceDetails?:readonly MigrationChoice[];id?:string};
export type MigrationIssueLocation=MigrationLocation&{original?:MigrationLocation;decisionKey?:string};
export type MigrationIssue=(scope:MigrationIssueLocation,code:string,message:string,reason:MigrationProblem['reason'],choices?:string[],choiceDetails?:readonly MigrationChoice[])=>boolean;
export type MigrationChoose=(scope:MigrationIssueLocation,code:string,message:string,choices:readonly MigrationChoice[])=>string|undefined;

/** Normative schema mappings. No schema is evaluated under another family's
 * dialect to make a migration pass. These edits affect planning copies only. */
export function migrateSchemas(graph:ReferenceGraph,sources:Map<string,MigrationSource>,from:string,to:string,issue:MigrationIssue,contexts:readonly ReferenceGraph[]=[graph]):void {
    const references=new MigrationSchemaReferences(graph,contexts),requirements=new SchemaPropertyRequirements(graph);
    const owners=new MigrationSchemaOwners(graph,sources,undefined,[],contexts);
    const capturedReferences=[...migrationReferences(contexts)];
    const patterns=new MigrationPatternProperties(graph,owners,capturedReferences,issue);
    const booleans=new BooleanSchemaMigration(graph,sources,to,owners);
    const arrayBounds=new MigrationArrayBounds(graph);
    // Coordinated entries own their active schemas independently. A detached
    // original schema file remains literal source history after specialization;
    // parsing its identity does not authorize converting that dormant owner.
    const captured=new Map<string,GraphScope>();
    for(const scope of migrationScopes(contexts))if(scope.kind==='schema'&&scope.family===from)
        captured.set(JSON.stringify([scope.resource,scope.pointer]),scope);
    const scopes=[...captured.values()].sort((a,b)=>b.pointer.length-a.pointer.length);
    if(modernFamily(from)&&!modernFamily(to))for(const scope of [...scopes].reverse()){
        const source=sources.get(scope.resource)!;
        if(source.current(scope.pointer)!==undefined){
            const context=owners.contextOf(scope);
            if(!context){issue(scope,'migration.schema.context','Schema conversion requires its captured entry, role and resource context','implementation');continue;}
            discardInactiveSchemaConditions(context,scope,source,owners,capturedReferences);
            discardInactiveUnevaluated(context,scope,source,owners,capturedReferences);
            patterns.discardInactive(scope,source);
        }
    }
    for(const scope of scopes){
        const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);if(pointer===undefined)continue;
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
            migrateDependentRequired(graph,scope,source,pointer,to,requirements,issue);
            migrateDependentSchemas(graph,scope,source,pointer,to,requirements,issue);
            migrateSchemaConditions(context,scope,source,pointer,to,owners,issue,capturedReferences);
            migrateSchemaPropertyNames(context,scope,source,pointer,owners,issue,capturedReferences);
            patterns.lower(scope,source,pointer,to);
            migrateConstantContains(graph,scope,source,pointer,owners);
            if(to==='2.0')migrateArrayAlternatives(graph,scope,source,pointer,owners);
        }
        if(!modernFamily(to)&&Object.hasOwn(value,'$dynamicAnchor')){
            if(!references.requiresDynamicAnchor(scope))source.remove(pointer+'/$dynamicAnchor');
            else issue(field('$dynamicAnchor'),'migration.schema.dynamic-anchor','A captured dynamic reference can select this anchor; older-family scope specialization remains required','implementation');
        }
        const pending:Readonly<Record<string,string>>={
            patternProperties:'Pattern-selected property assertions need an equivalent target object constraint',
            contains:'Array containment needs a target-specific witness/count mapping',
            minContains:'The containment lower count needs an equivalent target assertion',
            maxContains:'The containment upper count needs an equivalent target assertion',
            unevaluatedItems:'This assertion depends on annotations from successful array applicators',
            unevaluatedProperties:'This assertion depends on annotations from successful object applicators',
            propertyNames:'Property-name validation needs an equivalent target object constraint',
            contentSchema:'The decoded-content schema annotation needs an independently preserved owner',
            contentEncoding:'The content encoding annotation has no proved mapping at every captured occurrence',
            contentMediaType:'The decoded media annotation has no proved binding at every captured occurrence',
        };
        if(!modernFamily(to))for(const [name,message]of Object.entries(pending))
            if(Object.hasOwn(value,name)&&source.doc.dataNode(pointer+'/'+name))issue(field(name),'migration.schema.'+name,message+' for '+to,'implementation');
        if(!modernFamily(to))migrateSchemaTuple(graph,scope,source,pointer,to,owners,issue,arrayBounds,unevaluatedTail);
        migrateInactiveSchemaAnnotations(graph,scope,source,sources,to,owners);
        if(to==='2.0')for(const name of ['oneOf','anyOf','not','writeOnly','deprecated'])if(Object.hasOwn(value,name)&&source.doc.dataNode(pointer+'/'+name))issue(field(name),'migration.schema.keyword','This Schema Object field requires an explicit faithful Swagger mapping','implementation');
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
            if(Array.isArray(value.items)){
                if(value.items.length===0)source.set(pointer+'/items',{});
                else issue(field('items'),'migration.schema.tuple','OpenAPI 3.0 cannot express Swagger positional tuple schemas','target-representation');
            }
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
}
