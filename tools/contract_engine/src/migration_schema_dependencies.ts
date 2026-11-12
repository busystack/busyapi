import {escape} from './document';
import type {GraphScope,GraphReference,ReferenceGraph} from './reference_graph';
import type {MigrationIssue} from './migration_schema';
import type {SourcePlan} from './source_plan';
import type {MigrationPropertyPresence} from './migration_property_presence';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {constantSchemaAssertion} from './schema_constant_assertions';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {discardInactiveMigrationSchema} from './migration_schema_conditions';
import {restrictedBooleanSchema} from './migration_schema_values';
import {schemaGuardProjection,deferGuardProjection,guardProjectionScopes} from './migration_guard_projection';

function dependencyProjection(graph:ReferenceGraph,scope:GraphScope,trigger:string,requirements:MigrationPropertyPresence,
    proofs=new MigrationSchemaProofs(graph)){
    const schema=graph.scopeAs(scope.resource,scope.pointer+'/dependentSchemas/'+escape(trigger),'schema');
    const context={unconditional:(name:string)=>requirements.unconditional(scope,name),
        present:(name:string)=>name===trigger||requirements.requires(scope,name),absent:(name:string)=>requirements.absent(scope,name),assumptions:[scope]};
    return schema?(requirements.requires(scope,trigger)?schemaGuardProjection(graph,schema,{domains:new Set(['object']),...context},proofs):undefined)??
        schemaGuardProjection(graph,schema,{property:trigger,...context},proofs):undefined;
}
export function dependencyProjectionScopes(graph:ReferenceGraph,scope:GraphScope,requirements:MigrationPropertyPresence):readonly GraphScope[]{
    const node=graph.docs.get(scope.resource)!.dataNode(scope.pointer+'/dependentSchemas');
    if(node?.kind!=='object')return [];
    const proofs=new MigrationSchemaProofs(graph);
    return [...node.children.keys()].flatMap(trigger=>{
        const projection=dependencyProjection(graph,scope,trigger,requirements,proofs);
        return projection?guardProjectionScopes(graph,projection):[];
    });
}

/** Prefer the native conjunction when every property dependency already has
 * a captured presence/absence proof. Whole-instance enum folding would encode
 * the body's type in a form that cannot subsequently shed an outer guard. */
export function nativeSchemaDependencies(graph:ReferenceGraph,scope:GraphScope,requirements:MigrationPropertyPresence):boolean {
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(!value||typeof value!=='object'||!['dependentRequired','dependentSchemas'].some(field=>Object.hasOwn(value,field))||
        ['if','then','else'].some(field=>Object.hasOwn(value,field)))return false;
    for(const field of ['dependentRequired','dependentSchemas'])if(Object.hasOwn(value,field)&&
        (!value[field]||typeof value[field]!=='object'||Array.isArray(value[field])))return false;
    const properties=Object.entries(value.dependentRequired??{}).every(([trigger,names])=>Array.isArray(names)&&
        (requirements.absent(scope,trigger)||requirements.requires(scope,trigger)||requirements.forbidden(scope,trigger)||
            names.every(name=>typeof name==='string'&&(name===trigger||requirements.unconditional(scope,name)))));
    // A required trigger on an object-only body uses the existing direct
    // dependent-schema conjunction, including its annotations. Its children
    // still undergo their ordinary vocabulary conversion independently.
    const schemas=Object.keys(value.dependentSchemas??{}).every(trigger=>requirements.absent(scope,trigger)||
        requirements.forbidden(scope,trigger)||requirements.objectOnly(scope)&&requirements.requires(scope,trigger));
    return properties&&schemas;
}

/** An impossible trigger does not evaluate its schema, including annotations.
 * Retain only its independently entered schema closure before child vocabulary
 * conversion, using the same retirement primitive as inactive conditions. */
