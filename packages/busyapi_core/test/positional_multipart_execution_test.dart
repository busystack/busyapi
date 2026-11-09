import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

const _media = 'multipart/mixed; boundary=Fixture';

class _MultipartProofEngine extends EngineProcess {
  _MultipartProofEngine() : super(executable: runtimeNode, helper: runtimeHelper);
  void Function()? beforeProof;
  @override
  Future<Map<String, dynamic>> request(String method, Map<String, Object?> params, {String? requestId}) {
    if (method == 'requestMultipartPlan' && params['wire'] is String) {
      final action = beforeProof;
      beforeProof = null;
      action?.call();
    }
    return super.request(method, params, requestId: requestId);
  }
}

String _wire(String value, bool nested) {
  final first =
      '--Fixture\r\nContent-Type: application/json\r\n\r\n'
      '{"id":$value}\r\n';
  final second = nested
      ? 'Content-Type: multipart/mixed; boundary=Inner\r\n\r\n'
            '--Inner\r\nContent-Type: text/plain\r\n\r\nfalse\r\n'
            '--Inner\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n'
            'café 東京\r\n--Inner--\r\n'
      : 'Content-Type: text/plain; charset=utf-8\r\n\r\n';
  return '$first--Fixture\r\n$second\r\n--Fixture--\r\n';
}

