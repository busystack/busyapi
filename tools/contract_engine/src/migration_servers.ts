import {modernFamily} from './specification';
import {finiteServerVariableValues,finiteServerUrls} from './server_semantics';
import {resolveUri,type ReferenceGraph} from './reference_graph';
import type {SourcePlan} from './source_plan';
import type {MigrationIssue} from './migration_schema';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {migrationOperationUses} from './migration_operation_contexts';
import {serverTemplate} from './derived_bundle';
import {migrationJoinedPath,type MigrationServerRoute} from './migration_server_routes';

/** 3.0 §4.7.6 sends the declared default even outside its recommended enum.
 * Modern families require membership. Appending only that already permitted
 * value retains every substitution while satisfying the target requirement. */
export function migrateServerVariableDefaults(graph:ReferenceGraph,sources:Map<string,SourcePlan>,from:string,target:string,issue:MigrationIssue):void {
 if(from!=='3.0'||!modernFamily(target))return;
 for(const scope of graph.entryScopes()){
  if(scope.kind!=='server-variable'||scope.family!==from)continue;
  const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
  const choices=finiteServerVariableValues(value);
  if(!choices||!Array.isArray(value.enum)||value.enum.includes(value.default))continue;
  // A shared variable can have several material uses after common ownership.
  // Update only live Server-variable roles; historical/literal copies retain
  // the original authored enum. No second owner table is required.
  const original=scope.pointer+'/enum';let retained=false;
  for(const [resource,source]of sources){
   const locations=resource===scope.resource?source.origins.get(original):source.foreignOrigins.get(scope.resource+'#'+original);
   for(const pointer of [...locations??[]]){
    if(!graph.scopeAs(resource,pointer.slice(0,-5),'server-variable'))continue;
    const node=source.doc.dataNode(pointer);if(node?.kind!=='array')continue;
    retained=true;if(!node.value.includes(value.default))source.set(pointer+'/'+node.children.size,value.default);
   }
  }
  if(!retained)issue({...scope,pointer:original},'migration.server.variable-owner','No captured material Server-variable enum survives common ownership','unavailable-proof');
 }
}

/** Request invariants compare exhaustive effective URL choices when finite.
 * Unbounded templates keep the established template/variable proof instead. */
export function migrationServerSignature(servers:readonly {url:string;base:string;variables:unknown}[]):unknown {
 const finite=servers.map(server=>finiteServerUrls(server,server.base));
 if(finite.every((urls):urls is readonly string[]=>urls!==undefined))return {default:finite[0]?.[0]&&(()=>{const url=new URL(finite[0][0]);url.hash='';return url.href;})(),urls:[...new Set(finite.flat().map(value=>{
  const url=new URL(value);url.hash='';return url.href;
 }))].sort()};
 return servers.map(server=>({url:serverTemplate(server.url,server.base,server.variables),variables:
  Object.entries(server.variables??{}).map(([name,value])=>{
   const choices=finiteServerVariableValues(value);
   return [name,{...Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([field])=>field!=='enum'&&field!=='defaultOutsideEnumAllowed')),
    ...(choices?{enum:[...choices].sort()}: {})}];
  }).sort(([a],[b])=>String(a).localeCompare(String(b)))}));
}

/** Swagger permits protocol alternatives and operation-level schemes, but
 * shares one host/basePath. Prove every substitution and inherited occurrence
 * before writing that representation. Descriptions keep standard doc owners. */
