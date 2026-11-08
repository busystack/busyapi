import {escape,SourceDocument} from './document';
import {FiniteMigrationDomain} from './migration_finite_domain';
import {MigrationSchemaProofs,migrationExactValueIdentity} from './migration_schema_proofs';
import {evaluateSchemas} from './schema_evaluation';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {ExternalExampleResourcePacket} from './external_examples';

export type NamedPart=Readonly<{name:string;values:readonly GraphScope[];literalType?:string}>;
export type FiniteNamedLanguage=Readonly<{
 accepted:readonly string[];projected:readonly string[];names:readonly string[];
 positions:readonly (readonly NamedPart[])[];
 counts?:readonly (readonly number[])[];unique?:boolean;
}>;
export type NamedLanguageProof=Readonly<{language?:FiniteNamedLanguage;restriction?:boolean;reason:string}>;
export const multipartFieldName=(name:string):boolean=>name.length>0&&name.length<=4096&&!/[\x00-\x1f\x7f\uD800-\uDFFF]/u.test(name);
const exact=(text:string)=>migrationExactValueIdentity(new SourceDocument(text,'finite-multipart',true,'json'),'');

/** Exhaustive finite schema values, not observed requests. Native evaluation
 * filters the complete superset, including const/enum, oneOf, correlations,
 * uniqueness and counts. Enumeration never supplies a bound to the source. */
