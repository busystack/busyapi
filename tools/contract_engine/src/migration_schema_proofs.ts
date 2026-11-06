import {compare,decimal,multiple} from './exact_numbers';
import {escape,SourceError} from './document';
import {migrationValueIdentity} from './migration_source';
import {schemaResourceContextIdentity,supportedSchemaDialect,type GraphScope,type ReferenceGraph} from './reference_graph';
import {projectSchemaReference} from './schema_reference_projection';
import {requiredInBothDirections} from './schema_access';

const resourceFields=new Set(['$id','$schema','$anchor','$dynamicAnchor']);
const scalarAssertions=new Set(['type','const','enum','required','minimum','maximum','exclusiveMinimum','exclusiveMaximum',
    'multipleOf','minLength','maxLength','pattern','minItems','maxItems','uniqueItems','minProperties','maxProperties']);
const annotations=new Set(['title','description','$comment','default','examples','example','deprecated','readOnly','writeOnly','format','externalDocs','xml']);
const id=(scope:GraphScope)=>JSON.stringify([scope.resource,scope.pointer]);

/** Positive, bounded implication and annotation proofs over the canonical
 * capture. Failure to prove an implication is not a counterexample. Cycles
 * are never assumptions; only reflexivity can close a recursive identity.
 * This does not evaluate samples or introduce a second schema validator. */
