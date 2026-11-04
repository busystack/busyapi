import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final target in ['2.0', '3.0.4']) {
    for (final format in ['yaml', 'json']) {
      test('$target $format array mappings retain reviewed HTTP and CLI behavior', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-array-migration-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        const body = '[9007199254740993.00,0]';
        const objectBody = '{"known":"雪","n":9007199254740993.00}';
        server.listen((request) async {
          request.response.headers.set('content-type', 'application/json');
          if (request.uri.path == '/echo') {
            expect(request.method, 'POST');
            final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));
            expect(bytes, utf8.encode(objectBody));request.response.add(bytes);
          } else { request.response.add(utf8.encode(body)); }
          await request.response.close();
        });
        final models = <String, Object?>{
          'Model': {'type': 'array', 'contains': {'allOf': [{'not': false}, {'oneOf': [false, true]}]}, 'minContains': 1,
            'maxContains': 2, 'unevaluatedItems': false},
          'Independent': {r'$ref': '#/components/schemas/Model/unevaluatedItems'},
          'Object': {'type': 'object', 'properties': {'known': {'type': 'string'}, 'next': {r'$ref': '#/components/schemas/Object'}},
            'unevaluatedProperties': {'type': 'integer', 'minimum': 'EXACT'}},
          'ObjectValue': {r'$ref': '#/components/schemas/Object/unevaluatedProperties'},
          'ArrayLocal': {'type': 'array', 'unevaluatedItems': {'type': 'integer'}},
          'ArrayCovered': {'type': 'array', 'items': {'type': 'integer'},
            'unevaluatedItems': {'patternProperties': {'.': {'contains': {'type': 'integer'}}}}},
          if (target == '2.0') 'UnevaluatedTuple': {
            'type': 'array', 'prefixItems': [{'type': 'string'}],
            'unevaluatedItems': {'type': 'integer', 'minimum': 'EXACT'}, 'maxItems': 3,
          },
          if (target == '2.0') 'Tuple': {
            'prefixItems': [{'type': 'string'}], 'items': {'type': 'integer', 'minimum': 'EXACT'},
            'allOf': [{r'$ref': '#/components/schemas/Bound'}],
          },
          if (target == '2.0') 'UniformTuple': {
            'type': 'array', 'prefixItems': [{'type': 'integer', 'enum': ['EXACT']}],
            'items': {'type': 'number'},
          },
          if (target == '2.0') 'Bound': {'anyOf': [{'maxItems': 2}, {'maxItems': 3}]},
        };
        final value = {
          'openapi': '3.2.1', 'info': {'title': 'Original', 'version': 'business'},
          'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
          'paths': {'/p': {'get': {'responses': {'200': {'description': 'Array counts',
            'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Model'}}},
          }}}}, '/echo': {'post': {
            'requestBody': {'required': true, 'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Object'}}}},
            'responses': {'200': {'description': 'Echo', 'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Object'}}}}},
          }}},
          'components': {'schemas': models},
          'x-literal': {'contains': false, 'minContains': 'EXACT'},
        };
        final original = '${format == 'yaml' ? '# Preserve array source 雪\r\n' : ''}${jsonEncode(value)}\r\n'
            .replaceAll('"EXACT"', '9007199254740993.00');
        final file = File('${directory.path}/api.$format');
        await file.writeAsString(original);
        final project = await BusyProject.open(file.path, engine);
        addTearDown(project.close);
        final root = file.uri.toString();
        project.store.replace(root, original.replaceFirst('Original', 'Captured 雪'));
        Future<List<bool>> outcomes(BusyProject owner, String id, String prefix) async {
          final plan = await owner.prepareRequest(id, resource: id, pointer: '/paths/~1p/get');
          try {
            final check = await plan.evaluateRuntime([
              for (final text in ['null', '[]', '[0]', body, '[0,1,2]'])
                RuntimeSchemaInstance(subject: 'response-body', location: text, text: text,
                    schemaResource: id, schemaPointer: '$prefix/Model'),
              for (final text in ['null', '0', '[]'])
                RuntimeSchemaInstance(subject: 'response-body', location: 'independent$text', text: text,
                    schemaResource: id, schemaPointer: '$prefix/Independent'),
              for (final text in [objectBody, '{"known":0}', '{"n":0}', '{"next":{"n":9007199254740993.00}}'])
                RuntimeSchemaInstance(subject: 'request-body', location: 'object$text', text: text, schemaResource: id, schemaPointer: '$prefix/Object'),
              for (final text in ['9007199254740993.00', '0', 'null'])
                RuntimeSchemaInstance(subject: 'response-body', location: 'object-value$text', text: text, schemaResource: id, schemaPointer: '$prefix/ObjectValue'),
              for (final name in ['ArrayLocal', 'ArrayCovered']) for (final text in ['[]', body, '["雪"]'])
                RuntimeSchemaInstance(subject: 'response-body', location: '$name$text', text: text, schemaResource: id, schemaPointer: '$prefix/$name'),
              if (target == '2.0') for (final text in ['[]', '["雪",9007199254740993.00]', '["雪",0]', '["雪",9007199254740993,9007199254740993,9007199254740993]'])
                RuntimeSchemaInstance(subject: 'response-body', location: 'tuple$text', text: text, schemaResource: id, schemaPointer: '$prefix/UnevaluatedTuple'),
              if (target == '2.0') for (final text in ['[]', '[9007199254740993.00]', '[9007199254740993,0.25,-1e999]', '[9007199254740992,0]', '[9007199254740993,"bad"]'])
                RuntimeSchemaInstance(subject: 'response-body', location: 'uniform$text', text: text, schemaResource: id, schemaPointer: '$prefix/UniformTuple'),
            ]);
            expect(check['complete'], true, reason: '$check');
            final response = await const ContractRequestExecutor().execute(plan,
                OperationRequestDraft(planIdentity: plan.identity), resolveSecret: (_) async => null);
            try {
              expect(response.received.complete, true, reason: '${response.received.findings}');
              expect(response.received.valid, true, reason: '${response.received.findings}');
              expect(await response.response.bytes(), utf8.encode(body));
            } finally { await response.close(); }
            final objectPlan = await owner.prepareRequest(id, resource: id, pointer: '/paths/~1echo/post');
            try {
              final echo = await const ContractRequestExecutor().execute(objectPlan,
                OperationRequestDraft(planIdentity: objectPlan.identity, body: const RequestBodyDraft.raw(mediaType: 'application/json', text: objectBody)),
                resolveSecret: (_) async => null);
              try { expect(echo.conforming, true, reason: '${echo.outgoing.findings} ${echo.received.findings}');expect(await echo.response.bytes(), utf8.encode(objectBody)); }
              finally { await echo.close(); }
            } finally { objectPlan.close(); }
            return (check['runtimeEvaluations'] as List).cast<Map>()
                .map((evaluation) => evaluation['valid'] as bool).toList();
          } finally { plan.close(); }
        }
        final before = await outcomes(project, root, '/components/schemas');
        expect(before, [false, false, true, true, false, false, false, false,
          true, false, false, true, true, false, false,
          true, true, false, true, true, false,
          if (target == '2.0') ...[true, true, false, false, true, true, true, false, false]]);
        final destination = '${directory.path}/converted';
        final review = await project.prepareMigration(root, destination, targetVersion: target);
        addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');
        expect(review.unsaved, true);
        await expectLater(review.publish(cancelled: () => true), throwsA(
            isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
        expect(await Directory(destination).exists(), false);
        await review.publish();
        expect(await file.readAsString(), original);
        final moved = await Directory(destination).rename('${directory.path}/cold 雪');
        project.close();
        await file.delete();
        final output = await BusyProject.open(moved.path, engine);
        addTearDown(output.close);
        final outputRoot = output.roots.single.id;
        expect((await output.check(outputRoot))['status'], 'complete');
        final prefix = target == '2.0' ? '/definitions' : '/components/schemas';
        expect(await outcomes(output, outputRoot, prefix), before);
        final object = await output.inspectObject(outputRoot, outputRoot, '$prefix/Object', contextKind: 'schema');
        expect((object['fields'] as List).cast<Map>().singleWhere((field) => field['name'] == 'additionalProperties')['present'], true);
        final array = await output.inspectObject(outputRoot, outputRoot, '$prefix/ArrayLocal', contextKind: 'schema');
        expect((array['fields'] as List).cast<Map>().singleWhere((field) => field['name'] == 'items')['present'], true);
        final cli = await Process.run('$testBundle/busyapi', ['check', moved.path, '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
        expect((jsonDecode(cli.stdout as String) as Map)['complete'], true);
      });
    }
  }
}
