import {SourceDocument,SourceError,escape,type Node} from './document';
import {supportedSchemaDialect,type ReferenceGraph} from './reference_graph';
import {xmlInferredName} from './xml_semantics';
import {parseXml,xmlCharacters,xmlEscape,type XmlElement,type XmlText} from './xml_wire';

export type XmlBinding={graph:ReferenceGraph;schema:{resource:string;pointer:string}};
type Model={type:string;nullable:boolean;node:string;name?:string;namespace:string;prefix?:string;properties?:Map<string,Model>;items?:Model;prefixItems?:Model[];source:{resource:string;pointer:string}};
function invalid(message:string):never {throw new SourceError('runtime.xml.mapping',message);}
function model(binding:XmlBinding):Model {
 const {graph}=binding;let work=0;
 const build=(at:XmlBinding['schema'],depth=0,inherited?:string,defaultNamespace=''):Model=>{
  const scope=graph.scopeAs(at.resource,at.pointer,'schema'),value=graph.docs.get(at.resource)?.dataNode(at.pointer)?.value;
  const refuse=(message:string):never=>{const range=graph.docs.get(at.resource)?.dataNode(at.pointer)?.range??[0,0];throw new SourceError('runtime.xml.model.unsupported',message,range,'unsupported',{...at,range});};
  if(depth>=128||++work>2048)return refuse('XML schema interpretation exceeds its bounded graph budget');
  if(!scope||!supportedSchemaDialect(scope)||!value||typeof value!=='object'||Array.isArray(value))return refuse('XML requires an available supported schema resource with representation metadata');
  if(['allOf','anyOf','oneOf','if','$dynamicRef'].some(key=>Object.hasOwn(value,key)))return refuse('This composed schema does not establish one unambiguous XML interpretation');
  if(typeof value.$ref==='string'){
   const edge=graph.referenceAs(at.resource,at.pointer,'$ref','schema');
   if(edge?.resolution!=='resolved')return refuse('The XML schema reference is unresolved');
   const followed=build({resource:edge.targetResource!,pointer:edge.targetPointer!},depth+1,inherited,defaultNamespace);
   if(graph.referenceObject(value,scope))return followed;
   if(['type','properties','items','prefixItems'].some(key=>Object.hasOwn(value,key)))return refuse('XML structural reference siblings require a combined interpretation');
   if(!value.xml||!value.xml.nodeType||value.xml.nodeType==='none')return followed;
   if(followed.node!=='none')return refuse('XML node-producing reference siblings and target nodes require a combined interpretation');
   const xml=value.xml,inferred=xmlInferredName(graph,scope),node=xml.nodeType??'none';
   const name=xml.name??(inferred.kind==='missing'?inherited:inferred.name);
   if(['element','attribute'].includes(node)&&!name)return refuse('The XML reference wrapper has no authored or inferred name');
   return {...followed,node,name,namespace:xml.namespace??defaultNamespace,prefix:xml.prefix,source:at};
  }
  const types=typeof value.type==='string'?[value.type]:Array.isArray(value.type)?value.type:[];
  const nonnull=types.filter((type:string)=>type!=='null');
  if(nonnull.length>1)return refuse('Multiple non-null schema types give ambiguous XML scalar or structural interpretation');
  const type=nonnull[0]??(types.includes('null')?'null':value.properties?'object':undefined);
  if(!type)return refuse('The schema does not establish an XML value type');
  const xml=value.xml??{},modern=scope.family==='3.2';
  const node=modern&&xml.nodeType!==undefined?xml.nodeType:xml.attribute===true?'attribute':type==='array'&&xml.wrapped!==true?'none':'element';
  if(!['element','attribute','text','cdata','none'].includes(node))return refuse('Invalid XML node type');
  const inferred=xmlInferredName(graph,scope);
  const name=xml.name??(inferred.kind!=='missing'?inferred.name:inherited);
  if(['element','attribute'].includes(node)&&!name)return refuse('This XML node has no authored or schema-position name');
  const result:Model={type,nullable:types.includes('null')||scope.family==='3.0'&&value.nullable===true,node,name,namespace:xml.namespace??(node==='attribute'?'':defaultNamespace),prefix:xml.prefix,source:at};
  if(result.prefix&&!result.namespace)return refuse('An XML prefix requires a captured namespace binding');
  if(node==='attribute'&&result.namespace&&!result.prefix)return refuse('A namespaced XML attribute requires an explicit prefix');
  if(['attribute','text','cdata'].includes(node)&&['object','array'].includes(type))return refuse('An XML character node requires a primitive type');
  if(type==='object')result.properties=new Map(Object.keys(value.properties??{}).map(key=>[key,build({...at,pointer:at.pointer+'/properties/'+escape(key)},depth+1,undefined,result.node==='element'&&!result.prefix?result.namespace:defaultNamespace)]));
  if(type==='array'){
   if(Array.isArray(value.prefixItems))result.prefixItems=value.prefixItems.map((_:unknown,index:number)=>build({...at,pointer:at.pointer+'/prefixItems/'+index},depth+1,name,result.node==='element'&&!result.prefix?result.namespace:defaultNamespace));
   if(value.items&&typeof value.items==='object'&&!Array.isArray(value.items))result.items=build({...at,pointer:at.pointer+'/items'},depth+1,name,result.node==='element'&&!result.prefix?result.namespace:defaultNamespace);
   if(!result.items&&!result.prefixItems?.length)return refuse('XML array items have no captured representation schema');
  }
  return result;
 };
 return build(binding.schema);
}
const xsi='http://www.w3.org/2001/XMLSchema-instance';
function scalar(text:string,m:Model):string {
 if(m.type==='string')return JSON.stringify(text);
 if(m.type==='null'&&text==='null')return 'null';
 if(m.type==='boolean'&&['true','false'].includes(text))return text;
 if(['number','integer'].includes(m.type)&&/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(text))return text;
 return invalid('XML character data cannot be inverted to the captured primitive type');
}

