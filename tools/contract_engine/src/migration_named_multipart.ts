import {escape,SourceDocument,SourceError} from './document';
import {proveFiniteNamedLanguage,multipartFieldName,type FiniteNamedLanguage,type NamedPart} from './migration_multipart_language';
import {evaluateSchemas} from './schema_evaluation';
import type {ExternalExampleResourcePacket} from './external_examples';
import {pointerFragment,type GraphScope,type ReferenceGraph} from './reference_graph';
import {MigrationArrayBounds} from './migration_schema_arrays';
import {MigrationSchemaProofs,migrationExactValueIdentity} from './migration_schema_proofs';
import {PositionalEncodingEquivalence,type PositionalEncodingProof} from './migration_positional_encoding';
import {mediaTypes} from './media_types';
import {mimeParts,mimeSingleton} from './mime_parts';
import {MultipartEncoding} from './multipart_encoding';
import {FormSemantics,formContentType,formLiteralType,type FormShape} from './form_semantics';
import {runtimeMediaKind} from './runtime_media';
import {migrationScopes} from './migration_documents';
import {migrationMediaTypes} from './migration_media_objects';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationLocation,MigrationSource} from './migration_source';
import type {MigrationIssue} from './migration_schema';

type Part=NamedPart;
export type NamedMultipartField=Readonly<{name:string;parts:readonly Part[];required:boolean;
 rule?:MigrationLocation;explicitMedia:boolean;mediaIdentity:string}>;
const finiteCertificates=new WeakMap<ReferenceGraph,Map<string,NamedMultipartProof>>();
const certificateKey=(scope:GraphScope,target:string)=>JSON.stringify([scope.resource,scope.pointer,target]);
export const namedMultipartFields=(c:NamedMultipartCertificate):readonly NamedMultipartField[]=>c.fields??[
 {name:c.name,parts:[...c.positions,...(c.tail?[c.tail]:[])],required:c.required,rule:c.rule,explicitMedia:c.explicitMedia,mediaIdentity:c.mediaIdentity}];
export type NamedMultipartCertificate=Readonly<{
 fields?:readonly NamedMultipartField[];language?:FiniteNamedLanguage;
 name:string;schema?:GraphScope;item?:GraphScope;roots:readonly GraphScope[];
 positions:readonly Part[];tail?:Part;maximum?:number;minimum:number;required:boolean;
 rule?:MigrationLocation;explicitMedia:boolean;mediaIdentity:string;
}>;
export type NamedMultipartProof=PositionalEncodingProof&Readonly<{certificate?:NamedMultipartCertificate}>;
const unavailable=(reason:string):NamedMultipartProof=>({equivalent:false,classification:'unavailable-proof',reason});
const restriction=(reason:string):NamedMultipartProof=>({equivalent:false,classification:'target-representation',reason});
const metadata=new Set(['$id','$schema','$anchor','$dynamicAnchor','$defs','title','description','$comment']);
const arrayFields=new Set(['type','$ref','$dynamicRef','allOf','items','prefixItems','minItems','maxItems','uniqueItems','const','enum']);
const wrapperFields=new Set(['type','$ref','$dynamicRef','allOf','properties','required','additionalProperties','minProperties','maxProperties']);

/** A repeated single-name field is an order-preserving bijection:
 * [{n:v0},...,{n:vk}] <-> {n:[v0,...,vk]}. RFC 7578 §5.2 preserves
 * the order of repeated fields. No object-property ordering is assumed.
 * All array assertions are transported through that bijection; value schemas
 * retain their own resources. The unbounded tail is one symbolic partition.
 */
