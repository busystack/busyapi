import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  modeledExternalExamples();
  test('an empty named external body choice survives save, cold reopen and independent CLI', () async {
    final temp = await Directory.systemTemp.createTemp('busyapi-empty-example-name-');
    addTearDown(() => temp.delete(recursive: true));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    const bytes = [0, 255, 128], media = 'application/octet-stream';
    final seen = <List<int>>[];
    server.listen((request) async {
      seen.add(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)));
      request.response.statusCode = 204;await request.response.close();
    });
    await File('${temp.path}/body.bin').writeAsBytes(bytes);
    final source = File('${temp.path}/api.json');
    final text = jsonEncode({
      'openapi': '3.2.1', 'info': {'title': 'Empty name', 'version': '1'},
      'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
      'paths': {'/p': {'post': {
        'requestBody': {'content': {media: {'schema': {'not': {'type': 'null'}},
          'examples': {'': {'externalValue': 'body.bin'}}}}},
        'responses': {'204': {'description': 'Received'}},
      }}},
    });
    await source.writeAsString(text);
    var project = await BusyProject.open(source.path, engine);
    addTearDown(() => project.close());
    final root = source.uri.toString();
    final plan = await project.prepareRequest(root, resource: root, pointer: '/paths/~1p/post');
    addTearDown(plan.close);
    final draft = OperationRequestDraft(planIdentity: plan.identity,
        body: RequestBodyDraft.example(plan.captureBodyExample(media, name: '')));
    final changes = await project.applyRefactoring(await plan.planCase('Empty named', draft));
    for (final id in changes) await project.save(project.store.get(id));
    final manifest = jsonDecode(await File('${temp.path}/busyapi.yaml').readAsString());
    expect(manifest['tests'][0]['body']['externalExample'], {'name': ''});
    project.close();project = await BusyProject.open(temp.path, engine);
    final cold = await project.prepareRequest(root, resource: root, pointer: '/paths/~1p/post');
    addTearDown(cold.close);
    final reopened = await ContractTestRunner.reopenCase(cold, 'Empty named', project.access);
    expect(reopened.body.capturedExample!.name, '');
    final result = await const ContractRequestExecutor().execute(cold, reopened, resolveSecret: (_) async => null);
    try { expect(result.conforming, true); } finally { await result.close(); }
    final cli = await Process.run('$testBundle/busyapi', ['test', temp.path, '--case', 'Empty named', '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
    expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
    expect(seen, [bytes, bytes]);expect(await source.readAsString(), text);
  });
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
      expect(mock.nativeResponseValidation.version, '5');expect(mock.nativeParameterValidation.version, '7');
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

// Kept in the existing external-byte suite and gate; no new acquisition path.
void modeledExternalExamples() {
  for (final media in ['application/xml', 'application/linkset', 'application/linkset+json']) {
    test('approved external $media preserves bytes and rejects changed/cancelled captures', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-external-modeled-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      final seen = <List<int>>[];
      server.listen((request) async {final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));seen.add(bytes);request.response.headers.set('content-type', media);request.response.add(bytes);await request.response.close();});
      final xml = media == 'application/xml';
      final text = xml ? '<payload><value>9007199254740993</value></payload>' : media == 'application/linkset'
          ? '</p>; rel=next; title="a,b"' : '{"linkset":[{"next":[{"href":"/p","title":"雪"}]}]}';
      final payload = File('${directory.path}/payload.bin')..writeAsBytesSync(utf8.encode(text));
      final schema = xml ? {'type':'object','xml':{'name':'payload'},'required':['value'],'properties':{'value':{'type':'number'}}} : {'type':'object','required':['linkset']};
      final source = File('${directory.path}/api.yaml');
      final original = jsonEncode({'openapi':'3.2.1','info':{'title':'Approved wire','version':'1'},'servers':[{'url':'http://127.0.0.1:${server.port}'}],
        'paths':{'/p':{'post':{'requestBody':{'content':{media:{'schema':schema,'examples':{'Approved':{'externalValue':'payload.bin'}}}}},
          'responses':{'200':{'description':'OK','content':{media:{'schema':schema}}}}}}}});
      await source.writeAsString(original);
      final project = await BusyProject.open(source.path, engine);addTearDown(project.close);
      final plan = await project.prepareRequest(source.uri.toString(),resource:source.uri.toString(),pointer:'/paths/~1p/post');addTearDown(plan.close);
      final selected = plan.captureBodyExample(media,name:'Approved');
      final draft = OperationRequestDraft(planIdentity:plan.identity,body:RequestBodyDraft.example(selected));
      final result = await const ContractRequestExecutor().execute(plan,draft,resolveSecret:(_) async=>null);addTearDown(result.close);
      expect(result.conforming,true,reason:'${result.received.findings}');expect(seen.single,utf8.encode(text));expect(result.received.modeledData,isNotNull);
      final token = RunCancellation()..cancel();
      await expectLater(plan.bodyExampleBytes(selected,cancellation:token),throwsA(isA<CoreFailure>().having((error)=>error.code,'code','cancelled')));
      await payload.writeAsString('changed');
      await expectLater(plan.bodyExampleBytes(selected),throwsA(isA<CoreFailure>().having((error)=>error.code,'code','runtime.request.example.stale')));
      expect(seen,hasLength(1));expect(await source.readAsString(),original);
    });
  }
}
