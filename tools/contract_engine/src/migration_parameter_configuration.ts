import {escape,SourceDocument,valueType} from './document';
import {ParameterSemantics} from './parameter_semantics';
import {SourcePlan} from './source_plan';
import type {MigrationIssue} from './migration_schema';
import {migrationConfiguredOperations,type MigrationConfigurationProjection,type MigrationServerSelectionContext} from './migration_server_configuration';
import {projectMigrationRawQuery,sameMigrationParameterValue,sameMigrationQueryFields} from './migration_parameter_serialization';
import type {ExternalExampleResourcePacket} from './external_examples';

/** Location moves and certified field extraction preserve exact values,
 * field order, unrelated selections and environment bindings remain captured.
 * The final parameter invariant has already proved the complete owner codec. */
export async function projectMigrationParameterConfiguration(entries:readonly MigrationServerSelectionContext[],configuration:SourceDocument|undefined,
 issue:MigrationIssue,examples:readonly ExternalExampleResourcePacket[]=[]):Promise<MigrationConfigurationProjection[]> {
 if(!configuration)return [];
 const result:MigrationConfigurationProjection[]=[];
 for(const test of configuration.dataNode('/tests')?.children.values()??[]){
  const pointer=test.pointer+'/parameters';if(!configuration.dataNode(pointer))continue;
  const proposals=new Map<string,{after:string;rawQueries:NonNullable<MigrationConfigurationProjection['rawQueries']>;cookieGroups:NonNullable<MigrationConfigurationProjection['cookieGroups']>;cookieUnwraps:string[];emptyQueries:string[]}>();let changed=false;
  for(const entry of entries){
   const operations=migrationConfiguredOperations(configuration,entry.source,test.value?.operation);
   if(operations.length!==1)continue;
   const pair=entry.pairs.find(pair=>pair.before.occurrence===operations[0].occurrence);if(!pair)continue;
   const source=new ParameterSemantics(entry.source),target=new ParameterSemantics(entry.target);
   const old=source.operation(pair.before.source.resource,pair.before.source.pointer,pair.before.pathItem).visible;
   const next=target.operation(pair.after.source.resource,pair.after.source.pointer,pair.after.pathItem).visible;
   const projected=new SourcePlan(configuration),rawQueries:NonNullable<MigrationConfigurationProjection['rawQueries']>[number][]=[];
   const cookieGroups:NonNullable<MigrationConfigurationProjection['cookieGroups']>[number][]=[];
   const cookieUnwraps:string[]=[];
   const emptyQueries:string[]=[];
   for(const parameter of old){
    const original=parameter.definition&&entry.source.docs.get(parameter.definition.resource)!.dataNode(parameter.definition.pointer)?.value;
    const whole=parameter.location==='querystring',cookie=parameter.location==='cookie'&&original?.style==='cookie';
    const reserved=parameter.location==='query'&&original?.allowReserved===true&&entry.target.family==='2.0';
    if(!whole&&!cookie&&!reserved)continue;
    const profile=entry.parameters?.before.get(JSON.stringify([parameter.definition?.resource,parameter.definition?.pointer]));
    if(whole&&profile&&JSON.parse(profile).projection==='empty-text-query'){
     const from=pointer+'/querystring/'+escape(parameter.name!),value=configuration.dataNode(from);if(!value)continue;
     const to=pointer+'/query/'+escape(parameter.name!);
     if (valueType(value) !== 'string' || value.value !== '' || !parameter.name) {
      issue({resource: configuration.id, pointer: from}, 'migration.parameter.saved-proof',
       'Only the certified explicitly saved empty text value has an addressable empty-array target owner', 'unavailable-proof');
      continue;
     }
     if(configuration.dataNode(to)){issue({resource:configuration.id,pointer:to},'migration.parameter.saved-collision','The saved target query name already has an independent selection','target-representation');continue;}
     projected.exact(to,'[]');projected.remove(from);emptyQueries.push(parameter.name!);
     if(projected.doc.dataNode(pointer+'/querystring')?.children.size===0)projected.remove(pointer+'/querystring');continue;
    }
    if(cookie&&profile&&JSON.parse(profile).projection==='cookie-singleton'){
     const saved=pointer+'/cookie/'+escape(parameter.name!),value=configuration.dataNode(saved);if(!value)continue;
     const output=next.find(next=>next.location==='cookie'&&next.name===parameter.name);
     if(!output||value.kind!=='array'||value.children.size!==1||!sameMigrationParameterValue(entry.source,parameter.source,entry.target,output.source,configuration.dataJson(saved))){
      issue({resource:configuration.id,pointer:saved},'migration.parameter.saved-proof','The saved cookie has no exact singleton-array projection preserving its literal octets','unavailable-proof');continue;
     }
     projected.exact(saved,configuration.dataJson(saved+'/0'));cookieUnwraps.push(parameter.name!);continue;
    }
    const group=profile&&JSON.parse(profile).fields?next.filter(next=>entry.parameters?.after.get(JSON.stringify([next.definition?.resource,next.definition?.pointer]))===profile):undefined;
    if(cookie&&group){
     const saved=pointer+'/cookie/'+escape(parameter.name!),value=configuration.dataNode(saved);if(!value)continue;
     if(value.kind!=='object'||!value.children.size||!sameMigrationQueryFields(entry.source,parameter.source,entry.target,group.map(parameter=>parameter.source),configuration.dataJson(saved))){
      issue({resource:configuration.id,pointer:saved},'migration.parameter.saved-proof','The saved cookie object has no exact nonempty projection into its complete target field group','unavailable-proof');continue;
     }
     const names=[...value.children.keys()],cookiePointer=pointer+'/cookie';
     if(names.some(name=>!name||name!==parameter.name&&configuration.dataNode(cookiePointer+'/'+escape(name)))){
      issue({resource:configuration.id,pointer:saved},'migration.parameter.saved-collision','A target cookie selection already owns a projected name or the saved consumer cannot address it','target-representation');continue;
     }
     const members=[...projected.doc.dataNode(cookiePointer)!.children.keys()].flatMap(name=>name===parameter.name?
      names.map(field=>JSON.stringify(field)+':'+configuration.dataJson(saved+'/'+escape(field))):
      [JSON.stringify(name)+':'+projected.doc.dataJson(cookiePointer+'/'+escape(name))]);
     projected.exact(cookiePointer,'{'+members.join(',')+'}');cookieGroups.push({name:parameter.name!,destinations:names});continue;
    }
    const queries=next.filter(next=>next.location==='query');
    const savedWhole=pointer+'/querystring/'+escape(parameter.name!);
    const wholeValue=configuration.dataNode(savedWhole);
    if (whole && wholeValue && valueType(wholeValue) === 'string') {
     const inverse=await projectMigrationRawQuery(entry.source,parameter.source,entry.target,queries.map(query=>query.source),wholeValue.value,examples);
     if(!inverse){issue({resource:configuration.id,pointer:savedWhole},'migration.parameter.saved-proof',
      'The captured raw query has no schema-valid inverse whose named target serialization reproduces every original octet, field occurrence and presence selection','unavailable-proof');continue;}
     const collision=inverse.selections.find(selection=>!selection.name||configuration.dataNode(pointer+'/query/'+escape(selection.name)));
     if(collision){issue({resource:configuration.id,pointer:savedWhole},collision.name?'migration.parameter.saved-collision':'migration.parameter.saved-proof',
      collision.name?'A saved target query selection already owns this name':'The saved-case consumer cannot address an empty query selection name',collision.name?'target-representation':'unavailable-proof');continue;}
     for(const selection of inverse.selections)projected.exact(pointer+'/query/'+escape(selection.name),selection.raw);
     projected.remove(savedWhole);
     if(projected.doc.dataNode(pointer+'/querystring')?.children.size===0)projected.remove(pointer+'/querystring');
     rawQueries.push({name:parameter.name!,data:inverse.data,destinations:inverse.selections.map(selection=>selection.name),targets:inverse.targets});
     continue;
    }
    // Object identity remains a separate path. A factor group consists only
    // of named primitive/array query owners, including flat Swagger owners.
    const split=whole&&queries.length>0&&queries.every(query=>{
     if(!query.definition)return false;
     const scope=entry.target.scopeAs(query.definition.resource,query.definition.pointer,'parameter');
     const doc=entry.target.docs.get(query.definition.resource)!;
     const type=doc.dataNode(query.definition.pointer+(scope?.family==='2.0'?'':'/schema'))?.value?.type;
     return ['string','number','integer','boolean','array'].includes(type);
    });
    if(split&&wholeValue){
     if(wholeValue.kind!=='object'||!wholeValue.children.size||!sameMigrationQueryFields(entry.source,parameter.source,entry.target,queries.map(query=>query.source),configuration.dataJson(savedWhole))){
      issue({resource:configuration.id,pointer:savedWhole},'migration.parameter.saved-proof','The saved input requires raw decoding, contains an unowned field or has an explicitly saved empty group with no target selection owner','unavailable-proof');continue;
     }
     const destinations=[...wholeValue.children.keys()].map(name=>({name,to:pointer+'/query/'+escape(name)}));
     if(destinations.some(({name})=>name.length===0)){
      issue({resource:configuration.id,pointer:savedWhole},'migration.parameter.saved-proof','The existing saved-case consumer cannot address an empty named query selection; the original whole-object selection must be retained','unavailable-proof');continue;
     }
     const collision=destinations.find(({to})=>configuration.dataNode(to));
     if(collision){issue({resource:configuration.id,pointer:collision.to},'migration.parameter.saved-collision','A saved target query value already owns this name; neither selection can be overwritten','target-representation');continue;}
     for(const {name,to}of destinations)projected.move(savedWhole+'/'+escape(name),to);
     projected.remove(savedWhole);
     if(projected.doc.dataNode(pointer+'/querystring')?.children.size===0)projected.remove(pointer+'/querystring');
     continue;
    }
    const output=next.find(next=>next.location===(whole||reserved?'query':'cookie')&&next.name===parameter.name)??(whole&&queries.length===1?queries[0]:undefined);
    if(!output||!output.definition||entry.target.scopeAs(output.definition.resource,output.definition.pointer,'parameter')?.family==='3.2')continue;
    const saved=pointer+'/'+parameter.location+'/'+escape(parameter.name!);
    if(configuration.dataNode(saved)&&!sameMigrationParameterValue(entry.source,parameter.source,entry.target,output.source,configuration.dataJson(saved))){
     issue({resource:configuration.id,pointer:saved},'migration.parameter.saved-proof','The captured saved input does not retain identical request-target/Cookie octets and presence behavior under the reviewed mapping','unavailable-proof');continue;
    }
    if(!whole)continue;
    const name=escape(parameter.name!),from=pointer+'/querystring/'+name,to=pointer+'/query/'+escape(output.name!);
    const value=configuration.dataNode(from);if(!value)continue;
    if(configuration.dataNode(to)){
     issue({resource:configuration.id,pointer:to},'migration.parameter.saved-collision','A saved target query value already owns this name; migration cannot overwrite either captured selection','target-representation');continue;
    }
    // A raw form string is a wire representation, whereas the target needs
    // schema-ready object data. No implicit parsing or value loss is allowed.
    if(value.kind!=='object'){
     issue({resource:configuration.id,pointer:from},'migration.parameter.saved-proof','This saved whole-query input has no identity-value structured mapping; its raw representation requires an independent reviewed decoding certificate','unavailable-proof');continue;
    }
    const targetSchema=entry.target.docs.get(output.definition.resource)!.dataNode(output.definition.pointer+'/schema');
    if(targetSchema?.value?.type==='array'){
     const field=from+'/'+escape(output.name!),selected=configuration.dataNode(field);
     if([...value.children.keys()].some(name=>name!==output.name)||selected&&selected.kind!=='array'){
      issue({resource:configuration.id,pointer:from},'migration.parameter.saved-proof','The saved object has fields outside the reviewed single array owner','unavailable-proof');continue;
     }
     if(!selected){
      issue({resource:configuration.id,pointer:from},'migration.parameter.saved-proof','An explicitly saved empty object has no extracted field owner; preserving that saved selection requires a separate presence certificate','unavailable-proof');continue;
     }
     projected.move(field,to);
     projected.remove(from);
    }else projected.move(from,to);
    if(projected.doc.dataNode(pointer+'/querystring')?.children.size===0)projected.remove(pointer+'/querystring');
   }
   const after=projected.doc.dataJson(pointer);proposals.set(JSON.stringify([after,rawQueries,cookieGroups,cookieUnwraps,emptyQueries]),{after,rawQueries,cookieGroups,cookieUnwraps,emptyQueries});changed=changed||after!==configuration.dataJson(pointer);
  }
  if(changed&&proposals.size!==1){
   issue({resource:configuration.id,pointer},'migration.parameter.saved-context','One shared saved case requires incompatible parameter locations in its captured entry contexts','target-representation');continue;
  }
  if(changed){const {after,rawQueries,cookieGroups,cookieUnwraps,emptyQueries}=[...proposals.values()][0];
   result.push({pointer,before:configuration.dataJson(pointer),after,...(rawQueries.length?{rawQueries}:{}),...(cookieGroups.length?{cookieGroups}:{}),...(cookieUnwraps.length?{cookieUnwraps}:{}),...(emptyQueries.length?{emptyQueries}:{})});}
 }
 return result;
}
