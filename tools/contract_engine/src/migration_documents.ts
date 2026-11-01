import {createGraph,type Resource} from './engine';
import type {MigrationIssue} from './migration_schema';
import type {MigrationLocation} from './migration_source';
import type {ReferenceGraph,GraphScope} from './reference_graph';
import {escape,SourceError} from './document';

type Context=ReturnType<typeof createGraph>;
export type MigrationUse=Readonly<{
    entryNamespace:string;resource:string;pointer:string;physicalPointer:string;
    role:string;sourceKind?:string;family:string;dialect:string|null;
    baseUri:string;resourceBoundary:string;direction:'request'|'response'|'neutral';literal:boolean;
}>;
type DocumentContext=Context&Readonly<{uses:readonly MigrationUse[]}>;

/** Keep entry interpretation separate from physical CST ownership. Direction
 * propagates over typed containment and resolved contract edges, including
 * reusable Header/schema chains. Literal containers remain independent uses;
 * payload fields that resemble references create no propagation edges. */
export function migrationUses(graph:ReferenceGraph):readonly MigrationUse[] {
    const identity=(at:{resource:string;pointer:string;kind:string})=>JSON.stringify([at.resource,at.pointer,at.kind]);
    const scopes=[...graph.interpretedScopes()];
    const byLocation=new Map<string,GraphScope[]>();
    for(const scope of scopes){
        const key=JSON.stringify([scope.resource,scope.pointer]),values=byLocation.get(key)??[];
        values.push(scope);byLocation.set(key,values);
    }
    const edges=new Map<string,Set<string>>(),directions=new Map<string,Set<'request'|'response'>>();
    const pending:{id:string;direction:'request'|'response'}[]=[];
    const mark=(id:string,direction:'request'|'response')=>{
        const values=directions.get(id)??new Set<'request'|'response'>();
        if(values.has(direction))return;
        values.add(direction);directions.set(id,values);pending.push({id,direction});
    };
    const connect=(from:string,to:string)=>{const values=edges.get(from)??new Set<string>();values.add(to);edges.set(from,values);};
    for(const scope of scopes){
        const id=identity(scope);
        if(scope.kind==='response')mark(id,'response');
        if(scope.kind==='request-body'||scope.kind==='parameter')mark(id,'request');
        if(!scope.pointer)continue;
        const parent=scope.pointer.slice(0,scope.pointer.lastIndexOf('/'));
        for(const owner of byLocation.get(JSON.stringify([scope.resource,parent]))??[])
            connect(identity(owner),id);
    }
    for(const reference of graph.references){
        if(reference.connection||reference.resolution!=='resolved'||!['$ref','$dynamicRef'].includes(reference.keyword))continue;
        const target=graph.scopeAs(reference.targetResource!,reference.targetPointer!,reference.kind);
        if(target)connect(identity(reference),identity(target));
    }
    for(let index=0;index<pending.length;index++){
        if(index>=200000)throw new SourceError('limit.migration.uses','Semantic ownership exceeds 200000 directional states');
        const {id,direction}=pending[index];
        for(const next of edges.get(id)??[])mark(next,direction);
    }
    const uses:MigrationUse[]=[];
    const lexicalDirection=(scope:GraphScope):boolean=>{
        let pointer=scope.pointer;
        while(true){
            if(['response','request-body','parameter'].some(kind=>graph.scopeAs(scope.resource,pointer,kind)!==undefined))return true;
            if(!pointer)return false;
            pointer=pointer.slice(0,pointer.lastIndexOf('/'));
        }
    };
    const append=(scope:GraphScope,literal:boolean)=>{
        const node=graph.docs.get(scope.resource)!.dataNode(scope.pointer);
        if(!node)return;
        const active=directions.get(identity(scope));
        const interpretations:MigrationUse['direction'][]=literal||!active?.size?['neutral']:
            [...(!lexicalDirection(scope)?['neutral' as const]:[]),...active];
        for(const direction of interpretations){
            if(uses.length>=200000)throw new SourceError('limit.migration.uses','Semantic ownership exceeds 200000 captured uses');
            uses.push({entryNamespace:graph.root,resource:scope.resource,pointer:scope.pointer,physicalPointer:node.pointer,
                role:literal?'literal':scope.kind,...(scope.sourceKind?{sourceKind:scope.sourceKind}:{}),family:scope.family,dialect:scope.dialect,
                baseUri:scope.base,resourceBoundary:scope.resourcePointer,direction,literal});
        }
    };
    for(const scope of scopes)append(scope,false);
    for(const [resource]of graph.docs)for(const pointer of graph.literalContainers(resource))
        append({...graph.scope(resource,pointer),resource,pointer},true);
    return uses;
}

