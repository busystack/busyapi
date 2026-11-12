import {SourceDocument,SourceError} from './document';
import {SourcePlan,type SourceLocation} from './source_plan';
import {requestOperation} from './execution';
import {evaluateSchemas} from './schema_evaluation';
import {NamedMultipartEquivalence,namedMultipartFields,projectNamedMultipartValue} from './migration_named_multipart';
import {migrationConfiguredOperations,type MigrationConfigurationProjection,type MigrationServerSelectionContext} from './migration_server_configuration';
import type {MigrationIssue} from './migration_schema';
import type {ExternalExampleResourcePacket} from './external_examples';

type SavedMultipartInstance=Readonly<{subject:'request-body';location:string;text:string;schema:SourceLocation}>;
const instance=(text:string,schema:SourceLocation,location='saved-multipart'):SavedMultipartInstance=>({subject:'request-body',location,text,schema});

/** Saved multipart values use the same captured bijection as declarations.
 * Only body.value changes. Media, binary references, Header/media selections,
 * authentication, Servers and environments retain their original exact data.
 * Ambiguous inverses or unavailable file bytes remain explicit blockers. */
export async function projectMigrationMultipartConfiguration(entries:readonly MigrationServerSelectionContext[],configuration:SourceDocument|undefined,
 issue:MigrationIssue,examples:readonly ExternalExampleResourcePacket[]=[]):Promise<MigrationConfigurationProjection[]> {
 if(!configuration)return [];
 const result:MigrationConfigurationProjection[]=[];let workBytes=0;
 for(const test of configuration.dataNode('/tests')?.children.values()??[]){
  const body=configuration.dataNode(test.pointer+'/body');if(body?.kind!=='object')continue;
  const proposals=new Map<string,{after:string;name?:string;names?:readonly string[]}>();let applies=false;
  for(const entry of entries){
   const matches=migrationConfiguredOperations(configuration,entry.source,test.value?.operation);
   if(matches.length!==1)continue;
   const pair=entry.pairs.find(pair=>pair.before.occurrence===matches[0].occurrence);if(!pair)continue;
   const plan=(graph:MigrationServerSelectionContext['source'],operation:typeof pair.before)=>requestOperation({root:graph.root,
    resources:[...graph.docs].map(([id,doc])=>({id,text:doc.text,generation:0})),snapshot:'migration-multipart-saved',
    resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
   const before=plan(entry.source,pair.before),after=plan(entry.target,pair.after);
   const selected=before.requestBody?.content.find((media:any)=>media.mediaType===body.value.mediaType);
   const destination=after.requestBody?.content.find((media:any)=>media.mediaType===body.value.mediaType);
   const scope=selected&&entry.source.scopeAs(selected.source.resource,selected.source.pointer,'media');
   const c=scope&&new NamedMultipartEquivalence(entry.source).prove(scope,[selected.mediaType],entry.target.family).certificate;
   if(!c){proposals.set(configuration.dataJson(body.pointer),{after:configuration.dataJson(body.pointer)});continue;}
   applies=true;
   const names=namedMultipartFields(c).map(field=>field.name),allowed=new Set(names);
   const fail=(message:string)=>issue({resource:configuration.id,pointer:body.pointer},'migration.multipart.saved-proof',message,'unavailable-proof');
   if(!destination?.schema||!configuration.dataNode(body.pointer+'/value')){fail('The selected saved multipart body has no captured structured value and target schema inverse');continue;}
   if((body.value.files?.length??0)>0){fail('Saved file parts need captured payload bytes for the original positional value inverse');continue;}
   const value=configuration.dataNode(body.pointer+'/value')!;
   let original:string|undefined,projected:string|undefined;
   if(value.kind==='array'){
    original=configuration.dataJson(value.pointer);projected=projectNamedMultipartValue(configuration,value.pointer,c.fields?names:c.name);
   }else if(value.kind==='object'&&[...value.children.keys()].every(name=>allowed.has(name))){
    const parts:string[]=[];let valid=true;
    for(const name of names){
     const field=value.children.get(name);if(!field)continue;
     if(field.kind!=='array'){valid=false;break;}
     for(const item of field.children.values())parts.push('{'+JSON.stringify(name)+':'+configuration.dataJson(item.pointer)+'}');
    }
    if(valid)original='['+parts.join(',')+']';
    projected=configuration.dataJson(value.pointer);
   }
   if(original===undefined||projected===undefined){fail('The saved multipart value has no exact same-field-order-preserving named-part inverse');continue;}
   if(body.value.partMediaTypes&&Object.keys(body.value.partMediaTypes).some(name=>!allowed.has(name))||
      body.value.partHeaders?.some((header:any)=>!allowed.has(header.part))||
      body.value.fileShapes&&Object.keys(body.value.fileShapes).some(name=>!allowed.has(name))){
    fail('A saved part media, Header or file-shape selection belongs to another field');continue;
   }
   const sourceDoc=new SourceDocument(original,'file:///saved-positional.json',true,'json');
   const check=async(graph:typeof entry.source,instances:readonly SavedMultipartInstance[])=>{
    if(!instances.length)return true;
    workBytes+=[...graph.docs.values()].reduce((bytes,doc)=>bytes+doc.text.length,0)+instances.reduce((bytes,value)=>bytes+value.text.length,0);
    if(workBytes>128*1024*1024)throw new SourceError('limit.migration.positional-encoding','Saved multipart inverse evaluation exceeds its 128 MiB captured-source work budget');
    const checked=await evaluateSchemas({root:graph.root,snapshot:'migration-multipart-saved-proof',
     resources:[...graph.docs].map(([id,doc])=>({id,text:doc.text,generation:0})),exampleResources:examples,runtimeInstances:instances});
    return checked.complete&&checked.runtimeEvaluations.length===instances.length&&checked.runtimeEvaluations.every(value=>value.complete&&value.valid===true);
   };
   const sourceInstances=[...(c.schema?[instance(original,c.schema)]:[]),
    ...(c.item?[...sourceDoc.dataNode('')!.children.values()].map(item=>instance(sourceDoc.dataJson(item.pointer),c.item!,'saved-multipart-item')):[])];
   if(!await check(entry.source,sourceInstances)||!await check(entry.target,[instance(projected,destination.schema,'saved-named-multipart')])){
    fail('The saved multipart inverse is outside the complete captured source or target schema language');continue;
   }
   const output=new SourcePlan(configuration);output.exact(value.pointer,projected);
   const text=output.doc.dataJson(body.pointer);proposals.set(text,{after:text,...(c.fields?{names}:{name:c.name})});
  }
  if(!applies)continue;
  if(proposals.size!==1){issue({resource:configuration.id,pointer:body.pointer},'migration.multipart.saved-context','The same saved body has incompatible positional and named interpretations across captured entries','target-representation');continue;}
  const proposal=[...proposals.values()][0],before=configuration.dataJson(body.pointer);
  if(proposal.after!==before)result.push({pointer:body.pointer,before,after:proposal.after,multipart:proposal.names?{names:proposal.names}:{name:proposal.name!}});
 }
 return result;
}
