import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  test('Swagger flat constraints, repeated fields and approved file bytes share generated conformance', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-swagger-multipart-');
    addTearDown(() => directory.delete(recursive: true));
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final seen = <List<int>>[];
    server.listen((request) async {
      seen.add(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)));
      request.response.statusCode = 204;
      await request.response.close();
    });
    final file = File('${directory.path}/api.yaml')..writeAsStringSync('''swagger: '2.0'
info: {title: Flat multipart, version: original}
host: 127.0.0.1:${server.port}
schemes: [http]
consumes: [multipart/form-data]
paths:
  /files:
    post:
      parameters:
        - {in: formData, name: n, required: true, type: integer, enum: [9007199254740993.00]}
        - {in: formData, name: tag, type: array, collectionFormat: multi, items: {type: string}}
        - {in: formData, name: asset, required: true, type: file}
      responses: {'204': {description: Empty}}
''');
    final upload = File('${directory.path}/input.bin')..writeAsBytesSync([0, 255, 128]);
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final project = await BusyProject.open(file.path, engine);
    addTearDown(project.close);
    final plan = await project.prepareRequest(file.uri.toString(), resource: file.uri.toString(), pointer: '/paths/~1files/post');
    addTearDown(plan.close);
    OperationRequestDraft draft(String number) => OperationRequestDraft(planIdentity: plan.identity,
      body: RequestBodyDraft.multipart([
        RequestFormField('n', number), const RequestFormField('tag', 'first'), const RequestFormField('tag', '雪'),
      ], [MultipartFileValue(name: 'asset', path: upload.path, filename: 'input.bin')],
        mediaType: 'multipart/form-data; boundary=Swagger'));
    final result = await const ContractRequestExecutor().execute(plan, draft('9007199254740993.00'), resolveSecret: (_) async => null);
    try { expect(result.conforming, isTrue, reason: '${result.outgoing.findings}'); }
    finally { await result.close(); }
    expect(seen.single, [
      ...utf8.encode('--Swagger\r\nContent-Disposition: form-data; name="n"\r\n\r\n9007199254740993.00\r\n'
        '--Swagger\r\nContent-Disposition: form-data; name="tag"\r\n\r\nfirst\r\n'
        '--Swagger\r\nContent-Disposition: form-data; name="tag"\r\n\r\n雪\r\n'
        '--Swagger\r\nContent-Disposition: form-data; name="asset"; filename="input.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'),
      0, 255, 128, ...utf8.encode('\r\n--Swagger--\r\n'),
    ]);
    await expectLater(const ContractRequestExecutor().execute(plan, draft('9007199254740992'), resolveSecret: (_) async => null),
      throwsA(isA<CoreFailure>().having((failure) => failure.code, 'code', 'request.multipart.conformance')));
    expect(seen.length, 1);
    expect(upload.readAsBytesSync(), [0, 255, 128]);
  });
  for (final version in ['2.0', '3.0.0', '3.0.1', '3.0.2', '3.0.3', '3.0.4', '3.1.0', '3.1.1', '3.1.2', '3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test(
        '$version $format multipart preparation and raw framing retain wire ownership',
        () async {
          final directory = await Directory.systemTemp.createTemp(
            'busyapi-framing-',
          );
          addTearDown(() => directory.delete(recursive: true));
          final seen = <(String, String, String, List<int>)>[];
          final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
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
            request.response.statusCode = 204;
            await request.response.close();
          });
          final legacy = version == '2.0';
          final value = <String, Object?>{
            if (legacy) 'swagger': version else 'openapi': version,
            'info': {'title': 'Keep 雪', 'version': 'unchanged'},
            if (legacy) ...{
              'host': '127.0.0.1:${server.port}',
              'schemes': ['http'],
              'consumes': ['multipart/form-data'],
            } else
              'servers': [
                {'url': 'http://127.0.0.1:${server.port}'},
              ],
            'paths': {
              '/parts': {
                'post': {
                  if (legacy)
                    'parameters': [
                      {
                        'in': 'formData',
                        'name': 'value',
                        'type': 'string',
                        'allowEmptyValue': true,
                      },
                    ]
                  else
                    'requestBody': {
                      'content': {
                        'multipart/form-data': {
                          'schema': {
                            'type': 'object',
                            'properties': {
                              'value': {'type': 'string'},
                            },
                          },
                        },
                      },
                    },
                  'responses': {
                    '204': {'description': 'Keep response'},
                  },
                },
              },
            },
          };
          final original = format == 'json'
              ? '${const JsonEncoder.withIndent('  ').convert(value)}\n'
              : '''# Keep exact YAML layout and 雪\r
${legacy ? "swagger: '2.0'\r\nhost: 127.0.0.1:${server.port}\r\nschemes: [http]\r\nconsumes: [multipart/form-data]" : "openapi: $version\r\nservers: [{url: 'http://127.0.0.1:${server.port}'}]"}\r
info: {title: Keep 雪, version: unchanged}\r
paths:\r
  /parts:\r
    post:\r
${legacy ? "      parameters: [{in: formData, name: value, type: string, allowEmptyValue: true}]" : "      requestBody:\r\n        content:\r\n          multipart/form-data:\r\n            schema: {type: object, properties: {value: {type: string}}}"}\r
      responses: {'204': {description: Keep response}}\r
''';
          final file = File('${directory.path}/api.$format');
          await file.writeAsString(original);
          final engine = EngineProcess(
            executable: runtimeNode,
            helper: runtimeHelper,
          );
          addTearDown(engine.close);
          final project = await BusyProject.open(file.path, engine);
          addTearDown(project.close);
          final checked = await project.check(file.uri.toString());
          expect(checked['complete'], isTrue, reason: '$checked');
          final operation =
              (checked['projection']['operations'] as List).single as Map;
          final plan = await project.prepareRequest(
            file.uri.toString(),
            resource: operation['resource'] as String,
            pointer: operation['pointer'] as String,
            occurrence: operation['occurrence'] as String,
          );
          addTearDown(plan.close);
          var dispatched = 0;
          Future<ContractRequestResult> send(
            RequestBodyDraft body, {
            RunCancellation? cancellation,
          }) async {
            final result = await const ContractRequestExecutor().execute(
              plan,
              OperationRequestDraft(planIdentity: plan.identity, body: body),
              resolveSecret: (_) async => null,
              cancellation: cancellation,
              onRequestDispatched: () => dispatched++,
            );
            addTearDown(result.close);
            return result;
          }

          await expectLater(
            send(const RequestBodyDraft.multipart([], [])),
            throwsA(
              isA<CoreFailure>().having(
                (failure) => failure.code,
                'code',
                'request.multipart.empty',
              ),
            ),
          );
          expect(dispatched, 0);
          expect(seen, isEmpty);
          final positive = await send(
            const RequestBodyDraft.multipart([
              RequestFormField('value', ''),
            ], []),
          );
          expect(positive.outgoing.complete, isTrue);
          expect(
            positive.outgoing.valid,
            isTrue,
            reason: '${positive.outgoing.findings}',
          );
          expect(positive.received.valid, isTrue);
          final first = seen.single;
          final boundary = ContentType.parse(first.$3).parameters['boundary']!;
          expect(first.$1, 'POST');
          expect(first.$2, '/parts');
          expect(
            first.$4,
            utf8.encode(
              '--$boundary\r\nContent-Disposition: form-data; name="value"\r\n${legacy ? '' : 'Content-Type: text/plain\r\n'}\r\n\r\n--$boundary--\r\n',
            ),
          );
          final fixed = await send(const RequestBodyDraft.multipart([
            RequestFormField('value', ''),
          ], [], mediaType: 'multipart/form-data; boundary=TypedBoundary'));
          expect(fixed.conforming, isTrue);
          expect(seen.last.$3, 'multipart/form-data; boundary=TypedBoundary');
          expect(seen.last.$4, utf8.encode(
            '--TypedBoundary\r\nContent-Disposition: form-data; name="value"\r\n${legacy ? '' : 'Content-Type: text/plain\r\n'}\r\n\r\n--TypedBoundary--\r\n'));
          await expectLater(send(const RequestBodyDraft.multipart([
            RequestFormField('value', 'before\r\n--TypedBoundary-collision'),
          ], [], mediaType: 'multipart/form-data; boundary=TypedBoundary')),
            throwsA(isA<CoreFailure>().having((f) => f.code, 'code', 'runtime.form.syntax')));
          for (final wire in [
            '--Fixture--\r\n',
            '--Fixture\r\nContent-Disposition: form-data; name="value"\r\n\r\nbefore\r\n--Fixture-is-data\r\nafter\r\n--Fixture--\r\n',
          ]) {
            final result = await send(
              RequestBodyDraft.raw(
                text: wire,
                mediaType: 'multipart/form-data; boundary=Fixture',
              ),
            );
            expect(result.outgoing.complete, isTrue);
            expect(result.outgoing.valid, isFalse);
            expect(
              result.outgoing.findings.any(
                (finding) => finding['code'] == 'runtime.body.syntax',
              ),
              isTrue,
              reason: '${result.outgoing.findings}',
            );
            expect(result.received.valid, isTrue);
            expect(seen.last.$4, utf8.encode(wire));
          }
          final cancellation = RunCancellation()..cancel();
          await expectLater(
            send(
              const RequestBodyDraft.multipart([], []),
              cancellation: cancellation,
            ),
            throwsA(
              isA<CoreFailure>().having(
                (failure) => failure.code,
                'code',
                'cancelled',
              ),
            ),
          );
          expect(dispatched, 4);
          expect(seen, hasLength(4));
          expect(await file.readAsString(), original);
          expect((await project.buffer(file.uri.toString())).text, original);
        },
      );
    }
  }
  test(
    'named literal and typed inputs share exact MIME construction',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'busyapi-shared-multipart-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/api.yaml')
        ..writeAsStringSync('''openapi: 3.2.1
info: {title: Shared construction, version: '1'}
servers: [{url: 'http://127.0.0.1:1'}]
paths:
  /parts:
    post:
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              required: [label, count]
              properties: {label: {type: string}, count: {type: integer}}
      responses: {'204': {description: OK}}
''');
      final engine = EngineProcess(
        executable: runtimeNode,
        helper: runtimeHelper,
      );
      addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine);
      addTearDown(project.close);
      final plan = await project.prepareRequest(
        file.uri.toString(),
        resource: file.uri.toString(),
        pointer: '/paths/~1parts/post',
      );
      addTearDown(plan.close);
      final bodies = <List<int>>[];
      for (final draft in [
        const RequestBodyDraft.multipart(
          [
            RequestFormField('label', 'snow 雪'),
            RequestFormField('count', '9007199254740993'),
          ],
          [],
          mediaType: 'multipart/form-data; boundary=Shared',
        ),
        const RequestBodyDraft.multipartValue(
          json: '{"label":"snow 雪","count":9007199254740993}',
          mediaType: 'multipart/form-data; boundary=Shared',
        ),
      ]) {
        final request = await const ContractRequestBuilder().build(
          plan,
          OperationRequestDraft(planIdentity: plan.identity, body: draft),
          resolveSecret: (_) async => null,
        );
        final body = request.body!;
        try {
          bodies.add(
            await body.open().fold<List<int>>(
              [],
              (all, chunk) => all..addAll(chunk),
            ),
          );
        } finally {
          await body.close();
        }
      }
      expect(bodies[0], bodies[1]);
      expect(
        bodies[0],
        utf8.encode(
          '--Shared\r\nContent-Disposition: form-data; name="label"\r\nContent-Type: text/plain\r\n\r\nsnow 雪\r\n'
          '--Shared\r\nContent-Disposition: form-data; name="count"\r\nContent-Type: text/plain\r\n\r\n9007199254740993\r\n--Shared--\r\n',
        ),
      );
    },
  );

}
