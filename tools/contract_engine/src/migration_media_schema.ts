import {escape,SourceError} from './document';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationSource} from './migration_source';
import type {MigrationIssue} from './migration_schema';
import type {GraphScope,ReferenceGraph} from './reference_graph';
import {BinaryUses,rawBinaryUse} from './migration_binary';
import {runtimeMediaKind} from './runtime_media';
import {runtimeBinaryMedia} from './runtime_binary';
import {pointerFragment} from './reference_graph';
import {mediaTypes} from './media_types';
import {decimal} from './exact_numbers';

type Field=Readonly<{source:MigrationSource;pointer:string}>;

/** OAS 3.0/3.1 apply Encoding only to request bodies. OAS 3.2 extends
 * applicable multipart encoding to other media occurrences. Content-Type in
 * Encoding.headers is ignored in every family. */
export function inactiveEncodingHeader(graph:ReferenceGraph,header:GraphScope):boolean {
    const marker=header.pointer.lastIndexOf('/content/');if(marker<0)return false;
    const suffix=header.pointer.slice(marker+'/content/'.length),match=/^([^/]+)\/encoding\/[^/]+\/headers\/([^/]+)$/.exec(suffix);
    if(!match)return false;
    const media=match[1].replaceAll('~1','/').replaceAll('~0','~').split(';')[0].trim().toLowerCase();
    const name=match[2].replaceAll('~1','/').replaceAll('~0','~').toLowerCase();
    const request=graph.scopeAs(header.resource,header.pointer.slice(0,marker),'request-body');
    return name==='content-type'||!media.startsWith('multipart/')||!request&&header.family!=='3.2';
}

export function inactiveMigrationHeader(graph:ReferenceGraph,header:GraphScope):boolean {
    const marker=header.pointer.lastIndexOf('/headers/');
    if(marker>=0&&header.pointer.slice(marker+9).replaceAll('~1','/').replaceAll('~0','~').toLowerCase()==='content-type'&&
        graph.scopeAs(header.resource,header.pointer.slice(0,marker),'response'))return true;
    return inactiveEncodingHeader(graph,header);
}

/** Ignored part Headers need no flat Header representation. Retain their
 * independent schemas directly; a separately referenced native Header instead
 * keeps a standard Response.headers owner and the existing B02 flat-item path. */
export function retainFormHeaderOwners(graph:ReferenceGraph,owners:MigrationSchemaOwners,source:MigrationSource,scope:GraphScope,pointer:string):void {
    const selected:GraphScope[]=[];let work=0;
    const inspect=()=>{if(++work>50000)throw new SourceError('limit.migration.form-headers','Ignored Header ownership exceeds 50000 captured states');};
    for(const header of graph.scopes.values()){
        inspect();if(header.kind!=='header'||header.resource!==scope.resource||!header.pointer.startsWith(scope.pointer+'/content/'))continue;
        const suffix=header.pointer.slice(scope.pointer.length),marker=suffix.indexOf('/encoding/');
        if(marker<0||!/^\/encoding\/[^/]+\/headers\/[^/]+$/.test(suffix.slice(marker)))continue;
        if(!inactiveEncodingHeader(graph,header))continue;
        selected.push(header);
    }
    for(const header of selected){
        const at=pointer+header.pointer.slice(scope.pointer.length);
        if(!source.doc.dataNode(at)||!owners.materialLocations(header).some(value=>value.source===source&&value.location.pointer===at))continue;
        const native=graph.references.some(reference=>{inspect();return reference.kind==='header'&&reference.resolution==='resolved'&&reference.targetResource===header.resource&&reference.targetPointer===header.pointer;});
        if(native){
            const location=owners.move(header,source,at,'form_ignored_header',{context:owners.contextOf(header)??graph,layout:'response-header'});
            source.set(at,{$ref:location.resource+pointerFragment(location.pointer)});
        }else{
            const schemas=[...graph.scopesFor('schema')].filter(schema=>{inspect();return schema.resource===header.resource&&schema.pointer.startsWith(header.pointer+'/');});
            for(const schema of schemas)if(!schemas.some(parent=>{inspect();return parent!==schema&&schema.pointer.startsWith(parent.pointer+'/');})){
                const child=at+schema.pointer.slice(header.pointer.length);
                if(!source.doc.dataNode(child))continue;
                const retained=owners.move(schema,source,child,'form_ignored_header_schema',{context:owners.contextOf(schema)??graph,layout:'array-item'});
                source.set(child,{$ref:owners.reference(retained,'2.0')});
            }
            // The retained Encoding is data. It must not be processed again as
            // a Header, or have a reference-looking literal repaired as a use.
            for(const suffix of ['', '/$ref']){
                const key=header.pointer+suffix,locations=header.resource===source.original.id?source.origins.get(key):source.foreignOrigins.get(header.resource+'#'+key);
                locations?.delete(at+suffix);
            }
        }
    }
}

