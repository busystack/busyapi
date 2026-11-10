import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for(final format in ['yaml','json'])for(final target in ['3.1.2','3.0.4'])for(final kind in ['xml-object','xml-string','linkset','linkset-json','json-lines','json-lines-empty','json-sequence','sse']) {
    test('$format $kind examples preserve native HTTP, cold cases and CLI through migration to $target',() async {
      final directory=await Directory.systemTemp.createTemp('busyapi-media-example-migration-');
      addTearDown(()=>directory.delete(recursive:true));
      final engine=EngineProcess(executable:runtimeNode,helper:runtimeHelper);addTearDown(engine.close);
      final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
      final seen=<List<int>>[];
      server.listen((request) async {
        seen.add(await request.fold<List<int>>([],(all,part)=>all..addAll(part)));
        request.response.statusCode=204;await request.response.close();
      });
      final xml=kind.startsWith('xml'),scalar=kind=='xml-string';
      final sequence=kind.startsWith('json-lines')||kind=='json-sequence'||kind=='sse';
      final media=xml?'application/xml':kind=='linkset'?'application/linkset':kind=='linkset-json'?'application/linkset+json':
        kind.startsWith('json-lines')?'application/jsonl':kind=='json-sequence'?'application/json-seq':'text/event-stream';
      final sample=xml?scalar?'雪 & value':{'n':'EXACT','label':'雪'}:sequence?kind=='json-lines-empty'?[]:kind=='sse'?[{'data':'雪','event':'update','id':'1','retry':1000}]:['EXACT',2]:{'linkset':[{'anchor':'https://example.org/context','next':[{'href':'https://example.org/a,b','title*':[{'value':'雪','language':'ja'}]}]}]};
      final schema=xml?{'type':scalar?'string':'object','xml':{'name':'payload','nodeType':'element'},
        if(!scalar)'required':['n','label'],if(!scalar)'properties':{'n':{'type':'integer'},'label':{'type':'string'}}}:{'type':sequence?'array':'object'};
      final file=File('${directory.path}/api.$format');
      final value={
        'openapi':'3.2.1','info':{'title':'Modeled examples','version':'business'},
        'servers':[{'url':'http://127.0.0.1:${server.port}'}],
        'paths':{'/p':{'post':{'requestBody':{'content':{media:{r'$ref':'#/components/mediaTypes/Payload'}}},'responses':{'204':{'description':'Empty'}}}}},
        'components':{'mediaTypes':{'Payload':{'schema':schema,
          if(sequence)'itemSchema':kind=='sse'?{'type':'object','required':['data'],'properties':{'data':{'type':'string'}}}:{'type':'integer','minimum':1},
          'examples':{'Choice':{r'$ref':'#/components/examples/Choice'}}}},
          'examples':{'Choice':{'dataValue':sample}}},
        'x-literal':{r'$ref':'literal-only','dataValue':sample},
      };
      String render()=> '${format=='yaml'?'# Retain model source 雪\r\n':''}${jsonEncode(value).replaceAll('"EXACT"','9007199254740993.00')}\r\n';
      await file.writeAsString('\ufeff${render()}');
      final source=await BusyProject.open(file.path,engine);addTearDown(source.close);
      final root=file.uri.toString();
      Future<RequestBodyDraft> choice(OperationRequestPlan plan) async {
        final content=((plan.result['requestBody'] as Map)['content'] as List).cast<Map>().single;
        final example=(content['examples'] as List).cast<Map>().firstWhere((example)=>example['name']=='Choice');
        if(example['external'] is Map)return RequestBodyDraft.example(plan.captureBodyExample(media,name:'Choice'));
        return example['representation']=='json'?RequestBodyDraft.modeled(mediaType:media,json:example['raw'] as String):
          RequestBodyDraft.raw(mediaType:media,text:example['raw'] as String);
      }
      Future<void> send(OperationRequestPlan plan,RequestBodyDraft body) async {
        final result=await const ContractRequestExecutor().execute(plan,OperationRequestDraft(planIdentity:plan.identity,body:body),resolveSecret:(_) async=>null);
        try{expect(result.conforming,true,reason:'${result.outgoing.findings}');}finally{await result.close();}
      }
      final original=await source.prepareRequest(root,resource:root,pointer:'/paths/~1p/post');
      await send(original,await choice(original));original.close();
      // Pair the data with the exact approved entity already sent through the
      // original schema. Migration must preserve both choices with one older
      // external Example and retain the original data as literal history.
      await File('${directory.path}/payload.bin').writeAsBytes(seen.single);
      final examples=(value['components'] as Map)['examples'] as Map;
      (examples['Choice'] as Map)['externalValue']='payload.bin';
      source.store.replace(root,render());await source.save(source.store.get(root));
      final before=await file.readAsBytes();
      final review=await source.prepareMigration(root,'${directory.path}/converted',targetVersion:target);
      addTearDown(review.close);expect(review.publishable,true,reason:'${review.result}');expect(review.result['producerVersion'],'107');
      expect(review.exampleCopies.single.bytes,seen.single);expect(await file.readAsBytes(),before);
      await review.publish();expect(await file.readAsBytes(),before);
      source.close();
      final moved=await Directory(review.destination).rename('${directory.path}/moved 雪');
      await File('${directory.path}/payload.bin').delete();
      final cold=await BusyProject.open(moved.path,engine);addTearDown(cold.close);
      final id=cold.roots.single.id;expect((await cold.check(id))['status'],'complete');
      final plan=await cold.prepareRequest(id,resource:id,pointer:'/paths/~1p/post');addTearDown(plan.close);
      final body=await choice(plan);await send(plan,body);expect(seen[1],seen[0]);
      final draft=OperationRequestDraft(planIdentity:plan.identity,body:body);
      final changes=await cold.applyRefactoring(await plan.planCase('Migrated model',draft));
      for(final changed in changes)await cold.save(cold.store.get(changed));
      final replay=await cold.prepareRequest(id,resource:id,pointer:'/paths/~1p/post');addTearDown(replay.close);
      await send(replay,(await ContractTestRunner.reopenCase(replay,'Migrated model',cold.access)).body);
      final cli=await Process.run('$testBundle/busyapi',['test',moved.path,'--case','Migrated model','--json'],
        environment:const {'PATH':'','LANG':'C.UTF-8'},includeParentEnvironment:false);
      expect(cli.exitCode,0,reason:'${cli.stdout} ${cli.stderr}');expect(seen,hasLength(4));
      for(final bytes in seen)expect(bytes,seen.first);
      expect(await file.readAsBytes(),before);
    });
  }
}
