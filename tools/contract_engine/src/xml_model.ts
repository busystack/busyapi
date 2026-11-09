import {SourceDocument,SourceError,escape,limits,type Range,type Node} from './document';
import {decimal,compare} from './exact_numbers';
import {supportedSchemaDialect,type ReferenceGraph,type GraphTarget,type GraphReference} from './reference_graph';
import {projectSchemaReference} from './schema_reference_projection';
import {xmlInferredName} from './xml_semantics';
import {parseXml,xmlCharacters,xmlEscape,xmlBytes,type XmlElement,type XmlText} from './xml_wire';

export type XmlTarget={resource:string;pointer:string};
export type XmlBinding={graph:ReferenceGraph;schema:XmlTarget};
type Proof=(target:XmlTarget,document:SourceDocument,stack?:XmlTarget[])=>boolean|undefined;
const proofs=new WeakMap<ReferenceGraph,Proof>();
/** Installed only during the existing canonical evaluator's captured lifetime. */
export function bindXmlProof(graph:ReferenceGraph,proof:Proof):()=>void {proofs.set(graph,proof);return ()=>proofs.delete(graph);}
type Spec={targets:XmlTarget[];name?:string;namespace?:string;stack?:XmlTarget[];exclude?:Set<string>;implicit?:XmlTarget};
type Guard={target:XmlTarget;valid:boolean;present?:string};
type Clause={sources:XmlTarget[];guards:Guard[];stack:XmlTarget[]};
type Model={type:string;nullable:boolean;node:string;name?:string;namespace:string;prefix?:string;properties:Map<string,Spec>;required:Set<string>;items?:Spec;prefixItems:Spec[];guards:Guard[];source:XmlTarget;stack:XmlTarget[];wrapper?:Spec;wrapperOuter?:Map<string,Spec>;additional?:Spec;additionalAllowed:boolean;closedItems:boolean;minItems:number;maxItems:number;characterLength?:number};
const xsi='http://www.w3.org/2001/XMLSchema-instance';
function invalid(message:string):never {throw new SourceError('runtime.xml.mapping',message);}
function unavailable(message:string,at?:XmlTarget,graph?:ReferenceGraph):never {
 const range:Range=at&&graph?.docs.get(at.resource)?.dataNode(at.pointer)?.range??[0,0];
 throw new SourceError('runtime.xml.model.unsupported',message,range,'unsupported',at?{...at,range}:undefined);
}
const identity=(at:XmlTarget)=>JSON.stringify([at.resource,at.pointer]);
const data=(text:string)=>new SourceDocument(text,'urn:busyapi:xml-data',true,'json');
/** Semantic data equality retains exact decimal values, object membership and
 * array order. Lexical numeric normalization does not imply rounded equality. */
export function sameMediaData(left:SourceDocument,right:SourceDocument):boolean {
 const equal=(a:Node,b:Node):boolean=>{
  if(a.kind!==b.kind)return false;
  if(a.kind==='number')return compare(decimal(left.dataJson(a.pointer)),decimal(right.dataJson(b.pointer)))===0;
  if(['array','object'].includes(a.kind))return a.children.size===b.children.size&&[...a.children].every(([key,node])=>{const other=b.children.get(key);return other!==undefined&&equal(left.dataNode(node.pointer)!,right.dataNode(other.pointer)!);});
  return a.value===b.value;
 };return equal(left.root,right.root);
}

function mergeXmlObjects(left:string,right:string):string {
 const a=data(left),b=data(right);
 if(a.root.kind!=='object'||b.root.kind!=='object')return invalid('XML reference siblings require object data');
 const values=new Map<string,string>();
 for(const [name,node]of a.root.children)values.set(name,a.dataJson(node.pointer));
 for(const [name,node]of b.root.children){
  const value=b.dataJson(node.pointer),previous=values.get(name);
  if(previous!==undefined&&!sameMediaData(data(previous),data(value)))return unavailable('XML reference nodes disagree on the value of '+name);
  values.set(name,value);
 }
 return '{'+[...values].map(([name,value])=>JSON.stringify(name)+':'+value).join(',')+'}';
}