/** Compare converted schemas through captured fixed references. Only Schema
 * Object connections are followed; extension/default/enum payloads remain exact
 * data. Recursive schemas keep their fixed physical target identity. */
export function mediaSchemaIdentity(source:MigrationSource,pointer:string,sources:ReadonlyMap<string,MigrationSource>,owners:MigrationSchemaOwners,rawInstance=false):string|undefined {
    let work=0;
    const value=(at:Field):string=>{
        if(++work>50000)throw new SourceError('limit.migration.media-schema','Media schema comparison exceeds 50000 captured states');
        const node=at.source.doc.dataNode(at.pointer)!;
        if(node.kind==='object')return '{'+[...node.children].sort(([a],[b])=>a.localeCompare(b))
            .map(([name,child])=>JSON.stringify(name)+':'+value({source:at.source,pointer:child.pointer})).join(',')+'}';
        if(node.kind==='array')return '['+[...node.children.values()].map(child=>value({source:at.source,pointer:child.pointer})).join(',')+']';
        if(typeof node.value==='number'){
            // Compare mathematical values without replacing either CST
            // spelling or passing an exact value through IEEE-754.
            const number=decimal(at.source.doc.dataJson(at.pointer));
            return String(number.coefficient)+'e'+String(number.exponent);
        }
        // String escapes and YAML scalar styles are presentation too. The
        // original operands remain untouched in their captured CST owners.
        return JSON.stringify(node.value);
    };
    const visit=(at:Field,active:ReadonlySet<string>,raw=false):string[]|undefined=>{
        if(++work>50000)throw new SourceError('limit.migration.media-schema','Media schema comparison exceeds 50000 captured states');
        const node=at.source.doc.dataNode(at.pointer);if(!node)return;
        if(node.kind!=='object')return [value(at)];
        const id=JSON.stringify([at.source.doc.id,at.pointer]),members:string[]=[];
        if(raw&&!node.children.has('$ref')&&node.children.has('type')&&!(Array.isArray(node.value.type)?node.value.type:[node.value.type]).includes('string'))return ['raw:false'];
        for(const [name,child]of node.children){
            if(node.children.has('$ref')&&name!=='$ref')continue;
            if(raw&&(name==='type'||name==='format'&&child.value==='binary'))continue;
            if(name==='$ref'){
                const target=owners.materialReference(at.source,at.pointer,'2.0');if(!target)return;
                const next=JSON.stringify([target.resource,target.pointer]);
                if(active.has(next)){members.push('recursive:'+next);continue;}
                const fields=visit({source:sources.get(target.resource)!,pointer:target.pointer},new Set(active).add(next),raw);
                if(!fields)return;members.push(...fields);continue;
            }
            if(name==='allOf'){
                for(const member of child.children.values()){
                    const fields=visit({source:at.source,pointer:member.pointer},new Set(active).add(id),raw);
                    if(!fields)return;members.push(...fields);
                }
                continue;
            }
            let part:string|undefined;
            if(['properties','definitions','$defs','patternProperties'].includes(name)){
                const fields:string[]=[];
                for(const [key,member]of [...child.children].sort(([a],[b])=>a.localeCompare(b))){
                    const rules=visit({source:at.source,pointer:member.pointer},new Set(active).add(id));if(!rules)return;
                    fields.push(JSON.stringify(key)+':'+normalize(rules));
                }
                part='{'+fields.join(',')+'}';
            }else if(['anyOf','oneOf'].includes(name)||name==='items'&&child.kind==='array'){
                const fields:string[]=[];
                for(const member of child.children.values()){
                    const rules=visit({source:at.source,pointer:member.pointer},new Set(active).add(id),name==='items'?false:raw);if(!rules)return;
                    fields.push(normalize(rules));
                }
                part='['+fields.join(',')+']';
            }else if(['items','additionalProperties','not'].includes(name)&&child.kind==='object'){
                const rules=visit({source:at.source,pointer:child.pointer},new Set(active).add(id),raw&&name==='not');if(!rules)return;
                part=normalize(rules);
            }else if(['required','enum'].includes(name)&&child.kind==='array'){
                part='['+[...child.children.values()].map(child=>value({source:at.source,pointer:child.pointer})).sort().join(',')+']';
            }else part=value({source:at.source,pointer:child.pointer});
            members.push(JSON.stringify(name)+':'+part);
        }
        return members.includes('raw:false')?['raw:false']:members;
    };
    const normalize=(fields:readonly string[])=>'schema('+[...new Set(fields)].sort().join(',')+')';
    const fields=visit({source,pointer},new Set(),rawInstance);
    return fields&&normalize(fields);
}

