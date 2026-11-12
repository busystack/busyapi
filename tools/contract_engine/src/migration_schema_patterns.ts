import {escape,SourceError} from './document';
import type {GraphScope,GraphReference,ReferenceGraph} from './reference_graph';
import type {SourcePlan} from './source_plan';
import type {MigrationSchemaOwners} from './migration_schema_owners';
import type {MigrationIssue} from './migration_schema';
import {finitePropertyNameSet} from './migration_schema_property_names';
import type {MigrationPropertyDomains} from './migration_schema_name_domains';
import {MigrationSchemaProofs} from './migration_schema_proofs';
import {universalNamePatterns as universalPatterns,finiteRegexNameSuperset} from './migration_schema_regex';
import {discardInactiveMigrationSchema} from './migration_schema_conditions';

type PatternUse=Readonly<{pointer:string;names:readonly string[]|undefined}>;

/** Core 10.3.2.2–4: finite domains/selectors, universal selectors and equivalent
 * uniform values establish exact pattern selections. Separate allOf branches retain every matching assertion; empty
 * placeholders in the original properties map keep additionalProperties from
 * evaluating names that the original patterns matched. Native model names
 * never own pattern values: common anonymous array-item owners retain them. */
export class MigrationPatternProperties {
    private readonly plans=new Map<string,readonly PatternUse[]|null>();
    private matchWork=0;
    private generatedBytes=0;
    constructor(private readonly graph:ReferenceGraph,private readonly owners:MigrationSchemaOwners,
        private readonly references:readonly GraphReference[],private readonly issue:MigrationIssue,
        private readonly domains?:MigrationPropertyDomains){}

    private plan(scope:GraphScope):readonly PatternUse[]|undefined {
        const id=JSON.stringify([scope.resource,scope.pointer]),known=this.plans.get(id);
        if(known!==undefined)return known??undefined;
        const doc=this.graph.docs.get(scope.resource)!,original=scope.pointer+'/patternProperties',patterns=doc.dataNode(original);
        if(patterns?.kind!=='object')return;
        this.plans.set(id,null);
        const proof=finitePropertyNameSet(doc.dataNode(scope.pointer+'/propertyNames')?.value);
        const domain=proof?.names??this.domains?.names(scope);
        // On an unbounded domain, equivalent annotation-free pattern and
        // additional value schemas can use uniform additionalProperties. Only
        // explicitly named properties still need regex-selected intersections.
        const proofs=new MigrationSchemaProofs(this.graph),additional=this.graph.scopeAs(scope.resource,scope.pointer+'/additionalProperties','schema');
        const uniform=domain===undefined&&additional&&proofs.annotationFree(additional)&&[...patterns.children.keys()].every(pattern=>{
            const child=this.graph.scopeAs(scope.resource,original+'/'+escape(pattern),'schema');
            return child&&proofs.annotationFree(child)&&proofs.implies(child,additional)&&proofs.implies(additional,child);
        });
        const finitePatterns=new Map([...patterns.children.keys()].map(pattern=>[pattern,finiteRegexNameSuperset(pattern)]));
        if(domain===undefined&&!uniform&&[...patterns.children.keys()].some(pattern=>!universalPatterns.has(pattern)&&finitePatterns.get(pattern)===undefined))return;
        const names=[...new Set(domain??(uniform?Object.keys(doc.dataNode(scope.pointer)?.value?.properties??{}):[]))];
        if(names.length>2048||patterns.children.size>128||names.reduce((size,name)=>size+Buffer.byteLength(name),0)>1024*1024){
            this.issue({...scope,pointer:original},'limit.migration.pattern-properties','Finite pattern selection exceeds 2048 names, 128 patterns or 1 MiB of property names','implementation');return;
        }
        if(this.graph.literalContainer(scope.resource,scope.pointer)!==undefined||this.graph.hasOverlappingScope(scope.resource,scope.pointer)||
            this.graph.scopeAs(scope.resource,original,'schema')!==undefined){
            this.issue({...scope,pointer:original},'migration.schema.pattern-owner','This pattern map still has an independent literal or Schema interpretation requiring its material owner','implementation');return;
        }
        const uses:PatternUse[]=[];
        for(const [pattern,node]of patterns.children){
            const pointer=original+'/'+escape(pattern);
            if(pattern.length>4096){
                this.issue({...scope,pointer},'limit.migration.pattern-properties','Finite pattern selection exceeds 4096 characters in one pattern','implementation');return;
            }
            if(this.graph.literalContainer(scope.resource,pointer)!==undefined||this.graph.hasOverlappingScope(scope.resource,pointer)){
                this.issue({...scope,pointer},'migration.schema.pattern-owner','This pattern value still requires an independent material Schema owner','implementation');return;
            }
            if(domain===undefined&&!uniform&&universalPatterns.has(pattern)){uses.push({pointer,names:undefined});continue;}
            let expression:RegExp;
            // Match the exact pinned Hyperjump 1.18 patternProperties compile
            // mode. The finite input/work limits remain inside the ordinary
            // cancellable engine request and its deadline; regex matching has
            // no resource-acquisition or instance-generation authority.
            try {expression=new RegExp(pattern,'u');}
            catch(error){
                if(!(error instanceof SyntaxError))throw error;
                this.issue({...scope,pointer},'migration.schema.pattern-invalid','This captured pattern cannot be compiled by the pinned schema evaluator','source-incomplete');return;
            }
            const selected:string[]=[];
            const candidates=domain!==undefined||uniform?names:finitePatterns.get(pattern)??[];
            for(const name of candidates){
                this.matchWork+=Math.max(1,name.length)*Math.max(1,pattern.length);
                if(this.matchWork>8*1024*1024)
                    throw new SourceError('limit.migration.pattern-properties','Finite pattern selection exceeds 8 MiB of pattern/name work',node.range,'unsupported',
                        {resource:scope.resource,pointer,range:node.range});
                if(expression.test(name))selected.push(name);
            }
            uses.push({pointer,names:selected});
        }
        this.plans.set(id,uses);return uses;
    }

