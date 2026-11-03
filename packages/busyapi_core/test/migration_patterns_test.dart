import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['2.0', '3.0.4']) {
    test('finite patterns retain native properties and exact request/response bytes through $version publication', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-finite-pattern-');
      addTearDown(() => directory.delete(recursive: true));
      await Directory('${directory.path}/defs').create();
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      const wire = '{"n":9007199254740993.00,"n2":10,"😀":0,"a/~雪":9007199254740993.00,"free":"雪","child":{"n":0}}';
      server.listen((request) async {
        expect(request.method, 'POST');expect(request.uri.path, '/echo');
        final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));expect(bytes, utf8.encode(wire));
        request.response.headers.set('content-type', 'application/json');request.response.add(bytes);await request.response.close();
      });
      const patterns = {'^n': {'type': 'integer', 'minimum': 0, 'externalDocs': {'url': './pattern.html'}, 'description': '[Guide](./guide.md)'},
        r'2$': {'type': 'integer', 'maximum': 20}, r'^.$': {'type': 'integer'},
        r'^a/~雪$': {'type': 'integer', 'enum': ['EXACT']}, r'^child$': {r'$ref': '#/Value'}, '^never': {'contains': {'type': 'integer'}}};
      Map media() => {'application/json': {'schema': {r'$ref': '#/components/schemas/Value'}}};
      final file = File('${directory.path}/api.yaml');
      final text = '\ufeff# Keep patterns 雪\r\n${jsonEncode({
        'openapi': '3.2.1', 'info': {'title': 'Finite patterns', 'version': '1'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}], 'x-patterns': patterns,
        'paths': {'/echo': {'post': {'requestBody': {'required': true, 'content': media()}, 'responses': {'200': {'description': 'Reply', 'content': media()}}}}},
        'components': {'schemas': {
          'Value': {r'$ref': 'defs/models.yaml#/Value'},
          'Independent': {r'$ref': 'defs/models.yaml#/Value/patternProperties/%5En'},
        }},
      }).replaceAll('"EXACT"', '9007199254740993.00')}\r\n';
      await file.writeAsString(text);final original = await file.readAsBytes();
      final models = File('${directory.path}/defs/models.yaml');
      final modelText = '# Keep external values 雪\r\n${jsonEncode({'Value': {
        'propertyNames': {'enum': ['n', 'n2', '😀', 'a/~雪', 'free', 'child']}, 'properties': {'n': {'enum': [0, 'EXACT']}},
        'patternProperties': patterns, 'additionalProperties': {'type': 'string'},
      }}).replaceAll('"EXACT"', '9007199254740993.00')}\r\n';
      await models.writeAsString(modelText);final originalModels = await models.readAsBytes();
      Future<void> exercise(BusyProject project, String root, String prefix) async {
        expect((await project.check(root))['status'], 'complete');
        final prepared = await project.prepareRequest(root, resource: root, pointer: '/paths/~1echo/post');
        try {
          final result = await prepared.evaluateRuntime([
            for (final sample in [wire, '{"n2":30}', '{"😀":"text"}', '{"free":0}', '{"other":0}', '{"child":{"n":1}}', 'null'])
              RuntimeSchemaInstance(subject: 'request-body', location: 'application/json', text: sample, schemaResource: root, schemaPointer: '${prefix}Value'),
            for (final sample in ['0', '-1', 'null']) RuntimeSchemaInstance(subject: 'response-body', location: 'independent', text: sample, schemaResource: root, schemaPointer: '${prefix}Independent'),
          ]);
          expect(result['complete'], true, reason: '$result');expect((result['runtimeEvaluations'] as List).map((value) => value['valid']), [true, false, false, false, false, false, true, true, false, false]);
          final response = await const ContractRequestExecutor().execute(prepared,
            OperationRequestDraft(planIdentity: prepared.identity, body: const RequestBodyDraft.raw(mediaType: 'application/json', text: wire)), resolveSecret: (_) async => null);
          try { expect(response.conforming, true, reason: '${response.outgoing.findings} ${response.received.findings}');expect(await response.response.bytes(), utf8.encode(wire)); }
          finally { await response.close(); }
        } finally { prepared.close(); }
      }
      final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
      await exercise(source, file.uri.toString(), '/components/schemas/');
      final review = await source.prepareMigration(file.uri.toString(), '${directory.path}/output', targetVersion: version);
      addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');
      await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>()));expect(await Directory(review.destination).exists(), false);
      await review.publish();expect(await file.readAsBytes(), original);expect(await models.readAsBytes(), originalModels);
      source.close();final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');await file.delete();await models.delete();
      final project = await BusyProject.open(relocated.path, engine);addTearDown(project.close);
      final change = review.changes.singleWhere((value) => value.resource == file.uri.toString());
      final destination = File('${relocated.path}/${Uri.parse(change.destination).pathSegments.last}'),root = destination.uri.toString();
      final prefix = version == '2.0' ? '/definitions/' : '/components/schemas/';
      await exercise(project, root, prefix);
      final modelAlias = await project.inspectObject(root, root, '${prefix}Value', contextKind: 'schema');
      final modelReference = (modelAlias['references'] as List).single;
      final properties = await project.inspectObject(root, modelReference['targetResource'], '${modelReference['targetPointer']}/properties', contextKind: 'schema-map');
      expect((properties['entries'] as List).map((value) => value['name']), containsAll(['n', 'n2', '😀', 'a/~雪', 'child']));
      final model = await project.inspectObject(root, modelReference['targetResource'], modelReference['targetPointer'], contextKind: 'schema');
      expect((model['fields'] as List).cast<Map>().singleWhere((field) => field['name'] == 'allOf')['present'], true);
      final independent = await project.inspectObject(root, root, '${prefix}Independent', contextKind: 'schema');
      final material = (independent['references'] as List).single;expect(material['targetPointer'], endsWith('/items'));
      final docs = await project.inspectObject(root, material['targetResource'], '${material['targetPointer']}/externalDocs', contextKind: 'external-documentation');
      expect(docs['value']['url'], File('${directory.path}/defs/pattern.html').uri.toString());
      final document = await project.inspectObject(root, root, '');
      final history = (document['entries'] as List).cast<Map>().singleWhere((entry) => entry['name'] == 'x-patterns');
      final raw = await project.readDataValue(Map<String, dynamic>.from(history));expect(raw, contains('9007199254740993.00'));
      expect(jsonDecode(raw), jsonDecode(jsonEncode(patterns).replaceAll('"EXACT"', '9007199254740993.00')));
      expect(await destination.readAsString(), contains('9007199254740993.00'));
      final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'], environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
    });
  }
}
