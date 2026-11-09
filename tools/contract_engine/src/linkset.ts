import {SourceDocument,SourceError,limits} from './document';
import {isUri,isUriReference} from '@hyperjump/uri';

/** RFC 9264 data model. This codec only establishes representation validity;
 * the captured schema is still evaluated by the canonical runtime evaluator. */
export const linksetCodecRevision='1';
type International={value:string;language?:string};
type Target={href:string;[name:string]:unknown};
type Context={anchor?:string;[relation:string]:unknown};
export type Linkset={linkset:Context[]};
const token=/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const singleton=new Set(['media','title','type']);
function fail(message:string):never {throw new SourceError('runtime.linkset.syntax',message);}
function unsupported(message:string):never {throw new SourceError('runtime.linkset.unsupported',message,[0,0],'unsupported');}
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function uri(value:unknown,absolute=false):value is string {
 if(typeof value!=='string'||/[^\x21-\x7e]|[<>"\\]/.test(value))return value===''&&!absolute;
 try{return absolute?isUri(value):isUriReference(value);}catch{return false;}
}
function relation(value:string):boolean{return /^[a-z][a-z0-9.-]*$/.test(value)||uri(value,true);}
function international(value:unknown):value is International {
 return object(value)&&typeof value.value==='string'&&(value.language===undefined||typeof value.language==='string'&&/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(value.language))&&Object.keys(value).every(key=>['value','language'].includes(key));
}
export function validateLinkset(document:SourceDocument):Linkset {
 if(document.issues.length)throw document.issues[0];
 const value:unknown=document.root.value;
 if(!object(value)||Object.keys(value).length!==1||!Array.isArray(value.linkset))return fail('A linkset document requires a sole linkset array member');
 let count=0;
 for(const context of value.linkset){
  if(!object(context)||context.anchor!==undefined&&!uri(context.anchor))fail('A link context requires a URI-reference anchor when present');
  for(const [rel,targets]of Object.entries(context)){
   if(rel==='anchor')continue;
   if(!relation(rel)||!Array.isArray(targets))fail('A relation requires an array of link targets');
   for(const target of targets){
    if(++count>2048)throw new SourceError('limit.linkset.links','A linkset exceeds 2048 targets');
    if(!object(target)||!uri(target.href))fail('A link target requires a URI-reference href');
    for(const [name,attribute]of Object.entries(target)){
     if(name==='href')continue;
     if(!token.test(name)||['anchor','rel'].includes(name))fail('Invalid link target attribute name');
     if(singleton.has(name)){if(typeof attribute!=='string')fail('This link attribute requires a string');}
     else if(!Array.isArray(attribute)||!attribute.length||!attribute.every(item=>name.endsWith('*')?international(item):typeof item==='string'))fail('Repeatable link attributes require a nonempty array of correctly typed values');
    }
   }
  }
 }
 return value as unknown as Linkset;
}

/** Scan delimiters only outside quoted strings and URI references. Never use
 * split(',') for HTTP Link fields. CR/LF is allowed only in document whitespace. */
export function parseLinkset(text:string,id:string,header=false):SourceDocument {
 if(Buffer.byteLength(text)>limits.bytes)throw new SourceError('limit.linkset.bytes','Linkset exceeds the document limit');
 if(header&&/[\r\n]/.test(text)||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))fail('A linkset contains prohibited control characters');
 let p=0,links=0;
 const contexts:Context[]=[],byAnchor=new Map<string,Context>();
 const ws=()=>{while(/[ \t\r\n]/.test(text[p]??'')&&p<text.length)p++;};
 const word=()=>{const start=p;while(p<text.length&&/[!#$%&'*+.^_`|~0-9A-Za-z-]/.test(text[p]))p++;if(p===start)fail('Expected a Link parameter token');return text.slice(start,p);};
 const quoted=()=>{
  p++;let result='';
  while(p<text.length){const c=text[p++];if(c==='"')return result;if(c==='\\'){if(p===text.length)fail('Truncated quoted pair');const escaped=text[p++];if(/[\r\n]/.test(escaped))fail('Line breaks cannot occur in quoted values');result+=escaped;}else{if(/[\r\n]/.test(c))fail('Line breaks cannot occur in quoted values');result+=c;}}
  return fail('Unterminated quoted value');
 };
 ws();
 while(p<text.length){
  if(++links>2048)throw new SourceError('limit.linkset.links','A linkset exceeds 2048 links');
  if(text[p++]!=='<')fail('A link target must begin with <');
  const end=text.indexOf('>',p);if(end<0)fail('Unterminated link target');
  const href=text.slice(p,end);if(!uri(href))fail('Invalid target URI reference');p=end+1;ws();
  const params=new Map<string,string[]>();
  while(text[p]===';'){
   p++;ws();const name=word().toLowerCase();ws();const hasValue=text[p]==='=';if(hasValue){p++;ws();}
   const value=hasValue?(text[p]==='"'?quoted():word()):'';
   const previous=params.get(name)??[];previous.push(value);params.set(name,previous);ws();
  }
  const rels=params.get('rel');if(!rels?.length)fail('A link requires rel');
  // RFC 8288: subsequent rel/anchor/singleton occurrences are ignored.
  const anchor=params.get('anchor')?.[0];if(anchor!==undefined&&!uri(anchor))fail('Invalid anchor URI reference');
  const key=anchor===undefined?'absent':JSON.stringify(anchor);
  let context=byAnchor.get(key);if(!context){context=Object.create(null) as Context;if(anchor!==undefined)context.anchor=anchor;contexts.push(context);byAnchor.set(key,context);}
  const target:Target=Object.assign(Object.create(null),{href});
  for(const [name,values]of params){
   if(['rel','anchor'].includes(name))continue;
   if(singleton.has(name))target[name]=values[0];
   else if(name.endsWith('*'))target[name]=(name==='title*'?values.slice(0,1):values).map(value=>{
    const match=/^([^']+)'([^']*)'(.*)$/.exec(value);if(!match)fail('Malformed internationalized attribute');
    if(match![1].toLowerCase()!=='utf-8')unsupported('Internationalized Link attributes require the supported UTF-8 codec');
    if(!/^(?:[A-Za-z0-9!#$&+.^_`|~-]|%[0-9A-Fa-f]{2})*$/.test(match![3]))fail('Malformed RFC 8187 escaped value');
    let decoded:string;try{decoded=decodeURIComponent(match![3]);}catch{return fail('Invalid UTF-8 internationalized attribute');}
    return {value:decoded,...(match![2]?{language:match![2]}:{})};
   });
   else target[name]=values;
  }
  for(const rawRel of rels[0].split(/ +/)){
   const rel=/^[A-Za-z][A-Za-z0-9.-]*$/.test(rawRel)?rawRel.toLowerCase():rawRel;
   if(!relation(rel)||rel==='anchor')fail('Invalid relation type');
   const targets=(context![rel]??=[]) as Target[];targets.push(target);
  }
  if(p===text.length)break;
  if(text[p++]!==',')fail('Expected a comma between links');ws();if(p===text.length)fail('Trailing link separator');
 }
 const document=new SourceDocument(JSON.stringify({linkset:contexts}),id,true,'json');validateLinkset(document);return document;
}

export function encodeLinkset(document:SourceDocument,header=false):string {
 const value=validateLinkset(document),links:string[]=[];
 const quote=(value:string)=>{
  if(/[\x00-\x1f\x7f]/.test(value))return fail('A Link attribute contains prohibited control characters');
  if(/[^\x20-\x7e]/.test(value))return unsupported('Non-ASCII Link values require an internationalized attribute');
  return '"'+value.replace(/["\\]/g,'\\$&')+'"';
 };
 for(const context of value.linkset)for(const [rel,targets]of Object.entries(context)){
  if(rel==='anchor')continue;
  if(!(targets as Target[]).length)unsupported('An empty relation array has no equivalent HTTP Link serialization');
  for(const target of targets as Target[]){
   let link='<'+target.href+'>; rel='+quote(rel);
   if(context.anchor!==undefined)link+='; anchor='+quote(context.anchor);
   for(const [name,attribute]of Object.entries(target)){
    if(name==='href')continue;
    for(const item of Array.isArray(attribute)?attribute:[attribute]){
     if(name==='title*'&&Array.isArray(attribute)&&attribute.length>1)unsupported('Multiple title* values have no meaning-preserving HTTP Link serialization');
     if(name.endsWith('*')){
      const localized=item as International;
      const encoded=Array.from(Buffer.from(localized.value,'utf8'),byte=>/[A-Za-z0-9!#$&+.^_`|~-]/.test(String.fromCharCode(byte))?String.fromCharCode(byte):'%'+byte.toString(16).toUpperCase().padStart(2,'0')).join('');
      link+='; '+name+"=UTF-8'"+(localized.language??'')+"'"+encoded;
     }else link+='; '+name+'='+quote(item as string);
    }
   }
   links.push(link);
  }
 }
 const text=links.join(header?', ':',\n');
 if(Buffer.byteLength(text)>limits.bytes)throw new SourceError('limit.linkset.bytes','Encoded linkset exceeds the document limit');
 return text;
}
