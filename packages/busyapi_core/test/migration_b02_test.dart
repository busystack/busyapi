import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'b02_migration_support.dart';
import 'test_support.dart';

void main() {
  for (final mode in b02Cases) {
    for (final (version, format, target) in [
      ('3.1.2', 'yaml', mode == 'finite-tuple' ? '3.0.0' : '2.0'),
      ('3.2.1', 'json', '3.0.4'),
    ]) {
      test('$mode $version $format to $target retains runtime outcomes and atomic reviewed ownership', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-b02-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        final wire = b02Instances(mode).firstWhere((item) => item.$2 && item.$1 != 'null' && item.$1 != '[]').$1;
        var requests = 0;
        server.listen((request) async {
          requests++;
          expect(request.method, 'POST');expect(request.uri.path, '/echo');
          final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));
          expect(bytes, utf8.encode(wire));
          request.response.headers.set('content-type', 'application/json');
          if (mode == 'flat-items') request.response.headers.set('x-values', '9007199254740993.00');
          request.response.add(bytes);await request.response.close();
        });
        final file = File('${directory.path}/api.$format'), model = File('${directory.path}/model.yaml');
        final original = b02Api(version, format, port: server.port, mode: mode), originalModel = b02Model(mode);
        await file.writeAsString(original);await model.writeAsString(originalModel);
        final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
        final root = file.uri.toString(), buffer = await project.buffer(root), shared = await project.buffer(model.uri.toString());
        project.store.replace(root, buffer.text.replaceFirst('Original B02 雪', 'Unsaved B02 雪'));
        project.store.replace(shared.id, shared.text.replaceFirst('Original B02 model', 'Unsaved B02 model'));
        final captured = buffer.text, capturedModel = shared.text;
        List<bool>? independent;
        Future<void> exercise(BusyProject owner, String prefix) async {
          final current = owner.roots.single.id;
          final prepared = await owner.prepareRequest(current, resource: current, pointer: '/paths/~1echo/post');
          try {
            for (final direction in ['request-body', 'response-body']) {
              final result = await prepared.evaluateRuntime([
                for (final name in ['Subject', 'Independent']) for (final (sample, _) in b02Instances(mode))
                  RuntimeSchemaInstance(subject: direction, location: name, text: sample,
                    schemaResource: current, schemaPointer: '$prefix/$name'),
              ]);
              expect(result['complete'], true, reason: '$result');
              final evaluations = (result['runtimeEvaluations'] as List).cast<Map>();
              expect(evaluations.every((value) => value['complete'] == true), true);
              final count = b02Instances(mode).length;
              expect(evaluations.take(count).map((value) => value['valid']), b02Instances(mode).map((value) => value.$2));
              final values = evaluations.skip(count).map((value) => value['valid'] as bool).toList();
              independent ??= values;expect(values, independent);
            }
            if (mode == 'flat-items') {
              final checked = await prepared.evaluateRuntime([
                for (final value in ['9007199254740993.00', '9007199254740992']) ...[
                  RuntimeSchemaInstance(subject: 'response-header', location: value, text: '',
                    header: RuntimeHeaderTarget(resource: current, pointer: '/paths/~1echo/post/responses/200/headers/X-Values', name: 'X-Values', values: [value])),
                  RuntimeSchemaInstance(subject: 'request-parameter', location: value, text: 'values=$value',
                    parameter: RuntimeParameterTarget(resource: current, pointer: '/paths/~1echo/post/parameters/0')),
                ],
              ]);
              expect(checked['complete'], true, reason: '$checked');
              expect((checked['runtimeEvaluations'] as List).map((value) => value['valid']), [true, true, false, false]);
            }
            final response = await const ContractRequestExecutor().execute(prepared,
              OperationRequestDraft(planIdentity: prepared.identity,
                body: RequestBodyDraft.raw(mediaType: 'application/json', text: wire)),
              resolveSecret: (_) async => null);
            try {expect(response.conforming, true, reason: '${response.outgoing.toJson()} ${response.received.toJson()}');
              expect(await response.response.bytes(), utf8.encode(wire));}
            finally {await response.close();}
          } finally {prepared.close();}
        }
        await exercise(project, '/components/schemas');
        if (mode == 'flat-items' && target == '2.0') {
          project.store.replace(shared.id, capturedModel.replaceFirst('"format":"int64"', '"description":"Applicable item annotation","format":"int64"'));
          final refused = await project.prepareMigration(root, '${directory.path}/unsupported-items', targetVersion: target);
          addTearDown(refused.close);
          expect(refused.publishable, false, reason: '${refused.result}');
          expect((refused.result['problems'] as List).any((value) => value['code'] == 'migration.flat-items.keyword'), true);
          expect(refused.result['outputs'], isEmpty);
          await expectLater(refused.publish(), throwsA(isA<CoreFailure>()));
          expect(await Directory(refused.destination).exists(), false);
          project.store.undo();expect(shared.text, capturedModel);
        }
        final review = await project.prepareMigration(root, '${directory.path}/copy', targetVersion: target);
        addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');
        expect(review.unsaved, true);expect(review.result['producerVersion'], '90');
        final outputs = (review.result['outputs'] as List).cast<Map>();
        expect(outputs.any((value) => (value['text'] as String).contains('Unsaved B02 model')), true);
        expect(outputs.any((value) => (value['text'] as String).contains('x-alias: *literal')), true);
        await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>()));
        expect(await Directory(review.destination).exists(), false);
        for (final failure in ['race', 'failure']) {
          final failed = await project.prepareMigration(root, '${directory.path}/$failure', targetVersion: target);
          addTearDown(failed.close);
          await expectLater(failed.publish(beforePublish: () async {
            if (failure == 'race') {
              await Directory(failed.destination).create();
              await File('${failed.destination}/foreign').writeAsString('Keep');
            } else {throw const FileSystemException('Controlled B02 publication failure');}
          }), throwsA(anything));
          if (failure == 'race') {
            expect(await File('${failed.destination}/foreign').readAsString(), 'Keep');
            expect(await File('${failed.destination}/openapi.$format').exists(), false);
          } else {expect(await Directory(failed.destination).exists(), false);}
        }
        await review.publish();
        final stale = await project.prepareMigration(root, '${directory.path}/stale', targetVersion: target);
        addTearDown(stale.close);
        project.store.replace(shared.id, capturedModel.replaceFirst('Unsaved B02 model', 'Changed B02 model'));
        await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'migration.stale')));
        expect(await Directory(stale.destination).exists(), false);
        project.store.undo();expect(shared.text, capturedModel);
        final cliArguments = ['migrate', file.path, '--target', target, '--output', '${directory.path}/cli', '--json'];
        final cliReview = await Process.run('$testBundle/busyapi', cliArguments,
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cliReview.exitCode, 0, reason: '${cliReview.stdout} ${cliReview.stderr}');
        final cliReport = jsonDecode(cliReview.stdout as String) as Map;
        expect(cliReport['published'], false);expect(await Directory('${directory.path}/cli').exists(), false);
        final cliApply = await Process.run('$testBundle/busyapi', [...cliArguments, '--apply', cliReport['reviewIdentity'] as String],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cliApply.exitCode, 0, reason: '${cliApply.stdout} ${cliApply.stderr}');
        final cliCopy = await BusyProject.open('${directory.path}/cli', engine);addTearDown(cliCopy.close);
        await exercise(cliCopy, target == '2.0' ? '/definitions' : '/components/schemas');
        expect(await file.readAsString(), original);expect(await model.readAsString(), originalModel);
        expect(buffer.text, captured);expect(shared.text, capturedModel);
        final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');
        await file.delete();await model.delete();
        final cold = await BusyProject.open(relocated.path, engine);addTearDown(cold.close);
        await exercise(cold, target == '2.0' ? '/definitions' : '/components/schemas');
        expect(requests, 3);
        final cliCheck = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cliCheck.exitCode, 0, reason: '${cliCheck.stdout} ${cliCheck.stderr}');
      });
    }
  }
}
