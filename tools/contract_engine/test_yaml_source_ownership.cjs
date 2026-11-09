const {test}=require('node:test');
const assert=require('node:assert/strict');
const YAML=require('yaml');
const {SourceDocument}=require('./dist/document.cjs');
test('production contract extraction retains the literal anchor and aliases while independently owning the copied contract',()=>{
 const {planExtract}=require('./dist/refactoring_copy.cjs'),{createGraph}=require('./dist/model.cjs'),root='file:///tokens/api.yaml',pointer='/components/schemas/Holder/default';
 const text='openapi: 3.2.1\ninfo: {title: Separate, version: "1"}\npaths: {}\n'+
  'x-data: &data {type: integer, minimum: 9007199254740993.00, description: "[Guide](guide.md)", x-bytes: "AAECA/7/AA=="}\n'+
  'x-history: *data # Keep source binding\ncomponents:\n  schemas:\n    Holder: {default: *data}\n    Use: {$ref: "#/components/schemas/Holder/default"}\n';
 const before=new SourceDocument(text,root),resources=[{id:root,text,generation:4}],plan=planExtract({snapshot:'literal-alias',resources,contexts:[{root,resources:[root]}],target:{root,resource:root,generation:4,pointer,range:before.node(pointer).range,expected:'*data'},name:'Independent'});
 let output=text;for(const edit of [...plan.edits].reverse()){assert.equal(output.slice(edit.start,edit.end),edit.expected);output=output.slice(0,edit.start)+edit.replacement+output.slice(edit.end);}
 const after=new SourceDocument(output,root);
 for(const at of ['/x-data','/x-history',pointer])assert.equal(after.dataJson(at),before.dataJson(at));
 assert(output.includes('x-data: &data'));assert(output.includes('x-history: *data # Keep source binding'));assert(output.includes('Holder: {default: *data}'));
 assert.equal(after.dataJson('/components/schemas/Independent/minimum'),'9007199254740993.00');assert.equal(after.node('/components/schemas/Independent').shared,false);
 assert.equal(createGraph({root,resources:[{...resources[0],text:output}]}).graph.referenceAs(root,'/components/schemas/Use','$ref','schema').targetPointer,'/components/schemas/Independent');
});
test('production file repair distinguishes reused scalar anchors and leaves literal/code tokens intact',()=>{
 const {planFileMove}=require('./dist/refactoring_file.cjs'),root='file:///tokens/source/api.yaml';
 const text='openapi: 3.2.1\ninfo: {title: Tokens, version: "1", description: &docs "[Guide](guide.md) `[Guide](guide.md)`"}\n'+
  'x-first: *docs\nx-reused: &docs "[Second](second.md)"\nx-second: *docs\npaths: {}\n# *docs [Guide](guide.md)\n';
 const input={snapshot:'reused-tokens',resources:[{id:root,text,generation:1}],contexts:[{root,resources:[root]}],target:{resource:root,generation:1},destinationResource:'file:///tokens/target/api.yaml'};
 const plan=planFileMove(input);let output=text;
 for(const edit of [...plan.edits].sort((a,b)=>b.start-a.start)){assert.equal(output.slice(edit.start,edit.end),edit.expected);output=output.slice(0,edit.start)+edit.replacement+output.slice(edit.end);}
 const before=new SourceDocument(text,root),after=new SourceDocument(output,input.destinationResource);
 for(const pointer of ['/x-first','/x-reused','/x-second'])assert.equal(after.dataNode(pointer).value,before.dataNode(pointer).value);
 assert.equal(after.dataNode('/info/description').value,'[Guide](<file:///tokens/source/guide.md>) `[Guide](guide.md)`');
 assert(output.includes('x-second: *docs'));assert(output.includes('# *docs [Guide](guide.md)'));assert.equal(input.resources[0].text,text);
});

const fixtures=[
 '&root\n# literal &decoy stays a comment\nvalue: 9007199254740993.00\n',
 'value: &same {type: string}\ncopy: *same\n',
 'value: &same\n  type: string\ncopy: *same\n',
 'items: [ &same {type: string}, *same ]\n',
 'items:\n  - &same\n    type: string\n  - *same\n',
 'mapping: {&key literal: &value 0}\nkey-copy: *key\nvalue-copy: *value\n',
 'value: &same |- # retained block comment\n  café 雪\n  &literal\ncopy: *same\n',
 'value: &same\ncopy: *same\n',
 'first: &same "first"\nfirst-copy: *same\nsecond: &same "second"\nsecond-copy: *same\n',
 'value: !!str &same 12\ncopy: *same\n',
];
for(const [index,text]of fixtures.entries())test(`captured YAML property tokens retain pinned parser behavior ${index}`,()=>{
 const doc=new SourceDocument(text,'file:///source-tokens/model.yaml');
 const expected=YAML.parseDocument(text,{version:'1.2',schema:'core',keepSourceTokens:true,uniqueKeys:true,stringKeys:true,strict:true,prettyErrors:false});
 assert.deepEqual(doc.root.value,expected.toJS({maxAliasCount:64}));
 assert(doc.sourceAnchors().length>0);
 for(const anchor of doc.sourceAnchors()){
  assert(anchor.range,'Every fixture anchor needs an actual property token');
  assert.equal(text.slice(...anchor.range),'&'+anchor.name);
 }
 if(index===8){assert.equal(doc.dataNode('/first-copy').value,'first');assert.equal(doc.dataNode('/second-copy').value,'second');}
 if(index===0)assert.equal(doc.dataJson('/value'),'9007199254740993.00');
 const shared=[...doc.nodes.values()].find(node=>node.shared&&node.pointer!=='');
 assert.throws(()=>doc.set(shared?.pointer??'',null),error=>error.code==='edit.shared');
 assert.equal(doc.text,text);
});
for(const [text,code]of [
 ['value: &same 1\n---\nother: 2\n','yaml.MULTIPLE_DOCS'],
 ['value: 1\nvalue: 2\n','yaml.DUPLICATE_KEY'],
 ['value: *missing\n','yaml.alias'],
 ['value: &cycle {next: *cycle}\n','yaml.alias.cycle'],
])test(`captured YAML still rejects ${code}`,()=>{
 assert.throws(()=>new SourceDocument(text,'file:///source-tokens/invalid.yaml'),error=>
  error.code===code||code==='yaml.alias.cycle'&&['yaml.alias','yaml.value'].includes(error.code));
});
