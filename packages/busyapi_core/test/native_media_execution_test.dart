import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

Future<
  ({
    BusyProject project,
    OperationRequestPlan plan,
    File source,
    String original,
  })
>
openMedia(
  Directory temp,
  HttpServer server,
  String version,
  String format,
  Map<String, Object?> media, {
  Map<String, Object?> headers = const {},
  Map<String, Object?> schemas = const {},
  String contentType = 'text/plain',
  List<Map<String, Object?>> parameters = const [],
  EngineProcess? engineOverride,
}) async {
  final legacy = version == '2.0';
  final operation = <String, Object?>{
    if (!legacy && parameters.isNotEmpty) 'parameters': parameters,
    if (legacy)
      'parameters': [
        {'in': 'body', 'name': 'payload', 'schema': media['schema']},
      ]
    else
      'requestBody': {
        'content': {contentType: media},
      },
    'responses': {
      '200': {
        'description': 'ok',
        if (legacy)
          'schema': media['schema']
        else
          'content': {contentType: media},
        if (headers.isNotEmpty) 'headers': headers,
      },
    },
  };
  final value = {
    legacy ? 'swagger' : 'openapi': version,
    'info': {'title': 'Native media', 'version': 'api-version'},
    if (legacy) ...{
      'host': '127.0.0.1:${server.port}',
      'basePath': '/v1',
      'schemes': ['http'],
      'consumes': [contentType],
      'produces': [contentType],
      'definitions': schemas,
    } else ...{
      'servers': [
        {'url': 'http://127.0.0.1:${server.port}/v1'},
      ],
      'components': {'schemas': schemas},
    },
    'paths': {
      '/data': {'post': operation},
    },
    'x-exact': 'EXACT_VALUE',
  };
  // Flow JSON within block YAML keeps this fixture's exact numeric tokens in
  // both formats, including the numeric extension unrelated to the edit/run.
  final encoded = jsonEncode(value)
      .replaceAll('"EXACT_VALUE"', '9007199254740993.00');
  final original = format == 'json' ? encoded : '# Keep 雪😀\r\n${encoded}\r\n';
  final source = File('${temp.path}/api.$format');
  await source.writeAsString(original);
  final engine = engineOverride ?? EngineProcess(executable: runtimeNode, helper: runtimeHelper);
  addTearDown(engine.close);
  final project = await BusyProject.open(source.path, engine);
  addTearDown(project.close);
  await project.buffer(source.uri.toString());
  final checked = await project.check(source.uri.toString());
  expect(checked['complete'], true, reason: '$checked');
  expect(
    (checked['findings'] as List).whereType<Map>().where(
      (f) => f['severity'] == 'error',
    ),
    isEmpty,
  );
  final operationLocation = (checked['projection']['operations'] as List)
      .whereType<Map>()
      .single;
  final plan = await project.prepareRequest(
    source.uri.toString(),
    resource: operationLocation['resource'] as String,
    pointer: operationLocation['pointer'] as String,
    occurrence: operationLocation['occurrence'] as String,
  );
  addTearDown(plan.close);
  return (project: project, plan: plan, source: source, original: original);
}

