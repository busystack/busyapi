import {escape,SourceError} from './document';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import type {GraphScope,GraphReference,ReferenceGraph} from './reference_graph';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationSource} from './migration_source';
import type {MigrationPropertyDomains} from './migration_schema_name_domains';
import {annotationAny as any,annotationAll as all,annotationNot as negate,emitAnnotationGuard,type AnnotationGuard as Guard} from './migration_schema_annotation_guards';
import {universalNamePatterns,finiteRegexNameSuperset} from './migration_schema_regex';
import {discardInactiveMigrationSchema} from './migration_schema_conditions';

type Coverage=Readonly<{all:Guard;names:ReadonlyMap<string,Guard>}>;
const selected=(coverage:Coverage,name:string):Guard=>any([coverage.all,coverage.names.get(name)??false]);

/** Symbolic certificates for Core 10/11's successful object annotations. The
 * canonical graph supplies resource/dynamic ownership; this is not another
 * instance evaluator. Guard schemas run only under not, so testing successful
 * branches cannot leak their metadata into the unevaluated value application.
 * Property/value recursion is not traversed. Same-instance cycles and dynamic
 * choices without a fixed binding abandon the certificate. */
export class MigrationEvaluatedProperties {
    private readonly proofs:MigrationSchemaProofs;
    private work=0;
    private matchWork=0;
    constructor(private readonly graph:ReferenceGraph,private readonly owners:MigrationSchemaOwners,
        private readonly domains:MigrationPropertyDomains){this.proofs=new MigrationSchemaProofs(graph);}
    private guard(scope:GraphScope):Guard{return this.proofs.validationConstant(scope)??{schema:scope};}
    private merge(parts:readonly Coverage[]):Coverage {
        const names=new Set(parts.flatMap(part=>[...part.names.keys()]));
        return {all:any(parts.map(part=>part.all)),names:new Map([...names].map(name=>[name,any(parts.map(part=>selected(part,name)))]))};
    }
    private gated(part:Coverage,guard:Guard):Coverage {
        return {all:all([guard,part.all]),names:new Map([...part.names].map(([name,value])=>[name,all([guard,value])]))};
    }
    coverage(scope:GraphScope,root=false,active=new Set<string>()):Coverage|undefined {
        const id=JSON.stringify([scope.resource,scope.pointer]);
        if(++this.work>50000||active.size>=128||active.has(id))return;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(typeof value==='boolean')return {all:false,names:new Map()};
        if(!value||typeof value!=='object'||Array.isArray(value))return;
        const next=new Set(active).add(id),parts:Coverage[]=[];
        if(!root&&Object.hasOwn(value,'unevaluatedProperties')||Object.hasOwn(value,'additionalProperties'))
            return {all:true,names:new Map()};
        parts.push({all:false,names:new Map(Object.keys(value.properties??{}).map(name=>[name,true]))});
        if(Object.keys(value.patternProperties??{}).length){
            const patterns=Object.keys(value.patternProperties);
            if(patterns.some(pattern=>universalNamePatterns.has(pattern)))parts.push({all:true,names:new Map()});
            else {
                let names=this.domains.names(scope);
                if(names===undefined){
                    const selectors=patterns.map(finiteRegexNameSuperset);
                    if(selectors.some(names=>names===undefined))return;
                    names=[...new Set(selectors.flatMap(names=>names!))];if(names.length>2048)return;
                }
                if(patterns.length>128||patterns.some(pattern=>pattern.length>4096))return;
                const expressions=patterns.map(pattern=>new RegExp(pattern,'u'));
                parts.push({all:false,names:new Map(names.filter(name=>expressions.some(expression=>{
                    this.matchWork+=Math.max(1,name.length)*Math.max(1,expression.source.length);
                    if(this.matchWork>8*1024*1024)throw new SourceError('limit.migration.evaluated-properties','Successful name-coverage proofs exceed 8 MiB of pattern/name work');
                    return expression.test(name);
                })).map(name=>[name,true]))});
            }
        }
        const child=(pointer:string)=>this.graph.scopeAs(scope.resource,pointer,'schema');
        for(const field of ['$ref','$dynamicRef'])if(Object.hasOwn(value,field)){
            const target=this.proofs.fixed(scope,field),part=target&&this.coverage(target,false,next);if(!part)return;
            parts.push(part);
        }
        for(const keyword of ['allOf','anyOf','oneOf'])if(Array.isArray(value[keyword])){
            const choices:Coverage[]=[],guards:Guard[]=[];
            for(let index=0;index<value[keyword].length;index++){
                const at=child(scope.pointer+'/'+keyword+'/'+index),part=at&&this.coverage(at,false,next);if(!part||!at)return;
                choices.push(part);guards.push(this.guard(at));
            }
            if(keyword==='allOf')parts.push(this.merge(choices));
            else {
                // A name covered by every possible successful branch is
                // unconditional. anyOf retains the union of *all* successes.
                const merged=this.merge(choices.map((part,index)=>this.gated(part,guards[index])));
                const names=new Set(choices.flatMap(part=>[...part.names.keys()]));
                parts.push({all:choices.length&&choices.every(part=>part.all===true)?true:merged.all,
                    names:new Map([...names].map(name=>[name,choices.length&&choices.every(part=>selected(part,name)===true)?true:selected(merged,name)]))});
            }
        }
        if(Object.hasOwn(value,'if')){
            const condition=child(scope.pointer+'/if');if(!condition)return;
            const guard=this.guard(condition),conditionCoverage=this.coverage(condition,false,next);if(!conditionCoverage)return;
            parts.push(this.gated(conditionCoverage,guard));
            for(const keyword of ['then','else'])if(Object.hasOwn(value,keyword)){
                const at=child(scope.pointer+'/'+keyword),part=at&&this.coverage(at,false,next);if(!part)return;
                parts.push(this.gated(part,keyword==='then'?guard:negate(guard)));
            }
        }
        for(const name of Object.keys(value.dependentSchemas??{})){
            const at=child(scope.pointer+'/dependentSchemas/'+escape(name)),part=at&&this.coverage(at,false,next);if(!part)return;
            parts.push(this.gated(part,{present:name}));
        }
        return this.merge(parts);
    }
    private emit(guard:Guard,target:string):unknown {
        return emitAnnotationGuard(guard,this.owners,target);
    }
    discardInactive(scope:GraphScope,source:MigrationSource,references:readonly GraphReference[]):void {
        const original={resource:scope.resource,pointer:scope.pointer+'/unevaluatedProperties'};
        if(source.current(original.pointer,scope.resource)===undefined||this.graph.hasOverlappingScope(scope.resource,scope.pointer)||
            this.graph.literalContainer(scope.resource,scope.pointer)!==undefined||this.coverage(scope,true)?.all!==true)return;
        discardInactiveMigrationSchema(this.graph,original,source,this.owners,references);
        const at=source.current(original.pointer,scope.resource);
        if(at!==undefined)this.owners.move(original,source,at,'covered_unevaluated_properties',{context:this.graph,layout:'array-item'});
    }
    /** Retire the unsupported keyword now; materialize guard references only
     * after every captured owner has completed ordinary schema conversion. */
    lower(scope:GraphScope,source:MigrationSource,pointer:string,target:string,defer:(apply:()=>void)=>void):boolean {
        const original={resource:scope.resource,pointer:scope.pointer+'/unevaluatedProperties'},at=source.current(original.pointer,scope.resource);
        if(at!==pointer+'/unevaluatedProperties'||!source.doc.dataNode(at)||this.graph.hasOverlappingScope(scope.resource,scope.pointer)||
            this.graph.literalContainer(scope.resource,scope.pointer)!==undefined)return false;
        const coverage=this.coverage(scope,true);if(!coverage)return false;
        const names=[...coverage.names.keys()],guards=[coverage.all,...names.map(name=>selected(coverage,name))];
        if(target==='2.0'&&guards.some(guard=>typeof guard!=='boolean'))return false;
        const owner=this.owners.move(original,source,at,'unevaluated_properties',{context:this.graph,layout:'array-item'});
        defer(()=>{
            const material=this.owners.uniqueLocation(scope),entry=material.source,base=material.location.pointer;
            const reference={$ref:this.owners.reference(owner,target)};
            const apply=(guard:Guard,assertion:unknown)=>{
                if(guard===true)return;
                const collection=base+'/allOf';this.owners.admit(entry,3);
                if(!entry.doc.dataNode(collection))entry.set(collection,[]);
                const branch=collection+'/'+entry.doc.dataNode(collection)!.children.size;
                // The two alternatives are disjoint, preserving U's successful
                // metadata exactly where no successful applicator evaluated it.
                entry.set(branch,guard===false?assertion:{anyOf:[{not:{not:this.emit(guard,target)}},
                    {allOf:[{not:this.emit(guard,target)},assertion]}]});entry.presentationChanges.push(branch);
            };
            for(const name of names)apply(selected(coverage,name),{properties:{[name]:reference}});
            apply(coverage.all,{properties:Object.fromEntries(names.map(name=>[name,{}])),additionalProperties:reference});
        });
        return true;
    }
}
