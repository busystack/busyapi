import {escape,SourceDocument,SourceError} from './document';
import type {ExternalExampleResourcePacket} from './external_examples';
import type {GraphScope,ReferenceGraph} from './reference_graph';
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
import {MigrationSchemaProofs} from './migration_schema_proofs';

const key=(at:MigrationLocation)=>JSON.stringify([at.resource,at.pointer]);
type Pair=readonly [string,string];
type ParameterDeclaration=Record<string,unknown>&{name:string;in:string;content?:Record<string,unknown>;style?:string;explode?:boolean;required?:boolean;deprecated?:boolean;allowReserved?:boolean};
type Declaration=Readonly<{scope:GraphScope;value:ParameterDeclaration;schema?:GraphScope;media?:string;mediaOwner?:MigrationLocation;wholeForm?:boolean}>;
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
  resources=[...graph.docs].map(([id,doc])=>({id,text:doc.text,generation:0,aliases:[...aliases.get(id)!]}));
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
  schema:schema&&graph.scopeAs(schema.resource,schema.pointer,'schema')};
 return {...result,wholeForm:value.in==='querystring'&&media.length===1&&
  /^application\/x-www-form-urlencoded(?:\s*;\s*charset\s*=\s*"?utf-8"?)?$/iu.test(media[0])&&defaultFormEncoding(graph,result)};
}

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

const uri=(value:string)=>encodeURIComponent(value).replace(/[!'()*]/gu,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
const form=(value:string)=>uri(value).replaceAll('%20','+');
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
 const style=parameterStyle(owner.scope.family,location,value);
 const scalar=(pointer:string):string|undefined=>{
  const node=doc.dataNode(pointer)!;
  if(location==='cookie'&&node.kind==='number')return;
  return node.kind==='object'||node.kind==='array'?undefined:typeof node.value==='string'?node.value:doc.dataJson(pointer);
 };
 let pairs:Pair[]=[];
 if(location==='querystring'||location==='query'&&!media){
  if(location==='querystring'&&!owner.wholeForm)return;
  if(root.kind!=='object'||location==='query'&&(style.style!=='form'||!style.explode||value.allowReserved===true))return;
  for(const name of root.children.keys()){
   const text=scalar('/'+escape(name));if(text===undefined)return;
   const encode=location==='querystring'?form:uri;
   // The component certificate covers all member orders and all exact numeric
   // spellings: both serializers apply the same scalar conversion before URI
   // encoding. A space is the sole codec difference for this supported shape.
   if(form(name)!==uri(name)||form(text)!==uri(text))return;
   pairs.push([uri(name),encode(text)]);
  }
 }else if(location==='cookie'){
  if(!media&&(!['form','cookie'].includes(style.style)||style.style==='cookie'&&owner.scope.family!=='3.2'))return;
  const literal=style.style==='cookie'||media!==undefined;
  if(media&&(!/^text\/plain(?:\s*;\s*charset\s*=\s*"?utf-8"?)?$/iu.test(media)||root.kind!=='string'))return;
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
   if(root.kind==='number')return;
   pairs.push([value.name,scalar('')!]);
  }
  if(!literal){
   pairs=pairs.map(([name,text])=>[uri(name),uri(text)] as const);
   // Older form uses '&' inside one cookie value, not '; ' between cookies.
   if(pairs.length>1){const [name,text]=pairs[0];pairs=[[name,[text,...pairs.slice(1).map(([n,v])=>n+'='+v)].join('&')]];}
  }
  if(pairs.some(([name,text])=>!cookieName.test(name)||!cookieValue.test(text)))return;
 }else return;
 return {pairs,text:pairs.map(([name,text])=>name+'='+text).join(location==='cookie'?'; ':'&'),
  emptyFailure:!!value.required&&location!=='querystring'&&pairs.length===0};
}

function wire(owner:Declaration,raw:string):Wire|undefined {
 try{return projectWire(owner,raw);}
 catch(error){if(error instanceof URIError)return;throw error;}
}

