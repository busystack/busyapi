import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['2.0', '3.0.4']) {
    for (final format in ['yaml', 'json']) {
      test('$version $format restricted roles retain native inspection, HTTP and cold publication', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-restricted-roles-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        const count = '9007199254740993.00';
        server.listen((request) async {
          request.response.headers.set('X-Count', count);
          await request.response.close();
        });
        final swagger = version == '2.0';
        final native = swagger ? 'header' : 'response';
        final pointer = swagger ? '/responses/Shared/headers/X-Count' : '/components/responses/Shared';
        final response = <String, Object?>{
          'description': '[Shared](../guide.md)',
          if (swagger) 'headers': {'X-Count': {'type': 'integer', 'enum': ['EXACT']}},
        };
        final schemas = {'Use': {r'$ref': '#$pointer'}};
        final value = <String, Object?>{
          if (swagger) 'swagger': version else 'openapi': version,
          'info': {'title': 'Original', 'version': 'business'},
          if (swagger) ...{'host': '127.0.0.1:${server.port}', 'schemes': ['http']}
          else 'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
          'paths': {'/p': {'get': {'responses': {'200': {
            r'$ref': swagger ? '#/responses/Shared' : '#/components/responses/Shared',
          }}}}},
          if (swagger) ...{'responses': {'Shared': response}, 'definitions': schemas}
          else 'components': {'responses': {'Shared': response}, 'schemas': schemas},
        };
        final original = '${format == 'yaml' ? '# Retain restricted source 雪\r\n' : ''}${jsonEncode(value)}\r\n'
            .replaceAll('"EXACT"', count);
        final file = File('${directory.path}/api.$format');
        await file.writeAsString(original);
        final project = await BusyProject.open(file.path, engine);
        addTearDown(project.close);
        final root = file.uri.toString();
        project.store.replace(root, original.replaceFirst('Original', 'Unsaved 雪'));
        for (final kind in [native, 'schema']) {
          final page = await project.inspectObject(root, root, pointer, contextKind: kind);
          expect(page['kind'], kind);
          expect((page['interpretations'] as List).map((role) => role['kind']), containsAll([native, 'schema']));
          expect((await project.referencePage(root, root, pointer, contextKind: kind))['kind'], kind);
        }
        Future<List<bool>> outcomes(BusyProject owner, String id, String prefix) async {
          final plan = await owner.prepareRequest(id, resource: id, pointer: '/paths/~1p/get');
          try {
            final evaluated = await plan.evaluateRuntime([
              for (final text in [count, '0', 'null', 'false'])
                RuntimeSchemaInstance(subject: 'response-body', location: text, text: text,
                    schemaResource: id, schemaPointer: '$prefix/Use'),
            ]);
            expect(evaluated['complete'], true, reason: '$evaluated');
            final result = await const ContractRequestExecutor().execute(plan,
                OperationRequestDraft(planIdentity: plan.identity), resolveSecret: (_) async => null);
            try {
              expect(result.received.complete, true, reason: '${result.received.findings}');
              expect(result.received.valid, true, reason: '${result.received.findings}');
              expect(await result.response.bytes(), isEmpty);
              expect(result.response.headers.where((header) => header.$1.toLowerCase() == 'x-count').single.$2, count);
            } finally { await result.close(); }
            return (evaluated['runtimeEvaluations'] as List).cast<Map>()
                .map((evaluation) => evaluation['valid'] as bool).toList();
          } finally { plan.close(); }
        }
        final before = await outcomes(project, root, swagger ? '/definitions' : '/components/schemas');
        expect(before, swagger ? [true, false, false, false] : [true, true, true, true]);
        final review = await project.prepareMigration(root, '${directory.path}/converted', targetVersion: '3.2.1');
        addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');
        expect(review.unsaved, true);
        await review.publish();
        expect(await file.readAsString(), original);
        final moved = await Directory(review.destination).rename('${directory.path}/cold 雪');
        project.close(); await file.delete();
        final output = await BusyProject.open(moved.path, engine);
        addTearDown(output.close);
        final outputRoot = output.roots.single.id;
        expect((await output.check(outputRoot))['status'], 'complete');
        expect(await outcomes(output, outputRoot, '/components/schemas'), before);
        final cli = await Process.run('$testBundle/busyapi', ['check', moved.path, '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
      });
    }
  }
}
