import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';
import 'migration_r3b_fixture.dart';

String _render(Map<String, Object?> value, String format) => format == 'yaml'
    ? '# Keep original source 雪\r\n${value.entries.map((entry) => '${jsonEncode(entry.key)}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n'
    : '${jsonEncode(value)}\r\n';

({String mediaType, List<int> bytes, Map<String, Object?> schema}) _payload(String kind) => switch (kind) {
  'json' => (mediaType: 'application/json', bytes: utf8.encode('{"n":9007199254740993.00,"empty":"","false":false,"zero":0,"null":null,"unicode":"雪😀","externalValue":"literal-only"}'),
    schema: {'type': 'object', 'required': ['n'], 'properties': {'n': {'type': 'integer', 'minimum': 9007199254740992}}}),
  'latin1' => (mediaType: 'text/plain; charset=iso-8859-1', bytes: [99, 97, 102, 233], schema: {'type': 'string', 'enum': ['café']}),
  'empty' => (mediaType: 'text/plain', bytes: [], schema: {'type': 'string', 'enum': ['']}),
  'mime' => (mediaType: 'multipart/form-data; boundary=Test', bytes: latin1.encode('--Test\r\nContent-Disposition: form-data; name="label"\r\nContent-Type: text/plain; charset=iso-8859-1\r\n\r\ncafé\r\n--Test--\r\n'),
    schema: {'type': 'object', 'required': ['label'], 'properties': {'label': {'type': 'string', 'enum': ['café']}}}),
  _ => throw ArgumentError.value(kind),
};

String _source(String version, String format, String kind, {int? port, bool logical = false}) {
  final payload = _payload(kind);
  final media = {'schema': payload.schema, 'examples': {'External': {'externalValue': './payload.bin'}}};
  return _render({
    'openapi': version,
    if (logical) r'$self': 'https://contracts.invalid/api.$format',
    'info': {'title': 'Original', 'version': 'business'},
    'servers': [{'url': port == null ? 'https://api.invalid' : 'http://127.0.0.1:$port'}],
    'paths': {'/echo': {'post': {
      'requestBody': {'required': true, 'content': {payload.mediaType: media}},
      'responses': {'200': {'description': 'Echo', 'content': {payload.mediaType: media}}},
    }}},
    'x-literal': {r'$ref': 'not-a-resource', 'externalValue': 'data-only', 'empty': '', 'false': false},
  }, format);
}

class _ChangedReview extends EngineProcess {
  _ChangedReview(this.change) : super(executable: runtimeNode, helper: runtimeHelper);
  final void Function(Map<String, dynamic> result) change;
  @override
  Future<Map<String, dynamic>> request(String method, Map<String, Object?> params, {String? requestId}) async {
    final result = await super.request(method, params, requestId: requestId);
    if (method != 'planMigration' || result['complete'] != true) return result;
    final copied = jsonDecode(jsonEncode(result)) as Map<String, dynamic>;
    change(copied);
    return copied;
  }
}

class _ChangedEntryDiscovery extends EngineProcess {
  _ChangedEntryDiscovery(this.defect) : super(executable: runtimeNode, helper: runtimeHelper);
  final String defect;
  @override
  Future<Map<String, dynamic>> request(String method, Map<String, Object?> params, {String? requestId}) async {
    final result = await super.request(method, params, requestId: requestId);
    if (method != 'analyse' || params['captureEntries'] != true) return result;
    final changed = jsonDecode(jsonEncode(result)) as Map<String, dynamic>;
    if (defect == 'missing') changed.remove('entryDiscovery');
    if (defect == 'revision') (changed['versions'] as Map)['entryDiscoveryRules'] = 'obsolete';
    if (defect == 'references') (changed['entryDiscovery'] as Map)['references'] = 'invalid';
    return changed;
  }
}

