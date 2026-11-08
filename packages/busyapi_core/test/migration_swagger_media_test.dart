import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

const _targets = [
  '3.0.0',
  '3.0.1',
  '3.0.2',
  '3.0.3',
  '3.0.4',
  '3.1.0',
  '3.1.1',
  '3.1.2',
  '3.2.0',
  '3.2.1',
];

void main() {
  _b05R2Metadata();
  _b05OperationContexts();
  _r2FileResponses();
  _r3EquivalentMedia();
  for (final target in _targets) {
    for (final format in ['yaml', 'json']) {
      test(
        'Swagger $format to $target preserves shared media on the wire and through installed CLI publication',
        () async {
          final temp = await Directory.systemTemp.createTemp(
            'busyapi-migration-media-',
          );
          final engine = EngineProcess(
            executable: runtimeNode,
            helper: runtimeHelper,
          );
          addTearDown(() async {
            await engine.close();
            await temp.delete(recursive: true);
          });
          final seen = <List<String>>[];
          final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          addTearDown(() => server.close(force: true));
          server.listen((request) async {
            final bytes = await request.fold<List<int>>(
              [],
              (all, part) => all..addAll(part),
            );
            final media = request.headers.value(HttpHeaders.contentTypeHeader)!;
            seen.add([
              request.method,
              request.uri.toString(),
              media,
              base64Encode(bytes),
            ]);
            request.response.headers.set(HttpHeaders.contentTypeHeader, media);
            request.response.headers.set('X-Values', '0,9007199254740993');
            request.response.add(bytes);
            await request.response.close();
          });
          final reference = {r'$ref': 'body-chain.$format'};
          final response = {r'$ref': 'response-chain.$format'};
          final declarations = <String, Map<String, Object?>>{
            'api.$format': {
              'swagger': '2.0',
              'info': {'title': 'Original', 'version': '1'},
              'host': '127.0.0.1:${server.port}',
              'basePath': '/v1',
              'schemes': ['http'],
              'consumes': ['application/json'],
              'produces': ['application/json'],
              'paths': {
                '/json': {
                  'parameters': [reference],
                  'post': {
                    'responses': {'200': response},
                  },
                },
                '/vendor': {
                  'post': {
                    'consumes': ['application/vnd.busy+json'],
                    'produces': ['application/vnd.busy+json'],
                    'parameters': [reference],
                    'responses': {'200': response},
                  },
                },
              },
              'x-exact': [9007199254740993, false, null, 0, '雪'],
            },
            'body-chain.$format': {
              r'$ref': 'body.$format#/body%20~1~0%3F%23%E9%9B%AA',
            },
            'body.$format': {
              'body /~?#雪': {
                'in': 'body',
                'name': 'payload',
                'required': true,
                'description': 'Original body',
                'schema': {
                  'type': 'integer',
                  'enum': [9007199254740993, 0],
                },
                'x-data': {r'$ref': 'literal', 'empty': ''},
              },
            },
            'response-chain.$format': {r'$ref': 'response.$format'},
            'response.$format': {
              'description': 'Shared response',
              'schema': {'type': 'integer'},
              'headers': {
                'X-Values': {
                  'type': 'array',
                  'items': {'type': 'integer'},
                  'collectionFormat': 'csv',
                },
              },
              'examples': {'application/json': 9007199254740993},
            },
          };
          final originals = <String, List<int>>{};
          for (final entry in declarations.entries) {
            // JSON is also a YAML flow representation. The .yaml fixture adds
            // authored comments, BOM and CRLF without normalizing any live file.
            final text =
                (format == 'yaml' ? '# Keep ${entry.key}\r\n' : '') +
                const JsonEncoder.withIndent('  ')
                    .convert(entry.value)
                    .replaceAll('\n', '\r\n') +
                '\r\n';
            final bytes = [239, 187, 191, ...utf8.encode(text)];
            await File('${temp.path}/${entry.key}').writeAsBytes(bytes);
            originals[entry.key] = bytes;
          }
          final file = File('${temp.path}/api.$format');
          final project = await BusyProject.open(file.path, engine);
          addTearDown(project.close);
          final root = file.uri.toString(), buffer = await project.buffer(root);
          project.store.replace(
            root,
            buffer.text.replaceFirst('Original', 'Unsaved'),
          );
          final body = await project.buffer(
            File('${temp.path}/body.$format').uri.toString(),
          );
          project.store.replace(
            body.id,
            body.text.replaceFirst('Original body', 'Unsaved body'),
          );

          Future<void> send(BusyProject owner) async {
            final root = owner.roots.single.id, check = await owner.check(root);
            expect(check['complete'], isTrue, reason: '$check');
            final operations = (check['projection']['operations'] as List)
                .cast<Map>();
            expect(operations, hasLength(2));
            for (final operation in operations) {
              final plan = await owner.prepareRequest(
                root,
                resource: operation['resource'] as String,
                pointer: operation['pointer'] as String,
                occurrence: operation['occurrence'] as String,
              );
              addTearDown(plan.close);
              final media = operation['path'] == '/json'
                  ? 'application/json'
                  : 'application/vnd.busy+json';
              if (plan.result case {'requestBody': {'content': List content}}) {
                expect(
                  content.map(
                    (item) => switch (item) {
                      {'mediaType': String type} => type,
                      _ => throw StateError('Missing captured request media'),
                    },
                  ),
                  [media],
                );
              } else {
                fail('Missing captured request body');
              }
              final result = await const ContractRequestExecutor().execute(
                plan,
                OperationRequestDraft(
                  planIdentity: plan.identity,
                  body: RequestBodyDraft.raw(
                    mediaType: media,
                    text: '9007199254740993',
                  ),
                ),
                resolveSecret: (_) async => null,
              );
              try {
                expect(
                  result.outgoing.complete,
                  isTrue,
                  reason: '${result.outgoing.findings}',
                );
                expect(
                  result.outgoing.valid,
                  isTrue,
                  reason: '${result.outgoing.findings}',
                );
                expect(
                  result.received.complete,
                  isTrue,
                  reason: '${result.received.findings}',
                );
                expect(
                  result.received.valid,
                  isTrue,
                  reason: '${result.received.findings}',
                );
              } finally {
                await result.close();
              }
            }
          }

          await send(project);
          final review = await project.prepareMigration(
            root,
            '${temp.path}/migrated',
            targetVersion: target,
          );
          addTearDown(review.close);
          expect(
            review.status,
            MigrationStatus.faithfullyConvertible,
            reason: '${review.result}',
          );
          expect(review.result['producerVersion'], '98');
          expect(review.unsaved, isTrue);
          expect(review.changes, hasLength(5));
          expect(await Directory(review.destination).exists(), isFalse);
          await expectLater(
            review.publish(cancelled: () => true),
            throwsA(
              isA<CoreFailure>().having(
                (error) => error.code,
                'code',
                'cancelled',
              ),
            ),
          );
          expect(await Directory(review.destination).exists(), isFalse);
          await review.publish();
          expect(buffer.dirty, isTrue);
          expect(body.dirty, isTrue);

          final cliDestination = '${temp.path}/cli-copy';
          Future<ProcessResult> command(List<String> arguments) => Process.run(
            '$testBundle/busyapi',
            [
              'migrate',
              file.path,
              '--target',
              target,
              '--output',
              cliDestination,
              '--json',
              ...arguments,
            ],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'},
            includeParentEnvironment: false,
          );
          final cliReview = await command([]);
          expect(
            cliReview.exitCode,
            0,
            reason: '${cliReview.stdout}\n${cliReview.stderr}',
          );
          final report = jsonDecode(cliReview.stdout as String) as Map;
          expect(report['status'], 'faithfully-convertible');
          expect(report['published'], false);
          expect(report['producerVersion'], '98');
          expect(await Directory(cliDestination).exists(), isFalse);
          final applied = await command([
            '--apply',
            report['reviewIdentity'] as String,
          ]);
          expect(
            applied.exitCode,
            0,
            reason: '${applied.stdout}\n${applied.stderr}',
          );
          expect(
            (jsonDecode(applied.stdout as String) as Map)['published'],
            true,
          );
          for (final entry in originals.entries) {
            final original = File('${temp.path}/${entry.key}');
            expect(await original.readAsBytes(), entry.value);
            await original.rename('${temp.path}/original-${entry.key}');
          }
          final copy = await BusyProject.open(review.destination, engine);
          addTearDown(copy.close);
          expect(
            (await copy.check(
              copy.roots.single.id,
            ))['projection']['specification']['declaredVersion'],
            target,
          );
          expect(
            (await copy.buffer(copy.roots.single.id)).text,
            contains('Unsaved'),
          );
          await send(copy);
          final cliCopy = await BusyProject.open(cliDestination, engine);
          addTearDown(cliCopy.close);
          expect(
            (await cliCopy.buffer(cliCopy.roots.single.id)).text,
            contains('Original'),
          );
          await send(cliCopy);
          final standalone = await Directory('${temp.path}/standalone')
              .create();
          for (final output in (review.result['outputs'] as List).cast<Map>()) {
            final path = output['path'] as String;
            final target = File('${standalone.path}/$path');
            await target.parent.create(recursive: true);
            await File('${review.destination}/$path').copy(target.path);
          }
          expect(
            await File('${standalone.path}/busyapi.yaml').exists(),
            isFalse,
          );
          final standalonePath = '${standalone.path}/${review.result['entry']}';
          final independent = await BusyProject.open(standalonePath, engine);
          addTearDown(independent.close);
          expect(
            (await independent.buffer(independent.roots.single.id)).text,
            contains('Unsaved'),
          );
          await send(independent);
          final standaloneCheck = await Process.run(
            '$testBundle/busyapi',
            ['check', standalonePath, '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'},
            includeParentEnvironment: false,
          );
          expect(
            standaloneCheck.exitCode,
            0,
            reason: '${standaloneCheck.stdout}\n${standaloneCheck.stderr}',
          );
          expect(seen, hasLength(8));
          expect(seen.sublist(0, 2), seen.sublist(2, 4));
          expect(seen.sublist(0, 2), seen.sublist(4, 6));
          expect(seen.sublist(0, 2), seen.sublist(6, 8));
          expect(seen.map((request) => request[0]), everyElement('POST'));
          expect(seen.map((request) => request[1]), [
            '/v1/json',
            '/v1/vendor',
            '/v1/json',
            '/v1/vendor',
            '/v1/json',
            '/v1/vendor',
            '/v1/json',
            '/v1/vendor',
          ]);
          expect(
            seen.map((request) => utf8.decode(base64Decode(request[3]))),
            everyElement('9007199254740993'),
          );
        },
      );
    }
  }
}

