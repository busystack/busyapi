import {children} from './contexts';
import {escape,SourceError} from './document';
import {pointerFragment,schemaResourceContextIdentity,type GraphScope,type ReferenceGraph} from './reference_graph';
import {SourcePlan,type SourceLocation} from './source_plan';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {projectSchemaReference} from './schema_reference_projection';
import {modernFamily} from './specification';
import {entryComponentContainer} from './migration_schema_uses';
import type {BinaryStep,BinaryUse} from './migration_binary';

const key=(at:SourceLocation)=>JSON.stringify([at.resource,at.pointer]);
const within=(at:SourceLocation,parent:SourceLocation)=>at.resource===parent.resource&&
    (at.pointer===parent.pointer||at.pointer.startsWith(parent.pointer+'/'));
type Selection=Readonly<{target:SourceLocation;path:readonly BinaryStep[]}>;
type Route={scope:GraphScope;selections:readonly Selection[];edges:{field?:string;keyword?:string;target:Route}[];relevant:boolean};
export type BinaryContainerUse=Readonly<{leaf:GraphScope;use:BinaryUse}>;

/** A media occurrence owns one finite schema graph, including its containing
 * objects and same-instance applicators. Select paths by their actual instance
 * position; a JSON sibling referring to the same definition remains independent.
 * Route states are local planning work. Material copies, reservations, provenance
 * and semantic ownership all belong to MigrationSchemaOwners.
 */
