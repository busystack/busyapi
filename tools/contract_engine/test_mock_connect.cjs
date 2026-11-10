const {test}=require('node:test'),assert=require('node:assert/strict'),net=require('node:net'),http=require('node:http');
const {once}=require('node:events');
const {mockStart,startMock}=require('./mock_test_capture.cjs');
function document(extra={}){return {openapi:'3.2.1',info:{title:'Controlled tunnel',version:'1'},components:{securitySchemes:{Key:{type:'apiKey',in:'header',name:'X-Key'}}},paths:{'/tunnel':{additionalOperations:{CONNECT:{security:[{Key:[]}],parameters:[{name:'X-Mode',in:'header',required:true,schema:{const:'bytes',type:'string'}}],responses:{200:{description:'Tunnel',headers:{'X-Proof':{required:true,schema:{type:'integer',const:9007199254740991}},'X-Authored':{required:true,schema:{type:'string',const:'established'},examples:{first:{dataValue:'established'}}}},content:{'application/json':{schema:false}}}},...extra}}},'/ordinary':{get:{responses:{200:{description:'Ordinary',content:{'application/json':{schema:{const:7}}}}}}}};}
function policy(port,extra={}){return {destinations:[{path:'/tunnel',authority:`approved.test:${port}`,address:'127.0.0.1'}],maximumTunnels:2,maximumBytes:2*1024*1024,idleTimeoutMs:10000,durationMs:60000,...extra};}
async function peer(t,handler){const sockets=new Set(),server=net.createServer({allowHalfOpen:true},socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});handler(socket);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));});return server;}
function connect(port,target,{head=Buffer.alloc(0),headers=['X-Key: synthetic','X-Mode: bytes']}={}){
 return new Promise((resolve,reject)=>{
  const socket=net.connect({host:'127.0.0.1',port,allowHalfOpen:true,highWaterMark:1024});let pending=Buffer.alloc(0),opened=false,waiter;
  const closed=new Promise(done=>socket.once('close',done));
  socket.once('end',()=>socket.end());
  socket.setTimeout(10000,()=>socket.destroy(Error('Controlled tunnel timeout')));
  const consume=()=>{if(waiter&&pending.length>=waiter.count){const result=pending.subarray(0,waiter.count);pending=pending.subarray(waiter.count);const done=waiter;waiter=undefined;done.resolve(result);}};
  socket.on('error',error=>{if(!opened)reject(error);if(waiter){waiter.reject(error);waiter=undefined;}});
  socket.on('data',chunk=>{
   pending=Buffer.concat([pending,chunk]);
   if(!opened){const at=pending.indexOf('\r\n\r\n');if(at<0)return;opened=true;
    const lines=pending.subarray(0,at).toString('latin1').split('\r\n'),status=Number(lines.shift().split(' ')[1]);
    const fields=Object.fromEntries(lines.map(line=>{const colon=line.indexOf(':');return [line.slice(0,colon).toLowerCase(),line.slice(colon+1).trim()];}));pending=pending.subarray(at+4);
    resolve({socket,status,headers:fields,closed,read:count=>new Promise((resolve,reject)=>{assert.equal(waiter,undefined);waiter={count,resolve,reject};consume();})});
   }consume();
  });
  socket.once('connect',()=>socket.write(Buffer.concat([Buffer.from(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${headers.join('\r\n')}\r\n\r\n`),head])));
 });
}
function monitor(){const events=[],waiters=[];return {events,onEvent(event){events.push(event);for(const waiter of [...waiters])if(waiter.predicate(event)){waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(event);}},wait(predicate){const prior=events.find(predicate);return prior?Promise.resolve(prior):new Promise(resolve=>waiters.push({predicate,resolve}));}};}

test('production CONNECT preserves initial binary bytes, both directions, half-close, backpressure and ordinary methods',{timeout:30000},async t=>{
 const prefix=Buffer.from([255,0,128]),tail=Buffer.from([7,0,9]),received=[];
 const upstream=await peer(t,socket=>{socket.write(prefix);socket.on('data',bytes=>{received.push(bytes);socket.write(bytes);});socket.on('end',()=>socket.end(tail));});
 const events=monitor(),input=mockStart(document(),{tunnels:policy(upstream.address().port,{maximumBytes:8*1024*1024})}),original=JSON.stringify(input);
 const ready=await startMock(t,input,events),initial=Buffer.from([0,255,13,10,128]);
 const tunnel=await connect(ready.port,`approved.test:${upstream.address().port}`,{head:initial});t.after(()=>tunnel.socket.destroy());
 assert.equal(tunnel.status,200);assert.equal(tunnel.headers['content-length'],undefined);assert.equal(tunnel.headers['transfer-encoding'],undefined);assert.equal(tunnel.headers['content-type'],undefined);assert.equal(tunnel.headers['x-proof'],'9007199254740991');assert.equal(tunnel.headers['x-authored'],'established');
 assert.deepEqual(await tunnel.read(prefix.length+initial.length),Buffer.concat([prefix,initial]));
 const large=Buffer.alloc(3*1024*1024);for(let index=0;index<large.length;index++)large[index]=index%256;
 tunnel.socket.pause();assert.equal(tunnel.socket.write(large),false,'The controlled producer must encounter socket backpressure');tunnel.socket.resume();assert.deepEqual(await tunnel.read(large.length),large);
 tunnel.socket.end();assert.deepEqual(await tunnel.read(tail.length),tail);await tunnel.closed;
 assert.deepEqual(Buffer.concat(received),Buffer.concat([initial,large]));
 const established=await events.wait(value=>value.event==='tunnel-established');assert.equal(established.source.pointer,'/paths/~1tunnel/additionalOperations/CONNECT');assert.equal(established.responseBody,'not-applicable');
 const ended=await events.wait(value=>value.event==='tunnel-terminated');assert.equal(ended.bytes,prefix.length+2*(initial.length+large.length)+tail.length);
 const ordinary=await new Promise((resolve,reject)=>http.get(`http://127.0.0.1:${ready.port}/ordinary`,res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));}).on('error',reject));assert.deepEqual(ordinary,{status:200,body:'7'});assert.equal(JSON.stringify(input),original);
});

test('authority parsing, unapproved peers and captured security/parameters refuse before any connection',{timeout:30000},async t=>{
 let connections=0;const upstream=await peer(t,socket=>{connections++;socket.end();}),port=upstream.address().port;
 const ready=await startMock(t,mockStart(document(),{tunnels:policy(port)}));
 for(const authority of ['approved.test','approved.test:0','approved.test:65536','approved.test:00000','user@approved.test:80','http://approved.test:80','[::1]','[bad]:80','approved.test:80/path']){
  const result=await connect(ready.port,authority);t.after(()=>result.socket.destroy());assert.equal(result.status,400,authority);
 }
 for(const authority of ['approved.test:00001',`[::1]:${port}`,`127.0.0.1:${port}`,`denied.test:${port}`,`approved.test:${port===65535?port-1:port+1}`]){const denied=await connect(ready.port,authority);assert.equal(denied.status,403);await denied.closed;}
 for(const [headers,status]of [[['X-Mode: bytes'],401],[['X-Key: synthetic','X-Mode: wrong'],422],[['X-Key: synthetic','X-Mode: bytes','Content-Length: 1'],400]]){
  const refused=await connect(ready.port,`approved.test:${port}`,{headers});assert.equal(refused.status,status);await refused.closed;
 }
 assert.equal(connections,0);
 const noPolicy=await startMock(t,mockStart(document()));const denied=await connect(noPolicy.port,`approved.test:${port}`);assert.equal(denied.status,403);await denied.closed;assert.equal(connections,0);
 const invalid=await startMock(t,mockStart(document(),{tunnels:policy(port,{destinations:[{path:'/tunnel',authority:`127.0.0.1:${port}`,address:'127.0.0.2'}]})}),{failure:true});assert.equal(invalid.failure.code,'mock.tunnel.policy');
});

for(const mode of ['concurrency','disconnect','idle','duration','bytes','shutdown','peer-refused'])test(`controlled CONNECT ${mode} owns all sockets and termination`,{timeout:30000},async t=>{
 const gone=[];let connections=0,closedPeer;const peerClosed=new Promise(resolve=>closedPeer=resolve);
 const upstream=await peer(t,socket=>{connections++;socket.once('close',()=>{gone.push(true);if(gone.length===connections)closedPeer();});socket.on('data',()=>{});socket.on('end',()=>socket.end());});const port=upstream.address().port;
 if(mode==='peer-refused')await new Promise(resolve=>upstream.close(resolve));
 const events=monitor();let child;
 const extra=mode==='idle'?{idleTimeoutMs:200}:mode==='duration'?{durationMs:5000}:mode==='bytes'?{maximumBytes:4}:{};
 const ready=await startMock(t,mockStart(document(),{tunnels:policy(port,extra)}),{onEvent:events.onEvent,onProcess:value=>child=value});
 const one=await connect(ready.port,`approved.test:${port}`);t.after(()=>one.socket.destroy());
 if(mode==='peer-refused'){assert.equal(one.status,502);await one.closed;assert(events.events.some(value=>value.event==='tunnel-refused'));return;}
 assert.equal(one.status,200);
 if(mode==='concurrency'){
  const two=await connect(ready.port,`approved.test:${port}`);t.after(()=>two.socket.destroy());assert.equal(two.status,200);
  const three=await connect(ready.port,`approved.test:${port}`);assert.equal(three.status,503);await three.closed;assert.equal(connections,2);two.socket.destroy();one.socket.destroy();
 }else if(mode==='disconnect')one.socket.destroy();
 else if(mode==='bytes')one.socket.write(Buffer.alloc(5));
 else if(mode==='shutdown'){child.kill('SIGTERM');assert.equal((await once(child,'exit'))[0],0);}
 else if(mode==='duration'){const timer=setInterval(()=>one.socket.write(Buffer.from([0])),50);t.after(()=>clearInterval(timer));}
 await one.closed;await peerClosed;assert.equal(gone.length,connections);
 const ended=await events.wait(value=>value.event==='tunnel-terminated');assert.equal(ended.responseBody,'not-applicable');
 if(mode==='idle')assert.equal(ended.reason,'idle-timeout');if(mode==='duration')assert.equal(ended.reason,'duration-limit');if(mode==='bytes')assert.equal(ended.reason,'byte-limit');if(mode==='shutdown')assert.equal(ended.reason,'cancelled');
});

for(const extra of [{requestBody:{required:true,content:{'application/json':{schema:{type:'integer'}}}}},{responses:{403:{description:'No successful tunnel'}}}])test('an unavailable captured CONNECT request or response never falls back to ordinary 200',{timeout:30000},async t=>{
 let connections=0;const upstream=await peer(t,socket=>{connections++;socket.end();}),port=upstream.address().port;
 const ready=await startMock(t,mockStart(document(extra),{tunnels:policy(port)})),result=await connect(ready.port,`approved.test:${port}`);
 assert.equal(result.status,extra.requestBody?422:501);await result.closed;assert.equal(connections,0);
});
