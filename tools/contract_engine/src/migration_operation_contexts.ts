import {segments} from './document';
import {standardOperationMethods} from './contexts';
import type {GraphScope,GraphTarget,ReferenceGraph} from './reference_graph';
import {ignoresRequestBody} from './operation_semantics';

export type MigrationOperationUse=Readonly<{
    source:GraphScope;pathItem?:GraphTarget;method?:string;
}>;

function declaredMethod(graph:ReferenceGraph,scope:GraphScope):string|undefined {
    const method=segments(scope.pointer).at(-1),parent=scope.pointer.slice(0,scope.pointer.lastIndexOf('/'));
    return method&&(standardOperationMethods(scope.family).includes(method)||
        scope.family==='3.2'&&graph.scopeAs(scope.resource,parent,'operation-map'))?method:undefined;
}

/** Include independently referenced Operations and reusable Path Items, not
 * only the entry's executable routes. Alias pointers stay logical: GET and
 * POST can share CST bytes without sharing request-body applicability. */
export function* migrationOperationUses(graph:ReferenceGraph):IterableIterator<MigrationOperationUse> {
    for(const scope of [...graph.entryScopes()].filter(scope=>scope.kind==='operation')
        .sort((a,b)=>a.resource.localeCompare(b.resource)||a.pointer.localeCompare(b.pointer))){
        const occurrences=graph.operationContexts(scope.resource,scope.pointer);
        if(occurrences.length){
            for(const occurrence of occurrences)yield {source:scope,pathItem:occurrence.pathItem,method:occurrence.method};
        }else{
            const method=declaredMethod(graph,scope);
            const pointer=scope.pointer.slice(0,scope.pointer.lastIndexOf('/'));
            const pathItem=graph.scopeAs(scope.resource,pointer,'path-item');
            yield {source:scope,pathItem,method};
        }
    }
}

/** An empty result means that a detached Operation has no method proof. */
export function migrationBodyApplicability(graph:ReferenceGraph,scope:GraphScope):readonly boolean[] {
    const methods=graph.operationContexts(scope.resource,scope.pointer).map(occurrence=>occurrence.method);
    if(!methods.length){
        const method=declaredMethod(graph,scope);
        if(method)methods.push(method);
    }
    return [...new Set(methods.map(method=>!ignoresRequestBody(scope.family,method.toUpperCase())))].sort();
}
