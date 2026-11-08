import {escape,SourceError} from './document';
import type {ReferenceGraph} from './reference_graph';
import type {MigrationSource} from './migration_source';
import type {MigrationIssue} from './migration_schema';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {migrationScopes} from './migration_documents';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {FiniteMigrationDomain} from './migration_finite_domain';
import {SchemaPropertyRequirements} from './schema_property_requirements';
import {runtimeMediaKind} from './runtime_media';
import {migrationMediaTypes} from './migration_media_objects';
import {PositionalEncodingEquivalence} from './migration_positional_encoding';
import {NamedMultipartEquivalence} from './migration_named_multipart';

/** Versioned native fields use captured roles and the existing material/CST
 * owners. A redundant instruction retains its authored value as history;
 * active instructions require a standard target owner, never an extension
 * pretending to implement the missing target behavior. */
export function migrateNewerObjects(graphs:readonly ReferenceGraph[],sources:Map<string,MigrationSource>,
 families:readonly string[],target:string,owners:MigrationSchemaOwners,issue:MigrationIssue):void {
 const mediaTypes=migrationMediaTypes(graphs,sources);let work=0;
 for(const scope of migrationScopes(graphs)){
  if(!families.includes(scope.family))continue;
  const graph=graphs.find(graph=>{
   const captured=graph.scopeAs(scope.resource,scope.pointer,scope.kind);
   return captured?.family===scope.family&&captured.base===scope.base&&captured.schemaParent===scope.schemaParent;
  })!;
  const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
  const materials=owners.materialLocations(scope).filter(material=>material.source.doc.dataNode(material.location.pointer)&&!owners.retainedValue(material.location));
  const material=materials.find(material=>material.location.resource===scope.resource&&material.location.pointer===scope.pointer)??(materials.length===1?materials[0]:undefined);
  if(!material||!value||typeof value!=='object')continue;
  const {source,location:{pointer}}=material;
  const field=(name:string)=>({...scope,pointer:scope.pointer+'/'+escape(name)});
  const history=(name:string,label:string)=>{
   const at=pointer+'/'+escape(name);if(source.doc.dataNode(at))owners.retainNativeHistory(field(name),source,at,label,graph);
  };
  // 3.1/3.2 can be component-only descriptions. Earlier roots require Paths;
  // an empty map preserves their empty executable-route set.
  if(scope.kind==='root'&&['2.0','3.0'].includes(target)&&!source.doc.dataNode(pointer+'/paths'))source.set(pointer+'/paths',{});
  if(scope.kind==='root'&&['2.0','3.0'].includes(target)&&Object.hasOwn(value,'webhooks')){
   if(Object.keys(value.webhooks).length)issue(field('webhooks'),'migration.webhooks','The target has no independent Webhook entry category; callback or ordinary route placement would change invocation semantics','target-representation');
   else history('webhooks','empty_webhooks');
  }
  if(['2.0','3.0'].includes(target)&&['3.1','3.2'].includes(scope.family)){
   if(scope.kind==='info'&&Object.hasOwn(value,'summary')){
    if(value.summary===value.title)history('summary','redundant_info_summary');
    else issue(field('summary'),'migration.info.summary','The target Info Object has no separate display summary','target-representation');
   }
   if(scope.kind==='license'&&Object.hasOwn(value,'identifier'))issue(field('identifier'),'migration.license.identifier','The target License Object has no SPDX identifier field; no captured equivalent license URL is established','unavailable-proof');
  }
  if(scope.family!=='3.2'||target==='3.2')continue;
  if(scope.kind==='path-item'&&Object.hasOwn(value,'additionalOperations')){
   if(Object.keys(value.additionalOperations).length)issue(field('additionalOperations'),'migration.operation.additional','The older target has no slot for these case-sensitive additional HTTP methods','target-representation');
   else history('additionalOperations','empty_additional_operations');
  }
  if(scope.kind==='server'&&Object.hasOwn(value,'name'))issue(field('name'),'migration.server.name',
   'The older Server representation has no independently named Server choice; a description cannot preserve that label field','target-representation');
  if(scope.kind==='tag'){
   if(Object.hasOwn(value,'summary')){
    // Older tag viewers already display the unchanged tag name. No rename is
    // allowed: operation tags and implicit connections use that identity.
    if(value.summary===value.name)history('summary','redundant_tag_summary');
    else issue(field('summary'),'migration.tag.summary','The target has no separate Tag display summary; changing the tag name would change its implicit operation connections','target-representation');
   }
   for(const name of ['kind','parent'])if(Object.hasOwn(value,name))issue(field(name),'migration.tag.'+name,
    name==='parent'?'The target has no standard Tag parent relationship':'The target has no machine-readable Tag kind category','target-representation');
  }
  if(scope.kind==='xml'&&Object.hasOwn(value,'nodeType')){
   const parent=graph.scopeAs(scope.resource,scope.pointer.slice(0,-4),'schema');
   if(!parent){issue(field('nodeType'),'migration.xml.owner','No captured Schema Object establishes XML node applicability','unavailable-proof');continue;}
   const proofs=new MigrationSchemaProofs(graph);
   if(proofs.validationConstant(parent)===false){history('nodeType','inactive_xml_node_type');continue;}
   const domains=proofs.domains(parent),array=domains.size===1&&domains.has('array'),nonArray=!domains.has('array');
   if(value.nodeType==='attribute'&&nonArray&&!domains.has('object')||value.nodeType==='element'&&(array||nonArray)||value.nodeType==='none'&&array){
    const nodeType=value.nodeType;history('nodeType','xml_node_type');
    source.set(pointer+'/attribute',nodeType==='attribute');
    if(array)source.set(pointer+'/wrapped',nodeType==='element');
   }else issue(field('nodeType'),'migration.xml.node-type',
    ['text','cdata'].includes(value.nodeType)?'The older XML Object cannot model a distinct text or CDATA node':
    value.nodeType==='none'?'No older XML field removes this non-array node while retaining its children':
    'The array-versus-element domain is not established for this XML wrapping instruction',
    ['text','cdata','none'].includes(value.nodeType)?'target-representation':'unavailable-proof');
  }
  if(scope.kind==='discriminator'&&Object.hasOwn(value,'defaultMapping')){
   const parent=graph.scopeAs(scope.resource,scope.pointer.slice(0,-14),'schema');
   let redundant=false,names:readonly string[]|undefined;
   if(parent&&new SchemaPropertyRequirements(graph).requires(parent,value.propertyName)){
    const proofs=new MigrationSchemaProofs(graph),finite=new FiniteMigrationDomain(graph);
    // A same-instance conjunct's finite property language is an exhaustive
    // superset. Every value must have an explicit dispatch mapping. This does
    // not add required/enum assertions or alter validation to disable fallback.
    for(const part of proofs.conjuncts(parent)){
     const property=graph.scopeAs(part.resource,part.pointer+'/properties/'+escape(value.propertyName),'schema');
     const values=property&&finite.values(property);
     if(values){
      const parsed=values.map(raw=>JSON.parse(raw) as unknown);
      if(parsed.every((name):name is string=>typeof name==='string')){names=parsed;break;}
     }
    }
   }
   if(names){
    // A finite required discriminant can replace active fallback dispatch by
    // explicit mappings for its unmapped values. Existing component-name
    // dispatch retains precedence in every captured entry namespace.
    const contexts=graphs.filter(context=>context.scopeAs(scope.resource,scope.pointer,'discriminator')?.family===scope.family);
    if(names.some(name=>!Object.hasOwn(value.mapping??{},name)&&
        new Set(contexts.map(context=>Boolean(context.docs.get(context.root)!.dataNode('/components/schemas/'+escape(name))))).size>1)){
     issue(field('defaultMapping'),'migration.discriminator.fallback-context','The finite fallback still has different implicit component-name dispatch across captured entries','unavailable-proof');continue;
    }
    for(const name of names)if(!Object.hasOwn(value.mapping??{},name)&&
        !contexts.some(context=>context.docs.get(context.root)!.dataNode('/components/schemas/'+escape(name))))
        source.copy(source,pointer+'/defaultMapping',pointer+'/mapping/'+escape(name),true);
    redundant=true;
   }
   if(redundant){
    // Keep the captured schema connection in an unreachable mapping entry.
    // Literal history alone would lose its independently referenced target.
    let name='_migrated_inactive_default',index=0;
    while(source.doc.dataNode(pointer+'/mapping/'+escape(name))||names?.includes(name))name='_migrated_inactive_default_'+(++index);
    source.move(pointer+'/defaultMapping',pointer+'/mapping/'+escape(name));
   }
   else issue(field('defaultMapping'),'migration.discriminator.fallback','The older Discriminator Object has no fallback mapping for absent or unmapped values; no exhaustive inactive-fallback certificate was established','unavailable-proof');
  }
  if(scope.kind==='security'){
   if(Object.hasOwn(value,'deprecated')){
    if(value.deprecated===false)history('deprecated','inactive_security_deprecation');
    else issue(field('deprecated'),'migration.security.deprecated','The older Security Scheme Object has no standard deprecation instruction','target-representation');
   }
   if(Object.hasOwn(value,'oauth2MetadataUrl'))issue(field('oauth2MetadataUrl'),'migration.security.metadata','The older Security Scheme Object cannot retain OAuth authorization-server metadata discovery','target-representation');
  }
  if(scope.kind==='oauth-flows'&&Object.hasOwn(value,'deviceAuthorization'))
   issue(field('deviceAuthorization'),'migration.security.device-authorization','The older OAuth Flows Object has no device authorization grant','target-representation');
  const named=scope.kind==='media'&&scope.family==='3.2'&&['3.0','3.1'].includes(target)&&
   (value.prefixEncoding!==undefined||value.itemEncoding!==undefined)&&
   [...mediaTypes.get(JSON.stringify([scope.resource,scope.pointer]))??[]].some(type=>type.split(';')[0].trim().toLowerCase()==='multipart/form-data')?
   new NamedMultipartEquivalence(graph).prove(scope,[...mediaTypes.get(JSON.stringify([scope.resource,scope.pointer]))??[]],target):undefined;
  if(scope.kind==='media'&&Object.hasOwn(value,'itemSchema')&&!named?.certificate){
   const types=[...mediaTypes.get(JSON.stringify([scope.resource,scope.pointer]))??[]];
   const kinds=types.map(type=>runtimeMediaKind(type)),item=graph.scopeAs(scope.resource,scope.pointer+'/itemSchema','schema');
   if(!item){issue(field('itemSchema'),'migration.media.item-owner','No captured item Schema Object is available','unavailable-proof');continue;}
   if(!kinds.length||kinds.some((kind,index)=>!['json-lines','json-sequence','event-stream'].includes(kind)&&!types[index].split(';')[0].trim().toLowerCase().startsWith('multipart/'))){
    issue(field('itemSchema'),'migration.media.item-model','No captured sequential media model establishes an equivalent older whole-content array schema for this item constraint','unavailable-proof');continue;
   }
   const schema=graph.scopeAs(scope.resource,scope.pointer+'/schema','schema');
   if(schema&&source.doc.dataNode(pointer+'/schema')){
    const retained=owners.move(schema,source,pointer+'/schema','sequence_content_schema',{context:graph,layout:'array-item'});
    source.set(pointer+'/schema',{allOf:[{$ref:owners.reference(retained,target)},{type:'array'}]});
    source.move(pointer+'/itemSchema',pointer+'/schema/allOf/1/items');
   }else {source.set(pointer+'/schema',{type:'array'});source.move(pointer+'/itemSchema',pointer+'/schema/items');}
  }
  if(scope.kind==='media'||scope.kind==='encoding'){
   // Empty positional rules perform exactly the documented default encoding.
   // Non-default positional or nested part instructions need a part-shape
   // conversion; archiving them would turn active wire behavior into metadata.
   for(const name of ['prefixEncoding','itemEncoding',...(scope.kind==='encoding'?['encoding']:[])])if(Object.hasOwn(value,name)){
    if(named?.certificate&&(name==='prefixEncoding'||name==='itemEncoding'))continue;
    const rules=name==='prefixEncoding'?value[name]:name==='encoding'?Object.values(value[name]):[value[name]];
    const empty=rules.every((rule:unknown)=>rule!==null&&typeof rule==='object'&&Object.keys(rule).length===0);
    const types=scope.kind==='media'?[...mediaTypes.get(JSON.stringify([scope.resource,scope.pointer]))??[]]:
        typeof value.contentType==='string'?value.contentType.split(',').map((type:string)=>type.trim()):[];
    const inactive=types.length>0&&types.every(type=>!type.toLowerCase().startsWith('multipart/')&&!type.includes('*'));
    const positional=scope.kind==='media'&&(name==='prefixEncoding'||name==='itemEncoding')&&!empty&&!inactive?
     new PositionalEncodingEquivalence(graph).prove(scope,name,types,target):undefined;
    if(empty||inactive||positional?.equivalent){
     if((inactive||positional?.equivalent)&&!empty){
      const prefix=scope.pointer+'/'+escape(name);
      const children=[...graph.entryScopes()].filter(child=>child.resource===scope.resource&&child.pointer.startsWith(prefix+'/'));
      for(const child of children){
       if(++work>200000)throw new SourceError('limit.migration.media-objects','Inactive encoding ownership exceeds 200000 captured descendants');
       if(child.kind!=='header')continue;
       const from=pointer+child.pointer.slice(scope.pointer.length);
       if(source.doc.dataNode(from))owners.move(child,source,from,'inactive_encoding_header',{context:graph,layout:'response-header'});
      }
      const schemas=children.filter(child=>child.kind==='schema'&&source.doc.dataNode(pointer+child.pointer.slice(scope.pointer.length)));
      for(const child of schemas)if(!schemas.some(parent=>parent!==child&&child.pointer.startsWith(parent.pointer+'/'))){
       const from=pointer+child.pointer.slice(scope.pointer.length);
       if(source.doc.dataNode(from))owners.move(child,source,from,'inactive_encoding_schema',{context:graph,layout:'array-item'});
      }
     }
     history(name,'default_'+name);
    }
    else issue(field(name),'migration.encoding.'+name,named?.reason??positional?.reason??'No captured part-shape certificate maps these positional or nested encoding instructions into the older named Encoding representation',named?.classification??positional?.classification??'unavailable-proof');
   }
  }
 }
}

