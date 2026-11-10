import {SourceError,escape} from './document';
import {ExternalExampleError,type CapturedExampleResources} from './external_examples';
import {ReferenceGraph,supportedSchemaDialect,type GraphTarget} from './reference_graph';
import {FormSemantics} from './form_semantics';
import {MultipartEncoding} from './multipart_encoding';
import {exampleRepresentation,type ExampleValueField} from './example_representation';
import {schemaExampleCandidates} from './schema_examples';
import {children} from './contexts';
import {externalParameterText} from './serialized_parameter_examples';
import {runtimeMediaBytes,decodeRuntimeMedia,runtimeMediaKind} from './runtime_media';
import {annotationOnlySchema} from './schema_boundaries';

/** The request projection's existing example owner, shared with concrete
 * multipart controls. Resource capture and schema evaluation remain separate. */
export function requestExampleProjection(graph:ReferenceGraph,exampleResources:CapturedExampleResources,
 location:(resource:string,pointer:string)=>any=(resource,pointer)=>({resource,pointer,range:graph.docs.get(resource)?.dataNode(pointer)?.range}),
 follow:(target:GraphTarget,kind:string)=>{resource:string;pointer:string;node:any}=(target,kind)=>{
  const source=new MultipartEncoding(graph).follow(target,kind);
  return {...source,node:graph.docs.get(source.resource)!.dataNode(source.pointer)!};
 }){
 const docs=graph.docs,forms=new FormSemantics(graph);
  const raw=(resource:string,pointer:string)=>docs.get(resource)!.dataJson(pointer);
  const fieldRaw=(resource:string,pointer:string)=>docs.get(resource)!.dataJson(pointer,()=>undefined);
  type ExampleBinding={resource:string;pointer:string;value:any;level:string;mediaType?:string};
  const projectExample=(binding:ExampleBinding,r:string,p:string,field:ExampleValueField,name?:string)=>{
      const {resource,pointer,value,level,mediaType}=binding;
      const node=docs.get(r)!.dataNode(p)!,representation=exampleRepresentation(field,node.value,mediaType);
      let conversionError:string|undefined;
      const canonical=(node:any)=>docs.get(r)!.dataNode(node.pointer)!;
      const fieldValue=(name:string,physical:any)=>{
        const child=canonical(physical);
        const rule=level==='media'?value?.encoding?.[name]:undefined;
        const styled=rule&&['style','explode','allowReserved'].some(k=>Object.hasOwn(rule,k));
        const type=styled?undefined:rule?.contentType?.split(';')[0].toLowerCase();
        const modeled=type!==undefined&&(type==='application/linkset'||type==='application/linkset+json'||type==='application/xml'||type==='text/xml'||type.endsWith('+xml'));
        if(rule&&(rule.encoding||rule.prefixEncoding||rule.itemEncoding)||type&&!modeled&&type!=='text/plain'&&type!=='application/json'&&!type.endsWith('+json'))
          conversionError='This data example requires an unsupported field encoding. Choose a serialized example or edit the literal representation.';
        if(modeled||type==='application/json'||type?.endsWith('+json'))return fieldRaw(r,child.pointer);
        if(child.kind==='object'||child.kind==='array'){
          const property=level==='media'?forms.shape(resource,pointer+'/schema').properties?.[name]:undefined;
          const field=docs.get(r)!.dataNode(p+'/'+escape(name));
          const shape=field?.kind==='array'?property?.items:property;
          const types=shape?.types?.filter((type:string)=>type!=='null');
          if(types?.length!==1||types[0]!==child.kind)conversionError='This structured field needs an unambiguous schema or explicit JSON encoding. Choose a serialized example or edit the literal representation.';
        }
        if(type==='text/plain'&&(child.kind==='object'||child.kind==='array'))conversionError='A structured field cannot be converted to this declared text part automatically.';
        return typeof child.value==='string'?child.value:fieldRaw(r,child.pointer);
      };
      const fields=node.kind==='object'?Object.fromEntries([...node.children.entries()].map(([name,physical])=>{const child=canonical(physical);return [name,child.kind==='array'?[...child.children.values()].map(item=>fieldValue(name,item)):[fieldValue(name,child)]];})):undefined;
      const compositeFields=node.kind==='object'&&[...node.children.values()].some(physical=>{const child=canonical(physical);return child.kind==='object'||child.kind==='array'&&[...child.children.values()].some(physical=>{const item=canonical(physical);return item.kind==='object'||item.kind==='array';});});
      return {name,level,source:location(r,p),raw:representation==='serialized'?node.value:raw(r,p),representation,compositeFields,
        text:typeof node.value==='string'?node.value:raw(r,p),dataKind:typeof node.value==='string'?'string':node.kind,fields,conversionError:level==='media'?conversionError:undefined};
  };
  const example=(resource:string,pointer:string,value:any,level='parameter',selectedName?:string,mediaType?:string,serializedOnly=false)=>{
    const projected=(r:string,p:string,field:ExampleValueField,name?:string)=>projectExample({resource,pointer,value,level,mediaType},r,p,field,name);
    const owner=docs.get(resource)!;
    if(selectedName===undefined&&Object.hasOwn(value??{},'example'))return serializedOnly?undefined:projected(resource,pointer+'/example','example');
    const examples=owner.dataNode(pointer+'/examples');
    if(examples?.kind==='object')for(const [name,entry] of examples.children){
      if(selectedName!==undefined&&selectedName!==name)continue;
      let r=resource,p=pointer+'/examples/'+escape(name),v=entry.value;
      if(v&&typeof v==='object'&&typeof v.$ref==='string'){
        try{const selected=follow({resource:r,pointer:p,kind:'example'},'example');r=selected.resource;p=selected.pointer;v=selected.node.value;}catch{return;}
      }
      const exampleFamily=graph.scope(r,p).family;
      const field=!serializedOnly&&exampleFamily==='3.2'&&Object.hasOwn(v??{},'dataValue')?'dataValue':!serializedOnly&&Object.hasOwn(v??{},'value')?'value':exampleFamily==='3.2'&&Object.hasOwn(v??{},'serializedValue')?'serializedValue':undefined;
      if(field)return projected(r,p+'/'+escape(field),field,name);
      if(Object.hasOwn(v??{},'externalValue')){
        const source=location(r,p+'/externalValue');
        try{
          const captured=exampleResources.read(graph,r,p+'/externalValue');
          const bytes=runtimeMediaBytes(captured.base64,true);
          const external={resource:captured.id,identity:captured.identity,byteLength:captured.byteLength};
          const base={name,level,source,representation:'serialized',dataKind:'string',external,
            wireBase64:captured.base64};
          if(!mediaType){
            const owner=graph.scopeAs(resource,pointer,'parameter')??graph.scopeAs(resource,pointer,'header');
            if(owner){const text=externalParameterText(graph,owner,bytes);return {...base,raw:text,text};}
            return {...base,raw:'',conversionError:'This external example needs a concrete media occurrence before request conversion.'};
          }
          const kind=runtimeMediaKind(mediaType);
          if(mediaType.split(';')[0].trim().toLowerCase()==='application/x-www-form-urlencoded'){
            const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
            return {...base,raw:text,text};
          }
          if(kind==='xml')return {...base,raw:'',text:''};
          if(kind==='json'||kind==='linkset-json'||kind==='linkset'){
            const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
            return {...base,raw:text,text};
          }
          if(kind==='text'){
            const decoded=decodeRuntimeMedia(base.wireBase64,r+'/external-example',mediaType,true);
            const text=decoded.document.root.value;
            if(typeof text==='string')return {...base,raw:text,text};
          }
          return {...base,raw:'',conversionError:'This external byte representation needs a captured binary request body.'};
        }catch(error){
          if(!(error instanceof SourceError)&&!(error instanceof TypeError))throw error;
          return {name,level,source,representation:'serialized',raw:'',conversionError:error.message,
            externalStatus:error instanceof ExternalExampleError?error.condition:error instanceof SourceError&&(error.kind==='unsupported'||error.code.startsWith('limit.'))?'unsupported':'invalid',
            problem:{code:error instanceof SourceError?error.code:'runtime.media.encoding',message:error.message}};
        }
      }

    }
  };
  const examples=(resource:string,pointer:string,value:any,level='parameter',mediaType?:string)=>[
    ...(Object.hasOwn(value??{},'example')?[example(resource,pointer,value,level,undefined,mediaType)]:[]),
    ...[...(docs.get(resource)!.dataNode(pointer+'/examples')?.children.keys()??[])].flatMap(name=>{
      const data=example(resource,pointer,value,level,name,mediaType);
      const serialized=data?.representation==='serialized'?undefined:example(resource,pointer,value,level,name,mediaType,true);
      return [data,serialized];
    }),
  ].filter(value=>value!==undefined);
  type ExampleOwnerKind='parameter'|'media'|'header';
  const schemaFieldScope=(resource:string,pointer:string,value:any,kind:ExampleOwnerKind)=>{
    const owner=graph.scopeAs(resource,pointer,kind);
    // An independently referenced schema role at a non-standard field does
    // not make that field part of the containing Parameter/Header grammar.
    if(!owner||!children(value,kind,owner.family).some(([name,,childKind])=>name==='schema'&&childKind==='schema'))return;
    return graph.scopeAs(resource,pointer+'/schema','schema');
  };
  const examplesWithSchema=(resource:string,pointer:string,value:any,level='parameter',mediaType?:string,ownerKind:ExampleOwnerKind=level==='media'?'media':'parameter')=>{
    // Presence overrides fallback, including empty maps, external examples and
    // unresolved Example Objects. Never replace an explicit choice silently.
    if(graph.scope(resource,pointer).family!=='2.0'&&(Object.hasOwn(value??{},'example')||Object.hasOwn(value??{},'examples')))
      return {examples:examples(resource,pointer,value,level,mediaType)};
    if(!schemaFieldScope(resource,pointer,value,ownerKind))return {examples:[]};
    const selected=schemaExampleCandidates(graph,{resource,pointer:pointer+'/schema',kind:'schema'});
    return {examples:selected.values.map(source=>({...projectExample({resource,pointer,value,level,mediaType},source.resource,source.pointer,
      source.field==='examples'?'dataValue':'example',source.name),origin:'schema',schemaApplicability:'not-evaluated',
      schemaContext:source.context.map(step=>({keyword:step.keyword,...('selector' in step?{selector:step.selector}:{}),source:location(step.resource,step.pointer)}))})),
      schemaExamples:{complete:selected.complete,issues:selected.issues.map(issue=>({code:issue.code,message:issue.message,source:location(issue.resource,issue.pointer)}))}};
  };
  const schema=(resource:string,pointer:string,value:any,kind:ExampleOwnerKind='media')=>{
    const scope=schemaFieldScope(resource,pointer,value,kind);
    return scope?{...location(resource,pointer+'/schema'),kind:'schema',unconstrained:supportedSchemaDialect(scope)&&annotationOnlySchema(value.schema)}:undefined;
  };
  return {projectExample,examplesWithSchema,schema};
}
