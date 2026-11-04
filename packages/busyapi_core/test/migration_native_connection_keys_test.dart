import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['3.0.4', '3.2.0']) {
    test('native mapping keys and operationRef security survive $version HTTP and cold publication', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-native-connection-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      const wire = r'{"kind":"$dynamicRef","n":9007199254740993.00}';
      server.listen((request) async {
        expect(request.headers.value('X-Key'), 'captured-secret');expect(request.method, 'POST');
        final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));expect(bytes, utf8.encode(wire));
        request.response.headers.set('content-type', 'application/json');request.response.add(bytes);await request.response.close();
      });
      Map media() => {'application/json': {'schema': {r'$ref': '#/components/schemas/Parent'}}};
      final data = {
        'openapi': '3.2.1', 'info': {'title': 'Native connections', 'version': '1'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/echo': {'post': {'requestBody': {'required': true, 'content': media()}, 'responses': {'200': {'description': 'Reply', 'content': media()}}}}},
        'components': {
          'securitySchemes': {'operationRef': {'type': 'apiKey', 'in': 'header', 'name': 'X-Key'}},
          'schemas': {
            'Parent': {'type': 'object', 'required': ['kind'], 'properties': {'kind': {'type': 'string'}},
              'oneOf': [{r'$ref': '#choice'}], 'discriminator': {'propertyName': 'kind', 'mapping': {
                r'$ref': '#choice', r'$dynamicRef': '#choice', 'operationRef': '#choice',
              }}},
            'Choice': {r'$dynamicAnchor': 'choice', 'type': 'object', 'required': ['kind'], 'properties': {'kind': {'type': 'string'}, 'n': {'enum': ['EXACT']}}},
            'Peer': {r'$id': 'peer', r'$dynamicAnchor': 'choice', 'type': 'integer'},
          },
        },
        'security': [{'operationRef': <String>[]}], 'x-literal': {r'$ref': 'literal', r'$dynamicRef': 'literal'},
      };
      final file = File('${directory.path}/api.yaml');
      await file.writeAsString('\ufeff# Keep native keys 雪\r\n${jsonEncode(data).replaceAll('"EXACT"', '9007199254740993.00')}\r\n');
      final original = await file.readAsBytes();
      const secret = '11111111-1111-4111-8111-111111111111';
      final manifest = File('${directory.path}/busyapi.yaml');
      await manifest.writeAsString('version: 1\nroots: [{name: api, path: api.yaml}]\nenvironments:\n  manual:\n    authentication:\n      alternative: 0\n      schemes:\n        operationRef: {secretRef: $secret}\n');
      final originalManifest = await manifest.readAsBytes();
      Future<void> exercise(BusyProject project, String root) async {
        final checked = await project.check(root);expect(checked['status'], 'complete', reason: '$checked');
        final view = await project.inspectObject(root, root, '/components/schemas/Parent/discriminator/mapping');
        expect((view['entries'] as List).map((entry) => entry['name']), [r'$ref', r'$dynamicRef', 'operationRef']);
        for (final reference in view['references'] as List) { expect(reference['resolution'], 'resolved');expect(reference['dynamic'], isNull); }
        final requirement = await project.inspectObject(root, root, '/security/0');
        final binding = (requirement['entries'] as List).single as Map;
        expect(binding['name'], 'operationRef');
        expect(await project.readDataValue(Map<String, dynamic>.from(binding)), '[]');
        final prepared = await project.prepareRequest(root, resource: root, pointer: '/paths/~1echo/post');
        try {
          final result = await prepared.evaluateRuntime([
            for (final text in [wire, '{"kind":"unknown"}', '{"kind":0}', r'{"kind":"$dynamicRef","n":9007199254740992}'])
              RuntimeSchemaInstance(subject: 'request-body', location: 'application/json', text: text, schemaResource: root, schemaPointer: '/components/schemas/Parent'),
          ]);
          expect(result['complete'], true, reason: '$result');expect((result['runtimeEvaluations'] as List).map((value) => value['valid']), [true, true, false, false]);
          final response = await const ContractRequestExecutor().execute(prepared,
            OperationRequestDraft(planIdentity: prepared.identity, environment: 'manual', body: const RequestBodyDraft.raw(mediaType: 'application/json', text: wire)),
            resolveSecret: (reference) async { expect(reference, secret);return 'captured-secret'; });
          try { expect(response.conforming, true, reason: '${response.outgoing.findings} ${response.received.findings}');expect(await response.response.bytes(), utf8.encode(wire)); }
          finally { await response.close(); }
        } finally { prepared.close(); }
      }
      final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);await exercise(source, file.uri.toString());
      final review = await source.prepareMigration(file.uri.toString(), '${directory.path}/output', targetVersion: version);addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');
      await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>()));expect(await Directory(review.destination).exists(), false);
      await review.publish();expect(await file.readAsBytes(), original);expect(await manifest.readAsBytes(), originalManifest);
      source.close();final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');await file.delete();await manifest.delete();
      final project = await BusyProject.open(relocated.path, engine);addTearDown(project.close);
      final change = review.changes.singleWhere((change) => change.resource == file.uri.toString());
      await exercise(project, File('${relocated.path}/${Uri.parse(change.destination).pathSegments.last}').uri.toString());
      final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'], environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
    });
  }
}