export function discardInactiveSchemaDependencies(graph:ReferenceGraph,scope:GraphScope,source:SourcePlan,
    requirements:MigrationPropertyPresence,owners:MigrationSchemaOwners,references:readonly GraphReference[],target:string):void {
    const node=graph.docs.get(scope.resource)!.dataNode(scope.pointer+'/dependentSchemas');
    if(node?.kind!=='object')return;
    for(const name of node.children.keys()){
        const origin={resource:scope.resource,pointer:scope.pointer+'/dependentSchemas/'+escape(name)};
        if(requirements.absent(scope,name))discardInactiveMigrationSchema(graph,origin,source,owners,references);
        else if(target==='2.0'&&requirements.forbidden(scope,name)){
            discardInactiveMigrationSchema(graph,origin,source,owners,references);
            const retained=source.current(origin.pointer,scope.resource);
            if(retained!==undefined)owners.move(origin,source,retained,'forbidden_dependency',{context:graph,layout:'array-item'});
            const parent=source.current(scope.pointer,scope.resource);
            if(parent!==undefined){owners.admit(source);source.set(parent+'/dependentSchemas/'+escape(name),restrictedBooleanSchema(false,target));}
        }
    }
}

/** Validation 2020-12 6.5.4: presence implies required properties, regardless
 * of the triggering value. OAS 3.0's anyOf/not/required express the same rule.
 * Move each original array through the CST so its values and comments survive. */
export function migrateDependentRequired(graph:ReferenceGraph,scope:GraphScope,source:SourcePlan,pointer:string,target:string,requirements:MigrationPropertyPresence,issue:MigrationIssue,owners:MigrationSchemaOwners):void {
    const doc=graph.docs.get(scope.resource)!,original=scope.pointer+'/dependentRequired',node=doc.dataNode(original);
    if(!node||!source.doc.dataNode(pointer+'/dependentRequired'))return;
    // This map's independent schema role has unknown keywords, rather than
    // the dependency assertions attached to its containing Schema Object.
    const independent=graph.scopeAs(scope.resource,original,'schema');
    if(independent&&graph.isEntryUse(independent)){
        issue({...scope,pointer:original},'migration.schema.dependency-shared-role','The dependency map is also used as a Schema Object and needs a separate faithful representation','implementation');return;
    }
    if(node.kind!=='object'){
        issue({...scope,pointer:original},'migration.schema.dependent-required','Expected a captured dependentRequired map before conversion','source-incomplete');return;
    }
    const required=new Set<string>();
    for(const item of doc.dataNode(scope.pointer+'/required')?.children.values()??[])if(typeof item.value==='string')required.add(item.value);
    const dependencies=new Map<string,string[]>(),entries:{trigger:string;pointer:string;tautology:boolean}[]=[];
    for(const [trigger,array]of node.children){
        const values:string[]=[];
        if(array.kind!=='array'){
            issue({...scope,pointer:original+'/'+escape(trigger)},'migration.schema.dependent-required','Expected a captured property-name array before conversion','source-incomplete');return;
        }
        for(const item of array.children.values()){
            if(typeof item.value!=='string'){
                issue({...scope,pointer:item.pointer},'migration.schema.dependent-required','Expected a captured property name before conversion','source-incomplete');return;
            }
            values.push(item.value);
        }
        const at=original+'/'+escape(trigger);
        if(source.current(at,scope.resource)===undefined){issue({...scope,pointer:at},'migration.schema.dependency-owner','The dependency array has no unique surviving planning owner','implementation');return;}
        dependencies.set(trigger,values);
        entries.push({trigger,pointer:at,tautology:requirements.absent(scope,trigger)||values.every(value=>value===trigger||requirements.unconditional(scope,value))});
        if(target==='2.0'&&!required.has(trigger)&&requirements.requires(scope,trigger))required.add(trigger);
    }
    // Required seeds activate transitive and cyclic dependencies by presence.
    const queue=[...required];
    for(let index=0;index<queue.length;index++)for(const name of dependencies.get(queue[index])??[])
        if(!required.has(name)){required.add(name);queue.push(name);}
    const active=entries.filter(entry=>!entry.tautology);
    const forbidden=new Set(target==='2.0'?active.filter(entry=>requirements.forbidden(scope,entry.trigger)).map(entry=>entry.trigger):[]);
    if(target==='2.0')for(const entry of active)if(!required.has(entry.trigger)&&!forbidden.has(entry.trigger)){
        issue({...scope,pointer:entry.pointer},'migration.schema.dependency-conditional',requirements.exhausted?'The captured property-presence proof exhausted its budget before establishing a faithful Swagger 2.0 mapping':'The captured property-presence proof cannot establish a faithful Swagger 2.0 mapping for this conditional dependency','implementation');return;
    }
    if(active.length){
        let collection=pointer+'/allOf';
        const branches=active.map(entry=>forbidden.has(entry.trigger)?{properties:{[entry.trigger]:restrictedBooleanSchema(false,target)}}:
            required.has(entry.trigger)?{}:{anyOf:[{not:{required:[entry.trigger]}},{}]});
        if(source.doc.dataNode(collection)){
            const branch=collection+'/'+source.doc.dataNode(collection).children.size;
            source.set(branch,{allOf:branches});collection=branch+'/allOf';
        }else source.set(collection,branches);
        for(const [index,entry]of active.entries()){
            const at=source.current(entry.pointer,scope.resource);
            if(at===undefined){issue({...scope,pointer:entry.pointer},'migration.schema.dependency-owner','The dependency array lost its planning owner','implementation');return;}
            if(forbidden.has(entry.trigger))owners.retainLiteralValue({resource:scope.resource,pointer:entry.pointer},source,at,'dependency_names');
            else source.move(at,collection+'/'+index+(required.has(entry.trigger)?'/required':'/anyOf/1/required'));
        }
    }
    const at=source.current(original,scope.resource);if(at!==undefined)source.remove(at,true,true,true);
}

