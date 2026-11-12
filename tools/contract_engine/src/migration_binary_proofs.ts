import {createHash} from 'node:crypto';
import {SourceDocument,SourceError,escape} from './document';
import {compare,decimal} from './exact_numbers';
import {evaluateSchemas} from './schema_evaluation';
import {pointerFragment,supportedSchemaDialect,type GraphScope,type ReferenceGraph} from './reference_graph';
import {modernFamily} from './specification';
import {projectSchemaReference} from './schema_reference_projection';
import {finiteRegexNameSuperset} from './migration_schema_regex';
import {rawConstraintBlocker,rawPatternBounds,rawContainerLiteralUnchanged} from './migration_binary_constraints';
import {binaryLiteralAssertion,binaryLiteralValues,binaryPathKey,type BinaryPaths} from './migration_binary_literals';
import type {BinaryStep,BinaryUse} from './migration_binary';
import type {SourcePlan} from './source_plan';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {restrictedBooleanSchema} from './migration_schema_values';
import type {MigrationIssue} from './migration_schema';

const key=(scope:Pick<GraphScope,'resource'|'pointer'>)=>JSON.stringify([scope.resource,scope.pointer]);
const fields=['type','nullable','minLength','maxLength','pattern','enum','const'] as const;
const unique=<T>(values:readonly T[],identity:(value:T)=>string):T[]=>[...new Map(values.map(value=>[identity(value),value])).values()];
export const binaryUseKey=(use:BinaryUse):string=>JSON.stringify([use.source.resource,use.source.pointer,use.schema.resource,use.schema.pointer]);
type State={scope:GraphScope;path:readonly BinaryStep[];ambient:readonly GraphScope[];domains:readonly (readonly string[])[];envelope:GraphScope;root:string;history:readonly {scope:GraphScope;path:readonly BinaryStep[]}[]};
type LiteralPlan={field:'enum'|'const';assertion:string;remaining?:readonly string[];unchanged?:boolean};
type Language={lengths:readonly number[];values:readonly string[]};
type Case={scope:GraphScope;paths:BinaryPaths;states:State[];literals:LiteralPlan[];literalValues?:Map<string,readonly string[]>;scalar?:string;complete:boolean};

/** Finite source-domain certificates. Generated predicates describe lengths,
 * never byte contents. Source acceptance is decided only by the canonical
 * evaluator. Route assumptions contain positive conjuncts; a oneOf/not/if
 * result is never assumed while proving one of its own children. */
