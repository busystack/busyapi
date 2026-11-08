const {test}=require('node:test');
const assert=require('node:assert/strict');
const YAML=require('yaml');
const {planMigration}=require('./dist/migration.cjs');
const {analyse,createGraph}=require('./dist/model.cjs');
const {evaluateSchemas}=require('./dist/schema_evaluation.cjs');
const {SourceDocument}=require('./dist/document.cjs');

function capture(version,target,format,flag,required,name='value'){
    const root='file:///directions/api.'+format,models='file:///directions/models.'+format;
    const legacy=version==='2.0',schema={$ref:'models.'+format+'#/Model'};
    const value={
        [legacy?'swagger':'openapi']:version,
        info:{title:'Directional 雪',version:'business'},
        ...(legacy?{host:'api.invalid',schemes:['https'],basePath:'/v1',consumes:['application/json'],produces:['application/json']}:
            {servers:[{url:'https://api.invalid/v1'}]}),
        paths:{'/value':{post:{
            ...(legacy?{parameters:[{name:'body',in:'body',schema}]}:{requestBody:{content:{'application/json':{schema}}}}),
            responses:{200:{description:'Echo',...(legacy?{schema}:{content:{'application/json':{schema}}})}},
        }}},
        'x-kept':{number:'EXACT',empty:'',flag:false,null:null},
    };
    const exemplar={[name]:'neutral',next:{[name]:'nested'}};
    const definitions={
        Flag:{type:'string',[flag]:true,default:'neutral'},
        Alias:{$ref:'#/Flag'},
        Model:{type:'object',...(required?{required:[name]}:{}),
            properties:{[name]:{$ref:'#/Alias'},next:{$ref:'#/Model'}},additionalProperties:false,
            example:exemplar,default:exemplar,description:'[Model notes](notes/model.md#fields)'},
    };
    const text=value=>(format==='yaml'?'# Keep original comments 雪\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value)+'\r\n')
        .replaceAll('"EXACT"','9007199254740993.000').replaceAll('EXACT','9007199254740993.000');
    return {root,snapshot:[version,target,format,flag,required,name].join(':'),targetVersion:target,destination:'file:///reviewed/directional/',
        resources:[{id:root,generation:7,text:text(value)},{id:models,generation:4,text:text(definitions)}]};
}

async function values(input,payloads,subjects=['request-body','response-body']){
    const source=new SourceDocument(input.resources.find(resource=>resource.id===input.root).text,input.root);
    const legacy=source.node('').value.swagger==='2.0';
    const runtimeInstances=subjects.flatMap(subject=>payloads.map(text=>({
        subject,text,location:'application/json',schema:{resource:input.root,pointer:subject==='request-body'?
            (legacy?'/paths/~1value/post/parameters/0/schema':'/paths/~1value/post/requestBody/content/application~1json/schema'):
            (legacy?'/paths/~1value/post/responses/200/schema':'/paths/~1value/post/responses/200/content/application~1json/schema')},
    })));
    const result=await evaluateSchemas({...input,runtimeInstances});
    assert.equal(result.complete,true,JSON.stringify(result.findings));
    assert.equal(result.runtimeEvaluations.length,runtimeInstances.length);
    assert(result.runtimeEvaluations.every(value=>value.complete),JSON.stringify(result.runtimeFindings));
    return result.runtimeEvaluations.map(value=>value.valid);
}

const routes=[...['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4'].flatMap(version=>['3.1.2','3.2.1'].map(target=>[version,target])),
    ...['3.0.4','3.1.2','3.2.1'].map(target=>['2.0',target]),
    ...['3.0.0','3.0.1','3.0.2','3.0.3','3.0.4','3.1.0','3.1.1','3.1.2','3.2.0','3.2.1'].map(version=>[version,'2.0'])];
for(const [version,target]of routes)for(const format of ['yaml','json'])
for(const flag of version==='2.0'||target==='2.0'?['readOnly']:['readOnly','writeOnly'])for(const required of [false,true])
test(`${version} to ${target} ${format} ${flag} required=${required} preserves recursive directional values and neutral examples`,async()=>{
    const input=capture(version,target,format,flag,required),originals=input.resources.map(resource=>resource.text);
    const payloads=['{}','{"value":"café"}','{"value":false}','{"value":null}','null','false','0','""',
        '{"next":{}}','{"value":"root","next":{"value":"nested"}}','{"value":"root","next":{"value":false}}'];
    const before=await values(input,payloads);
    const review=await planMigration(input);
    assert.equal(review.status,'faithfully-convertible',JSON.stringify(review.problems));
    assert.equal(review.producerVersion,'97');assert.equal(review.complete,true);
    assert(review.changes.length>0);assert(review.outputs.length>=3);
    const targetInput={root:review.outputRoot,snapshot:'cold:'+input.snapshot,
        resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
    assert.equal(analyse(targetInput).status,'complete');
    assert.deepEqual(await values(targetInput,payloads),before);
    const root=new SourceDocument(targetInput.resources.find(resource=>resource.id===targetInput.root).text,targetInput.root);
    const request=root.node(target==='2.0'?'/paths/~1value/post/parameters/0/schema':'/paths/~1value/post/requestBody/content/application~1json/schema').value;
    const response=root.node(target==='2.0'?'/paths/~1value/post/responses/200/schema':'/paths/~1value/post/responses/200/content/application~1json/schema').value;
    assert.notDeepEqual(request,response,'One schema binding cannot stand for both directions');
    const created=review.changes.filter(change=>change.createdFrom);
    assert(created.length>=1);assert(created.every(change=>change.createdFrom===input.root&&change.before===''));
    assert(created.some(change=>Object.keys(new SourceDocument(change.after,change.resource).node('').value)
        .some(name=>name.startsWith('_migrated_request_'))));
    assert(created.some(change=>Object.keys(new SourceDocument(change.after,change.resource).node('').value)
        .some(name=>name.startsWith('_migrated_response_'))));
    assert.equal(root.dataJson('/x-kept'),new SourceDocument(originals[0],input.root).dataJson('/x-kept'));
    const relocated=review.changes.find(change=>change.resource===input.resources[1].id);
    const models=review.outputs.find(output=>output.id===relocated?.destination);
    assert(models,'The original external definitions remain a delivered resource');
    const definitions=new SourceDocument(models.text,models.id);
    const original=new SourceDocument(originals[1],input.resources[1].id);
    assert.equal(definitions.dataJson('/Model/example'),original.dataJson('/Model/example'));
    assert.equal(definitions.dataJson('/Model/default'),original.dataJson('/Model/default'));
    assert.equal(definitions.dataJson('/Flag/default'),original.dataJson('/Flag/default'));
    assert.deepEqual(input.resources.map(resource=>resource.text),originals);
    const again=await planMigration(input);assert.equal(again.identity,review.identity);
    assert.deepEqual(again.outputs,review.outputs);
});

for(const name of ['id/~雪','__proto__',''])for(const flag of ['readOnly','writeOnly'])
test(`directional required membership retains exact property ${JSON.stringify(name)} ${flag}`,async()=>{
    const input=capture('3.0.4','3.2.1','json',flag,true,name);
    const payloads=['{}',JSON.stringify({[name]:'雪'}),JSON.stringify({[name]:false}),JSON.stringify({[name]:null})];
    const before=await values(input,payloads),review=await planMigration(input);
    assert.equal(review.complete,true,JSON.stringify(review.problems));
    assert.deepEqual(await values({root:review.outputRoot,snapshot:'escaped',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))},payloads),before);
});

