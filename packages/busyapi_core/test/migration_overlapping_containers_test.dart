import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'migration_mixed_holder_fixture.dart';
import 'test_support.dart';

void main() {
  for (final restricted in ['2.0', '3.0.4']) {
    test('$restricted/3.1 overlapping containers retain unsaved capture, atomic publication and cold CLI review', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-overlapping-containers-');
      addTearDown(() => directory.delete(recursive: true));
      final originals = mixedLegacyHolderDocuments('https://api.invalid', restrictedVersion: restricted, overlappingContainers: true);
      for (final entry in originals.entries) {
        final file = File('${directory.path}/${entry.key}');await file.parent.create(recursive: true);await file.writeAsString(entry.value);
      }
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
      final legacy = File('${directory.path}/legacy/api.yaml').uri.toString();
      final modern = File('${directory.path}/modern/api.yaml').uri.toString();
      Future<Map> target(BusyProject project, String root, String pointer, String kind) async {
        final page = await project.inspectObject(root, root, pointer, contextKind: kind);
        final edge = (page['references'] as List).whereType<Map>().singleWhere((reference) => reference['keyword'] == r'$ref');
        expect(edge['resolution'], 'resolved');return edge;
      }
      Future<void> inspect(BusyProject project, String root, {required bool copied}) async {
        final checked = await project.check(root);expect(checked['status'], 'complete', reason: '$checked');
        final edge = await target(project, root, '/components/examples/Dictionary', 'example');
        if (copied) expect(edge['targetPointer'], startsWith('/components/examples/_migrated_object_use_'));
        final page = await project.inspectObject(root, edge['targetResource'], edge['targetPointer'], contextKind: 'example');
        final text = await project.readDataValue(page);
        expect(text, contains('9007199254740993.00'));
        final data = jsonDecode(text) as Map;
        final literal = data['value']['x-literal'] as Map;
        expect(data.keys, ['value']);expect(literal['flag'], false);expect(literal['empty'], '');expect(literal[r'$ref'], 'literal-only');
        if (copied) for (final name in ['ExampleMap', 'SchemaMap']) {
          final schema = await target(project, root, '/components/schemas/$name', 'schema');
          expect(schema['targetPointer'], startsWith('/components/schemas/_migrated_schema_use_'));
          final view = await project.inspectObject(root, schema['targetResource'], schema['targetPointer'], contextKind: 'schema');
          final data = jsonDecode(await project.readDataValue(view)) as Map;
          expect(data.keys.where((key) => key.toString().startsWith('_migrated_')), isEmpty,
            reason: 'Independent dictionary annotations must read the immutable capture');
        }
        final request = await project.prepareRequest(root, resource: root, pointer: '/paths/~1value/get');
        try {
          final evaluated = await request.evaluateRuntime([
            for (final text in ['[]', '[[]]', '[0]', 'null']) RuntimeSchemaInstance(subject: 'response-body', location: 'recursive', text: text,
              schemaResource: root, schemaPointer: '/components/schemas/Node'),
          ]);
          expect(evaluated['complete'], true, reason: '$evaluated');
          expect((evaluated['runtimeEvaluations'] as List).map((value) => value['valid']), [true, true, false, false]);
        } finally { request.close(); }
      }
      await inspect(source, modern, copied: false);
      final buffer = await source.buffer(legacy);source.store.replace(legacy, buffer.text.replaceFirst('First', 'Captured First'));
      final stale = await source.prepareMigration(legacy, '${directory.path}/stale', targetVersion: '3.2.1');addTearDown(stale.close);
      expect(stale.publishable, true, reason: '${stale.result}');expect(stale.unsaved, true);
      source.store.replace(legacy, (await source.buffer(legacy)).text.replaceFirst('Captured First', 'Current First'));
      await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
      expect(Directory(stale.destination).existsSync(), false);
      for (final failure in ['race', 'cancel', 'failure']) {
        final attempted = await source.prepareMigration(legacy, '${directory.path}/$failure', targetVersion: '3.2.1');addTearDown(attempted.close);
        expect(attempted.publishable, true, reason: '${attempted.result}');var cancelled = false;
        await expectLater(attempted.publish(cancelled: () => cancelled, beforePublish: () async {
          if (failure == 'race') {
            await Directory(attempted.destination).create();await File('${attempted.destination}/foreign').writeAsString('Keep');
          }
          if (failure == 'cancel') cancelled = true;
          if (failure == 'failure') throw const FileSystemException('Controlled container publication failure');
        }), throwsA(anything));
        if (failure == 'race') {
          expect(await File('${attempted.destination}/foreign').readAsString(), 'Keep');
          expect(Directory(attempted.destination).listSync().whereType<File>(), hasLength(1));
        } else { expect(Directory(attempted.destination).existsSync(), false); }
        for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
      }
      final review = await source.prepareMigration(legacy, '${directory.path}/output', targetVersion: '3.2.1');addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');expect(review.result['producerVersion'], '101');
      await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
      expect(Directory(review.destination).existsSync(), false);await review.publish();
      final modernName = Uri.parse(review.changes.singleWhere((change) => change.resource == modern).destination).pathSegments.last;
      final shared = File('${directory.path}/models/shared.yaml').uri.toString();
      expect(await File.fromUri(Uri.parse(review.changes.singleWhere((change) => change.resource == shared).destination)).readAsString(), originals['models/shared.yaml']);
      for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
      source.close();final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');
      for (final name in originals.keys) await File('${directory.path}/$name').delete();
      final cold = await BusyProject.open(relocated.path, engine);addTearDown(cold.close);
      await inspect(cold, File('${relocated.path}/$modernName').uri.toString(), copied: true);
      for (final root in cold.roots) expect((await cold.check(root.id))['status'], 'complete');
      final cli = await Process.run('$testBundle/busyapi', ['migrate', relocated.path, '--root', 'migrated', '--target', '3.2.1', '--output', '${directory.path}/cli-review', '--review', '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
      final report = jsonDecode(cli.stdout as String) as Map;
      expect(report['producerVersion'], '101');expect(report['complete'], true);expect(report['published'], false);
      expect(Directory('${directory.path}/cli-review').existsSync(), false);
    });
  }
}
