import {lstat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {SourceError} from './document';

const assets=['policy-worker.cjs','policy-isolation.node','policy-launcher','policy-build.json'];
const failure=()=>new SourceError('policy.assets','Required isolated governance assets are missing or changed; prepare the locked contract assets');
let admitted:{signature:string;profile:Record<string,unknown>}|undefined;
let pending:Promise<Record<string,unknown>>|undefined;

async function signature() {
    return (await Promise.all(assets.map(async name=>{
        const state=await lstat(join(__dirname,name),{bigint:true});
        if(!state.isFile()||state.size>16n*1024n*1024n)throw failure();
        // As with installed generator admission, metadata invalidates previously
        // verified bytes. Include inode and ctime so replacement or restored
        // mtime cannot conceal a changed installed input.
        return [state.dev,state.ino,state.mode,state.size,state.mtimeNs,state.ctimeNs].join(':');
    }))).join('\n');
}

async function admit() {
    const before=await signature();
    if(admitted?.signature===before)return admitted.profile;
    const files:Record<string,string>={};let receipt:any;
    for(const name of assets) {
        const bytes=await readFile(join(__dirname,name));
        if(bytes.length>16*1024*1024)throw failure();
        files[name]=createHash('sha256').update(bytes).digest('hex');
        if(name==='policy-build.json')receipt=JSON.parse(bytes.toString('utf8'));
    }
    if(before!==await signature())throw failure();
    if(process.versions.node!=='24.15.0'||receipt?.version!==1||receipt.profile!==2||receipt.minimumLandlockAbi!==3||
        receipt.nativeDependency?.soname!=='libseccomp.so.2'||receipt.nativeDependency?.minimumRuntimeVersion!=='2.5.5'||
        ['policy-isolation.node','policy-launcher'].some(name=>receipt.files?.[name]!==files[name]))
        throw new SourceError('policy.assets.provenance','Isolated governance assets do not match their build receipt');
    const profile={version:1,profile:'busyapi-node-captured-v1',node:process.versions.node,
        minimumLandlockAbi:3,nativeProfile:2,libseccomp:'>=2.5.5',files:Object.freeze(files)};
    const result=Object.freeze({...profile,identity:createHash('sha256').update(JSON.stringify(profile)).digest('hex')});
    admitted={signature:before,profile:result};
    return result;
}

/** Trusted installed assets only. This is not project resource acquisition.
 * Every request checks the installed signature; changed inputs require a full
 * byte/provenance admission. Concurrent callers share only that admission work.
 * The disposable worker still installs both native confinement stages itself.
 */
export async function policyRuntime() {
    if(pending)return pending;
    const current=admit();pending=current;
    try {return await current;}
    catch(error) {admitted=undefined;if(error instanceof SourceError)throw error;throw failure();}
    finally {if(pending===current)pending=undefined;}
}
