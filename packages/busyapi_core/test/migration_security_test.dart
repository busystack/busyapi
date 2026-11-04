import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';
import 'package:yaml/yaml.dart';

import 'test_support.dart';

void main() {
  for (final location in ['header', 'query', 'cookie']) {
    for (final target in location == 'cookie' ? ['3.2.1', '3.1.2'] : ['3.2.1', '3.1.2', '2.0']) {
      test('$location $target independent AND bindings share only a proved generated credential', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-and-security-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        final observed = <List<String>>[];
        server.listen((request) async {
          observed.add(switch (location) {
            'header' => request.headers['X-Key'] ?? [],
            'query' => request.uri.queryParametersAll['X-Key'] ?? [],
            _ => request.cookies.where((cookie) => cookie.name == 'X-Key').map((cookie) => cookie.value).toList(),
          });
          request.response.statusCode = 204;
          await request.response.close();
        });
        final file = File('${directory.path}/api.json'), configuration = File('${directory.path}/busyapi.yaml');
        const relative = '#/components/securitySchemes/Key', secret = '11111111-1111-4111-8111-111111111111';
        final absolute = '${file.uri}#/components/securitySchemes/Key';
        final roles = target != '2.0';
        final text = jsonEncode({
          'openapi': '3.2.1', 'info': {'title': 'AND', 'version': '1'},
          'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
          'paths': {'/p': {'get': {'responses': {'204': {'description': 'Done'}}}}},
          'components': {'securitySchemes': {'Key': {'type': 'apiKey', 'in': location, 'name': 'X-Key'}}},
          'security': [{relative: roles ? ['reader'] : <String>[], absolute: roles ? ['writer'] : <String>[]}],
        });
        final config = 'version: 1\nroots: [{name: api, path: api.json}]\nenvironments:\n  manual:\n'
            '    authentication:\n      alternative: 0\n      schemes:\n'
            '        "$relative": {secretRef: $secret}\n        "$absolute": {secretRef: $secret}\n';
        await file.writeAsString(text); await configuration.writeAsString(config);
        final project = await BusyProject.open(directory.path, engine);
        addTearDown(project.close);
        var resolutions = 0;
        Future<void> send(BusyProject owner) async {
          final root = owner.roots.single.id;
          final plan = await owner.prepareRequest(root, resource: root, pointer: '/paths/~1p/get');
          try {
            final requirement = (plan.result['security']['requirements'] as List).single as Map;
            expect(requirement['schemes'], hasLength(2));
            expect((requirement['schemes'] as List).map((name) => requirement['scopes'][name]),
                roles ? [['reader'], ['writer']] : [[], []]);
            final response = await const ContractRequestExecutor().execute(plan,
                OperationRequestDraft(planIdentity: plan.identity, environment: 'manual'),
                resolveSecret: (reference) async {
                  expect(reference, secret); resolutions++; return 'controlled-key';
                });
            expect(response.conforming, true);
            await response.close();
          } finally { plan.close(); }
        }
        await send(project);
        final destination = '${directory.path}/output';
        final review = await project.prepareMigration(project.roots.single.id, destination, targetVersion: target);
        addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');
        await review.publish();
        final output = await BusyProject.open(destination, engine);
        addTearDown(output.close);
        await send(output);
        expect(resolutions, 2);
        expect(observed, [['controlled-key'], ['controlled-key']]);
        final buffer = await project.buffer(configuration.uri.toString());
        project.store.replace(buffer.id, config.replaceFirst(
            '"$absolute": {secretRef: $secret}', '"$absolute": {secretRef: 22222222-2222-4222-8222-222222222222}'));
        final root = project.roots.single.id;
        final conflicting = await project.prepareRequest(root, resource: root, pointer: '/paths/~1p/get');
        addTearDown(conflicting.close);
        for (final preview in [true, false]) {
          await expectLater(const ContractRequestBuilder().build(conflicting,
              OperationRequestDraft(planIdentity: conflicting.identity, environment: 'manual'),
              previewOnly: preview, resolveSecret: (_) async => 'coincidentally-identical'),
              throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'request.security.collision')));
        }
        if (location == 'header') {
          await expectLater(const ContractRequestBuilder().build(conflicting,
              OperationRequestDraft(planIdentity: conflicting.identity, environment: 'manual',
                  headers: const [RequestHeaderValue('X-Key', 'controlled-key')]),
              resolveSecret: (_) async => throw StateError('An explicit collision cannot acquire credentials')),
              throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'request.security.collision')));
        }
        expect(observed, hasLength(2));
        expect(await file.readAsString(), text); expect(await configuration.readAsString(), config);
      });
    }
  }
  test('retained URI OR bindings publish independent environment credentials and cold reopen', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-uri-or-');
    addTearDown(() => directory.delete(recursive: true));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final observed = <List<String>>[];
    server.listen((request) async {
      final values = request.headers['X-Key'] ?? <String>[];
      observed.add(values);
      request.response.statusCode = values.length == 1 &&
          const ['controlled-first', 'controlled-second'].contains(values.single) ? 204 : 401;
      await request.response.close();
    });
    final file = File('${directory.path}/api.json'), configuration = File('${directory.path}/busyapi.yaml');
    const relative = '#/components/securitySchemes/Key';
    final absolute = '${file.uri}#/components/securitySchemes/Key';
    const first = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222';
    final text = jsonEncode({
      'openapi': '3.2.1', 'info': {'title': 'Independent OR', 'version': '1'},
      'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
      'paths': {'/p': {'get': {'responses': {'204': {'description': 'Done'}}}}},
      'components': {'securitySchemes': {'Key': {'type': 'apiKey', 'in': 'header', 'name': 'X-Key'}}},
      'security': [{relative: ['reader']}, {absolute: ['writer']}],
    });
    final config = 'version: 1\nroots: [{name: api, path: api.json}]\nenvironments:\n  manual:\n'
        '    authentication:\n      alternative: 1\n      schemes:\n'
        '        "$relative": {secretRef: $first}\n        "$absolute": {secretRef: $second}\n';
    await file.writeAsString(text); await configuration.writeAsString(config);
    final project = await BusyProject.open(directory.path, engine);
    addTearDown(project.close);
    Future<void> send(BusyProject owner) async {
      final root = owner.roots.single.id;
      final plan = await owner.prepareRequest(root, resource: root, pointer: '/paths/~1p/get');
      try {
        final rows = plan.result['security']['requirements'] as List;
        expect(rows, hasLength(2));
        expect(rows[0]['schemes'].single, isNot(rows[1]['schemes'].single));
        for (final selection in [null, 0]) {
          final response = await const ContractRequestExecutor().execute(plan,
              OperationRequestDraft(planIdentity: plan.identity, environment: 'manual', securityAlternative: selection),
              resolveSecret: (reference) async {
                expect(reference, selection == null ? second : first);
                return reference == first ? 'controlled-first' : 'controlled-second';
              });
          expect(response.conforming, true); await response.close();
        }
      } finally { plan.close(); }
    }
    await send(project);
    final destination = '${directory.path}/output';
    final review = await project.prepareMigration(project.roots.single.id, destination, targetVersion: '3.2.1');
    addTearDown(review.close);
    expect(review.publishable, true, reason: '${review.result}');
    await review.publish();
    expect(await file.readAsString(), text); expect(await configuration.readAsString(), config);
    await file.delete(); await configuration.delete();
    final output = await BusyProject.open(destination, engine);
    addTearDown(output.close);
    await send(output);
    expect(observed, [['controlled-second'], ['controlled-first'], ['controlled-second'], ['controlled-first']]);
  });
  test('CLI URI-security review identities include configuration and publish exact aliases', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-security-cli-');
    addTearDown(() => directory.delete(recursive: true));
    final source = jsonEncode({
      'openapi': '3.2.1', 'info': {'title': 'CLI', 'version': '1'}, 'paths': <String, Object?>{},
      'servers': [{'url': 'https://api.invalid'}],
      'components': {'securitySchemes': {
        'Key': {'type': 'apiKey', 'in': 'header', 'name': 'X-Key'},
        'OAuth': {'type': 'oauth2', 'flows': {
          'implicit': {'authorizationUrl': 'https://auth.invalid/authorize', 'scopes': <String, Object?>{}},
          'clientCredentials': {'tokenUrl': 'https://auth.invalid/token', 'scopes': <String, Object?>{}},
        }},
      }},
      'security': [{'OAuth': <String>[]}, {'#/components/securitySchemes/Key': <String>[]}],
    });
    await File('${directory.path}/api.json').writeAsString(source);
    final configuration = File('${directory.path}/busyapi.yaml');
    const text = 'version: 1\nroots: [{name: api, path: api.json}]\nenvironments:\n'
        '  manual:\n    authentication:\n      alternative: 1\n      schemes:\n'
        '        "#/components/securitySchemes/Key": {secretRef: 11111111-1111-4111-8111-111111111111}\n';
    await configuration.writeAsString(text);
    final destination = '${directory.path}/converted';
    final arguments = ['migrate', directory.path, '--target', '2.0', '--output', destination, '--json'];
    Future<ProcessResult> invoke(List<String> extra) => Process.run('$testBundle/busyapi', [...arguments, ...extra],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
    final reviewed = await invoke([]);
    expect(reviewed.exitCode, 0, reason: '${reviewed.stdout} ${reviewed.stderr}');
    final report = jsonDecode(reviewed.stdout as String) as Map;
    expect(report['configurationBindings'], hasLength(2));
    expect(report['configurationAlternatives'], [{'environment': 'manual', 'before': 1, 'after': 2}]);
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
    final name = (current['configurationBindings'] as List).singleWhere(
        (binding) => binding['before'] == '#/components/securitySchemes/Key')['after'];
    expect(delivered['environments']['manual']['authentication']['schemes'][name]['secretRef'],
        '11111111-1111-4111-8111-111111111111');
    expect(await File('${directory.path}/api.json').readAsString(), source);
  });
  for (final basic in [false, true]) {
    test('${basic ? 'Basic' : 'OAuth'} AND bindings execute with one proved credential field after specialization', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-oauth-and-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final observed = <List<String>>[];
      final expected = basic ? 'Basic ${base64Encode(utf8.encode('manual:controlled-token'))}' : 'Bearer controlled-token';
      server.listen((request) async {
        final fields = request.headers['Authorization'] ?? <String>[];
        observed.add(fields);
        request.response.statusCode = fields.length == 1 && fields.single == expected ? 204 : 401;
        await request.response.close();
      });
      final file = File('${directory.path}/api.json'), configuration = File('${directory.path}/busyapi.yaml');
      const relative = '#/components/securitySchemes/Access', secret = '11111111-1111-4111-8111-111111111111';
      final absolute = '${file.uri}#/components/securitySchemes/Access';
      final text = jsonEncode({
        'openapi': '3.2.1', 'info': {'title': 'OAuth AND', 'version': '1'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/p': {'get': {'responses': {'204': {'description': 'Done'}}}}},
        'components': {'securitySchemes': {'Access': basic ? {'type': 'http', 'scheme': 'BaSiC'} : {'type': 'oauth2', 'flows': {
          'authorizationCode': {'authorizationUrl': 'https://auth.invalid/authorize', 'tokenUrl': 'https://auth.invalid/code',
            'scopes': {'read': 'Read', 'write': 'Write'}},
          'clientCredentials': {'tokenUrl': 'https://auth.invalid/token', 'scopes': {'read': 'Read', 'write': 'Write'}},
        }}}},
        'security': [{relative: basic ? <String>[] : ['read'], absolute: basic ? <String>[] : ['write']}],
      });
      final settings = basic ? 'username: manual, passwordRef: $secret' : 'accessTokenRef: $secret';
      final config = 'version: 1\nroots: [{name: api, path: api.json}]\nenvironments:\n  manual:\n'
          '    authentication:\n      alternative: 0\n      schemes:\n'
          '        "$relative": {$settings}\n        "$absolute": {$settings}\n';
      await file.writeAsString(text); await configuration.writeAsString(config);
      final project = await BusyProject.open(directory.path, engine);
      addTearDown(project.close);
      var resolutions = 0;
      Future<void> send(BusyProject owner, int count) async {
        final root = owner.roots.single.id;
        final plan = await owner.prepareRequest(root, resource: root, pointer: '/paths/~1p/get');
        try {
          final requirements = plan.result['security']['requirements'] as List;
          expect(requirements, hasLength(count));
          for (final (index, requirement) in requirements.indexed) {
            expect(requirement['schemes'], hasLength(2));
            expect((requirement['schemes'] as List).map((name) => requirement['scopes'][name]),
                basic ? [[], []] : [['read'], ['write']]);
            final response = await const ContractRequestExecutor().execute(plan,
                OperationRequestDraft(planIdentity: plan.identity, environment: 'manual', securityAlternative: index),
                resolveSecret: (reference) async {
                  expect(reference, secret); resolutions++; return 'controlled-token';
                });
            expect(response.conforming, true);
            await response.close();
          }
        } finally { plan.close(); }
      }
      await send(project, 1);
      final review = await project.prepareMigration(project.roots.single.id, '${directory.path}/output', targetVersion: '2.0');
      addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');
      await review.publish();
      final output = await BusyProject.open(review.destination, engine);
      addTearDown(output.close);
      await send(output, basic ? 1 : 4);
      final count = basic ? 2 : 5;
      expect(resolutions, count);
      expect(observed, List.generate(count, (_) => [expected]));
      final buffer = await project.buffer(configuration.uri.toString());
      final incompatible = basic ? 'username: other, passwordRef: $secret'
          : 'accessTokenRef: 22222222-2222-4222-8222-222222222222';
      project.store.replace(buffer.id, config.replaceFirst('"$absolute": {$settings}', '"$absolute": {$incompatible}'));
      final root = project.roots.single.id;
      final conflicting = await project.prepareRequest(root, resource: root, pointer: '/paths/~1p/get');
      addTearDown(conflicting.close);
      for (final preview in [true, false]) {
        await expectLater(const ContractRequestBuilder().build(conflicting,
            OperationRequestDraft(planIdentity: conflicting.identity, environment: 'manual'),
            previewOnly: preview, resolveSecret: (_) async => 'coincidentally-identical'),
            throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'request.security.collision')));
      }
      expect(observed, hasLength(count));
      expect(await file.readAsString(), text); expect(await configuration.readAsString(), config);
    });
  }
  test('Swagger publication keeps the selected original requirement after OAuth expansion', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-flow-selection-');
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
    final text = jsonEncode({
      'openapi': '3.2.1', 'info': {'title': 'Flows', 'version': '1'},
      'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
      'paths': {'/p': {'get': {'responses': {'204': {'description': 'Done'}}}}},
      'components': {'securitySchemes': {
        'OAuth': {'type': 'oauth2', 'flows': {
          'implicit': {'authorizationUrl': 'https://auth.invalid/authorize', 'scopes': {'read': 'Read'}},
          'clientCredentials': {'tokenUrl': 'https://auth.invalid/token', 'scopes': {'read': 'Read'}},
        }},
        'Key': {'type': 'apiKey', 'in': 'header', 'name': 'X-Key'},
      }},
      'security': [{'OAuth': ['read']}, {'Key': <String>[]}],
    });
    const secret = '11111111-1111-4111-8111-111111111111';
    const configuration = 'version: 1\nroots: [{name: api, path: api.json}]\nenvironments:\n'
        '  manual:\n    authentication:\n      alternative: 1\n      schemes:\n        Key: {secretRef: $secret}\n';
    await file.writeAsString(text);
    await File('${directory.path}/busyapi.yaml').writeAsString(configuration);
    final project = await BusyProject.open(directory.path, engine);
    addTearDown(project.close);
    final root = project.roots.single.id, destination = '${directory.path}/output';
    final review = await project.prepareMigration(root, destination, targetVersion: '2.0');
    addTearDown(review.close);
    expect(review.publishable, true, reason: '${review.result}');
    expect(review.authenticationAlternatives.single.before, 1);
    expect(review.authenticationAlternatives.single.after, 2);
    await review.publish();
    final output = await BusyProject.open(destination, engine);
    addTearDown(output.close);
    final outputRoot = output.roots.single.id;
    final plan = await output.prepareRequest(outputRoot, resource: outputRoot, pointer: '/paths/~1p/get');
    addTearDown(plan.close);
    expect((plan.result['security']['requirements'] as List).length, 3);
    final response = await const ContractRequestExecutor().execute(plan,
        OperationRequestDraft(planIdentity: plan.identity, environment: 'manual'),
        resolveSecret: (reference) async {
          expect(reference, secret); return 'controlled-selected-key';
        });
    expect(response.conforming, true);
    await response.close();
    expect(observed, ['controlled-selected-key']);
    expect(await file.readAsString(), text);
    expect(await File('${directory.path}/busyapi.yaml').readAsString(), configuration);
  });
  test('ignored security reference data publishes through the shared literal owner and cold reopens', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-ignored-security-');
    addTearDown(() => directory.delete(recursive: true));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final file = File('${directory.path}/api.json'), scheme = File('${directory.path}/scheme.json');
    final original = jsonEncode({
      'openapi': '3.0.4', 'info': {'title': 'Ignored fields', 'version': '1'},
      'servers': [{'url': 'https://api.invalid'}],
      'paths': {'/p': {'get': {'responses': {'204': {'description': 'Done'}}}}},
      'components': {'securitySchemes': {'Alias': {
        r'$ref': 'scheme.json#/Key', 'description': 'Ignored [literal](./guide.md)',
        'summary': 'Ignored summary', r'$id': 'ignored-id',
        'x-data': {r'$ref': 'literal', 'number': 'EXACT'},
      }}},
      'security': [{'Alias': <String>[]}],
    }).replaceAll('"EXACT"', '9007199254740993.00');
    const terminal = '{"Key":{"type":"apiKey","in":"header","name":"X-Key","description":"Live scheme"}}';
    await file.writeAsString(original); await scheme.writeAsString(terminal);
    final project = await BusyProject.open(file.path, engine);
    addTearDown(project.close);
    final destination = '${directory.path}/output';
    final review = await project.prepareMigration(file.uri.toString(), destination, targetVersion: '2.0');
    addTearDown(review.close);
    expect(review.publishable, true, reason: '${review.result}');
    final literal = (review.result['outputs'] as List).cast<Map>().singleWhere(
        (output) => (output['text'] as String).contains('_migrated_ignored_reference_'));
    expect(literal['text'], contains('9007199254740993.00'));
    await review.publish();
    expect(await file.readAsString(), original); expect(await scheme.readAsString(), terminal);
    project.close(); await file.delete(); await scheme.delete();
    final output = await BusyProject.open(destination, engine);
    addTearDown(output.close);
    final checked = await output.check(output.roots.single.id);
    expect(checked['complete'], true, reason: '$checked');
    final saved = await File('$destination/${literal['path']}').readAsString();
    expect(saved, literal['text']);
    final data = jsonDecode(saved) as Map, key = data.keys.singleWhere((key) => (key as String).startsWith('_migrated_ignored_reference_'));
    expect(data[key][r'$ref'], 'scheme.json#/Key');
    expect(data[key]['description'], 'Ignored [literal](./guide.md)');
    expect(data[key][r'$id'], 'ignored-id');
    expect(data[key]['x-data'][r'$ref'], 'literal');
    final root = output.roots.single.id;
    final plan = await output.prepareRequest(root, resource: root, pointer: '/paths/~1p/get');
    addTearDown(plan.close);
    expect(plan.result['security']['schemes']['Alias']['description'], 'Live scheme');
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
