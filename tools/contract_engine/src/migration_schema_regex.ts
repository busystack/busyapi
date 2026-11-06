/** Exact finite-language supersets for fully anchored ECMAScript patterns.
 * Unsupported syntax/budgets abandon the proof. The canonical evaluator
 * subsequently filters candidates, including `$`'s final-terminator behavior.
 * An unbounded quantifier is never replaced with a finite repetition limit. */
export function finiteRegexNameSuperset(pattern:string):readonly string[]|undefined {
    if(pattern.length>4096||!pattern.startsWith('^')||!pattern.endsWith('$'))return;
    const body=pattern.slice(1,-1);let offset=0,work=0,depth=0;
    const bounded=(values:readonly string[]):string[]|undefined=>{
        const names=[...new Set(values)];
        return names.length<=2048&&names.reduce((bytes,name)=>bytes+Buffer.byteLength(name),0)<=1024*1024?names:undefined;
    };
    const product=(left:readonly string[],right:readonly string[]):string[]|undefined=>{
        if(left.length*right.length>2048||++work>50000)return;
        return bounded(left.flatMap(a=>right.map(b=>a+b)));
    };
    const escaped=():string[]|undefined=>{
        const name=body[offset++];if(name===undefined)return;
        if('\\.*+?^$()[]{}|/-'.includes(name))return [name];
        const controls:Record<string,string>={n:'\n',r:'\r',t:'\t',f:'\f',v:'\v'};
        if(Object.hasOwn(controls,name))return [controls[name]];
        if(name==='d')return Array.from({length:10},(_,index)=>String(index));
        if(name==='w')return [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_'];
        const length=name==='x'?2:name==='u'?4:undefined;
        if(length!==undefined){
            if(name==='u'&&body[offset]==='{'){
                const end=body.indexOf('}',offset),hex=body.slice(offset+1,end);
                if(end<0||!/^([0-9a-fA-F]{1,6})$/.test(hex)||parseInt(hex,16)>0x10ffff)return;
                offset=end+1;return [String.fromCodePoint(parseInt(hex,16))];
            }
            const hex=body.slice(offset,offset+length);if(hex.length!==length||!/^[0-9a-fA-F]+$/.test(hex))return;
            offset+=length;return [String.fromCharCode(parseInt(hex,16))];
        }
    };
    const atom=():string[]|undefined=>{
        if(++work>50000)return;
        const token=body[offset++];if(token===undefined)return;
        if(token==='\\')return escaped();
        if(token==='('){
            if(++depth>128)return;
            if(body.slice(offset,offset+2)==='?:')offset+=2;
            else if(body[offset]==='?')return;
            const values=alternatives(true);depth--;if(body[offset++]!==')')return;return values;
        }
        if(token==='['){
            if(body[offset]==='^')return;
            const values:string[]=[];
            const character=():string[]|undefined=>{
                const start=body[offset++];if(start===undefined)return;
                if(start==='\\'){
                    const value=escaped();
                    // In a Unicode character class adjacent surrogate escapes
                    // can form one astral atom. Leave that syntax unproved.
                    return value?.some(value=>value.length===1&&value.charCodeAt(0)>=0xd800&&value.charCodeAt(0)<=0xdfff)?undefined:value;
                }
                const point=body.codePointAt(offset-1)!;
                if(point>0xffff)offset++;
                return [String.fromCodePoint(point)];
            };
            while(offset<body.length&&body[offset]!==']'){
                const first=character();if(!first)return;
                if(body[offset]==='-'&&body[offset+1]!==']'){
                    offset++;const last=character();
                    if(first.length!==1||last?.length!==1)return;
                    const low=first[0].codePointAt(0)!,high=last[0].codePointAt(0)!;
                    if(high<low||high-low>2047)return;
                    for(let point=low;point<=high;point++)values.push(String.fromCodePoint(point));
                }else values.push(...first);
                if(values.length>2048)return;
            }
            if(body[offset++]!==']')return;return bounded(values);
        }
        if('.*+?^$){}|]'.includes(token))return;
        const point=body.codePointAt(offset-1)!;
        if(point>0xffff){offset++;return [String.fromCodePoint(point)];}
        return [token];
    };
    const sequence=():string[]|undefined=>{
        let values=[''];
        while(offset<body.length&&![')', '|'].includes(body[offset])){
            const factor=atom();if(factor===undefined)return;
            let minimum=1,maximum=1;
            if(body[offset]==='?'){minimum=0;offset++;}
            else if(body[offset]==='{' ){
                const match=/^\{(\d+)(?:,(\d+))?\}/.exec(body.slice(offset));if(!match)return;
                minimum=Number(match[1]);maximum=Number(match[2]??match[1]);offset+=match[0].length;
                if(maximum<minimum||maximum>2048)return;
            }else if(['*','+'].includes(body[offset]))return;
            if(body[offset]==='?')offset++; // lazy finite repetition has the same language
            let repeated=[''],choices:string[]=[];
            for(let count=0;count<=maximum;count++){
                if(count>=minimum){choices.push(...repeated);if(choices.length>2048)return;}
                if(count<maximum){const next=product(repeated,factor);if(next===undefined)return;repeated=next;}
            }
            const next=product(values,choices);if(next===undefined)return;values=next;
        }
        return bounded(values);
    };
    const alternatives=(group:boolean):string[]|undefined=>{
        const first=sequence();if(first===undefined)return;const values=[...first];
        while(body[offset]==='|'){
            // ^a|b$ is not anchored as a whole and admits unbounded names.
            if(!group)return;
            offset++;const next=sequence();if(next===undefined)return;values.push(...next);
            if(values.length>2048)return;
        }
        return bounded(values);
    };
    const names=alternatives(false);if(names===undefined||offset!==body.length)return;
    // A superset avoids relying on a hand-implemented `$` assertion. Only the
    // captured canonical evaluator decides which final terminators match.
    const endings=['',...['\n','\r','\u2028','\u2029'],...['\n','\r','\u2028','\u2029'].flatMap(a=>['\n','\r','\u2028','\u2029'].map(b=>a+b))];
    return product(names,endings);
}

export const universalNamePatterns:ReadonlySet<string>=new Set(['','^','$','.*','[\\s\\S]*','^[\\s\\S]*$']);
