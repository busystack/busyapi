import {MigrationSchemaProofs} from './migration_schema_proofs';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationSource} from './migration_source';

const metadata=new Set(['title','description','default','examples','deprecated','readOnly','writeOnly','externalDocs','xml']);
const structure=new Set(['$id','$schema','$anchor','$dynamicAnchor','$ref','$dynamicRef','allOf','type']);
const literalPattern=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** A value-schema complement used by independently entered name schemas.
 * Swagger has pattern but no not. Regex complement keeps the original search
 * semantics, including anchors/newlines; added groups are noncapturing so the
 * original pattern's backreferences retain their numbering. No name assertion
 * is applied to property values by this helper. */
export function schemaStringComplement(graph:ReferenceGraph,child:GraphScope):Record<string,unknown>|undefined {
    const proofs=new MigrationSchemaProofs(graph),parts=proofs.conjuncts(child),patterns:string[]=[];
    let types=new Set(['null','boolean','object','array','number','string']),strings:readonly string[]|undefined,known=true;
    for(const part of parts){
        const value=graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
        if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(field=>
            !structure.has(field)&&!metadata.has(field)&&!['pattern','enum','const'].includes(field))){known=false;break;}
        if(['$ref','$dynamicRef'].some(field=>Object.hasOwn(value,field)&&!proofs.fixed(part,field))){known=false;break;}
        if(Object.hasOwn(value,'type')){
            const allowed=typeof value.type==='string'?[value.type]:value.type;
            if(!Array.isArray(allowed)||allowed.includes('integer'))return;
            types=new Set([...types].filter(type=>allowed.includes(type)));
        }
        if(typeof value.pattern==='string')patterns.push(value.pattern);
        if(Object.hasOwn(value,'const')||Array.isArray(value.enum)){
            const candidates=Object.hasOwn(value,'const')?[value.const]:value.enum;
            if(candidates.some(value=>typeof value!=='string'))return;
            strings=strings===undefined?candidates:strings.filter(value=>candidates.includes(value));
        }
    }
    if(!known||patterns.length>1||strings!==undefined&&patterns.length||!types.has('string'))return;
    let assertion:Record<string,unknown>;
    if(strings!==undefined){
        assertion=strings.length?{pattern:'^(?!(?:'+strings.map(literalPattern).join('|')+')(?![\\s\\S]))'}:{};
    }else if(patterns.length){
        const allowed=['null','boolean','object','array','number','string'].filter(type=>type==='string'||!types.has(type));
        assertion={...(allowed.length===6?{}:{type:allowed}),pattern:'^(?![\\s\\S]*(?:'+patterns[0]+'))[\\s\\S]*$'};
    }else return;
    return assertion;
}

export function migrateSchemaStringComplement(graph:ReferenceGraph,scope:GraphScope,source:MigrationSource,pointer:string,
    owners:MigrationSchemaOwners,target:string):boolean {
    if(target!=='2.0'||!source.doc.dataNode(pointer+'/not')||graph.hasOverlappingScope(scope.resource,scope.pointer)||
        graph.literalContainer(scope.resource,scope.pointer)!==undefined)return false;
    const child=graph.scopeAs(scope.resource,scope.pointer+'/not','schema');if(!child)return false;
    const assertion=schemaStringComplement(graph,child);if(!assertion)return false;
    owners.move(child,source,pointer+'/not','string_complement',{context:graph,layout:'array-item'});
    const collection=pointer+'/allOf';owners.admit(source,3);if(!source.doc.dataNode(collection))source.set(collection,[]);
    const branch=collection+'/'+source.doc.dataNode(collection)!.children.size;source.set(branch,assertion);source.presentationChanges.push(branch);
    return true;
}