for(const from of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])
for(const shape of ['direct','allOf','reference'])for(const use of ['request','response','both','neutral'])
test(`${from} ${format} Swagger ${shape} ${use} owners keep required names, neighboring values and neutral definitions`,async()=>{
 const input=capture(from,'2.0',format,'readOnly',true),rootDoc=new SourceDocument(input.resources[0].text,input.root);
 const definition=new SourceDocument(input.resources[1].text,input.resources[1].id),model=definition.node('/Model').value;
 delete model.default;delete model.example;
 const field={type:'integer',minimum:7,maximum:9,readOnly:true};
 model.properties.value=shape==='direct'?field:shape==='allOf'?{allOf:[field]}:{$ref:'#/Flag'};
 model.required.push('neighbor');model.properties.neighbor={type:'string',enum:['kept']};
 input.resources[1].text=definition.set('/Model',model);
 input.resources[1].text=new SourceDocument(input.resources[1].text,input.resources[1].id).set('/Flag',field);
 let root=rootDoc.node('').value;
 if(use==='response'||use==='neutral')delete root.paths['/value'].post.requestBody;
 if(use==='request'||use==='neutral')delete root.paths['/value'].post.responses[200].content;
 // A neutral consumer keeps the original constraints/access declaration.
 root.components={schemas:{Neutral:{$ref:'models.'+format+'#/Model'}}};
 root['x-kept'].number='EXACT';
 input.resources[0].text=(format==='yaml'?YAML.stringify(root):JSON.stringify(root)).replace(/"?EXACT"?/g,'9007199254740993.000');
 const subjects=use==='both'?['request-body','response-body']:use==='neutral'?[]:[use+'-body'];
 const payloads=['{}','{"neighbor":"kept"}','{"value":7,"neighbor":"kept"}',
  '{"value":6,"neighbor":"kept"}','{"value":9,"neighbor":"kept"}','{"value":10,"neighbor":"kept"}',
  '{"value":8,"neighbor":"changed"}','{"value":8}','{"value":8,"neighbor":"kept","next":{"neighbor":"kept"}}'];
 const before=input.resources.map(resource=>resource.text),expected=subjects.length?await values(input,payloads,subjects):[];
 if(subjects.length){
  assert.equal(expected[2],true);assert.equal(expected[3],false);assert.equal(expected[4],true);
  assert.equal(expected[5],false);assert.equal(expected[6],false);assert.equal(expected[7],false);
  assert.equal(expected[1],from==='3.0.4'&&shape!=='allOf'&&subjects[0]==='request-body');
 }
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const converted={root:review.outputRoot,snapshot:'cold-owner-matrix',resources:review.outputs.map(output=>({...output,generation:0}))};
 assert.equal(analyse(converted).status,'complete');
 if(subjects.length)assert.deepEqual(await values(converted,payloads,subjects),expected);
 const {graph,docs}=createGraph(converted),neutral=terminalSchema(graph,converted.root,'/definitions/Neutral');
 const neutralValue=docs.get(neutral.resource).node(neutral.pointer).value;
 assert.deepEqual(neutralValue.required,['value','neighbor']);assert.equal(neutralValue.additionalProperties,false);
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
 const again=await planMigration({...input,resources:[...input.resources].reverse()});
 assert.equal(again.complete,true,JSON.stringify(again.problems));assert.deepEqual(again.outputs,review.outputs);
});