void _b05R2Metadata() {
  for (final version in _targets) for (final format in ['yaml', 'json']) {
    test('B05-R2 $version $format reusable metadata, examples and CLI preserve HTTP behavior', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-b05-r2-');
      addTearDown(() => directory.delete(recursive: true));
      final observed = <(String, String, String, List<int>)>[];
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      server.listen((request) async {
        final bytes = await request.fold<List<int>>([], (all, next) => all..addAll(next));
        observed.add((request.method, request.uri.toString(), request.headers.value('content-type') ?? '', bytes));
        request.response.headers.contentType = ContentType.json;
        request.response.headers.set('X-Count', '9007199254740993.00');
        request.response.add(bytes);await request.response.close();
      });
      final file = File('${directory.path}/api.$format');
      Map<String, Object> reference(String kind, String name) => {r'$ref': '#/components/$kind/$name'};
      final schema = {'type': 'integer', 'enum': ['EXACT', 0]};
      final media = {'schema': schema, 'examples': {'First': reference('examples', 'Payload'), 'Same': reference('examples', 'Payload')}};
      final value = {
        'openapi': version, 'info': {'title': 'Saved R2', 'version': '1'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/echo': {'post': {
          'parameters': [reference('parameters', 'Shared')], 'requestBody': reference('requestBodies', 'Shared'),
          'responses': {'200': reference('responses', 'Alias'), '204': {'description': 'No content'}},
        }}},
        'components': {
          'parameters': {'Shared': {'name': 'n', 'in': 'query', 'required': true, 'deprecated': false, 'allowReserved': false, 'schema': schema}},
          'requestBodies': {'Shared': {'description': '[Request](./request.md)', 'required': true, 'content': {'application/json': media}}},
          'responses': {'Alias': reference('responses', 'Reply'), 'Reply': {'description': 'Reply', 'headers': {'X-Count': reference('headers', 'Count')}, 'content': {'application/json': media}}},
          'headers': {'Count': {'required': false, 'deprecated': false, 'schema': schema}},
          'examples': {'Payload': {'summary': 'Keep name', 'value': 'EXACT'}},
          'schemas': {'Independent': {r'$ref': '#/components/requestBodies/Shared/content/application~1json/schema'}},
        },
      };
      final original = (format == 'yaml' ? '# Keep R2 source 雪\r\n' : '') + jsonEncode(value).replaceAll('"EXACT"', '9007199254740993.00');
      await file.writeAsString(original);
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
      final root = file.uri.toString(), buffer = await project.buffer(file.uri.toString());
      project.store.replace(root, buffer.text.replaceFirst('Saved R2', 'Unsaved R2'));
      final review = await project.prepareMigration(root, '${directory.path}/target', targetVersion: '2.0');addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');expect(review.unsaved, true);expect(review.result['producerVersion'], '98');
      final repeat = await project.prepareMigration(root, review.destination, targetVersion: '2.0');addTearDown(repeat.close);
      expect(repeat.identity, review.identity);
      for (final failure in ['cancel', 'race', 'failure']) {
        final rejected = await project.prepareMigration(root, '${directory.path}/$failure', targetVersion: '2.0');addTearDown(rejected.close);
        var cancelled = false;
        await expectLater(rejected.publish(cancelled: () => cancelled, beforePublish: () async {
          if (failure == 'cancel') cancelled = true;
          if (failure == 'race') {await Directory(rejected.destination).create();await File('${rejected.destination}/foreign').writeAsString('Keep');}
          if (failure == 'failure') throw const FileSystemException('Controlled R2 publication failure');
        }), throwsA(anything));
        if (failure == 'race') expect(await File('${rejected.destination}/foreign').readAsString(), 'Keep');
        else expect(await Directory(rejected.destination).exists(), false);
      }
      await review.publish();
      final target = await BusyProject.open(review.destination, engine);addTearDown(target.close);
      Future<void> exercise(BusyProject owner) async {
        final entry = owner.roots.single.id, checked = await owner.check(owner.roots.single.id);
        expect(checked['complete'], true, reason: '$checked');
        final plan = await owner.prepareRequest(entry, resource: entry, pointer: '/paths/~1echo/post');addTearDown(plan.close);
        final body = plan.result['requestBody'] as Map, content = (body['content'] as List).single as Map;
        expect(body['required'], true);expect(content['mediaType'], 'application/json');
        expect((content['examples'] as List).cast<Map>().every((example) => example['raw'] == '9007199254740993.00'), true);
        final responses = (plan.result['responses'] as List).cast<Map>();
        expect((responses.singleWhere((response) => response['status'] == '204')['content'] as List), isEmpty);
        for (final sample in ['9007199254740993.00', '0', '-1']) {
          final result = await const ContractRequestExecutor().execute(plan,
            OperationRequestDraft(planIdentity: plan.identity,
              parameters: {OperationRequestDraft.parameterKey('query', 'n'): const RequestValue.json('0')},
              body: RequestBodyDraft.raw(mediaType: 'application/json', text: sample)), resolveSecret: (_) async => null);
          addTearDown(result.close);expect(result.outgoing.complete, true);expect(result.received.complete, true);
          expect(result.outgoing.valid, sample != '-1');expect(result.received.valid, sample != '-1');
          expect(observed.last, ('POST', '/echo?n=0', 'application/json', utf8.encode(sample)));
          expect(await result.response.decodedBytes(), utf8.encode(sample));
        }
      }
      await exercise(project);await exercise(target);
      final stale = await project.prepareMigration(root, '${directory.path}/stale', targetVersion: '2.0');addTearDown(stale.close);
      project.store.replace(root, buffer.text.replaceFirst('Unsaved R2', 'Changed R2'));
      await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));project.store.undo();
      final arguments = ['migrate', file.path, '--target', '2.0', '--output', '${directory.path}/cli', '--json'];
      Future<ProcessResult> command(List<String> extra) => Process.run('$testBundle/busyapi', [...arguments, ...extra],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      final preview = await command([]);expect(preview.exitCode, 0, reason: '${preview.stdout} ${preview.stderr}');
      final report = jsonDecode(preview.stdout as String) as Map;expect(report['producerVersion'], '98');expect(report['published'], false);
      final applied = await command(['--apply', report['reviewIdentity'] as String]);expect(applied.exitCode, 0, reason: '${applied.stdout} ${applied.stderr}');
      expect(await file.readAsString(), original);
      final moved = await Directory(review.destination).rename('${directory.path}/cold');await file.delete();
      final cold = await BusyProject.open(moved.path, engine);addTearDown(cold.close);await exercise(cold);
      final cli = await BusyProject.open('${directory.path}/cli', engine);addTearDown(cli.close);await exercise(cli);
    });
  }
}

