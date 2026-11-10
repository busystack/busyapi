import 'dart:convert';
import 'dart:io';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';
import 'test_support.dart';

// Registered through the existing form, binary and Swagger production gates.
void mixedMediaMultipartMigrationRegressions(String group) {
  if (group == 'form') test('R3d1b4 an incompatible active occurrence cannot publish a partial form conversion', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-mixed-refusal-');addTearDown(() => directory.delete(recursive: true));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
    final file = File('${directory.path}/api.json');
    final text = jsonEncode({'openapi': '3.2.1', 'info': {'title': 'Mixed restriction', 'version': '1'},
      'components': {'mediaTypes': {'Shared': {'schema': {'type': 'array', 'items': {'type': 'object', 'required': ['tag'],
        'additionalProperties': false, 'properties': {'tag': {'type': 'string'}}}}, 'itemEncoding': {'contentType': 'text/plain'}}}},
      'paths': {'/parts': {'post': {'requestBody': {'content': {
        for (final type in ['multipart/form-data', 'application/json', 'multipart/mixed']) type: {r'$ref': '#/components/mediaTypes/Shared'},
      }}, 'responses': {'204': {'description': 'Empty'}}}}}});
    await file.writeAsString(text);await File('${directory.path}/busyapi.yaml').writeAsString('version: 1\nroots: [{name: api, path: api.json}]\n');
    final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
    final review = await project.prepareMigration(project.roots.single.id, '${directory.path}/output', targetVersion: '3.1.2');addTearDown(review.close);
    expect(review.publishable, false);expect(review.result['outputs'], isEmpty);
    expect(review.problems.any((problem) => problem.pointer.contains('multipart~1mixed') && problem.reason == MigrationProblemReason.targetRepresentation), true);
    await expectLater(review.publish(), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'migration.blocked')));
    expect(await Directory(review.destination).exists(), false);expect(await file.readAsString(), text);
  });
  for (final version in ['3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      for (final target in group == 'swagger' ? ['2.0'] : ['3.1.2', '3.0.4']) {
        test('R3d1b4 $group $version $format $target mixed-media capture and publication', () async {
          final directory = await Directory.systemTemp.createTemp('busyapi-mixed-media-');
          addTearDown(() => directory.delete(recursive: true));
          final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
          final binary = group == 'binary';
          final media = {'schema': {'type': 'array', 'maxItems': 3, 'items': {
            'type': 'object', 'required': ['tag'], 'additionalProperties': false,
            'properties': {'tag': binary ? {'type': 'string', 'contentEncoding': 'base64'} : {'type': 'integer', 'minimum': 'EXACT'}},
          }}, 'itemEncoding': {'contentType': binary ? 'application/octet-stream' : 'application/json',
            if (binary) 'headers': {'Content-Transfer-Encoding': {'required': true, 'schema': {'type': 'string', 'enum': ['base64']}}}}};
          final document = {'openapi': version, 'info': {'title': 'Mixed capture', 'version': '1'},
            'servers': [{'url': 'https://example.test'}],
            'components': {'mediaTypes': {'Chain': {r'$ref': 'media.json#/Shared'}},
              'schemas': {'Independent': {r'$ref': 'media.json#/Shared/schema'}}},
            'paths': {'/parts': {'post': {'requestBody': {'content': {
              for (final type in ['multipart/form-data', 'application/json']) type: {r'$ref': '#/components/mediaTypes/Chain'},
            }}, 'responses': {'200': {'description': 'JSON', 'content': {'application/json': {r'$ref': '#/components/mediaTypes/Chain'}}}}}}}};
          final source = File('${directory.path}/api.$format'), library = File('${directory.path}/media.json');
          final sourceText = format == 'json' ? jsonEncode(document) : '# Keep mixed comment\r\n${document.entries.map((entry) => '${jsonEncode(entry.key)}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n';
          final libraryText = jsonEncode({'Shared': media}).replaceAll('"EXACT"', '9007199254740993.00');
          await source.writeAsString(sourceText);await library.writeAsString(libraryText);
          final manifest = File('${directory.path}/busyapi.yaml');
          final saved = binary ? '"AP8="' : '9007199254740993.00';
          final manifestText = 'version: 1\nroots: [{name: api, path: api.$format}]\nenvironments: {dev: {variables: {keep: unchanged}}}\ntests:\n'
            '- name: form\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: [{tag: $saved}]}\n'
            '- name: json\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: application/json, value: [{tag: $saved}]}\n';
          await manifest.writeAsString(manifestText);
          final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
          final root = project.roots.single.id, libraryBuffer = await project.buffer(library.uri.toString());
          project.store.replace(libraryBuffer.id, libraryBuffer.text.replaceFirst('"maxItems":3', '"maxItems":4'));
          final review = await project.prepareMigration(root, '${directory.path}/output', targetVersion: target);addTearDown(review.close);
          expect(review.unsaved, true);
          if (group == 'swagger') {expect(review.publishable, false);expect(review.result['outputs'], isEmpty);return;}
          expect(review.publishable, true, reason: '${review.result}');expect(review.result['producerVersion'], '105');
          expect(review.changes.any((change) => change.before.contains('itemEncoding')), true);
          if (binary) expect(review.result['manifest']['tests'][0]['body']['value'], {'tag': ['AP8=']});
          expect(review.result['manifest']['tests'][0]['body']['value']['tag'], isA<List>());
          expect(review.result['manifest']['tests'][1]['body']['value'], isA<List>());
          expect(review.configurationProjections.where((projection) => projection.pointer == '/tests/1/body'), isEmpty);
          expect(review.result['manifestText'], binary ? contains('AP8=') : contains('9007199254740993.00'));
          await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'cancelled')));
          expect(await Directory(review.destination).exists(), false);
          final stale = await project.prepareMigration(root, '${directory.path}/stale', targetVersion: target);addTearDown(stale.close);
          final race = await project.prepareMigration(root, '${directory.path}/race', targetVersion: target);addTearDown(race.close);
          await expectLater(race.publish(beforePublish: () async {await Directory(race.destination).create();await File('${race.destination}/foreign').writeAsString('Keep');}), throwsA(anything));
          expect(await File('${race.destination}/foreign').readAsString(), 'Keep');
          final failed = await project.prepareMigration(root, '${directory.path}/failed', targetVersion: target);addTearDown(failed.close);
          await expectLater(failed.publish(beforePublish: () => throw const FileSystemException('Injected publication failure')), throwsA(anything));
          expect(await Directory(failed.destination).exists(), false);
          await review.publish();
          project.store.replace(libraryBuffer.id, libraryText);
          await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'migration.stale')));
          expect(await Directory(stale.destination).exists(), false);
          expect(await source.readAsString(), sourceText);expect(await library.readAsString(), libraryText);expect(await manifest.readAsString(), manifestText);
          final preview = await Process.run('$testBundle/busyapi', ['migrate', directory.path, '--target', target, '--output', '${directory.path}/cli', '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
          expect(preview.exitCode, 0, reason: '${preview.stdout} ${preview.stderr}');
          final report = jsonDecode(preview.stdout as String) as Map;expect(report['producerVersion'], '105');expect(report['published'], false);
          expect(await Directory('${directory.path}/cli').exists(), false);
          await source.delete();await library.delete();await manifest.delete();
          final cold = await BusyProject.open(review.destination, engine);addTearDown(cold.close);
          final checked = await cold.check(cold.roots.single.id);expect(checked['complete'], true);
          final operation = (checked['projection']['operations'] as List).single as Map;
          final plan = await cold.prepareRequest(cold.roots.single.id, resource: operation['resource'] as String,
            pointer: operation['pointer'] as String, occurrence: operation['occurrence'] as String);addTearDown(plan.close);
          final prepared = await const ContractRequestBuilder().build(plan, OperationRequestDraft(planIdentity: plan.identity,
            body: RequestBodyDraft.multipartValue(json: binary ? '{"tag":["AP8="]}' : '{"tag":[9007199254740993.00]}')), resolveSecret: (_) async => null);
          addTearDown(prepared.body!.close);
          final emitted = <int>[];await for (final chunk in prepared.body!.open()) {emitted.addAll(chunk);}
          for (final original in [true, false]) {
            final id = original ? source.uri.toString() : review.result['outputRoot'] as String;
            final evaluated = await engine.request('evaluateSchemas', {'root': id, 'snapshot': 'mixed-wire-$original',
              'resources': original ? [{'id': id, 'text': sourceText, 'generation': 0}, {'id': library.uri.toString(), 'text': libraryText, 'generation': 0}] : review.result['outputs'],
              'runtimeInstances': [{'subject': 'request-body', 'location': 'mixed-emitted', 'text': base64Encode(emitted), 'mediaBase64': true,
                'mediaType': prepared.body!.mediaType, 'form': {'resource': id, 'pointer': '/paths/~1parts/post/requestBody/content/multipart~1form-data'},
                'schema': original ? {'resource': library.uri.toString(), 'pointer': '/Shared/schema'} : {'resource': id, 'pointer': '/paths/~1parts/post/requestBody/content/multipart~1form-data/schema'}}]});
            expect(evaluated['complete'], true, reason: '$evaluated');
            expect((evaluated['runtimeEvaluations'] as List).every((value) => value['complete'] == true && value['valid'] == true), true, reason: '$evaluated');
          }
        });
      }
    }
  }
}
