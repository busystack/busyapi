import {escape,SourceError} from './document';
import type {ReferenceGraph,OperationOccurrence} from './reference_graph';
import type {MigrationIssue} from './migration_schema';
import {sourceValueIdentity,type SourcePlan,type SourceLocation} from './source_plan';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {ParameterSemantics} from './parameter_semantics';

export type MigrationServerRoute={context:ReferenceGraph;operation:OperationOccurrence;path:string};
/** The request assembler appends paths; it does not resolve a route as a URI
 * reference (which would discard the Server path for a leading slash). */
export function migrationJoinedPath(base:string,path:string):string {
 return !base||base==='/'?path:(base.endsWith('/')?base.slice(0,-1):base)+path;
}

/** Validate the complete destination inventory before any CST owner moves.
 * Templated routes with different parameter names cannot share a Swagger key,
 * even when the methods differ. No decoded value becomes an authored key. */
export function checkMigrationServerRoutes(routes:readonly MigrationServerRoute[],issue:MigrationIssue):boolean {
 let valid=true,work=0;
 const literal=(path:string)=>path.split(/(\{[^{}]+\})/gu).map(part=>/^\{[^{}]+\}$/u.test(part)?part:part.replace(/%[0-9a-f]{2}/giu,part=>{
  const char=String.fromCharCode(parseInt(part.slice(1),16));return /[A-Za-z0-9_.~-]/u.test(char)?char:part.toUpperCase();
 }).replace(/[^\x21-\x7e]/gu,char=>encodeURIComponent(char))).join('');
 for(let index=0;index<routes.length;index++)for(const previous of routes.slice(0,index)){
  if(++work>2000000)throw new SourceError('limit.migration.routes','Route collision proof exceeds 2000000 pairs');
  const route=routes[index];if(route.context.root!==previous.context.root||
      route.path===route.operation.path&&previous.path===previous.operation.path)continue;
  const a=literal(route.path),b=literal(previous.path),shape=(path:string)=>path.replace(/\{[^{}]+\}/gu,'{}');
  const identical=a===b,templates=shape(a)===shape(b),sameMethod=route.operation.method===previous.operation.method;
  const overlaps=(first:string,last:string)=>{
   const tokens=(part:string)=>part.split(/(\{[^{}]+\})/gu).flatMap(token=>/^\{[^{}]+\}$/u.test(token)?[null]:[...token]);
   const x=tokens(first),y=tokens(last),pending:[number,number][]=[[0,0]],seen=new Set<string>();
   while(pending.length){
    if(++work>2000000)throw new SourceError('limit.migration.routes','Template overlap proof exceeds 2000000 states');
    const [i,j]=pending.pop()!,id=i+':'+j;if(seen.has(id))continue;seen.add(id);
    if(i===x.length&&j===y.length)return true;
    if(i<x.length&&x[i]===null)pending.push([i+1,j]);
    if(j<y.length&&y[j]===null)pending.push([i,j+1]);
    if(i<x.length&&j<y.length&&(x[i]===null||y[j]===null||x[i]===y[j]))pending.push([i+(x[i]===null?0:1),j+(y[j]===null?0:1)]);
   }
   return false;
  };
  const left=a.split('/'),right=b.split('/');
  const ambiguous=left.length===right.length&&left.every((part,index)=>overlaps(part,right[index]));
  // Concrete paths have defined precedence. Crossing template routes do not.
  const crossed=ambiguous&&a.includes('{')&&b.includes('{')&&!templates;
  if(identical&&sameMethod||!identical&&templates||crossed){
   valid=false;issue(route.operation.source,'migration.server.route-collision',
    'Server relocation makes '+route.operation.method.toUpperCase()+' '+route.path+' conflict with '+previous.operation.method.toUpperCase()+' '+previous.path,
    'target-representation');
  }
 }
 return valid;
}

/** Split effective Path Items after object conversion. The common allocator
 * keeps referenced Path Items as neutral native fragments; executable copies
 * carry the original operation/child provenance. Parameter inheritance is
 * bound locally before methods from different Path Items can meet. */
