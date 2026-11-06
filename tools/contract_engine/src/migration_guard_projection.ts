import {SourceError} from './document';
import {supportedSchemaDialect,type GraphScope,type ReferenceGraph} from './reference_graph';
import type {MigrationSource,MigrationLocation} from './migration_source';
import type {MigrationSchemaOwners,MigrationApplicationKind} from './migration_schema_owners';
import {MigrationSchemaProofs,migrationExactValueIdentity} from './migration_schema_proofs';
import {restrictedBooleanSchema} from './migration_schema_values';
import {MigrationPropertyPresence} from './migration_property_presence';
import {capturedConditionalPlan} from './migration_schema_conditions';

type GuardPolicy=Readonly<{domains?:ReadonlySet<string>;property?:string;conditionalPresence?:boolean;
    unconditional?:(name:string)=>boolean;present?:(name:string)=>boolean;absent?:(name:string)=>boolean;assumptions?:readonly GraphScope[]}>;
type GuardApplication=Readonly<{scope:GraphScope;kind:MigrationApplicationKind;parts:readonly GuardProjection[];
    literal?:Readonly<{value:Record<string,unknown>;exact?:Readonly<{field:string;raw:string}>}>}>;
export type GuardProjection=Readonly<{scope:GraphScope;policy:GuardPolicy;removed:readonly string[];
    applications:readonly GuardApplication[];inert:readonly string[];finite:readonly Readonly<{field:string;raw:string}>[];terminal?:Record<string,unknown>;
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

/** Intersections describe where an application runs, not assertions inferred
 * from its body. required's non-object success is kept separate from a
 * dependency's object-only property trigger. The disjoint pieces apply once
 * per instance, so conjunction preserves successful annotations too. */
function intersectGuards(a:GuardPolicy,b:GuardPolicy):readonly GuardPolicy[]|undefined {
    const unconditional=(name:string)=>!!a.unconditional?.(name)||!!b.unconditional?.(name);
    const present=(name:string)=>!!a.present?.(name)||!!b.present?.(name);
    const absent=(name:string)=>!!a.absent?.(name)||!!b.absent?.(name);
    const assumptions=[...a.assumptions??[],...b.assumptions??[]];
    if(a.domains&&b.domains)return [{domains:new Set([...a.domains].filter(name=>b.domains!.has(name))),unconditional,present,absent,assumptions}];
    if(a.domains||b.domains){
        const domain=a.domains?a:b,property=a.domains?b:a,parts:GuardPolicy[]=[];
        if(domain.domains!.has('object'))parts.push({...property,conditionalPresence:false,unconditional,present,absent,assumptions});
        if(property.conditionalPresence){
            const domains=new Set([...domain.domains!].filter(name=>name!=='object'));
            if(domains.size)parts.push({domains,unconditional,present,absent,assumptions});
        }
        return parts;
    }
    if(a.property===b.property)return [{property:a.property,conditionalPresence:!!a.conditionalPresence&&!!b.conditionalPresence,unconditional,present,absent,assumptions}];
    // Multiple optional trigger properties require a further presence proof;
    // their conjunction must not be silently replaced by either trigger.
    if(a.property&&b.unconditional?.(a.property))return [b];
    if(b.property&&a.unconditional?.(b.property))return [a];
}
function guardFailure(policy:GuardPolicy):Record<string,unknown>|undefined {
    if(!policy.domains)return {...(policy.conditionalPresence?{type:'object'}:{}),
        properties:{[policy.property!]:restrictedBooleanSchema(false,'2.0')}};
    const active=expand([...policy.domains]),allowed=new Set(atoms.filter(type=>!active.has(type)));
    if(allowed.has('fraction')&&!allowed.has('integer'))return;
    const types=atoms.filter(type=>allowed.has(type)&&type!=='fraction'&&!(type==='integer'&&allowed.has('fraction')));
    if(allowed.has('fraction'))types.push('number');
    return types.length?{type:types}:restrictedBooleanSchema(false,'2.0');
}
function projectedType(names:readonly string[],policy:GuardPolicy):readonly string[]|undefined {
    if(!policy.domains)return policy.conditionalPresence?[...new Set([...names,'object'])]:names.includes('object')?['null','boolean','object','array','number','string']:undefined;
    const active=expand([...policy.domains]),allowed=expand(names);
    const accepted=new Set(atoms.filter(type=>!active.has(type)||allowed.has(type)));
    if(accepted.has('fraction')&&!accepted.has('integer'))return;
    const result=atoms.filter(type=>accepted.has(type)&&type!=='fraction'&&!(type==='integer'&&accepted.has('fraction')));
    if(accepted.has('fraction'))result.push('number');return result;
}
function projectLiteral(value:Record<string,unknown>,policy:GuardPolicy):Record<string,unknown>|undefined {
    const result:Record<string,unknown>={};
    if(Object.hasOwn(value,'allOf'))return;
    for(const [field,body]of Object.entries(value)){
        if(field==='type'){
            const types=projectedType(typeof body==='string'?[body]:body as string[],policy);if(!types)return;
            result.type=types;
        }else{
            const domain=nativeDomain(field);if(!domain)return;
            if(policy.domains){if(policy.domains.has(domain))result[field]=body;}
            else if(domain!=='object')continue;
            else if(field==='properties'&&Object.keys(body as object).every(name=>name===policy.property))result[field]=body;
            else return;
        }
    }
    return result;
}

/** Exhaustive Cartesian factoring, not sampling: each distinct tuple of
 * exact property values/presence must occur in the captured enum. Correlated
 * finite object languages retain an unavailable-factorization refusal. */
function finiteObjectAssertion(graph:ReferenceGraph,scope:GraphScope,field:string):string|undefined {
    const doc=graph.docs.get(scope.resource)!,node=doc.dataNode(scope.pointer+'/'+field)!;
    const objects=(field==='const'?[node]:[...node.children.values()]).filter(node=>node.kind==='object');
    if(!objects.length)return JSON.stringify({type:['null','boolean','array','number','string']});
    const identity=(pointer:string)=>migrationExactValueIdentity(doc,pointer);
    const names=[...new Set(objects.flatMap(node=>[...node.children.keys()]))].sort(),domains=new Map<string,Map<string|undefined,string|undefined>>();
    let products=1;
    for(const name of names){
        const values=new Map(objects.map(node=>{const child=node.children.get(name);return child?[identity(child.pointer),doc.dataJson(child.pointer)] as const:[undefined,undefined] as const;}));
        products*=values.size;if(products>2048)return;domains.set(name,values);
    }
    const tuples=new Set(objects.map(node=>JSON.stringify(names.map(name=>{const child=node.children.get(name);return child?identity(child.pointer):undefined;}))));
    if(tuples.size!==products)return;
    const required=names.filter(name=>!domains.get(name)!.has(undefined));
    const properties=names.map(name=>JSON.stringify(name)+':{"enum":['+[...domains.get(name)!.values()].filter((value):value is string=>value!==undefined).join(',')+']}');
    return '{"additionalProperties":false,"properties":{'+properties.join(',')+'}'+(required.length?',"required":'+JSON.stringify(required):'')+'}';
}

/** Project a schema under a captured native-domain or property-presence guard.
 * Native assertions keep their native applicability and child annotations.
 * Root metadata cannot acquire new instance locations. Referenced bodies keep
 * neutral owners; only positively proved fixed bindings receive variants. */
export function schemaGuardProjection(graph:ReferenceGraph,scope:GraphScope,policy:GuardPolicy,
    proofs=new MigrationSchemaProofs(graph),seen=new Set<string>()):GuardProjection|undefined {
    const id=JSON.stringify([scope.resource,scope.pointer]);if(seen.size>=128||seen.has(id)||!supportedSchemaDialect(scope))return;
    if(proofs.sameInstanceDiscriminator(scope))return;
    const next=new Set(seen).add(id),value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    const applications:GuardApplication[]=[],inert:string[]=[],finite:{field:string;raw:string}[]=[],removed:string[]=[],discarded:{scope:GraphScope;domain:string}[]=[],types:{field:string;value:string[]}[]=[],forbidden:{scope:GraphScope;name:string}[]=[],
        references:{field:string;target:GuardProjection}[]=[];
    const result=(terminal?:Record<string,unknown>):GuardProjection=>({scope,policy,applications,inert,finite,removed,discarded,types,forbidden,references,...(terminal?{terminal}:{})});
    if(policy.domains?.size===0||value===true)return result({});
    if(value===false){const terminal=guardFailure(policy);return terminal?result(terminal):undefined;}
    if(!value||typeof value!=='object'||Array.isArray(value))return;
    policy={...policy,assumptions:[...policy.assumptions??[],scope]};
    const sourceDomains=proofs.domains(scope),activeDomains=policy.domains?expand([...policy.domains]):!policy.conditionalPresence?new Set(['object']):undefined;
    if(!sourceDomains.size||activeDomains&&![...sourceDomains].some(type=>activeDomains.has(type))){
        const terminal=guardFailure(policy);return terminal?result(terminal):undefined;
    }
    const inherited=policy,presence=new MigrationPropertyPresence(graph);
    policy={...policy,present:name=>!!inherited.present?.(name)||presence.requires(scope,name),
        absent:name=>!!inherited.absent?.(name)||presence.absent(scope,name),
        // Native-domain projection keeps its own required assertions. A
        // property projection must not use its own required list to erase the
        // cause of presence; only the captured outside context may do that.
        unconditional:name=>!!inherited.unconditional?.(name)||!!inherited.domains&&presence.unconditional(scope,name)};
    const guard={domains:policy.domains?expand([...policy.domains]):policy.conditionalPresence?new Set(atoms):new Set(['object']),
        present:(name:string)=>name===policy.property||!!policy.present?.(name),absent:policy.absent};
    if(proofs.guardedTruth(scope,guard,policy.assumptions)===false){
        const terminal=guardFailure(policy);return terminal?result(terminal):undefined;
    }
    let condition=false;
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
        }else if(['enum','const','not','anyOf','oneOf'].includes(field)){
            if(field==='anyOf'||field==='oneOf'){
                const selected=proofs.equivalentBranch(scope,field,guard,policy.assumptions);
                const children=value[field].map((_:unknown,index:number)=>graph.scopeAs(scope.resource,scope.pointer+'/'+field+'/'+index,'schema'));
                if(selected&&children.every(child=>child&&(child.pointer===selected.pointer||
                    proofs.guardedTruth(child,guard,policy.assumptions)===false||proofs.annotationFree(child)))){
                    const part=schemaGuardProjection(graph,selected,policy,proofs,next);if(!part)return;
                    applications.push({scope,kind:field,parts:[part]});continue;
                }
            }
            if(!policy.domains)return;
            if(['enum','const'].includes(field)&&policy.domains.size===1&&policy.domains.has('object')){
                const raw=finiteObjectAssertion(graph,scope,field);if(!raw)return;
                finite.push({field:scope.pointer+'/'+field,raw});continue;
            }
            const outside=new Set(atoms.filter(type=>!expand([...policy.domains!]).has(type)));
            if(!proofs.inertKeyword(scope,field,outside))return;
            inert.push(scope.pointer+'/'+field);
        }else if(['if','then','else'].includes(field)){
            if(condition)continue;condition=true;
            const selected=capturedConditionalPlan(graph,scope,'2.0',next,policy.assumptions,guard);if(!selected)return;
            const parts:GuardProjection[]=[];
            for(const name of ['if','then','else'] as const){
                if(!(name==='if'?selected.assertCondition:name===selected.selected||selected.selected==='both'))continue;
                const child=graph.scopeAs(scope.resource,scope.pointer+'/'+name,'schema');if(!child)continue;
                const inner=selected.projected?.find(value=>value.name===name)?.plan;
                const policies=inner?intersectGuards(policy,inner.policy):[policy];if(!policies)return;
                for(const joined of policies){const part=schemaGuardProjection(graph,child,joined,proofs,next);if(!part)return;parts.push(part);}
            }
            const literal=selected.complement?projectLiteral(selected.complement,policy):undefined;
            if(selected.complement&&!literal)return;
            applications.push({scope,kind:'condition',parts,...(literal?{literal:{value:literal,exact:selected.exactComplement}}:{})});
        }else if(field==='dependentSchemas'){
            const presence=new MigrationPropertyPresence(graph),parts:GuardProjection[]=[];
            for(const name of Object.keys(value.dependentSchemas)){
                const child=graph.scopeAs(scope.resource,scope.pointer+'/dependentSchemas/'+name.replace(/~/g,'~0').replace(/\//g,'~1'),'schema');if(!child)return;
                const policies=presence.requires(scope,name)||policy.present?.(name)?[policy]:intersectGuards(policy,{property:name});
                if(!policies)return;
                for(const joined of policies){const part=schemaGuardProjection(graph,child,joined,proofs,next);if(!part)return;parts.push(part);}
            }
            applications.push({scope,kind:'dependency',parts});
        }else if(field==='allOf'){
            const parts:GuardProjection[]=[];
            for(let index=0;index<value.allOf.length;index++){
                const child=graph.scopeAs(scope.resource,scope.pointer+'/allOf/'+index,'schema');
                const plan=child&&schemaGuardProjection(graph,child,policy,proofs,next);
                if(!plan)return;
                parts.push(plan);
            }
            applications.push({scope,kind:'allOf',parts});
        }else if(['$ref','$dynamicRef'].includes(field)){
            const target=proofs.fixed(scope,field),plan=target&&schemaGuardProjection(graph,target,policy,proofs,next);
            if(!plan)return;references.push({field:scope.pointer+'/'+field,target:plan});
        }else if(policy.domains){
            const domain=nativeDomain(field);if(!domain)return;
            if(!policy.domains.has(domain))discarded.push({scope,domain});
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
    return result();
}

/** All same-instance material needed by this captured proof must retain its
 * composable native representation, even when an external owner sorts before
 * the consumer. Value-schema children keep their own ordinary lowering. */
export function guardProjectionScopes(graph:ReferenceGraph,projection:GuardProjection):readonly GraphScope[] {
    const scopes=new Map<string,GraphScope>(),proofs=new MigrationSchemaProofs(graph);
    const add=(scope:GraphScope)=>scopes.set(JSON.stringify([scope.resource,scope.pointer]),scope);
    const collect=(plan:GuardProjection)=>{
        for(const scope of proofs.conjuncts(plan.scope))add(scope);
        for(const field of plan.removed){
            const parent=graph.scopeAs(plan.scope.resource,field.slice(0,field.lastIndexOf('/')),'schema');if(parent)add(parent);
        }
        for(const reference of plan.references)collect(reference.target);
        for(const application of plan.applications)for(const part of application.parts)collect(part);
    };
    collect(projection);return [...scopes.values()];
}

/** The allocator owns both the stable use and each assertion variant. Delay
 * copying until every captured body has undergone ordinary vocabulary lowering,
 * including external bodies whose lexical coordinates sort after the consumer. */
export function deferGuardProjection(graph:ReferenceGraph,plan:GuardProjection,target:string,owners:MigrationSchemaOwners,
    sources:ReadonlyMap<string,MigrationSource>,defer:(projection:()=>void)=>void):MigrationLocation {
    const slot=owners.reserveSchema(plan.scope,'guard_projection_use');owners.admit(slot.source);slot.source.set(slot.location.pointer,{});
    defer(()=>{
        const project=(plan:GuardProjection):MigrationLocation=>{
            const range=graph.docs.get(plan.scope.resource)!.dataNode(plan.scope.pointer)!.range;
            if(plan.terminal){
                const slot=owners.reserveSchema(plan.scope,'guard_terminal');owners.admit(slot.source);slot.source.set(slot.location.pointer,plan.terminal);
                return slot.location;
            }
            const material=owners.uniqueLocation(plan.scope),input=material.source,current=material.location.pointer;
            const suffix=(original:string)=>{
                const locations=plan.scope.resource===input.original.id?input.origins.get(original):input.foreignOrigins.get(plan.scope.resource+'#'+original);
                const fields=[...locations??[]].filter(field=>field===current||field.startsWith(current+'/'));
                if(fields.length!==1)
                    throw new SourceError('migration.schema.guard-owner','A guarded field has no unique local planning owner',range,'unsupported',{...plan.scope,range});
                return fields[0].slice(current.length);
            };
            const finite=plan.finite.map(value=>({...value,suffix:suffix(value.field)}));
            const removed=plan.removed.map(suffix),types=plan.types.map(value=>({...value,suffix:suffix(value.field)})),
                forbidden=plan.forbidden.map(value=>({...value,suffix:suffix(value.scope.pointer)})),
                discarded=plan.discarded.map(value=>({...value,suffix:suffix(value.scope.pointer)}));
            const inert=new Set(plan.inert.flatMap(original=>{
                const locations=plan.scope.resource===input.original.id?input.origins.get(original):input.foreignOrigins.get(plan.scope.resource+'#'+original);
                return [...locations??[]].filter(field=>field.startsWith(current+'/'));
            }));
            for(const value of finite)inert.add(current+value.suffix);
            const compatible=(pointer:string):boolean=>{
                const value=input.doc.dataNode(pointer)?.value;
                if(!value||typeof value!=='object'||Array.isArray(value))return false;
                if(['enum','const','not','anyOf','oneOf'].some(field=>Object.hasOwn(value,field)&&!inert.has(pointer+'/'+field)))return false;
                return (value.allOf??[]).every((_:unknown,index:number)=>compatible(pointer+'/allOf/'+index));
            };
            if(!compatible(current))throw new SourceError('migration.proof.guard-lowering',
                'This guarded body acquired a logical or finite-domain representation that needs a further applicability proof before projection',
                range,'unsupported',{...plan.scope,range});
            const projected=plan.references.map(reference=>({field:reference.field,target:project(reference.target)}));
            const applications=plan.applications.map(application=>{
                if(owners.applicationRetired(application.scope,application.kind))return;
                const origin=owners.applicationUse(application.scope,application.kind);
                if(!origin){
                    if(application.parts.length||application.literal)
                        throw new SourceError('migration.schema.guard-application','A nontrivial projected applicator lost its captured material owner',range,'unsupported',{...plan.scope,range});
                    // The ordinary preparation pass proved this entire
                    // annotation-free effect inert and already retired it.
                    return;
                }
                // Locate before copying: the neutral use alone owns this
                // synthetic reference origin. Replacement retires its copy.
                const use=owners.uniqueLocation(origin);
                if(use.source!==input||!use.location.pointer.startsWith(current+'/'))
                    throw new SourceError('migration.schema.guard-application','A guarded applicator escaped its captured containing schema',range,'unsupported',{...plan.scope,range});
                const parts=application.parts.map(project),effect=owners.reserveSchema(application.scope,'composed_guard');
                owners.admit(effect.source,3);effect.source.set(effect.location.pointer,{allOf:parts.map(part=>({$ref:owners.reference(part,target)}))});
                if(application.literal){
                    const at=effect.location.pointer+'/allOf/'+parts.length;
                    effect.source.set(at,application.literal.value);
                    const exact=application.literal.exact;
                    if(exact&&Object.hasOwn(application.literal.value,exact.field))effect.source.exact(at+'/'+exact.field,exact.raw);
                }
                if(!parts.length&&!application.literal)effect.source.set(effect.location.pointer,{});
                return {origin,target:effect.location};
            });
            const variant=owners.assertionVariant(graph,plan.scope,input,current,'guard_projection',target,[...removed,...finite.map(value=>value.suffix)]),output=sources.get(variant.resource)!;
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
            for(const value of finite){
                const collection=variant.pointer+'/allOf';owners.admit(output,2);
                if(!output.doc.dataNode(collection))output.set(collection,[]);
                output.exact(collection+'/'+output.doc.dataNode(collection).children.size,value.raw);
            }
            for(const reference of projected)owners.replaceAssertionReference(variant,{resource:plan.scope.resource,pointer:reference.field},reference.target,target);
            for(const application of applications)if(application)owners.replaceAssertionReference(variant,application.origin,application.target,target);
            return variant;
        };
        const variant=project(plan);owners.admit(slot.source);slot.source.set(slot.location.pointer,{$ref:owners.reference(variant,target)});
    });
    return slot.location;
}
