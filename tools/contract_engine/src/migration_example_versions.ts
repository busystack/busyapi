import {escape,segments,SourceDocument,SourceError} from './document';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import {migrationValueIdentity,type MigrationSource,type MigrationLocation} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';
import {migrationScopes} from './migration_documents';
import {runtimeMediaKind} from './runtime_media';
import {migrationExampleBytes} from './migration_examples';
import {MigrationSchemaProofs} from './migration_schema_proofs';

type Use=Readonly<{graph:ReferenceGraph;owner:GraphScope;media?:string}>;
const identity=(at:MigrationLocation)=>JSON.stringify([at.resource,at.pointer]);

/** 3.2 separates schema-ready data and explicit wire text. Older value fields
 * can retain JSON data and plain-text wire strings, provided every independent
 * consumer agrees. No decoder, network access or default sample proves this. */
export function migrateExampleVersions(graphs:readonly ReferenceGraph[],sources:Map<string,MigrationSource>,
 families:readonly string[],target:string,owners:MigrationSchemaOwners,issue:MigrationIssue,
 external:(location:MigrationLocation,namespace:string)=>Readonly<{base64:string}>|undefined):boolean {
 if(target==='3.2'||!families.includes('3.2'))return false;
 const uses=new Map<string,Use[]>();let work=0,changed=false;
 const follow=(graph:ReferenceGraph,scope:GraphScope):GraphScope|undefined=>{
  const seen=new Set<string>();
  while(true){
   if(++work>50000)throw new SourceError('limit.migration.example-versions','Example representation proof exceeds 50000 captured states');
   const id=identity(scope);if(seen.has(id)||seen.size>=128)return;seen.add(id);
   const edge=graph.referenceAs(scope.resource,scope.pointer,'$ref',scope.kind);if(!edge)return scope;
   const next=edge.resolution==='resolved'&&graph.scopeAs(edge.targetResource!,edge.targetPointer!,scope.kind);if(!next)return;scope=next;
  }
 };
 for(const graph of graphs)for(const owner of graph.entryScopes())if(['media','parameter','header'].includes(owner.kind)){
  const definition=follow(graph,owner);if(!definition)continue;
  const parts=segments(owner.pointer),media=owner.kind==='media'&&parts.at(-2)==='content'?parts.at(-1):undefined;
  // Reusable media definitions receive formats from all real content uses.
  if(owner.kind==='media'&&media===undefined)continue;
  for(const name of graph.docs.get(definition.resource)!.dataNode(definition.pointer+'/examples')?.children.keys()??[]){
   const occurrence=graph.scopeAs(definition.resource,definition.pointer+'/examples/'+escape(name),'example');
   const example=occurrence&&follow(graph,occurrence);if(!example)continue;
   const id=identity(example),values=uses.get(id)??[];values.push({graph,owner,media});uses.set(id,values);
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
  const kinds=consumers.map(use=>use.media?runtimeMediaKind(use.media):'parameter');
  if(kinds.some(kind=>!['json','text','parameter'].includes(kind))){issue(scope,'migration.example.representation-codec','The captured consumers need a data-to-wire decoder or encoder outside the established JSON/plain-text example proof','unavailable-proof');continue;}
  if(data&&kinds.some(kind=>kind==='text'&&typeof data.value!=='string')){
   issue(field('dataValue'),'migration.example.data-representation','A non-string data example has no proved plain-text older value representation','unavailable-proof');continue;
  }
  const simpleHeader=serialized&&/^[!-~](?:[ -~]*[!-~])?$/.test(serialized.value)&&consumers.every(use=>{
   if(use.media)return false;
   const definition=follow(use.graph,use.owner);if(!definition)return false;
   const declaration=use.graph.docs.get(definition.resource)!.dataNode(definition.pointer)?.value;
   if(use.owner.kind!=='header'&&declaration?.in!=='header'||declaration.content||(declaration.style??'simple')!=='simple')return false;
   const schema=use.graph.scopeAs(definition.resource,definition.pointer+'/schema','schema');
   const domains=schema&&new MigrationSchemaProofs(use.graph).domains(schema);
   return domains?.size===1&&domains.has('string')&&(!data||data.value===serialized.value);
  });
  if(serialized&&kinds.includes('parameter')&&!simpleHeader){
   issue(field('serializedValue'),'migration.example.parameter-serialization','A parameter serialization includes names and escaping; no equality certificate maps it to one older schema-ready value for every consumer','unavailable-proof');continue;
  }
  let literal:SourceDocument|undefined;
  if(serialized&&kinds.includes('json')){
   if(kinds.includes('text')){issue(field('serializedValue'),'migration.example.shared-representation','The same serialized string has incompatible JSON and plain-text older value interpretations','target-representation');continue;}
   literal=new SourceDocument(serialized.value,'file:///migration-serialized-example.json',true,'json');
   if(literal.issues.length||literal.dataJson('')!==serialized.value){issue(field('serializedValue'),'migration.example.serialized-literal','The serialized JSON has no standard literal that reproduces its exact entity bytes','target-representation');continue;}
   if(data&&migrationValueIdentity(source.doc,pointer+'/dataValue')!==migrationValueIdentity(literal,'')){
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
