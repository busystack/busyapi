import {children} from './contexts';
import {escape,SourceError} from './document';
import {pointerFragment,schemaResourceContextIdentity,type GraphScope,type ReferenceGraph} from './reference_graph';
import {modernFamily} from './specification';
import {BinaryUses,rawBinaryUse,binaryUseRepresentation} from './migration_binary';
import {MigrationSource,type MigrationLocation} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {entryComponentContainer} from './migration_schema_uses';
import {specializeBinaryContainers,type BinaryContainerUse} from './migration_binary_containers';

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
    const prepared=new Map<string,MigrationLocation>(),repaired=new Set<string>(),preparedContainers=new Set<string>();let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.binary','Binary use specialization exceeds its bounded graph work');};
    for(const graph of [...graphs].sort((a,b)=>a.root.localeCompare(b.root))){
        const containing:BinaryContainerUse[]=[];
        const uses=new BinaryUses(graph,graphs),incoming=new Set(graph.entryReferences().filter(reference=>
            reference.kind==='schema'&&reference.resolution==='resolved').map(reference=>key({resource:reference.targetResource!,pointer:reference.targetPointer!})));
        for(const scope of graph.entryScopes()){
            inspect();if(scope.kind!=='schema'||scope.family!=='3.0')continue;
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(value?.type!=='string'||value.format!=='binary'||typeof value.$ref==='string')continue;
            const contexts=uses.inspect(scope),raw=contexts.filter(rawBinaryUse);
            if(!raw.length||raw.length===contexts.length)continue;
            const occurrenceAt=(use:(typeof contexts)[number]):GraphScope|undefined=>{
                // The binary-use owner supplies an instance path. Resolve
                // direct typed property/item positions for the minimal chain
                // path. Other routes use the containing-object owner below.
                let occurrence:GraphScope|undefined=use.schema;
                for(const step of use.path){
                    inspect();
                    if(!occurrence||step==='nested'){occurrence=undefined;break;}
                    const suffix=step==='item'?'/items':'/properties/'+escape(step.property);
                    occurrence=graph.scopeAs(occurrence.resource,occurrence.pointer+suffix,'schema');
                }
                return occurrence;
            };
            // A raw inline leaf may itself be the data consumers' target.
            // Retain those consumers through neutral copies before changing
            // the raw occurrence. Every selected data path still needs its
            // own captured forwarding endpoint and ordinary ownership guard.
            const data=contexts.filter(use=>!rawBinaryUse(use)),neutral=raw.some(use=>{
                const occurrence=occurrenceAt(use);return occurrence&&key(occurrence)===key(scope);
            })&&data.every(use=>binaryUseRepresentation(use)==='data')&&raw.every(use=>uses.rawCompatible(use,'3.0'));
            const mode=neutral?'data':'raw';
            const containingStart=containing.length;
            for(const use of raw)if(uses.rawCompatible(use,'3.0')){
                const occurrence=occurrenceAt(use);
                // The simple-chain path below remains the minimal owner for
                // direct leaves. Containing/composed/targeted occurrences use
                // the same allocator with their complete instance-path state.
                let direct=occurrence!==undefined&&!incoming.has(key(occurrence));
                let at=occurrence;const seen=new Set<string>();
                while(direct&&at&&key(at)!==key(scope)){
                    inspect();if(seen.has(key(at))){direct=false;break;}seen.add(key(at));
                    const value=graph.docs.get(at.resource)!.dataNode(at.pointer)?.value;
                    const reference=graph.referenceAs(at.resource,at.pointer,'$ref','schema');
                    if(!value||Object.keys(value).length!==1||reference?.resolution!=='resolved'){direct=false;break;}
                    at=graph.scopeAs(reference.targetResource!,reference.targetPointer!,'schema');
                    if(!at)direct=false;
                }
                if(!direct||neutral&&data.some(use=>{
                    const occurrence=occurrenceAt(use);return !occurrence||graph.docs.get(occurrence.resource)!.dataNode(occurrence.pointer)?.value?.$ref===undefined;
                }))containing.push({leaf:scope,use});
            }
            if(neutral&&containing.length!==containingStart){
                for(const use of raw)if(uses.rawCompatible(use,'3.0'))containing.push({leaf:scope,use});
                continue;
            }
            for(const use of neutral?data:raw){
                inspect();const occurrence=occurrenceAt(use);
                // Replacing an occurrence that is itself a data target would
                // change that consumer too. Its independent neutral owner
                // must be established before admitting this repair.
                if(!occurrence||key(occurrence)===key(scope)||incoming.has(key(occurrence)))continue;
                if(!neutral&&!uses.rawCompatible(use,'3.0')||repaired.has(key(occurrence)))continue;
                const chain:GraphScope[]=[];let at=occurrence;const seen=new Set<string>();
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
                    const identity=JSON.stringify([graph.root,member.resource,member.pointer,mode]),known=prepared.get(identity);
                    if(known){destination=known;continue;}
                    const copied=owners.separate(member,neutral?'binary_data_use':'binary_use',{container,layout:'array-item',captured:pristine.get(member.resource),identity});
                    for(const [pointer,location]of copied.provenance){
                        inspect();const id=key({resource:member.resource,pointer}),locations=provenance.get(id)??[];
                        locations.push(location);provenance.set(id,locations);
                    }
                    const pending=[member],visited=new Set<string>();
                    for(let index=0;index<pending.length;index++){
                        inspect();const child=pending[index],id=JSON.stringify([child.resource,child.pointer,child.kind]);
                        if(visited.has(id))continue;visited.add(id);
                        for(const context of graphs){
                            inspect();const captured=context.scopeAs(child.resource,child.pointer,child.kind);
                            if(!captured||!context.isEntryUse(captured)||schemaResourceContextIdentity(captured)!==schemaResourceContextIdentity(child)||
                                captured.sourceKind!==child.sourceKind||captured.schemaParent!==child.schemaParent)continue;
                            owners.rememberAdditionalUse(context.root,captured,{resource:copied.location.resource,
                                pointer:copied.location.pointer+child.pointer.slice(member.pointer.length)});
                        }
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
                const source=sources.get(occurrence.resource)!,pointer=source.current(occurrence.pointer);
                if(pointer===undefined)throw new SourceError('migration.binary.owner','The binary occurrence has no surviving captured reference owner');
                owners.admit(source);source.set(pointer+'/$ref',destination!.resource+pointerFragment(destination!.pointer));
                repaired.add(key(occurrence));
            }
        }
        specializeBinaryContainers(graph,sources,pristine,containing,owners,provenance,graphs,preparedContainers);
    }
    return provenance;
}
