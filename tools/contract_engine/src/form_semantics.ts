import {schemaContext} from './schema_context';
import {escape,segments,SourceError,SourceDocument,type Node} from './document';
import type {ReferenceGraph,GraphTarget} from './reference_graph';
import {mediaTypeOptions,mediaTypes} from './media_types';
import {MultipartFileShapes} from './multipart_file_shapes';
import {isNativeFamily,modernFamily,type SpecificationFamily} from './specification';
import {projectSchemaReference} from './schema_reference_projection';
import {referenceValue} from './reference_choices';

export type FormBinding='urlencoded'|'multipart-named'|'multipart-ordered';

/** OAS 3.0 §4.7.15.3 permits named generic multipart. This policy keeps the
 * older property/name correlation; 3.2 generic multipart uses array positions. */
export function formBinding(family:SpecificationFamily,contentType:string,ordered=false):FormBinding|undefined {
    const essence=contentType.split(';')[0].trim().toLowerCase();
    if(essence==='application/x-www-form-urlencoded')return 'urlencoded';
    if(family==='3.2'&&essence.startsWith('multipart/')&&(essence!=='multipart/form-data'||ordered))return 'multipart-ordered';
    if(essence==='multipart/form-data'||essence.startsWith('multipart/')&&(family==='3.0'||family==='3.1'))return 'multipart-named';
}

/** The file input's single/array choice belongs to named 3.x data models.
 * OAS 3.2 §4.15.4.5 still repeats a name for array items; generic positional
 * multipart and Swagger flat formData retain their separate representations. */
export function namedFileShapeSelection(family:string,mediaType:string,styled:boolean):boolean {
    return isNativeFamily(family)&&family!=='2.0'&&!styled&&formBinding(family,mediaType)==='multipart-named';
}

export type FormShape={types?:string[];literalType?:string;format?:string;contentEncoding?:string;required?:string[];minItems?:number;maxItems?:number;properties?:Record<string,FormShape>;additionalProperties?:FormShape;patternProperties?:Record<string,FormShape>;items?:FormShape;prefixItems?:FormShape[];defaultContentType?:string};
type PartStep={property:string}|{item:number|undefined};
export type PartSchemaAssertion={schema:GraphTarget;path:PartStep[];valid:boolean};
export type PartRepresentation={id:string;schema:GraphTarget;shape:FormShape;type?:string};
type PartSchemaTarget={resource:string;pointer:string;kind:'schema';choice?:string};

export function multipartArrayBinding(contentType:string,shape:FormShape,rule:Record<string,unknown>):boolean {
    return contentType.split(';')[0].trim().toLowerCase()!=='multipart/form-data'||shape.types?.includes('array')===true||
        !shape.types?.includes('object')&&(rule.prefixEncoding!==undefined||rule.itemEncoding!==undefined||rule.itemSchema!==undefined);
}

export function multipartExpandedObject(rule:Record<string,unknown>,shape:FormShape):'form'|'deepObject'|undefined {
    if(formLiteralType(shape)!=='object')return;
    const style=rule.style??'form',explode=rule.explode??(style==='form');
    return explode===true&&(style==='form'||style==='deepObject')?style:undefined;
}

function minimumItems(local:unknown,shapes:readonly FormShape[]):number|undefined {
    const bounds=shapes.flatMap(shape=>shape.minItems===undefined?[]:[shape.minItems]);
    if(typeof local==='number')bounds.push(local);
    return bounds.length?bounds.reduce((left,right)=>Math.max(left,right)):undefined;
}
function maximumItems(local:unknown,shapes:readonly FormShape[]):number|undefined {
    const bounds=shapes.flatMap(shape=>shape.maxItems===undefined?[]:[shape.maxItems]);
    if(typeof local==='number')bounds.push(local);
    return bounds.length?bounds.reduce((left,right)=>Math.min(left,right)):undefined;
}

