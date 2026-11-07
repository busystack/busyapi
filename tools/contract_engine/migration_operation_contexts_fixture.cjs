const YAML=require('yaml');
module.exports=function operationContexts(format,{empty=false,bodyless=false}={}){
 const root=`file:///operation-contexts/a.${format}`,other=`file:///operation-contexts/b.${format}`,shared=`file:///operation-contexts/shared.${format}`;
 const ref=pointer=>({$ref:`shared.${format}#/${pointer}`});
 const api=(name,consumes,produces)=>({swagger:'2.0',info:{title:name,version:'business'},host:'api.invalid',schemes:['https'],basePath:'/v1',consumes,produces,
  securityDefinitions:{Access:{type:'apiKey',in:'header',name:'X-'+name}},
  paths:{'/inherited':{$ref:`shared.${format}#/Path`,parameters:[{name:'n',in:'query',type:'integer'}]},
   '/override':{post:{consumes:['application/vnd.override+json'],produces:['application/json'],parameters:[ref('Body')],responses:{200:ref('Reply')}}},
   '/empty':{post:{consumes:[],produces:[],parameters:[ref('AnyBody')],responses:{200:ref('AnyReply')}}}},
  definitions:{Independent:{$ref:`shared.${format}#/Body/schema`}},'x-data':{literal:{$ref:'never-resolve'},exact:'EXACT',flag:false,empty:''}});
 const fragment={Path:{post:{operationId:'shared',security:[{Access:[]}],parameters:[ref('Body')],responses:{200:ref('Reply'),204:{description:'Empty'}}}},
  Body:{in:'body',name:'payload',required:true,schema:empty?{}:{type:'object',properties:{n:{type:'integer',enum:['EXACT']},next:{$ref:'#/Body/schema'}},additionalProperties:false}},
  Reply:{description:'Shared reply',...(bodyless?{}:{schema:empty?{}:{$ref:'#/Body/schema'}})},
  AnyBody:{in:'body',name:'payload',schema:{}},AnyReply:{description:'Unconstrained',schema:{}},
  Literal:{flag:false,exact:'EXACT',$ref:'untouched'}};
 const encode=value=>(format==='yaml'?'# Keep operation contexts 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 const resources=[api('First',['application/json'],['application/vnd.reply-a+json']),
  api('Second',empty?[]:['application/vnd.request-b+json'],['application/json']),fragment]
  .map((value,index)=>({id:[root,other,shared][index],generation:index+3,text:encode(value)}));
 return {root,snapshot:'B05-R1-operation-contexts',resources,targetVersion:'3.2.1',destination:'file:///reviewed/operations/'};
};