/** Core 2020-12 10.2.2.4 applies each schema to the whole object only when
 * its trigger property is present. Both alternatives retain that condition,
 * keeping successful-branch annotations conditional too. required alone also
 * validates non-objects, whose assertions must remain unaffected. */
export function migrateDependentSchemas(graph:ReferenceGraph,scope:GraphScope,source:SourcePlan,pointer:string,target:string,
    requirements:MigrationPropertyPresence,issue:MigrationIssue,owners:MigrationSchemaOwners,references:readonly GraphReference[],
    sources:ReadonlyMap<string,SourcePlan>,defer:(projection:()=>void)=>void):void {
    const doc=graph.docs.get(scope.resource)!,original=scope.pointer+'/dependentSchemas',node=doc.dataNode(original);
    if(!node||!source.doc.dataNode(pointer+'/dependentSchemas'))return;
    const independent=graph.scopeAs(scope.resource,original,'schema');
    if(independent&&graph.isEntryUse(independent)){
        issue({...scope,pointer:original},'migration.schema.dependency-shared-role','The dependency map is also used as a Schema Object and needs a separate faithful representation','implementation');return;
    }
    if(node.kind!=='object'){
        issue({...scope,pointer:original},'migration.schema.dependent-schemas','Expected a captured dependentSchemas map before conversion','source-incomplete');return;
    }
    const effect=owners.isolateApplication(scope,source,pointer,'dependency',['dependentSchemas'],target);
    source=effect.source;pointer=effect.location.pointer;
    const proofs=new MigrationSchemaProofs(graph);
    const entries=[...node.children.keys()].map(trigger=>{
        const pointer=original+'/'+escape(trigger),schema=graph.scopeAs(scope.resource,pointer,'schema');
        const existing=schema?constantSchemaAssertion(graph,schema):undefined;
        const constant=existing??(schema&&proofs.validationConstant(schema)===false?false:
            schema&&proofs.annotationsCoveredByProperties(schema,new Set(Object.keys(doc.dataNode(scope.pointer)?.value?.properties??{})))&&
                proofs.implies(scope,schema)?true:undefined);
        const projection=dependencyProjection(graph,scope,trigger,requirements,proofs);
        return {trigger,pointer,schema,constant,projection,forbidden:target==='2.0'&&requirements.forbidden(scope,trigger),
            absent:requirements.absent(scope,trigger)};
    });
    const objectOnly=requirements.objectOnly(scope);
    const direct=(entry:typeof entries[number])=>entry.schema&&(
        proofs.neutralWithoutProperty(entry.schema,entry.trigger)||
        requirements.requires(scope,entry.trigger)&&(objectOnly||proofs.neutralOutside(entry.schema,new Set(['object']))));
    for(const entry of entries){
        if(entry.absent)continue;
        if(!entry.forbidden&&source.current(entry.pointer,scope.resource)===undefined){
            issue({...scope,pointer:entry.pointer},'migration.schema.dependency-owner','The dependent schema has no unique surviving planning owner','implementation');return;
        }
        if(target==='2.0'&&!entry.forbidden&&entry.constant===undefined&&!direct(entry)&&entry.projection===undefined){
            const identity=entry.schema&&proofs.conjuncts(entry.schema).find(part=>
                Object.hasOwn(graph.docs.get(part.resource)!.dataNode(part.pointer)?.value??{},'discriminator'));
            if(identity)issue({...identity,pointer:identity.pointer+'/discriminator'},'migration.proof.guard-identity',
                'No captured identity certificate establishes that this discriminator keeps the same model relationships under a guarded assertion variant','implementation');
            else issue({...scope,pointer:entry.pointer},'migration.schema.dependency-conditional',requirements.exhausted?
                'The captured property-presence proof exhausted its budget before establishing a faithful Swagger 2.0 mapping':
                'The captured presence, native-domain, guarded-composition and finite-language proofs did not establish a faithful Swagger assertion and annotation mapping for this dependency','implementation');
            return;
        }
    }
    const applied=target==='2.0'?entries.filter(entry=>(entry.forbidden||entry.constant!==true)&&!entry.absent):entries.filter(entry=>!entry.absent);
    for(const entry of entries)if(entry.absent||target==='2.0'&&entry.constant===true&&!entry.forbidden){
        const at=source.current(entry.pointer,scope.resource);
        if(at!==undefined&&at.startsWith(pointer+'/dependentSchemas/')&&owners.hasConsumers({resource:scope.resource,pointer:entry.pointer},references))
            owners.move({resource:scope.resource,pointer:entry.pointer},source,at,'inactive_dependency',{context:graph,layout:'array-item'});
    }
    if(applied.length){
        let collection=pointer+'/allOf';
        if(source.doc.dataNode(collection)){
            const branch=collection+'/'+source.doc.dataNode(collection).children.size;
            source.set(branch,{allOf:[]});collection=branch+'/allOf';
        }else source.set(collection,[]);
        for(const entry of applied){
            const at=entry.forbidden?pointer+'/dependentSchemas/'+escape(entry.trigger):source.current(entry.pointer,scope.resource);
            if(at===undefined){issue({...scope,pointer:entry.pointer},'migration.schema.dependency-owner','The dependent schema lost its planning owner','implementation');return;}
            let destination=collection+'/'+source.doc.dataNode(collection).children.size;
            if(target==='2.0'&&(entry.forbidden||entry.constant===false)){
                // A false dependency forbids the triggering property on any
                // object. Other JSON types remain unconstrained. Keep the
                // original converted false schema as that property's owner.
                source.set(destination,{properties:{}});
                destination+='/properties/'+escape(entry.trigger);
            }else if(target==='2.0'&&!direct(entry)&&entry.projection!==undefined){
                const variant=deferGuardProjection(graph,entry.projection,target,owners,sources,defer);
                owners.move(entry.schema!,source,at,'dependency_original',{context:graph,layout:'array-item'});
                source.set(destination,{$ref:owners.reference(variant,target)});continue;
            }else if(target!=='2.0'){
                source.set(destination,{anyOf:[{not:{type:'object',required:[entry.trigger]}},{type:'object',required:[entry.trigger],allOf:[]}]});
                destination+='/anyOf/1/allOf/0';
            }
            source.move(at,destination,true);
        }
    }
    const at=source.current(original,scope.resource);if(at!==undefined)source.remove(at,true,true,true);
}
