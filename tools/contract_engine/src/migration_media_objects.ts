import {escape,SourceError} from './document';
import {pointerFragment,type GraphScope,type ReferenceGraph} from './reference_graph';
import type {MigrationLocation,MigrationSource} from './migration_source';
import type {MigrationIssue} from './migration_schema';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {migrationScopes} from './migration_documents';
import {capturedRuntimeMedia} from './runtime_media_owner';
import {mediaTypes} from './media_types';

/** A view of canonical graph uses, not an ownership index. The definition's
 * schema/resource context and the entering native role are both necessary:
 * neither a MIME spelling nor the reusable definition alone identifies a use. */
export type MigrationMediaOccurrence=Readonly<{
 entry:string;use:GraphScope;definition:GraphScope;chain:readonly GraphScope[];
 context:GraphScope;mediaType:string;identity:string;
 schema?:GraphScope;itemSchema?:GraphScope;
 encoding:Readonly<{mode:'positional'|'named'|'default'|'inactive';
  named?:MigrationLocation;prefix?:MigrationLocation;tail?:MigrationLocation}>;
}>;

export function migrationMediaDefinition(graph:ReferenceGraph,use:GraphScope):GraphScope {
 const at=capturedRuntimeMedia(graph)(use).source;
 return graph.scopeAs(at.resource,at.pointer,'media')!;
}

export function migrationMediaOccurrence(graph:ReferenceGraph,use:GraphScope):MigrationMediaOccurrence|undefined {
 if(use.kind==='media'&&/\/content\/[^/]+$/.test(use.pointer)){
  const captured=graph.scopeAs(use.resource,use.pointer,'media');if(!captured||!graph.isEntryUse(captured))return;
  const marker=use.pointer.lastIndexOf('/content/'),parent=use.pointer.slice(0,marker);
  const context=['request-body','response','parameter','header'].map(kind=>graph.scopeAs(use.resource,parent,kind)).find(Boolean);
  if(!context)return;
  const mediaType=use.pointer.slice(marker+9).replaceAll('~1','/').replaceAll('~0','~');
  const definition=migrationMediaDefinition(graph,use),chain=[use];let at=use;
  while(at.resource!==definition.resource||at.pointer!==definition.pointer){
   if(chain.length>=128)throw new SourceError('limit.migration.media-objects','Media occurrence chains exceed their captured bound');
   const edge=graph.referenceAs(at.resource,at.pointer,'$ref','media')!;
   at=graph.scopeAs(edge.targetResource!,edge.targetPointer!,'media')!;chain.push(at);
  }
  const types=mediaTypes(mediaType),value=graph.docs.get(definition.resource)!.dataNode(definition.pointer)?.value;
  const field=(name:string):MigrationLocation|undefined=>value?.[name]===undefined?undefined:{resource:definition.resource,pointer:definition.pointer+'/'+name};
  const named=field('encoding'),prefix=field('prefixEncoding'),tail=field('itemEncoding');
  const multipart=types.every(type=>type.type==='multipart'),form=types.every(type=>type.type==='application'&&type.subtype==='x-www-form-urlencoded');
  const mode=prefix||tail?multipart?'positional':'inactive':named?multipart||form?'named':'inactive':'default';
  const encoding:MigrationMediaOccurrence['encoding']={mode,named,prefix,tail};
  return {entry:graph.root,use,definition,chain,context,mediaType,encoding,
   identity:JSON.stringify([graph.root,use,context,definition,chain,types.map(type=>[type.type,type.subtype,[...type.parameters].sort()]),encoding]),
   schema:graph.scopeAs(definition.resource,definition.pointer+'/schema','schema'),
   itemSchema:graph.scopeAs(definition.resource,definition.pointer+'/itemSchema','schema')};
 }
}

export function* migrationMediaOccurrences(graph:ReferenceGraph):Generator<MigrationMediaOccurrence> {
 let work=0;
 for(const use of graph.entryScopes())if(use.kind==='media'){
  if(++work>200000)throw new SourceError('limit.migration.media-objects','Media occurrences exceed 200000 captured uses');
  const occurrence=migrationMediaOccurrence(graph,use);if(occurrence)yield occurrence;
 }
}

