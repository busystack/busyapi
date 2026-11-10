import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['3.0.4', '3.1.2', '3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('$version $format approved Parameter media choices survive cases and independent CLI', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-parameter-choice-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        final seen = <String>[], headers = <List<int>>[];
        server.listen((request) async {
          seen.add(request.uri.toString());headers.add(request.headers.value('X-Raw')!.codeUnits);
          await request.drain<void>();request.response.statusCode = 204;await request.response.close();
        });
        const media = 'application/octet-stream', binary = [0, 255, 128, 43];
        final payload = File('${directory.path}/payload.bin');await payload.writeAsBytes(binary);
        await File('${directory.path}/header.bin').writeAsBytes([255, 128, 43]);
        await File('${directory.path}/cafe.bin').writeAsBytes([99, 97, 102, 233]);
        final schema = version.startsWith('3.0') ? {'type': 'string', 'format': 'binary'} : {'not': {'type': 'null'}, 'maxLength': 4};
        Map content(String file, {String type = media, Map? declaration}) => {type: {
          'schema': declaration ?? schema, 'examples': {'Approved': {'externalValue': file}},
        }};
        final paths = {'/p/{p}': {'get': {'parameters': [
          {'name': 'p', 'in': 'path', 'required': true, 'content': content('payload.bin')},
          {'name': 'q', 'in': 'query', 'content': content('payload.bin')},
          {'name': 'X-Raw', 'in': 'header', 'content': content('header.bin')},
          {'name': 'cafe', 'in': 'query', 'content': content('cafe.bin', type: 'text/plain; charset=iso-8859-1', declaration: {'type': 'string', 'enum': ['café']})},
        ], 'responses': {'204': {'description': 'Empty'}}}}};
        final file = File('${directory.path}/api.$format');
        final contract = {'openapi': version, 'info': {'title': 'Parameter choices', 'version': 'business'},
          'servers': [{'url': 'http://127.0.0.1:${server.port}'}], 'paths': paths};
        final source = format == 'yaml' ? '# Keep comments and CRLF 雪\r\n${jsonEncode(contract)}\r\n' : jsonEncode(contract);
        await file.writeAsString(source);
        await File('${directory.path}/busyapi.yaml').writeAsString(jsonEncode({'version': 1, 'roots': [{'name': 'api', 'path': 'api.$format'}]}));
        final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
        final root = file.uri.toString(), pointer = '/paths/~1p~1{p}/get';
        final plan = await project.prepareRequest(root, resource: root, pointer: pointer);addTearDown(plan.close);
        final parameters = <String, RequestValue>{};
        for (final declaration in (plan.result['parameters'] as List).cast<Map>()) {
          final location = declaration['in'] as String, name = declaration['name'] as String;
          final type = ((declaration['content'] as List).single as Map)['mediaType'] as String;
          final choice = plan.captureParameterExample(location, name, name: 'Approved', mediaType: type);
          parameters[OperationRequestDraft.parameterKey(location, name)] = RequestValue.example(choice);
        }
        expect(() => plan.captureParameterExample('query', 'q', name: 'Approved'), throwsA(isA<CoreFailure>()));
        final draft = OperationRequestDraft(planIdentity: plan.identity, parameters: parameters);
        final run = await const ContractRequestExecutor().execute(plan, draft, resolveSecret: (_) async => null);
        try { expect(run.conforming, true, reason: '${run.outgoing.findings} ${run.received.findings}'); }
        finally { await run.close(); }
        expect(seen.single, '/p/%00%FF%80%2B?q=%00%FF%80%2B&cafe=caf%E9');expect(headers.single, [255, 128, 43]);
        final replacement = await project.prepareRequest(root, resource: root, pointer: pointer);addTearDown(replacement.close);
        final old = parameters[OperationRequestDraft.parameterKey('query', 'q')]!.capturedExample!;
        expect(replacement.restoreParameterExample(old), isNotNull);
        await expectLater(const ContractRequestBuilder().build(replacement,
          OperationRequestDraft(planIdentity: replacement.identity, parameters: parameters), resolveSecret: (_) async => null),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'request.example.stale')));
        await payload.writeAsBytes([1]);
        await expectLater(const ContractRequestBuilder().build(plan, draft, resolveSecret: (_) async => null),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'runtime.request.example.stale')));
        expect(seen, hasLength(1));await payload.writeAsBytes(binary);
        final token = RunCancellation()..cancel();
        await expectLater(const ContractRequestBuilder().build(plan, draft, cancellation: token, resolveSecret: (_) async => null),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
        final changes = await project.applyRefactoring(await plan.planCase('Approved bytes', draft));
        for (final buffer in changes) await project.save(buffer);
        final manifest = jsonDecode(await File('${directory.path}/busyapi.yaml').readAsString()) as Map;
        expect(manifest['tests'][0]['parameterExamples']['query']['q'], {'name': 'Approved', 'mediaType': media});
        expect(manifest['tests'][0]['parameters'], isNull);
        final cold = await BusyProject.open(directory.path, engine);addTearDown(cold.close);
        final reopened = await cold.prepareRequest(root, resource: root, pointer: pointer);addTearDown(reopened.close);
        final loaded = await ContractTestRunner.reopenCase(reopened, 'Approved bytes', cold.access);
        expect(loaded.parameters.values.every((value) => value.capturedExample != null), true);
        final replay = await const ContractRequestExecutor().execute(reopened, loaded, resolveSecret: (_) async => null);
        try { expect(replay.conforming, true, reason: '${replay.outgoing.findings}'); } finally { await replay.close(); }
        final cli = await Process.run('$testBundle/busyapi', ['test', directory.path, '--case', 'Approved bytes', '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');expect(seen, hasLength(3));
        await payload.delete();
        final missing = await Process.run('$testBundle/busyapi', ['test', directory.path, '--case', 'Approved bytes', '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
        expect(missing.exitCode, 2, reason: '${missing.stdout} ${missing.stderr}');expect(seen, hasLength(3));
        expect(await file.readAsString(), source);
      });
    }
  }
}
