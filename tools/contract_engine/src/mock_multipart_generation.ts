import {createHash} from 'node:crypto';
import {SourceDocument,SourceError} from './document';
import {mediaTypes} from './media_types';
import {decodeMultipartTransfer} from './multipart_transfer';
import {declaredPlainTextBytes} from './text_encoding';

const fail=(message:string):never=>{throw new SourceError('mock.multipart.unsupported',message,[0,0],'unsupported');};
const pct=(bytes:Buffer)=>Array.from(bytes,byte=>byte===32?'+':/[A-Za-z0-9._~-]/.test(String.fromCharCode(byte))?String.fromCharCode(byte):'%'+byte.toString(16).toUpperCase().padStart(2,'0')).join('');
export function mockUrlEncodedWire(model:any):Buffer {
  const doc=new SourceDocument(model.raw,'urn:busyapi:mock-form',true,'json');if(doc.issues.length)throw doc.issues[0];
  const output:string[]=[];
  const scalar=(node:any)=>{if(['object','array'].includes(node.kind))return fail('Nested styled form values have no RFC6570 serialization');return node.kind==='string'?node.value:doc.dataJson(node.pointer);};
  const pair=(name:string,value:string)=>output.push(pct(Buffer.from(name))+'='+value);
  for(const [name,physical]of doc.root.children){
   const node=doc.dataNode(physical.pointer)!,rule=model.declaration.encoding?.[name]??{};
   const styled=['style','explode','allowReserved'].some(key=>Object.hasOwn(rule,key));
   if(styled){
    const style=rule.style??'form',explode=rule.explode??(style==='form');
    if(style==='deepObject'){
     if(!explode||node.kind!=='object')fail('deepObject requires an exploded object');
     for(const [key,child]of node.children)pair(name+'['+key+']',pct(Buffer.from(scalar(doc.dataNode(child.pointer)))));
    }else if(node.kind==='array'){
     const values=[...node.children.values()].map(child=>pct(Buffer.from(scalar(doc.dataNode(child.pointer)))));
     if(explode)values.forEach(value=>pair(name,value));else pair(name,values.join(style==='spaceDelimited'?'%20':style==='pipeDelimited'?'|':','));
    }else if(node.kind==='object'){
     if(style!=='form')fail('This object form style has no serialization');
     const values=[...node.children].flatMap(([key,child])=>[pct(Buffer.from(key)),pct(Buffer.from(scalar(doc.dataNode(child.pointer))))]);
     if(explode)for(let index=0;index<values.length;index+=2)output.push(values[index]+'='+values[index+1]);else pair(name,values.join(','));
    }else pair(name,pct(Buffer.from(scalar(node))));
    continue;
   }
   const values=node.kind==='array'?[...node.children.values()].map(child=>doc.dataNode(child.pointer)!):[node];
   for(const [index,value]of values.entries()){
    const prepared=model.mediaValues?.[name]?.[index];if(typeof prepared==='string'){pair(name,prepared);continue;}
    const type=model.mediaTypes[name]??'text/plain',media=mediaTypes(type,false)[0],json=media.subtype==='json'||media.subtype.endsWith('+json');
    const text=json?doc.dataJson(value.pointer):scalar(value);
    pair(name,pct(json?Buffer.from(text):declaredPlainTextBytes(text,media.parameters.get('charset')??'utf-8')));
   }
  }return Buffer.from(output.join('&'));
}

/** Mock response framing consumes the same captured multipart directives as
 * Core. XML/Linkset leaves are already canonical codec bytes, never re-encoded. */
export function mockMultipartWire(tree:any,seed:string):{bytes:Buffer;mediaType:string} {
 let parts=0,total=0,serial=0;
 const quote=(value:string)=>{if(/[\r\n\0]/.test(value))fail('A generated MIME name contains prohibited controls');return '"'+value.replace(/["\\]/g,'\\$&')+'"';};
 const transfer=(bytes:Buffer,encoding:string)=>{
  const codec=encoding.toLowerCase();
  if(codec==='base64')return Buffer.from(bytes.toString('base64').match(/.{1,76}/g)?.join('\r\n')??'');
  if(codec==='quoted-printable')return Buffer.from(Array.from(bytes,byte=>'='+byte.toString(16).toUpperCase().padStart(2,'0')).join('').match(/.{1,72}/g)?.join('=\r\n')??'');
  if(!['binary','7bit','8bit'].includes(codec))return fail('This mock part needs an encoded schema string for its selected transfer codec');
  decodeMultipartTransfer(bytes,codec);return bytes;
 };
 const entity=(node:any,depth:number):{bytes:Buffer;mediaType:string}=>{
  if(depth>8)fail('Generated mock multipart exceeds eight nested levels');
  const media=mediaTypes(node.contentType,false)[0],prepared:{headers:string;bytes:Buffer}[]=[];
  for(const part of node.parts){
   if(++parts>2048)fail('Generated mock multipart exceeds 2048 parts');
   let bytes:Buffer,type=part.contentType;
   if(part.file!==undefined)fail('Mock multipart files require approved serialized external example bytes');
   if(part.children){const child=entity(part.children,depth+1);bytes=child.bytes;type=child.mediaType;}
   else if(part.urlencoded)bytes=mockUrlEncodedWire(part.urlencoded);
   else bytes=part.transfer.schemaEncoded?Buffer.from(part.text,'ascii'):Buffer.from(part.bytes,'base64');
   if(!part.transfer.schemaEncoded)bytes=transfer(bytes,part.transfer.encoding??'binary');
   const fields=[{name:'Content-Type',value:type},...(part.name===undefined?[]:[{name:'Content-Disposition',value:'form-data; name='+quote(part.name)}]),
    ...(part.transfer.encoding===undefined?[]:[{name:'Content-Transfer-Encoding',value:part.transfer.encoding}]),...part.headers];
   const headers=fields.map(field=>{if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(field.name)||/[\x00-\x08\x0a-\x1f\x7f]/.test(field.value))return fail('Generated MIME fields contain prohibited controls');return field.name+': '+field.value+'\r\n';}).join('');
   prepared.push({headers,bytes});
  }
  let boundary=media.parameters.get('boundary');
  for(let attempt=0;!boundary&&attempt<128;attempt++){
   const candidate='busyapi-'+createHash('sha256').update(seed+'#'+serial++).digest('hex').slice(0,40);
   if(prepared.every(part=>!part.bytes.includes(Buffer.from(candidate))&&!part.headers.includes(candidate)))boundary=candidate;
  }
  if(!boundary||prepared.some(part=>part.bytes.includes(Buffer.from('--'+boundary))))fail('No collision-free mock multipart boundary is available');
  const chunks:Buffer[]=[];
  for(const part of prepared)chunks.push(Buffer.from('--'+boundary+'\r\n'+part.headers+'\r\n'),part.bytes,Buffer.from('\r\n'));
  chunks.push(Buffer.from('--'+boundary+'--\r\n'));
  const bytes=Buffer.concat(chunks);total+=bytes.length;if(total>64*1024*1024)fail('Generated mock MIME bytes exceed 64 MiB');
  return {bytes,mediaType:media.parameters.has('boundary')?node.contentType:node.contentType+'; boundary='+boundary};
 };
 return entity(tree,0);
}