void main() {
  _r3cExternalQueries();
  _r3bReusableExamples();
  _b05R2InlineExamples();
  for (final defect in ['missing', 'revision', 'references']) {
    test('migration rejects $defect entry discovery before publication', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-entry-discovery-');addTearDown(() => directory.delete(recursive: true));
      const original = '{"openapi":"3.1.2","info":{"title":"Discovery","version":"business"},"paths":{}}';
      final file = File('${directory.path}/api.json');await file.writeAsString(original);
      final engine = _ChangedEntryDiscovery(defect);addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
      await expectLater(project.prepareMigration(file.uri.toString(), '${directory.path}/output', targetVersion: '3.2.1'),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'engine.entry-discovery')));
      expect(await file.readAsString(), original);expect(await Directory('${directory.path}/output').exists(), false);
    });
  }
  test('migration captures secondary-entry dependencies and example bytes without ordinary-entry acquisition', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-entry-examples-');
    addTearDown(() => directory.delete(recursive: true));
    final payload = _payload('json'), observed = <List<int>>[];
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    server.listen((request) async {
      final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));
      observed.add(bytes);request.response.headers.contentType = ContentType.json;
      request.response.add(bytes);await request.response.close();
    });
    final secondary = jsonDecode(_source('3.1.2', 'json', 'json', port: server.port)) as Map<String, dynamic>;
    secondary['components'] = {'examples': {'Entry': {'value': 'Captured entry'}}};
    final operation = ((secondary['paths'] as Map)['/echo'] as Map)['post'] as Map;
    for (final content in [(operation['requestBody'] as Map)['content'],
      (((operation['responses'] as Map)['200'] as Map)['content'])]) {
      ((content as Map)['application/json'] as Map)['schema'] = {r'$ref': 'model.json#/Node'};
    }
    final originals = {
      'a.json': jsonEncode({'openapi': '3.1.2', 'info': {'title': 'Primary', 'version': 'business'}, 'paths': {},
        'components': {'examples': {'Entry': {r'$ref': 'b.json#/components/examples/Entry'}}}}),
      'b.json': jsonEncode(secondary), 'model.json': jsonEncode({'Node': payload.schema}),
    };
    for (final entry in originals.entries) await File('${directory.path}/${entry.key}').writeAsString(entry.value);
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
    final project = await BusyProject.open('${directory.path}/a.json', engine);addTearDown(project.close);
    final first = File('${directory.path}/a.json').uri.toString(), second = File('${directory.path}/b.json').uri.toString();
    AnalysisSnapshot? ordinary;
    final checked = await project.check(first, onSnapshot: (snapshot) => ordinary = snapshot);
    expect(checked['complete'], true, reason: '$checked');expect(ordinary!.exampleResources, isEmpty);
    expect(ordinary!.resources.any((value) => value['id'] == File('${directory.path}/model.json').uri.toString()), false);
    final example = File('${directory.path}/payload.bin');await example.writeAsBytes(payload.bytes);
    final buffer = await project.buffer(second);project.store.replace(second, buffer.text.replaceFirst('Original', 'Captured'));
    final review = await project.prepareMigration(first, '${directory.path}/converted', targetVersion: '3.2.1');addTearDown(review.close);
    expect(review.publishable, true, reason: '${review.result}');expect(review.unsaved, true);
    expect(review.exampleCopies.single.bytes, payload.bytes);expect(review.exampleCopies.single.resource, example.uri.toString());
    expect(review.snapshot.resources.any((value) => value['id'] == File('${directory.path}/model.json').uri.toString()), true);
    await review.publish();
    for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
    expect(await example.readAsBytes(), payload.bytes);
    final migrated = review.changes.singleWhere((change) => change.resource == second).destination;
    project.close();
    final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');
    for (final name in [...originals.keys, 'payload.bin']) await File('${directory.path}/$name').delete();
    final cold = await BusyProject.open(relocated.path, engine);addTearDown(cold.close);
    final root = File('${relocated.path}/${Uri.parse(migrated).pathSegments.last}').uri.toString();
    final plan = await cold.prepareRequest(root, resource: root, pointer: '/paths/~1echo/post');
    try {
      final media = (((plan.result['requestBody'] as Map)['content'] as List).single as Map);
      final selected = (media['examples'] as List).single as Map;
      expect(selected['wireBase64'], base64Encode(payload.bytes));
      final result = await const ContractRequestExecutor().execute(plan,
        OperationRequestDraft(planIdentity: plan.identity, body: RequestBodyDraft.binaryFile(
            mediaType: 'application/json', file: '${relocated.path}/${review.exampleCopies.single.path}')),
        resolveSecret: (_) async => null);
      try {
        expect(result.conforming, true, reason: '${result.outgoing.findings} ${result.received.findings}');
        expect(observed.single, payload.bytes);expect(await result.response.decodedBytes(), payload.bytes);
      } finally { await result.close(); }
    } finally { plan.close(); }
    final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'],
      environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
    expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
  });
  for (final version in ['3.0.4', '3.1.2', '3.2.1']) for (final format in ['yaml', 'json']) {
    for (final kind in ['json', 'latin1', 'mime', 'empty']) {
      test('$version $format $kind publishes exact captured examples, reopens after relocation and retains HTTP bytes', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-migration-examples-');
        addTearDown(() => directory.delete(recursive: true));
        final payload = _payload(kind), observed = <List<int>>[];
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        server.listen((request) async {
          expect(request.method, 'POST');expect(request.uri.toString(), '/echo');
          expect(request.headers.value('host'), '127.0.0.1:${server.port}');
          expect(request.headers.value('content-type'), payload.mediaType);
          final bytes = await request.fold<List<int>>([], (all, part) => all..addAll(part));
          observed.add(bytes);request.response.headers.set('content-type', payload.mediaType);
          request.response.add(bytes);await request.response.close();
        });
        final file = File('${directory.path}/api.$format'), example = File('${directory.path}/payload.bin');
        final original = _source(version, format, kind, port: server.port);
        await file.writeAsString(original);await example.writeAsBytes(payload.bytes);
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
        final root = file.uri.toString(), source = await project.buffer(root);
        project.store.replace(root, source.text.replaceFirst('Original', 'Unsaved'));
        final target = version.startsWith('3.2') ? '3.0.4' : version.startsWith('3.1') ? '3.2.1' : '3.1.2';
        final review = await project.prepareMigration(root, '${directory.path}/reviewed', targetVersion: target);
        addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');expect(review.unsaved, true);
        final copy = review.exampleCopies.single;
        expect(copy.resource, example.uri.toString());expect(copy.bytes, payload.bytes);
        expect(copy.identity, contentIdentity(payload.bytes));expect(copy.byteLength, payload.bytes.length);
        expect(copy.sources, isNotEmpty);expect(copy.sources.every((source) => source.pointer.endsWith('/externalValue')), true);
        expect(() => copy.bytes.add(1), throwsUnsupportedError);
        final checked = await project.check(root);expect(checked['complete'], true, reason: '$checked');
        Future<void> send(BusyProject owner, String selectedRoot, String payloadPath) async {
          final request = await owner.prepareRequest(selectedRoot, resource: selectedRoot, pointer: '/paths/~1echo/post');
          try {
            final result = await const ContractRequestExecutor().execute(request,
              OperationRequestDraft(planIdentity: request.identity,
                body: RequestBodyDraft.binaryFile(mediaType: payload.mediaType, file: payloadPath)),
              resolveSecret: (_) async => throw StateError('No credentials'));
            try {
              expect(result.outgoing.complete, true, reason: '${result.outgoing.findings}');expect(result.outgoing.valid, true);
              expect(result.received.complete, true, reason: '${result.received.findings}');expect(result.received.valid, true);
              expect(observed.last, payload.bytes);expect(await result.response.decodedBytes(), payload.bytes);
            } finally {await result.close();}
          } finally {request.close();}
        }
        await send(project, root, example.path);
        await review.publish();expect(await file.readAsString(), original);expect(await example.readAsBytes(), payload.bytes);
        final moved = await Directory(review.destination).rename('${directory.path}/moved output 雪');
        final copiedFile = File('${moved.path}/${copy.path}');expect(await copiedFile.readAsBytes(), payload.bytes);
        final metadata = jsonDecode(await File('${moved.path}/migration.json').readAsString()) as Map;
        expect((metadata['exampleCopies'] as List).single['identity'], contentIdentity(payload.bytes));
        expect((metadata['exampleCopies'] as List).single.containsKey('base64'), false);
        project.close();await file.delete();await example.delete();
        final migrated = await BusyProject.open(moved.path, engine);addTearDown(migrated.close);
        final migratedRoot = migrated.roots.single.id;
        final reopened = await migrated.check(migratedRoot);
        expect(reopened['complete'], true, reason: '$reopened');
        expect((reopened['findings'] as List).whereType<Map>().where((value) => value['severity'] == 'error'), isEmpty);
        expect(migrated.store.get(migratedRoot).text, contains('Unsaved'));
        await send(migrated, migratedRoot, copiedFile.path);expect(observed.length, 2);
        final cli = await Process.run('$testBundle/busyapi', ['check', moved.path, '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');expect(jsonDecode(cli.stdout as String)['complete'], true);
        expect(await file.exists(), false);expect(await example.exists(), false);
      });
    }
  }
  for (final format in ['yaml', 'json']) {
    test('$format retained document identity maps example copies locally after relocation', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-example-identity-');
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/api.$format'), payload = File('${directory.path}/payload.bin');
      final original = _source('3.2.1', format, 'latin1', logical: true);
      await file.writeAsString(original);await payload.writeAsBytes(_payload('latin1').bytes);
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
      await project.approveResource('https://contracts.invalid/payload.bin', payload.uri.toString());
      final review = await project.prepareMigration(file.uri.toString(), '${directory.path}/copy', targetVersion: '3.2.0');addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');await review.publish();
      final moved = await Directory(review.destination).rename('${directory.path}/moved');
      await file.delete();await payload.delete();
      final migrated = await BusyProject.open(moved.path, engine);addTearDown(migrated.close);
      final checked = await migrated.check(migrated.roots.single.id);
      expect(checked['complete'], true, reason: '$checked');
      expect((checked['findings'] as List).whereType<Map>().where((finding) => finding['severity'] == 'error'), isEmpty);
      expect(review.exampleCopies.single.bytes, _payload('latin1').bytes);
    });
    test('$format CLI reviews byte copies and applies only the captured review identity', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-example-cli-');
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/api.$format'), payload = File('${directory.path}/payload.bin');
      final original = _source('3.0.4', format, 'latin1'), bytes = _payload('latin1').bytes;
      await file.writeAsString(original);await payload.writeAsBytes(bytes);
      final destination = '${directory.path}/copy';
      final arguments = ['migrate', file.path, '--target', '3.2.1', '--output', destination];
      Future<ProcessResult> run(List<String> extra) => Process.run('$testBundle/busyapi', [...arguments, ...extra],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      final review = await run(['--json']);expect(review.exitCode, 0, reason: '${review.stdout} ${review.stderr}');
      final report = jsonDecode(review.stdout as String) as Map;
      expect(report['published'], false);expect(report['producerVersion'], '107');
      final copy = (report['exampleOutputs'] as List).single as Map;
      expect(base64Decode(copy['base64'] as String), bytes);expect(await Directory(destination).exists(), false);
      final textReview = await run([]);expect(textReview.exitCode, 0, reason: textReview.stderr as String);
      expect(textReview.stdout as String, contains('Copy 4 bytes unchanged: ${payload.uri} → '));
      final applied = await run(['--json', '--apply', report['reviewIdentity'] as String]);
      expect(applied.exitCode, 0, reason: '${applied.stdout} ${applied.stderr}');
      expect(jsonDecode(applied.stdout as String)['published'], true);
      expect(await File('$destination/${copy['path']}').readAsBytes(), bytes);
      expect(await file.readAsString(), original);expect(await payload.readAsBytes(), bytes);
    });
    for (final targetVersion in ['3.2.1', '2.0']) for (final failure in ['cancel', 'race', 'failure', 'stale']) {
      test('$format $targetVersion captured-example publication $failure leaves originals and no partial result', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-example-failure-');
        addTearDown(() => directory.delete(recursive: true));
        final file = File('${directory.path}/api.$format'), payload = File('${directory.path}/payload.bin');
        final original = _source('3.0.4', format, 'json'), bytes = _payload('json').bytes;
        await file.writeAsString(original);await payload.writeAsBytes(bytes);
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
        final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
        final destination = '${directory.path}/target';
        final review = await project.prepareMigration(file.uri.toString(), destination, targetVersion: targetVersion);addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');
        var cancelled = false;
        await expectLater(review.publish(cancelled: () => cancelled, beforePublish: () async {
          if (failure == 'cancel') cancelled = true;
          if (failure == 'race') {await Directory(destination).create();await File('$destination/foreign').writeAsString('Keep');}
          if (failure == 'stale') await payload.writeAsString('{"n":9007199254740994.00}');
          if (failure == 'failure') throw const FileSystemException('Controlled publication failure');
        }), throwsA(anything));
        expect(await file.readAsString(), original);
        expect(await payload.readAsBytes(), failure == 'stale' ? utf8.encode('{"n":9007199254740994.00}') : bytes);
        if (failure == 'race') {expect(await File('$destination/foreign').readAsString(), 'Keep');expect(await File('$destination/openapi.$format').exists(), false);}
        else {expect(await Directory(destination).exists(), false);}
      });
    }
    for (final targetVersion in ['3.1.2', '2.0']) test('$format $targetVersion unsaved payload bytes are captured without changing saved originals', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-example-working-');addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/api.$format'), payload = File('${directory.path}/payload.bin');
      await file.writeAsString(_source('3.0.4', format, 'json'));await payload.writeAsBytes(_payload('json').bytes);
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
      final buffer = await project.buffer(payload.uri.toString());const working = '{"n":9007199254740994.00}';
      project.store.replace(buffer.id, working);
      final review = await project.prepareMigration(file.uri.toString(), '${directory.path}/copy', targetVersion: targetVersion);addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');expect(review.snapshot.exampleResources.single.bytes, utf8.encode(working));
      if (targetVersion == '2.0') expect(review.exampleCopies, isEmpty);
      else expect(review.exampleCopies.single.bytes, utf8.encode(working));
      await review.publish();expect(await payload.readAsBytes(), _payload('json').bytes);expect(buffer.text, working);
      if (targetVersion == '2.0') {
        final cold = await BusyProject.open(review.destination, engine);addTearDown(cold.close);
        final root = cold.roots.single.id, plan = await cold.prepareRequest(cold.roots.single.id, resource: cold.roots.single.id, pointer: '/paths/~1echo/post');addTearDown(plan.close);
        final content = ((plan.result['requestBody'] as Map)['content'] as List).single as Map;
        expect(((content['examples'] as List).single as Map)['raw'], working);expect((await cold.check(root))['complete'], true);
      } else expect(await File('${review.destination}/${review.exampleCopies.single.path}').readAsBytes(), utf8.encode(working));
      project.store.undo();expect(review.outdated, true);project.store.redo();expect(buffer.text, working);
    });
    for (final defect in ['base64', 'identity', 'path', 'owner', 'producer']) {
      test('$format engine $defect cannot authorize an unrelated byte copy', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-example-protocol-');addTearDown(() => directory.delete(recursive: true));
        final file = File('${directory.path}/api.$format'), payload = File('${directory.path}/payload.bin');
        await file.writeAsString(_source('3.0.4', format, 'json'));await payload.writeAsBytes(_payload('json').bytes);
        final engine = _ChangedReview((result) {
          final copy = (result['exampleOutputs'] as List).single as Map;
          switch (defect) {
            case 'base64': copy['base64'] = base64Encode(utf8.encode('changed'));break;
            case 'identity': copy['identity'] = '0' * 64;break;
            case 'path': copy['path'] = '../escape.bin';break;
            case 'owner': (copy['source'] as Map)['resource'] = 'file:///not-captured';break;
            case 'producer': result['producerVersion'] = '69';break;
          }
        });addTearDown(engine.close);
        final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
        await expectLater(project.prepareMigration(file.uri.toString(), '${directory.path}/copy', targetVersion: '3.1.2'),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.protocol')));
        expect(await Directory('${directory.path}/copy').exists(), false);expect(await payload.readAsBytes(), _payload('json').bytes);
      });
    }
  }
}