export const formLiteralType=(shape:FormShape):string|undefined=>{
    // Literal input remains a string when a union permits strings; exact JSON
    // data input retains its own kind instead. Null-only fields use "null".
    if(shape.types?.length===1&&shape.types[0]==='null')return 'null';
    if(shape.types?.includes('string'))return 'string';
    const types=shape.types?.filter(type=>type!=='null');
    if(types&&types.length>1&&types.every(type=>type==='integer'||type==='number'))return 'number';
    return types?.length===1?types[0]:undefined;
};

/** Single MIME-position RFC6570 representation. Expanded objects and arrays
 * requiring several positions have no single-part inverse; named top-level
 * forms retain the existing multi-field codec in runtime_form/Core. */
export function multipartStyleText(doc:SourceDocument,node:Node,rule:Record<string,unknown>):string {
    const style=rule.style??'form',explode=rule.explode??(style==='form');
    const scalar=(node:Node)=>{
        if(node.kind==='object'||node.kind==='array')throw new SourceError('request.multipart.style.nested','RFC6570 does not define nested object/array values',[0,0],'unsupported');
        return node.kind==='string'?node.value:doc.dataJson(node.pointer);
    };
    if(!['form','spaceDelimited','pipeDelimited','deepObject'].includes(style as string))throw new SourceError('request.multipart.style','This is not a query-style Encoding');
    if(node.kind!=='object'&&node.kind!=='array'){
        if(style!=='form')throw new SourceError('request.multipart.style','This style has no scalar representation');
        return scalar(node);
    }
    if(explode||style==='deepObject')throw new SourceError('request.multipart.style.multiplicity','This exploded composite needs several named MIME fields and has no single-position inverse',[0,0],'unsupported');
    const tokens=[...node.children].flatMap(([key,physical])=>node.kind==='object'?[key,scalar(doc.dataNode(physical.pointer)!)]:[scalar(doc.dataNode(physical.pointer)!)]);
    return tokens.join(style==='spaceDelimited'?' ':style==='pipeDelimited'?'|':',');
}

export function multipartStyleData(text:string,shape:FormShape,rule:Record<string,unknown>):string {
    const style=rule.style??'form',explode=rule.explode??(style==='form'),type=formLiteralType(shape);
    const scalar=(text:string,shape:FormShape)=>{
        const type=formLiteralType(shape);
        if(type===undefined||type==='string')return JSON.stringify(text);
        const doc=new SourceDocument(text,'file:///busyapi-style-value.json',true,'json');
        if(doc.issues.length)throw doc.issues[0];return doc.dataJson('');
    };
    if(type!=='object'&&type!=='array')return scalar(text,shape);
    if(explode||style==='deepObject')throw new SourceError('runtime.form.style.multiplicity','This exploded composite has no single-position inverse',[0,0],'unsupported');
    const tokens=text.split(style==='spaceDelimited'?' ':style==='pipeDelimited'?'|':',');
    if(type==='array')return '['+tokens.map(value=>scalar(value,shape.items??{})).join(',')+']';
    if(tokens.length%2)throw new SourceError('runtime.form.style','Separated objects require paired keys and values');
    const entries:string[]=[],seen=new Set<string>();
    for(let index=0;index<tokens.length;index+=2){
        if(seen.has(tokens[index]))throw new SourceError('runtime.form.style','Separated object keys must be unique');seen.add(tokens[index]);
        entries.push(JSON.stringify(tokens[index])+':'+scalar(tokens[index+1],shape.properties?.[tokens[index]]??{}));
    }
    return '{'+entries.join(',')+'}';
}

export function formContentType(shape:FormShape,family:string):string {
    const type=formLiteralType(shape);
    if(type==='array'&&family!=='3.2')return shape.items?.defaultContentType??(family==='3.0'?'text/plain':'application/octet-stream');
    if(type==='string'&&(family==='3.0'?['binary','byte'].includes(shape.format??''):shape.contentEncoding!==undefined))return 'application/octet-stream';
    return type==='object'||type==='array'?'application/json':type===undefined&&family!=='3.0'?'application/octet-stream':'text/plain';
}

