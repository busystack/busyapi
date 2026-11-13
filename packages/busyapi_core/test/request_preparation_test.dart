import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

class _PreparationEngine extends EngineProcess {
  _PreparationEngine() : super(executable: runtimeNode, helper: runtimeHelper);
  final calls = <(String, int)>[];
  @override
  Future<Map<String, dynamic>> request(
    String method,
    Map<String, Object?> params, {
    String? requestId,
  }) {
    calls.add((method, utf8.encode(jsonEncode(params)).length));
    return super.request(method, params, requestId: requestId);
  }
}

void main() {
  test('Preview and repeated Send share one immutable secret-free input preparation', () async {
    final directory = await Directory.systemTemp.createTemp(
      'busyapi-preparation-',
    );
    addTearDown(() => directory.delete(recursive: true));
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final seen = <(String?, String, List<int>)>[];
    server.listen((request) async {
      seen.add((
        request.headers.value('x-key'),
        request.uri.query,
        await request.fold<List<int>>(
          [],
          (bytes, chunk) => bytes..addAll(chunk),
        ),
      ));
      request.response.statusCode = 204;
      await request.response.close();
    });
    final source = File('${directory.path}/api.json');
    await source.writeAsString(
      jsonEncode({
        'openapi': '3.2.1',
        'info': {'title': 'Prepared', 'version': '1'},
        'servers': [
          {'url': 'http://127.0.0.1:${server.port}'},
        ],
        'components': {
          'securitySchemes': {
            'key': {'type': 'apiKey', 'in': 'header', 'name': 'X-Key'},
          },
        },
        'paths': {
          '/p': {
            'post': {
              'security': [
                {'key': <String>[]},
              ],
              'parameters': [
                {
                  'name': 'n',
                  'in': 'query',
                  'content': {
                    'application/json': {
                      'schema': {'type': 'number'},
                    },
                  },
                },
              ],
              'requestBody': {
                'content': {
                  'application/x-www-form-urlencoded': {
                    'encoding': {
                      'word': {'contentType': 'text/plain; charset=iso-8859-1'},
                    },
                    'schema': {
                      'type': 'object',
                      'properties': {
                        'name': {'type': 'string'},
                        'word': {'type': 'string'},
                      },
                    },
                  },
                },
              },
              'responses': {
                '204': {'description': 'Empty'},
              },
            },
          },
        },
      }),
    );
    await File('${directory.path}/busyapi.yaml').writeAsString(
      'version: 1\nroots: [{name: api, path: api.json}]\nenvironments: {local: {authentication: {alternative: 0, schemes: {key: {secretRef: 123e4567-e89b-42d3-a456-426614174000}}}}}\n',
    );
    final engine = _PreparationEngine();
    addTearDown(engine.close);
    final project = await BusyProject.open(directory.path, engine);
    addTearDown(project.close);
    final plan = await project.prepareRequest(
      source.uri.toString(),
      resource: source.uri.toString(),
      pointer: '/paths/~1p/post',
    );
    addTearDown(plan.close);
    final parameters = {
      OperationRequestDraft.parameterKey('query', 'n'): const RequestValue.json(
        '9007199254740993.00',
      ),
    };
    final fields = [
      const RequestFormField('name', 'a+b &雪'),
      const RequestFormField('word', 'café'),
    ];
    final draft = OperationRequestDraft(
      planIdentity: plan.identity,
      environment: 'local',
      securityAlternative: 0,
      parameters: parameters,
      body: RequestBodyDraft.form(fields),
    );
    engine.calls.clear();
    const builder = ContractRequestBuilder();
    final inputs = await builder.prepareInputs(plan, draft);
    addTearDown(inputs.close);
    expect(
      engine.calls.where((call) => call.$1 == 'requestInputPreparation'),
      hasLength(1),
    );
    expect(
      engine.calls.where(
        (call) => [
          'requestFormBytes',
          'requestFormDataValues',
          'requestFormMediaTypes',
          'requestFormContentValue',
          'requestParameterValues',
          'requestContentParameters',
        ].contains(call.$1),
      ),
      isEmpty,
    );
    fields.add(const RequestFormField('name', 'later'));
    parameters[OperationRequestDraft.parameterKey('query', 'n')] =
        const RequestValue.json('0');
    expect(() => inputs.draft.parameters.clear(), throwsUnsupportedError);
    expect(() => inputs.draft.body.fields.clear(), throwsUnsupportedError);
    var secretReads = 0;
    final preview = await builder.build(
      plan,
      inputs.draft,
      preparation: inputs,
      previewOnly: true,
      resolveSecret: (_) async {
        ++secretReads;
        return 'should-not-resolve';
      },
    );
    final previewChunk = await preview.body!.open().first;
    expect(() => previewChunk[0] = 0, throwsUnsupportedError);
    final bytes = await preview.body!.open().fold<List<int>>(
      [],
      (all, chunk) => all..addAll(chunk),
    );
    await preview.body!.close();
    expect(secretReads, 0);
    expect(utf8.decode(bytes), 'name=a%2Bb+%26%E9%9B%AA&word=caf%E9');
    final runIds = <String>{preview.runId};
    for (final secret in ['first-secret', 'second-secret']) {
      final result = await const ContractRequestExecutor().execute(
        plan,
        inputs.draft,
        preparation: inputs,
        resolveSecret: (_) async {
          ++secretReads;
          return secret;
        },
      );
      try {
        expect(
          result.conforming,
          isTrue,
          reason: '${result.outgoing.findings}',
        );
        runIds.add(result.request.runId);
      } finally {
        await result.close();
      }
    }
    expect(secretReads, 2);
    expect(runIds, hasLength(3));
    expect(seen.map((value) => value.$1), ['first-secret', 'second-secret']);
    for (final value in seen) {
      expect(value.$2, contains('9007199254740993.00'));
      expect(value.$3, bytes);
    }
    expect(
      engine.calls.where((call) => call.$1 == 'requestInputPreparation'),
      hasLength(1),
    );
    final sibling = await project.prepareRequest(
      source.uri.toString(),
      resource: source.uri.toString(),
      pointer: '/paths/~1p/post',
    );
    addTearDown(sibling.close);
    expect(sibling.identity, plan.identity);
    final parallel = await Future.wait([
      builder.prepareInputs(plan, inputs.draft),
      builder.prepareInputs(sibling, inputs.draft),
    ]);
    for (final prepared in parallel) {
      await prepared.close();
    }
  });

  test('unchanged draft reacquires changed selected file bytes and keeps existing preview leases exact', () async {
    final directory = await Directory.systemTemp.createTemp(
      'busyapi-prepared-file-',
    );
    addTearDown(() => directory.delete(recursive: true));
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final seen = <List<int>>[];
    server.listen((request) async {
      seen.add(
        await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)),
      );
      request.response.statusCode = 204;
      await request.response.close();
    });
    final source = File('${directory.path}/api.json');
    await source.writeAsString(
      jsonEncode({
        'openapi': '3.0.4',
        'info': {'title': 'Files', 'version': '1'},
        'servers': [
          {'url': 'http://127.0.0.1:${server.port}'},
        ],
        'paths': {
          '/p': {
            'post': {
              'requestBody': {
                'content': {
                  'application/octet-stream': {
                    'schema': {
                      'type': 'string',
                      'format': 'binary',
                      'minLength': 3,
                      'maxLength': 3,
                    },
                  },
                },
              },
              'responses': {
                '204': {'description': 'Empty'},
              },
            },
          },
        },
      }),
    );
    final file = File('${directory.path}/body.bin');
    await file.writeAsBytes([65, 66, 67]);
    final modified = await file.lastModified();
    final engine = _PreparationEngine();
    addTearDown(engine.close);
    final project = await BusyProject.open(source.path, engine);
    addTearDown(project.close);
    final plan = await project.prepareRequest(
      source.uri.toString(),
      resource: source.uri.toString(),
      pointer: '/paths/~1p/post',
    );
    addTearDown(plan.close);
    const builder = ContractRequestBuilder();
    final inputs = await builder.prepareInputs(
      plan,
      OperationRequestDraft(
        planIdentity: plan.identity,
        body: RequestBodyDraft.binaryFile(
          mediaType: 'application/octet-stream',
          file: file.path,
        ),
      ),
      materializeBody: true,
    );
    addTearDown(inputs.close);
    final preview = await builder.build(
      plan,
      inputs.draft,
      preparation: inputs,
      previewOnly: true,
      resolveSecret: (_) async => null,
    );
    await file.writeAsBytes([88, 89, 90]);
    await file.setLastModified(modified);
    final result = await const ContractRequestExecutor().execute(
      plan,
      inputs.draft,
      preparation: inputs,
      resolveSecret: (_) async => null,
    );
    try {
      expect(result.conforming, isTrue, reason: '${result.outgoing.findings}');
      expect(seen.single, [88, 89, 90]);
    } finally {
      await result.close();
    }
    await inputs.close();
    expect(
      await preview.body!.open().fold<List<int>>(
        [],
        (all, chunk) => all..addAll(chunk),
      ),
      [65, 66, 67],
    );
    await preview.body!.close();
  });
}
