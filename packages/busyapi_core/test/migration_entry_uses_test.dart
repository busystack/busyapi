import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final owner in ['ordinary', 'identified', 'partial']) {
    final identified = owner == 'identified', modernSource = owner != 'ordinary';
    test('cross-entry $owner owners preserve behavior through captured review, HTTP, publication and CLI', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-entry-uses-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      var returned = 'null';
      final sent = <List<int>>[];
      server.listen((request) async {
        expect(request.method, 'POST');
        expect(request.uri.path, '/p');
        sent.add(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)));
        request.response.headers.set('content-type', 'application/json');
        request.response.headers.set('X-Name', 'Name');
        request.response.add(utf8.encode(returned));
        await request.response.close();
      });
      Map<String, Object?> entry(String version, String title) => {
        'openapi': version, 'info': {'title': title, 'version': 'business'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/p': {'post': {
          'requestBody': {'required': true, 'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Model'}}}},
          'responses': {'200': {'description': 'Response', 'headers': {'X-Name': {r'$ref': 'headers.yaml#/Header'}},
            'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Model'}}}}},
        }}},
        'components': {'schemas': {'Model': {r'$ref': 'models.yaml#/Forward'}}, 'examples': {
          // Capture the second complete description without coupling the two
          // entry-specific Schema Objects to one another's runtime consumers.
          'Entry': title == 'Legacy' ? {r'$ref': 'modern.yaml#/components/examples/Entry'} : {'value': 'Modern entry'},
        }},
      };
      final originals = {
        'legacy.yaml': '# Keep legacy 雪\r\n${jsonEncode(entry(modernSource ? '3.1.2' : '3.0.4', 'Legacy'))}\r\n',
        'modern.yaml': '# Keep modern 雪\r\n${jsonEncode(entry('3.2.1', 'Modern'))}\r\n',
        'models.yaml': 'Forward: {\$ref: "#/Node"}\r\nNode: {${identified ? r'$id: "https://schemas.invalid/shared", ' : ''}${modernSource ? r'$dynamicAnchor: node, ' : ''}type: string, minLength: 1, nullable: true, description: "[Guide](guide.md)"}\r\n',
        'headers.yaml': 'Header: {description: "[Header](header.md)", schema: {${owner == 'partial' ? r'$dynamicAnchor: header, ' : ''}type: string, minLength: 1}}\r\n',
      };
      for (final entry in originals.entries) {
        await File('${directory.path}/${entry.key}').writeAsString(entry.value);
      }
      final source = await BusyProject.open('${directory.path}/legacy.yaml', engine);
      addTearDown(source.close);
      final legacy = File('${directory.path}/legacy.yaml').uri.toString();
      final modern = File('${directory.path}/modern.yaml').uri.toString();
      final buffer = await source.buffer(legacy);
      source.store.replace(legacy, buffer.text.replaceFirst('Legacy', 'Captured 雪'));

      Future<void> exercise(BusyProject project, String root, bool nullable) async {
        final plan = await project.prepareRequest(root, resource: root, pointer: '/paths/~1p/post');
        try {
          final schema = ((((plan.result['responses'] as List).single as Map)['content'] as List).single as Map)['schema'] as Map;
          final checked = await plan.evaluateRuntime([
            for (final text in ['null', '"雪"', '""']) RuntimeSchemaInstance(
              subject: 'response-body', location: text, text: text,
              schemaResource: schema['resource'] as String, schemaPointer: schema['pointer'] as String,
            ),
          ]);
          expect(checked['complete'], true, reason: '$checked');
          expect((checked['runtimeEvaluations'] as List).map((value) => value['valid']), [nullable, true, false]);
          returned = nullable ? 'null' : '"雪"';
          final response = await const ContractRequestExecutor().execute(plan,
              OperationRequestDraft(planIdentity: plan.identity, body: RequestBodyDraft.raw(mediaType: 'application/json', text: '"雪"')),
              resolveSecret: (_) async => null);
          try {
            expect(response.conforming, true, reason: '${response.outgoing.findings} ${response.received.findings}');
            expect(await response.response.bytes(), utf8.encode(returned));
            expect(sent.last, utf8.encode('"雪"'));
          } finally { await response.close(); }
        } finally { plan.close(); }
      }
      await exercise(source, legacy, !modernSource); await exercise(source, modern, false);
      final stale = await source.prepareMigration(legacy, '${directory.path}/stale', targetVersion: '3.2.1');
      addTearDown(stale.close);
      expect(stale.publishable, true, reason: '${stale.result}');
      source.store.replace(legacy, source.store.buffers[legacy]!.text.replaceFirst('Captured 雪', 'Latest 雪'));
      await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
      expect(Directory(stale.destination).existsSync(), false);
      final review = await source.prepareMigration(legacy, '${directory.path}/converted', targetVersion: '3.2.1');
      addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}'); expect(review.unsaved, true);
      await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
      expect(Directory(review.destination).existsSync(), false);
      await review.publish();
      for (final entry in originals.entries) {
        expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
      }
      final migrated = {
        for (final id in [legacy, modern]) id: review.changes.singleWhere((change) => change.resource == id).destination,
      };
      final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');
      source.close();
      for (final name in originals.keys) { await File('${directory.path}/$name').delete(); }
      final cold = await BusyProject.open(relocated.path, engine); addTearDown(cold.close);
      expect(cold.roots, hasLength(2));
      for (final (id, nullable) in [(legacy, !modernSource), (modern, false)]) {
        final path = Uri.parse(migrated[id]!).pathSegments.last;
        final root = File('${relocated.path}/$path').uri.toString();
        expect((await cold.check(root))['status'], 'complete');
        await exercise(cold, root, nullable);
      }
      final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
    });
  }
}
