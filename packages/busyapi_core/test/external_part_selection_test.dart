import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  capturedHeaderJourneys();
  for (final version in ['3.0.4', '3.1.2', '3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('$version $format captured multipart bytes use existing generation, cases and CLI', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-part-choice-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
        final seen = <List<int>>[];
        const bytes = [0, 255, 128, 43, 0], media = 'application/octet-stream';
        server.listen((request) async {
          seen.add(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)));
          request.response.headers.set('content-type', media);request.response.add(bytes);await request.response.close();
        });
        final payload = File('${directory.path}/payload.bin');await payload.writeAsBytes(bytes);
        final file = File('${directory.path}/api.$format');
        final schema = version.startsWith('3.0') ? {'type': 'string', 'format': 'binary'} : {'not': {'type': 'null'}, 'maxLength': bytes.length};
        final contract = {'openapi': version, 'info': {'title': 'Approved part bytes', 'version': 'business'},
          'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
          'paths': {'/upload': {'post': {
            'requestBody': {'required': true, 'content': {'multipart/form-data': {
              'schema': {'type': 'object', 'required': ['file'], 'properties': {'file': schema}},
              'encoding': {'file': {'contentType': media}},
            }}},
            'responses': {'200': {'description': 'Receipt', 'content': {media: {'schema': schema,
              'examples': {'Approved': {'externalValue': 'payload.bin'}}}}}},
          }}},
        };
        final source = format == 'yaml' ? '# Retain comments 雪\r\n${jsonEncode(contract)}\r\n' : jsonEncode(contract);
        await file.writeAsString(source);
        await File('${directory.path}/busyapi.yaml').writeAsString(jsonEncode({'version': 1, 'roots': [{'name': 'api', 'path': 'api.$format'}]}));
        final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
        final root = file.uri.toString(), pointer = '/paths/~1upload/post';
        final plan = await project.prepareRequest(root, resource: root, pointer: pointer);addTearDown(plan.close);
        expect(plan.availablePartExamples.single.id, payload.uri.toString());
        final selected = plan.capturePartExample('multipart/form-data', 'file', media, payload.uri.toString());
        expect(selected.byteLength, bytes.length);
        expect(() => plan.capturePartExample('application/json', 'file', media, payload.uri.toString()), throwsA(isA<CoreFailure>()));
        expect(() => plan.capturePartExample('multipart/form-data', 'file', media, Uri.file('${directory.path}/unapproved.bin').toString()), throwsA(isA<CoreFailure>()));
        final draft = OperationRequestDraft(planIdentity: plan.identity, body: RequestBodyDraft.multipart(
            const [], [MultipartFileValue.example(selected)], mediaType: 'multipart/form-data'));
        final run = await const ContractRequestExecutor().execute(plan, draft, resolveSecret: (_) async => null);
        try {
          expect(run.conforming, true, reason: '${run.outgoing.findings} ${run.received.findings}');
          expect(await run.response.bytes(), bytes);
          final wire = String.fromCharCodes(seen.single);
          expect(wire, contains('filename="payload.bin"'));expect(wire, contains(String.fromCharCodes(bytes)));
        } finally { await run.close(); }
        final replacement = await project.prepareRequest(root, resource: root, pointer: pointer);addTearDown(replacement.close);
        expect(replacement.restorePartExample(selected), isNotNull);
        await expectLater(replacement.partExampleBytes(selected, selected.bodyMediaType, selected.part, selected.mediaType),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'request.example.stale')));
        final token = RunCancellation()..cancel();
        await expectLater(plan.partExampleBytes(selected, selected.bodyMediaType, selected.part, selected.mediaType, cancellation: token),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
        await payload.writeAsBytes([1]);
        await expectLater(const ContractRequestBuilder().build(plan, draft, resolveSecret: (_) async => null),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'runtime.request.example.stale')));
        expect(seen, hasLength(1));await payload.writeAsBytes(bytes);
        final changed = await project.applyRefactoring(await plan.planCase('Approved part', draft));
        for (final id in changed) await project.save(project.store.get(id));
        final config = jsonDecode(await File('${directory.path}/busyapi.yaml').readAsString());
        expect(config['tests'][0]['body']['files'][0]['capturedExample'], true);
        expect(config['tests'][0]['body']['files'][0]['path'], 'payload.bin');
        final cold = await BusyProject.open(directory.path, engine);addTearDown(cold.close);
        final reopened = await cold.prepareRequest(root, resource: root, pointer: pointer);addTearDown(reopened.close);
        final loaded = await ContractTestRunner.reopenCase(reopened, 'Approved part', cold.access);
        expect(loaded.body.files.single.capturedExample?.contentIdentity, selected.contentIdentity);
        final replay = await const ContractRequestExecutor().execute(reopened, loaded, resolveSecret: (_) async => null);
        try { expect(replay.conforming, true, reason: '${replay.outgoing.findings}'); } finally { await replay.close(); }
        final cli = await Process.run('$testBundle/busyapi', ['test', directory.path, '--case', 'Approved part', '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');expect(seen, hasLength(3));
        await payload.delete();
        final missing = await Process.run('$testBundle/busyapi', ['test', directory.path, '--case', 'Approved part', '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(missing.exitCode, 2, reason: '${missing.stdout} ${missing.stderr}');expect(seen, hasLength(3));
        expect(await file.readAsString(), source);
      });
    }
  }
}