/** Transport hints are projections of the existing graph, not a resolver or
 * validator. Exact instance evaluation remains with the captured Schema Object.
 * OAS 3.0 §4.7.15 and 3.1 §4.8.15 differ on multipart RFC6570 fields. */
export class FormSemantics {
    constructor(private readonly graph:ReferenceGraph){}
    private partWork=0;

    /** Encoding keys must identify properties in the captured schema. Extra
     * entries are ignored, including on schema-free media; they cannot grant
     * a codec merely because a submitted value has the same spelling. */
    propertyNames(target:GraphTarget,path:PartStep[]=[]):string[] {
        const names=new Set<string>();let work=0;
        const visit=(target:GraphTarget,path:PartStep[],active:ReadonlySet<string>)=>{
            if(++work>100000){const range=this.graph.docs.get(target.resource)?.dataNode(target.pointer)?.range??[0,0];throw new SourceError('limit.request.multipart.schema','Named Encoding inspection exceeds 100000 schema locations',range,'unsupported',{...target,range});}
            const key=JSON.stringify([target,path]);if(active.has(key)||active.size>128)return;
            active=new Set(active).add(key);
            const value=this.graph.docs.get(target.resource)?.dataNode(target.pointer)?.value;
            if(!value||typeof value!=='object'||Array.isArray(value))return;
            const family=schemaContext(this.graph,target.resource,target.pointer)?.family;
            for(const keyword of modernFamily(family)?['$ref','$dynamicRef']:['$ref'])if(typeof value[keyword]==='string'){
                const edge=this.graph.referenceAs(target.resource,target.pointer,keyword,'schema'),projection=edge&&projectSchemaReference(edge);
                if(projection?.state==='fixed')visit(projection.target,path,active);
                if(family==='3.0')return;
            }
            for(const keyword of ['allOf','anyOf','oneOf'])if(Array.isArray(value[keyword]))value[keyword].forEach((_,index)=>visit({...target,pointer:target.pointer+'/'+keyword+'/'+index},path,active));
            for(const keyword of ['then','else'])if(value[keyword]!==undefined)visit({...target,pointer:target.pointer+'/'+keyword},path,active);
            if(!path.length){for(const name of Object.keys(value.properties??{}))names.add(name);return;}
            const [step,...rest]=path;
            if('property' in step){for(const property of this.propertySchemas(target,step.property))visit(property,rest,active);}
            else if(step.item!==undefined&&Array.isArray(value.prefixItems)&&step.item<value.prefixItems.length)visit({...target,pointer:target.pointer+'/prefixItems/'+step.item},rest,active);
            else if(value.items!==undefined&&!Array.isArray(value.items))visit({...target,pointer:target.pointer+'/items'},rest,active);
        };
        visit(target,path,new Set());return [...names];
    }

    namedEncoding(raw:unknown,schemas:{schema:GraphTarget;path:PartStep[]}[]):Record<string,any> {
        if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
        const names=new Set(schemas.flatMap(value=>this.propertyNames(value.schema,value.path)));
        return Object.fromEntries(Object.entries(raw).filter(([name])=>names.has(name)));
    }

    partSchemaId(media:{resource:string;pointer:string},schema:{resource:string;pointer:string}):string {
        if('choice' in schema&&typeof schema.choice==='string')return 'choice:'+schema.choice;
        if(schema.resource===media.resource&&schema.pointer===media.pointer+'/schema')return 'choice:schema';
        if(schema.resource===media.resource&&schema.pointer===media.pointer+'/itemSchema')return 'choice:itemSchema';
        const from=this.graph.scopeAs(media.resource,media.pointer,'media'),to=this.graph.scopeAs(schema.resource,schema.pointer,'schema');
        return from&&to?referenceValue(this.graph,from,to,'$ref',undefined,{retrieval:true})??schema.resource+'#'+schema.pointer:schema.resource+'#'+schema.pointer;
    }