/** Each complete description is also an entry context. Shared bytes need one
 * transformation, so differing schema contexts cannot be merged by choosing
 * whichever entry happened to be visited first. Named connections are proved
 * separately against each migrated entry's namespace. */
export function migrationDocumentContexts(input:{root:string;resources:Resource[]},primary:Context,issue:MigrationIssue):readonly DocumentContext[] {
    let useCount=0;
    const capture=(context:Context):DocumentContext=>{
        const uses=migrationUses(context.graph);
        if((useCount+=uses.length)>200000)throw new SourceError('limit.migration.uses','Captured entries exceed 200000 semantic uses');
        return {...context,uses};
    };
    const contexts=[capture(primary)];
    for(const [root]of primary.graph.specifications){
        if(root===input.root)continue;
        contexts.push(capture(createGraph({...input,root})));
    }
    const scopes=new Map<string,string>();
    for(const {graph}of contexts){
        for(const [key,scope]of graph.scopes){
            const identity=JSON.stringify([scope.kind,scope.family,scope.dialect,scope.base,scope.resourcePointer]);
            if(scopes.has(key)&&scopes.get(key)!==identity)
                issue(scope,'migration.documents.context','This shared source has different schema or object contexts in captured descriptions; one converted owner is not proved equivalent','implementation');
            scopes.set(key,identity);
        }
    }
    return contexts;
}

/** Native target validity alone cannot establish that an implicit name still
 * selects the original definition. Prove its relocated physical owner for
 * every source entry, including names that intentionally vary by entry. */
export function proveMigrationConnections(source:ReferenceGraph,target:ReferenceGraph,mapped:(location:MigrationLocation)=>readonly MigrationLocation[],issue:MigrationIssue):void {
    const connections=new Map(target.references.filter(reference=>reference.connection||reference.kind==='schema'&&['$ref','$dynamicRef'].includes(reference.keyword)).map(reference=>[JSON.stringify([reference.resource,reference.pointer+'/'+escape(reference.keyword)]),reference]));
    for(const reference of source.references){
        if((!reference.connection&&reference.keyword!=='$dynamicRef')||reference.resolution!=='resolved')continue;
        const field={resource:reference.resource,pointer:reference.pointer+'/'+escape(reference.keyword)};
        const fields=mapped(field),targets=mapped({resource:reference.targetResource!,pointer:reference.targetPointer!});
        if(!fields.length||fields.some(field=>{
            const connection=connections.get(JSON.stringify([field.resource,field.pointer]));
            return !connection||connection.resolution!=='resolved'||!targets.some(target=>target.resource===connection.targetResource&&target.pointer===connection.targetPointer);
        }))issue({...field,original:field},'migration.invariant.connection','The migrated entry does not retain this reference or implicit name\'s captured target','implementation');
        if(reference.keyword==='$dynamicRef')for(const field of fields){
            const connection=connections.get(JSON.stringify([field.resource,field.pointer]));
            const expected=reference.dynamic?.candidates.flatMap(candidate=>mapped(candidate));
            const actual=connection?.dynamic?.candidates;
            const identities=(values:readonly MigrationLocation[]|undefined)=>values===undefined?undefined:[...new Set(values.map(value=>JSON.stringify([value.resource,value.pointer])))].sort();
            if(reference.dynamic?.candidates.some(candidate=>!mapped(candidate).length)||Boolean(reference.dynamic)!==Boolean(connection?.dynamic)||JSON.stringify(identities(expected))!==JSON.stringify(identities(actual)))
                issue({...field,original:{resource:reference.resource,pointer:reference.pointer+'/'+escape(reference.keyword)}},'migration.invariant.dynamic','The migrated entry changes a captured dynamic reference scope or candidate owner','implementation');
        }

    }
}