void main() {

  for (final version in ['3.2.0', '3.2.1']) {
    for (final format in ['json', 'yaml']) {
      for (final mode in ['ordered-form', 'mixed', 'nested', 'named-nested']) {
        test('$version $format typed $mode survives bytes, cases, relocation and CLI', () async {
          final directory = await Directory.systemTemp.createTemp('busyapi-typed-multipart-');
          addTearDown(() => directory.delete(recursive: true));
          final engine = _MultipartProofEngine();
          addTearDown(engine.close);
          final seen = <List<int>>[];
          final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          addTearDown(() => server.close(force: true));
          server.listen((request) async {
            seen.add(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)));
            request.response.statusCode = 204;
            await request.response.close();
          });
          final named = mode == 'named-nested', form = mode == 'ordered-form';
          final nested = mode == 'nested' || named;
          final type = form || named ? 'multipart/form-data' : 'multipart/mixed';
          final partSchema = <String, Object?>{
            'type': 'array', 'minItems': 2, 'maxItems': 3,
            'prefixItems': [
              {'type': 'integer', 'const': '__EXACT__'},
              {},
            ],
            'items': {'type': 'string'},
          };
          final imageEncoding = <String, Object?>{
            'contentType': 'image/png, application/octet-stream',
            if (!form) 'headers': {'X-Part': {'required': true, 'schema': {'type': 'string', 'const': 'retained'}}},
          };
          final media = <String, Object?>{
            'schema': named ? {'type': 'object', 'required': ['bundle'], 'properties': {
              'bundle': {'type': 'array', 'minItems': 1, 'items': partSchema},
            }} : nested ? {'type': 'array', 'minItems': 1, 'maxItems': 1, 'items': partSchema}
              : form ? {'type': 'array', 'minItems': 2, 'maxItems': 2, 'prefixItems': [
                {'type': 'object', 'required': ['tag'], 'properties': {'tag': {'type': 'integer', 'const': '__EXACT__'}}, 'additionalProperties': false},
                {'type': 'object', 'required': ['tag'], 'properties': {'tag': {}}, 'additionalProperties': false},
              ], 'items': false} : partSchema,
            if (named) 'encoding': {'bundle': {
              'contentType': 'multipart/mixed', 'prefixEncoding': [
                {'contentType': 'text/plain'}, imageEncoding,
              ], 'itemEncoding': {'contentType': 'text/plain; charset=utf-8'},
            }} else 'prefixEncoding': nested ? [{
              'contentType': 'multipart/mixed', 'prefixEncoding': [
                {'contentType': 'text/plain'}, imageEncoding,
              ], 'itemEncoding': {'contentType': 'text/plain; charset=utf-8'},
            }] : [
              {'contentType': 'text/plain'}, imageEncoding,
              // No corresponding position in the fixed ordered form.
              if (form) {'contentType': 'application/unavailable'},
            ],
            if (!named && !nested) 'itemEncoding': {'contentType': 'text/plain; charset=utf-8'},
          };
          final value = form ? '[{"tag":9007199254740993.00},{"tag":null}]'
            : named ? '{"bundle":[[9007199254740993.00,null,"café 東京"]]}'
            : nested ? '[[9007199254740993.00,null,"café 東京"]]'
            : '[9007199254740993.00,null,"café 東京"]';
          final filePointer = form ? '/1/tag' : named ? '/bundle/0/1' : nested ? '/0/1' : '/1';
          final original = (format == 'yaml' ? '\ufeff# Keep typed source 雪\r\n' : '') + jsonEncode({
            'openapi': version, 'info': {'title': 'Typed', 'version': 'original'},
            'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
            'paths': {'/typed': {'post': {
              'requestBody': {'required': true, 'content': {type: media}},
              'responses': {'204': {'description': 'Empty'}},
            }}},
          }).replaceAll('"__EXACT__"', '9007199254740993.00');
          final file = File('${directory.path}/api.$format')..writeAsStringSync(original);
          final upload = File('${directory.path}/input.bin')..writeAsBytesSync([0, 255, 128, 195, 169, 13, 10]);
          final project = await BusyProject.open(file.path, engine);
          addTearDown(project.close);
          final buffer = await project.buffer(file.uri.toString());
          project.store.replace(buffer.id, original.replaceFirst('Typed', 'Unsaved typed'));
          final plan = await project.prepareRequest(buffer.id, resource: buffer.id, pointer: '/paths/~1typed/post');
          addTearDown(plan.close);
          expect(plan.usesMultipartTree(type), isTrue);
          RequestBodyDraft body(String data) => RequestBodyDraft.multipartValue(json: data,
            mediaType: type, partHeaders: [if (!form) RequestPartHeaderValue(filePointer, 'X-Part', 'retained')],
            files: [MultipartFileValue(name: filePointer, path: upload.path,
              filename: 'input.bin', selectedMediaType: 'image/png')]);
          final draft = OperationRequestDraft(planIdentity: plan.identity, body: body(value));
          final result = await const ContractRequestExecutor().execute(plan, draft, resolveSecret: (_) async => null);
          try {
            expect(result.conforming, isTrue, reason: '${result.outgoing.findings}');
            final bytes = seen.single;
            final text = latin1.decode(bytes);
            expect(text, contains('9007199254740993.00'));
            expect(text, contains(latin1.decode([0, 255, 128, 195, 169, 13, 10])));
            expect(text, contains('Content-Type: image/png\r\n'));
            if (nested) expect(text, contains('Content-Type: multipart/mixed; boundary='));
            if (form) expect('name="tag"'.allMatches(text).length, 2);
            if (!form && !named) expect(text, isNot(contains('name=')));
          } finally { await result.close(); }
          if (mode == 'mixed' && format == 'json') {
            // The file can change while the Engine checks the prepared entity;
            // the held capture must continue to own the original exact bytes.
            engine.beforeProof = () => upload.writeAsBytesSync([99]);
            final prepared = await const ContractRequestBuilder().build(plan, draft,
              resolveSecret: (_) async => null);
            try {
              expect(upload.readAsBytesSync(), [99]);
              final captured = await prepared.body!.open().fold<List<int>>([], (all, chunk) => all..addAll(chunk));
              expect(latin1.decode(captured), contains(latin1.decode([0, 255, 128, 195, 169, 13, 10])));
              final outgoing = await const ContractRequestExecutor().validateOutgoing(plan, draft,
                prepared.runId, preparedBody: prepared.body);
              expect(outgoing.valid, isTrue, reason: '${outgoing.findings}');
            } finally { await prepared.body?.close(); }
            upload.writeAsBytesSync([0, 255, 128, 195, 169, 13, 10]);
            final cancelled = RunCancellation();
            engine.beforeProof = cancelled.cancel;
            await expectLater(const ContractRequestBuilder().build(plan, draft,
              resolveSecret: (_) async => null, cancellation: cancelled),
              throwsA(isA<CoreFailure>().having((f) => f.code, 'code', 'cancelled')));
            final retry = await const ContractRequestBuilder().build(plan, draft,
              resolveSecret: (_) async => null);
            await retry.body?.close();
          }
          final dispatched = seen.length;
          await expectLater(const ContractRequestExecutor().execute(plan,
            OperationRequestDraft(planIdentity: plan.identity, body: body(value.replaceFirst('9007199254740993.00', '9007199254740992'))),
            resolveSecret: (_) async => null), throwsA(isA<CoreFailure>().having((f) => f.code, 'code', 'request.multipart.conformance')));
          expect(seen.length, dispatched);
          await expectLater(const ContractRequestBuilder().build(plan, draft,
            resolveSecret: (_) async => null, cancellation: RunCancellation()..cancel()),
            throwsA(isA<CoreFailure>().having((f) => f.code, 'code', 'cancelled')));
          if (mode == 'mixed' && format == 'json') {
            final mockPlan = await project.prepareMock(buffer.id);
            try {
              final mock = await mockPlan.start(nodeExecutable: runtimeNode,
                helper: '$testBundle/libexec/busyapi/mock-server.cjs');
              try {
                final prepared = await const ContractRequestBuilder().build(plan, draft,
                  resolveSecret: (_) async => null);
                try {
                  final bytes = await prepared.body!.open().fold<List<int>>([], (all, chunk) => all..addAll(chunk));
                  final client = HttpClient();
                  try {
                    final request = await client.postUrl(mock.baseUri.resolve('/typed'));
                    request.headers.set('Content-Type', prepared.body!.mediaType!);
                    request.add(bytes);
                    final response = await request.close();
                    expect(response.statusCode, 204);
                    await response.drain<void>();
                  } finally { client.close(force: true); }
                } finally { await prepared.body?.close(); }
              } finally { await mock.stop(); }
            } finally { mockPlan.close(); }
          }
          final manifest = jsonEncode({'version': 1, 'roots': [{'name': 'api', 'path': 'api.$format'}],
            'environments': {'local': {'baseUrl': 'http://127.0.0.1:${server.port}'}},
            'tests': [{'name': 'typed', 'environment': 'local', 'operation': {'method': 'post', 'path': '/typed'},
              'body': {'mediaType': type, 'value': '__TYPED__',
                if (!form) 'partHeaders': [{'part': filePointer, 'name': 'X-Part', 'value': 'retained'}], 'files': [{'name': filePointer, 'path': 'input.bin', 'filename': 'input.bin', 'mediaType': 'image/png'}]},
              'expect': {'status': 204}}]}).replaceAll('"__TYPED__"', value);
          File('${directory.path}/busyapi.yaml').writeAsStringSync(manifest);
          // Reopen independently so configuration and saved authored resources
          // own the same policy as the unsaved native capture above.
          final reopened = await BusyProject.open(file.path, engine);
          try {
            final report = await const ContractTestRunner().run(reopened, file.uri.toString(),
              selectedCases: ['typed'], environment: 'local', resolveSecret: (_) async => null);
            expect(report.passed, isTrue, reason: '${report.toJson()}');
          } finally { reopened.close(); }
          final delivered = await Directory.systemTemp.createTemp('busyapi-typed-delivery-');
          addTearDown(() => delivered.delete(recursive: true));
          for (final name in ['api.$format', 'busyapi.yaml', 'input.bin']) {
            File('${delivered.path}/$name').writeAsBytesSync(File('${directory.path}/$name').readAsBytesSync());
          }
          final cli = await Process.run('$testBundle/busyapi', ['test', delivered.path, '--case', 'typed', '--json'],
            environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
          expect(cli.exitCode, 0, reason: '${cli.stdout}\n${cli.stderr}');
          expect((jsonDecode(cli.stdout as String) as Map)['passed'], isTrue);
          expect(file.readAsStringSync(), original);
          expect(buffer.text, contains('Unsaved typed'));
          expect(upload.readAsBytesSync(), [0, 255, 128, 195, 169, 13, 10]);
        });
      }
    }
  }

  for (final version in ['3.2.0', '3.2.1']) {
    for (final format in ['json', 'yaml']) {
      for (final nested in [false, true]) {
        test(
          '$version $format ${nested ? 'nested' : 'ordered'} multipart uses actual HTTP bytes and installed CLI',
          () async {
            final directory = await Directory.systemTemp.createTemp(
              'busyapi-positional-multipart-',
            );
            addTearDown(() => directory.delete(recursive: true));
            final engine = EngineProcess(
              executable: runtimeNode,
              helper: runtimeHelper,
            );
            addTearDown(engine.close);
            final seen = <(String, String, String, List<int>)>[];
            var roundResponse = false;
            final server = await HttpServer.bind(
              InternetAddress.loopbackIPv4,
              0,
            );
            addTearDown(() => server.close(force: true));
            server.listen((request) async {
              final bytes = await request.fold<List<int>>(
                [],
                (all, chunk) => all..addAll(chunk),
              );
              seen.add((
                request.method,
                request.uri.toString(),
                request.headers.contentType.toString(),
                bytes,
              ));
              request.response.headers.set('content-type', _media);
              request.response.add(
                roundResponse
                    ? utf8.encode(_wire('9007199254740992', nested))
                    : bytes,
              );
              await request.response.close();
            });
            final item = nested
                ? {
                    'type': 'array',
                    'minItems': 2,
                    'maxItems': 2,
                    'prefixItems': [
                      {'type': 'boolean', 'const': false},
                      {'type': 'string', 'const': 'café 東京'},
                    ],
                    'items': false,
                  }
                : {'type': 'string', 'maxLength': 0};
            final media = {
              'schema': {
                'type': 'array',
                'minItems': 2,
                'maxItems': 2,
                'prefixItems': [
                  {r'$ref': 'part.yaml#/Part'},
                  item,
                ],
                'items': false,
              },
              'prefixEncoding': [
                {'contentType': 'application/json'},
                if (nested)
                  {
                    'contentType': 'multipart/mixed',
                    'itemEncoding': {'contentType': 'text/plain'},
                  }
                else
                  {'contentType': 'text/plain; charset=utf-8'},
              ],
            };
            final operation = {
              'requestBody': {
                'required': true,
                'content': {'multipart/mixed': media},
              },
              'responses': {
                '200': {
                  'description': 'Echo',
                  'content': {'multipart/mixed': media},
                },
              },
            };
            final source = format == 'json'
                ? jsonEncode({
                    'openapi': version,
                    'info': {'title': 'Original', 'version': 'api-version'},
                    'servers': [
                      {'url': 'http://127.0.0.1:${server.port}'},
                    ],
                    'paths': {
                      '/parts': {'post': operation},
                    },
                  })
                : '\ufeff# Keep source and Unicode 雪\r\n'
                      'openapi: $version\r\n'
                      'info: {title: Original, version: api-version}\r\n'
                      'servers: [{url: "http://127.0.0.1:${server.port}"}]\r\n'
                      'paths:\r\n  /parts:\r\n    post: ${jsonEncode(operation)}\r\n';
            const shared =
                '# Keep exact model and alias ownership\r\n'
                'Part: &part\r\n  type: object\r\n  contentEncoding: base64\r\n  required: [id]\r\n'
                '  properties:\r\n    id: {type: integer, enum: [9007199254740993.00]}\r\n'
                '  additionalProperties: false\r\nMirror: *part\r\n';
            final file = File('${directory.path}/api.$format');
            await file.writeAsString(source);
            final model = File('${directory.path}/part.yaml');
            await model.writeAsString(shared);
            final project = await BusyProject.open(file.path, engine);
            addTearDown(project.close);
            final buffer = await project.buffer(file.uri.toString());
            project.store.replace(
              buffer.id,
              buffer.text.replaceFirst('Original', 'Unsaved'),
            );
            final checked = await project.check(buffer.id);
            expect(checked['complete'], isTrue);
            expect(
              (checked['findings'] as List).where(
                (f) => f['severity'] == 'error',
              ),
              isEmpty,
            );
            final plan = await project.prepareRequest(
              buffer.id,
              resource: buffer.id,
              pointer: '/paths/~1parts/post',
            );
            addTearDown(plan.close);
            final originalBytes = await file.readAsBytes();
            for (final (value, responseRounded) in [
              ('9007199254740993.00', false),
              ('9007199254740992', false),
              ('9007199254740993.00', true),
            ]) {
              roundResponse = responseRounded;
              final wire = _wire(value, nested);
              final result = await const ContractRequestExecutor().execute(
                plan,
                OperationRequestDraft(
                  planIdentity: plan.identity,
                  body: RequestBodyDraft.raw(mediaType: _media, text: wire),
                ),
                resolveSecret: (_) async => throw StateError('No credentials'),
              );
              try {
                final validInput = value == '9007199254740993.00';
                expect(
                  result.outgoing.complete,
                  isTrue,
                  reason: '${result.outgoing.findings}',
                );
                expect(
                  result.received.complete,
                  isTrue,
                  reason: '${result.received.findings}',
                );
                expect(result.outgoing.valid, validInput);
                expect(result.received.valid, validInput && !responseRounded);
                expect(result.conforming, validInput && !responseRounded);
                expect((seen.last.$1, seen.last.$2), ('POST', '/parts'));
                expect(seen.last.$3, _media);
                expect(seen.last.$4, utf8.encode(wire));
                final response = responseRounded
                    ? utf8.encode(_wire('9007199254740992', nested))
                    : utf8.encode(wire);
                expect(
                  await File(result.response.bodyFile).readAsBytes(),
                  response,
                );
                expect(await result.response.decodedBytes(), response);
              } finally {
                await result.close();
              }
            }
            roundResponse = false;
            final cases = [
              for (final valid in [true, false])
                {
                  'name': valid ? 'exact' : 'rounded',
                  'operation': {'method': 'post', 'path': '/parts'},
                  'body': {
                    'mediaType': _media,
                    'value': _wire(
                      valid ? '9007199254740993.00' : '9007199254740992',
                      nested,
                    ),
                  },
                  'expect': {'status': 200},
                },
            ];
            await File('${directory.path}/busyapi.yaml').writeAsString(
              jsonEncode({
                'version': 1,
                'roots': [
                  {'name': 'api', 'path': 'api.$format'},
                ],
                'tests': cases,
              }),
            );
            final cli = await Process.run(
              '$testBundle/busyapi',
              [
                'test',
                directory.path,
                '--case',
                'exact',
                '--case',
                'rounded',
                '--json',
              ],
              environment: const {'PATH': '', 'LANG': 'C.UTF-8'},
              includeParentEnvironment: false,
            );
            expect(cli.exitCode, 1, reason: '${cli.stdout}\n${cli.stderr}');
            final report = jsonDecode(cli.stdout as String) as Map;
            expect(report['complete'], isTrue, reason: '${cli.stdout}');
            expect((report['cases'] as List).map((c) => c['passed']), [
              true,
              false,
            ]);
            expect(seen.length, 5);
            for (final (index, value) in cases.indexed) {
              expect(
                (seen[index + 3].$1, seen[index + 3].$2),
                ('POST', '/parts'),
              );
              expect(seen[index + 3].$3, _media);
              expect(
                seen[index + 3].$4,
                utf8.encode((value['body'] as Map)['value'] as String),
              );
            }
            final cancellation = RunCancellation()..cancel();
            final draft = OperationRequestDraft(
              planIdentity: plan.identity,
              body: RequestBodyDraft.raw(
                mediaType: _media,
                text: _wire('9007199254740993.00', nested),
              ),
            );
            await expectLater(
              const ContractRequestExecutor().execute(
                plan,
                draft,
                resolveSecret: (_) async => null,
                cancellation: cancellation,
              ),
              throwsA(
                isA<CoreFailure>().having((f) => f.code, 'code', 'cancelled'),
              ),
            );
            project.store.replace(
              buffer.id,
              buffer.text.replaceFirst('Unsaved', 'Stale'),
            );
            await expectLater(
              const ContractRequestExecutor().execute(
                plan,
                draft,
                resolveSecret: (_) async => null,
              ),
              throwsA(
                isA<CoreFailure>().having(
                  (f) => f.code,
                  'code',
                  'request.draft.stale',
                ),
              ),
            );
            expect(seen.length, 5);
            expect(await file.readAsBytes(), originalBytes);
            expect(await model.readAsString(), shared);
            expect(buffer.text, contains('Stale'));
          },
        );
      }
    }
  }
}
