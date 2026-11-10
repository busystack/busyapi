import 'dart:io';
import 'dart:convert';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

class _RuntimeProofEngine extends EngineProcess {
  _RuntimeProofEngine()
    : super(executable: runtimeNode, helper: runtimeHelper);

  String? fault;
  String? contentFault;

  @override
  Future<Map<String, dynamic>> request(
    String method,
    Map<String, Object?> params, {
    String? requestId,
  }) async {
    final result = await super.request(method, params, requestId: requestId);
    if (method == 'requestContentParameters') {
      if (contentFault == 'old-producer') result['producerVersion'] = '1';
      if (contentFault == 'missing-bytes') result['bodies'] = <String, Object?>{};
    }
    if (method != 'evaluateSchemas' || params['runtimeInstances'] == null || fault == null) {
      return result;
    }
    final proofs = result['runtimeEvaluations'] as List;
    final proof = Map<String, dynamic>.from(proofs.single as Map);
    switch (fault) {
      case 'old-producer':
        result['producerVersion'] = '1.18.0+47';
      case 'missing':
        result['runtimeEvaluations'] = [];
      case 'duplicate':
        result['runtimeEvaluations'] = [proof, proof];
      case 'other-owner':
        proof['parameter'] = {'resource': params['root'], 'pointer': '/info'};
        result['runtimeEvaluations'] = [proof];
      case 'other-location':
        proof['location'] = 'query:other';
        result['runtimeEvaluations'] = [proof];
      case 'malformed-status':
        proof.remove('valid');
        result['runtimeEvaluations'] = [proof];
      case 'null-owner':
        proof['parameter'] = null;
        result['runtimeEvaluations'] = [proof];
      case 'forged-rules':
        proof['parameter'] = {...proof['parameter'] as Map, 'family': '2.0'};
        result['runtimeEvaluations'] = [proof];
    }
    return result;
  }
}

void main() {
  for (final version in ['3.0.4','3.1.2','3.2.0','3.2.1']) {
    test('$version literal and scalar media Parameters use actual charset bytes through HTTP, cases and CLI', () async {
      final temp = await Directory.systemTemp.createTemp('busyapi-content-parameters-');
      addTearDown(() => temp.delete(recursive: true));
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final seen = <String>[];
      server.listen((request) async {
        seen.add(request.uri.toString());
        expect(request.uri.toString(), contains('/p/caf%E9'));
        expect(request.uri.query, contains('q=caf%E9'));
        expect(request.uri.query, contains('n=9007199254740993.00'));
        expect(request.headers.value('x-json')!.codeUnits, utf8.encode('"雪"'));
        request.response.statusCode = 204;await request.response.close();
      });
      const latin = 'text/plain; charset=iso-8859-1';
      final source = File('${temp.path}/api.json');
      final original = jsonEncode({
        'openapi': version, 'info': {'title': 'Content bytes', 'version': '1'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/p/{p}': {'get': {'parameters': [
          {'name': 'q', 'in': 'query', 'content': {latin: {'schema': {'type': 'string', 'enum': ['café']}}}},
          {'name': 'p', 'in': 'path', 'required': true, 'content': {latin: {'schema': {'type': 'string', 'enum': ['café']}}}},
          {'name': 'X-Json', 'in': 'header', 'content': {'application/json': {'schema': {'type': 'string', 'enum': ['雪']}}}},
          {'name': 'n', 'in': 'query', 'content': {'text/plain': {'schema': {'type': 'string', 'enum': ['9007199254740993.00']}}}},
        ], 'responses': {'204': {'description': 'Empty'}}}}},
      });
      await source.writeAsString(original);
      final engine = _RuntimeProofEngine();addTearDown(engine.close);
      var project = await BusyProject.open(source.path, engine);addTearDown(() => project.close());
      final root = source.uri.toString();const pointer = '/paths/~1p~1{p}/get';
      final plan = await project.prepareRequest(root, resource: root, pointer: pointer);addTearDown(plan.close);
      final draft = OperationRequestDraft(planIdentity: plan.identity, parameters: {
        OperationRequestDraft.parameterKey('query','q'): const RequestValue.text('café'),
        OperationRequestDraft.parameterKey('path','p'): const RequestValue.json('"café"'),
        OperationRequestDraft.parameterKey('header','X-Json'): const RequestValue.json('"雪"'),
        OperationRequestDraft.parameterKey('query','n'): const RequestValue.json('9007199254740993.00'),
      });
      for (final fault in ['old-producer','missing-bytes']) {
        engine.contentFault = fault;
        await expectLater(const ContractRequestBuilder().build(plan,draft,resolveSecret: (_) async => null),
            throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'request.parameter.protocol')));
      }
      engine.contentFault = null;expect(seen, isEmpty);
      final result = await const ContractRequestExecutor().execute(plan,draft,resolveSecret: (_) async => null);
      try {expect(result.conforming,true,reason:'${result.outgoing.findings}');} finally {await result.close();}
      final changed = await project.applyRefactoring(await plan.planCase('Declared bytes',draft));
      for (final id in changed) await project.save(project.store.get(id));
      project.close();project = await BusyProject.open(temp.path,engine);
      final cold = await project.prepareRequest(root,resource:root,pointer:pointer);addTearDown(cold.close);
      final reopened = await ContractTestRunner.reopenCase(cold,'Declared bytes',project.access);
      final replay = await const ContractRequestExecutor().execute(cold,reopened,resolveSecret: (_) async => null);
      try {expect(replay.conforming,true);} finally {await replay.close();}
      final cli = await Process.run('$testBundle/busyapi',['test',temp.path,'--case','Declared bytes','--json'],
          environment:const {'PATH':'','LANG':'C.UTF-8'},includeParentEnvironment:false);
      expect(cli.exitCode,0,reason:'${cli.stdout} ${cli.stderr}');expect(seen,hasLength(3));
      expect(await source.readAsString(),original);
    });
  }
  test('runtime parameter admission binds current producer and each captured occurrence', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-runtime-proof-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/api.json');
    const original = '{"openapi":"3.2.1","info":{"title":"Proof","version":"1"},'
        '"paths":{"/p":{"get":{"parameters":[{"name":"q","in":"query",'
        '"schema":{"type":"integer","enum":[9007199254740993.00]}}],'
        '"responses":{"204":{"description":"No content"}}}}}}';
    await file.writeAsString(original);
    final engine = _RuntimeProofEngine();
    addTearDown(engine.close);
    final project = await BusyProject.open(file.path, engine);
    addTearDown(project.close);
    final root = file.uri.toString();
    final plan = await project.prepareRequest(root, resource: root, pointer: '/paths/~1p/get');
    addTearDown(plan.close);
    final instances = [RuntimeSchemaInstance(
      subject: 'request-parameter', location: 'query:q', text: 'q=9007199254740993',
      parameter: RuntimeParameterTarget(resource: root, pointer: '/paths/~1p/get/parameters/0'),
    )];
    final checked = await plan.evaluateRuntime(instances);
    expect(checked['complete'], true);
    expect((checked['runtimeEvaluations'] as List).single['valid'], true);
    for (final fault in [
      'old-producer', 'missing', 'duplicate', 'other-owner', 'other-location',
      'malformed-status', 'null-owner', 'forged-rules',
    ]) {
      engine.fault = fault;
      await expectLater(plan.evaluateRuntime(instances), throwsA(
        isA<CoreFailure>().having((error) => error.code, 'code', 'runtime.protocol'),
      ), reason: fault);
    }
    engine.fault = null;
    expect((await plan.evaluateRuntime(instances))['complete'], true);
    expect(await file.readAsString(), original);
  });
}