/** Swagger has a single schema per body/response. A candidate is admitted
 * only if it is identical in every captured applicable domain. Raw target
 * instances are legacy octet strings; JSON media keep their ordinary types.
 * This is a finite structural certificate, not an arbitrary equivalence test. */
export function commonMediaSchema(graph:ReferenceGraph,sources:ReadonlyMap<string,MigrationSource>,owners:MigrationSchemaOwners,
    source:MigrationSource,pointer:string,scope:GraphScope,media:readonly string[]):string|undefined {
    if(media.length>2048)throw new SourceError('limit.migration.media-schema','A common schema proof exceeds 2048 media alternatives');
    const uses=new BinaryUses(graph);
    const raw=media.map(name=>{
        const schema=graph.scopeAs(scope.resource,scope.pointer+'/content/'+escape(name)+'/schema','schema');
        return schema===undefined?mediaTypes(name).every(type=>type.type!=='*'&&type.subtype!=='*'&&runtimeMediaKind(type.text)==='opaque'&&runtimeBinaryMedia(type.text)):
            uses.inspect(schema).some(use=>rawBinaryUse(use)&&use.kind==='body'&&use.source.resource===scope.resource&&use.source.pointer===scope.pointer+'/content/'+escape(name));
    });
    const at=(name:string)=>pointer+'/content/'+escape(name)+'/schema';
    for(const name of media)if(!source.doc.dataNode(at(name)))source.set(at(name),{});
    const identities=new Map<string,string|undefined>();let comparisons=0;
    const identity=(name:string,raw:boolean)=>{
        const id=JSON.stringify([name,raw]);
        if(!identities.has(id))identities.set(id,mediaSchemaIdentity(source,at(name),sources,owners,raw));
        return identities.get(id);
    };
    for(const candidate of media){
        if(media.every((name,index)=>{
            if(++comparisons>50000)throw new SourceError('limit.migration.media-schema','A common schema proof exceeds 50000 media comparisons');
            const expected=identity(name,raw[index]);
            return expected!==undefined&&expected===identity(candidate,raw[index]);
        }))return candidate;
    }
}

/** Materialize a finite object conjunction before its fields become flat
 * Parameters. The original whole Schema Object survives under the common
 * allocator, including independent root/property/item consumers. */