/** Envelope copies have newly generated child uses. Their definitions stay at
 * the canonical material owner, including identified schema resources and
 * nested Encoding Headers. Literal examples are copied by the CST unchanged. */
function referenceMediaChildren(source:MigrationSource,pointer:string,target:MigrationLocation):void {
 const reference=(suffix:string)=>{
  const at=pointer+suffix;if(!source.doc.dataNode(at))return;
  for(const locations of source.originSets())for(const candidate of [...locations])
   if(candidate===at||candidate.startsWith(at+'/'))locations.delete(candidate);
  source.set(at,{$ref:target.resource+pointerFragment(target.pointer+suffix)});
  source.origins.set(at,new Set([at]));source.origins.set(at+'/$ref',new Set([at+'/$ref']));
 };
 for(const name of ['schema','itemSchema'])reference('/'+name);
 for(const name of source.doc.dataNode(pointer+'/examples')?.children.keys()??[])reference('/examples/'+escape(name));
 const headers=(at:string,suffix:string,depth=0):void=>{
  if(depth>=32)throw new SourceError('limit.migration.media-objects','Nested Encoding headers exceed 32 levels');
  for(const name of source.doc.dataNode(at+'/headers')?.children.keys()??[])reference(suffix+'/headers/'+escape(name));
  for(const name of source.doc.dataNode(at+'/encoding')?.children.keys()??[])headers(at+'/encoding/'+escape(name),suffix+'/encoding/'+escape(name),depth+1);
  for(const name of source.doc.dataNode(at+'/prefixEncoding')?.children.keys()??[])headers(at+'/prefixEncoding/'+name,suffix+'/prefixEncoding/'+name,depth+1);
  if(source.doc.dataNode(at+'/itemEncoding'))headers(at+'/itemEncoding',suffix+'/itemEncoding',depth+1);
 };
 headers(pointer,'');
}

/** External definitions otherwise lose their native entering edge when the
 * last Media Type reference materializes. Retain that neutral interpretation
 * in a standard component before rebuilding the graph. Children continue to
 * own their original URI resources; only the envelope acquires this holder. */
function retainMediaDefinition(scope:GraphScope,graphs:readonly ReferenceGraph[],sources:Map<string,MigrationSource>,
 owners:MigrationSchemaOwners,coordinates:(source:MigrationSource,pointer:string)=>void):void {
 if(/^\/components\/mediaTypes\/[^/]+$/.test(scope.pointer)||graphs.some(graph=>migrationMediaOccurrence(graph,scope)))return;
 const contexts=graphs.filter(graph=>{
  const captured=graph.scopeAs(scope.resource,scope.pointer,'media');
  return captured&&graph.isEntryUse(captured)&&JSON.stringify(captured)===JSON.stringify(scope);
 });
 const graph=contexts.filter(graph=>graph.specifications.get(graph.root)?.family==='3.2').sort((a,b)=>a.root.localeCompare(b.root))[0];
 if(!graph)throw new SourceError('migration.media.definition-owner','A reusable Media Type definition has no compatible captured entry holder');
 const retained=owners.roleOwners(scope);
 if(retained.length>1)throw new SourceError('migration.owners.ambiguous-use','The neutral Media Type definition needs one captured material owner');
 let destination=retained[0]?.location;
 if(!destination){
  const input=owners.uniqueLocation(scope),output=sources.get(graph.root)!;
  destination=owners.allocate(output,'/components/mediaTypes','media_definition',JSON.stringify([scope,graph.root]));
  owners.admit(output,8);output.copy(input.source.fork(),input.location.pointer,destination.pointer,true);
  referenceMediaChildren(output,destination.pointer,input.location);
  coordinates(output,destination.pointer);
  owners.rememberRole(scope,destination,scope);output.presentationChanges.push(destination.pointer);
 }
 for(const context of contexts)owners.rememberEntry(context.root,scope,destination);
}

/** Aggregate inventory for reference chains. Certificates use the individual
 * occurrence view above; CST copy provenance is never a media applicability
 * edge after references have been materialized. */
