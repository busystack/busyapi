import {escape,segments,SourceError} from './document';
import type {ReferenceGraph} from './reference_graph';
import type {MigrationIssue} from './migration_schema';
import {SourcePlan,type SourceLocation} from './source_plan';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {entryComponentContainer} from './migration_schema_uses';
import {securityFlowOrder,securityRequirementAlternatives} from './security_requirements';

const key=(at:SourceLocation)=>JSON.stringify([at.resource,at.pointer]);
type Binding=Readonly<{from:string;to:string}>;

/** OAS OAuth Flows are supported acquisition alternatives. Swagger describes
 * one flow per scheme. Keep one material occurrence for each flow, then
 * distribute each captured AND requirement into ordered OR alternatives.
 * The common allocator and CST sequence owner retain all source provenance. */
export function migrateSwaggerSecurityFlows(graphs:readonly ReferenceGraph[],sources:ReadonlyMap<string,SourcePlan>,
    families:readonly string[],owners:MigrationSchemaOwners,issue:MigrationIssue,
    excludedNames:ReadonlySet<string>=new Set()):ReadonlyMap<string,readonly SourceLocation[]> {
    const provenance=new Map<string,SourceLocation[]>(),prepared=new Map<string,readonly SourceLocation[]>();
    const pristine=new Map([...sources].map(([id,source])=>[id,new SourcePlan(source.doc)]));
    const expanded=new Set<string>();let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.security','OAuth specialization exceeds its bounded graph work');};
    for(const graph of [...graphs].sort((a,b)=>a.root.localeCompare(b.root))){
        const variants=new Map<string,readonly string[]>();
        const reserved=new Set([...excludedNames,...graph.entryReferences().filter(reference=>reference.connection==='security').map(reference=>reference.value)]);
        for(const scope of graph.entryScopes()){
            inspect();if(scope.kind!=='security'||!families.includes(scope.family))continue;
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(value?.type!=='oauth2')continue;
            const flows=securityFlowOrder.filter(name=>Object.hasOwn(value.flows??{},name));
            if(flows.length<2)continue;
            if(flows.includes('deviceAuthorization')){
                issue({...scope,pointer:scope.pointer+'/flows/deviceAuthorization'},'migration.security.flow','Swagger cannot describe the device authorization grant','target-representation');
                continue;
            }
            if(Object.keys(value.flows).some(name=>name.startsWith('x-'))){
                issue({...scope,pointer:scope.pointer+'/flows'},'migration.security.flow-metadata','Swagger has no OAuth Flows Object in which to retain this authored extension','target-representation');
                continue;
            }
            const identity=key(scope);
            let copies=prepared.get(identity);
            if(!copies){
                const container=entryComponentContainer(graph,{...scope,family:graph.family},graph.root,owners);
                if(!container)throw new SourceError('migration.security.container','An OAuth flow needs a captured native component holder');
                const locations:SourceLocation[]=[];
                for(const flow of flows.slice(1)){
                    const separated=owners.separate(scope,'oauth_flow',{container,captured:pristine.get(scope.resource),excludedNames:reserved,
                        identity:JSON.stringify([graph.root,scope.resource,scope.pointer,flow])});
                    const copy=sources.get(separated.location.resource)!;
                    for(const other of flows)if(other!==flow){owners.admit(copy);copy.remove(separated.location.pointer+'/flows/'+other);}
                    for(const [pointer,location]of separated.provenance){
                        inspect();const id=key({resource:scope.resource,pointer}),values=provenance.get(id)??[];
                        values.push(location);provenance.set(id,values);
                    }
                    locations.push(separated.location);
                }
                const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);
                if(pointer===undefined)throw new SourceError('migration.security.owner','The OAuth scheme has no surviving material occurrence');
                for(const flow of flows.slice(1)){owners.admit(source);source.remove(pointer+'/flows/'+flow);}
                copies=locations;prepared.set(identity,copies);
            }
            for(const copy of copies){
                inspect();owners.rememberAdditionalUse(graph.root,scope,copy);
            }
            // Name bindings point at entry components after URI/alias
            // preparation. A terminal fragment can also be retained as data;
            // only actual incoming requirement names choose this table.
            variants.set(identity,copies.map(location=>segments(location.pointer).at(-1)!));
        }
        if(!variants.size)continue;
        const bindings=new Map(graph.entryReferences().filter(reference=>reference.connection==='security').map(reference=>[
            JSON.stringify([reference.resource,reference.pointer,reference.keyword]),reference]));
        for(const scope of graph.entryScopes()){
            inspect();if(scope.kind!=='security-array'||expanded.has(key(scope)))continue;
            const array=graph.docs.get(scope.resource)!.dataNode(scope.pointer);
            if(array?.kind!=='array')continue;
            let changed=false;
            const captured:{sourcePointer:string;choices:Binding[][]}[]=[];
            for(const requirement of array.children.values()){
                const choices=[...requirement.children.keys()].map(name=>{
                    inspect();const binding=bindings.get(JSON.stringify([scope.resource,requirement.pointer,name]));
                    const copies=binding?.resolution==='resolved'?variants.get(key({resource:binding.targetResource!,pointer:binding.targetPointer!})):undefined;
                    if(copies?.length)changed=true;
                    return [name,...copies??[]].map(to=>({from:name,to}));
                });
                captured.push({sourcePointer:requirement.pointer,choices});
            }
            if(!changed)continue;
            const alternatives:{sourcePointer:string;value:Binding[]}[]=[];
            for(const requirement of captured){
                for(const value of securityRequirementAlternatives(requirement.choices))alternatives.push({sourcePointer:requirement.sourcePointer,value});
                if(alternatives.length>2048)throw new SourceError('limit.migration.security','OAuth expansion exceeds 2048 requirements in one array');
            }
            expanded.add(key(scope));
            const source=sources.get(scope.resource)!;
            owners.admit(source,(array.children.size+alternatives.length)*8);
            source.expandArray(scope.pointer,alternatives,(pointer,bindings)=>{
                for(const binding of bindings)if(binding.from!==binding.to)source.rename(pointer+'/'+escape(binding.from),binding.to);
            });
        }
    }
    return provenance;
}