export function decodeXml(bytes:Buffer,id:string,binding:XmlBinding,charset?:string):SourceDocument {
 // Structural validity is checked before schema mapping, even for an unavailable model.
 const root=parseXml(xmlCharacters(bytes,charset)),shape=model(binding);
 const read=(m:Model,nodes:(XmlElement|XmlText)[],parent?:XmlElement):string=>{
  if(m.node==='attribute'){
   const attribute=parent?.attributes.find(a=>a.name===m.name&&a.namespace===m.namespace);
   if(!attribute)return m.nullable?'null':invalid('Missing modeled XML attribute');
   return scalar(attribute.value,m);
  }
  let content=nodes,element:XmlElement|undefined;
  if(m.node==='element'){
   if(nodes.length!==1||nodes[0].kind!=='element')return invalid('Expected one modeled XML element');
   element=nodes[0];if(element.name!==m.name||element.namespace!==m.namespace)return invalid('XML expanded element name differs from its schema');
   const nil=element.attributes.find(a=>a.name==='nil'&&a.namespace===xsi);
   if(nil?.value==='true'||nil?.value==='1'){
    if(!m.nullable&&m.type!=='null'||element.children.length)return invalid('Invalid xsi:nil value or element content');return 'null';
   }
   content=element.children;parent=element;
  }
  if(m.type==='array'){
   const children=content.filter(n=>n.kind==='element'||n.kind==='cdata'||n.value.trim()!=='');
   // Explicit positional text retains whitespace, including mixed content.
   const ordered=m.prefixItems?.some(item=>['text','cdata'].includes(item.node))?content:children;
   return '['+ordered.map((n,index)=>{
    const item=m.prefixItems?.[index]??m.items;if(!item)return invalid('XML contains an unmodeled positional item');return read(item,[n],parent);
   }).join(',')+']';
  }
  if(m.type==='object'){
   const fields:string[]=[],used=new Set<XmlElement|XmlText>(),attributes=new Set<string>();
   for(const [key,child]of m.properties??[]){
    if(child.node==='attribute'){
     const attribute=parent?.attributes.find(a=>a.name===child.name&&a.namespace===child.namespace);
     if(attribute){fields.push(JSON.stringify(key)+':'+read(child,[],parent));attributes.add(JSON.stringify([child.name,child.namespace]));}
     else if(child.nullable)fields.push(JSON.stringify(key)+':null');continue;
    }
    let matches:(XmlElement|XmlText)[];
    if(child.node==='none'&&child.type==='array'){
     const item=child.items??child.prefixItems?.[0];
     if(!item||item.node!=='element')return invalid('An unwrapped XML array requires named element items');
     matches=content.filter(n=>n.kind==='element'&&n.name===item.name&&n.namespace===item.namespace);
    }else if(['text','cdata'].includes(child.node))matches=content.filter(n=>n.kind===child.node);
    else matches=content.filter(n=>n.kind==='element'&&n.name===child.name&&n.namespace===child.namespace);
    if(matches.some(n=>used.has(n)))return invalid('Two XML properties claim the same wire node');
    if(!matches.length){if(child.type==='array'&&child.node==='none')fields.push(JSON.stringify(key)+':[]');continue;}
    matches.forEach(n=>used.add(n));fields.push(JSON.stringify(key)+':'+read(child,matches,parent));
   }
   if(content.some(n=>!used.has(n)&&(n.kind==='element'||n.kind==='cdata'||n.value.trim()!=='')))return invalid('XML contains content without a modeled property');
   if(parent?.attributes.some(a=>!(a.namespace===xsi&&a.name==='nil')&&!attributes.has(JSON.stringify([a.name,a.namespace]))))return invalid('XML contains an unmodeled attribute');
   return '{'+fields.join(',')+'}';
  }
  if(element?.attributes.some(a=>!(a.namespace===xsi&&a.name==='nil')))return invalid('A primitive XML element has an unmodeled attribute');
  if(content.some(n=>n.kind==='element'||m.node==='cdata'&&n.kind!=='cdata'||m.node==='text'&&n.kind!=='text'))return invalid('XML node kind differs from its captured primitive representation');
  return scalar(content.map(n=>(n as XmlText).value).join(''),m);
 };
 const document=new SourceDocument(read(shape,[root]),id,true,'json');if(document.issues.length)throw document.issues[0];return document;
}