export class NamedMultipartEquivalence {
 private readonly positional:PositionalEncodingEquivalence;
 private readonly schemas:MigrationSchemaProofs;
 private readonly identityState={work:0};
 private work=0;
 constructor(private readonly graph:ReferenceGraph){this.positional=new PositionalEncodingEquivalence(graph);this.schemas=new MigrationSchemaProofs(graph);}
 private inspect():void {if(++this.work>50000)throw new SourceError('limit.migration.positional-encoding','Named multipart equivalence exceeds 50000 captured states');}
 private part(scopes:readonly GraphScope[]):Part|undefined {
  const parts:GraphScope[]=[];
  for(const scope of scopes){const local=this.positional.parts(scope);if(!local)return;parts.push(...local);}
  const names=new Set<string>(),required=new Set<string>();let object=false,closed=false;
  for(const scope of parts){
   this.inspect();const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
   if(value===true)continue;
   if(!value||typeof value!=='object'||Object.keys(value).some(key=>!wrapperFields.has(key)&&!metadata.has(key)&&!key.startsWith('x-')))return;
   if(value.type==='object')object=true;else if(value.type!==undefined)return;
   for(const name of Object.keys(value.properties??{}))names.add(name);
   for(const name of value.required??[])required.add(name);
   if(value.additionalProperties===false&&Object.keys(value.properties??{}).length===1||value.maxProperties===1)closed=true;
   else if(value.additionalProperties!==undefined&&value.additionalProperties!==true)return;
   if(value.minProperties!==undefined&&value.minProperties!==0&&value.minProperties!==1)return;
   if(value.maxProperties!==undefined&&value.maxProperties!==1)return;
  }
  if(!object||!closed||names.size!==1)return;
  const name=[...names][0];if(!required.has(name)||[...required].some(key=>key!==name))return;
  // The transport's quoted-name policy is shared with the existing native
  // form controls. No filename or observed Content-Disposition supplies names.
  if(!multipartFieldName(name)||/["\\]/u.test(name))return;
  const values=parts.flatMap(scope=>{
   const child=this.graph.scopeAs(scope.resource,scope.pointer+'/properties/'+escape(name),'schema');return child?[child]:[];
  });
  if(!values.length||values.some(scope=>this.schemas.conjuncts(scope).some(part=>{
   const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;return value?.readOnly===true||value?.writeOnly===true;
  })))return;
  return {name,values};
 }
 /** Canonical MIME alternatives retain every alternative and parameter. */
 mediaIdentity(text:string):string {
  return JSON.stringify(mediaTypes(text).map(type=>[type.type,type.subtype,[...type.parameters].map(([key,value])=>[key,key==='charset'?value.toLowerCase():value]).sort()]).sort());
 }
 private headers(rule:MigrationLocation|undefined):string|undefined {
  if(!rule)return '{}';
  const node=this.graph.docs.get(rule.resource)!.dataNode(rule.pointer+'/headers');if(!node)return '{}';
  const fields:string[]=[],seen=new Set<string>(),multipart=new MultipartEncoding(this.graph);
  for(const [name]of node.children){
   this.inspect();
   if(name.toLowerCase()==='content-type')continue;
   if(seen.has(name.toLowerCase()))return;seen.add(name.toLowerCase());
   const target=multipart.follow({...rule,pointer:rule.pointer+'/headers/'+escape(name),kind:'header'},'header');
   // Referenced schemas keep their captured identities. Independently
   // authored equivalent Headers may compare exactly; no sample is a proof.
   const header=this.graph.scopeAs(target.resource,target.pointer,'header'),identity=header&&namedHeaderIdentity(this.graph,header,this.identityState);
   if(identity===undefined)return;
   fields.push(JSON.stringify(name.toLowerCase())+':'+identity);
  }
  return '{'+fields.sort().join(',')+'}';
 }
 prove(scope:GraphScope,types:readonly string[],target:string):NamedMultipartProof {
  return finiteCertificates.get(this.graph)?.get(certificateKey(scope,target))??this.single(scope,types,target);
 }
 async prepare(scope:GraphScope,types:readonly string[],target:string,examples:readonly ExternalExampleResourcePacket[]=[]):Promise<void> {
  const existing=finiteCertificates.get(this.graph)??new Map<string,NamedMultipartProof>();finiteCertificates.set(this.graph,existing);
  const key=certificateKey(scope,target);if(existing.has(key))return;
  const single=this.single(scope,types,target);if(single.certificate){existing.set(key,single);return;}
  const media=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value,marker=scope.pointer.lastIndexOf('/content/');
  if(!['3.0','3.1'].includes(target)||!types.length||types.some(type=>type.split(';')[0].trim().toLowerCase()!=='multipart/form-data')||
   media?.encoding!==undefined||media?.example!==undefined||media?.examples!==undefined||
   marker>=0&&!this.graph.scopeAs(scope.resource,scope.pointer.slice(0,marker),'request-body')||
   media?.prefixEncoding===undefined&&media?.itemEncoding===undefined){existing.set(key,single);return;}
  const schema=this.graph.scopeAs(scope.resource,scope.pointer+'/schema','schema'),item=this.graph.scopeAs(scope.resource,scope.pointer+'/itemSchema','schema');
  if(!schema){existing.set(key,single);return;}
  if(!new FormSemantics(this.graph).shape(schema.resource,schema.pointer).types?.includes('array')){existing.set(key,unavailable('The captured source multipart codec lacks a whole-array decoding hint'));return;}
  const symbolic=this.symbolic(scope,schema,item,target);
  if(symbolic){existing.set(key,symbolic);return;}
  const result=await proveFiniteNamedLanguage(this.graph,schema,item,examples),language=result.language;
  if(!language){
   const order=await this.fixedOrderCounterexample(schema,item);
   existing.set(key,result.restriction?restriction(result.reason):order?restriction('A captured schema-valid named sequence has a forbidden same-field-order-preserving interleaving'):
    single.classification==='target-representation'?single:unavailable(result.reason));return;
  }
  const fields:NamedMultipartField[]=[];
  for(const name of language.names){
   const entries=language.positions.flatMap((parts,index)=>parts.filter(part=>part.name===name).map(part=>({part,index})));
   const field=this.field(scope,entries,target);if('equivalent' in field){existing.set(key,field);return;}
   const required=language.accepted.every(text=>{
    const doc=new SourceDocument(text,'finite-multipart',true,'json');return [...doc.dataNode('')!.children.values()].some(node=>node.children.has(name));
   });
   fields.push({...field,required});
  }
  const first=fields[0];
  existing.set(key,{equivalent:true,classification:'unavailable-proof',reason:result.reason,certificate:{
   name:first.name,schema,item,roots:[schema],positions:language.positions.flat(),minimum:0,maximum:language.positions.length,
   required:first.required,rule:first.rule,explicitMedia:first.explicitMedia,mediaIdentity:first.mediaIdentity,fields,language}});
 }
 /** A witness proves a restriction only; it never supplies name discovery
  * or finite-language completeness. Native evaluation checks both arrays. */
 private async fixedOrderCounterexample(schema:GraphScope,item:GraphScope|undefined):Promise<boolean> {
  const roots=this.positional.parts(schema),maximum=new MigrationArrayBounds(this.graph).maximum(schema);
  if(!roots||maximum===undefined||maximum>2048)return false;
  let minimum=0;for(const root of roots)minimum=Math.max(minimum,this.graph.docs.get(root.resource)!.dataNode(root.pointer)?.value?.minItems??0);
  const parts:Part[]=[],literals:string[]=[];
  for(let index=0;index<maximum;index++){
   const children:GraphScope[]=item?[item]:[];
   for(const root of roots){
    const value=this.graph.docs.get(root.resource)!.dataNode(root.pointer)?.value;
    const child=this.graph.scopeAs(root.resource,root.pointer+(index<(value?.prefixItems?.length??0)?'/prefixItems/'+index:'/items'),'schema');if(child)children.push(child);
   }
   const part=this.part(children);if(!part)return false;
   const type=this.schemas.domains(part.values[0]);
   const literal=type.has('string')?'""':type.has('integer')||type.has('fraction')?'0':type.has('boolean')?'false':type.has('null')?'null':undefined;
   if(literal===undefined)return false;parts.push(part);literals.push('{'+JSON.stringify(part.name)+':'+literal+'}');
  }
  const index=parts.findIndex(part=>part.name!==parts[0].name);if(index<0)return false;
  const count=Math.max(minimum,index+1),before=literals.slice(0,count),after=[...before];
  [after[0],after[index]]=[after[index],after[0]];
  const resources=[...this.graph.docs].map(([id,doc])=>({id,text:doc.text,generation:0}));
  if(resources.reduce((bytes,resource)=>bytes+resource.text.length,0)>128*1024*1024)return false;
  const checked=await evaluateSchemas({root:this.graph.root,snapshot:'named-order-counterexample',resources,runtimeInstances:[
   {subject:'request-body',location:'before',text:'['+before.join(',')+']',schema},
   {subject:'request-body',location:'after',text:'['+after.join(',')+']',schema},
   ...(item?before.map(text=>({subject:'request-body',location:'item',text,schema:item})):[])]});
  return checked.complete&&checked.runtimeEvaluations.length===2+(item?before.length:0)&&checked.runtimeEvaluations.every(value=>value.complete)&&
   checked.runtimeEvaluations[0].valid===true&&checked.runtimeEvaluations[1].valid===false&&checked.runtimeEvaluations.slice(2).every(value=>value.valid===true);
 }
 /** Finite name skeletons with symbolic homogeneous value constraints.
  * Only array counts and uniqueness are transported algebraically. Other
  * assertions use the exhaustive exact-value path; no finite value sampling. */
 private symbolic(scope:GraphScope,schema:GraphScope,item:GraphScope|undefined,target:string):NamedMultipartProof|undefined {
  const roots=this.positional.parts(schema),maximum=new MigrationArrayBounds(this.graph).maximum(schema);
  if(!roots||maximum===undefined||maximum===0)return;
  if(this.schemas.domains(schema).size!==1||!this.schemas.domains(schema).has('array'))return;
  let minimum=0,unique=false;
  for(const root of roots){
   const value=this.graph.docs.get(root.resource)!.dataNode(root.pointer)?.value;
   if(value===true)continue;
   if(!value||typeof value!=='object'||Object.keys(value).some(key=>!arrayFields.has(key)&&!metadata.has(key)&&!key.startsWith('x-'))||
    Object.hasOwn(value,'const')||Object.hasOwn(value,'enum'))return;
   minimum=Math.max(minimum,value.minItems??0);unique ||= value.uniqueItems===true;
  }
  const positions:Part[][]=[];
  for(let index=0;index<maximum;index++){
   let covers:GraphScope[][]=[[]];
   const children:GraphScope[]=item?[item]:[];
   for(const root of roots){
    const value=this.graph.docs.get(root.resource)!.dataNode(root.pointer)?.value;
    const child=this.graph.scopeAs(root.resource,root.pointer+(index<(value?.prefixItems?.length??0)?'/prefixItems/'+index:'/items'),'schema');if(child)children.push(child);
   }
   for(const child of children){
    const local=this.schemas.alternatives(child);if(!local||covers.length*local.length>2048)return;
    covers=covers.flatMap(left=>local.map(right=>[...left,...right]));
   }
   const parts:Part[]=[];
   for(const cover of covers){
    const names=new Set<string>(),required=new Set<string>();let object=false,closed=false,nonempty=false;
    for(const owner of cover){
     this.inspect();const value=this.graph.docs.get(owner.resource)!.dataNode(owner.pointer)?.value;
     if(value===true)continue;
     if(!value||typeof value!=='object'||Object.keys(value).some(key=>!wrapperFields.has(key)&&!['anyOf','oneOf'].includes(key)&&!metadata.has(key)&&!key.startsWith('x-')))return;
     if(value.type==='object')object=true;else if(value.type!==undefined)return;
     for(const name of Object.keys(value.properties??{}))names.add(name);
     for(const name of value.required??[])required.add(name);
     if(value.additionalProperties===false)closed=true;else if(value.additionalProperties!==undefined&&value.additionalProperties!==true)return;
     if(value.minProperties===1)nonempty=true;else if(value.minProperties!==undefined&&value.minProperties!==0)return;
     if(value.maxProperties!==undefined&&value.maxProperties!==1)return;
    }
    if(!object||!closed||required.size>1||!nonempty&&!required.size)return;
    // The source must exclude multi-property parts, as well as empty maps.
    const singleton=names.size===1||cover.some(owner=>this.graph.docs.get(owner.resource)!.dataNode(owner.pointer)?.value?.maxProperties===1);
    if(!singleton)return;
    for(const name of names){
     if(required.size&&!required.has(name))continue;
     if(cover.some(owner=>{const value=this.graph.docs.get(owner.resource)!.dataNode(owner.pointer)?.value;return value?.additionalProperties===false&&!Object.hasOwn(value.properties??{},name);}))continue;
     if(!multipartFieldName(name))return;
     const values=cover.flatMap(owner=>{const child=this.graph.scopeAs(owner.resource,owner.pointer+'/properties/'+escape(name),'schema');return child?[child]:[];});
     if(!values.length||values.some(scope=>this.schemas.conjuncts(scope).some(part=>{
      const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;return value?.readOnly===true||value?.writeOnly===true;
     })))return;
     // Exclusive alternatives with the same name can correlate values.
     // That case needs native finite evaluation rather than a name cover.
     if(parts.some(part=>part.name===name)&&cover.some(owner=>Object.hasOwn(this.graph.docs.get(owner.resource)!.dataNode(owner.pointer)?.value??{},'oneOf')))return;
     parts.push({name,values});
    }
   }
   if(!parts.length)break;
   positions.push(parts);
  }
  const names=[...new Set(positions.flatMap(parts=>parts.map(part=>part.name)))].sort();if(!names.length)return;
  const fields:NamedMultipartField[]=[];
  for(const name of names){
   const entries=positions.flatMap((parts,index)=>parts.filter(part=>part.name===name).map(part=>({part,index})));
   if(entries.some(({part})=>this.valueIdentity(part)!==this.valueIdentity(entries[0].part)))return;
   const field=this.field(scope,entries,target);if('equivalent' in field)return field.classification==='target-representation'?undefined:field;fields.push(field);
  }
  const sequences:string[][]=[];let states=0;
  const enumerate=(prefix:string[]):boolean=>{
   if(++states>50000)return false;
   if(prefix.length>=minimum)sequences.push(prefix);
   if(sequences.length>2048)return false;
   if(prefix.length===positions.length)return true;
   return [...new Set(positions[prefix.length].map(part=>part.name))].every(name=>enumerate([...prefix,name]));
  };
  if(!enumerate([])||!sequences.length)return;
  const permitted=new Set(sequences.map(sequence=>JSON.stringify(sequence))),counts=new Map<string,number[]>();
  for(const sequence of sequences){
   const count=names.map(name=>sequence.filter(field=>field===name).length);counts.set(JSON.stringify(count),count);
   const shuffle=(prefix:string[],remaining:number[]):boolean=>{
    if(++states>50000)return false;
    if(!remaining.some(Boolean))return permitted.has(JSON.stringify(prefix));
    for(let field=0;field<names.length;field++)if(remaining[field]){
     const next=[...remaining];next[field]--;if(!shuffle([...prefix,names[field]],next))return false;
    }
    return true;
   };
   if(!shuffle([],count))return;
  }
  const proved=fields.map((field,index)=>({...field,required:[...counts.values()].every(count=>count[index]>0)})),first=proved[0];
  return {equivalent:true,classification:'unavailable-proof',reason:'The complete bounded name language is shuffle-closed with homogeneous independent value constraints per field',certificate:{
   name:first.name,schema,item,roots,positions:positions.flat(),maximum,minimum,required:first.required,rule:first.rule,
   explicitMedia:first.explicitMedia,mediaIdentity:first.mediaIdentity,fields:proved,
   language:{names,positions,accepted:[],projected:[],counts:[...counts.values()],unique}}};
 }
 private field(scope:GraphScope,entries:readonly Readonly<{part:Part;index:number}>[],target:string):NamedMultipartField|NamedMultipartProof {
  const media=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
  let selected:MigrationLocation|undefined,signature:string|undefined,serialization:string|undefined,identity='',explicit=false;
  for(const {part,index}of entries){
   const rule=index<(media.prefixEncoding?.length??0)?{resource:scope.resource,pointer:scope.pointer+'/prefixEncoding/'+index}:
    media.itemEncoding!==undefined?{resource:scope.resource,pointer:scope.pointer+'/itemEncoding'}:undefined;
   const value=rule?this.graph.docs.get(rule.resource)!.dataNode(rule.pointer)?.value:{};
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['contentType','headers'].includes(key)&&!key.startsWith('x-')))
    return unavailable('The finite named Encoding needs a style, nested or unknown-field proof outside this certificate');
   const shapes=part.values.map(scope=>new FormSemantics(this.graph).shape(scope.resource,scope.pointer));
   const types=part.literalType?[part.literalType]:[...new Set(shapes.flatMap(shape=>shape.types??[]))].sort();
   const transfers=part.values.map(scope=>new MultipartEncoding(this.graph).schemaPathEncoding(scope,[],types.length===1&&types[0]!=='string'?'other':undefined));
   const currentSerialization=JSON.stringify([types,[...new Set(transfers.map(({encoding,schemaEncoded,instanceEncoding})=>JSON.stringify({encoding,schemaEncoded,instanceEncoding})))].sort()]);
   if(serialization!==undefined&&serialization!==currentSerialization)return unavailable('A finite field lacks uniform schema decoding and transfer binding across every applicable position');
   serialization=currentSerialization;
   const before=part.literalType?formContentType({types:[part.literalType]},'3.2'):this.positional.defaults(part.values,'3.2'),after=part.literalType?formContentType({types:[part.literalType]},target):this.positional.defaults(part.values,target);
   if(value.contentType===undefined&&(before===undefined||after!==before))return unavailable('A finite field default media/charset has no identical target interpretation');
   const effective=value.contentType??before;if(typeof effective!=='string')return unavailable('No finite field media is established');
   if(part.literalType==='array')return unavailable('A literal array-valued part needs a separately established older repeated/nested value inverse');
   if(mediaTypes(effective).some(type=>type.type==='multipart'||type.type==='*'||type.subtype==='*'&&!['image','audio','video','font'].includes(type.type)))
    return unavailable('A finite field media alternative includes unproved sequence, range or nested decoding');
   if(transfers.every(transfer=>!transfer.schemaEncoded)&&mediaTypes(effective).some(type=>!['json','text','opaque'].includes(runtimeMediaKind(type.text,true))))
    return unavailable('A finite field media has no identical older named MIME decoder');
   const sourceSchemas=[this.graph.scopeAs(scope.resource,scope.pointer+'/schema','schema'),this.graph.scopeAs(scope.resource,scope.pointer+'/itemSchema','schema')].filter((value):value is GraphScope=>!!value);
   const actualShapes=sourceSchemas.map(schema=>{
    const shape=new FormSemantics(this.graph).shape(schema.resource,schema.pointer);
    return schema.pointer.endsWith('/itemSchema')?shape.properties?.[part.name]:
     (shape.prefixItems?.[index]??shape.items)?.properties?.[part.name];
   });
   const actual:FormShape=actualShapes.find(shape=>shape?.types?.length||shape?.contentEncoding!==undefined)??actualShapes[0]??{};
   if(value.contentType===undefined&&actual.defaultContentType!==before)return unavailable('The captured source codec has no identical default hint for this discovered field');
   const actualType=formLiteralType(actual),expectedType=part.literalType??formLiteralType({types});
   if(expectedType!==undefined&&expectedType!=='string'&&actualType!==expectedType&&mediaTypes(effective).some(type=>runtimeMediaKind(type.text,true)==='text'))
    return unavailable('The captured source text decoder lacks the discovered field numeric or structured value hint');
   try {
    const actualTransfers=sourceSchemas.map(schema=>new MultipartEncoding(this.graph).schemaPathEncoding(schema,
     [...(schema.pointer.endsWith('/itemSchema')?[]:[{item:index}]),{property:part.name}],actualType!==undefined&&actualType!=='string'?'other':undefined));
    const summary=(values:readonly {encoding?:string;schemaEncoded:boolean;instanceEncoding?:string}[])=>JSON.stringify([...new Set(values.map(({encoding,schemaEncoded,instanceEncoding})=>JSON.stringify({encoding,schemaEncoded,instanceEncoding})))].sort());
    if(summary(actualTransfers)!==summary(transfers.length?transfers:[{schemaEncoded:false}]))return unavailable('The captured source and discovered field use different transfer or binary bindings');
   }catch(error){if(!(error instanceof SourceError))throw error;return unavailable('The source field transfer binding is unavailable: '+error.message);}
   const header=this.headers(rule);if(header===undefined)return unavailable('Finite field Header applicability is ambiguous');
   identity=this.mediaIdentity(effective);const current=JSON.stringify([value.contentType!==undefined,identity,header]);
   if(signature!==undefined&&signature!==current)return restriction('One discovered field has position-dependent media, Headers or explicit/default selection that one named Encoding cannot express');
   signature=current;selected??=rule;explicit=value.contentType!==undefined;
  }
  const parts=entries.map(entry=>entry.part);
  if(target==='3.0'&&parts.some(part=>this.valueIdentity(part)!==this.valueIdentity(parts[0])))return unavailable('Nonhomogeneous finite repeated-field tuple lowering into 3.0 remains separately assigned');
  return {name:parts[0].name,parts,required:false,rule:selected,explicitMedia:explicit,mediaIdentity:identity};
 }
 private single(scope:GraphScope,types:readonly string[],target:string):NamedMultipartProof {
  const media=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
  if(media?.prefixEncoding===undefined&&media?.itemEncoding===undefined)return unavailable('No captured positional Encoding declaration requires a named projection');
  const marker=scope.pointer.lastIndexOf('/content/');
  if(marker>=0&&!this.graph.scopeAs(scope.resource,scope.pointer.slice(0,marker),'request-body'))return unavailable('Named positional conversion requires a captured request-body consumer; response and nested Encoding remain separately assigned');
  if(!types.length||types.some(type=>type.split(';')[0].trim().toLowerCase()!=='multipart/form-data'))return unavailable('The named certificate needs an independently specialized multipart/form-data consumer');
  if(!['3.0','3.1'].includes(target))return restriction('This named positional certificate requires an OpenAPI named Encoding owner');
  if(media?.encoding!==undefined)return unavailable('A previously ignored named Encoding map must not become active');
  if(media?.example!==undefined||media?.examples!==undefined)return unavailable('Authored multipart examples require an independently reviewed representation projection');
  const schema=this.graph.scopeAs(scope.resource,scope.pointer+'/schema','schema'),item=this.graph.scopeAs(scope.resource,scope.pointer+'/itemSchema','schema');
  const roots=schema?this.positional.parts(schema):[];
  if(!roots||!schema&&!item)return unavailable('No unconditional captured array schema establishes multipart field identities');
  if(schema){const domains=this.schemas.domains(schema);if(domains.size!==1||!domains.has('array'))return unavailable('The complete source multipart value model is not exclusively an array');}
  let boundary=media.prefixEncoding?.length??0,minimum=0,empty=true;
  const maximum=schema?new MigrationArrayBounds(this.graph).maximum(schema):undefined;
  if(maximum===0)return unavailable('An always-absent positional declaration belongs to the existing default certificate');
  for(const root of roots){
   const value=this.graph.docs.get(root.resource)!.dataNode(root.pointer)?.value;
   if(value===true)continue;
   if(!value||typeof value!=='object'||Object.keys(value).some(key=>!arrayFields.has(key)&&!metadata.has(key)&&!key.startsWith('x-')))
    return unavailable('An array assertion or annotation has no captured name/value inverse in this certificate');
   if(value.minItems!==undefined){if(!Number.isSafeInteger(value.minItems)||value.minItems<0)return unavailable('The lower array bound has no exact supported count');minimum=Math.max(minimum,value.minItems);}
   if(Object.hasOwn(value,'const')&&(!Array.isArray(value.const)||value.const.length!==0)||
      Array.isArray(value.enum)&&!value.enum.some((value:unknown)=>Array.isArray(value)&&value.length===0))empty=false;
   boundary=Math.max(boundary,value.prefixItems?.length??0);
  }
  if(boundary>2048)throw new SourceError('limit.migration.positional-encoding','Named multipart partition exceeds 2048 positions');
  const count=maximum===undefined?boundary:Math.min(boundary,maximum),positions:Part[]=[];
  const at=(index:number):Part|undefined=>{
   const children:GraphScope[]=item?[item]:[];
   for(const root of roots){
    const value=this.graph.docs.get(root.resource)!.dataNode(root.pointer)?.value;
    const child=this.graph.scopeAs(root.resource,root.pointer+(index<(value?.prefixItems?.length??0)?'/prefixItems/'+index:'/items'),'schema');
    if(child)children.push(child);
   }
   return this.part(children);
  };
  for(let index=0;index<count;index++){const part=at(index);if(!part)return unavailable('A relevant source position has no proved closed singleton field identity');positions.push(part);}
  const tail=maximum===undefined||maximum>boundary?at(boundary):undefined;
  if((maximum===undefined||maximum>boundary)&&!tail)return unavailable('The entire homogeneous tail needs a determinable field identity; a finite expansion cannot replace it');
  const all=[...positions,...(tail?[tail]:[])],names=new Set(all.map(part=>part.name));
  if(names.size!==1)return unavailable('Several names require a complete interleaving certificate or a captured order counterexample');
  const name=[...names][0];if(!name)return unavailable('No relevant part establishes a target name');
  if(target==='3.0'){
   const first=this.valueIdentity(all[0]);
   if(all.some(part=>this.valueIdentity(part)!==first))return unavailable('The 3.0 repeated-field item constraints need a finite or homogeneous tuple equivalence proof');
  }
  let selected:MigrationLocation|undefined,signature:string|undefined,serialization:string|undefined,identity='',explicit=false;
  for(const [index,part]of all.entries()){
   const prefix=media.prefixEncoding?.length??0;
   const rule=index<prefix?{resource:scope.resource,pointer:scope.pointer+'/prefixEncoding/'+index}:
    media.itemEncoding!==undefined?{resource:scope.resource,pointer:scope.pointer+'/itemEncoding'}:undefined;
   const value=rule?this.graph.docs.get(rule.resource)!.dataNode(rule.pointer)?.value:{};
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['contentType','headers'].includes(key)&&!key.startsWith('x-')))
    return unavailable('The applicable positional Encoding requires a style, nested or unknown-field proof outside this named content certificate');
   const shapes=part.values.map(scope=>new FormSemantics(this.graph).shape(scope.resource,scope.pointer));
   const types=[...new Set(shapes.flatMap(shape=>shape.types??[]))].sort();
   const transfers=part.values.map(scope=>new MultipartEncoding(this.graph).schemaPathEncoding(scope,[],types.length===1&&types[0]!=='string'?'other':undefined));
   const currentSerialization=JSON.stringify([types,[...new Set(transfers.map(({encoding,schemaEncoded,instanceEncoding})=>JSON.stringify({encoding,schemaEncoded,instanceEncoding})))].sort()]);
   if(serialization!==undefined&&serialization!==currentSerialization)return unavailable('The named target requires a uniform item decoding and transfer binding across the complete prefix and tail');
   serialization=currentSerialization;
   const before=this.positional.defaults(part.values,'3.2'),after=this.positional.defaults(part.values,target);
   if(value.contentType===undefined&&(before===undefined||after!==before))return unavailable('The default part media/charset representation is not proved identical in the target');
   const effective=value.contentType??before;if(typeof effective!=='string')return unavailable('No effective part media is established');
   if(mediaTypes(effective).some(type=>type.type==='multipart'))return unavailable('Nested part media remains separately assigned');
   if(mediaTypes(effective).some(type=>type.type==='*'||type.subtype==='*'&&!['image','audio','video','font'].includes(type.type)))
    return unavailable('This media range includes unproved sequence or nested part decoding alternatives');
   if(transfers.every(transfer=>!transfer.schemaEncoded)&&mediaTypes(effective).some(type=>
    !['json','text','opaque'].includes(runtimeMediaKind(type.text,true))))return unavailable('The selected part sequence has no identical older named MIME decoder under the supported codec policy');
   const header=this.headers(rule);if(header===undefined)return unavailable('Part Header applicability is ambiguous');
   identity=this.mediaIdentity(effective);const current=JSON.stringify([value.contentType!==undefined,identity,header]);
   if(signature!==undefined&&signature!==current)return restriction('The same repeated name has position-dependent media, Headers or explicit/default selection that one older named Encoding cannot express');
   signature=current;selected??=rule;explicit=value.contentType!==undefined;
  }
  return {equivalent:true,classification:'unavailable-proof',reason:'Closed singleton identity and the complete repeated-field array language preserve order and multiplicity',
   certificate:{name,schema,item,roots,positions,tail,maximum,minimum,required:minimum>0||!empty,rule:selected,explicitMedia:explicit,mediaIdentity:identity}};
 }
 private valueIdentity(part:Part):string {
  this.inspect();
  return JSON.stringify([part.literalType,[...new Set(part.values.flatMap(scope=>{
   const identity=namedValueSchemaIdentity(this.graph,scope,new Set(),this.identityState);return identity===undefined?['unavailable:'+scope.resource+scope.pointer]:JSON.parse(identity) as string[];
  }))].sort()]);
 }
 /** Pure exact schema projection used by planning and final publication.
  * References must select neutral value schemas, never copied identifiers. */
 schema(certificate:NamedMultipartCertificate,reference:(scope:GraphScope)=>string,target:string):string {
  const c=certificate,clauses:string[]=[];
  if(c.language){
   const properties=namedMultipartFields(c).map(field=>{
    const parts=field.parts,first=parts[0];
    const schema=(part:Part)=>part.literalType?(target==='3.0'&&part.literalType==='null'?'{"anyOf":[{"type":"string","nullable":true,"enum":[null]}]}':'{"type":'+JSON.stringify(part.literalType)+'}'):'{"allOf":['+part.values.map(scope=>'{"$ref":'+JSON.stringify(reference(scope))+'}').join(',')+']}';
    // Identical transfer/default hints are proved separately. Exact enums
    // retain correlations; these neutral uses keep schema annotations alive.
    const alternatives=parts.every(part=>this.valueIdentity(part)===this.valueIdentity(first))?[schema(first)]:[...new Set(parts.map(schema))];
    const shapes=parts.flatMap(part=>part.literalType?[{types:[part.literalType]}]:part.values.map(scope=>new FormSemantics(this.graph).shape(scope.resource,scope.pointer)));
    const types=[...new Set(shapes.flatMap(shape=>shape.types??[]))];
    const encoded=shapes.find(shape=>'contentEncoding' in shape&&shape.contentEncoding),legacy=shapes.find(shape=>'format' in shape&&shape.format);
    const hints=JSON.stringify({...(types.length===1?{type:types[0]}:{}),...(encoded&&'contentEncoding' in encoded?{contentEncoding:encoded.contentEncoding}:{}),...(legacy&&'format' in legacy?{format:legacy.format}:{})});
    const items=alternatives.length===1?alternatives[0]:hints.slice(0,-1)+(hints==='{}'?'':',')+'"anyOf":['+alternatives.join(',')+']}';
    return JSON.stringify(field.name)+':{"type":"array","items":'+items+(c.language!.unique?',"uniqueItems":true':'')+'}';
   });
   const assertions=c.language.counts?',"anyOf":['+c.language.counts.map(count=>'{"properties":{'+c.language!.names.map((name,index)=>JSON.stringify(name)+':{"minItems":'+count[index]+',"maxItems":'+count[index]+'}').join(',')+'}'+(count.some(Boolean)?',"required":'+JSON.stringify(c.language!.names.filter((_,index)=>count[index]>0)):'')+'}').join(',')+']':',"enum":['+c.language.projected.join(',')+']';
   return '{"type":"object","properties":{'+properties.join(',')+'},"additionalProperties":false'+assertions+
    (c.fields!.some(field=>field.required)?',"required":'+JSON.stringify(c.fields!.filter(field=>field.required).map(field=>field.name)):'')+'}';
  }
  for(const root of c.roots){
   const doc=this.graph.docs.get(root.resource)!;
   for(const field of ['minItems','maxItems','uniqueItems'])if(doc.dataNode(root.pointer+'/'+field))clauses.push('{'+JSON.stringify(field)+':'+doc.dataJson(root.pointer+'/'+field)+'}');
   for(const field of ['enum','const']){
    const node=doc.dataNode(root.pointer+'/'+field);if(!node)continue;
    const values=field==='enum'?[...node.children.values()].map(child=>child.pointer):[node.pointer];
    const mapped=values.flatMap(pointer=>{const value=projectNamedMultipartValue(doc,pointer,c.name);return value===undefined?[]:[new SourceDocument(value,'named-value',true,'json').dataJson('/'+escape(c.name))];});
    clauses.push(mapped.length?'{"enum":['+mapped.join(',')+']}':target==='3.0'?'{"not":{}}':'false');
   }
  }
  const part=(part:Part)=>'{"allOf":['+part.values.map(scope=>'{"$ref":'+JSON.stringify(reference(scope))+'}').join(',')+']}';
  if(c.maximum!==undefined)clauses.push('{"maxItems":'+c.maximum+'}');
  let items='';
  if(target==='3.0')items=',"items":'+part(c.positions[0]??c.tail!);
  else {
   if(c.positions.length)items+=',"prefixItems":['+c.positions.map(part).join(',')+']';
   // A finite bound makes this tail unreachable. Retain the first value
   // shape there so the older named MIME codec has its uniform item hint.
   items+=',"items":'+part(c.tail??c.positions[0]);
  }
  const array='{"type":"array"'+items+(clauses.length?',"allOf":['+clauses.join(',')+']':'')+'}';
  // Absent field and selected empty array both mean no wire parts. Required
  // field presence follows a positive source lower bound; empty arrays do
  // not acquire a part. Body selection itself remains independent.
  return '{"type":"object","properties":{'+JSON.stringify(c.name)+':'+array+'},"additionalProperties":false'+(c.required?',"required":['+JSON.stringify(c.name)+']':'')+'}';
 }
}

