import {SourceError} from './document';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {MigrationArrayBounds} from './migration_schema_arrays';

export type PositionalEncodingProof=Readonly<{equivalent:boolean;classification:'target-representation'|'unavailable-proof';reason:string;inactive?:boolean}>;
const unknown=(reason:string):PositionalEncodingProof=>({equivalent:false,classification:'unavailable-proof',reason});
const restriction=(reason:string):PositionalEncodingProof=>({equivalent:false,classification:'target-representation',reason});
const equivalent=(inactive=false):PositionalEncodingProof=>({equivalent:true,classification:'unavailable-proof',reason:'Every applicable positional instruction equals the target default',inactive});

/** A bounded certificate over captured schemas, never over observed payloads.
 * It leaves the instance model and all assertions untouched. In particular it
 * cannot turn an ordered list of name/value objects into an unordered object.
 * The same certificate is used by planning and the publication invariant. */
export class PositionalEncodingEquivalence {
 private readonly proofs:MigrationSchemaProofs;
 private readonly bounds:MigrationArrayBounds;
 private work=0;
 constructor(private readonly graph:ReferenceGraph){this.proofs=new MigrationSchemaProofs(graph);this.bounds=new MigrationArrayBounds(graph);}
 private inspect():void {
  if(++this.work>50000)throw new SourceError('limit.migration.positional-encoding','Positional Encoding equivalence exceeds 50000 captured states');
 }
 /** Only unconditional, fixed same-instance applications supply shape
  * evidence. Recursion in a child value is harmless; recursion in this
  * same-instance proof and conditional annotations require further evidence. */
 private parts(scope:GraphScope,active=new Set<string>()):GraphScope[]|undefined {
  this.inspect();const id=JSON.stringify([scope.resource,scope.pointer]);
  if(active.has(id)||active.size>=128)return;
  const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
  if(typeof value==='boolean')return [scope];
  if(!value||typeof value!=='object'||['anyOf','oneOf','if','then','else','dependentSchemas'].some(name=>Object.hasOwn(value,name)))return;
  const result=[scope],next=new Set(active).add(id);
  for(const name of ['$ref','$dynamicRef'])if(Object.hasOwn(value,name)){
   const target=this.proofs.fixed(scope,name),parts=target&&this.parts(target,next);if(!parts)return;result.push(...parts);
  }
  for(let index=0;index<(value.allOf?.length??0);index++){
   const child=this.graph.scopeAs(scope.resource,scope.pointer+'/allOf/'+index,'schema'),parts=child&&this.parts(child,next);
   if(!parts)return;result.push(...parts);
  }
  return result;
 }
 private defaults(scopes:readonly GraphScope[],family:string,active=new Set<string>()):string|undefined {
  this.inspect();const parts:GraphScope[]=[];
  for(const scope of scopes){const values=this.parts(scope);if(!values)return;parts.push(...values);}
  const typed=parts.filter(part=>Object.hasOwn(this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value??{},'type'));
  if(!typed.length)return family==='3.0'?undefined:'application/octet-stream';
  let domains:Set<string>|undefined;
  for(const scope of typed){const local=this.proofs.domains(scope);domains=domains?new Set([...domains].filter(type=>local.has(type))):new Set(local);}
  if(!domains?.size||domains.has('null'))return;
  const annotations=new Set(parts.flatMap(part=>{
   const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
   return typeof value?.contentEncoding==='string'?[value.contentEncoding]:[];
  }));
  if(annotations.size>1)return;
  const media=new Set<string>();
  for(const type of domains){
   if(type==='array'){
    if(family==='3.2'){media.add('application/json');continue;}
    const id=JSON.stringify(parts.map(part=>[part.resource,part.pointer]));if(active.has(id)||active.size>=128)return;
    // Older defaults depend on items, whereas 3.2 encodes the complete
    // nested array. A tuple without a uniform default is not homogeneous.
    const children:GraphScope[]=[];
    for(const part of parts){
     const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
     if(value?.prefixItems||Array.isArray(value?.items))return;
     const child=this.graph.scopeAs(part.resource,part.pointer+'/items','schema');if(child)children.push(child);
    }
    const item=this.defaults(children,family,new Set(active).add(id));if(!item)return;media.add(item);
   }else if(type==='object')media.add('application/json');
   else if(type==='string'){
    // The existing binary migration owns encoded/legacy instance changes.
    // This certificate does not predict a future binary specialization.
    if(family==='3.0'&&annotations.size)return;
    const binary=family==='3.0'&&parts.some(part=>['binary','byte'].includes(this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value?.format));
    media.add(annotations.size||binary?'application/octet-stream':'text/plain');
   }else if(['integer','fraction','number','boolean'].includes(type))media.add('text/plain');
   else return;
  }
  return media.size===1?[...media][0]:undefined;
 }
 boundary(scope:GraphScope):number|undefined {
  const schema=this.graph.scopeAs(scope.resource,scope.pointer+'/schema','schema');
  const roots=schema?this.parts(schema):[];if(!roots)return;
  let result=0;
  for(const part of roots){
   const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
   result=Math.max(result,value?.prefixItems?.length??(Array.isArray(value?.items)?value.items.length:0));
  }
  if(result>2048)throw new SourceError('limit.migration.positional-encoding','Positional schema partition exceeds 2048 positions');
  return result;
 }
 /** Re-derive media defaults at a physical output owner during publication.
  * The schema identity invariant separately protects the complete assertions. */
 defaultAt(scope:GraphScope,index:number,family:string):string|undefined {
  const schema=this.graph.scopeAs(scope.resource,scope.pointer+'/schema','schema');
  const item=this.graph.scopeAs(scope.resource,scope.pointer+'/itemSchema','schema');
  const roots=schema?this.parts(schema):[];if(!roots)return;
  const children:GraphScope[]=item?[item]:[];
  for(const part of roots){
   const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
   const suffix=index<(value?.prefixItems?.length??0)?'/prefixItems/'+index:
    Array.isArray(value?.items)?'/items/'+index:'/items';
   const child=this.graph.scopeAs(part.resource,part.pointer+suffix,'schema');if(child)children.push(child);
  }
  return this.defaults(children,family);
 }
 prove(scope:GraphScope,field:'prefixEncoding'|'itemEncoding',types:readonly string[],target:string):PositionalEncodingProof {
  this.inspect();const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
  const marker=scope.pointer.lastIndexOf('/content/');
  if(marker>=0&&this.graph.scopeAs(scope.resource,scope.pointer.slice(0,marker),'response'))
   return unknown('Response Encoding equivalence remains separately assigned to B05-R3d-2');
  const prefix:readonly unknown[]=Array.isArray(value?.prefixEncoding)?value.prefixEncoding:[];
  if(prefix.length>2048)throw new SourceError('limit.migration.positional-encoding','Positional Encoding exceeds 2048 prefix rules');
  const schema=this.graph.scopeAs(scope.resource,scope.pointer+'/schema','schema');
  const item=this.graph.scopeAs(scope.resource,scope.pointer+'/itemSchema','schema');
  const maximum=schema?this.bounds.maximum(schema):undefined;
  if(maximum===0||field==='itemEncoding'&&maximum!==undefined&&maximum<=prefix.length)return equivalent(true);
  if(!types.length||types.some(type=>!type.toLowerCase().split(';')[0].trim().startsWith('multipart/')))
   return unknown('The positional declaration has no unambiguous captured multipart media context');
  if(target==='2.0')return restriction('Swagger has no positional multipart Encoding owner; a named formData field cannot stand for an unnamed ordered part');
  if(Object.keys(value.encoding??{}).length)return unknown('Retiring positional rules could activate an older named Encoding declaration; its independent applicability is not proved');
  const roots=schema&&this.parts(schema);
  if(schema&&!roots||!schema&&!item)return unknown('No unconditional captured schema establishes the positional part shapes');
  if(schema){const domains=this.proofs.domains(schema);if(domains.size!==1||!domains.has('array'))return unknown('The complete multipart schema does not establish an array-only part model');}
  if(types.some(type=>type.split(';')[0].trim().toLowerCase()==='multipart/form-data'))
   return unknown('No named target certificate establishes each ordered form-data part identity while retaining multiplicity, order and the original array instance model');
  let boundary=prefix.length;
  for(const part of roots??[]){const count=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value?.prefixItems?.length??0;boundary=Math.max(boundary,count);}
  if(boundary>2048)throw new SourceError('limit.migration.positional-encoding','Positional schema partition exceeds 2048 positions');
  // Include omitted rules and the tail: retiring one field must never
  // activate a previously ignored named/default rule during composition.
  const positions=Array.from({length:boundary+1},(_,index)=>index);
  let present=false;
  for(const index of positions){
   this.inspect();if(maximum!==undefined&&index>=maximum)continue;present=true;
   const rule=index<prefix.length?prefix[index]:value.itemEncoding??{};
   if(!rule||typeof rule!=='object'||Array.isArray(rule))return unknown('A positional rule is not a captured Encoding Object');
   if(['encoding','prefixEncoding','itemEncoding'].some(name=>Object.hasOwn(rule,name)))return unknown('Nested Encoding requires its separately assigned equivalence proof');
   if(Object.keys(rule.headers??{}).some(name=>name.toLowerCase()!=='content-type'))
    return restriction('The older target has no positional owner for this part header or transfer requirement');
   const children:GraphScope[]=item?[item]:[];
   for(const part of roots??[]){
    const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
    const at=part.pointer+(index<(value?.prefixItems?.length??0)?'/prefixItems/'+index:'/items');
    const child=this.graph.scopeAs(part.resource,at,'schema');if(child)children.push(child);
   }
   const before=this.defaults(children,'3.2'),after=this.defaults(children,target);
   if(before===undefined||after===undefined)return unknown('The applicable part schemas do not establish a single source and target default media representation');
   if((rule.contentType??before)!==after)
    return restriction('The positional media selection differs from the older default; no standard positional target owner preserves its alternatives');
   // RFC6570 fields are ignored for non-form multipart in both families.
   if(Object.keys(rule).some(name=>!['contentType','headers','style','explode','allowReserved'].includes(name)&&!name.startsWith('x-')))
    return unknown('The Encoding Object contains a field outside the bounded positional default certificate');
  }
  return equivalent(!present);
 }
}
