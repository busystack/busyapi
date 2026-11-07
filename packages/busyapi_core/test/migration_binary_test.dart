import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

String _source(String version, String format, int port, {required bool binary, bool r1 = false, bool opaqueEncoded = false, bool encodedPart = false}) {
  final legacy = version.startsWith('3.0.');
  final type = encodedPart ? 'multipart/form-data; boundary=Encoded' : binary || opaqueEncoded ? 'application/octet-stream' : 'application/json';
  final schema = binary
      ? legacy ? {'type': 'string', 'format': 'binary', if (r1) ...{'enum': ['', 'discarded'], 'maxLength': 0, 'pattern': r'^$'}}
          : {'contentMediaType': 'application/octet-stream'}
      : {'type': 'string', if (legacy) 'format': 'byte'
          else 'contentEncoding': 'base64', 'minLength': 4, 'maxLength': 8};
  final media = {'schema': encodedPart ? {'type': 'object', 'required': ['payload'], 'properties': {'payload': schema}} : schema,
    if (encodedPart) 'encoding': {'payload': {'contentType': 'application/octet-stream'}}};
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
  _r3Transactions();
  _r3CliAndDecisions();
  for (final representation in ['body', 'part', 'items', 'targeted',
    'container', 'composition', 'targeted-composition', 'targeted-part',
    'bounded', 'bounded-composition', 'bounded-part', 'literal', 'literal-items', 'literal-impossible', 'proof']) {
    test('shared $representation and JSON schemas retain distinct execution after publication and cold reopening', () async {
      final multipart = ['part', 'items', 'container', 'composition', 'targeted-part', 'bounded-part', 'literal', 'literal-items', 'literal-impossible'].contains(representation), array = representation == 'items' || representation == 'literal-items';
      final targeted = representation.startsWith('targeted');
      final bounded = representation.startsWith('bounded');
      final literal = representation.startsWith('literal'), proof = representation == 'proof';
      final impossible = representation == 'literal-impossible';
      final containing = ['container', 'composition'].contains(representation) || literal;
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
      if (bounded) {
        final leaf = document['components']['schemas']['Shared'] as Map;
        leaf.addAll({'minLength': 1, 'maxLength': 5, 'nullable': true});
        if (representation == 'bounded-composition') {
          document['components']['schemas']['Shared'] = {'allOf': [leaf, {'type': 'string'}]};
        }
      }
      if (proof) document['components']['schemas']['Shared'].addAll({'enum': ['', 'discarded'], 'maxLength': 0, 'pattern': r'^$'});
      if (impossible) document['components']['schemas']['Shared']['minLength'] = 1;
      document['x-number'] = 'EXACT';
      if (targeted) document.remove('components');
      final operation = document['paths']['/bytes']['post'] as Map;
      final reference = {r'$ref': '#/components/schemas/Shared'};
      final object = {'type': 'object', 'required': ['payload'],
        'properties': {'payload': array ? {'type': 'array', 'items': reference}
            : targeted ? {'type': 'string', 'format': 'binary'} : reference}};
      if (literal) object['enum'] = [{'payload': array ? ['', ''] : ''}];
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
        ...bytes, ...utf8.encode(array && literal
            ? '\r\n--Shared\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/octet-stream\r\n\r\n' : ''),
        if (array && literal) ...bytes, ...utf8.encode('\r\n--Shared--\r\n'),
      ] : bytes;
      List<int> jsonBytes(Object value) => utf8.encode(jsonEncode(multipart && !targeted ? {'payload': array ? [value] : value} : value));
      Future<List<(bool, bool)>> send(BusyProject owner) async {
        final root = owner.roots.single.id;
        final plan = await owner.prepareRequest(root, resource: root, pointer: '/paths/~1bytes/post');
        try {
          final outcomes = <(bool, bool)>[];
          for (final (type, bytes) in <(String, List<int>)>[
            (rawType, rawBytes([0, 255, 128, 195, 169])), (rawType, rawBytes([])),
            ('application/json', jsonBytes(bounded ? 'snow' : 'snow 雪')), ('application/json', jsonBytes(false)),
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
      expect(before, [(!(literal || proof), !(literal || proof)), (!bounded && !impossible, !bounded && !impossible),
        (!(literal || proof), !(literal || proof)), (false, false)]);
      final cli = await Process.run('$testBundle/busyapi', ['migrate', file.path,
        '--target', '3.1.2', '--output', '${directory.path}/cli-review', '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
      final report = jsonDecode(cli.stdout as String) as Map;
      expect(report['complete'], true); expect(report['producerVersion'], '92');
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
    for (final format in ['yaml', 'json']) for (final representation in ['raw', 'base64-json', 'base64-opaque', 'base64-part']) {
      final binary = representation == 'raw', opaqueEncoded = representation == 'base64-opaque', encodedPart = representation == 'base64-part';
      test('$version $format $representation migration retains HTTP bytes and unsaved source', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-migrate-binary-');
        addTearDown(() => directory.delete(recursive: true));
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        final type = encodedPart ? 'multipart/form-data; boundary=Encoded' : binary || opaqueEncoded ? 'application/octet-stream' : 'application/json';
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
        final original = _source(version, format, server.port, binary: binary, opaqueEncoded: opaqueEncoded, encodedPart: encodedPart);
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
        expect(review.result['producerVersion'], '92');
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
        final wires = encodedPart ? [for (final value in ['AP+A', '', 'AP+AAP+AAP+A'])
          utf8.encode('--Encoded\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: base64\r\n\r\n$value\r\n--Encoded--\r\n')]
            : binary ? <List<int>>[[0, 255, 128, 195, 169], []]
            : opaqueEncoded ? <List<int>>[utf8.encode('AP+A'), [], utf8.encode('too-long-for-bounds'), [255, 128]]
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
        expect(report['producerVersion'], '92');
        expect(report['published'], false);
        expect(Directory('${directory.path}/cli-review').existsSync(), false);
      });
    }
  }
  for (final format in ['yaml', 'json']) for (final representation in ['raw', 'r1', 'r2']) {
    final r1 = representation == 'r1', r2 = representation == 'r2';
    test('$format $representation binary migration cancellation and stale review leave both destinations absent', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-binary-stale-');
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/api.$format')
        ..writeAsStringSync(_source('3.0.4', format, 12345, binary: !r2, r1: r1, opaqueEncoded: r2));
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
      if (r1 || r2) {
        final refused = await project.prepareMigration(root, '${directory.path}/refused', targetVersion: '3.2.1');
        addTearDown(refused.close);
        await expectLater(refused.publish(beforePublish: () async {
          await Directory(refused.destination).create();
          await File('${refused.destination}/foreign').writeAsString('Keep');
        }), throwsA(anything));
        expect(await File('${refused.destination}/foreign').readAsString(), 'Keep');
        expect(await File('${refused.destination}/openapi.$format').exists(), false);
      }
      final buffer = await project.buffer(root);
      project.store.replace(root, buffer.text.replaceFirst('Original', 'Changed'));
      await expectLater(review.publish(), throwsA(isA<CoreFailure>()
          .having((e) => e.code, 'code', 'migration.stale')));
      expect(Directory(destination).existsSync(), false);
      expect(file.readAsBytesSync(), original);
    });
  }
}

void _r3Transactions() {
  for (final format in ['yaml', 'json']) {
    for (final phase in ['undo', 'disk', 'cancel', 'conflict', 'failure', 'publish']) {
      test('R3 $format shared binary capture $phase is atomic across all resources', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-b04-transaction-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final main = File('${directory.path}/api.$format'), model = File('${directory.path}/model.$format');
        final value = jsonDecode(_source('3.0.4', 'json', 1, binary: true)) as Map;
        final operation = value['paths']['/bytes']['post'] as Map;
        for (final content in [operation['requestBody']['content'], operation['responses']['200']['content']]) {
          content['application/octet-stream']['schema'] = {r'$ref': 'model.$format#/components/schemas/Leaf'};
          content['application/json'] = {'schema': {r'$ref': 'model.$format#/components/schemas/Alias'}};
        }
        final leaf = {'type': 'string', 'format': 'binary', 'enum': ['', 'discarded'], 'maxLength': 0, 'pattern': r'^$'};
        final schemas = {'Leaf': leaf, 'Alias': leaf, 'Private': leaf, 'Recursive': {'type': 'object', 'properties': {
          'bytes': {r'$ref': '#/components/schemas/Alias'}, 'next': {r'$ref': '#/components/schemas/Recursive'},
        }}};
        final privateContent = {'application/octet-stream': {'schema': {r'$ref': '#/components/schemas/Private'}}};
        final externalPaths = {'/private': {'post': {'requestBody': {'content': privateContent}, 'responses': {'200': {'description': 'Private bytes', 'content': privateContent}}}}};
        final external = {'openapi': '3.0.4', 'info': {'title': 'Original model', 'version': '1'}, 'paths': externalPaths, 'components': {'schemas': schemas}};
        final originalMain = '${format == 'yaml' ? '# Keep main\r\n' : ''}${jsonEncode(value).replaceAll('9007199254740993', '9007199254740993.00')}\r\n';
        final originalModel = format == 'json' ? '${jsonEncode(external)}\r\n'
            : 'openapi: 3.0.4\r\ninfo: {title: Original model, version: "1"}\r\npaths: ${jsonEncode(externalPaths)}\r\ncomponents:\r\n  schemas:\r\n'
                '    Leaf: &bytes ${jsonEncode(leaf)}\r\n    Alias: *bytes\r\n    Private: ${jsonEncode(leaf)}\r\n    Recursive: ${jsonEncode(schemas['Recursive'])}\r\n';
        await main.writeAsString(originalMain); await model.writeAsString(originalModel);
        final project = await BusyProject.open(main.path, engine); addTearDown(project.close);
        final root = project.roots.single.id, buffer = await project.buffer(root), shared = await project.buffer(model.uri.toString());
        project.store.replace(root, buffer.text.replaceFirst('Original', 'Unsaved'));
        project.store.replace(shared.id, shared.text.replaceFirst('Original model', 'Unsaved model'));
        final working = buffer.text, sharedWorking = shared.text;
        final destination = '${directory.path}/output';
        final review = await project.prepareMigration(root, destination, targetVersion: '3.2.1'); addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}'); expect(review.unsaved, true);
        expect(review.changes.length, greaterThanOrEqualTo(2));
        final repeated = await project.prepareMigration(root, destination, targetVersion: '3.2.1'); addTearDown(repeated.close);
        expect(repeated.identity, review.identity); expect(repeated.result['outputs'], review.result['outputs']);
        expect(await Directory(destination).exists(), false);
        if (phase == 'undo') {
          project.store.undo(); expect(shared.text, originalModel); expect(review.outdated, true);
          project.store.redo(); expect(shared.text, sharedWorking); expect(review.outdated, true);
          await expectLater(review.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
        } else if (phase == 'publish') {
          await review.publish();
          expect(await main.readAsString(), originalMain); expect(await model.readAsString(), originalModel);
          expect(buffer.text, working); expect(shared.text, sharedWorking);
          await main.delete(); await model.delete();
          final output = await BusyProject.open(destination, engine); addTearDown(output.close);
          final checked = await output.check(output.roots.first.id);
          expect(checked['complete'], true, reason: '$checked');
          expect((checked['findings'] as List).where((finding) => finding['severity'] == 'error'), isEmpty);
          expect(await File('$destination/migration.json').exists(), true);
          expect(await File('$destination/busyapi.yaml').exists(), true);
          expect(await File('$destination/${review.result['entry']}').readAsString(), contains('9007199254740993.00'));
          return;
        } else {
          var cancelled = false;
          await expectLater(review.publish(cancelled: () => cancelled, beforePublish: () async {
            // Core invokes this after all private staging writes and before
            // the atomic directory publication boundary.
            expect(await Directory(destination).exists(), false);
            if (phase == 'disk') await model.writeAsString('$originalModel\n# external writer\n');
            if (phase == 'cancel') cancelled = true;
            if (phase == 'conflict') {
              await Directory(destination).create(); await File('$destination/foreign').writeAsString('Keep');
            }
            if (phase == 'failure') throw const FileSystemException('Controlled staged multi-file failure');
          }), throwsA(phase == 'disk' ? isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale') : anything));
        }
        if (phase == 'conflict') {
          expect(await File('$destination/foreign').readAsString(), 'Keep');
          expect(await File('$destination/${review.result['entry']}').exists(), false);
        } else { expect(await Directory(destination).exists(), false); }
        expect(await main.readAsString(), originalMain);
        if (phase != 'disk') expect(await model.readAsString(), originalModel);
        expect(buffer.text, working); expect(shared.text, sharedWorking);
        expect((await directory.list().toList()).where((entry) => entry.path.split(Platform.pathSeparator).last.startsWith('busyapi-output-')), isEmpty);
      });
    }
  }
}

void _r3CliAndDecisions() {
  for (final format in ['yaml', 'json']) {
    test('R3 $format binary decisions, stale CLI approval and cold applied output share Core admission', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-b04-cli-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper); addTearDown(engine.close);
      final file = File('${directory.path}/api.$format');
      final value = jsonDecode(_source('3.0.4', 'json', 1, binary: true, r1: true)) as Map;
      value['paths']['/ignored'] = {'get': {'requestBody': {'content': {'application/octet-stream': {'schema': {'type': 'string', 'format': 'binary'}}}}, 'responses': {'204': {'description': 'Empty'}}}};
      final original = '${format == 'yaml' ? '# Keep decisions\r\n' : ''}${jsonEncode(value)}\r\n';
      await file.writeAsString(original);
      final project = await BusyProject.open(file.path, engine); addTearDown(project.close);
      final root = project.roots.single.id, destination = '${directory.path}/copy';
      final review = await project.prepareMigration(root, destination, targetVersion: '3.2.1'); addTearDown(review.close);
      expect(review.status, MigrationStatus.requiresDecision); expect(review.result['outputs'], isEmpty);
      final problem = review.problems.singleWhere((problem) => problem.code == 'migration.body.ignored-activation');
      expect(problem.reason, MigrationProblemReason.decision);
      final approved = await project.prepareMigration(root, destination, targetVersion: '3.2.1', decisions: {problem.id: 'omit-ignored-body'}); addTearDown(approved.close);
      expect(approved.publishable, true, reason: '${approved.result}');
      final buffer = await project.buffer(root); project.store.replace(root, buffer.text.replaceFirst('Original', 'Changed'));
      await expectLater(approved.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
      await expectLater(project.prepareMigration(root, destination, targetVersion: '3.2.1', decisions: {problem.id: 'omit-ignored-body'}), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.decisions.stale')));
      expect(await Directory(destination).exists(), false);
      Future<ProcessResult> cli(List<String> extra) => Process.run('$testBundle/busyapi', [
        'migrate', file.path, '--target', '3.2.1', '--output', destination, '--json', ...extra,
      ], environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      final pending = await cli([]); expect(pending.exitCode, 2, reason: '${pending.stdout} ${pending.stderr}');
      final pendingReport = jsonDecode(pending.stdout as String) as Map;
      final cliProblem = (pendingReport['problems'] as List).cast<Map>().singleWhere((problem) => problem['code'] == 'migration.body.ignored-activation');
      final decision = '${cliProblem['id']}=omit-ignored-body';
      final preview = await cli(['--decision', decision]); expect(preview.exitCode, 0, reason: '${preview.stdout} ${preview.stderr}');
      final report = jsonDecode(preview.stdout as String) as Map;
      expect(report['producerVersion'], '92'); expect(report['published'], false);
      final repeated = await cli(['--decision', decision]); expect(repeated.exitCode, 0);
      expect((jsonDecode(repeated.stdout as String) as Map)['reviewIdentity'], report['reviewIdentity']);
      await file.writeAsString(original.replaceFirst('Original', 'External'));
      final stale = await cli(['--decision', decision, '--apply', report['reviewIdentity'] as String]);
      expect(stale.exitCode, 3); expect(await Directory(destination).exists(), false);
      await file.writeAsString(original);
      final applied = await cli(['--decision', decision, '--apply', report['reviewIdentity'] as String]);
      expect(applied.exitCode, 0, reason: '${applied.stdout} ${applied.stderr}');
      expect((jsonDecode(applied.stdout as String) as Map)['published'], true);
      expect(await file.readAsString(), original); await file.delete();
      final output = await BusyProject.open(destination, engine); addTearDown(output.close);
      final outputRoot = output.roots.single.id;
      expect((await output.check(outputRoot))['complete'], true);
      final plan = await output.prepareRequest(outputRoot, resource: outputRoot, pointer: '/paths/~1bytes/post'); addTearDown(plan.close);
      final checked = await plan.evaluateRuntime([
        for (final subject in ['request-body', 'response-body']) for (final bytes in <List<int>>[[], [0, 255, 128]])
          RuntimeSchemaInstance(subject: subject, location: 'application/octet-stream', text: base64Encode(bytes), mediaBase64: true, mediaType: 'application/octet-stream',
            media: RuntimeMediaTarget(resource: outputRoot, pointer: subject == 'request-body'
                ? '/paths/~1bytes/post/requestBody/content/application~1octet-stream' : '/paths/~1bytes/post/responses/200/content/application~1octet-stream')),
      ]);
      expect(checked['complete'], true, reason: '$checked');
      expect((checked['runtimeEvaluations'] as List).map((value) => value['valid']), [true, false, true, false]);
    });
    test('R3 $format unavailable containing-byte proof remains a typed unpublished refusal', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-b04-proof-'); addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/api.$format');
      final value = jsonDecode(_source('3.0.4', 'json', 1, binary: true)) as Map;
      final operation = value['paths']['/bytes']['post'];
      operation['requestBody']['content'] = {'multipart/form-data': {'schema': {'type': 'object', 'required': ['payload'], 'properties': {'payload': {'type': 'string', 'format': 'binary'}}, 'enum': [{'payload': 'PNG'}]}}};
      final original = '${format == 'yaml' ? '# Keep proof\n' : ''}${jsonEncode(value)}'; await file.writeAsString(original);
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper); addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine); addTearDown(project.close);
      final review = await project.prepareMigration(project.roots.single.id, '${directory.path}/copy', targetVersion: '3.2.1'); addTearDown(review.close);
      expect(review.status, MigrationStatus.blocked); expect(review.result['outputs'], isEmpty); expect(review.changes, isEmpty);
      expect(review.problems.any((problem) => problem.code == 'migration.schema.binary-literal' && problem.reason == MigrationProblemReason.unavailableProof), true);
      await expectLater(review.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.blocked')));
      expect(await Directory(review.destination).exists(), false); expect(await file.readAsString(), original);
    });
  }
}
