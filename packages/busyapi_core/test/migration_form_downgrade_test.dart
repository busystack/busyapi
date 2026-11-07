import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  _r2MixedForms();
  for (final media in [
    'application/x-www-form-urlencoded',
    'Application/X-WWW-Form-Urlencoded',
    'application/x-www-form-urlencoded; charset=utf-8',
    'Application/X-WWW-Form-Urlencoded; Charset="UTF-8"',
  ]) {
    for (final arrays in [false, true]) {
      for (final version in ['3.0.0', '3.0.4', '3.1.2', '3.2.1']) {
        for (final format in ['yaml', 'json']) {
          test(
            '$version $format $media arrays=$arrays reviewed form downgrade preserves exact HTTP and conformance classes',
            () async {
              final temp = await Directory.systemTemp.createTemp(
                'busyapi-form-downgrade-',
              );
              addTearDown(() => temp.delete(recursive: true));
              final server = await HttpServer.bind(
                InternetAddress.loopbackIPv4,
                0,
              );
              addTearDown(() => server.close(force: true));
              final seen = <(String, String, String, String, List<int>)>[];
              server.listen((request) async {
                seen.add((
                  request.method,
                  request.uri.toString(),
                  request.headers.value('host')!,
                  request.headers.contentType.toString(),
                  await request.fold<List<int>>(
                    [],
                    (bytes, next) => bytes..addAll(next),
                  ),
                ));
                request.response.statusCode = 204;
                await request.response.close();
              });
              final source = Directory('${temp.path}/source');
              await source.create();
              final file = File('${source.path}/api.$format');
              final properties = {
                'count': {'type': 'integer', 'minimum': 0, 'default': 0},
                'name': {'type': 'string'},
                'flag': {'type': 'boolean', 'default': false},
                'exact': {
                  'type': 'integer',
                  'enum': ['EXACT'],
                },
                'label': {'type': 'string'},
              };
              final encoding = {
                'multi': {'style': 'form'},
                'csv': {'explode': false},
                'ssv': {'style': 'spaceDelimited', 'explode': false},
                'pipes': {'style': 'pipeDelimited', 'allowReserved': false},
              };
              if (arrays) {
                for (final name in encoding.keys) {
                  properties[name] = {
                    'type': 'array',
                    'minItems': 1,
                    'maxItems': 4,
                    'uniqueItems': true,
                    'items': {
                      'type': 'string',
                      'enum': ['one', 'two'],
                    },
                  };
                }
                encoding.remove('multi');
              }
              final document = {
                'openapi': version,
                'info': {'title': 'Form 雪', 'version': 'unrelated'},
                'servers': [
                  {'url': 'http://127.0.0.1:${server.port}/v1'},
                ],
                'paths': {
                  '/items': {
                    'post': {
                      'requestBody': {
                        'required': true,
                        'content': {
                          media: {
                            'schema': {
                              'type': 'object',
                              'required': ['name'],
                              'properties': properties,
                            },
                            if (arrays) 'encoding': encoding,
                          },
                        },
                      },
                      'responses': {
                        '204': {'description': 'No body'},
                      },
                    },
                  },
                },
              };
              final text =
                  (format == 'json'
                          ? jsonEncode(document)
                          : '# Keep organization\r\nopenapi: $version\r\n'
                                'info: {title: "Form 雪", version: "unrelated"}\r\n'
                                'servers: [{url: "http://127.0.0.1:${server.port}/v1"}]\r\n'
                                'paths:\r\n  /items:\r\n    post:\r\n      requestBody: # Keep group\r\n'
                                '        required: true\r\n        content:\r\n          ${jsonEncode(media)}:\r\n'
                                '            schema:\r\n              type: object\r\n              required: [name]\r\n'
                                '              properties:\r\n${properties.entries.map((entry) => '                ${entry.key}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n'
                                '${arrays ? '            encoding: ${jsonEncode(encoding)}\r\n' : ''}'
                                '      responses: {204: {description: "No body"}}\r\n')
                      .replaceFirst('"EXACT"', '9007199254740993.00');
              final bytes = [239, 187, 191, ...utf8.encode(text)];
              await file.writeAsBytes(bytes);
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
                buffer.text.replaceFirst('Form 雪', 'Unsaved 雪'),
              );
              final working = buffer.bytes();
              final review = await project.prepareMigration(
                buffer.id,
                '${temp.path}/target',
                targetVersion: '2.0',
              );
              addTearDown(review.close);
              expect(
                review.status,
                MigrationStatus.faithfullyConvertible,
                reason: '${review.result}',
              );
              expect(review.unsaved, true);
              expect(await Directory(review.destination).exists(), false);
              await review.publish();
              expect(await file.readAsBytes(), bytes);
              expect(buffer.bytes(), working);
              final target = await BusyProject.open(review.destination, engine);
              addTearDown(target.close);
              Future<void> send(
                BusyProject owner,
                String root,
                bool valid,
              ) async {
                final analysis = await owner.check(root);
                expect(analysis['complete'], true, reason: '$analysis');
                final operation =
                    (analysis['projection']['operations'] as List).single
                        as Map;
                final plan = await owner.prepareRequest(
                  root,
                  resource: operation['resource'] as String,
                  pointer: operation['pointer'] as String,
                  occurrence: operation['occurrence'] as String,
                );
                addTearDown(plan.close);
                final result = await const ContractRequestExecutor().execute(
                  plan,
                  OperationRequestDraft(
                    planIdentity: plan.identity,
                    body: RequestBodyDraft.formValue(
                      mediaType: media,
                      json:
                          '{"count":${valid ? 0 : -1},"name":"","flag":false,"exact":9007199254740993.00,"label":"café 雪","\$ref":"./literal.json#/example","opaque":{"n":9007199254740993.00,"s":"雪","literal":{"\$ref":"data"},"flag":false,"zero":0,"nil":null},"opaqueRows":[{"n":9007199254740993.00},[false,0,null,"雪"]],"nothing":null,"openEmpty":[]${arrays ? ',"multi":["one","two"],"csv":["one","two"],"ssv":["one","two"],"pipes":["one","two"]' : ''}}',
                    ),
                  ),
                  resolveSecret: (_) async => null,
                );
                addTearDown(result.close);
                expect(
                  result.outgoing.complete,
                  true,
                  reason: '${result.outgoing.findings}',
                );
                expect(
                  result.outgoing.valid,
                  valid,
                  reason: '${result.outgoing.findings}',
                );
                expect(result.received.complete, true);
                expect(
                  result.received.valid,
                  true,
                  reason: '${result.received.findings}',
                );
              }

              for (final valid in [true, false]) {
                await send(project, buffer.id, valid);
                await send(target, target.roots.single.id, valid);
              }
              expect(seen, hasLength(4));
              for (final index in [0, 2]) {
                expect(
                  (
                    seen[index].$1,
                    seen[index].$2,
                    seen[index].$3,
                    seen[index].$4,
                  ),
                  (
                    seen[index + 1].$1,
                    seen[index + 1].$2,
                    seen[index + 1].$3,
                    seen[index + 1].$4,
                  ),
                );
                if (!arrays) expect(seen[index].$5, seen[index + 1].$5);
                expect(
                  Uri.splitQueryString(utf8.decode(seen[index].$5)),
                  Uri.splitQueryString(utf8.decode(seen[index + 1].$5)),
                );
              }
              expect(seen[0].$1, 'POST');
              expect(seen[0].$2, '/v1/items');
              expect(seen[0].$3, '127.0.0.1:${server.port}');
              expect(seen[0].$4, ContentType.parse(media).toString());
              expect(
                utf8.decode(seen[0].$5),
                'count=0&name=&flag=false&exact=9007199254740993.00&label=caf%C3%A9+%E9%9B%AA&%24ref=.%2Fliteral.json%23%2Fexample&opaque=%7B%22n%22%3A9007199254740993.00%2C%22s%22%3A%22%E9%9B%AA%22%2C%22literal%22%3A%7B%22%24ref%22%3A%22data%22%7D%2C%22flag%22%3Afalse%2C%22zero%22%3A0%2C%22nil%22%3Anull%7D&opaqueRows=%7B%22n%22%3A9007199254740993.00%7D&opaqueRows=%5Bfalse%2C0%2Cnull%2C%22%E9%9B%AA%22%5D&nothing=null${arrays ? '&multi=one&multi=two&csv=one,two&ssv=one%20two&pipes=one%7Ctwo' : ''}',
              );
              expect(
                utf8.decode(seen[2].$5),
                'count=-1&name=&flag=false&exact=9007199254740993.00&label=caf%C3%A9+%E9%9B%AA&%24ref=.%2Fliteral.json%23%2Fexample&opaque=%7B%22n%22%3A9007199254740993.00%2C%22s%22%3A%22%E9%9B%AA%22%2C%22literal%22%3A%7B%22%24ref%22%3A%22data%22%7D%2C%22flag%22%3Afalse%2C%22zero%22%3A0%2C%22nil%22%3Anull%7D&opaqueRows=%7B%22n%22%3A9007199254740993.00%7D&opaqueRows=%5Bfalse%2C0%2Cnull%2C%22%E9%9B%AA%22%5D&nothing=null${arrays ? '&multi=one&multi=two&csv=one,two&ssv=one%20two&pipes=one%7Ctwo' : ''}',
              );
              if (arrays) {
                for (final index in [1, 3]) {
                  expect(
                    utf8.decode(seen[index].$5),
                    utf8
                        .decode(seen[index - 1].$5)
                        .replaceFirst('csv=one,two', 'csv=one%2Ctwo')
                        .replaceFirst('ssv=one%20two', 'ssv=one+two'),
                  );
                }
              }
              expect(await file.readAsBytes(), bytes);
              expect(buffer.bytes(), working);
            },
          );
        }
      }
    }
  }
}

