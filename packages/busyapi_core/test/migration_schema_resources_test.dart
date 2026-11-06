import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'migration_schema_resource_fixture.dart';
import 'test_support.dart';

void main() {
  for (final target in ['3.1.2', '3.2.1']) {
    test('whole schema resources retain dynamic scope, dialect, unsaved review and cold CLI behavior for $target', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-schema-resources-');addTearDown(() => directory.delete(recursive: true));
      final originals = schemaResourceDocuments();
      for (final entry in originals.entries) {
        final file = File('${directory.path}/${entry.key}');await file.parent.create(recursive: true);await file.writeAsString(entry.value);
      }
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
      final roots = [for (final name in ['first', 'second']) File('${directory.path}/$name/api.yaml').uri.toString()];
      Future<void> exercise(BusyProject project, String root, String name) async {
        final checked = await project.check(root);expect(checked['status'], 'complete', reason: '$checked');
        final request = await project.prepareRequest(root, resource: root, pointer: '/paths/~1p/get');
        try {
          final result = await request.evaluateRuntime([
            for (final schema in ['Node', 'Strict']) for (final text in schemaResourceInstances(name)) RuntimeSchemaInstance(
              subject: 'response-body', location: schema, text: text, schemaResource: root, schemaPointer: '/components/schemas/$schema'),
          ]);
          expect(result['complete'], true, reason: '$result');
          expect((result['runtimeEvaluations'] as List).map((value) => value['valid']),
            [true, true, true, true, false, false, false, true, false, true, false, false]);
        } finally { request.close(); }
      }
      for (final (index, root) in roots.indexed) await exercise(source, root, ['First', 'Second'][index]);
      final first = await source.buffer(roots.first);source.store.replace(first.id, first.text.replaceFirst('First', 'Captured First'));
      final part = await source.buffer(File('${directory.path}/data/parts.yaml').uri.toString());
      source.store.replace(part.id, part.text.replaceFirst('Resource values', 'Unsaved resource values'));
      final capturedParts = (await source.buffer(part.id)).text;
      final stale = await source.prepareMigration(roots.first, '${directory.path}/stale', targetVersion: target);addTearDown(stale.close);
      expect(stale.publishable, true, reason: '${stale.result}');expect(stale.unsaved, true);
      source.store.replace(first.id, (await source.buffer(first.id)).text.replaceFirst('Captured First', 'Current First'));
      await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
      expect(Directory(stale.destination).existsSync(), false);
      for (final failure in ['cancel', 'failure', 'race']) {
        final review = await source.prepareMigration(roots.first, '${directory.path}/$failure', targetVersion: target);addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');var cancelled = false;
        await expectLater(review.publish(cancelled: () => cancelled, beforePublish: () async {
          if (failure == 'cancel') cancelled = true;
          if (failure == 'failure') throw const FileSystemException('Controlled resource publication failure');
          if (failure == 'race') {await Directory(review.destination).create();await File('${review.destination}/foreign').writeAsString('Keep');}
        }), throwsA(anything));
        if (failure == 'race') {
          expect(await File('${review.destination}/foreign').readAsString(), 'Keep');expect(Directory(review.destination).listSync(), hasLength(1));
        } else { expect(Directory(review.destination).existsSync(), false); }
      }
      final review = await source.prepareMigration(roots.first, '${directory.path}/output', targetVersion: target);addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');expect(review.result['producerVersion'], '88');
      await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
      expect(Directory(review.destination).existsSync(), false);await review.publish();
      final names = [for (final root in roots) Uri.parse(review.changes.singleWhere((change) => change.resource == root).destination).pathSegments.last];
      final partsCopy = review.changes.singleWhere((change) => change.resource == part.id).destination;
      expect(await File.fromUri(Uri.parse(partsCopy)).readAsString(), capturedParts);
      expect(await File('${review.destination}/${names.first}').readAsString(), contains('https://json-schema.org/draft/2020-12/schema'));
      for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
      source.close();final moved = await Directory(review.destination).rename('${directory.path}/cold 雪');
      for (final name in originals.keys) await File('${directory.path}/$name').delete();
      final cold = await BusyProject.open(moved.path, engine);addTearDown(cold.close);
      for (final (index, name) in names.indexed) await exercise(cold, File('${moved.path}/$name').uri.toString(), ['First', 'Second'][index]);
      final cli = await Process.run('$testBundle/busyapi', ['migrate', moved.path, '--root', 'migrated', '--target', target, '--output', '${directory.path}/cli-review', '--review', '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');final report = jsonDecode(cli.stdout as String) as Map;
      expect(report['producerVersion'], '88');expect(report['complete'], true);expect(report['published'], false);
      expect(Directory('${directory.path}/cli-review').existsSync(), false);
    });
  }
  test('unsupported nested dialects remain incomplete in Core and CLI resource reviews', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-unproved-resources-');addTearDown(() => directory.delete(recursive: true));
    final originals = schemaResourceDocuments(invalid: true);
    for (final entry in originals.entries) {
      final file = File('${directory.path}/${entry.key}');await file.parent.create(recursive: true);await file.writeAsString(entry.value);
    }
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
    final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
    final review = await project.prepareMigration(File('${directory.path}/first/api.yaml').uri.toString(), '${directory.path}/refused', targetVersion: '3.2.1');addTearDown(review.close);
    expect(review.publishable, false);expect(review.result['outputs'], isEmpty);
    expect((review.result['problems'] as List).whereType<Map>().any((problem) => problem['code'].toString().contains('dialect')), true);
    await expectLater(review.publish(), throwsA(isA<CoreFailure>()));expect(Directory(review.destination).existsSync(), false);
    final cli = await Process.run('$testBundle/busyapi', ['migrate', directory.path, '--root', 'first', '--target', '3.2.1', '--output', '${directory.path}/cli-refused', '--review', '--json'],
      environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
    expect(cli.exitCode, isNot(0));final report = jsonDecode(cli.stdout as String) as Map;
    expect(report['complete'], false);expect(report['outputs'], isEmpty);expect(Directory('${directory.path}/cli-refused').existsSync(), false);
    for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
  });
}
