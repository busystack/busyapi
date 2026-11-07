import type {GraphScope,ReferenceGraph} from './reference_graph';
import {escape,type Node} from './document';
import {MigrationSource} from './migration_source';
import type {MigrationIssue} from './migration_schema';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import {materializeFlatSchema} from './migration_flat_items';
import {materializeFormObject,mediaSchemaIdentity,retainFormHeaderOwners} from './migration_media_schema';
import {BinaryUses,rawBinaryUse} from './migration_binary';
import {modernFamily} from './specification';
import {materializeFormFile,materializeSingletonFormFile} from './migration_form_files';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {FormSemantics} from './form_semantics';

const flatFields:ReadonlySet<string>=new Set(['type','format','description','default','enum','maximum','exclusiveMaximum','minimum','exclusiveMinimum','maxLength','minLength','pattern','multipleOf']);
const arrayFields:ReadonlySet<string>=new Set([...flatFields,'items','minItems','maxItems','uniqueItems']);
const itemFields:ReadonlySet<string>=new Set([...flatFields].filter(name=>name!=='description'));
const primitiveTypes:ReadonlySet<string>=new Set(['string','number','integer','boolean']);

/** OAS 3.0 §4.7.15 and Swagger 2.0 §6.4.9. Flatten only independently
 * described fields; object-wide constraints are not parameter rules. */
