import {createGraph,type Resource} from './engine';
import {SourceDocument,SourceError} from './document';
import {migrationValueIdentity} from './migration_source';
import {documentUriBase,resolveUri,type ReferenceGraph} from './reference_graph';
import {documentUriOccurrences} from './document_uris';
import {caseFileLocators} from './case_file_configuration';

/** A resource can also supply opaque example/upload bytes. Logical YAML
 * equivalence does not authorize changing that independent byte consumer. */
export function assertRefactoringByteConsumers(before:ReferenceGraph,resources:readonly Resource[],read:(resource:string)=>Pick<SourceDocument,'text'>,
 code='refactor.literal.bytes',unpublished:ReadonlySet<string>=new Set()):void {
 const changed=resources.filter(resource=>read(resource.id).text!==resource.text);
 if(!changed.length)return;
 const locators=new Set(changed.flatMap(resource=>[resource.id,...resource.aliases??[]].map(uri=>resolveUri(uri,resource.id).href)));
 const missing=new Set(changed.filter(resource=>unpublished.has(resource.id)).flatMap(resource=>[resource.id,...resource.aliases??[]].map(uri=>resolveUri(uri,resource.id).href)));
 for(const {scope,pointer,value}of documentUriOccurrences(before)){
  if(scope.kind!=='example'||!pointer.endsWith('/externalValue'))continue;
  const range=before.docs.get(scope.resource)!.dataNode(pointer)!.range,source={resource:scope.resource,pointer,range};
  let uri:URL;
  try{uri=resolveUri(value,documentUriBase(before,scope));uri.hash='';}
  catch{throw new SourceError('refactor.byte-context','An external-example locator has no proved byte ownership in this capture',range,'unsupported',source);}
  if(missing.has(uri.href))throw new SourceError('refactor.byte-context','The new source destination is already selected by an external example without captured original byte ownership',range,'unsupported',source);
  if(locators.has(uri.href))throw new SourceError(code,'A contract source edit would change the exact bytes of an independently consumed serialized example',range,'unsupported',source);
 }
}

export function assertRefactoringCaseFiles(manifest:Resource|undefined,resources:readonly Resource[],read:(resource:string)=>Pick<SourceDocument,'text'>,
 code='refactor.literal.bytes'):void {
 if(!manifest)return;
 const changed=new Set(resources.filter(resource=>read(resource.id).text!==resource.text).map(resource=>resource.id));
 if(!changed.size)return;
 const doc=new SourceDocument(manifest.text,manifest.id);
 for(const locator of caseFileLocators(doc))if(changed.has(locator.resource))
  throw new SourceError(code,'A contract source edit would change the exact bytes of a saved upload',locator.range,'unsupported',{resource:manifest.id,pointer:locator.pointer,range:locator.range});
}

/** Contract edits must preserve independently interpreted data, including
 * exact numeric tokens. The location map describes an authorized CST move;
 * an ownership split instead leaves the literal at its original location. */
export function assertRefactoringLiterals(before:ReferenceGraph,read:(resource:string)=>SourceDocument,
 relocate:(resource:string,pointer:string)=>{resource:string;pointer:string}=(resource,pointer)=>({resource,pointer})):void {
 let work=0,bytes=0;
 for(const [resource,doc]of before.docs)for(const pointer of before.literalContainers(resource)){
  const next=relocate(resource,pointer),after=read(next.resource);
  if(++work>200000)throw new SourceError('limit.refactor.literal','Literal ownership proof exceeds its bounded occurrence count');
  const original=migrationValueIdentity(doc,pointer),current=after.dataNode(next.pointer)&&migrationValueIdentity(after,next.pointer);
  if((bytes+=original.length+(current?.length??0))>64*1024*1024)throw new SourceError('limit.refactor.literal','Literal ownership proof exceeds its bounded value size');
  if(original!==current){
   const range=doc.dataNode(pointer)!.range;
   throw new SourceError('refactor.literal.ownership','A contract repair would change an independently interpreted exact literal value; separate its contract consumer before publication',range,'unsupported',{resource,pointer,range});
  }
 }
}

/** Refactoring is an explicit captured-graph transformation, unlike ordinary
 * source editing. Ambiguous physical reference ownership must be reviewed
 * before any CST repair can claim to preserve every interpretation. */
export function captureRefactoringGraph(input:Parameters<typeof createGraph>[0]):ReturnType<typeof createGraph> {
    const captured=createGraph(input);
    captured.graph.assertReferenceEditsSupported();
    return captured;
}