export async function proveFiniteNamedLanguage(graph:ReferenceGraph,schema:GraphScope,item:GraphScope|undefined,
 examples:readonly ExternalExampleResourcePacket[]=[]):Promise<NamedLanguageProof> {
 const candidates=new FiniteMigrationDomain(graph).values(schema);
 if(candidates===undefined)return {reason:'Finite name/value completeness is unavailable: the source domain is unbounded, recursive or exceeds the 2048-value / 8 MiB enumeration budget'};
 const proofs=new MigrationSchemaProofs(graph),roots=proofs.alternatives(schema);
 if(!roots)return {reason:'The finite field constraints have no captured fixed same-instance alternative cover'};
 const resources=[...graph.docs].map(([id,doc])=>({id,text:doc.text,generation:0}));
 const accepted:string[]=[];let workBytes=0,states=0;
 const inspect=()=>++states<=50000;
 for(let offset=0;offset<candidates.length;offset+=4){
  const batch=candidates.slice(offset,offset+4),instances=batch.flatMap((text,index)=>{
   const doc=new SourceDocument(text,'finite-part-'+index,true,'json');
   return [{subject:'request-body' as const,location:'finite-array-'+index,text,schema},
    ...(item&&doc.dataNode('')?.kind==='array'?[...doc.dataNode('')!.children.values()].map(node=>({
     subject:'request-body' as const,location:'finite-item-'+index,text:doc.dataJson(node.pointer),schema:item})):[])];
  });
  if(instances.length>2048)return {reason:'Finite itemSchema evaluation exceeds the 2048-instance batch budget'};
  workBytes+=resources.reduce((bytes,resource)=>bytes+resource.text.length,0)+instances.reduce((bytes,instance)=>bytes+instance.text.length,0)+
   examples.reduce((bytes,resource)=>bytes+(resource.state==='available'?resource.byteLength:0),0);
  if(workBytes>128*1024*1024)return {reason:'Finite multipart evaluation exceeds the 128 MiB captured-source work budget'};
  const result=await evaluateSchemas({root:graph.root,snapshot:'migration-multipart-domain:'+offset,resources,exampleResources:examples,runtimeInstances:instances});
  if(!result.complete||result.findings.some(finding=>finding.severity==='error')||result.runtimeEvaluations.length!==instances.length||result.runtimeEvaluations.some(value=>!value.complete))
   return {reason:'The canonical evaluator could not establish complete finite multipart source membership'};
  for(const [index,text]of batch.entries())if(result.runtimeEvaluations.filter(value=>value.location==='finite-array-'+index||value.location==='finite-item-'+index).every(value=>value.valid===true))accepted.push(text);
 }
 if(!accepted.length)return {reason:'The finite source has no accepted named-part arrangement from which to establish serialization'};
 const names=new Set<string>(),positions:NamedPart[][]=[],languages=new Set(accepted.map(exact));
 const projected=new Map<string,string>();
 for(const text of accepted){
  const doc=new SourceDocument(text,'finite-multipart',true,'json'),array=doc.dataNode('');
  if(array?.kind!=='array')return {reason:'The complete finite multipart language is not exclusively an array'};
  for(const [index,node]of [...array.children.values()].entries()){
   if(!inspect())return {reason:'Finite multipart field discovery exceeds 50000 captured states'};
   if(node.kind!=='object'||node.children.size!==1)return {reason:'An accepted finite part is not a closed single-property name/value object'};
   const name=[...node.children.keys()][0];if(!multipartFieldName(name))return {reason:'A schema-established field name is outside the canonical multipart quoted-name policy'};
   names.add(name);
   // A cover can overapproximate exclusive alternatives. Keeping all value
   // schema owners is conservative for media/annotation compatibility;
   // exact whole-object enums below decide the permitted combinations.
   const options:NamedPart[]=[];
   for(const root of roots){
    let covers:GraphScope[][]=[[]];
    for(const owner of root){
     const value=graph.docs.get(owner.resource)!.dataNode(owner.pointer)?.value;
     const child=graph.scopeAs(owner.resource,owner.pointer+(index<(value?.prefixItems?.length??0)?'/prefixItems/'+index:'/items'),'schema');
     if(!child)continue;
     const choices=proofs.alternatives(child);if(!choices||covers.length*choices.length>2048)return {reason:'Finite part alternatives exceed the captured alternative-cover budget'};
     covers=covers.flatMap(left=>choices.map(right=>[...left,...right]));
    }
    if(item){
     const choices=proofs.alternatives(item);if(!choices||covers.length*choices.length>2048)return {reason:'The itemSchema field alternatives have no bounded fixed cover'};
     covers=covers.flatMap(left=>choices.map(right=>[...left,...right]));
    }
    for(const cover of covers){
     if(!inspect())return {reason:'Finite multipart field discovery exceeds 50000 captured states'};
     const declared=cover.flatMap(owner=>{
      const value=graph.docs.get(owner.resource)!.dataNode(owner.pointer)?.value;
      return Object.keys(value?.properties??{});
     });
     if(declared.length&&!declared.includes(name))continue;
     const values=cover.flatMap(owner=>{
      const child=graph.scopeAs(owner.resource,owner.pointer+'/properties/'+escape(name),'schema');return child?[child]:[];
     });
     if(values.some(scope=>proofs.conjuncts(scope).some(part=>{
      const value=graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;return value?.readOnly===true||value?.writeOnly===true;
     })))return {reason:'A finite field value has direction-sensitive access annotations without a named inverse'};
     const literal=doc.dataNode(node.pointer+'/'+escape(name))!;
     options.push({name,values,...(!values.length?{literalType:literal.kind==='number'?'number':literal.kind}: {})});
    }
   }
   if(!options.length)return {reason:'An accepted finite name has no complete associated value-schema cover'};
   const at=positions[index]??=[];
   for(const option of options)if(!at.some(part=>JSON.stringify(part)===JSON.stringify(option)))at.push(option);
  }
 }
 if(!names.size)return {reason:'No accepted finite part establishes a serializable field name'};
 const ordered=[...names].sort();
 for(const text of accepted){
  const doc=new SourceDocument(text,'finite-multipart',true,'json'),groups=new Map(ordered.map(name=>[name,[] as string[]]));
  for(const node of doc.dataNode('')!.children.values()){
   const name=[...node.children.keys()][0];groups.get(name)!.push('{'+JSON.stringify(name)+':'+doc.dataJson(node.pointer+'/'+escape(name))+'}');
  }
  // Every target interleaving preserves the order inside each group. A
  // missing member is a counterexample, not an unavailable implication.
  const visit=(prefix:string[],indices:number[]):NamedLanguageProof|undefined=>{
   if(!inspect())return {reason:'The complete interleaving proof exceeds 50000 captured states'};
   if(indices.every((index,field)=>index===groups.get(ordered[field])!.length)){
    if(!languages.has(exact('['+prefix.join(',')+']')))return {restriction:true,reason:'A same-field-order-preserving cross-name interleaving is forbidden by the complete source language'};
    return;
   }
   for(let field=0;field<ordered.length;field++){
    const values=groups.get(ordered[field])!,index=indices[field];if(index===values.length)continue;
    const next=[...indices];next[field]++;const failure=visit([...prefix,values[index]],next);if(failure)return failure;
   }
  };
  const failure=visit([],ordered.map(()=>0));if(failure)return failure;
  let objects=['{}'];
  for(const name of ordered){
   const values=groups.get(name)!.map(text=>{const doc=new SourceDocument(text,'finite-part',true,'json');return doc.dataJson('/'+escape(name));});
   const present=objects.map(object=>object.slice(0,-1)+(object==='{}'?'':',')+JSON.stringify(name)+':['+values.join(',')+']}');
   objects=values.length?present:[...objects,...present];
   if(objects.length>2048)return {reason:'Explicit empty / omitted field equivalence exceeds the 2048-object budget'};
  }
  for(const object of objects)projected.set(exact(object),object);
  if(projected.size>2048||[...projected.values()].reduce((bytes,text)=>bytes+text.length,0)>8*1024*1024)return {reason:'The exact correlated target language exceeds the 2048-object / 8 MiB budget'};
 }
 return {language:{accepted,projected:[...projected.values()],names:ordered,positions},reason:'The exhaustive source language is closed under all same-field-order-preserving interleavings'};
}
