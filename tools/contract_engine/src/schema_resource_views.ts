import {createHash} from 'node:crypto';
import {Reference} from '@hyperjump/browser/jref';
import {buildSchemaDocument} from '@hyperjump/json-schema/experimental';
import type {SchemaObject} from '@hyperjump/json-schema';
import {children} from './contexts';
import {SourceError,escape,type SourceDocument} from './document';
import {pointerFragment,resolveUri,schemaDialectIdentity,schemaResourceContextIdentity,supportedSchemaDialect,type GraphScope,type ReferenceGraph} from './reference_graph';
import type {SchemaEvaluationScope} from './swagger_schema';

type Member={scope:SchemaEvaluationScope;name:string};
type Group={uri:string;scope:SchemaEvaluationScope;members:Map<string,Member>;names:Map<string,Member>};
const registry='x-busyapi-schema-owners';
const key=schemaResourceContextIdentity;
const location=(scope:GraphScope)=>JSON.stringify([scope.resource,scope.pointer]);
const put=(owner:object,name:string,value:unknown)=>Object.defineProperty(owner,name,{value,enumerable:true,writable:true,configurable:true});

/** The pinned Document API gives one dialect and URI base to each executable
 * resource. Some captured schema occurrences live inside another role's literal
 * data or physical resource tree. Their executable coordinates therefore need
 * independent views. This is a projection of canonical scopes/edges, never a
 * new resolver, source identity or schema evaluator. Ordinary captures retain
 * their existing typed Document projection.
 *
 * A resource view materializes each owned schema once. Intrinsic schema children
 * link to those nodes using the supported Document Reference API; annotations
 * and literal values are restored from the captured source without preprocessing.
 * Private resource identities are bijective with captured resource contexts, so
 * dynamic-anchor names, resource transitions and recursive edges are retained. */