void _r3cExternalQueries() {
  for (final version in ['3.2.0', '3.2.1']) for (final format in ['yaml', 'json']) for (final target in ['3.1.2', '3.0.4']) {
    test('R3c-3 $version $format external query example retains bytes after cold $target publication', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-external-query-');
      addTearDown(() => directory.delete(recursive: true));
      final seen = <String>[], bytes = utf8.encode('q=a%2Bb&q=%2520');
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      server.listen((request) async { seen.add(request.uri.toString());request.response.statusCode = 204;await request.response.close(); });
      final file = File('${directory.path}/api.$format'), external = File('${directory.path}/query.bin');
      final original = _render({
        'openapi': version, 'info': {'title': 'External query', 'version': '1'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/p': {'get': {
          'parameters': [{'name': 'whole', 'in': 'querystring', 'required': true, 'content': {
            'application/x-www-form-urlencoded': {
              'schema': {'type': 'object', 'required': ['q'], 'additionalProperties': false, 'properties': {
                'q': {'type': 'array', 'minItems': 1, 'maxItems': 2, 'items': {'type': 'string', 'enum': ['a+b', '%20']}}}},
              'examples': {'Captured': {'summary': 'Approved octets', 'externalValue': './query.bin'}},
            },
          }}], 'responses': {'204': {'description': 'Empty'}},
        }}},
      }, format);
      await file.writeAsString(original);await external.writeAsBytes(bytes);
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
      Future<void> execute(BusyProject owner, {required bool mediaLevel}) async {
        final plan = await owner.prepareRequest(owner.roots.single.id,
          resource: owner.roots.single.id, pointer: '/paths/~1p/get');
        try {
          final parameter = (plan.result['parameters'] as List).single as Map;
          final examples = mediaLevel ? (((parameter['content'] as List).single as Map)['examples'] as List) : parameter['examples'] as List;
          final example = examples.single as Map;
          expect(example['name'], 'Captured');expect(example['wireBase64'], base64Encode(bytes));
          final result = await const ContractRequestExecutor().execute(plan, OperationRequestDraft(planIdentity: plan.identity,
            parameters: {OperationRequestDraft.parameterKey(mediaLevel ? 'querystring' : 'query', mediaLevel ? 'whole' : 'q'):
              RequestValue.serialized(utf8.decode(bytes), mediaLevel: mediaLevel)}), resolveSecret: (_) async => null);
          try { expect(result.conforming, true, reason: '${result.outgoing.findings} ${result.received.findings}'); }
          finally { await result.close(); }
          expect(seen.last, '/p?q=a%2Bb&q=%2520');
        } finally { plan.close(); }
      }
      await execute(project, mediaLevel: true);
      final review = await project.prepareMigration(file.uri.toString(), '${directory.path}/output', targetVersion: target);
      addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');
      expect(review.exampleCopies.single.resource, external.uri.toString());expect(review.exampleCopies.single.bytes, bytes);
      await review.publish();expect(await file.readAsString(), original);expect(await external.readAsBytes(), bytes);
      final relocated = await Directory(review.destination).rename('${directory.path}/cold query');
      await file.delete();await external.delete();
      final cold = await BusyProject.open(relocated.path, engine);addTearDown(cold.close);
      await execute(cold, mediaLevel: false);expect((await cold.check(cold.roots.single.id))['complete'], true);
    });
  }
}

