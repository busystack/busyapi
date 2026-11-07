import {SourceError} from './document';
import type {ReferenceGraph} from './reference_graph';
import {migrationReferences,migrationScopes} from './migration_documents';
import {migrationMediaTypes} from './migration_media_objects';
import type {MigrationIssue} from './migration_schema';

/** Check the selected final target before introducing intermediate holders.
 * Swagger 6.4.1/5/6 admits Path Items only at endpoint keys or through their
 * $ref targets. Its reusable definitions (6.4.20–23) provide no inactive Path
 * Item category. A detached fragment without a typed entering edge is data,
 * not a native owner. Schema annotations cannot supply that missing role.
 *
 * A Media Type without a content-key occurrence is likewise unbound: Swagger
 * has neither that object nor its Reference Object slots. Response.examples
 * requires actual MIME keys; choosing a holder's placeholder would invent a
 * representation. Retaining just its schema would lose the independent media
 * envelope and the applicability of its examples/encoding instructions. */
export function checkReusableSwaggerTargets(graphs:readonly ReferenceGraph[],target:string,issue:MigrationIssue):void {
 if(target!=='2.0')return;
 const key=(at:{resource:string;pointer:string})=>JSON.stringify([at.resource,at.pointer]);
 const edges=new Map<string,Set<string>>();
 for(const edge of migrationReferences(graphs))if(edge.kind==='path-item'&&!edge.connection&&edge.resolution==='resolved'){
  const id=key(edge),next=edges.get(id)??new Set<string>();
  next.add(key({resource:edge.targetResource!,pointer:edge.targetPointer!}));edges.set(id,next);
 }
 const scopes=[...migrationScopes(graphs)],reachable=new Set<string>();
 const pending=scopes.filter(scope=>scope.kind==='path-item'&&/^\/paths\/[^/]+$/.test(scope.pointer)).map(key);
 for(let index=0;index<pending.length;index++){
  if(index>=200000)throw new SourceError('limit.migration.media-objects','Reusable target reachability exceeds 200000 captured states');
  const id=pending[index];if(reachable.has(id))continue;reachable.add(id);
  pending.push(...edges.get(id)??[]);
 }
 const media=migrationMediaTypes(graphs);
 for(const scope of scopes){
  if(scope.kind==='path-item'&&/^\/components\/pathItems\/[^/]+$/.test(scope.pointer)&&!reachable.has(key(scope)))
   issue(scope,'migration.path-item.unused-owner',
    'Swagger has no standard inactive reusable Path Item container. This definition is not reached from a captured Paths entry; detached data, a Schema annotation, an invented route or a Callback cannot preserve its native ownership',
    'target-representation');
  if(scope.kind==='media'&&/^\/components\/mediaTypes\/[^/]+$/.test(scope.pointer)&&!media.has(key(scope)))
   issue(scope,'migration.media.unbound-owner',
    'Swagger has no independent reusable Media Type Object or Media Type reference slot. This definition has no captured content-key occurrence; a Response example would require an invented MIME key and a Schema alone would lose the native media envelope',
    'target-representation');
 }
}