/** Literal inverse preserves number spelling, null, empty strings and binary
 * reference objects. An empty array remains an explicit empty selection. */
export function projectNamedMultipartValue(doc:SourceDocument,pointer:string,name:string|readonly string[]):string|undefined {
 const names=typeof name==='string'?[name]:name,node=doc.dataNode(pointer);if(node?.kind!=='array')return;
 const values=new Map<string,string[]>();
 const allowed=new Set(names);let previous:string|undefined;
 for(const part of node.children.values()){
  if(part.kind!=='object'||part.children.size!==1)return;
  const field=[...part.children.keys()][0];if(!allowed.has(field))return;
  if(typeof name!=='string'&&previous!==field&&values.has(field))return;
  previous=field;if(!values.has(field))values.set(field,[]);
  values.get(field)!.push(doc.dataJson(part.pointer+'/'+escape(field)));
 }
 if(!node.children.size)for(const name of names)values.set(name,[]);
 return '{'+[...values].filter(([,items])=>items.length||!node.children.size||typeof name==='string').map(([name,items])=>JSON.stringify(name)+':['+items.join(',')+']').join(',')+'}';
}

/** Captured graph instances own their proof cache; no global text/resource
 * lookup can reuse evidence across unsaved generations or entry contexts. */
export async function prepareNamedMultipart(graphs:readonly ReferenceGraph[],target:string,examples:readonly ExternalExampleResourcePacket[]=[],finalTarget=target):Promise<void> {
 if(!['3.0','3.1'].includes(target))return;
 const types=migrationMediaTypes(graphs);
 for(const graph of graphs){
  const proof=new NamedMultipartEquivalence(graph);
  for(const scope of graph.entryScopes())if(scope.kind==='media'&&scope.family==='3.2'){
   const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
   if(value?.prefixEncoding!==undefined||value?.itemEncoding!==undefined){
    const media=[...types.get(JSON.stringify([scope.resource,scope.pointer]))??[]];
    await proof.prepare(scope,media,target,examples);
    // A 3.0 review traverses 3.1. Do not admit a new multi-field certificate
    // whose final field tuples still require the separately assigned lowering.
    if(target==='3.1'&&finalTarget==='3.0'&&proof.prove(scope,media,target).certificate?.fields){
     await proof.prepare(scope,media,finalTarget,examples);
     const final=proof.prove(scope,media,finalTarget);
     if(!final.certificate)finiteCertificates.get(graph)!.set(certificateKey(scope,target),final);
    }
   }
  }
 }
}

