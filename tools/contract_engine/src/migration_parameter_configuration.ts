import {escape,SourceDocument} from './document';
import {ParameterSemantics} from './parameter_semantics';
import {MigrationSource} from './migration_source';
import type {MigrationIssue} from './migration_schema';
import {migrationConfiguredOperations,type MigrationConfigurationProjection,type MigrationServerSelectionContext} from './migration_server_configuration';
import {sameMigrationParameterValue} from './migration_parameter_serialization';

/** Location moves and certified single array field extraction preserve exact values,
 * field order, unrelated selections and environment bindings remain captured.
 * The final parameter invariant has already proved the complete owner codec. */
export function projectMigrationParameterConfiguration(entries:readonly MigrationServerSelectionContext[],configuration:SourceDocument|undefined,
 issue:MigrationIssue):MigrationConfigurationProjection[] {
 if(!configuration)return [];
 const result:MigrationConfigurationProjection[]=[];
 for(const test of configuration.dataNode('/tests')?.children.values()??[]){
  const pointer=test.pointer+'/parameters';if(!configuration.dataNode(pointer))continue;
  const proposals=new Set<string>();let changed=false;
  for(const entry of entries){
   const operations=migrationConfiguredOperations(configuration,entry.source,test.value?.operation);
   if(operations.length!==1)continue;
   const pair=entry.pairs.find(pair=>pair.before.occurrence===operations[0].occurrence);if(!pair)continue;
   const source=new ParameterSemantics(entry.source),target=new ParameterSemantics(entry.target);
   const old=source.operation(pair.before.source.resource,pair.before.source.pointer,pair.before.pathItem).visible;
   const next=target.operation(pair.after.source.resource,pair.after.source.pointer,pair.after.pathItem).visible;
   const projected=new MigrationSource(configuration);
   for(const parameter of old){
    const original=parameter.definition&&entry.source.docs.get(parameter.definition.resource)!.dataNode(parameter.definition.pointer)?.value;
    const whole=parameter.location==='querystring',cookie=parameter.location==='cookie'&&original?.style==='cookie';
    if(!whole&&!cookie)continue;
    const queries=next.filter(next=>next.location==='query');
    const output=next.find(next=>next.location===(whole?'query':'cookie')&&next.name===parameter.name)??(whole&&queries.length===1?queries[0]:undefined);
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
   const after=projected.doc.dataJson(pointer);proposals.add(after);changed=changed||after!==configuration.dataJson(pointer);
  }
  if(changed&&proposals.size!==1){
   issue({resource:configuration.id,pointer},'migration.parameter.saved-context','One shared saved case requires incompatible parameter locations in its captured entry contexts','target-representation');continue;
  }
  if(changed)result.push({pointer,before:configuration.dataJson(pointer),after:[...proposals][0]});
 }
 return result;
}
