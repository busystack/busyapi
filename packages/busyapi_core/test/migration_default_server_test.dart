import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  r3aServerRelocation();
  for (final format in ['yaml', 'json']) {
    for (final mode in ['absent', 'empty', 'finite']) {
      final empty = mode == 'empty', finite = mode == 'finite';
      test(
        '3.0 $format Server mode=$mode retains its actual origin after migration',
        () async {
          final temp = await Directory.systemTemp.createTemp(
            'busyapi-default-origin-',
          );
          addTearDown(() => temp.delete(recursive: true));
          final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          addTearDown(() => server.close(force: true));
          final received = <String>[];
          server.listen((request) async {
            expect(request.method, 'GET');
            expect(
              request.headers.value(HttpHeaders.hostHeader),
              '127.0.0.1:${server.port}',
            );
            expect(
              await request.fold<List<int>>([], (a, b) => a..addAll(b)),
              isEmpty,
            );
            received.add(request.uri.toString());
            request.response.statusCode = 204;
            await request.response.close();
          });
          final source = format == 'json'
              ? '${const JsonEncoder.withIndent('  ').convert({
                  'openapi': '3.0.4',
                  'info': {'title': 'Saved default 雪', 'version': 'API-1'},
                  if (empty) 'servers': [],
                  if (finite) 'servers': [
                    {'url': 'http://127.0.0.1:${server.port}/{suffix}/..',
                     'variables': {'suffix': {'default': 'one', 'enum': ['one', 'two']}}},
                  ],
                  'paths': {
                    '/items': {
                      'get': {
                        'responses': {
                          '204': {'description': 'No body'},
                        },
                      },
                    },
                  },
                  'x-exact': 'EXACT',
                }).replaceFirst('"EXACT"', '9007199254740993.00')}\r\n'
              : '# Keep implicit Server\r\nopenapi: "3.0.4"\r\n'
                    'info: {title: "Saved default 雪", version: "API-1"}\r\n'
                    '${empty ? 'servers: [] # Keep empty choice\r\n' : ''}'
                    '${finite ? 'servers: [{url: "http://127.0.0.1:${server.port}/{suffix}/..", variables: {suffix: {default: one, enum: [one, two]}}}]\r\n' : ''}'
                    'paths: {/items: {get: {responses: {"204": {description: "No body"}}}}}\r\n'
                    'x-exact: 9007199254740993.00\r\n';
          final original = [0xef, 0xbb, 0xbf, ...utf8.encode(source)];
          final file = File('${temp.path}/api.$format')
            ..writeAsBytesSync(original);
          final manifest = File('${temp.path}/busyapi.yaml')
            ..writeAsStringSync(
              jsonEncode({
                'version': 1,
                'roots': [
                  {'name': 'api', 'path': 'api.$format'},
                ],
                'resourceMappings': {
                  'http://127.0.0.1:${server.port}/source/api.$format':
                      'api.$format',
                },
                'tests': [
                  {
                    'name': 'default',
                    'operation': {'method': 'get', 'path': '/items'},
                    'expect': {'status': 204},
                  },
                ],
              }),
            );
          final manifestBytes = manifest.readAsBytesSync();
          final engine = EngineProcess(
            executable: runtimeNode,
            helper: runtimeHelper,
          );
          addTearDown(engine.close);
          final project = await BusyProject.open(temp.path, engine);
          addTearDown(project.close);
          final root = project.roots.single.id,
              buffer = await project.buffer(project.roots.single.id);
          await project.save(buffer);
          expect(file.readAsBytesSync(), original);
          final working = buffer.text.replaceFirst(
            'Saved default',
            'Unsaved default',
          );
          project.store.replace(root, working);
          Future<void> send(BusyProject owner) async {
            final id = owner.roots.single.id;
            final plan = await owner.prepareRequest(
              id,
              resource: id,
              pointer: '/paths/~1items/get',
            );
            try {
              final result = await const ContractRequestExecutor().execute(
                plan,
                OperationRequestDraft(planIdentity: plan.identity),
                resolveSecret: (_) async => null,
              );
              try {
                expect(result.conforming, true);
                expect(result.response.status, 204);
              } finally {
                await result.close();
              }
            } finally {
              plan.close();
            }
          }

          await send(project);
          final cli = await Process.run(
            '$testBundle/busyapi',
            ['test', temp.path, '--case', 'default', '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'},
            includeParentEnvironment: false,
          );
          expect(cli.exitCode, 0, reason: '${cli.stdout}\n${cli.stderr}');
          expect((jsonDecode(cli.stdout as String) as Map)['complete'], true);
          for (final target in ['2.0', '3.0.4', '3.1.2', '3.2.1']) {
            final review = await project.prepareMigration(
              root,
              '${temp.path}/migrated-$target',
              targetVersion: target,
            );
            addTearDown(review.close);
            expect(
              review.status,
              MigrationStatus.faithfullyConvertible,
              reason: '${review.result}',
            );
            expect(review.unsaved, true);
            expect(review.result['producerVersion'], '107');
            await review.publish();
            final copy = await BusyProject.open(review.destination, engine);
            addTearDown(copy.close);
            final text = (await copy.buffer(copy.roots.single.id)).text;
            expect(text, contains('Unsaved default'));
            expect(text, contains('9007199254740993.00'));
            if (format == 'yaml')
              expect(text, contains('# Keep implicit Server'));
            expect(
              (await copy.check(copy.roots.single.id))['status'],
              'complete',
            );
            await send(copy);
          }
          expect(received, List.filled(6, '/items'));
          expect(file.readAsBytesSync(), original);
          expect(manifest.readAsBytesSync(), manifestBytes);
          expect(buffer.text, working);
        },
      );
    }
  }
}

