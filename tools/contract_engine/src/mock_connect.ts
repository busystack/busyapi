import {isIP,Socket} from 'node:net';
import type {IncomingMessage,Server} from 'node:http';
import {Transform} from 'node:stream';
import {SourceError} from './document';
import {record} from './engine_worker_client';
import type {MockNativeValidation} from './mock_native_validation';
import type {MockMethodTransport} from './mock_method_transport';

export const mockTunnelProducer=Object.freeze({name:'busyapi-native-tunnels',version:'1',configuration:'approved-pinned-peers-v1'});
export type TunnelDestination={path:string;authority:string;address:string};
export type TunnelPolicy={destinations:TunnelDestination[];maximumTunnels:number;maximumBytes:number;idleTimeoutMs:number;durationMs:number};

/** No URL parsing, implicit ports, DNS acquisition, wildcard hosts or userinfo.
 * Approved names are connected only through their explicitly pinned IP. */
export function tunnelAuthority(value:string):{host:string;port:number} {
 const match=/^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?):([0-9]{1,5})$/.exec(value);
 if(!match||value.length>320)throw new SourceError('mock.tunnel.authority','CONNECT requires authority-form host:port with an explicit valid port');
 const host=match[1].startsWith('[')?match[1].slice(1,-1):match[1],port=Number(match[2]);
 if(port<1||port>65535||match[1].startsWith('[')&&isIP(host)!==6||!isIP(host)&&host.split('.').some(label=>!label||label.length>63||! /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)))
  throw new SourceError('mock.tunnel.authority','CONNECT authority has an invalid host or port');
 return {host,port};
}
const canonicalIP=(address:string)=>{
 if(!isIP(address)||address.includes('%'))throw new SourceError('mock.tunnel.policy','A destination requires one explicit IP address');
 const canonical=isIP(address)===6?new URL('http://['+address+']/').hostname:address;
 if(['0.0.0.0','255.255.255.255','[::]'].includes(canonical)||isIP(address)===4&&Number(address.split('.')[0])>=224||canonical.toLowerCase().startsWith('[ff'))throw new SourceError('mock.tunnel.policy','A destination must pin a concrete unicast peer address');
 return canonical;
};
export function tunnelPolicy(value:unknown):TunnelPolicy|undefined {
 if(value===undefined)return;
 const bound=(name:string,maximum:number)=>{const number=record(value)&&value[name];if(typeof number!=='number'||!Number.isSafeInteger(number)||number<1||number>maximum)throw new SourceError('mock.tunnel.policy',name+' must be an explicit positive bounded integer');return number;};
 if(!record(value)||!Array.isArray(value.destinations)||!value.destinations.length||value.destinations.length>32)throw new SourceError('mock.tunnel.policy','Approve between 1 and 32 exact tunnel destinations');
 const seen=new Set<string>();
 const destinations=value.destinations.map(item=>{
  if(!record(item)||typeof item.path!=='string'||!item.path.startsWith('/')||item.path.length>4096||typeof item.authority!=='string'||typeof item.address!=='string')throw new SourceError('mock.tunnel.policy','Each tunnel destination requires a captured path, authority and pinned IP address');
  const authority=tunnelAuthority(item.authority);canonicalIP(item.address);
  if(isIP(authority.host)&&canonicalIP(authority.host)!==canonicalIP(item.address))throw new SourceError('mock.tunnel.policy','An IP authority must match its approved peer');
  if(seen.has(item.authority))throw new SourceError('mock.tunnel.policy','Tunnel authorities must have one operation owner');seen.add(item.authority);
  return {path:item.path,authority:item.authority,address:item.address};
 });
 return {destinations,maximumTunnels:bound('maximumTunnels',32),maximumBytes:bound('maximumBytes',64*1024*1024),idleTimeoutMs:bound('idleTimeoutMs',60000),durationMs:bound('durationMs',300000)};
}

/** RFC 9110 §9.3.6 / Node http.Server 'connect'. Upgraded sockets are owned
 * explicitly: server.closeAllConnections does not close tunnels. */
