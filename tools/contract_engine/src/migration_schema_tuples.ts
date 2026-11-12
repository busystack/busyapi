import {compare,decimal} from './exact_numbers';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {SourcePlan} from './source_plan';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';
import type {MigrationArrayBounds} from './migration_schema_arrays';
import {uniformTupleTail} from './migration_tuple_uniform_tail';
import {MigrationSchemaProofs,migrationExactValueIdentity} from './migration_schema_proofs';
import {sourceValueIdentity} from './source_plan';
import {schemaResourceContextIdentity} from './reference_graph';
import {constantSchemaAssertion} from './schema_constant_assertions';
import type {GraphReference} from './reference_graph';
import {discardInactiveMigrationSchema} from './migration_schema_conditions';
import {SourceDocument} from './document';

/** Preserve annotated finite positional applications at neutral array owners.
 * Membership has already been exhaustively checked by FiniteMigrationDomain's
 * caller. An exact value guard retains the original schema reference only
 * where it applied. If one value needs different annotated owners at different
 * indices, uniform items has no established annotation inverse. */
export function finiteTupleItemApplications(graph:ReferenceGraph,scope:GraphScope,accepted:readonly string[]):
    readonly Readonly<{schema:GraphScope;values:readonly string[]}>[]|undefined {
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(!Array.isArray(value?.prefixItems))return;
    const proofs=new MigrationSchemaProofs(graph),applications=new Map<string,string>();
    const branches=new Map<string,{schema:GraphScope;values:Map<string,string>}>();let work=0,bytes=0;
    for(const text of accepted){
        const doc=new SourceDocument(text,'finite-tuple-items',true,'json');if(doc.dataNode('')?.kind!=='array')return;
        for(const [index,node]of [...doc.dataNode('')!.children.values()].entries()){
            if(++work>50000)return;
            const child=graph.scopeAs(scope.resource,scope.pointer+(index<value.prefixItems.length?'/prefixItems/'+index:'/items'),'schema');
            if(!child)return;
            const id=JSON.stringify([child.resource,child.pointer]),exact=migrationExactValueIdentity(doc,node.pointer);
            const application=proofs.annotationFree(child,true)?'':id,previous=applications.get(exact);
            if(previous!==undefined&&previous!==application)return;
            applications.set(exact,application);
            const branch=branches.get(id)??{schema:child,values:new Map<string,string>()};
            if(!branch.values.has(exact)){const literal=doc.dataJson(node.pointer);bytes+=literal.length;if(bytes>8*1024*1024)return;branch.values.set(exact,literal);}
            branches.set(id,branch);if(branches.size>2048)return;
        }
    }
    return [...branches.values()].map(({schema,values})=>({schema,values:[...values.values()]}));
}

/** A proved bound makes these schema applications unreachable, including
 * their annotations. Preserve independent targets before ordinary vocabulary
 * lowering; an unsupported dead position must not block its containing tuple.
 * Materialize the bound before retiring a false prefix that proved it. */
export function discardUnreachableTupleSchemas(graph:ReferenceGraph,scope:GraphScope,source:SourcePlan,owners:MigrationSchemaOwners,
    references:readonly GraphReference[],bounds:MigrationArrayBounds):void {
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(graph.referenceObject(value,scope))return;
    const keyword=Array.isArray(value?.prefixItems)?'prefixItems':scope.family==='2.0'&&Array.isArray(value?.items)?'items':undefined;
    const pointer=source.current(scope.pointer,scope.resource),maximum=keyword?bounds.maximum(scope):undefined;
    if(!keyword||pointer===undefined||source.doc.dataNode(pointer+'/'+keyword)?.kind!=='array'||maximum===undefined||maximum>value[keyword].length)return;
    const limit=String(maximum),existing=source.doc.dataNode(pointer+'/maxItems');
    if(!existing||compare(decimal(source.doc.dataJson(existing.pointer)),decimal(limit))>0){owners.admit(source);source.exact(pointer+'/maxItems',limit);}
    const retire=(original:string)=>{
        discardInactiveMigrationSchema(graph,{resource:scope.resource,pointer:original},source,owners,references);
        const current=source.current(original,scope.resource);
        if(current!==undefined&&current.startsWith(pointer+'/'))
            owners.move({resource:scope.resource,pointer:original},source,current,'unreachable_tuple',{context:graph,layout:'array-item'});
    };
    for(let index=value[keyword].length-1;index>=maximum;index--)retire(scope.pointer+'/'+keyword+'/'+index);
    if(keyword==='prefixItems')for(const field of ['items','unevaluatedItems'])if(Object.hasOwn(value,field))retire(scope.pointer+'/'+field);
}

