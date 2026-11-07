import type {createGraph,Resource} from './engine';
import type {ReferenceGraph,GraphScope} from './reference_graph';
import type {MigrationIssue} from './migration_schema';
import type {MigrationLocation,MigrationSource} from './migration_source';
import {ignoresRequestBody} from './operation_semantics';
import {modernFamily} from './specification';
import {standardOperationMethods} from './contexts';
import {migrationBodyApplicability,migrationOperationUses} from './migration_operation_contexts';
import {ParameterSemantics} from './parameter_semantics';

/** Swagger 2.0 Path Item fixed fields cannot retain TRACE or additional
 * methods. Refuse at the operation before offering body-only decisions. */
export function checkOperationTarget(graph:ReferenceGraph,target:string,issue:MigrationIssue):void {
    if(target!=='2.0')return;
    for(const operation of migrationOperationUses(graph)) {
        if(operation.method&&!standardOperationMethods(target).includes(operation.method))
            issue(operation.source,'migration.operation.method','Swagger 2.0 cannot represent this operation method','target-representation');
    }
}

/** Check effective bodies before structural mappings can hide their original
 * meaning. OAS 3.0's ignored declaration cannot represent an active body. */
export function checkRequestBodyTarget(context:ReturnType<typeof createGraph>,_resources:Resource[],target:string,issue:MigrationIssue):void {
    if(target!=='3.0')for(const scope of context.graph.entryScopes()){
        if(scope.kind==='operation'&&scope.family==='3.0'&&
            context.docs.get(scope.resource)!.dataNode(scope.pointer)?.children.has('requestBody')&&
            !migrationBodyApplicability(context.graph,scope).length)
            issue({...scope,pointer:scope.pointer+'/requestBody'},'migration.body.method-context',
                'This referenced operation has no captured HTTP method with which to prove whether the source request body is applicable','unavailable-proof');
    }
    if(target!=='3.0')return;
    const parameters=new ParameterSemantics(context.graph);
    for(const operation of migrationOperationUses(context.graph)){
        const scope=operation.source;
        const body=modernFamily(scope.family)?context.docs.get(scope.resource)!.dataNode(scope.pointer)?.children.has('requestBody')?
            {source:{resource:scope.resource,pointer:scope.pointer+'/requestBody'}}:undefined:
            scope.family==='2.0'?parameters.operation(scope.resource,scope.pointer,operation.pathItem).visible
                .find(parameter=>['body','formData'].includes(parameter.location??'')):undefined;
        if(!body)continue;
        if(operation.method===undefined)issue(body.source,'migration.body.method-context','This referenced operation has no captured HTTP method with which to prove request-body applicability in OpenAPI 3.0','unavailable-proof');
        else if(ignoresRequestBody('3.0',operation.method.toUpperCase()))
            issue(body.source,'migration.body.target-ignored','OpenAPI 3.0 consumers must ignore this method\'s request body; the target cannot retain its active request semantics','target-representation');
    }
}

/** A source 3.0 ignored body must not become active in another family.
 * A composed Swagger upgrade retains its originally active body instead. */
export function migrateOperationBodies(graph:ReferenceGraph,sources:Map<string,MigrationSource>,from:string,to:string,original:(scope:GraphScope)=>string,issue:MigrationIssue):MigrationLocation[] {
    const omitted:MigrationLocation[]=[];
    if(from!=='3.0'||to==='3.0')return omitted;
    for(const scope of graph.entryScopes()) {
        if(scope.kind!=='operation'||scope.family!==from||original(scope)!=='3.0'||!graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.children.has('requestBody'))continue;
        const applicability=migrationBodyApplicability(graph,scope);
        const location={resource:scope.resource,pointer:scope.pointer+'/requestBody'};
        if(!applicability.length){
            issue(location,'migration.body.method-context','This referenced operation has no captured HTTP method with which to prove whether the source request body is applicable','unavailable-proof');continue;
        }
        if(!applicability.includes(false))continue;
        // Native fixed slots (including logical YAML aliases) have one method.
        // Refuse an unproved graph binding rather than omit an active use.
        if(applicability.includes(true)){
            issue(location,'migration.body.method-context','The captured operation still has conflicting method bindings after native ownership specialization; request-body equivalence is unproved','unavailable-proof');continue;
        }
        if(issue(location,'migration.body.ignored-activation','The target would activate a request body ignored by OpenAPI 3.0 consumers. Explicitly omit that declaration from the migrated copy to preserve effective request semantics','decision',['omit-ignored-body'])) {
            const source=sources.get(scope.resource)!,pointer=source.current(location.pointer);
            if(pointer!==undefined){source.remove(pointer);omitted.push(location);}
        }
    }
    return omitted;
}
