import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['3.0.4', '3.1.2', '3.2.0', '3.2.1']) {
    test('$version captured body examples retain binary/empty bytes, ownership and CLI cases', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-external-body-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      final seen = <List<int>>[];
      const media = 'application/octet-stream';
      const payloadBytes = [0, 255, 128, 13, 10, 0];
      server.listen((request) async {
        expect(request.method, 'POST');expect(request.headers.contentType!.mimeType, media);
        final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));seen.add(bytes);
        request.response.headers.set('content-type', media);request.response.add(bytes);await request.response.close();
      });
      final payload = File('${directory.path}/payload.bin');await payload.writeAsBytes(payloadBytes);
      await File('${directory.path}/empty.bin').writeAsBytes([]);
      final schema = version.startsWith('3.0') ? {'type': 'string', 'format': 'binary'} : {'not': {'type': 'null'}};
      final file = File('${directory.path}/api.yaml');
      final text = '# Keep external body source 雪\r\n${jsonEncode({
        'openapi': version, 'info': {'title': 'External body', 'version': '1'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/echo': {'post': {
          'requestBody': {'required': true, 'content': {media: {'schema': schema,
            'examples': {'Bytes': {'externalValue': 'payload.bin'}, 'Empty': {'externalValue': 'empty.bin'}}}}},
          'responses': {'200': {'description': 'Echo', 'content': {media: {'schema': schema,
            'examples': {'Bytes': {'externalValue': 'payload.bin'}, 'Empty': {'externalValue': 'empty.bin'}}}}}},
        }}},
      })}\r\n';await file.writeAsString(text);
      final manifest = File('${directory.path}/busyapi.yaml');
      final manifestText = jsonEncode({
        'version': 1, 'roots': [{'name': 'api', 'path': 'api.yaml'}],
        'tests': [for (final name in ['Bytes', 'Empty']) {'name': name, 'operation': {'method': 'POST', 'path': '/echo'},
          'body': {'mediaType': media, 'externalExample': name}, 'expect': {'status': 200}}],
      });await manifest.writeAsString(manifestText);
      final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);final root = file.uri.toString();
      final plan = await project.prepareRequest(root, resource: root, pointer: '/paths/~1echo/post');addTearDown(plan.close);
      final selected = plan.captureBodyExample(media, name: 'Bytes');
      expect(selected.byteLength, payloadBytes.length);expect(selected.resource, payload.uri.toString());
      expect(() => plan.captureBodyExample('application/json', name: 'Bytes'), throwsA(isA<CoreFailure>()));
      expect(() => plan.captureBodyExample(media, name: 'Missing'), throwsA(isA<CoreFailure>()));
      for (final name in ['Bytes', 'Empty']) {
        final captured = plan.captureBodyExample(media, name: name);
        final result = await const ContractRequestExecutor().execute(plan,
          OperationRequestDraft(planIdentity: plan.identity, body: RequestBodyDraft.example(captured)), resolveSecret: (_) async => null);
        try { expect(result.conforming, true, reason: '${result.outgoing.findings} ${result.received.findings}');expect(await result.response.bytes(), name == 'Bytes' ? payloadBytes : <int>[]); }
        finally { await result.close(); }
      }
      expect(seen, [payloadBytes, <int>[]]);
      final mockPlan = await project.prepareMock(root);addTearDown(mockPlan.close);
      await payload.writeAsBytes([1, 2]);
      await expectLater(mockPlan.start(nodeExecutable: runtimeNode, helper: '$testBundle/libexec/busyapi/mock-server.cjs'),
        throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'mock.stale')));
      await payload.writeAsBytes(payloadBytes);
      final mock = await mockPlan.start(nodeExecutable: runtimeNode, helper: '$testBundle/libexec/busyapi/mock-server.cjs');addTearDown(mock.stop);
      expect(mock.nativeResponseValidation.version, '5');expect(mock.nativeParameterValidation.version, '6');
      final client = HttpClient();addTearDown(() => client.close(force: true));
      for (final name in ['Bytes', 'Empty']) {
        final request = await client.postUrl(mock.baseUri.resolve('/echo'));
        request.headers.set('content-type', media);request.contentLength = payloadBytes.length;
        request.headers.set('prefer', 'code=200,example=$name');request.add(payloadBytes);
        final response = await request.close();expect(response.statusCode, 200);
        expect(response.headers.value('busyapi-response-validation-complete'), 'true');
        final bytes = await response.fold<List<int>>([], (all, chunk) => all..addAll(chunk));
        expect(bytes, name == 'Bytes' ? payloadBytes : <int>[]);
      }
      await mock.stop();
      final replacement = await project.prepareRequest(root, resource: root, pointer: '/paths/~1echo/post');addTearDown(replacement.close);
      await expectLater(const ContractRequestBuilder().build(replacement,
        OperationRequestDraft(planIdentity: replacement.identity, body: RequestBodyDraft.example(selected)), resolveSecret: (_) async => null),
        throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'request.example.stale')));
      final restored = replacement.restoreBodyExample(selected);expect(restored, isNotNull);
      expect(await replacement.bodyExampleBytes(restored!), payloadBytes);
      final token = RunCancellation()..cancel();
      await expectLater(plan.bodyExampleBytes(selected, cancellation: token), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
      await payload.writeAsBytes([1, 2]);
      await expectLater(plan.bodyExampleBytes(selected), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'runtime.request.example.stale')));
      expect(seen, hasLength(2));await payload.writeAsBytes(payloadBytes);
      final cli = await Process.run('$testBundle/busyapi', ['test', directory.path, '--case', 'Bytes', '--case', 'Empty', '--json'], environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');expect(seen, [payloadBytes, <int>[], payloadBytes, <int>[]]);
      final ambiguous = jsonDecode(manifestText) as Map;
      (ambiguous['tests'][0]['body'] as Map)['value'] = null;
      await manifest.writeAsString(jsonEncode(ambiguous));
      final rejected = await Process.run('$testBundle/busyapi', ['test', directory.path, '--case', 'Bytes', '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(rejected.exitCode, isNot(0));expect(seen, hasLength(4));await manifest.writeAsString(manifestText);
      await payload.delete();
      final unavailable = await Process.run('$testBundle/busyapi', ['test', directory.path, '--case', 'Bytes', '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(unavailable.exitCode, 2, reason: '${unavailable.stdout} ${unavailable.stderr}');
      expect(seen, hasLength(4));await payload.writeAsBytes(payloadBytes);
      expect(await file.readAsString(), text);
      project.store.replace(root, text.replaceFirst('External body', 'Edited body'));
      expect(() => plan.captureBodyExample(media, name: 'Bytes'), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'request.draft.stale')));
    });
  }
}