export function migrationMediaTypes(graphs:readonly ReferenceGraph[]):ReadonlyMap<string,ReadonlySet<string>> {
 const result=new Map<string,Set<string>>();let work=0;
 for(const graph of graphs){
  const capture=capturedRuntimeMedia(graph);
  for(const scope of graph.entryScopes())if(scope.kind==='media'&&/\/content\/[^/]+$/.test(scope.pointer)){
   if(++work>200000)throw new SourceError('limit.migration.media-objects','Media format ownership exceeds 200000 captured uses');
   const name=scope.pointer.slice(scope.pointer.lastIndexOf('/')+1).replaceAll('~1','/').replaceAll('~0','~');
   // Every alias in the captured chain owns this occurrence's media context,
   // including definitions whose only consumers live in a different entry.
   const terminal=capture(scope).source,chain=[scope];let at=scope;
   while(at.resource!==terminal.resource||at.pointer!==terminal.pointer){
    if(++work>200000||chain.length>=128)throw new SourceError('limit.migration.media-objects','Media format ownership exceeds its captured reference bound');
    const edge=graph.referenceAs(at.resource,at.pointer,'$ref','media')!;
    at=graph.scopeAs(edge.targetResource!,edge.targetPointer!,'media')!;chain.push(at);
   }
   for(const at of chain){
    const key=JSON.stringify([at.resource,at.pointer]),types=result.get(key)??new Set<string>();types.add(name);result.set(key,types);
   }
  }
 }
 return result;
}

/** Only 3.2 Media Type slots accept Reference Objects. Materialize those
 * envelopes while keeping their schemas, Examples and Headers independently
 * referenced. Copying identified schemas into every use would duplicate URI
 * resources and turn independent consumers into aliases of new identities. */
export function materializeMediaReferences(graphs:readonly ReferenceGraph[],sources:Map<string,MigrationSource>,
 families:readonly string[],target:string,owners:MigrationSchemaOwners,issue:MigrationIssue):boolean {
 if(target==='3.2'||!families.includes('3.2'))return false;
 const captured=new Map([...sources].map(([id,source])=>[id,source.fork()]));let changed=false,work=0,fieldWork=0;
 const coordinates=(source:MigrationSource,pointer:string)=>{
  source.doc.dataJson(pointer,(_node,at)=>{
   if(++fieldWork>200000)throw new SourceError('limit.migration.media-objects','Media occurrence provenance exceeds 200000 captured fields');
   if(!source.origins.has(at))source.origins.set(at,new Set([at]));return undefined;
  });
 };
 const contexts:{source:MigrationSource;pointer:string;aliases:GraphScope[]}[]=[];
 for(const scope of migrationScopes(graphs)){
  if(scope.family!=='3.2'||scope.kind!=='media')continue;
  const graph=graphs.find(graph=>graph.scopeAs(scope.resource,scope.pointer,'media')?.family==='3.2')!;
  if(!graph.referenceAs(scope.resource,scope.pointer,'$ref','media'))continue;
  let terminal:GraphScope|undefined=scope;const seen=new Set<string>(),chain:GraphScope[]=[];
  while(terminal){
   if(++work>50000)throw new SourceError('limit.migration.media-objects','Media reference materialization exceeds 50000 captured states');
   const key=terminal.resource+'#'+terminal.pointer;
   if(seen.has(key)||seen.size>=128){terminal=undefined;break;}seen.add(key);chain.push(terminal);
   const ref=graph.referenceAs(terminal.resource,terminal.pointer,'$ref','media');if(!ref)break;
   terminal=ref.resolution==='resolved'?graph.scopeAs(ref.targetResource!,ref.targetPointer!,'media'):undefined;
  }
  if(!terminal){issue(scope,'migration.media.reference','No bounded concrete Media Type Object terminates this reference chain','source-incomplete');continue;}
  retainMediaDefinition(terminal,graphs,sources,owners,coordinates);
  const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);
  if(pointer===undefined){issue(scope,'migration.media.owner','The captured media use has no surviving material owner','unavailable-proof');continue;}
  const input=captured.get(terminal.resource)!,from=input.current(terminal.pointer);
  if(from===undefined){issue(terminal,'migration.media.owner','The captured media definition has no surviving material owner','unavailable-proof');continue;}
  owners.retainNativeHistory(scope,source,pointer,'media_reference',graph);
  // The alias retains its own identity; the historical Reference Object's
  // root is not an additional live Media Type target.
  for(const output of sources.values()){
   const locations=scope.resource===output.original.id?output.origins.get(scope.pointer):output.foreignOrigins.get(scope.resource+'#'+scope.pointer);
   locations?.clear();
  }
  owners.admit(source,8);source.copy(input,from,pointer,true);
  referenceMediaChildren(source,pointer,terminal);
  // The terminal envelope keeps its canonical owner. In particular an
  // independently referenced content entry must not inherit this consumer's
  // media interpretation through root copy provenance. Child/literal field
  // provenance remains available for ordinary reference and exact-data repair.
  for(const locations of source.originSets())locations.delete(pointer);
  // The copied envelope is a new semantic occurrence. Its local Encoding
  // fields need conversion coordinates as well as their original provenance.
  // Child definitions above remain neutral references, so no schema identity
  // is duplicated and no literal $ref is interpreted as a graph connection.
  coordinates(source,pointer);
  const origins=source.original.id===scope.resource?source.origins:source.foreignOrigins;
  origins.set(source.original.id===scope.resource?scope.pointer:scope.resource+'#'+scope.pointer,new Set([pointer]));
  retainMediaDefinition(scope,graphs,sources,owners,coordinates);
  contexts.push({source,pointer,aliases:chain.slice(1,-1)});
  changed=true;
 }
 // Intermediate aliases were not copied as definitions. Bind their envelope
 // provenance to each actual material occurrence after all Reference Objects
 // have retired, so retiring an alias's own old root cannot erase its uses.
 // Children keep their canonical targets and do not acquire alias identities.
 for(const {source,pointer,aliases}of contexts)for(const alias of aliases){
  if(++work>50000)throw new SourceError('limit.migration.media-objects','Media alias context retention exceeds 50000 captured states');
  // A content entry is already an independently selected occurrence, even
  // when another entry happens to use it as a forwarding alias.
  if(/\/content\/[^/]+$/.test(alias.pointer))continue;
  const input=captured.get(alias.resource)!,from=input.current(alias.pointer);
  if(from===undefined){issue(alias,'migration.media.owner','The captured media alias has no surviving material owner','unavailable-proof');continue;}
  source.associate(input,from,pointer);
 }
 return changed;
}