export function encodeXml(document:SourceDocument,binding:XmlBinding):Buffer {
 if(document.issues.length)throw document.issues[0];const shape=model(binding);
 const write=(m:Model,node:Node):string=>{
  if(node.kind==='null'){
   if(!m.nullable&&m.type!=='null')return invalid('Null has no captured XML interpretation');
   if(m.node==='attribute')return '';
  }else if(node.kind!==m.type&&!(m.type==='integer'&&node.kind==='number'))return invalid('Typed XML value differs from its captured schema type');
  const text=node.kind==='string'?node.value:document.dataJson(node.pointer);
  const qualified=m.prefix?m.prefix+':'+m.name:m.name;
  if(m.node==='attribute')return node.kind==='null'?'':' '+qualified+'="'+xmlEscape(text,true)+'"'+(m.prefix?' xmlns:'+m.prefix+'="'+xmlEscape(m.namespace,true)+'"':'');
  if(m.node==='text')return xmlEscape(text);
  if(m.node==='cdata')return '<![CDATA['+text.replace(/]]>/g,']]]]><![CDATA[>')+']]>';
  let content='',attributes='';
  if(node.kind==='object'){
   for(const [key,value]of node.children){const child=m.properties?.get(key);if(!child)return invalid('An XML property has no captured representation schema');const wire=write(child,document.dataNode(value.pointer)!);if(child.node==='attribute')attributes+=wire;else content+=wire;}
  }else if(node.kind==='array'){
   for(const [index,value]of node.children){const item=m.prefixItems?.[Number(index)]??m.items;if(!item)return invalid('An XML array item has no captured representation schema');content+=write(item,document.dataNode(value.pointer)!);}
  }else content=node.kind==='null'?'':xmlEscape(text);
  if(m.node==='none')return content;
  const namespace=m.namespace?' xmlns'+(m.prefix?':'+m.prefix:'')+'="'+xmlEscape(m.namespace,true)+'"':' xmlns=""';
  const declarations=new Map<string,string>();
  attributes=attributes.replace(/ xmlns:([^= ]+)="([^"]*)"/g,(literal,prefix,value)=>{
   if(!declarations.has(prefix)){declarations.set(prefix,value);return literal;}
   if(declarations.get(prefix)!==value)return invalid('Conflicting modeled attribute namespace prefixes');
   return '';
  });
  const nil=node.kind==='null'?' xmlns:xsi="'+xsi+'" xsi:nil="true"':'';
  return '<'+qualified+namespace+attributes+nil+(content?'>'+content+'</'+qualified+'>':'/>');
 };
 const text=write(shape,document.root);
 // Prove well-formedness, namespace bindings, and one document element before publication.
 parseXml(text);return Buffer.from(text,'utf8');
}
