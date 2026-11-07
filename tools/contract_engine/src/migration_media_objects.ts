import {escape,SourceError} from './document';
import {pointerFragment,type GraphScope,type ReferenceGraph} from './reference_graph';
import type {MigrationLocation,MigrationSource} from './migration_source';
import type {MigrationIssue} from './migration_schema';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {migrationScopes} from './migration_documents';
import {capturedRuntimeMedia} from './runtime_media_owner';

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

export function migrationMediaTypes(graphs:readonly ReferenceGraph[],sources?:ReadonlyMap<string,MigrationSource>):ReadonlyMap<string,ReadonlySet<string>> {
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
 // Materialized envelopes no longer have Media Type $ref edges. Their common
 // CST provenance still binds the neutral definition to every captured use.
 if(sources)for(const scope of migrationScopes(graphs))if(scope.kind==='media'){
  const key=JSON.stringify([scope.resource,scope.pointer]),types=new Set(result.get(key));
  for(const source of sources.values()){
   const locations=scope.resource===source.original.id?source.origins.get(scope.pointer):source.foreignOrigins.get(scope.resource+'#'+scope.pointer);
   for(const pointer of locations??[]){
    if(++work>200000)throw new SourceError('limit.migration.media-objects','Media material ownership exceeds 200000 captured uses');
    for(const type of result.get(JSON.stringify([source.doc.id,pointer]))??[])types.add(type);
   }
  }
  if(types.size)result.set(key,types);
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
 const captured=new Map([...sources].map(([id,source])=>[id,source.fork()]));let changed=false,work=0;
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
  const origins=source.original.id===scope.resource?source.origins:source.foreignOrigins;
  origins.set(source.original.id===scope.resource?scope.pointer:scope.resource+'#'+scope.pointer,new Set([pointer]));
  contexts.push({source,pointer,aliases:chain.slice(1,-1)});
  changed=true;
 }
 // Intermediate aliases were not copied as definitions. Bind their envelope
 // provenance to each actual material occurrence after all Reference Objects
 // have retired, so retiring an alias's own old root cannot erase its uses.
 // Children keep their canonical targets and do not acquire alias identities.
 for(const {source,pointer,aliases}of contexts)for(const alias of aliases){
  if(++work>50000)throw new SourceError('limit.migration.media-objects','Media alias context retention exceeds 50000 captured states');
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
 const mediaTypes=migrationMediaTypes(graphs,sources);
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
