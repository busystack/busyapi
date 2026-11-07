import {SourceError,escape} from './document';
import type {MigrationSource} from './migration_source';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {compare,decimal} from './exact_numbers';
import {rawPatternBounds} from './migration_binary_constraints';

/** Swagger §6.4.9 has an opaque single file parameter, with no internal
 * schema model. Consolidate only raw wrappers and parameter metadata; a file
 * reference is never copied into a flat Parameter or Items Object. */
export function materializeFormFile(sources:ReadonlyMap<string,MigrationSource>,owners:MigrationSchemaOwners,source:MigrationSource,pointer:string,octetString=true):boolean {
    const metadata=new Map<string,{source:MigrationSource;pointer:string}>(),seen=new Set<string>();let work=0,valid=true;
    const visit=(source:MigrationSource,pointer:string)=>{
        if(++work>50000)throw new SourceError('limit.migration.form-file','File field materialization exceeds 50000 states');
        const id=JSON.stringify([source.doc.id,pointer]);if(seen.has(id)){valid=false;return;}seen.add(id);
        const node=source.doc.dataNode(pointer);if(node?.kind!=='object'){valid=false;return;}
        for(const [name,field]of node.children){
            if(name==='$ref'){
                const target=owners.materialReference(source,pointer,'2.0');
                if(target)visit(sources.get(target.resource)!,target.pointer);else valid=false;
            }else if(name==='allOf')for(const child of field.children.values())visit(source,child.pointer);
            else if(octetString&&(name==='type'&&field.value==='string'||name==='format'&&field.value==='binary'))continue;
            else if(!octetString&&['minLength','pattern','format'].includes(name))continue;
            else if(name==='minLength'&&compare(decimal(source.doc.dataJson(field.pointer)),decimal('0'))===0)continue;
            else if(name==='pattern'&&typeof field.value==='string'){
                const bounds=rawPatternBounds(field.value);if(!bounds||bounds.minimum!==0n||bounds.maximum!==undefined)valid=false;
            }
            else if(name==='description'||name.startsWith('x-')){
                const previous=metadata.get(name);
                if(previous&&previous.source.doc.dataJson(previous.pointer)!==source.doc.dataJson(field.pointer))valid=false;
                metadata.set(name,{source:source.fork(),pointer:field.pointer});
            }else valid=false;
        }
        seen.delete(id);
    };
    visit(source,pointer);if(!valid)return false;
    // Original Schema Object identities were retained by the whole form owner.
    source.remove(pointer);source.set(pointer,{type:'file'});
    for(const [name,field]of metadata)owners.copyAssertionField(source,pointer+'/'+escape(name),field.source,field.pointer);
    return true;
}

/** A one-item array has the same wire multiplicity as a single file. Wider
 * arrays cannot become Swagger Items(file), nor duplicate name/in parameters. */
export function materializeSingletonFormFile(sources:ReadonlyMap<string,MigrationSource>,owners:MigrationSchemaOwners,source:MigrationSource,pointer:string,octetString=true):boolean {
    const items:{source:MigrationSource;pointer:string}[]=[],metadata=new Map<string,{source:MigrationSource;pointer:string}>();
    const active=new Set<string>();let work=0,valid=true,minimum=false,maximum=false;
    const visit=(source:MigrationSource,pointer:string)=>{
        if(++work>50000)throw new SourceError('limit.migration.form-file','Singleton file materialization exceeds 50000 states');
        const id=JSON.stringify([source.doc.id,pointer]);if(active.has(id)){valid=false;return;}active.add(id);
        const node=source.doc.dataNode(pointer);if(node?.kind!=='object'){valid=false;return;}
        for(const [name,field]of node.children){
            if(name==='$ref'){
                const target=owners.materialReference(source,pointer,'2.0');if(target)visit(sources.get(target.resource)!,target.pointer);else valid=false;
            }else if(name==='allOf')for(const child of field.children.values())visit(source,child.pointer);
            else if(name==='items'){
                if(field.kind==='array'){
                    if(field.children.size!==1)valid=false;
                    else items.push({source:source.fork(),pointer:field.children.values().next().value!.pointer});
                }else items.push({source:source.fork(),pointer:field.pointer});
            }
            else if(name==='minItems'||name==='maxItems'){
                if(compare(decimal(source.doc.dataJson(field.pointer)),decimal('1'))!==0)valid=false;
                else if(name==='minItems')minimum=true;else maximum=true;
            }else if(name==='type'&&field.value==='array'||name==='uniqueItems')continue;
            else if(name==='description'||name.startsWith('x-'))metadata.set(name,{source:source.fork(),pointer:field.pointer});
            else valid=false;
        }
        active.delete(id);
    };
    visit(source,pointer);if(!valid||!minimum||!maximum||!items.length)return false;
    const captured=source.fork();
    source.remove(pointer);source.set(pointer,{allOf:[]});
    for(const [index,item]of items.entries())owners.copyAssertionField(source,pointer+'/allOf/'+index,item.source,item.pointer);
    if(!materializeFormFile(sources,owners,source,pointer,octetString)){
        source.remove(pointer);source.copy(captured,pointer,pointer);return false;
    }
    for(const [name,field]of metadata)owners.copyAssertionField(source,pointer+'/'+escape(name),field.source,field.pointer);
    return true;
}
