import {SourceDocument,SourceError,escape} from './document';
import {CapturedExampleResources,externalExampleRequest,type ExternalExampleResourcePacket} from './external_examples';
import {exampleRepresentation} from './example_representation';
import {externalParameterText} from './serialized_parameter_examples';
import {schemaExampleCandidates} from './schema_examples';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {SourcePlan,SourceLocation} from './source_plan';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {migrationExactValueIdentity} from './migration_schema_proofs';
import {documentUriBase,pointerFragment} from './reference_graph';
import {logicalSourcePointers} from './source_yaml_ownership';
import {relocateMarkdownLinks} from './markdown_relocation';
import {capturedRuntimeMedia} from './runtime_media_owner';

type Metadata=Readonly<{name:string;location:SourceLocation}>;
type Choice=Readonly<{name?:string;authoredName:boolean;data:string;wire:string;metadata:readonly Metadata[];external?:Readonly<{location:SourceLocation;base64:string;uri:string}>}>;
export type ProjectedParameterExample=Readonly<{name?:string;raw:string;metadata:readonly Metadata[];external?:Choice['external']}>;
export type ParameterExampleProjection=Readonly<{fields:readonly (readonly ProjectedParameterExample[])[];explicit:boolean;
 retainedExternal:readonly NonNullable<Choice['external']>[];order:readonly number[]} >;
type Context=Readonly<{parameter:GraphScope;schema:GraphScope;media?:SourceLocation;mediaType?:string}>;
type Codec=Readonly<{decode:(text:string)=>Promise<string|undefined>;encode:(raw:string)=>string|undefined;
 project:(raw:string)=>readonly string[]|undefined;target:(index:number,raw:string)=>string|undefined;delimiter?:string;
 order?:(raw:string)=>readonly number[]}>;
const exact=(raw:string)=>migrationExactValueIdentity(new SourceDocument(raw,'file:///migration-example-value.json',true,'json'),'');

/** Metadata may be copied into several projected examples. Resolve its
 * defining Example root through the common allocator, whose ownership stays
 * independent of those field copies; do not require each copied leaf to have
 * one material location. */
function materialExampleField(graph:ReferenceGraph,location:SourceLocation,owners:MigrationSchemaOwners) {
 const split=location.pointer.lastIndexOf('/'),parent=location.pointer.slice(0,split);
 if(!graph.scopeAs(location.resource,parent,'example'))throw new SourceError('migration.parameter.example-proof','The copied field has no captured defining Example owner',[0,0],'unsupported');
 const material=owners.uniqueLocation({resource:location.resource,pointer:parent});
 return {source:material.source,pointer:material.location.pointer+location.pointer.slice(split)};
}

/** Keep original Example targets native before their containing serialization
 * layer retires. Incoming references and aliases follow the ordinary CST move
 * relation; projected data never replaces an independent original owner. */
export function retainMigrationParameterExampleOwners(graph:ReferenceGraph,context:Context,owners:MigrationSchemaOwners):void {
 for(const layer of [context.parameter,...(context.media?[context.media]:[])]){
  const doc=graph.docs.get(layer.resource)!;
  for(const name of doc.dataNode(layer.pointer+'/examples')?.children.keys()??[]){
   const original={resource:layer.resource,pointer:layer.pointer+'/examples/'+escape(name)};
   const material=owners.uniqueLocation(original),held=owners.reserve(original,'parameter_example',JSON.stringify(original),
    {resource:graph.root,pointer:'/components/examples'});
   if(held.source===material.source)material.source.move(material.location.pointer,held.location.pointer,true);
   else{held.source.copy(material.source,material.location.pointer,held.location.pointer,true);material.source.remove(material.location.pointer);}
   const external=doc.dataNode(original.pointer+'/externalValue');
   if(external){
    const request=externalExampleRequest(graph,original.resource,original.pointer+'/externalValue');
    if(request.targetResource)held.source.set(held.location.pointer+'/externalValue',request.targetResource);
   }
   material.source.set(material.location.pointer,{$ref:held.location.resource+pointerFragment(held.location.pointer)});
   for(const pointer of logicalSourcePointers(held.source.doc))if((pointer===held.location.pointer||pointer.startsWith(held.location.pointer+'/'))&&!held.source.origins.has(pointer))
    held.source.origins.set(pointer,new Set([pointer]));
   held.source.presentationChanges.push(held.location.pointer);
  }
 }
}