type Decisions={choices:number[];widths:number[];cursor:number;normalizations:boolean[];hint?:SourceDocument;uncertain?:SourceError};
type Budget={work:number;proofs:number};
function interpreter(binding:XmlBinding,asciiText=false,decisions?:Decisions,budget:Budget={work:0,proofs:0}){
 const {graph}=binding;let candidates=0;
 const consume=()=>{if(++budget.work>200000)throw new SourceError('limit.xml.work','XML interpretation exceeds 200000 node/schema steps');};
 const proof=(at:XmlTarget,document:SourceDocument,stack?:XmlTarget[])=>{
  consume();if(++budget.proofs>2048)throw new SourceError('limit.xml.proofs','XML branch selection exceeds 2048 canonical proofs');const result=proofs.get(graph)?.(at,document,stack);
  if(result===undefined)return unavailable('Applicable XML schema interpretation requires the captured canonical evaluator',at,graph);
  return result;
 };
 const scope=(at:XmlTarget)=>{
  const result=graph.scopeAs(at.resource,at.pointer,'schema');
  if(!result||!supportedSchemaDialect(result))return unavailable('XML schema dialect or resource is unavailable',at,graph);
  return result;
 };
 const referenceTarget=(edge:GraphReference,entered:XmlTarget[]):XmlTarget=>{
  const projection=projectSchemaReference(edge);
  if(projection.state==='unresolved')return unavailable('XML reference is unresolved: '+projection.resolution,edge,graph);
  if(projection.state==='fixed')return projection.target;
  return entered.map(owner=>{const ownerScope=scope(owner);return projection.candidates.find(candidate=>{const candidateScope=scope(candidate);return candidateScope.resource===ownerScope.resource&&candidateScope.resourcePointer===ownerScope.resourcePointer;});}).find(Boolean)??{resource:edge.targetResource!,pointer:edge.targetPointer!};
 };
 const product=(left:Clause[],right:Clause[])=>{
  if(left.length*right.length>256)throw new SourceError('limit.xml.alternatives','XML interpretation exceeds 256 alternatives');
  return left.flatMap(a=>right.map(b=>({sources:[...a.sources,...b.sources],guards:[...a.guards,...b.guards],stack:[...new Map([...a.stack,...b.stack].map(at=>[identity(at),at])).values()]})));
 };
 // Only same-instance applicators expand here. Property/item schemas remain
 // captured targets and are interpreted lazily as finite instance nodes arrive.
 const clauses=(at:XmlTarget,stack:XmlTarget[],active=new Set<string>()):Clause[]=>{
  consume();const key=identity(at);if(active.has(key))return [{sources:[],guards:[],stack}];
  const next=new Set(active).add(key),s=scope(at),value=graph.docs.get(at.resource)?.dataNode(at.pointer)?.value;
  if(value===true||value===false)return [{sources:[at],guards:[],stack}];
  if(!value||typeof value!=='object')return unavailable('XML schema resource is unavailable',at,graph);
  const entered=[...stack,at];let result:Clause[]=[{sources:[at],guards:[],stack:entered}];
  for(const keyword of ['$ref','$dynamicRef'])if(typeof value[keyword]==='string'){
   const edge=graph.referenceAs(at.resource,at.pointer,keyword,'schema');
   if(!edge)return unavailable('XML reference has no canonical graph binding',at,graph);
   const target=referenceTarget(edge,entered);
   const followed=clauses(target,entered,next);
   if(graph.referenceObject(value,s))return followed;
   result=product(result,followed);
  }
  if(Array.isArray(value.allOf))for(const index of value.allOf.keys())result=product(result,clauses({...at,pointer:at.pointer+'/allOf/'+index},entered,next));
  for(const keyword of ['anyOf','oneOf'])if(Array.isArray(value[keyword])&&graph.scopeAs(at.resource,at.pointer+'/'+keyword+'/0','schema')){
   const alternatives=value[keyword].flatMap((_:unknown,index:number)=>{
    const target={...at,pointer:at.pointer+'/'+keyword+'/'+index};
    return clauses(target,entered,next).map(choice=>({...choice,guards:[...choice.guards,{target,valid:true}]}));
   });result=product(result,alternatives);
  }
  if(value.if!==undefined&&graph.scopeAs(at.resource,at.pointer+'/if','schema')){
   const condition={...at,pointer:at.pointer+'/if'};
   const alternatives=[['then',true],['else',false]].flatMap(([keyword,valid])=>{
    const branches=value[keyword as string]===undefined?[{sources:[],guards:[],stack:entered}]:clauses({...at,pointer:at.pointer+'/'+keyword},entered,next);
    return branches.map(choice=>({...choice,guards:[...choice.guards,{target:condition,valid:valid as boolean}]}));
   });result=product(result,alternatives);
  }
  for(const name of Object.keys(value.dependentSchemas??{})){
   const child={...at,pointer:at.pointer+'/dependentSchemas/'+escape(name)};
   if(!graph.scopeAs(child.resource,child.pointer,'schema'))continue;
   result=product(result,[
    {sources:[],guards:[{target:at,present:name,valid:false}],stack:entered},
    ...clauses(child,entered,next).map(choice=>({...choice,guards:[...choice.guards,{target:at,present:name,valid:true}]}))
   ]);
  }
  return result;
 };
 // Property presence selects dependentSchemas' XML interpretation; all of its
 // assertions still belong exclusively to the canonical evaluator.
 const guardMatches=(guard:Guard,document:SourceDocument,stack?:XmlTarget[])=>
  (guard.present!==undefined?document.root.kind==='object'&&document.root.children.has(guard.present):proof(guard.target,document,stack))===guard.valid;
 const models=(spec:Spec,instance?:SourceDocument):Model[]=>{
  if(spec.implicit){
   if(!spec.name)return unavailable('Implicit XML array items have no inferred property or component name; declare items.xml.name',spec.implicit,graph);
   return ['string','number','boolean','null'].map(type=>({type,nullable:false,node:'element',name:spec.name,namespace:spec.namespace??'',properties:new Map<string,Spec>(),required:new Set<string>(),prefixItems:[],guards:[],source:spec.implicit!,stack:spec.stack??[],additionalAllowed:true,closedItems:false,minItems:0,maxItems:Infinity}));
  }
  let combinations:Clause[]=[{sources:[],guards:[],stack:spec.stack??[]}];
  for(const target of spec.targets)combinations=product(combinations,clauses(target,spec.stack??[]));
  return combinations.flatMap(choice=>{
   if(instance&&choice.guards.some(guard=>!guardMatches(guard,instance,choice.stack)))return [];
   consume();const source=spec.targets[0],all=[...new Map(choice.sources.map(at=>[identity(at),at])).values()];
   const entries=all.map(at=>({at,value:graph.docs.get(at.resource)!.dataNode(at.pointer)!.value,s:scope(at)})).filter(entry=>entry.value&&typeof entry.value==='object');
   const primary=entries[0];if(!primary)return models({...spec,implicit:source}).map(model=>({...model,guards:choice.guards,stack:choice.stack}));
   let types:Set<string>|undefined;let nullable=true;
   for(const {value,s}of entries){
    const declared=typeof value.type==='string'?[value.type]:Array.isArray(value.type)?value.type:undefined;
    if(declared){const allowed=new Set<string>(declared);if(s.family==='3.0'&&value.nullable===true)allowed.add('null');nullable&&=allowed.has('null');
     types=types?new Set([...types].filter(type=>allowed.has(type)||type==='integer'&&allowed.has('number')||type==='number'&&allowed.has('integer'))):allowed;}
   }
   const nonnull=[...(types??[])].filter(type=>type!=='null');
   const constant=entries.find(e=>['3.1','3.2'].includes(e.s.family)&&Object.hasOwn(e.value,'const')||Array.isArray(e.value.enum)&&e.value.enum.length===1);
   const constantValue=constant?(Object.hasOwn(constant.value,'const')?constant.value.const:constant.value.enum[0]):undefined;
   const constantType=constant?(constantValue===null?'null':Array.isArray(constantValue)?'array':typeof constantValue):undefined;
   const inferredType=entries.some(e=>e.value.properties!==undefined)?'object':entries.some(e=>e.value.items!==undefined||e.value.prefixItems!==undefined)?'array':constantType;
   const typeChoices=nonnull.length?nonnull:types?.has('null')?['null']:inferredType?[inferredType]:types?[]:['string','number','boolean','null'];
   if(!typeChoices.length)return unavailable('XML schema combinations do not establish a data type',source,graph);
   return typeChoices.map(type=>{
   const xml:Record<string,unknown>={};
   for(const {at,value}of [...entries].reverse())for(const [key,item]of Object.entries(value.xml??{})){
    if(Object.hasOwn(xml,key)&&xml[key]!==item&&at!==primary.at&&primary.value.xml?.[key]===undefined)return unavailable('Applicable schemas declare conflicting XML '+key,at,graph);
    xml[key]=item;
   }
   const reference=typeof primary.value.$ref==='string'||typeof primary.value.$dynamicRef==='string';
   const node=primary.s.family==='3.2'&&xml.nodeType!==undefined?xml.nodeType as string:xml.attribute===true?'attribute':type==='array'&&xml.wrapped!==true?'none':'element';
   let inferred=xmlInferredName(graph,primary.s),name=xml.name as string??(inferred.kind!=='missing'?inferred.name:spec.name);
   if(primary.s.family==='3.2'&&['element','attribute'].includes(primary.value.xml?.nodeType)&&primary.value.xml?.name===undefined&&inferred.kind==='missing')return unavailable('This explicit XML node requires its own authored name',primary.at,graph);
   if(!name)for(const {s}of entries){inferred=xmlInferredName(graph,s);if(inferred.kind!=='missing'){name=inferred.name;break;}}
   if(['element','attribute'].includes(node)&&!name)return unavailable('XML node has no authored or schema-position name',source,graph);
   const namespace=xml.namespace as string??(node==='attribute'?'':spec.namespace??''),prefix=xml.prefix as string|undefined;
   if(prefix&&!namespace)return unavailable('XML prefix has no namespace binding',source,graph);
   const result:Model={type,nullable:types===undefined?false:nullable,node,name,namespace,prefix,properties:new Map(),required:new Set(),prefixItems:[],guards:choice.guards,source,stack:choice.stack,additionalAllowed:!entries.some(e=>e.value.additionalProperties===false),closedItems:entries.some(e=>e.value.items===false),minItems:Math.max(0,...entries.map(e=>typeof e.value.minItems==='number'?e.value.minItems:0)),maxItems:Math.min(Infinity,...entries.map(e=>typeof e.value.maxItems==='number'?e.value.maxItems:Infinity))};
   if(['attribute','text','cdata'].includes(node)&&['array','object'].includes(type))return unavailable('XML character nodes require an established primitive-to-text interpretation',source,graph);
   if(type==='string'){
    const constants=entries.flatMap(e=>['3.1','3.2'].includes(e.s.family)&&typeof e.value.const==='string'?[e.value.const]:Array.isArray(e.value.enum)&&e.value.enum.length===1&&typeof e.value.enum[0]==='string'?[e.value.enum[0]]:[]);
    const minimum=Math.max(0,...entries.map(e=>typeof e.value.minLength==='number'?e.value.minLength:0)),maximum=Math.min(Infinity,...entries.map(e=>typeof e.value.maxLength==='number'?e.value.maxLength:Infinity));
    if(constants.length&&constants.every(value=>value===constants[0]))result.characterLength=[...constants[0]].length;
    else if(minimum===maximum&&Number.isSafeInteger(minimum))result.characterLength=minimum;
   }
   if(constantType==='object'&&constantValue)for(const key of Object.keys(constantValue))result.required.add(key);
   const childNamespace=node==='element'&&!prefix?namespace:spec.namespace??'';
   const add=(existing:Spec|undefined,target:XmlTarget,name?:string):Spec=>({targets:[...(existing?.targets??[]),target],name,namespace:childNamespace,stack:choice.stack});
   for(const {at,value}of entries){
    for(const key of value.required??[])result.required.add(key);
    for(const key of Object.keys(value.properties??{}))result.properties.set(key,add(result.properties.get(key),{...at,pointer:at.pointer+'/properties/'+escape(key)},key));
    if(value.items&&typeof value.items==='object'&&!Array.isArray(value.items))result.items=add(result.items,{...at,pointer:at.pointer+'/items'},name);
    if(Array.isArray(value.items))value.items.forEach((_:unknown,index:number)=>result.prefixItems[index]=add(result.prefixItems[index],{...at,pointer:at.pointer+'/items/'+index},name));
    if(Array.isArray(value.items)&&value.additionalItems&&typeof value.additionalItems==='object')result.items=add(result.items,{...at,pointer:at.pointer+'/additionalItems'},name);
    if(Array.isArray(value.items)&&value.additionalItems===false)result.closedItems=true;
    if(Array.isArray(value.prefixItems))value.prefixItems.forEach((_:unknown,index:number)=>result.prefixItems[index]=add(result.prefixItems[index],{...at,pointer:at.pointer+'/prefixItems/'+index},name));
    if(value.additionalProperties&&typeof value.additionalProperties==='object')result.additional=add(result.additional,{...at,pointer:at.pointer+'/additionalProperties'});
   }
   if(type==='array'&&!result.items&&!result.closedItems){const inferred=xmlInferredName(graph,primary.s);result.items={targets:[],implicit:source,name:inferred.kind==='missing'?spec.name:inferred.name,namespace:childNamespace,stack:choice.stack};}
   // An explicit node on a reference creates a wrapper around its target's
   // node, when that target produces one. Reference defaults themselves are none.
   if(primary.s.family==='3.2'&&reference){
    const edge=graph.referenceAs(primary.at.resource,primary.at.pointer,typeof primary.value.$ref==='string'?'$ref':'$dynamicRef','schema');
    if(edge?.resolution==='resolved'){
     const target=referenceTarget(edge,choice.stack);
     let nodeTarget=target,targetValue=graph.docs.get(target.resource)?.dataNode(target.pointer)?.value;
     const forwarding=new Set<string>();
     while(targetValue&&(targetValue.$ref||targetValue.$dynamicRef)&&!Object.keys(targetValue.properties??{}).length&&!['allOf','oneOf','anyOf','if'].some(key=>targetValue[key]!==undefined)&&!targetValue.xml?.nodeType){
      const key=identity(nodeTarget);if(forwarding.has(key)||forwarding.size>=128)return unavailable('XML reference forwarding has no finite node interpretation',nodeTarget,graph);forwarding.add(key);
      const next=graph.referenceAs(nodeTarget.resource,nodeTarget.pointer,targetValue.$ref?'$ref':'$dynamicRef','schema');
      if(next?.resolution!=='resolved')return unavailable('XML reference forwarding is unresolved',nodeTarget,graph);
      nodeTarget=referenceTarget(next,choice.stack);targetValue=graph.docs.get(nodeTarget.resource)?.dataNode(nodeTarget.pointer)?.value;
     }
     const targetNode=targetValue?.xml?.nodeType??(targetValue?.xml?.attribute===true?'attribute':targetValue?.$ref||targetValue?.$dynamicRef||result.type==='array'&&targetValue?.xml?.wrapped!==true?'none':'element');
     const own=primary.value.xml;
     const hasOwnProperties=Object.keys(primary.value.properties??{}).length>0;
     if((own?.nodeType==='element'||hasOwnProperties)&&(targetNode!=='none'||!!targetValue?.$ref||!!targetValue?.$dynamicRef)){
      result.node=own?.nodeType==='element'?'element':'none';
      result.namespace=own?.namespace??spec.namespace??'';result.prefix=own?.prefix;
      result.wrapper={targets:[target],namespace:result.prefix?spec.namespace:result.namespace,stack:choice.stack};
      result.wrapperOuter=new Map();
      for(const {at,value}of entries)if(at.resource===primary.at.resource&&(at.pointer===primary.at.pointer||at.pointer.startsWith(primary.at.pointer+'/allOf/')||at.pointer.startsWith(primary.at.pointer+'/anyOf/')||at.pointer.startsWith(primary.at.pointer+'/oneOf/')||at.pointer.startsWith(primary.at.pointer+'/then')||at.pointer.startsWith(primary.at.pointer+'/else')))for(const key of Object.keys(value.properties??{}))result.wrapperOuter.set(key,add(result.wrapperOuter.get(key),{...at,pointer:at.pointer+'/properties/'+escape(key)},key));
     }
     else if(own?.nodeType==='none'||!own?.nodeType){
      // Forward the target's node metadata while retaining every sibling assertion.
      result.node=targetNode;
      const targetScope=scope(nodeTarget),targetName=xmlInferredName(graph,targetScope);
      result.name=targetValue?.xml?.name??(targetName.kind!=='missing'?targetName.name:spec.name);
      result.namespace=targetValue?.xml?.namespace??spec.namespace??'';
      result.prefix=targetValue?.xml?.prefix;
     }
    }
   }
   if(result.node==='none'&&!['object','array'].includes(result.type))return unavailable('This primitive nodeType none has no character or child-node representation',source,graph);
   const effectiveNamespace=result.node==='element'&&!result.prefix?result.namespace:spec.namespace??'';
   for(const child of [...result.properties.values(),...(result.wrapperOuter?.values()??[]),...result.prefixItems,...(result.items?[result.items]:[]),...(result.additional?[result.additional]:[])])child.namespace=effectiveNamespace;
   return result;
   });
  });
 };
 const accepts=(m:Model,document:SourceDocument)=>m.guards.every(guard=>guardMatches(guard,document,m.stack));
 const choose=(width:number,normalization=false)=>{
  if(!Number.isSafeInteger(width)||width<1)invalid('XML interpretation has no finite applicable choice');
  if(width===1)return 0;
  if(width>256)throw new SourceError('limit.xml.alternatives','XML node selection exceeds 256 alternatives');
  if(!decisions)return unavailable('XML inversion has several possible node assignments',binding.schema,graph);
  const at=decisions.cursor++,index=decisions.choices[at]??0;decisions.widths[at]=width;decisions.normalizations[at]=normalization;
  if(index>=width)invalid('XML interpretation choice is absent');return index;
 };
 const unique=(values:string[],message:string,pointer='')=>{
  const distinct:SourceDocument[]=[];
  for(const value of values){const document=data(value);if(!distinct.some(existing=>sameMediaData(existing,document)))distinct.push(document);}
  if(distinct.length>1&&decisions){
   const hint=decisions.hint?.dataNode(pointer);
   if(hint){const value=data(decisions.hint!.dataJson(pointer)),index=distinct.findIndex(candidate=>sameMediaData(candidate,value));if(index>0)distinct.unshift(...distinct.splice(index,1));}
   return distinct[choose(distinct.length)].dataJson('');
  }
  if(distinct.length!==1)return unavailable(message,binding.schema,graph);return distinct[0].dataJson('');
 };
 const scalar=(text:string,m:Model):string=>{
  if(m.nullable&&['text','cdata'].includes(m.node)&&text==='null'&&m.type!=='string')return 'null';
  if(m.type==='string')return JSON.stringify(text);
  if(m.type==='null'&&text==='null')return 'null';
  if(m.type==='boolean'&&['true','false'].includes(text))return text;
  if(['number','integer'].includes(m.type)&&/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(text))return text;
  return invalid('XML character content cannot represent the captured primitive type');
 };
 type X=XmlElement|XmlText;
 const matches=(m:Model,n:X[],depth=0):X[]=>{
  if(depth>=limits.depth)throw new SourceError('limit.xml.depth','XML node matching exceeds 128 levels');
  if(m.node==='element')return n.filter(n=>n.kind==='element'&&n.name===m.name&&n.namespace===m.namespace);
  if(m.node==='text'||m.node==='cdata')return n.filter(n=>n.kind===m.node);
  if(m.node==='attribute')return [];
  const children=m.type==='array'?[...m.prefixItems,...(m.items?[m.items]:[])]:[...(m.wrapperOuter??m.properties).values(),...(m.wrapper?[m.wrapper]:[])];
  return n.filter(node=>children.some(child=>models(child).some(shape=>matches(shape,[node],depth+1).length)));
 };
 const matchedAttributes=(m:Model,parent?:XmlElement,depth=0):string[]=>{
  if(depth>=limits.depth)throw new SourceError('limit.xml.depth','XML attribute group matching exceeds 128 levels');
  if(m.node==='attribute')return (parent?.attributes??[]).filter(attribute=>attribute.name===m.name&&attribute.namespace===m.namespace).map(attribute=>JSON.stringify([attribute.name,attribute.namespace]));
  if(m.node!=='none'||!['object','array'].includes(m.type))return [];
  const children=m.type==='array'?[...m.prefixItems,...(m.items?[m.items]:[])]:[...(m.wrapperOuter??m.properties).values(),...(m.wrapper?[m.wrapper]:[])];
  return children.flatMap(child=>models(child).flatMap(shape=>matchedAttributes(shape,parent,depth+1)));
 };
 const splitText=(specs:Spec[],text:string,pointers:string[]=[]):XmlText[]=>{
  if(specs.length>2048)throw new SourceError('limit.xml.text-slots','Adjacent XML text exceeds 2048 positions');
  const characters=[...text],lengths=specs.map((spec,index)=>{
   const choices=models(spec),values=new Set(choices.map(m=>m.characterLength));
   if(values.size===1&&choices[0].characterLength!==undefined)return choices[0].characterLength;
   const hint=pointers[index]===undefined?undefined:decisions?.hint?.dataNode(pointers[index]);
   // Finite original-schema data can establish literal character boundaries;
   // numeric values retain all schema-valid lexical decimal forms.
   return hint?.kind==='string'?[...hint.value].length:hint?.kind==='boolean'?String(hint.value).length:hint?.kind==='null'?4:undefined;
  });
  const unknown=lengths.flatMap((length,index)=>length===undefined?[index]:[]);
  const known=lengths.reduce((total,length)=>total+(length??0),0),remaining=characters.length-known;
  if(remaining<0)invalid('XML text is shorter than its captured character boundaries');
  if(unknown.length>1&&remaining===0)unknown.forEach(index=>lengths[index]=0);
  else if(unknown.length>1){
   if(unknown.length>128)throw new SourceError('limit.xml.alternatives','Adjacent XML text has too many unbounded positions');
   // Enumerate finite character boundaries, then let the original whole-schema
   // proof reject impossible assignments. Exceeding this bound is unavailable
   // proof, never an arbitrary boundary or a successful opaque fallback.
   const allocations:number[][]=[];
   const distribute=(prefix:number[],rest:number)=>{
    if(allocations.length>256)return;
    if(prefix.length===unknown.length-1){allocations.push([...prefix,rest]);return;}
    for(let length=0;length<=rest&&allocations.length<=256;length++)distribute([...prefix,length],rest-length);
   };distribute([],remaining);
   if(allocations.length>256)throw new SourceError('limit.xml.alternatives','Adjacent XML text exceeds 256 boundary assignments');
   const allocation=allocations[choose(allocations.length)];unknown.forEach((index,position)=>lengths[index]=allocation[position]);
  }else if(unknown.length)lengths[unknown[0]]=remaining;
  else if(known!==characters.length)invalid('XML text differs from captured character boundaries');
  if(lengths.some(length=>length!<0))invalid('XML text is shorter than its captured character boundaries');
  let offset=0;return lengths.map(length=>{const value=characters.slice(offset,offset+length!).join('');offset+=length!;return {kind:'text',value};});
 };
 const read=(spec:Spec,nodes:X[],parent?:XmlElement,depth=0,context?:string,pointer=''):string=>{
  if(depth>=limits.depth)throw new SourceError('limit.xml.depth','XML instance exceeds 128 levels');
  const values:string[]=[],fallback:string[]=[];let error:unknown;
  const options=models(spec);
  for(const m of options)try{
   consume();let content=nodes,element:XmlElement|undefined;
   let value:string;
   if(m.node==='attribute'){
    const attribute=parent?.attributes.find(a=>a.name===m.name&&a.namespace===m.namespace);
    value=attribute?scalar(attribute.value,m):m.nullable?'null':invalid('Missing XML attribute');
   }else{
    if(m.node==='element'){
     if(nodes.length!==1||nodes[0].kind!=='element')invalid('Expected one XML element');
     element=nodes[0] as XmlElement;if(element.name!==m.name||element.namespace!==m.namespace)invalid('XML expanded element name differs from schema');
     content=element.children;parent=element;
    }
    const nil=element?.attributes.find(a=>a.name==='nil'&&a.namespace===xsi);
    if(nil&&!['true','1','false','0'].includes(nil.value))invalid('Invalid xsi:nil value');
    if(nil&&['true','1'].includes(nil.value)){if(!m.nullable&&m.type!=='null'||content.length||element!.attributes.some(attribute=>attribute!==nil))invalid('Invalid nil element');value='null';}
    else if(m.wrapper&&m.type!=='object')value=read(m.wrapper,content.filter(n=>n.kind==='element'||n.value.trim()!==''),parent,depth+1,undefined,pointer);
    else if(m.type==='array'){
     const meaningful=content.filter(n=>n.kind==='element'||n.kind==='cdata'||n.value.trim()!=='');
     const textual=[...m.prefixItems,...(m.items?[m.items]:[])].some(item=>models(item).some(m=>m.node==='text'));
     const ordered=textual?[...content]:meaningful;
     const values:string[]=[];let cursor=0,index=0;
     const hint=decisions?.hint?.dataNode(pointer),requiredItems=Math.max(m.minItems,hint?.kind==='array'?hint.children.size:0);
     const claimedAttributes=new Set<string>();
     const attributePending=()=>{const item=m.prefixItems[index]??m.items;return item&&models(item).some(shape=>matchedAttributes(shape,parent).some(name=>!claimedAttributes.has(name)));};
     const textPending=()=>{const item=m.prefixItems[index]??m.items;return index<m.maxItems&&item&&models(item).every(shape=>shape.node==='text');};
     while(cursor<ordered.length||index<requiredItems||attributePending()||textPending()){
      const item=m.prefixItems[index]??m.items;
      if(!item){if(m.closedItems)invalid('XML contains an additional forbidden array item');return unavailable('XML array item has no captured representation schema',m.source,graph);}
      const shapes=models(item),isText=shapes.every(shape=>shape.node==='text');
      if(shapes.every(shape=>shape.node==='attribute')){
       if(!m.prefixItems[index])return unavailable('Repeated XML attributes have no distinct instance boundaries',m.source,graph);
       const names=shapes.flatMap(shape=>matchedAttributes(shape,parent));
       if(names.some(name=>claimedAttributes.has(name)))return unavailable('Several XML array positions claim the same attribute',m.source,graph);
       names.forEach(name=>claimedAttributes.add(name));
       values.push(read(item,[],parent,depth+1,undefined,pointer+'/'+index));index++;continue;
      }
      if(isText){
       let end=index;while(m.prefixItems[end]&&models(m.prefixItems[end]).every(shape=>shape.node==='text'))end++;
       const prefixCount=end-index,suffix=!m.prefixItems[end]&&!!m.items&&models(m.items).every(shape=>shape.node==='text');
       const present=ordered[cursor]?.kind==='text',text=present?(ordered[cursor] as XmlText).value:'';
       let minimum=Math.max(present?1:0,Math.min(prefixCount,Math.max(0,requiredItems-index))),maximum=suffix?m.maxItems-index:Math.min(prefixCount,m.maxItems-index);
       if(!present&&ordered[cursor]&&m.prefixItems[end]&&models(m.prefixItems[end]).some(shape=>matches(shape,[ordered[cursor]]).length))minimum=prefixCount;
       if(suffix&&hint?.kind==='array')minimum=maximum=hint.children.size-index;
       else if(suffix){
        minimum=Math.max(minimum,requiredItems-index);
        if(!Number.isFinite(maximum)){
         const empty=m.items!.targets.every(target=>proof(target,data('""'),m.stack));
         if(empty)return unavailable('Unbounded adjacent XML text permits arbitrarily many empty items',m.source,graph);
         maximum=prefixCount+[...text].length;
        }
       }
       if(maximum<minimum)invalid('XML character positions contradict captured array bounds');
       const count=minimum+choose(maximum-minimum+1);
       if(!count){if(present||ordered[cursor])invalid('XML text has no applicable array position');break;}
       if(count>2048)throw new SourceError('limit.xml.text-slots','Adjacent XML text exceeds 2048 positions');
       const specs=Array.from({length:count},(_,offset)=>m.prefixItems[index+offset]??m.items!);
       const pieces=splitText(specs,text,specs.map((_,offset)=>pointer+'/'+(index+offset)));
       pieces.forEach((piece,offset)=>values.push(read(specs[offset],[piece],parent,depth+1,undefined,pointer+'/'+(index+offset))));
       if(present)cursor++;index+=count;if(suffix){if(cursor<ordered.length)invalid('Unexpected content after trailing XML text items');break;}continue;
      }
      const names=[...new Set(shapes.flatMap(shape=>matchedAttributes(shape,parent)))];
      if(names.some(name=>claimedAttributes.has(name)))return unavailable('Several XML array positions claim the same attribute',m.source,graph);
      names.forEach(name=>claimedAttributes.add(name));
      if(!ordered[cursor]&&!names.length)break;
      let count=1;
      if(shapes.every(shape=>shape.node==='none')){
       // Inline groups have no wrapper boundary. Try finite contiguous spans;
       // the original full schema must establish one unique inversion.
       const remaining=ordered.length-cursor,minimum=names.length?0:1;
       count=minimum+choose(remaining-minimum+1);
      }else if(shapes.every(shape=>shape.node==='cdata')){
       let end=cursor;while(ordered[end]?.kind==='cdata')end++;
       count=1+choose(end-cursor);
      }
      values.push(read(item,ordered.slice(cursor,cursor+count),parent,depth+1,undefined,pointer+'/'+index));cursor+=count;index++;
     }
     const attributes=new Set([...m.prefixItems,...(m.items?[m.items]:[])].flatMap(item=>models(item).flatMap(shape=>matchedAttributes(shape,parent))));
     if(m.node==='element'&&parent?.attributes.some(attribute=>!(attribute.namespace===xsi&&attribute.name==='nil')&&!attributes.has(JSON.stringify([attribute.name,attribute.namespace]))))invalid('Unmodeled XML array attribute');
     value='['+values.join(',')+']';
    }else if(m.type==='object'){
     const fields:string[]=[],used=new Set<X>(),attrs=new Set<string>();
     const referenceNodes=m.wrapper?content.filter(node=>models(m.wrapper!).some(shape=>matches(shape,[node]).length)):[];
     referenceNodes.forEach(node=>used.add(node));
     const properties=m.wrapperOuter??m.properties,textProperties=[...properties].filter(([,child])=>models(child).every(shape=>shape.node==='text'));
     const text=content.filter(n=>n.kind==='text').map(n=>(n as XmlText).value).join('');
     let textPieces:Map<string,XmlText>|undefined;
     if(textProperties.length>1){
      const optional=textProperties.filter(([key])=>!m.required.has(key));
      if(optional.length>8)throw new SourceError('limit.xml.alternatives','Adjacent optional XML text exceeds 256 presence assignments');
      const mask=choose(2**optional.length,text.length===0);
      const present=textProperties.filter(([key])=>m.required.has(key)||(mask&(1<<optional.findIndex(([name])=>key===name)))!==0);
      if(!present.length&&text.length)invalid('XML text has no present property');
      const pieces=present.length?splitText(present.map(([,spec])=>spec),text,present.map(([key])=>pointer+'/'+escape(key))):[];
      textPieces=new Map(present.map(([key],index)=>[key,pieces[index]]));
      content.filter(n=>n.kind==='text').forEach(n=>used.add(n));
     }
     for(const [key,child]of properties){
      let shapes=models(child);const kinds=[...new Set(shapes.map(m=>m.node))];
      if(kinds.length>1){const kind=kinds[choose(kinds.length)];shapes=shapes.filter(shape=>shape.node===kind);}
      const first=shapes[0];
      if(first.node==='attribute'){
       const attribute=parent?.attributes.find(a=>shapes.some(m=>a.name===m.name&&a.namespace===m.namespace));
       if(attribute){if(attrs.has(JSON.stringify([attribute.name,attribute.namespace])))return unavailable('Several XML properties claim the same attribute',child.targets[0],graph);fields.push(JSON.stringify(key)+':'+read(child,[],parent,depth+1,undefined,pointer+'/'+escape(key)));attrs.add(JSON.stringify([attribute.name,attribute.namespace]));}
       else if(shapes.some(m=>m.nullable||m.type==='null')&&child.targets.every(target=>proof(target,data('null'),first.stack))&&(m.required.has(key)||choose(2,true)===1))fields.push(JSON.stringify(key)+':null');continue;
      }
      if(first.node==='text'&&textPieces){
       const piece=textPieces.get(key);if(piece)fields.push(JSON.stringify(key)+':'+read(child,[piece],parent,depth+1,undefined,pointer+'/'+escape(key)));continue;
      }
      let selected:X[];
      if(first.node==='none'&&first.type==='array'){
       const items=shapes.flatMap(m=>[...m.prefixItems,...(m.items?[m.items]:[])]).flatMap(child=>models(child));
       selected=content.filter(n=>items.some(item=>matches(item,[n]).length));
       for(const name of new Set(shapes.flatMap(shape=>matchedAttributes(shape,parent)))){if(attrs.has(name))return unavailable('Several XML properties claim the same array attribute',child.targets[0],graph);attrs.add(name);}
      }else if(first.node==='none'){
       const inline=shapes.flatMap(m=>[...m.properties.values(),...(m.wrapper?[m.wrapper]:[])]).flatMap(child=>models(child));
       selected=content.filter(n=>!used.has(n)&&inline.some(m=>matches(m,[n]).length));
       for(const name of new Set(shapes.flatMap(shape=>matchedAttributes(shape,parent)))){if(attrs.has(name))return unavailable('Several XML properties claim the same inline attribute',child.targets[0],graph);attrs.add(name);}
      }
      else selected=content.filter(n=>shapes.some(m=>matches(m,[n]).length));
      if(selected.some(n=>used.has(n)))return unavailable('Several XML properties claim the same node',child.targets[0],graph);
      if(!selected.length){
       if(['text','cdata'].includes(first.node)&&(m.required.has(key)||choose(2,true)===1))fields.push(JSON.stringify(key)+':'+read(child,[],parent,depth+1,undefined,pointer+'/'+escape(key)));
       else if(first.node==='none'&&first.type==='object'&&(m.required.has(key)||shapes.some(shape=>matchedAttributes(shape,parent).length)||choose(2,true)===1))fields.push(JSON.stringify(key)+':'+read(child,[],parent,depth+1,undefined,pointer+'/'+escape(key)));
       else if(first.type==='array'&&first.node==='none'&&shapes.some(shape=>matchedAttributes(shape,parent).length))fields.push(JSON.stringify(key)+':'+read(child,[],parent,depth+1,undefined,pointer+'/'+escape(key)));
       else if(first.type==='array'&&first.node==='none'&&(m.required.has(key)||choose(2,true)===1))fields.push(JSON.stringify(key)+':[]');
       // Prefer omission; a whole-schema assertion can require empty data.
       continue;
      }
      selected.forEach(n=>used.add(n));fields.push(JSON.stringify(key)+':'+read(child,selected,parent,depth+1,undefined,pointer+'/'+escape(key)));
     }
     for(const child of content.filter(n=>!used.has(n)&&(n.kind==='element'||n.kind==='cdata'||n.value.trim()!==''))){
      if(child.kind!=='element'||!m.additional){if(m.additionalAllowed&&!m.guards.length)return unavailable('XML additional content has no captured type interpretation',m.source,graph);invalid('XML content does not match this captured property interpretation');}
      const spec={...m.additional,name:child.name};fields.push(JSON.stringify(child.name)+':'+read(spec,[child],parent,depth+1,undefined,pointer+'/'+escape(child.name)));
     }
     if(m.node==='element'&&parent?.attributes.some(a=>!(a.namespace===xsi&&a.name==='nil')&&!attrs.has(JSON.stringify([a.name,a.namespace]))))invalid('Unmodeled XML attribute');
     value='{'+fields.join(',')+'}';
     if(m.wrapper)value=mergeXmlObjects(read(m.wrapper,referenceNodes,parent,depth+1,value,pointer),value);
    }else{
     if(element?.attributes.some(a=>!(a.namespace===xsi&&a.name==='nil')))invalid('Unmodeled primitive XML attribute');
     if(content.some(n=>n.kind==='element'||m.node==='cdata'&&n.kind!=='cdata'||m.node==='text'&&n.kind!=='text'))invalid('XML character node type differs from schema');
     const lexical=content.map(n=>(n as XmlText).value).join('');
     if(m.nullable&&m.type==='string'&&['text','cdata'].includes(m.node)&&lexical==='null'){
      const choices=['null',JSON.stringify('null')].filter(value=>spec.targets.every(target=>proof(target,data(value),m.stack)));
      value=choices.length?unique(choices,'Null and the literal null string need full-schema disambiguation',pointer):scalar(lexical,m);
     }else value=scalar(lexical,m);
    }
   }
   if(++candidates>200000)throw new SourceError('limit.xml.candidates','XML candidate budget exceeded');
   fallback.push(value);const candidate=data(context?mergeXmlObjects(value,context):value);
   if(accepts(m,candidate)&&(options.length===1||spec.targets.every(target=>proof(target,candidate,m.stack))))values.push(value);
  }catch(caught){if(caught instanceof SourceError&&caught.code.startsWith('limit.'))throw caught;if(caught instanceof SourceError&&caught.kind==='unsupported'&&decisions)decisions.uncertain=caught;error=caught;}
  if(values.length)return unique(values,'Several applicable XML inversions produce different data values',pointer);
  if(fallback.length){
   const value=unique(fallback,'Invalid XML branches do not establish a unique data interpretation',pointer);
   if(spec.targets.every(target=>proof(target,data(context?mergeXmlObjects(value,context):value),spec.stack)))return unavailable('The schema admits this data but no applicable XML branch establishes its wire interpretation',spec.targets[0],graph);
   return value;
  }
  throw error??new SourceError('runtime.xml.mapping','No applicable XML representation');
 };
 const write=(spec:Spec,document:SourceDocument,node:Node,depth=0,inheritedPrefixes?:Map<string,string>,attributeSink?:string[]):string=>{
  if(depth>=limits.depth)throw new SourceError('limit.xml.depth','XML instance exceeds 128 levels');
  const outputs:{wire:string;attributes:string}[]=[];let error:unknown;
  const local=data(document.dataJson(node.pointer));
  for(const m of models(spec,local))try{
   if(!accepts(m,local))continue;
   if(node.kind!=='null'&&node.kind!==m.type&&!(m.type==='integer'&&node.kind==='number'))invalid('XML typed value differs from schema type');
   if(node.kind==='null'&&!m.nullable&&m.type!=='null')invalid('Null has no XML interpretation');
   const text=node.kind==='string'?node.value:document.dataJson(node.pointer);
   let prefix=m.prefix;
   if(m.node==='attribute'&&m.namespace&&!prefix){
    prefix=[...(inheritedPrefixes??[])].find(([,uri])=>uri===m.namespace)?.[0];
    if(!prefix){let index=inheritedPrefixes?.size??0;do{prefix='xmlattr'+index++;}while(inheritedPrefixes?.has(prefix));}
   }
   if(m.node==='attribute'&&prefix)inheritedPrefixes?.set(prefix,m.namespace);
   const q=prefix?prefix+':'+m.name:m.name;
   let output:string,outerAttributes='';
   if(m.node==='attribute')output=node.kind==='null'?'':' '+q+'="'+xmlEscape(text,true,asciiText)+'"'+(m.namespace?' xmlns:'+ prefix+'="'+xmlEscape(m.namespace,true,asciiText)+'"':'');
   else if(m.node==='text')output=xmlEscape(text,false,asciiText);
   else if(m.node==='cdata')output='<![CDATA['+text.replace(/]]>/g,']]]]><![CDATA[>')+']]>';
   else{
    let content='',attributes='';
    const attributePrefixes=m.node==='none'?(inheritedPrefixes??new Map<string,string>()):new Map<string,string>();if(m.prefix)attributePrefixes.set(m.prefix,m.namespace);
    if(m.wrapper&&node.kind!=='null')content=write({...m.wrapper,exclude:new Set(m.wrapperOuter?.keys())},document,node,depth+1);
    if(node.kind==='object')for(const key of [...(m.wrapperOuter??m.properties).keys(),...node.children.keys()].filter((key,index,keys)=>keys.indexOf(key)===index&&node.children.has(key))){
     const physical=node.children.get(key)!;
     if(m.wrapper&&!m.wrapperOuter?.has(key))continue;
     if(spec.exclude?.has(key)&&!m.properties.has(key)&&!m.additional)continue;
     const child=(m.wrapper?m.wrapperOuter?.get(key):m.properties.get(key))??(m.additional?{...m.additional,name:key}:undefined);if(!child)return unavailable('XML property has no captured representation',m.source,graph);
     const inlineAttributes:string[]=[];
     const wire=write(child,document,document.dataNode(physical.pointer)!,depth+1,attributePrefixes,inlineAttributes);
     attributes+=inlineAttributes.join('');
     if(models(child,data(document.dataJson(physical.pointer))).every(m=>m.node==='attribute'))attributes+=wire;else content+=wire;
    }else if(node.kind==='array'&&!m.wrapper)for(const [index,physical]of node.children){
     const child=m.prefixItems[Number(index)]??m.items;if(!child)return unavailable('XML array item has no captured representation schema',m.source,graph);
     const shapes=models(child,data(document.dataJson(physical.pointer))),inlineAttributes:string[]=[];
     if(shapes.every(shape=>shape.node==='attribute')&&!m.prefixItems[Number(index)])return unavailable('Repeated XML attributes cannot be serialized as distinct array items',m.source,graph);
     const wire=write(child,document,document.dataNode(physical.pointer)!,depth+1,attributePrefixes,inlineAttributes);
     attributes+=inlineAttributes.join('');if(shapes.every(shape=>shape.node==='attribute'))attributes+=wire;else content+=wire;
    }else if(!m.wrapper)content=node.kind==='null'?'':xmlEscape(text,false,asciiText);
    if(m.node==='none'){if(attributes&&!attributeSink)return unavailable('XML attribute groups require an enclosing element',m.source,graph);output=content;outerAttributes=attributes;}
    else{
     const ns=new Map<string,string>();if(m.namespace||!m.prefix)ns.set(m.prefix??'',m.namespace);
     attributes=attributes.replace(/ xmlns:([^= ]+)="([^"]*)"/g,(_,prefix,value)=>{const decoded=attributePrefixes.get(prefix)??value.replace(/&quot;/g,'"').replace(/&amp;/g,'&');if(ns.has(prefix)&&ns.get(prefix)!==decoded)unavailable('XML namespace prefix has conflicting bindings',m.source,graph);ns.set(prefix,decoded);return '';});
     if(node.kind==='null'){let prefix='xsi';while(ns.has(prefix)&&ns.get(prefix)!==xsi)prefix+='i';ns.set(prefix,xsi);attributes+=' '+prefix+':nil="true"';}
     const declarations=[...ns].map(([prefix,uri])=>' xmlns'+(prefix?':'+prefix:'')+'="'+xmlEscape(uri,true,asciiText)+'"').join('');
     output='<'+q+declarations+attributes+(content?'>'+content+'</'+q+'>':'/>');
    }
   }
   outputs.push({wire:output,attributes:outerAttributes});
  }catch(caught){if(caught instanceof SourceError&&caught.code.startsWith('limit.'))throw caught;if(caught instanceof SourceError&&caught.kind==='unsupported'&&decisions)decisions.uncertain=caught;error=caught;}
  const distinct=[...new Map(outputs.map(value=>[JSON.stringify(value),value])).values()];if(distinct.length>1)return unavailable('Applicable XML alternatives produce different wire representations',spec.targets[0],graph);
  if(!distinct.length)throw error??new SourceError('runtime.xml.mapping','No applicable XML encoding');
  if(distinct[0].attributes)attributeSink?.push(distinct[0].attributes);return distinct[0].wire;
 };
 const finiteValues=():SourceDocument[]|undefined=>{
  const choices=clauses(binding.schema,[]),values:SourceDocument[]=[];
  for(const choice of choices){
   const at=choice.sources.find(at=>{const value=graph.docs.get(at.resource)?.dataNode(at.pointer)?.value;return value&&typeof value==='object'&&(['3.1','3.2'].includes(scope(at).family)&&Object.hasOwn(value,'const')||Array.isArray(value.enum));});
   if(!at)return;
   const document=graph.docs.get(at.resource)!,value=document.dataNode(at.pointer)!.value;
   const pointers=Object.hasOwn(value,'const')?[at.pointer+'/const']:[...document.dataNode(at.pointer+'/enum')!.children.values()].map(node=>node.pointer);
   for(const pointer of pointers){const candidate=data(document.dataJson(pointer));if(!values.some(other=>sameMediaData(other,candidate)))values.push(candidate);if(values.length>256)return;}
  }
  return values.filter(document=>proof(binding.schema,document));
 };
 return {read,write,proof,models,finiteValues};
}
export function decodeXml(bytes:Buffer,id:string,binding:XmlBinding,charset?:string):SourceDocument {
 const root=parseXml(xmlCharacters(bytes,charset)),budget={work:0,proofs:0};
 const finite=interpreter(binding,false,undefined,budget).finiteValues();
 const hint=finite?.length===1?finite[0]:undefined;
 const pending:number[][]=[[]],visited=new Set<string>(),valid:SourceDocument[]=[],invalidCandidates:SourceDocument[]=[];
 let problem:unknown,uncertain:SourceError|undefined,attempts=0;
 while(pending.length){
  if(++attempts>256)throw new SourceError('limit.xml.alternatives','XML inversion exceeds 256 complete candidates');
  const choices=pending.shift()!,decisions:Decisions={choices,widths:[],normalizations:[],cursor:0,hint};
  try{
   const codec=interpreter(binding,false,decisions,budget),text=codec.read({targets:[binding.schema]},[root]),document=new SourceDocument(text,id,true,'json');
   if(document.issues.length)throw document.issues[0];
   if(codec.proof(binding.schema,document)){
    if(!valid.some(other=>sameMediaData(other,document)||xmlCorresponds(other,document,binding)))valid.push(document);
    if(valid.length>1)throw new SourceError('runtime.xml.ambiguous','Several schema-valid XML inversions produce different data',[0,0],'unsupported');
    if(hint&&sameMediaData(hint,document)||!uncertain&&!decisions.uncertain&&decisions.widths.every((_,index)=>decisions.normalizations[index]))return document;
   }else if(!invalidCandidates.some(other=>sameMediaData(other,document)))invalidCandidates.push(document);
  }catch(error){if(error instanceof SourceError&&(error.code.startsWith('limit.')||error.code==='runtime.xml.ambiguous'))throw error;problem=error;}
  uncertain??=decisions.uncertain;
  for(let index=decisions.widths.length-1;index>=0;index--){
   const selected=choices[index]??0;if(selected+1>=decisions.widths[index])continue;
   const next=Array.from({length:index},(_,position)=>choices[position]??0).concat(selected+1),key=next.join(',');
   if(!visited.has(key)){visited.add(key);pending.push(next);}
  }
 }
 if(uncertain)throw uncertain;
 if(valid.length===1)return valid[0];
 if(valid.length>1)return unavailable('Several schema-valid XML inversions produce different data',binding.schema,binding.graph);
 if(invalidCandidates.length===1)return invalidCandidates[0];
 if(invalidCandidates.length>1){const range=binding.graph.docs.get(binding.schema.resource)!.dataNode(binding.schema.pointer)!.range;throw new SourceError('runtime.xml.schema','Every bounded XML interpretation violates the original captured schema',range,undefined,{...binding.schema,range});}
 throw problem??new SourceError('runtime.xml.mapping','XML has no captured data interpretation');
}

