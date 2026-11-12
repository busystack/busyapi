import {escape} from './document';
import {FormSemantics} from './form_semantics';
import type {ReferenceGraph} from './reference_graph';
import type {MigrationIssue} from './migration_schema';
import {SourcePlan} from './source_plan';
import {migrationScopes} from './migration_documents';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {retainFormHeaderOwners} from './migration_media_schema';

/** OAS 3.0 §4.7.15 ignores multipart style fields. OAS 3.1 §4.8.15
 * activates them and ignores contentType instead. A declaration-only upgrade
 * would change request bytes even though both documents validate. */
export function migrateEncodings(graph:ReferenceGraph,sources:Map<string,SourcePlan>,from:string,to:string,issue:MigrationIssue,contexts:readonly ReferenceGraph[]=[graph],owners?:MigrationSchemaOwners):void {
    // 3.2 removes the request-only restriction on Encoding. This directly
    // affects R2 response semantics even when no newer media fields are used.
    for(const context of contexts)for(const scope of context.entryScopes())if(scope.kind==='media'&&scope.family===from&&((from==='3.2')!==(to==='3.2'))){
        const marker=scope.pointer.lastIndexOf('/content/');if(marker<0)continue;
        const response=context.scopeAs(scope.resource,scope.pointer.slice(0,marker),'response');if(!response)continue;
        const media=scope.pointer.slice(marker+9).replaceAll('~1','/').replaceAll('~0','~').split(';')[0].trim().toLowerCase();
        if(!media.startsWith('multipart/')&&media!=='application/x-www-form-urlencoded')continue;
        const value=context.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(!value?.encoding||typeof value.encoding!=='object')continue;
        const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer+'/encoding');if(pointer===undefined)continue;
        if(to==='3.2'){
            if(!owners){issue(scope,'migration.response.encoding-owner','Inactive response encoding needs its captured owner before activation','implementation');continue;}
            const parent=source.current(response.pointer);
            if(parent!==undefined)retainFormHeaderOwners(context,owners,source,response,parent);
            owners.retainNativeHistory({...scope,pointer:scope.pointer+'/encoding'},source,pointer,'inactive_response_encoding',context);
            continue;
        }
        const properties=new FormSemantics(context).shape(scope.resource,scope.pointer+'/schema').properties??{};
        for(const [name,raw]of Object.entries(value.encoding)){
            if(name.startsWith('x-'))continue;
            const rule=raw as Record<string,unknown>,shape=properties[name],types=shape?.types;
            const array=types?.length===1&&types[0]==='array',part=array?shape?.items:shape;
            const primitive=part?.types?.length===1&&['string','number','integer','boolean'].includes(part.types[0]);
            const styled=['style','explode','allowReserved'].some(field=>Object.hasOwn(rule,field));
            const activeHeaders=media.startsWith('multipart/')&&Object.keys((rule.headers as Record<string,unknown>|undefined)??{}).some(name=>name.toLowerCase()!=='content-type');
            const defaultStyle=primitive&&(rule.style??'form')==='form'&&(rule.explode??true)===true&&
                (media.startsWith('multipart/')||rule.allowReserved!==true)&&part?.defaultContentType==='text/plain';
            const fields=Object.keys(rule).some(field=>!['style','explode','allowReserved','contentType','headers'].includes(field)&&!field.startsWith('x-'));
            const unknown=(styled||activeHeaders||rule.contentType!==undefined)&&(!part?.types?.length||part.defaultContentType===undefined);
            if(unknown||activeHeaders||fields||styled&&!defaultStyle||!styled&&rule.contentType!==undefined&&rule.contentType!==part?.defaultContentType)
                issue({...scope,pointer:scope.pointer+'/encoding/'+escape(name)},'migration.response.encoding',
                    unknown?'No captured part shape proves that this response encoding is redundant in the older target':
                    'This active response part encoding has no equivalent standard owner in the older target; older Media Type Objects ignore response encoding',unknown?'unavailable-proof':'target-representation');
        }
    }
    if(from!=='3.0'&&to!=='3.0')return;
    const forms=new FormSemantics(graph);
    for(const scope of migrationScopes(contexts))if(scope.kind==='media'&&scope.family===from){
        const content=scope.pointer.lastIndexOf('/content/');
        if(content<0||graph.scope(scope.resource,scope.pointer.slice(0,content)).kind!=='request-body')continue;
        const media=scope.pointer.slice(content+9).replaceAll('~1','/').replaceAll('~0','~').split(';')[0].trim().toLowerCase();
        if(!media.startsWith('multipart/'))continue;
        const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(!value?.encoding||typeof value.encoding!=='object')continue;
        const properties=forms.shape(scope.resource,scope.pointer+'/schema').properties??{};
        const source=sources.get(scope.resource)!;
        for(const [name,rule]of Object.entries(value.encoding)){
            if(!rule||typeof rule!=='object')continue;
            const fields=['style','explode','allowReserved'].filter(field=>Object.hasOwn(rule,field));
            if(!fields.length)continue;
            const pointer=scope.pointer+'/encoding/'+escape(name),at=source.current(pointer);
            if(at===undefined)continue;
            if(from==='3.0'){
                for(const field of fields)source.remove(at+'/'+field);
                continue;
            }
            // Other multipart media ignore these fields in both families.
            if(media!=='multipart/form-data')continue;
            const encoding=rule as Record<string,unknown>,shape=properties[name],types=shape?.types?.filter(type=>type!=='null');
            const type=types?.length===1?types[0]:undefined;
            const style=encoding.style??'form',explode=encoding.explode??(style==='form');
            const repeated=type==='array'&&style==='form'&&explode===true&&shape?.items?.types?.every(type=>['string','integer','number','boolean','null'].includes(type));
            if(type==='object'||type==='array'&&!repeated){
                issue({...scope,pointer},'migration.encoding.multipart','OpenAPI 3.0 ignores multipart style fields and cannot represent this structured part serialization','target-representation');
                continue;
            }
            if(type===undefined){
                issue({...scope,pointer},'migration.encoding.multipart-shape','The multipart field needs an unambiguous captured shape before a faithful content encoding can be planned','implementation');
                continue;
            }
            for(const field of fields)source.remove(at+'/'+field);
            source.set(at+'/contentType','text/plain');
        }
    }
}
