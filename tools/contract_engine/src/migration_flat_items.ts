import {escape,SourceError} from './document';
import {compare,decimal,multiple} from './exact_numbers';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {MigrationIssue} from './migration_schema';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationLocation,MigrationSource} from './migration_source';
import {MigrationSchemaProofs,migrationExactValueIdentity} from './migration_schema_proofs';
import {MigrationArrayBounds} from './migration_schema_arrays';
import {constantSchemaAssertion} from './schema_constant_assertions';

type Field=Readonly<{source:MigrationSource;pointer:string}>;
type Value=Field|Readonly<{raw:string}>;
type FlatPlan=Readonly<{type:string;fields:ReadonlyMap<string,Value>;items?:FlatPlan}>;
const fields=new Set(['type','format','items','collectionFormat','default','maximum','exclusiveMaximum','minimum','exclusiveMinimum',
    'maxLength','minLength','pattern','maxItems','minItems','uniqueItems','enum','multipleOf']);
const types=new Set(['string','number','integer','boolean','array']);
const key=(at:MigrationLocation)=>JSON.stringify([at.resource,at.pointer]);
const raw=(value:Value)=>'raw' in value?value.raw:value.source.doc.dataJson(value.pointer);

/** Capture only schema paths that will become concrete Swagger declarations.
 * Fixed aliases and same-instance conjunctions keep their captured ownership;
 * value-schema traversal is restricted to array item applications. */
export function flatSchemaScopes(graph:ReferenceGraph):ReadonlySet<string>{
    const pending:GraphScope[]=[],seen=new Set<string>(),proofs=new MigrationSchemaProofs(graph);
    for(const owner of graph.entryScopes())if(owner.kind==='header'||owner.kind==='parameter'){
        const value=graph.docs.get(owner.resource)!.dataNode(owner.pointer)?.value;
        if(owner.kind==='parameter'&&value?.in==='body')continue;
        const schema=graph.scopeAs(owner.resource,owner.pointer+'/schema','schema');if(schema)pending.push(schema);
    }
    while(pending.length){
        const scope=pending.pop()!,id=key(scope);if(seen.has(id))continue;
        if(seen.size>=50000)throw new SourceError('limit.migration.flat-items','Flat item use capture exceeds 50000 schema states');
        seen.add(id);const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        for(const field of ['$ref','$dynamicRef']){const target=proofs.fixed(scope,field);if(target)pending.push(target);}
        if(graph.referenceObject(value,scope))continue;
        for(const field of ['allOf','anyOf','oneOf','not','if','then','else','dependentSchemas','items','prefixItems']){
            const node=graph.docs.get(scope.resource)!.dataNode(scope.pointer+'/'+field);if(!node)continue;
            for(const pointer of node.kind==='array'||field==='dependentSchemas'?[...node.children.keys()].map(index=>node.pointer+'/'+escape(index)):[node.pointer]){
                const child=graph.scopeAs(scope.resource,pointer,'schema');if(child)pending.push(child);
            }
        }
    }
    return seen;
}

/** Swagger 2.0 6.4.10 has concrete recursive Items Objects, not Schema Objects.
 * This compiler consolidates already-lowered conjunctions. It never copies a
 * locator, applicator, object field or unsupported annotation into Items. */