void _b05R2InlineExamples() {
  for (final format in ['yaml', 'json']) for (final kind in ['json', 'latin1', 'empty']) {
    test('B05-R2 $format $kind exact captured examples materialize and cold reopen through Core and CLI', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-inline-examples-');addTearDown(() => directory.delete(recursive: true));
      final payload = _payload(kind), observed = <List<int>>[];
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      server.listen((request) async {
        final bytes = await request.fold<List<int>>([], (all, next) => all..addAll(next));observed.add(bytes);
        request.response.headers.set('content-type', payload.mediaType);request.response.add(bytes);await request.response.close();
      });
      final file = File('${directory.path}/api.$format'), external = File('${directory.path}/payload.bin');
      final original = _source('3.0.4', format, kind, port: server.port);
      await file.writeAsString(original);await external.writeAsBytes(payload.bytes);
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final source = await BusyProject.open(file.path, engine);addTearDown(source.close);
      final review = await source.prepareMigration(file.uri.toString(), '${directory.path}/target', targetVersion: '2.0');addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');expect(review.exampleCopies, isEmpty);
      expect(review.snapshot.exampleResources.single.bytes, payload.bytes);
      await review.publish();
      final arguments = ['migrate', file.path, '--target', '2.0', '--output', '${directory.path}/cli', '--json'];
      Future<ProcessResult> cli(List<String> extra) => Process.run('$testBundle/busyapi', [...arguments, ...extra],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      final preview = await cli([]);expect(preview.exitCode, 0, reason: '${preview.stdout} ${preview.stderr}');
      final report = jsonDecode(preview.stdout as String) as Map;expect(report['exampleOutputs'], isEmpty);expect(report['published'], false);
      final applied = await cli(['--apply', report['reviewIdentity'] as String]);expect(applied.exitCode, 0, reason: '${applied.stdout} ${applied.stderr}');
      Future<void> exchange(BusyProject owner, {bool captured = false}) async {
        final root = owner.roots.single.id, plan = await owner.prepareRequest(owner.roots.single.id, resource: owner.roots.single.id, pointer: '/paths/~1echo/post');
        addTearDown(plan.close);
        final media = (((plan.result['requestBody'] as Map)['content'] as List).single as Map), example = (media['examples'] as List).single as Map;
        final result = await const ContractRequestExecutor().execute(plan, OperationRequestDraft(planIdentity: plan.identity,
          body: captured ? RequestBodyDraft.example(plan.captureBodyExample(payload.mediaType, name: 'External')) :
            RequestBodyDraft.raw(mediaType: payload.mediaType, text: example['raw'] as String)), resolveSecret: (_) async => null);
        addTearDown(result.close);expect(result.conforming, true, reason: '${result.outgoing.findings} ${result.received.findings}');
        expect(observed.last, payload.bytes);expect(await result.response.decodedBytes(), payload.bytes);
        expect((await owner.check(root))['complete'], true);
      }
      await exchange(source, captured: true);
      expect(await file.readAsString(), original);expect(await external.readAsBytes(), payload.bytes);
      final moved = await Directory(review.destination).rename('${directory.path}/cold');await file.delete();await external.delete();
      for (final path in [moved.path, '${directory.path}/cli']) {
        final cold = await BusyProject.open(path, engine);addTearDown(cold.close);await exchange(cold);
      }
    });
  }
}

