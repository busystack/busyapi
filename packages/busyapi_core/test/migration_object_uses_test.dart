import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final format in ['yaml', 'json']) {
    test('$format native literal owners retain examples, actual HTTP and CLI behavior after publication', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-object-uses-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      const count = '9007199254740993.00', query = 'n=9007199254740993';
      final observedQueries = <String>[], observedBodies = <List<int>>[];
      server.listen((request) async {
        expect(request.method, 'POST');
        expect(request.uri.path, '/echo');
        observedQueries.add(request.uri.query);
        observedBodies.add(await request.fold<List<int>>([], (all, part) => all..addAll(part)));
        request.response.headers.set('content-type', 'application/json');
        request.response.headers.set('X-Count', count);
        request.response.add(utf8.encode(count));
        await request.response.close();
      });
      Map<String, Object?> ref(String name) => {r'$ref': '#/x-data/$name'};
      Map<String, Object?> schema() => {r'$ref': '#/components/schemas/Count'};
      Map<String, Object?> media() => {'schema': schema(), 'examples': {'Captured': ref('example')}};
      final data = {
        'example': {'description': '[Example](../guide.md)', 'externalValue': 'count.bin'},
        'queryExample': {'externalValue': 'query.bin'},
        'header': {'description': '[Header](../header.md)',
          'content': {'application/json': {'schema': schema()}}, 'examples': {'Captured': ref('example')}},
        'parameter': {'name': 'n', 'in': 'query', 'required': true, 'schema': schema(),
          'examples': {'Captured': ref('queryExample')}},
        'body': {r'$ref': '#/components/responses/Shared'},
        'response': {'description': '[Reply](../reply.md)', 'content': {'application/json': media()},
          'headers': {'X-Count': ref('header')}},
      };
      final value = <String, Object?>{
        'openapi': '3.1.2', 'info': {'title': 'Original', 'version': 'business'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/echo': {'post': {'parameters': [ref('parameter')], 'requestBody': ref('body'),
          'responses': {'200': ref('response')}}}},
        'components': {
          'schemas': {'Count': {'type': 'integer', 'enum': ['EXACT']}},
          'responses': {'Shared': {
            'description': '[Shared body](../shared.md)',
            'content': {'application/json': media()},
          }},
        },
        'x-data': data,
      };
      final original = (format == 'yaml'
          ? '# Preserve native/data source 雪\r\n${value.entries.map((entry) => '${jsonEncode(entry.key)}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n'
          : jsonEncode(value)).replaceAll('"EXACT"', count);
      final file = File('${directory.path}/api.$format'), countFile = File('${directory.path}/count.bin'),
          queryFile = File('${directory.path}/query.bin');
      await file.writeAsString(original);
      await countFile.writeAsString(count);
      await queryFile.writeAsString(query);
      final project = await BusyProject.open(file.path, engine);
      addTearDown(project.close);
      final root = file.uri.toString();
      project.store.replace(root, original.replaceFirst('Original', 'Captured 雪'));

      Future<void> send(BusyProject owner, String selectedRoot, {bool valid = true}) async {
        final plan = await owner.prepareRequest(selectedRoot, resource: selectedRoot, pointer: '/paths/~1echo/post');
        try {
          final parameter = (plan.result['parameters'] as List).single as Map;
          final parameterExample = (parameter['examples'] as List).single as Map;
          final body = plan.result['requestBody'] as Map;
          final bodyExample = (((body['content'] as List).single as Map)['examples'] as List).single as Map;
          expect(parameterExample['conversionError'], isNull);
          expect(parameterExample['raw'], query);
          expect(bodyExample['conversionError'], isNull);
          expect(bodyExample['raw'], count);
          final result = await const ContractRequestExecutor().execute(plan,
              OperationRequestDraft(planIdentity: plan.identity, parameters: {
                OperationRequestDraft.parameterKey('query', 'n'):
                    RequestValue.serialized(valid ? parameterExample['raw'] as String : 'n=0'),
              }, body: RequestBodyDraft.raw(mediaType: 'application/json', text: bodyExample['raw'] as String)),
              resolveSecret: (_) async => null);
          try {
            expect(result.outgoing.complete, true, reason: '${result.outgoing.findings}');
            expect(result.outgoing.valid, valid, reason: '${result.outgoing.findings}');
            expect(result.received.complete, true, reason: '${result.received.findings}');
            expect(result.received.valid, true, reason: '${result.received.findings}');
            expect(result.conforming, valid);
            expect(await result.response.bytes(), utf8.encode(count));
            expect(result.response.headers.where((field) => field.$1.toLowerCase() == 'x-count').single.$2, count);
            expect(observedBodies.last, utf8.encode(count));
            expect(observedQueries.last, valid ? query : 'n=0');
          } finally { await result.close(); }
        } finally { plan.close(); }
      }

      for (final kind in ['response', 'request-body']) {
        final page = await project.inspectObject(
          root, root, '/components/responses/Shared', contextKind: kind,
        );
        expect(page['kind'], kind);
        expect((page['interpretations'] as List).map((role) => role['kind']),
            containsAll(['response', 'request-body']));
        expect((page['fields'] as List).any((field) =>
            field['name'] == (kind == 'response' ? 'headers' : 'required')), true);
        final reference = await project.referencePage(
          root, root, '/components/responses/Shared', contextKind: kind,
        );
        expect(reference['kind'], kind);
      }
      await expectLater(
        project.inspectObject(root, root, '/components/responses/Shared',
            contextKind: 'parameter'),
        throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'inspect.context.stale')),
      );
      await send(project, root);
      final review = await project.prepareMigration(root, '${directory.path}/converted', targetVersion: '3.2.1');
      addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');
      expect(review.result['producerVersion'], '51');
      expect(review.unsaved, true);
      expect(review.exampleCopies.map((copy) => copy.bytes), containsAll([utf8.encode(count), utf8.encode(query)]));
      await review.publish();
      expect(await file.readAsString(), original);
      expect(await countFile.readAsString(), count);
      expect(await queryFile.readAsString(), query);
      final moved = await Directory(review.destination).rename('${directory.path}/moved 雪');
      project.close();
      await file.delete(); await countFile.delete(); await queryFile.delete();
      final output = await BusyProject.open(moved.path, engine);
      addTearDown(output.close);
      final outputRoot = output.roots.single.id;
      final checked = await output.check(outputRoot);
      expect(checked['complete'], true, reason: '$checked');
      final examples = checked['categories']['openapi']['schema']['serializedExamples'] as List;
      expect(examples.every((example) => example['complete'] == true && example['valid'] == true), true);
      final inspected = await output.inspectObject(outputRoot, outputRoot, '');
      final text = await output.readDataValue(inspected);
      final document = jsonDecode(text) as Map;
      expect(document['x-data'], data);
      expect(text, contains(count));
      expect(document['info']['title'], 'Captured 雪');
      await send(output, outputRoot);
      await send(output, outputRoot, valid: false);
      final cli = await Process.run('$testBundle/busyapi', ['check', moved.path, '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
      expect((jsonDecode(cli.stdout as String) as Map)['complete'], true);
      expect(observedBodies, hasLength(3));
    });
  }
}
