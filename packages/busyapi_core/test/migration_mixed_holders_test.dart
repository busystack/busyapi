import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';
import 'package:yaml/yaml.dart';

import 'migration_mixed_holder_fixture.dart';
import 'test_support.dart';

void main() {
  for (final version in ['3.0.4', '3.1.2', '3.2.1']) {
    test('foreign $version Path Item holders retain captured HTTP, review, configuration, cold reopen and CLI behavior', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-mixed-holders-');
      addTearDown(() => directory.delete(recursive: true));
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final observed = <String>[];
      server.listen((request) async {
        expect(request.method, 'POST');expect(['/p', '/local'], contains(request.uri.path));
        expect(utf8.decode(await request.fold<List<int>>([], (bytes, chunk) => bytes..addAll(chunk))), mixedHolderWire);
        final name = request.headers.value('X-First') != null ? 'First' : 'Second';
        expect(request.headers.value('X-$name'), 'controlled-key');observed.add(name);
        request.response.headers.set('content-type', 'application/json');
        request.response.add(utf8.encode(mixedHolderWire));await request.response.close();
      });
      final originals = mixedHolderDocuments(version, 'http://127.0.0.1:${server.port}');
      for (final entry in originals.entries) await File('${directory.path}/${entry.key}').writeAsString(entry.value);
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
      final roots = [for (final name in ['a.yaml', 'b.yaml']) File('${directory.path}/$name').uri.toString()];
      Future<void> exercise(BusyProject project, String root, String name) async {
        final checked = await project.check(root);expect(checked['status'], 'complete', reason: '$checked');
        final operations = (checked['projection']['operations'] as List).whereType<Map>().where((operation) => operation['path'] == (version == '3.0.4' && name == 'First' ? '/local' : '/p'));
        expect(operations, hasLength(1));final operation = operations.single;
        final page = await project.inspectObject(root, operation['resource'], operation['pointer'], contextKind: 'operation');
        expect((jsonDecode(await project.readDataValue(page)) as Map)['operationId'], version == '3.0.4' && name == 'First' ? 'local' : 'shared');
        if (version == '3.0.4' && name == 'First') {
          final link = await project.inspectObject(root, root, '/components/links/Use', contextKind: 'link');
          final binding = (link['references'] as List).whereType<Map>().singleWhere((reference) => reference['connection'] == 'operationRef');
          expect(binding['resolution'], 'resolved');
          final foreign = await project.inspectObject(root, binding['targetResource'], binding['targetPointer'], contextKind: 'operation');
          expect((jsonDecode(await project.readDataValue(foreign)) as Map)['operationId'], 'shared');
        }
        final plan = await project.prepareRequest(root, resource: operation['resource'], pointer: operation['pointer'], occurrence: operation['occurrence']);
        try {
          final body = (plan.result['responses'][0]['content'][0]['schema'] as Map);
          final evaluated = await plan.evaluateRuntime([
            for (final text in [mixedHolderWire, '{"entry":"chosen","n":9007199254740992}', '{"n":0}',
              if (version != '3.0.4') ...['{"entry":"chosen","n":9007199254740993,"child":{"entry":"chosen","n":9007199254740993}}', '{"entry":"chosen","n":9007199254740993,"child":{"n":0}}']]) RuntimeSchemaInstance(
              subject: 'response-body', location: 'application/json', text: text,
              schemaResource: body['resource'], schemaPointer: body['pointer']),
          ]);
          expect(evaluated['complete'], true, reason: '$evaluated');
          expect((evaluated['runtimeEvaluations'] as List).map((value) => value['valid']), [true, false, false, if (version != '3.0.4') ...[true, false]]);
          final schemes = (plan.result['security']['schemes'] as Map).values.whereType<Map>();
          expect(schemes.single['parameterName'], 'X-$name');
          final response = await const ContractRequestExecutor().execute(plan,
            OperationRequestDraft(planIdentity: plan.identity, environment: 'manual',
              body: RequestBodyDraft.raw(mediaType: 'application/json', text: mixedHolderWire)),
            resolveSecret: (reference) async { expect(reference, mixedHolderSecret);return 'controlled-key'; });
          try {
            expect(response.conforming, true, reason: '${response.outgoing.findings} ${response.received.findings}');
            expect(await response.response.bytes(), utf8.encode(mixedHolderWire));expect(observed.last, name);
          } finally { await response.close(); }
        } finally { plan.close(); }
      }
      await exercise(source, roots[0], 'First');await exercise(source, roots[1], 'Second');
      final buffer = await source.buffer(roots[0]);source.store.replace(buffer.id, buffer.text.replaceFirst('First', 'Captured First'));
      final target = version == '3.2.1' ? '3.1.2' : '3.2.1';
      final stale = await source.prepareMigration(roots[0], '${directory.path}/stale', targetVersion: target);addTearDown(stale.close);
      expect(stale.publishable, true, reason: '${stale.result}');
      source.store.replace(buffer.id, source.store.buffers[buffer.id]!.text.replaceFirst('Captured First', 'Current First'));
      await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
      expect(Directory(stale.destination).existsSync(), false);
      final review = await source.prepareMigration(roots[0], '${directory.path}/output', targetVersion: target);addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');expect(review.result['producerVersion'], '80');expect(review.unsaved, true);
      await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
      expect(Directory(review.destination).existsSync(), false);await review.publish();
      final destinations = [for (final root in roots) Uri.parse(review.changes.singleWhere((change) => change.resource == root).destination).pathSegments.last];
      final manifest = loadYaml(await File('${review.destination}/busyapi.yaml').readAsString()) as Map;
      final schemes = manifest['environments']['manual']['authentication']['schemes'] as Map;
      expect(schemes.keys.where((name) => name.toString().startsWith('_migrated_security_owner_')), isNotEmpty);
      for (final value in schemes.values) expect(value['secretRef'], mixedHolderSecret);
      for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
      final foreignCopy = loadYaml(await File('${review.destination}/${destinations[1]}').readAsString()) as Map;
      final originalForeign = loadYaml(originals['b.yaml']!) as Map;
      expect(foreignCopy['x-history'], originalForeign['x-history']);expect(foreignCopy['x-alias'], originalForeign['x-alias']);
      expect(await File('${review.destination}/${destinations[1]}').readAsString(), contains('9007199254740993.00'));
      source.close();final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');
      for (final name in originals.keys) await File('${directory.path}/$name').delete();
      final cold = await BusyProject.open(relocated.path, engine);addTearDown(cold.close);
      for (final (index, name) in ['First', 'Second'].indexed) await exercise(cold, File('${relocated.path}/${destinations[index]}').uri.toString(), name);
      final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
      final preview = await Process.run('$testBundle/busyapi', ['migrate', relocated.path, '--root', 'migrated', '--target', target, '--output', '${directory.path}/cli-preview', '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(preview.exitCode, 0, reason: '${preview.stdout} ${preview.stderr}');
      final report = jsonDecode(preview.stdout as String) as Map;
      expect(report['producerVersion'], '80');expect(report['complete'], true);expect(report['published'], false);
      expect(Directory('${directory.path}/cli-preview').existsSync(), false);
    });
  }
  test('mixed holder source failure cannot publish through Core or CLI', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-mixed-holder-refusal-');
    addTearDown(() => directory.delete(recursive: true));
    final originals = mixedHolderDocuments('3.0.4', 'https://api.invalid', invalid: true);
    for (final entry in originals.entries) await File('${directory.path}/${entry.key}').writeAsString(entry.value);
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
    final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
    final review = await source.prepareMigration(File('${directory.path}/a.yaml').uri.toString(), '${directory.path}/refused', targetVersion: '3.2.1');
    addTearDown(review.close);expect(review.publishable, false);expect(review.result['outputs'], isEmpty);
    await expectLater(review.publish(), throwsA(isA<CoreFailure>()));expect(Directory(review.destination).existsSync(), false);
    final cli = await Process.run('$testBundle/busyapi', ['migrate', directory.path, '--root', 'first', '--target', '3.2.1', '--output', '${directory.path}/cli-refused', '--review', '--json'],
      environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
    expect(cli.exitCode, isNot(0));
    final report = jsonDecode(cli.stdout as String) as Map;expect(report['producerVersion'], '80');expect(report['complete'], false);expect(report['outputs'], isEmpty);
    expect(Directory('${directory.path}/cli-refused').existsSync(), false);
    for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
  });
}
