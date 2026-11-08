import 'dart:convert';
import 'dart:io';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';
import 'test_support.dart';
import 'migration_r3d1b_fixture.dart';

// Registered through the existing form, binary and Swagger migration gates.
void positionalMigrationRegressions(String group) {
  namedMultipartMigrationRegressions(group);
  for (final version in ['3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('R3d1 $group $version $format captured publication and cold reopening', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-r3d1-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final binary = group == 'binary';
        final value = {
          'openapi': version, 'info': {'title': 'Original positional', 'version': '1'},
          'paths': {'/parts': {'post': {
            'requestBody': {'required': true, 'content': {'multipart/mixed': {
              'schema': {'type': 'array', 'maxItems': 3, 'items': {
                'type': 'string', if (binary) 'contentEncoding': 'base64',
              }},
              'prefixEncoding': [{'contentType': binary ? 'application/octet-stream' : 'text/plain'}],
              'itemEncoding': {'contentType': binary ? 'application/octet-stream' : 'text/plain'},
            }}}, 'responses': {'204': {'description': 'Empty'}},
          }}},
        };
        final text = format == 'json' ? jsonEncode(value) : '# Retain positional source\r\n${value.entries.map((e) => '${jsonEncode(e.key)}: ${jsonEncode(e.value)}').join('\r\n')}\r\n';
        final file = File('${directory.path}/api.$format'); await file.writeAsString(text);
        final original = await file.readAsBytes();
        final project = await BusyProject.open(file.path, engine); addTearDown(project.close);
        final root = project.roots.single.id, buffer = await project.buffer(project.roots.single.id);
        project.store.replace(root, buffer.text.replaceFirst('Original positional', 'Unsaved positional'));
        final target = group == 'swagger' ? '2.0' : '3.1.2';
        final review = await project.prepareMigration(root, '${directory.path}/output', targetVersion: target);addTearDown(review.close);
        expect(review.unsaved, true);
        if (group == 'swagger') {
          expect(review.publishable, false);expect(review.result['outputs'], isEmpty);
          expect('${review.result}', contains('target-representation'));
          expect(await Directory(review.destination).exists(), false);return;
        }
        expect(review.publishable, true, reason: '${review.result}');
        await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'cancelled')));
        expect(await Directory(review.destination).exists(), false);
        final race = await project.prepareMigration(root, '${directory.path}/race', targetVersion: target);addTearDown(race.close);
        await expectLater(race.publish(beforePublish: () async {
          await Directory(race.destination).create();await File('${race.destination}/foreign').writeAsString('Keep');
        }), throwsA(anything));
        expect(await File('${race.destination}/foreign').readAsString(), 'Keep');
        await review.publish();
        final reopened = await BusyProject.open(review.destination, engine);addTearDown(reopened.close);
        expect((await reopened.check(reopened.roots.single.id))['complete'], true);
        expect(await file.readAsBytes(), original);
        final cli = await Process.run('$testBundle/busyapi', ['migrate', file.path, '--target', target, '--output', '${directory.path}/cli', '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');expect((jsonDecode(cli.stdout as String) as Map)['complete'], true);
        final stale = await project.prepareMigration(root, '${directory.path}/stale', targetVersion: target);addTearDown(stale.close);
        project.store.replace(root, buffer.text.replaceFirst('Unsaved positional', 'Changed positional'));
        await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'migration.stale')));
        expect(await Directory(stale.destination).exists(), false);
      });
    }
  }
}
