import {SourceDocument, SourceError, escape} from './document';
import {SourcePlan} from './source_plan';
import {capturedConfiguration, securityConfigurationCopies, type SecurityBindingChange} from './security_configuration';
import {dirname, isAbsolute, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {MigrationConfigurationProjection} from './migration_server_configuration';
import type {SecurityAlternativeProjection} from './security_requirements';

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
    const copies=securityConfigurationCopies(value,bindings),source=new SourcePlan(doc);
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
    const output=new SourcePlan(new SourceDocument(JSON.stringify(manifest)+'\n',captured.id));
    for(const name of source.doc.root.children.keys())if(!['version','roots','resourceMappings'].includes(name))
        output.exact('/'+escape(name),source.doc.dataJson('/'+escape(name)));
    if(Buffer.byteLength(output.doc.text)>65536)fail('/environments','The migrated configuration exceeds its 64 KiB bound');
    return {manifest:output.doc.root.value,manifestText:output.doc.text,alternatives};
}