/** A positive language-shape proof, independent of a failed bound search.
 * With only type/positional fields, different position types admit arbitrary
 * lengths and order-sensitive arrays. Restricted uniform items, counts and a
 * finite set of whole-array literals cannot describe that language. Swagger
 * additionally has positional items, but no constrained additionalItems. */
function simpleUnboundedTuple(graph:ReferenceGraph,scope:GraphScope,keyword:string):boolean {
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(!value||Object.keys(value).some(field=>!['type',keyword,...(keyword==='prefixItems'?['items']:[])].includes(field)))return false;
    if(value.type!==undefined&&value.type!=='array')return false;
    const type=(schema:unknown):string|undefined=>{
        if(schema===true||schema&&typeof schema==='object'&&!Array.isArray(schema)&&!Object.keys(schema).length)return '*';
        if(!schema||typeof schema!=='object'||Array.isArray(schema))return;
        const value=schema as Record<string,unknown>,name=value.type as string;
        if(Object.keys(value).length!==1){
            // One-sided numeric bounds leave infinitely many witnesses of
            // the declared type. Do not infer satisfiability for arbitrary
            // constraints, competing bounds, enums or patterns.
            if(!['number','integer'].includes(name)||
                ![['type','minimum','exclusiveMinimum'],['type','maximum','exclusiveMaximum']]
                    .some(fields=>Object.keys(value).every(field=>fields.includes(field))))return;
        }
        return ['null','boolean','object','array','number','integer','string'].includes(name)?name:undefined;
    };
    const proofs=new MigrationSchemaProofs(graph);
    const selectedType=(pointer:string):string|undefined=>{
        let current=graph.scopeAs(scope.resource,pointer,'schema');const seen=new Set<string>();
        while(current){
            const id=JSON.stringify([current.resource,current.pointer]);if(seen.has(id)||seen.size>=128)return;
            seen.add(id);const body=graph.docs.get(current.resource)!.dataNode(current.pointer)?.value;
            if(body&&typeof body==='object'&&Object.keys(body).length===1&&typeof body.$ref==='string')current=proofs.fixed(current,'$ref');
            else return type(body);
        }
    };
    const positions=value[keyword].map((_:unknown,index:number)=>selectedType(scope.pointer+'/'+keyword+'/'+index));
    const tail=keyword==='items'||!Object.hasOwn(value,'items')?'*':selectedType(scope.pointer+'/items');
    return tail!==undefined&&positions.every(type=>type!==undefined)&&positions.some(type=>type!==tail);
}

/** Factor an already-applied tail conjunct out of each prefix. The tail then
 * applies once uniformly, retaining its metadata once at each item location.
 * Independent prefix targets keep their full neutral schema. */
