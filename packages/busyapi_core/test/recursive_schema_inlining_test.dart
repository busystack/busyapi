import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['2.0', '3.0.4', '3.1.2', '3.2.0', '3.2.1'])for (final format in ['yaml', 'json']) {
    test('$version $format recursive schema inline review, history, cold reopen and CLI', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-inline-recursive-');addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final source = File('${directory.path}/api.$format'), model = File('${directory.path}/node.$format');
      final modelText = '${format == 'yaml' ? '# Retain model source 雪\r\n' : ''}'
          '{"type":"object","required":["n"],"properties":{"n":{"type":"integer","minimum":9007199254740993.00},"next":{"\$ref":"#"}}}\r\n';
      await model.writeAsString(modelText);
      final response = {'description': 'Node', if (version == '2.0') 'schema': {r'$ref': 'node.$format'}
          else 'content': {'application/json': {'schema': {r'$ref': 'node.$format'}}}};
      final data = {if (version == '2.0') 'swagger': version else 'openapi': version,
        'info': {'title': 'Recursive inline', 'version': 'business'},
        if (version == '2.0') ...{'host': '127.0.0.1:1', 'schemes': ['http'], 'produces': ['application/json']}
          else 'servers': [{'url': 'http://127.0.0.1:1'}],
        'paths': {'/p': {'get': {'responses': {'200': response}}}}, 'x-payload': {r'$ref': 'literal', 'n': 'EXACT'}};
      final text = '${format == 'yaml' ? '# Preserve comment and newline\r\n' : ''}${jsonEncode(data).replaceAll('"EXACT"', '9007199254740993.00')}\r\n';
      await source.writeAsString(text);
      await File('${directory.path}/busyapi.yaml').writeAsString('version: 1\nroots: [{name: main, path: api.$format}]\n');
      var project = await BusyProject.open(directory.path, engine);addTearDown(() => project.close());
      final root = source.uri.toString(), buffer = await project.buffer(root), before = buffer.bytes();
      final pointer = '/paths/~1p/get/responses/200${version == '2.0' ? '/schema' : '/content/application~1json/schema'}';
      Future<OperationRequestPlan> requestPlan() => project.prepareRequest(root, resource: root, pointer: '/paths/~1p/get');
      Future<void> prove(OperationRequestPlan plan) async {
        final result = await plan.evaluateRuntime([for (final value in [
          '{"n":9007199254740993,"next":{"n":9007199254740994}}', '{"n":9007199254740992}', '{"n":9007199254740993,"next":{"n":"bad"}}',
        ]) RuntimeSchemaInstance(subject: 'response-body', location: value, text: value, schemaResource: root, schemaPointer: pointer)]);
        expect(result['complete'], true, reason: '${result['runtimeFindings']}');
        expect((result['runtimeEvaluations'] as List).map((value) => value['valid']), [true, false, false]);
      }
      final original = await requestPlan();await prove(original);original.close();
      final review = await project.planReferenceInlining({'root': root, 'resource': root, 'pointer': pointer, 'generation': buffer.generation});
      await expectLater(project.applyRefactoring(review, current: () => false), throwsA(isA<CoreFailure>()));expect(buffer.bytes(), before);
      await project.applyRefactoring(review);
      final accepted = buffer.bytes(), after = await requestPlan();await prove(after);after.close();
      expect(buffer.text, contains('9007199254740993.00'));
      expect((await project.referencePage(root, root, '$pointer/properties/next'))['references'][0]['target']['resource'], model.uri.toString());
      expect(await model.readAsString(), modelText);
      project.store.undo();expect(buffer.bytes(), before);
      project.store.redo();expect(buffer.bytes(), accepted);
      await expectLater(project.applyRefactoring(review), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'refactor.stale')));
      await project.save(buffer);project.close();
      project = await BusyProject.open(directory.path, engine);
      expect((await project.buffer(root)).bytes(), accepted);expect((await project.check(root))['status'], 'complete');
      final cold = await requestPlan();await prove(cold);cold.close();project.close();
      await source.writeAsString(text);
      final arguments = ['refactor', directory.path, '--root', 'main', '--action', 'inline', '--pointer', pointer, '--json'];
      final cliEnvironment = {'PATH': '', 'LANG': 'C.UTF-8', 'XDG_STATE_HOME': '${directory.path}/private-state'};
      final cliReview = await Process.run('$testBundle/busyapi', [...arguments, '--review'],
        environment: cliEnvironment, includeParentEnvironment: false);
      expect(cliReview.exitCode, 0, reason: '${cliReview.stdout} ${cliReview.stderr}');
      expect(await source.readAsString(), text);
      final reviewed = jsonDecode(cliReview.stdout as String) as Map;
      final cliApply = await Process.run('$testBundle/busyapi', [...arguments, '--apply', reviewed['reviewIdentity'] as String],
        environment: cliEnvironment, includeParentEnvironment: false);
      expect(cliApply.exitCode, 0, reason: '${cliApply.stdout} ${cliApply.stderr}');
      expect(await source.readAsBytes(), accepted);expect(await model.readAsString(), modelText);
    });
  }
}