    multipartRootChoices(media:GraphTarget,schema:GraphTarget|undefined,mediaType:string){
        if(!schema||!mediaType.toLowerCase().split(';')[0].trim().endsWith('/form-data'))return [];
        const shapes=new MultipartFileShapes(this.graph);
        if(!shapes.allows(schema,[],'object')||!shapes.allows(schema,[],'array'))return [];
        const candidates=this.partSchemas(schema,[]);
        return (candidates.length?candidates:[schema]).flatMap(candidate=>
            (['object','array'] as const).filter(type=>shapes.allows(candidate,[],type)).map(type=>({
                id:this.partSchemaId(media,candidate)+'::'+type,binding:type==='array'?'multipart-ordered':'multipart-named',schema:candidate,
                shape:this.shape(candidate.resource,candidate.pointer),source:candidate})));
    }

    /** Shared generation/decoding binding. Only the captured declaration can
     * select an ordered form-data model; execution values never select it. */
    multipartBinding(family:SpecificationFamily,resource:string,pointer:string,mediaType:string):FormBinding|undefined {
        const value=this.graph.docs.get(resource)?.dataNode(pointer)?.value;
        const shape=this.shape(resource,pointer+'/schema');
        return formBinding(family,mediaType,family==='3.2'&&multipartArrayBinding(mediaType,shape,value??{}));
    }

    partRepresentations(media:GraphTarget,target:GraphTarget,path:PartStep[]):PartRepresentation[] {
        return this.partSchemas(target,path).flatMap(schema=>{
            const shape=this.shape(schema.resource,schema.pointer),id=this.partSchemaId(media,schema);
            return (shape.types?.length??0)>1?shape.types!.map(type=>{
                const selected={...shape,types:[type]};
                return {id:id+'::type='+type,schema,type,shape:{...selected,literalType:type,
                    defaultContentType:formContentType(selected,schemaContext(this.graph,schema.resource,schema.pointer)?.family??'3.2')}};
            }):[{id,schema,shape,...(shape.types?.length===1?{type:shape.types[0]}:{})}];
        });
    }

    selectedShape(common:FormShape,selected:FormShape,schema:GraphTarget,depth=0):FormShape {
        if(depth>128)return selected;
        const properties:Record<string,FormShape>={...common.properties};
        for(const [name,shape]of Object.entries(selected.properties??{}))properties[name]=this.selectedShape(properties[name]??{},shape,schema,depth+1);
        const shape:FormShape={...common,...Object.fromEntries(Object.entries(selected).filter(([_,value])=>value!==undefined)),properties};
        if(common.items&&selected.items)shape.items=this.selectedShape(common.items,selected.items,schema,depth+1);
        shape.literalType=formLiteralType(shape);
        shape.defaultContentType=formContentType(shape,schemaContext(this.graph,schema.resource,schema.pointer)?.family??'3.2');
        return shape;
    }

    propertySchemas(target:GraphTarget,name:string):GraphTarget[] {
        const value=this.graph.docs.get(target.resource)?.dataNode(target.pointer)?.value;
        if(!value||typeof value!=='object'||Array.isArray(value))return [];
        const result:GraphTarget[]=[];
        if(Object.hasOwn(value.properties??{},name))result.push({...target,pointer:target.pointer+'/properties/'+escape(name)});
        if(modernFamily(schemaContext(this.graph,target.resource,target.pointer)?.family??'')){
            for(const pattern of Object.keys(value.patternProperties??{})){
                const at={...target,pointer:target.pointer+'/patternProperties/'+escape(pattern)};
                if(pattern.length>8192||name.length>4096){
                    const range=this.graph.docs.get(at.resource)!.dataNode(at.pointer)!.range;
                    throw new SourceError('limit.request.multipart.pattern','Multipart property-name matching exceeds the bounded pattern/name size',range,'unsupported',{...at,range});
                }
                let matches:boolean;
                try{matches=new RegExp(pattern,'u').test(name);}
                catch{const range=this.graph.docs.get(at.resource)!.dataNode(at.pointer)!.range;throw new SourceError('request.multipart.pattern','The property pattern is not a supported ECMAScript expression',range,'unsupported',{...at,range});}
                if(matches)result.push(at);
            }
        }
        if(!result.length&&value.additionalProperties!==undefined)result.push({...target,pointer:target.pointer+'/additionalProperties'});
        return result;
    }

