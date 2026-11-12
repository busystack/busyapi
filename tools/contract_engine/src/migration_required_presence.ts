import {segments,SourceError} from './document';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {SourcePlan} from './source_plan';
import {modernFamily} from './specification';
import {migrationScopes,migrationReferences} from './migration_documents';

const key=(scope:Pick<GraphScope,'resource'|'pointer'>)=>JSON.stringify([scope.resource,scope.pointer]);

/** Modern required is independent of access annotations. OAS 3.0.4 §4.7.24.2
 * instead suppresses annotated names by direction. Express the original
 * presence assertion without using another direction-sensitive required list:
 * not(object AND property-absent). A property with schema not:{} makes
 * properties succeed exactly when that name is absent. Non-objects remain
 * unaffected. Existing required, annotations and value assertions all survive. */
export function migrateRequiredPresence(graph:ReferenceGraph,sources:Map<string,SourcePlan>,from:string,to:string,contexts:readonly ReferenceGraph[]=[graph]):ReadonlySet<string> {
    if(!modernFamily(from)||to!=='3.0')return new Set();
    const annotations=[...migrationScopes(contexts)].filter(scope=>{
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        return scope.kind==='schema'&&scope.family===from&&(value?.readOnly===true||value?.writeOnly===true);
    });
    const incoming=new Map<string,GraphScope[]>();
    for(const edge of migrationReferences(contexts)){
        if(edge.kind!=='schema'||edge.connection||!['$ref','$dynamicRef'].includes(edge.keyword)||edge.resolution!=='resolved')continue;
        const scope=graph.scopeAs(edge.resource,edge.pointer,'schema');if(!scope)continue;
        const id=key({resource:edge.targetResource!,pointer:edge.targetPointer!}),uses=incoming.get(id)??[];
        uses.push(scope);incoming.set(id,uses);
    }
    const pending=[...annotations],seen=new Set<string>(),owners=new Map<string,GraphScope>();
    while(pending.length){
        const scope=pending.pop()!,id=key(scope);if(seen.has(id))continue;
        const node=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!;
        if(seen.size>=20000)throw new SourceError('limit.migration.direction','Access-property use inspection exceeds 20000 occurrences',node.range,'unsupported',{resource:scope.resource,pointer:scope.pointer,range:node.range});
        seen.add(id);pending.push(...incoming.get(id)??[]);
        const tokens=segments(scope.pointer),last=tokens.at(-1),container=tokens.at(-2),parent=scope.pointer.slice(0,scope.pointer.lastIndexOf('/'));
        if(container==='properties'){
            const owner=graph.scopeAs(scope.resource,parent.slice(0,parent.lastIndexOf('/')),'schema');
            if(owner?.family===from)owners.set(key(owner),owner);
        }else{
            const above=['allOf','anyOf','oneOf'].includes(container??'')?parent.slice(0,parent.lastIndexOf('/')):
                ['not','if','then','else'].includes(last??'')?parent:undefined;
            const owner=above===undefined?undefined:graph.scopeAs(scope.resource,above,'schema');
            if(owner)pending.push(owner);
        }
    }
    let branches=0;
    for(const scope of owners.values()){
        const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);
        const required=graph.docs.get(scope.resource)!.dataNode(scope.pointer+'/required');
        if(required?.kind!=='array'||!required.children.size)continue;
        if(pointer===undefined)throw new SourceError('migration.direction.owner','The required-property schema has no surviving source owner for its presence mapping',required.range,'unsupported',{resource:scope.resource,pointer:scope.pointer+'/required',range:required.range});
        const collection=pointer+'/allOf';
        if(!source.doc.dataNode(collection))source.set(collection,[]);
        for(const child of required.children.values()){
            if(typeof child.value!=='string')throw new SourceError('migration.direction.required','The captured required list contains a non-string name',child.range);
            if(++branches>2048)throw new SourceError('limit.migration.direction','Required-presence mapping exceeds 2048 assertions',required.range,'unsupported',{resource:scope.resource,pointer:scope.pointer+'/required',range:required.range});
            source.set(collection+'/'+source.doc.dataNode(collection).children.size,
                {not:{type:'object',properties:{[child.value]:{not:{}}}}});
        }
    }
    for(const scope of annotations){
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(value.readOnly!==true||value.writeOnly!==true)continue;
        const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);
        if(pointer===undefined)continue;
        if(++branches>2048){
            const range=graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.range;
            throw new SourceError('limit.migration.direction','Access/presence mapping exceeds 2048 assertions',range,'unsupported',{...scope,range});
        }
        // Modern annotations can coexist. Restricted 3.0 forbids this pair
        // on one Schema Object; retain both in applicable allOf schemas.
        // Presence assertions above retain modern required semantics even
        // when a property now exposes only one flag directly to 3.0.
        const collection=pointer+'/allOf';
        if(!source.doc.dataNode(collection))source.set(collection,[]);
        const branch=collection+'/'+source.doc.dataNode(collection).children.size;
        source.set(branch,{});source.move(pointer+'/writeOnly',branch+'/writeOnly');
    }
    return new Set(annotations.map(key));
}
