import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

String _source(String version, String format, int port, {required bool binary}) {
  final legacy = version.startsWith('3.0.');
  final type = binary ? 'application/octet-stream' : 'application/json';
  final schema = binary
      ? legacy ? {'type': 'string', 'format': 'binary'}
          : {'contentMediaType': 'application/octet-stream'}
      : {'type': 'string', if (legacy) 'format': 'byte'
          else 'contentEncoding': 'base64', 'minLength': 4, 'maxLength': 8};
  final media = {'schema': schema};
  final value = <String, Object?>{
    'openapi': version,
    'info': {'title': 'Original café 雪', 'version': 'business'},
    'servers': [{'url': 'http://127.0.0.1:$port'}],
    'paths': {'/bytes': {'post': {
      'requestBody': {'required': true, 'content': {type: media}},
      'responses': {'200': {'description': 'Echo', 'content': {type: media}}},
    }}},
    'x-number': 'EXACT',
  };
  return (format == 'yaml'
      ? '# Keep source\r\n${value.entries.map((e) => '${jsonEncode(e.key)}: ${jsonEncode(e.value)}').join('\r\n')}\r\n'
      : '${jsonEncode(value)}\r\n').replaceFirst('"EXACT"', '9007199254740993.00');
}

void main() {
  for (final representation in ['body', 'part', 'items', 'targeted',
    'container', 'composition', 'targeted-composition', 'targeted-part']) {
    test('shared $representation and JSON schemas retain distinct execution after publication and cold reopening', () async {
      final multipart = ['part', 'items', 'container', 'composition', 'targeted-part'].contains(representation), array = representation == 'items';
      final targeted = representation.startsWith('targeted');
      final containing = ['container', 'composition'].contains(representation);
      final rawType = multipart ? 'multipart/form-data; boundary=Shared' : 'application/octet-stream';
      final directory = await Directory.systemTemp.createTemp('busyapi-mixed-binary-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final observed = <(String, List<int>)>[];
      server.listen((request) async {
        final type = request.headers.value('content-type')!;
        final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));
        observed.add((type, bytes));
        request.response.headers.set('content-type', type);
        request.response.add(bytes); await request.response.close();
      });
      final document = jsonDecode(_source('3.0.4', 'json', server.port, binary: true)) as Map<String, dynamic>;
      document['components'] = {'schemas': {'Shared': {'type': 'string', 'format': 'binary',
        'description': '[Retained](./guide.md)', 'x-number': 'EXACT'}}};
      document['x-number'] = 'EXACT';
      if (targeted) document.remove('components');
      final operation = document['paths']['/bytes']['post'] as Map;
      final reference = {r'$ref': '#/components/schemas/Shared'};
      final object = {'type': 'object', 'required': ['payload'],
        'properties': {'payload': array ? {'type': 'array', 'items': reference}
            : targeted ? {'type': 'string', 'format': 'binary'} : reference}};
      if (containing) {
        document['components']['schemas']['Container'] = representation == 'composition'
            ? {'allOf': [object, {'description': 'Keep composition'}]} : object;
      }
      final schema = containing ? {r'$ref': '#/components/schemas/Container'} : multipart ? object
          : targeted ? {'type': 'string', 'format': 'binary'} : reference;
      for (final (content, pointer) in [
        (operation['requestBody']['content'], '/paths/~1bytes/post/requestBody/content/application~1octet-stream/schema'),
        (operation['responses']['200']['content'], '/paths/~1bytes/post/responses/200/content/application~1octet-stream/schema'),
      ]) {
        content.remove('application/octet-stream');
        content[rawType] = {'schema': schema, if (multipart) 'encoding': {'payload': {'contentType': 'application/octet-stream'}}};
        final target = pointer.replaceFirst('application~1octet-stream',
            rawType.replaceAll('~', '~0').replaceAll('/', '~1')) + (multipart ? '/properties/payload' : '');
        content['application/json'] = {'schema': targeted
            ? representation == 'targeted' ? {r'$ref': '#$target'} : {'allOf': [{r'$ref': '#$target'}]}
            : schema};
      }
      final text = jsonEncode(document).replaceAll('"EXACT"', '9007199254740993.00');
      final file = File('${directory.path}/api.json');
      await file.writeAsString(text);
      final project = await BusyProject.open(file.path, engine);
      addTearDown(project.close);
      final root = project.roots.single.id, buffer = await project.buffer(project.roots.single.id);
      project.store.replace(root, buffer.text.replaceFirst('Original', 'Unsaved'));
      final working = buffer.text, destination = '${directory.path}/output';
      final review = await project.prepareMigration(root, destination, targetVersion: '3.2.1');
      addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}'); expect(review.unsaved, true);
      final payload = File('${directory.path}/payload.bin');
      List<int> rawBytes(List<int> bytes) => multipart ? [
        ...utf8.encode('--Shared\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/octet-stream\r\n\r\n'),
        ...bytes, ...utf8.encode('\r\n--Shared--\r\n'),
      ] : bytes;
      List<int> jsonBytes(Object value) => utf8.encode(jsonEncode(multipart && !targeted ? {'payload': array ? [value] : value} : value));
      Future<List<(bool, bool)>> send(BusyProject owner) async {
        final root = owner.roots.single.id;
        final plan = await owner.prepareRequest(root, resource: root, pointer: '/paths/~1bytes/post');
        try {
          final outcomes = <(bool, bool)>[];
          for (final (type, bytes) in <(String, List<int>)>[
            (rawType, rawBytes([0, 255, 128, 195, 169])), (rawType, rawBytes([])),
            ('application/json', jsonBytes('snow 雪')), ('application/json', jsonBytes(false)),
          ]) {
            await payload.writeAsBytes(bytes);
            final response = await const ContractRequestExecutor().execute(plan,
                OperationRequestDraft(planIdentity: plan.identity, body: RequestBodyDraft.binaryFile(mediaType: type, file: payload.path)),
                resolveSecret: (_) async => throw StateError('No credentials'));
            try {
              expect(observed.last.$1, type); expect(observed.last.$2, bytes);
              expect(await response.response.decodedBytes(), bytes);
              expect(response.outgoing.complete, true); expect(response.received.complete, true);
              outcomes.add((response.outgoing.valid, response.received.valid));
            } finally { await response.close(); }
          }
          return outcomes;
        } finally { plan.close(); }
      }
      final before = await send(project);
      expect(before, [(true, true), (true, true), (true, true), (false, false)]);
      final cli = await Process.run('$testBundle/busyapi', ['migrate', file.path,
        '--target', '3.1.2', '--output', '${directory.path}/cli-review', '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
      final report = jsonDecode(cli.stdout as String) as Map;
      expect(report['complete'], true); expect(report['producerVersion'], '81');
      expect(report['published'], false);
      await review.publish();
      expect(await file.readAsString(), text); expect(buffer.text, working);
      await file.delete();
      final output = await BusyProject.open(destination, engine);
      addTearDown(output.close);
      expect(await send(output), before); expect(observed, hasLength(8));
      expect(await File('$destination/openapi.json').readAsString(), contains('9007199254740993.00'));
    });
  }
  for (final version in ['3.0.0', '3.0.1', '3.0.2', '3.0.3', '3.0.4',
    '3.1.0', '3.1.1', '3.1.2', '3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) for (final binary in [true, false]) {
      test('$version $format ${binary ? 'raw' : 'base64'} migration retains HTTP bytes and unsaved source', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-migrate-binary-');
        addTearDown(() => directory.delete(recursive: true));
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        final type = binary ? 'application/octet-stream' : 'application/json';
        final observed = <List<int>>[];
        server.listen((request) async {
          expect(request.method, 'POST');
          expect(request.uri.toString(), '/bytes');
          expect(request.headers.value('host'), '127.0.0.1:${server.port}');
          expect(request.headers.value('content-type'), type);
          final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));
          observed.add(bytes);
          request.response.headers.set('content-type', type);
          request.response.add(bytes);
          await request.response.close();
        });
        final original = _source(version, format, server.port, binary: binary);
        final file = File('${directory.path}/api.$format')..writeAsStringSync('\ufeff$original');
        final originalBytes = file.readAsBytesSync();
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final project = await BusyProject.open(file.path, engine);
        addTearDown(project.close);
        final root = project.roots.single.id, buffer = await project.buffer(project.roots.single.id);
        project.store.replace(root, buffer.text.replaceFirst('Original', 'Unsaved'));
        final working = buffer.text;
        final target = version.startsWith('3.0.') ? '3.2.1' : '3.0.4';
        final destination = '${directory.path}/migrated';
        final review = await project.prepareMigration(root, destination, targetVersion: target);
        addTearDown(review.close);
        expect(review.status, MigrationStatus.faithfullyConvertible, reason: '${review.result}');
        expect(review.result['producerVersion'], '81');
        expect(review.unsaved, true);
        expect(Directory(destination).existsSync(), false);
        await review.publish();
        expect(file.readAsBytesSync(), originalBytes);
        expect(buffer.text, working);
        final output = File('$destination/openapi.$format');
        expect(output.readAsStringSync(), contains('9007199254740993.00'));
        final migrated = await BusyProject.open(output.path, engine);
        addTearDown(migrated.close);
        final payload = File('${directory.path}/payload.bin');
        final wires = binary ? <List<int>>[[0, 255, 128, 195, 169], []]
            : <List<int>>[utf8.encode('"AP+A"'), utf8.encode('""'), utf8.encode('false')];
        final outcomes = <List<(bool, bool)>>[];
        for (final active in [project, migrated]) {
          final activeRoot = active.roots.single.id;
          expect((await active.check(activeRoot))['complete'], true);
          final plan = await active.prepareRequest(activeRoot, resource: activeRoot, pointer: '/paths/~1bytes/post');
          try {
            final values = <(bool, bool)>[];
            for (final bytes in wires) {
              await payload.writeAsBytes(bytes);
              final result = await const ContractRequestExecutor().execute(plan,
                  OperationRequestDraft(planIdentity: plan.identity,
                      body: RequestBodyDraft.binaryFile(mediaType: type, file: payload.path)),
                  resolveSecret: (_) async => throw StateError('No credentials'));
              try {
                expect(result.outgoing.complete, true, reason: '${result.outgoing.findings}');
                expect(result.received.complete, true, reason: '${result.received.findings}');
                expect(observed.last, bytes);
                expect(await result.response.decodedBytes(), bytes);
                expect(await File(result.response.bodyFile).readAsBytes(), bytes);
                values.add((result.outgoing.valid, result.received.valid));
              } finally { await result.close(); }
            }
            outcomes.add(values);
          } finally { plan.close(); }
        }
        expect(outcomes[1], outcomes[0]);
        expect(outcomes.first.first, (true, true));
        if (!binary) expect(outcomes.first.skip(1), everyElement((false, false)));
        expect(observed.length, wires.length * 2);
        expect(file.readAsBytesSync(), originalBytes);
        expect(buffer.text, working);
        final cli = await Process.run('$testBundle/busyapi', ['migrate', file.path,
          '--target', target, '--output', '${directory.path}/cli-review', '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
        final report = jsonDecode(cli.stdout as String) as Map;
        expect(report['complete'], true);
        expect(report['producerVersion'], '81');
        expect(report['published'], false);
        expect(Directory('${directory.path}/cli-review').existsSync(), false);
      });
    }
  }
  for (final format in ['yaml', 'json']) {
    test('$format binary migration cancellation and stale review leave both destinations absent', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-binary-stale-');
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/api.$format')
        ..writeAsStringSync(_source('3.0.4', format, 12345, binary: true));
      final original = file.readAsBytesSync();
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine);
      addTearDown(project.close);
      final root = project.roots.single.id, destination = '${directory.path}/reviewed';
      final review = await project.prepareMigration(root, destination, targetVersion: '3.2.1');
      addTearDown(review.close);
      expect(review.status, MigrationStatus.faithfullyConvertible);
      await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>()
          .having((e) => e.code, 'code', 'cancelled')));
      expect(Directory(destination).existsSync(), false);
      final buffer = await project.buffer(root);
      project.store.replace(root, buffer.text.replaceFirst('Original', 'Changed'));
      await expectLater(review.publish(), throwsA(isA<CoreFailure>()
          .having((e) => e.code, 'code', 'migration.stale')));
      expect(Directory(destination).existsSync(), false);
      expect(file.readAsBytesSync(), original);
    });
  }
}