function defaultFormEncoding(graph:ReferenceGraph,owner:Declaration):boolean {
 const media=owner.mediaOwner&&graph.docs.get(owner.mediaOwner.resource)!.dataNode(owner.mediaOwner.pointer)?.value;
 if(!media)return false;
 if(Object.hasOwn(media,'itemSchema')||Object.hasOwn(media,'prefixEncoding')||Object.hasOwn(media,'itemEncoding'))return false;
 return Object.values(media.encoding??{}).every(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
  const rule=raw as Record<string,unknown>;
  return Object.entries(rule).every(([name,value])=>name==='style'&&value==='form'||name==='explode'&&value===true||
   name==='allowReserved'&&value===false||name==='contentType'&&value==='text/plain'||name==='headers'&&value&&typeof value==='object'&&Object.keys(value).length===0||name.startsWith('x-'));
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

/** Captured saved inputs can lie outside the schema's permitted language.
 * Preserve their actual codec too; an enum is no permission to alter them. */
export function sameMigrationParameterValue(source:ReferenceGraph,before:MigrationLocation,target:ReferenceGraph,after:MigrationLocation,raw:string):boolean {
 const first=declaration(source,before),last=declaration(target,after);
 return first!==undefined&&last!==undefined&&equalWire(first,last,[raw]);
}

/** Identity-value mappings preserve cross-property assertions, requiredness,
 * independent schemas and examples without splitting one constrained object
 * into unrelated parameters. The common allocator still owns every move. */
export async function migrateParameterSerialization(graphs:readonly ReferenceGraph[],sources:Map<string,MigrationSource>,families:readonly string[],
 target:string,owners:MigrationSchemaOwners,issue:MigrationIssue,examples:readonly ExternalExampleResourcePacket[]=[]):Promise<boolean> {
 if(target==='3.2'||!families.includes('3.2'))return false;
 let changed=false;const budget=new ParameterProofBudget();
 for(const scope of migrationScopes(graphs)){
  if(scope.kind!=='parameter'||scope.family!=='3.2')continue;
  const graph=graphs.find(graph=>graph.scopeAs(scope.resource,scope.pointer,'parameter')?.family==='3.2')!;
  const authored=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.value;
  if(typeof authored?.$ref==='string'||authored?.in!=='querystring'&&!(authored?.in==='cookie'&&authored?.style==='cookie'))continue;
  const whole=authored.in==='querystring',field={...scope,pointer:scope.pointer+(whole?'/in':'/style')};
  const fail=(suffix:string,message:string,reason:'unavailable-proof'|'target-representation'='unavailable-proof')=>
   issue(field,'migration.parameter.'+(whole?'querystring':'cookie')+'-'+suffix,message,reason);
  if(target==='2.0'){
   if(whole)fail('proof','No complete factorization into flat Swagger query Parameters has been established for this whole-query value language, independent ownership and grouped presence');
   else fail('target','Swagger has no native cookie Parameter location; an ordinary Header is not an equivalent cookie owner','target-representation');
   continue;
  }
  const before=declaration(graph,scope);
  if(!before?.schema){fail('proof','No captured effective schema establishes the complete parameter value domain');continue;}
  const values=await domain(graph,before,examples,budget);
  // No present data value is permitted. Retain the entire selected native
  // media/schema/example owner; only its location key changes. No named field
  // can enter the valid wire language, including for non-form media types.
  if(whole&&values?.length===0){
   const {source,location:{pointer}}=owners.uniqueLocation(scope);
   if(source.doc.dataNode(pointer+'/allowEmptyValue'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowEmptyValue'},source,pointer+'/allowEmptyValue','inactive_whole_query_empty_value',graph);
   source.set(pointer+'/in','query');source.presentationChanges.push(pointer);changed=true;continue;
  }
  if(whole&&(!before.media||!/^application\/x-www-form-urlencoded(?:\s*;\s*charset\s*=\s*"?utf-8"?)?$/iu.test(before.media))){
   const essence=before.media?.split(';')[0].trim().toLowerCase();
   if(essence==='application/json'||essence?.endsWith('+json'))
    fail('target','The selected whole-query JSON media has no named query representation preserving its field-free framing and escaping','target-representation');
   else fail('media-proof','No captured whole-query media/charset certificate establishes an equivalent complete target serialization language');
   continue;
  }
  if(whole&&!defaultFormEncoding(graph,before)){
   fail('encoding-proof','No established scalar form certificate covers these Encoding instructions; advanced positional and nested Encoding remain separately assigned');continue;
  }
  if(!values){fail('proof','An exhaustive finite source domain could not be established within the captured proof budget');continue;}
  const formTarget:Declaration={...before,media:undefined,mediaOwner:undefined,scope:{...scope,family:target},
   value:{...before.value,content:undefined,in:whole?'query':'cookie',style:'form',explode:true}};
  let after=formTarget;
  if(!equalWire(before,after,values)){
   const strings=values.every(raw=>new SourceDocument(raw,'file:///cookie-domain.json',true,'json').dataNode('')?.kind==='string');
   if(!whole&&strings){
    after={...formTarget,media:'text/plain',value:{...formTarget.value,style:undefined,explode:undefined}};
   }
   if(!equalWire(before,after,values)){
    fail('proof',whole?'The complete domain does not establish equal form/RFC6570 escaping, scalar fields, member ordering and empty presence behavior':
     'The complete domain does not establish legal cookie octets, equal escaping, delimiters, field ownership and empty behavior');continue;
   }
  }
  const material=owners.uniqueLocation(scope),{source,location:{pointer}}=material;
  if(whole){
   const media=pointer+'/content/'+escape(before.media!);
   // Applicable schema-ready examples keep their original typed owners. Two
   // authored override layers need a separate example-selection certificate.
   if(['example','examples'].some(name=>source.doc.dataNode(media+'/'+name))&&
    ['example','examples'].some(name=>source.doc.dataNode(pointer+'/'+name))){
    fail('example-proof','Both Parameter and Media Type examples require an independent selection/override certificate');continue;
   }
   if(source.doc.dataNode(pointer+'/allowEmptyValue'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowEmptyValue'},source,pointer+'/allowEmptyValue','inactive_whole_query_empty_value',graph);
   source.move(media+'/schema',pointer+'/schema');
   for(const name of ['example','examples'])if(source.doc.dataNode(media+'/'+name))source.move(media+'/'+name,pointer+'/'+name);
   owners.retainNativeHistory({...scope,pointer:scope.pointer+'/content'},source,pointer+'/content','whole_query_media',graph);
   source.set(pointer+'/in','query');source.set(pointer+'/style','form');source.set(pointer+'/explode',true);
  }else if(after.media){
   owners.retainNativeHistory({...scope,pointer:scope.pointer+'/style'},source,pointer+'/style','literal_cookie_style',graph);
   if(source.doc.dataNode(pointer+'/explode'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/explode'},source,pointer+'/explode','literal_cookie_explode',graph);
   if(source.doc.dataNode(pointer+'/allowReserved'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowReserved'},source,pointer+'/allowReserved','inactive_literal_cookie_reserved',graph);
   source.set(pointer+'/content',{'text/plain':{}});source.move(pointer+'/schema',pointer+'/content/text~1plain/schema');
  }else {
   if(source.doc.dataNode(pointer+'/allowReserved'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowReserved'},source,pointer+'/allowReserved','inactive_literal_cookie_reserved',graph);
   source.set(pointer+'/style','form');source.set(pointer+'/explode',true);
  }
  source.presentationChanges.push(pointer);changed=true;
  // Subsequent stages inspect the refreshed graph's new schema/example
  // coordinates. Keep those synthetic coordinates alongside the original
  // move provenance, as in native media materialization.
  for(const at of migrationLogicalPointers(source.doc))if(!source.origins.has(at))source.origins.set(at,new Set([at]));
 }
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
  const before=declaration(source,scope);if(!before||before.scope.family!=='3.2'||target.specifications.get(target.root)?.family==='3.2')continue;
  if(before.value.in!=='querystring'&&!(before.value.in==='cookie'&&before.value.style==='cookie'))continue;
  const values=await domain(source,before,examples,budget);
  const outputs=mapped(scope,scope).filter(at=>target.scopeAs(at.resource,at.pointer,'parameter')&&target.isEntryUse({...at,kind:'parameter'}));
  const identity=(raw:string)=>migrationValueIdentity(new SourceDocument(raw,'file:///finite-value.json',true,'json'),'');
  const language=(values:Domain)=>JSON.stringify([...new Set(values.map(identity))].sort());
  if(!values||!outputs.length){issue(scope,'migration.invariant.parameter-wire','The captured parameter lost its exhaustive domain or independent target owner','unavailable-proof');continue;}
  const signature=JSON.stringify({name:before.value.name,in:before.value.in,required:before.value.required===true,
   deprecated:before.value.deprecated===true,domain:language(values),wire:values.map(raw=>[identity(raw),wire(before,raw)]),absent:before.value.required?'required':'omitted'});
  for(const at of outputs){
   const after=declaration(target,at),permitted=after&&await domain(target,after,targetExamples,budget);
   if(!after||!permitted||language(values)!==language(permitted)||before.value.name!==after.value.name||
    !!before.value.required!==!!after.value.required||!!before.value.deprecated!==!!after.value.deprecated||!equalWire(before,after,values)||
    !await wireLanguage(source,before,values,examples,budget)||!await wireLanguage(target,after,values,targetExamples,budget)){
    issue(scope,'migration.invariant.parameter-wire','The target parameter changed its exhaustive value language, request-target/Cookie octets, names or presence behavior','unavailable-proof');continue;
   }
   beforeProfiles.set(key(scope),signature);beforeProfiles.set(key(before.scope),signature);
   afterProfiles.set(key(at),signature);afterProfiles.set(key(after.scope),signature);
   if(changes.length>=4096)throw new SourceError('limit.migration.parameters','Parameter review exceeds 4096 captured occurrences');
   const label=(owner:Declaration)=>owner.value.in+' · '+(owner.media??parameterStyle(
    isNativeFamily(owner.scope.family)?owner.scope.family:'3.2',owner.value.in,owner.value).style);
   changes.push({resource:scope.resource,pointer:scope.pointer,range:source.docs.get(scope.resource)!.dataNode(scope.pointer)!.range,
    name:before.value.name,before:label(before),after:label(after)});
  }
 }
 return {before:beforeProfiles,after:afterProfiles,changes};
}