/** Selected consumers are edited locally. Whole schemas and independent part
 * Headers move through A01–A03, retaining neutral references and CST values. */
export function migrateNamedMultipart(graphs:readonly ReferenceGraph[],sources:ReadonlyMap<string,MigrationSource>,
 target:string,owners:MigrationSchemaOwners,issue:MigrationIssue):boolean {
 if(!['3.0','3.1'].includes(target))return false;
 const types=migrationMediaTypes(graphs);let changed=false;
 for(const scope of migrationScopes(graphs)){
  if(scope.kind!=='media'||scope.family!=='3.2')continue;
  const graph=graphs.find(graph=>graph.scopeAs(scope.resource,scope.pointer,'media')?.family==='3.2')!;
  const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
  if(!value||value.prefixEncoding===undefined&&value.itemEncoding===undefined)continue;
  const media=[...types.get(JSON.stringify([scope.resource,scope.pointer]))??[]];
  if(!media.some(type=>type.split(';')[0].trim().toLowerCase()==='multipart/form-data'))continue;
  const proof=new NamedMultipartEquivalence(graph),result=proof.prove(scope,media,target);
  if(!result.certificate)continue; // Ordinary positional path reports the refusal.
  const c=result.certificate,source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);
  if(pointer===undefined||!source.doc.dataNode(pointer))continue;
  // Inline schema/Headers retain their independent identities before the
  // old declaration becomes history. Generated uses carry no duplicate IDs.
  for(const child of [c.schema,c.item].filter((scope):scope is GraphScope=>!!scope)){
   const at=source.current(child.pointer,child.resource);
   if(at!==undefined&&at.startsWith(pointer+'/'))owners.move(child,source,at,'positional_named_schema',{context:graph,layout:'array-item'});
  }
  for(const field of ['prefixEncoding','itemEncoding']){
   const parent=scope.pointer+'/'+field;
   for(const header of graph.entryScopes())if(header.kind==='header'&&header.resource===scope.resource&&header.pointer.startsWith(parent+'/')){
    const at=source.current(header.pointer,header.resource);
    if(at!==undefined&&at.startsWith(pointer+'/')){
     const retained=owners.move(header,source,at,'positional_named_header',{context:graph,layout:'response-header'});
     source.set(at,{$ref:owners.reference(retained,target)});
    }
   }
  }
  source.exact(pointer+'/schema',proof.schema(c,scope=>owners.reference(owners.uniqueLocation(scope).location,target),target));
  for(const field of namedMultipartFields(c))if(field.rule){
   const at=source.current(field.rule.pointer,field.rule.resource);
   if(at===undefined){issue(scope,'migration.encoding.named-owner','The captured positional Encoding lost its material owner','unavailable-proof');continue;}
   source.copy(source.fork(),at,pointer+'/encoding/'+escape(field.name),true);
   // Only the new named use may follow these Header references. The original
   // Encoding and all other aliased consumers retain their own provenance.
  }
  for(const field of ['prefixEncoding','itemEncoding']){
   const at=source.current(scope.pointer+'/'+field,scope.resource);
   if(at!==undefined&&at.startsWith(pointer+'/'))owners.retainNativeHistory({...scope,pointer:scope.pointer+'/'+field},source,at,'named_'+field,graph);
  }
  source.presentationChanges.push(pointer);changed=true;
 }
 return changed;
}

