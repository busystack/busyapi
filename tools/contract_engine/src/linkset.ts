import {SourceDocument,SourceError,limits} from './document';
import {isUri,isUriReference} from '@hyperjump/uri';

/** RFC 9264 data model. This codec only establishes representation validity;
 * the captured schema is still evaluated by the canonical runtime evaluator. */
export const linksetCodecRevision='2';
type International={value:string;language?:string};
type Target={href:string;[name:string]:unknown};
type Context={anchor?:string;[relation:string]:unknown};
export type Linkset={linkset:Context[]};
const token=/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const singleton=new Set(['media','title','type']);
// IANA Link Relations, snapshot 2026-06-12. No registry or profile is acquired at runtime.
// https://www.iana.org/assignments/link-relations/
const registeredRelations=new Set(`about acl alternate amphtml api-catalog appendix apple-touch-icon apple-touch-startup-image archives author blocked-by bookmark c2pa-manifest canonical chapter cite-as collection compression-dictionary contents convertedfrom copyright create-form current deprecation describedby describes disclosure dns-prefetch dpp duplicate edit edit-form edit-media enclosure external first geofeed glossary help hosts hub ice-server icon index intervalafter intervalbefore intervalcontains intervaldisjoint intervalduring intervalequals intervalfinishedby intervalfinishes intervalin intervalmeets intervalmetby intervaloverlappedby intervaloverlaps intervalstartedby intervalstarts item last latest-version license linkset lrdd manifest mask-icon me media-feed memento micropub modulepreload monitor monitor-group next next-archive nofollow noopener noreferrer opener openid2.local_id openid2.provider original p3pv1 payment pingback preconnect predecessor-version prefetch preload prerender prev preview previous prev-archive privacy-policy profile publication rdap-active rdap-bottom rdap-down rdap-top rdap-up related restconf replies ruleinput search section self service service-desc service-doc service-meta sip-trunking-capability sponsored start status stylesheet subsection successor-version sunset tag terms-of-service timegate timemap type ugc up version-history via webmention working-copy working-copy-of`.split(' '));
function fail(message:string):never {throw new SourceError('runtime.linkset.syntax',message);}
function unsupported(message:string):never {throw new SourceError('runtime.linkset.unsupported',message,[0,0],'unsupported');}
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function uri(value:unknown,absolute=false):value is string {
 if(typeof value!=='string'||/[^\x21-\x7e]|[<>"\\]/.test(value))return value===''&&!absolute;
 try{return absolute?isUri(value):isUriReference(value);}catch{return false;}
}
function relation(value:string):boolean{return /^[a-z][a-z0-9.-]*$/.test(value)||uri(value,true);}
const grandfatheredTags=new Set('en-gb-oed i-ami i-bnn i-default i-enochian i-hak i-klingon i-lux i-mingo i-navajo i-pwn i-tao i-tay i-tsu sgn-be-fr sgn-be-nl sgn-ch-de art-lojban cel-gaulish no-bok no-nyn zh-guoyu zh-hakka zh-min zh-min-nan zh-xiang'.split(' '));
/** A profile declares constraints; it never authorizes acquiring a URL. */
export function validateLinksetProfile(profile:string|undefined):void {
 if(profile!==undefined&&(!profile||profile.split(' ').some(value=>!uri(value,true))))fail('A Linkset profile requires a nonempty space-separated list of URIs');
}
// RFC 5646 syntax only; no registry/context acquisition is needed for parsing.
function languageTag(value:string):boolean {
 if(value.length>1024)throw new SourceError('limit.linkset.language','A language tag exceeds 1024 characters');
 const tag=value.toLowerCase();
 if(grandfatheredTags.has(tag))return true;
 if(/^x(?:-[a-z0-9]{1,8})+$/.test(tag))return true;
 if(!/^(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})(?:-[a-z]{4})?(?:-[a-z]{2}|-[0-9]{3})?(?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?$/.test(tag))return false;
 const variants=new Set<string>(),extensions=new Set<string>();let extension=false;
 for(const part of tag.split('-').slice(1)){
  if(part==='x')break;
  if(part.length===1){if(extensions.has(part))return false;extensions.add(part);extension=true;}
  else if(!extension&&(/^[a-z0-9]{5,8}$/.test(part)||/^[0-9][a-z0-9]{3}$/.test(part))){if(variants.has(part))return false;variants.add(part);}
 }return true;
}
function international(value:unknown):value is International {
 return object(value)&&typeof value.value==='string'&&(value.language===undefined||typeof value.language==='string'&&languageTag(value.language));
}
function linkMembers(rel:string,targets:unknown):boolean {
 return relation(rel)&&(registeredRelations.has(rel)||uri(rel,true)||Array.isArray(targets)&&targets.every(target=>object(target)&&uri(target.href)));
}
function extensionValues(name:string,value:unknown):boolean {
 return Array.isArray(value)&&value.length>0&&value.every(item=>name.endsWith('*')?international(item):typeof item==='string');
}
export function validateLinkset(document:SourceDocument):Linkset {
 if(document.issues.length)throw document.issues[0];
 const value:unknown=document.root.value;
 if(!object(value)||!Array.isArray(value.linkset))return fail('A linkset document requires a linkset array member');
 let count=0;
 for(const context of value.linkset){
  if(!object(context)||context.anchor!==undefined&&!uri(context.anchor))fail('A link context requires a URI-reference anchor when present');
  for(const [rel,targets]of Object.entries(context)){
   if(rel==='anchor')continue;
   if(!linkMembers(rel,targets))continue;
   if(!relation(rel)||!Array.isArray(targets))fail('A relation requires an array of link targets');
   for(const target of targets){
    if(++count>2048)throw new SourceError('limit.linkset.links','A linkset exceeds 2048 targets');
    if(!object(target)||!uri(target.href))fail('A link target requires a URI-reference href');
    for(const [name,attribute]of Object.entries(target)){
     if(name==='href')continue;
     if(!token.test(name))continue;
     if(['anchor','rel'].includes(name))fail('Invalid link target attribute name');
     if(!singleton.has(name)&&name!=='hreflang'&&!name.endsWith('*')&&!extensionValues(name,attribute))continue;
     if(singleton.has(name)){if(typeof attribute!=='string')fail('This link attribute requires a string');}
     else if(!Array.isArray(attribute)||name.endsWith('*')&&!attribute.length||!attribute.every(item=>name.endsWith('*')?international(item):typeof item==='string'))fail('Repeatable link attributes require an array of correctly typed values');
     if(name==='hreflang'&&(attribute as string[]).some(value=>!languageTag(value)))fail('A hreflang attribute requires well-formed language tags');
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
 if(/[^\x00-\x7f]/.test(text))fail('The textual Linkset representation permits only ASCII; use RFC 8187 for internationalized attributes');
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
   if(!hasValue&&(['rel','anchor','hreflang','media','title','type'].includes(name)||name.endsWith('*')))fail('This Link parameter requires an explicit value');
   if(name.endsWith('*')&&text[p]==='"')fail('RFC 8187 extended attributes cannot use quoted-string syntax');
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
 if(Object.keys(value).some(key=>key!=='linkset'))unsupported('Additional JSON Linkset metadata has no lossless textual representation');
 const quote=(value:string)=>{
  if(/[\x00-\x08\x0a-\x1f\x7f]/.test(value))return fail('A Link attribute contains prohibited control characters');
  if(/[^\x09\x20-\x7e]/.test(value))return unsupported('Non-ASCII Link values require an internationalized attribute');
  return '"'+value.replace(/["\\]/g,'\\$&')+'"';
 };
 for(const context of value.linkset)for(const [rel,targets]of Object.entries(context)){
  if(rel==='anchor')continue;
  if(!linkMembers(rel,targets)||!Array.isArray(targets))unsupported('Additional link context metadata has no lossless textual representation');
  if(!(targets as Target[]).length)unsupported('An empty relation array has no equivalent HTTP Link serialization');
  for(const target of targets as Target[]){
   let link='<'+target.href+'>; rel='+quote(rel);
   if(context.anchor!==undefined)link+='; anchor='+quote(context.anchor);
   for(const [name,attribute]of Object.entries(target)){
    if(name==='href')continue;
    if(!token.test(name)||!singleton.has(name)&&!extensionValues(name,attribute))unsupported('Additional target metadata has no lossless textual representation');
    for(const item of Array.isArray(attribute)?attribute:[attribute]){
     if(name==='title*'&&Array.isArray(attribute)&&attribute.length>1)unsupported('Multiple title* values have no meaning-preserving HTTP Link serialization');
     if(name.endsWith('*')){
      const localized=item as International;
      if(Object.keys(localized).some(key=>!['value','language'].includes(key)))unsupported('Additional internationalized attribute metadata has no lossless textual representation');
      if(Buffer.from(localized.value,'utf8').toString('utf8')!==localized.value)fail('Internationalized Link attributes require Unicode scalar values');
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

/** Link meaning is independent of context/relation grouping and object order;
 * relative references and absent versus explicit anchors remain distinct. */
export function linksetCorresponds(left:SourceDocument,right:SourceDocument):boolean {
 const canonical=(document:SourceDocument)=>{
  const value=validateLinkset(document);encodeLinkset(document);
  const stable=(value:any):string=>Array.isArray(value)?'['+value.map(stable).join(','):
   value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}':JSON.stringify(value);
  const links:string[]=[];
  for(const context of value.linkset)for(const [rel,targets]of Object.entries(context))if(rel!=='anchor')for(const target of targets as Target[])links.push(stable({anchor:context.anchor??null,rel,target}));
  return links.sort();
 };
 const a=canonical(left),b=canonical(right);return a.length===b.length&&a.every((value,index)=>value===b[index]);
}
