import 'dart:convert';
import 'dart:io';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';
import 'test_support.dart';
import 'migration_r3d1b2_fixture.dart';
import 'migration_r3d1b3_fixture.dart';

// Prepared through the existing form, binary and Swagger migration gates.
void namedMultipartMigrationRegressions(String group) {
  multiNameMultipartMigrationRegressions(group);
  finiteTupleMultipartMigrationRegressions(group);
  for (final version in ['3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      for (final target in group == 'swagger' ? ['2.0'] : ['3.1.2', '3.0.4']) {
        test('R3d1b $group $version $format to $target saved publication', () async {
          final directory = await Directory.systemTemp.createTemp('busyapi-r3d1b-');
          addTearDown(() => directory.delete(recursive: true));
          final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
          addTearDown(engine.close);
          final binary = group == 'binary';
          final part = {'type': 'object', 'required': ['tag'], 'additionalProperties': false,
            'properties': {'tag': {'type': 'string', if (binary) 'contentEncoding': 'base64'}}};
          final rule = {'contentType': binary ? 'application/octet-stream' : 'text/plain; charset=utf-8',
            if (binary) 'headers': {'Content-Transfer-Encoding': {'required': true, 'schema': {'type': 'string', 'enum': ['base64']}}}};
          final value = {'openapi': version, 'info': {'title': 'Captured named', 'version': '1'},
            'paths': {'/parts': {'post': {'requestBody': {'required': true, 'content': {'multipart/form-data': {
              'schema': {'type': 'array', 'maxItems': 3, 'items': part}, 'prefixEncoding': [rule], 'itemEncoding': rule,
            }}}, 'responses': {'204': {'description': 'Empty'}}}}}};
          final source = File('${directory.path}/api.$format');
          final text = format == 'json' ? jsonEncode(value) : '# Retain named source\r\n${value.entries.map((entry) => '${jsonEncode(entry.key)}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n';
          await source.writeAsString(text);
          final manifest = File('${directory.path}/busyapi.yaml');
          await manifest.writeAsString('version: 1\nroots: [{name: api, path: api.$format}]\nenvironments: {dev: {variables: {keep: unchanged}}}\ntests:\n- name: named\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: [{tag: "${binary ? 'AP8=' : 'snow'}"}, {tag: ""}]}\n- name: empty\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: []}\n');
          final originalSource = await source.readAsBytes(), originalManifest = await manifest.readAsBytes();
          final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
          final root = project.roots.single.id, buffer = await project.buffer(project.roots.single.id);
          project.store.replace(root, buffer.text.replaceFirst('Captured named', 'Unsaved named'));
          final review = await project.prepareMigration(root, '${directory.path}/output', targetVersion: target);addTearDown(review.close);
          expect(review.unsaved, true);
          if (group == 'swagger') {
            expect(review.publishable, false);expect(review.result['outputs'], isEmpty);return;
          }
          expect(review.publishable, true, reason: '${review.result}');
          expect(review.configurationProjections.where((projection) => projection.pointer.endsWith('/body')).length, 2);
          expect(review.result['manifest']['tests'][0]['body']['value'], {'tag': [binary ? 'AP8=' : 'snow', '']});
          expect(review.result['manifest']['tests'][1]['body']['value'], {'tag': []});
          await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'cancelled')));
          expect(await Directory(review.destination).exists(), false);
          final stale = await project.prepareMigration(root, '${directory.path}/stale', targetVersion: target);addTearDown(stale.close);
          final race = await project.prepareMigration(root, '${directory.path}/race', targetVersion: target);addTearDown(race.close);
          await expectLater(race.publish(beforePublish: () async {
            await Directory(race.destination).create();await File('${race.destination}/foreign').writeAsString('Keep');
          }), throwsA(anything));
          expect(await File('${race.destination}/foreign').readAsString(), 'Keep');
          await review.publish();
          project.store.replace(root, buffer.text.replaceFirst('Captured named', 'Changed after review'));
          await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'migration.stale')));
          expect(await Directory(stale.destination).exists(), false);
          expect(await source.readAsBytes(), originalSource);expect(await manifest.readAsBytes(), originalManifest);
          final preview = await Process.run('$testBundle/busyapi', ['migrate', directory.path, '--target', target, '--output', '${directory.path}/cli', '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
          expect(preview.exitCode, 0, reason: '${preview.stdout} ${preview.stderr}');
          expect((jsonDecode(preview.stdout as String) as Map)['configurationProjections'], isNotEmpty);
          await source.delete();await manifest.delete();
          final cold = await BusyProject.open(review.destination, engine);addTearDown(cold.close);
          expect((await cold.check(cold.roots.single.id))['complete'], true);
        });
      }
    }
  }
}
