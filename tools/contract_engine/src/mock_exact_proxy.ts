import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {Readable,Writable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGunzip,createInflate,createBrotliDecompress} from 'node:zlib';
import {SourceError} from './document';

export type ExactProxyResponse={status:number;headers:Headers;rawHeaders:readonly string[];wire:Buffer;decoded:Buffer;streamed?:boolean};
export type ExactProxyObserver={open:(status:number,headers:Headers,rawHeaders:readonly string[])=>Promise<boolean>;wire:(chunk:Buffer)=>Promise<void>;decoded:(chunk:Buffer)=>Promise<void>;finish:(complete:boolean,error?:unknown)=>Promise<void>};

async function decode(wire:Buffer,encoding:string|undefined,maximum:number,signal?:AbortSignal):Promise<Buffer> {
    signal?.throwIfAborted();
    const codings=(encoding??'').split(',').map(value=>value.trim().toLowerCase()).filter(value=>value&&value!=='identity');
    if(codings.length>4)throw new SourceError('mock.proxy.encoding.limit','The upstream exceeds the four-layer content-coding budget',undefined,'unsupported');
    let decoded=wire;
    for(const coding of codings.reverse()){
        let decoder:Transform;
        if(coding==='gzip'||coding==='x-gzip')decoder=createGunzip();
        else if(coding==='deflate')decoder=createInflate();
        else if(coding==='br')decoder=createBrotliDecompress();
        else throw new SourceError('mock.proxy.encoding.unsupported','The upstream content coding cannot be evaluated: '+coding,undefined,'unsupported');
        const chunks:Buffer[]=[];
        let length=0;
        const sink=new Writable({write(chunk:Buffer,_encoding,done){
            length+=chunk.length;
            if(length>maximum){done(new SourceError('mock.proxy.decoded.limit','The decoded upstream exceeds the response-byte budget',undefined,'unsupported'));return;}
            chunks.push(Buffer.from(chunk));done();
        }});
        try{await pipeline(Readable.from([decoded]),decoder,sink,{signal});}
        catch(error){
            if(signal?.aborted)throw error;
            if(error instanceof Error&&'code'in error&&['Z_DATA_ERROR','Z_BUF_ERROR','Z_NEED_DICT'].includes(String(error.code)))
                throw new SourceError('mock.proxy.encoding.invalid','The upstream content-coded representation is malformed');
            throw error;
        }
        decoded=Buffer.concat(chunks,length);
    }
    signal?.throwIfAborted();return decoded;
}

/** The Fetch method normalization/forbidden-method rules cannot represent all
 * OAS additional methods. Node's public ClientRequest.method is set before
 * headers are generated. Header/body framing and TLS still use its HTTP client.
 * All proxy methods use this owner to retain separate original field lines.
 * Wire bytes remain separate from the bounded HTTP content-decoding view. */