    pathShape(target:GraphTarget,path:PartStep[],fallback:FormShape={}):FormShape {
        if(fallback.types?.length||fallback.contentEncoding!==undefined)return fallback;
        const shapes=this.partSchemas(target,path).map(schema=>this.shape(schema.resource,schema.pointer));
        if(!shapes.length)return fallback;
        const signature=(shape:FormShape)=>JSON.stringify([shape.defaultContentType,formLiteralType(shape),shape.contentEncoding,shape.format]);
        return shapes.every(shape=>signature(shape)===signature(shapes[0]))?shapes[0]:fallback;
    }

    /** Located leaf alternatives for a representation choice. This is a
     * presentation projection, never a replacement for whole-schema checking. */
    partSchemas(target:{resource:string;pointer:string},path:({property:string}|{item:number|undefined})[],active:ReadonlySet<string>=new Set(),depth=0,route=target.pointer.endsWith('/itemSchema')?'itemSchema':'schema',includeAssertions=false):PartSchemaTarget[] {
        if(++this.partWork>100000){
            const range=this.graph.docs.get(target.resource)?.dataNode(target.pointer)?.range??[0,0];
            throw new SourceError('limit.request.multipart.schema','Multipart representation inspection exceeds 100000 schema locations',range,'unsupported',{...target,range});
        }
        const key=JSON.stringify([target,path]);
        if(depth>128||active.has(key))return [];
        active=new Set(active).add(key);
        const value=this.graph.docs.get(target.resource)?.dataNode(target.pointer)?.value;
        // A located leaf is evaluated as its original complete schema. Traversing
        // its alternatives here would wrongly turn anyOf/oneOf into allOf.
        if(includeAssertions&&!path.length&&(typeof value==='boolean'||value!==null&&typeof value==='object'&&!Array.isArray(value)))return [{...target,kind:'schema',choice:route}];
        if(!value||typeof value!=='object'||Array.isArray(value))return [];
        const visit=(pointer:string,steps=path)=>this.partSchemas({...target,pointer},steps,active,depth+1,route+pointer.slice(target.pointer.length),includeAssertions);
        const results:PartSchemaTarget[]=[];
        const scope=schemaContext(this.graph,target.resource,target.pointer);
        for(const keyword of modernFamily(scope?.family)?['$ref','$dynamicRef']:['$ref'])if(typeof value[keyword]==='string'){
            const edge=this.graph.referenceAs(target.resource,target.pointer,keyword,'schema'),projection=edge&&projectSchemaReference(edge);
            if(projection?.state==='fixed')results.push(...this.partSchemas(projection.target,path,active,depth+1,route+'/'+keyword,includeAssertions));
            if(scope?.family==='3.0')return results;
        }
        for(const keyword of ['allOf','anyOf','oneOf'])if(Array.isArray(value[keyword]))
            value[keyword].forEach((_:unknown,index:number)=>results.push(...visit(target.pointer+'/'+keyword+'/'+index)));
        for(const keyword of ['then','else'])if(value[keyword]!==undefined)results.push(...visit(target.pointer+'/'+keyword));
        if(path.length){
            const [step,...rest]=path;
            if('property' in step){for(const property of this.propertySchemas({...target,kind:'schema'},step.property))results.push(...this.partSchemas(property,rest,active,depth+1,route+property.pointer.slice(target.pointer.length),includeAssertions));}
            const pointer='property' in step?undefined:
                step.item!==undefined&&Array.isArray(value.prefixItems)&&step.item<value.prefixItems.length?target.pointer+'/prefixItems/'+step.item:
                value.items!==undefined&&!Array.isArray(value.items)?target.pointer+'/items':undefined;
            if(pointer!==undefined)results.push(...visit(pointer,rest));
        }else if(value.type!==undefined||value.contentEncoding!==undefined||value.format!==undefined||includeAssertions)
            results.unshift({...target,kind:'schema',choice:route});
        return [...new Map(results.map(result=>[result.resource+'#'+result.pointer,result])).values()];
    }

