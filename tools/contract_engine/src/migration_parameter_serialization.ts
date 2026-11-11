import {createHash} from 'node:crypto';
import {escape,SourceDocument,SourceError} from './document';
import type {ExternalExampleResourcePacket} from './external_examples';
import {pointerFragment,type GraphScope,type ReferenceGraph} from './reference_graph';
import {ParameterSemantics,parameterStyle} from './parameter_semantics';
import {FiniteMigrationDomain} from './migration_finite_domain';
import {evaluateSchemas} from './schema_evaluation';
import {migrationScopes} from './migration_documents';
import type {MigrationIssue} from './migration_schema';
import {migrationValueIdentity,type MigrationLocation,type MigrationSource} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {migrationLogicalPointers} from './migration_yaml_ownership';
import {isNativeFamily} from './specification';
import {capturedRuntimeMedia} from './runtime_media_owner';
import type {Resource} from './engine';
import {MigrationSchemaProofs,migrationExactValueIdentity} from './migration_schema_proofs';
import {schemaContext} from './schema_context';
import {swaggerFlat} from './swagger_operation';
import {schemaExampleCandidates} from './schema_examples';
import {decodeRuntimeForm} from './runtime_form';
import {mediaTypes} from './media_types';
import {validatePlainText} from './text_encoding';
import {migrationParameterExampleProjection,retainMigrationParameterExampleOwners,installMigrationParameterExamples,sameMigrationParameterExamples,type ParameterExampleProjection} from './migration_parameter_examples';
import {parameterSerializationEvaluator} from './serialized_parameter_examples';
import {decodeRuntimeMedia} from './runtime_media';

const key=(at:MigrationLocation)=>JSON.stringify([at.resource,at.pointer]);
type Pair=readonly [string,string];
type ParameterDeclaration=Record<string,unknown>&{name:string;in:string;content?:Record<string,unknown>;style?:string;explode?:boolean;required?:boolean;deprecated?:boolean;allowReserved?:boolean};
type Declaration=Readonly<{scope:GraphScope;value:ParameterDeclaration;schema?:GraphScope;media?:string;mediaOwner?:MigrationLocation;wholeForm?:boolean;formStyles?:ReadonlySet<string>;reservedFormFields?:ReadonlySet<string>}>;
// Reuse the canonical consumer for each immutable capture; this memo owns no
// declarations, coordinates or migration allocation decisions.
const parameterModels=new WeakMap<ReferenceGraph,ParameterSemantics>();
type Domain=readonly string[];
type Wire=Readonly<{pairs:readonly Pair[];text:string;emptyFailure:boolean}>;
export type ParameterWireProfiles=ReadonlyMap<string,string>;
export type MigrationParameterChange=Readonly<MigrationLocation&{range:readonly number[];name:string;before:string;after:string}>;
class ParameterProofBudget {
 private states=0;
 private bytes=0;
 private finite=new WeakMap<ReferenceGraph,FiniteMigrationDomain>();
 private captures=new WeakMap<ReferenceGraph,Resource[]>();
 resources(graph:ReferenceGraph):Resource[] {
  let resources=this.captures.get(graph);if(resources)return resources;
  const aliases=new Map([...graph.docs.keys()].map(id=>[id,new Set([graph.retrievals.get(id)??id])]));
  for(const [uri,targets]of graph.identities)if(targets.length===1&&targets[0].pointer==='')aliases.get(targets[0].resource)?.add(uri);
  resources=[...graph.docs].map(([id,doc])=>({id,text:doc.text,generation:0,identity:createHash('sha256').update(doc.text).digest('hex'),aliases:[...aliases.get(id)!]}));
  this.captures.set(graph,resources);return resources;
 }
 candidates(graph:ReferenceGraph,scope:GraphScope):string[]|undefined {
  let finite=this.finite.get(graph);
  if(!finite){finite=new FiniteMigrationDomain(graph);this.finite.set(graph,finite);}
  try{return finite.values(scope)??(new MigrationSchemaProofs(graph).validationConstant(scope)===false?[]:undefined);}
  catch(error){
   if(error instanceof SourceError&&error.code.startsWith('limit.'))
    throw new SourceError('limit.migration.parameters',error.message,error.range,'unsupported',error.source);
   throw error;
  }
 }
 admit(states:number,bytes:number):void {
  this.states+=states;this.bytes+=bytes;
  if(this.states>50000||this.bytes>128*1024*1024)
   throw new SourceError('limit.migration.parameters','Exhaustive parameter proof exceeds 50000 states or 128 MiB of captured-source work');
 }
}

/** Resolve through the canonical Parameter owner, including reference chains.
 * Media references have already been materialized by the shared preparation. */
function declaration(graph:ReferenceGraph,at:MigrationLocation):Declaration|undefined {
 let parameters=parameterModels.get(graph);
 if(!parameters){parameters=new ParameterSemantics(graph);parameterModels.set(graph,parameters);}
 const occurrence=parameters.occurrence({...at,kind:'parameter'}),definition=occurrence.definition;
 const scope=definition&&graph.scopeAs(definition.resource,definition.pointer,'parameter');
 if(occurrence.state!=='resolved'||!scope)return;
 const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.value;
 const media=Object.keys(value.content??{}).filter(name=>!name.startsWith('x-'));
 if(media.length>1)return;
 const captured=media.length?capturedRuntimeMedia(graph)({resource:scope.resource,pointer:scope.pointer+'/content/'+escape(media[0])}):undefined;
 const schema=captured?.schema??(!media.length?{resource:scope.resource,pointer:scope.pointer+'/schema'}:undefined);
 const result:Declaration={scope,value,media:media[0],mediaOwner:captured?.source,
  schema:scope.family==='2.0'?schemaContext(graph,scope.resource,scope.pointer):schema&&graph.scopeAs(schema.resource,schema.pointer,'schema')};
 const encoding=captured&&graph.docs.get(captured.source.resource)!.dataNode(captured.source.pointer)?.value?.encoding;
 const formStyles=new Set(Object.entries(encoding??{}).filter(([,rule])=>rule&&typeof rule==='object'&&['style','explode','allowReserved'].some(name=>Object.hasOwn(rule,name))).map(([name])=>name));
 const reservedFormFields=new Set(Object.entries(encoding??{}).filter(([,rule])=>(rule as {allowReserved?:unknown})?.allowReserved===true).map(([name])=>name));
 return {...result,formStyles,reservedFormFields,wholeForm:value.in==='querystring'&&media.length===1&&formMedia(media[0])&&defaultFormEncoding(graph,result)};
}

/** URI/form field codecs are UTF-8 even when the enclosing declaration admits
 * only ASCII. Do not admit a charset merely because a sample is ASCII. */
function formMedia(media:string):boolean {
 const types=mediaTypes(media,false),type=types[0];
 return types.length===1&&type.type==='application'&&type.subtype==='x-www-form-urlencoded'&&
  [...type.parameters].every(([name,value])=>name==='charset'&&['utf-8','us-ascii'].includes(value));
}
function plainQueryMedia(owner:Declaration):boolean {
 if(!owner.media)return false;
 const types=mediaTypes(owner.media,false),type=types[0];
 return types.length===1&&type.type==='text'&&type.subtype==='plain'&&
  [...type.parameters].every(([name,value])=>name==='charset'&&['utf-8','us-ascii'].includes(value));
}
const emptyTextDomain=(owner:Declaration,values:Domain)=>plainQueryMedia(owner)&&values.length>0&&values.every(raw=>{
 const node=new SourceDocument(raw,'file:///migration-empty-text.json',true,'json').dataNode('')!;
 return node.kind==='string'&&node.value==='';
});

/** Enumeration is an exhaustive superset. The original exact evaluator, under
 * the captured request dialect, filters it. Exhaustion abandons the proof. */
async function domain(graph:ReferenceGraph,owner:Declaration,examples:readonly ExternalExampleResourcePacket[],budget:ParameterProofBudget):Promise<Domain|undefined> {
 if(!owner.schema)return;
 const candidates=budget.candidates(graph,owner.schema);if(!candidates)return;
 const resources=budget.resources(graph);
 budget.admit(candidates.length,(resources.reduce((size,item)=>size+item.text.length,0)+examples.reduce((size,item)=>size+(item.state==='available'?item.byteLength:0),0))*Math.ceil(candidates.length/4));
 const accepted:string[]=[];
 for(let offset=0;offset<candidates.length;offset+=4){
  const batch=candidates.slice(offset,offset+4),result=await evaluateSchemas({root:graph.root,resources,exampleResources:examples,
   snapshot:'migration-parameter-domain:'+offset,runtimeInstances:batch.map(text=>({subject:'request-parameter',location:'finite-domain',text,
    schema:{resource:owner.schema!.resource,pointer:owner.schema!.pointer}}))});
  if(!result.complete||result.runtimeEvaluations.length!==batch.length||result.runtimeEvaluations.some(value=>!value.complete)||result.findings.some(value=>value.severity==='error'))return;
  for(const [index,text]of batch.entries())if(result.runtimeEvaluations[index].valid)accepted.push(text);
 }
 return accepted;
}

