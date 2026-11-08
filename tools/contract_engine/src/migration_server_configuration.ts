import {escape,SourceDocument,SourceError} from './document';
import type {Resource} from './engine';
import {requestOperation} from './execution';
import {finiteServerUrls,finiteServerVariableValues,serverTemplateParts} from './server_semantics';
import type {ReferenceGraph} from './reference_graph';
import type {MigrationIssue} from './migration_schema';
import type {MigrationOperationPair} from './migration_invariants';
import {migrationJoinedPath} from './migration_server_routes';
import {MigrationSource} from './migration_source';
import {serverTemplate} from './derived_bundle';
import type {ParameterWireProfiles} from './migration_parameter_serialization';

/** Exact leaf edits in the existing captured configuration, reviewed and
 * published with the contract. These records never contain credentials. */
export type MigrationConfigurationProjection=Readonly<{pointer:string;before:string|null;after:string;required?:boolean;
 multipart?:Readonly<{name:string}>;
 rawQueries?:readonly Readonly<{name:string;data:string;destinations:readonly string[];
  targets:readonly Readonly<{name:string;resource:string;pointer:string}>[]}>[];
 cookieGroups?:readonly Readonly<{name:string;destinations:readonly string[]}>[];
 cookieUnwraps?:readonly string[];emptyQueries?:readonly string[]}>;
export type MigrationServerSelectionContext=Readonly<{source:ReferenceGraph;target:ReferenceGraph;pairs:readonly MigrationOperationPair[];targetEntryName:string;
 parameters?:Readonly<{before:ParameterWireProfiles;after:ParameterWireProfiles}>}>;
function configurationEntryName(configuration:SourceDocument,graph:ReferenceGraph):string {
 const roots=configuration.dataNode('/roots')?.value;
 return (Array.isArray(roots)?roots.find((entry:any)=>typeof entry?.path==='string'&&new URL(entry.path,configuration.id).href===graph.root)?.name:undefined)??graph.root;
}

/** The saved-case selector used by every reviewed configuration projection. */
export function migrationConfiguredOperations(configuration:SourceDocument,graph:ReferenceGraph,selector:any,
 entryName=configurationEntryName(configuration,graph)) {
 if(!selector||selector.entry!==undefined&&selector.entry!==entryName)return [];
 for(const name of ['occurrence','method','path','entry'])if(Object.hasOwn(selector,name)&&
  (typeof selector[name]!=='string'||!selector[name]||name==='path'&&!selector[name].startsWith('/')))return [];
 const operations=graph.operations().filter(operation=>operation.role==='operation');
 if(typeof selector.occurrence==='string')return operations.filter(operation=>operation.occurrence===selector.occurrence);
 const candidates=operations.filter(operation=>operation.path===selector.path);
 const wire=(operation:typeof operations[number])=>operation.customMethod?operation.method:operation.method.toUpperCase();
 const exact=candidates.filter(operation=>wire(operation)===selector.method);
 return exact.length?exact:candidates.filter(operation=>!operation.customMethod&&typeof selector.method==='string'&&wire(operation)===selector.method.toUpperCase());
}