    /** A leaf choice also commits to the containing alternative/conditional
     * branch. Validate those original branch schemas at their own instances,
     * including the condition for then/else, rather than just the leaf hint. */
    partSchemaAssertions(target:GraphTarget,path:PartStep[],selection:GraphTarget,includeAssertions=false):PartSchemaAssertion[] {
        let work=0;
        const visit=(target:GraphTarget,remaining:PartStep[],consumed:PartStep[],active:ReadonlySet<string>):PartSchemaAssertion[]=>{
            const key=JSON.stringify([target,remaining]);
            if(++work>2048||active.has(key))return [];
            active=new Set(active).add(key);
            const value=this.graph.docs.get(target.resource)?.dataNode(target.pointer)?.value;
            if(!value||typeof value!=='object'||Array.isArray(value))return [];
            const contains=(branch:GraphTarget)=>this.partSchemas(branch,remaining,new Set(),0,'schema',includeAssertions).some(schema=>schema.resource===selection.resource&&schema.pointer===selection.pointer);
            const result:PartSchemaAssertion[]=[];
            for(const keyword of ['$ref','$dynamicRef'])if(typeof value[keyword]==='string'){
                const edge=this.graph.referenceAs(target.resource,target.pointer,keyword,'schema'),projection=edge&&projectSchemaReference(edge);
                if(projection?.state==='fixed')result.push(...visit(projection.target,remaining,consumed,active));
                if(schemaContext(this.graph,target.resource,target.pointer)?.family==='3.0')return result;
            }
            for(const keyword of ['allOf','anyOf','oneOf'])if(Array.isArray(value[keyword])){
                const branches=value[keyword].map((_:unknown,index:number)=>({...target,pointer:target.pointer+'/'+keyword+'/'+index}));
                const chosen=branches.filter(contains);
                if(keyword!=='allOf'&&chosen.length>1){
                    const range=this.graph.docs.get(target.resource)!.dataNode(target.pointer)!.range;
                    throw new SourceError('request.multipart.representation.ambiguous','The selected leaf belongs to several alternative representation branches',range,'unsupported',{...target,range});
                }
                for(const branch of chosen){
                    if(keyword!=='allOf')result.push({schema:branch,path:consumed,valid:true});
                    result.push(...visit(branch,remaining,consumed,active));
                }
            }
            for(const keyword of ['then','else'])if(value[keyword]!==undefined){
                const branch={...target,pointer:target.pointer+'/'+keyword};
                if(contains(branch)){
                    if(value.if!==undefined)result.push({schema:{...target,pointer:target.pointer+'/if'},path:consumed,valid:keyword==='then'});
                    result.push({schema:branch,path:consumed,valid:true},...visit(branch,remaining,consumed,active));
                }
            }
            if(remaining.length){
                const [step,...rest]=remaining;
                if('property' in step)for(const property of this.propertySchemas(target,step.property))result.push(...visit(property,rest,[...consumed,step],active));
                const pointer='property' in step?undefined:
                    step.item!==undefined&&Array.isArray(value.prefixItems)&&step.item<value.prefixItems.length?target.pointer+'/prefixItems/'+step.item:
                    value.items!==undefined&&!Array.isArray(value.items)?target.pointer+'/items':undefined;
                if(pointer!==undefined)result.push(...visit({...target,pointer},rest,[...consumed,step],active));
            }
            return result;
        };
        return visit(target,path,[],new Set());
    }