    discardInactive(scope:GraphScope,source:SourcePlan):void {
        const patterns=this.graph.docs.get(scope.resource)!.dataNode(scope.pointer+'/patternProperties');
        if(patterns?.kind==='object'&&[...patterns.children.keys()].some(pattern=>universalPatterns.has(pattern))&&
            this.graph.literalContainer(scope.resource,scope.pointer)===undefined&&!this.graph.hasOverlappingScope(scope.resource,scope.pointer)){
            const original={resource:scope.resource,pointer:scope.pointer+'/additionalProperties'};
            discardInactiveMigrationSchema(this.graph,original,source,this.owners,this.references);
            const at=source.current(original.pointer,scope.resource);
            if(at!==undefined)this.owners.move(original,source,at,'pattern_excluded_additional',{context:this.graph,layout:'array-item'});
        }
        for(const use of this.plan(scope)??[]){
            const at=source.current(use.pointer,scope.resource);
            if(at!==undefined&&use.names?.length===0&&!this.owners.hasConsumers({resource:scope.resource,pointer:use.pointer},this.references)){
                this.owners.admit(source,4);source.remove(at,true,true,true);
            }
        }
    }

    lower(scope:GraphScope,source:SourcePlan,pointer:string,target:string):void {
        const uses=this.plan(scope);if(!uses)return;
        const context=this.owners.contextOf(scope);
        if(!context){this.issue(scope,'migration.schema.pattern-context','Finite pattern values require their captured entry and schema resource context','implementation');return;}
        const properties=pointer+'/properties',allOf=pointer+'/allOf';
        if(uses.some(use=>use.names===undefined)){
            const original={resource:scope.resource,pointer:scope.pointer+'/additionalProperties'},at=source.current(original.pointer,scope.resource);
            if(at!==undefined){
                if(this.owners.hasConsumers(original,this.references))this.owners.move(original,source,at,'pattern_excluded_additional',{context,layout:'array-item'});
                else {this.owners.admit(source,4);source.remove(at,true,true,true);}
            }
        }
        for(const use of uses){
            const at=source.current(use.pointer,scope.resource);if(at===undefined)continue;
            const owner=this.owners.move({resource:scope.resource,pointer:use.pointer},source,at,'pattern',{layout:'array-item',context});
            if(use.names?.length===0)continue;
            const reference=this.owners.reference(owner,target);
            if(use.names===undefined){
                this.owners.admit(source,3);if(!source.doc.dataNode(allOf))source.set(allOf,[]);
                const branch=allOf+'/'+source.doc.dataNode(allOf).children.size;
                source.set(branch,{additionalProperties:{$ref:reference}});source.presentationChanges.push(branch);continue;
            }
            const values=Object.fromEntries(use.names.map(name=>[name,{$ref:reference}]));
            this.generatedBytes+=Buffer.byteLength(JSON.stringify(values));
            if(this.generatedBytes>8*1024*1024)throw new SourceError('limit.migration.pattern-properties','Finite pattern output exceeds 8 MiB');
            for(const name of use.names){
                const property=properties+'/'+escape(name);
                if(!source.doc.dataNode(property)){this.owners.admit(source,2);source.set(property,{});}
            }
            this.owners.admit(source,3);if(!source.doc.dataNode(allOf))source.set(allOf,[]);
            const branch=allOf+'/'+source.doc.dataNode(allOf).children.size;
            source.set(branch,{properties:values});source.presentationChanges.push(branch);
        }
        const at=source.current(scope.pointer+'/patternProperties',scope.resource);
        if(at!==undefined){this.owners.admit(source,4);source.remove(at,true,true,true);}
    }
}
