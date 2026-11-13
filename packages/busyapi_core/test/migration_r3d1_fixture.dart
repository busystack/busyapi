import 'dart:convert';
import 'dart:io';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';
import 'test_support.dart';
import 'migration_r3d1b_fixture.dart';

// Registered through the existing form, binary and Swagger migration gates.
void positionalMigrationRegressions(String group) {
  namedMultipartMigrationRegressions(group);
  for (final version in ['3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('R3d1 $group $version $format preserves native wire and refuses older unnamed binding', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-r3d1-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
        final seen = <List<int>>[];
        server.listen((request) async {
          expect(request.method, 'POST');expect(request.uri.path, '/parts');
          expect(request.headers.contentType!.mimeType, 'multipart/mixed');
          seen.add(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)));
          request.response.statusCode = 204;await request.response.close();
        });
        final binary = group == 'binary';
        final value = {
          'openapi': version, 'info': {'title': 'Original positional', 'version': '1'},
          'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
          'paths': {'/parts': {'post': {
            'requestBody': {'required': true, 'content': {'multipart/mixed': {
              'schema': {'type': 'array', 'maxItems': 3, 'items': {
                'type': 'string', if (binary) 'contentEncoding': 'base64',
              }},
              'prefixEncoding': [{'contentType': binary ? 'application/octet-stream' : 'text/plain'}],
              'itemEncoding': {'contentType': binary ? 'application/octet-stream' : 'text/plain'},
            }}}, 'responses': {'204': {'description': 'Empty'}},
          }}},
        };
        final text = format == 'json' ? jsonEncode(value) : '# Retain positional source\r\n${value.entries.map((e) => '${jsonEncode(e.key)}: ${jsonEncode(e.value)}').join('\r\n')}\r\n';
        final file = File('${directory.path}/api.$format'); await file.writeAsString(text);
        final original = await file.readAsBytes();
        final project = await BusyProject.open(file.path, engine); addTearDown(project.close);
        final root = project.roots.single.id, buffer = await project.buffer(project.roots.single.id);
        project.store.replace(root, buffer.text.replaceFirst('Original positional', 'Unsaved positional'));
        final plan = await project.prepareRequest(root, resource: root, pointer: '/paths/~1parts/post');addTearDown(plan.close);
        for (final valid in [true, false]) {
          final values = List.filled(valid ? 2 : 4, binary ? 'AP+A' : '雪');
          final response = await const ContractRequestExecutor().execute(plan,
            OperationRequestDraft(planIdentity: plan.identity, body: RequestBodyDraft.multipartValue(mediaType: 'multipart/mixed', json: jsonEncode(values))),
            resolveSecret: (_) async => null);
          try {
            expect(response.outgoing.complete, true, reason: '${response.outgoing.findings}');expect(response.outgoing.valid, valid);
            expect(response.received.complete, true);expect(response.received.valid, true);expect(response.conforming, valid);
            final emitted = await response.request.body!.open().fold<List<int>>([], (all, chunk) => all..addAll(chunk));
            expect(seen.last, orderedEquals(emitted));
          } finally { await response.close(); }
        }
        expect(seen, hasLength(2));
        final target = group == 'swagger' ? '2.0' : '3.1.2';
        final review = await project.prepareMigration(root, '${directory.path}/output', targetVersion: target);addTearDown(review.close);
        expect(review.unsaved, true);expect(review.publishable, false);expect(review.result['outputs'], isEmpty);
        final problems = (review.result['problems'] as List).whereType<Map>();
        expect(problems.any((problem) => problem['reason'] == 'target-representation'), true, reason: '${review.result}');
        if (target != '2.0') for (final field in ['prefixEncoding', 'itemEncoding']) {
          expect(problems.any((problem) => problem['pointer'].toString().endsWith('/$field') && problem['reason'] == 'target-representation'), true);
        }
        expect(await Directory(review.destination).exists(), false);expect(await file.readAsBytes(), original);
        expect(buffer.text, contains('Unsaved positional'));
        final cli = await Process.run('$testBundle/busyapi', ['migrate', file.path, '--target', target, '--output', '${directory.path}/cli', '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 2, reason: '${cli.stdout} ${cli.stderr}');
        final report = jsonDecode(cli.stdout as String) as Map;expect(report['complete'], false);expect(report['published'], false);expect(report['outputs'], isEmpty);
        expect(await Directory('${directory.path}/cli').exists(), false);expect(await file.readAsBytes(), original);

      });
    }
  }
}