    shape(resource:string,pointer:string,seen:ReadonlySet<string>=new Set(),depth=0):FormShape {
        const key=resource+'#'+pointer;
        if(depth>128||seen.has(key))return {};
        seen=new Set(seen).add(key);
        const node=this.graph.docs.get(resource)?.dataNode(pointer),value=node?.value;
        if(!value||typeof value!=='object'||Array.isArray(value))return {};
        const scope=schemaContext(this.graph,resource,pointer);
        if(!scope)return {};
        const inherited:FormShape[]=[];
        for(const keyword of modernFamily(scope.family)?['$ref','$dynamicRef']:['$ref'])if(typeof value[keyword]==='string'){
            const edge=this.graph.referenceAs(resource,pointer,keyword,'schema');
            const projection=edge?projectSchemaReference(edge):undefined;
            const shape=projection?.state==='fixed'?this.shape(projection.target.resource,projection.target.pointer,seen,depth+1):{};
            inherited.push(shape);
            if(scope.family==='3.0')return shape;
        }
        const shapes:FormShape[]=[...inherited,...(Array.isArray(value.allOf)?value.allOf.map((_:unknown,index:number)=>this.shape(resource,pointer+'/allOf/'+index,seen,depth+1)):[])];
        let types=typeof value.type==='string'?[value.type]:Array.isArray(value.type)?value.type.filter((type:unknown)=>typeof type==='string'):undefined;
        if(scope.family==='3.0'&&value.nullable===true&&types&&!types.includes('null'))types=[...types,'null'];
        const properties:Record<string,FormShape>=Object.assign(Object.create(null),...shapes.map(shape=>shape.properties??{}));
        if(value.properties&&typeof value.properties==='object')for(const name of Object.keys(value.properties))properties[name]=this.shape(resource,pointer+'/properties/'+escape(name),seen,depth+1);
        const shape:FormShape={
            types:types??shapes.find(shape=>shape.types)?.types,
            format:typeof value.format==='string'?value.format:shapes.find(shape=>shape.format)?.format,
            contentEncoding:typeof value.contentEncoding==='string'?value.contentEncoding:shapes.find(shape=>shape.contentEncoding)?.contentEncoding,
            required:[...new Set([...shapes.flatMap(shape=>shape.required??[]),...(Array.isArray(value.required)?value.required:[])])],
            // Transport hints must describe the whole positive conjunction,
            // including bounds supplied by a different referenced conjunct.
            // Exact assertion evaluation remains with the canonical schema.
            minItems:minimumItems(value.minItems,shapes),
            maxItems:maximumItems(value.maxItems,shapes),
            properties,
            additionalProperties:value.additionalProperties&&typeof value.additionalProperties==='object'?this.shape(resource,pointer+'/additionalProperties',seen,depth+1):shapes.find(shape=>shape.additionalProperties)?.additionalProperties,
            patternProperties:modernFamily(scope.family)&&value.patternProperties&&typeof value.patternProperties==='object'?Object.fromEntries(Object.keys(value.patternProperties).map(pattern=>[pattern,this.shape(resource,pointer+'/patternProperties/'+escape(pattern),seen,depth+1)])):shapes.find(shape=>shape.patternProperties)?.patternProperties,
            items:value.items&&typeof value.items==='object'&&!Array.isArray(value.items)?this.shape(resource,pointer+'/items',seen,depth+1):shapes.find(shape=>shape.items)?.items,
            prefixItems:Array.isArray(value.prefixItems)?value.prefixItems.map((_:unknown,index:number)=>this.shape(resource,pointer+'/prefixItems/'+index,seen,depth+1)):shapes.find(shape=>shape.prefixItems)?.prefixItems,
        };
        return {...shape,literalType:formLiteralType(shape),defaultContentType:formContentType(shape,scope.family)};
    }

