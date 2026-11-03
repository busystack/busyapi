import {createGraph,type Resource} from './engine';
import type {MigrationIssue} from './migration_schema';
import type {MigrationLocation} from './migration_source';
import {supportedSchemaDialect,schemaResourceContextIdentity,type ReferenceGraph,type GraphScope,type GraphReference} from './reference_graph';
import {escape,SourceError} from './document';
import {modernFamily} from './specification';
import {projectSchemaReference} from './schema_reference_projection';
import {DiscriminatorModels} from './discriminator_models';
import {swaggerMedia} from './swagger_operation';

type Context=ReturnType<typeof createGraph>;
export type MigrationUse=Readonly<{
    entryNamespace:string;resource:string;pointer:string;physicalPointer:string;
    role:string;sourceKind?:string;family:string;dialect:string|null;
    baseUri:string;resourceBoundary:string;direction:'request'|'response'|'neutral';literal:boolean;
}>;
export type DocumentContext=Context&Readonly<{uses:readonly MigrationUse[]}>;

/** Conversion owners come from actual entry uses, rather than dormant parsed
 * identities. Preserve differing contexts until the common allocator has
 * specialized them; payload/literal occurrences never become mutation owners. */
export function* migrationScopes(contexts:readonly ReferenceGraph[]):IterableIterator<GraphScope> {
    const seen=new Set<string>();
    for(const graph of contexts)for(const scope of graph.entryScopes()){
        const id=JSON.stringify([scope.resource,scope.pointer,scope.kind,schemaResourceContextIdentity(scope)]);
        if(seen.has(id))continue;
        if(seen.size>=200000)throw new SourceError('limit.migration.uses','Conversion ownership exceeds 200000 captured scope states');
        seen.add(id);yield scope;
    }
}

export function* migrationReferences(contexts:readonly ReferenceGraph[]):IterableIterator<GraphReference> {
    const seen=new Set<string>();let work=0;
    for(const graph of contexts)for(const reference of graph.entryReferences()){
        if((work+=1+(reference.dynamic?.candidates.length??0))>2000000)throw new SourceError('limit.migration.uses','Conversion references exceed 2000000 captured states');
        const id=JSON.stringify([reference.resource,reference.pointer,reference.kind,reference.connection,reference.keyword,
            reference.value,schemaResourceContextIdentity(reference),reference.resolution,reference.targetResource,reference.targetPointer,reference.dynamic]);
        if(!seen.has(id)){seen.add(id);yield reference;}
    }
}

/** Keep entry interpretation separate from physical CST ownership. Direction
 * propagates over typed containment and resolved contract edges, including
 * reusable Header/schema chains. Literal containers remain independent uses;
 * payload fields that resemble references create no propagation edges. */
