import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';
import 'package:yaml/yaml.dart';

import 'test_support.dart';

void main() {
  test('CLI URI-security review identities include configuration and publish exact aliases', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-security-cli-');
    addTearDown(() => directory.delete(recursive: true));
    final source = jsonEncode({
      'openapi': '3.2.1', 'info': {'title': 'CLI', 'version': '1'}, 'paths': <String, Object?>{},
      'components': {'securitySchemes': {'Key': {'type': 'apiKey', 'in': 'header', 'name': 'X-Key'}}},
      'security': [{'#/components/securitySchemes/Key': <String>[]}],
    });
    await File('${directory.path}/api.json').writeAsString(source);
    final configuration = File('${directory.path}/busyapi.yaml');
    const text = 'version: 1\nroots: [{name: api, path: api.json}]\nenvironments:\n'
        '  manual:\n    authentication:\n      schemes:\n'
        '        "#/components/securitySchemes/Key": {secretRef: 11111111-1111-4111-8111-111111111111}\n';
    await configuration.writeAsString(text);
    final destination = '${directory.path}/converted';
    final arguments = ['migrate', directory.path, '--target', '3.1.2', '--output', destination, '--json'];
    Future<ProcessResult> invoke(List<String> extra) => Process.run('$testBundle/busyapi', [...arguments, ...extra],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
    final reviewed = await invoke([]);
    expect(reviewed.exitCode, 0, reason: '${reviewed.stdout} ${reviewed.stderr}');
    final report = jsonDecode(reviewed.stdout as String) as Map;
    expect(report['configurationBindings'], hasLength(1));
    expect(await Directory(destination).exists(), false);
    await configuration.writeAsString('$text\nx-current: true\n');
    final stale = await invoke(['--apply', report['reviewIdentity'] as String]);
    expect(stale.exitCode, isNot(0)); expect(await Directory(destination).exists(), false);
    final fresh = await invoke([]);
    expect(fresh.exitCode, 0, reason: '${fresh.stdout} ${fresh.stderr}');
    final current = jsonDecode(fresh.stdout as String) as Map;
    final applied = await invoke(['--apply', current['reviewIdentity'] as String]);
    expect(applied.exitCode, 0, reason: '${applied.stdout} ${applied.stderr}');
    final delivered = loadYaml(await File('$destination/busyapi.yaml').readAsString()) as Map;
    final name = (current['configurationBindings'] as List).single['after'];
    expect(delivered['environments']['manual']['authentication']['schemes'][name]['secretRef'],
        '11111111-1111-4111-8111-111111111111');
    expect(await File('${directory.path}/api.json').readAsString(), source);
  });
  for (final target in ['3.1.2', '3.0.4', '2.0']) {
    test('$target URI security retains configuration and actual HTTP after cold publication', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-security-migration-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final observed = <String?>[];
      server.listen((request) async {
        observed.add(request.headers.value('X-Key'));
        request.response.statusCode = 204;
        await request.response.close();
      });
      final file = File('${directory.path}/api.json');
      final schemes = File('${directory.path}/security.json');
      final configuration = File('${directory.path}/busyapi.yaml');
      const relative = './security.json#/Alias', absolute = 'https://contracts.invalid/v1/security.json#/Key';
      const secret = '11111111-1111-4111-8111-111111111111';
      final original = jsonEncode({
        'openapi': '3.2.1', r'$self': 'https://contracts.invalid/v1/api.json',
        'info': {'title': 'Original', 'version': 'business'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/p': {'get': {'responses': {'204': {'description': 'Done'}}}}},
        'security': [{relative: <String>[]}, {absolute: <String>[]}],
        'x-literal': {relative: ['literal']},
      });
      final schemeText = jsonEncode({
        'Key': {'type': 'apiKey', 'in': 'header', 'name': 'X-Key', 'description': '[Guide](./security.md)'},
        'Alias': {r'$ref': '#/Key'}, 'Literal': {r'$ref': 'literal', 'roles': ['literal']},
      });
      final configurationText = 'version: 1\nroots: [{name: api, path: api.json}]\n'
          'resourceMappings: {"https://contracts.invalid/v1/security.json": security.json}\n'
          'environments:\n  manual:\n    authentication:\n      alternative: 0\n      schemes:\n'
          '        "$relative": {secretRef: $secret, x-exact: 9007199254740993.00}\n'
          '        "$absolute": {secretRef: $secret}\n';
      await file.writeAsString(original);
      await schemes.writeAsString(schemeText);
      await configuration.writeAsString(configurationText);
      final project = await BusyProject.open(directory.path, engine);
      addTearDown(project.close);
      final root = project.roots.single.id, destination = '${directory.path}/converted';
      project.store.replace(root, original.replaceFirst('Original', 'Unsaved 雪'));
      Future<MigrationOutput> prepare() => project.prepareMigration(root, destination, targetVersion: target);
      final review = await prepare();
      addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');
      expect(review.unsaved, true);
      expect(review.securityBindings, hasLength(2));
      expect(review.securityBindings.map((binding) => binding.after).toSet(), hasLength(2));
      await expectLater(review.publish(cancelled: () => true),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
      expect(await Directory(destination).exists(), false);
      final buffer = await project.buffer(configuration.uri.toString());
      project.store.replace(buffer.id, buffer.text.replaceFirst('alternative: 0', 'alternative: 1'));
      await expectLater(review.publish(),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
      final fresh = await prepare();
      addTearDown(fresh.close);
      expect(fresh.publishable, true, reason: '${fresh.result}');
      await fresh.publish();
      expect(await file.readAsString(), original);
      expect(await schemes.readAsString(), schemeText);
      expect(await configuration.readAsString(), configurationText);
      final manifestText = await File('$destination/busyapi.yaml').readAsString();
      expect(manifestText, contains('9007199254740993.00'));
      final manifest = loadYaml(manifestText) as Map;
      final settings = manifest['environments']['manual']['authentication']['schemes'] as Map;
      for (final binding in fresh.securityBindings) {
        expect(settings[binding.after]['secretRef'], secret);
        expect(settings.containsKey(binding.before), true);
      }
      final moved = await Directory(destination).rename('${directory.path}/cold 雪');
      project.close();
      await file.delete(); await schemes.delete(); await configuration.delete();
      final output = await BusyProject.open(moved.path, engine);
      addTearDown(output.close);
      final outputRoot = output.roots.single.id;
      expect((await output.check(outputRoot))['complete'], true);
      final plan = await output.prepareRequest(outputRoot, resource: outputRoot, pointer: '/paths/~1p/get');
      addTearDown(plan.close);
      var resolutions = 0;
      for (final alternative in [0, 1]) {
        final response = await const ContractRequestExecutor().execute(plan,
            OperationRequestDraft(planIdentity: plan.identity, environment: 'manual', securityAlternative: alternative),
            resolveSecret: (reference) async {
              expect(reference, secret); resolutions++; return 'controlled-key';
            });
        expect(response.conforming, true);
        await response.close();
      }
      expect(resolutions, 2); expect(observed, ['controlled-key', 'controlled-key']);
      final checked = await Process.run('$testBundle/busyapi', ['check', moved.path, '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(checked.exitCode, 0, reason: '${checked.stdout} ${checked.stderr}');
      expect((jsonDecode(checked.stdout as String) as Map)['complete'], true);
    });
  }
}
