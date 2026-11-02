import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['3.1.2', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('$version $format independent native resource views retain Markdown, bytes and cold reopening', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-resource-context-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        const count = '9007199254740993.00';
        server.listen((request) async {
          request.response.headers.set('content-type', 'application/json');
          request.response.add(utf8.encode(count));
          await request.response.close();
        });
        const pointer = r'/components/schemas/Resource/$defs/Shared';
        final body = {'description': '[Guide](guide.md)', 'content': {
          'application/json': {'schema': {r'$ref': 'target.json#/Thing'}},
        }};
        final value = {
          'openapi': version, 'info': {'title': 'Original', 'version': 'business'},
          'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
          'paths': {'/p': {'get': {'responses': {'200': {r'$ref': '#$pointer'}}}}},
          'components': {'schemas': {'Resource': {
            r'$id': 'https://schemas.invalid/base/resource',
            r'$schema': 'https://json-schema.org/draft/2020-12/schema',
            r'$defs': {'Shared': body},
          }}},
        };
        final original = '${format == 'yaml' ? '# Preserve native/schema ownership 雪\r\n' : ''}${jsonEncode(value)}\r\n';
        final file = File('${directory.path}/api.$format'), model = File('${directory.path}/target.json');
        await file.writeAsString(original);
        await model.writeAsString('{"Thing":{"type":"integer","enum":[$count]}}');
        final project = await BusyProject.open(file.path, engine);
        addTearDown(project.close);
        final root = file.uri.toString();
        project.store.replace(root, original.replaceFirst('Original', 'Captured 雪'));
        for (final role in ['schema', 'response']) {
          final page = await project.referencePage(root, root, pointer, contextKind: role);
          final field = (page['entries'] as List).cast<Map>().singleWhere((field) => field['name'] == 'description');
          expect(field['parentKind'], role);
          final expected = role == 'schema' ? 'https://schemas.invalid/base/resource' : root;
          expect(referenceMarkdownBase(Map<String, dynamic>.from(field)), expected);
          final scalar = await project.referencePage(root, root, '$pointer/description', data: true, parentKind: role);
          expect(scalar['richText'], true);
          expect(referenceMarkdownBase(scalar), expected);
        }
        Future<void> send(BusyProject owner, String id) async {
          final plan = await owner.prepareRequest(id, resource: id, pointer: '/paths/~1p/get');
          try {
            final schema = ((((plan.result['responses'] as List).single as Map)['content'] as List).single as Map)['schema'] as Map;
            final checked = await plan.evaluateRuntime([
              for (final text in [count, '0']) RuntimeSchemaInstance(
                subject: 'response-body', location: text, text: text,
                schemaResource: schema['resource'] as String, schemaPointer: schema['pointer'] as String,
              ),
            ]);
            expect(checked['complete'], true, reason: '$checked');
            expect((checked['runtimeEvaluations'] as List).map((proof) => proof['valid']), [true, false]);
            final response = await const ContractRequestExecutor().execute(plan,
                OperationRequestDraft(planIdentity: plan.identity), resolveSecret: (_) async => null);
            try {
              expect(response.received.complete, true, reason: '${response.received.findings}');
              expect(response.received.valid, true, reason: '${response.received.findings}');
              expect(await response.response.bytes(), utf8.encode(count));
            } finally { await response.close(); }
          } finally { plan.close(); }
        }
        await send(project, root);
        final review = await project.prepareMigration(root, '${directory.path}/converted', targetVersion: '3.2.1');
        addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');
        expect(review.unsaved, true);
        await review.publish();
        expect(await file.readAsString(), original);
        final moved = await Directory(review.destination).rename('${directory.path}/cold 雪');
        project.close(); await file.delete(); await model.delete();
        final output = await BusyProject.open(moved.path, engine);
        addTearDown(output.close);
        final outputRoot = output.roots.single.id;
        expect((await output.check(outputRoot))['status'], 'complete');
        final document = await output.inspectObject(outputRoot, outputRoot, '');
        final raw = jsonDecode(await output.readDataValue(document)) as Map;
        expect(raw['components']['schemas']['Resource'][r'$defs']['Shared']['content'], body['content']);
        expect(raw['components']['schemas']['Resource'][r'$defs']['Shared']['description'], '[Guide](guide.md)');
        await send(output, outputRoot);
        final cli = await Process.run('$testBundle/busyapi', ['check', moved.path, '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
      });
    }
  }
}