    media(family:string,resource:string,pointer:string,mediaType:string){
        const value=this.graph.docs.get(resource)?.dataNode(pointer)?.value,shape=this.shape(resource,pointer+'/schema');
        const encoding=this.namedEncoding(value?.encoding,[{schema:{resource,pointer:pointer+'/schema',kind:'schema'},path:[]}]);
        const fileShapes=new MultipartFileShapes(this.graph);
        const parts=Object.fromEntries([...new Set([...this.propertyNames({resource,pointer:pointer+'/schema',kind:'schema'}),...Object.keys(encoding)])].map(name=>{
            const rule=encoding[name],property=shape.properties?.[name],item=property?.types?.includes('array')?property.items:property;
            const multipart=mediaType.split(';')[0].trim().toLowerCase().startsWith('multipart/');
            const styled=(!multipart||family!=='3.0')&&['style','explode','allowReserved'].some(key=>Object.hasOwn(rule??{},key));
            const doc=this.graph.docs.get(resource)!;
            const at=[pointer+'/encoding/'+escape(name)+'/contentType',pointer+'/encoding/'+escape(name),pointer+'/schema/properties/'+escape(name),pointer+'/schema',pointer].find(at=>doc.dataNode(at))!;
            const node=doc.dataNode(at)!;
            let options:ReturnType<typeof mediaTypeOptions>|{error:string}|undefined;
            try{options=styled?undefined:mediaTypeOptions(rule?.contentType??item?.defaultContentType??formContentType({},family));}
            catch(error){if(!(error instanceof SourceError))throw error;options={error:error.message};}
            const shapes=namedFileShapeSelection(family,mediaType,styled)?fileShapes.choices({resource,pointer:pointer+'/schema',kind:'schema'},name):[];
            return [name,{name,styled,...options,...(shapes.length?{fileShapes:shapes}:{}),source:{resource,pointer:at,range:node.range}}];
        }));
        return {multipartStyle:family!=='3.0',legacyBinary:family==='3.0',
            defaultContentType:formContentType({},family),
            styles:['form','spaceDelimited','pipeDelimited','deepObject'],
            shape:{defaultContentType:formContentType({},family),...shape},parts};
    }
}

export function formMediaIssues(graph:ReferenceGraph){
    const issues:{resource:string;pointer:string;code:string;message:string;incomplete?:boolean;severity?:string}[]=[];
    for(const scope of graph.entryScopes()){
        if(scope.family==='3.0'&&scope.kind==='media'){
            let parent=scope.pointer,owner:string|undefined;
            while(parent){parent=parent.slice(0,parent.lastIndexOf('/'));const kind=graph.scopes.get(scope.resource+'#'+parent)?.kind;if(kind&&['request-body','response','parameter','header'].includes(kind)){owner=kind;break;}}
            if(owner==='request-body'){
                try{
                    const types=mediaTypes(segments(scope.pointer).at(-1)!);
                    if(types.length===1&&types[0].type==='multipart'&&!graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.children.has('schema'))
                        issues.push({...scope,code:'media.multipart.schema.required',message:'OpenAPI 3.0 multipart input content requires a schema (4.7.15.3)'});
                }catch(error){
                    // The shared media declaration check reports this at the
                    // actual key; do not duplicate it as a multipart finding.
                    if(!(error instanceof SourceError))throw error;
                }
            }
        }
        if(scope.kind!=='encoding')continue;
        const value=graph.docs.get(scope.resource)?.dataNode(scope.pointer)?.value?.contentType;
        if(typeof value!=='string')continue;
        try{mediaTypes(value);}catch(error){
            if(!(error instanceof SourceError))throw error;
            if(error.code==='request.form.media-parameters.unsupported')continue;
            issues.push({...scope,pointer:scope.pointer+'/contentType',code:error.code,message:error.message});
        }
    }
    return issues;
}