void _r3bReusableExamples() {
  for (final format in ['yaml', 'json']) {
    for (final failure in ['cancel', 'race', 'failure', 'stale-source', 'stale-example']) {
      test('R3b $format reusable owner publication rejects $failure atomically', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-r3b-publication-');
        addTearDown(() => directory.delete(recursive: true));
        final originals = r3bSources(format);
        for (final entry in originals.entries) await File('${directory.path}/${entry.key}').writeAsString(entry.value);
        final file = File('${directory.path}/api.$format'), library = File('${directory.path}/library.$format');
        final payload = File('${directory.path}/count.bin');
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
        final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
        final review = await project.prepareMigration(file.uri.toString(), '${directory.path}/converted', targetVersion: '2.0');
        addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');
        var cancelled = false;
        await expectLater(review.publish(cancelled: () => cancelled, beforePublish: () async {
          if (failure == 'cancel') cancelled = true;
          if (failure == 'race') {await Directory(review.destination).create();await File('${review.destination}/foreign').writeAsString('Keep');}
          if (failure == 'failure') throw const FileSystemException('Controlled R3b publication failure');
          if (failure == 'stale-source') {
            final buffer = await project.buffer(library.uri.toString());project.store.replace(buffer.id, buffer.text.replaceFirst('Original R3b', 'Changed R3b'));
          }
          if (failure == 'stale-example') await payload.writeAsString('0');
        }), throwsA(anything));
        expect(await file.readAsString(), originals['api.$format']);expect(await library.readAsString(), originals['library.$format']);
        expect(await payload.readAsString(), failure == 'stale-example' ? '0' : r3bCount);
        if (failure == 'race') {
          expect(await File('${review.destination}/foreign').readAsString(), 'Keep');
          expect(await File('${review.destination}/openapi.$format').exists(), false);
        } else {expect(await Directory(review.destination).exists(), false);}
      });
    }
    for (final unused in [null, 'path-item', 'media']) {
      test('R3b $format CLI ${unused ?? 'bound'} reusable owners preserve source and precise review disposition', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-r3b-cli-');addTearDown(() => directory.delete(recursive: true));
        final originals = r3bSources(format, unused: unused);
        for (final entry in originals.entries) await File('${directory.path}/${entry.key}').writeAsString(entry.value);
        final file = File('${directory.path}/api.$format'), destination = '${directory.path}/cli';
        Future<ProcessResult> cli(List<String> extra) => Process.run('$testBundle/busyapi',
          ['migrate', file.path, '--target', '2.0', '--output', destination, '--json', ...extra],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        final preview = await cli([]);expect(preview.exitCode, unused == null ? 0 : 2, reason: '${preview.stdout} ${preview.stderr}');
        final report = jsonDecode(preview.stdout as String) as Map;
        expect(report['published'], false);expect(await Directory(destination).exists(), false);
        if (unused == null) {
          expect(report['complete'], true);expect(report['exampleOutputs'], isEmpty);
          final applied = await cli(['--apply', report['reviewIdentity'] as String]);expect(applied.exitCode, 0, reason: '${applied.stdout} ${applied.stderr}');
          for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
          final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
          for (final name in originals.keys) await File('${directory.path}/$name').delete();
          final cold = await BusyProject.open(destination, engine);addTearDown(cold.close);
          final root = File('$destination/${report['entry']}').uri.toString(), checked = await cold.check(root);
          expect(checked['complete'], true, reason: '$checked');expect(checked['projection']['operations'], hasLength(2));
        } else {
          final code = unused == 'path-item' ? 'migration.path-item.unused-owner' : 'migration.media.unbound-owner';
          final problems = (report['problems'] as List).cast<Map>();
          expect(problems.any((problem) => problem['code'] == code && problem['reason'] == 'target-representation'), true, reason: '$problems');
          expect(report['outputs'], isEmpty);
          final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
          final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
          final blocked = await project.prepareMigration(file.uri.toString(), '${directory.path}/blocked-core', targetVersion: '2.0');
          addTearDown(blocked.close);expect(blocked.publishable, false);
          await expectLater(blocked.publish(), throwsA(isA<CoreFailure>()));
          expect(await Directory(blocked.destination).exists(), false);
          for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
        }
      });
    }
  }
}
