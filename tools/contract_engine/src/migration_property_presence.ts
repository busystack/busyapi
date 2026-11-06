import {compare,decimal} from './exact_numbers';
import {escape,segments} from './document';
import type {GraphScope,GraphTarget,ReferenceGraph} from './reference_graph';
import {SchemaPropertyRequirements} from './schema_property_requirements';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {constantSchemaAssertion} from './schema_constant_assertions';
import {requiredInBothDirections} from './schema_access';

/** Migration-only extension of the shared positive presence proof. A fixed
 * point starts with actual required/finite-domain evidence. Optional cycles
 * never seed themselves. All statements concern object instances, matching
 * required/dependency semantics; non-objects are handled by each consumer. */
export class MigrationPropertyPresence extends SchemaPropertyRequirements {
    private readonly proofs:MigrationSchemaProofs;
    private readonly explicit:SchemaPropertyRequirements;
    private readonly forbiddenResults=new Set<string>();
    constructor(private readonly captured:ReferenceGraph,private readonly canInherit:(scope:GraphScope)=>boolean=()=>false){
        super(captured,(scope,name)=>requiredInBothDirections(captured,scope,name));this.proofs=new MigrationSchemaProofs(captured);
        this.explicit=new SchemaPropertyRequirements(captured,(scope,name)=>requiredInBothDirections(captured,scope,name));
    }
    private scope(at:GraphTarget):GraphScope|undefined{return this.captured.scopeAs(at.resource,at.pointer,'schema');}
    private value(at:GraphTarget):any{return this.captured.docs.get(at.resource)!.dataNode(at.pointer)?.value;}
    private entryRequires(scope:GraphScope,name:string):boolean {
        return this.canInherit(scope)&&this.captured.schemaParentsOf(scope).some(parent=>{
            if(parent.resource!==scope.resource)return false;
            const path=segments(scope.pointer.slice(parent.pointer.length));
            return path.length===2&&path[0]==='dependentSchemas'&&path[1]===name;
        });
    }
    private parents(scope:GraphScope):readonly GraphScope[]{
        if(!this.canInherit(scope))return [];
        return this.captured.schemaParentsOf(scope).filter(parent=>parent.resource===scope.resource&&scope.pointer.startsWith(parent.pointer+'/')&&
            /^\/(?:allOf\/\d+|anyOf\/\d+|oneOf\/\d+|dependentSchemas\/[^/]+|if|then|else|not)$/.test(scope.pointer.slice(parent.pointer.length)));
    }
    unconditional(at:GraphScope,name:string):boolean {
        // Keep this proof separate from virtual requires() dispatch: a seed
        // dependency may prove a property present, but erasing that dependency
        // as a tautology would erase the very cause of its presence.
        return this.entryRequires(at,name)||this.explicit.requires(at,name)||this.parents(at).some(parent=>this.unconditional(parent,name));
    }
    objectOnly(at:GraphScope):boolean {
        return this.parents(at).some(parent=>this.objectOnly(parent))||this.proofs.conjuncts(at).some(scope=>{
            const value=this.value(scope);
            if(this.captured.referenceObject(value,scope))return false;
            if(value===false)return true;
            const type=typeof value?.type==='string'?[value.type,...(scope.family==='3.0'&&value.nullable===true?['null']:[])]:value?.type;
            if(Array.isArray(type)&&type.length&&type.every(type=>type==='object'))return true;
            const constants=Object.hasOwn(value??{},'const')?[value.const]:value?.enum;
            return Array.isArray(constants)&&constants.every(item=>item!==null&&typeof item==='object'&&!Array.isArray(item));
        });
    }
    absent(at:GraphScope,name:string):boolean {
        if(this.parents(at).some(parent=>this.absent(parent,name)))return true;
        for(const scope of this.proofs.conjuncts(at)){
            if(!this.consume())return false;
            const value=this.value(scope);
            if(this.captured.referenceObject(value,scope))continue;
            if(value?.additionalProperties===false&&!value.patternProperties&&!Object.hasOwn(value.properties??{},name))return true;
            if(Object.hasOwn(value?.properties??{},name)){
                const child=this.scope({...scope,pointer:scope.pointer+'/properties/'+escape(name)});
                if(child&&constantSchemaAssertion(this.captured,child)===false)return true;
            }
            const constants=Object.hasOwn(value??{},'const')?[value.const]:value?.enum;
            if(Array.isArray(constants)&&constants.every(item=>item===null||typeof item!=='object'||Array.isArray(item)||!Object.hasOwn(item,name)))return true;
        }
        return false;
    }
    /** Hypothetical presence starts a closure over every captured conjunct.
     * Unlike absent(), this can depend on the dependency being converted. The
     * caller must emit the forbidden-property assertion, never erase its cause
     * as an inactive/tautological dependency. Optional cycles do not seed an
     * unconditional requirement. */
    forbidden(at:GraphScope,name:string):boolean {
        const id=JSON.stringify([at.resource,at.pointer,name]);if(this.forbiddenResults.has(id))return true;
        const result=this.proveForbidden(at,name);if(result)this.forbiddenResults.add(id);return result;
    }
    private proveForbidden(at:GraphScope,name:string):boolean {
        const parts:GraphScope[]=[],included=new Set<string>(),required=new Set<string>([name]);
        const include=(scope:GraphScope)=>{
            for(const part of this.proofs.conjuncts(scope)){
                const id=JSON.stringify([part.resource,part.pointer]);
                if(!included.has(id)){included.add(id);parts.push(part);}
            }
        };
        const pending=[at],parents=new Set<string>();
        while(pending.length){
            const scope=pending.pop()!,id=JSON.stringify([scope.resource,scope.pointer]);
            if(parents.has(id))continue;parents.add(id);include(scope);pending.push(...this.parents(scope));
        }
        let changed=true;
        while(changed){
            changed=false;
            const add=(name:string)=>{if(!required.has(name)){required.add(name);changed=true;}};
            for(const scope of [...parts]){
                if(!this.consume())return false;
                const value=this.value(scope);if(this.captured.referenceObject(value,scope))continue;
                if(value===false)return true;
                const types=typeof value?.type==='string'?[value.type]:value?.type;
                if(Array.isArray(types)&&!types.includes('object'))return true;
                for(const name of value?.required??[])if(requiredInBothDirections(this.captured,scope,name))add(name);
                const constants=Object.hasOwn(value??{},'const')?[value.const]:value?.enum;
                if(Array.isArray(constants)){
                    const objects=constants.filter(item=>item!==null&&typeof item==='object'&&!Array.isArray(item));
                    if(!objects.some(item=>[...required].every(name=>Object.hasOwn(item,name))))return true;
                    for(const name of objects.length?Object.keys(objects[0]):[])if(objects.every(item=>Object.hasOwn(item,name)))add(name);
                }
                for(const [trigger,names]of Object.entries(value?.dependentRequired??{}))if(required.has(trigger)&&Array.isArray(names))
                    for(const name of names)if(typeof name==='string')add(name);
                for(const trigger of Object.keys(value?.dependentSchemas??{}))if(required.has(trigger)){
                    const child=this.scope({...scope,pointer:scope.pointer+'/dependentSchemas/'+escape(trigger)});
                    if(child){const before=parts.length;include(child);if(parts.length!==before)changed=true;}
                }
                if(typeof value?.maxProperties==='number'&&compare(decimal(String(required.size)),
                    decimal(this.captured.docs.get(scope.resource)!.dataJson(scope.pointer+'/maxProperties')))>0)return true;
            }
            for(const scope of parts)for(const name of required)if(this.absent(scope,name))return true;
        }
        return false;
    }
    override requires(at:GraphTarget,name:string,seen:ReadonlySet<string>=new Set()):boolean {
        if(super.requires(at,name,seen))return true;
        const root=this.scope(at);if(!root)return false;
        if(this.entryRequires(root,name))return true;
        const key=JSON.stringify([at.resource,at.pointer]);
        if(!seen.has(key)&&this.parents(root).some(parent=>this.requires(parent,name,new Set(seen).add(key))))return true;
        const parts=this.proofs.conjuncts(root),included=new Set(parts.map(scope=>JSON.stringify([scope.resource,scope.pointer])));
        const required=new Set<string>();
        let changed=true;
        while(changed){
            changed=false;
            const add=(name:string)=>{if(!required.has(name)){required.add(name);changed=true;}};
            const include=(scope:GraphScope)=>{
                for(const child of this.proofs.conjuncts(scope)){
                    const id=JSON.stringify([child.resource,child.pointer]);
                    if(!included.has(id)){included.add(id);parts.push(child);changed=true;}
                }
            };
            for(const scope of [...parts]){
                if(!this.consume())return false;
                const value=this.value(scope);if(!value||typeof value!=='object')continue;
                if(this.captured.referenceObject(value,scope))continue;
                for(const name of value.required??[])if(typeof name==='string'&&requiredInBothDirections(this.captured,scope,name))add(name);
                const names=new Set<string>([name,...Object.keys(value.dependentRequired??{}),...Object.keys(value.dependentSchemas??{})]);
                for(const values of Object.values(value.dependentRequired??{}))if(Array.isArray(values))for(const item of values)if(typeof item==='string')names.add(item);
                for(const name of names)if(super.requires(scope,name,seen))add(name);
                const constants=Object.hasOwn(value,'const')?[value.const]:value.enum;
                if(Array.isArray(constants)){
                    const objects=constants.filter(item=>item!==null&&typeof item==='object'&&!Array.isArray(item));
                    for(const candidate of new Set([name,...objects.flatMap(item=>Object.keys(item))]))
                        if(objects.every(item=>Object.hasOwn(item,candidate)))add(candidate);
                }
                if(value.additionalProperties===false&&!value.patternProperties&&typeof value.minProperties==='number'){
                    const names=Object.keys(value.properties??{});
                    const doc=this.captured.docs.get(scope.resource)!;
                    if(compare(decimal(doc.dataJson(scope.pointer+'/minProperties')),decimal(String(names.length)))>=0)
                        for(const name of names)add(name);
                }
                for(const [trigger,values]of Object.entries(value.dependentRequired??{}))if(required.has(trigger)&&Array.isArray(values))
                    for(const name of values)if(typeof name==='string')add(name);
                for(const trigger of Object.keys(value.dependentSchemas??{}))if(required.has(trigger)){
                    const dependency=this.scope({...scope,pointer:scope.pointer+'/dependentSchemas/'+escape(trigger)});if(dependency)include(dependency);
                }
                const predicate=value.if;
                if(predicate&&typeof predicate==='object'&&Object.keys(predicate).every(field=>field==='required')&&Array.isArray(predicate.required)&&
                    predicate.required.every((name:string)=>required.has(name))){
                    const branch=this.scope({...scope,pointer:scope.pointer+'/then'});if(branch)include(branch);
                }
            }
            const lower=parts.filter(scope=>typeof this.value(scope)?.minProperties==='number')
                .map(scope=>decimal(this.captured.docs.get(scope.resource)!.dataJson(scope.pointer+'/minProperties')))
                .reduce((maximum,value)=>compare(value,maximum)>0?value:maximum,decimal('0'));
            for(const scope of parts){
                const value=this.value(scope);
                if(this.captured.referenceObject(value,scope)||value?.additionalProperties!==false||value.patternProperties)continue;
                const allowed=Object.keys(value.properties??{});
                if(compare(lower,decimal(String(allowed.length)))>=0)for(const candidate of allowed)add(candidate);
            }
            if(required.has(name))return true;
        }
        return false;
    }
}
