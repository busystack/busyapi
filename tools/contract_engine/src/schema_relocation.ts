import {SourceError,type Range} from './document';
import type {GraphScope,GraphTarget,ReferenceGraph} from './reference_graph';

export type SchemaLocation=Pick<GraphTarget,'resource'|'pointer'>;
export type SchemaRelocation=(location:SchemaLocation)=>SchemaLocation;
const key=(location:SchemaLocation)=>JSON.stringify([location.resource,location.pointer]);
const resource=(scope:GraphScope):SchemaLocation=>({resource:scope.resource,pointer:scope.resourcePointer});

/** An empty resource pointer also names an independently interpreted schema
 * file root, possibly with its own $id or dialect. It does not necessarily
 * mean the anonymous document context of a native OpenAPI schema position. */
export function establishedSchemaResource(graph:ReferenceGraph,scope:GraphScope):boolean {
 if(!['3.1','3.2'].includes(scope.family))return false;
 const root=graph.scopeAs(scope.resource,scope.resourcePointer,'schema');
 return root?.base===scope.base&&root.resourcePointer===scope.resourcePointer;
}

/** A sufficient dynamic-scope proof, using the captured graph's intrinsic
 * schema parents and reference edges. Navigation candidates alone say nothing
 * about the order in which resource bindings enter evaluation scope.
 *
 * Relocation must preserve every evaluation edge and relevant resource binding,
 * modulo generated reference-only bridges. An anonymous frame without bindings may
 * change retrieval base; a bridge may introduce a resource only if it has no
 * binding for any dynamically used anchor name. These frames are unobservable
 * to dynamic lookup. This is a
 * graph isomorphism proof for all captured walks (including recursion), not
 * enumeration of a few instances or possible navigation targets.
 *
 * Applicator containment is deliberately over-approximated by all intrinsic
 * parents, including $defs. Unmatched/overlapping interpretations stay blocked
 * by the graph owner; this helper does not resolve references or acquire data.
 */
export function assertDynamicRelocation(before:ReferenceGraph,after:ReferenceGraph,relocate:SchemaRelocation,
 bridges:readonly SchemaLocation[]=[]):void {
 const dynamic=before.references.filter(reference=>reference.dynamic);
 if(!dynamic.length)return;
 const witness=dynamic[0],pointer=witness.pointer+'/'+witness.keyword;
 const range:Range=before.docs.get(witness.resource)!.dataNode(pointer)?.range??[0,0];
 const fail=()=>{throw new SourceError('refactor.schema.dynamic-scope',
  'Dynamic evaluation-scope equivalence is not established: retain the resource boundary or choose a relocation with identical schema evaluation edges and anchor bindings',
  range,'unsupported',{resource:witness.resource,pointer,range});};
 const names=new Set(dynamic.map(reference=>reference.dynamic!.anchor));
 const beforeScopes=before.scopesFor('schema'),afterScopes=after.scopesFor('schema');
 const bindings=(graph:ReferenceGraph,scopes:GraphScope[],map:SchemaRelocation)=>{
  const result=new Map<string,Set<string>>();
  for(const scope of scopes){
   const anchor=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value?.$dynamicAnchor;
   if(typeof anchor!=='string'||!names.has(anchor))continue;
   const owner=key(map(resource(scope))),entries=result.get(owner)??new Set<string>();
   entries.add(JSON.stringify([anchor,key(map(scope)),scope.base]));result.set(owner,entries);
  }
  return result;
 };
 const identity:SchemaRelocation=location=>location;
 const oldBindings=bindings(before,beforeScopes,relocate),newBindings=bindings(after,afterScopes,identity);
 const signature=(values:Set<string>|undefined)=>JSON.stringify([...(values??[])].sort());
 const oldSignatures=new Map([...oldBindings].map(([owner,entries])=>[owner,signature(entries)]));
 const newSignatures=new Map([...newBindings].map(([owner,entries])=>[owner,signature(entries)]));
 const known=new Set<string>();
 for(const scope of beforeScopes){
  const next=after.scopeAs(relocate(scope).resource,relocate(scope).pointer,'schema');
  if(!next||next.dialect!==scope.dialect||next.family!==scope.family)fail();
  const oldResource=key(relocate(resource(scope))),nextResource=key(resource(next!));
  if(oldResource!==nextResource&&(oldBindings.get(oldResource)?.size||newBindings.get(nextResource)?.size))fail();
  if(oldSignatures.get(key(relocate(resource(scope))))!==newSignatures.get(key(resource(next!))))fail();
  known.add(key(relocate(scope)));
 }
 const forwarding=new Map<string,SchemaLocation>();
 for(const bridge of bridges){
  const scope=after.scopeAs(bridge.resource,bridge.pointer,'schema');
  if(!scope)continue;
  const value=after.docs.get(bridge.resource)!.dataNode(bridge.pointer)?.value;
  const edge=after.referenceAs(bridge.resource,bridge.pointer,'$ref','schema');
  if(!edge||edge.resolution!=='resolved'||!value||Object.keys(value).length!==1)fail();
  const target=after.scopeAs(edge!.targetResource!,edge!.targetPointer!,'schema');
  if(!target)fail();
  if(key(resource(scope))!==key(resource(target!))&&newBindings.get(key(resource(scope)))?.size)fail();
  forwarding.set(key(bridge),{resource:edge!.targetResource!,pointer:edge!.targetPointer!});
 }
 const normalize=(location:SchemaLocation)=>forwarding.get(key(location))??location;
 const edges=(graph:ReferenceGraph,map:SchemaRelocation,forward:boolean)=>{
  const result=new Set<string>();let work=0;
  const add=(from:SchemaLocation,to:SchemaLocation,kind:string)=>{
   if(++work>2000000)throw new SourceError('limit.refactor.dynamic-scope','Dynamic evaluation-scope proof exceeds its bounded edge budget');
   if(forward&&forwarding.has(key(from)))return;
   const source=map(from),target=map(forward?normalize(to):to);
   if(known.has(key(source)))result.add(JSON.stringify([key(source),kind,key(target)]));
  };
  for(const scope of graph.scopesFor('schema'))for(const parent of graph.schemaParentsOf(scope))add(parent,scope,'applicator');
  for(const reference of graph.references)if(reference.kind==='schema'&&!reference.connection)
   add(reference,{resource:reference.targetResource!,pointer:reference.targetPointer!},reference.keyword+':'+(reference.dynamic?.anchor??'static'));
  return signature(result);
 };
 if(edges(before,relocate,false)!==edges(after,identity,true))fail();
}