void _b05OperationContexts() {
  for (final format in ['yaml', 'json']) for (final bodyApplicability in [false, true]) {
    test('B05-R1 $format shared operations preserve ${bodyApplicability ? 'body applicability' : 'entry media'} through Core and CLI publication', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-b05-operation-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper); addTearDown(engine.close);
      const exact = '9007199254740993.00';
      final observed = <(String, String, String?, List<int>)>[];
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0); addTearDown(() => server.close(force: true));
      server.listen((request) async {
        final bytes = await request.fold<List<int>>([], (all, part) => all..addAll(part));
        final media = request.headers.value('content-type');
        observed.add((request.method, request.uri.toString(), media, bytes));
        if (bodyApplicability) { request.response.statusCode = 204; }
        else {
          request.response.headers.set('content-type', media == 'application/json' ? 'application/vnd.reply-a+json' : 'application/json');
          request.response.add(bytes);
        }
        await request.response.close();
      });
      Map<String, Object?> api(bool first) => {
        if (bodyApplicability) 'openapi': first ? '3.0.4' : '3.1.2' else 'swagger': '2.0',
        'info': {'title': first ? 'First' : 'Second', 'version': 'business'},
        if (bodyApplicability) 'servers': [{'url': 'http://127.0.0.1:${server.port}/v1'}]
        else ...{'host': '127.0.0.1:${server.port}', 'schemes': ['http'], 'basePath': '/v1',
          'consumes': [first ? 'application/json' : 'application/vnd.request-b+json'],
          'produces': [first ? 'application/vnd.reply-a+json' : 'application/json']},
        'paths': {'/payload': {r'$ref': 'shared.$format#/Path'}},
        'x-kept': {'exact': 'EXACT', 'flag': false, 'empty': '', r'$ref': 'literal'},
      };
      final schema = {'type': 'integer', 'enum': ['EXACT']};
      final operation = {
        if (bodyApplicability) 'requestBody': {r'$ref': '#/Body'}
        else 'parameters': [{r'$ref': '#/Body'}],
        'security': [],
        'responses': {bodyApplicability ? '204' : '200': bodyApplicability ? {'description': 'Empty'} : {r'$ref': '#/Reply'}},
      };
      final fragment = {
        'Path': {if (bodyApplicability) 'get': operation, 'post': operation},
        'Body': bodyApplicability ? {'description': 'Original body', 'required': true, 'content': {'application/json': {'schema': schema}}}
            : {'description': 'Original body', 'in': 'body', 'name': 'payload', 'required': true, 'schema': schema},
        if (!bodyApplicability) 'Reply': {'description': 'Reply', 'schema': schema},
      };
      String encode(Object value) => '${format == 'yaml' ? '# Keep contexts 雪\r\n' : ''}${jsonEncode(value).replaceAll('"EXACT"', exact)}\r\n';
      final originals = <String, String>{'a.$format': encode(api(true)), 'b.$format': encode(api(false)), 'shared.$format': encode(fragment)};
      if (format == 'yaml') originals['shared.$format'] = '# Keep alias consumers\r\n${fragment.entries.map((entry) => '${entry.key}: ${jsonEncode(entry.value).replaceAll('"EXACT"', exact)}').join('\r\n')}\r\nLiteral: &literal {exact: $exact, flag: false}\r\nLiteralAlias: *literal\r\n';
      for (final entry in originals.entries) { await File('${directory.path}/${entry.key}').writeAsString(entry.value); }
      final configuration = File('${directory.path}/busyapi.yaml');
      await configuration.writeAsString('version: 1\nroots: [{name: first, path: a.$format}, {name: second, path: b.$format}]\n');
      final project = await BusyProject.open(directory.path, engine); addTearDown(project.close);
      final roots = [File('${directory.path}/a.$format').uri.toString(), File('${directory.path}/b.$format').uri.toString()];
      final shared = await project.buffer(File('${directory.path}/shared.$format').uri.toString());
      project.store.replace(shared.id, shared.text.replaceFirst('Original body', 'Unsaved body'));
      final target = bodyApplicability ? '2.0' : '3.2.1', destination = '${directory.path}/copy';
      Future<List<(String, String, String?, String)>> exchange(BusyProject owner, List<String> entries) async {
        final start = observed.length;
        for (final (index, root) in entries.indexed) {
          final checked = await owner.check(root); expect(checked['complete'], true, reason: '$checked');
          for (final operation in (checked['projection']['operations'] as List).cast<Map>()) {
            final plan = await owner.prepareRequest(root, resource: operation['resource'] as String, pointer: operation['pointer'] as String, occurrence: operation['occurrence'] as String);
            try {
              final active = !bodyApplicability || index == 1 || operation['method'] == 'post';
              expect(plan.result['requestBody'] != null, active);
              final media = bodyApplicability || index == 0 ? 'application/json' : 'application/vnd.request-b+json';
              if (active) expect((((plan.result['requestBody'] as Map)['content']) as List).cast<Map>().map((entry) => entry['mediaType']), [media]);
              if (!bodyApplicability) expect((((plan.result['responses'] as List).first as Map)['content'] as List).cast<Map>().map((entry) => entry['mediaType']),
                [index == 0 ? 'application/vnd.reply-a+json' : 'application/json']);
              final result = await const ContractRequestExecutor().execute(plan, OperationRequestDraft(planIdentity: plan.identity,
                body: active ? RequestBodyDraft.raw(mediaType: media, text: exact) : const RequestBodyDraft.none()), resolveSecret: (_) async => null);
              try {
                expect(result.outgoing.complete, true); expect(result.outgoing.valid, true, reason: '${result.outgoing.findings}');
                expect(result.received.complete, true); expect(result.received.valid, true, reason: '${result.received.findings}');
                expect(observed.last.$1, (operation['method'] as String).toUpperCase()); expect(observed.last.$2, '/v1/payload');
                expect(observed.last.$4, active ? utf8.encode(exact) : <int>[]);
                if (active) expect(observed.last.$3, media);
                expect(await result.response.bytes(), bodyApplicability ? <int>[] : utf8.encode(exact));
              } finally { await result.close(); }
            } finally { plan.close(); }
          }
        }
        return observed.sublist(start).map((request) => (request.$1, request.$2, request.$3, base64Encode(request.$4))).toList();
      }
      final behavior = await exchange(project, roots);
      final first = await project.prepareMigration(roots.first, destination, targetVersion: target); addTearDown(first.close);
      final decisions = {for (final problem in first.problems.where((problem) => problem.code == 'migration.body.ignored-activation')) problem.id: 'omit-ignored-body'};
      expect(decisions.length, bodyApplicability ? 1 : 0);
      final review = decisions.isEmpty ? first : await project.prepareMigration(roots.first, destination, targetVersion: target, decisions: decisions);
      addTearDown(review.close); expect(review.publishable, true, reason: '${review.result}'); expect(review.unsaved, true); expect(review.entryRoutes, hasLength(2));
      final repeat = await project.prepareMigration(roots.first, destination, targetVersion: target, decisions: decisions); addTearDown(repeat.close); expect(repeat.identity, review.identity);
      await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
      expect(await Directory(destination).exists(), false);
      final conflict = await project.prepareMigration(roots.first, '${directory.path}/conflict', targetVersion: target, decisions: decisions); addTearDown(conflict.close);
      await expectLater(conflict.publish(beforePublish: () async {
        await Directory(conflict.destination).create(); await File('${conflict.destination}/foreign').writeAsString('Keep');
      }), throwsA(anything));
      expect(await File('${conflict.destination}/foreign').readAsString(), 'Keep'); expect(await File('${conflict.destination}/migration.json').exists(), false);
      await review.publish(); expect(shared.dirty, true);
      final stale = await project.prepareMigration(roots.first, '${directory.path}/stale', targetVersion: target, decisions: decisions); addTearDown(stale.close);
      project.store.replace(shared.id, shared.text.replaceFirst('Unsaved body', 'Later body'));
      await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
      expect(await Directory(stale.destination).exists(), false);
      final cliDestination = '${directory.path}/cli';
      Future<ProcessResult> cli(List<String> extra) => Process.run('$testBundle/busyapi', ['migrate', directory.path, '--root', 'first', '--target', target, '--output', cliDestination, '--json', ...extra],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      final preview = await cli([]); expect(preview.exitCode, bodyApplicability ? 2 : 0, reason: '${preview.stdout}\n${preview.stderr}');
      final report = jsonDecode(preview.stdout as String) as Map; expect(report['producerVersion'], '98'); expect(report['published'], false);
      final cliDecisions = [for (final problem in (report['problems'] as List).cast<Map>().where((problem) => problem['code'] == 'migration.body.ignored-activation')) ...['--decision', '${problem['id']}=omit-ignored-body']];
      final approved = cliDecisions.isEmpty ? preview : await cli(cliDecisions); expect(approved.exitCode, 0, reason: '${approved.stdout}\n${approved.stderr}');
      final approvedReport = jsonDecode(approved.stdout as String) as Map;
      final applied = await cli([...cliDecisions, '--apply', approvedReport['reviewIdentity'] as String]); expect(applied.exitCode, 0, reason: '${applied.stdout}\n${applied.stderr}');
      expect((jsonDecode(applied.stdout as String) as Map)['published'], true);
      for (final entry in originals.entries) { final file = File('${directory.path}/${entry.key}'); expect(await file.readAsString(), entry.value); await file.delete(); }
      for (final outputPath in [destination, cliDestination]) {
        final output = await BusyProject.open(outputPath, engine); addTearDown(output.close);
        final entries = [for (final original in roots) review.changes.singleWhere((change) => change.resource == original).destination];
        if (outputPath == cliDestination) {
          for (var index = 0; index < entries.length; index++) { entries[index] = entries[index].replaceFirst(Uri.directory(destination).toString(), Uri.directory(cliDestination).toString()); }
        }
        expect(await exchange(output, entries), behavior);
        if (format == 'yaml') expect((await output.buffer(output.roots.first.id)).text, contains('# Keep contexts 雪'));
      }
    });
  }
}

