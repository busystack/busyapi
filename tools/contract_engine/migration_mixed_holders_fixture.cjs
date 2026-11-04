const YAML=require('yaml');
module.exports=function mixedLegacyHolders(format,targetVersion,restrictedVersion='2.0'){
 const root=`file:///legacy-holders/legacy/api.${format}`,other=`file:///legacy-holders/modern/api.${format}`,shared=`file:///legacy-holders/models/shared.${format}`;
 const ref=`../models/shared.${format}`;
 const response=modern=>modern?{description:'Value',content:{'application/json':{schema:{$ref:'#/components/schemas/Model'}}}}:
  {description:'Value',schema:{$ref:'#/definitions/Model'}};
 const base=(modern,name)=>({...(modern||restrictedVersion==='3.0.4'?{openapi:modern?'3.1.2':restrictedVersion,servers:[{url:'https://api.invalid'}]}:{swagger:'2.0',host:'api.invalid',schemes:['https'],produces:['application/json']}),
  info:{title:name,version:'business',description:'[Guide](guide.md)'},paths:{'/p':{$ref:ref+'#/Path'},'/value':{get:{responses:{200:response(modern||restrictedVersion==='3.0.4')}}}},
  ...(modern||restrictedVersion==='3.0.4'?{components:{schemas:{Model:{$ref:ref+'#/Model'},...(modern?{Node:{$id:'https://schemas.invalid/legacy-holder-node',type:'array',items:{$ref:'https://schemas.invalid/legacy-holder-node'}}}:{})},
   securitySchemes:{Access:{type:'apiKey',in:'header',name:'X-'+name}}}}:
   {definitions:{Model:{$ref:ref+'#/Model'}},securityDefinitions:{Access:{type:'apiKey',in:'header',name:'X-'+name}}})});
 const model={type:'integer',enum:['EXACT'],description:'[Model](model.md)'};
 const fragment={Path:{post:{operationId:'shared',security:[{Access:[]}],responses:{204:{description:'Empty'}}}},Model:model,Literal:model,
  'x-literal':{flag:false,empty:'',exact:'EXACT',$ref:'literal-only'}};
 const encode=value=>(format==='yaml'?'# Keep mixed legacy 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 return {root,snapshot:'mixed-legacy-holders-'+format+targetVersion,targetVersion,destination:'file:///legacy-holder-output/',
  resources:[base(false,'First'),base(true,'Second'),fragment].map((value,index)=>({id:[root,other,shared][index],text:encode(value),generation:index+1}))};
};
