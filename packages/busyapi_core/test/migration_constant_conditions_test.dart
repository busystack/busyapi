import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final mode in ['true', 'false', 'equal']) {
    final positive = mode == 'true', equal = mode == 'equal';
    final Object condition = equal ? {'type': 'integer'} : positive;
    test('$mode condition preserves request bytes, independent schemas and cold Swagger publication', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-constant-condition-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      const wire = '{"n":9007199254740993.00,"child":{"n":0}}';
      server.listen((request) async {
        expect(request.method, 'POST');expect(request.uri.path, '/echo');
        final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));expect(bytes, utf8.encode(wire));
        request.response.headers.set('content-type', 'application/json');request.response.add(bytes);await request.response.close();
      });
      const active = {'type': 'object', 'required': ['n'], 'properties': {'n': {'type': 'integer', 'enum': [0, 'EXACT']}, 'child': {r'$ref': '#/components/schemas/Value'}}, 'description': 'Active 雪'};
      const inactive = {'type': 'object', 'patternProperties': {'^never': {'type': 'integer'}}, 'description': 'Inactive'};
      Map media() => {'application/json': {'schema': {r'$ref': '#/components/schemas/Value'}}};
      final file = File('${directory.path}/api.yaml');
      final text = '\ufeff# Keep condition 雪\r\n${jsonEncode({
        'openapi': '3.2.1', 'info': {'title': 'Constant condition', 'version': '1'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/echo': {'post': {'requestBody': {'required': true, 'content': media()}, 'responses': {'200': {'description': 'Reply', 'content': media()}}}}},
        'components': {'schemas': {
          'Value': {'if': condition, 'then': positive || equal ? active : inactive, 'else': equal || !positive ? active : inactive},
          'Condition': {r'$ref': '#/components/schemas/Value/if'}, 'Branch': {r'$ref': '#/components/schemas/Value/${positive || equal ? 'then' : 'else'}'},
        }}, 'x-history': {'if': condition, 'then': inactive, 'zero': 0, 'flag': false, 'empty': '', 'text': '雪'},
      }).replaceAll('"EXACT"', '9007199254740993.00')}\r\n';
      await file.writeAsString(text);final original = await file.readAsBytes();
      Future<void> exercise(BusyProject project, String root, String prefix) async {
        expect((await project.check(root))['status'], 'complete');
        final prepared = await project.prepareRequest(root, resource: root, pointer: '/paths/~1echo/post');
        try {
          final result = await prepared.evaluateRuntime([
            for (final name in ['Value', 'Branch', 'Condition']) for (final sample in [wire, '{"n":9007199254740992}', '{}', 'null'])
              RuntimeSchemaInstance(subject: 'request-body', location: name, text: sample, schemaResource: root, schemaPointer: '$prefix$name'),
          ]);
          expect(result['complete'], true, reason: '$result');expect((result['runtimeEvaluations'] as List).map((value) => value['valid']), [true, false, false, false, true, false, false, false, positive, positive, positive, positive]);
          final response = await const ContractRequestExecutor().execute(prepared,
            OperationRequestDraft(planIdentity: prepared.identity, body: const RequestBodyDraft.raw(mediaType: 'application/json', text: wire)), resolveSecret: (_) async => null);
          try { expect(response.conforming, true, reason: '${response.outgoing.findings} ${response.received.findings}');expect(await response.response.bytes(), utf8.encode(wire)); }
          finally { await response.close(); }
        } finally { prepared.close(); }
      }
      final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
      await exercise(source, file.uri.toString(), '/components/schemas/');
      final review = await source.prepareMigration(file.uri.toString(), '${directory.path}/output', targetVersion: '2.0');
      addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');
      await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>()));expect(await Directory(review.destination).exists(), false);
      await review.publish();expect(await file.readAsBytes(), original);
      source.close();final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');await file.delete();
      final project = await BusyProject.open(relocated.path, engine);addTearDown(project.close);
      final change = review.changes.singleWhere((value) => value.resource == file.uri.toString());
      final root = File('${relocated.path}/${Uri.parse(change.destination).pathSegments.last}').uri.toString();
      await exercise(project, root, '/definitions/');
      final value = await project.inspectObject(root, root, '/definitions/Value', contextKind: 'schema');
      expect((value['fields'] as List).cast<Map>().singleWhere((field) => field['name'] == 'allOf')['present'], true);
      final document = await project.inspectObject(root, root, '');
      final history = (document['entries'] as List).cast<Map>().singleWhere((entry) => entry['name'] == 'x-history');
      expect(jsonDecode(await project.readDataValue(Map<String, dynamic>.from(history))), {'if': condition, 'then': inactive, 'zero': 0, 'flag': false, 'empty': '', 'text': '雪'});
      final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'], environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
    });
  }
}
