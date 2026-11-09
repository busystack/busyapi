import {SourceError,limits} from './document';

export const xmlWireRevision='1';
export type XmlText={kind:'text'|'cdata';value:string};
export type XmlElement={kind:'element';name:string;namespace:string;attributes:{name:string;namespace:string;value:string}[];children:(XmlElement|XmlText)[]};
function syntax(message:string):never {throw new SourceError('runtime.xml.syntax',message);}
function unsupported(message:string):never {throw new SourceError('runtime.xml.unsupported',message,[0,0],'unsupported');}
const validCharacter=(n:number)=>n===9||n===10||n===13||n>=32&&n<=0xd7ff||n>=0xe000&&n<=0xfffd||n>=0x10000&&n<=0x10ffff;
function characters(text:string):string {for(const c of text)if(!validCharacter(c.codePointAt(0)!))syntax('XML contains a prohibited character');return text;}
export function xmlEscape(text:string,attribute=false):string {
 characters(text);
 return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,attribute?'&quot;':'"').replace(/\r/g,'&#13;').replace(/\n/g,attribute?'&#10;':'\n').replace(/\t/g,attribute?'&#9;':'\t');
}
function entities(text:string):string {
 if(/&(?!(?:amp|lt|gt|apos|quot|#[0-9]+|#x[0-9a-fA-F]+);)/.test(text))syntax('Only predefined and numeric XML entities are permitted');
 return text.replace(/&([^;]+);/g,(_,name:string)=>{
  const predefined:Record<string,string>={amp:'&',lt:'<',gt:'>',apos:"'",quot:'"'};
  if(Object.hasOwn(predefined,name))return predefined[name];
  const n=name.startsWith('#x')?parseInt(name.slice(2),16):Number(name.slice(1));
  if(!validCharacter(n))return syntax('Invalid XML character reference');return String.fromCodePoint(n);
 });
}

/** RFC 7303: authoritative BOM, otherwise MIME charset, declaration and XML
 * autodetection. Fatal codecs never replace malformed octets. No I/O occurs. */
export function xmlCharacters(bytes:Buffer,charset?:string):string {
 if(bytes.length>limits.bytes)throw new SourceError('limit.xml.bytes','XML exceeds 16 MiB');
 const bom=bytes.subarray(0,3).equals(Buffer.from([239,187,191]))?'utf-8':bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':undefined;
 if(bytes.subarray(0,4).equals(Buffer.from([0,0,254,255]))||bytes.subarray(0,4).equals(Buffer.from([255,254,0,0])))unsupported('UTF-32 XML is not supported by the native codecs');
 const detected=bom??(bytes[0]===0&&bytes[1]===60?'utf-16be':bytes[0]===60&&bytes[1]===0?'utf-16le':undefined);
 const normalize=(label:string)=>({utf8:'utf-8',utf16:'utf-16','iso-8859-1':'iso-8859-1'}[label.toLowerCase()]??label.toLowerCase());
 let encoding=bom??(charset&&normalize(charset));
 if(encoding==='utf-16')encoding=detected??unsupported('UTF-16 XML requires a byte order indication');
 const declaration=bytes.subarray(0,1024).toString('latin1').match(/^<\?xml\s[^?]*encoding\s*=\s*['"]([^'"]+)['"]/i)?.[1];
 encoding??=detected??(declaration?normalize(declaration):'utf-8');
 if(!['utf-8','utf-16le','utf-16be','us-ascii','iso-8859-1'].includes(encoding))unsupported('The declared XML encoding has no supported native codec');
 let text:string;
 try{
  if(encoding==='us-ascii'){if(bytes.some(byte=>byte>127))syntax('Non-ASCII octets in ASCII XML');text=bytes.toString('ascii');}
  else if(encoding==='iso-8859-1')text=bytes.toString('latin1');
  else text=new TextDecoder(encoding,{fatal:true}).decode(bytes);
 }catch(error){if(error instanceof TypeError)return syntax('Malformed XML encoding');throw error;}
 const declared=text.match(/^<\?xml\s[^?]*encoding\s*=\s*['"]([^'"]+)['"]/i)?.[1];
 if(!bom&&!charset&&declared){const label=normalize(declared);if(label!==encoding&&!(label==='utf-16'&&encoding.startsWith('utf-16')))syntax('The XML encoding declaration conflicts with its detected encoding');}
 return characters(text).replace(/\r\n?/g,'\n');
}

/** Finite XML 1.0 document parser. DTDs and general entities are denied rather
 * than resolved. There is no entity table, resource resolver, or acquisition. */
export function parseXml(text:string):XmlElement {
 if(Buffer.byteLength(text)>limits.bytes)throw new SourceError('limit.xml.bytes','XML exceeds 16 MiB');
 characters(text);text=text.replace(/\r\n?/g,'\n');
 let p=0,nodes=0;
 const space=()=>{const start=p;while(/[ \t\n\r]/.test(text[p]??'')&&p<text.length)p++;return p>start;};
 // XML 1.0 Fifth Edition NameStartChar/NameChar, with colon separated QNames.
 const nc=/^[A-Z_a-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c-\u200d\u2070-\u218f\u2c00-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd\u{10000}-\u{effff}][A-Z_a-z0-9.\-\u00b7\u0300-\u036f\u203f-\u2040\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c-\u200d\u2070-\u218f\u2c00-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd\u{10000}-\u{effff}]*$/u;
 const name=()=>{const start=p;while(p<text.length&&!/[\s=/>?]/.test(text[p]))p++;const value=text.slice(start,p);if(value.split(':').length>2||!value.split(':').every(part=>nc.test(part)))syntax('Invalid XML qualified name');return value;};
 const misc=()=>{
  if(text.startsWith('<!--',p)){const end=text.indexOf('-->',p+4);if(end<0||text.slice(p+4,end).includes('--')||text[end-1]==='-')syntax('Malformed XML comment');p=end+3;return true;}
  if(text.startsWith('<?',p)){p+=2;const target=name();if(target.toLowerCase()==='xml')syntax('XML declaration is only permitted at the document start');if(!text.startsWith('?>',p)&&!space())syntax('A processing instruction target requires whitespace before content');const end=text.indexOf('?>',p);if(end<0)syntax('Unterminated processing instruction');p=end+2;return true;}
  return false;
 };
 if(text.startsWith('\ufeff'))p++;
 if(/^<\?xml[ \t\r\n]/.test(text.slice(p))){
  const end=text.indexOf('?>',p);if(end<0)syntax('Unterminated XML declaration');
  if(!/^<\?xml\s+version\s*=\s*(['"])1\.0\1(?:\s+encoding\s*=\s*(['"])[A-Za-z][A-Za-z0-9._-]*\2)?(?:\s+standalone\s*=\s*(['"])(?:yes|no)\3)?\s*\?>$/.test(text.slice(p,end+2)))syntax('Unsupported or malformed XML declaration');p=end+2;
 }
 const element=(inherited:Map<string,string>,depth:number):XmlElement=>{
  if(depth>=limits.depth)throw new SourceError('limit.xml.depth','XML nesting exceeds 128');
  if(++nodes>400000)throw new SourceError('limit.xml.nodes','XML exceeds 400000 nodes');
  if(text[p++]!=='<'||text[p]==='!')syntax('DTD and entity declarations are prohibited');
  const tag=name(),attributes:{raw:string;value:string}[]=[],names=new Set<string>(),ns=new Map(inherited);
  let separated=space();
  while(p<text.length&&text[p]!=='>'&&!text.startsWith('/>',p)){
   if(!separated)syntax('XML attributes require whitespace');const raw=name();if(names.has(raw))syntax('Duplicate XML attribute');names.add(raw);space();if(text[p++]!=='=')syntax('An XML attribute requires =');space();
   const quote=text[p++];if(!['"',"'"].includes(quote))syntax('An XML attribute must be quoted');const end=text.indexOf(quote,p);if(end<0)syntax('Unterminated attribute');const literal=text.slice(p,end);if(literal.includes('<'))syntax('An XML attribute cannot contain <');
   const value=entities(literal.replace(/[\t\n\r]/g,' '));p=end+1;
   if(raw==='xmlns'||raw.startsWith('xmlns:')){
    const prefix=raw==='xmlns'?'':raw.slice(6);
    if(prefix==='xmlns'||value==='http://www.w3.org/2000/xmlns/'||prefix==='xml'&&value!=='http://www.w3.org/XML/1998/namespace'||prefix!=='xml'&&value==='http://www.w3.org/XML/1998/namespace'||prefix!==''&&value==='')syntax('Invalid XML namespace binding');ns.set(prefix,value);
   }else attributes.push({raw,value});
   separated=space();
  }
  const expanded=(raw:string,attribute=false)=>{
   const parts=raw.split(':'),prefix=parts.length===2?parts[0]:undefined;
   if(prefix&&!ns.has(prefix))syntax('Undeclared XML namespace prefix');return {name:parts.at(-1)!,namespace:prefix?ns.get(prefix)!:attribute?'':ns.get('')??''};
  };
  const result:XmlElement={kind:'element',...expanded(tag),attributes:attributes.map(({raw,value})=>({...expanded(raw,true),value})),children:[]};
  const expandedNames=new Set(result.attributes.map(value=>JSON.stringify([value.name,value.namespace])));if(expandedNames.size!==attributes.length)syntax('Duplicate expanded XML attribute');
  if(text.startsWith('/>',p)){p+=2;return result;}if(text[p++]!=='>')syntax('Unterminated start tag');
  while(p<text.length){
   if(text.startsWith('</',p)){p+=2;const close=name();space();if(text[p++]!=='>'||close!==tag)syntax('Mismatched closing element');return result;}
   if(misc())continue;
   if(text.startsWith('<![CDATA[',p)){const end=text.indexOf(']]>',p+9);if(end<0)syntax('Unterminated CDATA');result.children.push({kind:'cdata',value:text.slice(p+9,end)});p=end+3;}
   else if(text[p]==='<')result.children.push(element(ns,depth+1));
   else{const next=text.indexOf('<',p),end=next<0?text.length:next;const value=text.slice(p,end);if(value.includes(']]>'))syntax('Text cannot contain ]]>');result.children.push({kind:'text',value:entities(value)});p=end;}
  }
  return syntax('Unterminated element');
 };
 space();while(misc())space();const root=element(new Map([['xml','http://www.w3.org/XML/1998/namespace']]),0);space();while(misc())space();if(p!==text.length)syntax('XML requires exactly one document element');return root;
}
