import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

class _XmlMigrationEngine extends EngineProcess {
  _XmlMigrationEngine():super(executable:runtimeNode,helper:runtimeHelper);
  String? oldProducer;
  @override
  Future<Map<String,dynamic>> request(String method,Map<String,Object?> params,{String? requestId}) async {
    final result=await super.request(method,params,requestId:requestId);
    return method=='planMigration'&&oldProducer!=null?{...result,'producerVersion':oldProducer}:result;
  }
}

void main() {
  for(final format in ['json','yaml'])for(final target in ['3.1.2','3.0.4','2.0']) {
    test('$format inferred XML arrays retain native HTTP and independent CLI behavior after explicit migration to $target',() async {
      final temp=await Directory.systemTemp.createTemp('busyapi-xml-applicability-');
      addTearDown(() => temp.delete(recursive:true));
      final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
      addTearDown(() => server.close(force:true));
      final seen=<List<int>>[];
      server.listen((request) async {
        seen.add(await request.fold<List<int>>([],(all,part)=>all..addAll(part)));
        request.response.statusCode=204;await request.response.close();
      });
      final source=File('${temp.path}/api.$format');
      final text='${format=='yaml'?'# Keep XML source 雪\r\n':''}${jsonEncode({
        'openapi':'3.2.1','info':{'title':'XML applicability','version':'business'},
        'servers':[{'url':'http://127.0.0.1:${server.port}'}],
        'paths':{'/p':{'post':{'requestBody':{'content':{'application/xml':{'schema':{r'$ref':'#/components/schemas/Values'}}}},
          'responses':{'204':{'description':'Empty'}}}}},
        'components':{'schemas':{
          'Base':{'type':'array','items':{'type':'string','xml':{'name':'value'}}},
          'Values':{r'$ref':'#/components/schemas/Base','xml':{'nodeType':'element','name':'values'}},
        }},
        'x-kept':{r'$ref':'literal','n':'EXACT'},
      }).replaceAll('"EXACT"','9007199254740993.00')}\r\n';
      await source.writeAsString('\ufeff$text');
      final engine=_XmlMigrationEngine();addTearDown(engine.close);
      final project=await BusyProject.open(source.path,engine);addTearDown(project.close);
      final root=source.uri.toString();
      Future<void> send(BusyProject owner) async {
        final id=owner.roots.single.id;
        final plan=await owner.prepareRequest(id,resource:id,pointer:'/paths/~1p/post');
        try {
          final result=await const ContractRequestExecutor().execute(plan,OperationRequestDraft(planIdentity:plan.identity,
            body:RequestBodyDraft.modeled(mediaType:'application/xml',json:'["A","雪"]')),resolveSecret:(_) async=>null);
          try {expect(result.conforming,true,reason:'${result.outgoing.findings}');} finally {await result.close();}
        } finally {plan.close();}
      }
      await send(project);final before=await source.readAsBytes();
      for(final obsolete in ['104','105']) {
        engine.oldProducer=obsolete;
        await expectLater(project.prepareMigration(root,'${temp.path}/obsolete-$obsolete',targetVersion:target),
          throwsA(isA<CoreFailure>().having((error)=>error.code,'code','migration.protocol')));
        expect(Directory('${temp.path}/obsolete-$obsolete').existsSync(),false);
      }
      engine.oldProducer=null;
      final review=await project.prepareMigration(root,'${temp.path}/converted',targetVersion:target);
      addTearDown(review.close);expect(review.publishable,true,reason:'${review.result}');
      expect(review.result['producerVersion'],'106');expect(await source.readAsBytes(),before);
      await review.publish();expect(await source.readAsBytes(),before);
      final moved=await Directory(review.destination).rename('${temp.path}/moved 雪');
      final cold=await BusyProject.open(moved.path,engine);addTearDown(cold.close);
      expect((await cold.check(cold.roots.single.id))['status'],'complete');await send(cold);
      expect(seen[1],seen[0]);
      final plan=await cold.prepareRequest(cold.roots.single.id,resource:cold.roots.single.id,pointer:'/paths/~1p/post');
      addTearDown(plan.close);
      final draft=OperationRequestDraft(planIdentity:plan.identity,body:RequestBodyDraft.modeled(mediaType:'application/xml',json:'["A","雪"]'));
      final changes=await cold.applyRefactoring(await plan.planCase('XML values',draft));
      for(final id in changes)await cold.save(cold.store.get(id));
      final cli=await Process.run('$testBundle/busyapi',['test',moved.path,'--case','XML values','--json'],
        environment:const {'PATH':'','LANG':'C.UTF-8'},includeParentEnvironment:false);
      expect(cli.exitCode,0,reason:'${cli.stdout} ${cli.stderr}');expect(seen,hasLength(3));expect(seen[2],seen[0]);
      expect(await source.readAsBytes(),before);
    });
  }
}