for(const from of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])
test(`${from} ${format} an inline request-only Swagger variant retains its original read-only annotation owner`,async()=>{
 const input=capture(from,'2.0',format,'readOnly',true),document=new SourceDocument(input.resources[0].text,input.root).node('').value;
 document.paths['/value'].post.requestBody.content['application/json'].schema={type:'object',required:['value'],
  properties:{value:{type:'integer',minimum:7,maximum:9,readOnly:true}},additionalProperties:false};
 delete document.paths['/value'].post.responses[200].content;
 document['x-kept'].number='EXACT';
 input.resources=[{id:input.root,generation:7,text:(format==='yaml'?YAML.stringify(document):JSON.stringify(document)).replace(/"?EXACT"?/g,'9007199254740993.000')}];
 const payloads=['{}','{"value":7}','{"value":6}','{"value":9}','{"value":10}','{"value":null}'];
 const expected=await values(input,payloads,['request-body']),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const converted={root:review.outputRoot,snapshot:'inline-cold',resources:review.outputs.map(output=>({...output,generation:0}))};
 assert.deepEqual(await values(converted,payloads,['request-body']),expected);
 const neutral=review.outputs.flatMap(output=>Object.values(new SourceDocument(output.text,output.id).node('').value))
  .find(value=>value?.properties?.value?.readOnly===true);
 assert(neutral,'Request specialization must retain an authored annotation even without another consumer');
 assert.deepEqual(neutral.required,['value']);assert.equal(neutral.properties.value.minimum,7);assert.equal(neutral.properties.value.maximum,9);
});

