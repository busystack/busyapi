import {patternCandidates} from './schema_string_candidates';
import {schemaContext} from './schema_context';
import {SourceDocument,SourceError,escape,type Range} from './document';
import {record} from './engine_worker_client';
import {supportedSchemaDialect,type ReferenceGraph,type GraphTarget} from './reference_graph';
import {modernFamily} from './specification';
import {numericSampleCandidates} from './schema_numeric_candidates';
import {decimal,compare} from './exact_numbers';
export type SchemaSampleLocation=Readonly<{resource:string;pointer:string}>;
export type SchemaSampleSource=Readonly<{resource:string;pointer:string;range:Range}>;
type SchemaLocation=SchemaSampleLocation;
type SourceLocation=SchemaSampleSource;

export type SchemaSample={raw:string;source:SourceLocation};
type Suggestions=(schema:SchemaLocation)=>{samples:SchemaSample[];limit?:SourceLocation};
type ObjectShape={properties:Map<string,GraphTarget[]>;required:Set<string>;additional:GraphTarget[];
    dependencies:Map<string,Set<string>>;minimum:number};

/** Bounded construction of suggestions, never schema evaluation. The caller
 * proves every completed value against the captured whole response schema. */
export class SchemaSampleCandidates {
    private readonly references=new Map<string,ReferenceGraph['references']>();
    constructor(private readonly graph:ReferenceGraph,private readonly failurePrefix='schema.sample') {
        for(const edge of graph.references)if(edge.kind==='schema'&&!edge.connection) {
            const key=JSON.stringify([edge.resource,edge.pointer]);
            this.references.set(key,[...(this.references.get(key)??[]),edge]);
        }
    }