export class BinaryConstraintProofs {
    private work=0;
    private evaluationWork=0;
    private readonly cases=new Map<string,Map<string,Case>>();
    private readonly guards=new Map<string,Language>();
    private readonly positiveCache=new Map<string,readonly GraphScope[]>();
    private readonly evaluations=new Map<string,readonly string[]|undefined>();
    constructor(private readonly graph:ReferenceGraph){}
    private inspect():void {
        if(++this.work>2000000)throw new SourceError('limit.migration.binary-proof','Binary assertion certificates exceed their bounded captured work');
    }
    private positive(initial:GraphScope):readonly GraphScope[]{
        const known=this.positiveCache.get(key(initial));if(known)return known;
        const pending=[initial],seen=new Map<string,GraphScope>();
        for(let index=0;index<pending.length;index++){
            this.inspect();const scope=pending[index];if(seen.has(key(scope)))continue;seen.set(key(scope),scope);
            const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(!value||typeof value!=='object')continue;
            for(const name of modernFamily(scope.family)?['$ref','$dynamicRef']:['$ref'])if(typeof value[name]==='string'){
                const edge=this.graph.referenceAs(scope.resource,scope.pointer,name,'schema'),projection=edge&&projectSchemaReference(edge);
                const next=projection?.state==='fixed'&&this.graph.scopeAs(projection.target.resource,projection.target.pointer,'schema');if(next)pending.push(next);
            }
            if(this.graph.referenceObject(value,scope))continue;
            for(let item=0;item<(Array.isArray(value.allOf)?value.allOf.length:0);item++){
                const next=this.graph.scopeAs(scope.resource,scope.pointer+'/allOf/'+item,'schema');if(next)pending.push(next);
            }
        }
        const result=[...seen.values()];this.positiveCache.set(key(initial),result);return result;
    }
    async prepare(uses:readonly BinaryUse[]):Promise<void>{
        const roots=new Map<string,{use:BinaryUse;paths:(readonly BinaryStep[])[]}>();
        for(const use of uses){
            this.inspect();const id=binaryUseKey(use),root=roots.get(id)??{use,paths:[]};root.paths.push(use.path);roots.set(id,root);
        }
        for(const [id,{use,paths}]of roots){
            const cases=new Map<string,Case>(),pending:State[]=unique(paths,binaryPathKey).map(path=>({scope:use.schema,path,ambient:[],domains:[],envelope:use.schema,root:id,history:[]}));
            const seen=new Set<string>();
            for(let index=0;index<pending.length;index++){
                this.inspect();const state=pending[index],at=state.scope;
                const context=unique<GraphScope>([...state.ambient,...this.positive(at)],key);
                const stateKey=JSON.stringify([key(at),state.path,context.map(key).sort(),state.domains,key(state.envelope),state.history.map(item=>[key(item.scope),item.path])]);
                if(seen.has(stateKey))continue;seen.add(stateKey);
                if(seen.size>2048)throw new SourceError('limit.migration.binary-proof','A binary occurrence exceeds 2048 assertion route states');
                const entry=cases.get(key(at))??{scope:at,paths:[],states:[],literals:[],complete:true};
                entry.paths=unique([...entry.paths,state.path],binaryPathKey);entry.states.push({...state,ambient:context});cases.set(key(at),entry);
                const value=this.graph.docs.get(at.resource)!.dataNode(at.pointer)?.value;
                if(!value||typeof value!=='object'||Array.isArray(value))continue;
                const child=(pointer:string,path=state.path,ambient=context,domains=state.domains,envelope=state.envelope)=>{
                    const scope=this.graph.scopeAs(at.resource,pointer,'schema');if(scope)pending.push({scope,path,ambient,domains,envelope,root:state.root,history:state.history});
                };
                for(const name of modernFamily(at.family)?['$ref','$dynamicRef']:['$ref'])if(typeof value[name]==='string'){
                    const edge=this.graph.referenceAs(at.resource,at.pointer,name,'schema'),projection=edge&&projectSchemaReference(edge);
                    const scope=projection?.state==='fixed'&&this.graph.scopeAs(projection.target.resource,projection.target.pointer,'schema');
                    if(scope)pending.push({...state,scope,ambient:context});
                }
                if(this.graph.referenceObject(value,at))continue;
                for(const name of ['allOf','anyOf','oneOf'])if(Array.isArray(value[name]))for(let item=0;item<value[name].length;item++){
                    const pointer=at.pointer+'/'+name+'/'+item,scope=this.graph.scopeAs(at.resource,pointer,'schema');
                    if(scope)child(pointer,state.path,context,state.domains,name==='allOf'?state.envelope:scope);
                }
                for(const name of ['not',...(modernFamily(at.family)?['if','then','else']:[])])if(Object.hasOwn(value,name)){
                    const pointer=at.pointer+'/'+name,scope=this.graph.scopeAs(at.resource,pointer,'schema');if(scope)child(pointer,state.path,context,state.domains,scope);
                }
                if(state.path.length){
                    const [step,...rest]=state.path;if(step==='nested')continue;
                    const suffix=step==='item'?'/items':'/properties/'+escape(step.property);
                    const projected=context.flatMap(scope=>{
                        const target=this.graph.scopeAs(scope.resource,scope.pointer+suffix,'schema');return target?[target]:[];
                    });
                    const domains:(readonly string[])[]=[];
                    for(const values of state.domains){
                        const extracted=this.extract(values,[step]);if(extracted!==undefined)domains.push(extracted);
                    }
                    for(const scope of context){
                        const doc=this.graph.docs.get(scope.resource)!,body=doc.dataNode(scope.pointer)?.value;
                        for(const field of ['enum','const'])if(Object.hasOwn(body??{},field)){
                            if(field==='enum'&&!Array.isArray(body.enum))continue;
                            const values=field==='const'?[doc.dataJson(scope.pointer+'/const')]:body.enum.map((_:unknown,item:number)=>doc.dataJson(scope.pointer+'/enum/'+item));
                            const extracted=this.extract(values,[step]);if(extracted!==undefined)domains.push(extracted);
                        }
                    }
                    const scope=this.graph.scopeAs(at.resource,at.pointer+suffix,'schema');
                    if(scope)pending.push({scope,path:rest,ambient:unique<GraphScope>(projected,key),domains,envelope:scope,root:state.root,history:unique([
                        ...state.history.map(item=>({...item,path:[...item.path,step]})),
                        ...context.map(scope=>({scope,path:[step]})),
                    ],item=>JSON.stringify([key(item.scope),item.path]))});
                }
            }
            this.cases.set(id,cases);
        }
        for(const cases of this.cases.values())for(const entry of cases.values()){
            const value=this.graph.docs.get(entry.scope.resource)!.dataNode(entry.scope.pointer)?.value;
            if(value&&typeof value==='object'&&entry.paths.some(path=>path.length))await this.literalPlans(entry,value);
        }
        const needed=new Set<string>();
        for(const cases of this.cases.values())for(const entry of cases.values())for(const state of entry.states)if(!state.path.length){
            const value=this.graph.docs.get(state.scope.resource)!.dataNode(state.scope.pointer)?.value;
            if(!modernFamily(state.scope.family)&&value&&typeof value==='object'&&(rawConstraintBlocker(value)!==undefined||this.contradiction(state)))needed.add(key(state.envelope));
        }
        for(const envelope of needed){
            const states=[...this.cases.values()].flatMap(cases=>[...cases.values()].flatMap(entry=>entry.states.filter(state=>!state.path.length&&key(state.scope)===envelope)));
            const lengths=new Set<number>(),values=new Set<string>();let complete=states.length>0;
            for(const state of states){
                const language=await this.scalarLanguage(state);if(language===undefined){complete=false;break;}
                for(const length of language.lengths)lengths.add(length);for(const value of language.values)values.add(value);
            }
            if(complete)this.guards.set(envelope,{lengths:[...lengths].sort((a,b)=>a-b),values:[...values]});
        }
        for(const cases of this.cases.values())for(const entry of cases.values()){
            const value=this.graph.docs.get(entry.scope.resource)!.dataNode(entry.scope.pointer)?.value;
            if(!value||typeof value!=='object'||Array.isArray(value))continue;
            if(!modernFamily(entry.scope.family)&&entry.paths.some(path=>!path.length)&&(rawConstraintBlocker(value)!==undefined||entry.states.some(state=>!state.path.length&&this.contradiction(state)))){
                const lengths=new Set<number>();let complete=true;
                for(const state of entry.states.filter(state=>!state.path.length)){
                    const accepted=await this.scalarLanguage(state,true);
                    if(accepted===undefined){complete=false;break;}
                    for(const length of accepted.lengths)lengths.add(length);
                }
                if(complete)entry.scalar=this.lengthAssertion([...lengths].sort((a,b)=>a-b));else entry.complete=false;
            }
        }
    }