export class MigrationSchemaProofs {
    private work=0;
    private discriminatorScopes:GraphScope[]|undefined;
    private lexicalSchemaScopes:GraphScope[]=[];
    constructor(private readonly graph:ReferenceGraph){}
    private inspect(scope:GraphScope):void {
        if(++this.work<=50000)return;
        const range=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)!.range;
        throw new SourceError('limit.migration.proof','Schema implication proof exceeds 50000 captured states',range,'unsupported',{...scope,range});
    }
    fixed(scope:GraphScope,keyword:string):GraphScope|undefined {
        const reference=this.graph.referenceAs(scope.resource,scope.pointer,keyword,'schema');
        const projection=reference&&projectSchemaReference(reference);
        return projection?.state==='fixed'?this.graph.scopeAs(projection.target.resource,projection.target.pointer,'schema'):undefined;
    }
    /** Validation truth may ignore metadata; callers must separately account
     * for its annotations. A false schema has no successful annotations. */
    validationConstant(scope:GraphScope,active=new Set<string>()):boolean|undefined {
        this.inspect(scope);if(active.has(id(scope))||active.size>=128||!supportedSchemaDialect(scope))return;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(typeof value==='boolean')return value;
        if(!value||typeof value!=='object'||Array.isArray(value))return;
        const next=new Set(active).add(id(scope)),results:(boolean|undefined)[]=[];
        const fields=this.graph.referenceObject(value,scope)?['$ref']:Object.keys(value);
        for(const name of fields){
            if(resourceFields.has(name)||annotations.has(name)||name.startsWith('x-'))continue;
            if(['$ref','$dynamicRef'].includes(name)){
                const target=this.fixed(scope,name);results.push(target?this.validationConstant(target,next):undefined);
            }else if(['allOf','anyOf','oneOf'].includes(name)){
                const choices=value[name].map((_:unknown,index:number)=>{
                    const child=this.graph.scopeAs(scope.resource,scope.pointer+'/'+name+'/'+index,'schema');
                    return child?this.validationConstant(child,next):undefined;
                });
                results.push(name==='allOf'?choices.includes(false)?false:choices.every(value=>value===true)?true:undefined:
                    name==='anyOf'?choices.includes(true)?true:choices.every(value=>value===false)?false:undefined:
                    choices.filter(value=>value===true).length>1?false:choices.some(value=>value===undefined)?undefined:choices.filter(value=>value===true).length===1);
            }else if(name==='not'){
                const child=this.graph.scopeAs(scope.resource,scope.pointer+'/not','schema'),truth=child?this.validationConstant(child,next):undefined;
                results.push(truth===undefined?undefined:!truth);
            }else results.push(undefined);
        }
        return results.includes(false)?false:results.every(value=>value===true)?true:undefined;
    }
    /** With coverage=true, child applicators may contribute evaluated-location
     * coverage, but no instance metadata. Callers must separately preserve that
     * coverage (for example an existing closed properties domain). */
    annotationFree(scope:GraphScope,coverage=false,active=new Set<string>()):boolean {
        this.inspect(scope);if(!supportedSchemaDialect(scope)||active.size>=128||active.has(id(scope)))return false;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(typeof value==='boolean')return true;
        if(!value||typeof value!=='object'||Array.isArray(value))return false;
        const next=new Set(active).add(id(scope));
        for(const name of Object.keys(value)){
            if(resourceFields.has(name)||scalarAssertions.has(name))continue;
            if(['$ref','$dynamicRef'].includes(name)){
                const target=this.fixed(scope,name);if(!target||!this.annotationFree(target,coverage,next))return false;
            }else if(['allOf','anyOf','oneOf'].includes(name)){
                if(!value[name].every((_:unknown,index:number)=>{
                    const child=this.graph.scopeAs(scope.resource,scope.pointer+'/'+name+'/'+index,'schema');
                    return child&&this.annotationFree(child,coverage,next);
                }))return false;
            }else if(name==='not'){
                // not suppresses all child annotations, but dynamic resolution
                // and dialect support must still be established by conversion.
                const child=this.graph.scopeAs(scope.resource,scope.pointer+'/not','schema');
                if(!child)return false;
            }else if(coverage&&['properties','prefixItems','items','additionalProperties'].includes(name)){
                const children=name==='properties'||name==='prefixItems'?
                    [...this.graph.docs.get(scope.resource)!.dataNode(scope.pointer+'/'+name)!.children.keys()]
                        .map(key=>scope.pointer+'/'+name+'/'+escape(key)):[scope.pointer+'/'+name];
                for(const pointer of children){
                    const child=this.graph.scopeAs(scope.resource,pointer,'schema');
                    if(!child||!this.annotationFree(child,true,next))return false;
                }
            }else return false;
        }
        return true;
    }
    annotationsCoveredByProperties(scope:GraphScope,names:ReadonlySet<string>,seen=new Set<string>()):boolean {
        if(this.annotationFree(scope))return true;
        if(seen.has(id(scope))||seen.size>=128)return false;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(!value||typeof value!=='object'||Array.isArray(value))return false;
        const next=new Set(seen).add(id(scope));
        return Object.keys(value).every(field=>{
            if(resourceFields.has(field)||scalarAssertions.has(field))return true;
            if(field==='properties')return Object.keys(value.properties).every(name=>{
                const child=this.graph.scopeAs(scope.resource,scope.pointer+'/properties/'+escape(name),'schema');
                return names.has(name)&&child&&this.annotationFree(child);
            });
            if(['allOf','anyOf','oneOf'].includes(field))return value[field].every((_:unknown,index:number)=>{
                const child=this.graph.scopeAs(scope.resource,scope.pointer+'/'+field+'/'+index,'schema');
                return child&&this.annotationsCoveredByProperties(child,names,next);
            });
            if(['$ref','$dynamicRef'].includes(field)){
                const target=this.fixed(scope,field);return target&&this.annotationsCoveredByProperties(target,names,next);
            }
            return false;
        });
    }
    /** Same-instance conjuncts only. Sibling branches, array/property children,
     * conditional branches and dependent schemas cannot become assumptions. */
    conjuncts(scope:GraphScope,active=new Set<string>()):GraphScope[] {
        this.inspect(scope);if(active.has(id(scope))||active.size>=128||!supportedSchemaDialect(scope))return [];
        const result=[scope],value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(!value||typeof value!=='object'||Array.isArray(value))return result;
        const next=new Set(active).add(id(scope));
        for(const keyword of ['$ref','$dynamicRef']){
            const target=this.fixed(scope,keyword);if(target)result.push(...this.conjuncts(target,next));
        }
        if(!this.graph.referenceObject(value,scope))for(let index=0;index<(value.allOf?.length??0);index++){
            const child=this.graph.scopeAs(scope.resource,scope.pointer+'/allOf/'+index,'schema');
            if(child)result.push(...this.conjuncts(child,next));
        }
        return result;
    }
    /** A positive superset of accepted JSON instance kinds. Unknown types and
     * native binary representations do not authorize a domain exclusion. */
    domains(scope:GraphScope):ReadonlySet<string> {
        let domains=new Set(['null','boolean','object','array','integer','fraction','string']);
        const parts=this.conjuncts(scope);
        if(parts.some(part=>{
            const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
            const types=typeof value?.type==='string'?[value.type]:value?.type;
            return !this.graph.referenceObject(value,part)&&Array.isArray(types)&&types.some(type=>!['null','boolean','object','array','integer','number','string'].includes(type));
        }))return domains;
        for(const part of parts){
            const doc=this.graph.docs.get(part.resource)!,value=doc.dataNode(part.pointer)?.value;
            if(value===false)return new Set();
            if(this.graph.referenceObject(value,part))continue;
            const types=typeof value?.type==='string'?[value.type,...(part.family==='3.0'&&value.nullable===true?['null']:[])]:value?.type;
            if(Array.isArray(types)){
                const selected=new Set(types.flatMap(type=>type==='number'?['integer','fraction']:[type]));
                if([...selected].some(type=>!['null','boolean','object','array','integer','fraction','string'].includes(type)))continue;
                domains=new Set([...domains].filter(type=>selected.has(type)));
            }
            const literals=Object.hasOwn(value??{},'const')?[part.pointer+'/const']:
                Array.isArray(value?.enum)?value.enum.map((_:unknown,index:number)=>part.pointer+'/enum/'+index):undefined;
            if(literals){
                const selected=new Set(literals.map(pointer=>{
                    const node=doc.dataNode(pointer)!;
                    if(typeof node.value!=='number')return node.kind;
                    const number=decimal(doc.dataJson(pointer));return number.coefficient===0n||number.exponent>=0n?'integer':'fraction';
                }));
                domains=new Set([...domains].filter(type=>selected.has(type)));
            }
        }
        return domains;
    }
    annotationsInactiveIn(scope:GraphScope,domains:ReadonlySet<string>,seen=new Set<string>()):boolean {
        this.inspect(scope);if(seen.size>=128||seen.has(id(scope))||!supportedSchemaDialect(scope))return false;
        if(!domains.size)return true;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(typeof value==='boolean')return true;
        if(!value||typeof value!=='object'||Array.isArray(value))return false;
        const next=new Set(seen).add(id(scope));
        return Object.keys(value).every(field=>{
            if(resourceFields.has(field)||scalarAssertions.has(field))return true;
            const domain=['properties','additionalProperties','dependentSchemas','dependentRequired'].includes(field)?'object':
                ['items','prefixItems','contains','minContains','maxContains'].includes(field)?'array':undefined;
            if(domain&&!domains.has(domain))return true;
            if(['$ref','$dynamicRef'].includes(field)){
                const target=this.fixed(scope,field);return target&&this.annotationsInactiveIn(target,domains,next);
            }
            if(['allOf','anyOf','oneOf'].includes(field))return value[field].every((_:unknown,index:number)=>{
                const child=this.graph.scopeAs(scope.resource,scope.pointer+'/'+field+'/'+index,'schema');
                return child&&this.annotationsInactiveIn(child,domains,next);
            });
            if(field==='not')return true;
            return false;
        });
    }
    sameInstanceDiscriminator(scope:GraphScope):boolean {
        return this.conjuncts(scope).some(part=>Object.hasOwn(this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value??{},'discriminator'));
    }
    contextualDiscriminator(scope:GraphScope):boolean {
        if(this.sameInstanceDiscriminator(scope))return true;
        if(!this.discriminatorScopes){
            this.discriminatorScopes=[];
            for(const child of this.graph.entryScopes()){
                this.inspect(scope);
                if(child.kind==='schema'){
                    this.lexicalSchemaScopes.push(child);
                    if(Object.hasOwn(this.graph.docs.get(child.resource)!.dataNode(child.pointer)?.value??{},'discriminator'))this.discriminatorScopes.push(child);
                }
            }
        }
        for(const child of this.discriminatorScopes){
            this.inspect(scope);if(child.resource===scope.resource&&child.pointer.startsWith(scope.pointer+'/'))return true;
        }
        if(this.discriminatorScopes.length)for(const child of this.lexicalSchemaScopes)if(child.resource===scope.resource&&child.pointer.startsWith(scope.pointer+'/')){
            if(this.conjuncts(child).some(part=>Object.hasOwn(this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value??{},'discriminator')))return true;
        }
        return false;
    }
    /** Applying this schema with an absent trigger contributes no assertions
     * or child annotations. In particular root metadata cannot be relocated to
     * the trigger's value, and required is not a presence-neutral keyword. */
    neutralWithoutProperty(scope:GraphScope,name:string,active=new Set<string>()):boolean {
        this.inspect(scope);if(active.has(id(scope))||active.size>=128||!supportedSchemaDialect(scope))return false;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(value===true)return true;
        if(!value||typeof value!=='object'||Array.isArray(value))return false;
        const next=new Set(active).add(id(scope));
        return Object.keys(value).every(field=>{
            if(resourceFields.has(field))return true;
            if(field==='properties')return Object.keys(value.properties).every(key=>key===name);
            if(['$ref','$dynamicRef'].includes(field)){
                const target=this.fixed(scope,field);return target!==undefined&&this.neutralWithoutProperty(target,name,next);
            }
            if(field==='allOf')return value.allOf.every((_:unknown,index:number)=>{
                const child=this.graph.scopeAs(scope.resource,scope.pointer+'/allOf/'+index,'schema');
                return child&&this.neutralWithoutProperty(child,name,next);
            });
            return false;
        });
    }
    /** Applicator children run only in the keyword's native instance domain.
     * Root annotations/type assertions would also affect inactive instances. */
    neutralOutside(scope:GraphScope,domains:ReadonlySet<string>,active=new Set<string>()):boolean {
        this.inspect(scope);if(active.has(id(scope))||active.size>=128||!supportedSchemaDialect(scope))return false;
        const value=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer)?.value;
        if(value===true)return true;
        if(!value||typeof value!=='object'||Array.isArray(value))return false;
        const next=new Set(active).add(id(scope));
        return Object.keys(value).every(field=>{
            if(resourceFields.has(field))return true;
            if(['required','properties','additionalProperties','minProperties','maxProperties','dependentRequired','dependentSchemas'].includes(field))return domains.has('object');
            if(['items','prefixItems','minItems','maxItems','uniqueItems'].includes(field))return domains.has('array');
            if(['minLength','maxLength','pattern'].includes(field))return domains.has('string');
            if(['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf'].includes(field))return domains.has('number');
            if(['$ref','$dynamicRef'].includes(field)){
                const target=this.fixed(scope,field);return target!==undefined&&this.neutralOutside(target,domains,next);
            }
            if(field==='allOf')return value.allOf.every((_:unknown,index:number)=>{
                const child=this.graph.scopeAs(scope.resource,scope.pointer+'/allOf/'+index,'schema');return child&&this.neutralOutside(child,domains,next);
            });
            return false;
        });
    }
    disjoint(left:GraphScope,right:GraphScope):boolean {
        const sets=(scope:GraphScope)=>this.conjuncts(scope).flatMap(part=>{
            const value=this.graph.docs.get(part.resource)!.dataNode(part.pointer)?.value;
            if(this.graph.referenceObject(value,part))return [];
            const list=typeof value?.type==='string'?[value.type,...(part.family==='3.0'&&value.nullable===true?['null']:[])]:value?.type;
            return Array.isArray(list)?[new Set(list.flatMap(type=>type==='number'?['number','integer']:[type]))]:[];
        });
        return sets(left).some(a=>sets(right).some(b=>[...a].every(type=>!b.has(type))));
    }
    implies(left:GraphScope,right:GraphScope,active=new Set<string>()):boolean {
        this.inspect(left);const pair=JSON.stringify([id(left),id(right)]);
        if(active.has(pair)||active.size>=128||!supportedSchemaDialect(left)||!supportedSchemaDialect(right))return false;
        const a=this.graph.docs.get(left.resource)!,b=this.graph.docs.get(right.resource)!;
        const source=a.dataNode(left.pointer)?.value,target=b.dataNode(right.pointer)?.value;
        if(id(left)===id(right)||source===false||target===true)return true;
        if(schemaResourceContextIdentity(left)===schemaResourceContextIdentity(right)&&
            migrationValueIdentity(a,left.pointer)===migrationValueIdentity(b,right.pointer))return true;
        if(!target||typeof target!=='object'||Array.isArray(target))return false;
        const next=new Set(active).add(pair),parts=this.conjuncts(left),domains=this.domains(left);
        const values=parts.map(scope=>{
            const doc=this.graph.docs.get(scope.resource)!,value=doc.dataNode(scope.pointer)?.value;
            return {scope,doc,value:this.graph.referenceObject(value,scope)?{}:value};
        });
        if(values.some(part=>part.value===false))return true;
        const finiteAtom=(field:string)=>values.some(({scope,doc,value})=>{
            const pointers=Object.hasOwn(value??{},'const')?[scope.pointer+'/const']:
                Array.isArray(value?.enum)?value.enum.map((_:unknown,index:number)=>scope.pointer+'/enum/'+index):undefined;
            return pointers?.every(at=>{
                const node=doc.dataNode(at)!,number=typeof node.value==='number'?decimal(doc.dataJson(at)):undefined;
                if(['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf'].includes(field)){
                    if(!number)return true;
                    if(field==='multipleOf')return multiple(number,decimal(b.dataJson(right.pointer+'/'+field)));
                    if(typeof target[field]==='boolean')return true;
                    const lower=field.endsWith('Minimum')||field==='minimum',strict=field.startsWith('exclusive')||target[lower?'exclusiveMinimum':'exclusiveMaximum']===true;
                    const order=compare(number,decimal(b.dataJson(right.pointer+'/'+field)));
                    return lower?(strict?order>0:order>=0):(strict?order<0:order<=0);
                }
                const length=field.endsWith('Length')?typeof node.value==='string'?[...node.value].length:undefined:
                    field.endsWith('Items')?Array.isArray(node.value)?node.value.length:undefined:
                    field.endsWith('Properties')?node.kind==='object'?node.children.size:undefined:undefined;
                if(length!==undefined){
                    const order=compare(decimal(String(length)),decimal(b.dataJson(right.pointer+'/'+field)));
                    return field.startsWith('min')?order>=0:order<=0;
                }
                if(['minLength','maxLength','minItems','maxItems','minProperties','maxProperties'].includes(field))return true;
                return false;
            })??false;
        });
        const atom=(field:string):boolean=>{
            if(resourceFields.has(field)||annotations.has(field)||field.startsWith('x-'))return true;
            const domain=['required','properties','additionalProperties','minProperties','maxProperties','dependentSchemas','dependentRequired'].includes(field)?'object':
                ['items','prefixItems','contains','minContains','maxContains','minItems','maxItems','uniqueItems'].includes(field)?'array':
                ['minLength','maxLength','pattern'].includes(field)?'string':
                ['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf'].includes(field)?'number':undefined;
            if(domain&&(domain==='number'?!domains.has('integer')&&!domains.has('fraction'):!domains.has(domain)))return true;
            if(['$ref','$dynamicRef'].includes(field)){
                const resolved=this.fixed(right,field);return resolved!==undefined&&this.implies(left,resolved,next);
            }
            if(field==='allOf')return target.allOf.every((_:unknown,index:number)=>{
                const child=this.graph.scopeAs(right.resource,right.pointer+'/allOf/'+index,'schema');return child&&this.implies(left,child,next);
            });
            if(['anyOf','oneOf'].includes(field)){
                if(field==='oneOf')return false;
                return target[field].some((_:unknown,index:number)=>{
                    const child=this.graph.scopeAs(right.resource,right.pointer+'/'+field+'/'+index,'schema');return child&&this.implies(left,child,next);
                });
            }
            if(field==='type'){
                const allowed=new Set(typeof target.type==='string'?[target.type,...(right.family==='3.0'&&target.nullable===true?['null']:[])]:target.type);
                const accepts=(type:string)=>allowed.has(type)||type==='integer'&&allowed.has('number');
                if(values.some(({scope,value})=>{
                    const local=typeof value?.type==='string'?[value.type,...(scope.family==='3.0'&&value.nullable===true?['null']:[])]:value?.type;
                    return Array.isArray(local)&&local.every(accepts);
                }))return true;
                if(allowed.has('integer')&&values.some(({scope,value})=>{
                    const local=typeof value?.type==='string'?[value.type,...(scope.family==='3.0'&&value.nullable===true?['null']:[])]:value?.type;
                    return Array.isArray(local)&&local.some(type=>type==='number'||type==='integer')&&
                        local.every(type=>type==='number'||type==='integer'||allowed.has(type));
                })&&values.some(({scope,doc,value})=>{
                    if(typeof value?.multipleOf!=='number')return false;
                    const divisor=decimal(doc.dataJson(scope.pointer+'/multipleOf'));return divisor.coefficient>0n&&divisor.exponent>=0n;
                }))return true;
                return values.some(({scope,doc,value})=>{
                    const literals=Object.hasOwn(value??{},'const')?[scope.pointer+'/const']:
                        Array.isArray(value?.enum)?value.enum.map((_:unknown,index:number)=>scope.pointer+'/enum/'+index):undefined;
                    return literals?.every(pointer=>{
                        const node=doc.dataNode(pointer)!;let type=node.kind;
                        if(typeof node.value==='number'){
                            const number=decimal(doc.dataJson(pointer));type=number.coefficient===0n||number.exponent>=0n?'integer':'number';
                        }
                        return accepts(type);
                    })??false;
                });
            }
            if(field==='required')return target.required.every((name:string)=>values.some(({scope,value})=>{
                return value?.required?.includes(name)&&requiredInBothDirections(this.graph,scope,name);
            }));
            if(field==='properties')return Object.keys(target.properties).every(name=>{
                const desired=this.graph.scopeAs(right.resource,right.pointer+'/properties/'+escape(name),'schema');
                return desired&&values.some(({scope,value})=>{
                    if(value?.additionalProperties===false&&!value.patternProperties&&!Object.hasOwn(value.properties??{},name))return true;
                    const actual=this.graph.scopeAs(scope.resource,scope.pointer+'/properties/'+escape(name),'schema');
                    return actual&&this.implies(actual,desired,next);
                });
            });
            if(field==='additionalProperties'){
                if(target.additionalProperties===true)return true;
                if(target.additionalProperties!==false||target.patternProperties)return false;
                return values.some(({value})=>value?.additionalProperties===false&&!value.patternProperties&&
                    Object.keys(value.properties??{}).every(name=>Object.hasOwn(target.properties??{},name)));
            }
            if(['minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','minItems','maxItems','minProperties','maxProperties'].includes(field)){
                const numeric=['minimum','maximum','exclusiveMinimum','exclusiveMaximum'].includes(field);
                const lower=field==='minimum'||field==='exclusiveMinimum'||field.startsWith('min');
                if(field.startsWith('exclusive')&&typeof target[field]==='boolean')return true;
                const strict=field.startsWith('exclusive')||numeric&&target[lower?'exclusiveMinimum':'exclusiveMaximum']===true;
                const bound=decimal(b.dataJson(right.pointer+'/'+field));
                return finiteAtom(field)||values.some(({scope,doc,value})=>{
                    const candidates=numeric?(lower?['minimum','exclusiveMinimum']:['maximum','exclusiveMaximum']):[field];
                    return candidates.some(name=>{
                        if(typeof value?.[name]!=='number')return false;
                        const order=compare(decimal(doc.dataJson(scope.pointer+'/'+name)),bound);
                        const sourceStrict=name.startsWith('exclusive')||numeric&&value[lower?'exclusiveMinimum':'exclusiveMaximum']===true;
                        return lower?(order>0||order===0&&(!strict||sourceStrict)):
                            order<0||order===0&&(!strict||sourceStrict);
                    });
                });
            }
            if(field==='multipleOf')return finiteAtom(field)||values.some(({scope,doc,value})=>
                value?.type==='integer'&&multiple(decimal('1'),decimal(b.dataJson(right.pointer+'/multipleOf')))||
                typeof value?.multipleOf==='number'&&multiple(decimal(doc.dataJson(scope.pointer+'/multipleOf')),decimal(b.dataJson(right.pointer+'/multipleOf'))));
            if(field==='uniqueItems')return target.uniqueItems!==true||values.some(({value})=>value?.uniqueItems===true);
            if(field==='pattern')return values.some(({value})=>value?.pattern===target.pattern);
            if(field==='const'||field==='enum'){
                const desired=field==='const'?[right.pointer+'/const']:target.enum.map((_:unknown,index:number)=>right.pointer+'/enum/'+index);
                return values.some(({scope,doc,value})=>{
                    const actual=Object.hasOwn(value??{},'const')?[scope.pointer+'/const']:
                        Array.isArray(value?.enum)?value.enum.map((_:unknown,index:number)=>scope.pointer+'/enum/'+index):undefined;
                    return actual?.every(at=>desired.some(to=>{
                        const x=doc.dataNode(at)!,y=b.dataNode(to)!;
                        return typeof x.value==='number'&&typeof y.value==='number'?
                            compare(decimal(doc.dataJson(at)),decimal(b.dataJson(to)))===0:
                            migrationValueIdentity(doc,at)===migrationValueIdentity(b,to);
                    }))??false;
                });
            }
            return false;
        };
        if((this.graph.referenceObject(target,right)?['$ref']:Object.keys(target)).every(atom))return true;
        // Each alternative must imply the target; oneOf does not authorize
        // selecting whichever alternative happened to succeed for a sample.
        for(const keyword of ['anyOf','oneOf'])if(Array.isArray(source?.[keyword])&&source[keyword].length&&source[keyword].every((_:unknown,index:number)=>{
            const child=this.graph.scopeAs(left.resource,left.pointer+'/'+keyword+'/'+index,'schema');return child&&this.implies(child,right,next);
        }))return true;
        return false;
    }
}