/** Compare delivered owners, including every array assertion and the exact
 * neutral value-schema/Header targets. This is a whole-language certificate,
 * not a target-validation or observed-payload check. MIME framing, transfer
 * codecs and charset decoding are unchanged under the proved name bijection.
 */
export function proveNamedMultipartOutput(source:ReferenceGraph,target:ReferenceGraph,scope:GraphScope,output:GraphScope,
 mapped:(location:MigrationLocation,scope:GraphScope)=>readonly MigrationLocation[],issue:MigrationIssue):boolean {
 const media=migrationMediaTypes([source]).get(JSON.stringify([scope.resource,scope.pointer]));
 const prover=new NamedMultipartEquivalence(source),proof=prover.prove(scope,[...media??[]],output.family),c=proof.certificate;
 if(!c)return false;
 const fail=(message:string)=>issue(scope,'migration.invariant.named-multipart',message,'implementation');
 const neutral=(scope:GraphScope):MigrationLocation=>{
  const locations=mapped(scope,scope).filter(at=>!!target.scopeAs(at.resource,at.pointer,scope.kind));
  const unique=new Map(locations.map(at=>[JSON.stringify([at.resource,at.pointer]),at]));
  if(unique.size!==1)throw new SourceError('migration.invariant.named-multipart','A named multipart value lost its independent neutral schema owner');
  return [...unique.values()][0];
 };
 const expected=new SourceDocument(prover.schema(c,scope=>{
  const at=neutral(scope);return at.resource+pointerFragment(at.pointer);
 },output.family),'named-multipart-certificate',true,'json');
 for(const part of [...c.positions,...(c.tail?[c.tail]:[])])for(const before of part.values){
  const at=neutral(before),after=target.scopeAs(at.resource,at.pointer,'schema');
  const original=namedValueSchemaIdentity(source,before),delivered=after&&namedValueSchemaIdentity(target,after);
  if(original===undefined||delivered!==original)issue(scope,'migration.invariant.named-multipart','A neutral part schema changed its complete assertions or lacks an established structural inverse','unavailable-proof');
 }
 const actual=target.docs.get(output.resource)!,value=actual.dataNode(output.pointer)?.value;
 let work=0;
 const canonical=(doc:SourceDocument,pointer:string,delivered:boolean,literal=false,propertyMap=false):string=>{
  if(++work>50000)throw new SourceError('limit.migration.positional-encoding','Delivered named multipart correspondence exceeds 50000 captured states');
  const node=doc.dataNode(pointer);if(!node)return 'missing';
  if(node.kind==='object'){
   if(!literal&&Object.keys(node.value).length===1&&typeof node.value.$ref==='string'){
    if(!delivered)return 'schema:'+node.value.$ref;
    const edge=target.referenceAs(doc.id,pointer,'$ref','schema');
    if(edge?.resolution!=='resolved')return 'unresolved';
    return 'schema:'+edge.targetResource+pointerFragment(edge.targetPointer!);
   }
   return '{'+[...node.children].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,child])=>JSON.stringify(key)+':'+canonical(doc,child.pointer,delivered,literal||key==='enum'||key==='const')).join(',')+'}';
  }
  if(node.kind==='array')return '['+[...node.children.values()].map(child=>canonical(doc,child.pointer,delivered,literal)).join(',')+']';
  return migrationExactValueIdentity(doc,pointer);
 };
 if(canonical(expected,'',false)!==canonical(actual,output.pointer+'/schema',true))fail('The delivered named schema changed part identity, counts, order, omission, constraints or allowed value combinations');
 if(value.prefixEncoding!==undefined||value.itemEncoding!==undefined||value.itemSchema!==undefined)fail('The delivered named owner retains an active positional instruction');
 const names=Object.keys(value.encoding??{});
 if(names.some(name=>!namedMultipartFields(c).some(field=>field.name===name)))fail('The delivered named owner activates an unrelated Encoding declaration');
 for(const field of namedMultipartFields(c)){
 const rule=value.encoding?.[field.name]??{};
 if(Object.keys(rule).some(key=>!['contentType','headers'].includes(key)&&!key.startsWith('x-')))fail('The delivered named Encoding activates a different serialization mode');
 if((rule.contentType!==undefined)!==field.explicitMedia||rule.contentType!==undefined&&prover.mediaIdentity(rule.contentType)!==field.mediaIdentity)fail('The delivered part changed its complete media alternatives, charset or explicit/default selection');
 if(!field.explicitMedia){
  const positional=new PositionalEncodingEquivalence(target),owner=target.scopeAs(output.resource,output.pointer+'/schema/properties/'+escape(field.name),'schema');
  // Target default depends on items, including tuple positions. Compare each
  // delivered part partition through the existing default-media prover.
  if(!owner)fail('The delivered repeated field has no schema owner');
  else for(const [index,part]of field.parts.entries()){
   const suffix=!c.language&&output.family==='3.1'&&index<c.positions.length?'/prefixItems/'+index:'/items';
   const all=target.scopeAs(owner.resource,owner.pointer+suffix,'schema');
   const before=part.literalType?formContentType({types:[part.literalType]},'3.2'):new PositionalEncodingEquivalence(source).defaults(part.values,'3.2'),after=all&&(c.language?new FormSemantics(target).shape(all.resource,all.pointer).defaultContentType:positional.defaults([all],output.family));
   if(before===undefined||after!==before)fail('A delivered default part changed its media or raw/encoded interpretation');
  }
 }
 const multipart=new MultipartEncoding(source),delivered=new MultipartEncoding(target);
 const expectedHeaders=new Map<string,MigrationLocation>();
 if(field.rule)for(const [name]of source.docs.get(field.rule.resource)!.dataNode(field.rule.pointer+'/headers')?.children??[]){
  if(name.toLowerCase()==='content-type')continue;
  const at=multipart.follow({...field.rule,pointer:field.rule.pointer+'/headers/'+escape(name),kind:'header'},'header');
  const header=source.scopeAs(at.resource,at.pointer,'header');if(!header){fail('The captured part Header has no typed owner');continue;}
  const next=neutral(header);expectedHeaders.set(name.toLowerCase(),next);
  const afterHeader=target.scopeAs(next.resource,next.pointer,'header'),a=namedHeaderIdentity(source,header),b=afterHeader&&namedHeaderIdentity(target,afterHeader);
  if(a===undefined||b!==a)fail('An independently defined part Header changed its permitted values, content or transfer constraints');
 }
 const actualHeaders=new Map<string,MigrationLocation>();
 for(const name of Object.keys(rule.headers??{})){
  if(name.toLowerCase()==='content-type')continue;
  const at=delivered.follow({...output,pointer:output.pointer+'/encoding/'+escape(field.name)+'/headers/'+escape(name),kind:'header'},'header');
  actualHeaders.set(name.toLowerCase(),at);
 }
 if(actualHeaders.size!==expectedHeaders.size||[...expectedHeaders].some(([name,at])=>{
  const next=actualHeaders.get(name);return !next||next.resource!==at.resource||next.pointer!==at.pointer;
 }))fail('The delivered part changed independently defined Headers or Content-Transfer-Encoding constraints');
 }
 return true;
}