const uri=(value:string,reserved=false)=>{
 let text=encodeURIComponent(value).replace(/[!'()*]/gu,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
 if(reserved){
  for(const char of ":/?[]@!$'()*+,;")text=text.replaceAll('%'+char.charCodeAt(0).toString(16).toUpperCase(),char);
  text=text.replace(/%25([\da-f]{2})/giu,(_match,hex)=>'%'+hex);
 }
 return text;
};
const form=(value:string)=>uri(value).replaceAll('%20','+');
const styledForm=(value:string,reserved=false)=>uri(value,reserved).replaceAll('+','%2B').replaceAll('[','%5B').replaceAll(']','%5D');
// The official SDK's query mask escapes brackets during Uri.parse. Existing
// percent triples keep the same later normalization on both sides of a proof.
const queryUri=(value:string,reserved=false)=>uri(value,reserved).replaceAll('[','%5B').replaceAll(']','%5D');
const cookieName=/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
const cookieValue=/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/u;

/** This is a proof projection of the existing native serializers, not an HTTP
 * execution pipeline. Scalar conversion is shared on both sides; exact JSON
 * tokens never pass through a machine-number cast. Object order is retained.
 * Equality of each independent component proves every permutation of an
 * object's members; enumerating one object order alone would not do so. */
function projectWire(owner:Declaration,raw:string):Wire|undefined {
 const doc=new SourceDocument(raw,'file:///migration-parameter-value.json',true,'json'),root=doc.dataNode('')!;
 const {value,media}=owner,location=value.in;
 if(!isNativeFamily(owner.scope.family))return;
 const style=owner.scope.family==='2.0'?swaggerFlat(value,{...owner.scope,range:[0,0]}):parameterStyle(owner.scope.family,location,value);
 const scalar=(pointer:string):string|undefined=>{
  const node=doc.dataNode(pointer)!;
  if(location==='cookie'&&node.kind==='number'&&!media&&style.style!=='cookie')return;
  if(location==='query'&&node.kind==='number'&&value.allowReserved===true)return;
  return node.kind==='object'||node.kind==='array'?undefined:typeof node.value==='string'?node.value:doc.dataJson(pointer);
 };
 let pairs:Pair[]=[];
 if(location==='querystring'&&plainQueryMedia(owner)&&root.kind==='string'){
  validatePlainText(root.value,mediaTypes(media!,false)[0].parameters.get('charset'));
  return {pairs:[],text:uri(root.value),emptyFailure:false};
 }
 if(location==='querystring'||location==='query'&&!media){
  if(location==='querystring'&&!owner.wholeForm)return;
  if(location==='query'&&(style.style!=='form'||root.kind==='array'&&!style.explode))return;
  const append=(name:string,pointer:string):boolean=>{
   const text=scalar(pointer);if(text===undefined)return false;
   if(location==='querystring'&&mediaTypes(media!,false)[0].parameters.get('charset')==='us-ascii'&&/[^\x00-\x7f]/u.test(name+text))return false;
   const content=location==='querystring'&&!owner.formStyles?.has(name);
   const encoded=content?form(text):location==='querystring'?styledForm(text,owner.reservedFormFields?.has(name)):
    owner.scope.family==='2.0'?encodeURIComponent(text):queryUri(text,value.allowReserved===true);
   pairs.push([content?form(name):uri(name),encoded]);return true;
  };
  if(location==='query'&&root.kind==='array'){
   for(const index of root.children.keys())if(!append(value.name,'/'+index))return;
  }else if(location==='query'&&root.kind!=='object'){
   if(!append(value.name,''))return;
  }else {
   if(root.kind!=='object')return;
   for(const name of root.children.keys()){
    const pointer='/'+escape(name),node=doc.dataNode(pointer)!;
    if(location==='querystring'&&node.kind==='array'){
     for(const index of node.children.keys())if(!append(name,pointer+'/'+index))return;
    }else if(!append(name,pointer))return;
   }
  }
 }else if(location==='cookie'){
  if(!media&&(!['form','cookie'].includes(style.style)||style.style==='cookie'&&owner.scope.family!=='3.2'))return;
  const literal=style.style==='cookie'||media!==undefined;
  if(media){
   const types=mediaTypes(media,false),type=types[0];
   if(types.length!==1||[...type.parameters.keys()].some(name=>name!=='charset'))return;
   if(type.type==='text'&&type.subtype==='plain'&&root.kind==='string')validatePlainText(root.value,type.parameters.get('charset'));
   else if(type.type==='application'&&type.subtype==='json'&&['number','boolean','null'].includes(root.kind)){
    if(type.parameters.has('charset')&&!['utf-8','us-ascii'].includes(type.parameters.get('charset')!))return;
   }else return;
  }
  if(root.kind==='array'){
   if(media||!style.explode)return;
   for(const index of root.children.keys()){
    const text=scalar('/'+index);if(text===undefined)return;pairs.push([value.name,text]);
   }
  }else if(root.kind==='object'){
   if(media||!style.explode)return;
   for(const name of root.children.keys()){
    const text=scalar('/'+escape(name));if(text===undefined)return;pairs.push([name,text]);
   }
  }else {
   // A numeric enum constrains mathematical values, not lexical exponent '+'
   // spellings. Literal-cookie versus RFC6570 equality needs more evidence.
   if(root.kind==='number'&&!literal)return;
   pairs.push([value.name,scalar('')!]);
  }
  if(!literal){
   pairs=pairs.map(([name,text])=>[uri(name),uri(text)] as const);
   // Older form uses '&' inside one cookie value, not '; ' between cookies.
   if(pairs.length>1){const [name,text]=pairs[0];pairs=[[name,[text,...pairs.slice(1).map(([n,v])=>n+'='+v)].join('&')]];}
  }
  if(pairs.some(([name,text])=>!cookieName.test(name)||!cookieValue.test(text)))return;
 }else return;
 if(owner.scope.family==='2.0'&&location==='query'&&value.allowEmptyValue!==true&&pairs.some(([,text])=>text===''))return;
 return {pairs,text:pairs.map(([name,text])=>name+'='+text).join(location==='cookie'?'; ':'&'),
  emptyFailure:!!value.required&&location!=='querystring'&&pairs.length===0};
}

function wire(owner:Declaration,raw:string):Wire|undefined {
 try{return projectWire(owner,raw);}
 catch(error){if(error instanceof URIError||error instanceof SourceError&&['runtime.media.charset','runtime.media.unsupported','runtime.media.encoding'].includes(error.code))return;throw error;}
}

export function migrationParameterExampleWire(graph:ReferenceGraph,at:MigrationLocation,raw:string):string|undefined {
 const owner=declaration(graph,at);return owner&&wire(owner,raw)?.text;
}
export function migrationFormExampleWire(graph:ReferenceGraph,at:GraphScope,mediaType:string,raw:string):string|undefined {
 const captured=capturedRuntimeMedia(graph)(at),media=graph.docs.get(captured.source.resource)!.dataNode(captured.source.pointer)!.value;
 const owner:Declaration={scope:at,value:{name:'',in:'querystring'},media:mediaType,mediaOwner:captured.source,
  schema:captured.schema&&graph.scopeAs(captured.schema.resource,captured.schema.pointer,'schema'),
  reservedFormFields:new Set(Object.entries(media.encoding??{}).filter(([,rule])=>(rule as {allowReserved?:unknown})?.allowReserved===true).map(([name])=>name)),
  formStyles:new Set(Object.entries(media.encoding??{}).filter(([,rule])=>rule&&typeof rule==='object'&&['style','explode','allowReserved'].some(name=>Object.hasOwn(rule,name))).map(([name])=>name))};
 return formMedia(mediaType)&&defaultFormEncoding(graph,owner)?wire({...owner,wholeForm:true},raw)?.text:undefined;
}

/** Example inversion shares native parameter attribution and exact evaluation.
 * Ambiguous valid interpretations never establish a migration certificate. */
export async function decodeMigrationParameterExample(graph:ReferenceGraph,at:GraphScope,text:string,
 examples:readonly ExternalExampleResourcePacket[]=[]):Promise<string|undefined> {
 const owner=declaration(graph,at);if(!owner?.schema)return;
 if(owner.value.in==='querystring'){
  if(owner.wholeForm)return decodeMigrationRawQuery(graph,at,text,examples);
  if(text!==''||!plainQueryMedia(owner))return;
  const budget=new ParameterProofBudget(),decoded=decodeRuntimeMedia(text,'file:///migration-empty-text.json',owner.media).document.dataJson('');
  const checked=await evaluateSchemas({root:graph.root,resources:budget.resources(graph),exampleResources:examples,snapshot:'migration-empty-text',
   runtimeInstances:[{subject:'request-parameter',location:'empty-text',text:decoded,schema:owner.schema}]});
  return checked.complete&&checked.runtimeEvaluations.length===1&&checked.runtimeEvaluations[0].complete&&checked.runtimeEvaluations[0].valid?decoded:undefined;
 }
 const budget=new ParameterProofBudget(),accepted=new Map<string,string>();
 const evaluate=parameterSerializationEvaluator(graph,async instances=>{
  const grouped=instances.map(instance=>[instance.text,...instance.alternatives??[]].map(text=>({...instance,text,alternatives:undefined}))),candidates=grouped.flat();
  const checked=await evaluateSchemas({root:graph.root,resources:budget.resources(graph),exampleResources:examples,snapshot:'migration-example-inverse',runtimeInstances:candidates});
  for(const [index,result]of checked.runtimeEvaluations.entries())if(result.complete&&result.valid){
   const candidate=candidates[index];
   const raw=candidate.mediaType?decodeRuntimeMedia(candidate.text,'file:///migration-example-inverse.json',candidate.mediaType,candidate.mediaBase64).document.dataJson(''):candidate.text;
   accepted.set(exactIdentity(raw),raw);
  }
  let offset=0;
  const evaluations=instances.map((instance,index)=>{
   const results=checked.runtimeEvaluations.slice(offset,offset+grouped[index].length);offset+=grouped[index].length;
   const valid=results.some(result=>result.complete&&result.valid),complete=results.length===grouped[index].length&&(valid||results.every(result=>result.complete));
   return {subject:instance.subject,location:instance.location,complete,valid};
  });
  return {complete:checked.complete&&evaluations.every(value=>value.complete),evaluations,
   findings:evaluations.every(value=>value.valid)?[]:checked.findings,instances:checked.runtimeEvaluations.length};
 });
 try{const checked=await evaluate(at,text);return checked.complete&&checked.valid&&accepted.size===1?[...accepted.values()][0]:undefined;}
 catch(error){if(error instanceof SourceError)return;throw error;}
}

function defaultFormEncoding(graph:ReferenceGraph,owner:Declaration):boolean {
 const media=owner.mediaOwner&&graph.docs.get(owner.mediaOwner.resource)!.dataNode(owner.mediaOwner.pointer)?.value;
 if(!media)return false;
 if(Object.hasOwn(media,'itemSchema')||Object.hasOwn(media,'prefixEncoding')||Object.hasOwn(media,'itemEncoding'))return false;
 return Object.values(media.encoding??{}).every(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
  const rule=raw as Record<string,unknown>;
  return Object.entries(rule).every(([name,value])=>name==='style'&&value==='form'||name==='explode'&&value===true||
   name==='allowReserved'&&typeof value==='boolean'||name==='contentType'&&value==='text/plain'||name==='headers'&&value&&typeof value==='object'&&Object.keys(value).length===0||name.startsWith('x-'));
 });
}

function equalWire(before:Declaration,after:Declaration,values:Domain):boolean {
 return values.every(raw=>{
  const first=wire(before,raw),last=wire(after,raw);
  return first!==undefined&&last!==undefined&&first.text===last.text&&JSON.stringify(first.pairs)===JSON.stringify(last.pairs)&&first.emptyFailure===last.emptyFailure;
 });
}

/** Exercise the existing captured parameter/media inversion and exact schema
 * evaluator for every emitted representation. Component equality above covers
 * member permutations and numeric spellings; this check also retains runtime
 * field attribution, media decoding and the original request schema owner. */
async function wireLanguage(graph:ReferenceGraph,owner:Declaration,values:Domain,examples:readonly ExternalExampleResourcePacket[],budget:ParameterProofBudget):Promise<boolean> {
 const texts=values.map(raw=>wire(owner,raw)?.text);if(texts.some(text=>text===undefined))return false;
 const emitted=[...new Set(texts.filter(text=>text!==''))] as string[],resources=budget.resources(graph);
 budget.admit(emitted.length,(resources.reduce((size,item)=>size+item.text.length,0)+examples.reduce((size,item)=>size+(item.state==='available'?item.byteLength:0),0))*Math.ceil(emitted.length/4));
 for(let offset=0;offset<emitted.length;offset+=4){
  const batch=emitted.slice(offset,offset+4),result=await evaluateSchemas({root:graph.root,resources,exampleResources:examples,
   snapshot:'migration-parameter-wire:'+offset,runtimeInstances:batch.map(text=>({subject:'request-parameter',location:'finite-wire',text,
    parameter:{resource:owner.scope.resource,pointer:owner.scope.pointer}}))});
  if(!result.complete||result.runtimeEvaluations.length!==batch.length||result.runtimeEvaluations.some(value=>!value.complete||!value.valid)||
   result.findings.some(value=>value.severity==='error'))return false;
 }
 return true;
}

type RepeatedField=Readonly<{name:string;schema:GraphScope;values:Domain;required:boolean}>;

/** This bounded factor has one field, so there is no Cartesian-product
 * assumption. The exhaustive *whole object* evaluation carries dependencies,
 * conditions and property counts into the projected enum. The original
 * schema remains a typed allocator owner, including independent references. */
async function repeatedField(graph:ReferenceGraph,owner:Declaration,values:Domain,
 examples:readonly ExternalExampleResourcePacket[],budget:ParameterProofBudget):Promise<RepeatedField|undefined> {
 if(!owner.wholeForm||!owner.schema||!values.length)return;
 const parts=new MigrationSchemaProofs(graph).conjuncts(owner.schema),fields=new Map<string,GraphScope>();
 for(const part of parts){
  const node=graph.docs.get(part.resource)!.dataNode(part.pointer);
  for(const name of Object.keys(node?.value?.properties??{})){
   const child=graph.scopeAs(part.resource,part.pointer+'/properties/'+escape(name),'schema');
   if(child)fields.set(name,child);
  }
 }
 if(fields.size!==1)return;
 const [name,schema]=[...fields][0],projected:string[]=[];let omitted=false;
 for(const raw of values){
  const doc=new SourceDocument(raw,'file:///repeated-field.json',true,'json'),root=doc.dataNode('')!;
  if(root.kind!=='object'||[...root.children.keys()].some(field=>field!==name))return;
  const field=doc.dataNode('/'+escape(name));
  if(!field){omitted=true;continue;}
  if(field.kind!=='array')return;
  projected.push(doc.dataJson(field.pointer));
 }
 if(!projected.length)return;
 // A required whole group cannot lose its only presence coordinate.
 if(owner.value.required===true&&omitted)return;
 const required=owner.value.required===true&&!omitted;
 // Required empty collections have no older native presence representation.
 if(required&&projected.some(raw=>new SourceDocument(raw,'file:///array.json',true,'json').dataNode('')!.children.size===0))return;
 const result={name,schema,values:projected,required};
 const after:Declaration={...owner,media:undefined,wholeForm:false,value:{...owner.value,name,in:'query',required,style:'form',explode:true},scope:{...owner.scope,family:'3.1'}};
 if(!equalRepeatedWire(owner,after,result,values)||!await wireLanguage(graph,owner,values,examples,budget))return;
 return result;
}

function extracted(raw:string,name:string):string|undefined {
 const doc=new SourceDocument(raw,'file:///extracted-field.json',true,'json');
 const node=doc.dataNode('/'+escape(name));return node&&doc.dataJson(node.pointer);
}
function equalRepeatedWire(before:Declaration,after:Declaration,field:Pick<RepeatedField,'name'>,values:Domain):boolean {
 return values.every(raw=>{
  const first=wire(before,raw),value=extracted(raw,field.name),last=value===undefined?{pairs:[],text:'',emptyFailure:false}:wire(after,value);
  return first!==undefined&&last!==undefined&&first.text===last.text&&JSON.stringify(first.pairs)===JSON.stringify(last.pairs)&&first.emptyFailure===last.emptyFailure;
 });
}

function equalRepeatedCookieField(before:Declaration,after:Declaration,name:string,values:Domain):boolean {
 return values.every(raw=>{
  const field=extracted(raw,name);if(field===undefined)return true;
  const first=wire(before,'{'+JSON.stringify(name)+':'+field+'}'),last=wire(after,field);
  return !!first&&!!last&&first.text===last.text;
 });
}
function equalQueryFieldWire(before:Declaration,after:Declaration,name:string,values:Domain):boolean {
 return values.every(raw=>{
  const value=extracted(raw,name);if(value===undefined)return true;
  const first=wire(before,'{'+JSON.stringify(name)+':'+value+'}'),last=wire(after,value);
  return !!first&&!!last&&first.text===last.text&&JSON.stringify(first.pairs)===JSON.stringify(last.pairs);
 });
}
function finiteArrayItems(values:Domain):Record<string,string>|undefined {
 const kinds=new Set<string>();
 for(const raw of values){const doc=new SourceDocument(raw,'file:///finite-array-items.json',true,'json');
  for(const node of doc.dataNode('')!.children.values())kinds.add(node.kind);}
 return kinds.size===0?{type:'string'}:kinds.size===1&&['string','number','boolean'].includes([...kinds][0])?{type:[...kinds][0]}:undefined;
}

function singletonCookieValue(raw:string):string|undefined {
 const doc=new SourceDocument(raw,'file:///migration-cookie-array.json',true,'json'),root=doc.dataNode('')!;
 return root.kind==='array'&&root.children.size===1?doc.dataJson('/0'):undefined;
}
function equalSingletonCookieWire(before:Declaration,after:Declaration,values:Domain):boolean {
 return values.every(raw=>{const value=singletonCookieValue(raw),first=wire(before,raw),last=value===undefined?undefined:wire(after,value);
  return !!first&&!!last&&first.text===last.text&&JSON.stringify(first.pairs)===JSON.stringify(last.pairs)&&first.emptyFailure===last.emptyFailure;});
}
function equalEmptyTextWire(before:Declaration,after:Declaration,values:Domain):boolean {
 return emptyTextDomain(before,values)&&values.every(raw=>{
  const first=wire(before,raw),last=wire(after,'[]');
  return !!first&&!!last&&first.text===last.text&&first.text===''&&first.emptyFailure===last.emptyFailure;
 });
}

type QueryFactor=Readonly<{name:string;schemas:readonly GraphScope[];values:Domain;required:boolean;type:string}>;
type Factorization=Readonly<{fields:readonly QueryFactor[];restriction?:string}>;
const exactIdentity=(raw:string)=>migrationExactValueIdentity(new SourceDocument(raw,'file:///factor-value.json',true,'json'),'');
const language=(values:Domain)=>JSON.stringify([...new Set(values.map(exactIdentity))].sort());

/** Exhaustively compare the complete object relation with the product of its
 * projections, including the absence coordinate. Optional whole groups add
 * exactly the all-absent tuple, never every partially present tuple. */
function queryFactors(graph:ReferenceGraph,owner:Declaration,values:Domain,budget:ParameterProofBudget):Factorization|undefined {
 if((!owner.wholeForm&&!(owner.value.in==='cookie'&&owner.value.style==='cookie'))||!owner.schema||!values.length)return;
 const names=new Set<string>(),objects=values.map(raw=>new SourceDocument(raw,'file:///factor-object.json',true,'json'));
 for(const doc of objects){
  const root=doc.dataNode('')!;if(root.kind!=='object')return;
  for(const name of root.children.keys())names.add(name);
 }
 if(!names.size)return {fields:[],restriction:'A required or explicitly present empty whole-query object has no named field owner'};
 const proofs=new MigrationSchemaProofs(graph),parts=proofs.conjuncts(owner.schema),fields:QueryFactor[]=[];
 for(const name of names){
  const schemas=parts.flatMap(part=>{const child=graph.scopeAs(part.resource,part.pointer+'/properties/'+escape(name),'schema');return child?[child]:[];});
  const projected=new Map<string,string>();let omitted=owner.value.required!==true;
  for(const doc of objects){
   const node=doc.dataNode('/'+escape(name));if(!node){omitted=true;continue;}
   const raw=doc.dataJson(node.pointer);if(!projected.has(exactIdentity(raw)))projected.set(exactIdentity(raw),raw);
  }
  const candidates=[...projected.values()],kinds=new Set(candidates.map(raw=>new SourceDocument(raw,'file:///factor-field.json',true,'json').dataNode('')!.kind));
  if(kinds.size!==1)return;
  let type=[...kinds][0] as string;
  if(!['string','number','boolean','array'].includes(type))return;
  if(type==='number'&&schemas.some(schema=>proofs.conjuncts(schema).some(part=>graph.docs.get(part.resource)!.dataNode(part.pointer)?.value?.type==='integer')))type='integer';
  fields.push({name,schemas,values:candidates,required:!omitted,type});
 }
 let products=['{}'];
 for(const field of fields){
  const next:string[]=[];
  for(const prefix of products){
   if(!field.required)next.push(prefix);
   for(const raw of field.values)next.push(prefix.slice(0,-1)+(prefix==='{}'?'':',')+JSON.stringify(field.name)+':'+raw+'}');
  }
  budget.admit(next.length,next.reduce((bytes,raw)=>bytes+raw.length,0));
  if(next.length>2048)return;
  products=next;
 }
 const permitted=owner.value.required?values:[...values,'{}'];
 if(language(products)!==language(permitted))return {fields,restriction:'The complete source language contains correlated values or field presence; independent Parameters would admit additional combinations'};
 if(fields.some(field=>field.required&&field.values.some(raw=>{const node=new SourceDocument(raw,'file:///empty-array.json',true,'json').dataNode('')!;return node.kind==='array'&&node.children.size===0;})))
  return {fields,restriction:'A required extracted array admits an empty collection that emits no field; making it optional would also admit omission'};
 if(owner.value.required&&!fields.some(field=>field.required))
  return {fields,restriction:'The required whole-query group has no independently required emitting field; target Parameters cannot distinguish an absent group from an empty query'};
 return {fields};
}

/** Query field order follows the supplied selection order in Core. Compare
 * each component in the original object's order, retaining array order and
 * multiplicity. This proves every member permutation, not one enum ordering. */
function equalFactorWire(before:Declaration,after:readonly Declaration[],raw:string):boolean {
 const doc=new SourceDocument(raw,'file:///factor-wire.json',true,'json'),root=doc.dataNode('')!,first=wire(before,raw);
 if(root.kind!=='object'||!first)return false;
 const byName=new Map(after.map(owner=>[owner.value.name,owner]));
 if([...root.children.keys()].some(name=>!byName.has(name)))return false;
 const pairs:Pair[]=[];
 for(const name of root.children.keys()){
  const owner=byName.get(name)!,last=wire(owner,doc.dataJson('/'+escape(name)));
  if(!last||last.emptyFailure)return false;pairs.push(...last.pairs);
 }
 if(after.some(owner=>owner.value.required&&!root.children.has(owner.value.name)))return false;
 return JSON.stringify(first.pairs)===JSON.stringify(pairs)&&first.text===pairs.map(([name,value])=>name+'='+value).join(before.value.in==='cookie'?'; ':'&');
}

/** Used only after the publication invariant has certified these owners.
 * Captured values outside the schema still need the actual codec equality. */
export function sameMigrationQueryFields(source:ReferenceGraph,before:MigrationLocation,target:ReferenceGraph,after:readonly MigrationLocation[],raw:string):boolean {
 const first=declaration(source,before),last=after.map(at=>declaration(target,at));
 return !!first&&last.every((value):value is Declaration=>value!==undefined)&&equalFactorWire(first,last,raw);
}

export type MigrationRawQuery=Readonly<{data:string;selections:readonly Readonly<{name:string;raw:string}>[];
 targets:readonly Readonly<MigrationLocation&{name:string}>[]}>;

/** Invert only the captured form owner. The canonical decoder retains numeric
 * lexemes; its field attribution supplies authored order. A successful decode
 * is insufficient: the original schema and the exact target octets must agree.
 * Noncanonical escapes, interleaved repeated fields, missing '=' and empty
 * separators consequently cannot acquire an accidental normalization proof. */
export async function decodeMigrationRawQuery(source:ReferenceGraph,before:MigrationLocation,text:string,
 examples:readonly ExternalExampleResourcePacket[]=[]):Promise<string|undefined> {
 const first=declaration(source,before);
 if(!first?.wholeForm||!first.mediaOwner||!first.schema||
  /[^\x21-\x7e]|#|%(?![\da-f]{2})/iu.test(text))return;
 try{
  const decoded=decodeRuntimeForm(text,'file:///migration-raw-query.json',first.media!,false,first.mediaOwner,'request-parameter',source);
  if(decoded.issues.length||decoded.checks.length||decoded.binaryInstances?.size)return;
  const doc=decoded.document,names=[...new Set(decoded.fieldOrder)];
  if(names.length!==doc.dataNode('')!.children.size||names.some(name=>!doc.dataNode('/'+escape(name))))return;
  const raw='{'+names.map(name=>JSON.stringify(name)+':'+doc.dataJson('/'+escape(name))).join(',')+'}';
  const budget=new ParameterProofBudget(),checked=await evaluateSchemas({root:source.root,resources:budget.resources(source),exampleResources:examples,
   snapshot:'migration-raw-query',runtimeInstances:[{subject:'request-parameter',location:'saved-query',text:raw,schema:first.schema}]});
  if(!checked.complete||checked.runtimeEvaluations.length!==1||!checked.runtimeEvaluations[0].complete||!checked.runtimeEvaluations[0].valid||checked.findings.some(note=>note.severity==='error'))return;
  return raw;
 }catch(error){if(error instanceof SourceError||error instanceof URIError)return;throw error;}
}

export async function projectMigrationRawQuery(source:ReferenceGraph,before:MigrationLocation,target:ReferenceGraph,
 after:readonly MigrationLocation[],text:string,examples:readonly ExternalExampleResourcePacket[]=[]):Promise<MigrationRawQuery|undefined> {
 const raw=await decodeMigrationRawQuery(source,before,text,examples),last=after.map(at=>declaration(target,at));
 if(raw===undefined||!last.length||!last.every((owner):owner is Declaration=>!!owner))return;
 const doc=new SourceDocument(raw,'file:///migration-decoded-query.json',true,'json'),names=[...doc.dataNode('')!.children.keys()];
 try{
  const kinds=last.length===1&&last[0].schema?new MigrationSchemaProofs(target).domains(last[0].schema):undefined;
  const object=kinds?.size===1&&kinds.has('object');
  const selections=object?[{name:last[0].value.name,raw}]:names.map(name=>({name,raw:doc.dataJson('/'+escape(name))}));
  if(!selections.length&&!object)return;
  const pairs:Pair[]=[];
  for(const selection of selections){
   const owner=last.find(owner=>owner.value.name===selection.name),emitted=owner&&wire(owner,selection.raw);
   if(!emitted||emitted.emptyFailure)return;pairs.push(...emitted.pairs);
  }
  if(last.some(owner=>owner.value.required&&!selections.some(selection=>selection.name===owner.value.name))||pairs.map(([name,value])=>name+'='+value).join('&')!==text)return;
  return {data:raw,selections,targets:selections.map(selection=>{const {resource,pointer}=last.find(owner=>owner.value.name===selection.name)!.scope;
   return {name:selection.name,resource,pointer};})};
 }catch(error){if(error instanceof SourceError||error instanceof URIError)return;throw error;}
}

/** Expand uses of a reusable Parameter into ordinary references. Definitions
 * and occurrences keep their own provenance; generated reference fields have
 * no captured edge for neutral-target reference repair to overwrite. */
function expandQueryUses(graphs:readonly ReferenceGraph[],owners:MigrationSchemaOwners,
 factors:ReadonlyMap<string,readonly MigrationLocation[]>):void {
 const seen=new Set<string>();
 for(const graph of graphs){
  const parameters=new ParameterSemantics(graph);
  for(const scope of graph.entryScopes())if(scope.kind==='parameter'){
   const definition=parameters.occurrence(scope).definition,outputs=definition&&factors.get(key(definition));
   for(const output of outputs?.slice(1)??[])owners.rememberAdditionalUse(graph.root,scope,output,new Set(Object.keys(graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value??{})));
  }
  for(const scope of graph.entryScopes()){
   if(!['operation','path-item'].includes(scope.kind))continue;
   const list=parameters.list(scope);if(!list.source||seen.has(key(list.source)))continue;seen.add(key(list.source));
   if(!list.entries.some(entry=>entry.definition&&(factors.get(key(entry.definition))?.length??0)>1))continue;
   const {source,location}=owners.uniqueLocation(list.source);
   const originals=list.entries.map(entry=>({sourcePointer:owners.uniqueLocation(entry.source).location.pointer,value:undefined as MigrationLocation|undefined}));
   const additional=list.entries.flatMap((entry,index)=>{
    const outputs=entry.definition&&factors.get(key(entry.definition));
    return (outputs?.slice(1)??[]).map(output=>({sourcePointer:originals[index].sourcePointer,value:output}));
   });
   // Append fresh reference slots after all captured members. Their synthetic
   // coordinates cannot replace an earlier member's moved reference origin.
   // Runtime field order comes from selections, independently of list order.
   source.expandArray(location.pointer,[...originals,...additional],(pointer,output)=>{
    if(!output)return;
    for(const locations of source.originSets())for(const at of [...locations])if(at===pointer||at.startsWith(pointer+'/'))locations.delete(at);
    source.set(pointer,{$ref:output.resource+pointerFragment(output.pointer)});
    // Ordinary stage/reference relocation must also see these generated edges,
    // including components/parameters -> Swagger's parameters container.
    for(const at of [pointer,pointer+'/$ref'])source.origins.set(at,new Set([at]));
   });
  }
 }
}

/** Captured saved inputs can lie outside the schema's permitted language.
 * Preserve their actual codec too; an enum is no permission to alter them. */
export function sameMigrationParameterValue(source:ReferenceGraph,before:MigrationLocation,target:ReferenceGraph,after:MigrationLocation,raw:string):boolean {
 const first=declaration(source,before),last=declaration(target,after);
 if(!first||!last)return false;
 if(first.value.in==='querystring'&&emptyTextDomain(first,[raw]))return equalEmptyTextWire(first,last,[raw]);
 if(first.value.in==='cookie'&&last.schema&&target.docs.get(last.schema.resource)!.dataNode(last.schema.pointer)?.value?.type!=='array'&&singletonCookieValue(raw)!==undefined)
  return equalSingletonCookieWire(first,last,[raw]);
 if(first.value.in==='querystring'&&last.value.in==='query'&&last.schema!==undefined&&target.docs.get(last.schema.resource)!.dataNode(last.schema.pointer)?.value?.type==='array'){
  const doc=new SourceDocument(raw,'file:///saved-field.json',true,'json'),root=doc.dataNode('')!;
  if(root.kind!=='object'||[...root.children.keys()].some(name=>name!==last.value.name))return false;
  return equalRepeatedWire(first,last,{name:last.value.name},[raw]);
 }
 return equalWire(first,last,[raw]);
}

async function parameterExamples(graph:ReferenceGraph,before:Declaration,after:readonly Declaration[],values:Domain,
 examples:readonly ExternalExampleResourcePacket[],fields?:readonly string[],singleton=false,emptyText=false):Promise<ParameterExampleProjection> {
 const permitted=new Set(values.map(exactIdentity));
 return migrationParameterExampleProjection(graph,{parameter:before.scope,schema:before.schema!,media:before.mediaOwner,mediaType:before.media},{
  decode:text=>decodeMigrationParameterExample(graph,before.scope,text,examples),
  encode:raw=>permitted.has(exactIdentity(raw))?wire(before,raw)?.text:undefined,
  project:raw=>{
   if(emptyText)return emptyTextDomain(before,[raw])?['[]']:undefined;
   if(singleton){const value=singletonCookieValue(raw);return value===undefined?undefined:[value];}
   if(!fields)return [raw];
   const doc=new SourceDocument(raw,'file:///migration-projected-example.json',true,'json'),names=[...doc.dataNode('')!.children.keys()];
   if(names.length!==fields.length||names.some(name=>!fields.includes(name)))return;
   return fields.map(name=>doc.dataJson('/'+escape(name)));
  },target:(index,raw)=>wire(after[index],raw)?.text,delimiter:before.value.in==='cookie'?'; ':'&',
  order:raw=>fields?[...new SourceDocument(raw,'file:///migration-example-order.json',true,'json').dataNode('')!.children.keys()].map(name=>fields.indexOf(name)):[0],
 },examples,after.length);
}

/** Authored whole-group examples also constrain the order of active target
 * occurrences. Definition/example equality cannot hide an Operation list
 * that emits those independently selected fields in a different order. */
function sameParameterExampleOrder(graph:ReferenceGraph,after:readonly Declaration[],projection:ParameterExampleProjection,delimiter:string):boolean {
 if(!projection.fields[0]?.length)return true;
 const parameters=new ParameterSemantics(graph),indices=new Map(after.map((owner,index)=>[key(owner.scope),index]));
 for(const operation of graph.operations()){
  const order=parameters.operation(operation.source.resource,operation.source.pointer,operation.pathItem).visible
   .flatMap(parameter=>{const index=parameter.definition&&indices.get(key(parameter.definition));return index===undefined?[]:[index];});
  // The existing complete-group request invariant rejects partial groups.
  if(order.length!==after.length)continue;
  for(let choice=0;choice<projection.fields[0].length;choice++){
   const emitted=after.map((owner,index)=>wire(owner,projection.fields[index][choice].raw)?.text);
   if(emitted.some(text=>text===undefined)||order.map(index=>emitted[index]).filter(text=>text!=='').join(delimiter)!==
    projection.order.map(index=>emitted[index]).filter(text=>text!=='').join(delimiter))return false;
  }
 }
 return true;
}

/** Identity-value mappings preserve cross-property assertions, requiredness,
 * independent schemas and examples without splitting one constrained object
 * into unrelated parameters. The common allocator still owns every move. */
export async function migrateParameterSerialization(graphs:readonly ReferenceGraph[],sources:Map<string,MigrationSource>,families:readonly string[],
 target:string,owners:MigrationSchemaOwners,issue:MigrationIssue,examples:readonly ExternalExampleResourcePacket[]=[]):Promise<boolean> {
 if(target==='3.2'||!families.includes('3.2')&&target!=='2.0')return false;
 let changed=false;const budget=new ParameterProofBudget(),factorOwners=new Map<string,readonly MigrationLocation[]>();
 for(const scope of migrationScopes(graphs)){
  if(scope.kind!=='parameter')continue;
  const graph=graphs.find(graph=>graph.scopeAs(scope.resource,scope.pointer,'parameter')?.family===scope.family)!;
  const authored=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.value;
  if(target==='2.0'&&authored?.in==='query'&&authored.allowReserved===true&&!authored.content&&typeof authored.$ref!=='string'){
   const before=declaration(graph,scope),values=before?.schema&&await domain(graph,before,examples,budget);
   const kinds=before?.schema&&new MigrationSchemaProofs(graph).domains(before.schema),type=kinds?.size===1?[...kinds][0]:undefined;
   if(before&&values&&type&&['string','number','boolean','array'].includes(type)){
    const after:Declaration={...before,scope:{...before.scope,family:'2.0'},value:{...before.value,allowReserved:undefined,type,
     collectionFormat:type==='array'?'multi':undefined}};
    if(equalWire(before,after,values)&&await wireLanguage(graph,before,values,examples,budget)){
     const {source,location:{pointer}}=owners.uniqueLocation(scope);
     owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowReserved'},source,pointer+'/allowReserved','proved_reserved_query',graph);
     source.presentationChanges.push(pointer);changed=true;
    }
   }
   continue;
  }
  if(scope.family!=='3.2')continue;
  if(typeof authored?.$ref==='string'||authored?.in!=='querystring'&&!(authored?.in==='cookie'&&authored?.style==='cookie'))continue;
  const whole=authored.in==='querystring',field={...scope,pointer:scope.pointer+(whole?'/in':'/style')};
  const fail=(suffix:string,message:string,reason:'unavailable-proof'|'target-representation'='unavailable-proof')=>
   issue(field,'migration.parameter.'+(whole?'querystring':'cookie')+'-'+suffix,message,reason);
  if(target==='2.0'&&!whole){fail('target','Swagger has no native cookie Parameter location; an ordinary Header is not an equivalent cookie owner','target-representation');continue;}
  const before=declaration(graph,scope);
  if(!before?.schema){fail('proof','No captured effective schema establishes the complete parameter value domain');continue;}
  const values=await domain(graph,before,examples,budget);
  // No present value is permitted. Modern targets keep the native media;
  // Swagger uses a proved contradictory flat scalar with the same empty
  // language. Neither case needs an invented codec for a present value.
  if(whole&&values?.length===0){
   const {source,location:{pointer}}=owners.uniqueLocation(scope);
   if(source.doc.dataNode(pointer+'/allowEmptyValue'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowEmptyValue'},source,pointer+'/allowEmptyValue','inactive_whole_query_empty_value',graph);
   if(target==='2.0'){
    const material=owners.uniqueLocation(before.schema!);owners.move(before.schema!,material.source,material.location.pointer,'empty_query_language',{context:graph});
    owners.retainNativeHistory({...scope,pointer:scope.pointer+'/content'},source,pointer+'/content','empty_query_media',graph);
    // A finite contradictory scalar is a standard flat Swagger schema. Its
    // complete domain is empty, including every numeric lexical spelling.
    source.set(pointer+'/schema',{type:'integer',enum:[0],minimum:1});source.set(pointer+'/style','form');source.set(pointer+'/explode',true);
    for(const at of migrationLogicalPointers(source.doc))if(!source.origins.has(at))source.origins.set(at,new Set([at]));
   }
   source.set(pointer+'/in','query');source.presentationChanges.push(pointer);changed=true;continue;
  }
  if(whole&&values&&emptyTextDomain(before,values)&&before.value.required===true){
   fail('target','A required whole-query empty text value has no named target owner retaining required presence without emitting a field','target-representation');continue;
  }
  if(whole&&values&&emptyTextDomain(before,values)&&before.value.required!==true){
   const after:Declaration={...before,media:undefined,mediaOwner:undefined,wholeForm:false,
    value:{...before.value,in:'query',style:'form',explode:true}};
   if(!equalEmptyTextWire(before,after,values)){fail('proof','The empty text value has no equal omitted-field target serialization');continue;}
   let projectedExamples:ParameterExampleProjection;
   try{projectedExamples=await parameterExamples(graph,before,[after],values,examples,undefined,false,true);}
   catch(error){if(!(error instanceof SourceError))throw error;fail(error.code.endsWith('example-target')?'example-target':'example-proof',error.message,error.code.endsWith('example-target')?'target-representation':'unavailable-proof');continue;}
   retainMigrationParameterExampleOwners(graph,{parameter:before.scope,schema:before.schema!,media:before.mediaOwner,mediaType:before.media},owners);
   const {source,location:{pointer}}=owners.uniqueLocation(scope),material=owners.uniqueLocation(before.schema!);
   owners.move(before.schema!,material.source,material.location.pointer,'empty_query_text',{context:graph});
   owners.retainNativeHistory({...scope,pointer:scope.pointer+'/content'},source,pointer+'/content','empty_query_media',graph);
   source.set(pointer+'/schema',{type:'array',maxItems:0,items:{type:'string'},enum:[[]]});
   source.set(pointer+'/in','query');source.set(pointer+'/style','form');source.set(pointer+'/explode',true);
   if(source.doc.dataNode(pointer+'/allowEmptyValue'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowEmptyValue'},source,pointer+'/allowEmptyValue','inactive_whole_query_empty_value',graph);
   installMigrationParameterExamples(graph,projectedExamples,0,source,pointer,owners);
   for(const at of migrationLogicalPointers(source.doc))if(!source.origins.has(at))source.origins.set(at,new Set([at]));
   source.presentationChanges.push(pointer);changed=true;continue;
  }
  if(whole&&(!before.media||!formMedia(before.media))){
   const essence=before.media?.split(';')[0].trim().toLowerCase();
   const charset=before.media&&mediaTypes(before.media,false)[0].parameters.get('charset');
   const textCodec=essence==='text/plain'&&values?.every(raw=>wire(before,raw)!==undefined);
   if((charset===undefined||['utf-8','us-ascii'].includes(charset))&&(essence==='application/json'||essence?.endsWith('+json')||textCodec))
    fail('target','The selected whole-query media uses percent-encoded field-free framing; named query Parameters necessarily add a name/value delimiter','target-representation');
   else fail('media-proof','No captured whole-query media/charset certificate establishes an equivalent complete target serialization language');
   continue;
  }
  if(whole&&!defaultFormEncoding(graph,before)){
   fail('encoding-proof','No established scalar form certificate covers these Encoding instructions; advanced positional and nested Encoding remain separately assigned');continue;
  }
  if(!values){fail('proof','An exhaustive finite source domain could not be established within the captured proof budget');continue;}
  const factors=queryFactors(graph,before,values,budget);
  const schemaExamples=whole?schemaExampleCandidates(graph,before.schema):undefined;
  const layer=(at:MigrationLocation)=>{
   const doc=graph.docs.get(at.resource)!,single=doc.dataNode(at.pointer+'/example'),named=doc.dataNode(at.pointer+'/examples');
   return {present:!!single||!!named,choices:!!single||!!named?.children.size};
  };
  const parameterLayer=layer(scope),mediaLayer=before.mediaOwner?layer(before.mediaOwner):{present:false,choices:false};
  const hasExamples=parameterLayer.choices||mediaLayer.choices||!mediaLayer.present&&!!schemaExamples&&(!schemaExamples.complete||schemaExamples.values.length>0);
  const splitCookie=!whole&&factors&&!factors.restriction&&factors.fields.every(field=>field.type!=='array')&&
   !equalWire(before,{...before,value:{...before.value,style:'form',explode:true}},values);
  const identityQuery:Declaration={...before,media:undefined,mediaOwner:undefined,scope:{...before.scope,family:target},
   value:{...before.value,in:'query',style:'form',explode:true}};
  const identityWire=whole&&target!=='2.0'&&(equalWire(before,identityQuery,values)||
   equalWire(before,{...identityQuery,value:{...identityQuery.value,allowReserved:true}},values));
  if(factors&&!factors.restriction&&factors.fields.length&&(splitCookie||whole&&(target==='2.0'||!hasExamples||!identityWire||factors.fields.some(field=>field.type==='array')))){
   if(!whole){
    const semantics=new ParameterSemantics(graph),names=new Set(factors.fields.map(field=>field.name));
    const collision=graph.operations().some(operation=>{
     const visible=semantics.operation(operation.source.resource,operation.source.pointer,operation.pathItem).visible;
     if(!visible.some(parameter=>parameter.definition&&key(parameter.definition)===key(scope)))return false;
     return visible.some(parameter=>{
      if(parameter.location!=='cookie'||!parameter.definition||key(parameter.definition)===key(scope))return false;
      const outputs=factorOwners.get(key(parameter.definition));
      return outputs?outputs.some(output=>names.has(sources.get(output.resource)!.doc.dataNode(output.pointer+'/name')?.value)):names.has(parameter.name!);
     });
    });
    if(collision){fail('collision','The extracted cookie names collide with another effective Cookie Parameter owner; neither declaration can be merged or overwritten','target-representation');continue;}
   }
   const declarations:Declaration[]=factors.fields.map(field=>{
    const result:Declaration={...before,wholeForm:false,media:undefined,mediaOwner:undefined,scope:{...before.scope,family:target},
     value:{...before.value,name:field.name,in:whole?'query':'cookie',required:field.required,style:'form',explode:true,
      ...(target==='2.0'?{type:field.type,collectionFormat:field.type==='array'?'multi':undefined,allowEmptyValue:true}:{})}};
    if(whole&&target!=='2.0'&&!equalQueryFieldWire(before,result,field.name,values)){
     const reserved={...result,value:{...result.value,allowReserved:true}};
     if(equalQueryFieldWire(before,reserved,field.name,values))return reserved;
    }
    if(!whole&&!equalRepeatedCookieField(before,result,field.name,values))return {...result,media:field.type==='string'?'text/plain':'application/json'};
    return result;
   });
   if(!values.every(raw=>equalFactorWire(before,declarations,raw))||!await wireLanguage(graph,before,values,examples,budget)){
    fail('proof','The complete field product does not preserve original escaping, ordered repeated fields or captured inversion');continue;
   }
   let projectedExamples:ParameterExampleProjection;
   try{projectedExamples=await parameterExamples(graph,before,declarations,values,examples,factors.fields.map(field=>field.name));}
   catch(error){if(!(error instanceof SourceError))throw error;fail(error.code.endsWith('example-target')?'example-target':'example-proof',error.message,error.code.endsWith('example-target')?'target-representation':'unavailable-proof');continue;}
   if(target==='2.0'&&projectedExamples.fields.some(field=>field.length)){
    fail('example-target','Swagger flat Parameters have no standard field retaining these active whole-query examples and their selection names','target-representation');continue;
   }
   const {source,location:{pointer}}=owners.uniqueLocation(scope);
   retainMigrationParameterExampleOwners(graph,{parameter:before.scope,schema:before.schema!,media:before.mediaOwner,mediaType:before.media},owners);
   const schemaAt=before.schema!,schemaMaterial=owners.uniqueLocation(schemaAt);
   owners.move(schemaAt,schemaMaterial.source,schemaMaterial.location.pointer,'whole_query_object',{context:graph});
   if(whole)owners.retainNativeHistory({...scope,pointer:scope.pointer+'/content'},source,pointer+'/content','whole_query_media',graph);
   if(!whole&&source.doc.dataNode(pointer+'/allowReserved'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowReserved'},source,pointer+'/allowReserved','inactive_literal_cookie_reserved',graph);
   if(source.doc.dataNode(pointer+'/allowEmptyValue'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowEmptyValue'},source,pointer+'/allowEmptyValue','inactive_whole_query_empty_value',graph);
   const base=source.fork(),outputs:MigrationLocation[]=[];
   const orderedFields=projectedExamples.order.map(index=>({field:factors.fields[index],declaration:declarations[index],examples:projectedExamples.fields[index]}));
   const orderedExamples={...projectedExamples,fields:orderedFields.map(field=>field.examples)};
   for(const [index,{field,declaration}]of orderedFields.entries()){
    const output=index===0?{source,location:{resource:source.doc.id,pointer}}:
     owners.reserve(scope,'whole_query_field',JSON.stringify([graph.root,scope.resource,scope.pointer,field.name]),{resource:graph.root,pointer:graph.family==='2.0'?'/parameters':'/components/parameters'});
    const at=output.location.pointer;
    if(index){
     output.source.copy(base,pointer,at,true);
     for(const locations of output.source.originSets())locations.delete(at);
     // Additional typed root ownership is explicit. Its copied metadata keeps
     // provenance, but the original content/schema remains a neutral owner.
     for(const context of graphs)if(context.scopeAs(scope.resource,scope.pointer,'parameter'))owners.rememberAdditionalUse(context.root,scope,output.location,new Set(['content','schema','name','in','required','style','explode','allowEmptyValue']));
    }
    const references=field.schemas.map(schema=>({$ref:owners.reference(owners.uniqueLocation(schema).location,scope.family)}));
    output.source.set(at+'/schema',{type:field.type,...(references.length?{allOf:references}:{})});
    if(field.type==='array'){
     const items=finiteArrayItems(field.values);if(items)output.source.set(at+'/schema/items',items);
    }
    output.source.exact(at+'/schema/enum','['+field.values.join(',')+']');
    output.source.set(at+'/name',field.name);output.source.set(at+'/in',whole?'query':'cookie');output.source.set(at+'/required',field.required);
    output.source.set(at+'/style','form');output.source.set(at+'/explode',true);
    if(whole&&declaration.value.allowReserved===true)output.source.set(at+'/allowReserved',true);
    if(!whole&&declaration.media){
     output.source.remove(at+'/style');output.source.remove(at+'/explode');
     output.source.set(at+'/content',{[declaration.media]:{}});
     output.source.move(at+'/schema',at+'/content/'+escape(declaration.media)+'/schema');
    }
    installMigrationParameterExamples(graph,orderedExamples,index,output.source,at,owners);
    // Retain the standard empty-value flag through modern/composed routes too.
    if(whole&&field.values.some(raw=>{const doc=new SourceDocument(raw,'file:///empty-field.json',true,'json');return doc.dataNode('')!.kind==='string'&&doc.dataNode('')!.value===''||doc.dataNode('')!.kind==='array'&&[...doc.dataNode('')!.children.values()].some(node=>node.kind==='string'&&node.value==='');}))output.source.set(at+'/allowEmptyValue',true);
    output.source.presentationChanges.push(at);outputs.push(output.location);
    for(const at of migrationLogicalPointers(output.source.doc))if(!output.source.origins.has(at))output.source.origins.set(at,new Set([at]));
   }
   factorOwners.set(key(scope),outputs);changed=true;continue;
  }
  if(target==='2.0'){
   if(factors?.restriction)fail('factorization',factors.restriction,'target-representation');
   else fail('proof','No complete finite factorization into valid flat Swagger Parameters has been established');
   continue;
  }
  const repeated=whole&&!factors?.restriction?await repeatedField(graph,before,values,examples,budget):undefined;
  if(repeated){
   const material=owners.uniqueLocation(scope),{source,location:{pointer}}=material;
   const declaration:Declaration={...before,wholeForm:false,media:undefined,mediaOwner:undefined,
    value:{...before.value,name:repeated.name,in:'query',required:repeated.required,style:'form',explode:true}};
   let projectedExamples:ParameterExampleProjection;
   try{projectedExamples=await parameterExamples(graph,before,[declaration],values,examples,[repeated.name]);}
   catch(error){if(!(error instanceof SourceError))throw error;fail(error.code.endsWith('example-target')?'example-target':'example-proof',error.message,error.code.endsWith('example-target')?'target-representation':'unavailable-proof');continue;}
   retainMigrationParameterExampleOwners(graph,{parameter:before.scope,schema:before.schema!,media:before.mediaOwner,mediaType:before.media},owners);
   const schemaAt=before.schema!,schemaMaterial=owners.uniqueLocation(schemaAt);
   owners.move(schemaAt,schemaMaterial.source,schemaMaterial.location.pointer,'whole_query_object',{context:graph});
   const fieldAt=owners.uniqueLocation(repeated.schema).location;
   source.set(pointer+'/schema',{type:'array',allOf:[{$ref:owners.reference(fieldAt,target)}]});
   // Exact literals are copied as source text, never machine numbers.
   source.exact(pointer+'/schema/enum','['+repeated.values.join(',')+']');
   owners.retainNativeHistory({...scope,pointer:scope.pointer+'/content'},source,pointer+'/content','whole_query_media',graph);
   if(source.doc.dataNode(pointer+'/allowEmptyValue'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowEmptyValue'},source,pointer+'/allowEmptyValue','inactive_whole_query_empty_value',graph);
   source.set(pointer+'/name',repeated.name);source.set(pointer+'/in','query');source.set(pointer+'/required',repeated.required);
   source.set(pointer+'/style','form');source.set(pointer+'/explode',true);
   installMigrationParameterExamples(graph,projectedExamples,0,source,pointer,owners);
   source.presentationChanges.push(pointer);changed=true;
   for(const at of migrationLogicalPointers(source.doc))if(!source.origins.has(at))source.origins.set(at,new Set([at]));
   continue;
  }
  const formTarget:Declaration={...before,media:undefined,mediaOwner:undefined,scope:{...scope,family:target},
   value:{...before.value,content:undefined,in:whole?'query':'cookie',style:'form',explode:true}};
  if(!whole&&!equalWire(before,formTarget,values)&&values.length&&values.every(raw=>singletonCookieValue(raw)!==undefined)){
   const projected=values.map(raw=>singletonCookieValue(raw)!),kinds=new Set(projected.map(raw=>new SourceDocument(raw,'file:///cookie-element.json',true,'json').dataNode('')!.kind));
   const media=kinds.size===1&&kinds.has('string')?'text/plain':[...kinds].every(kind=>['number','boolean','null'].includes(kind))?'application/json':undefined;
   const after={...formTarget,media};
   if(media&&equalSingletonCookieWire(before,after,values)&&await wireLanguage(graph,before,values,examples,budget)){
    let projectedExamples:ParameterExampleProjection;
    try{projectedExamples=await parameterExamples(graph,before,[after],values,examples,undefined,true);}
    catch(error){if(!(error instanceof SourceError))throw error;fail(error.code.endsWith('example-target')?'example-target':'example-proof',error.message,error.code.endsWith('example-target')?'target-representation':'unavailable-proof');continue;}
    retainMigrationParameterExampleOwners(graph,{parameter:before.scope,schema:before.schema!},owners);
    const {source,location:{pointer}}=owners.uniqueLocation(scope),material=owners.uniqueLocation(before.schema!);
    owners.move(before.schema!,material.source,material.location.pointer,'literal_cookie_array',{context:graph});
    for(const name of ['style','explode','allowReserved'])if(source.doc.dataNode(pointer+'/'+name))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/'+name},source,pointer+'/'+name,'literal_cookie_'+name,graph);
    source.set(pointer+'/content',{[media]:{schema:kinds.size===1?{type:[...kinds][0]}:{}}});
    const schema=pointer+'/content/'+escape(media)+'/schema';source.exact(schema+'/enum','['+projected.join(',')+']');
    installMigrationParameterExamples(graph,projectedExamples,0,source,pointer,owners);
    for(const at of migrationLogicalPointers(source.doc))if(!source.origins.has(at))source.origins.set(at,new Set([at]));
    source.presentationChanges.push(pointer);changed=true;continue;
   }
  }
  let after=formTarget;
  if(whole&&!equalWire(before,after,values)){
   const reserved={...formTarget,value:{...formTarget.value,allowReserved:true}};
   if(equalWire(before,reserved,values))after=reserved;
  }
  if(!equalWire(before,after,values)){
   if(factors?.restriction){fail('factorization',factors.restriction,'target-representation');continue;}
   const kinds=values.map(raw=>new SourceDocument(raw,'file:///cookie-domain.json',true,'json').dataNode('')!.kind);
   if(!whole&&kinds.every(kind=>kind==='string'||['number','boolean','null'].includes(kind))){
    const media=kinds.every(kind=>kind==='string')?'text/plain':kinds.every(kind=>['number','boolean','null'].includes(kind))?'application/json':undefined;
    if(media)after={...formTarget,media,value:{...formTarget.value,style:undefined,explode:undefined}};
   }
   if(!equalWire(before,after,values)){
    if(!whole&&values.some(raw=>{const doc=new SourceDocument(raw,'file:///cookie-multiplicity.json',true,'json');return doc.dataNode('')!.kind==='array'&&doc.dataNode('')!.children.size>1&&wire(before,raw)!==undefined;})){
     fail('target','The source repeats one cookie name with semicolon delimiters; older form Cookies use ampersand grouping and duplicate native Cookie Parameter names cannot retain independent ownership','target-representation');continue;
    }
    fail('proof',whole?'The complete domain does not establish equal form/RFC6570 escaping, scalar fields, member ordering and empty presence behavior':
     'The complete domain does not establish legal cookie octets, equal escaping, delimiters, field ownership and empty behavior');continue;
   }
  }
  let cookieExamples:ParameterExampleProjection|undefined;
  if(!whole){
   try{cookieExamples=await parameterExamples(graph,before,[after],values,examples);}
   catch(error){if(!(error instanceof SourceError))throw error;fail(error.code.endsWith('example-target')?'example-target':'example-proof',error.message,error.code.endsWith('example-target')?'target-representation':'unavailable-proof');continue;}
  }
  retainMigrationParameterExampleOwners(graph,{parameter:before.scope,schema:before.schema!,media:before.mediaOwner,mediaType:before.media},owners);
  const material=owners.uniqueLocation(scope),{source,location:{pointer}}=material;
  if(whole){
   const media=pointer+'/content/'+escape(before.media!);
   let projectedExamples:ParameterExampleProjection;
   try{projectedExamples=await parameterExamples(graph,before,[after],values,examples);}
   catch(error){if(!(error instanceof SourceError))throw error;fail(error.code.endsWith('example-target')?'example-target':'example-proof',error.message,error.code.endsWith('example-target')?'target-representation':'unavailable-proof');continue;}
   if(source.doc.dataNode(pointer+'/allowEmptyValue'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowEmptyValue'},source,pointer+'/allowEmptyValue','inactive_whole_query_empty_value',graph);
   source.move(media+'/schema',pointer+'/schema');
   installMigrationParameterExamples(graph,projectedExamples,0,source,pointer,owners);
   owners.retainNativeHistory({...scope,pointer:scope.pointer+'/content'},source,pointer+'/content','whole_query_media',graph);
   source.set(pointer+'/in','query');source.set(pointer+'/style','form');source.set(pointer+'/explode',true);
   if(after.value.allowReserved===true)source.set(pointer+'/allowReserved',true);
  }else if(after.media){
   owners.retainNativeHistory({...scope,pointer:scope.pointer+'/style'},source,pointer+'/style','literal_cookie_style',graph);
   if(source.doc.dataNode(pointer+'/explode'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/explode'},source,pointer+'/explode','literal_cookie_explode',graph);
   if(source.doc.dataNode(pointer+'/allowReserved'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowReserved'},source,pointer+'/allowReserved','inactive_literal_cookie_reserved',graph);
   source.set(pointer+'/content',{[after.media]:{}});source.move(pointer+'/schema',pointer+'/content/'+escape(after.media)+'/schema');
  }else {
   if(source.doc.dataNode(pointer+'/allowReserved'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowReserved'},source,pointer+'/allowReserved','inactive_literal_cookie_reserved',graph);
   source.set(pointer+'/style','form');source.set(pointer+'/explode',true);
  }
  if(cookieExamples)installMigrationParameterExamples(graph,cookieExamples,0,source,pointer,owners);
  source.presentationChanges.push(pointer);changed=true;
  // Subsequent stages inspect the refreshed graph's new schema/example
  // coordinates. Keep those synthetic coordinates alongside the original
  // move provenance, as in native media materialization.
  for(const at of migrationLogicalPointers(source.doc))if(!source.origins.has(at))source.origins.set(at,new Set([at]));
 }
 expandQueryUses(graphs,owners,factorOwners);
 return changed;
}

/** Recompute both complete domains at the publication boundary. These profiles
 * replace instruction comparison only after an exact wire/presence proof, for
 * independently referenced owners as well as effective operation parameters. */
export async function proveMigrationParameterSerialization(source:ReferenceGraph,target:ReferenceGraph,
 mapped:(at:MigrationLocation,scope:GraphScope)=>readonly MigrationLocation[],issue:MigrationIssue,
 examples:readonly ExternalExampleResourcePacket[]=[],targetExamples:readonly ExternalExampleResourcePacket[]=examples):Promise<Readonly<{before:ParameterWireProfiles;after:ParameterWireProfiles;changes:readonly MigrationParameterChange[]}>> {
 const beforeProfiles=new Map<string,string>(),afterProfiles=new Map<string,string>(),budget=new ParameterProofBudget(),changes:MigrationParameterChange[]=[];
 for(const scope of source.entryScopes()){
  if(scope.kind!=='parameter')continue;
  const before=declaration(source,scope);if(!before||target.specifications.get(target.root)?.family==='3.2')continue;
  const reserved=before.value.in==='query'&&before.value.allowReserved===true&&!before.media&&target.specifications.get(target.root)?.family==='2.0';
  if(!reserved&&(before.scope.family!=='3.2'||before.value.in!=='querystring'&&!(before.value.in==='cookie'&&before.value.style==='cookie')))continue;
  const values=await domain(source,before,examples,budget);
  const outputs=mapped(scope,scope).filter(at=>target.scopeAs(at.resource,at.pointer,'parameter')&&target.isEntryUse({...at,kind:'parameter'}));
  const identity=(raw:string)=>migrationValueIdentity(new SourceDocument(raw,'file:///finite-value.json',true,'json'),'');
  if(!values||!outputs.length){issue(scope,'migration.invariant.parameter-wire','The captured parameter lost its exhaustive domain or independent target owner','unavailable-proof');continue;}
  const signature=JSON.stringify({name:before.value.name,in:before.value.in,required:before.value.required===true,
   deprecated:before.value.deprecated===true,domain:language(values),wire:values.map(raw=>[identity(raw),wire(before,raw)]),absent:before.value.required?'required':'omitted'});
  const resolved=outputs.map(at=>({at,owner:declaration(target,at)}));
  const factors=queryFactors(source,before,values,budget);
  if(factors&&!factors.restriction&&factors.fields.length&&resolved.every(({owner})=>owner?.value.in===(before.value.in==='cookie'?'cookie':'query')&&owner.schema&&target.docs.get(owner.schema.resource)!.dataNode(owner.schema.pointer)?.value?.type!=='object')){
   let valid=true;
   const actual=new Map<string,Declaration>();
   for(const {owner}of resolved){
    const field=factors.fields.find(field=>field.name===owner!.value.name),permitted=owner&&await domain(target,owner,targetExamples,budget);
    if(!owner||!field||!permitted||target.docs.get(owner.schema!.resource)!.dataNode(owner.schema!.pointer)?.value?.type!==field.type||!!owner.value.required!==field.required||!!owner.value.deprecated!==!!before.value.deprecated||language(field.values)!==language(permitted)||!await wireLanguage(target,owner,permitted,targetExamples,budget)){valid=false;continue;}
    actual.set(field.name,owner);
   }
   valid&&=actual.size===factors.fields.length&&values.every(raw=>equalFactorWire(before,[...actual.values()],raw))&&await wireLanguage(source,before,values,examples,budget);
   if(!valid){issue(scope,'migration.invariant.parameter-wire','The target factor group changed a field domain, name, multiplicity, codec or required/optional combination','unavailable-proof');continue;}
   const ordered=factors.fields.map(field=>actual.get(field.name)!);
   try{
    const expected=await parameterExamples(source,before,ordered,values,examples,factors.fields.map(field=>field.name));
    if(!sameMigrationParameterExamples(source,expected,target,ordered.map(owner=>owner.scope),targetExamples)||
     !sameParameterExampleOrder(target,ordered,expected,before.value.in==='cookie'?'; ':'&')){
     issue(scope,'migration.invariant.parameter-examples','The complete target group changed authored example choices, exact values, metadata or external bytes','implementation');continue;
    }
   }catch(error){if(!(error instanceof SourceError))throw error;issue(scope,'migration.invariant.parameter-examples',error.message,'unavailable-proof');continue;}
   const grouped=JSON.stringify({group:signature,fields:factors.fields.map(field=>field.name).sort()});
   beforeProfiles.set(key(scope),grouped);beforeProfiles.set(key(before.scope),grouped);
   for(const {at,owner}of resolved){
    afterProfiles.set(key(at),grouped);afterProfiles.set(key(owner!.scope),grouped);
    if(changes.length>=4096)throw new SourceError('limit.migration.parameters','Parameter review exceeds 4096 captured occurrences');
    changes.push({resource:scope.resource,pointer:scope.pointer,range:source.docs.get(scope.resource)!.dataNode(scope.pointer)!.range,
     name:before.value.name,before:before.value.in+' · '+(before.media??'cookie'),after:owner!.value.in+' · '+(owner!.media??(owner!.scope.family==='2.0'&&owner!.value.type==='array'?'multi':'form'))+' · '+owner!.value.name});
   }
   continue;
  }
  for(const at of outputs){
   const after=declaration(target,at),permitted=after&&await domain(target,after,targetExamples,budget);
   const field=!factors?.restriction&&after&&before.value.in==='querystring'&&after.schema!==undefined&&target.docs.get(after.schema.resource)!.dataNode(after.schema.pointer)?.value?.type==='array'?
    await repeatedField(source,before,values,examples,budget):undefined;
   const validField=field&&after&&permitted&&after.value.name===field.name&&after.value.in==='query'&&
    !!after.value.deprecated===!!before.value.deprecated&&after.value.required===field.required&&language(field.values)===language(permitted)&&equalRepeatedWire(before,after,field,values)&&
    await wireLanguage(target,after,permitted,targetExamples,budget);
   const singleton=before.value.in==='cookie'&&values.length>0&&values.every(raw=>singletonCookieValue(raw)!==undefined)&&after?.schema&&target.docs.get(after.schema.resource)!.dataNode(after.schema.pointer)?.value?.type!=='array';
   const validSingleton=singleton&&after&&permitted&&after.value.in==='cookie'&&before.value.name===after.value.name&&
    !!before.value.required===!!after.value.required&&!!before.value.deprecated===!!after.value.deprecated&&
    language(values.map(raw=>singletonCookieValue(raw)!))===language(permitted)&&equalSingletonCookieWire(before,after,values)&&
    await wireLanguage(source,before,values,examples,budget)&&await wireLanguage(target,after,permitted,targetExamples,budget);
   const validEmpty=before.value.in==='querystring'&&emptyTextDomain(before,values)&&after&&permitted&&
    !before.value.required&&!after.value.required&&after.value.in==='query'&&before.value.name===after.value.name&&!!before.value.deprecated===!!after.value.deprecated&&
    language(permitted)===language(['[]'])&&equalEmptyTextWire(before,after,values)&&await wireLanguage(target,after,permitted,targetExamples,budget);
   if(!validField&&!validSingleton&&!validEmpty&&(!after||!permitted||language(values)!==language(permitted)||before.value.name!==after.value.name||
    !!before.value.required!==!!after.value.required||!!before.value.deprecated!==!!after.value.deprecated||!equalWire(before,after,values)||
    !await wireLanguage(source,before,values,examples,budget)||!await wireLanguage(target,after,values,targetExamples,budget))){
    issue(scope,'migration.invariant.parameter-wire','The target parameter changed its exhaustive value language, request-target/Cookie octets, names or presence behavior','unavailable-proof');continue;
   }
   if(!after)continue;
   if(before.wholeForm||before.value.in==='cookie'||validEmpty){
    try{
     const expected=await parameterExamples(source,before,[after],values,examples,validField?[field!.name]:undefined,!!validSingleton,!!validEmpty);
     if(!sameMigrationParameterExamples(source,expected,target,[after.scope],targetExamples)){
      issue(scope,'migration.invariant.parameter-examples','The target parameter changed authored example selection, exact values, metadata or external bytes','implementation');continue;
     }
    }catch(error){if(!(error instanceof SourceError))throw error;issue(scope,'migration.invariant.parameter-examples',error.message,'unavailable-proof');continue;}
   }
   const projection=validSingleton?'cookie-singleton':validEmpty?'empty-text-query':undefined;
   const profile=projection?JSON.stringify({...JSON.parse(signature),projection}):signature;
   beforeProfiles.set(key(scope),profile);beforeProfiles.set(key(before.scope),profile);
   afterProfiles.set(key(at),profile);afterProfiles.set(key(after.scope),profile);
   if(changes.length>=4096)throw new SourceError('limit.migration.parameters','Parameter review exceeds 4096 captured occurrences');
   const label=(owner:Declaration)=>owner.value.in+' · '+(owner.media??parameterStyle(
    isNativeFamily(owner.scope.family)?owner.scope.family:'3.2',owner.value.in,owner.value).style);
   changes.push({resource:scope.resource,pointer:scope.pointer,range:source.docs.get(scope.resource)!.dataNode(scope.pointer)!.range,
    name:before.value.name,before:label(before),after:label(after)+(validField?' · '+after.value.name:'')});
  }
 }
 return {before:beforeProfiles,after:afterProfiles,changes};
}