export function projectMigrationServerSelections(source:ReferenceGraph,target:ReferenceGraph,resources:Resource[],delivered:Resource[],
 configuration:SourceDocument|undefined,issue:MigrationIssue,pairs:readonly MigrationOperationPair[],targetEntryName:string,allEntries:readonly MigrationServerSelectionContext[]):MigrationConfigurationProjection[] {
 if(!configuration)return [];
 const changes=new Map<string,MigrationConfigurationProjection>();let work=0;
 const putExact=(pointer:string,after:string,required=true)=>{
  const node=configuration.dataNode(pointer),before=node?configuration.dataJson(pointer):null;
  required=required&&before!==after;
  if(!changes.has(pointer)&&changes.size>=4096)throw new SourceError('limit.migration.configuration','Server configuration review exceeds 4096 captured leaves');
  const previous=changes.get(pointer);
  if(previous&&previous.after!==after){issue({resource:configuration.id,pointer},'migration.server.configured-selection',
   'One saved selection requires different target settings in its captured operation contexts','target-representation');return;}
  changes.set(pointer,{pointer,before,after,required:required||previous?.required===true});
 };
 const put=(pointer:string,value:unknown,required=true)=>putExact(pointer,JSON.stringify(value),required);
 const integer=(pointer:string,fallback:number):number=>{
  const node=configuration.dataNode(pointer);if(!node)return fallback;
  // Core ignores decimal selectors. Do not activate a rounded/exponent value.
  return typeof node.value==='number'&&Number.isSafeInteger(node.value)&&/^-?(?:0|[1-9]\d*)$/u.test(configuration.dataJson(pointer).trim())?node.value:fallback;
 };
 const wire=(operation:MigrationOperationPair['before'])=>operation.customMethod?operation.method:operation.method.toUpperCase();
 const sourceEntryName=configurationEntryName(configuration,source);
 const sourceKey=(operation:MigrationOperationPair['before'])=>JSON.stringify([sourceEntryName,wire(operation),operation.path]);
 const targetKey=(operation:MigrationOperationPair['after'])=>JSON.stringify([targetEntryName,wire(operation),operation.path]);
 const matches=(selector:any,operation:MigrationOperationPair['before'],entryName=sourceEntryName,graph=source)=>{
  if(!selector||typeof selector!=='object')return false;
  for(const name of ['occurrence','method','path','entry'])if(Object.hasOwn(selector,name)&&
   (typeof selector[name]!=='string'||!selector[name]||name==='path'&&!selector[name].startsWith('/')))return false;
  return (selector.entry===undefined||selector.entry===entryName)&&(typeof selector.occurrence==='string'?selector.occurrence===operation.occurrence:
   selector.path===operation.path&&(selector.method===wire(operation)||!operation.customMethod&&typeof selector.method==='string'&&selector.method.toUpperCase()===wire(operation)&&
    !graph.operations().some(candidate=>candidate.role==='operation'&&candidate.path===selector.path&&wire(candidate)===selector.method)));
 };

 const selectedEntries=(selector:unknown)=>allEntries.filter(entry=>entry.source.operations().filter(operation=>operation.role==='operation'&&
  matches(selector,operation,configurationEntryName(configuration,entry.source),entry.source)).length===1);
 const environments=[{name:'',pointer:'',value:{} as Record<string,any>},
  ...[...configuration.dataNode('/environments')?.children??[]].map(([name,node])=>({name,pointer:node.pointer,value:node.value as Record<string,any>}))];
 const selected=(server:any,variables:Record<string,unknown>):string|undefined=>{
  if(!server)return;
  const definitions={...server.variables};
  for(const name of new Set(serverTemplateParts(server.url).names)){
   const definition=definitions[name],value=Object.hasOwn(variables,name)?variables[name]:definition?.default;
   if(typeof value!=='string'||Array.isArray(definition?.enum)&&!finiteServerVariableValues(definition)?.includes(value))return;
   definitions[name]={...definition,default:value,enum:[value]};
  }
  const value=finiteServerUrls({...server,variables:definitions},server.base)?.[0];
  if(value!==undefined){const url=new URL(value);url.hash='';return url.href;}
 };
 const requestUrl=(base:string,path:string)=>{
  const url=new URL(base);url.hash='';return url.origin==='null'?url.protocol+'//'+url.host+migrationJoinedPath(url.pathname,path)+url.search:
   url.origin+migrationJoinedPath(url.pathname,path)+url.search;
 };
 const cases=[...configuration.dataNode('/tests')?.children.values()??[]];
 for(const {before:operation,after:output}of pairs){
  if(operation.role!=='operation')continue;
  const before=requestOperation({root:source.root,resources,snapshot:'migration-server-selection',resource:operation.source.resource,pointer:operation.source.pointer,occurrence:operation.occurrence});
  const after=requestOperation({root:target.root,resources:delivered,snapshot:'migration-server-selection',resource:output.source.resource,pointer:output.source.pointer,occurrence:output.occurrence});
  const project=(index:number,environment:typeof environments[number],variables:Record<string,unknown>,at:string):number=>{
   if(++work>200000)throw new SourceError('limit.migration.servers','Configured Server proof exceeds 200000 choices');
   const first=before.servers[index];
   if(!first)return after.servers[index]?Math.max(before.servers.length,after.servers.length,index):index;
   const override=environment.value.baseUrl;
   if(typeof override==='string'&&override.length){
    // The override replaces the Server but keeps the operation route. Factor
    // a common literal suffix only when both the raw interpolation expression
    // and every captured substitution preserve the complete effective URL.
    const parts=/^([A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*)([^?#]*)(.*)$/u.exec(override);
    const desired=parts&&migrationJoinedPath(parts[2],operation.path);
    let candidate=override;
    if(operation.path!==output.path){
     if(!parts||!desired!.endsWith(output.path)){
      issue({resource:configuration.id,pointer:environment.pointer+'/baseUrl'},'migration.server.override-path',
       'No shared append-only environment base URL can retain this relocated route target','target-representation');return index;
     }
     const prefix=desired!.slice(0,-output.path.length);
     candidate=parts[1]+(prefix||'/')+parts[3];
    }
    const substitute=(value:string)=>{
     let valid=true;
     const expanded=value.replace(/\$\$\{/gu,'\u0000').replace(/\$\{([A-Za-z_][A-Za-z0-9_.-]{0,127})\}/gu,(_match,name)=>{
      if(typeof variables[name]!=='string'){valid=false;return '';}
      return variables[name] as string;
     });
     if(!valid||/[\u0000-\u0020\u007f{}\\]/u.test(expanded))return;
     try{const url=new URL(expanded);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;return url.href;}catch{return;}
    };
    const original=substitute(override),projected=substitute(candidate);
    if(original===undefined)return after.servers.length;
    if(projected===undefined||requestUrl(original,operation.path)!==requestUrl(projected,output.path)){
     issue({resource:configuration.id,pointer:environment.pointer+'/baseUrl'},'migration.server.override-path',
      'The factored environment override does not preserve its captured effective URL','unavailable-proof');return index;
    }
    put(environment.pointer+'/baseUrl',candidate,candidate!==override);
    return after.servers[index]?index:0;
   }
   const url=selected(first,variables);
   if(url===undefined){
    const last=after.servers[index];
    const variables=(server:typeof first)=>Object.entries(server.variables??{}).sort(([a],[b])=>a.localeCompare(b))
     .map(([name,value])=>[name,{default:(value as any).default,choices:finiteServerVariableValues(value)}]);
    if(last&&operation.path===output.path&&serverTemplate(first.url,first.base,first.variables)===serverTemplate(last.url,last.base,last.variables)&&
        JSON.stringify(variables(first))===JSON.stringify(variables(last)))return index;
    return after.servers.length; // Keep a runtime-invalid ordinal, not a malformed case definition.
   }
   const expected=requestUrl(url,operation.path);
   const choices=after.servers.map((server,index)=>({index,url:selected(server,variables)}))
    .filter(choice=>choice.url!==undefined&&requestUrl(choice.url,output.path)===expected).map(choice=>choice.index);
   if(!choices.length){issue({resource:configuration.id,pointer:at},'migration.server.configured-selection',
    'No target Server selection preserves this saved effective request URL','unavailable-proof');return index;}
   return choices.includes(index)?index:choices[0];
  };
  for(const environment of environments){
   if(!environment.name)continue;
   const old=environment.pointer+'/servers/'+escape(sourceKey(operation)),index=integer(old,0);
   const selection=project(index,environment,environment.value.variables??{},environment.pointer);
   const destination=environment.pointer+'/servers/'+escape(targetKey(output));
   put(destination,selection,selection!==integer(destination,0));
  }
  for(const entry of cases){
   const value=entry.value as Record<string,any>;if(!matches(value.operation,operation))continue;
   const entries=selectedEntries(value.operation);
   if(entries.length===1||value.operation.occurrence||operation.path!==output.path||value.operation.entry){
    const selector=new MigrationSource(configuration),pointer=entry.pointer+'/operation';
    selector.set(pointer+'/path',output.path);
    if(value.operation.occurrence){selector.remove(pointer+'/occurrence');selector.set(pointer+'/method',wire(output));}
    if(value.operation.entry||entries.length===1)selector.set(pointer+'/entry',targetEntryName);
    putExact(pointer,selector.doc.dataJson(pointer));
   }else putExact(entry.pointer+'/operation',configuration.dataJson(entry.pointer+'/operation'),false);

   const nativeSelector=(pointer:string,minimum=0,maximum=2047)=>{
    const node=configuration.dataNode(pointer);return !node||typeof node.value==='number'&&Number.isSafeInteger(node.value)&&
     /^-?(?:0|[1-9]\d*)$/u.test(configuration.dataJson(pointer).trim())&&node.value>=minimum&&node.value<=maximum;
   };
   // A malformed saved selector fails Core's definition validation before URL
   // preparation. Retain its exact syntax rather than activating a default.
   if(!nativeSelector(entry.pointer+'/server')||[...configuration.dataNode(entry.pointer+'/servers')?.children.values()??[]]
       .some(node=>!nativeSelector(node.pointer,-1,2048)))continue;
   const defaultIndex=integer(entry.pointer+'/server',0);
   for(const environment of environments){
    const perEnvironment=environment.name?entry.pointer+'/servers/'+escape(environment.name):entry.pointer+'/server';
    const inherited=environment.name?integer(environment.pointer+'/servers/'+escape(sourceKey(operation)),0):0;
    const original=integer(perEnvironment,configuration.dataNode(entry.pointer+'/server')?defaultIndex:inherited);
    const variables={...environment.value.variables,...value.variables};
    const selection=project(original,environment,variables,entry.pointer);
    const global=changes.get(entry.pointer+'/server');
    const environmentDefault=environment.name?changes.get(environment.pointer+'/servers/'+escape(targetKey(output))):undefined;
    const fallback=global?.required?JSON.parse(global.after):configuration.dataNode(entry.pointer+'/server')?defaultIndex:
     environmentDefault?JSON.parse(environmentDefault.after):0;
    const targetDefault=environment.name?integer(perEnvironment,fallback):original;
    put(perEnvironment,selection,selection!==targetDefault);
   }
  }
 }
 // An unresolved authored selector must not accidentally become a relocated
 // route. Keep it unresolved using a reviewed occurrence guard.
 for(const entry of cases){
  const value=entry.value as Record<string,any>;
  if(selectedEntries(value.operation).length)continue;
  if(target.operations().some(operation=>matches(value.operation,operation,targetEntryName,target))){
   const selector=new MigrationSource(configuration),pointer=entry.pointer+'/operation';
   selector.set(pointer+'/occurrence','busyapi-invalid-operation:'+configuration.id+'#'+entry.pointer);
   putExact(pointer,selector.doc.dataJson(pointer));
  }

 }
 return [...changes.values()];
}

/** Validate the final shared selector against every captured entry, including
 * entries in which an authored case was unresolved. Scoped occurrence repairs
 * cannot activate another entry or replace the captured operation there. */
export function proveMigrationConfiguredOperationSelections(entries:readonly MigrationServerSelectionContext[],configuration:SourceDocument|undefined,
 projections:readonly MigrationConfigurationProjection[],issue:MigrationIssue):void {
 if(!configuration)return;
 const projected=new MigrationSource(configuration);
 for(const change of projections)projected.exact(change.pointer,change.after);
 for(const entry of entries)for(const node of configuration.dataNode('/tests')?.children.values()??[]){
  const before=migrationConfiguredOperations(configuration,entry.source,node.value?.operation);
  const after=migrationConfiguredOperations(configuration,entry.target,projected.doc.dataNode(node.pointer)?.value?.operation,entry.targetEntryName);
  if((before.length===1)!==(after.length===1)||before.length===1&&after.length===1&&
      !entry.pairs.some(pair=>pair.before.occurrence===before[0].occurrence&&pair.after.occurrence===after[0].occurrence))
   issue({resource:configuration.id,pointer:node.pointer+'/operation'},'migration.server.case-identity',
    'One saved case selector cannot retain its captured operation or unresolved state across these entries','target-representation');
 }
}
