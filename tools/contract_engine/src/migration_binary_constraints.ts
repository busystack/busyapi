import {SourceError} from './document';
import {compare,decimal} from './exact_numbers';
import type {MigrationSource} from './migration_source';

/** A legacy opaque instance is the bijective Latin-1 octet view, not UTF-8
 * text. Modern raw instances have no JSON type or JSON literal spelling.
 * OAS 3.2 §4.14.3 permits maxLength as an octet-count streaming assertion;
 * BusyAPI implements it in the canonical adapter, including under applicators.
 * Keep the certificate deliberately explicit: pattern is not a byte matcher.
 */
export function rawConstraintBlocker(value:Record<string,any>):string|undefined {
    if(Object.hasOwn(value,'type')&&!(Array.isArray(value.type)?value.type:[value.type]).includes('string'))return;
    if(typeof value.pattern==='string'&&rawPatternBounds(value.pattern)===undefined)return 'pattern';
    for(const name of ['enum','const'])if(Object.hasOwn(value,name)){
        const literals=name==='enum'?value.enum:[value.const];
        if(!Array.isArray(literals))return name;
        if(literals.some(literal=>typeof literal==='string'&&literal.length>0&&
            [...literal].every(character=>character.codePointAt(0)! <= 255)))return name;
    }
    return;
}

/** A strict end assertion is required: ECMAScript `$` alone also accepts a
 * final line terminator, so it cannot certify an octet-length language. */
function rawPatternBounds(pattern:string):{minimum:bigint;maximum?:bigint}|undefined {
    if(['','^','(?:)','[\\s\\S]*','^[\\s\\S]*$'].includes(pattern))return {minimum:0n};
    const start='^[\\s\\S]',end='(?![\\s\\S])';
    if(pattern.endsWith('$'))pattern=pattern.slice(0,-1);
    if(!pattern.startsWith(start)||!pattern.endsWith(end))return;
    const count=pattern.slice(start.length,-end.length);
    if(count==='*')return {minimum:0n};
    if(count==='+')return {minimum:1n};
    if(count==='?')return {minimum:0n,maximum:1n};
    const match=/^\{([0-9]{1,128})(?:,([0-9]{0,128}))?\}$/.exec(count);
    if(!match)return;
    return {minimum:BigInt(match[1]),...(match[2]===''?{}:{maximum:BigInt(match[2]??match[1])})};
}

export function rawConstraintReason(value:Record<string,any>,field:string):'implementation'|'target-representation' {
    const metadata=new Set(['type','format','nullable','description','title','externalDocs','xml','default','example','deprecated','readOnly','writeOnly']);
    // Conjuncts may make a byte-sensitive assertion redundant or impossible.
    // Without that proof, refusal is missing evidence, not target impossibility.
    if(Object.keys(value).some(name=>name!==field&&!metadata.has(name)&&!name.startsWith('x-')))return 'implementation';
    if(field==='pattern'&&!/^\^?[A-Za-z0-9]+\$?$/.test(value.pattern))return 'implementation';
    return 'target-representation';
}

/** Literal containers that omit the selected byte position still compare the
 * same JSON values. Present byte positions require whole-literal projection;
 * absence is a proof, never a sampled comparison of example payloads. */
export function rawContainerLiteralUnchanged(value:Record<string,any>,path:readonly ({property:string}|'item'|'nested')[]):boolean {
    const reaches=(literal:any,steps:typeof path):boolean=>{
        if(!steps.length)return true;
        const [step,...rest]=steps;
        if(step==='nested')return true;
        if(step==='item')return Array.isArray(literal)&&literal.some(item=>reaches(item,rest));
        return literal!==null&&typeof literal==='object'&&!Array.isArray(literal)&&
            Object.hasOwn(literal,step.property)&&reaches(literal[step.property],rest);
    };
    return (!Object.hasOwn(value,'const')||!reaches(value.const,path))&&
        (!Array.isArray(value.enum)||!value.enum.some(literal=>reaches(literal,path)));
}

export function projectRawConstraints(source:MigrationSource,pointer:string,value:Record<string,any>,retain:(field:string)=>void):void {
    const append=(assertion:Record<string,unknown>)=>{
        const at=pointer+'/allOf';
        if(!source.doc.dataNode(at))source.set(at,[]);
        source.set(at+'/'+source.doc.dataNode(at)!.children.size,assertion);
    };
    const length=(maximum:bigint,negated=false)=>{
        const at=pointer+'/allOf';if(!source.doc.dataNode(at))source.set(at,[]);
        const branch=at+'/'+source.doc.dataNode(at)!.children.size;
        source.set(branch,negated?{not:{}}:{});
        source.exact(branch+(negated?'/not':'')+'/maxLength',maximum.toString());
    };
    if(Object.hasOwn(value,'type')){
        const types=Array.isArray(value.type)?value.type:[value.type];
        source.remove(pointer+'/type');
        if(!types.includes('string'))append({not:{}});
    }
    if(['binary','byte'].includes(value.format))source.remove(pointer+'/format');
    // nullable cannot add a JSON null alternative at an occurrence whose
    // decoder always supplies octets. Other JSON occurrences keep this field.
    source.remove(pointer+'/nullable');
    if(Object.hasOwn(value,'minLength')){
        const raw=source.doc.dataJson(pointer+'/minLength'),bound=decimal(raw);
        retain('minLength');
        if(compare(bound,decimal('0'))>0){
            // JSON Schema length bounds are integers. Build the predecessor
            // using the exact CST lexeme, never a rounded JavaScript number.
            if(bound.exponent<0n||bound.exponent>4096n)throw new SourceError('limit.migration.binary','The exact predecessor of the raw length bound exceeds the bounded arithmetic certificate');
            length(bound.coefficient*10n**bound.exponent-1n,true);
        }
    }
    if(Object.hasOwn(value,'pattern')){
        const bounds=rawPatternBounds(value.pattern);
        if(bounds){
            if(bounds.minimum>0n)length(bounds.minimum-1n,true);
            if(bounds.maximum!==undefined)length(bounds.maximum);
        }
        retain('pattern');
    }
    for(const name of ['enum','const'])if(Object.hasOwn(value,name)){
        const literals=name==='enum'?value.enum:[value.const];
        // Non-string JSON literals and strings outside the octet alphabet
        // never equal a legacy raw value. The remaining empty string has an
        // exact byte-domain spelling; nonempty octet literals were refused.
        append(literals.includes('')?{maxLength:0}:{not:{}});
        retain(name);
    }
}