for(const from of ['3.0.4','3.1.2','3.2.1'])for(const referenced of [false,true])
test(`${from} ${referenced?'referenced':'direct'} object-valued Headers retain their actual Swagger representation limit`,async()=>{
 const input=capture(from,'2.0','json','readOnly',true),document=JSON.parse(input.resources[0].text);
 const schema=referenced?{$ref:'models.json#/Model'}:{type:'object',required:['value'],properties:{value:{type:'string',readOnly:true}}};
 document.components={headers:{Alias:{$ref:'#/components/headers/Value'},Value:{schema}}};
 document.paths['/value'].post.responses[200].headers={X:{$ref:'#/components/headers/Alias'}};
 document['x-kept'].number='EXACT';
 input.resources[0].text=JSON.stringify(document).replace('"EXACT"','9007199254740993.000');const original=input.resources.map(resource=>resource.text);
 const review=await planMigration(input);assert.equal(review.status,'blocked');assert.deepEqual(review.outputs,[]);assert.deepEqual(review.changes,[]);
 const limit=review.problems.find(problem=>problem.code==='migration.parameter.type');assert(limit,JSON.stringify(review.problems));
 assert.equal(limit.reason,'target-representation');assert.equal(limit.resource,input.root);assert.equal(limit.pointer,'/components/headers/Value');
 assert(!review.problems.some(problem=>problem.code==='migration.schema.direction'));
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
});

for(const from of ['3.1.2','3.2.1'])for(const format of ['yaml','json'])
test(`${from} ${format} fixed dynamic references and schema resource identities survive read-only Swagger specialization`,async()=>{
 const input=capture(from,'2.0',format,'readOnly',true),modelSource=input.resources[1];
 modelSource.text=new SourceDocument(modelSource.text,modelSource.id).set('/Model/properties/value',{$dynamicRef:'#/Flag'});
 modelSource.text=new SourceDocument(modelSource.text,modelSource.id).set('/Flag/$id','https://schemas.invalid/annotated-value');
 const payloads=['{}','{"value":"snow 雪"}','{"value":false}','{"value":null}',
  '{"value":"root","next":{}}','{"value":"root","next":{"value":"nested"}}'];
 const original=input.resources.map(resource=>resource.text),expected=await values(input,payloads),review=await planMigration(input);
 assert.equal(review.complete,true,JSON.stringify(review.problems));
 const converted={root:review.outputRoot,snapshot:'fixed-resource-cold',resources:review.outputs.map(output=>({...output,generation:0}))};
 assert.deepEqual(await values(converted,payloads),expected);
 const {graph}=createGraph(converted);
 assert([...graph.entryReferences()].every(reference=>reference.resolution==='resolved'));
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
});

test('an unresolved directional dependency cannot publish a partial conversion',async()=>{
    const input=capture('2.0','3.1.2','yaml','readOnly',false);
    const before=input.resources[0].text;input.resources.pop();
    const review=await planMigration(input);
    assert.equal(review.complete,false);assert.equal(review.status,'blocked');
    assert.deepEqual(review.outputs,[]);assert.deepEqual(review.changes,[]);
    assert(review.problems.some(problem=>problem.reason==='source-incomplete'));
    assert.equal(input.resources[0].text,before);
});

test('a nonstandard Swagger writeOnly field cannot acquire modern access behavior through migration',async()=>{
 const input=capture('2.0','3.1.2','json','writeOnly',true),before=input.resources.map(resource=>resource.text);
 const review=await planMigration(input);assert.equal(review.status,'blocked');assert.deepEqual(review.outputs,[]);assert.deepEqual(review.changes,[]);
 assert(review.problems.some(problem=>problem.reason==='source-incomplete'),JSON.stringify(review.problems));
 assert.deepEqual(input.resources.map(resource=>resource.text),before);
});

for(const target of ['3.0.4','3.1.2','3.2.1'])for(const format of ['yaml','json'])
test(`${format} mixed Swagger/3.0 entries preserve different read-only request policies through ${target}`,async()=>{
 const input=capture('2.0',target,format,'readOnly',true),otherRoot='file:///directions/other.'+format;
 const other=capture('3.0.4',target,format,'readOnly',true);
 input.resources.push({...other.resources[0],id:otherRoot});
 const original=input.resources.map(resource=>resource.text),payloads=['{}','{"value":"café"}','{"value":false}','{"value":null}',
  '{"value":"root","next":{}}','{"value":"root","next":{"value":"nested"}}'];
 const expected=[await values(input,payloads),await values({...input,root:otherRoot},payloads)];
 assert.equal(expected[0][0],false);assert.equal(expected[0][1],false);
 assert.equal(expected[1][0],true);assert.equal(expected[1][1],true);
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const converted={root:review.outputRoot,snapshot:'mixed-legacy-cold',resources:review.outputs.map(output=>({...output,generation:0}))};
 for(const [index,root]of [input.root,otherRoot].entries()){
  const entry=review.changes.find(change=>change.resource===root).destination;
  assert.deepEqual(await values({...converted,root:entry},payloads),expected[index]);
 }
 assert.deepEqual(input.resources.map(resource=>resource.text),original);
});

