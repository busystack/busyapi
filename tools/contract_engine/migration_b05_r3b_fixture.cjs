const YAML=require('yaml');
const {createHash}=require('node:crypto');
const render=(value,format)=>(format==='yaml'?'# Keep R3b owners 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
 .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
const ref=pointer=>({$ref:'#'+pointer});
function capture(format='json',version='3.2.1',{external=false,scalarContexts=false}={}){
 const root='https://retrieval.invalid/r3b/api.'+format,library='https://retrieval.invalid/r3b/library.'+format;
 const payload={schema:{type:'integer',enum:['EXACT']},
  examples:{Count:ref('/components/examples/Count'),Same:ref('/components/examples/Count')},
  encoding:{field:{contentType:'application/json',headers:{'X-Part':{schema:{type:'integer'}}}}},prefixEncoding:[{}],itemEncoding:{}};
 const scalar={schema:{type:'integer',minimum:0}},literal={value:'EXACT',flag:false,empty:'',nil:null,$ref:'literal-only'};
 const item={parameters:[{name:'n',in:'query',required:true,...(scalarContexts?{content:{'application/json':ref('/components/mediaTypes/Scalar')}}:{schema:{type:'integer',minimum:0}})}],
  post:{requestBody:{required:true,content:{'application/json':ref('/components/mediaTypes/Alias')}},
   responses:{200:{description:'Count',headers:{'X-Count':scalarContexts?{content:{'application/json':ref('/components/mediaTypes/Scalar')}}:{schema:{type:'integer'}}},
    content:{'application/vnd.count+json':ref('/components/mediaTypes/Payload')}},204:{description:'Empty'}}}};
 const entry={openapi:version,info:{title:'R3b entry',version:'1'},servers:[{url:'https://api.invalid/base'}],
  paths:{'/first':{$ref:'library.'+format+'#/components/pathItems/Alias'},'/second':{$ref:'library.'+format+'#/components/pathItems/Item'}}};
 const objects={openapi:version,info:{title:'R3b library',version:'1'},servers:[{url:'https://api.invalid/base'}],paths:{},components:{
  pathItems:{Alias:ref('/components/pathItems/Item'),Item:item},mediaTypes:{Alias:ref('/components/mediaTypes/Payload'),Payload:payload,...(scalarContexts?{Scalar:scalar}:{})},
  examples:{Count:external?{externalValue:'count.bin'}:{value:'EXACT'}},
  headers:{Part:ref('/components/mediaTypes/Payload/encoding/field/headers/X-Part')},
  schemas:{Independent:ref('/components/mediaTypes/Payload/schema')}},'x-exact':literal,'x-alias':literal};
 const bytes=Buffer.from('9007199254740993.00');
 const exampleResources=external?[{version:1,id:'https://retrieval.invalid/r3b/count.bin',generation:3,state:'available',
  identity:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length,base64:bytes.toString('base64')}]:[];
 return {entry,objects,input:{root,snapshot:'r3b-owners',targetVersion:'2.0',destination:'file:///reviewed/r3b/',
  resources:[entry,objects].map((value,index)=>({id:[root,library][index],text:render(value,format),generation:index+4})),exampleResources}};
}
function reopened(review,destination='file:///cold/r3b/'){
 const aliases=path=>Object.entries(review.manifest.resourceMappings).filter(([,mapped])=>mapped===path).map(([uri])=>uri);
 return {root:new URL(review.entry,destination).href,snapshot:'cold-r3b',resources:review.outputs.map(output=>({
  id:new URL(output.path,destination).href,text:output.text,generation:0,aliases:aliases(output.path)})),
  exampleResources:review.exampleOutputs.map(output=>({version:1,id:new URL(output.path,destination).href,generation:0,state:'available',
   aliases:aliases(output.path),identity:output.identity,byteLength:output.byteLength,base64:output.base64}))};
}
module.exports={capture,render,reopened};
