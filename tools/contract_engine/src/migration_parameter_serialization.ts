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
  schema:scope.family==='2.0'?schemaContext(graph,scope.resource,scope.pointer):schema&&graph.scopeAs(schema.resource,schema.pointer,'schema')};
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
 const style=owner.scope.family==='2.0'?swaggerFlat(value,{...owner.scope,range:[0,0]}):parameterStyle(owner.scope.family,location,value);
 const scalar=(pointer:string):string|undefined=>{
  const node=doc.dataNode(pointer)!;
  if(location==='cookie'&&node.kind==='number')return;
  return node.kind==='object'||node.kind==='array'?undefined:typeof node.value==='string'?node.value:doc.dataJson(pointer);
 };
 let pairs:Pair[]=[];
 if(location==='querystring'||location==='query'&&!media){
  if(location==='querystring'&&!owner.wholeForm)return;
  if(location==='query'&&(style.style!=='form'||root.kind==='array'&&!style.explode||value.allowReserved===true))return;
  const append=(name:string,pointer:string):boolean=>{
   const text=scalar(pointer);if(text===undefined||form(name)!==uri(name)||form(text)!==uri(text))return false;
   pairs.push([uri(name),location==='querystring'?form(text):uri(text)]);return true;
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
 if(owner.scope.family==='2.0'&&location==='query'&&value.allowEmptyValue!==true&&pairs.some(([,text])=>text===''))return;
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

type QueryFactor=Readonly<{name:string;schemas:readonly GraphScope[];values:Domain;required:boolean;type:string}>;
type Factorization=Readonly<{fields:readonly QueryFactor[];restriction?:string}>;
const exactIdentity=(raw:string)=>migrationExactValueIdentity(new SourceDocument(raw,'file:///factor-value.json',true,'json'),'');
const language=(values:Domain)=>JSON.stringify([...new Set(values.map(exactIdentity))].sort());

/** Exhaustively compare the complete object relation with the product of its
 * projections, including the absence coordinate. Optional whole groups add
 * exactly the all-absent tuple, never every partially present tuple. */
function queryFactors(graph:ReferenceGraph,owner:Declaration,values:Domain,budget:ParameterProofBudget):Factorization|undefined {
 if(!owner.wholeForm||!owner.schema||!values.length)return;
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
 return JSON.stringify(first.pairs)===JSON.stringify(pairs)&&first.text===pairs.map(([name,value])=>name+'='+value).join('&');
}

/** Used only after the publication invariant has certified these owners.
 * Captured values outside the schema still need the actual codec equality. */
export function sameMigrationQueryFields(source:ReferenceGraph,before:MigrationLocation,target:ReferenceGraph,after:readonly MigrationLocation[],raw:string):boolean {
 const first=declaration(source,before),last=after.map(at=>declaration(target,at));
 return !!first&&last.every((value):value is Declaration=>value!==undefined)&&equalFactorWire(first,last,raw);
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
 if(first.value.in==='querystring'&&last.value.in==='query'&&last.schema!==undefined&&target.docs.get(last.schema.resource)!.dataNode(last.schema.pointer)?.value?.type==='array'){
  const doc=new SourceDocument(raw,'file:///saved-field.json',true,'json'),root=doc.dataNode('')!;
  if(root.kind!=='object'||[...root.children.keys()].some(name=>name!==last.value.name))return false;
  return equalRepeatedWire(first,last,{name:last.value.name},[raw]);
 }
 return equalWire(first,last,[raw]);
}

/** Identity-value mappings preserve cross-property assertions, requiredness,
 * independent schemas and examples without splitting one constrained object
 * into unrelated parameters. The common allocator still owns every move. */
export async function migrateParameterSerialization(graphs:readonly ReferenceGraph[],sources:Map<string,MigrationSource>,families:readonly string[],
 target:string,owners:MigrationSchemaOwners,issue:MigrationIssue,examples:readonly ExternalExampleResourcePacket[]=[]):Promise<boolean> {
 if(target==='3.2'||!families.includes('3.2'))return false;
 let changed=false;const budget=new ParameterProofBudget(),factorOwners=new Map<string,readonly MigrationLocation[]>();
 for(const scope of migrationScopes(graphs)){
  if(scope.kind!=='parameter'||scope.family!=='3.2')continue;
  const graph=graphs.find(graph=>graph.scopeAs(scope.resource,scope.pointer,'parameter')?.family==='3.2')!;
  const authored=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.value;
  if(typeof authored?.$ref==='string'||authored?.in!=='querystring'&&!(authored?.in==='cookie'&&authored?.style==='cookie'))continue;
  const whole=authored.in==='querystring',field={...scope,pointer:scope.pointer+(whole?'/in':'/style')};
  const fail=(suffix:string,message:string,reason:'unavailable-proof'|'target-representation'='unavailable-proof')=>
   issue(field,'migration.parameter.'+(whole?'querystring':'cookie')+'-'+suffix,message,reason);
  if(target==='2.0'&&!whole){fail('target','Swagger has no native cookie Parameter location; an ordinary Header is not an equivalent cookie owner','target-representation');continue;}
  const before=declaration(graph,scope);
  if(!before?.schema){fail('proof','No captured effective schema establishes the complete parameter value domain');continue;}
  const values=await domain(graph,before,examples,budget);
  // No present data value is permitted. Retain the entire selected native
  // media/schema/example owner; only its location key changes. No named field
  // can enter the valid wire language, including for non-form media types.
  if(whole&&values?.length===0&&target!=='2.0'){
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
  const factors=whole?queryFactors(graph,before,values,budget):undefined;
  const schemaExamples=whole?schemaExampleCandidates(graph,before.schema):undefined;
  const hasExamples=!!schemaExamples&&(!schemaExamples.complete||schemaExamples.values.length>0)||before.mediaOwner&&['example','examples'].some(name=>graph.docs.get(before.mediaOwner!.resource)!.dataNode(before.mediaOwner!.pointer+'/'+name)||graph.docs.get(scope.resource)!.dataNode(scope.pointer+'/'+name));
  if(factors&&!factors.restriction&&factors.fields.length&&(target==='2.0'||factors.fields.length>1&&(!hasExamples||factors.fields.some(field=>field.type==='array')))){
   const declarations=factors.fields.map(field=>({...before,wholeForm:false,media:undefined,mediaOwner:undefined,
    value:{...before.value,name:field.name,in:'query',required:field.required,style:'form',explode:true}}));
   if(!values.every(raw=>equalFactorWire(before,declarations,raw))||!await wireLanguage(graph,before,values,examples,budget)){
    fail('proof','The complete field product does not preserve original escaping, ordered repeated fields or captured inversion');continue;
   }
   if(hasExamples){fail('example-proof','Extracted whole-query examples require the separately assigned Example ownership certificate');continue;}
   const {source,location:{pointer}}=owners.uniqueLocation(scope);
   const schemaAt=before.schema!,schemaMaterial=owners.uniqueLocation(schemaAt);
   owners.move(schemaAt,schemaMaterial.source,schemaMaterial.location.pointer,'whole_query_object',{context:graph});
   owners.retainNativeHistory({...scope,pointer:scope.pointer+'/content'},source,pointer+'/content','whole_query_media',graph);
   if(source.doc.dataNode(pointer+'/allowEmptyValue'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/allowEmptyValue'},source,pointer+'/allowEmptyValue','inactive_whole_query_empty_value',graph);
   const base=source.fork(),outputs:MigrationLocation[]=[];
   for(const [index,field]of factors.fields.entries()){
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
    output.source.exact(at+'/schema/enum','['+field.values.join(',')+']');
    output.source.set(at+'/name',field.name);output.source.set(at+'/in','query');output.source.set(at+'/required',field.required);
    output.source.set(at+'/style','form');output.source.set(at+'/explode',true);
    // Retain the standard empty-value flag through modern/composed routes too.
    if(field.values.some(raw=>{const doc=new SourceDocument(raw,'file:///empty-field.json',true,'json');return doc.dataNode('')!.kind==='string'&&doc.dataNode('')!.value===''||doc.dataNode('')!.kind==='array'&&[...doc.dataNode('')!.children.values()].some(node=>node.kind==='string'&&node.value==='');}))output.source.set(at+'/allowEmptyValue',true);
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
   if(hasExamples){
    fail('example-proof','Extracted array examples require a separate field ownership certificate');continue;
   }
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
   source.presentationChanges.push(pointer);changed=true;
   for(const at of migrationLogicalPointers(source.doc))if(!source.origins.has(at))source.origins.set(at,new Set([at]));
   continue;
  }
  const formTarget:Declaration={...before,media:undefined,mediaOwner:undefined,scope:{...scope,family:target},
   value:{...before.value,content:undefined,in:whole?'query':'cookie',style:'form',explode:true}};
  let after=formTarget;
  if(!equalWire(before,after,values)){
   if(factors?.restriction){fail('factorization',factors.restriction,'target-representation');continue;}
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
  const before=declaration(source,scope);if(!before||before.scope.family!=='3.2'||target.specifications.get(target.root)?.family==='3.2')continue;
  if(before.value.in!=='querystring'&&!(before.value.in==='cookie'&&before.value.style==='cookie'))continue;
  const values=await domain(source,before,examples,budget);
  const outputs=mapped(scope,scope).filter(at=>target.scopeAs(at.resource,at.pointer,'parameter')&&target.isEntryUse({...at,kind:'parameter'}));
  const identity=(raw:string)=>migrationValueIdentity(new SourceDocument(raw,'file:///finite-value.json',true,'json'),'');
  if(!values||!outputs.length){issue(scope,'migration.invariant.parameter-wire','The captured parameter lost its exhaustive domain or independent target owner','unavailable-proof');continue;}
  const signature=JSON.stringify({name:before.value.name,in:before.value.in,required:before.value.required===true,
   deprecated:before.value.deprecated===true,domain:language(values),wire:values.map(raw=>[identity(raw),wire(before,raw)]),absent:before.value.required?'required':'omitted'});
  const resolved=outputs.map(at=>({at,owner:declaration(target,at)}));
  const factors=before.wholeForm?queryFactors(source,before,values,budget):undefined;
  if(factors&&!factors.restriction&&factors.fields.length&&resolved.every(({owner})=>owner?.value.in==='query'&&owner.schema&&target.docs.get(owner.schema.resource)!.dataNode(owner.schema.pointer)?.value?.type!=='object')){
   let valid=true;
   const actual=new Map<string,Declaration>();
   for(const {owner}of resolved){
    const field=factors.fields.find(field=>field.name===owner!.value.name),permitted=owner&&await domain(target,owner,targetExamples,budget);
    if(!owner||!field||!permitted||target.docs.get(owner.schema!.resource)!.dataNode(owner.schema!.pointer)?.value?.type!==field.type||!!owner.value.required!==field.required||!!owner.value.deprecated!==!!before.value.deprecated||language(field.values)!==language(permitted)||!await wireLanguage(target,owner,permitted,targetExamples,budget)){valid=false;continue;}
    actual.set(field.name,owner);
   }
   valid&&=actual.size===factors.fields.length&&values.every(raw=>equalFactorWire(before,[...actual.values()],raw))&&await wireLanguage(source,before,values,examples,budget);
   if(!valid){issue(scope,'migration.invariant.parameter-wire','The target factor group changed a field domain, name, multiplicity, codec or required/optional combination','unavailable-proof');continue;}
   const grouped=JSON.stringify({group:signature,fields:factors.fields.map(field=>field.name).sort()});
   beforeProfiles.set(key(scope),grouped);beforeProfiles.set(key(before.scope),grouped);
   for(const {at,owner}of resolved){
    afterProfiles.set(key(at),grouped);afterProfiles.set(key(owner!.scope),grouped);
    if(changes.length>=4096)throw new SourceError('limit.migration.parameters','Parameter review exceeds 4096 captured occurrences');
    changes.push({resource:scope.resource,pointer:scope.pointer,range:source.docs.get(scope.resource)!.dataNode(scope.pointer)!.range,
     name:before.value.name,before:'querystring · '+before.media,after:'query · '+(owner!.scope.family==='2.0'&&owner!.value.type==='array'?'multi':'form')+' · '+owner!.value.name});
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
   if(!validField&&(!after||!permitted||language(values)!==language(permitted)||before.value.name!==after.value.name||
    !!before.value.required!==!!after.value.required||!!before.value.deprecated!==!!after.value.deprecated||!equalWire(before,after,values)||
    !await wireLanguage(source,before,values,examples,budget)||!await wireLanguage(target,after,values,targetExamples,budget))){
    issue(scope,'migration.invariant.parameter-wire','The target parameter changed its exhaustive value language, request-target/Cookie octets, names or presence behavior','unavailable-proof');continue;
   }
   if(!after)continue;
   beforeProfiles.set(key(scope),signature);beforeProfiles.set(key(before.scope),signature);
   afterProfiles.set(key(at),signature);afterProfiles.set(key(after.scope),signature);
   if(changes.length>=4096)throw new SourceError('limit.migration.parameters','Parameter review exceeds 4096 captured occurrences');
   const label=(owner:Declaration)=>owner.value.in+' · '+(owner.media??parameterStyle(
    isNativeFamily(owner.scope.family)?owner.scope.family:'3.2',owner.value.in,owner.value).style);
   changes.push({resource:scope.resource,pointer:scope.pointer,range:source.docs.get(scope.resource)!.dataNode(scope.pointer)!.range,
    name:before.value.name,before:label(before),after:label(after)+(validField?' · '+after.value.name:'')});
  }
 }
 return {before:beforeProfiles,after:afterProfiles,changes};
}