void _r2FileResponses() {
  for (final targetVersion in ['3.0.4', '3.1.2', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('R2 Swagger $format file responses retain inherited media and arbitrary bytes in $targetVersion', () async {
        final temp = await Directory.systemTemp.createTemp('busyapi-r2-response-');
        addTearDown(() => temp.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper); addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0); addTearDown(() => server.close(force: true));
        final seen = <(String, String, List<int>)>[];
        server.listen((request) async {
          final media = request.headers.value('content-type')!, bytes = await request.fold<List<int>>([], (all, next) => all..addAll(next));
          seen.add((request.uri.path, media, bytes)); request.response.headers.set('content-type', media); request.response.add(bytes); await request.response.close();
        });
        final value = {
          'swagger': '2.0', 'info': {'title': 'Original R2', 'version': '1'},
          'host': '127.0.0.1:${server.port}', 'schemes': ['http'],
          'consumes': ['application/octet-stream'], 'produces': ['application/octet-stream'],
          'paths': {for (final path in ['/raw', '/png']) path: {'post': {
            if (path == '/png') 'consumes': ['image/png'], if (path == '/png') 'produces': ['image/png'],
            'parameters': [{r'$ref': '#/parameters/Body'}], 'responses': {'200': {r'$ref': '#/responses/File'}},
          }}},
          'parameters': {'Body': {'name': 'payload', 'in': 'body', 'required': true, 'schema': {'type': 'string', 'format': 'binary'}}},
          'responses': {'File': {'description': 'File bytes', 'schema': {'type': 'file', 'format': 'byte'}}},
        };
        final text = format == 'json' ? jsonEncode(value) : '# Keep R2 file source\r\n${value.entries.map((e) => '${jsonEncode(e.key)}: ${jsonEncode(e.value)}').join('\r\n')}\r\n';
        final file = File('${temp.path}/api.$format'); await file.writeAsString(text); final original = await file.readAsBytes();
        final project = await BusyProject.open(file.path, engine); addTearDown(project.close);
        final buffer = await project.buffer(project.roots.single.id); project.store.replace(buffer.id, buffer.text.replaceFirst('Original R2', 'Unsaved R2'));
        final review = await project.prepareMigration(buffer.id, '${temp.path}/target', targetVersion: targetVersion); addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}'); expect(review.unsaved, true);
        expect((review.result['outputs'] as List).any((output) => (output['text'] as String).contains('file_format')), true);
        await review.publish();
        final target = await BusyProject.open(review.destination, engine); addTearDown(target.close);
        final payload = File('${temp.path}/wire.bin');
        for (final owner in [project, target]) {
          final root = owner.roots.single.id; expect((await owner.check(root))['complete'], true);
          for (final (path, media) in [('/raw', 'application/octet-stream'), ('/png', 'image/png')]) {
            final plan = await owner.prepareRequest(root, resource: root, pointer: '/paths/${path.replaceAll('/', '~1')}/post'); addTearDown(plan.close);
            for (final bytes in <List<int>>[[], [0, 255, 128, 195, 169]]) {
              await payload.writeAsBytes(bytes);
              final result = await const ContractRequestExecutor().execute(plan, OperationRequestDraft(planIdentity: plan.identity,
                body: RequestBodyDraft.binaryFile(mediaType: media, file: payload.path)), resolveSecret: (_) async => null); addTearDown(result.close);
              expect(result.outgoing.complete, true, reason: '${result.outgoing.findings}'); expect(result.outgoing.valid, true);
              expect(result.received.complete, true, reason: '${result.received.findings}'); expect(result.received.valid, true);
              expect(seen.last.$1, path); expect(seen.last.$2, media); expect(seen.last.$3, bytes);
              expect(await result.response.decodedBytes(), bytes);
            }
          }
        }
        for (var index = 0; index < 4; index++) {
          expect(seen[index].$1, seen[index + 4].$1); expect(seen[index].$2, seen[index + 4].$2); expect(seen[index].$3, seen[index + 4].$3);
        }
        expect(await file.readAsBytes(), original);
      });
    }
  }
}