/** Read defining occurrences through the canonical graph and approved byte
 * index. This is a migration projection; it owns neither acquisition nor a
 * serializer, schema evaluator, reference index or resource allocation. */
export async function migrationParameterExampleProjection(graph:ReferenceGraph,context:Context,codec:Codec,
 packets:readonly ExternalExampleResourcePacket[]=[],fieldCount=1):Promise<ParameterExampleProjection> {
 const captured=new CapturedExampleResources(packets),choices:Choice[]=[];
 let explicit=false,work=0;
 const fail=(message:string):never=>{throw new SourceError('migration.parameter.example-proof',message,[0,0],'unsupported');};
 const follow=(start:SourceLocation):Readonly<{target:SourceLocation;chain:readonly SourceLocation[]}>=>{
  let at=start;const seen=new Set<string>(),chain:SourceLocation[]=[];
  while(true){
   if(++work>20000||seen.size>=128)fail('Example projection exceeds its bounded occurrence budget');
   const id=JSON.stringify(at);if(seen.has(id))fail('The Example reference chain is cyclic');seen.add(id);
   const node=graph.docs.get(at.resource)?.dataNode(at.pointer);if(!node)fail('The defining Example occurrence is unavailable');
   chain.push(at);
   if(typeof node!.value?.$ref!=='string')return {target:at,chain};
   const edge=graph.referenceAs(at.resource,at.pointer,'$ref','example');
   if(edge?.resolution!=='resolved')fail('The defining Example reference is unavailable');
   at={resource:edge!.targetResource!,pointer:edge!.targetPointer!};
  }
 };
 const add=async(at:SourceLocation,field:string,name:string|undefined,mediaType:string|undefined,metadata:readonly Metadata[]=[],external?:Choice['external'])=>{
  const doc=graph.docs.get(at.resource)!,node=doc.dataNode(at.pointer+'/'+field);
  const serialized=external!==undefined||node&&exampleRepresentation(field as 'value',node.value,mediaType)==='serialized';
  const text=external?externalParameterText(graph,context.parameter,Buffer.from(external.base64,'base64')):serialized?node!.value:undefined;
  const data=serialized?await codec.decode(text):doc.dataJson(at.pointer+'/'+field);
  if(data===undefined)fail('No schema-valid captured inverse is established for this serialized example');
  const wire=codec.encode(data!);if(wire===undefined||serialized&&wire!==text)fail('The example does not retain its exact serialization under the captured codec');
  choices.push({name,authoredName:name!==undefined,data:data!,wire:wire!,metadata,...(external?{external}:{})});
 };
 const layer=async(owner:SourceLocation,mediaType?:string)=>{
  const doc=graph.docs.get(owner.resource)!,value=doc.dataNode(owner.pointer)!.value;
  if(Object.hasOwn(value,'example')){explicit=true;await add(owner,'example',undefined,mediaType);}
  if(Object.hasOwn(value,'examples')){
   explicit=true;
   for(const name of doc.dataNode(owner.pointer+'/examples')?.children.keys()??[]){
    const occurrence={...owner,pointer:owner.pointer+'/examples/'+escape(name)},resolved=follow(occurrence),at=resolved.target,definition=graph.docs.get(at.resource)!;
    const metadata:Metadata[]=[];
    for(const name of ['summary','description']){
     const owner=resolved.chain.find(owner=>graph.docs.get(owner.resource)!.dataNode(owner.pointer+'/'+name));
     if(owner)metadata.push({name,location:{...owner,pointer:owner.pointer+'/'+name}});
    }
    const data=definition.dataNode(at.pointer+'/dataValue'),serialized=definition.dataNode(at.pointer+'/serializedValue'),external=definition.dataNode(at.pointer+'/externalValue');
    if(data){
     await add(at,'dataValue',name,mediaType,metadata);
     const expected=choices.at(-1)!;
     if(serialized&&expected.wire!==serialized.value)throw new SourceError('migration.parameter.example-target','The paired data and serialized examples select different octets; one older Example value cannot preserve both representations');
     if(external){const bytes=captured.read(graph,at.resource,at.pointer+'/externalValue');
      if(Buffer.from(expected.wire,'utf8').toString('base64')!==bytes.base64)throw new SourceError('migration.parameter.example-target','The paired data and approved external bytes differ; one older Example value cannot preserve both representations');
      choices[choices.length-1]={...expected,external:{location:{...at,pointer:at.pointer+'/externalValue'},base64:bytes.base64,uri:bytes.id}};
     }
    }else if(external){const bytes=captured.read(graph,at.resource,at.pointer+'/externalValue');
     await add(at,'externalValue',name,mediaType,metadata,{location:{...at,pointer:at.pointer+'/externalValue'},base64:bytes.base64,uri:bytes.id});
    }else if(serialized)await add(at,'serializedValue',name,mediaType,metadata);
    else if(definition.dataNode(at.pointer+'/value'))await add(at,'value',name,mediaType,metadata);
    else fail('An authored Example has no captured value representation');
   }
  }
  return Object.hasOwn(value,'example')||Object.hasOwn(value,'examples');
 };
 await layer(context.parameter);
 const mediaExplicit=context.media?await layer(context.media,context.mediaType):explicit;
 if(!mediaExplicit){
  const fallback=schemaExampleCandidates(graph,context.schema);if(!fallback.complete)fail('Schema example selection is incomplete');
  for(const selected of fallback.values){
   const doc=graph.docs.get(selected.resource)!,data=doc.dataJson(selected.pointer),wire=codec.encode(data);
   if(wire===undefined)fail('A schema example has no captured parameter serialization');
   choices.push({name:selected.name,authoredName:false,data,wire:wire!,metadata:[]});
  }
 }
 const metadataIdentity=(choice:Choice)=>JSON.stringify(choice.metadata.map(metadata=>{
  const value=graph.docs.get(metadata.location.resource)!.dataNode(metadata.location.pointer)!.value;
  const parent=metadata.location.pointer.slice(0,metadata.location.pointer.lastIndexOf('/'));
  const scope=graph.scopeAs(metadata.location.resource,parent,'example');
  return [metadata.name,metadata.name==='description'&&scope?relocateMarkdownLinks(value,documentUriBase(graph,scope),'file:///migration-example-context/'):value];
 }).sort(([first],[last])=>first<last?-1:first>last?1:0));
 const named=new Map<string,Choice>();
 for(let index=0;index<choices.length;index++){
  const choice=choices[index];if(!choice.authoredName)continue;
  const previous=named.get(choice.name!);
  if(previous){
   if(exact(previous.data)!==exact(choice.data)||previous.wire!==choice.wire||metadataIdentity(previous)!==metadataIdentity(choice)||
    previous.external?.uri!==choice.external?.uri||previous.external?.base64!==choice.external?.base64)
    throw new SourceError('migration.parameter.example-target','Distinct example layers use the same authored name for different data, bytes, metadata or external resources');
   choices.splice(index--,1);
  }else named.set(choice.name!,choice);
 }
 const names=new Set(named.keys());
 for(let index=0;index<choices.length;index++){
  const choice=choices[index];if(choice.authoredName||choices.length===1&&choice.name===undefined)continue;
  const preferred=choice.name??graph.docs.get(context.parameter.resource)!.dataNode(context.parameter.pointer)!.value.name;
  let name=preferred,suffix=1;while(names.has(name))name=preferred+'_'+suffix++;
  names.add(name);choices[index]={...choice,name};
 }
 const fields:Array<ProjectedParameterExample[]> = Array.from({length:fieldCount},()=>[]),tuples:string[][]=[];
 let order:readonly number[]|undefined;
 for(const choice of choices){
  const projected=codec.project(choice.data);if(!projected||projected.length!==fieldCount)
   throw new SourceError('migration.parameter.example-target','An extracted example omits a field; independent target examples cannot retain the original selected group');
  const wires=projected.map((raw,index)=>codec.target(index,raw));
  const authored=codec.order?.(choice.data)??projected.map((_,index)=>index);
  if(order&&JSON.stringify(order)!==JSON.stringify(authored))
   throw new SourceError('migration.parameter.example-target','These authored examples require different complete field orders; independent target examples have no per-example group ordering owner');
  order=authored;
  if(wires.some(wire=>wire===undefined)||authored.map(index=>wires[index]).filter(wire=>wire!=='').join(codec.delimiter??'&')!==choice.wire)
   throw new SourceError('migration.parameter.example-target','The target example group changes its original serialization or field order');
  tuples.push(projected.map(exact));
  for(const [index,raw]of projected.entries())fields[index].push({name:choice.name,raw,metadata:choice.metadata,
   ...(choice.external&&fieldCount===1?{external:choice.external}:{})});
 }
 // The authored example relation must itself factor, independently of the
 // schema relation. Schema independence never proves example independence.
 let products:string[][]=[[]];
 for(let index=0;index<fieldCount;index++){
  const values=[...new Set(tuples.map(tuple=>tuple[index]))];
  if(products.length*values.length>2048)fail('Example product proof exceeds 2048 states');
  products=products.flatMap(prefix=>values.map(value=>[...prefix,value]));
 }
 const relation=new Set(tuples.map(tuple=>JSON.stringify(tuple)));
 if(products.some(tuple=>!relation.has(JSON.stringify(tuple))))
  throw new SourceError('migration.parameter.example-target','Independent field examples would imply combinations absent from the authored correlated examples');
 return {fields,explicit,retainedExternal:fieldCount>1?choices.flatMap(choice=>choice.external?[choice.external]:[]):[],order:order??fields.map((_,index)=>index)};
}

