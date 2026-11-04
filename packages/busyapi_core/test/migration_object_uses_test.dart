import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';
import 'migration_mixed_holder_fixture.dart';

void main() {
  mixedLegacyObjectUses();
  for (final format in ['yaml', 'json']) {
    test('$format native literal owners retain examples, actual HTTP and CLI behavior after publication', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-object-uses-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      const count = '9007199254740993.00', query = 'n=9007199254740993';
      final observedQueries = <String>[], observedBodies = <List<int>>[];
      server.listen((request) async {
        expect(request.method, 'POST');
        expect(request.uri.path, '/echo');
        observedQueries.add(request.uri.query);
        observedBodies.add(await request.fold<List<int>>([], (all, part) => all..addAll(part)));
        request.response.headers.set('content-type', 'application/json');
        request.response.headers.set('X-Count', count);
        request.response.add(utf8.encode(count));
        await request.response.close();
      });
      Map<String, Object?> ref(String name) => {r'$ref': '#/x-data/$name'};
      Map<String, Object?> schema() => {r'$ref': '#/components/schemas/Count'};
      Map<String, Object?> media() => {'schema': schema(), 'examples': {'Captured': ref('example')}};
      final data = {
        'example': {'description': '[Example](../guide.md)', 'externalValue': 'count.bin'},
        'queryExample': {'externalValue': 'query.bin'},
        'header': {'description': '[Header](../header.md)',
          'content': {'application/json': {'schema': schema()}}, 'examples': {'Captured': ref('example')}},
        'parameter': {'name': 'n', 'in': 'query', 'required': true, 'schema': schema(),
          'examples': {'Captured': ref('queryExample')}},
        'body': {r'$ref': '#/components/responses/Shared'},
        'response': {'description': '[Reply](../reply.md)', 'content': {'application/json': media()},
          'headers': {'X-Count': ref('header')}},
      };
      final value = <String, Object?>{
        'openapi': '3.1.2', 'info': {'title': 'Original', 'version': 'business'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/echo': {'post': {'parameters': [ref('parameter')], 'requestBody': ref('body'),
          'responses': {'200': ref('response')}}}},
        'components': {
          'schemas': {'Count': {'type': 'integer', 'enum': ['EXACT']}},
          'responses': {'Shared': {
            'description': '[Shared body](../shared.md)',
            'content': {'application/json': media()},
          }},
        },
        'x-data': data,
      };
      final original = (format == 'yaml'
          ? '# Preserve native/data source 雪\r\n${value.entries.map((entry) => '${jsonEncode(entry.key)}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n'
          : jsonEncode(value)).replaceAll('"EXACT"', count);
      final file = File('${directory.path}/api.$format'), countFile = File('${directory.path}/count.bin'),
          queryFile = File('${directory.path}/query.bin');
      await file.writeAsString(original);
      await countFile.writeAsString(count);
      await queryFile.writeAsString(query);
      final project = await BusyProject.open(file.path, engine);
      addTearDown(project.close);
      final root = file.uri.toString();
      project.store.replace(root, original.replaceFirst('Original', 'Captured 雪'));

      Future<void> send(BusyProject owner, String selectedRoot, {bool valid = true}) async {
        final plan = await owner.prepareRequest(selectedRoot, resource: selectedRoot, pointer: '/paths/~1echo/post');
        try {
          final parameter = (plan.result['parameters'] as List).single as Map;
          final parameterExample = (parameter['examples'] as List).single as Map;
          final body = plan.result['requestBody'] as Map;
          final bodyExample = (((body['content'] as List).single as Map)['examples'] as List).single as Map;
          expect(parameterExample['conversionError'], isNull);
          expect(parameterExample['raw'], query);
          expect(bodyExample['conversionError'], isNull);
          expect(bodyExample['raw'], count);
          final result = await const ContractRequestExecutor().execute(plan,
              OperationRequestDraft(planIdentity: plan.identity, parameters: {
                OperationRequestDraft.parameterKey('query', 'n'):
                    RequestValue.serialized(valid ? parameterExample['raw'] as String : 'n=0'),
              }, body: RequestBodyDraft.raw(mediaType: 'application/json', text: bodyExample['raw'] as String)),
              resolveSecret: (_) async => null);
          try {
            expect(result.outgoing.complete, true, reason: '${result.outgoing.findings}');
            expect(result.outgoing.valid, valid, reason: '${result.outgoing.findings}');
            expect(result.received.complete, true, reason: '${result.received.findings}');
            expect(result.received.valid, true, reason: '${result.received.findings}');
            expect(result.conforming, valid);
            expect(await result.response.bytes(), utf8.encode(count));
            expect(result.response.headers.where((field) => field.$1.toLowerCase() == 'x-count').single.$2, count);
            expect(observedBodies.last, utf8.encode(count));
            expect(observedQueries.last, valid ? query : 'n=0');
          } finally { await result.close(); }
        } finally { plan.close(); }
      }

      for (final kind in ['response', 'request-body']) {
        final page = await project.inspectObject(
          root, root, '/components/responses/Shared', contextKind: kind,
        );
        expect(page['kind'], kind);
        expect((page['interpretations'] as List).map((role) => role['kind']),
            containsAll(['response', 'request-body']));
        expect((page['fields'] as List).any((field) =>
            field['name'] == (kind == 'response' ? 'headers' : 'required')), true);
        final reference = await project.referencePage(
          root, root, '/components/responses/Shared', contextKind: kind,
        );
        expect(reference['kind'], kind);
      }
      await expectLater(
        project.inspectObject(root, root, '/components/responses/Shared',
            contextKind: 'parameter'),
        throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'inspect.context.stale')),
      );
      await send(project, root);
      final review = await project.prepareMigration(root, '${directory.path}/converted', targetVersion: '3.2.1');
      addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');
      expect(review.result['producerVersion'], '81');
      expect(review.unsaved, true);
      expect(review.exampleCopies.map((copy) => copy.bytes), containsAll([utf8.encode(count), utf8.encode(query)]));
      await review.publish();
      expect(await file.readAsString(), original);
      expect(await countFile.readAsString(), count);
      expect(await queryFile.readAsString(), query);
      final moved = await Directory(review.destination).rename('${directory.path}/moved 雪');
      project.close();
      await file.delete(); await countFile.delete(); await queryFile.delete();
      final output = await BusyProject.open(moved.path, engine);
      addTearDown(output.close);
      final outputRoot = output.roots.single.id;
      final checked = await output.check(outputRoot);
      expect(checked['complete'], true, reason: '$checked');
      final examples = checked['categories']['openapi']['schema']['serializedExamples'] as List;
      expect(examples.every((example) => example['complete'] == true && example['valid'] == true), true);
      final inspected = await output.inspectObject(outputRoot, outputRoot, '');
      final text = await output.readDataValue(inspected);
      final document = jsonDecode(text) as Map;
      expect(document['x-data'], data);
      expect(text, contains(count));
      expect(document['info']['title'], 'Captured 雪');
      await send(output, outputRoot);
      await send(output, outputRoot, valid: false);
      final cli = await Process.run('$testBundle/busyapi', ['check', moved.path, '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
      expect((jsonDecode(cli.stdout as String) as Map)['complete'], true);
      expect(observedBodies, hasLength(3));
    });
  }
}

