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
    return {docs,family,exampleResources:new CapturedExampleResources(input.exampleResources),graph};
}