    candidates(schema:SchemaLocation,suggestions:Suggestions,existing:readonly SchemaSample[]=[]):{samples:SchemaSample[];limit?:SourceLocation;unavailable?:{source:SourceLocation;reason:string}} {
        let unavailable:{source:SourceLocation;reason:string}|undefined;
        const allocated=new Set(existing.map(sample=>sample.raw));
        let work=0,bytes=[...allocated].reduce((sum,raw)=>sum+Buffer.byteLength(raw),0),limit:SourceLocation|undefined;
        const memo=new WeakMap<Set<string>,Map<string,SchemaSample[]>>();
        const source=(target:GraphTarget):SourceLocation=>{
            const node=this.graph.docs.get(target.resource)?.dataNode(target.pointer);
            return {resource:target.resource,pointer:target.pointer,range:node?.range??[0,0]};
        };
        const step=(target:GraphTarget)=>{
            if(work>=32768){limit??=source(target);return false;}
            work++;
            return true;
        };
        const admit=(raw:string,origin:SourceLocation)=>{
            if(allocated.has(raw))return true;
            if(bytes+Buffer.byteLength(raw)>8*1024*1024){limit??=origin;return false;}
            bytes+=Buffer.byteLength(raw);allocated.add(raw);return true;
        };
        const resolved=(target:GraphTarget)=>
            (this.references.get(JSON.stringify([target.resource,target.pointer]))??[])
                .filter(edge=>['$ref','$dynamicRef'].includes(edge.keyword)&&edge.resolution==='resolved')
                .map((edge):GraphTarget=>({resource:edge.targetResource!,pointer:edge.targetPointer!,kind:'schema'}));
        const count=(target:GraphTarget,keyword:string):number|undefined=>{
            const doc=this.graph.docs.get(target.resource)!,node=doc.dataNode(target.pointer+'/'+keyword);
            if(!node)return;
            if(typeof node.value!=='number'){limit??=source(target);return;}
            const value=decimal(doc.dataJson(node.pointer));
            if(value.exponent<0n||compare(value,decimal('0'))<0||compare(value,decimal('256'))>0){limit??=source(target);return;}
            return Number(value.coefficient*10n**value.exponent);
        };
        const locations=(target:GraphTarget,seen=new Set<string>(),depth=0):GraphTarget[]=>{
            const key=JSON.stringify([target.resource,target.pointer]);
            if(seen.has(key))return [];
            if(depth>=128||!step(target)){limit??=source(target);return [];}
            seen.add(key);
            const scope=schemaContext(this.graph,target.resource,target.pointer);
            if(!scope||!supportedSchemaDialect(scope)) {
                const origin=source(target);
                throw new SourceError(this.failurePrefix+'.dialect','Nested sample construction requires the captured supported dialect',origin.range,'unsupported',origin);
            }
            const node=this.graph.docs.get(target.resource)?.dataNode(target.pointer);
            if(!node||!record(node.value))return [];
            const edges=resolved(target);
            if(this.graph.referenceObject(node.value,scope))return edges.flatMap(value=>locations(value,seen,depth+1));
            const result=[target,...edges.flatMap(value=>locations(value,seen,depth+1))];
            const allOf=node.children.get('allOf');
            if(allOf?.kind==='array')for(const index of allOf.children.keys())
                result.push(...locations({...target,pointer:target.pointer+'/allOf/'+index},seen,depth+1));
            return result;
        };
        const build=(target:GraphTarget,path:Set<string>,depth:number):SchemaSample[]=>{
            const key=JSON.stringify([target.resource,target.pointer]);
            if(path.has(key)){
                // A recursive edge can terminate at a finite primitive or empty
                // container. Parent construction and original proof decide it.
                return suggestions(target).samples.concat(['null','{}','[]'].map(raw=>({raw,source:source(target)})));
            }
            const cache=memo.get(path)??new Map<string,SchemaSample[]>();memo.set(path,cache);
            const cached=cache.get(key);if(cached)return cached;
            if(depth>=128||!step(target)){limit??=source(target);return [];}
            const origin=source(target),output:SchemaSample[]=[],values=new Set<string>();
            const add=(raw:string,candidateSource=origin)=>{
                if(values.has(raw))return true;
                if(depth===0&&existing.some(sample=>sample.raw===raw))return true;
                if(output.length>=(depth===0?256-existing.length:256)||!step(target)||!admit(raw,candidateSource)){limit??=candidateSource;return false;}
                values.add(raw);output.push({raw,source:candidateSource});return true;
            };
            const authored=suggestions(target);
            limit??=authored.limit;
            for(const candidate of authored.samples)if(!add(candidate.raw,candidate.source))break;
            const next=new Set(path).add(key),scopes=locations(target);
            const numeric=numericSampleCandidates(scopes.map(location=>({scope:schemaContext(this.graph,location.resource,location.pointer)!,
                document:this.graph.docs.get(location.resource)!})));
            limit??=numeric.limit;
            for(const candidate of numeric.samples)add(candidate.raw,candidate.source);
            const object:ObjectShape={properties:new Map(),required:new Set(),additional:[],dependencies:new Map(),minimum:0};
            const arrays:GraphTarget[]=[];
            const objectBranches:SchemaSample[]=[];
            let hasObject=false;
            const stringMinimum=Math.max(0,...scopes.map(location=>this.graph.docs.get(location.resource)!.dataNode(location.pointer)?.value?.minLength).filter(value=>Number.isSafeInteger(value)&&value>=0));
            const stringMaximum=Math.min(65536,...scopes.map(location=>this.graph.docs.get(location.resource)!.dataNode(location.pointer)?.value?.maxLength).filter(value=>Number.isSafeInteger(value)&&value>=0));
            for(const location of scopes) {
                if(!step(location))break;
                const doc=this.graph.docs.get(location.resource)!,node=doc.dataNode(location.pointer)!;
                const value=node.value,scope=schemaContext(this.graph,location.resource,location.pointer)!;
                const types=typeof value.type==='string'?[value.type]:Array.isArray(value.type)?value.type:[];
                const properties=node.children.get('properties');
                if(types.includes('object')||properties||node.children.has('required'))hasObject=true;
                if(properties?.kind==='object')for(const name of properties.children.keys()) {
                    const property={...location,pointer:location.pointer+'/properties/'+escape(name)};
                    if(!step(property))break;
                    object.properties.set(name,[...(object.properties.get(name)??[]),property]);
                }
                if(Array.isArray(value.required))for(const name of value.required) {
                    if(!step(location))break;
                    if(typeof name==='string')object.required.add(name);
                }
                if(node.children.has('minProperties')){
                    hasObject=true;object.minimum=Math.max(object.minimum,count(location,'minProperties')??0);
                }
                if(node.children.get('additionalProperties')?.kind==='object'&&
                    this.graph.scopeAs(location.resource,location.pointer+'/additionalProperties','schema'))
                    object.additional.push({...location,pointer:location.pointer+'/additionalProperties'});
                if(modernFamily(scope.family))for(const [trigger,names]of Object.entries(value.dependentRequired??{})){
                    if(!step(location))break;
                    const required=object.dependencies.get(trigger)??new Set<string>();
                    if(Array.isArray(names))for(const name of names)if(typeof name==='string')required.add(name);
                    object.dependencies.set(trigger,required);
                }
                for(const keyword of ['oneOf','anyOf',...(modernFamily(scope.family)?['if','then','else','dependentSchemas']:[])]) {
                    const array=node.children.get(keyword);
                    const branches=array?.kind==='array'||keyword==='dependentSchemas'&&array?.kind==='object'?[...array.children.keys()].map(index=>location.pointer+'/'+keyword+'/'+escape(index)):
                        ['if','then','else'].includes(keyword)&&array?[location.pointer+'/'+keyword]:[];
                    if(scope.family!=='2.0')for(const pointer of branches)
                        for(const candidate of build({...location,pointer},next,depth+1)){
                            if(candidate.raw.trimStart().startsWith('{'))objectBranches.push(candidate);
                            if(!add(candidate.raw,candidate.source))break;
                        }
                }
                if(types.includes('string')||node.children.has('pattern')) {
                    if(typeof value.pattern==='string')for(const candidate of patternCandidates(value.pattern,stringMinimum,stringMaximum,reason=>{unavailable??={source:source(location),reason};}))add(JSON.stringify(candidate));
                    add('""');
                    const length=Math.max(1,stringMinimum);
                    if(!Number.isSafeInteger(length)||length<0||length>65536)limit??=source(location);
                    else for(const character of ['a','A','0'])add(JSON.stringify(character.repeat(length)));
                }
                if(types.includes('boolean'))for(const raw of ['false','true'])add(raw);
                if(types.includes('null')||(scope.family==='3.0'&&typeof value.type==='string'&&value.nullable===true))add('null');
                if(types.includes('array')||['items','prefixItems','minItems',...(modernFamily(scope.family)?['contains']:[])].some(name=>node.children.has(name)))arrays.push(location);
            }
            if(arrays.length){
                let minimum=0,maximum=256;
                const sizes=new Set<number>(),contains:{choices:SchemaSample[];minimum:number}[]=[];
                for(const location of arrays){
                    if(!step(location))break;
                    const doc=this.graph.docs.get(location.resource)!,node=doc.dataNode(location.pointer)!,scope=schemaContext(this.graph,location.resource,location.pointer)!;
                    minimum=Math.max(minimum,count(location,'minItems')??0);
                    maximum=Math.min(maximum,count(location,'maxItems')??256);
                    const prefix=modernFamily(scope.family)?node.children.get('prefixItems'):scope.family==='2.0'?node.children.get('items'):undefined;
                    if(prefix?.kind==='array')sizes.add(prefix.children.size);
                    if(modernFamily(scope.family)&&node.children.has('contains')){
                        const required=count(location,'minContains')??1;
                        contains.push({minimum:required,choices:build({...location,pointer:location.pointer+'/contains'},next,depth+1)});
                        sizes.add(required);sizes.add(Math.max(minimum,required));
                    }
                }
                // Length, tuple and containment bounds belong to the whole
                // conjunction. Do not generate each allOf array independently.
                sizes.add(minimum);if(minimum<maximum)sizes.add(minimum+1);
                const needed=Math.max(minimum,...contains.map(value=>value.minimum));sizes.add(needed);
                for(const size of [...sizes].filter(size=>size>=minimum&&size<=maximum).sort((a,b)=>
                    Number(b===needed)-Number(a===needed)||a-b)){
                    if(output.length>=256||!step(target)){limit??=origin;break;}
                    const items:SchemaSample[][]=[];
                    for(let index=0;index<size;index++){
                        const choices:SchemaSample[]=[];
                        for(const location of arrays){
                            if(!step(location))break;
                            const doc=this.graph.docs.get(location.resource)!,node=doc.dataNode(location.pointer)!,scope=schemaContext(this.graph,location.resource,location.pointer)!;
                            const prefix=modernFamily(scope.family)?node.children.get('prefixItems'):scope.family==='2.0'?node.children.get('items'):undefined;
                            const item=prefix?.kind==='array'&&prefix.children.has(String(index))
                                ?{...location,pointer:location.pointer+(modernFamily(scope.family)?'/prefixItems/':'/items/')+index}
                                :node.children.get('items')?.kind!=='array'&&node.children.has('items')?{...location,pointer:location.pointer+'/items'}
                                :prefix?.kind==='array'&&node.children.has('additionalItems')?{...location,pointer:location.pointer+'/additionalItems'}:undefined;
                            if(item&&this.graph.scopeAs(item.resource,item.pointer,'schema'))choices.push(...build(item,next,depth+1));
                        }
                        if(!choices.length)choices.push({raw:'null',source:origin});
                        choices.push(...contains.flatMap(value=>value.choices));
                        items.push([...new Map(choices.map(value=>[value.raw,value])).values()]);
                    }
                    add('['+items.map(choices=>choices[0].raw).join(',')+']');
                    // Diagonal proposals find distinct enum/const witnesses
                    // before a Cartesian prefix spends the combination budget.
                    const width=Math.min(256,Math.max(0,...items.map(choices=>choices.length)));
                    for(let offset=0;offset<width;offset++)if(!add('['+items.map((choices,index)=>choices[(offset+index)%choices.length].raw).join(',')+']'))break;
                    let values=[''];
                    for(let index=0;index<items.length;index++){
                        const combined:string[]=[];
                        outer:for(const before of values)for(const candidate of items[index]){
                            if(combined.length>=256||!step(target)){limit??=origin;break outer;}
                            const raw=before+(index?',':'')+candidate.raw;if(admit(raw,origin))combined.push(raw);
                        }
                        values=combined;if(!values.length)break;
                    }
                    for(const raw of values)if(!add('['+raw+']'))break;
                }
            }
            if(hasObject) {
                add('{}');
                const choicesFor=(name:string)=>{
                    const properties=object.properties.get(name)??object.additional;
                    return properties.length?properties.flatMap(property=>build(property,next,depth+1)):[{raw:'null',source:origin}];
                };
                const required=(selected:Iterable<string>)=>{
                    const names=new Set(selected),queue=[...names];
                    for(let index=0;index<queue.length;index++)for(const name of object.dependencies.get(queue[index])??[]){
                        if(!step(target))return names;
                        if(!names.has(name)){names.add(name);queue.push(name);}
                    }
                    return names;
                };
                const minimum=required(object.required);
                for(const name of object.properties.keys()){
                    if(minimum.size>=object.minimum)break;minimum.add(name);
                }
                let serial=0;
                while(minimum.size<object.minimum&&step(target)){
                    const name='property'+serial++;if(!object.properties.has(name))minimum.add(name);
                }
                const sets=[required(object.required),required(minimum)];
                for(const name of object.properties.keys())if(!minimum.has(name))sets.push(required([...minimum,name]));
                if(object.properties.size)sets.push(required([...minimum,...object.properties.keys()]));
                for(const names of sets){
                    if(output.length>=256||!step(target)){limit??=origin;break;}
                    const fields=[...names].map(name=>({name,choices:choicesFor(name)}));
                    if(fields.some(field=>!field.choices.length))continue;
                    const base='{'+fields.map(({name,choices})=>JSON.stringify(name)+':'+choices[0].raw).join(',')+'}';
                    add(base);
                    // Merge branch object members with the parent's required
                    // fields using exact CST values. Neither JSON.parse nor
                    // object spread may round or rebind literal member names.
                    let merged=[base];
                    for(const branch of objectBranches){
                        const additions:string[]=[];
                        for(const before of merged){
                            if(!step(target)||additions.length>=64)break;
                            const baseDoc=new SourceDocument(before,'urn:busyapi:sample-base',true,'json');
                            const branchDoc=new SourceDocument(branch.raw,'urn:busyapi:sample-branch',true,'json');
                            if(baseDoc.issues.length||branchDoc.issues.length||branchDoc.root.kind!=='object')continue;
                            const members=new Map([...baseDoc.root.children.keys()].map(name=>[name,baseDoc.dataJson('/'+escape(name))]));
                            for(const name of branchDoc.root.children.keys())members.set(name,branchDoc.dataJson('/'+escape(name)));
                            const raw='{'+[...members].map(([name,raw])=>JSON.stringify(name)+':'+raw).join(',')+'}';
                            if(add(raw))additions.push(raw);
                        }
                        merged=[...new Set([...merged,...additions])].slice(0,64);
                    }
                    let objects=[''];
                    for(const {name,choices}of fields){
                        const combined:string[]=[],unique=new Set<string>();
                        outer:for(const before of objects)for(const candidate of choices){
                            if(combined.length>=256||!step(target)){limit??=origin;break outer;}
                            const raw=before+(before?',':'')+JSON.stringify(name)+':'+candidate.raw;
                            if(!unique.has(raw)&&admit(raw,origin)){unique.add(raw);combined.push(raw);}
                        }
                        objects=combined;
                    }
                    for(const raw of objects)if(!add('{'+raw+'}'))break;
                }
            }
            if(!scopes.length||scopes.every(location=>{
                const value=this.graph.docs.get(location.resource)!.dataNode(location.pointer)?.value;
                return record(value)&&!Object.hasOwn(value,'type');
            }))for(const raw of ['null','false','0','""','{}','[]'])add(raw);
            cache.set(key,output);
            return output;
        };
        const samples=build({...schema,kind:'schema'},new Set(),0);
        return {samples,...(limit?{limit}:{}),...(unavailable?{unavailable}:{})};
    }
}

