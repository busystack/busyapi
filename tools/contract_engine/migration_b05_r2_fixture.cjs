const YAML=require('yaml');
const versions=['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'];
const render=(value,format)=>(format==='yaml'?'# Preserve R2 owners 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
 .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
function capture(version='3.0.4',format='yaml'){
 const root='file:///approved/api.'+format,ref=(kind,name)=>({$ref:'#/components/'+kind+'/'+name});
 const schema={type:'integer',enum:['EXACT',0]},media={schema:structuredClone(schema),examples:{First:ref('examples','Alias'),Same:ref('examples','Payload')}};
 const value={openapi:version,info:{title:'R2 owners',version:'1'},servers:[{url:'https://api.invalid'}],paths:{'/echo':{post:{
  parameters:[ref('parameters','Shared')],requestBody:ref('requestBodies','Shared'),responses:{200:ref('responses','Alias'),204:{description:'No payload'}}
 }}},components:{
  parameters:{Shared:{name:'n',in:'query',required:true,deprecated:false,allowReserved:false,schema:structuredClone(schema)},
   Unused:{name:'unused',in:'header',deprecated:false,schema:{type:'boolean'}}},
  requestBodies:{Shared:{description:'[Request](./request.md)',required:true,content:{'application/json':structuredClone(media)}}},
  responses:{Alias:ref('responses','Reply'),Reply:{description:'[Reply](./reply.md)',headers:{'X-Count':ref('headers','Alias')},content:{'application/json':structuredClone(media)}}},
  headers:{Alias:ref('headers','Count'),Count:{description:'[Count](./header.md)',required:false,deprecated:false,style:'simple',explode:false,schema:structuredClone(schema)}},
  examples:{Alias:ref('examples','Payload'),Payload:{summary:'Exact payload',description:'[Payload](./payload.md)',value:'EXACT'},Unused:{value:{$ref:'literal-only',externalValue:'literal-only',zero:0,flag:false,nil:null}}},
  schemas:{Independent:{$ref:'#/components/requestBodies/Shared/content/application~1json/schema'}},
 },'x-kept':{$ref:'literal-only',flag:false,nil:null,exact:'EXACT'}};
 return {value,input:{root,resources:[{id:root,text:render(value,format),generation:7}],snapshot:'B05-R2-'+version+format,targetVersion:'2.0',destination:'file:///reviewed/r2/'}};
}
const reopened=(plan,destination)=>({root:destination?new URL(plan.entry,destination).href:plan.outputRoot,snapshot:'cold-R2',
 resources:plan.outputs.map(output=>({id:destination?new URL(output.path,destination).href:output.id,text:output.text,generation:0,
  aliases:Object.entries(plan.manifest.resourceMappings).filter(([,path])=>path===output.path).map(([uri])=>uri)}))});
module.exports={capture,render,reopened,versions};
