import {SourceDocument,SourceError,escape} from './document';
import {decimal} from './exact_numbers';
import {record} from './engine_worker_client';
import type {Resource} from './engine';
import type {GraphReference} from './reference_graph';
import {MigrationSource} from './migration_source';
import {dirname,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {MigrationConfigurationProjection} from './migration_server_configuration';
import type {SecurityAlternativeProjection} from './security_requirements';

export type SecurityBindingChange={root:string;before:GraphReference;after:GraphReference};
type BindingCopy={kind:'createData';pointer:string;raw:string};

function capturedConfiguration(value:unknown):Resource {
    if(!record(value)||typeof value.id!=='string'||typeof value.text!=='string'||Buffer.byteLength(value.text)>65536||typeof value.identity!=='string'||
        typeof value.generation!=='number'||!Number.isSafeInteger(value.generation)||value.generation<0)
        throw new SourceError('refactor.configuration.snapshot','Expected one bounded captured project configuration');
    return {id:value.id,text:value.text,generation:value.generation,identity:value.identity};
}

/** Reserve existing environment spellings without reading credential stores.
 * A fresh component alias must not adopt another binding's settings. */
export function securityConfigurationNames(value:unknown):ReadonlySet<string> {
    if(value===undefined||value===null)return new Set();
    const captured=capturedConfiguration(value),doc=new SourceDocument(captured.text,captured.id,true),names=new Set<string>();
    for(const environment of doc.dataNode('/environments')?.children.values()??[])
        for(const name of doc.dataNode(environment.pointer+'/authentication/schemes')?.children.keys()??[])names.add(name);
    return names;
}

/** Refactoring preserves a scheme's meaning; changing its binding spelling
 * must preserve configured execution too. Keep original environment bindings
 * for other operations/roots and add exact captured aliases. Credentials are
 * neither read nor generated, and conflicting destination settings block the
 * entire reviewed edit rather than replacing a user's configuration. */
export function securityConfigurationCopies(value:unknown,bindings:readonly SecurityBindingChange[]) {
    if(value===undefined||value===null)return;
    const changed=new Map<string,Map<string,SecurityBindingChange>>();
    for(const binding of bindings){
        if(binding.before.value===binding.after.value)continue;
        if(binding.before.connection!=='security'||binding.after.connection!=='security'||binding.before.resolution!=='resolved'||binding.after.resolution!=='resolved')
            throw new SourceError('refactor.configuration.proof','Authentication aliases require proved security bindings');
        const key=JSON.stringify([binding.before.value,binding.after.value]),origins=changed.get(key)??new Map<string,SecurityBindingChange>();
        origins.set(JSON.stringify([binding.root,binding.before.targetResource,binding.before.targetPointer]),binding);
        changed.set(key,origins);
    }
    if(!changed.size)return;
    const source=capturedConfiguration(value);
    const doc=new SourceDocument(source.text,source.id,true);
    if(doc.issues.length||doc.root.value?.version!==1){
        const range=doc.issues[0]?.range??doc.root.range;
        throw new SourceError('refactor.configuration.syntax','Repair the project configuration before preserving its authentication bindings',range,undefined,{resource:source.id,pointer:'',range});
    }
    const fail=(pointer:string,code:string,message:string):never=>{
        const range=doc.dataNode(pointer)?.range??doc.root.range;
        throw new SourceError(code,message,range,code.startsWith('limit.')?'unsupported':undefined,{resource:source.id,pointer,range});
    };
    const environments=doc.dataNode('/environments');
    if(!environments)return;
    if(environments.kind!=='object')fail('/environments','refactor.configuration.authentication','Environments must be a mapping');
    const identity=(pointer:string,depth=0):string=>{
        if(depth>32)fail(pointer,'limit.refactor.configuration','Authentication configuration exceeds its bounded nesting depth');
        const node=doc.dataNode(pointer)!;
        if(node.kind==='object')return '{'+[...node.children.keys()].sort().map(name=>JSON.stringify(name)+':'+identity(pointer+'/'+escape(name),depth+1)).join(',')+'}';
        if(node.kind==='array')return '['+[...node.children.keys()].map(name=>identity(pointer+'/'+name,depth+1)).join(',')+']';
        if(typeof node.value==='number'){
            const number=decimal(doc.dataJson(pointer));
            return 'number:'+number.coefficient+'e'+number.exponent;
        }
        return JSON.stringify(node.value);
    };
    const actions:BindingCopy[]=[],planned=new Map<string,string>();
    const usages=new Map<string,{resource:string;pointer:string;connection:'security';roots:string[];target:{resource:string;pointer:string};effect:string}>();
    for(const origins of changed.values()){
        const binding=origins.values().next().value!;
        for(const name of environments.children.keys()){
            const owner='/environments/'+escape(name)+'/authentication/schemes',schemes=doc.dataNode(owner);
            if(!schemes)continue;
            if(schemes.kind!=='object')fail(owner,'refactor.configuration.authentication','Authentication schemes must be a mapping');
            const from=owner+'/'+escape(binding.before.value),to=owner+'/'+escape(binding.after.value),original=doc.dataNode(from);
            if(!original)continue;
            if(original.kind!=='object')fail(from,'refactor.configuration.authentication','A configured security binding must be an object');
            const expected=identity(from),existing=doc.dataNode(to);
            if(existing&&identity(to)!==expected||planned.has(to)&&planned.get(to)!==expected)
                fail(to,'refactor.configuration.collision','The destination authentication binding has different settings; resolve that configuration explicitly before refactoring');
            if(!existing&&bindings.some(other=>other.before.value===other.after.value&&other.after.value===binding.after.value))
                fail(to,'refactor.configuration.ambiguous','Adding this authentication alias would also configure an unchanged security binding; choose a different name or explicitly resolve its environment settings before refactoring');
            if(!existing&&!planned.has(to)){
                actions.push({kind:'createData',pointer:to,raw:doc.dataJson(from)});
                planned.set(to,expected);
            }
            for(const origin of origins.values()){
                const key=JSON.stringify([from,origin.before.targetResource,origin.before.targetPointer]);
                const usage=usages.get(key)??{resource:source.id,pointer:from,connection:'security',roots:[],target:{resource:origin.before.targetResource!,pointer:origin.before.targetPointer!},effect:'retain-and-alias-configuration'};
                if(!usage.roots.includes(origin.root))usage.roots.push(origin.root);
                usages.set(key,usage);
            }
        }
    }
    return {source,actions,usages:[...usages.values()]};
}

/** Independent migration publication retains declarative environment settings
 * and the shared exact alias repairs. Secret Service/session credentials and
 * TLS file bytes are never acquired. The manifest has its own exact text:
 * projecting arbitrary configuration numbers through JS would round them. */
export function migrationSecurityConfiguration(value:unknown,bindings:readonly SecurityBindingChange[],manifest:object,
    credentialHeaders:ReadonlySet<string>=new Set(),projection:SecurityAlternativeProjection={choices:new Map(),bounds:[]},configurationProjections:readonly MigrationConfigurationProjection[]=[]):{
    manifest:object;manifestText:string;alternatives:readonly {environment:string;before:number;after:number}[];
} {
    if(value===undefined||value===null){
        const manifestText=JSON.stringify(manifest)+'\n';
        if(Buffer.byteLength(manifestText)>65536)throw new SourceError('limit.migration.configuration','The migrated configuration exceeds its 64 KiB bound');
        return {manifest,manifestText,alternatives:[]};
    }
    const captured=capturedConfiguration(value),doc=new SourceDocument(captured.text,captured.id,true);
    const fail=(pointer:string,message:string,code='migration.configuration.representation'):never=>{
        const range=doc.dataNode(pointer)?.range??doc.root.range;
        throw new SourceError(code,message,range,'unsupported',{resource:captured.id,pointer,range});
    };
    if(doc.issues.length||doc.root.value?.version!==1)fail('','Repair the captured project configuration before migrating its environment bindings');
    const copies=securityConfigurationCopies(value,bindings),source=new MigrationSource(doc);
    for(const action of copies?.actions??[])source.exact(action.pointer,action.raw);
    for(const change of configurationProjections){
        const before=source.doc.dataNode(change.pointer)?source.doc.dataJson(change.pointer):null;
        if(before!==change.before)fail(change.pointer,'A reviewed configuration edit does not match its captured value');
        source.exact(change.pointer,change.after);
    }
    const environments=source.doc.dataNode('/environments');
    if(environments&&environments.kind!=='object')fail('/environments','Environments must be a mapping');
    const secretReference=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const settings=new Set(['secretRef','tokenRef','passwordRef','clientSecretRef','accessTokenRef','username','clientId','clientAuthentication','scopes']);
    const sensitiveHeaders=new Set(['authorization','proxy-authorization','cookie',...credentialHeaders]);
    const alternatives:{environment:string;before:number;after:number}[]=[];
    for(const [name,environment]of environments?.children??[]){
        const at='/environments/'+escape(name);
        if(environment.kind!=='object')fail(at,'An environment must be a mapping');
        if((source.doc.dataNode(at+'/servers')?.children.size??0)>2048)fail(at+'/servers','Operation Server settings exceed 2048 entries','limit.migration.configuration');
        const alternativePointer=at+'/authentication/alternative',alternative=source.doc.dataNode(alternativePointer);
        // Core selects only integer settings. Retain an ignored authored
        // decimal/exponent value as data rather than activating it here.
        if(alternative&&typeof alternative.value==='number'&&Number.isSafeInteger(alternative.value)&&alternative.value>=0&&
            /^(?:0|[1-9]\d*)$/.test(source.doc.dataJson(alternativePointer))){
            const before=alternative.value,choices=projection.choices.get(before);
            const candidates=[...(choices??[before])].filter(index=>
                projection.bounds.every(bound=>before<bound.before||index>=bound.after)).sort((a,b)=>a-b);
            if(!candidates.length)fail(alternativePointer,'One configured authentication alternative cannot select the original requirement across these independently expanded operations','migration.configuration.alternative');
            const after=candidates.includes(before)?before:candidates[0];
            if(before!==after){source.set(alternativePointer,after);alternatives.push({environment:name,before,after});}
        }
        for(const [header,node]of source.doc.dataNode(at+'/headers')?.children??[])
            if(sensitiveHeaders.has(header.toLowerCase())&&node.value!=='')
                fail(at+'/headers/'+escape(header),'A literal authentication header cannot be copied into a migrated project; retain credentials through an existing secret reference');
        const schemes=source.doc.dataNode(at+'/authentication/schemes');
        if(schemes&&schemes.kind!=='object')fail(at+'/authentication/schemes','Authentication schemes must be a mapping');
        for(const [scheme,configuration]of schemes?.children??[]){
            const owner=at+'/authentication/schemes/'+escape(scheme);
            if(configuration.kind!=='object')fail(owner,'A configured authentication binding must be a mapping');
            for(const [field,node]of configuration.children){
                if(!settings.has(field)&&!field.startsWith('x-'))fail(owner+'/'+escape(field),'This authentication setting has no declarative migration binding');
                if(field.endsWith('Ref')&&(typeof node.value!=='string'||!secretReference.test(node.value)))
                    fail(owner+'/'+escape(field),'Authentication credentials must remain existing secret references');
            }
        }
        // Relative certificate/key names would select different files in the
        // delivered project. Retain only their declared absolute locators;
        // ordinary explicit file approval remains necessary at execution.
        for(const field of ['caFile','clientCertificateFile','clientKeyFile']){
            const pointer=at+'/tls/'+field,path=source.doc.dataNode(pointer)?.value;
            if(typeof path==='string'&&!isAbsolute(path)){
                const uri=new URL(captured.id);
                if(uri.protocol!=='file:')fail(pointer,'A TLS file declaration needs a local captured configuration base');
                source.set(pointer,resolve(dirname(fileURLToPath(uri)),path));
            }
        }
    }
    const output=new MigrationSource(new SourceDocument(JSON.stringify(manifest)+'\n',captured.id));
    for(const name of source.doc.root.children.keys())if(!['version','roots','resourceMappings'].includes(name))
        output.exact('/'+escape(name),source.doc.dataJson('/'+escape(name)));
    if(Buffer.byteLength(output.doc.text)>65536)fail('/environments','The migrated configuration exceeds its 64 KiB bound');
    return {manifest:output.doc.root.value,manifestText:output.doc.text,alternatives};
}