/** A reusable Media Type remains a native object in an unused Response content
 * slot when the target has no mediaTypes component map. All actual consumers
 * above retain their own media keys; the holder adds no executable response. */
export function relocateMediaComponents(graphs:readonly ReferenceGraph[],sources:Map<string,MigrationSource>,
 families:readonly string[],target:string,owners:MigrationSchemaOwners):void {
 if(!['3.0','3.1'].includes(target))return;
 const mediaTypes=migrationMediaTypes(graphs);
 for(const scope of migrationScopes(graphs))if(scope.kind==='media'&&families.includes(scope.family)&&
  /^\/components\/mediaTypes\/[^/]+$/.test(scope.pointer)){
  const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);if(pointer===undefined||!source.doc.dataNode(pointer))continue;
  const destination=owners.allocate(source,'/components/responses','media_type',JSON.stringify([scope.resource,scope.pointer]));
  const types=[...mediaTypes.get(JSON.stringify([scope.resource,scope.pointer]))??[]].sort();
  // The fallback is storage syntax for an entirely inactive, unbound object.
  // It supplies no evidence of an authored codec. Bound definitions retain
  // every actual key, so a later downgrade never substitutes this placeholder
  // for their request/response/Parameter/Header media contexts.
  if(!types.length)types.push('application/octet-stream');
  owners.admit(source,4);source.set(destination.pointer,{description:'',content:{}});
  const canonical=destination.pointer+'/content/'+escape(types[0]);source.move(pointer,canonical);
  const captured=source.fork();
  for(const type of types.slice(1)){
   owners.admit(source,8);const at=destination.pointer+'/content/'+escape(type);
   source.copy(captured,canonical,at,true);referenceMediaChildren(source,at,{resource:source.doc.id,pointer:canonical});
  }
  source.presentationChanges.push(destination.pointer);
 }
 for(const [resource,source]of sources)if(graphs.some(graph=>families.includes(graph.specifications.get(resource)?.family??''))&&
  source.doc.dataNode('/components/mediaTypes')?.children.size===0)source.remove('/components/mediaTypes');
}
