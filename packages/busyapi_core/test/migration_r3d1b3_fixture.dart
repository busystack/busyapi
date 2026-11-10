import 'dart:convert';
import 'dart:io';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';
import 'test_support.dart';

void finiteTupleMultipartMigrationRegressions(String group) {
  for (final version in ['3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('R3d1b3 $group $version $format finite tuple publication and cold bytes', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-finite-tuple-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
        Map<String, Object?> part(Map<String, Object?> value) => {'type': 'object', 'required': ['tag'], 'additionalProperties': false, 'properties': {'tag': value}};
        final document = {'openapi': version, 'info': {'title': 'Original tuple', 'version': '1'},
          'servers': [{'url': 'https://example.test'}], 'paths': {'/parts': {'post': {
            'requestBody': {'content': {'multipart/form-data': {'schema': {'type': 'array', 'prefixItems': [
              part({'type': 'integer', 'const': 'EXACT'}), part({'type': 'string', 'enum': ['', '雪']}), part({'type': 'boolean'})],
              'items': false}, 'itemEncoding': {'contentType': 'application/json'}}}}, 'responses': {'204': {'description': 'Empty'}}}}}};
        final file = File('${directory.path}/api.$format');
        final raw = (format == 'json' ? jsonEncode(document) : '# Original tuple comment\r\n${document.entries.map((entry) => '${jsonEncode(entry.key)}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n').replaceAll('"EXACT"', '9007199254740993.00');
        await file.writeAsString(raw);
        final manifest = File('${directory.path}/busyapi.yaml');
        const configuration = 'version: 1\nroots: [{name: api, path: API}]\nenvironments: {dev: {variables: {keep: unchanged}}}\ntests:\n'
          '- name: selected\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: [{tag: 9007199254740993.00}, {tag: 雪}, {tag: true}], partMediaTypes: {tag: application/json}, partHeaders: []}\n'
          '- name: empty\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: []}\n'
          '- name: omitted\n  operation: {entry: api, method: POST, path: /parts}\n';
        await manifest.writeAsString(configuration.replaceFirst('API', 'api.$format'));
        final originalManifest = await manifest.readAsBytes();
        final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
        final root = project.roots.single.id, buffer = await project.buffer(project.roots.single.id);
        project.store.replace(root, buffer.text.replaceFirst('Original tuple', 'Unsaved tuple'));
        final target = group == 'swagger' ? '2.0' : '3.0.4';
        final review = await project.prepareMigration(root, '${directory.path}/output', targetVersion: target);addTearDown(review.close);
        expect(review.unsaved, true);
        if (group == 'swagger') {expect(review.publishable, false);expect(review.result['outputs'], isEmpty);return;}
        expect(review.publishable, true, reason: '${review.result}');expect(review.result['producerVersion'], '105');
        expect(review.result['manifestText'], contains('9007199254740993.00'));
        expect(review.result['manifest']['tests'][0]['body']['partMediaTypes'], {'tag': 'application/json'});
        expect(review.result['manifest']['tests'][1]['body']['value'], {'tag': []});expect(review.result['manifest']['tests'][2]['body'], isNull);
        expect(review.result['manifest']['environments']['dev']['variables']['keep'], 'unchanged');
        await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'cancelled')));
        final stale = await project.prepareMigration(root, '${directory.path}/stale', targetVersion: target);addTearDown(stale.close);
        final race = await project.prepareMigration(root, '${directory.path}/race', targetVersion: target);addTearDown(race.close);
        await expectLater(race.publish(beforePublish: () async {await Directory(race.destination).create();await File('${race.destination}/foreign').writeAsString('Keep');}), throwsA(anything));
        expect(await File('${race.destination}/foreign').readAsString(), 'Keep');
        await review.publish();
        project.store.replace(root, buffer.text.replaceFirst('Original tuple', 'Changed tuple'));
        await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'migration.stale')));
        expect(await Directory(stale.destination).exists(), false);
        expect(await file.readAsString(), raw);expect(await manifest.readAsBytes(), originalManifest);
        final preview = await Process.run('$testBundle/busyapi', ['migrate', directory.path, '--target', target, '--output', '${directory.path}/cli', '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(preview.exitCode, 0, reason: '${preview.stdout} ${preview.stderr}');
        final report = jsonDecode(preview.stdout as String) as Map;expect(report['producerVersion'], '105');expect(report['published'], false);
        expect(report['configurationProjections'], isNotEmpty);
        await file.delete();await manifest.delete();
        final cold = await BusyProject.open(review.destination, engine);addTearDown(cold.close);
        final checked = await cold.check(cold.roots.single.id);expect(checked['complete'], true);
        final operation = (checked['projection']['operations'] as List).single as Map;
        final plan = await cold.prepareRequest(cold.roots.single.id, resource: operation['resource'] as String,
          pointer: operation['pointer'] as String, occurrence: operation['occurrence'] as String);addTearDown(plan.close);
        final prepared = await const ContractRequestBuilder().build(plan, OperationRequestDraft(planIdentity: plan.identity,
          body: RequestBodyDraft.multipartValue(json: '{"tag":[9007199254740993.00,"雪",true]}')), resolveSecret: (_) async => null);
        addTearDown(prepared.body!.close);
        final emitted = <int>[];await for (final chunk in prepared.body!.open()) {emitted.addAll(chunk);}
        const at = '/paths/~1parts/post/requestBody/content/multipart~1form-data';
        for (final source in [true, false]) {
          final id = source ? file.uri.toString() : review.result['outputRoot'] as String;
          final evaluated = await engine.request('evaluateSchemas', {'root': id, 'snapshot': 'tuple-cold-$source',
            'resources': source ? [{'id': id, 'text': raw, 'generation': 0}] : review.result['outputs'],
            'runtimeInstances': [{'subject': 'request-body', 'location': 'tuple-bytes', 'text': base64Encode(emitted), 'mediaBase64': true,
              'mediaType': prepared.body!.mediaType, 'form': {'resource': id, 'pointer': at}, 'schema': {'resource': id, 'pointer': '$at/schema'}}]});
          expect(evaluated['complete'], true, reason: '$evaluated');
          expect((evaluated['runtimeEvaluations'] as List).every((value) => value['complete'] == true && value['valid'] == true), true, reason: '$evaluated');
        }
      });
    }
  }
}
