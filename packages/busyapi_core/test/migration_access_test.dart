import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final (from, target, required, flag, blocked) in [
    for (final (from, target) in [
      ('3.0.4', '3.1.2'),
      ('3.0.4', '3.2.1'),
      ('3.1.2', '3.0.4'),
      ('3.2.1', '3.0.4'),
      ('3.1.2', '3.2.1'),
      ('3.2.1', '3.1.2'),
    ])
      for (final flag in ['readOnly', 'writeOnly'])
        (from, target, false, flag, false),
    for (final from in ['3.0.4', '3.1.2', '3.2.1'])
      for (final required in [false, true])
        (from, '2.0', required, 'readOnly', false),
    for (final from in ['3.0.4', '3.1.2', '3.2.1'])
      for (final required in [false, true])
        (from, '2.0', required, 'writeOnly', true),
    for (final from in ['3.1.2', '3.2.1'])
      for (final flag in ['readOnly', 'writeOnly'])
        (from, '3.0.4', true, flag, false),
    for (final (from, target) in [('3.1.2', '3.2.1'), ('3.2.1', '3.1.2')])
      for (final flag in ['readOnly', 'writeOnly'])
        (from, target, true, flag, false),
    for (final target in ['3.1.2', '3.2.1'])
      for (final flag in ['readOnly', 'writeOnly'])
        ('3.0.4', target, true, flag, false),
    for (final target in ['3.0.4', '3.1.2', '3.2.1'])
      for (final required in [false, true])
        ('2.0', target, required, 'readOnly', false),
  ]) {
    for (final format in ['yaml', 'json']) {
      test(
        '$from to $target $format $flag required=$required preserves HTTP semantics or blocks without output',
        () async {
          final temp = await Directory.systemTemp.createTemp(
            'busyapi-migration-access-',
          );
          addTearDown(() => temp.delete(recursive: true));
          final seen = <(String, String, String?, List<int>)>[];
          final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          addTearDown(() => server.close(force: true));
          server.listen((request) async {
            final bytes = await request.fold<List<int>>(
              [],
              (all, bytes) => all..addAll(bytes),
            );
            seen.add((
              request.method,
              request.uri.toString(),
              request.headers.contentType?.mimeType,
              bytes,
            ));
            request.response.headers.contentType = ContentType.json;
            request.response.add(bytes);
            await request.response.close();
          });
          final file = File('${temp.path}/api.$format'),
              fields = File('${temp.path}/fields.$format');
          final legacy = from == '2.0';
          final schema = {
            r'$ref': legacy ? '#/definitions/Model' : '#/components/schemas/Model',
          };
          final model = {
            'type': 'object',
            if (required) 'required': ['value'],
            'properties': {
              'value': {r'$ref': 'fields.$format#/Alias'},
            },
          };
          final value = {
            if (legacy) 'swagger': from else 'openapi': from,
            'info': {'title': 'Original 雪', 'version': 'api-version'},
            if (legacy) ...{
              'host': '127.0.0.1:${server.port}',
              'basePath': '/v1',
              'schemes': ['http'],
              'consumes': ['application/json'],
              'produces': ['application/json'],
            } else
              'servers': [
                {'url': 'http://127.0.0.1:${server.port}/v1'},
              ],
            'paths': {
              '/value': {
                'post': {
                  if (legacy)
                    'parameters': [
                      {'in': 'body', 'name': 'body', 'required': true, 'schema': schema},
                    ]
                  else
                    'requestBody': {
                      'required': true,
                      'content': {
                        'application/json': {'schema': schema},
                      },
                    },
                  'responses': {
                    '200': {
                      'description': 'Value',
                      if (legacy) 'schema': schema else
                        'content': {
                          'application/json': {'schema': schema},
                        },
                    },
                  },
                },
              },
            },
            if (legacy) 'definitions': {'Model': model} else
              'components': {
                'schemas': {
                  'Model': model,
                },
              },
            'x-kept': {'exact': 'EXACT', 'flag': false, 'empty': ''},
          };
          String text(Object data) =>
              '${format == 'yaml' ? '# Keep comments 雪\r\n' : ''}${jsonEncode(data).replaceAll('"EXACT"', '9007199254740993.000')}\r\n';
          final original = text(value),
              originalFields = text({
                'Flag': {'type': 'string', flag: true},
                'Alias': {r'$ref': '#/Flag'},
              });
          await file.writeAsString(original);
          await fields.writeAsString(originalFields);
          final engine = EngineProcess(
            executable: runtimeNode,
            helper: runtimeHelper,
          );
          addTearDown(engine.close);
          final project = await BusyProject.open(file.path, engine);
          addTearDown(project.close);
          final buffer = await project.buffer(file.uri.toString());
          project.store.replace(
            buffer.id,
            original.replaceFirst('Original 雪', 'Unsaved 雪'),
          );
          final current = buffer.text, destination = '${temp.path}/converted';
          final review = await project.prepareMigration(
            buffer.id,
            destination,
            targetVersion: target,
          );
          addTearDown(review.close);
          Future<void> send(BusyProject owner) async {
            final root = owner.roots.single.id,
                checked = await owner.check(root);
            expect(checked['complete'], true, reason: '$checked');
            final operation =
                (checked['projection']['operations'] as List).single as Map;
            for (final payload in ['{}', '{"value":"snow 雪"}', '{"value":false}', '{"value":null}']) {
              final plan = await owner.prepareRequest(
                root,
                resource: operation['resource'] as String,
                pointer: operation['pointer'] as String,
              );
              addTearDown(plan.close);
              final run = await const ContractRequestExecutor().execute(
                plan,
                OperationRequestDraft(
                  planIdentity: plan.identity,
                  body: RequestBodyDraft.raw(
                    mediaType: 'application/json',
                    text: payload,
                  ),
                ),
                resolveSecret: (_) async => null,
              );
              addTearDown(run.close);
              final present = payload != '{}';
              final valueValid = !present || payload == '{"value":"snow 雪"}';
              final requestValid = (legacy
                  ? !required && !present
                  : !required || present || from.startsWith('3.0.') && flag == 'readOnly') && valueValid;
              final responseValid = (!required || present ||
                  from.startsWith('3.0.') && flag == 'writeOnly') && valueValid;
              expect(run.outgoing.complete, true);
              expect(run.received.complete, true);
              expect(
                run.outgoing.valid,
                requestValid,
                reason: '${run.outgoing.findings}',
              );
              expect(
                run.received.valid,
                responseValid,
                reason: '${run.received.findings}',
              );
              expect(run.conforming, requestValid && responseValid);
              expect(await run.response.bytes(), utf8.encode(payload));
              expect(seen.last.$1, 'POST');
              expect(seen.last.$2, '/v1/value');
              expect(seen.last.$3, 'application/json');
              expect(seen.last.$4, utf8.encode(payload));
            }
          }

          if (blocked) {
            expect(review.status, MigrationStatus.blocked);
            expect(review.result['outputs'], isEmpty);
            final problem = review.problems.firstWhere(
              (p) => p.code == 'migration.schema.write-only',
            );
            expect(problem.resource, fields.uri.toString());
            expect(problem.pointer, '/Flag/writeOnly');
            expect(problem.reason, MigrationProblemReason.targetRepresentation);
            await expectLater(
              review.publish(),
              throwsA(
                isA<CoreFailure>().having(
                  (e) => e.code,
                  'code',
                  'migration.blocked',
                ),
              ),
            );
            expect(seen, isEmpty);
          } else {
            expect(review.publishable, true, reason: '${review.result}');
            expect(review.unsaved, true);
            await send(project);
            final fieldBuffer = await project.buffer(fields.uri.toString());
            project.store.replace(
              fieldBuffer.id,
              originalFields.replaceFirst('true', 'false'),
            );
            await expectLater(
              review.publish(),
              throwsA(
                isA<CoreFailure>().having(
                  (e) => e.code,
                  'code',
                  'migration.stale',
                ),
              ),
            );
            expect(Directory(destination).existsSync(), false);
            project.store.replace(fieldBuffer.id, originalFields);
            final fresh = await project.prepareMigration(
              buffer.id,
              destination,
              targetVersion: target,
            );
            addTearDown(fresh.close);
            expect(fresh.publishable, true, reason: '${fresh.result}');
            final derived = fresh.changes.where((change) => change.isCreated).toList();
            if (legacy || from == '3.0.4' && required) expect(derived, isNotEmpty);
            for (final change in derived) {
              expect(change.createdFrom, buffer.id);
              expect(change.before, isEmpty);
              expect(await File.fromUri(Uri.parse(change.resource)).exists(), false);
            }
            await expectLater(
              fresh.publish(cancelled: () => true),
              throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')),
            );
            expect(Directory(destination).existsSync(), false);
            await expectLater(
              fresh.publish(beforePublish: () async {
                throw const FileSystemException('Controlled directional publication failure');
              }),
              throwsA(isA<FileSystemException>()),
            );
            expect(Directory(destination).existsSync(), false);
            expect(await file.readAsString(), original);
            expect(buffer.text, current);
            await fresh.publish();
            for (final change in derived) {
              expect(await File.fromUri(Uri.parse(change.destination)).readAsString(), change.after);
              expect(await File.fromUri(Uri.parse(change.resource)).exists(), false);
            }
            final output = await BusyProject.open(destination, engine);
            addTearDown(output.close);
            final checked = await output.check(output.roots.single.id);
            expect(
              checked['projection']['specification']['declaredVersion'],
              target,
            );
            await send(output);
            final outputText = (await output.buffer(output.roots.single.id))
                .text;
            expect(outputText, contains('Unsaved 雪'));
            expect(outputText, contains('9007199254740993.000'));
          }
          expect(buffer.text, current);
          expect(buffer.dirty, true);
          expect(await file.readAsString(), original);
          expect(await fields.readAsString(), originalFields);
          final cliDestination = '${temp.path}/cli-converted';
          Future<ProcessResult> cli(List<String> extra) => Process.run(
            '$testBundle/busyapi',
            [
              'migrate',
              file.path,
              '--target',
              target,
              '--output',
              cliDestination,
              '--json',
              ...extra,
            ],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'},
            includeParentEnvironment: false,
          );
          final first = await cli([]);
          expect(
            first.exitCode,
            blocked ? 2 : 0,
            reason: '${first.stdout}\n${first.stderr}',
          );
          final report = jsonDecode(first.stdout as String) as Map;
          expect(report['published'], false);
          expect(Directory(cliDestination).existsSync(), false);
          if (blocked) {
            expect(report['status'], 'blocked');
            expect(report['outputs'], isEmpty);
            expect(
              (report['problems'] as List).any(
                (p) => p['code'] == 'migration.schema.write-only',
              ),
              true,
            );
          } else {
            final applied = await cli([
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
            final copy = await BusyProject.open(cliDestination, engine);
            addTearDown(copy.close);
            await send(copy);
            expect(
              (await copy.buffer(copy.roots.single.id)).text,
              contains('Original 雪'),
            );
          }
          expect(await file.readAsString(), original);
          expect(await fields.readAsString(), originalFields);
          if (blocked) expect(Directory(destination).existsSync(), false);
          expect(seen, hasLength(blocked ? 0 : 12));
        },
      );
    }
  }

  for (final modern in ['3.1.2', '3.2.1']) {
    for (final target in ['3.0.4', '3.1.2', '3.2.1']) {
      for (final flag in ['readOnly', 'writeOnly']) {
        test('mixed 3.0/$modern shared $flag Headers retain captured directions through $target and cold CLI reopening', () async {
          final directory = await Directory.systemTemp.createTemp('busyapi-access-headers-');
          addTearDown(() => directory.delete(recursive: true));
          Map<String, Object?> api(String version) {
            final schema = {r'$ref': 'data.yaml#/Example/value/Payload'};
            final header = {r'$ref': 'data.yaml#/Example/value/Alias'};
            return {
              'openapi': version, 'info': {'title': 'Original $version', 'version': '1'},
              'servers': [{'url': 'https://api.invalid'}],
              'paths': {'/value': {'post': {
                'requestBody': {'content': {'multipart/form-data': {
                  'schema': {'type': 'object', 'properties': {'part': {'type': 'string'}}},
                  'encoding': {'part': {'headers': {'X-Value': header}}},
                }}},
                'responses': {'200': {'description': 'Value', 'headers': {'X-Value': header},
                  'content': {'application/json': {'schema': schema}},
                }},
              }}},
              'components': {'examples': {'History': {r'$ref': 'data.yaml#/Example'}}},
            };
          }
          final originals = {
            'busyapi.yaml': 'version: 1\nroots: [{name: first, path: first.yaml}, {name: second, path: second.yaml}]\n',
            'first.yaml': '${jsonEncode(api('3.0.4'))}\n',
            'second.yaml': '${jsonEncode(api(modern))}\n',
            'data.yaml': 'Example:\n  value:\n    Payload: &payload\n      type: object\n      required: [value]\n'
                '      properties:\n        value: {type: string, $flag: true}\n'
                '    Kept: *payload\n    Alias: {\$ref: "#/Example/value/Header"}\n'
                '    Header: {description: Shared Header, schema: {\$ref: "#/Example/value/Payload"}}\n'
                '    exact: 9007199254740993.000\n',
          };
          for (final entry in originals.entries) {
            await File('${directory.path}/${entry.key}').writeAsString(entry.value);
          }
          final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
          addTearDown(engine.close);
          final source = await BusyProject.open(directory.path, engine);
          addTearDown(source.close);
          final roots = [for (final name in ['first', 'second']) File('${directory.path}/$name.yaml').uri.toString()];
          final buffer = await source.buffer(roots.first);
          source.store.replace(buffer.id, buffer.text.replaceFirst('Original', 'Captured 雪'));
          final data = await source.buffer(File('${directory.path}/data.yaml').uri.toString());
          source.store.replace(data.id, data.text.replaceFirst('Shared Header', 'Unsaved Header'));
          final capturedData = data.text;

          Future<List<bool>> exercise(BusyProject project, String root) async {
            final checked = await project.check(root);
            expect(checked['status'], 'complete', reason: '$checked');
            var resource = root;
            var pointer = '/paths/~1value/post/requestBody/content/multipart~1form-data/encoding/part/headers/X-Value';
            Map? requestSchema;
            for (var depth = 0; depth < 128; depth++) {
              final header = await project.inspectObject(root, resource, pointer, contextKind: 'header');
              final references = (header['references'] as List).whereType<Map>()
                  .where((reference) => reference['keyword'] == r'$ref' && reference['kind'] == 'header');
              if (references.isEmpty) {
                requestSchema = ((header['fields'] as List).whereType<Map>()
                    .singleWhere((field) => field['name'] == 'schema')['target'] as Map);
                break;
              }
              final reference = references.single;
              expect(reference['resolution'], 'resolved');
              resource = reference['targetResource'] as String;
              pointer = reference['targetPointer'] as String;
            }
            expect(requestSchema, isNotNull);
            final prepared = await project.prepareRequest(root, resource: root, pointer: '/paths/~1value/post');
            try {
              final response = (prepared.result['responses'] as List).single as Map;
              final responseSchema = ((response['headers'] as List).single as Map)['schema'] as Map;
              final result = await prepared.evaluateRuntime([
                for (final (subject, schema) in [('request-body', requestSchema!), ('response-body', responseSchema)])
                  for (final text in ['{}', '{"value":"雪"}', '{"value":false}', '{"value":null}'])
                    RuntimeSchemaInstance(subject: subject, location: 'X-Value', text: text,
                      schemaResource: schema['resource'] as String, schemaPointer: schema['pointer'] as String),
              ]);
              expect(result['complete'], true, reason: '$result');
              final evaluations = (result['runtimeEvaluations'] as List).cast<Map>();
              expect(evaluations.every((value) => value['complete'] == true), true);
              return evaluations.map((value) => value['valid'] as bool).toList();
            } finally { prepared.close(); }
          }

          final expected = [for (final root in roots) await exercise(source, root)];
          expect(expected.first, [flag == 'readOnly', true, false, false, flag == 'writeOnly', true, false, false]);
          expect(expected.last, [false, true, false, false, false, true, false, false]);
          final review = await source.prepareMigration(roots.first, '${directory.path}/output', targetVersion: target);
          addTearDown(review.close);
          expect(review.publishable, true, reason: '${review.result}');
          expect(review.unsaved, true);
          await review.publish();
          final names = [for (final root in roots)
            Uri.parse(review.changes.singleWhere((change) => change.resource == root).destination).pathSegments.last];
          final dataCopy = review.changes.singleWhere((change) => change.resource == data.id);
          expect(await File.fromUri(Uri.parse(dataCopy.destination)).readAsString(), capturedData);
          for (final entry in originals.entries) {
            expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
          }
          expect(buffer.dirty, true);expect(data.dirty, true);
          source.close();
          final moved = await Directory(review.destination).rename('${directory.path}/cold 雪');
          for (final name in originals.keys) { await File('${directory.path}/$name').delete(); }
          final cold = await BusyProject.open(moved.path, engine);
          addTearDown(cold.close);
          for (final (index, name) in names.indexed) {
            expect(await exercise(cold, File('${moved.path}/$name').uri.toString()), expected[index]);
          }
          final cli = await Process.run('$testBundle/busyapi', ['migrate', moved.path, '--root', 'migrated',
            '--target', target, '--output', '${directory.path}/cli-review', '--review', '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
          expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
          final report = jsonDecode(cli.stdout as String) as Map;
          expect(report['producerVersion'], '86');expect(report['complete'], true);expect(report['published'], false);
        });
      }
    }
  }
}
