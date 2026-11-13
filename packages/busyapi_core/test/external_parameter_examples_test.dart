import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['3.0.4', '3.1.2', '3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('$version $format captured external parameter selection sends its actual query representation', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-external-parameter-');
        addTearDown(() => directory.delete(recursive: true));
        final seen = <String>[];
        final seenHeaders = <List<int>>[];
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        server.listen((request) async {
          seen.add(request.uri.toString());
          seenHeaders.add((request.headers.value('X-Json') ?? '').codeUnits);
          await request.drain<void>();
          // Exercise inbound Latin1 fields directly; the SDK's response writer
          // shares the ASCII-only outbound Header boundary checked below.
          final socket = await request.response.detachSocket(writeHeaders: false);
          socket.add([
            ...ascii.encode('HTTP/1.1 204 No Content\r\nConnection: close\r\nX-Cafe: '),
            99, 97, 102, 233,
            ...ascii.encode('\r\nContent-Length: 0\r\n\r\n'),
          ]);
          await socket.close();
        });
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final file = File('${directory.path}/api.$format'), query = File('${directory.path}/query.bin'), header = File('${directory.path}/header.bin');
        final jsonHeader = File('${directory.path}/json-header.bin');
        await query.writeAsString('q=%E9%9B%AA');
        await header.writeAsBytes([99, 97, 102, 233]);
        await jsonHeader.writeAsBytes(utf8.encode('"雪"'));
        final paths = {'/p': {'get': {
          'parameters': [{'name': 'q', 'in': 'query', 'schema': {'type': 'string', 'enum': ['雪']},
            'examples': {'Captured': {'externalValue': 'query.bin'}}},
            {'name': 'X-Json', 'in': 'header', 'content': {'application/json': {'schema': {'type': 'string', 'enum': ['雪']}}},
              'examples': {'Captured': {'externalValue': 'json-header.bin'}}}],
          'responses': {'204': {'description': 'No content', 'headers': {'X-Cafe': {
            'content': {'text/plain; charset=iso-8859-1': {'schema': {'type': 'string', 'enum': ['café']}}},
            'examples': {'Captured': {'externalValue': 'header.bin'}},
          }}}},
        }}};
        final original = format == 'yaml'
            ? 'openapi: $version\r\ninfo: {title: External, version: business}\r\n'
                'servers: [{url: "http://127.0.0.1:${server.port}"}]\r\npaths: ${jsonEncode(paths)}\r\n'
            : jsonEncode({'openapi': version, 'info': {'title': 'External', 'version': 'business'},
                'servers': [{'url': 'http://127.0.0.1:${server.port}'}], 'paths': paths});
        await file.writeAsString(original);
        final project = await BusyProject.open(file.path, engine);
        addTearDown(project.close);
        final root = file.uri.toString(), buffer = await project.buffer(file.uri.toString());
        project.store.replace(root, original.replaceFirst('External', 'Unsaved external 雪'));
        final checked = await project.check(root);
        expect(checked['complete'], true, reason: '$checked');
        final examples = checked['categories']['openapi']['schema']['serializedExamples'] as List;
        expect(examples, hasLength(3));
        expect(examples.every((value) => value['complete'] == true && value['valid'] == true), true);
        final plan = await project.prepareRequest(root, resource: root, pointer: '/paths/~1p/get');
        addTearDown(plan.close);
        final parameter = (plan.result['parameters'] as List).first as Map,
            example = (parameter['examples'] as List).single as Map;
        final headerParameter = (plan.result['parameters'] as List).last as Map,
            headerExample = (headerParameter['examples'] as List).single as Map;
        expect(example['raw'], 'q=%E9%9B%AA');
        expect(example['conversionError'], isNull);
        expect((headerExample['raw'] as String).codeUnits, utf8.encode('"雪"'));
        await expectLater(const ContractRequestExecutor().execute(plan,
            OperationRequestDraft(planIdentity: plan.identity, parameters: {
              OperationRequestDraft.parameterKey('query', 'q'): RequestValue.serialized(example['raw'] as String),
              OperationRequestDraft.parameterKey('header', 'X-Json'): RequestValue.serialized(headerExample['raw'] as String),
            }), resolveSecret: (_) async => null), throwsA(isA<CoreFailure>()
              .having((failure) => failure.code, 'code', 'request.header.octets.unsupported')
              .having((failure) => failure.kind, 'kind', CoreFailureKind.unsupported)));
        expect(seen, isEmpty);
        final result = await const ContractRequestExecutor().execute(plan,
            OperationRequestDraft(planIdentity: plan.identity, parameters: {
              OperationRequestDraft.parameterKey('query', 'q'): RequestValue.serialized(example['raw'] as String),
              OperationRequestDraft.parameterKey('header', 'X-Json'): RequestValue.json(utf8.decode(await jsonHeader.readAsBytes())),
            }), resolveSecret: (_) async => null);
        try {
          expect(result.response.status, 204);
          expect(result.conforming, true, reason: '${result.outgoing.toJson()} ${result.received.toJson()}');
          expect(result.response.headers.singleWhere((field) => field.$1.toLowerCase() == 'x-cafe').$2.codeUnits, [99, 97, 102, 233]);
          expect(await result.response.bytes(), isEmpty);
        } finally {
          await result.close();
        }
        expect(seen, ['/p?q=%E9%9B%AA']);
        expect(seenHeaders, [ascii.encode(r'"\u96ea"')]);
        expect(jsonDecode(ascii.decode(seenHeaders.single)), '雪');
        expect(await query.readAsString(), 'q=%E9%9B%AA');
        expect(await header.readAsBytes(), [99, 97, 102, 233]);
        expect(await jsonHeader.readAsBytes(), utf8.encode('"雪"'));
        expect(await file.readAsString(), original);
        expect(buffer.dirty, true);
      });
    }
  }
}