function terminalSchema(graph,resource,pointer){
    const seen=new Set();
    while(true){
        const id=resource+'#'+pointer;assert(!seen.has(id));seen.add(id);
        const reference=graph.referenceAs(resource,pointer,'$ref','schema');
        if(!reference)return graph.scopeAs(resource,pointer,'schema');
        assert.equal(reference.resolution,'resolved');resource=reference.targetResource;pointer=reference.targetPointer;
    }
}

for(const format of ['yaml','json'])for(const target of ['3.1.2','3.2.1'])for(const composed of [false,true])
test(`${format} directional ${composed?'allOf':'oneOf'} discriminator bindings survive migration to ${target}`,async()=>{
    const root='file:///discriminator-direction/api.'+format;
    const fields={kind:{type:'string'},value:{type:'string',readOnly:true}};
    const schemas=composed?{
        Base:{type:'object',required:['kind','value'],properties:fields,discriminator:{propertyName:'kind'}},
        Cat:{allOf:[{$ref:'#/components/schemas/Base'},{properties:{kind:{enum:['Cat']}}}]},
    }:{
        Base:{type:'object',required:['kind'],discriminator:{propertyName:'kind',mapping:{'café/雪':'Cat'}},
            oneOf:[{$ref:'#/components/schemas/Cat'},{$ref:'#/components/schemas/Dog'}]},
        Cat:{type:'object',required:['kind','value'],properties:{...fields,kind:{enum:['Cat','café/雪']}}},
        Dog:{type:'object',required:['kind','value'],properties:{...fields,kind:{enum:['Dog']}}},
    };
    const binding={$ref:'#/components/schemas/Base'},document={openapi:'3.0.4',info:{title:'Models',version:'1'},
        paths:{'/value':{post:{requestBody:{content:{'application/json':{schema:binding}}},
            responses:{200:{description:'Response',content:{'application/json':{schema:binding}}}}}}},components:{schemas}};
    const text=format==='yaml'?YAML.stringify(document):JSON.stringify(document);
    const input={root,snapshot:'discriminator:'+target+format+composed,resources:[{id:root,text,generation:1}],
        targetVersion:target,destination:'file:///reviewed/discriminator-directions/'};
    const payloads=['{}','{"kind":"Cat"}','{"kind":"Dog","value":"café"}','{"kind":"café/雪"}',
        '{"kind":"unknown"}','{"kind":"Cat","value":false}','{"kind":"Cat","value":null}'];
    const before=await values(input,payloads),review=await planMigration(input);
    assert.equal(review.complete,true,JSON.stringify(review.problems));
    const converted={root:review.outputRoot,snapshot:'discriminator-cold',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
    assert.deepEqual(await values(converted,payloads),before);
    const {graph,docs}=createGraph(converted),entry=docs.get(converted.root);
    assert.deepEqual([...entry.node('/components/schemas').children.keys()],Object.keys(schemas),
        'Directional variants must not add implicit component model names');
    for(const direction of ['request','response']){
        const pointer=direction==='request'?'/paths/~1value/post/requestBody/content/application~1json/schema':
            '/paths/~1value/post/responses/200/content/application~1json/schema';
        const selected=terminalSchema(graph,converted.root,pointer);
        const mapping=docs.get(selected.resource).node(selected.pointer+'/discriminator/mapping').value;
        const expected=composed?['Base','Cat']:['Cat','Dog','café/雪'];
        assert.deepEqual(Object.keys(mapping).sort(),expected.sort());
        for(const name of expected){
            const connection=graph.references.find(reference=>reference.connection==='discriminator'&&reference.resource===selected.resource&&
                reference.pointer===selected.pointer+'/discriminator/mapping'&&reference.keyword===name);
            assert.equal(connection?.resolution,'resolved');
            assert.notEqual(connection.targetResource,converted.root,'The hint must select the same directional resource as its composition');
        }
    }
    assert.equal(input.resources[0].text,text);
});

for(const format of ['yaml','json'])for(const target of ['3.0.4','3.1.2','3.2.1'])
test(`${format} Swagger discriminator dispatch and request exclusions compose through ${target}`,async()=>{
    const root='file:///swagger-direction/api.'+format,binding={$ref:'#/definitions/Base'};
    const document={swagger:'2.0',info:{title:'Swagger model directions',version:'1'},host:'api.invalid',schemes:['https'],
        consumes:['application/json'],produces:['application/json'],paths:{'/value':{post:{parameters:[{name:'body',in:'body',schema:binding}],
            responses:{200:{description:'Response',schema:binding}}}}},definitions:{
            Base:{type:'object',discriminator:'kind',required:['kind'],properties:{kind:{type:'string'},value:{type:'string',readOnly:true}}},
            Cat:{allOf:[{$ref:'#/definitions/Base'},{type:'object',required:['cats'],properties:{cats:{type:'boolean'}}}]},
        }};
    const text=format==='yaml'?YAML.stringify(document):JSON.stringify(document);
    const input={root,snapshot:'swagger-discriminator:'+format+target,resources:[{id:root,text,generation:1}],
        targetVersion:target,destination:'file:///reviewed/swagger-directions/'};
    const payloads=['{}','{"kind":"Base"}','{"kind":"Base","value":"café"}','{"kind":"Cat","cats":true}',
        '{"kind":"Cat"}','{"kind":"unknown"}','{"kind":"Cat","cats":true,"value":null}','false','0','""'];
    const before=await values(input,payloads),review=await planMigration(input);
    assert.equal(review.complete,true,JSON.stringify(review.problems));
    assert.deepEqual(await values({root:review.outputRoot,snapshot:'swagger-discriminator-cold',
        resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))},payloads),before);
    assert.equal(input.resources[0].text,text);
});