export function relocateMigrationServerRoutes(routes:readonly MigrationServerRoute[],sources:Map<string,SourcePlan>,
 owners:MigrationSchemaOwners,issue:MigrationIssue,contexts:readonly ReferenceGraph[]):Map<string,SourceLocation> {
 const references=new Map<string,SourceLocation>();
 if(!checkMigrationServerRoutes(routes,issue))return references;
 const changed=new Set(routes.filter(route=>route.path!==route.operation.path).map(route=>JSON.stringify([
  route.context.root,route.operation.pathItem.resource,route.operation.pathItem.pointer])));
 if(!changed.size)return references;
 // A destination may already contain another method. Rebuild that Path Item
 // too, so its inherited parameters cannot leak into an incoming operation.
 let expanded=true;
 while(expanded){
  expanded=false;
  const destinations=new Set(routes.filter(route=>changed.has(JSON.stringify([route.context.root,route.operation.pathItem.resource,route.operation.pathItem.pointer])))
   .map(route=>JSON.stringify([route.context.root,route.path])));
  for(const route of routes){
   const id=JSON.stringify([route.context.root,route.operation.pathItem.resource,route.operation.pathItem.pointer]);
   if(destinations.has(JSON.stringify([route.context.root,route.operation.path]))&&!changed.has(id)){changed.add(id);expanded=true;}
  }
 }
 const captured=new Map([...sources].map(([id,source])=>[id,source.fork()]));
 const groups=new Map<string,MigrationServerRoute[]>();
 for(const route of routes){
  const id=JSON.stringify([route.context.root,route.operation.pathItem.resource,route.operation.pathItem.pointer]);
  if(!changed.has(id))continue;const values=groups.get(id)??[];values.push(route);groups.set(id,values);
 }
 // A whole Path Item with an unoccupied target needs only a CST key move.
 // This retains aliases, reference envelopes, parameters and entry trivia.
 for(const [id,group]of [...groups]){
  const {context,operation,path}=group[0],output=sources.get(context.root)!;
  const target='/paths/'+escape(path),at=output.current(operation.pathItem.pointer);
  if(group.every(route=>route.path===path)&&path!==operation.path&&!output.doc.dataNode(target)&&
      routes.filter(route=>route.context.root===context.root&&route.path===path).length===group.length&&at!==undefined){
   owners.admit(output);output.rename(at,path);groups.delete(id);
  }
 }
 // Vacate source keys first, including keys another operation will acquire.
 for(const group of groups.values()){
  const {context,operation}=group[0],item=operation.pathItem;
  if(item.resource!==context.root||!item.pointer.startsWith('/paths/')){
   issue(item,'migration.server.route-owner','The executable route has no captured entry Path Item owner','unavailable-proof');continue;
  }
  const source=sources.get(item.resource)!,pointer=source.current(item.pointer);
  if(pointer===undefined)throw new SourceError('migration.server.route-owner','A captured route lost its material Path Item');
  const incoming=contexts.flatMap(context=>context.entryReferences()).filter(edge=>edge.resolution==='resolved'&&edge.targetResource===item.resource)
   .map(edge=>({edge,at:source.current(edge.targetPointer!)})).filter(({at})=>at!==undefined&&(at===pointer||at.startsWith(pointer+'/')));
  if(incoming.length){
   const holder=owners.move(context.scopeAs(item.resource,item.pointer,'path-item')!,source,pointer,'server_route');
   // Child schemas/bodies may already have moved inside the converted Path
   // Item. Repair their terminal material coordinates, never authored suffixes.
   for(const {edge,at}of incoming)references.set(edge.resource+'#'+edge.pointer,{
    resource:holder.resource,pointer:holder.pointer+at!.slice(pointer.length)});
  }else source.remove(pointer,true,true,true);
 }
 for(const group of groups.values())for(const route of group){
  const {context,operation,path}=route,item=operation.pathItem,output=sources.get(context.root)!;
  const target='/paths/'+escape(path),destination=target+'/'+escape(operation.method),view=context.pathItem(item);
  output.ensure(target);
  const itemSource=captured.get(item.resource)!,originalItem=itemSource.current(item.pointer);
  if(originalItem!==undefined)output.associate(itemSource,originalItem,target);
  for(const [name,field]of view.fields){
   if(field.kind==='operation'||field.kind==='operation-map'||name==='servers'||name==='parameters'||name==='$ref'||name==='summary'||name==='description')continue;
   const source=captured.get(field.resource)!,pointer=source.current(field.pointer);if(pointer===undefined)continue;
   const to=target+'/'+escape(name),existing=output.doc.dataNode(to);
   if(existing){if(sourceValueIdentity(output.doc,to)!==sourceValueIdentity(source.doc,pointer))
    issue(field,'migration.server.route-metadata','Relocated methods require conflicting Path Item metadata at '+path,'target-representation');}
   else {owners.admit(output);output.copy(source,pointer,to,true);}
  }
  const source=captured.get(operation.source.resource)!,pointer=source.current(operation.source.pointer);
  if(pointer===undefined)throw new SourceError('migration.server.route-operation','A relocated operation lost its converted material owner');
  if(output.doc.dataNode(destination)){issue(operation.source,'migration.server.route-collision','A relocated method already occupies '+path,'target-representation');continue;}
  owners.admit(output,4);output.copy(source,pointer,destination,true);
  // Copy only unoverridden inherited parameters, using the canonical visible
  // parameter inventory. Converted bodies already live in local parameters.
  const parameters=new ParameterSemantics(context).operation(operation.source.resource,operation.source.pointer,item).visible;
  for(const parameter of parameters){
   if(parameter.source.resource===operation.source.resource&&parameter.source.pointer.startsWith(operation.source.pointer+'/parameters/'))continue;
   const holder=captured.get(parameter.source.resource)!,at=holder.current(parameter.source.pointer);if(at===undefined)continue;
   const list=destination+'/parameters';if(!output.doc.dataNode(list))output.set(list,[]);
   output.copy(holder,at,list+'/'+output.doc.dataNode(list)!.children.size,true);
  }
 }
 return references;
}