/** 3.0 has referenceable Path Items but no components.pathItems map. An
 * unused standard Callback holder keeps each Path Item typed and addressable;
 * no callback is added to an Operation and no route is synthesized. */
export function relocatePathItemComponents(graphs:readonly ReferenceGraph[],sources:Map<string,MigrationSource>,
 families:readonly string[],target:string,owners:MigrationSchemaOwners):void {
 if(target!=='3.0')return;
 for(const scope of migrationScopes(graphs))if(scope.kind==='path-item'&&families.includes(scope.family)&&
  /^\/components\/pathItems\/[^/]+$/.test(scope.pointer)){
  const source=sources.get(scope.resource)!,pointer=source.current(scope.pointer);if(pointer===undefined||!source.doc.dataNode(pointer))continue;
  const destination=owners.allocate(source,'/components/callbacks','path_item',JSON.stringify([scope.resource,scope.pointer]));
  owners.admit(source,4);source.set(destination.pointer,{});source.move(pointer,destination.pointer+'/{$url}');
  source.presentationChanges.push(destination.pointer);
 }
 for(const [resource,source]of sources)if(graphs.some(graph=>families.includes(graph.specifications.get(resource)?.family??''))&&
  source.doc.dataNode('/components/pathItems')?.children.size===0)source.remove('/components/pathItems');
}