test('a newly optional 3.2 discriminating property requires an explicit fallback decision',async()=>{
    const input=capture('3.0.4','3.2.1','json','readOnly',true);
    const root=JSON.parse(input.resources[0].text),models=JSON.parse(input.resources[1].text);
    delete models.Model.example;delete models.Model.default;
    models.Model.discriminator={propertyName:'value'};
    models.Child={allOf:[{$ref:'#/Model'}]};
    root.components={schemas:{Model:{$ref:'models.json#/Model'},Child:{$ref:'models.json#/Child'}}};
    input.resources[0].text=JSON.stringify(root);input.resources[1].text=JSON.stringify(models);
    const review=await planMigration(input);
    assert.equal(review.status,'requires-decision',JSON.stringify(review.problems));assert.deepEqual(review.outputs,[]);
    assert(review.problems.every(problem=>problem.code==='migration.discriminator.default'));
    const decided=await planMigration({...input,decisions:Object.fromEntries(review.problems.map(problem=>[problem.id,problem.choiceDetails.find(choice=>choice.label==='Child').value]))});
    assert.equal(decided.complete,true,JSON.stringify(decided.problems));
    const payloads=['{}','{"value":"café"}','{"value":false}'];
    assert.deepEqual(await values({root:decided.outputRoot,snapshot:'decided-cold',
        resources:decided.outputs.map(output=>({id:output.id,text:output.text,generation:0}))},payloads),await values(input,payloads));
});

for(const format of ['yaml','json'])for(const target of ['3.1.2','3.2.1'])
test(`${format} nested inline schema targets survive directional replacement in ${target}`,async()=>{
    const root='file:///nested-directions/api.'+format;
    const textTarget='#/paths/~1value/post/requestBody/content/application~1json/schema/properties/text';
    const document={openapi:'3.0.4',info:{title:'Nested targets',version:'1'},paths:{'/value':{post:{
        requestBody:{content:{'application/json':{schema:{type:'object',required:['value'],properties:{
            value:{type:'string',readOnly:true},text:{type:'string'},other:{$ref:textTarget},
        }}}}},responses:{200:{description:'Text',content:{'application/json':{schema:{$ref:textTarget}}}}},
    }}},components:{schemas:{Alias:{$ref:textTarget}}}};
    const text=format==='yaml'?YAML.stringify(document):JSON.stringify(document);
    const input={root,snapshot:'nested:'+format+target,targetVersion:target,destination:'file:///reviewed/nested-directions/',
        resources:[{id:root,text,generation:1}]};
    const payloads=['{}','{"text":"café","other":"雪"}','{"text":false}','{"other":0}',
        '{"value":"v","text":"t"}','"café"','false','null'];
    const before=await values(input,payloads),review=await planMigration(input);
    assert.equal(review.complete,true,JSON.stringify(review.problems));
    const converted={root:review.outputRoot,snapshot:'nested-cold',resources:review.outputs.map(output=>({id:output.id,text:output.text,generation:0}))};
    assert.equal(analyse(converted).status,'complete');
    assert.deepEqual(await values(converted,payloads),before);
    const {graph,docs}=createGraph(converted),alias=terminalSchema(graph,converted.root,'/components/schemas/Alias');
    assert.equal(docs.get(alias.resource).node(alias.pointer+'/type').value,'string');
    assert.equal(input.resources[0].text,text);
});

