import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['2.0', '3.0.4']) {
    test('$version native literal models retain HTTP behavior and cross-family references refuse with source locations', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-restricted-owners-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      const wire = '{"n":9007199254740993.00,"kind":"chosen","next":{"n":0,"kind":"chosen"}}';
      server.listen((request) async {
        expect(request.method, 'GET');expect(request.uri.path, '/model');
        expect(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)), isEmpty);
        request.response.headers.set('content-type', 'application/json');request.response.add(utf8.encode(wire));await request.response.close();
      });
      final swagger = version == '2.0';
      final pointer = swagger ? '/definitions/Data/default' : '/components/examples/Payload/value';
      Map<String, Object?> response(String reference) => {'description': 'Model', 'content': {'application/json': {'schema': {r'$ref': reference}}}};
      final base = {'type': 'object', 'required': ['n', 'kind'], 'properties': {
        'n': {'type': 'integer', 'enum': [0, 'EXACT']}, 'kind': {'type': 'string'}, 'next': {r'$ref': '#$pointer'},
      }, 'description': '[Guide](./guide.md)', if (!swagger) 'discriminator': {'propertyName': 'kind', 'mapping': {'chosen': 'Dog'}}};
      final first = {'openapi': '3.2.1', 'info': {'title': 'First', 'version': '1'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/model': {'get': {'responses': {'200': response('#/components/schemas/Base')}}}},
        'components': {'schemas': {'Base': {r'$ref': 'b.yaml#$pointer'}, if (!swagger) 'Dog': {'allOf': [{r'$ref': '#/components/schemas/Base'}], 'x-entry': 'First'}}},
      };
      final second = {if (swagger) 'swagger': version else 'openapi': version, 'info': {'title': 'Second', 'version': '1'},
        if (swagger) ...{'host': '127.0.0.1:${server.port}', 'schemes': ['http'], 'produces': ['application/json'],
          'definitions': {'Data': {'default': base}, 'Base': {r'$ref': '#$pointer'}}}
        else ...{'servers': [{'url': 'http://127.0.0.1:${server.port}'}], 'components': {'examples': {'Payload': {'value': base}}, 'schemas': {
          'Base': {r'$ref': '#$pointer'}, 'Dog': {'allOf': [{r'$ref': '#/components/schemas/Base'}], 'x-entry': 'Second'},
        }}},
        'paths': {'/model': {'get': {'responses': {'200': swagger ? {'description': 'Model', 'schema': {r'$ref': '#/definitions/Base'}} : response('#/components/schemas/Base')}}}},
      };
      final files = [File('${directory.path}/a.json'), File('${directory.path}/b.yaml')];
      for (final (index, value) in [first, second].indexed) {
        await files[index].writeAsString('${index == 1 ? '\ufeff# Keep restricted 雪\r\n' : ''}${jsonEncode(value).replaceAll('"EXACT"', '9007199254740993.00')}\r\n');
      }
      await File('${directory.path}/busyapi.yaml').writeAsString('version: 1\nroots: [{name: first, path: a.json}, {name: second, path: b.yaml}]\n');
      final originals = [for (final file in files) await file.readAsBytes()];
      Future<void> exercise(BusyProject project, String root, String schemaPointer) async {
        expect((await project.check(root))['status'], 'complete');
        final prepared = await project.prepareRequest(root, resource: root, pointer: '/paths/~1model/get');
        try {
          final evaluated = await prepared.evaluateRuntime([for (final text in [wire, '{"n":0,"kind":"unknown"}', '{"n":0,"kind":"chosen","next":{"n":1,"kind":"chosen"}}', '{}'])
            RuntimeSchemaInstance(subject: 'response-body', location: 'application/json', text: text, schemaResource: root, schemaPointer: schemaPointer)]);
          expect(evaluated['complete'], true, reason: '$evaluated');expect((evaluated['runtimeEvaluations'] as List).map((value) => value['valid']), [true, true, false, false]);
          final response = await const ContractRequestExecutor().execute(prepared, OperationRequestDraft(planIdentity: prepared.identity), resolveSecret: (_) async => null);
          try { expect(response.conforming, true, reason: '${response.received.findings}');expect(await response.response.bytes(), utf8.encode(wire)); }
          finally { await response.close(); }
        } finally { prepared.close(); }
      }
      final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
      final root = files.first.uri.toString();
      final checked = await source.check(root);
      expect(checked['complete'], false, reason: '$checked');
      expect((checked['findings'] as List).whereType<Map>().any((finding) =>
          finding['code'] == 'reference.family.unsupported' && finding['resource'] == root), true);
      await exercise(source, files[1].uri.toString(), swagger ? '/definitions/Base' : '/components/schemas/Base');
      final review = await source.prepareMigration(root, '${directory.path}/output', targetVersion: '3.2.1');
      addTearDown(review.close);
      expect(review.publishable, false, reason: '${review.result}');
      expect(review.result['outputs'], isEmpty);expect(review.result['changes'], isEmpty);
      expect(review.problems.any((problem) => problem.code == 'migration.validation.reference.family.unsupported' &&
          problem.reason == MigrationProblemReason.unavailableProof && problem.resource == root &&
          problem.range.end > problem.range.start), true, reason: '${review.result}');
      await expectLater(review.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.blocked')));
      expect(await Directory(review.destination).exists(), false);
      expect([for (final file in files) await file.readAsBytes()], originals);
    });
  }
}
