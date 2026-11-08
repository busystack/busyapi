import {escape,SourceDocument} from './document';
import {MigrationSchemaProofs,migrationExactValueIdentity} from './migration_schema_proofs';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {FiniteNamedLanguage,FiniteNamedTuple,NamedPart} from './migration_multipart_language';

/** The finite-language owner has already evaluated the exhaustive domain.
 * A uniform union covers each accepted value; the whole-object enum, rather
 * than that union, establishes the complete tuple language. Guards keep an
 * annotated owner from becoming applicable at another position. No domain is
 * inferred here, and no sampled value can enter this certificate. */
export function proveFiniteNamedTuples(graph:ReferenceGraph,schema:GraphScope,item:GraphScope|undefined,
 language:FiniteNamedLanguage,names:readonly string[]):Readonly<{tuples?:readonly FiniteNamedTuple[];reason?:string}> {
 const proofs=new MigrationSchemaProofs(graph),key=(part:NamedPart)=>JSON.stringify(part);
 const owners=new Set(language.positions.flatMap(parts=>parts.flatMap(part=>part.values.map(scope=>JSON.stringify([scope.resource,scope.pointer])))));
 let work=0,bytes=0,branches=0;
 // Array and singleton-wrapper annotations have no corresponding item
 // location after grouping. Value annotations are handled by guarded owners.
 const wrappers=(scope:GraphScope,active=new Set<string>()):boolean=>{
  const id=JSON.stringify([scope.resource,scope.pointer]);if(owners.has(id))return true;
  if(++work>50000||active.size>=128||active.has(id))return false;
  const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
  if(typeof value==='boolean')return true;
  if(!value||typeof value!=='object')return false;
  const next=new Set(active).add(id);
  for(const field of Object.keys(value)){
   if(field==='additionalProperties'&&typeof value[field]!=='boolean')return false;
   if(['$id','$schema','$anchor','$dynamicAnchor','$defs','definitions','type','required','additionalProperties',
    'minProperties','maxProperties','minItems','maxItems','uniqueItems','const','enum'].includes(field))continue;
   if(field==='$ref'||field==='$dynamicRef'){
    const target=proofs.fixed(scope,field);if(!target||!wrappers(target,next))return false;
   }else if(['allOf','anyOf','oneOf','prefixItems','properties'].includes(field)){
    for(const name of graph.docs.get(scope.resource)!.dataNode(scope.pointer+'/'+field)!.children.keys()){
     if(field==='prefixItems'&&Number(name)>=language.positions.length)continue;
     const child=graph.scopeAs(scope.resource,scope.pointer+'/'+field+'/'+escape(name),'schema');if(!child||!wrappers(child,next))return false;
    }
   }else if(field==='items'){
    const child=graph.scopeAs(scope.resource,scope.pointer+'/items','schema');if(!child||!wrappers(child,next))return false;
   }else if(['not','contains','if','then','else','unevaluatedItems'].includes(field)){
    const child=graph.scopeAs(scope.resource,scope.pointer+'/'+field,'schema');if(!child||!proofs.annotationFree(child,true))return false;
   }else return false;
  }
  return true;
 };
 if(!wrappers(schema)||item&&!wrappers(item))return {reason:'Finite tuple array or part-wrapper annotations have no established named application location'};
 const tuples:FiniteNamedTuple[]=[];
 for(const name of names){
  const alternatives=new Map<string,{part:NamedPart;values:Map<string,string>}>(),applications=new Map<string,string>();
  for(const text of language.accepted){
   const doc=new SourceDocument(text,'finite-tuple',true,'json');
   for(const [index,node]of [...doc.dataNode('')!.children.values()].entries()){
    if(++work>50000)return {reason:'Finite tuple annotation applicability exceeds 50000 captured states'};
    const literal=node.children.get(name);if(!literal)continue;
    const parts=language.positions[index].filter(part=>part.name===name);
    const annotated=parts.filter(part=>part.values.some(scope=>!proofs.annotationFree(scope)));
    // Alternative covers intentionally overapproximate branch applicability.
    // Without an exact annotation trace, only one annotated cover is proved.
    if(annotated.length&&parts.length!==1)return {reason:'Finite tuple annotations need an exact applicable alternative cover'};
    const identity=migrationExactValueIdentity(doc,literal.pointer),application=JSON.stringify(annotated.map(key).sort());
    const previous=applications.get(identity);
    if(previous!==undefined&&previous!==application)return {reason:'The same finite value has position-specific annotations or schema owners that one uniform item application cannot preserve'};
    applications.set(identity,application);
    for(const part of parts){
     if(++work>50000)return {reason:'Finite tuple value guards exceed 50000 captured states'};
     const id=key(part),existing=alternatives.get(id),branch=existing??{part,values:new Map<string,string>()};
     if(!existing&&++branches>2048)return {reason:'Finite tuple value guards exceed the 2048-alternative budget'};
     if(!branch.values.has(identity)){
      const text=doc.dataJson(literal.pointer);bytes+=text.length;
      if(bytes>8*1024*1024)return {reason:'Finite tuple value guards exceed the 8 MiB literal budget'};
      branch.values.set(identity,text);
     }
     alternatives.set(id,branch);
    }
   }
  }
  tuples.push({name,alternatives:[...alternatives.values()].map(({part,values})=>({part,values:[...values.values()]}))});
 }
 return {tuples};
}