export function migrationUses(graph:ReferenceGraph):readonly MigrationUse[] {
    const identity=(at:{resource:string;pointer:string;kind:string})=>JSON.stringify([at.resource,at.pointer,at.kind]);
    const scopes=[...graph.entryScopes()].filter(scope=>scope.kind!=='root'||graph.specifications.has(scope.resource));
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

/** Core 8.2.3.1 gives an assertion-only static forwarder the same meaning in
 * supported modern dialects when its captured base and target agree. This is
 * a proof about the actual use, not interchangeability of the dialects: any
 * sibling assertion/annotation, dynamic binding or unresolved target keeps
 * the independent context requirement. */
function equivalentForwarder(a:GraphScope,left:ReferenceGraph,b:GraphScope,right:ReferenceGraph):boolean {
    if(a.kind!=='schema'||b.kind!=='schema'||!modernFamily(a.family)||!modernFamily(b.family)||
        !supportedSchemaDialect(a)||!supportedSchemaDialect(b)||a.base!==b.base||a.resourcePointer!==b.resourcePointer)return false;
    const node=left.docs.get(a.resource)!.dataNode(a.pointer);
    if(node?.kind!=='object'||node.children.size!==1||typeof node.value.$ref!=='string')return false;
    const before=left.referenceAs(a.resource,a.pointer,'$ref','schema'),after=right.referenceAs(b.resource,b.pointer,'$ref','schema');
    return before?.resolution==='resolved'&&after?.resolution==='resolved'&&
        before.targetResource===after.targetResource&&before.targetPointer===after.targetPointer;
}

/** Each complete description is also an entry context. Only established typed
 * uses own conversion semantics. A fragment retrieval's bookkeeping root is
 * neither an OpenAPI Object nor a schema use. Distinct contexts require
 * specialization unless their actual use has a shared representation proof.
 * Named connections are proved separately against each entry's namespace. */
export function migrationDocumentContexts(input:{root:string;resources:Resource[]},primary:Context,issue:MigrationIssue,deferSpecialization=false):readonly DocumentContext[] {
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
    if(!deferSpecialization)for(const [root,scopes]of migrationContextDifferences(contexts))for(const scope of scopes.values())
        issue({...scope,decisionKey:root},'migration.documents.context','This shared source has different captured contexts; independent entry owners are required','implementation');
    return contexts;
}

/** Conflicting occurrences seed the common specialization closure. Equivalent
 * forwarders need no variant themselves until their target acquires one. */
export function migrationContextDifferences(contexts:readonly Pick<DocumentContext,'graph'>[]):ReadonlyMap<string,ReadonlyMap<string,GraphScope>> {
    const scopes=new Map<string,{identity:string;scope:GraphScope;graph:ReferenceGraph}>(),different=new Set<string>();
    const bindings=new Map<string,string>();let work=0;
    const inspect=(steps=1)=>{
        if((work+=steps)>2000000)throw new SourceError('limit.migration.uses','Entry binding ownership exceeds 2000000 captured states');
    };
    const binding=(owner:GraphScope,field:string,value:string)=>{
        inspect();const id=JSON.stringify([owner.resource,owner.pointer,owner.kind]),key=JSON.stringify([id,field]);
        const previous=bindings.get(key);
        if(previous!==undefined&&previous!==value)different.add(id);
        if(previous===undefined)bindings.set(key,value);
    };
    for(const {graph}of contexts){
        const models=new DiscriminatorModels(graph);
        for(const scope of graph.entryScopes()){
            inspect();
            if(scope.kind==='root'&&!graph.specifications.has(scope.resource))continue;
            const key=JSON.stringify([scope.resource,scope.pointer,scope.kind]);
            const identity=schemaResourceContextIdentity(scope);
            const previous=scopes.get(key);
            if(previous&&previous.identity!==identity&&!equivalentForwarder(previous.scope,previous.graph,scope,graph))different.add(key);
            if(!previous)scopes.set(key,{identity,scope,graph});
            if(scope.kind==='schema'&&scope.family==='2.0'){
                const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
                if(typeof value?.discriminator==='string'&&typeof value.$ref!=='string'){
                    const table=[...models.models(scope)].map(([name,model])=>[name,model.resource,model.pointer]).sort();
                    inspect(table.length);binding(scope,'discriminator-models',JSON.stringify(table));
                }
            }
        }
        for(const reference of graph.entryReferences()){
            inspect(1+(reference.dynamic?.candidates.length??0));
            if(!reference.connection&&!reference.dynamic)continue;
            const owner=graph.referenceOwner(reference);if(!owner)continue;
            binding(owner,JSON.stringify([reference.keyword,reference.connection]),JSON.stringify([
                reference.resolution,reference.targetResource,reference.targetPointer,reference.targetUri,
                reference.dynamic?.anchor,reference.dynamic?.candidates.map(candidate=>[candidate.resource,candidate.pointer]).sort(),
            ]));
        }
        for(const operation of graph.operations()){
            inspect();const scope=graph.scopeAs(operation.source.resource,operation.source.pointer,'operation');
            if(scope?.family==='2.0')binding(scope,'operation-media',JSON.stringify([
                swaggerMedia(graph,scope.resource,scope.pointer,'consumes'),swaggerMedia(graph,scope.resource,scope.pointer,'produces'),
            ]));
        }
    }
    return new Map(contexts.map(({graph})=>[graph.root,new Map([...graph.entryScopes()]
        .filter(scope=>different.has(JSON.stringify([scope.resource,scope.pointer,scope.kind])))
        .map(scope=>[JSON.stringify([scope.resource,scope.pointer,scope.kind]),scope]))]));
}

/** Native target validity alone cannot establish that an implicit name still
 * selects the original definition. Prove its relocated physical owner for
 * every source entry, including names that intentionally vary by entry. Before
 * a family conversion/omission, ownership separation also proves static edges. */
export function proveMigrationConnections(source:ReferenceGraph,target:ReferenceGraph,mapped:(location:MigrationLocation,scope:GraphScope|undefined)=>readonly MigrationLocation[],issue:MigrationIssue,includeStatic=false):void {
    const identity=(field:MigrationLocation,kind:string,connection:string|undefined)=>JSON.stringify([
        field.resource,field.pointer,kind,connection==='operationId'||connection==='operationRef'?'operation':connection??'',
    ]);
    const connections=new Map(target.entryReferences().filter(reference=>reference.connection||(includeStatic||reference.kind==='schema')&&['$ref','$dynamicRef'].includes(reference.keyword)).map(reference=>[
        identity({...reference,pointer:reference.pointer+'/'+escape(reference.keyword)},reference.kind,reference.connection),reference]));
    const mappedSchemas=(location:MigrationLocation)=>mapped(location,source.scopeAs(location.resource,location.pointer,'schema')).filter(location=>{
        const scope=target.scopeAs(location.resource,location.pointer,'schema');return scope!==undefined&&target.isEntryUse(scope);
    });
    for(const reference of source.entryReferences()){
        if((!reference.connection&&reference.keyword!=='$dynamicRef'&&!(includeStatic&&reference.keyword==='$ref'))||reference.resolution!=='resolved')continue;
        const field={resource:reference.resource,pointer:reference.pointer+'/'+escape(reference.keyword)};
        const connectionAt=(field:MigrationLocation)=>connections.get(identity(field,reference.kind,reference.connection));
        const captured=source.scopeAs(reference.targetResource!,reference.targetPointer!,reference.kind);
        const fields=mapped(field,source.referenceOwner(reference)).filter(field=>connectionAt(field)!==undefined),targets=mapped({resource:reference.targetResource!,pointer:reference.targetPointer!},captured)
            .filter(location=>{
                if(!includeStatic)return true;
                const scope=target.scopeAs(location.resource,location.pointer,reference.kind);
                return scope!==undefined&&scope.family===captured?.family&&scope.dialect===captured?.dialect;
            });
        if(!fields.length||fields.some(field=>{
            const connection=connectionAt(field);
            return !connection||connection.resolution!=='resolved'||!targets.some(target=>target.resource===connection.targetResource&&target.pointer===connection.targetPointer);
        }))issue({...field,original:field},'migration.invariant.connection','The migrated entry does not retain this reference or implicit name\'s captured target','implementation');
        if(reference.keyword==='$dynamicRef')for(const field of fields){
            const connection=connectionAt(field);
            // Static target preservation above is also the complete scope
            // proof when every captured dynamic candidate is that same target.
            if(connection?.keyword==='$ref'&&!modernFamily(connection.family)&&projectSchemaReference(reference).state==='fixed')continue;
            const expected=reference.dynamic?.candidates.flatMap(candidate=>mappedSchemas(candidate));
            const actual=connection?.dynamic?.candidates;
            const identities=(values:readonly MigrationLocation[]|undefined)=>values===undefined?undefined:[...new Set(values.map(value=>JSON.stringify([value.resource,value.pointer])))].sort();
            if(reference.dynamic?.candidates.some(candidate=>!mappedSchemas(candidate).length)||Boolean(reference.dynamic)!==Boolean(connection?.dynamic)||JSON.stringify(identities(expected))!==JSON.stringify(identities(actual)))
                issue({...field,original:{resource:reference.resource,pointer:reference.pointer+'/'+escape(reference.keyword)}},'migration.invariant.dynamic','The migrated entry changes a captured dynamic reference scope or candidate owner','implementation');
        }

    }
}
