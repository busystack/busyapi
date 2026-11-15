import {CapturedExampleResources} from './external_examples';
import {SourceDocument,SourceError,limits} from './document';
import {ReferenceGraph,planningOccurrences,type PlanningOccurrence,type GraphTarget} from './reference_graph';
import {specificationDeclaration} from './specification';

export type Resource = {
    id: string;
    text: string;
    generation: number;
    identity: string;
    aliases?: string[];
    hasBom?: boolean;
};

type ParsedResource={doc:SourceDocument;cost:number};
// Text is an immutable revision. A derived text with inherited generation or
// identity cannot alias its input parse; resource identity remains part of the
// lookup because SourceDocument embeds it. No digest/encoded copy is needed.
const byResource=new Map<string,Map<string,ParsedResource>>();
const recent=new Map<ParsedResource,true>();
let parsedCost=0;
type CapturedResource=Readonly<Omit<Resource,'aliases'>&{aliases?:readonly string[]}>;
type GraphCapture=Readonly<{root:string;resources:readonly CapturedResource[];occurrences?:readonly Readonly<GraphTarget>[];[planningOccurrences]?:ReadonlyMap<string,readonly PlanningOccurrence[]>}>;
// The capture belongs to its graph, including across separately bundled
// first-party helpers. JSON transport cannot construct symbol properties.
const ownedGraphCapture=Symbol.for('busyapi-owned-graph-capture');
type GraphContext=Readonly<{docs:ReadonlyMap<string,SourceDocument>;family:string;graph:ReferenceGraph}>;
const contextualGraphs=new Map<GraphContext,number>();
let contextualCost=0;
const resourceFields=new Set(['id','text','generation','identity','aliases','hasBom']);
const dataProperty=(value:object,name:string)=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,name)??{},'value');
function plainArray(value:any,maximum:number):value is any[] {
    return Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=maximum&&
        !Object.getOwnPropertySymbols(value).length&&Object.getOwnPropertyNames(value).length===value.length+1&&
        Array.from({length:value.length},(_,index)=>dataProperty(value,String(index))).every(Boolean);
}
// Ordinary JSON captures can reuse their immutable contextual graph. Planner
// seeds have a separate interpretation lifetime and never enter this cache.
function ordinaryCapture(input:any):boolean {
    if(!input||typeof input!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(input))||
        !dataProperty(input,'root')||!dataProperty(input,'resources')||typeof input.root!=='string'||input.root.length>16384||!plainArray(input.resources,limits.resources)||
        'occurrences' in input||planningOccurrences in input)return false;
    const ids=new Set<string>();
    return input.resources.every((resource:any)=>{
        if(!resource||typeof resource!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(resource))||
            Object.getOwnPropertySymbols(resource).length||Object.getOwnPropertyNames(resource).some(name=>!resourceFields.has(name)||!dataProperty(resource,name)||!Object.getOwnPropertyDescriptor(resource,name)!.enumerable)||
            !['id','text','generation'].every(name=>dataProperty(resource,name))||
            typeof resource.id!=='string'||resource.id.length>16384||ids.has(resource.id)||typeof resource.text!=='string'||resource.text.length>limits.bytes||
            !Number.isSafeInteger(resource.generation)||resource.generation<0||
            Object.hasOwn(resource,'identity')&&(typeof resource.identity!=='string'||resource.identity.length>16384)||
            Object.hasOwn(resource,'hasBom')&&typeof resource.hasBom!=='boolean'||
            Object.hasOwn(resource,'aliases')&&(!plainArray(resource.aliases,limits.resources)||resource.aliases.some((alias:unknown)=>typeof alias!=='string'||alias.length>16384)))return false;
        ids.add(resource.id);return true;
    });
}
function sameCapture(context:GraphContext,input:any):boolean {
    const captured=graphInput(context.graph);
    return captured.root===input.root&&captured.resources.length===input.resources.length&&captured.resources.every((resource,index)=>{
        const current=input.resources[index];
        return resource.id===current.id&&resource.text===current.text&&resource.generation===current.generation&&
            resource.identity===current.identity&&resource.hasBom===current.hasBom&&
            Object.hasOwn(resource,'identity')===Object.hasOwn(current,'identity')&&Object.hasOwn(resource,'hasBom')===Object.hasOwn(current,'hasBom')&&
            (resource.aliases===undefined?current.aliases===undefined:current.aliases?.length===resource.aliases.length&&resource.aliases.every((alias,index)=>alias===current.aliases[index]));
    });
}
/** Reuse the exact approved capture, including planner interpretation. */
export function graphInput(graph:ReferenceGraph,root=graph.root):GraphCapture {
    const captured=(graph as ReferenceGraph&{[ownedGraphCapture]?:GraphCapture})[ownedGraphCapture];
    if(!captured)throw new SourceError('capture.graph','The graph has no owned source capture');
    if(root===captured.root)return captured;
    const contexts=captured[planningOccurrences],planning=contexts?.get(captured.root);
    return Object.freeze({...captured,root,...(planning?{[planningOccurrences]:new Map([...contexts!,[root,planning]])}:{})});
}
export function parseResource(resource:Resource):SourceDocument {
    const previous=byResource.get(resource.id)?.get(resource.text);
    if(previous){recent.delete(previous);recent.set(previous,true);return previous.doc;}
    const doc=new SourceDocument(resource.text,resource.id,true);
    const cost=resource.text.length*6+doc.nodes.size*768;
    if(cost<=128*1024*1024){
        while(recent.size&&(recent.size>=limits.resources||parsedCost+cost>128*1024*1024)){
            const old=recent.keys().next().value!;
            recent.delete(old);parsedCost-=old.cost;
            const texts=byResource.get(old.doc.id)!;
            texts.delete(old.doc.text);
            if(!texts.size)byResource.delete(old.doc.id);
        }
        const parsed={doc,cost};
        let texts=byResource.get(resource.id);
        if(!texts){texts=new Map();byResource.set(resource.id,texts);}
        texts.set(resource.text,parsed);recent.set(parsed,true);parsedCost+=cost;
    }
    return doc;
}
export function createGraph(input: any) {
    const reusable=ordinaryCapture(input);
    if(reusable)for(const [context,cost]of contextualGraphs)if(sameCapture(context,input)){
        contextualGraphs.delete(context);contextualGraphs.set(context,cost);
        return {...context,exampleResources:new CapturedExampleResources(input.exampleResources)};
    }
    const docs:ReadonlyMap<string,SourceDocument> = new Map<string, SourceDocument>((input.resources as Resource[]).map(r => [r.id, parseResource(r)]));
    const root = docs.get(input.root);
    if (!root) throw new SourceError('inspect.root', 'The selected root is absent');
    const declaration = specificationDeclaration(root.root.value);
    if (declaration.status !== 'supported') throw new SourceError(declaration.code, declaration.message, root.dataNode(declaration.pointer)?.range);
    const family = declaration.specification.family;
    const contexts=input[planningOccurrences] as ReadonlyMap<string,readonly PlanningOccurrence[]>|undefined,planning=contexts?.get(input.root);
    const graph=ReferenceGraph.capture(docs, input.root, family, new Map(input.resources.map((r: Resource) => [r.id, r.aliases ?? []])), input.occurrences,planning);
    const resources=Object.freeze((input.resources as Resource[]).map(resource=>Object.freeze({...resource,...(resource.aliases?{aliases:Object.freeze([...resource.aliases])}:{} )})));
    const interpretations=contexts&&new Map([...contexts].map(([root,values])=>[root,Object.freeze(values.map(({resource,pointer,kind,family,dialect,expectedBase,metadataOnly})=>Object.freeze({resource,pointer,kind,family,dialect,...(expectedBase===undefined?{}:{expectedBase}),...(metadataOnly?{metadataOnly}:{} )})))] as const));
    const occurrences=input.occurrences&&Object.freeze((input.occurrences as GraphTarget[]).map(({resource,pointer,kind})=>Object.freeze({resource,pointer,kind})));
    Object.defineProperty(graph,ownedGraphCapture,{value:Object.freeze({root:input.root,resources,...(occurrences?{occurrences}:{}),...(interpretations?{[planningOccurrences]:interpretations}:{})})});
    if(reusable){
        let cost=resources.reduce((sum,resource)=>sum+(resource.id.length+resource.text.length)*6+(resource.identity?.length??0)*2+(resource.aliases??[]).reduce((size,alias)=>size+alias.length*2,0)+docs.get(resource.id)!.nodes.size*768,0);
        for(const scope of graph.interpretedScopes())cost+=768+(scope.resource.length+scope.pointer.length)*2;
        for(const reference of graph.references)cost+=512+(reference.dynamic?.candidates.length??0)*64;
        if(cost<=64*1024*1024){
            while(contextualGraphs.size&&(contextualGraphs.size>=4||contextualCost+cost>64*1024*1024)){
                const oldest=contextualGraphs.keys().next().value!;
                contextualCost-=contextualGraphs.get(oldest)!;contextualGraphs.delete(oldest);
            }
            contextualGraphs.set(Object.freeze({docs,family,graph}),cost);contextualCost+=cost;
        }
    }
    return {docs,family,exampleResources:new CapturedExampleResources(input.exampleResources),graph};
}

