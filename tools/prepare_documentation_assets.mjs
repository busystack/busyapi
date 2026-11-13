#!/usr/bin/env node
// Normal offline build/install preparation. Never invoked by opening a project
// or documentation output. Installs no npm packages and deletes no directories.
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,lstat,readdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRedocAssets,buildSwaggerAssets} from './documentation_renderers/build_assets.mjs';

const repository=fileURLToPath(new URL('../',import.meta.url)),
  renderer=path.join(repository,'tools/documentation_renderers');

// Build signatures cover actual selected inputs, including package metadata,
// notices and directory membership. A new resolution candidate cannot silently
// reuse an old bundle. This runs before compilation, once per selected preset.
export async function documentationInputIdentity(preset) {
  const identity=createHash('sha256').update(process.version).update(preset);
  async function append(file) {
    const metadata=await lstat(file),relative=path.relative(repository,file);
    if(metadata.isSymbolicLink())throw Error('Documentation build inputs cannot be symlinks');
    identity.update(relative+'\0');
    if(metadata.isDirectory()) {
      for(const entry of (await readdir(file)).sort()) {
        if(entry!=='.bin')await append(path.join(file,entry));
      }
    } else if(metadata.isFile())identity.update(await readFile(file));
    else throw Error('Documentation build inputs must be ordinary files');
  }
  await append(fileURLToPath(import.meta.url));
  for(const name of (await readdir(renderer)).sort()) {
    if(/\.(?:mjs|js|json)$/.test(name)||name==='licenses')await append(path.join(renderer,name));
  }
  await append(path.join(renderer,preset==='redoc'?'node_modules':'swagger'));
  for(const name of ['package.json','package-lock.json','node_modules/esbuild','node_modules/@esbuild/linux-x64'])
    await append(path.join(repository,'tools/contract_engine',name));
  return identity.digest('hex');
}

export async function prepareDocumentationAssets(output,preset='redoc') {
  if(!['redoc','swagger'].includes(preset))throw Error('Choose a supported local documentation preset');
  if(process.version!=='v24.15.0')throw Error('Use the pinned Node 24.15.0 build runtime');
  const target=path.resolve(output);
  if(target===path.parse(target).root)throw Error('Choose a dedicated documentation build directory');
  await mkdir(target,{recursive:true});
  if(!(await lstat(target)).isDirectory())throw Error('The documentation build directory cannot be a symlink');
  const entries=await readdir(target,{withFileTypes:true});
  let previous;
  if(entries.length){
    previous=JSON.parse(await readFile(path.join(target,'assets.json'),'utf8'));
    if(previous.producer!=='busyapi-documentation-assets'||previous.version!==1||previous.preset!==preset)
      throw Error('The documentation build destination is not owned by BusyAPI');
    if(entries.some(entry=>!entry.isFile()||entry.name!=='assets.json'&&!Object.hasOwn(previous.files,entry.name)))
      throw Error('The documentation build destination contains unowned entries');
  }
  const inputs=await documentationInputIdentity(preset);
  if(previous?.buildInputsIdentity===inputs&&entries.length===Object.keys(previous.files).length+1){
    let unchanged=true;
    for(const [name,digest]of Object.entries(previous.files)){
      if(path.basename(name)!==name)throw Error('Invalid documentation output name');
      if(createHash('sha256').update(await readFile(path.join(target,name))).digest('hex')!==digest){unchanged=false;break;}
    }
    if(unchanged)return previous;
  }
  const result=await (preset==='redoc'?buildRedocAssets():buildSwaggerAssets()),
    manifest={...result.manifest,buildInputsIdentity:inputs},
    files={...result.files,'assets.json':Buffer.from(JSON.stringify(manifest,null,2)+'\n')};
  if(entries.some(entry=>!Object.hasOwn(files,entry.name)))
    throw Error('The documentation build destination contains unowned entries');
  // Manifest last: interruption cannot disguise mixed asset bytes as complete.
  for(const name of [...Object.keys(files).filter(name=>name!=='assets.json'),'assets.json']){
    const destination=path.join(target,name),bytes=files[name];
    try{
      if(!(await lstat(destination)).isFile())throw Error('A documentation build target is not an ordinary file');
      if(createHash('sha256').update(await readFile(destination)).digest('hex')===createHash('sha256').update(bytes).digest('hex'))continue;
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const temporary=path.join(target,'.busyapi-documentation-'+randomBytes(12).toString('hex')+'.tmp');
    try{await writeFile(temporary,bytes,{flag:'wx',mode:0o644});await rename(temporary,destination);}
    finally{try{await unlink(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
  }
  return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(![4,6].includes(process.argv.length)||process.argv[2]!=='--output'||process.argv.length===6&&process.argv[4]!=='--preset')throw Error('Usage: node tools/prepare_documentation_assets.mjs --output DEDICATED_DIRECTORY [--preset redoc|swagger]');
    await prepareDocumentationAssets(process.argv[3],process.argv[5]??'redoc');
  }catch(error){
    process.stderr.write('Local documentation assets were not prepared: '+error.message+'\nRun tools/build_documentation_assets.sh to provision both exact documentation locks, then retry the normal build. No runtime download is performed.\n');
    process.exitCode=1;
  }
}
