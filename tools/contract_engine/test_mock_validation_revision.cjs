const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {mockStart,startMock}=require('./mock_test_capture.cjs');
const {schemaProducer}=require('./dist/schema_evaluation.cjs');

test('a mock cannot report readiness with an unrelated native evaluation revision',{timeout:20000},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'busyapi-mock-revision-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const engine=await fs.readFile(path.join(__dirname,'dist/engine.cjs'),'utf8');
 const marker=`name: ${JSON.stringify(schemaProducer.name)}, version: ${JSON.stringify(schemaProducer.version)}`;
 assert.equal(engine.split(marker).length,2,'The controlled engine fixture must select exactly its schema producer identity');
 await fs.writeFile(path.join(directory,'engine.cjs'),engine.replace(marker,'name: "hyperjump+busyapi-exact", version: "obsolete-wire-evaluator"'));
 const helper=path.join(directory,'mock-server.cjs');
 await fs.copyFile(path.join(__dirname,'dist/mock-server.cjs'),helper);
 const input=mockStart({openapi:'3.0.4',info:{title:'Revision proof',version:'1'},paths:{'/p':{post:{responses:{204:{description:'Empty'}}}}}}),original=JSON.stringify(input);
 const result=await startMock(t,input,{helper,failure:true});
 assert.equal(result.event,'failed');assert.equal(result.failure.code,'mock.validation.revision');
 assert.equal(JSON.stringify(input),original);
});

// Compare source declarations, not a duplicated fixture or a previously built bundle.
test('Engine schema producer and all Core admission owners stay synchronized',async()=>{
 const engine=await fs.readFile(path.join(__dirname,'src/schema_evaluation.ts'),'utf8');
 const coreRoot=path.resolve(__dirname,'../../packages/busyapi_core/lib/src');
 const project=await fs.readFile(path.join(coreRoot,'project.dart'),'utf8');
 const engineVersion=/export const schemaProducer=\{name:'hyperjump\+busyapi-exact',version:'([^']+)'/.exec(engine)?.[1];
 const coreVersion=/const _schemaProducerVersion = '([^']+)';/.exec(project)?.[1];
 assert(engineVersion);assert(coreVersion);assert.equal(coreVersion,engineVersion);
 assert.notEqual(coreVersion,'1.18.0+63');assert.notEqual(coreVersion,'1.18.0+64');assert.notEqual(coreVersion,'1.18.0+65');assert.notEqual(coreVersion,'1.18.0+66');
 assert.match(project,/result\['producerVersion'\] == _schemaProducerVersion/);
 const execution=await fs.readFile(path.join(coreRoot,'execution.dart'),'utf8');
 const mock=await fs.readFile(path.join(coreRoot,'mock.dart'),'utf8');
 assert.match(execution,/result\['producerVersion'\] != _schemaProducerVersion/);
 assert.match(mock,/nativeValidation.version != _schemaProducerVersion/);
 for(const identity of ['typed-multipart-generation-v1','external-example-bytes-v','embedded-mime-text-v'])assert(engine.includes(identity));
 for(const identity of ['response-wire-v5:','parameter-wire-v6:','captured-schema-candidates-v5:'])assert(mock.includes(identity));
});

test('incremental producer admission uses the actual Engine and Core declarations',async()=>{
 const stream=await fs.readFile(path.join(__dirname,'src/runtime_stream.ts'),'utf8');
 const core=await fs.readFile(path.resolve(__dirname,'../../packages/busyapi_core/lib/src/execution.dart'),'utf8');
 const revision=/export const streamRevision='([^']+)'/.exec(stream)?.[1];assert(revision);
 const method=core.slice(core.indexOf('Future<Map<String, dynamic>> responseStreamChunk'),core.indexOf('Future<Map<String, (String, bool, String)>> contentParameterValues'));
 assert(method.includes("result['revision'] != '"+revision+"'"));
 assert(method.includes("result['producerVersion'] != _schemaProducerVersion"));
});