void main() {
  modeledCharsetJourneys();
  modeledFormJourneys();
  modeledHeaderJourneys();
  for (final version in ['2.0', '3.0.4', '3.1.2', '3.2.1']) {
    for (final contentType in ['application/xml', 'application/linkset', 'application/linkset+json']) {
      test('$version typed $contentType reaches HTTP and original response evaluation', () async {
        final temp = await Directory.systemTemp.createTemp('busyapi-modeled-wire-');
        addTearDown(() => temp.delete(recursive: true));
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        final seen = <List<int>>[];final seenLinks = <String?>[];
        server.listen((request) async {
          final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));
          seen.add(bytes);seenLinks.add(request.headers.value('link'));
          if (version != '2.0') {request.response.headers.add('Link','</one>; rel=next; title="a,b"');request.response.headers.add('Link',"</two>; rel=next; title*=UTF-8'ja'%E9%9B%AA");}
          request.response.headers.set('content-type', contentType);
          request.response.add(bytes);
          await request.response.close();
        });
        final xml = contentType == 'application/xml';
        final fixture = await openMedia(temp, server, version, 'yaml', {
          'schema': xml ? {
            'type': 'object', 'xml': {'name': 'payload'},
            'allOf': [
              {r'$ref': version == '2.0' ? '#/definitions/Base' : '#/components/schemas/Base'},
              {'required': ['value'], 'properties': {'value': {'type': 'number', 'enum': ['EXACT_VALUE']}}},
            ],
          } : {'type': 'object', 'required': ['linkset']},
        }, headers: version == '2.0' ? const {} : {'Link':{'content':{'application/linkset':{'schema':{'type':'object','required':['linkset']}}}}}, contentType: contentType, schemas: {'Base': {'type': 'object', 'required': ['id'], 'properties': {'id': {'type': 'string', 'xml': {'attribute': true}}}}},
          parameters: version == '2.0' ? const [] : [{'in': 'header', 'name': 'Link', 'content': {'application/linkset': {'schema': {'type': 'object', 'required': ['linkset']}}}}]);
        final draft = OperationRequestDraft(planIdentity: fixture.plan.identity,
          parameters: version == '2.0' ? const {} : {'header\u0000Link': const RequestValue.json('{"linkset":[{"next":[{"href":"/next","title":"a,b"}]}]}')},
          body: RequestBodyDraft.modeled(mediaType: contentType, json: xml
            ? '{"id":"a&b","value":9007199254740993}'
            : '{"linkset":[{"next":[{"href":"https://example.org/p","title":"a,b"}]}]}'));
        final result = await const ContractRequestExecutor().execute(fixture.plan, draft,
          resolveSecret: (_) async => null);
        addTearDown(result.close);
        expect(result.outgoing.valid, true, reason: '${result.outgoing.findings}');
        expect(result.received.valid, true, reason: '${result.received.findings}');
        expect(result.outgoing.complete, true);
        expect(result.received.complete, true);
        final wire = utf8.decode(seen.single);
        if (xml) {
          expect(wire, contains('9007199254740993'));
          expect(wire, startsWith('<payload'));
        } else if (contentType == 'application/linkset') {
          expect(wire, '<https://example.org/p>; rel="next"; title="a,b"');
        } else {
          expect(jsonDecode(wire)['linkset'], isA<List>());
        }
        expect(result.received.modeledData, isNotNull);
        expect(result.request.body!.inspectionBytes,seen.single);
        if (version != '2.0') expect(seenLinks.single,'</next>; rel="next"; title="a,b"');
        final cancelled = RunCancellation()..cancel();
        await expectLater(const ContractRequestBuilder().build(fixture.plan, draft,
          resolveSecret: (_) async => null, cancellation: cancelled),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
        expect(seen, hasLength(1));
        final saved = await fixture.plan.planCase('modeled', draft);
        final changes = await fixture.project.applyRefactoring(saved);
        final publication = await PublicationStore('${temp.path}/publication').save(fixture.project,
          [for (final id in changes) fixture.project.store.get(id)]);
        expect(publication.complete, true, reason: '${publication.failed}');
        final coldEngine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(coldEngine.close);
        final cold = await BusyProject.open(temp.path, coldEngine);
        addTearDown(cold.close);
        final reopened = await cold.prepareRequest(fixture.source.uri.toString(), resource: fixture.source.uri.toString(), pointer: '/paths/~1data/post');
        addTearDown(reopened.close);
        final loaded = await ContractTestRunner.reopenCase(reopened, 'modeled', cold.access);
        expect(loaded.body.modeled, true);
        expect(loaded.body.text, draft.body.text);
        expect(loaded.body.mediaType, contentType);
        final replay = await const ContractRequestExecutor().execute(reopened, loaded, resolveSecret: (_) async => null);
        addTearDown(replay.close);
        expect(replay.conforming, true, reason: '${replay.received.findings}');
        expect(seen.last, seen.first);
        final cli = await Process.run('$testBundle/busyapi', ['test', temp.path, '--case', 'modeled', '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout}\n${cli.stderr}');
        expect((jsonDecode(cli.stdout as String) as Map)['cases'][0]['dispatched'], true);
        expect(seen.last, seen.first);
        expect(await fixture.source.readAsString(), fixture.original);
      });
    }
  }

  for (final version in ['2.0', '3.0.0', '3.0.4', '3.1.2', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test(
        '$version $format text body evaluation uses actual UTF-8 request and response bytes',
        () async {
          final temp = await Directory.systemTemp.createTemp(
            'busyapi-native-text-',
          );
          addTearDown(() => temp.delete(recursive: true));
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
            request.response.headers.contentType = ContentType(
              'text',
              'plain',
              charset: 'utf-8',
            );
            request.response.add(bytes);
            await request.response.close();
          });
          final fixture = await openMedia(
            temp,
            server,
            version,
            format,
            {
              'schema': {
                r'$ref': version == '2.0'
                    ? '#/definitions/Value'
                    : '#/components/schemas/Value',
              },
            },
            schemas: {
              'Value': {
                'type': 'string',
                'maxLength': 2,
                'pattern': r'^(雪😀)?$',
              },
            },
          );
          for (final text in ['雪😀', '', 'bad']) {
            final result = await const ContractRequestExecutor().execute(
              fixture.plan,
              OperationRequestDraft(
                planIdentity: fixture.plan.identity,
                body: RequestBodyDraft.raw(mediaType: 'text/plain', text: text),
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
              result.received.complete,
              true,
              reason: '${result.received.findings}',
            );
            expect(result.outgoing.valid, text != 'bad');
            expect(result.received.valid, text != 'bad');
            expect(result.outgoing.coverage['body'], 'selected-media-body');
            expect(result.received.coverage['body'], 'selected-media-body');
            expect(
              (seen.last.$1, seen.last.$2, seen.last.$3),
              (
                'POST',
                '/v1/data',
                text == '雪😀' ? 'text/plain; charset=utf-8' : 'text/plain',
              ),
            );
            expect(seen.last.$4, utf8.encode(text));
            expect(await result.response.decodedBytes(), utf8.encode(text));
            if (text == 'bad') {
              expect(
                result.received.findings.any(
                  (f) =>
                      f['code'] == 'runtime.schema.incompatible' &&
                      (f['schema'] as Map)['resource'] ==
                          fixture.source.uri.toString(),
                ),
                true,
              );
            }
          }
          expect(await fixture.source.readAsString(), fixture.original);
          expect(
            fixture.project.store.get(fixture.source.uri.toString()).text,
            fixture.original,
          );
        },
      );
    }
  }
  for (final version in ['3.0.0', '3.0.4']) {
    test(
      '$version binary file bytes and response enforce native octet bounds through a referenced schema',
      () async {
        final temp = await Directory.systemTemp.createTemp(
          'busyapi-native-binary-',
        );
        addTearDown(() => temp.delete(recursive: true));
        final seen = <List<int>>[];
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        server.listen((request) async {
          final bytes = await request.fold<List<int>>(
            [],
            (all, chunk) => all..addAll(chunk),
          );
          seen.add(bytes);
          request.response.headers.contentType = ContentType.binary;
          request.response.add(bytes);
          await request.response.close();
        });
        final source = File('${temp.path}/api.yaml');
        final original =
            '''# Native binary source
openapi: $version
info: {title: Binary, version: api-version}
servers: [{url: 'http://127.0.0.1:${server.port}'}]
paths:
  /data:
    post:
      requestBody: {content: {application/octet-stream: {schema: {\$ref: 'binary.yaml#/Value'}}}}
      responses: {'200': {description: ok, content: {application/octet-stream: {schema: {\$ref: 'binary.yaml#/Value'}}}}}
''';
        await source.writeAsString(original);
        final shared = File('${temp.path}/binary.yaml');
        const sharedText =
            '# Shared original\nValue: {type: string, format: binary, minLength: 2, maxLength: 4}\n';
        await shared.writeAsString(sharedText);
        final engine = EngineProcess(
          executable: runtimeNode,
          helper: runtimeHelper,
        );
        addTearDown(engine.close);
        final project = await BusyProject.open(source.path, engine);
        addTearDown(project.close);
        final plan = await project.prepareRequest(
          source.uri.toString(),
          resource: source.uri.toString(),
          pointer: '/paths/~1data/post',
        );
        addTearDown(plan.close);
        final upload = File('${temp.path}/upload.bin');
        for (final bytes in [
          [0, 255, 254, 10],
          [255],
          [0, 1, 2, 3, 4],
        ]) {
          await upload.writeAsBytes(bytes);
          final result = await const ContractRequestExecutor().execute(
            plan,
            OperationRequestDraft(
              planIdentity: plan.identity,
              body: RequestBodyDraft.binaryFile(
                mediaType: 'application/octet-stream',
                file: upload.path,
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
            result.received.complete,
            true,
            reason: '${result.received.findings}',
          );
          expect(result.outgoing.valid, bytes.length == 4);
          expect(result.received.valid, bytes.length == 4);
          expect(result.outgoing.coverage['body'], 'selected-media-body');
          expect(result.received.coverage['body'], 'selected-media-body');
          expect(seen.last, bytes);
          expect(await result.response.decodedBytes(), bytes);
        }
        expect(await source.readAsString(), original);
        expect(await shared.readAsString(), sharedText);
      },
    );
  }
  for (final mediaType in [
    'application/jsonl',
    'application/json-seq',
    'text/event-stream',
  ]) {
    test(
      '3.2 $mediaType checks the whole finite body and each item on actual HTTP',
      () async {
        final temp = await Directory.systemTemp.createTemp(
          'busyapi-native-sequence-',
        );
        addTearDown(() => temp.delete(recursive: true));
        final seen = <String>[];
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        server.listen((request) async {
          final body = await utf8.decoder.bind(request).join();
          seen.add(body);
          request.response.headers.set('content-type', mediaType);
          request.response.add(utf8.encode(body));
          await request.response.close();
        });
        final event = mediaType == 'text/event-stream';
        final item = event
            ? '{type: object, required: [data], properties: {data: {type: string, pattern: "^雪"}, retry: {type: integer, minimum: 9007199254740993}}}'
            : '{type: object, required: [id], properties: {id: {type: integer, minimum: 9007199254740993}}}';
        final source = File('${temp.path}/api.yaml');
        final original =
            '''openapi: 3.2.1
info: {title: Sequences, version: api-version}
servers: [{url: 'http://127.0.0.1:${server.port}'}]
paths:
  /data:
    post:
      requestBody: {content: {$mediaType: {schema: {type: array, minItems: 2, maxItems: 2}, itemSchema: {\$ref: '#/components/schemas/Item'}}}}
      responses: {'200': {description: ok, content: {$mediaType: {schema: {type: array, minItems: 2, maxItems: 2}, itemSchema: {\$ref: '#/components/schemas/Item'}}}}}
components: {schemas: {Item: $item}}
''';
        await source.writeAsString(original);
        final engine = EngineProcess(
          executable: runtimeNode,
          helper: runtimeHelper,
        );
        addTearDown(engine.close);
        final project = await BusyProject.open(source.path, engine);
        addTearDown(project.close);
        final plan = await project.prepareRequest(
          source.uri.toString(),
          resource: source.uri.toString(),
          pointer: '/paths/~1data/post',
        );
        addTearDown(plan.close);
        String record(String value) => event
            ? 'data: $value\nretry: 9007199254740993\n\n'
            : mediaType == 'application/jsonl'
            ? '$value\n'
            : '\x1e$value\n';
        final first = record(event ? '雪😀' : '{"id":9007199254740993}');
        for (final tail in [
          record(event ? '雪' : '{"id":9007199254740994}'),
          record(event ? 'bad' : '{"id":9007199254740992}'),
          '',
        ]) {
          final result = await const ContractRequestExecutor().execute(
            plan,
            OperationRequestDraft(
              planIdentity: plan.identity,
              body: RequestBodyDraft.raw(
                mediaType: mediaType,
                text: first + tail,
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
            result.received.complete,
            true,
            reason: '${result.received.findings}',
          );
          final valid =
              tail.isNotEmpty &&
              !tail.contains('bad') &&
              !tail.contains('9007199254740992');
          expect(result.outgoing.valid, valid);
          expect(result.received.valid, valid);
          expect(seen.last, first + tail);
          expect(
            await result.response.decodedBytes(),
            utf8.encode(first + tail),
          );
        }
        expect(await source.readAsString(), original);
      },
    );
  }
  test(
    '3.2 SSE captured bytes remove one BOM and preserve parsed event defaults',
    () async {
      final temp = await Directory.systemTemp.createTemp(
        'busyapi-sse-framing-',
      );
      addTearDown(() => temp.delete(recursive: true));
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final seen = <List<int>>[];
      server.listen((request) async {
        final bytes = await request.fold<List<int>>(
          [],
          (all, chunk) => all..addAll(chunk),
        );
        seen.add(bytes);
        request.response.headers.set(
          'content-type',
          'text/event-stream; charset=iso-8859-1',
        );
        request.response.add(bytes);
        await request.response.close();
      });
      final source = File('${temp.path}/api.yaml');
      final original =
          '''openapi: 3.2.1
info: {title: SSE framing, version: api-version}
servers: [{url: 'http://127.0.0.1:${server.port}'}]
paths:
  /data:
    post:
      requestBody: {content: {text/event-stream: {\$ref: '#/components/mediaTypes/Event'}}}
      responses: {'200': {description: ok, content: {text/event-stream: {\$ref: '#/components/mediaTypes/Event'}}}}
components:
  mediaTypes:
    Event:
      schema: {type: array, maxItems: 1}
      itemSchema: {type: object, required: [data], properties: {data: {type: string, maxLength: 0}, event: {enum: [message]}}}
''';
      await source.writeAsString(original);
      final engine = EngineProcess(
        executable: runtimeNode,
        helper: runtimeHelper,
      );
      addTearDown(engine.close);
      final project = await BusyProject.open(source.path, engine);
      addTearDown(project.close);
      final plan = await project.prepareRequest(
        source.uri.toString(),
        resource: source.uri.toString(),
        pointer: '/paths/~1data/post',
      );
      addTearDown(plan.close);
      final upload = File('${temp.path}/events.bin');
      final specimens = [
        utf8.encode('\ufeff\ufeffdata: hidden\n\n'),
        utf8.encode('event:\ndata:\n\n'),
        [...ascii.encode('data: '), 255, 10, 10],
      ];
      for (var index = 0; index < specimens.length; index++) {
        final bytes = specimens[index];
        await upload.writeAsBytes(bytes);
        final result = await const ContractRequestExecutor().execute(
          plan,
          OperationRequestDraft(
            planIdentity: plan.identity,
            body: RequestBodyDraft.binaryFile(
              mediaType: 'text/event-stream',
              file: upload.path,
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
          result.received.complete,
          true,
          reason: '${result.received.findings}',
        );
        expect(result.outgoing.valid, index != 2);
        expect(result.received.valid, index != 2);
        expect(seen.last, bytes);
        expect(await result.response.decodedBytes(), bytes);
      }
      expect(await source.readAsString(), original);
    },
  );
  test('repeated response media parameters remain source-located unsupported evaluation', () async {
    final temp = await Directory.systemTemp.createTemp(
      'busyapi-media-parameters-',
    );
    addTearDown(() => temp.delete(recursive: true));
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    server.listen((request) async {
      await request.drain<void>();
      request.response.headers.set(
        'content-type',
        'text/plain; profile=a; profile=b',
      );
      request.response.write('x');
      await request.response.close();
    });
    final fixture = await openMedia(temp, server, '3.0.4', 'yaml', {
      'schema': {'type': 'string'},
    });
    final result = await const ContractRequestExecutor().execute(
      fixture.plan,
      OperationRequestDraft(
        planIdentity: fixture.plan.identity,
        body: const RequestBodyDraft.raw(mediaType: 'text/plain', text: 'x'),
      ),
      resolveSecret: (_) async => null,
    );
    addTearDown(result.close);
    expect(result.outgoing.complete, true);
    expect(result.received.complete, false);
    expect(result.received.valid, true);
    expect(result.conforming, false);
    final finding = result.received.findings.singleWhere(
      (f) => f['code'] == 'runtime.response.body.unchecked',
    );
    expect(finding['kind'], 'unsupported');
    expect(
      (finding['schema'] as Map)['resource'],
      fixture.source.uri.toString(),
    );
    expect(await fixture.source.readAsString(), fixture.original);
  });
}

void modeledCharsetJourneys() {
  for (final charset in ['utf-8','utf-16','utf-16le','utf-16be','us-ascii','iso-8859-1']) {
    test('Engine XML $charset bytes survive Core preview, transport and response evaluation', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-xml-charset-');
      addTearDown(() => directory.delete(recursive: true));
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final media = 'application/xml; charset=$charset', seen = <List<int>>[];
      server.listen((request) async {
        final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));seen.add(bytes);
        request.response.headers.set('content-type', media);request.response.add(bytes);await request.response.close();
      });
      final fixture = await openMedia(directory,server,'3.2.1','json',{'schema':{'type':'string','enum':['雪'],'xml':{'name':'value'}}},contentType:media);
      final draft = OperationRequestDraft(planIdentity:fixture.plan.identity,body:RequestBodyDraft.modeled(mediaType:media,json:'"雪"'));
      final preview = await const ContractRequestBuilder().build(fixture.plan,draft,resolveSecret:(_) async=>null,previewOnly:true);
      final previewBytes = await preview.body!.open().fold<List<int>>([], (all, chunk) => all..addAll(chunk));
      final result = await const ContractRequestExecutor().execute(fixture.plan,draft,resolveSecret:(_) async=>null);addTearDown(result.close);
      expect(seen.single,previewBytes);expect(result.conforming,true,reason:'${result.outgoing.findings} ${result.received.findings}');
      expect(result.received.modeledData,'"雪"');expect(await result.response.decodedBytes(),previewBytes);
      if (charset == 'utf-16') expect(previewBytes.take(2),[255,254]);
      if (charset == 'us-ascii' || charset == 'iso-8859-1') expect(previewBytes.every((byte)=>byte<128),true);
      expect(await fixture.source.readAsString(),fixture.original);
    });
  }
  test('saved raw XML retains its mode, declaration and exact Latin-1 bytes after cold reopen', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-raw-xml-case-');addTearDown(() => directory.delete(recursive:true));
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(() => server.close(force:true));
    final seen = <List<int>>[];
    server.listen((request) async {final bytes=await request.fold<List<int>>([], (all,chunk)=>all..addAll(chunk));seen.add(bytes);request.response.headers.set('content-type','application/xml');request.response.add(bytes);await request.response.close();});
    final fixture=await openMedia(directory,server,'3.2.1','yaml',{'schema':{'type':'string','enum':['é'],'xml':{'name':'value'}}},contentType:'application/xml');
    const text='<?xml version="1.0" encoding="ISO-8859-1"?><value>é</value>';
    final draft=OperationRequestDraft(planIdentity:fixture.plan.identity,body:RequestBodyDraft.raw(mediaType:'application/xml',text:text),variables:const {'unused':'kept'},connectTimeout:const Duration(seconds:9));
    final change=await fixture.project.applyRefactoring(await fixture.plan.planCase('raw',draft));
    expect((await PublicationStore('${directory.path}/publication').save(fixture.project,[for(final id in change)fixture.project.store.get(id)])).complete,true);
    final engine=EngineProcess(executable:runtimeNode,helper:runtimeHelper);addTearDown(engine.close);
    final project=await BusyProject.open(directory.path,engine);addTearDown(project.close);
    final plan=await project.prepareRequest(fixture.source.uri.toString(),resource:fixture.source.uri.toString(),pointer:'/paths/~1data/post');addTearDown(plan.close);
    final loaded=await ContractTestRunner.reopenCase(plan,'raw',project.access);
    expect(loaded.body.modeled,false);expect(loaded.body.text,text);expect(loaded.variables,{'unused':'kept'});expect(loaded.connectTimeout,const Duration(seconds:9));
    final result=await const ContractRequestExecutor().execute(plan,loaded,resolveSecret:(_) async=>null);addTearDown(result.close);
    expect(result.conforming,true,reason:'${result.received.findings}');expect(seen.single,latin1.encode(text));expect(result.received.modeledData,'"é"');
    final literal=File('${directory.path}/literal.xml');await literal.writeAsBytes(latin1.encode(text));
    final fileDraft=OperationRequestDraft(planIdentity:plan.identity,body:RequestBodyDraft.approvedFile(mediaType:'application/xml',file:literal.path,access:project.access));
    final fileChange=await project.applyRefactoring(await plan.planCase('file',fileDraft));
    expect((await PublicationStore('${directory.path}/file-publication').save(project,[for(final id in fileChange)project.store.get(id)])).complete,true);
    final filePlan=await project.prepareRequest(fixture.source.uri.toString(),resource:fixture.source.uri.toString(),pointer:'/paths/~1data/post');addTearDown(filePlan.close);
    final fileCase=await ContractTestRunner.reopenCase(filePlan,'file',project.access);
    expect(fileCase.body.kind,RequestBodyKind.binaryFile);expect(fileCase.body.file,literal.path);
    final fileResult=await const ContractRequestExecutor().execute(filePlan,fileCase,resolveSecret:(_) async=>null);addTearDown(fileResult.close);
    expect(fileResult.conforming,true,reason:'${fileResult.outgoing.findings}');expect(seen.last,latin1.encode(text));
    final cli=await Process.run('$testBundle/busyapi',['test',directory.path,'--case','file','--json'],environment:const {'PATH':'','LANG':'C.UTF-8'},includeParentEnvironment:false);
    expect(cli.exitCode,0,reason:'${cli.stdout} ${cli.stderr}');expect(seen,hasLength(3));expect(seen.last,latin1.encode(text));
    expect(await fixture.source.readAsString(),fixture.original);
  });
}

void modeledFormJourneys() {
  test('Core URL-form preparation serializes typed XML/Linkset fields through Engine codecs', () async {
    final directory=await Directory.systemTemp.createTemp('busyapi-modeled-form-');addTearDown(() => directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(() => server.close(force:true));
    final seen=<List<int>>[];
    server.listen((request) async {seen.add(await request.fold<List<int>>([], (all,chunk)=>all..addAll(chunk)));request.response.statusCode=204;await request.response.close();});
    final engine=EngineProcess(executable:runtimeNode,helper:runtimeHelper);addTearDown(engine.close);
    final source=File('${directory.path}/api.json');
    final xml={'type':'object','xml':{'name':'Value'},'required':['n'],'properties':{'n':{'type':'number','enum':['EXACT']}}},link={'type':'object','required':['linkset']};
    final original=jsonEncode({'openapi':'3.2.1','info':{'title':'Form media','version':'1'},'servers':[{'url':'http://127.0.0.1:${server.port}'}],
      'paths':{'/p':{'post':{'requestBody':{'content':{'application/x-www-form-urlencoded':{'schema':{'type':'object','required':['xml','links'],'properties':{'xml':xml,'links':link}},'encoding':{'xml':{'contentType':'application/xml; charset=utf-16be'},'links':{'contentType':'application/linkset'}}}}},'responses':{'204':{'description':'OK'}}}}}}).replaceAll('"EXACT"','9007199254740993');
    await source.writeAsString(original);
    final project=await BusyProject.open(source.path,engine);addTearDown(project.close);
    final plan=await project.prepareRequest(source.uri.toString(),resource:source.uri.toString(),pointer:'/paths/~1p/post');addTearDown(plan.close);
    const data='{"xml":{"n":9007199254740993},"links":{"linkset":[{"next":[{"href":"/p","title":"a,b"}]}]}}';
    final result=await const ContractRequestExecutor().execute(plan,OperationRequestDraft(planIdentity:plan.identity,body:RequestBodyDraft.formValue(json:data)),resolveSecret:(_) async=>null);addTearDown(result.close);
    expect(result.conforming,true,reason:'${result.outgoing.findings}');expect(ascii.decode(seen.single),contains('%00%3C'));expect(ascii.decode(seen.single),contains('links=%3C%2Fp%3E'));
    final rows=OperationRequestDraft(planIdentity:plan.identity,body:RequestBodyDraft.form(const [RequestFormField('xml','<Value><n>9007199254740993</n></Value>'),RequestFormField('links','</p>; rel=next; title="a,b"')]));
    final changes=await project.applyRefactoring(await plan.planCase('rows',rows));
    expect((await PublicationStore('${directory.path}/publication').save(project,[for(final id in changes)project.store.get(id)])).complete,true);
    final reopened=await project.prepareRequest(source.uri.toString(),resource:source.uri.toString(),pointer:'/paths/~1p/post');addTearDown(reopened.close);
    final loaded=await ContractTestRunner.reopenCase(reopened,'rows',project.access);expect(loaded.body.text,isNull);expect(loaded.body.fields.map((field)=>field.value),rows.body.fields.map((field)=>field.value));
    final replay=await const ContractRequestExecutor().execute(reopened,loaded,resolveSecret:(_) async=>null);addTearDown(replay.close);
    expect(replay.conforming,true,reason:'${replay.outgoing.findings}');expect(seen,hasLength(2));
    expect(await source.readAsString(),original);
  });
}

void modeledHeaderJourneys() {
  test('actual custom Link field lines retain captured Header schema evaluation without a parameter draft', () async {
    final directory=await Directory.systemTemp.createTemp('busyapi-actual-link-fields-');addTearDown(() => directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(() => server.close(force:true));
    final fixture=await openMedia(directory,server,'3.2.1','json',{'schema':{'type':'string','xml':{'name':'value'}}},contentType:'application/xml',parameters:[
      {'in':'header','name':'Link','content':{'application/linkset':{'schema':{'type':'object','required':['linkset'],'properties':{'linkset':{'type':'array','minItems':1,'maxItems':1,'items':{'type':'object','properties':{'next':{'type':'array','minItems':2,'maxItems':2}}}}}}}}}
    ]);
    for(final invalid in [false,true]) {
      final draft=OperationRequestDraft(planIdentity:fixture.plan.identity,headers:[
        const RequestHeaderValue('Link','</one>; rel=next; title="a,b"'),
        const RequestHeaderValue('Link',"</two>; rel=next; title*=UTF-8'ja'%E9%9B%AA"),
        if(invalid) const RequestHeaderValue('Link','</three>; rel=next'),
      ]);
      final prepared=await const ContractRequestBuilder().build(fixture.plan,draft,resolveSecret:(_) async=>null);
      final proof=await const ContractRequestExecutor().validateOutgoing(fixture.plan,draft,prepared.runId,preparedHeaders:prepared.headers);
      expect(proof.complete,true);expect(proof.valid,!invalid,reason:'${proof.findings}');
      expect(prepared.headers.where((field)=>field.$1.toLowerCase()=='link'),hasLength(invalid?3:2));
    }
    expect(await fixture.source.readAsString(),fixture.original);
  });
}