void _r2MixedForms() {
  for (final version in ['3.0.4', '3.1.2', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('R2 $version $format mixed file form retains reviewed HTTP bytes and failure atomicity', () async {
        final temp = await Directory.systemTemp.createTemp('busyapi-r2-form-');
        addTearDown(() => temp.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        final observed = <List<int>>[];
        const media = 'multipart/form-data; boundary=R2';
        server.listen((request) async {
          expect(request.method, 'POST'); expect(request.uri.path, '/items');
          expect(request.headers.value('content-type'), media);
          final bytes = await request.fold<List<int>>([], (all, part) => all..addAll(part));
          observed.add(bytes); request.response.headers.set('content-type', 'application/octet-stream');
          request.response.add(bytes); await request.response.close();
        });
        final value = {
          'openapi': version, 'info': {'title': 'Original R2', 'version': '1'},
          'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
          'paths': {'/items': {'post': {
            'requestBody': {r'$ref': '#/components/requestBodies/Form'},
            'responses': {'200': {'description': 'Echo', 'content': {'application/octet-stream': {'schema': version == '3.0.4' ? {'type': 'string', 'format': 'binary'} : <String, Object?>{}}}}},
          }}},
          'components': {
            'requestBodies': {'Form': {'required': true, 'content': {media: {'schema': {r'$ref': '#/components/schemas/Form'}}}}},
            'schemas': {
              'Form': {'type': 'object', 'required': ['file'], 'properties': {
                'file': {r'$ref': '#/components/schemas/Raw'}, 'name': {r'$ref': '#/components/schemas/Name'},
                'numbers': {'type': 'array', 'items': {'type': 'integer', 'minimum': 0}},
              }},
              'Raw': version == '3.0.4' ? {'type': 'string', 'format': 'binary'} : <String, Object?>{},
              'Name': {'type': 'string'}, 'Independent': {r'$ref': '#/components/schemas/Form/properties/name'},
            },
          },
        };
        final text = format == 'json' ? jsonEncode(value) : '# Keep R2 source\r\n${value.entries.map((e) => '${jsonEncode(e.key)}: ${jsonEncode(e.value)}').join('\r\n')}\r\n';
        final file = File('${temp.path}/api.$format'); await file.writeAsString('\ufeff$text');
        final original = await file.readAsBytes();
        final project = await BusyProject.open(file.path, engine); addTearDown(project.close);
        final root = project.roots.single.id, buffer = await project.buffer(project.roots.single.id);
        project.store.replace(root, buffer.text.replaceFirst('Original R2', 'Unsaved R2'));
        final working = buffer.bytes();
        final review = await project.prepareMigration(root, '${temp.path}/target', targetVersion: '2.0');
        addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}'); expect(review.unsaved, true);
        await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'cancelled')));
        expect(await Directory(review.destination).exists(), false);
        final race = await project.prepareMigration(root, '${temp.path}/race', targetVersion: '2.0'); addTearDown(race.close);
        await expectLater(race.publish(beforePublish: () async {
          await Directory(race.destination).create(); await File('${race.destination}/foreign').writeAsString('Keep');
        }), throwsA(anything));
        expect(await File('${race.destination}/foreign').readAsString(), 'Keep');
        expect(await File('${race.destination}/openapi.$format').exists(), false);
        await review.publish();
        final target = await BusyProject.open(review.destination, engine); addTearDown(target.close);
        final payload = File('${temp.path}/wire.bin');
        final outcomes = <List<bool>>[];
        for (final owner in [project, target]) {
          final activeRoot = owner.roots.single.id;
          expect((await owner.check(activeRoot))['complete'], true);
          final plan = await owner.prepareRequest(activeRoot, resource: activeRoot, pointer: '/paths/~1items/post'); addTearDown(plan.close);
          final results = <bool>[];
          for (final bytes in <List<int>>[[], [0, 255, 128, 195, 169]]) {
            final wire = <int>[...utf8.encode('--R2\r\nContent-Disposition: form-data; name="file"\r\nContent-Type: application/octet-stream\r\n\r\n'), ...bytes,
              ...utf8.encode('\r\n--R2\r\nContent-Disposition: form-data; name="name"\r\n\r\n\r\n--R2--\r\n')];
            await payload.writeAsBytes(wire);
            final result = await const ContractRequestExecutor().execute(plan,
              OperationRequestDraft(planIdentity: plan.identity, body: RequestBodyDraft.binaryFile(mediaType: media, file: payload.path)), resolveSecret: (_) async => null);
            addTearDown(result.close);
            expect(result.outgoing.complete, true, reason: '${result.outgoing.findings}');
            expect(result.received.complete, true, reason: '${result.received.findings}');
            expect(observed.last, wire); expect(await result.response.decodedBytes(), wire);
            results.add(result.outgoing.valid && result.received.valid);
          }
          outcomes.add(results);
        }
        expect(outcomes, [[true, true], [true, true]]); expect(observed.take(2), observed.skip(2));
        final cli = await Process.run('$testBundle/busyapi', ['migrate', file.path, '--target', '2.0', '--output', '${temp.path}/cli', '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}'); expect((jsonDecode(cli.stdout as String) as Map)['complete'], true);
        final stale = await project.prepareMigration(root, '${temp.path}/stale', targetVersion: '2.0'); addTearDown(stale.close);
        project.store.replace(root, buffer.text.replaceFirst('Unsaved R2', 'Changed R2'));
        await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'migration.stale')));
        expect(await Directory(stale.destination).exists(), false); expect(await file.readAsBytes(), original);
        expect(working, isNot(original));
      });
    }
  }
}
