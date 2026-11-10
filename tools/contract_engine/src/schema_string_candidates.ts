/** Constructive, bounded suggestions for a deliberately finite regex subset.
 * No regex execution here and no validity claims: the original evaluator owns
 * the proof. Lookarounds, backreferences and Unicode properties are unavailable. */
export function patternCandidates(pattern:string,minimum=0,maximum=65536,unavailable?:(reason:string)=>void):string[] {
 if(pattern.length>4096||!Number.isSafeInteger(minimum)||minimum<0||minimum>65536){unavailable?.('pattern or length exceeds construction bounds');return [];}
 let at=0,work=0,bytes=0;
 const limit=()=>{if(++work>32768)throw Error('work');};
 const combine=(left:string[],right:string[])=>{
  const output:string[]=[];
  for(const a of left)for(const b of right){limit();if(a.length+b.length<=Math.min(maximum,65536)){bytes+=2*(a.length+b.length);if(bytes>8*1024*1024)throw Error('bytes');output.push(a+b);}if(output.length>=64)return [...new Set(output)];}
  return [...new Set(output)];
 };
 const escaped=():string[]=>{
  const char=pattern[at++];
  if(char===undefined)throw Error('escape');
  if(char==='d')return ['0','1','9'];
  if(char==='w')return ['a','A','0','_'];
  if(char==='s')return [' ','\t','\n'];
  if(char==='n')return ['\n'];if(char==='r')return ['\r'];if(char==='t')return ['\t'];
  if(char==='u'||char==='x'){
   const width=char==='u'?4:2,raw=pattern.slice(at,at+width);
   if(raw.length!==width||!/^[a-fA-F0-9]+$/.test(raw))throw Error('escape');at+=width;return [String.fromCharCode(parseInt(raw,16))];
  }
  if(/[A-Za-z0-9]/.test(char))throw Error('backreferences, Unicode properties and this escape are not constructed');
  return [char];
 };
 const atom=():string[]=>{
  limit();const char=pattern[at++];
  if(char==='('){if(pattern.slice(at,at+2)==='?:')at+=2;else if(pattern[at]==='?')throw Error('lookarounds and special groups are not constructed');const values=alternatives();if(pattern[at++]!==')')throw Error('group');return values;}
  if(char==='\\')return escaped();
  if(char==='['){
   if(pattern[at]==='^')throw Error('negated class');
   const values:string[]=[];
   while(at<pattern.length&&pattern[at]!==']'){
    const left=pattern[at++]==='\\'?escaped():[pattern[at-1]];
    if(pattern[at]==='-'&&pattern[at+1]!==']'){
     at++;const right=pattern[at++]==='\\'?escaped():[pattern[at-1]];
     if(left.length!==1||right.length!==1||left[0].codePointAt(0)! > right[0].codePointAt(0)!)throw Error('range');
     values.push(left[0],right[0]);
    }else values.push(...left);
    limit();
   }
   if(pattern[at++]!==']'||!values.length)throw Error('class');return [...new Set(values)].slice(0,16);
  }
  if(char==='.')return ['a','0',' '];
  if(char==='^'||char==='$')return [''];
  if(char===undefined||/[?*+{}\])]/.test(char))throw Error('atom');
  return [char];
 };
 const sequence=():string[]=>{
  let values=[''];
  while(at<pattern.length&&!['|',')'].includes(pattern[at])){
   const base=atom();let low=1,high=1;
   const quantifier=pattern[at];
   if(['?','*','+'].includes(quantifier)){at++;low=quantifier==='+'?1:0;high=quantifier==='?'?1:Math.max(low,minimum,1);}
   else if(quantifier==='{'){
    const match=/^\{([0-9]+)(?:,([0-9]*))?\}/.exec(pattern.slice(at));if(!match)throw Error('quantifier');at+=match[0].length;
    low=Number(match[1]);high=match[2]===undefined?low:match[2]===''?Math.max(low,minimum):Number(match[2]);
   }
   if(pattern[at]==='?')at++;
   if(low>high||high>65536)throw Error('bound');
   const counts=[...new Set([low,Math.min(high,Math.max(low,minimum)),Math.min(high,low+1),high])];
   const repeated:string[]=[];
   for(const count of counts)for(const seed of base){limit();if(seed.length*count<=maximum)repeated.push(seed.repeat(count));}
   values=combine(values,repeated);
  }
  return values;
 };
 const alternatives=():string[]=>{let values=sequence();while(pattern[at]==='|'){at++;values.push(...sequence());if(values.length>256)throw Error('alternatives');}return [...new Set(values)];};
 try {const values=alternatives();return at===pattern.length?values.filter(value=>[...value].length>=minimum&&[...value].length<=maximum).slice(0,256):[];}catch(error){unavailable?.(error instanceof Error?error.message:'unsupported syntax');return [];}
}
