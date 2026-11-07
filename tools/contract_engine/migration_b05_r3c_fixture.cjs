const YAML=require('yaml');
module.exports=function fixture(version='3.2.1',format='json',targetVersion='3.1.2'){
 const root='file:///captured/api.'+format;
 const whole={name:'descriptionOnly',in:'querystring',required:true,content:{'application/x-www-form-urlencoded':{
  schema:{type:'object',properties:{q:{type:'string',enum:['','a+b','%20','/?&=#','雪']},flag:{type:'boolean'}},required:['q'],additionalProperties:false},
  encoding:{q:{style:'form',explode:true,allowReserved:false}},examples:{Plus:{dataValue:{q:'a+b'}}},
 }}};
 const cookie=(name,schema)=>({name,in:'cookie',style:'cookie',schema});
 const value={openapi:version,info:{title:'R3c exact parameters',version:'1'},servers:[{url:'https://api.invalid'}],
  paths:{'/p':{parameters:[{$ref:'#/components/parameters/Whole'}],get:{parameters:[
   {$ref:'#/components/parameters/Literal'},cookie('one',{type:'array',maxItems:1,items:{type:'string',enum:['','safe']}}),
   cookie('object',{type:'object',maxProperties:1,additionalProperties:false,properties:{left:{type:'string',enum:['L']},right:{type:'boolean'}}}),
  ],responses:{204:{description:'Empty'}}}},'/shared':{get:{parameters:[{$ref:'#/components/parameters/Whole'},{$ref:'#/components/parameters/Literal'}],responses:{204:{description:'Empty'}}}}},
  components:{parameters:{Whole:whole,Literal:cookie('literal',{type:'string',enum:['','a%20b','%zz','%','a+b','a/b','a=b','!']})}}};
 const encode=value=>format==='yaml'?'# Keep R3c comments 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value);
 return {root,snapshot:'r3c-finite',resources:[{id:root,text:encode(value),generation:3}],targetVersion,destination:'file:///reviewed/r3c/',value,encode};
};
