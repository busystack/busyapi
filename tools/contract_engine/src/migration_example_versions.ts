import {escape,segments,SourceDocument,SourceError} from './document';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import {sourceValueIdentity,type SourcePlan,type SourceLocation} from './source_plan';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';
import {migrationScopes} from './migration_documents';
import {runtimeMediaKind} from './runtime_media';
import {migrationExampleBytes,migrationModeledExampleBytes} from './migration_examples';
import type {ExternalExampleResourcePacket} from './external_examples';
import {capturedRuntimeMedia} from './runtime_media_owner';
import {exampleRepresentation} from './example_representation';
import {xmlCharacters} from './xml_wire';
import {mediaTypes} from './media_types';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {decodeMigrationParameterExample,migrationParameterExampleWire,migrationFormExampleWire} from './migration_parameter_serialization';

type Use=Readonly<{graph:ReferenceGraph;owner:GraphScope;media?:string}>;
const identity=(at:SourceLocation)=>JSON.stringify([at.resource,at.pointer]);

/** 3.2 separates schema-ready data and explicit wire text. Lower captured
 * representations through their established media/Parameter owners, provided
 * every independent consumer agrees. No acquisition or default sample proves
 * equivalence, and modeled media never replace their original schema proof. */
export async function migrateExampleVersions(graphs:readonly ReferenceGraph[],sources:Map<string,SourcePlan>,
 families:readonly string[],target:string,owners:MigrationSchemaOwners,issue:MigrationIssue,
 external:(location:SourceLocation,namespace:string)=>Readonly<{base64:string}>|undefined,
 originalContexts:readonly ReferenceGraph[]=[],exampleResources:readonly ExternalExampleResourcePacket[]=[]):Promise<boolean> {
 if(target==='3.2'||!families.includes('3.2'))return false;
 const uses=new Map<string,Use[]>(),currentUses=new Set<string>();let work=0,changed=false;
 const follow=(graph:ReferenceGraph,scope:GraphScope):GraphScope|undefined=>{
  const seen=new Set<string>();
  while(true){
   if(++work>50000)throw new SourceError('limit.migration.example-versions','Example representation proof exceeds 50000 captured states');
   const id=identity(scope);if(seen.has(id)||seen.size>=128)return;seen.add(id);
   const edge=graph.referenceAs(scope.resource,scope.pointer,'$ref',scope.kind);if(!edge)return scope;
   const next=edge.resolution==='resolved'&&graph.scopeAs(edge.targetResource!,edge.targetPointer!,scope.kind);if(!next)return;scope=next;
  }
 };
 for(const graph of [...graphs,...originalContexts])for(const owner of graph.entryScopes())if(['media','parameter','header'].includes(owner.kind)){
  const definition=follow(graph,owner);if(!definition)continue;
  const parts=segments(owner.pointer),media=owner.kind==='media'&&parts.at(-2)==='content'?parts.at(-1):undefined;
  // Reusable media definitions receive formats from all real content uses.
  if(owner.kind==='media'&&media===undefined)continue;
  for(const name of graph.docs.get(definition.resource)!.dataNode(definition.pointer+'/examples')?.children.keys()??[]){
   const occurrence=graph.scopeAs(definition.resource,definition.pointer+'/examples/'+escape(name),'example');
   const example=occurrence&&follow(graph,occurrence);if(!example)continue;
   const prior=originalContexts.includes(graph),material=prior?owners.uniqueLocation(example).location:example,id=identity(material);
   if(prior&&currentUses.has(id))continue;
   if(!prior)currentUses.add(id);
   const values=uses.get(id)??[];values.push({graph,owner,media});uses.set(id,values);
  }
 }
 for(const scope of migrationScopes(graphs)){
  if(scope.family!=='3.2'||scope.kind!=='example')continue;
  const graph=graphs.find(graph=>graph.scopeAs(scope.resource,scope.pointer,'example')?.family==='3.2')!;
  const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
  if(typeof value?.$ref==='string'||!Object.hasOwn(value??{},'dataValue')&&!Object.hasOwn(value??{},'serializedValue'))continue;
  const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);if(pointer===undefined)continue;
  const consumers=uses.get(identity(scope))??[],data=source.doc.dataNode(pointer+'/dataValue'),serialized=source.doc.dataNode(pointer+'/serializedValue');
  const field=(name:string)=>({...scope,pointer:scope.pointer+'/'+name});
  if(!consumers.length){issue(scope,'migration.example.representation-context','No captured media or parameter consumer establishes an older value representation for this reusable Example','unavailable-proof');continue;}
  const kinds=consumers.map(use=>use.media?.split(';')[0].trim().toLowerCase()==='application/x-www-form-urlencoded'?'form':use.media?runtimeMediaKind(use.media):'parameter');
  if(kinds.some(kind=>['xml','linkset','json-lines','json-sequence','event-stream'].includes(kind))){
   if(consumers.some((use,index)=>!use.media||!['xml','linkset','linkset-json','json','json-lines','json-sequence','event-stream'].includes(kinds[index]))){
    issue(scope,'migration.example.shared-representation','The captured data/wire consumers still need independently owned older Example representations','unavailable-proof');continue;
   }
   try{
    if(!data){
     if(kinds.some(kind=>kind==='json'||kind==='linkset-json')){
      issue(scope,'migration.example.shared-representation','A shared serialized Example needs an established common literal representation for its JSON and non-JSON consumers','unavailable-proof');continue;
     }
     // These older media examples are embedded wire strings too. Source and
     // target validation retain the same concrete media and original schema.
     source.move(pointer+'/serializedValue',pointer+'/value');changed=true;continue;
    }
    const raw=source.doc.dataJson(pointer+'/dataValue'),bytes:Buffer[]=[];
    for(const use of consumers){
     const media=capturedRuntimeMedia(use.graph)(use.owner);
     let parent=use.owner.pointer,header=false;
     while(parent){
      const parameter=use.graph.scopeAs(use.owner.resource,parent,'parameter');
      if(use.graph.scopeAs(use.owner.resource,parent,'header')||parameter&&use.graph.docs.get(parameter.resource)!.dataNode(parameter.pointer+'/in')?.value==='header'){header=true;break;}
      parent=parent.slice(0,parent.lastIndexOf('/'));
     }
     bytes.push(await migrationModeledExampleBytes(use.graph,use.media!,raw,media.schema,header,exampleResources,media.itemSchema));
    }
    if(serialized&&consumers.some((use,index)=>!bytes[index].equals(migrationExampleBytes(serialized.value,use.media!)))){
     issue(scope,'migration.example.paired-bytes','The independently authored data and serialized choices select different bytes; preserving both still needs independently owned older Examples','unavailable-proof');continue;
    }
    if(Object.hasOwn(value,'externalValue')){
     if(consumers.some((use,index)=>external(field('externalValue'),use.graph.root)?.base64!==bytes[index].toString('base64'))){
      issue(scope,'migration.example.external-equivalence','Approved external bytes do not establish the same modeled example for every captured media consumer','unavailable-proof');continue;
     }
     owners.retainNativeHistory(field('dataValue'),source,pointer+'/dataValue','example_data_value',graph);
     if(serialized)owners.retainNativeHistory(field('serializedValue'),source,pointer+'/serializedValue','example_serialization',graph);
    }else{
     let olderString:string|undefined;
     if(typeof data.value==='string'){
      const candidates=consumers.map((use,index)=>exampleRepresentation('value',data.value,use.media)==='json'?data.value:
       kinds[index]==='xml'?xmlCharacters(bytes[index],mediaTypes(use.media!)[0].parameters.get('charset')):
       new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes[index]));
      if(new Set(candidates).size!==1||consumers.some((use,index)=>exampleRepresentation('value',candidates[index],use.media)==='serialized'&&
       !migrationExampleBytes(candidates[index],use.media!).equals(bytes[index]))){
       issue(scope,'migration.example.shared-representation','The scalar data example needs independently owned older values for its captured media consumers','unavailable-proof');continue;
      }
      olderString=candidates[0];
     }
     if(serialized)owners.retainNativeHistory(field('serializedValue'),source,pointer+'/serializedValue','example_serialization',graph);
     if(olderString!==undefined&&olderString!==data.value){
      owners.retainNativeHistory(field('dataValue'),source,pointer+'/dataValue','example_data_value',graph);
      source.set(pointer+'/value',olderString);
     }else source.move(pointer+'/dataValue',pointer+'/value');
    }
    changed=true;
   }catch(error){
    if(!(error instanceof SourceError)&&!(error instanceof TypeError))throw error;
    issue(scope,'migration.example.representation-codec','The existing canonical media owner could not establish exact older example bytes: '+error.message,'unavailable-proof');
   }
   continue;
  }
  // Linkset JSON has the same literal embedding rule as JSON, while its
  // native profile and model constraints remain checked by the shared codec.
  for(let index=0;index<kinds.length;index++)if(kinds[index]==='linkset-json')kinds[index]='json';
  if(kinds.some(kind=>!['json','text','parameter','form'].includes(kind))){issue(scope,'migration.example.representation-codec','The captured consumers need a data-to-wire decoder or encoder outside the established JSON/plain-text/form example proof','unavailable-proof');continue;}
  const formWire=(use:Use):string|undefined=>{
   const raw=source.doc.dataJson(pointer+'/dataValue');
   return use.media?migrationFormExampleWire(use.graph,use.owner,use.media,raw):
    use.owner.kind==='parameter'?migrationParameterExampleWire(use.graph,use.owner,raw):undefined;
  };
  if(kinds.includes('form')&&data&&(serialized||Object.hasOwn(value,'externalValue'))){
   const wires=consumers.map(use=>formWire(use));
   if(kinds.some(kind=>kind!=='form'&&kind!=='parameter')||wires.some(wire=>wire===undefined)||
    serialized&&wires.some(wire=>wire!==serialized.value)||
    Object.hasOwn(value,'externalValue')&&consumers.some((use,index)=>external(field('externalValue'),use.graph.root)?.base64!==Buffer.from(wires[index]!,'utf8').toString('base64'))){
    issue(scope,'migration.example.form-paired-values','The independently retained form Example does not establish the same data and bytes for every captured consumer','unavailable-proof');continue;
   }
   if(serialized){
    owners.retainNativeHistory(field('serializedValue'),source,pointer+'/serializedValue','example_serialization',graph);
    source.move(pointer+'/dataValue',pointer+'/value');changed=true;continue;
   }
   if(Object.hasOwn(value,'externalValue')){
    owners.retainNativeHistory(field('dataValue'),source,pointer+'/dataValue','example_data_value',graph);changed=true;continue;
   }
  }
  if(data&&kinds.some(kind=>kind==='text'&&typeof data.value!=='string')){
   issue(field('dataValue'),'migration.example.data-representation','A non-string data example has no proved plain-text older value representation','unavailable-proof');continue;
  }
  const simpleHeader=serialized&&/^[!-~](?:[ -~]*[!-~])?$/.test(serialized.value)&&consumers.every(use=>{
   if(use.media)return use.media.split(';')[0].trim().toLowerCase()==='application/x-www-form-urlencoded'||runtimeMediaKind(use.media)==='text';
   const definition=follow(use.graph,use.owner);if(!definition)return false;
   const declaration=use.graph.docs.get(definition.resource)!.dataNode(definition.pointer)?.value;
   if(use.owner.kind!=='header'&&declaration?.in!=='header'||declaration.content||(declaration.style??'simple')!=='simple')return false;
   const schema=use.graph.scopeAs(definition.resource,definition.pointer+'/schema','schema');
   const domains=schema&&new MigrationSchemaProofs(use.graph).domains(schema);
   return domains?.size===1&&domains.has('string')&&(!data||data.value===serialized.value);
  });
  if(serialized&&kinds.includes('parameter')&&!simpleHeader){
   const decoded=await Promise.all(consumers.map(async use=>{
    const parent=use.media&&use.owner.pointer.slice(0,use.owner.pointer.lastIndexOf('/content/'));
    const owner=use.media?use.graph.scopeAs(use.owner.resource,parent!,'parameter'):use.owner.kind==='parameter'?use.owner:undefined;
    if(!owner)return;
    const value=await decodeMigrationParameterExample(use.graph,owner,serialized.value);
    return value&&(use.media?migrationFormExampleWire(use.graph,use.owner,use.media,value):migrationParameterExampleWire(use.graph,owner,value))===serialized.value?value:undefined;
   }));
   if(decoded.some(value=>value===undefined)||new Set(decoded.map(value=>value&&sourceValueIdentity(new SourceDocument(value,'file:///migration-example.json',true,'json'),''))).size!==1||
    data&&sourceValueIdentity(source.doc,pointer+'/dataValue')!==sourceValueIdentity(new SourceDocument(decoded[0]!,'file:///migration-example.json',true,'json'),'')){
    issue(field('serializedValue'),'migration.example.parameter-serialization','The captured parameter inverse does not establish one schema-valid older value and exact serialization for every consumer','unavailable-proof');continue;
   }
   owners.retainNativeHistory(field('serializedValue'),source,pointer+'/serializedValue','example_serialization',graph);
   if(data)source.move(pointer+'/dataValue',pointer+'/value');else source.exact(pointer+'/value',decoded[0]!);
   changed=true;continue;
  }
  let literal:SourceDocument|undefined;
  if(serialized&&kinds.includes('json')){
   if(kinds.includes('text')){issue(field('serializedValue'),'migration.example.shared-representation','The same serialized string has incompatible JSON and plain-text older value interpretations','target-representation');continue;}
   literal=new SourceDocument(serialized.value,'file:///migration-serialized-example.json',true,'json');
   if(literal.issues.length||literal.dataJson('')!==serialized.value){issue(field('serializedValue'),'migration.example.serialized-literal','The serialized JSON has no standard literal that reproduces its exact entity bytes','target-representation');continue;}
   if(data&&sourceValueIdentity(source.doc,pointer+'/dataValue')!==sourceValueIdentity(literal,'')){
    issue(scope,'migration.example.paired-values','The data and wire examples do not establish one common exact older value','target-representation');continue;
   }
  }
  const wire=(use:Use)=>use.media?migrationExampleBytes(kinds[consumers.indexOf(use)]==='json'?source.doc.dataJson(pointer+'/dataValue'):data!.value,use.media).toString('base64'):undefined;
  if(data&&serialized&&consumers.some(use=>use.media&&wire(use)!==migrationExampleBytes(serialized.value,use.media).toString('base64'))){
   issue(scope,'migration.example.paired-bytes','The independently authored data and serialized examples select different effective bytes; one older value cannot retain both','target-representation');continue;
  }
  if(Object.hasOwn(value,'externalValue')){
   if(!data||consumers.some(use=>!use.media||external(field('externalValue'),use.graph.root)?.base64!==wire(use))){
    issue(scope,'migration.example.external-equivalence','The captured external bytes do not establish the same older example value for every consumer','unavailable-proof');continue;
   }
   owners.retainNativeHistory(field('dataValue'),source,pointer+'/dataValue','example_data_value',graph);
   if(serialized)owners.retainNativeHistory(field('serializedValue'),source,pointer+'/serializedValue','example_serialization',graph);
  }else if(data){
   if(serialized)owners.retainNativeHistory(field('serializedValue'),source,pointer+'/serializedValue','example_serialization',graph);
   source.move(pointer+'/dataValue',pointer+'/value');
  }else if(serialized){
   const text=serialized.value;
   owners.retainNativeHistory(field('serializedValue'),source,pointer+'/serializedValue','example_serialization',graph);
   if(literal)source.exact(pointer+'/value',literal.dataJson(''));else source.set(pointer+'/value',text);
  }
  changed=true;
 }
 return changed;
}