export function specializeBinaryContainers(graph:ReferenceGraph,sources:ReadonlyMap<string,SourcePlan>,
    pristine:ReadonlyMap<string,SourcePlan>,uses:readonly BinaryContainerUse[],owners:MigrationSchemaOwners,
    provenance:Map<string,SourceLocation[]>,contexts:readonly ReferenceGraph[]=[graph],preparedRoots:Set<string>=new Set()):void {
    let work=0;
    const inspect=()=>{if(++work>2000000)throw new SourceError('limit.migration.binary','Containing binary ownership exceeds its bounded graph work');};
    const groups=new Map<string,{scope:GraphScope;selections:Selection[]}>();
    for(const {leaf,use}of uses){
        inspect();const id=key(use.schema),group=groups.get(id)??{scope:use.schema,selections:[]};
        group.selections.push({target:leaf,path:use.path});groups.set(id,group);
    }
    const references=graph.entryReferences().filter(reference=>projectSchemaReference(reference).state==='fixed');
    const completed:SourceLocation[]=[];
    const record=(origin:GraphScope,location:SourceLocation,canonical:boolean)=>{
        const pending=[origin],seen=new Set<string>();
        for(let index=0;index<pending.length;index++){
            inspect();const at=pending[index],id=JSON.stringify([at.resource,at.pointer,at.kind]);
            if(seen.has(id))continue;seen.add(id);
            const destination={resource:location.resource,pointer:location.pointer+at.pointer.slice(origin.pointer.length)};
            for(const context of contexts){
                inspect();const captured=context.scopeAs(at.resource,at.pointer,at.kind);
                if(!captured||!context.isEntryUse(captured)||schemaResourceContextIdentity(captured)!==schemaResourceContextIdentity(at)||
                    captured.sourceKind!==at.sourceKind||captured.schemaParent!==at.schemaParent)continue;
                if(canonical)owners.rememberEntry(context.root,captured,destination);
                else owners.rememberAdditionalUse(context.root,captured,destination);
            }
            const value=graph.docs.get(at.resource)!.dataNode(at.pointer)?.value;
            if(graph.referenceObject(value,at))continue;
            for(const [name,,kind]of children(value,at.kind,at.family)){
                const child=graph.scopeAs(at.resource,at.pointer+'/'+escape(name),kind);if(child)pending.push(child);
            }
        }
    };
    const copy=(scope:GraphScope,label:string,identity:string)=>{
        const container=entryComponentContainer(graph,scope,graph.root,owners);
        if(!container)throw new SourceError('migration.binary.container','A containing binary use needs a compatible captured schema owner');
        const copied=owners.separate(scope,label,{container,layout:'array-item',captured:pristine.get(scope.resource),identity});
        for(const [pointer,location]of copied.provenance){
            inspect();const id=key({resource:scope.resource,pointer}),locations=provenance.get(id)??[];
            locations.push(location);provenance.set(id,locations);
        }
        return copied.location;
    };
    const setReference=(at:SourceLocation,target:SourceLocation,keyword='$ref')=>{
        const source=sources.get(at.resource)!;owners.admit(source);
        source.set(at.pointer+'/'+keyword,target.resource+pointerFragment(target.pointer));
    };
    for(const group of [...groups.values()].sort((a,b)=>key(a.scope).localeCompare(key(b.scope)))){
        inspect();const root=group.scope;
        if(preparedRoots.has(key(root)))continue;
        // Existing role/entry preparation owns independently interpreted data.
        // A binary specialization must not bypass that ambiguity boundary.
        if(!['2.0','3.0','3.1','3.2'].includes(root.family)||graph.literalContainer(root.resource,root.pointer)!==undefined||graph.hasOverlappingScope(root.resource,root.pointer))continue;
        const routes=new Map<string,Route>();
        const selectionsKey=(selections:readonly Selection[])=>[...new Set(selections.map(selection=>
            JSON.stringify([selection.target.resource,selection.target.pointer,selection.path])))].sort();
        const route=(scope:GraphScope,selections:readonly Selection[]):Route=>{
            inspect();const id=JSON.stringify([scope.resource,scope.pointer,selectionsKey(selections)]),known=routes.get(id);
            if(known)return known;
            if(routes.size>=2048)throw new SourceError('limit.migration.binary','Containing binary ownership exceeds 2048 route states');
            const state:Route={scope,selections,edges:[],relevant:selections.some(selection=>!selection.path.length)};
            routes.set(id,state);pending.push(state);return state;
        };
        const pending:Route[]=[];
        const initial=route(root,group.selections);
        for(let index=0;index<pending.length;index++){
            inspect();const state=pending[index],at=state.scope,value=graph.docs.get(at.resource)!.dataNode(at.pointer)?.value;
            if(at.family!==root.family||!value||typeof value!=='object'||Array.isArray(value))continue;
            const child=(suffix:string,selections=state.selections)=>{
                if(!selections.length)return;
                const target=graph.scopeAs(at.resource,at.pointer+suffix,'schema');
                if(target)state.edges.push({target:route(target,selections)});
            };
            for(const keyword of modernFamily(at.family)?['$ref','$dynamicRef']:['$ref'])if(typeof value[keyword]==='string'){
                const edge=graph.referenceAs(at.resource,at.pointer,keyword,'schema'),projection=edge&&projectSchemaReference(edge);
                const target=projection?.state==='fixed'&&graph.scopeAs(projection.target.resource,projection.target.pointer,'schema');
                if(target)state.edges.push({field:at.pointer,keyword,target:route(target,state.selections)});
            }
            if(!modernFamily(at.family)&&typeof value.$ref==='string')continue;
            for(const name of ['allOf','anyOf','oneOf'])if(Array.isArray(value[name]))
                for(let item=0;item<value[name].length;item++)child('/'+name+'/'+item);
            for(const name of ['not',...(modernFamily(at.family)?['if','then','else']:[])])
                if(Object.hasOwn(value,name))child('/'+name);
            for(const name of Object.keys(value.properties??{})){
                const selected=state.selections.filter(selection=>typeof selection.path[0]==='object'&&selection.path[0].property===name)
                    .map(selection=>({...selection,path:selection.path.slice(1)}));
                child('/properties/'+escape(name),selected);
            }
            child('/items',state.selections.filter(selection=>selection.path[0]==='item')
                .map(selection=>({...selection,path:selection.path.slice(1)})));
        }
        // Backward reachability is finite even for recursive forwarding and
        // composition. No recursive schema expansion or depth guessing occurs.
        const parents=new Map<Route,Route[]>(),ready=[...routes.values()].filter(state=>state.relevant);
        for(const state of routes.values())for(const edge of state.edges){
            inspect();const values=parents.get(edge.target)??[];values.push(state);parents.set(edge.target,values);
        }
        for(let index=0;index<ready.length;index++)for(const parent of parents.get(ready[index])??[]){
            inspect();if(!parent.relevant){parent.relevant=true;ready.push(parent);}
        }
        if(!initial.relevant)continue;
        const material=new Map<Route,SourceLocation>();
        const roots=new Set<Route>([initial]);
        for(const state of routes.values())if(state.relevant)for(const edge of state.edges)
            if(edge.field!==undefined&&edge.target.relevant)roots.add(edge.target);
        for(const state of [...roots].sort((a,b)=>JSON.stringify([key(a.scope),selectionsKey(a.selections)]).localeCompare(JSON.stringify([key(b.scope),selectionsKey(b.selections)])))){
            const location=copy(state.scope,'binary_container_use',JSON.stringify([graph.root,root.resource,root.pointer,
                state.scope.resource,state.scope.pointer,selectionsKey(state.selections)]));
            material.set(state,location);
        }
        // Independently targeted inline roots/children need an unchanged data
        // owner before their original media slot becomes a forwarding use.
        const targeted=references.some(reference=>{
            inspect();if(!within({resource:reference.targetResource!,pointer:reference.targetPointer!},root)||within(reference,root)||
                completed.some(at=>within(reference,at)))return false;
            const source=sources.get(reference.resource)!,pointer=source.current(reference.pointer);
            return pointer!==undefined&&source.doc.dataNode(pointer+'/'+reference.keyword)?.value===reference.value;
        });
        let neutral:SourceLocation|undefined;
        if(targeted){
            neutral=copy(root,'binary_container_data',JSON.stringify([graph.root,root.resource,root.pointer,'data']));
            record(root,neutral,true);
            for(const reference of references){
                inspect();const target={resource:reference.targetResource!,pointer:reference.targetPointer!};
                if(!within(target,root))continue;
                const destination={resource:neutral.resource,pointer:neutral.pointer+target.pointer.slice(root.pointer.length)};
                if(within(reference,root))setReference({resource:neutral.resource,pointer:neutral.pointer+reference.pointer.slice(root.pointer.length)},destination,reference.keyword);
                else if(!completed.some(at=>within(reference,at))){
                    const source=sources.get(reference.resource)!,pointer=source.current(reference.pointer);
                    if(pointer!==undefined&&source.doc.dataNode(pointer+'/'+reference.keyword)?.value===reference.value)
                        setReference({resource:reference.resource,pointer},destination,reference.keyword);
                }
            }
        }
        for(const [state,location]of material){
            const states=[state],seen=new Set<Route>(),repairs=new Map<string,SourceLocation>();
            for(let index=0;index<states.length;index++){
                inspect();const current=states[index];if(seen.has(current))continue;seen.add(current);
                for(const edge of current.edges){
                    inspect();if(!edge.target.relevant)continue;
                    if(edge.field!==undefined)repairs.set(JSON.stringify([edge.field,edge.keyword]),material.get(edge.target)!);
                    else states.push(edge.target);
                }
            }
            // Absolute locators preserve all unrelated references after the
            // copy crosses a file base. Only selected route edges specialize.
            for(const reference of references){
                inspect();if(!within(reference,state.scope))continue;
                const target=repairs.get(JSON.stringify([reference.pointer,reference.keyword]))??{resource:reference.targetResource!,pointer:reference.targetPointer!};
                setReference({resource:location.resource,pointer:location.pointer+reference.pointer.slice(state.scope.pointer.length)},target,reference.keyword);
            }
            record(state.scope,location,state===initial&&!neutral);
        }
        // A neutral copy also moved files; its remaining static edges retain
        // the original targets, with internal targets kept inside that copy.
        if(neutral)for(const reference of references){
            inspect();if(!within(reference,root))continue;
            const target={resource:reference.targetResource!,pointer:reference.targetPointer!};
            setReference({resource:neutral.resource,pointer:neutral.pointer+reference.pointer.slice(root.pointer.length)},within(target,root)?
                {resource:neutral.resource,pointer:neutral.pointer+target.pointer.slice(root.pointer.length)}:target,reference.keyword);
        }
        const source=sources.get(root.resource)!,pointer=source.current(root.pointer);
        if(pointer===undefined)throw new SourceError('migration.binary.owner','The containing media schema lost its captured source owner');
        owners.referenceUse(source,pointer,material.get(initial)!);
        completed.push(root);preparedRoots.add(key(root));
    }
}
