const YAML=require('yaml');

module.exports=function resourceOwners(format='yaml',targetVersion='3.2.1',single=false){
 const ids=['file:///resource-owners/first/api.'+format,'file:///resource-owners/second/api.'+format,'file:///resource-owners/data/parts.'+format];
 const payload={Forward:{$ref:'#/Example/value/Node'},Node:{$dynamicAnchor:'node',type:'object',required:['n'],
  properties:{n:{$ref:'nested/#number'},tag:{type:'string'},next:{$ref:'middle'}},
  $defs:{Number:{$id:'nested/',$schema:'https://json-schema.org/draft/2020-12/schema',$anchor:'number',type:'integer',enum:['EXACT']}}},
  Middle:{$id:'middle',$dynamicRef:ids[2]+'#node'},
  Untouched:{$id:'literal-id',$schema:'literal-dialect',$dynamicRef:'literal-dynamic',n:'EXACT',flag:false,empty:''}};
 const api=(version,name)=>({openapi:version,info:{title:name,version:'business'},servers:[{url:'https://api.invalid'}],paths:{},
  ...(name==='First'?{jsonSchemaDialect:'https://json-schema.org/draft/2020-12/schema'}:{}),components:{
   schemas:{Node:{$ref:ids[2]+'#/Example/value/Forward'},Bridge:{$ref:ids[2]+'#/Example/value/Middle'},Strict:{$id:'strict',$dynamicAnchor:'node',$ref:ids[2]+'#/Example/value/Forward',
    required:['tag'],properties:{tag:{const:name}}}},examples:{Payload:{$ref:ids[2]+'#/Example'}}}});
 const values=[api('3.2.1','First'),...(!single?[api('3.1.2','Second')]:[]),{Example:{value:payload},Literal:payload}];
 const locations=[ids[0],...(!single?[ids[1]]:[]),ids[2]];
 const text=value=>(format==='yaml'?'# Resource identities 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 return {root:ids[0],snapshot:'whole-resources-'+format+targetVersion+single,targetVersion,destination:'file:///resource-owners-output/',
  resources:values.map((value,index)=>({id:locations[index],text:text(value),generation:index+1}))};
};
