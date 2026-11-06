import {SourceError} from './document';
import {supportedSchemaDialect,type GraphScope,type ReferenceGraph} from './reference_graph';
import type {MigrationSource,MigrationLocation} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {restrictedBooleanSchema} from './migration_schema_values';
import {MigrationPropertyPresence} from './migration_property_presence';

type GuardPolicy=Readonly<{domains?:ReadonlySet<string>;property?:string;conditionalPresence?:boolean;
    unconditional?:(name:string)=>boolean}>;
export type GuardProjection=Readonly<{scope:GraphScope;removed:readonly string[];
    discarded:readonly Readonly<{scope:GraphScope;domain:string}>[];
    types:readonly Readonly<{field:string;value:readonly string[]}>[];
    forbidden:readonly Readonly<{scope:GraphScope;name:string}>[];
    references:readonly Readonly<{field:string;target:GuardProjection}>[]}>;
const atoms=['null','boolean','object','array','integer','fraction','string'];
const expand=(names:readonly string[])=>new Set(names.flatMap(name=>name==='number'?['integer','fraction']:[name]));
const nativeDomain=(field:string)=>
    ['required','properties','additionalProperties','minProperties','maxProperties','dependentRequired','dependentSchemas'].includes(field)?'object':
    ['items','prefixItems','minItems','maxItems','uniqueItems'].includes(field)?'array':
    ['minLength','maxLength','pattern'].includes(field)?'string':
    ['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf'].includes(field)?'number':undefined;
const domainFields:Readonly<Record<string,readonly string[]>>={
    object:['required','properties','additionalProperties','minProperties','maxProperties','dependentRequired','dependentSchemas'],
    array:['items','prefixItems','minItems','maxItems','uniqueItems'],string:['minLength','maxLength','pattern'],
    number:['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf'],
};

/** Project a schema under a captured native-domain or property-presence guard.
 * Native assertions keep their native applicability and child annotations.
 * Root metadata cannot acquire new instance locations. Referenced bodies keep
 * neutral owners; only positively proved fixed bindings receive variants. */
