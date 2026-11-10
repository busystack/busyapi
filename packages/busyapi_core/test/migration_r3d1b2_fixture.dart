import 'dart:convert';
import 'dart:io';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';
import 'test_support.dart';

// Registered by the existing named fixture in form, binary and Swagger gates.
void multiNameMultipartMigrationRegressions(String group) {
  for (final version in ['3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      for (final target in group == 'swagger' ? ['2.0'] : ['3.1.2', '3.0.4']) {
        test('R3d1b2 $group $version $format to $target multi-name transaction', () async {
          final directory = await Directory.systemTemp.createTemp('busyapi-r3d1b2-');
          addTearDown(() => directory.delete(recursive: true));
          final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
          addTearDown(engine.close);
          final binary = group == 'binary';
          final part = {'type': 'object', 'minProperties': 1, 'maxProperties': 1, 'additionalProperties': false,
            'properties': {for (final name in ['a', 'b', '雪']) name: {'type': 'string', if (binary) 'contentEncoding': 'base64'}}};
          final rule = {'contentType': binary ? 'application/octet-stream' : 'text/plain; charset=utf-8',
            if (binary) 'headers': {'Content-Transfer-Encoding': {'required': true, 'schema': {'type': 'string', 'enum': ['base64']}}}};
          final document = {'openapi': version, 'info': {'title': 'Original multi-name', 'version': '1'},
            'servers': [{'url': 'https://example.test'}],
            'paths': {'/parts': {'post': {'requestBody': {'content': {'multipart/form-data': {
              'schema': {'type': 'array', 'maxItems': 4, 'items': part}, 'itemEncoding': rule,
            }}}, 'responses': {'204': {'description': 'Empty'}}}}}};
          final file = File('${directory.path}/api.$format');
          final text = format == 'json' ? jsonEncode(document) : '# Multi-name comment\r\n${document.entries.map((entry) => '${jsonEncode(entry.key)}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n';
          await file.writeAsString(text);
          final manifest = File('${directory.path}/busyapi.yaml');
          await manifest.writeAsString('version: 1\nroots: [{name: api, path: api.$format}]\nenvironments: {dev: {variables: {keep: unchanged}}}\ntests:\n'
            '- name: ordered\n  operation: {entry: api, method: POST, path: /parts}\n'
            '  body: {mediaType: multipart/form-data, value: [{b: "${binary ? 'AP8=' : 'snow'}"}, {a: ""}, {a: "${binary ? 'AQI=' : '雪'}"}], partHeaders: []}\n'
            '- name: empty\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: []}\n'
            '- name: omitted\n  operation: {entry: api, method: POST, path: /parts}\n'
            '- name: named\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: {a: [], b: ["${binary ? 'AQI=' : '雪'}"]}}\n');
          final sourceBytes = await file.readAsBytes(), manifestBytes = await manifest.readAsBytes();
          final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
          final root = project.roots.single.id, buffer = await project.buffer(project.roots.single.id);
          project.store.replace(root, buffer.text.replaceFirst('Original multi-name', 'Unsaved multi-name'));
          final review = await project.prepareMigration(root, '${directory.path}/output', targetVersion: target);addTearDown(review.close);
          expect(review.unsaved, true);
          if (group == 'swagger') { expect(review.publishable, false);expect(review.result['outputs'], isEmpty);return; }
          expect(review.publishable, true, reason: '${review.result}');
          expect(review.result['producerVersion'], '105');
          final projections = review.result['configurationProjections'] as List;
          expect(projections.where((record) => record['multipart'] != null).length, 2);
          expect(projections.firstWhere((record) => record['multipart'] != null)['multipart'], {'names': ['a', 'b', '雪']});
          expect(review.result['manifest']['tests'][0]['body']['value'], {'b': [binary ? 'AP8=' : 'snow'], 'a': ['', binary ? 'AQI=' : '雪']});
          expect(review.result['manifest']['tests'][1]['body']['value'], {'a': [], 'b': [], '雪': []});
          expect(review.result['manifest']['tests'][2]['body'], isNull);
          expect(review.result['manifest']['tests'][3]['body']['value'], {'a': [], 'b': [binary ? 'AQI=' : '雪']});
          await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'cancelled')));
          expect(await Directory(review.destination).exists(), false);
          final stale = await project.prepareMigration(root, '${directory.path}/stale', targetVersion: target);addTearDown(stale.close);
          final race = await project.prepareMigration(root, '${directory.path}/race', targetVersion: target);addTearDown(race.close);
          await expectLater(race.publish(beforePublish: () async {
            await Directory(race.destination).create();await File('${race.destination}/foreign').writeAsString('Keep');
          }), throwsA(anything));
          expect(await File('${race.destination}/foreign').readAsString(), 'Keep');
          await review.publish();
          project.store.replace(root, buffer.text.replaceFirst('Original multi-name', 'Changed after review'));
          await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'migration.stale')));
          expect(await Directory(stale.destination).exists(), false);
          expect(await file.readAsBytes(), sourceBytes);expect(await manifest.readAsBytes(), manifestBytes);
          final preview = await Process.run('$testBundle/busyapi', ['migrate', directory.path, '--target', target, '--output', '${directory.path}/cli', '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
          expect(preview.exitCode, 0, reason: '${preview.stdout} ${preview.stderr}');
          expect((jsonDecode(preview.stdout as String) as Map)['configurationProjections'], isNotEmpty);
          await file.delete();await manifest.delete();
          final cold = await BusyProject.open(review.destination, engine);addTearDown(cold.close);
          final checked = await cold.check(cold.roots.single.id);
          expect(checked['complete'], true);
          final operation = (checked['projection']['operations'] as List).single as Map;
          final plan = await cold.prepareRequest(cold.roots.single.id, resource: operation['resource'] as String,
            pointer: operation['pointer'] as String, occurrence: operation['occurrence'] as String);addTearDown(plan.close);
          final draft = OperationRequestDraft(planIdentity: plan.identity, body: RequestBodyDraft.multipartValue(
            json: jsonEncode({'b': [binary ? 'AP8=' : 'snow'], 'a': ['', binary ? 'AQI=' : '雪']})));
          final prepared = await const ContractRequestBuilder().build(plan, draft, resolveSecret: (_) async => null);
          addTearDown(prepared.body!.close);
          final emitted = <int>[];await for (final chunk in prepared.body!.open()) { emitted.addAll(chunk); }
          const mediaPointer = '/paths/~1parts/post/requestBody/content/multipart~1form-data';
          // Feed real serializer bytes to both canonical MIME decoders, after
          // original deletion. Matching formInstance objects is insufficient.
          for (final source in [true, false]) {
            final id = source ? file.uri.toString() : review.result['outputRoot'] as String;
            final evaluated = await engine.request('evaluateSchemas', {
              'root': id, 'snapshot': 'multi-name-emitted-$source',
              'resources': source ? [{'id': id, 'text': text, 'generation': 0}] : review.result['outputs'],
              'runtimeInstances': [{'subject': 'request-body', 'location': 'emitted', 'text': base64Encode(emitted),
                'mediaType': prepared.body!.mediaType, 'mediaBase64': true, 'form': {'resource': id, 'pointer': mediaPointer},
                'schema': {'resource': id, 'pointer': '$mediaPointer/schema'}}],
            });
            expect(evaluated['complete'], true, reason: '$evaluated');
            expect((evaluated['runtimeEvaluations'] as List).every((value) => value['complete'] == true && value['valid'] == true), true, reason: '$evaluated');
          }
        });
      }
    }
  }
}