void capturedHeaderJourneys() {
  for (final version in ['3.0.4', '3.1.2', '3.2.0', '3.2.1']) {
    test('$version MIME Header choices retain captured external bytes through cases and CLI', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-header-choice-');addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      final seen = <List<int>>[];
      server.listen((request) async {seen.add(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)));request.response.statusCode = 204;await request.response.close();});
      const exact = '{"id":9007199254740993.00,"flag":false}', type = 'multipart/mixed';
      final payload = File('${directory.path}/header.bin');await payload.writeAsString(exact);
      final file = File('${directory.path}/api.yaml');
      final source = '# Preserve Header source\r\n${jsonEncode({'openapi': version,
        'info': {'title': 'Header examples', 'version': 'business'}, 'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/parts': {'post': {'requestBody': {'content': {type: {
          'schema': {'type': 'object', 'required': ['value'], 'properties': {'value': {'type': 'string'}}},
          'encoding': {'value': {'contentType': 'text/plain', 'headers': {'X-Meta': {
            'required': true, 'content': {'application/json': {'schema': {'type': 'object', 'required': ['id', 'flag'],
              'properties': {'id': {'type': 'integer', 'enum': ['EXACT']}, 'flag': {'type': 'boolean', 'enum': [false]}}}}},
            'examples': {'Approved': {'externalValue': 'header.bin'}},
          }}}},
        }}}, 'responses': {'204': {'description': 'Empty'}}}}},
      }).replaceAll('"EXACT"', '9007199254740993.00')}\r\n';
      await file.writeAsString(source);
      await File('${directory.path}/busyapi.yaml').writeAsString(jsonEncode({'version': 1, 'roots': [{'name': 'api', 'path': 'api.yaml'}]}));
      final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
      final root = file.uri.toString(), pointer = '/paths/~1parts/post';
      final plan = await project.prepareRequest(root, resource: root, pointer: pointer);addTearDown(plan.close);
      final inspection = await plan.multipartPlan(type, '{"value":"data"}', inspect: true, requestId: 'header-choices');
      final control = ((inspection['controls'] as List).single['headerControls'] as List).single as Map;
      expect(control['examples'][0]['external']['resource'], payload.uri.toString());
      expect(control['examples'][0]['wireBase64'], isNull);
      final draft = OperationRequestDraft(planIdentity: plan.identity, body: const RequestBodyDraft.multipartValue(
        mediaType: type, json: '{"value":"data"}', partHeaders: [RequestPartHeaderValue.example('/value', 'X-Meta', 'Approved')]));
      final run = await const ContractRequestExecutor().execute(plan, draft, resolveSecret: (_) async => null);
      try { expect(run.conforming, true, reason: '${run.outgoing.findings}');expect(String.fromCharCodes(seen.single), contains('X-Meta: $exact\r\n')); }
      finally { await run.close(); }
      final changed = await project.applyRefactoring(await plan.planCase('Header bytes', draft));
      for (final id in changed) await project.save(project.store.get(id));
      final cold = await BusyProject.open(directory.path, engine);addTearDown(cold.close);
      final reopened = await cold.prepareRequest(root, resource: root, pointer: pointer);addTearDown(reopened.close);
      final loaded = await ContractTestRunner.reopenCase(reopened, 'Header bytes', cold.access);
      expect(loaded.body.partHeaders.single.exampleName, 'Approved');
      final cli = await Process.run('$testBundle/busyapi', ['test', directory.path, '--case', 'Header bytes', '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');expect(seen, hasLength(2));
      await payload.writeAsString(exact.replaceFirst('9007199254740993.00', '9007199254740992'));
      await expectLater(const ContractRequestBuilder().build(reopened, loaded, resolveSecret: (_) async => null), throwsA(isA<CoreFailure>()));
      expect(seen, hasLength(2));expect(await file.readAsString(), source);
    });
  }
}