export function encodeXml(document:SourceDocument,binding:XmlBinding,charset?:string,header=false):Buffer {
 if(document.issues.length)throw document.issues[0];
 try{
  const codec=interpreter(binding,header),text=codec.write({targets:[binding.schema]},document,document.root);
  parseXml(text);return xmlBytes(text,charset);
 }catch(error){
  if(!(error instanceof SourceError)||error.source)throw error;
  const range=binding.graph.docs.get(binding.schema.resource)?.dataNode(binding.schema.pointer)?.range??error.range;
  throw new SourceError(error.code,error.message,range,error.kind,{...binding.schema,range});
 }
}

/** Documented XML inverse policy: optional omitted nullable attributes normalize
 * to omission; required/schema-necessary omitted nullable attributes become null; absent optional unwrapped arrays and empty explicit character nodes
 * normalize to omission. No other member/value loss is permitted. */
export function xmlCorresponds(original:SourceDocument,decoded:SourceDocument,binding:XmlBinding):boolean {
 const codec=interpreter(binding);
 const equal=(spec:Spec,a:Node,b:Node,depth=0):boolean=>{
  if(depth>=limits.depth)throw new SourceError('limit.xml.depth','XML correspondence exceeds 128 levels');
  if(sameMediaData(data(original.dataJson(a.pointer)),data(decoded.dataJson(b.pointer))))return true;
  const options=codec.models(spec,data(original.dataJson(a.pointer)));
  if(a.kind==='object'&&b.kind==='object')return options.some(m=>{
   const keys=new Set([...a.children.keys(),...b.children.keys()]);
   return [...keys].every(key=>{
    const left=a.children.get(key),right=b.children.get(key),child=m.properties.get(key)??m.additional;
    if(!child)return false;
    if(left&&right)return equal(child,original.dataNode(left.pointer)!,decoded.dataNode(right.pointer)!,depth+1);
    const present=left?original.dataNode(left.pointer)!:decoded.dataNode(right!.pointer)!;
    return codec.models(child).every(shape=>shape.node==='attribute'&&(shape.nullable||shape.type==='null')&&present.kind==='null'||
     shape.node==='none'&&['array','object'].includes(shape.type)&&present.kind===shape.type&&present.children.size===0||
     ['text','cdata'].includes(shape.node)&&present.kind==='string'&&present.value==='');
   });
  });
  if(a.kind==='array'&&b.kind==='array'&&a.children.size===b.children.size)return options.some(m=>[...a.children].every(([index,node])=>{
   const child=m.prefixItems[Number(index)]??m.items,other=b.children.get(index);return !!child&&!!other&&equal(child,original.dataNode(node.pointer)!,decoded.dataNode(other.pointer)!,depth+1);
  }));
  return false;
 };
 return equal({targets:[binding.schema]},original.root,decoded.root);
}