export function downgradeFormBody(graph:ReferenceGraph,source:MigrationSource,scope:GraphScope,pointer:string,media:string,issue:MigrationIssue,
    owners:MigrationSchemaOwners,sources:ReadonlyMap<string,MigrationSource>):void {
    const body=source.doc.dataNode(pointer)!;
    const at=pointer+'/content/'+escape(media);
    const origin=scope.pointer+'/content/'+escape(media)+'/schema';
    let valid=true;
    const block=(pointer:string,code:string,message:string,reason:'implementation'|'unavailable-proof'|'target-representation'='target-representation')=>{
        valid=false;issue({resource:scope.resource,pointer},code,message,reason);
    };
    const parent=pointer.slice(0,pointer.lastIndexOf('/'));
    if(source.doc.dataNode(parent)?.kind!=='array'||!parent.endsWith('/parameters')){
        block(scope.pointer,'migration.form.reusable','A reusable form body needs occurrence-specific form parameter bindings');return;
    }
    for(const name of body.children.keys())if(!['content','required'].includes(name))
        block(scope.pointer+'/'+escape(name),'migration.form.body-metadata','This form body metadata needs an explicit target owner');
    const content=source.doc.dataNode(pointer+'/content');
    const alternatives=[...content?.children.keys()??[]];
    const identities=alternatives.map(name=>mediaSchemaIdentity(source,pointer+'/content/'+escape(name)+'/schema',sources,owners));
    if(!identities.length||identities.some(value=>value===undefined||value!==identities[0])){
        block(scope.pointer,'migration.form.media-schema','Swagger formData has one field set; no common captured schema certificate establishes these media alternatives','unavailable-proof');return;
    }
    const capturedFields=materializeFormObject(graph,sources,owners,source,at+'/schema',scope,issue,graph.scopeAs(scope.resource,origin,'schema'));
    if(!capturedFields)return;
    retainFormHeaderOwners(graph,owners,source,scope,pointer);
    const schema=source.doc.dataNode(at+'/schema')!;
    for(const alternative of alternatives)for(const name of source.doc.node(pointer+'/content/'+escape(alternative)).children.keys())if(!['schema','encoding'].includes(name))
        block(scope.pointer+'/content/'+escape(alternative)+'/'+escape(name),'migration.form.media','Swagger formData has no owner for this authored media annotation');
    for(const name of schema.children.keys())if(!['type','properties','required'].includes(name)&&!(name==='additionalProperties'&&schema.value.additionalProperties===true))
        block(origin+'/'+escape(name),'migration.form.object-constraint','This object-wide form constraint or annotation needs a faithful Swagger representation');
    const properties=source.doc.dataNode(at+'/schema/properties');
    if(properties?.kind!=='object'||!properties.children.size){block(origin,'migration.form.fields','No fixed field set or body-presence certificate establishes equivalent Swagger formData bindings','unavailable-proof');return;}
    const required=new Set<string>(schema.value.required??[]);
    if((body.value.required===true)!==(required.size>0))
        block(body.children.has('required')?scope.pointer+'/required':scope.pointer,'migration.form.presence','Independent Swagger parameters cannot preserve this conditional form-body presence','target-representation');
    if([...required].some(name=>!properties.children.has(name)))
        block(origin+'/required','migration.form.required','Every required form field needs a captured parameter definition');
    const collections=new Map<string,string>();
    const files=new Set<string>(),binaryUses=new BinaryUses(graph);
    for(const name of properties.children.keys()){
        const original=origin+'/properties/'+escape(name),at=atProperty(name),captured=capturedFields.get(name);
        if(!captured){block(original,'migration.form.field-owner','The form field has no captured Schema Object owner');continue;}
        const raw=binaryUses.inspect(captured).some(use=>rawBinaryUse(use)&&use.kind==='part'&&use.source.resource===scope.resource&&use.source.pointer===scope.pointer+'/content/'+escape(media));
        const value=source.doc.dataNode(at)!.value;
        const shape=new FormSemantics(graph).shape(captured.resource,captured.pointer);
        const tupleRule=source.doc.dataNode(pointer+'/content/'+escape(media)+'/encoding/'+escape(name))?.value;
        const tupleRaw=modernFamily(scope.family)&&shape.types?.includes('array')&&shape.prefixItems?.length===1&&
            rawBinaryUse({kind:'part',mediaType:tupleRule?.contentType??shape.prefixItems[0].defaultContentType,source:scope,schema:captured,path:[]});
        const fileArray=new MigrationSchemaProofs(graph).conjuncts(captured).some(part=>{
            const item=graph.scopeAs(part.resource,part.pointer+'/items','schema');
            return item&&binaryUses.inspect(item).some(use=>rawBinaryUse(use)&&use.kind==='part'&&use.source.resource===scope.resource&&use.source.pointer===scope.pointer+'/content/'+escape(media));
        });
        if(fileArray||tupleRaw){
            const unstyled=alternatives.every(alternative=>scope.family==='3.0'||!['style','explode','allowReserved'].some(field=>
                source.doc.dataNode(pointer+'/content/'+escape(alternative)+'/encoding/'+escape(name)+'/'+field)));
            if(unstyled&&materializeSingletonFormFile(sources,owners,source,at,!tupleRaw))files.add(name);
            else block(original,'migration.form.file-array','Swagger Items Objects forbid files and duplicate name/in Parameters are forbidden; no single-file cardinality/assertion/serialization certificate was established','unavailable-proof');
        }else if(raw&&(!value.type||value.type==='string'&&value.format==='binary')){
            if(!materializeFormFile(sources,owners,source,at))
                block(original,'migration.form.file-constraint','Swagger file parameters have no internal string/octet assertion model for this constrained raw field');
            else files.add(name);
        }else if(materializeFlatSchema(graph,sources,owners,source,at,scope,issue,captured)===undefined)valid=false;
    }
    function atProperty(name:string){return at+'/schema/properties/'+escape(name);}
    const flat=(property:Node,location:string,fields:ReadonlySet<string>)=>{
        if(property.value.format==='binary')block(location+'/format','migration.form.binary','An octet string in a text-only form field has no proved Swagger string serialization','unavailable-proof');
        for(const field of property.children.keys())if(!fields.has(field)&&!field.startsWith('x-'))
            block(location+'/'+escape(field),'migration.form.field-keyword','This Schema Object field is not a flat Swagger parameter field');
    };
    for(const name of properties.children.keys()){
        const property=source.doc.dataNode(atProperty(name))!;
        const location=origin+'/properties/'+escape(name),array=property.value?.type==='array';
        if(property.kind!=='object'||!primitiveTypes.has(property.value.type)&&!array&&!files.has(name)){
            block(location,'migration.form.field-type','This form field needs an additional flat Swagger representation');continue;
        }
        flat(property,location,array?arrayFields:flatFields);
        if(array){
            const items=property.children.get('items');
            if(items?.kind!=='object'||!primitiveTypes.has(items.value.type))
                block(location+'/items','migration.form.items','This form array needs concrete primitive Items Object rules');
            else flat(items,location+'/items',itemFields);
        }
        let selectedCollection:string|undefined;
        for(const alternative of alternatives){
            const multipart=alternative.split(';')[0].trim().toLowerCase()==='multipart/form-data';
            const alternativeAt=pointer+'/content/'+escape(alternative);
            const encoding=source.doc.dataNode(alternativeAt+'/encoding/'+escape(name)),rule=encoding?.value??{};
            if(files.has(name)&&!multipart)block(location,'migration.form.file-media','Swagger file formData parameters require multipart/form-data');
            if(multipart&&property.value.format==='byte')block(location+'/format','migration.form.encoded-part','Swagger formData has no Encoding Object binding for a base64 multipart part');
            const styled=(!multipart||modernFamily(scope.family))&&['style','explode','allowReserved'].some(field=>Object.hasOwn(rule,field));
            const encodingLocation=scope.pointer+'/content/'+escape(alternative)+'/encoding/'+escape(name);
            if(encoding)for(const field of encoding.children.keys())if(!['style','explode','allowReserved','contentType','headers'].includes(field)&&!field.startsWith('x-'))
                block(encodingLocation+'/'+escape(field),'migration.form.encoding-metadata','Swagger has no Encoding Object metadata owner');
            if(encoding?.children.has('headers'))for(const header of Object.keys(rule.headers??{}))if(multipart&&header.toLowerCase()!=='content-type')
                block(encodingLocation+'/headers/'+escape(header),'migration.form.part-header','Swagger formData cannot retain applicable part header or transfer-encoding constraints');
            if(rule.contentType!==undefined&&!styled){
                const expected=files.has(name)?'application/octet-stream':'text/plain';
                if(rule.contentType!==expected&&!(property.value.format==='byte'&&!multipart&&rule.contentType==='application/octet-stream'))
                    block(encodingLocation+'/contentType','migration.form.part-media','Swagger formData cannot retain this field-specific media serialization');
            }
            if(!multipart&&rule.allowReserved===true)
                block(encodingLocation+'/allowReserved','migration.form.reserved','Swagger form parameters cannot request reserved expansion','target-representation');
            if(!array&&styled&&(rule.style??'form')!=='form')
                block(encodingLocation,'migration.form.scalar-style','This scalar style has no defined Swagger form serialization','target-representation');
            if(array){
                const style=rule.style??'form',explode=rule.explode??(style==='form');
                // Encoding by name applies the default content type to each item,
                // including OAS 3.2 §4.15.1.1. Primitive items remain repeated fields.
                const collection=styled?(style==='form'?explode?'multi':'csv':!explode&&style==='spaceDelimited'?'ssv':!explode&&style==='pipeDelimited'?'pipes':undefined):'multi';
                if(collection){
                    if(selectedCollection!==undefined&&selectedCollection!==collection)block(encodingLocation,'migration.form.media-collection','Swagger has one collectionFormat per field; these media alternatives use different delimiters');
                    selectedCollection=collection;
                    collections.set(name,collection);
                    const items=property.children.get('items'),separator=collection==='csv'?',':collection==='ssv'?' ':'|';
                    // Swagger flat collections split a decoded value. RFC6570 CSV
                    // can escape a separator inside an item before joining it.
                    // Require a finite proof when string items can contain it.
                    if(collection!=='multi'&&items?.value.type==='string'&&
                        (!Array.isArray(items.value.enum)||items.value.enum.some((item:unknown)=>typeof item!=='string'||item.includes(separator))))
                        block(location+'/items','migration.form.collection-boundary','No exhaustive separator-free item-language certificate establishes the RFC6570 and Swagger split boundaries','unavailable-proof');
                }else block(encoding?encodingLocation:location,'migration.form.array-encoding','This array encoding needs an additional serialization-preserving mapping');
            }
        }
    }
    for(const [name]of source.doc.dataNode(at+'/encoding')?.children??[])if(!properties.children.has(name))
        block(scope.pointer+'/content/'+escape(media)+'/encoding/'+escape(name),'migration.form.encoding-owner','This encoding needs a retained form property owner');
    if(!valid)return;
    for(const name of properties.children.keys()){
        const property=source.doc.dataNode(atProperty(name))!;
        const destination=parent+'/'+source.doc.node(parent).children.size;
        owners.copyAssertionField(source,destination,source,at+'/schema/properties/'+escape(name));
        source.set(destination+'/name',name);source.set(destination+'/in','formData');
        if(required.has(name))source.set(destination+'/required',true);
        if(['string','array'].includes(property.value.type))source.set(destination+'/allowEmptyValue',true);
        if(collections.has(name))source.set(destination+'/collectionFormat',collections.get(name)!);
    }
    for(const alternative of alternatives)if(alternative!==media){
        const at=pointer+'/content/'+escape(alternative)+'/schema',captured=owners.capturedSchema({resource:source.doc.id,pointer:at});
        if(captured)owners.move(captured,source,at,'form_alternative',{context:owners.contextOf(captured)??graph,layout:'array-item'});
    }
    for(const alternative of alternatives){
        const at=pointer+'/content/'+escape(alternative)+'/encoding';
        if(source.doc.dataNode(at))owners.retainLiteralValue({resource:scope.resource,pointer:scope.pointer+'/content/'+escape(alternative)+'/encoding'},source,at,'form_encoding',true);
    }
    source.remove(pointer);
}