void mixedLegacyObjectUses() {
  for (final (restrictedVersion, target) in [('2.0', '3.2.1'), ('2.0', '2.0'), ('3.0.4', '3.2.1'), ('3.0.4', '3.0.4')]) {
    test('$restrictedVersion/modern anonymous owners retain captured HTTP, distinct bases, publication and CLI for $target', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-mixed-legacy-objects-');
      addTearDown(() => directory.delete(recursive: true));
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      final seen = <String>[];
      server.listen((request) async {
        if (request.uri.path == '/p') {
          expect(request.method, 'POST');
          final name = request.headers.value('X-First') != null ? 'First' : 'Second';
          expect(request.headers.value('X-$name'), 'controlled-key');seen.add(name);
          request.response.statusCode = 204;
        } else {
          expect(request.uri.path, '/value');request.response.headers.set('content-type', 'application/json');
          request.response.add(utf8.encode('9007199254740993.00'));
        }
        await request.response.close();
      });
      final originals = mixedLegacyHolderDocuments('http://127.0.0.1:${server.port}', restrictedVersion: restrictedVersion,
        overlappingContainers: target == '3.2.1');
      for (final entry in originals.entries) {
        final file = File('${directory.path}/${entry.key}');await file.parent.create(recursive: true);await file.writeAsString(entry.value);
      }
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
      final roots = [for (final path in ['legacy/api.yaml', 'modern/api.yaml']) File('${directory.path}/$path').uri.toString()];
      Future<void> send(BusyProject project, String root, String name) async {
        final checked = await project.check(root);expect(checked['status'], 'complete', reason: '$checked');
        final operation = (checked['projection']['operations'] as List).whereType<Map>().singleWhere((operation) => operation['path'] == '/p');
        final plan = await project.prepareRequest(root, resource: operation['resource'], pointer: operation['pointer'], occurrence: operation['occurrence']);
        try {
          final response = await const ContractRequestExecutor().execute(plan,
            OperationRequestDraft(planIdentity: plan.identity, environment: 'manual'),
            resolveSecret: (reference) async { expect(reference, mixedHolderSecret);return 'controlled-key'; });
          try { expect(response.conforming, true);expect(response.response.status, 204);expect(seen.last, name); }
          finally { await response.close(); }
        } finally { plan.close(); }
      }
      await send(source, roots[0], 'First');await send(source, roots[1], 'Second');
      final buffer = await source.buffer(roots.first);source.store.replace(buffer.id, buffer.text.replaceFirst('First', 'Captured First'));
      final review = await source.prepareMigration(roots.first, '${directory.path}/output', targetVersion: target);addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');expect(review.unsaved, true);await review.publish();
      for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
      final names = [for (final root in roots) Uri.parse(review.changes.singleWhere((change) => change.resource == root).destination).pathSegments.last];
      source.close();final moved = await Directory(review.destination).rename('${directory.path}/cold 雪');
      for (final path in originals.keys) await File('${directory.path}/$path').delete();
      final cold = await BusyProject.open(moved.path, engine);addTearDown(cold.close);
      for (final (index, name) in ['First', 'Second'].indexed) await send(cold, File('${moved.path}/${names[index]}').uri.toString(), name);
      final cli = await Process.run('$testBundle/busyapi', ['migrate', moved.path, '--root', 'migrated', '--target', target, '--output', '${directory.path}/cli-preview', '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
      final report = jsonDecode(cli.stdout as String) as Map;expect(report['producerVersion'], '81');expect(report['complete'], true);expect(report['published'], false);
      expect(Directory('${directory.path}/cli-preview').existsSync(), false);
    });
  }
}