/** Optional actual-byte correspondence for captured production/fixture MIME
 * buffers. Framing and quoted names use the canonical MIME implementation.
 * Schema/Encoding correspondence is a prerequisite, never inferred from this
 * comparison. Only cross-name interleaving may differ; all part body octets,
 * media parameters, disposition parameters and Header values stay exact. */
export function proveNamedMultipartWire(c:NamedMultipartCertificate,before:Readonly<{bytes:Buffer;contentType:string}>,
 after:Readonly<{bytes:Buffer;contentType:string}>):boolean {
 const fields=new Set(namedMultipartFields(c).map(field=>field.name));
 const read=(input:typeof before):Map<string,readonly string[]>|undefined=>{
  const result=new Map<string,string[]>();
  for(const part of mimeParts(input.bytes,input.contentType)){
   const disposition=mimeSingleton(part.headers,'content-disposition');if(!disposition)return;
   const parsed=mediaTypes('x/'+disposition,false);if(parsed.length!==1||parsed[0].subtype!=='form-data')return;
   const name=parsed[0].parameters.get('name');if(name===undefined||!fields.has(name))return;
   const headers=[...part.headers].map(([name,values])=>[name,name==='content-disposition'?[JSON.stringify([...parsed[0].parameters].sort())]:
    name==='content-type'?values.map(value=>JSON.stringify(mediaTypes(value,false).map(type=>[type.type,type.subtype,[...type.parameters].sort()]))):values]).sort(([a],[b])=>String(a)<String(b)?-1:String(a)>String(b)?1:0);
   const values=result.get(name)??[];values.push(JSON.stringify([headers,part.bytes.toString('base64')]));result.set(name,values);
  }
  return result;
 };
 try {
  const a=read(before),b=read(after);return !!a&&!!b&&a.size===b.size&&[...a].every(([name,values])=>JSON.stringify(values)===JSON.stringify(b.get(name)));
 }catch(error){if(error instanceof SourceError)return false;throw error;}
}

