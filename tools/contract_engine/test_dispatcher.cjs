const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {test}=require('node:test');
const {WorkerDispatcher}=require('./dist/worker_dispatcher.cjs');
class Worker extends EventEmitter {
 sent=[];stopped=false;
 postMessage(value){this.sent.push(value);}
 terminate(){this.stopped=true;return this.gate??Promise.resolve(0);}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(kind,onFailure){
 const workers=[],outputs=[],failures=[];
 const dispatcher=new WorkerDispatcher(request=>{const w=new Worker();w.kind=kind?.(request)??'standard';w.disposable=w.kind==='isolated';workers.push(w);return w;},p=>outputs.push(p),(id,code,message)=>{failures.push({id,code,message});onFailure?.(id,code);},1024,kind);
 const submit=(id,method='inspect',params={})=>dispatcher.submit({id,method,params:{snapshot:id,...params}});
 return {dispatcher,workers,outputs,failures,submit};
}
const policyKind=request=>request.method==='govern'&&request.params.isolated?'isolated':'standard';
test('isolated governance changes worker kind only after retirement and preserves the foreground cache',async()=>{
 const h=harness(policyKind);
 h.submit('source','analyse');h.workers[0].emit('message',new Uint8Array([1,2]));
 h.submit('schema','evaluateSchemas');h.workers[1].emit('message',new Uint8Array([1,2]));
 let finish;h.workers[1].gate=new Promise(resolve=>finish=resolve);
 h.submit('isolated','govern',{isolated:true});
 assert.equal(h.workers.length,2);assert.equal(h.workers[1].stopped,false);
 await flush();assert.equal(h.workers[1].stopped,true);assert.equal(h.workers[0].stopped,false);
 assert.equal(h.workers.length,2,'A retiring standard worker still owns its slot');
 h.submit('typing','analyse');assert.equal(h.workers[0].sent.at(-1).id,'typing');
 finish(0);await flush();assert.equal(h.workers.length,3);assert.equal(h.workers[2].kind,'isolated');
 assert.equal(h.workers[2].sent[0].id,'isolated');assert.equal(h.workers[0].stopped,false);
 h.workers[0].emit('message',new Uint8Array([1,2]));h.workers[2].emit('message',new Uint8Array([1,2]));
 await flush();assert.equal(h.workers[2].stopped,true,'A disposable process is never cached for another request');
 h.submit('next-schema','evaluateSchemas');assert.equal(h.workers[3].kind,'standard');
 assert.equal(h.workers[3].sent[0].id,'next-schema');assert.equal(h.workers[2].sent.length,1);
 await h.dispatcher.close();
});
test('cancelled kind transitions cannot start an isolated process later',async()=>{
 const h=harness(policyKind);
 h.submit('source','analyse');h.workers[0].emit('message',new Uint8Array([1,2]));
 h.submit('schema','evaluateSchemas');h.workers[1].emit('message',new Uint8Array([1,2]));
 let finish;h.workers[1].gate=new Promise(resolve=>finish=resolve);
 h.submit('isolated','govern',{isolated:true});await flush();await h.dispatcher.stop('isolated');
 finish(0);await flush();assert.equal(h.workers.length,2);assert(h.failures.some(f=>f.id==='isolated'&&f.code==='cancelled'));
 await h.dispatcher.close();
});
test('a disposable reply does not release ownership until termination completes',async()=>{
 const h=harness(policyKind);h.submit('source','analyse');h.workers[0].emit('message',new Uint8Array([1,2]));
 h.submit('one','govern',{isolated:true});let finish;h.workers[1].gate=new Promise(resolve=>finish=resolve);
 h.submit('two','govern',{isolated:true});h.workers[1].emit('message',new Uint8Array([1,2]));await flush();
 assert.equal(h.outputs.length,2);assert.equal(h.workers.length,2);assert(!h.workers.some(w=>w.sent.some(q=>q.id==='two')));
 finish(0);await flush();assert.equal(h.workers[2].sent[0].id,'two');await h.dispatcher.close();
});
test('the owned process adapter supplies a bounded static failure instead of raw exception text',async()=>{
 const h=harness(policyKind);h.submit('policy','govern',{isolated:true});
 h.workers[0].failureFor=()=>({code:'policy.process.timeout',message:'Required governance execution did not complete'});
 h.workers[0].emit('error',Error('private contract data'));await flush();
 assert.equal(h.outputs.length,0);assert.equal(h.failures[0].code,'policy.process.timeout');assert(!h.failures[0].message.includes('private'));
 await h.dispatcher.close();
});
test('two active jobs and two queued jobs complete only on actual replies; source feedback has priority',async()=>{
 const h=harness();h.submit('a');h.submit('b');h.submit('full','evaluateSchemas');h.submit('source','analyse');h.submit('overflow');
 assert.equal(h.workers.length,2);assert.deepEqual(h.failures.map(f=>[f.id,f.code]),[['overflow','queue.full']]);assert.equal(h.outputs.length,0);
 h.workers[0].emit('message',new Uint8Array([1,2]));assert.equal(h.outputs.length,1);assert.equal(h.workers[0].sent.at(-1).id,'source');
 h.workers[1].emit('message',new Uint8Array([3,4]));assert.equal(h.workers[1].sent.at(-1).id,'full');assert.equal(h.workers.length,2);
 h.workers[0].emit('message',new Uint8Array([5,6]));h.workers[1].emit('message',new Uint8Array([7,8]));
 assert.equal(h.outputs.length,4);await h.dispatcher.close();assert(h.workers.every(w=>w.stopped));
});
test('queued and running cancellation retain ownership until termination and never execute cancelled queued work',async()=>{
 const h=harness();h.submit('a');h.submit('b');h.submit('queued');h.submit('kept');
 await h.dispatcher.stop('queued');assert.equal(h.failures[0].id,'queued');assert.equal(h.failures[0].code,'cancelled');
 let finish;h.workers[0].gate=new Promise(resolve=>finish=resolve);let acknowledged=false;
 const stopped=h.dispatcher.stop('a').then(()=>acknowledged=true);const again=h.dispatcher.stop('a');
 assert.doesNotThrow(()=>h.workers[0].emit('error',new Error('late failure during owned termination')));
 await flush();assert.equal(acknowledged,false);assert.equal(h.workers.length,2);assert(!h.workers.some(w=>w.sent.some(q=>q.id==='kept')));
 finish(0);await Promise.all([stopped,again]);assert.equal(acknowledged,true);assert.equal(h.failures.filter(f=>f.id==='a').length,1);
 assert.equal(h.workers.length,3);assert.equal(h.workers[2].sent[0].id,'kept');assert(!h.workers.some(w=>w.sent.some(q=>q.id==='queued')));
 h.workers[1].emit('message',new Uint8Array([1,2]));h.workers[2].emit('message',new Uint8Array([1,2]));await h.dispatcher.close();
});
test('an idle worker failure is retired before its slot is reused',async()=>{
 const h=harness();h.submit('a');h.submit('b');h.workers[0].emit('message',new Uint8Array([1,2]));
 let finish;h.workers[0].gate=new Promise(resolve=>finish=resolve);
 assert.doesNotThrow(()=>h.workers[0].emit('error',new Error('idle worker failed')));h.submit('waiting');
 assert.equal(h.workers.length,2);finish(0);await flush();assert.equal(h.workers.length,3);assert.equal(h.workers[2].sent[0].id,'waiting');
 await h.dispatcher.close();
});
for(const event of ['error','exit','message'])test(`failed worker ${event} cannot become empty success or release its slot prematurely`,async()=>{
 const h=harness();h.submit('bad');h.submit('other');h.submit('waiting');
 let finish;h.workers[0].gate=new Promise(resolve=>finish=resolve);
 h.workers[0].emit(event,event==='message'?{}:new Error('private contract data must not enter findings'));
 let cancellationFinished=false;const stop=h.dispatcher.stop('bad').then(()=>cancellationFinished=true);
 await flush();assert.equal(cancellationFinished,false);
 assert.equal(h.outputs.length,0);assert.equal(h.failures[0].id,'bad');assert.equal(h.failures[0].message.includes('private'),false);
 assert.equal(h.workers.length,2);finish(0);await stop;await flush();assert.equal(h.workers.length,3);assert.equal(h.workers[2].sent[0].id,'waiting');
 await h.dispatcher.close();
});
test('shutdown waits for already retiring workers and rejects queued/new work',async()=>{
 const h=harness();h.submit('bad');h.submit('other');h.submit('queued');
 let finish;h.workers[0].gate=new Promise(resolve=>finish=resolve);h.workers[0].emit('message',{});
 let closed=false;const closing=h.dispatcher.close().then(()=>closed=true);await flush();assert.equal(closed,false);
 h.submit('new');assert(h.failures.some(f=>f.id==='queued'&&f.code==='cancelled'));assert(h.failures.some(f=>f.id==='new'&&f.code==='worker.closed'));
 finish(0);await closing;assert.equal(closed,true);assert(!h.workers.some(w=>w.sent.some(q=>q.id==='queued')));
});
test('termination failure fails closed rather than acknowledging incomplete cancellation',async()=>{
 const h=harness();h.submit('a');h.submit('b');h.submit('queued');
 h.workers[0].gate=Promise.reject(new Error('termination denied'));
 await assert.rejects(h.dispatcher.stop('a'),/termination denied/);
 h.submit('new');assert(h.failures.some(f=>f.id==='queued'&&f.code==='worker.stop'));assert(h.failures.some(f=>f.id==='new'&&f.code==='worker.closed'));
 assert(!h.failures.some(f=>f.id==='a'&&f.code==='cancelled'));await assert.rejects(h.dispatcher.close(),/could not be terminated/);
});
test('cancelling full semantic work preserves the foreground parser owner and its idle cache',async()=>{
 const h=harness();h.submit('source','analyse');h.workers[0].emit('message',new Uint8Array([1,2]));
 h.submit('schema','evaluateSchemas');
 assert.equal(h.workers.length,2,'full evaluation must not consume the only idle foreground worker');
 assert.equal(h.workers[0].sent.length,1);assert.equal(h.workers[1].sent.at(-1).id,'schema');
 let finish;h.workers[1].gate=new Promise(resolve=>finish=resolve);
 const cancelled=h.dispatcher.stop('schema');await flush();
 h.submit('next-source','analyse');
 assert.equal(h.workers[0].sent.at(-1).id,'next-source');assert.equal(h.workers[0].stopped,false);
 assert.equal(h.workers.length,2);finish(0);await cancelled;
 h.workers[0].emit('message',new Uint8Array([1,2]));await h.dispatcher.close();
});
for(const method of ['evaluateSchemas','inspectPolicyCode','resolvePolicyCode','reviewPolicyCode','referenceDocument','referenceDisplay','deriveBundle','describeResourcePackage','planExtract','planInline','planMoveDefinition','sourceFolds'])test(`queued governance and ${method} share the background slot without starving Source`,async()=>{
 const h=harness();h.submit('source','analyse');h.workers[0].emit('message',new Uint8Array([1,2]));
 h.submit('policy','govern');h.submit('schema',method);h.submit('typing','analyse');
 assert.equal(h.workers.length,2);assert.equal(h.workers[0].sent.at(-1).id,'typing');
 assert.equal(h.workers[1].sent.at(-1).id,'policy');
 h.workers[0].emit('message',new Uint8Array([1,2]));
 assert.equal(h.workers[0].sent.length,2,'waiting full work must not borrow the sole foreground owner');
 h.workers[1].emit('message',new Uint8Array([1,2]));assert.equal(h.workers[1].sent.at(-1).id,'schema');
 h.workers[1].emit('message',new Uint8Array([1,2]));await h.dispatcher.close();
});
const streamReply=(worker,id,closed=false)=>worker.emit('message',{id,payload:new Uint8Array([1,2]),closed});
test('idle streams leave Source execution available and Source cancellation preserves stream captures',async()=>{
 const h=harness();h.submit('open','responseStreamOpen',{stream:'live'});const stream=h.workers[0];streamReply(stream,'open');
 h.submit('typing','analyse');const source=h.workers[1];assert.equal(source.sent.at(-1).id,'typing');
 await h.dispatcher.stop('typing');assert(source.stopped);assert(!stream.stopped);
 h.submit('next-chunk','responseStreamChunk',{stream:'live',text:'MQo=',end:false});assert.equal(stream.sent.at(-1).id,'next-chunk');streamReply(stream,'next-chunk');
 h.submit('close','responseStreamClose',{stream:'live'});streamReply(stream,'close',true);
 assert.equal(h.outputs.length,3);await h.dispatcher.close();assert(stream.stopped);
});
test('closing one stream cooperatively preserves another owner and acknowledges only actual cleanup',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const h=harness();h.submit('open-a','responseStreamOpen',{stream:'a'});const worker=h.workers[0];streamReply(worker,'open-a');
 h.submit('open-b','responseStreamOpen',{stream:'b'});streamReply(worker,'open-b');
 h.submit('chunk-a','responseStreamChunk',{stream:'a',text:'MQo=',end:false});let acknowledged=false;
 const stopped=h.dispatcher.stop('chunk-a').then(()=>acknowledged=true),control=worker.sent.at(-1);assert.equal(control.method,'responseStreamClose');assert.equal(control.params.stream,'a');
 await flush();assert.equal(acknowledged,false);assert(!worker.stopped);
 streamReply(worker,'chunk-a',true);assert.equal(acknowledged,false);streamReply(worker,control.id,true);await stopped;
 t.mock.timers.tick(1000);await flush();assert(!worker.stopped,'A completed cooperative close must retire its fallback timer');
 h.submit('chunk-b','responseStreamChunk',{stream:'b',text:'Mgo=',end:false});assert.equal(worker.sent.at(-1).id,'chunk-b');streamReply(worker,'chunk-b');
 assert.equal(h.failures.filter(failure=>failure.id==='chunk-a'&&failure.code==='cancelled').length,1);assert(!worker.stopped);await h.dispatcher.close();
});
test('a nonresponsive stream close retires its worker after bounded grace and settles siblings after termination',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const h=harness(undefined,id=>{if(id==='blocked')h.submit('replacement','responseStreamOpen',{stream:'fresh'});});
 h.submit('open-a','responseStreamOpen',{stream:'a'});const worker=h.workers[0];streamReply(worker,'open-a');
 h.submit('open-b','responseStreamOpen',{stream:'b'});streamReply(worker,'open-b');
 h.submit('source','analyse');const source=h.workers[1];
 h.submit('blocked','responseStreamChunk',{stream:'a',text:'MQo=',end:false});
 h.submit('waiting','responseStreamChunk',{stream:'b',text:'Mgo=',end:false});
 let finish,acknowledged=false;worker.gate=new Promise(resolve=>finish=resolve);
 const stopped=h.dispatcher.stop('blocked').then(()=>acknowledged=true);
 try{
  t.mock.timers.tick(999);await flush();assert(!worker.stopped);assert.equal(acknowledged,false);
  t.mock.timers.tick(1);await flush();assert(worker.stopped);assert.equal(acknowledged,false);
  assert(!h.failures.some(failure=>['blocked','waiting'].includes(failure.id)),'A retiring worker still owns its pending replies');
  source.emit('message',new Uint8Array([1,2]));h.submit('typing','analyse');assert.equal(source.sent.at(-1).id,'typing');assert(!source.stopped);
  finish(0);await stopped;
  assert.equal(h.failures.filter(failure=>failure.id==='blocked'&&failure.code==='cancelled').length,1);
  assert.equal(h.failures.filter(failure=>failure.id==='waiting'&&failure.code==='worker.deadline').length,1);
  h.submit('late','responseStreamChunk',{stream:'b',text:'',end:true});assert(h.failures.some(failure=>failure.id==='late'&&failure.code==='runtime.stream.closed'));
  const replacement=h.workers.at(-1);assert.notEqual(replacement,worker);assert.equal(replacement.sent.at(-1).id,'replacement');streamReply(replacement,'replacement');
  source.emit('message',new Uint8Array([1,2]));assert(!source.stopped);
 }finally{finish(0);await h.dispatcher.close();}
});
test('stream termination failure settles pending stream and queued ordinary work without claiming cancellation',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const h=harness();h.submit('open-a','responseStreamOpen',{stream:'a'});const worker=h.workers[0];streamReply(worker,'open-a');
 h.submit('open-b','responseStreamOpen',{stream:'b'});streamReply(worker,'open-b');
 h.submit('source-a','analyse');h.submit('source-b','inspect');h.submit('queued','inspect');
 h.submit('blocked','responseStreamChunk',{stream:'a',text:'MQo=',end:false});h.submit('waiting','responseStreamChunk',{stream:'b',text:'Mgo=',end:false});
 worker.terminate=()=>Promise.reject(Error('controlled termination failure'));
 const stopped=assert.rejects(h.dispatcher.stop('blocked'),/controlled termination failure/);
 t.mock.timers.tick(1000);await stopped;await flush();
 for(const id of ['blocked','waiting','queued'])assert.equal(h.failures.filter(failure=>failure.id===id&&failure.code==='worker.stop').length,1);
 assert(!h.failures.some(failure=>failure.id==='blocked'&&failure.code==='cancelled'));
 h.workers[1].emit('message',new Uint8Array([1,2]));h.workers[2].emit('message',new Uint8Array([1,2]));
 h.submit('late','inspect');assert(h.failures.some(failure=>failure.id==='late'&&failure.code==='worker.closed'));
 await assert.rejects(h.dispatcher.close(),/could not be terminated/);
});
test('stream failure during cancellation clears the fallback before a replacement worker opens',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const h=harness();h.submit('open','responseStreamOpen',{stream:'lost'});const worker=h.workers[0];streamReply(worker,'open');
 h.submit('chunk','responseStreamChunk',{stream:'lost',text:'MQo=',end:false});const stopped=h.dispatcher.stop('chunk');
 worker.emit('exit');await stopped;
 h.submit('fresh','responseStreamOpen',{stream:'fresh'});const replacement=h.workers.at(-1);streamReply(replacement,'fresh');
 t.mock.timers.tick(1000);await flush();assert(!replacement.stopped);await h.dispatcher.close();
});
test('stream worker death invalidates its owners while ordinary Source work survives',async()=>{
 const h=harness();h.submit('open','responseStreamOpen',{stream:'lost'});const stream=h.workers[0];streamReply(stream,'open');
 h.submit('source','analyse');const source=h.workers[1];
 h.submit('chunk','responseStreamChunk',{stream:'lost',text:'MQo=',end:false});stream.emit('exit');await flush();
 assert(h.failures.some(failure=>failure.id==='chunk'&&failure.code==='worker.exit'));assert(!source.stopped);source.emit('message',new Uint8Array([1,2]));
 h.submit('late-chunk','responseStreamChunk',{stream:'lost',text:'',end:true});assert(h.failures.some(failure=>failure.id==='late-chunk'&&failure.code==='runtime.stream.closed'));
 h.submit('new-open','responseStreamOpen',{stream:'new'});streamReply(h.workers.at(-1),'new-open');await h.dispatcher.close();
});
test('stream shutdown waits for worker termination before releasing its pending owner',async()=>{
 const h=harness();h.submit('open','responseStreamOpen',{stream:'live'});const worker=h.workers[0];let finish;worker.gate=new Promise(resolve=>finish=resolve);
 let closed=false;const closing=h.dispatcher.close().then(()=>closed=true);await flush();assert.equal(closed,false);assert(!h.failures.some(failure=>failure.id==='open'));
 finish(0);await closing;assert.equal(closed,true);assert(h.failures.some(failure=>failure.id==='open'&&failure.code==='cancelled'));
});
