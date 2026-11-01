import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

class _RuntimeProofEngine extends EngineProcess {
  _RuntimeProofEngine()
    : super(executable: runtimeNode, helper: runtimeHelper);

  String? fault;

  @override
  Future<Map<String, dynamic>> request(
    String method,
    Map<String, Object?> params, {
    String? requestId,
  }) async {
    final result = await super.request(method, params, requestId: requestId);
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
