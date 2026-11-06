import {SourceError} from './document';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {finitePropertyNameSet,type MigrationNameRestriction} from './migration_schema_property_names';
import {evaluateSchemas} from './schema_evaluation';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {Resource} from './engine';
import type {ExternalExampleResourcePacket} from './external_examples';
import {finiteRegexNameSuperset} from './migration_schema_regex';

/** Supersets of names established by captured assertions. A closed object in
 * a conjunction is a domain certificate even when another conjunct supplies
 * regexes, references or value assertions. No regex language is sampled. */
export class MigrationPropertyDomains {
    private readonly proofs:MigrationSchemaProofs;
    private work=0;
    constructor(private readonly graph:ReferenceGraph){this.proofs=new MigrationSchemaProofs(graph);}
    private bounded(names:readonly string[]):readonly string[]|undefined {
        const unique=[...new Set(names)];
        return unique.length<=2048&&unique.reduce((bytes,name)=>bytes+Buffer.byteLength(name),0)<=1024*1024?unique:undefined;
    }
    private nameSchema(scope:GraphScope,active=new Set<string>()):readonly string[]|undefined {
        const id=JSON.stringify([scope.resource,scope.pointer]);
        if(++this.work>50000||active.size>=128||active.has(id))return;
        const next=new Set(active).add(id);
        for(const part of this.proofs.conjuncts(scope)){
            const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
            const simple=finitePropertyNameSet(value)?.names;
            if(simple!==undefined)return this.bounded(simple);
            // Extra assertions only shrink an enum/const superset.
            if(value&&typeof value==='object'){
                if(Object.hasOwn(value,'const'))return typeof value.const==='string'?this.bounded([value.const]):[];
                if(Array.isArray(value.enum))return this.bounded(value.enum.filter((name:unknown):name is string=>typeof name==='string'));
                if(typeof value.pattern==='string'){
                    const names=finiteRegexNameSuperset(value.pattern);if(names!==undefined)return names;
                }
                for(const keyword of ['anyOf','oneOf'])if(Array.isArray(value[keyword])){
                    const sets=value[keyword].map((_:unknown,index:number)=>{
                        const child=this.graph.scopeAs(part.resource,part.pointer+'/'+keyword+'/'+index,'schema');
                        return child?this.nameSchema(child,next):undefined;
                    });
                    if(sets.every(set=>set!==undefined))return this.bounded(sets.flatMap(set=>set!));
                }
            }
        }
    }
    private localNames(scope:GraphScope):readonly string[]|undefined {
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value,names=Object.keys(value?.properties??{});
        for(const pattern of Object.keys(value?.patternProperties??{})){
            const child=this.graph.scopeAs(scope.resource,scope.pointer+'/patternProperties/'+pattern.replace(/~/g,'~0').replace(/\//g,'~1'),'schema');
            if(child&&this.proofs.validationConstant(child)===false)continue;
            const finite=finiteRegexNameSuperset(pattern);if(finite===undefined)return;
            names.push(...finite);if(names.length>2048)return;
        }
        return this.bounded(names);
    }
    private evaluatedNames(scope:GraphScope,root=false,active=new Set<string>()):readonly string[]|undefined {
        const id=JSON.stringify([scope.resource,scope.pointer]);
        if(++this.work>50000||active.size>=128||active.has(id))return;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(typeof value==='boolean')return [];
        if(!value||typeof value!=='object'||Array.isArray(value))return;
        const next=new Set(active).add(id),child=(pointer:string)=>this.graph.scopeAs(scope.resource,pointer,'schema');
        const name=child(scope.pointer+'/propertyNames'),finite=name&&this.nameSchema(name);
        if(finite!==undefined)return finite;
        const additional=child(scope.pointer+'/additionalProperties');
        if(additional&&this.proofs.validationConstant(additional)!==false)return;
        const unevaluated=child(scope.pointer+'/unevaluatedProperties');
        if(!root&&unevaluated&&this.proofs.validationConstant(unevaluated)!==false)return;
        const local=this.localNames(scope);if(local===undefined)return;
        if(additional)return local; // Its own closed selector already bounds every accepted name.
        const names=[...local];
        const append=(scope:GraphScope|undefined)=>{
            const finite=scope&&this.evaluatedNames(scope,false,next);if(finite===undefined)return false;
            names.push(...finite);return names.length<=2048;
        };
        for(const field of ['$ref','$dynamicRef'])if(Object.hasOwn(value,field)&&!append(this.proofs.fixed(scope,field)))return;
        for(const field of ['allOf','anyOf','oneOf'])if(Array.isArray(value[field]))
            for(let index=0;index<value[field].length;index++)if(!append(child(scope.pointer+'/'+field+'/'+index)))return;
        for(const field of ['if','then','else'])if(Object.hasOwn(value,field)&&
            (field==='if'||Object.hasOwn(value,'if'))&&!append(child(scope.pointer+'/'+field)))return;
        for(const name of Object.keys(value.dependentSchemas??{}))
            if(!append(child(scope.pointer+'/dependentSchemas/'+name.replace(/~/g,'~0').replace(/\//g,'~1'))))return;
        return this.bounded(names);
    }
    names(scope:GraphScope):readonly string[]|undefined {
        for(const part of this.proofs.conjuncts(scope)){
            const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
            if(this.graph.referenceObject(value,part))continue;
            const nameScope=this.graph.scopeAs(part.resource,part.pointer+'/propertyNames','schema');
            if(nameScope){const names=this.nameSchema(nameScope);if(names!==undefined)return names;}
            const additional=this.graph.scopeAs(part.resource,part.pointer+'/additionalProperties','schema');
            if(additional&&this.proofs.validationConstant(additional)===false){const names=this.localNames(part);if(names!==undefined)return names;}
            const unevaluated=this.graph.scopeAs(part.resource,part.pointer+'/unevaluatedProperties','schema');
            if(unevaluated&&this.proofs.validationConstant(unevaluated)===false){const names=this.evaluatedNames(part,true);if(names!==undefined)return names;}
            if(value?.maxProperties===0)return [];
        }
    }
    /** A finite rejection domain permits an open object with forbidden named
     * properties. This covers unbounded allowed languages without enumerating
     * their members, including nonempty names and finite regex complements. */
    private excluded(scope:GraphScope,active=new Set<string>()):readonly string[]|undefined {
        const id=JSON.stringify([scope.resource,scope.pointer]);
        if(++this.work>50000||active.size>=128||active.has(id))return;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        const strings=new Set(['string']);
        if(this.proofs.constantInDomains(scope,strings)===true)return [];
        if(!value||typeof value!=='object'||Array.isArray(value))return;
        const next=new Set(active).add(id),names:string[]=[];
        const child=(pointer:string)=>this.graph.scopeAs(scope.resource,pointer,'schema');
        for(const field of Object.keys(value)){
            if(this.proofs.constantInDomains(scope,strings,field)===true)continue;
            if(field==='minLength'&&value.minLength===1){names.push('');continue;}
            if(field==='not'){
                const at=child(scope.pointer+'/not'),finite=at&&this.nameSchema(at,next);if(finite===undefined)return;names.push(...finite);
            }else if(['$ref','$dynamicRef'].includes(field)){
                const at=this.proofs.fixed(scope,field),finite=at&&this.excluded(at,next);if(finite===undefined)return;names.push(...finite);
            }else if(field==='allOf'){
                for(let index=0;index<value.allOf.length;index++){
                    const at=child(scope.pointer+'/allOf/'+index),finite=at&&this.excluded(at,next);if(finite===undefined)return;names.push(...finite);
                }
            }else if(field==='anyOf'){
                const sets=value.anyOf.map((_:unknown,index:number)=>{
                    const at=child(scope.pointer+'/anyOf/'+index);return at?this.excluded(at,next):undefined;
                }),finite=sets.find(set=>set!==undefined);if(finite===undefined)return;names.push(...finite);
            }else return;
            if(names.length>2048)return;
        }
        return this.bounded(names);
    }
    /** Evaluate the complete name schema, on strings only, using the existing
     * exact, dialect/resource-aware evaluator. The candidates are exhaustive
     * for this occurrence, not a claim about an independent name-schema use. */
    async restriction(scope:GraphScope,resources:readonly Resource[],exampleResources:readonly ExternalExampleResourcePacket[]):Promise<MigrationNameRestriction|undefined> {
        const child=this.graph.scopeAs(scope.resource,scope.pointer+'/propertyNames','schema');if(!child)return;
        if(!this.proofs.annotationsInactiveIn(child,new Set(['string'])))return;
        const truth=this.proofs.constantInDomains(child,new Set(['string']));
        if(truth!==undefined)return {names:truth?undefined:[]};
        const allowed=this.names(scope),excluded=allowed===undefined?this.excluded(child):undefined,candidates=allowed??excluded;
        if(candidates===undefined)return;
        const capture=resources.filter(resource=>this.graph.docs.has(resource.id)).map(resource=>({...resource,text:this.graph.docs.get(resource.id)!.text}));
        if(capture.reduce((size,resource)=>size+resource.text.length,0)*Math.ceil(candidates.length/4)>128*1024*1024)
            throw new SourceError('limit.migration.name-proof','Captured property-name evaluation exceeds 128 MiB of source work');
        const names:string[]=[];
        for(let offset=0;offset<candidates.length;offset+=4){
            const batch=candidates.slice(offset,offset+4),result=await evaluateSchemas({root:this.graph.root,snapshot:'migration-name-proof:'+offset,
                resources:capture,exampleResources,runtimeInstances:batch.map(name=>({subject:'response-body',location:'property-name',text:JSON.stringify(name),
                    schema:{resource:child.resource,pointer:child.pointer}}))});
            if(!result.complete||result.findings.some(value=>value.severity==='error')||result.runtimeEvaluations.length!==batch.length||result.runtimeEvaluations.some(value=>!value.complete))
                throw new SourceError('migration.proof.name-incomplete','The captured property-name proof did not complete');
            result.runtimeEvaluations.forEach((value,index)=>{if(value.valid===(excluded===undefined))names.push(batch[index]);});
        }
        return excluded===undefined?{names}:{names:undefined,excluded:names};
    }
}