export function materializeFlatSchema(graph:ReferenceGraph,sources:ReadonlyMap<string,MigrationSource>,owners:MigrationSchemaOwners,
    source:MigrationSource,pointer:string,scope:GraphScope,issue:MigrationIssue,schemaScope?:GraphScope):string|undefined {
    let work=0;
    const rootSchema=schemaScope??graph.scopeAs(scope.resource,scope.pointer+'/schema','schema');
    const impossible=():FlatPlan=>({type:'string',fields:new Map<string,Value>([['type',{raw:'"string"'}],['minLength',{raw:'1'}],['maxLength',{raw:'0'}]])});
    const fail=(at:Field,code:string,message:string,reason:'implementation'|'target-representation'|'source-incomplete'='implementation'):never=>{
        issue({resource:at.source.doc.id,pointer:at.pointer},code,message,reason);
        throw new FlatRefusal();
    };
    const build=(inputs:readonly Field[],root:boolean,active:ReadonlySet<string>=new Set(),inferred:readonly Field[]=[],captured:readonly GraphScope[]=[]):FlatPlan=>{
        const evidence=inputs[0]??inferred[0];
        if(active.size>=128)fail(evidence,'migration.flat-items.depth','The concrete item proof exceeded 128 nested array levels');
        const originals=[...captured];
        const constraints=new Map<string,Field[]>(),itemInputs:Field[]=[],positional:Field[]=[],unsupported:{field:string;atom:Field}[]=[],walked=new Set<string>();
        const add=(field:string,value:Field)=>constraints.set(field,[...constraints.get(field)??[],value]);
        const collect=(at:Field)=>{
            if(++work>50000)fail(at,'migration.flat-items.work','The concrete item proof exceeded 50000 captured states');
            const id=key({resource:at.source.doc.id,pointer:at.pointer});
            if(active.has(id))fail(at,'migration.flat-items.recursion','A recursive item language cannot be represented by finite concrete Swagger Items Objects','target-representation');
            if(walked.has(id))return;walked.add(id);
            const original=owners.capturedSchema({resource:at.source.doc.id,pointer:at.pointer});
            if(original)originals.push(original);
            const node=at.source.doc.dataNode(at.pointer);
            if(node?.kind!=='object')fail(at,'migration.flat-items.shape','A concrete Items Object needs an established primitive or array schema');
            for(const [field,child]of node.children){
                const atom={source:at.source,pointer:child.pointer};
                if(field==='$ref'){
                    const target=owners.materialReference(at.source,at.pointer,'2.0');
                    if(!target)fail(atom,'migration.flat-items.reference','A concrete item requires one captured fixed reference target','source-incomplete');
                    collect({source:sources.get(target.resource)!,pointer:target.pointer});
                }else if(field==='allOf'){
                    for(const branch of child.children.values())collect({source:at.source,pointer:branch.pointer});
                }else if(field==='items'){
                    if(child.kind==='array')positional.push(atom);else itemInputs.push(atom);
                }else if(fields.has(field)||root&&field==='description'||field.startsWith('x-'))add(field,atom);
                else unsupported.push({field,atom});
            }
        };
        inputs.forEach(collect);
        if(originals.some(scope=>{
            const context=owners.contextOf(scope)??graph;
            return constantSchemaAssertion(context,scope)===false||new MigrationSchemaProofs(context).domains(scope).size===0;
        }))return impossible();
        const output=new Map<string,Value>();
        const declared=constraints.get('type')??[];
        let type:string|undefined;
        for(const field of declared){
            const next=field.source.doc.dataNode(field.pointer)!.value;
            if(typeof next!=='string'||!types.has(next))fail(field,'migration.flat-items.type','Swagger flat item types exclude objects, null, files and type unions','target-representation');
            if(type&&type!==next){
                if([type,next].every(type=>type==='number'||type==='integer'))type='integer';
                else fail(field,'migration.flat-items.type-intersection','The captured type intersection has no established concrete item representation');
            }else type=next;
        }
        const enumFields=constraints.get('enum')??[];
        let literals:Field[]|undefined;
        for(const enumeration of enumFields){
            const candidates=[...enumeration.source.doc.dataNode(enumeration.pointer)!.children.values()].map(node=>({source:enumeration.source,pointer:node.pointer}));
            literals=literals?literals.filter(a=>candidates.some(b=>migrationExactValueIdentity(a.source.doc,a.pointer)===migrationExactValueIdentity(b.source.doc,b.pointer))):candidates;
        }
        if(literals?.length===0)return impossible();
        const domain=literals??inferred;
        if(!type&&domain.length){
            const kinds=domain.map(field=>{
                const node=field.source.doc.dataNode(field.pointer)!;
                if(node.kind!=='number')return node.kind;
                const value=decimal(raw(field));return value.coefficient===0n||value.exponent>=0n?'integer':'number';
            });
            type=kinds.every(kind=>kind==='integer'||kind==='number')?kinds.includes('number')?'number':'integer':kinds.every(kind=>kind===kinds[0])?kinds[0]:undefined;
        }
        if(!type||!types.has(type))fail(evidence,'migration.flat-items.domain','An unconstrained or mixed item domain has no concrete Swagger primitive/array type','target-representation');
        for(const {field,atom}of unsupported){
            // These native object applications never run for a concrete flat
            // primitive/array. Their independent schemas remain in the neutral
            // owner retained below, including any instance metadata inside.
            if(['properties','required','additionalProperties','minProperties','maxProperties'].includes(field))continue;
            fail(atom,'migration.flat-items.keyword','Swagger flat '+(root?'declarations':'Items Objects')+' cannot retain the applicable '+field+' field','target-representation');
        }
        output.set('type',declared.find(field=>field.source.doc.dataNode(field.pointer)!.value===type)??{raw:JSON.stringify(type)});
        for(const [field,values]of constraints){
            if(['type','items','enum','minimum','maximum','exclusiveMinimum','exclusiveMaximum'].includes(field))continue;
            if(/^(min|max)(Length|Items)$/.test(field)){
                output.set(field,values.reduce((a,b)=>compare(decimal(raw(a)),decimal(raw(b)))*(field.startsWith('min')?1:-1)>=0?a:b));
            }else if(field==='uniqueItems')output.set(field,values.find(value=>value.source.doc.dataNode(value.pointer)!.value===true)??values[0]);
            else if(field==='multipleOf'){
                let value:Value=values[0];
                for(const next of values.slice(1)){
                    if(multiple(decimal(raw(value)),decimal(raw(next))))continue;
                    if(multiple(decimal(raw(next)),decimal(raw(value)))){value=next;continue;}
                    const a=decimal(raw(value)),b=decimal(raw(next)),exponent=a.exponent<b.exponent?a.exponent:b.exponent;
                    if(a.exponent-exponent>4096n||b.exponent-exponent>4096n)fail(next,'migration.flat-items.divisibility','Exact divisibility consolidation exceeds its exponent budget');
                    const x=a.coefficient*10n**(a.exponent-exponent),y=b.coefficient*10n**(b.exponent-exponent);
                    let c=x,d=y;while(d){const rest=c%d;c=d;d=rest;}
                    const coefficient=x/c*y;
                    if(coefficient.toString().length>4096)fail(next,'migration.flat-items.divisibility','Exact divisibility consolidation exceeds its coefficient budget');
                    value={raw:coefficient+'e'+exponent};
                }
                output.set(field,value);
            }else{
                if(values.length>1&&['format','default','description'].includes(field))
                    fail(values[1],'migration.flat-items.annotations','Multiple applicable '+field+' annotations have no single flat field preserving their collection','target-representation');
                if(values.some(value=>raw(value)!==raw(values[0])))fail(values[1],'migration.flat-items.conjunction','Consolidating these '+field+' constraints requires further equivalence evidence');
                output.set(field,values[0]);
            }
        }
        for(const field of ['minimum','maximum']){
            const values=constraints.get(field)??[],exclusive=field==='minimum'?'exclusiveMinimum':'exclusiveMaximum';
            if(!values.length)continue;
            const strict=(value:Field)=>value.source.doc.dataNode(value.pointer.slice(0,value.pointer.lastIndexOf('/'))+'/'+exclusive)?.value===true;
            const selected=values.reduce((a,b)=>{
                const order=compare(decimal(raw(a)),decimal(raw(b)))*(field==='minimum'?1:-1);
                return order>0||order===0&&strict(a)?a:b;
            });
            output.set(field,selected);
            const at=selected.pointer.slice(0,selected.pointer.lastIndexOf('/'))+'/'+exclusive;
            if(selected.source.doc.dataNode(at))output.set(exclusive,{source:selected.source,pointer:at});
        }
        if(literals)output.set('enum',enumFields.length===1?enumFields[0]:{raw:'['+literals.map(raw).join(',')+']'});
        const defaultValue=output.get('default');
        if(defaultValue&&'source' in defaultValue){
            const node=defaultValue.source.doc.dataNode(defaultValue.pointer)!;
            const integral=node.kind==='number'&&(()=>{const n=decimal(raw(defaultValue));return n.coefficient===0n||n.exponent>=0n;})();
            if(!(node.kind===type||type==='number'&&node.kind==='number'||type==='integer'&&integral))
                fail(defaultValue,'migration.flat-items.default','Swagger flat defaults must conform to their concrete declared type','target-representation');
        }
        let items:FlatPlan|undefined;
        if(type==='array'){
            if(originals.some(scope=>new MigrationArrayBounds(owners.contextOf(scope)??graph).maximum(scope)===0))output.set('maxItems',{raw:'0'});
            const members=domain.flatMap(field=>{
                const node=field.source.doc.dataNode(field.pointer)!;
                return node.kind==='array'?[...node.children.values()].map(child=>({source:field.source,pointer:child.pointer})):[];
            });
            if(output.has('maxItems')&&compare(decimal(raw(output.get('maxItems')!)),decimal('0'))===0||domain.length>0&&!members.length)
                items={type:'string',fields:new Map([['type',{raw:'"string"'}]])};
            else{
                if(positional.length)fail(positional[0],'migration.flat-items.positional','Uniform or exhaustive finite item applicability has not been proved for these reachable positional constraints');
                const next=new Set([...active,...walked]);
                if(!itemInputs.length){
                    if(!members.length)fail(evidence,'migration.flat-items.unrestricted','Swagger Items Objects cannot admit an unrestricted object/null item domain','target-representation');
                    // An exhaustive whole-array enum proves the types of all
                    // reachable members, including nested array members.
                    items=build([],false,next,members);
                }else {
                    // A copied Header has no claim on its neutral schema's
                    // identity, but a uniform items application still has
                    // captured child bounds. Positional parents cannot supply
                    // this certificate: their tail need not govern prefixes.
                    const children=originals.flatMap(parent=>{
                        const context=owners.contextOf(parent)??graph,proofs=new MigrationSchemaProofs(context);
                        return proofs.conjuncts(parent).flatMap(part=>{
                            const value=context.docs.get(part.resource)!.dataNode(part.pointer)?.value;
                            if(Array.isArray(value?.prefixItems)||Array.isArray(value?.items))return [];
                            const child=context.scopeAs(part.resource,part.pointer+'/items','schema');return child?[child]:[];
                        });
                    });
                    items=build(itemInputs,false,next,members,children);
                }
            }
        }
        return {type,fields:output,...(items?{items}:{})};
    };
    try{
        const plan=build([{source,pointer}],true,new Set(),[],rootSchema?[rootSchema]:[]),snapshots=new Map<MigrationSource,MigrationSource>();
        const capture=(plan:FlatPlan):FlatPlan=>({type:plan.type,fields:new Map<string,Value>([...plan.fields].map(([name,value])=>{
            if('raw' in value)return [name,value] as const;
            let snapshot=snapshots.get(value.source);if(!snapshot){snapshot=value.source.fork();snapshots.set(value.source,snapshot);}
            return [name,{source:snapshot,pointer:value.pointer}] as const;
        })),...(plan.items?{items:capture(plan.items)}:{})});
        const captured=capture(plan),schema=rootSchema;
        if(!schema)fail({source,pointer},'migration.flat-items.owner','The flat declaration has no captured Schema Object owner','source-incomplete');
        owners.move(schema,source,pointer,'flat_schema',{context:graph,layout:'array-item'});
        const render=(plan:FlatPlan,at:string)=>{
            owners.admit(source,2);source.set(at,{});
            for(const [field,value]of plan.fields){
                if('raw' in value)source.exact(at+'/'+escape(field),value.raw);
                else owners.copyAssertionField(source,at+'/'+escape(field),value.source,value.pointer);
            }
            if(plan.items)render(plan.items,at+'/items');
        };
        render(captured,pointer);return plan.type;
    }catch(error){if(error instanceof FlatRefusal)return;throw error;}
}
class FlatRefusal extends Error {}
