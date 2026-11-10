import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['3.1.2','3.2.0','3.2.1'])for(final format in ['json','yaml'])for(final reference in [false,true]) {
    test('$version $format ${reference?'reference-use':'whole-object'} extraction retains HTTP proof, transactions, cold reopening and CLI', () async {
      final temp=await Directory.systemTemp.createTemp('busyapi-shared-role-refactor-');
      addTearDown(() => temp.delete(recursive:true));
      final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
      addTearDown(() => server.close(force:true));
      var exchanges=0;
      server.listen((request) async {
        exchanges++;request.response.statusCode=204;
        request.response.headers.set('x-value','9007199254740993');await request.response.close();
      });
      const pointer='/components/schemas/Owner/properties/Shared',destination='/components/headers/Extracted';
      final selected=reference?'/paths/~1value/get/responses/204/headers/X-Value':pointer;
      final value={'openapi':version,'info':{'title':'Shared roles','version':'1'},
        'servers':[{'url':'http://127.0.0.1:${server.port}'}],
        'paths':{'/value':{'get':{'responses':{'204':{'description':'Header',
          'headers':{'X-Value':{r'$ref':'#$pointer'}}}}}}},
        'components':{'schemas':{'Owner':{if(reference)r'$id':'https://schemas.invalid/owner','properties':{'Shared':{
          'description':'[Guide](guide.md)','schema':{'type':'integer','minimum':'EXACT'},'example':'EXACT',
        }}},'Use':{r'$ref':'#$pointer'}},'headers':{'Use':{r'$ref':'#$pointer'}}},
        'x-kept':{r'$ref':'literal','n':'EXACT'},
      };
      final text='${format=='yaml'?'# Keep shared source 雪\r\n':''}${jsonEncode(value).replaceAll('"EXACT"','9007199254740993.00')}\r\n';
      final source=File('${temp.path}/api.$format');await source.writeAsString('\ufeff$text');
      await File('${temp.path}/busyapi.yaml').writeAsString(jsonEncode({'version':1,
        'roots':[{'name':'main','path':'api.$format'}],
        'tests':[{'name':'Header proof','operation':{'path':'/value','method':'GET'},'expect':{'status':204}}],
      }));
      final engine=EngineProcess(executable:runtimeNode,helper:runtimeHelper);addTearDown(engine.close);
      var project=await BusyProject.open(temp.path,engine);addTearDown(() => project.close());
      final root=source.uri.toString(),buffer=await project.buffer(root),before=buffer.bytes();
      Future<void> exchange() async {
        final plan=await project.prepareRequest(root,resource:root,pointer:'/paths/~1value/get');
        try {
          final result=await const ContractRequestExecutor().execute(plan,
            OperationRequestDraft(planIdentity:plan.identity),resolveSecret:(_) async=>null);
          try {expect(result.conforming,true,reason:'${result.received.findings}');} finally {await result.close();}
        } finally {plan.close();}
      }
      await exchange();
      final review=await project.planComponentExtraction({'root':root,'resource':root,'pointer':selected,
        'generation':buffer.generation,'kind':'header'},'Extracted');
      await expectLater(project.applyRefactoring(review,current:()=>false),throwsA(isA<CoreFailure>()));
      expect(buffer.bytes(),before);await project.applyRefactoring(review);
      final accepted=buffer.bytes();
      for(final kind in ['schema','header']) {
        final use=kind=='schema'?'/components/schemas/Use':'/components/headers/Use';
        final page=await project.referencePage(root,root,use,contextKind:kind);
        expect((page['references'] as List).single['target']['pointer'],reference?pointer:destination);
        if(!reference||kind=='header')expect((await project.referencePage(root,root,destination,contextKind:kind))['kind'],kind);
      }
      if(reference) {
        expect((await project.referencePage(root,root,selected,contextKind:'header'))['references'][0]['target']['pointer'],destination);
        expect(buffer.text,contains('https://schemas.invalid/owner'));
        expect((review.result['sourceOwnership'] as List).any((owner)=>owner['effect']=='separated-contract-use'),true);
      }
      await exchange();expect(buffer.text,contains('9007199254740993.00'));
      project.store.undo();expect(buffer.bytes(),before);project.store.redo();expect(buffer.bytes(),accepted);
      await expectLater(project.applyRefactoring(review),throwsA(isA<CoreFailure>().having((error)=>error.code,'code','refactor.stale')));
      await project.save(buffer);project.close();project=await BusyProject.open(temp.path,engine);
      expect((await project.buffer(root)).bytes(),accepted);expect((await project.check(root))['status'],'complete');
      await exchange();
      final checked=await Process.run('$testBundle/busyapi',['test',temp.path,'--case','Header proof','--json'],
        environment:const {'PATH':'','LANG':'C.UTF-8'},includeParentEnvironment:false);
      expect(checked.exitCode,0,reason:'${checked.stdout} ${checked.stderr}');expect(exchanges,4);
      project.close();await source.writeAsBytes(before);
      final args=['refactor',temp.path,'--root','main','--action','extract','--pointer',selected,
        '--context-kind','header','--name','Extracted','--json'];
      final environment={'PATH':'','LANG':'C.UTF-8','XDG_STATE_HOME':'${temp.path}/private-state'};
      final planned=await Process.run('$testBundle/busyapi',[...args,'--review'],environment:environment,includeParentEnvironment:false);
      expect(planned.exitCode,0,reason:'${planned.stdout} ${planned.stderr}');expect(await source.readAsBytes(),before);
      final report=jsonDecode(planned.stdout as String) as Map;
      final applied=await Process.run('$testBundle/busyapi',[...args,'--apply',report['reviewIdentity'] as String],
        environment:environment,includeParentEnvironment:false);
      expect(applied.exitCode,0,reason:'${applied.stdout} ${applied.stderr}');expect(await source.readAsBytes(),accepted);
    });
  }
}
