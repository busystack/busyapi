import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';
import 'migration_mixed_holder_fixture.dart';

void main() {
  mixedLegacyObjectUses();
  r3ObjectUses();
  r3aReferencedRoutes();
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
      expect(review.result['producerVersion'], '94');
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
      final report = jsonDecode(cli.stdout as String) as Map;expect(report['producerVersion'], '94');expect(report['complete'], true);expect(report['published'], false);
      expect(Directory('${directory.path}/cli-preview').existsSync(), false);
    });
  }
}

void r3ObjectUses() {
  for (final format in ['yaml', 'json']) {
    for (final target in ['3.1.2', '3.0.4']) {
      test('B05-R3 $format reusable objects retain HTTP and transactions in $target', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-r3-objects-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        final observed = <(String, String, String?, List<int>)>[];
        server.listen((request) async {
          observed.add((request.method, request.uri.toString(), request.headers.contentType?.mimeType,
            await request.fold<List<int>>([], (all, part) => all..addAll(part))));
          request.response.headers.contentType = ContentType.json;
          request.response.headers.set('X-Result', 'kept');
          request.response.write('false');
          await request.response.close();
        });
        Map<String, Object?> ref(String kind, String name) => {r'$ref': '#/components/$kind/$name'};
        final media = {'schema': ref('schemas', 'Flag'), 'examples': {'False': ref('examples', 'False')}};
        final value = {
          'openapi': '3.2.1', 'info': {'title': 'Saved R3', 'version': '1'},
          'servers': [{'url': 'http://127.0.0.1:${server.port}/{tenant}/..',
            'variables': {'tenant': {'default': 'one', 'enum': ['one', 'two']}}}],
          'paths': {'/echo': ref('pathItems', 'Shared')},
          'components': {
            'pathItems': {'Shared': {'post': {'operationId': 'echo',
              'requestBody': {'required': true, 'content': {'application/json': ref('mediaTypes', 'Payload')}},
              'responses': {'200': {'description': 'Boolean reply',
                'headers': {'X-Result': {'schema': {'type': 'string'}}},
                'content': {'application/json': ref('mediaTypes', 'Payload')},
                'links': {'Again': ref('links', 'Again')}}},
              'callbacks': {'Ack': ref('callbacks', 'Ack')}}}},
            'mediaTypes': {'Payload': media}, 'schemas': {'Flag': {'type': 'boolean'}},
            'examples': {'False': {'dataValue': false, 'serializedValue': 'false'}},
            'links': {'Again': {'operationId': 'echo', 'parameters': {'value': r'$request.body#/value'}}},
            'callbacks': {'Ack': {'https://callback.invalid/': {'post': {'responses': {'204': {'description': 'Acknowledged'}}}}}},
          },
          'x-literal': {'dataValue': false, r'$ref': 'not-a-contract', 'exact': 'EXACT'},
        };
        final original = (format == 'yaml'
          ? '# Keep R3 source 雪\r\n${value.entries.map((entry) => '${jsonEncode(entry.key)}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n'
          : jsonEncode(value)).replaceAll('"EXACT"', '9007199254740993.00');
        final file = File('${directory.path}/api.$format');
        await file.writeAsString(original);
        final project = await BusyProject.open(file.path, engine);
        addTearDown(project.close);
        final root = project.roots.single.id, buffer = await project.buffer(project.roots.single.id);
        project.store.replace(root, buffer.text.replaceFirst('Saved R3', 'Unsaved R3'));
        Future<void> send(BusyProject owner) async {
          final entry = owner.roots.single.id, checked = await owner.check(owner.roots.single.id);
          expect(checked['complete'], true, reason: '$checked');
          final operation = (checked['projection']['operations'] as List).cast<Map>().singleWhere((operation) => operation['path'] == '/echo');
          final plan = await owner.prepareRequest(entry, resource: operation['resource'], pointer: operation['pointer'], occurrence: operation['occurrence']);
          try {
            final result = await const ContractRequestExecutor().execute(plan,
              OperationRequestDraft(planIdentity: plan.identity, body: const RequestBodyDraft.raw(mediaType: 'application/json', text: 'false')),
              resolveSecret: (_) async => null);
            try {
              expect(result.conforming, true, reason: '${result.outgoing.findings} ${result.received.findings}');
              expect(observed.last, ('POST', '/echo', 'application/json', utf8.encode('false')));
              expect(await result.response.bytes(), utf8.encode('false'));
              expect(result.response.headers, contains(('x-result', 'kept')));
            } finally { await result.close(); }
          } finally { plan.close(); }
        }
        await send(project);
        final review = await project.prepareMigration(root, '${directory.path}/target', targetVersion: target);
        addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');
        expect(review.unsaved, true);expect(review.result['producerVersion'], '94');
        if (format == 'json' && target == '3.1.2') {
          final repeat = await project.prepareMigration(root, review.destination, targetVersion: target);
          addTearDown(repeat.close);expect(repeat.identity, review.identity);
          for (final failure in ['cancel', 'race', 'failure']) {
            final rejected = await project.prepareMigration(root, '${directory.path}/$failure', targetVersion: target);
            addTearDown(rejected.close);var cancelled = false;
            await expectLater(rejected.publish(cancelled: () => cancelled, beforePublish: () async {
              if (failure == 'cancel') cancelled = true;
              if (failure == 'race') { await Directory(rejected.destination).create();await File('${rejected.destination}/foreign').writeAsString('Keep'); }
              if (failure == 'failure') throw const FileSystemException('Controlled R3 publication failure');
            }), throwsA(anything));
            if (failure == 'race') expect(await File('${rejected.destination}/foreign').readAsString(), 'Keep');
            else expect(await Directory(rejected.destination).exists(), false);
          }
          final stale = await project.prepareMigration(root, '${directory.path}/stale', targetVersion: target);
          addTearDown(stale.close);project.store.replace(root, buffer.text.replaceFirst('Unsaved R3', 'Changed R3'));
          await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
          project.store.undo();
        }
        await review.publish();expect(await file.readAsString(), original);
        project.close();await file.delete();
        final moved = await Directory(review.destination).rename('${directory.path}/cold 雪');
        final cold = await BusyProject.open(moved.path, engine);addTearDown(cold.close);
        await send(cold);
        final cli = await Process.run('$testBundle/busyapi', ['check', moved.path, '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
        expect((jsonDecode(cli.stdout as String) as Map)['complete'], true);
      });
    }
  }
}

void r3aReferencedRoutes() {
  test('R3a aliased referenced Path Items retain method, body and effective targets after cold publication', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-r3a-reference-');
    addTearDown(() => directory.delete(recursive: true));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final seen = <(String, String, String)>[];
    server.listen((request) async {
      seen.add((request.method, request.uri.toString(), utf8.decode(await request.fold<List<int>>([], (all, bytes) => all..addAll(bytes)))));
      request.response.statusCode = 204;await request.response.close();
    });
    final entry = File('${directory.path}/api.yaml'), shared = File('${directory.path}/shared.yaml');
    final original = 'openapi: 3.1.2\ninfo: {title: References, version: "1"}\n'
        'servers: [{url: "http://127.0.0.1:${server.port}/root"}]\npaths:\n'
        '  /first: {\$ref: "./shared.yaml#/Item"}\n  /second: {\$ref: "./shared.yaml#/Alias"}\n';
    final extra = 'Item: &item\n  servers: [{url: "http://127.0.0.1:${server.port}/read"}]\n'
        '  get: {responses: {"204": {description: Empty}}}\n'
        '  post:\n    servers: [{url: "http://127.0.0.1:${server.port}/write"}]\n'
        '    requestBody: {required: true, content: {application/json: {schema: {type: boolean}}}}\n'
        '    responses: {"204": {description: Empty}}\nAlias: *item\nx-kept: 9007199254740993.00\n';
    await entry.writeAsString(original);await shared.writeAsString(extra);
    final project = await BusyProject.open(entry.path, engine);addTearDown(project.close);
    Future<void> send(BusyProject owner) async {
      final root = owner.roots.single.id, checked = await owner.check(owner.roots.single.id);
      expect(checked['complete'], true, reason: '$checked');
      for (final operation in (checked['projection']['operations'] as List).cast<Map>()) {
        final method = operation['method'].toString().toUpperCase(), suffix = operation['path'].toString().endsWith('/first') ? '/first' : '/second';
        final plan = await owner.prepareRequest(root, resource: operation['resource'], pointer: operation['pointer'], occurrence: operation['occurrence']);
        try {
          final result = await const ContractRequestExecutor().execute(plan,
              OperationRequestDraft(planIdentity: plan.identity, body: method == 'POST'
                  ? const RequestBodyDraft.raw(mediaType: 'application/json', text: 'false') : const RequestBodyDraft.none()),
              resolveSecret: (_) async => null);
          try { expect(result.conforming, true);expect(seen.last, (method, '${method == 'POST' ? '/write' : '/read'}$suffix', method == 'POST' ? 'false' : '')); }
          finally { await result.close(); }
        } finally { plan.close(); }
      }
    }
    await send(project);
    final review = await project.prepareMigration(project.roots.single.id, '${directory.path}/output', targetVersion: '2.0');
    addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');
    await review.publish();expect(await entry.readAsString(), original);expect(await shared.readAsString(), extra);
    project.close();await entry.delete();await shared.delete();
    final moved = await Directory(review.destination).rename('${directory.path}/cold');
    final cold = await BusyProject.open(moved.path, engine);addTearDown(cold.close);await send(cold);
    expect(seen, hasLength(8));
  });
}
