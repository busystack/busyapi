import {SourceDocument,SourceError} from './document';
import {mediaTypes} from './media_types';
import {declaredPlainTextBytes} from './text_encoding';

export const formPercent=(bytes:Buffer)=>Array.from(bytes,byte=>byte===32?'+':/[A-Za-z0-9._~-]/.test(String.fromCharCode(byte))?String.fromCharCode(byte):'%'+byte.toString(16).toUpperCase().padStart(2,'0')).join('');
const stylePercent=(text:string,reserved=false)=>{
 let encoded=encodeURIComponent(text).replace(/[!'()*]/g,character=>'%'+character.charCodeAt(0).toString(16).toUpperCase());
 if(reserved)encoded=encoded.replace(/%(3A|2F|3F|40|21|24|27|28|29|2A|2C|3B)/gi,token=>String.fromCharCode(parseInt(token.slice(1),16))).replace(/%25([0-9a-f]{2})/gi,'%$1');
 return encoded;
};

export const formFieldOmitted=(node:any,rule:any)=>node.kind==='array'&&node.children.size===0||['style','explode','allowReserved'].some(key=>Object.hasOwn(rule,key))&&node.kind==='object'&&node.children.size===0;

/** One exact URL-form recipe serves requests, mock responses and nested MIME
 * parts. Empty RFC6570 collections are absent; empty scalar strings remain. */
export function urlEncodedWire(model:any):Buffer {
 const doc=new SourceDocument(model.raw,'urn:busyapi:form-wire',true,'json');if(doc.issues.length)throw doc.issues[0];
 if(doc.root.kind!=='object')throw new SourceError('request.form.shape','URL-form data must be an object');
 const content:{name:string;index:number;wire:string}[]=[],styled:string[]=[];
 const fail=(message:string):never=>{throw new SourceError('request.form.style',message);};
 const scalar=(node:any):string=>{if(['object','array'].includes(node.kind))return fail('Nested RFC6570 values have no defined serialization');return node.kind==='string'?node.value:doc.dataJson(node.pointer);};
 for(const [name,physical]of doc.root.children){
  const node=doc.dataNode(physical.pointer)!,rule=Object.hasOwn(model.declaration.encoding??{},name)?model.declaration.encoding[name]:{},isStyled=['style','explode','allowReserved'].some(key=>Object.hasOwn(rule,key));
  if(formFieldOmitted(node,rule))continue;
  if(isStyled){
   const style=rule.style??'form',explode=rule.explode??(style==='form');
   if(!['form','spaceDelimited','pipeDelimited','deepObject'].includes(style))fail('Unsupported URL-form style');
   const pct=(value:string)=>stylePercent(value,rule.allowReserved===true),pair=(key:string,value:string)=>styled.push(stylePercent(key)+'='+value);
   if(style==='deepObject'){
    if(!explode||node.kind!=='object')fail('deepObject requires an object with explode enabled');
    for(const [key,child]of node.children)pair(name+'['+key+']',pct(scalar(doc.dataNode(child.pointer))));
   }else if(node.kind==='array'){
    const values=[...node.children.values()].map(child=>pct(scalar(doc.dataNode(child.pointer))));
    if(explode)values.forEach(value=>pair(name,value));else pair(name,values.join(style==='spaceDelimited'?pct(' '):style==='pipeDelimited'?pct('|'):','));
   }else if(node.kind==='object'){
    const values=[...node.children].flatMap(([key,child])=>[pct(key),pct(scalar(doc.dataNode(child.pointer)))]);
    if(explode)for(const [key,child]of node.children)pair(key,pct(scalar(doc.dataNode(child.pointer))));else pair(name,values.join(style==='spaceDelimited'?pct(' '):style==='pipeDelimited'?pct('|'):','));
   }else pair(name,pct(scalar(node)));
   continue;
  }
  const values=node.kind==='array'?[...node.children.values()].map(child=>doc.dataNode(child.pointer)!):[node];
  for(const [index,value]of values.entries()){
   let prepared=model.mediaValues?.[name]?.[index];
   if(typeof prepared!=='string'){
    const media=mediaTypes(model.mediaTypes[name]??'text/plain',false)[0],json=media.subtype==='json'||media.subtype.endsWith('+json'),text=json?doc.dataJson(value.pointer):scalar(value);
    prepared=formPercent(json?Buffer.from(text):declaredPlainTextBytes(text,media.parameters.get('charset')??'utf-8'));
   }
   content.push({name,index,wire:formPercent(Buffer.from(name))+'='+prepared});
  }
 }
 if(model.order){const order=new Map(model.order.map((value:any,index:number)=>[value.name+'\0'+value.index,index]));content.sort((left,right)=>Number(order.get(left.name+'\0'+left.index))-Number(order.get(right.name+'\0'+right.index)));}
 return Buffer.from([...content.map(value=>value.wire),...styled].join('&'));
}