function namedHeaderIdentity(graph:ReferenceGraph,scope:GraphScope,state={work:0}):string|undefined {
 const doc=graph.docs.get(scope.resource)!;
 const visit=(pointer:string):string|undefined=>{
  if(++state.work>50000)return;
  const schema=graph.scopeAs(scope.resource,pointer,'schema');
  if(schema)return namedValueSchemaIdentity(graph,schema,new Set(),state);
  const node=doc.dataNode(pointer);if(!node)return;
  if(node.kind==='object'){
   const fields:string[]=[];
   const typed=graph.scopeAs(scope.resource,pointer,'header')||graph.scopeAs(scope.resource,pointer,'media')||graph.scopeAs(scope.resource,pointer,'example');
   for(const [key,child]of node.children){
    if(typed&&(metadata.has(key)||key.startsWith('x-')))continue;
    const value=visit(child.pointer);if(value===undefined)return;fields.push(JSON.stringify(key)+':'+value);
   }
   return '{'+fields.sort().join(',')+'}';
  }
  if(node.kind==='array'){
   const values=[...node.children.values()].map(child=>visit(child.pointer));if(values.some(value=>value===undefined))return;
   return '['+values.join(',')+']';
  }
  return migrationExactValueIdentity(doc,pointer);
 };
 return visit(scope.pointer);
}

