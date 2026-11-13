const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EngineWorkerClient,engineFailure}=require('./dist/engine_worker_client.cjs');
const {mockStart}=require('./mock_test_capture.cjs');
const capture=()=>mockStart({openapi:'3.0.4',info:{title:'Worker lifecycle',version:'1'},paths:{}}).capture;
for(const kind of ['specification','unsupported'])test(`native adapter retains ${kind} failure and rejects unknown wire kinds`,()=>{
 const source={resource:'file:///fixture/雪.yaml',pointer:'/servers/0/url',range:[2,8]},failure=engineFailure({code:'server.fixture',message:'Captured server failure',kind,source});
 assert(failure);assert.equal(failure.kind,kind);assert.deepEqual(failure.source,source);assert.equal(engineFailure({code:'claimed.success',message:'Not a supported failure',kind:'success'}),undefined);
});

test('native adapter cancellation retires the real worker and permits later evaluation',{timeout:15000},async t=>{
 const input=capture(),client=new EngineWorkerClient(input);t.after(()=>client.close());
 const active=new AbortController(),queued=new AbortController();
 const results=Promise.allSettled([
  client.request('evaluateSchemas',{},active.signal),
  client.request('evaluateSchemas',{}),
  client.request('evaluateSchemas',{},queued.signal),
 ]);
 queued.abort();active.abort();
 const values=await results;
 assert.equal(values[0].status,'rejected');assert.equal(values[0].reason.code,'cancelled');
 assert.equal(values[1].status,'fulfilled');assert.equal(values[1].value.complete,true);
 assert.equal(values[2].status,'rejected');assert.equal(values[2].reason.code,'cancelled');
 const after=await client.request('evaluateSchemas',{});assert.equal(after.snapshot,input.snapshot);assert.equal(after.complete,true);
});

test('native adapter admission is bounded and closing joins active and queued work',{timeout:15000},async()=>{
 const input=capture(),client=new EngineWorkerClient(input);
 const work=Promise.allSettled(Array.from({length:5},()=>client.request('evaluateSchemas',{})));
 await client.close();const results=await work;
 assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.code==='queue.full').length,1);
 assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.code==='cancelled').length,4);
 await assert.rejects(client.request('evaluateSchemas',{}),{code:'worker.closed'});
 await client.close();
});

test('native adapter retains an actual worker specification error instead of success',{timeout:15000},async t=>{
 const input=capture();input.resources[0].text=input.resources[0].text.replace('3.0.4','9.0.0');
 const client=new EngineWorkerClient(input);t.after(()=>client.close());
 await assert.rejects(client.request('evaluateSchemas',{}),error=>error.code==='version.unsupported');
});

test('native adapter owns its captured source and refuses request replacement',{timeout:15000},async t=>{
 const input=capture(),snapshot=input.snapshot,client=new EngineWorkerClient(input);t.after(()=>client.close());
 input.resources[0].text=input.resources[0].text.replace('3.0.4','9.0.0');
 const result=await client.request('evaluateSchemas',{});assert.equal(result.snapshot,snapshot);assert.equal(result.complete,true);
 await assert.rejects(client.request('evaluateSchemas',input),{code:'mock.capture.changed'});
 assert.equal((await client.request('evaluateSchemas',{})).complete,true);
});