void r3aServerRelocation() {
  for (final format in ['yaml', 'json']) {
    for (final version in ['3.0.4', '3.1.2', '3.2.1']) {
      test('R3a $version $format reviewed routes and saved Servers execute after cold directory relocation', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-r3a-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        final seen = <(String, String, String)>[];
        server.listen((request) async {
          expect(request.headers.value('authorization'), 'Basic ${base64Encode(utf8.encode('manual:controlled'))}');
          final body = utf8.decode(await request.fold<List<int>>([], (all, bytes) => all..addAll(bytes)));
          seen.add((request.method, request.uri.toString(), body));
          request.response.statusCode = 204;
          await request.response.close();
        });
        List<Map<String, Object?>> servers(String path) => [
          {'url': '{transport}://127.0.0.1:${server.port}$path',
            'variables': {'transport': {'default': 'http', 'enum': ['http', 'https']}}},
          {'url': 'http://127.0.0.1:${server.port}$path'},
        ];
        final value = {'openapi': version, 'info': {'title': 'Saved R3a', 'version': '1'},
          'servers': [{'url': 'http://127.0.0.1:${server.port}/base'}],
          'security': [{'Access': <String>[]}],
          'components': {'securitySchemes': {'Access': {'type': 'http', 'scheme': 'basic'}}},
          'paths': {'/shared': {'servers': servers('/read%2Fv'),
            'get': {'operationId': 'read', 'responses': {'204': {'description': 'Empty'}}},
            'post': {'operationId': 'write', 'servers': servers('/write'),
              'requestBody': {'required': true, 'content': {'application/json': {'schema': {'type': 'boolean'}}}},
              'responses': {'204': {'description': 'Empty'}}}},
            '/root': {'get': {'responses': {'204': {'description': 'Empty'}}}}}, 'x-exact': 'EXACT'};
        final original = (format == 'yaml'
            ? '# Preserve R3a source\r\n${value.entries.map((entry) => '${jsonEncode(entry.key)}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n'
            : jsonEncode(value)).replaceAll('"EXACT"', '9007199254740993.00');
        final file = File('${directory.path}/api.$format')..writeAsStringSync(original);
        const secret = '11111111-1111-4111-8111-111111111111';
        final settings = {'authentication': {'schemes': {'Access': {'username': 'manual', 'passwordRef': secret}}},
          'tls': {'x-kept': 'EXACT'}, 'x-unrelated': 'EXACT'};
        final configuration = File('${directory.path}/busyapi.yaml');
        final capturedConfiguration = jsonEncode({'version': 1, 'roots': [{'name': 'api', 'path': 'api.$format'}],
          'environments': {'manual': settings, 'secure': {...settings, 'variables': {'transport': 'https'}}},
          'tests': [
            {'name': 'saved', 'operation': {'occurrence': '${file.uri}#/paths/~1shared/post', 'method': 'get', 'path': '/ignored', 'x-exact': 'EXACT'}, 'environment': 'manual', 'server': 1,
              'body': {'mediaType': 'application/json', 'value': false}, 'expect': {'status': 204}},
            {'name': 'invalid', 'operation': {'method': 'get', 'path': '/shared'}, 'server': 99, 'expect': {'status': 204}},
          ], 'x-top': 'EXACT'}).replaceAll('"EXACT"', '9007199254740993.00');
        await configuration.writeAsString(capturedConfiguration);
        final project = await BusyProject.open(directory.path, engine);
        addTearDown(project.close);
        final root = project.roots.single.id, buffer = await project.buffer(project.roots.single.id);
        project.store.replace(root, buffer.text.replaceFirst('Saved R3a', 'Unsaved R3a'));
        Future<String?> resolve(String reference) async { expect(reference, secret); return 'controlled'; }
        Future<void> runSaved(BusyProject owner, {bool saved = true}) async {
          final report = await const ContractTestRunner().run(owner, owner.roots.single.id,
              selectedCases: ['saved'], resolveSecret: resolve, saved: saved);
          expect(report.passed, true, reason: '${report.toJson()}');
          expect(seen.last, ('POST', '/write/shared', 'false'));
        }
        Future<void> read(BusyProject owner) async {
          final checked = await owner.check(owner.roots.single.id);
          final operation = (checked['projection']['operations'] as List).cast<Map>().singleWhere((operation) => operation['operationId'] == 'read');
          final plan = await owner.prepareRequest(owner.roots.single.id, resource: operation['resource'] as String, pointer: operation['pointer'] as String, occurrence: operation['occurrence'] as String?);
          try {
            final result = await const ContractRequestExecutor().execute(plan,
                OperationRequestDraft(planIdentity: plan.identity, environment: 'manual'), resolveSecret: resolve);
            try { expect(result.conforming, true);expect(seen.last, ('GET', '/read%2Fv/shared', '')); }
            finally { await result.close(); }
          } finally { plan.close(); }
        }
        await runSaved(project, saved: false);
        await read(project);
        final review = await project.prepareMigration(root, '${directory.path}/delivered', targetVersion: '2.0');
        addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');expect(review.unsaved, true);
        expect(review.configurationProjections, isNotEmpty);
        expect(review.result['manifestText'], contains('9007199254740993.00'));
        final repeat = await project.prepareMigration(root, review.destination, targetVersion: '2.0');
        addTearDown(repeat.close);expect(repeat.identity, review.identity);
        if (format == 'json' && version == '3.2.1') {
          for (final mode in ['cancel', 'race', 'failure']) {
            final rejected = await project.prepareMigration(root, '${directory.path}/$mode', targetVersion: '2.0');
            addTearDown(rejected.close);var cancelled = false;
            await expectLater(rejected.publish(cancelled: () => cancelled, beforePublish: () async {
              if (mode == 'cancel') cancelled = true;
              if (mode == 'race') { await Directory(rejected.destination).create();await File('${rejected.destination}/foreign').writeAsString('Keep'); }
              if (mode == 'failure') throw const FileSystemException('Controlled R3a publication failure');
            }), throwsA(anything));
            if (mode == 'race') expect(await File('${rejected.destination}/foreign').readAsString(), 'Keep');
            else expect(await Directory(rejected.destination).exists(), false);
          }
        }
        await review.publish();expect(await file.readAsString(), original);
        expect(await configuration.readAsString(), capturedConfiguration);
        if (format == 'json' && version == '3.2.1') {
          final stale = await project.prepareMigration(root, '${directory.path}/stale', targetVersion: '2.0');
          addTearDown(stale.close);
          final configBuffer = await project.buffer(configuration.uri.toString());
          project.store.replace(configBuffer.id, configBuffer.text.replaceFirst('9007199254740993.00', '9007199254740994.00'));
          await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'migration.stale')));
          expect(await Directory(stale.destination).exists(), false);
          expect(await configuration.readAsString(), capturedConfiguration);
        }
        project.close();await file.delete();await configuration.delete();
        final moved = await Directory(review.destination).rename('${directory.path}/cold 雪');
        final cold = await BusyProject.open(moved.path, engine);addTearDown(cold.close);
        await runSaved(cold);
        await read(cold);
        final checked = await cold.check(cold.roots.single.id);
        final operation = (checked['projection']['operations'] as List).cast<Map>().singleWhere((operation) => operation['operationId'] == 'read');
        final plan = await cold.prepareRequest(cold.roots.single.id,
            resource: operation['resource'] as String, pointer: operation['pointer'] as String, occurrence: operation['occurrence'] as String?);
        addTearDown(plan.close);
        final prepared = await const ContractRequestBuilder().build(plan,
            OperationRequestDraft(planIdentity: plan.identity, environment: 'secure'), resolveSecret: resolve);
        try { expect(prepared.uri.scheme, 'https');expect(prepared.uri.toString(), 'https://127.0.0.1:${server.port}/read%2Fv/shared'); }
        finally { await prepared.body?.close(); }
        final invalid = await const ContractTestRunner().run(cold, cold.roots.single.id,
            selectedCases: ['invalid'], resolveSecret: resolve);
        expect(invalid.passed, false);expect(invalid.cases.single.dispatched, false);
        final cli = await Process.run('$testBundle/busyapi', ['test', moved.path, '--case', 'saved', '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        // CLI has no access to this test's credential resolver. It must reject
        // before dispatch instead of selecting anonymous authentication.
        expect(cli.exitCode, isNot(0));expect(seen, hasLength(4));
      });
    }
  }
}
