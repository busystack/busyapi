import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'migration_r3c_fixture.dart';
import 'test_support.dart';

void main() {
  for (final target in ['3.1.2', '3.0.4']) {
    test('R3c-3 $target admits reserved raw query proofs using the actual target owners', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-reserved-query-');addTearDown(() => directory.delete(recursive: true));
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      final seen = <String>[];
      server.listen((request) async {seen.add(request.uri.toString());request.response.statusCode=204;await request.response.close();});
      final file=File('${directory.path}/api.json'),config=File('${directory.path}/busyapi.yaml');
      await file.writeAsString(jsonEncode({'openapi':'3.2.1','info':{'title':'Reserved query','version':'1'},'servers':[{'url':'http://127.0.0.1:${server.port}'}],
        'paths':{'/p':{'get':{'parameters':[{'name':'whole','in':'querystring','required':true,'content':{'application/x-www-form-urlencoded':{
          'schema':{'type':'object','required':['q','flag'],'additionalProperties':false,'properties':{
            'q':{'type':'array','minItems':1,'maxItems':2,'items':{'type':'string','enum':['/','[x]']}},'flag':{'type':'boolean'}}},
          'encoding':{'q':{'style':'form','explode':true,'allowReserved':true}},
        }}}],'responses':{'204':{'description':'Empty'}}}}}}));
      await config.writeAsString(jsonEncode({'version':1,'roots':[{'name':'api','path':'api.json'}],'tests':[
        {'name':'saved','operation':{'method':'get','path':'/p'},'parameters':{'querystring':{'whole':'q=/&q=%5Bx%5D&flag=false'}},'expect':{'status':204}},
      ]}));
      final engine=EngineProcess(executable:runtimeNode,helper:runtimeHelper);addTearDown(engine.close);
      final project=await BusyProject.open(directory.path,engine);addTearDown(project.close);
      Future<void> saved(BusyProject owner) async {
        final report=await const ContractTestRunner().run(owner,owner.roots.single.id,resolveSecret:(_) async=>null);
        expect(report.passed,true,reason:'${report.toJson()}');expect(seen.last,'/p?q=/&q=%5Bx%5D&flag=false');
      }
      await saved(project);final review=await project.prepareMigration(project.roots.single.id,'${directory.path}/output',targetVersion:target);
      addTearDown(review.close);expect(review.publishable,true,reason:'${review.result}');await review.publish();
      await file.delete();final cold=await BusyProject.open(review.destination,engine);addTearDown(cold.close);await saved(cold);
    });
  }
  for (final target in ['3.1.2', '3.0.4', '2.0']) {
    test('R3c-3 $target preserves explicitly empty whole-text selections', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-empty-query-');addTearDown(() => directory.delete(recursive: true));
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      final seen = <String>[];
      server.listen((request) async {seen.add(request.uri.toString());request.response.statusCode=204;await request.response.close();});
      final file=File('${directory.path}/api.json'),config=File('${directory.path}/busyapi.yaml');
      await file.writeAsString(jsonEncode({'openapi':'3.2.1','info':{'title':'Empty text','version':'1'},'servers':[{'url':'http://127.0.0.1:${server.port}'}],
        'paths':{'/p':{'get':{'parameters':[{'name':'all','in':'querystring','content':{'text/plain':{'schema':{'type':'string','maxLength':0}}}}],
          'responses':{'204':{'description':'Empty'}}}}}}));
      final settings=jsonEncode({'version':1,'roots':[{'name':'api','path':'api.json'}],'tests':[
        {'name':'selected','operation':{'method':'get','path':'/p'},'parameters':{'querystring':{'all':''}},'expect':{'status':204}},
        {'name':'omitted','operation':{'method':'get','path':'/p'},'parameters':{},'expect':{'status':204}},
      ]});await config.writeAsString(settings);
      final engine=EngineProcess(executable:runtimeNode,helper:runtimeHelper);addTearDown(engine.close);
      final project=await BusyProject.open(directory.path,engine);addTearDown(project.close);
      Future<void> saved(BusyProject owner) async {
        final report=await const ContractTestRunner().run(owner,owner.roots.single.id,resolveSecret:(_) async=>throw StateError('No credentials'));
        expect(report.passed,true,reason:'${report.toJson()}');expect(seen.reversed.take(2),['/p','/p']);
      }
      await saved(project);final review=await project.prepareMigration(project.roots.single.id,'${directory.path}/output',targetVersion:target);
      addTearDown(review.close);expect(review.publishable,true,reason:'${review.result}');await review.publish();
      await file.delete();final cold=await BusyProject.open(review.destination,engine);addTearDown(cold.close);await saved(cold);
      expect(await config.readAsString(),settings);
    });
  }
  for (final version in ['3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      for (final target in ['3.1.2', '3.0.4', '2.0']) {
        for (final raw in [false, true]) {
        test('R3c-3 $version $format → $target preserves ${raw ? 'raw' : 'structured'} saved HTTP order', () async {
          final directory = await Directory.systemTemp.createTemp('busyapi-r3c2-');
          addTearDown(() => directory.delete(recursive: true));
          final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          addTearDown(() => server.close(force: true));
          final seen = <String>[];
          server.listen((request) async {
            seen.add(request.uri.toString());request.response.statusCode = 204;await request.response.close();
          });
          final file = File('${directory.path}/api.$format'), config = File('${directory.path}/busyapi.yaml');
          final original = '${format == 'yaml' ? '# Whole query inverse\r\n' : ''}${r3cFactoredSource(version, server.port)}', settings = raw ? r3cFactoredRawConfiguration(format) : r3cFactoredConfiguration(format);
          await file.writeAsString(original);await config.writeAsString(settings);
          final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
          final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
          Future<void> saved(BusyProject owner) async {
            final report = await const ContractTestRunner().run(owner, owner.roots.single.id,
              selectedCases: ['saved'], resolveSecret: (_) async => throw StateError('No credentials'));
            expect(report.passed, true, reason: '${report.toJson()}');
            expect(seen.last, '/p?text=&q=a%2Bb&q=a%2Bb&count=9007199254740993.00&flag=false');
          }
          await saved(project);
          final buffer = await project.buffer(file.uri.toString());
          project.store.replace(buffer.id, buffer.text.replaceFirst('R3c parameters', 'Unsaved R3c2 parameters'));
          final review = await project.prepareMigration(project.roots.single.id, '${directory.path}/output', targetVersion: target);
          addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');expect(review.unsaved, true);
          final projection = review.configurationProjections.singleWhere((change) => change.pointer == '/tests/0/parameters');
          final query = jsonDecode(projection.after)['query'] as Map;
          expect(query.keys.toList(), ['text', 'q', 'count', 'flag']);expect(query['q'], ['a+b', 'a+b']);
          expect(projection.after, contains('9007199254740993.00'));
          expect((review.result['configurationProjections'] as List).cast<Map>().any((change) => change.containsKey('rawQueries')), raw);
          expect(review.parameterChanges.any((change) => change.after.endsWith(' · flag')), true);
          await expectLater(review.publish(cancelled: () => true), throwsA(anything));
          expect(await Directory(review.destination).exists(), false);
          await expectLater(review.publish(beforePublish: () async {throw const FileSystemException('Controlled grouped publication failure');}), throwsA(anything));
          expect(await Directory(review.destination).exists(), false);
          await review.publish();
          if (raw && version == '3.2.1' && format == 'json' && target == '3.0.4') {
            final stale = await project.prepareMigration(project.roots.single.id, '${directory.path}/stale', targetVersion: target);
            addTearDown(stale.close);
            final configuration = await project.buffer(config.uri.toString());
            project.store.replace(configuration.id, '$settings ');
            await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
            expect(await Directory(stale.destination).exists(), false);
            final destination = '${directory.path}/cli-raw';
            final preview = await Process.run('$testBundle/busyapi', ['migrate', directory.path, '--target', target, '--output', destination, '--json'],
              environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
            expect(preview.exitCode, 0, reason: '${preview.stdout}${preview.stderr}');
            final report = jsonDecode(preview.stdout as String) as Map;
            expect(report['producerVersion'], '99');
            expect((report['configurationProjections'] as List).cast<Map>().any((change) => change.containsKey('rawQueries')), true);
            final applied = await Process.run('$testBundle/busyapi', ['migrate', directory.path, '--target', target, '--output', destination, '--apply', report['reviewIdentity'] as String, '--json'],
              environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
            expect(applied.exitCode, 0, reason: '${applied.stdout}${applied.stderr}');
            final cli = await BusyProject.open(destination, engine);addTearDown(cli.close);await saved(cli);
          }
          final moved = await Directory(review.destination).rename('${directory.path}/cold factors');
          await file.delete();
          final cold = await BusyProject.open(moved.path, engine);addTearDown(cold.close);await saved(cold);
          expect((await cold.check(cold.roots.single.id))['complete'], true);
          expect(await config.readAsString(), settings);
        });
        }
      }
    }
  }

  for (final version in ['3.2.0', '3.2.1']) {
    for (final format in ['json', 'yaml']) {
      for (final target in ['3.1.2', '3.0.4']) {
        test('R3c-1 $version $format → $target extracts saved arrays atomically', () async {
          final directory = await Directory.systemTemp.createTemp('busyapi-r3c1-');
          addTearDown(() => directory.delete(recursive: true));
          final file = File('${directory.path}/api.$format'), config = File('${directory.path}/busyapi.yaml');
          final original = r3cRepeatedSource(version, 1), configuration = r3cRepeatedConfiguration(format);
          await file.writeAsString(original);await config.writeAsString(configuration);
          final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
          final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
          final buffer = await project.buffer(file.uri.toString());
          project.store.replace(buffer.id, buffer.text.replaceFirst('R3c parameters', 'Unsaved R3c1 parameters'));
          final review = await project.prepareMigration(project.roots.single.id, '${directory.path}/output', targetVersion: target);
          addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');expect(review.unsaved, true);
          final projection = review.configurationProjections.singleWhere((change) => change.pointer == '/tests/0/parameters');
          expect(jsonDecode(projection.after)['query']['q'], ['a+b', 'a+b']);
          await expectLater(review.publish(cancelled: () => true), throwsA(anything));
          expect(await Directory(review.destination).exists(), false);
          await expectLater(review.publish(beforePublish: () async {throw const FileSystemException('Controlled array publication failure');}), throwsA(anything));
          expect(await Directory(review.destination).exists(), false);
          await review.publish();
          final cold = await BusyProject.open(review.destination, engine);addTearDown(cold.close);
          expect((await cold.check(cold.roots.single.id))['complete'], true);
          final stale = await project.prepareMigration(project.roots.single.id, '${directory.path}/stale', targetVersion: target);
          addTearDown(stale.close);project.store.replace(buffer.id, '$original ');
          await expectLater(stale.publish(), throwsA(anything));
          expect(await Directory(stale.destination).exists(), false);
          expect(await file.readAsString(), original);expect(await config.readAsString(), configuration);
        });
      }
    }
  }
  for (final version in ['3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      for (final target in ['3.1.2', '3.0.4']) {
        test('R3c $version $format → $target preserves saved cases and exact HTTP bytes', () async {
          final directory = await Directory.systemTemp.createTemp('busyapi-r3c-');
          addTearDown(() => directory.delete(recursive: true));
          final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          addTearDown(() => server.close(force: true));
          final seen = <(String, String?)>[];
          server.listen((request) async {
            seen.add((request.uri.toString(), request.headers.value('cookie')));
            request.response.statusCode = 204;
            await request.response.close();
          });
          final file = File('${directory.path}/api.$format'), config = File('${directory.path}/busyapi.yaml');
          final original = r3cSource(version, format, server.port), configuration = r3cConfiguration(format);
          await file.writeAsString(original); await config.writeAsString(configuration);
          final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
          addTearDown(engine.close);
          final project = await BusyProject.open(directory.path, engine);
          addTearDown(project.close);
          final root = project.roots.single.id, buffer = await project.buffer(file.uri.toString());
          project.store.replace(buffer.id, buffer.text.replaceFirst('R3c parameters', 'Unsaved R3c parameters'));
          Future<String?> resolve(String reference) async { expect(reference, r3cSecret); return 'credential%2C'; }
          Future<void> saved(BusyProject owner, {bool disk = true}) async {
            final report = await const ContractTestRunner().run(owner, owner.roots.single.id,
              selectedCases: ['saved'], resolveSecret: resolve, saved: disk);
            expect(report.passed, true, reason: '${report.toJson()}');
            expect(seen.last, ('/p?q=a%2Bb&count=9007199254740993.00&flag=false', 'literal=a%20b; one=safe; right=true; auth=credential%2C'));
          }
          Future<void> collision(BusyProject owner, String location) async {
            final entry = owner.roots.single.id;
            final plan = await owner.prepareRequest(entry, resource: entry, pointer: '/paths/~1p/get');
            try {
              await expectLater(const ContractRequestBuilder().build(plan,
                OperationRequestDraft(planIdentity: plan.identity, environment: 'manual', parameters: {
                  OperationRequestDraft.parameterKey(location, 'descriptionOnly'): const RequestValue.json('{"q":"%20"}'),
                  OperationRequestDraft.parameterKey('cookie', 'auth'): const RequestValue.text('explicit'),
                }), resolveSecret: (_) async => throw StateError('An explicit cookie cannot acquire credentials')),
                throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'request.security.collision')));
            } finally { plan.close(); }
          }
          await saved(project, disk: false); await collision(project, 'querystring');
          var review = await project.prepareMigration(root, '${directory.path}/output', targetVersion: target);
          addTearDown(review.close);
          expect(review.publishable, true, reason: '${review.result}');expect(review.unsaved, true);
          expect(review.configurationProjections.any((change) => change.pointer == '/tests/0/parameters'), true);
          final repeat = await project.prepareMigration(root, review.destination, targetVersion: target);
          addTearDown(repeat.close);expect(repeat.identity, review.identity);
          if (version == '3.2.1' && format == 'yaml' && target == '3.0.4') {
            for (final failure in ['cancel', 'race', 'failure']) {
              final rejected = await project.prepareMigration(root, '${directory.path}/$failure', targetVersion: target);
              addTearDown(rejected.close);var cancelled = false;
              await expectLater(rejected.publish(cancelled: () => cancelled, beforePublish: () async {
                if (failure == 'cancel') cancelled = true;
                if (failure == 'race') { await Directory(rejected.destination).create();await File('${rejected.destination}/foreign').writeAsString('Keep'); }
                if (failure == 'failure') throw const FileSystemException('Controlled R3c publication failure');
              }), throwsA(anything));
              if (failure == 'race') expect(await File('${rejected.destination}/foreign').readAsString(), 'Keep');
              else expect(await Directory(rejected.destination).exists(), false);
            }
            final stale = await project.prepareMigration(root, '${directory.path}/stale', targetVersion: target);
            addTearDown(stale.close);
            final configBuffer = await project.buffer(config.uri.toString());
            project.store.replace(configBuffer.id, '$configuration ');
            await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'migration.stale')));
            expect(await Directory(stale.destination).exists(), false);project.store.undo();
            review.close();review = await project.prepareMigration(root, '${directory.path}/output', targetVersion: target);
            addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');
          }
          await review.publish();
          expect(await file.readAsString(), original);expect(await config.readAsString(), configuration);
          final moved = await Directory(review.destination).rename('${directory.path}/cold 雪');
          final cold = await BusyProject.open(moved.path, engine);addTearDown(cold.close);
          await saved(cold);await collision(cold, 'query');
          if (version == '3.2.1' && format == 'json' && target == '3.1.2') {
            final destination = '${directory.path}/cli';
            final preview = await Process.run('$testBundle/busyapi', ['migrate', directory.path, '--target', target, '--output', destination, '--json'],
              environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
            expect(preview.exitCode, 0, reason: '${preview.stdout}${preview.stderr}');
            final report = jsonDecode(preview.stdout as String) as Map;
            expect(report['producerVersion'], '99');expect(report['published'], false);
            expect((report['configurationProjections'] as List).any((change) => change['pointer'] == '/tests/0/parameters'), true);
            expect(await Directory(destination).exists(), false);
            final applied = await Process.run('$testBundle/busyapi', ['migrate', directory.path, '--target', target, '--output', destination, '--apply', report['reviewIdentity'] as String, '--json'],
              environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
            expect(applied.exitCode, 0, reason: '${applied.stdout}${applied.stderr}');
            final cli = await BusyProject.open(destination, engine);addTearDown(cli.close);await saved(cli);
          }
          project.close();await file.delete();await config.delete();
          final reopened = await BusyProject.open(moved.path, engine);addTearDown(reopened.close);await saved(reopened);
        });
      }
    }
  }
}
