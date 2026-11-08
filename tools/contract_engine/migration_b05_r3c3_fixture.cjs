const YAML=require('yaml');
module.exports=function fixture(version='3.2.1',format='json',targetVersion='3.1.2',single=false){
 const input=require('./migration_b05_r3c2_fixture.cjs')(version,format,targetVersion,'required');
 input.schema.properties.q.items={type:'string',enum:['','a+b','%20','雪']};
 input.schema.properties.count={type:'number',enum:['EXACT']};
 delete input.schema.properties.text;
 if(single){delete input.schema.properties.count;delete input.schema.properties.flag;delete input.schema.required;input.whole.required=false;}
 input.encode=value=>(format==='yaml'?'# R3c3 exact inverse 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)).replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 input.refresh=()=>{input.resources[0].text=input.encode(input.value);return input;};
 input.configure=raw=>{input.configuration={id:'file:///captured/busyapi.yaml',generation:7,text:JSON.stringify({version:1,roots:[{name:'api',path:'factors.'+format}],
  environments:{manual:{variables:{held:'a+b%20'},authentication:{alternative:-1,schemes:{}}}},tests:[{name:'saved',operation:{method:'get',path:'/p'},environment:'manual',
   parameters:{querystring:{descriptionOnly:raw},header:{Keep:'literal%2B'}},expect:{status:204}}]})};return input;};
 return input.refresh();
};