    private extract(values:readonly string[],path:readonly BinaryStep[]):readonly string[]|undefined {
        const result:string[]=[];
        for(const text of values){
            this.inspect();const doc=new SourceDocument(text,'urn:busyapi:binary-literal',true,'json'),items=binaryLiteralValues(doc,'',path);
            if(items===undefined)return;result.push(...items);if(result.length>2048)return;
        }
        return [...new Set(result)];
    }
    private contradiction(state:State):boolean {
        let lower=decimal('0'),upper:ReturnType<typeof decimal>|undefined;
        for(const scope of state.ambient){
            this.inspect();if(!supportedSchemaDialect(scope))return false;
            const doc=this.graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value;
            if(!value||typeof value!=='object'||this.graph.referenceObject(value,scope))continue;
            if(Object.hasOwn(value,'minLength')){const bound=decimal(doc.dataJson(scope.pointer+'/minLength'));if(compare(bound,lower)>0)lower=bound;}
            if(Object.hasOwn(value,'maxLength')){const bound=decimal(doc.dataJson(scope.pointer+'/maxLength'));if(upper===undefined||compare(bound,upper)<0)upper=bound;}
            if(typeof value.pattern==='string'){
                const bounds=rawPatternBounds(value.pattern);
                if(bounds){
                    const bound=decimal(String(bounds.minimum));if(compare(bound,lower)>0)lower=bound;
                    if(bounds.maximum!==undefined){const bound=decimal(String(bounds.maximum));if(upper===undefined||compare(bound,upper)<0)upper=bound;}
                }
            }
        }
        return upper!==undefined&&compare(lower,upper)>0;
    }
    private async scalarLanguage(state:State,useGuards=false):Promise<Language|undefined>{
        const guards=useGuards?unique<GraphScope>([...state.ambient,state.envelope],key).flatMap(scope=>{const guard=this.guards.get(key(scope));return guard?[guard.values]:[];}):[];
        const filtered=state.history.flatMap(item=>{
            const entry=this.cases.get(state.root)?.get(key(item.scope));
            return [...entry?.literalValues?.values()??[]].flatMap(values=>{const projected=this.extract(values,item.path);return projected===undefined?[]:[projected];});
        });
        const clauses:string[]=[],domains=[...state.domains,...guards,...filtered];let lower=decimal('0'),upper:ReturnType<typeof decimal>|undefined;
        for(const scope of state.ambient){
            this.inspect();if(!supportedSchemaDialect(scope)||scope.family!==state.scope.family)return;
            const doc=this.graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value;
            if(value===false){domains.push([]);continue;}
            if(!value||typeof value!=='object'||this.graph.referenceObject(value,scope))continue;
            clauses.push('{'+fields.filter(name=>Object.hasOwn(value,name)).map(name=>JSON.stringify(name)+':'+doc.dataJson(scope.pointer+'/'+name)).join(',')+'}');
            if(Object.hasOwn(value,'type')&&!(Array.isArray(value.type)?value.type:[value.type]).includes('string'))domains.push([]);
            for(const name of ['enum','const'])if(Object.hasOwn(value,name)){
                if(name==='enum'&&!Array.isArray(value.enum))return;
                domains.push(name==='const'?[doc.dataJson(scope.pointer+'/const')]:value.enum.map((_:unknown,item:number)=>doc.dataJson(scope.pointer+'/enum/'+item)));
            }
            if(Object.hasOwn(value,'minLength')){const bound=decimal(doc.dataJson(scope.pointer+'/minLength'));if(compare(bound,lower)>0)lower=bound;}
            if(Object.hasOwn(value,'maxLength')){const bound=decimal(doc.dataJson(scope.pointer+'/maxLength'));if(upper===undefined||compare(bound,upper)<0)upper=bound;}
            if(typeof value.pattern==='string'){
                const bounds=rawPatternBounds(value.pattern);
                if(bounds){
                    const min=decimal(String(bounds.minimum));if(compare(min,lower)>0)lower=min;
                    if(bounds.maximum!==undefined){const max=decimal(String(bounds.maximum));if(upper===undefined||compare(max,upper)<0)upper=max;}
                }else{
                    const finite=value.pattern==='(?!)'?[]:finiteRegexNameSuperset(value.pattern);if(finite!==undefined)domains.push(finite.map(value=>JSON.stringify(value)));
                }
            }
        }
        if(upper!==undefined&&compare(lower,upper)>0)return {lengths:[],values:[]};
        if(upper!==undefined&&compare(upper,decimal('1'))<=0)domains.push(['""',...(compare(upper,decimal('0'))>0?Array.from({length:256},(_,value)=>JSON.stringify(String.fromCharCode(value))):[])]);
        if(!domains.length)return;
        if(domains.some(domain=>!domain.length))return {lengths:[],values:[]};
        const candidates=unique(domains.reduce((left,right)=>left.length<=right.length?left:right),value=>JSON.stringify(JSON.parse(value))).filter(text=>{
            const value=JSON.parse(text);return typeof value==='string'&&[...value].every(character=>character.codePointAt(0)! <= 255);
        });
        if(candidates.length>2048||candidates.reduce((cost,text)=>cost+text.length,0)>1024*1024)return;
        for(const domain of [...state.domains,...guards,...filtered])clauses.push('{"enum":['+domain.join(',')+']}');
        const family=state.scope.family,declaration=family==='2.0'?'swagger':'openapi',version=family==='2.0'?'2.0':'3.0.4',container=family==='2.0'?'definitions':'components';
        clauses.push('{"$ref":'+JSON.stringify(state.scope.resource+pointerFragment(state.scope.pointer))+'}');
        const schema='{"allOf":['+clauses.join(',')+']}',body='{"'+declaration+'":'+JSON.stringify(version)+',"info":{"title":"Binary source proof","version":"proof"},"paths":{},"'+container+'":'+(family==='2.0'?'{"Proof":'+schema+'}':'{"schemas":{"Proof":'+schema+'}}')+'}';
        const id='urn:busyapi:binary-proof:'+createHash('sha256').update(body).digest('hex');
        const accepted=await this.evaluate([{id,text:body,generation:0,identity:createHash('sha256').update(body).digest('hex')},...this.resources()],id,{resource:id,pointer:family==='2.0'?'/definitions/Proof':'/components/schemas/Proof'},candidates);
        if(accepted===undefined)return;
        const counts=new Map<number,number>();for(const text of accepted){const length=(JSON.parse(text) as string).length;counts.set(length,(counts.get(length)??0)+1);}
        for(const [length,count]of counts)if(length>1||count!==(length===0?1:256))return;
        return {lengths:[...counts.keys()],values:accepted};
    }
    private lengthAssertion(lengths:readonly number[]):string {
        if(!lengths.length)return '{"not":{}}';
        if(lengths.length===2&&lengths[0]===0&&lengths[1]===1)return '{"maxLength":1}';
        const alternatives=lengths.map(length=>length===0?'{"maxLength":0}':'{"maxLength":'+length+',"not":{"maxLength":'+(length-1)+'}}');
        return alternatives.length===1?alternatives[0]:'{"anyOf":['+alternatives.join(',')+']}';
    }
    private async literalPlans(entry:Case,value:Record<string,any>):Promise<void>{
        const at=entry.scope,doc=this.graph.docs.get(at.resource)!,modern=modernFamily(at.family);
        for(const field of ['enum','const'] as const)if(Object.hasOwn(value,field)){
            if(field==='enum'&&!Array.isArray(value.enum)){entry.complete=false;continue;}
            const pointers=field==='const'?[at.pointer+'/const']:value.enum.map((_:unknown,index:number)=>at.pointer+'/enum/'+index);
            const texts=pointers.map(pointer=>doc.dataJson(pointer)),accepted=new Set<string>();
            const unchanged=(pointer:string)=>entry.paths.every(path=>rawContainerLiteralUnchanged({const:doc.dataNode(pointer)!.value},path));
            entry.literalValues??=new Map();
            if(pointers.every(unchanged)){entry.literalValues.set(field,texts);entry.literals.push({field,assertion:'unchanged',unchanged:true});continue;}
            if(pointers.length>2048||texts.reduce((cost,text)=>cost+text.length,0)>8*1024*1024){entry.complete=false;continue;}
            if(modern){
                const remaining=pointers.filter(unchanged).map(pointer=>doc.dataJson(pointer));
                entry.literalValues.set(field,remaining);entry.literals.push({field,assertion:JSON.stringify(remaining),remaining});continue;
            }
            // Positive allOf/ref envelopes retain inherited object/item rules.
            // Branching envelopes reset at not/oneOf/anyOf/conditionals.
            for(const envelope of unique<GraphScope>(entry.states.map(state=>state.envelope),key)){
                const result=await this.evaluate(this.resources(),this.graph.root,envelope,texts);if(result===undefined){entry.complete=false;continue;}
                for(const text of result)accepted.add(text);
            }
            entry.literalValues.set(field,[...accepted]);
            const assertions:string[]=[];
            for(const [index,pointer]of pointers.entries())if(accepted.has(texts[index])){
                const assertion=binaryLiteralAssertion(doc,pointer,entry.paths,modern);
                if(assertion===undefined){entry.complete=false;continue;}
                assertions.push(assertion);
            }
            if(entry.complete)entry.literals.push({field,assertion:assertions.length===0?'{"not":{}}':assertions.length===1?assertions[0]:'{"anyOf":['+assertions.join(',')+']}'});
        }
    }
    private resources(){return [...this.graph.docs].map(([id,doc])=>({id,text:doc.text,generation:0,identity:createHash('sha256').update(doc.text).digest('hex'),
        aliases:[...this.graph.retrievals].filter(([alias,target])=>target===id&&alias!==id).map(([alias])=>alias)}));}
    private async evaluate(resources:readonly {id:string;text:string;generation:number;identity:string;aliases?:string[]}[],root:string,scope:Pick<GraphScope,'resource'|'pointer'>,values:readonly string[]):Promise<readonly string[]|undefined>{
        const cache=createHash('sha256').update(JSON.stringify([root,key(scope),resources.map(resource=>[resource.id,resource.text]),values])).digest('hex');
        if(this.evaluations.has(cache))return this.evaluations.get(cache);
        const cost=resources.reduce((cost,resource)=>cost+resource.text.length,0)*Math.ceil(values.length/4);if(cost>128*1024*1024||(this.evaluationWork+=cost)>256*1024*1024)return;
        const accepted:string[]=[];
        for(let offset=0;offset<values.length;offset+=4){
            this.inspect();const batch=values.slice(offset,offset+4),checked=await evaluateSchemas({root,snapshot:'migration-binary-source-proof',resources:[...resources],
                runtimeInstances:['request-body','response-body'].flatMap(subject=>batch.map(text=>({subject,text,location:'binary-exhaustive-language',schema:{resource:scope.resource,pointer:scope.pointer}}))) });
            if(!checked.complete||checked.findings.some(finding=>finding.severity==='error')||checked.runtimeEvaluations.length!==batch.length*2||checked.runtimeEvaluations.some(value=>!value.complete))return;
            for(const [index,text]of batch.entries()){
                const request=checked.runtimeEvaluations[index].valid,response=checked.runtimeEvaluations[index+batch.length].valid;
                if(request!==response)return;if(request)accepted.push(text);
            }
        }
        this.evaluations.set(cache,accepted);return accepted;
    }
    compatible(use:BinaryUse,scope:GraphScope,path:readonly BinaryStep[]):boolean {
        const entry=this.cases.get(binaryUseKey(use))?.get(key(scope));
        if(!entry||!entry.complete)return false;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(path.length)return ['enum','const'].every(field=>!Object.hasOwn(value??{},field)||entry.literals.some(plan=>plan.field===field));
        return modernFamily(scope.family)||rawConstraintBlocker(value)===undefined||entry.scalar!==undefined;
    }
    requiresLiteralOwner(use:BinaryUse):boolean {
        return [...this.cases.get(binaryUseKey(use))?.values()??[]].some(entry=>entry.literals.some(plan=>!plan.unchanged));
    }
    scalar(scope:GraphScope):string|undefined {
        const entries=[...this.cases.values()].flatMap(cases=>{const entry=cases.get(key(scope));return entry&&entry.paths.some(path=>!path.length)?[entry]:[];});
        if(!entries.length||entries.some(entry=>entry.scalar===undefined))return;
        const assertions=[...new Set(entries.map(entry=>entry.scalar!))];
        return assertions.length===1?assertions[0]:'{"anyOf":['+assertions.join(',')+']}';
    }
    projectGuards(sources:ReadonlyMap<string,SourcePlan>,from:string):void {
        for(const [id,language]of this.guards){
            const [resource,pointer]=JSON.parse(id) as [string,string],scope=this.graph.scopeAs(resource,pointer,'schema');
            if(!scope||scope.family!==from)continue;
            const source=sources.get(resource)!,at=source.current(pointer);if(at===undefined)continue;
            const all=at+'/allOf';if(!source.doc.dataNode(all))source.set(all,[]);
            source.exact(all+'/'+source.doc.dataNode(all)!.children.size,this.lengthAssertion(language.lengths));
        }
    }
    projectLiterals(sources:ReadonlyMap<string,SourcePlan>,owners:MigrationSchemaOwners,from:string,to:string,issue:MigrationIssue):void {
        const entries=new Map<string,Case[]>();
        for(const cases of this.cases.values())for(const entry of cases.values())if(entry.scope.family===from&&entry.paths.some(path=>path.length)){
            const values=entries.get(key(entry.scope))??[];values.push(entry);entries.set(key(entry.scope),values);
        }
        for(const cases of entries.values()){
            const scope=cases[0].scope,source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);if(pointer===undefined)continue;
            const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            for(const field of ['enum','const'] as const)if(Object.hasOwn(value??{},field)){
                const plans=cases.map(entry=>entry.literals.find(plan=>plan.field===field));
                if(plans.some(plan=>!plan)||new Set(plans.map(plan=>plan?.assertion)).size!==1){
                    issue({...scope,pointer:scope.pointer+'/'+field},'migration.schema.binary-literal','The finite containing literal has no common exact projection at every captured raw occurrence','unavailable-proof');continue;
                }
                if(plans.every(plan=>plan!.unchanged))continue;
                if(plans[0]!.remaining!==undefined){
                    const remaining=plans[0]!.remaining!;
                    owners.retainLiteralValue({...scope,pointer:scope.pointer+'/'+field},source,pointer+'/'+field,'binary_container_literal');
                    if(remaining.length)source.exact(pointer+'/'+field,field==='enum'?'['+remaining.join(',')+']':remaining[0]);
                    else{
                        const at=pointer+'/allOf';if(!source.doc.dataNode(at))source.set(at,[]);
                        source.set(at+'/'+source.doc.dataNode(at)!.children.size,modernFamily(to)?{not:{}}:restrictedBooleanSchema(false,to));
                    }
                    continue;
                }
                if(!modernFamily(to))throw new SourceError('migration.binary.literal-route','A raw-byte equality assertion requires a modern target after reverse literal projection');
                owners.retainLiteralValue({...scope,pointer:scope.pointer+'/'+field},source,pointer+'/'+field,'binary_container_literal');
                const at=pointer+'/allOf';if(!source.doc.dataNode(at))source.set(at,[]);
                source.exact(at+'/'+source.doc.dataNode(at)!.children.size,plans[0]!.assertion);
            }
        }
    }
}