export async function exactProxyResponse(target:URL,method:string,headers:Headers,body:Buffer|undefined,maximum:number,signal?:AbortSignal,rawHeaders?:readonly string[],observer?:ExactProxyObserver):Promise<ExactProxyResponse> {
    if(!['http:','https:'].includes(target.protocol))throw new SourceError('mock.proxy.protocol','The proxy target is not HTTP(S)');
    const received=await new Promise<Omit<ExactProxyResponse,'decoded'>>((resolve,reject)=>{
        const fields:Record<string,string|string[]>=Object.create(null);
        if(rawHeaders)for(let index=0;index<rawHeaders.length;index+=2){
            const name=rawHeaders[index].toLowerCase(),previous=fields[name];
            fields[name]=previous===undefined?[rawHeaders[index+1]]:[...(typeof previous==='string'?[previous]:previous),rawHeaders[index+1]];
        }
        else for(const [name,value]of headers.entries())fields[name]=value;
        if(body!==undefined)fields['content-length']=String(body.length);
        const request=(target.protocol==='https:'?httpsRequest:httpRequest)(target,{method,headers:fields,signal},response=>{
            void(async()=>{
                const status=response.statusCode;
                if(typeof status!=='number'||!Number.isInteger(status))throw new SourceError('mock.proxy.status','The upstream omitted an HTTP status');
                const outputHeaders=new Headers();
                for(let index=0;index<response.rawHeaders.length;index+=2)
                    outputHeaders.append(response.rawHeaders[index],response.rawHeaders[index+1]);
                const streamCodings=(outputHeaders.get('content-encoding')??'').split(',').map(value=>value.trim().toLowerCase()).filter(value=>value&&value!=='identity');
                if(observer&&(streamCodings.length>4||streamCodings.some(value=>!['gzip','x-gzip','deflate','br'].includes(value))))throw new SourceError('mock.proxy.encoding.unsupported','The upstream coding has no supported bounded decoder',[0,0],'unsupported');
                if(observer&&await observer.open(status,outputHeaders,response.rawHeaders)){
                    let wireLength=0,decodedLength=0;
                    const wire=new Transform({transform(chunk:Buffer,_encoding,done){
                        wireLength+=chunk.length;
                        if(wireLength>maximum){done(new SourceError('mock.proxy.wire.limit','The upstream exceeds its bounded byte budget',[0,0],'unsupported'));return;}
                        observer.wire(chunk).then(()=>done(null,chunk),error=>done(error));
                    }});
                    const codings=(outputHeaders.get('content-encoding')??'').split(',').map(value=>value.trim().toLowerCase()).filter(value=>value&&value!=='identity');
                    const stages:Transform[]=[wire];
                    for(const coding of codings.reverse()){
                        const decoder=coding==='gzip'||coding==='x-gzip'?createGunzip():coding==='deflate'?createInflate():coding==='br'?createBrotliDecompress():undefined;
                        if(!decoder||stages.length>8)throw new SourceError('mock.proxy.encoding.unsupported','The upstream coding has no bounded stream decoder',[0,0],'unsupported');
                        let layerBytes=0;stages.push(decoder,new Transform({transform(chunk:Buffer,_encoding,done){layerBytes+=chunk.length;done(layerBytes>maximum?new SourceError('mock.proxy.decoded.limit','A decoded upstream layer exceeds its byte budget',[0,0],'unsupported'):null,chunk);}}));
                    }
                    const sink=new Writable({write(chunk:Buffer,_encoding,done){decodedLength+=chunk.length;if(decodedLength>maximum){done(new SourceError('mock.proxy.decoded.limit','Decoded upstream bytes exceed the budget',[0,0],'unsupported'));return;}observer.decoded(chunk).then(()=>done(),error=>done(error));}});
                    try{await pipeline([response,...stages,sink],{signal});await observer.finish(true);}
                    catch(error){await observer.finish(false,error);throw error;}
                    return {status,headers:outputHeaders,rawHeaders:[...response.rawHeaders],wire:Buffer.alloc(0),streamed:true};
                }
                const chunks:Buffer[]=[];
                let length=0;
                for await(const chunk of response){
                    const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
                    length+=bytes.length;
                    if(length>maximum){
                        response.destroy();
                        throw new SourceError('mock.proxy.wire.limit','The upstream exceeds the response-byte budget',undefined,'unsupported');
                    }
                    chunks.push(bytes);
                }
                return {status,headers:outputHeaders,rawHeaders:[...response.rawHeaders],wire:Buffer.concat(chunks,length)};
            })().then(resolve,reject);
        });
        request.once('error',reject);
        // ClientRequest normalizes the constructor argument. This public field
        // owns the actual request line generated by the subsequent end/write.
        request.method=method;
        request.end(body);
    });
    if(received.streamed)return {...received,decoded:Buffer.alloc(0)};
    const decoded=await decode(received.wire,received.headers.get('content-encoding')??undefined,maximum,signal);
    return {...received,decoded};
}
