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
        server.listen((request) async {
          request.response.headers.set('content-type', 'application/json');
          request.response.add(utf8.encode(body));
          await request.response.close();
        });
        final models = <String, Object?>{
          'Model': {'type': 'array', 'contains': true, 'minContains': 1,
            'maxContains': 2, 'unevaluatedItems': false},
          'Independent': {r'$ref': '#/components/schemas/Model/unevaluatedItems'},
          if (target == '2.0') 'Tuple': {
            'prefixItems': [{'type': 'string'}], 'items': {'type': 'integer', 'minimum': 'EXACT'},
            'allOf': [{r'$ref': '#/components/schemas/Bound'}],
          },
          if (target == '2.0') 'Bound': {'anyOf': [{'maxItems': 2}, {'maxItems': 3}]},
        };
        final value = {
          'openapi': '3.2.1', 'info': {'title': 'Original', 'version': 'business'},
          'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
          'paths': {'/p': {'get': {'responses': {'200': {'description': 'Array counts',
            'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Model'}}},
          }}}}},
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
            ]);
            expect(check['complete'], true, reason: '$check');
            final response = await const ContractRequestExecutor().execute(plan,
                OperationRequestDraft(planIdentity: plan.identity), resolveSecret: (_) async => null);
            try {
              expect(response.received.complete, true, reason: '${response.received.findings}');
              expect(response.received.valid, true, reason: '${response.received.findings}');
              expect(await response.response.bytes(), utf8.encode(body));
            } finally { await response.close(); }
            return (check['runtimeEvaluations'] as List).cast<Map>()
                .map((evaluation) => evaluation['valid'] as bool).toList();
          } finally { plan.close(); }
        }
        final before = await outcomes(project, root, '/components/schemas');
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
        expect(await outcomes(output, outputRoot, target == '2.0' ? '/definitions' : '/components/schemas'), before);
        final cli = await Process.run('$testBundle/busyapi', ['check', moved.path, '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
        expect((jsonDecode(cli.stdout as String) as Map)['complete'], true);
      });
    }
  }
}
