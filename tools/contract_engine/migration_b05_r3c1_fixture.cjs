// Bounded one-field projection; multi-field factorization belongs to R3c-2.
module.exports=function fixture(version='3.2.1',format='json',target='3.1.2',required=false){
 const input=require('./migration_b05_r3c_fixture.cjs')(version,format,target);
 const whole=input.value.components.parameters.Whole;
 whole.required=required;
 whole.content={'application/x-www-form-urlencoded':{schema:{
  type:'object',additionalProperties:false,properties:{q:{type:'array',minItems:required?1:0,maxItems:2,
   items:{$ref:'#/components/schemas/Item'}}},...(required?{required:['q']}:{})
 }}};
 input.value.components.schemas={Item:{type:'string',enum:['','a+b','%20','/?&=#','雪']}};
 input.resources[0].text=input.encode(input.value);return input;
};
