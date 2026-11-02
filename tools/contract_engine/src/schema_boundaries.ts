import {schemaResourceContextIdentity,type GraphScope} from './reference_graph';

/** Known annotations cannot constrain a value. Dialect support is checked by
 * the caller before using this to omit a schema assertion. */
export function annotationOnlySchema(value:unknown):boolean {
 return value===true||value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([key,item])=>
  key.startsWith('x-')||key==='default'||key==='examples'&&Array.isArray(item)||
  ['title','description','$comment','format'].includes(key)&&typeof item==='string'||
  ['deprecated','readOnly','writeOnly'].includes(key)&&typeof item==='boolean');
}

/** Only intrinsic schema containment shares meta-validation. A schema inside
 * another interpretation's annotation can have the same physical ancestors
 * while retaining its independent native resource/dialect context. */
export function schemaRoots<T extends GraphScope>(scopes:Iterable<T>):T[] {
 const all=[...scopes].filter(scope=>scope.kind==='schema');
 const key=(scope:GraphScope,pointer:string)=>JSON.stringify([schemaResourceContextIdentity(scope),pointer]);
 const keys=new Set(all.map(scope=>key(scope,scope.pointer)));
 return all.filter(scope=>scope.schemaParent===undefined||!keys.has(key(scope,scope.schemaParent)));
}

export function nestedSchemaBoundaries(roots:GraphScope[]) {
 const resources=new Map<string,string[]>();
 for(const root of roots){const values=resources.get(root.resource)??[];values.push(root.pointer);resources.set(root.resource,values);}
 for(const values of resources.values())values.sort();
 return (scope:GraphScope)=>{
  const values=resources.get(scope.resource)??[],prefix=scope.pointer+'/';
  let low=0,high=values.length;
  while(low<high){const middle=(low+high)>>>1;if(values[middle]<prefix)low=middle+1;else high=middle;}
  const nested=new Set<string>();
  for(let i=low;i<values.length&&values[i].startsWith(prefix);i++)nested.add(values[i]);
  return nested;
 };
}

/** Only a meta-evaluation view. Each omitted resource is checked separately.
 * Share untouched branches: large annotation/data values are not cloned just
 * to exclude one independent nested resource. No source or parsed node mutates. */
export function schemaMetaView(value:any,pointer:string,opaque?:ReadonlySet<string>) {
 if(!opaque?.size)return value;
 const ancestors=new Set<string>();
 for(let at of opaque)while(at&&at!==pointer){at=at.slice(0,at.lastIndexOf('/'));ancestors.add(at);}
 const project=(value:any,at:string):any=>{
  if(opaque.has(at))return true;
  if(!ancestors.has(at)||value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map((child,i)=>project(child,at+'/'+i));
  return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,project(child,at+'/'+key.replaceAll('~','~0').replaceAll('/','~1'))]));
 };
 return project(value,pointer);
}
