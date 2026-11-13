const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const promises=require('node:fs/promises');
const {createHash}=require('node:crypto');
const {tmpdir}=require('node:os');
const path=require('node:path');
const helper=process.env.BUSYAPI_TEST_POLICY_RUNTIME??require.resolve('./dist/policy_runtime.cjs');
assert.equal(process.versions.node,'24.15.0','Use the pinned production Node');
const names=['policy-worker.cjs','policy-isolation.node','policy-launcher','policy-build.json'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(run) {
 const directory=fs.mkdtempSync(path.join(tmpdir(),'busyapi-policy-admission-'));
 const files=Object.fromEntries(names.map(name=>[name,path.join(directory,name)]));
 for(const name of names.slice(0,3))fs.writeFileSync(files[name],`controlled ${name} bytes`);
 const receipt={version:1,profile:2,minimumLandlockAbi:3,
  nativeDependency:{soname:'libseccomp.so.2',minimumRuntimeVersion:'2.5.5'},
  files:Object.fromEntries(names.slice(1,3).map(name=>[name,hash(fs.readFileSync(files[name]))]))};
 fs.writeFileSync(files['policy-build.json'],JSON.stringify(receipt));
 const entry=path.join(directory,'runtime.cjs');fs.copyFileSync(helper,entry);
 const {policyRuntime}=require(entry),originalRead=promises.readFile;let reads=0;
 promises.readFile=async function(file,...args){if(names.includes(path.basename(file)))reads++;return originalRead.call(this,file,...args);};
 try {await run({policyRuntime,files,receipt,reads:()=>reads,originalRead});}
 finally {promises.readFile=originalRead;delete require.cache[entry];fs.rmSync(directory,{recursive:true,force:true});}
}
test('unchanged and concurrent trust calls reuse verified installed bytes',()=>fixture(async ({policyRuntime,reads})=>{
 const [first,second]=await Promise.all([policyRuntime(),policyRuntime()]);
 assert.equal(reads(),4);assert.equal(first,second);
 assert.equal(await policyRuntime(),first);assert.equal(reads(),4);
 assert.equal(Object.isFrozen(first),true);assert.equal(Object.isFrozen(first.files),true);
 assert.match(first.identity,/^[a-f0-9]{64}$/);
}));
test('same-size changed bytes with restored mtime invalidate admission',()=>fixture(async ({policyRuntime,files,reads})=>{
 const first=await policyRuntime(),file=files['policy-worker.cjs'],state=fs.statSync(file);
 const bytes=fs.readFileSync(file);bytes[0]^=1;fs.writeFileSync(file,bytes);
 fs.utimesSync(file,state.atime,state.mtime);
 const changed=await policyRuntime();assert.notEqual(changed.identity,first.identity);assert.equal(reads(),8);
}));
test('mode and inode changes require admission even when bytes are equal',()=>fixture(async ({policyRuntime,files,reads})=>{
 const first=await policyRuntime(),file=files['policy-worker.cjs'];
 fs.chmodSync(file,0o600);assert.equal((await policyRuntime()).identity,first.identity);assert.equal(reads(),8);
 fs.renameSync(file,file+'.old');fs.copyFileSync(file+'.old',file);
 assert.equal((await policyRuntime()).identity,first.identity);assert.equal(reads(),12);
}));
for(const mode of ['missing','symlink','oversized','receipt'])
 test(`an admitted runtime cannot hide a later ${mode} input`,()=>fixture(async ({policyRuntime,files,receipt})=>{
  await policyRuntime();const file=files[mode==='receipt'?'policy-build.json':'policy-worker.cjs'];
  if(mode==='missing')fs.unlinkSync(file);
  if(mode==='symlink'){fs.renameSync(file,file+'.old');fs.symlinkSync(file+'.old',file);}
  if(mode==='oversized')fs.truncateSync(file,16*1024*1024+1);
  if(mode==='receipt')fs.writeFileSync(file,JSON.stringify({...receipt,profile:1}));
  await assert.rejects(policyRuntime(),error=>error.code===(mode==='receipt'?'policy.assets.provenance':'policy.assets'));
 }));
test('mutation during byte admission cannot publish a profile',()=>fixture(async ({policyRuntime,files,originalRead})=>{
 let changed=false;
 promises.readFile=async function(file,...args){
  const bytes=await originalRead.call(this,file,...args);
  if(file===files['policy-worker.cjs']&&!changed){changed=true;fs.appendFileSync(file,' changed during read');}
  return bytes;
 };
 await assert.rejects(policyRuntime(),error=>error.code==='policy.assets');
 const current=await policyRuntime();assert.equal(current.files['policy-worker.cjs'],hash(fs.readFileSync(files['policy-worker.cjs'])));
}));