export function schemaGuardProjection(graph:ReferenceGraph,scope:GraphScope,policy:GuardPolicy,
    proofs=new MigrationSchemaProofs(graph),seen=new Set<string>()):GuardProjection|undefined {
    const id=JSON.stringify([scope.resource,scope.pointer]);if(seen.size>=128||seen.has(id)||!supportedSchemaDialect(scope))return;
    if(proofs.sameInstanceDiscriminator(scope))return;
    const next=new Set(seen).add(id),value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    const removed:string[]=[],discarded:{scope:GraphScope;domain:string}[]=[],types:{field:string;value:string[]}[]=[],forbidden:{scope:GraphScope;name:string}[]=[],
        references:{field:string;target:GuardProjection}[]=[];
    if(value===true)return {scope,removed,discarded,types,forbidden,references};
    if(!value||typeof value!=='object'||Array.isArray(value))return;
    if(policy.domains&&!policy.unconditional){
        const presence=new MigrationPropertyPresence(graph);
        policy={...policy,unconditional:name=>presence.requires(scope,name)};
    }
    for(const field of graph.referenceObject(value,scope)?['$ref']:Object.keys(value)){
        if(['$id','$schema','$anchor','$dynamicAnchor'].includes(field))continue;
        if(field==='type'){
            const names=typeof value.type==='string'?[value.type]:value.type;
            if(!Array.isArray(names))return;
            const fieldAt=scope.pointer+'/type';
            if(policy.domains){
                const active=expand([...policy.domains]),allowed=expand(names);
                const accepted=new Set(atoms.filter(type=>!active.has(type)||allowed.has(type)));
                if(accepted.has('fraction')&&!accepted.has('integer'))return;
                const result=atoms.filter(type=>accepted.has(type)&&type!=='fraction'&&!(type==='integer'&&accepted.has('fraction')));
                if(accepted.has('fraction'))result.push('number');
                if(accepted.size===atoms.length)removed.push(fieldAt);else types.push({field:fieldAt,value:result});
            }else if(policy.conditionalPresence){
                types.push({field:fieldAt,value:[...new Set([...names,'object'])]});
                if(!names.includes('object'))forbidden.push({scope,name:policy.property!});
            }else {
                if(!names.includes('object'))return;
                removed.push(fieldAt);
            }
        }else if(field==='allOf'){
            for(let index=0;index<value.allOf.length;index++){
                const child=graph.scopeAs(scope.resource,scope.pointer+'/allOf/'+index,'schema');
                const plan=child&&schemaGuardProjection(graph,child,policy,proofs,next);
                if(!plan)return;
                removed.push(...plan.removed);discarded.push(...plan.discarded);types.push(...plan.types);forbidden.push(...plan.forbidden);references.push(...plan.references);
            }
        }else if(['$ref','$dynamicRef'].includes(field)){
            const target=proofs.fixed(scope,field),plan=target&&schemaGuardProjection(graph,target,policy,proofs,next);
            if(!plan)return;references.push({field:scope.pointer+'/'+field,target:plan});
        }else if(policy.domains){
            const domain=nativeDomain(field);if(!domain)return;
            if(!policy.domains.has(domain))discarded.push({scope,domain});
            else if(field==='dependentSchemas'){
                // A required trigger applies its schema to every object in
                // this branch. Project that same-instance child too: removing
                // only the outer type would leave a nested object assertion
                // rejecting the non-objects on which the branch never ran.
                const presence=new MigrationPropertyPresence(graph);
                for(const name of Object.keys(value.dependentSchemas)){
                    if(!presence.requires(scope,name)&&!policy.unconditional?.(name))return;
                    const pointer=scope.pointer+'/dependentSchemas/'+name.replace(/~/g,'~0').replace(/\//g,'~1');
                    const child=graph.scopeAs(scope.resource,pointer,'schema');
                    const plan=child&&schemaGuardProjection(graph,child,policy,proofs,next);
                    if(!plan)return;
                    removed.push(...plan.removed);discarded.push(...plan.discarded);types.push(...plan.types);
                    forbidden.push(...plan.forbidden);references.push(...plan.references);
                }
            }
        }else if(field==='properties'){
            if(Object.keys(value.properties).some(name=>name!==policy.property))return;
        }else if(field==='required'){
            if(!value.required.every((name:string)=>name===policy.property||policy.unconditional?.(name)))return;
            if(value.required.length)removed.push(scope.pointer+'/required');
        }else if(nativeDomain(field)&&nativeDomain(field)!=='object'){
            // required succeeds for non-objects too. A conditional-presence
            // branch still applies there; a dependency branch never does.
            if(!policy.conditionalPresence)discarded.push({scope,domain:nativeDomain(field)!});
        }else return;
    }
    return {scope,removed,discarded,types,forbidden,references};
}

/** The allocator owns both the stable use and each assertion variant. Delay
 * copying until every captured body has undergone ordinary vocabulary lowering,
 * including external bodies whose lexical coordinates sort after the consumer. */
export function deferGuardProjection(graph:ReferenceGraph,plan:GuardProjection,target:string,owners:MigrationSchemaOwners,
    sources:ReadonlyMap<string,MigrationSource>,defer:(projection:()=>void)=>void):MigrationLocation {
    const slot=owners.reserve(plan.scope,'guard_projection_use');owners.admit(slot.source);slot.source.set(slot.location.pointer,{});
    defer(()=>{
        const project=(plan:GuardProjection):MigrationLocation=>{
            const material=owners.uniqueLocation(plan.scope),input=material.source,current=material.location.pointer;
            const range=graph.docs.get(plan.scope.resource)!.dataNode(plan.scope.pointer)!.range;
            const suffix=(original:string)=>{
                const locations=plan.scope.resource===input.original.id?input.origins.get(original):input.foreignOrigins.get(plan.scope.resource+'#'+original);
                const fields=[...locations??[]].filter(field=>field===current||field.startsWith(current+'/'));
                if(fields.length!==1)
                    throw new SourceError('migration.schema.guard-owner','A guarded field has no unique local planning owner',range,'unsupported',{...plan.scope,range});
                return fields[0].slice(current.length);
            };
            const removed=plan.removed.map(suffix),types=plan.types.map(value=>({...value,suffix:suffix(value.field)})),
                forbidden=plan.forbidden.map(value=>({...value,suffix:suffix(value.scope.pointer)})),
                discarded=plan.discarded.map(value=>({...value,suffix:suffix(value.scope.pointer)}));
            const compatible=(pointer:string):boolean=>{
                const value=input.doc.dataNode(pointer)?.value;
                if(!value||typeof value!=='object'||Array.isArray(value))return false;
                if(['enum','const','not','anyOf','oneOf'].some(field=>Object.hasOwn(value,field)))return false;
                return (value.allOf??[]).every((_:unknown,index:number)=>compatible(pointer+'/allOf/'+index));
            };
            if(!compatible(current))throw new SourceError('migration.proof.guard-lowering',
                'This guarded body acquired a logical or finite-domain representation that needs a further applicability proof before projection',
                range,'unsupported',{...plan.scope,range});
            const projected=plan.references.map(reference=>({field:reference.field,target:project(reference.target)}));
            const variant=owners.assertionVariant(graph,plan.scope,input,current,'guard_projection',target,removed),output=sources.get(variant.resource)!;
            for(const value of types){owners.admit(output);output.set(variant.pointer+value.suffix,value.value);}
            const strip=(pointer:string,domain:string)=>{
                for(const field of domainFields[domain])if(output.doc.dataNode(pointer+'/'+field)){
                    owners.admit(output);output.remove(pointer+'/'+field,true,true,true);
                }
                for(const index of [...output.doc.dataNode(pointer+'/allOf')?.children.keys()??[]])strip(pointer+'/allOf/'+index,domain);
            };
            const stripped=new Set<string>();
            for(const value of discarded){
                const id=JSON.stringify([value.suffix,value.domain]);if(stripped.has(id))continue;stripped.add(id);
                strip(variant.pointer+value.suffix,value.domain);
            }
            for(const value of forbidden){
                const collection=variant.pointer+value.suffix+'/allOf';owners.admit(output,2);
                if(!output.doc.dataNode(collection))output.set(collection,[]);
                output.set(collection+'/'+output.doc.dataNode(collection).children.size,{properties:{[value.name]:restrictedBooleanSchema(false,target)}});
            }
            for(const reference of projected)owners.replaceAssertionReference(variant,{resource:plan.scope.resource,pointer:reference.field},reference.target,target);
            return variant;
        };
        const variant=project(plan);owners.admit(slot.source);slot.source.set(slot.location.pointer,{$ref:owners.reference(variant,target)});
    });
    return slot.location;
}
