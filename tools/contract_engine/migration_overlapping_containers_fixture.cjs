const YAML=require('yaml');

module.exports=function overlappingContainers(format='yaml',restrictedVersion='2.0',reverse=false){
 const input=require('./migration_mixed_holders_fixture.cjs')(format,'3.2.1',restrictedVersion);
 const modern=YAML.parse(input.resources[1].text.replaceAll('9007199254740993.00','"EXACT"'));
 // Exact numbers are authored below after serialization, never round-tripped
 // through a native floating-point value.
 const literal={flag:false,empty:'',zero:0,n:'EXACT',$ref:'literal-only'};
 const paths={value:{'x-literal':literal}};
 modern.components.pathItems=paths;
 modern.components.examples={Dictionary:{$ref:'#/components/pathItems'}};
 modern.components.schemas.ExampleMap={$ref:'#/components/examples'};
 modern.components.schemas.SchemaMap={$ref:'#/components/schemas'};
 modern['x-path-alias']=paths;
 if(reverse)for(const group of ['schemas','examples','pathItems'])
  modern.components[group]=Object.fromEntries(Object.entries(modern.components[group]).reverse());
 input.resources[1].text=(format==='yaml'?'# Retain overlapping destinations 雪\r\n'+YAML.stringify(modern).replaceAll('\n','\r\n'):JSON.stringify(modern))
  .replaceAll('"EXACT"','9007199254740993.00').replaceAll('EXACT','9007199254740993.00');
 return input;
};