/** Structural assertion identity supplements neutral reference identity. It
 * understands existing const/enum and base64/byte lowerings, without evaluating
 * a new schema language. A different lowering keeps an unavailable proof. */
function namedValueSchemaIdentity(graph:ReferenceGraph,scope:GraphScope,active=new Set<string>(),state={work:0}):string|undefined {
 if(++state.work>50000||active.size>=128)return;
 const key=JSON.stringify([scope.resource,scope.pointer]);if(active.has(key))return;
 const next=new Set(active).add(key),doc=graph.docs.get(scope.resource)!,node=doc.dataNode(scope.pointer);
 if(!node)return;if(node.kind==='boolean')return JSON.stringify(node.value?[]:['false']);
 if(node.kind!=='object')return;
 const terms:string[]=[],schemas=new MigrationSchemaProofs(graph);
 for(const [name,child]of node.children){
  if(metadata.has(name)||name.startsWith('x-'))continue;
  if(name==='$ref'||name==='$dynamicRef'){
   const at=schemas.fixed(scope,name),identity=at&&namedValueSchemaIdentity(graph,at,next,state);if(identity===undefined)return;
   terms.push(...JSON.parse(identity) as string[]);if(scope.family==='3.0')break;continue;
  }
  if(name==='allOf'){
   for(const child of doc.dataNode(scope.pointer+'/allOf')!.children.values()){
    const at=graph.scopeAs(scope.resource,child.pointer,'schema'),identity=at&&namedValueSchemaIdentity(graph,at,next,state);if(identity===undefined)return;terms.push(...JSON.parse(identity) as string[]);
   }
   continue;
  }
  if(name==='const'||name==='enum'){
   const fields=name==='const'?[child]:[...child.children.values()];
   terms.push('enum:['+[...new Set(fields.map(child=>migrationExactValueIdentity(doc,child.pointer)))].sort().join(',')+']');continue;
  }
  if(name==='contentEncoding'&&child.value==='base64'||name==='format'&&child.value==='byte'){
   terms.push('transfer:base64');continue;
  }
  if(['properties','patternProperties'].includes(name)){
   const values:string[]=[];
   for(const [key,child]of node.children.get(name)!.children){
    const at=graph.scopeAs(scope.resource,child.pointer,'schema'),identity=at&&namedValueSchemaIdentity(graph,at,next,state);if(identity===undefined)return;
    values.push(JSON.stringify(key)+':'+identity);
   }
   terms.push(name+':{'+values.sort().join(',')+'}');continue;
  }
  const at=graph.scopeAs(scope.resource,child.pointer,'schema');
  if(at){const identity=namedValueSchemaIdentity(graph,at,next,state);if(identity===undefined)return;terms.push(name+':'+identity);}
  else terms.push(name+':'+(name==='required'?'['+[...child.children.values()].map(child=>migrationExactValueIdentity(doc,child.pointer)).sort().join(',')+']':migrationExactValueIdentity(doc,child.pointer)));
 }
 return JSON.stringify([...new Set(terms)].sort());
}