function factorTupleTail(graph:ReferenceGraph,scope:GraphScope,source:SourcePlan,pointer:string,prefixes:readonly GraphScope[],
    tail:GraphScope,owners:MigrationSchemaOwners,target:string):boolean {
    const proofs=new MigrationSchemaProofs(graph);
    const resolve=(initial:GraphScope):GraphScope|undefined=>{
        let current=initial;const seen=new Set<string>();
        while(true){
            const id=JSON.stringify([current.resource,current.pointer]);if(seen.has(id)||seen.size>=128)return;
            seen.add(id);
            const value=graph.docs.get(current.resource)!.dataNode(current.pointer)?.value;
            if(!value||typeof value!=='object'||Object.keys(value).length!==1||typeof value.$ref!=='string')return current;
            const next=proofs.fixed(current,'$ref');if(!next)return;current=next;
        }
    };
    const selected=resolve(tail);if(!selected)return false;
    if(proofs.sameInstanceDiscriminator(selected))return false;
    const factors:{scope:GraphScope;suffixes:readonly string[]}[]=[];
    for(const prefix of prefixes){
        const value=graph.docs.get(prefix.resource)!.dataNode(prefix.pointer)?.value,current=source.current(prefix.pointer,prefix.resource);
        if(current===undefined||proofs.sameInstanceDiscriminator(prefix))return false;
        let factor:GraphScope|undefined;
        for(let index=0;index<(value?.allOf?.length??0);index++){
            const child=graph.scopeAs(prefix.resource,prefix.pointer+'/allOf/'+index,'schema');
            const reached=child&&resolve(child);
            if(reached&&reached.resource===selected.resource&&reached.pointer===selected.pointer){factor=child;break;}
        }
        if(factor){
            const at=source.current(factor.pointer,factor.resource);
            if(at===undefined||!at.startsWith(current+'/'))return false;
            factors.push({scope:prefix,suffixes:[at.slice(current.length)]});continue;
        }
        const tailValue=graph.docs.get(selected.resource)!.dataNode(selected.pointer)?.value,fields=Object.keys(tailValue??{});
        if(proofs.contextualDiscriminator(selected)||proofs.contextualDiscriminator(prefix))return false;
        if(!value||typeof value!=='object'||!fields.length||fields.some(field=>['$id','$schema','$anchor','$dynamicAnchor','$ref','$dynamicRef','discriminator'].includes(field))||
            schemaResourceContextIdentity(prefix)!==schemaResourceContextIdentity(selected))return false;
        const suffixes:string[]=[];
        for(const field of fields){
            const escaped=field.replace(/~/g,'~0').replace(/\//g,'~1'),original=prefix.pointer+'/'+escaped;
            if(!Object.hasOwn(value,field)||sourceValueIdentity(graph.docs.get(prefix.resource)!,original)!==
                sourceValueIdentity(graph.docs.get(selected.resource)!,selected.pointer+'/'+escaped))return false;
            const at=source.current(original,prefix.resource);if(at===undefined||!at.startsWith(current+'/'))return false;
            suffixes.push(at.slice(current.length));
        }
        factors.push({scope:prefix,suffixes});
    }
    const context=owners.contextOf(scope);if(!context)return false;
    const variants=[];
    for(const factor of factors){
        const current=source.current(factor.scope.pointer,factor.scope.resource);if(current===undefined)return false;
        owners.move(factor.scope,source,current,'tuple_position',{layout:'array-item',context});
        const neutral=owners.uniqueLocation(factor.scope);
        const variant=owners.assertionVariant(graph,factor.scope,neutral.source,neutral.location.pointer,'tuple_prefix',target,factor.suffixes);
        variants.push({$ref:owners.reference(variant,target)});
    }
    source.set(pointer+'/prefixItems',variants);return true;
}

/** A restricted uniform items schema is faithful when every reachable
 * position has the same assertions and annotations. A closed tail remains a
 * length bound; unreachable positions keep independent material owners. */
function homogeneousTupleProof(graph:ReferenceGraph,prefixes:readonly GraphScope[],tail:GraphScope|undefined,closed:boolean,maximum:number|undefined):
    Readonly<{selected:GraphScope|undefined}>|undefined {
    const count=maximum===undefined?prefixes.length:Math.min(prefixes.length,maximum);
    const tailReachable=!closed&&(maximum===undefined||maximum>prefixes.length),proofs=new MigrationSchemaProofs(graph);
    const schemas=prefixes.slice(0,count),selected=schemas[0]??(tailReachable?tail:undefined);
    const equivalent=(a:GraphScope,b:GraphScope)=>{
        const left=graph.docs.get(a.resource)!,right=graph.docs.get(b.resource)!;
        const bareAlias=(scope:GraphScope)=>{
            const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
            if(!value||typeof value!=='object'||Object.keys(value).length!==1)return;
            const keyword=['$ref','$dynamicRef'].find(field=>typeof value[field]==='string');return keyword?proofs.fixed(scope,keyword):undefined;
        };
        const x=bareAlias(a),y=bareAlias(b),sameAlias=x&&y&&x.resource===y.resource&&x.pointer===y.pointer;
        return schemaResourceContextIdentity(a)===schemaResourceContextIdentity(b)&&
            sourceValueIdentity(left,a.pointer)===sourceValueIdentity(right,b.pointer)&&
            (sameAlias||!proofs.contextualDiscriminator(a)&&!proofs.contextualDiscriminator(b))||
            proofs.annotationFree(a)&&proofs.annotationFree(b)&&proofs.implies(a,b)&&proofs.implies(b,a);
    };
    if(selected&&(!schemas.every(schema=>equivalent(schema,selected))||tailReachable&&
        (tail?!equivalent(tail,selected):!proofs.annotationFree(selected)||constantSchemaAssertion(graph,selected)!==true)))return;
    return {selected};
}

function homogeneousTuple(graph:ReferenceGraph,scope:GraphScope,source:SourcePlan,pointer:string,
    keyword:string,prefixes:readonly GraphScope[],tail:GraphScope|undefined,closed:boolean,maximum:number|undefined,
    owners:MigrationSchemaOwners,target:string):boolean {
    const proof=homogeneousTupleProof(graph,prefixes,tail,closed,maximum);if(!proof)return false;
    const {selected}=proof;
    const context=owners.contextOf(scope);
    let chosen:ReturnType<MigrationSchemaOwners['move']>|undefined;
    for(const schema of prefixes){
        const at=source.current(schema.pointer,schema.resource);if(at===undefined||!at.startsWith(pointer+'/'+keyword+'/'))continue;
        const owner=owners.move(schema,source,at,'tuple_position',{layout:'array-item',context});
        if(schema===selected)chosen=owner;
    }
    if(tail){
        const at=source.current(tail.pointer,tail.resource);
        if(at===pointer+'/items'){
            const owner=owners.move(tail,source,at,'tuple_tail',{layout:'array-item',context});
            if(tail===selected)chosen=owner;
        }
    }
    const original=scope.pointer+'/'+keyword,current=source.current(original,scope.resource);
    if(current!==undefined)source.remove(current,true,true,true);
    // Prefix positions may have occupied items itself in a Swagger source.
    source.set(pointer+'/items',chosen?{$ref:owners.reference(chosen,target)}:{});
    const upper=closed?Math.min(maximum??Infinity,prefixes.length):maximum;
    if(upper!==undefined){
        const limit=String(upper),existing=source.doc.dataNode(pointer+'/maxItems');
        if(!existing||compare(decimal(source.doc.dataJson(existing.pointer)),decimal(limit))>0)source.exact(pointer+'/maxItems',limit);
    }
    return true;
}

/** An inline prefix-only conjunct and its containing unevaluated tail can be
 * one homogeneous application. Prove equality before moving either selector.
 * Independent roots retain their original language and cannot inherit this
 * containing constraint. Prefix/tail descendants keep allocator identities.
 */
export function migrateComposedUnevaluatedTuple(graph:ReferenceGraph,scope:GraphScope,source:SourcePlan,pointer:string,target:string,
    owners:MigrationSchemaOwners,references:readonly GraphReference[],bounds:MigrationArrayBounds):boolean {
    if(target!=='3.0'||graph.hasOverlappingScope(scope.resource,scope.pointer)||graph.literalContainer(scope.resource,scope.pointer)!==undefined)return false;
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(!Array.isArray(value?.allOf)||!Object.hasOwn(value,'unevaluatedItems')||
        ['items','prefixItems','contains','$ref','$dynamicRef','anyOf','oneOf','if'].some(field=>Object.hasOwn(value,field)))return false;
    const proofs=new MigrationSchemaProofs(graph);let selected:GraphScope|undefined;
    for(let index=0;index<value.allOf.length;index++){
        const at=graph.scopeAs(scope.resource,scope.pointer+'/allOf/'+index,'schema');if(!at)return false;
        const child=graph.docs.get(at.resource)!.dataNode(at.pointer)?.value;
        if(Array.isArray(child?.prefixItems)&&Object.keys(child).length===1){
            if(selected||owners.hasRootConsumer(at,references)||graph.hasOverlappingScope(at.resource,at.pointer)||
                graph.literalContainer(at.resource,at.pointer)!==undefined)return false;
            selected=at;
        }else if(!proofs.annotationFree(at))return false;
    }
    if(!selected)return false;
    const child=graph.docs.get(selected.resource)!.dataNode(selected.pointer)!.value;
    const prefixes=child.prefixItems.map((_:unknown,index:number)=>graph.scopeAs(selected!.resource,selected!.pointer+'/prefixItems/'+index,'schema'));
    const tail=graph.scopeAs(scope.resource,scope.pointer+'/unevaluatedItems','schema');
    const maximum=bounds.maximum(scope),closed=tail&&constantSchemaAssertion(graph,tail)===false;
    if(!tail||prefixes.some(scope=>!scope)||!homogeneousTupleProof(graph,prefixes,tail,!!closed,maximum))return false;
    const prefixAt=source.current(selected.pointer+'/prefixItems',selected.resource),tailAt=source.current(tail.pointer,tail.resource);
    if(prefixAt===undefined||tailAt!==pointer+'/unevaluatedItems')return false;
    owners.admit(source,8);source.move(prefixAt,pointer+'/prefixItems',true);source.move(tailAt,pointer+'/items',true);
    homogeneousTuple(graph,scope,source,pointer,'prefixItems',prefixes,tail,!!closed,maximum,owners,target);
    if(source.doc.dataNode(pointer+'/prefixItems')){owners.admit(source,4);source.remove(pointer+'/prefixItems',true,true,true);}
    return true;
}

/** A finite modern tail has a positional Draft 4 representation: repeat its
 * schema at every reachable tail position, retaining the original maxItems.
 * One hoisted owner preserves annotations and independent references into that
 * schema. Boolean tails remain unrestricted/closed and keep independent owners
 * when referenced. Bounds may be proved through same-instance composition and
 * fixed references; no finite expansion is claimed without that proof. */
export function migrateSchemaTuple(graph:ReferenceGraph,scope:GraphScope,source:SourcePlan,
    pointer:string,target:string,owners:MigrationSchemaOwners,issue:MigrationIssue,bounds:MigrationArrayBounds,
    tailOrigin=scope.pointer+'/items'):void {
    const value=graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
    if(graph.referenceObject(value,scope))return;
    const keyword=Array.isArray(value?.prefixItems)?'prefixItems':scope.family==='2.0'&&Array.isArray(value?.items)?'items':undefined;
    if(!keyword)return;
    if(!source.doc.dataNode(pointer+'/'+keyword)||keyword==='items'&&source.doc.dataNode(pointer+'/items')?.kind!=='array')return;
    const prefixScopes=value[keyword].map((_:unknown,index:number)=>graph.scopeAs(scope.resource,scope.pointer+'/'+keyword+'/'+index,'schema'));
    const legacy=keyword==='items';
    if(legacy&&target==='2.0')return;
    const originalTail=tailOrigin,tailValue=legacy?undefined:graph.docs.get(scope.resource)!.dataNode(originalTail)?.value;
    const tailScope=legacy?undefined:graph.scopeAs(scope.resource,originalTail,'schema');
    const closed=tailScope&&constantSchemaAssertion(graph,tailScope)===false;
    if(target!=='2.0'){
        if(prefixScopes.every(scope=>scope!==undefined)&&homogeneousTuple(graph,scope,source,pointer,keyword,prefixScopes,tailScope,
            !!closed,bounds.maximum(scope),owners,target))return;
        const limitation=simpleUnboundedTuple(graph,scope,keyword);
        issue({...scope,pointer:scope.pointer+'/'+keyword},'migration.schema.tuple',limitation?
            'OpenAPI 3.0 uniform items and finite whole-array literals cannot express this unbounded order-sensitive type tuple':
            'OpenAPI 3.0 has no positional items keyword; uniformity or a finite literal representation has not been established for these reachable positions',
            limitation?'target-representation':'unavailable-proof');return;
    }
    const constrained=tailValue!==undefined&&typeof tailValue!=='boolean';
    const maximum=constrained?bounds.maximum(scope):undefined;
    const prefixes=prefixScopes;
    if(constrained&&prefixScopes.every(scope=>scope!==undefined)&&homogeneousTuple(graph,scope,source,pointer,keyword,prefixScopes,tailScope,
        !!closed,maximum,owners,target))return;
    const uniform=constrained&&maximum===undefined&&tailScope!==undefined&&prefixes.every(scope=>scope!==undefined)&&(
        uniformTupleTail(graph,tailScope,prefixes)||factorTupleTail(graph,scope,source,pointer,prefixes,tailScope,owners,target));
    if(constrained&&maximum===undefined&&!uniform){
        const limitation=simpleUnboundedTuple(graph,scope,keyword);
        issue({...scope,pointer:originalTail},'migration.schema.tuple-tail',limitation?
            'Swagger 2.0 has no constrained additionalItems; this unbounded tail accepts different item types from its positional prefix':
            'The bounded finite-domain, homogeneous, implication and common-conjunct proofs did not establish a faithful Swagger mapping; this is not a proof of target impossibility',
            limitation?'target-representation':'implementation');return;
    }
    const tail=pointer+'/items';
    const referenced=graph.references.some(reference=>reference.kind==='schema'&&reference.resolution==='resolved'&&
        reference.targetResource===scope.resource&&(reference.targetPointer===originalTail||reference.targetPointer?.startsWith(originalTail+'/')));
    // Keep a reference target even if every permitted array ends before it.
    const retained=source.doc.dataNode(tail)&&(constrained||referenced)
        ?owners.move({resource:scope.resource,pointer:originalTail},source,tail,'tuple_tail',{layout:'array-item',context:owners.contextOf(scope)}):undefined;
    if(!retained)source.remove(tail);
    source.rename(pointer+'/prefixItems','items');
    if(constrained&&retained){
        if(uniform){
            const allOf=pointer+'/allOf';owners.admit(source,2);
            if(!source.doc.dataNode(allOf))source.set(allOf,[]);
            source.set(allOf+'/'+source.doc.dataNode(allOf).children.size,{items:{$ref:owners.reference(retained,target)}});
        }else{
            for(let index=value.prefixItems.length;index<maximum!;index++){
                owners.admit(source);
                source.set(pointer+'/items/'+index,{$ref:owners.reference(retained,target)});
            }
        }
    }
    if(tailValue===false||closed){
        const maximum=String(value.prefixItems.length),existing=source.doc.dataNode(pointer+'/maxItems');
        if(!existing||compare(decimal(source.doc.dataJson(existing.pointer)),decimal(maximum))>0)source.exact(pointer+'/maxItems',maximum);
    }
}