/** Original literals and native external/resource owners remain with the
 * common allocator. Generated projected values deliberately acquire fresh
 * provenance rather than pretending to be unchanged source payloads. */
export function installMigrationParameterExamples(graph:ReferenceGraph,projection:ParameterExampleProjection,index:number,
 output:SourcePlan,pointer:string,owners:MigrationSchemaOwners):void {
 const values=projection.fields[index];
 // Generated literal cookie content must not reactivate the original schema
 // fallback beneath a second Media Type selection layer.
 if(output.doc.dataNode(pointer+'/in')?.value==='cookie')for(const name of output.doc.dataNode(pointer+'/content')?.children.keys()??[])
  output.set(pointer+'/content/'+escape(name)+'/examples',{});
 if(index===0)for(const external of projection.retainedExternal){
  const held=owners.reserve(external.location,'whole_query_external_example',JSON.stringify(external.location),
   {resource:graph.root,pointer:'/components/examples'});
  held.source.set(held.location.pointer,{});
  const captured=materialExampleField(graph,external.location,owners);
  held.source.copy(captured.source,captured.pointer,held.location.pointer+'/externalValue',true);
  held.source.set(held.location.pointer+'/externalValue',external.uri);
 }
 for(const field of ['example','examples'])if(output.doc.dataNode(pointer+'/'+field))
  owners.retainNativeHistory({resource:output.doc.id,pointer:pointer+'/'+field},output,pointer+'/'+field,'parameter_examples',graph);
 if(!values.length){output.set(pointer+'/examples',{});return;}
 if(values.length===1&&values[0].name===undefined&&!values[0].external){output.exact(pointer+'/example',values[0].raw);return;}
 output.set(pointer+'/examples',{});
 for(const value of values){
  const at=pointer+'/examples/'+escape(value.name??'example');output.set(at,{});
  for(const metadata of value.metadata){
   const captured=materialExampleField(graph,metadata.location,owners);
   output.copy(captured.source,captured.pointer,at+'/'+metadata.name,true);
  }
  if(value.external){
   const captured=materialExampleField(graph,value.external.location,owners);
   output.copy(captured.source,captured.pointer,at+'/externalValue',true);
   output.set(at+'/externalValue',value.external.uri);
  }else output.exact(at+'/value',value.raw);
 }
}

