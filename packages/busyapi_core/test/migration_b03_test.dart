import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'b03_migration_support.dart';
import 'test_support.dart';

void main() {
  for (final mode in b03Cases) {
    for (final (version, format, target) in [
      ('3.1.2', 'yaml', b03Target(mode)), ('3.2.1', 'json', '3.0.4'),
    ]) {
      test('B03 $mode $version $format to $target retains captured owners through Core and CLI publication', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-b03-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
        final wire = b03Instances(mode).firstWhere((value) => value.$2 && value.$1 != 'null' && value.$1 != '[]').$1;
        var requests = 0;
        server.listen((request) async {
          requests++;expect(request.method, 'POST');expect(request.uri.path, '/echo');
          final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));expect(bytes, utf8.encode(wire));
          request.response.headers.set('content-type', 'application/json');request.response.add(bytes);await request.response.close();
        });
        final file = File('${directory.path}/api.$format'), model = File('${directory.path}/model.yaml');
        final original = b03Api(version, format, port: server.port), originalModel = b03Model(mode);
        await file.writeAsString(original);await model.writeAsString(originalModel);
        final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
        final root = file.uri.toString(), buffer = await project.buffer(root), shared = await project.buffer(model.uri.toString());
        project.store.replace(root, buffer.text.replaceFirst('Original B03 雪', 'Unsaved B03 雪'));
        project.store.replace(shared.id, shared.text.replaceFirst('Original B03 model', 'Unsaved B03 model'));
        final captured = buffer.text, capturedModel = shared.text;
        List<bool>? independent;
        Future<void> exercise(BusyProject owner, String prefix) async {
          final current = owner.roots.single.id;
          final prepared = await owner.prepareRequest(current, resource: current, pointer: '/paths/~1echo/post');
          try {
            for (final direction in ['request-body', 'response-body']) {
              final result = await prepared.evaluateRuntime([
                for (final name in ['Subject', 'Independent']) for (final (sample, _) in b03Instances(mode))
                  RuntimeSchemaInstance(subject: direction, location: name, text: sample,
                    schemaResource: current, schemaPointer: '$prefix/$name'),
              ]);
              expect(result['complete'], true, reason: '$result');
              final values = (result['runtimeEvaluations'] as List).cast<Map>(), count = b03Instances(mode).length;
              expect(values.every((value) => value['complete'] == true), true);
              expect(values.take(count).map((value) => value['valid']), b03Instances(mode).map((value) => value.$2));
              final extra = values.skip(count).map((value) => value['valid'] as bool).toList();independent ??= extra;expect(extra, independent);
            }
            final response = await const ContractRequestExecutor().execute(prepared,
              OperationRequestDraft(planIdentity: prepared.identity, body: RequestBodyDraft.raw(mediaType: 'application/json', text: wire)),
              resolveSecret: (_) async => null);
            try {expect(response.conforming, true, reason: '${response.outgoing.toJson()} ${response.received.toJson()}');
              expect(await response.response.bytes(), utf8.encode(wire));}
            finally {await response.close();}
          } finally {prepared.close();}
        }
        await exercise(project, '/components/schemas');
        final review = await project.prepareMigration(root, '${directory.path}/copy', targetVersion: target);addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');expect(review.unsaved, true);expect(review.result['producerVersion'], '98');
        final outputs = (review.result['outputs'] as List).cast<Map>();
        expect(outputs.any((value) => (value['text'] as String).contains('Unsaved B03 model')), true);
        expect(outputs.any((value) => (value['text'] as String).contains('x-alias: *literal')), true);
        expect(outputs.any((value) => (value['text'] as String).contains('9007199254740993.00')), true);
        await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>()));
        expect(await Directory(review.destination).exists(), false);
        for (final failure in ['race', 'failure']) {
          final failed = await project.prepareMigration(root, '${directory.path}/$failure', targetVersion: target);addTearDown(failed.close);
          await expectLater(failed.publish(beforePublish: () async {
            if (failure == 'race') {await Directory(failed.destination).create();await File('${failed.destination}/foreign').writeAsString('Keep');}
            else {throw const FileSystemException('Controlled B03 publication failure');}
          }), throwsA(anything));
          if (failure == 'race') {
            expect(await File('${failed.destination}/foreign').readAsString(), 'Keep');
            expect(await File('${failed.destination}/openapi.$format').exists(), false);
          } else {expect(await Directory(failed.destination).exists(), false);}
        }
        await review.publish();
        final stale = await project.prepareMigration(root, '${directory.path}/stale', targetVersion: target);addTearDown(stale.close);
        project.store.replace(shared.id, capturedModel.replaceFirst('Unsaved B03 model', 'Changed B03 model'));
        await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((value) => value.code, 'code', 'migration.stale')));
        expect(await Directory(stale.destination).exists(), false);project.store.undo();expect(shared.text, capturedModel);
        final arguments = ['migrate', file.path, '--target', target, '--output', '${directory.path}/cli', '--json'];
        final cliReview = await Process.run('$testBundle/busyapi', arguments,
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cliReview.exitCode, 0, reason: '${cliReview.stdout} ${cliReview.stderr}');
        final report = jsonDecode(cliReview.stdout as String) as Map;expect(report['producerVersion'], '98');expect(report['published'], false);
        expect(await Directory('${directory.path}/cli').exists(), false);
        final applied = await Process.run('$testBundle/busyapi', [...arguments, '--apply', report['reviewIdentity'] as String],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(applied.exitCode, 0, reason: '${applied.stdout} ${applied.stderr}');
        final cli = await BusyProject.open('${directory.path}/cli', engine);addTearDown(cli.close);
        await exercise(cli, target == '2.0' ? '/definitions' : '/components/schemas');
        expect(await file.readAsString(), original);expect(await model.readAsString(), originalModel);
        expect(buffer.text, captured);expect(shared.text, capturedModel);
        final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');await file.delete();await model.delete();
        final cold = await BusyProject.open(relocated.path, engine);addTearDown(cold.close);
        await exercise(cold, target == '2.0' ? '/definitions' : '/components/schemas');expect(requests, 3);
        final checked = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(checked.exitCode, 0, reason: '${checked.stdout} ${checked.stderr}');
      });
    }
  }
}