export function materializeFormObject(graph:ReferenceGraph,sources:ReadonlyMap<string,MigrationSource>,owners:MigrationSchemaOwners,
    source:MigrationSource,pointer:string,scope:GraphScope,issue:MigrationIssue,schemaScope?:GraphScope):ReadonlyMap<string,GraphScope>|undefined {
    const original=owners.capturedSchema({resource:source.doc.id,pointer})??schemaScope;
    if(!original){issue(scope,'migration.form.schema-owner','The form object has no captured Schema Object binding','source-incomplete');return;}
    const properties=new Map<string,Field[]>(),required=new Set<string>(),active=new Set<string>();let work=0,valid=true;
    const fail=(at:Field,message:string)=>{valid=false;issue({resource:at.source.doc.id,pointer:at.pointer},'migration.form.object-constraint',message,'target-representation');};
    const collect=(at:Field)=>{
        if(++work>50000)throw new SourceError('limit.migration.form','Form object materialization exceeds 50000 states');
        const id=JSON.stringify([at.source.doc.id,at.pointer]);
        if(active.has(id)){valid=false;issue(original,'migration.form.recursive-object','A recursive same-instance form structure has no finite captured flattening certificate','unavailable-proof');return;}
        active.add(id);const node=at.source.doc.dataNode(at.pointer);
        if(node?.kind!=='object'){fail(at,'Swagger form fields require a concrete object structure');active.delete(id);return;}
        for(const [name,child]of node.children){
            if(name==='$ref'){
                const target=owners.materialReference(at.source,at.pointer,'2.0');
                if(!target){valid=false;issue(original,'migration.form.reference','The form schema has no captured fixed target','source-incomplete');}
                else collect({source:sources.get(target.resource)!,pointer:target.pointer});
            }else if(name==='allOf')for(const member of child.children.values())collect({source:at.source,pointer:member.pointer});
            else if(name==='properties')for(const [key,member]of child.children){const values=properties.get(key)??[];values.push({source:at.source,pointer:member.pointer});properties.set(key,values);}
            else if(name==='required')for(const member of child.children.values())required.add(member.value);
            else if(name==='type'&&child.value==='object'||name==='additionalProperties'&&child.value===true)continue;
            else fail({source:at.source,pointer:child.pointer},'Swagger formData parameters cannot retain the applicable object-wide '+name+' rule or annotation');
        }
        active.delete(id);
    };
    collect({source,pointer});if(!valid)return;
    const schemas=new Map<string,GraphScope>();
    for(const [name,values]of properties){
        const first=values[0];
        let captured=owners.capturedSchema({resource:first.source.doc.id,pointer:first.pointer})??graph.scopeAs(first.source.doc.id,first.pointer,'schema');
        if(!captured&&typeof first.source.doc.dataNode(first.pointer)?.value?.$ref==='string'){
            const fixed=owners.materialReference(first.source,first.pointer,'2.0');
            if(fixed)captured=owners.capturedSchema(fixed)??graph.scopeAs(fixed.resource,fixed.pointer,'schema');
        }
        if(!captured){issue(original,'migration.form.field-owner','The form field has no captured Schema Object owner','source-incomplete');return;}
        schemas.set(name,captured);
    }
    // Snapshot before moving an inline root; properties can refer back into it.
    const captured=new Map<MigrationSource,MigrationSource>();
    const snapshot=(at:Field):Field=>{let copy=captured.get(at.source);if(!copy){copy=at.source.fork();captured.set(at.source,copy);}return {source:copy,pointer:at.pointer};};
    const fields=new Map([...properties].map(([name,values])=>[name,values.map(snapshot)]));
    owners.move(original,source,pointer,'form_object',{context:owners.contextOf(original)??graph,layout:'array-item'});
    source.set(pointer,{type:'object',properties:{}});if(required.size)source.set(pointer+'/required',[...required]);
    for(const [name,values]of fields){
        const at=pointer+'/properties/'+escape(name);
        if(values.length===1)owners.copyAssertionField(source,at,values[0].source,values[0].pointer);
        else {source.set(at,{allOf:[]});for(const [index,value]of values.entries())owners.copyAssertionField(source,at+'/allOf/'+index,value.source,value.pointer);}
    }
    return schemas;
}