function headerBinding(input,pointer){
    const {graph,docs}=createGraph(input),seen=new Set();let resource=input.root;
    while(true){
        const identity=resource+'#'+pointer;assert(!seen.has(identity));seen.add(identity);
        const value=docs.get(resource).dataNode(pointer).value;
        if(typeof value.$ref!=='string')return {resource,pointer:pointer+'/schema'};
        const edge=graph.referenceAs(resource,pointer,'$ref','header');
        assert.equal(edge?.resolution,'resolved');resource=edge.targetResource;pointer=edge.targetPointer;
    }
}

for(const format of ['yaml','json'])for(const flag of ['readOnly','writeOnly'])
test(`${format} shared Header alias retains separate encoding and response schema directions for ${flag}`,async()=>{
    const root='file:///header-direction/api.'+format;
    const shared={$ref:'#/components/headers/Alias'};
    const document={openapi:'3.0.4',info:{title:'Shared Header',version:'business'},paths:{'/value':{post:{
        requestBody:{content:{'multipart/form-data':{schema:{type:'object',properties:{part:{type:'string'}}},
            encoding:{part:{headers:{'X-Value':shared}}}}}},
        responses:{200:{description:'Reply',headers:{'X-Value':shared}}},
    }}},components:{
        headers:{Alias:{$ref:'#/components/headers/Shared'},Shared:{description:'Owned header',schema:{$ref:'#/components/schemas/Model'}}},
        schemas:{Model:{type:'object',required:['value'],properties:{value:{type:'string',[flag]:true}}}},
    }};
    const text=format==='yaml'?'# Keep Header ownership\r\n'+YAML.stringify(document).replaceAll('\n','\r\n'):JSON.stringify(document)+'\r\n';
    const input={root,snapshot:'headers:'+format+flag,resources:[{id:root,generation:3,text}],targetVersion:'3.1.2',destination:'file:///reviewed/headers/'};
    const request='/paths/~1value/post/requestBody/content/multipart~1form-data/encoding/part/headers/X-Value';
    const response='/paths/~1value/post/responses/200/headers/X-Value';
    async function evaluations(capture){
        const runtimeInstances=[['request-body',request],['response-body',response]].flatMap(([subject,pointer])=>
            ['{}','{"value":"snow 雪"}','{"value":false}','{"value":null}'].map(text=>({subject,text,location:'application/json',schema:headerBinding(capture,pointer)})));
        const checked=await evaluateSchemas({...capture,runtimeInstances});
        assert.equal(checked.complete,true,JSON.stringify(checked.findings));
        return checked.runtimeEvaluations.map(result=>result.valid);
    }
    const before=await evaluations(input),review=await planMigration(input);
    assert.equal(review.complete,true,JSON.stringify(review.problems));
    const converted={root:review.outputRoot,snapshot:'headers-cold',resources:review.outputs.map(output=>({id:output.id,generation:0,text:output.text}))};
    assert.deepEqual(await evaluations(converted),before);
    const doc=new SourceDocument(converted.resources.find(resource=>resource.id===converted.root).text,converted.root);
    assert.notEqual(doc.node(request+'/$ref').value,doc.node(response+'/$ref').value);
    assert(Object.keys(doc.node('/components/headers').value).some(name=>name.startsWith('_migrated_header_request_')));
    assert(Object.keys(doc.node('/components/headers').value).some(name=>name.startsWith('_migrated_header_response_')));
    assert.equal(input.resources[0].text,text);
});