/** Publication re-derives the complete authored choice relation from the
 * original capture, then checks every destination field and metadata owner.
 * A schema/domain certificate alone cannot admit lost or changed examples. */
export function sameMigrationParameterExamples(source:ReferenceGraph,projection:ParameterExampleProjection,
 target:ReferenceGraph,outputs:readonly SourceLocation[],packets:readonly ExternalExampleResourcePacket[]=[]):boolean {
 const captured=new CapturedExampleResources(packets);
 return outputs.length===projection.fields.length&&outputs.every((output,index)=>{
  const doc=target.docs.get(output.resource)!,values=projection.fields[index];
  if(doc.dataNode(output.pointer+'/in')?.value==='cookie')for(const name of doc.dataNode(output.pointer+'/content')?.children.keys()??[]){
   const media=capturedRuntimeMedia(target)({...output,pointer:output.pointer+'/content/'+escape(name)}).source;
   const owner=target.docs.get(media.resource)!,named=owner.dataNode(media.pointer+'/examples');
   if(owner.dataNode(media.pointer+'/example')||named?.kind!=='object'||named.children.size)return false;
  }
  if(target.scopeAs(output.resource,output.pointer,'parameter')?.family==='2.0')
   return values.length===0&&!doc.dataNode(output.pointer+'/example')&&!doc.dataNode(output.pointer+'/examples');
  if(values.length===1&&values[0].name===undefined&&!values[0].external)
   return doc.dataNode(output.pointer+'/example')!==undefined&&doc.dataJson(output.pointer+'/example')===values[0].raw&&!doc.dataNode(output.pointer+'/examples');
  const named=doc.dataNode(output.pointer+'/examples');
  if(doc.dataNode(output.pointer+'/example')||named?.kind!=='object'||named.children.size!==values.length)return false;
  if([...named.children.keys()].some((name,position)=>name!==(values[position].name??'example')))return false;
  return values.every(value=>{
   let at={...output,pointer:output.pointer+'/examples/'+escape(value.name??'example')};const seen=new Set<string>();
   while(typeof target.docs.get(at.resource)?.dataNode(at.pointer)?.value?.$ref==='string'){
    const id=JSON.stringify(at);if(seen.has(id)||seen.size>=128)return false;seen.add(id);
    const edge=target.referenceAs(at.resource,at.pointer,'$ref','example');if(edge?.resolution!=='resolved')return false;
    at={resource:edge.targetResource!,pointer:edge.targetPointer!};
   }
   const actual=target.docs.get(at.resource)!;
   if(value.external){
    try{if(captured.read(target,at.resource,at.pointer+'/externalValue').base64!==value.external.base64||actual.dataNode(at.pointer+'/value'))return false;}
    catch(error){if(error instanceof SourceError)return false;throw error;}
   }else if(!actual.dataNode(at.pointer+'/value')||actual.dataJson(at.pointer+'/value')!==value.raw||actual.dataNode(at.pointer+'/externalValue'))return false;
   if(actual.dataNode(at.pointer+'/dataValue')||actual.dataNode(at.pointer+'/serializedValue'))return false;
   return ['summary','description'].every(name=>{
    const expected=value.metadata.find(metadata=>metadata.name===name),node=actual.dataNode(at.pointer+'/'+name);
    // The existing Markdown invariant checks description text and relocated
    // link bases through the copied provenance. Summary remains a literal.
    return expected?!!node&&(name==='description'||actual.dataJson(at.pointer+'/'+name)===source.docs.get(expected.location.resource)!.dataJson(expected.location.pointer)):!node;
   });
  });
 });
}