export function downgradeServers(graph:ReferenceGraph,sources:Map<string,SourcePlan>,from:string,
 issue:MigrationIssue,owners:MigrationSchemaOwners,contexts:readonly ReferenceGraph[]):MigrationServerRoute[] {
 const routes:MigrationServerRoute[]=[];
 const retired=new Set<string>(),operations=new Map<string,string>();
 for(const [resource,specification]of graph.specifications){
  if(specification.family!==from)continue;
  const context=contexts.find(context=>context.root===resource)??graph,source=sources.get(resource)!;
  type Field={resource:string;pointer:string};
  const choices=(field:Field|undefined):readonly URL[]|undefined=>{
   const declared=field?context.docs.get(field.resource)!.dataNode(field.pointer)?.value:undefined;
   const servers=declared===undefined||field?.pointer==='/servers'&&Array.isArray(declared)&&!declared.length?[{url:'/'}]:declared;
   const base=context.retrievals.get(field?.resource??resource)!;
   // An explicitly empty local array has no Server choices, rather than
   // inheriting the root. Do not invent a host for that unsupported context.
   if(!Array.isArray(servers)||!servers.length){issue(field??{resource,pointer:'/servers'},'migration.server.empty','No effective Server choices establish a Swagger host','unavailable-proof');return;}
   const urls:URL[]=[];
   for(const [index,server]of servers.entries()){
    const at={resource:field?.resource??resource,pointer:(field?.pointer??'/servers')+'/'+index};
    if(typeof server?.url==='string'&&/\$\$?\{/u.test(server.url)){
     issue({...at,pointer:at.pointer+'/url'},'migration.server.environment-template','This Server also uses execution-environment interpolation; no captured equivalence proof lowers that variable context into Swagger choices','unavailable-proof');return;
    }
    const finite=finiteServerUrls(server,base);
    if(!finite){issue({...at,pointer:at.pointer+'/url'},'migration.server.variable-domain','No exhaustive Server-variable domain establishes a fixed Swagger host and basePath','unavailable-proof');return;}
    for(const value of finite){
     const url=new URL(value);
     const relativeFile=url.protocol==='file:'&&!url.host&&new URL(context.retrievals.get(resource)!).protocol==='file:';
     const compatible=relativeFile||['http:','https:','ws:','wss:'].includes(url.protocol)&&Boolean(url.host);
     if(!compatible||url.search||url.username||url.password){
      issue({...at,pointer:at.pointer+'/url'},'migration.server.url','This effective Server URL has a scheme, authority or query that Swagger host/basePath/schemes cannot express','target-representation');return;
     }
     url.hash='';urls.push(url);
    }
   }
   return urls;
  };
  const rootField=context.docs.get(resource)!.dataNode('/servers')?{resource,pointer:'/servers'}:undefined;
  const sameAuthority=(url:URL,host:string)=>{
   try{return new URL(url.protocol+'//'+host+url.pathname).href===url.href;}catch{return false;}
  };
  const uses=[...migrationOperationUses(context)].filter(use=>use.source.family===from).map(use=>{
   const declaration=context.docs.get(use.source.resource)!.dataNode(use.source.pointer)!;
   const path=use.pathItem&&context.pathItem(use.pathItem);
   const field=declaration.children.has('servers')?{resource:use.source.resource,pointer:use.source.pointer+'/servers'}:path?.fields.get('servers')??rootField;
   return {use,field};
  });
  const rootUsed=uses.some(entry=>entry.field?.resource===rootField?.resource&&entry.field?.pointer===rootField?.pointer);
  const root=rootUsed||!uses.length?choices(rootField):undefined;
  if((rootUsed||!uses.length)&&!root?.length)continue;
  const effective=uses.map(entry=>({...entry,urls:entry.field?.resource===rootField?.resource&&entry.field?.pointer===rootField?.pointer?root:choices(entry.field)}));
  const defaults=rootUsed?root:effective.find(entry=>entry.urls?.length)?.urls??root;
  if(!defaults?.length)continue;
  const fixed=defaults[0],all=effective.length?effective.flatMap(entry=>entry.urls??[]):[...root];
  let host=all.map(url=>url.host).find(host=>all.every(url=>sameAuthority(url,host)));
  if(host===undefined){
   issue({resource,pointer:'/servers'},'migration.server.targets','These Servers select distinct authorities; Swagger shares one host','target-representation');continue;
  }
  if(rootUsed&&root.some(url=>url.pathname!==root[0].pathname)){
   issue({resource,pointer:'/servers'},'migration.server.targets','These root Server alternatives select distinct paths; Swagger cannot retain those choices in one route','target-representation');continue;
  }
  // Retain the original shared base when possible. Otherwise '/' permits the
  // exact Server path to become a literal prefix of each target route.
  const basePath=all.every(url=>url.pathname===fixed.pathname)?fixed.pathname:'/';
  const schemes=(urls:readonly URL[])=>[...new Set(urls.filter(url=>url.protocol!=='file:').map(url=>url.protocol.slice(0,-1)))];
  source.set('/basePath',basePath);
  if(schemes(defaults).length)source.set('/schemes',schemes(defaults));else source.remove('/schemes');
  for(const {use,field,urls}of effective){
   const scope=use.source;if(!urls?.length)continue;
   if(urls.some(url=>url.pathname!==urls[0].pathname)){
    issue(field??scope,'migration.server.operation-path','This operation has Server alternatives requiring different Swagger route keys','target-representation');continue;
   }
   for(const operation of context.operations().filter(operation=>operation.role==='operation'&&operation.source.resource===scope.resource&&operation.source.pointer===scope.pointer&&
    operation.method===use.method&&operation.pathItem.resource===use.pathItem?.resource&&operation.pathItem.pointer===use.pathItem?.pointer)){
    const path=basePath===urls[0].pathname?operation.path:migrationJoinedPath(urls[0].pathname,operation.path);
    routes.push({context,operation,path});
   }
   const signature=JSON.stringify(schemes(urls)),id=scope.resource+'#'+scope.pointer,previous=operations.get(id);
   if(previous!==undefined&&previous!==signature){issue(scope,'migration.server.operation-context','Independent inherited Server choices still require separate operation owners','unavailable-proof');continue;}
   operations.set(id,signature);
   const output=sources.get(scope.resource)!,pointer=output.current(scope.pointer);
   if(pointer!==undefined){if(schemes(urls).length)output.set(pointer+'/schemes',schemes(urls));else output.remove(pointer+'/schemes');}
  }
  if(host)source.set('/host',host);else source.remove('/host');
  for(const scope of context.entryScopes())if(scope.family===from&&scope.kind==='server-array'){
   const id=scope.resource+'#'+scope.pointer;if(retired.has(id))continue;retired.add(id);
   const output=sources.get(scope.resource)!,pointer=output.current(scope.pointer);
   if(pointer!==undefined&&output.doc.dataNode(pointer))owners.retainNativeHistory(scope,output,pointer,'server_choices',context);
  }
 }
 return routes;
}

/** Omitted/empty root Servers mean '/' relative to the API retrieval URI.
 * Materialize that effective default only in the reviewed output copy; a
 * new retrieval directory must not silently choose a different API origin. */
export function retainDefaultServers(graph:ReferenceGraph,sources:Map<string,SourcePlan>):void {
 for(const [resource,specification]of graph.specifications){
  if(specification.family==='2.0')continue;
  const root=graph.docs.get(resource)!.root;
  if(!root.children.has('servers')||Array.isArray(root.value.servers)&&root.value.servers.length===0)
   sources.get(resource)!.set('/servers',[{url:resolveUri('/',graph.retrievals.get(resource)!).href}]);
 }
}