void _r3EquivalentMedia() {
  for (final format in ['yaml', 'json']) {
    test('R3 $format exact equivalent encoded media retain wire validation after Swagger publication', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-b04-media-'); addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper); addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0); addTearDown(() => server.close(force: true));
      final observed = <(String, List<int>)>[];
      server.listen((request) async {
        final bytes = await request.fold<List<int>>([], (all, part) => all..addAll(part));
        final media = request.headers.value('content-type')!; observed.add((media, bytes));
        request.response.headers.set('content-type', media); request.response.add(bytes); await request.response.close();
      });
      final content = {for (final (index, media) in ['application/octet-stream', 'application/json'].indexed)
        media: {'schema': {'type': 'string', 'format': 'byte', 'minLength': 'BOUND$index', 'maxLength': 8}}};
      final value = {'openapi': '3.0.4', 'info': {'title': 'Original equivalent media', 'version': '1'}, 'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/bytes': {'post': {'requestBody': {'content': content}, 'responses': {'200': {'description': 'Echo', 'content': content}}}}}};
      final original = '${format == 'yaml' ? '# Keep numeric spellings\r\n' : ''}${jsonEncode(value).replaceAll('"BOUND0"', '4.00').replaceAll('"BOUND1"', '4e0')}\r\n';
      final file = File('${directory.path}/api.$format'); await file.writeAsString(original);
      final project = await BusyProject.open(file.path, engine); addTearDown(project.close);
      final buffer = await project.buffer(project.roots.single.id); project.store.replace(buffer.id, buffer.text.replaceFirst('Original', 'Unsaved'));
      final payload = File('${directory.path}/wire.bin');
      Future<List<(bool, bool)>> exchange(BusyProject owner) async {
        final root = owner.roots.single.id, plan = await owner.prepareRequest(owner.roots.single.id, resource: root, pointer: '/paths/~1bytes/post');
        try {
          final results = <(bool, bool)>[];
          for (final media in content.keys) for (final value in ['AP+A', '', 'too-long-for-bounds']) {
            final bytes = utf8.encode(media == 'application/json' ? jsonEncode(value) : value); await payload.writeAsBytes(bytes);
            final result = await const ContractRequestExecutor().execute(plan, OperationRequestDraft(planIdentity: plan.identity,
              body: RequestBodyDraft.binaryFile(mediaType: media, file: payload.path)), resolveSecret: (_) async => null);
            try {
              expect(observed.last.$1, media); expect(observed.last.$2, bytes); expect(await result.response.decodedBytes(), bytes);
              expect(result.outgoing.complete, true); expect(result.received.complete, true);
              results.add((result.outgoing.valid, result.received.valid));
            } finally { await result.close(); }
          }
          return results;
        } finally { plan.close(); }
      }
      final before = await exchange(project); expect(before, [(true, true), (false, false), (false, false), (true, true), (false, false), (false, false)]);
      final review = await project.prepareMigration(buffer.id, '${directory.path}/copy', targetVersion: '2.0'); addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}'); expect(review.unsaved, true);
      final outputs = (review.result['outputs'] as List).cast<Map>();
      expect(outputs.any((output) => (output['text'] as String).contains('4.00')), true);
      expect(outputs.any((output) => (output['text'] as String).contains('4e0')), true);
      await review.publish(); expect(await file.readAsString(), original); await file.delete();
      final output = await BusyProject.open(review.destination, engine); addTearDown(output.close);
      expect((await output.check(output.roots.single.id))['complete'], true);
      expect(await exchange(output), before); expect(observed, hasLength(12));
    });
  }
}