export class SchemaResourceViews {
    readonly active:boolean;
    private readonly groups=new Map<string,Group>();
    private readonly uris=new Map<string,Group>();
    private readonly members=new Map<string,{group:Group;member:Member}>();
    private work=0;
    private ready:(scope:SchemaEvaluationScope)=>boolean=()=>true;
    constructor(private readonly graph:ReferenceGraph,scopes:readonly SchemaEvaluationScope[],snapshot:string){
        let active=false;
        for(const scope of scopes){
            this.admit();
            if(!supportedSchemaDialect(scope))continue;
            const host=graph.scope(scope.resource,''),owner=key(scope);
            active ||= graph.literalContainer(scope.resource,scope.pointer)!==undefined||
                scope.resourcePointer===''&&scope.dialect!==host.dialect;
            let parent=scope.pointer;
            while(!active&&parent){
                this.admit();parent=parent.slice(0,parent.lastIndexOf('/'));
                const ancestor=graph.scopeAs(scope.resource,parent,'schema');
                if(ancestor){active=scope.resourcePointer!==scope.pointer&&key(ancestor)!==owner;break;}
            }
            if(active)break;
        }
        this.active=active;
        if(!active)return;
        for(const scope of scopes){
            this.admit();
            if(!supportedSchemaDialect(scope))continue;
            const owner=key(scope);
            let group=this.groups.get(owner);
            if(!group){
                const stem='busyapi-schema-view://capture-'+createHash('sha256').update(JSON.stringify([graph.root,snapshot,owner])).digest('hex');
                let uri=stem+'/resource',index=0;
                while(graph.identities.has(uri)||this.uris.has(uri)){
                    if(++index>2048)throw new SourceError('limit.schema.views','No bounded collision-free executable schema identity is available');
                    uri=stem+'/resource-'+index;
                }
                group={uri,scope,members:new Map(),names:new Map()};this.groups.set(owner,group);this.uris.set(uri,group);
            }
            let member=group.members.get(scope.pointer);
            if(!member){
                const stem='schema_'+createHash('sha256').update(Buffer.from(scope.pointer,'utf16le')).digest('hex');
                let name=stem,index=0;
                while(group.names.has(name))name=stem+'_'+(++index);
                member={scope,name};group.members.set(scope.pointer,member);group.names.set(name,member);
            }else if(scope.objectKind==='schema')member.scope=scope;
            this.members.set(location(scope),{group,member});
        }
    }
    private admit():void {
        if(++this.work>2000000)throw new SourceError('limit.schema.views','Executable schema ownership exceeds 2000000 projection steps');
    }
    address(scope:GraphScope):string {
        const group=this.groups.get(key(scope)),member=group?.members.get(scope.pointer);
        if(!group||!member)throw new SourceError('schema.view.context','The requested schema has no supported captured executable owner');
        return group.uri+pointerFragment('/'+registry+'/'+member.name);
    }
    owns(uri:string):boolean{return this.uris.has(uri);}
    identities():IterableIterator<string>{return this.uris.keys();}
    schemaReady(ready:(scope:SchemaEvaluationScope)=>boolean):void{this.ready=ready;}
    source(uri:string):{doc:SourceDocument;node:ReturnType<SourceDocument['dataNode']>}|undefined {
        const address=new URL(uri),fragment=decodeURIComponent(address.hash.slice(1));address.hash='';
        const group=this.uris.get(address.href);
        if(!group||!fragment.startsWith('/'+registry+'/'))return;
        const start=registry.length+2,end=fragment.indexOf('/',start),name=end<0?fragment.slice(start):fragment.slice(start,end);
        const member=group.names.get(name);
        if(!member)return;
        const pointer=member.scope.pointer+(end<0?'':fragment.slice(end)),doc=this.graph.docs.get(member.scope.resource)!;
        const physical=doc.dataNode(pointer),node=physical&&physical.pointer!==pointer?{...physical,pointer}:physical;
        return node?{doc,node}:undefined;
    }
    document(uri:string):ReturnType<typeof buildSchemaDocument> {
        const group=this.uris.get(uri);
        if(!group)throw new SourceError('schema.view.owner','The executable schema resource is outside the captured owner');
        const values:SchemaObject={},restorations:{pointer:string;value:unknown}[]=[];
        const source=this.graph.docs.get(group.scope.resource)!;
        const prepare=(value:any,kind:string,pointer:string,at:string,owner:SchemaEvaluationScope,depth=0):any=>{
            this.admit();
            if(depth>128)throw new SourceError('limit.schema.views','Executable schema containment exceeds 128 levels');
            if(value===null||typeof value!=='object')return value;
            if(kind==='schema'&&pointer!==owner.pointer){
                const target=this.members.get(JSON.stringify([owner.resource,pointer]));
                if(!target){
                    const captured=this.graph.scopeAs(owner.resource,pointer,'schema');
                    // Existing dependency states prohibit applying an unknown
                    // dialect. An unused reserved definition must not prevent
                    // a supported parent from compiling its own assertions.
                    if(captured&&!supportedSchemaDialect(captured))return true;
                    throw new SourceError('schema.view.child','An intrinsic schema child has no captured executable context');
                }
                restorations.push({pointer:at,value:new Reference(this.address(target.member.scope),{})});return {};
            }
            const output=Array.isArray(value)?[]:{};
            const reference=kind==='schema'&&this.graph.referenceObject(value,owner);
            const typed=new Map((reference?[]:children(value,kind,owner.family)).map(([name,,next])=>[name,next]));
            for(const [name,child]of Object.entries(value)){
                this.admit();
                if(reference&&name!=='$ref'||kind==='schema'&&['$id','$schema','$vocabulary'].includes(name)||
                    kind==='schema'&&owner.objectKind==='parameter'&&name==='required')continue;
                const childAt=at+'/'+escape(name),childPointer=pointer+'/'+escape(name);
                if(kind==='schema'&&['$ref','$dynamicRef'].includes(name)&&typeof child==='string'){
                    const edge=this.graph.referenceAs(owner.resource,pointer,name,'schema');
                    const target=edge?.resolution==='resolved'?this.members.get(JSON.stringify([edge.targetResource,edge.targetPointer])):undefined;
                    const address=target?(name==='$dynamicRef'&&edge?.dynamic?target.group.uri+'#'+encodeURIComponent(edge.dynamic.anchor):this.address(target.member.scope)):
                        edge?resolveUri(edge.value,edge.base).href:resolveUri(child,owner.base).href;
                    put(output,name,address);continue;
                }
                const next=typed.get(name);
                if(next&&['schema','schema-map','schema-array'].includes(next))
                    put(output,name,prepare(child,next,childPointer,childAt,owner,depth+1));
                else if(child!==null&&typeof child==='object')restorations.push({pointer:childAt,value:child});
                else put(output,name,child);
            }
            return output;
        };
        for(const member of group.members.values()){
            const scope=member.scope,value=source.dataNode(scope.pointer)?.value;
            put(values,member.name,this.ready(scope)?prepare(value,'schema',scope.pointer,'/'+registry+'/'+member.name,scope):true);
        }
        const document=buildSchemaDocument({[registry]:values},group.uri,schemaDialectIdentity(group.scope.dialect!));
        for(const restoration of restorations){
            const parts=restoration.pointer.slice(1).split('/').map(token=>token.replaceAll('~1','/').replaceAll('~0','~'));
            const name=parts.pop()!;let owner:unknown=document.root;
            for(const token of parts){
                if(owner===null||typeof owner!=='object'||!Object.hasOwn(owner,token))
                    throw new SourceError('schema.view.provenance','An executable schema field lost its captured owner');
                owner=Reflect.get(owner,token);
            }
            if(owner===null||typeof owner!=='object')
                throw new SourceError('schema.view.provenance','An executable schema field has no object owner');
            put(owner,name,restoration.value);
        }
        return document;
    }
}
