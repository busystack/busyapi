import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  test('captured entry-specific Schema map owners retain native connections, wire behavior and cold publication', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-entry-connections-');
    addTearDown(() => directory.delete(recursive: true));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    const wire = '{"entry":"neither","nested":{"kind":"ok"}}';
    server.listen((request) async {
      expect(request.method, 'GET');expect(request.uri.path, '/dictionary');
      expect(await request.fold<List<int>>([], (bytes, chunk) => bytes..addAll(chunk)), isEmpty);
      request.response.headers.set('content-type', 'application/json');
      request.response.add(utf8.encode(wire));await request.response.close();
    });
    const reference = 'b.yaml#/components/schemas';
    Map<String, Object?> document(String entry) => {
      'openapi': entry == 'First' ? '3.2.0' : '3.2.1', 'info': {'title': entry, 'version': '1'},
      'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
      'paths': {'/dictionary': {'get': {'responses': {'200': {'description': 'Values',
        'content': {'application/json': {'schema': {r'$ref': reference}}},
      }}}}},
      'components': {'schemas': {'Fallback': {
        'allOf': [{r'$ref': reference}], 'properties': {'entry': {'const': entry}}, 'x-entry': entry,
      }}}, 'x-number': 'EXACT',
    };
    final first = document('First'), second = document('Second');
    (second['components'] as Map)['schemas'].addAll({
      'properties': {'kind': {'type': 'string'}},
      'discriminator': {'propertyName': 'kind', 'defaultMapping': 'Fallback'},
      'additionalProperties': {'allOf': [{r'$ref': reference}]},
    });
    second['x-history'] = jsonDecode(jsonEncode((second['components'] as Map)['schemas']));
    final files = [File('${directory.path}/a.json'), File('${directory.path}/b.yaml')];
    for (final (index, value) in [first, second].indexed) {
      await files[index].writeAsString('${index == 1 ? '\ufeff# retained 雪\r\n' : ''}${jsonEncode(value).replaceAll('"EXACT"', '9007199254740993.00')}\r\n');
    }
    await File('${directory.path}/busyapi.yaml').writeAsString('version: 1\nroots: [{name: first, path: a.json}, {name: second, path: b.yaml}]\n');
    final originals = [for (final file in files) await file.readAsBytes()];
    const pointer = '/paths/~1dictionary/get/responses/200/content/application~1json/schema';
    Future<void> exercise(BusyProject project, String root, String entry) async {
      expect((await project.check(root))['status'], 'complete');
      var resource = root, at = pointer;
      Map<String, dynamic>? schema;
      for (var count = 0; count < 64; count++) {
        final page = await project.inspectObject(root, resource, at, contextKind: 'schema');
        final reference = (page['references'] as List).cast<Map>().where((value) => value['keyword'] == r'$ref').firstOrNull;
        if (reference == null) { schema = page;break; }
        resource = reference['targetResource'];at = reference['targetPointer'];
      }
      expect(schema, isNotNull, reason: 'Material forwarding is a finite captured graph');
      final metadata = await project.inspectObject(root, resource, '$at/discriminator', contextKind: 'discriminator');
      expect((metadata['fields'] as List).cast<Map>().singleWhere((field) => field['name'] == 'defaultMapping')['present'], true);
      final binding = (metadata['references'] as List).cast<Map>().singleWhere((value) => value['keyword'] == 'defaultMapping');
      final target = await project.inspectObject(root, binding['targetResource'], binding['targetPointer'], contextKind: 'schema');
      expect(target['value']['x-entry'], entry);
      final request = await project.prepareRequest(root, resource: root, pointer: '/paths/~1dictionary/get');
      try {
        final evaluated = await request.evaluateRuntime([
          for (final value in ['{}', wire, '{"kind":0}', '{"nested":{"kind":0}}']) RuntimeSchemaInstance(
            subject: 'response-body', location: 'application/json', text: value,
            schemaResource: root, schemaPointer: pointer),
        ]);
        expect(evaluated['complete'], true, reason: '$evaluated');
        expect((evaluated['runtimeEvaluations'] as List).map((value) => value['valid']), [true, true, false, false]);
        final response = await const ContractRequestExecutor().execute(request,
          OperationRequestDraft(planIdentity: request.identity), resolveSecret: (_) async => null);
        try { expect(response.conforming, true, reason: '${response.received.findings}');expect(await response.response.bytes(), utf8.encode(wire)); }
        finally { await response.close(); }
      } finally { request.close(); }
    }
    final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
    for (final (index, entry) in ['First', 'Second'].indexed) await exercise(source, files[index].uri.toString(), entry);
    final buffer = await source.buffer(files.first.uri.toString());
    source.store.replace(buffer.id, buffer.text.replaceFirst('First', 'Captured First'));
    final stale = await source.prepareMigration(buffer.id, '${directory.path}/stale', targetVersion: '3.2.1');
    addTearDown(stale.close);expect(stale.publishable, true, reason: '${stale.result}');
    source.store.replace(buffer.id, buffer.text.replaceFirst('Captured First', 'Current First'));
    await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'migration.stale')));
    final review = await source.prepareMigration(buffer.id, '${directory.path}/output', targetVersion: '3.2.1');
    addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');
    expect(review.result['producerVersion'], '100');
    await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>()));
    expect(await Directory(review.destination).exists(), false);
    await review.publish();expect([for (final file in files) await file.readAsBytes()], originals);
    source.close();final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');
    for (final file in files) await file.delete();
    final cold = await BusyProject.open(relocated.path, engine);addTearDown(cold.close);
    for (final (index, entry) in ['First', 'Second'].indexed) {
      final change = review.changes.singleWhere((change) => change.resource == files[index].uri.toString());
      final destination = File('${relocated.path}/${Uri.parse(change.destination).pathSegments.last}');
      await exercise(cold, destination.uri.toString(), entry);
      expect(await destination.readAsString(), contains('9007199254740993.00'));
      if (index == 1) {
        final native = await cold.inspectObject(destination.uri.toString(), destination.uri.toString(), '/components/schemas/discriminator', contextKind: 'schema');
        expect(native['value'], {'propertyName': 'kind', 'defaultMapping': 'Fallback'});
      }
    }
    final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'], environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
    expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
  });
}