export class MockConnectTransport {
 private readonly active=new Set<AbortController>();
 private closing=false;
 constructor(server:Server,private readonly native:MockNativeValidation,private readonly methods:MockMethodTransport,private readonly policy:TunnelPolicy|undefined,private readonly report:(event:Record<string,unknown>)=>void) {
  for(const peer of policy?.destinations??[])native.operationSource(peer.path,'CONNECT');
  server.on('connect',(request,socket,head)=>{void this.open(request,socket as Socket,head);});
 }
 close():void {this.closing=true;for(const control of this.active)control.abort();}
 private async open(request:IncomingMessage,client:Socket,head:Buffer):Promise<void> {
  const control=new AbortController(),signal=control.signal;
  let peer:Socket|undefined,established=false,finished=false,path:string|undefined,source:unknown,bytes=0;
  const report=(event:string,extra:Record<string,unknown>={})=>this.report({event,producer:mockTunnelProducer.name,producerVersion:mockTunnelProducer.version,method:'CONNECT',...(path?{path,source}:{}),responseBody:'not-applicable',...extra});
  const finish=(reason:string,status=502)=>{
   if(finished)return;finished=true;
   clearTimeout(duration);this.active.delete(control);signal.removeEventListener('abort',cancel);control.abort();
   peer?.destroy();
   if(established){report('tunnel-terminated',{reason,bytes});client.destroy();}
   else {report('tunnel-refused',{reason,status,complete:false});if(!client.destroyed)client.end(`HTTP/1.1 ${status} Tunnel Refused\r\nConnection: close\r\nContent-Length: 0\r\nbusyapi-tunnel-status: refused\r\n\r\n`,()=>client.destroy());}
  };
  const cancel=()=>finish('cancelled',503);
  const duration=setTimeout(()=>finish('duration-limit',504),this.policy?.durationMs??5000);duration.unref();
  client.pause();client.allowHalfOpen=true;
  client.on('error',()=>finish('client-error'));client.once('close',()=>finish(client.readableEnded&&client.writableFinished?'closed':'disconnect'));
  signal.addEventListener('abort',cancel,{once:true});
  try {
   if(this.methods.method(request)!=='CONNECT')throw new SourceError('mock.tunnel.method','Only the original case-sensitive CONNECT method owns a tunnel');
   const target=tunnelAuthority(request.url??'');
   const approved=this.policy?.destinations.find(value=>value.authority===request.url);
   if(this.closing||!approved){finish('destination-denied',403);return;}
   path=approved.path;source=this.native.operationSource(path,'CONNECT');
   if(this.active.size>=this.policy!.maximumTunnels){finish('concurrency-limit',503);return;}
   this.active.add(control);
   if(head.length>65536||request.headers['transfer-encoding']!==undefined||request.headers['content-length']!==undefined){finish('request-framing',400);return;}
   const headers:Record<string,string>=Object.create(null);
   for(let at=0;at<request.rawHeaders.length;at+=2){const name=request.rawHeaders[at].toLowerCase();headers[name]=headers[name]===undefined?request.rawHeaders[at+1]:headers[name]+', '+request.rawHeaders[at+1];}
   const security=this.native.security(path,'CONNECT','',request.rawHeaders,signal);
   const parameters=await this.native.parameters(path,'CONNECT',path,'',headers,signal,request.rawHeaders);
   const body=await this.native.body(path,'CONNECT',Buffer.alloc(0),headers['content-type'],headers['content-type']!==undefined,signal);
   if(finished)return;
   if(!security.complete||!parameters.complete||!body.complete){finish('request-unavailable',501);return;}
   if(!security.valid||!parameters.valid||!body.valid){finish(!security.valid?'security-refused':'request-invalid',!security.valid?401:422);return;}
   // Status and Header assertions remain original-schema checks. A successful
   // CONNECT has no response body, even when an ordinary response declares one.
   const response=await this.native.tunnelResponse(path,signal);
   if(finished)return;
   peer=new Socket({allowHalfOpen:true});
   const outgoing=peer;
   outgoing.on('error',()=>finish('peer-refused'));
   outgoing.once('close',hadError=>{if(finished)return;if(hadError||!outgoing.readableEnded||!outgoing.writableFinished){finish('peer-disconnect');return;}if(!client.destroyed&&!client.writableEnded)client.end();if(client.destroyed)finish('peer-closed');});
   outgoing.setTimeout(this.policy!.idleTimeoutMs,()=>finish('idle-timeout',504));
   client.setTimeout(this.policy!.idleTimeoutMs,()=>finish('idle-timeout',504));
   outgoing.once('connect',()=>{
    if(finished)return;
    let approvedPeer=false;
    try{approvedPeer=!!outgoing.remoteAddress&&canonicalIP(outgoing.remoteAddress)===canonicalIP(approved.address)&&outgoing.remotePort===target.port;}catch{/* An unavailable effective address cannot authorize a tunnel. */}
    if(!approvedPeer){finish('effective-peer-denied',403);return;}
    established=true;
    const fields=Object.entries(response.headers).map(([name,value])=>`${name}: ${value}\r\n`).join('');
    client.write(`HTTP/1.1 ${response.status} Connection Established\r\n${fields}busyapi-tunnel-status: established\r\n\r\n`);
    report('tunnel-established',{status:response.status,complete:true,requestSecurityComplete:true});
    const meter=()=>new Transform({transform:(chunk:Buffer,_encoding,callback)=>{bytes+=chunk.length;if(bytes>this.policy!.maximumBytes){finish('byte-limit');callback(new Error('Tunnel byte limit'));}else callback(null,chunk);}});
    const inbound=meter(),outbound=meter();
    inbound.on('error',()=>finish('byte-limit'));outbound.on('error',()=>finish('byte-limit'));
    inbound.pipe(outgoing);outgoing.pipe(outbound).pipe(client);
    // Write Node's detached head before reading more client bytes. Awaiting
    // its write callback also handles a head above the stream high-water mark
    // without unshifting into a client that may already have sent FIN.
    const pipeClient=()=>{if(finished)return;client.pipe(inbound);client.resume();};
    if(head.length)inbound.write(head,error=>error?finish('peer-error'):pipeClient());
    else pipeClient();
   });
   outgoing.connect({host:approved.address,port:target.port,family:isIP(approved.address)});
  }catch(error){if(!finished)finish(error instanceof SourceError?error.code:'tunnel-unavailable',error instanceof SourceError&&error.code==='mock.tunnel.authority'?400:501);}
 }
}
