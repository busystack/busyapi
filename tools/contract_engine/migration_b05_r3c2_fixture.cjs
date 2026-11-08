const YAML=require('yaml');
module.exports=function fixture(version='3.2.1',format='json',targetVersion='3.1.2',mode='independent'){
 const root='file:///captured/factors.'+format;
 const schema={type:'object',additionalProperties:false,properties:{
  q:{type:'array',maxItems:2,items:{$ref:'#/components/schemas/Item'}},
  flag:{type:'boolean'},text:{type:'string',enum:['','%20','雪']},
 }};
 const whole={name:'descriptionOnly',in:'querystring',required:mode!=='independent',content:{'application/x-www-form-urlencoded':{schema}}};
 if(mode==='required'){schema.required=['flag'];}
 if(mode==='all-required'){schema.required=['q','flag','text'];schema.properties.q.minItems=1;}
 if(mode==='optional-group'){whole.required=false;schema.required=['flag','text'];}
 if(mode==='required-empty'){schema.required=['q'];}
 if(mode==='dependent'){whole.required=false;schema.dependentRequired={q:['flag']};}
 if(mode==='conditional'){whole.required=false;schema.if={required:['flag'],properties:{flag:{const:true}}};schema.then={required:['text']};}
 if(mode==='exclusive'){whole.required=false;schema.oneOf=[{required:['q'],not:{required:['text']}},{required:['text'],not:{required:['q']}}];}
 if(mode==='counts'){whole.required=false;schema.minProperties=1;schema.maxProperties=2;}
 if(mode==='correlated'){whole.required=false;schema.enum=[{q:['a+b'],flag:true,text:''},{q:[''],flag:false,text:'雪'}];}
 const value={openapi:version,info:{title:'R3c2 factors',version:'1'},servers:[{url:'https://api.invalid'}],
  paths:{'/p':{parameters:[{$ref:'#/components/parameters/Alias'}],get:{responses:{204:{description:'Empty'}}}},
   '/shared':{get:{parameters:[{$ref:'#/components/parameters/Whole'}],responses:{204:{description:'Empty'}}}}},
  components:{schemas:{Item:{type:'string',enum:['','a+b']}},parameters:{Whole:whole,Alias:{$ref:'#/components/parameters/Whole'}}}};
 const encode=value=>format==='yaml'?'# R3c2 member ownership 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value);
 return {root,snapshot:'r3c2-factors',resources:[{id:root,text:encode(value),generation:3}],targetVersion,destination:'file:///reviewed/factors/',value,schema,whole,encode};
};
