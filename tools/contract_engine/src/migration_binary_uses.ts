import {children} from './contexts';
import {escape,SourceError} from './document';
import {pointerFragment,type GraphScope,type ReferenceGraph} from './reference_graph';
import {modernFamily} from './specification';
import {BinaryUses,rawBinaryUse} from './migration_binary';
import {MigrationSource,type MigrationLocation} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {entryComponentContainer} from './migration_schema_uses';

const key=(at:MigrationLocation)=>JSON.stringify([at.resource,at.pointer]);

/** OAS 3.1.2 §4.4.2.1 removes the string/binary pair only at raw
 * occurrences. A shared JSON consumer retains its string model. Specialize
 * captured static forwarding chains through the existing material allocator,
 * leaving every neutral definition and unrelated incoming consumer intact. */
export function specializeBinarySchemaUses(graphs:readonly ReferenceGraph[],sources:ReadonlyMap<string,MigrationSource>,
    families:readonly string[],target:string,owners:MigrationSchemaOwners):ReadonlyMap<string,readonly MigrationLocation[]> {
    const provenance=new Map<string,MigrationLocation[]>();
    if(!families.includes('3.0')||!modernFamily(target))return provenance;
    const pristine=new Map([...sources].map(([id,source])=>[id,source.fork()]));
    const prepared=new Map<string,MigrationLocation>(),repaired=new Set<string>();let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.binary','Binary use specialization exceeds its bounded graph work');};
    for(const graph of [...graphs].sort((a,b)=>a.root.localeCompare(b.root))){
        const uses=new BinaryUses(graph,graphs),incoming=new Set(graph.entryReferences().filter(reference=>
            reference.kind==='schema'&&reference.resolution==='resolved').map(reference=>key({resource:reference.targetResource!,pointer:reference.targetPointer!})));
        for(const scope of graph.entryScopes()){
            inspect();if(scope.kind!=='schema'||scope.family!=='3.0')continue;
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(value?.type!=='string'||value.format!=='binary'||typeof value.$ref==='string')continue;
            const contexts=uses.inspect(scope),raw=contexts.filter(rawBinaryUse);
            if(!raw.length||raw.length===contexts.length)continue;
            for(const use of raw){
                inspect();
                // A shared occurrence or a multipart instance path requires
                // a further containing-object split. Keep that existing
                // located blocker until its own captured owner is available.
                if(use.path.length||key(use.schema)===key(scope)||incoming.has(key(use.schema))||
                    !uses.rawCompatible(use,'3.0')||repaired.has(key(use.schema)))continue;
                const chain:GraphScope[]=[];let at=use.schema;const seen=new Set<string>();
                for(let depth=0;depth<128;depth++){
                    inspect();if(seen.has(key(at)))break;seen.add(key(at));
                    const data=graph.docs.get(at.resource)!.dataNode(at.pointer)?.value;
                    if(at.family!=='3.0'||!data||typeof data!=='object'||Object.keys(data).length!==1||typeof data.$ref!=='string')break;
                    const reference=graph.referenceAs(at.resource,at.pointer,'$ref','schema');
                    const next=reference?.resolution==='resolved'&&graph.scopeAs(reference.targetResource!,reference.targetPointer!,'schema');
                    if(!next)break;
                    chain.push(next);at=next;
                    if(key(at)===key(scope))break;
                }
                if(!chain.length||key(at)!==key(scope))continue;
                const container=entryComponentContainer(graph,scope,graph.root,owners);
                if(!container)continue;
                let destination:MigrationLocation|undefined;
                for(const member of [...chain].reverse()){
                    const identity=JSON.stringify([graph.root,member.resource,member.pointer,'raw']),known=prepared.get(identity);
                    if(known){destination=known;continue;}
                    const copied=owners.separate(member,'binary_use',{container,layout:'array-item',captured:pristine.get(member.resource),identity});
                    for(const [pointer,location]of copied.provenance){
                        inspect();const id=key({resource:member.resource,pointer}),locations=provenance.get(id)??[];
                        locations.push(location);provenance.set(id,locations);
                    }
                    const pending=[member],visited=new Set<string>();
                    for(let index=0;index<pending.length;index++){
                        inspect();const child=pending[index],id=JSON.stringify([child.resource,child.pointer,child.kind]);
                        if(visited.has(id))continue;visited.add(id);
                        owners.rememberAdditionalUse(graph.root,child,{resource:copied.location.resource,
                            pointer:copied.location.pointer+child.pointer.slice(member.pointer.length)});
                        const data=graph.docs.get(child.resource)!.dataNode(child.pointer)?.value;
                        if(graph.referenceObject(data,child))continue;
                        for(const [name,,kind]of children(data,child.kind,child.family)){
                            const next=graph.scopeAs(child.resource,child.pointer+'/'+escape(name),kind);if(next)pending.push(next);
                        }
                    }
                    if(destination){const source=sources.get(copied.location.resource)!;owners.admit(source);
                        source.set(copied.location.pointer+'/$ref',destination.resource+pointerFragment(destination.pointer));}
                    destination=copied.location;prepared.set(identity,destination);
                }
                const source=sources.get(use.schema.resource)!,pointer=source.current(use.schema.pointer);
                if(pointer===undefined)throw new SourceError('migration.binary.owner','The raw occurrence has no surviving captured reference owner');
                owners.admit(source);source.set(pointer+'/$ref',destination!.resource+pointerFragment(destination!.pointer));
                repaired.add(key(use.schema));
            }
        }
    }
    return provenance;
}
