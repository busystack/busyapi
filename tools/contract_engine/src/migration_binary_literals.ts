import {SourceDocument,SourceError,escape} from './document';
import type {BinaryStep} from './migration_binary';

export type BinaryPaths=readonly (readonly BinaryStep[])[];
export const binaryPathKey=(path:readonly BinaryStep[]):string=>JSON.stringify(path);

/** Exact equality compilation, not a byte codec. Only an empty octet value
 * has a content-independent raw spelling. Other JSON literals at a raw slot
 * are impossible, or require a byte-equality vocabulary the target lacks. */
export function binaryLiteralAssertion(doc:SourceDocument,pointer:string,paths:BinaryPaths,modernSource:boolean):string|undefined {
    let work=0;
    const visit=(at:string,selected:BinaryPaths):string|undefined=>{
        if(++work>50000)throw new SourceError('limit.migration.binary-literal','Binary literal projection exceeds 50000 exact literal nodes');
        const node=doc.dataNode(at)!;
        if(selected.some(path=>path.length===0)){
            if(modernSource)return '{"not":{}}';
            if(node.value==='')return '{"maxLength":0,"not":{"type":["null","boolean","object","array","number","string"]}}';
            if(node.kind!=='string'||[...(node.value as string)].some(character=>character.codePointAt(0)! > 255))return '{"not":{}}';
            return;
        }
        if(selected.some(path=>path[0]==='nested'))return;
        if(node.kind==='object'){
            const names=[...node.children.keys()],properties:string[]=[];
            let changed=false;
            for(const name of names){
                const next=selected.filter(path=>typeof path[0]==='object'&&path[0].property===name).map(path=>path.slice(1));
                if(next.length)changed=true;
                const assertion=visit(at+'/'+escape(name),next);if(assertion===undefined)return;
                if(assertion==='{"not":{}}')return assertion;
                properties.push(JSON.stringify(name)+':'+assertion);
            }
            if(!changed)return '{"const":'+doc.dataJson(at)+'}';
            return '{"type":"object","required":'+JSON.stringify(names)+',"additionalProperties":false,"properties":{'+properties.join(',')+'}}';
        }
        if(node.kind==='array'){
            const next=selected.filter(path=>path[0]==='item').map(path=>path.slice(1));
            if(!next.length||!node.children.size)return '{"const":'+doc.dataJson(at)+'}';
            const items:string[]=[];
            for(let index=0;index<node.children.size;index++){
                const assertion=visit(at+'/'+index,next);if(assertion===undefined)return;
                if(assertion==='{"not":{}}')return assertion;
                items.push(assertion);
            }
            return '{"type":"array","minItems":'+items.length+',"maxItems":'+items.length+',"prefixItems":['+items.join(',')+'],"items":false}';
        }
        return '{"const":'+doc.dataJson(at)+'}';
    };
    const assertion=visit(pointer,paths);
    // enum/const never contribute evaluated-property/item annotations. A
    // structural equality expansion must keep that property under unevaluated*.
    return assertion===undefined?undefined:'{"not":{"not":'+assertion+'}}';
}

/** Extract an exhaustive leaf-value superset from a containing finite domain.
 * Missing positions contribute no possible present value, including empty
 * arrays. A budget failure abandons the certificate instead of truncating it. */
export function binaryLiteralValues(doc:SourceDocument,pointer:string,path:readonly BinaryStep[]):readonly string[]|undefined {
    let work=0;
    const visit=(at:string,steps:readonly BinaryStep[]):string[]|undefined=>{
        if(++work>50000)throw new SourceError('limit.migration.binary-literal','Binary literal path inspection exceeds 50000 nodes');
        if(!steps.length)return [doc.dataJson(at)];
        const node=doc.dataNode(at)!,[step,...rest]=steps;
        if(step==='nested')return;
        if(step==='item'){
            if(node.kind!=='array')return [];
            const values:string[]=[];
            for(let index=0;index<node.children.size;index++){
                const items=visit(at+'/'+index,rest);if(items===undefined)return;
                values.push(...items);if(values.length>2048)return;
            }
            return values;
        }
        return node.kind==='object'&&node.children.has(step.property)?visit(at+'/'+escape(step.property),rest):[];
    };
    return visit(pointer,path);
}