for(const modern of ['3.1.2','3.2.1'])for(const target of ['3.0.4','3.1.2','3.2.1'])
for(const format of ['yaml','json'])for(const flag of ['readOnly','writeOnly'])
test(`${format} mixed 3.0/${modern} Header and literal resource ownership stays independent through ${target} for ${flag}`,async()=>{
 const root='file:///mixed-directions/a.'+format,other='file:///mixed-directions/b.'+format,data='file:///mixed-directions/data.'+format;
 const schema={$ref:'data.'+format+'#/Example/value/Payload'},header={$ref:'data.'+format+'#/Example/value/Alias'};
 const api=version=>({openapi:version,info:{title:'Mixed '+version,version:'1'},paths:{'/value':{post:{
  requestBody:{content:{'application/json':{schema},'multipart/form-data':{
   schema:{type:'object',properties:{part:{type:'string'}}},encoding:{part:{headers:{X:header}}}}}},
  responses:{200:{description:'Value',headers:{X:header},content:{'application/json':{schema}}}},
 }}},components:{examples:{History:{$ref:'data.'+format+'#/Example'}},schemas:{Neutral:schema}}});
 const content={Example:{value:{
  Alias:{$ref:'#/Example/value/Header'},Header:{description:'Keep Header',schema:{$ref:'#/Example/value/Payload'}},
  Payload:{type:'object',required:['value'],properties:{value:{type:'integer',minimum:7,maximum:9,[flag]:true},
   next:{$ref:'#/Example/value/Payload'}},additionalProperties:false},number:'EXACT',literal:{$ref:'unrelated.json#/never-fetch'},
 }}};
 const render=value=>(format==='yaml'?'# keep shared literal aliases\r\n'+YAML.stringify(value).replaceAll('\n','\r\n'):JSON.stringify(value))
  .replace(/"?EXACT"?/g,'9007199254740993.000');
 const resources=[{id:root,text:render(api('3.0.4')),generation:2},{id:other,text:render(api(modern)),generation:3},
  {id:data,text:render(content),generation:4}];
 const originals=resources.map(resource=>resource.text),input={root,snapshot:'mixed-directions',resources,targetVersion:target,destination:'file:///mixed-direction-output/'};
 const payloads=['{}','{"value":7}','{"value":6}','{"value":9}','{"value":10}','{"value":null}','{"value":8,"next":{}}'];
 const request='/paths/~1value/post/requestBody/content/multipart~1form-data/encoding/part/headers/X';
 const response='/paths/~1value/post/responses/200/headers/X';
 async function outcomes(packet){
  const body=await values(packet,payloads),runtimeInstances=[['request-body',request],['response-body',response]].flatMap(([subject,pointer])=>
   payloads.map(text=>({subject,text,location:'X',schema:headerBinding(packet,pointer)})));
  const checked=await evaluateSchemas({...packet,runtimeInstances});assert.equal(checked.complete,true,JSON.stringify(checked.findings));
  assert(checked.runtimeEvaluations.every(value=>value.complete),JSON.stringify(checked.runtimeFindings));
  return [...body,...checked.runtimeEvaluations.map(value=>value.valid)];
 }
 const expected=[await outcomes(input),await outcomes({...input,root:other})];
 assert.notDeepEqual(expected[0],expected[1],'The source entries must actually interpret the shared required annotation differently');
 const review=await planMigration(input);assert.equal(review.complete,true,JSON.stringify(review.problems));
 const converted={root:review.outputRoot,snapshot:'mixed-cold',resources:review.outputs.map(output=>({...output,generation:0}))};
 for(const [index,original]of [root,other].entries()){
  const entry=review.changes.find(change=>change.resource===original).destination;
  assert.equal(analyse({...converted,root:entry}).status,'complete');
  assert.deepEqual(await outcomes({...converted,root:entry}),expected[index]);
 }
 const literal=review.changes.find(change=>change.resource===data);
 assert.equal(review.outputs.find(output=>output.id===literal.destination).text,originals[2]);
 assert.deepEqual(resources.map(resource=>resource.text),originals);
 const reversed=await planMigration({...input,resources:[...resources].reverse()});
 assert.equal(reversed.complete,true,JSON.stringify(reversed.problems));assert.deepEqual(reversed.outputs,review.outputs);
});
