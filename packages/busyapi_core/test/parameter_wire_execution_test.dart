import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';
import 'migration_r3c_fixture.dart';

void main() {
  test('R3c-3 explicit whole-query form Encoding and named query arrays emit the same space/plus octets', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-form-style-');addTearDown(() => directory.delete(recursive: true));
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
    final seen = <String>[];
    server.listen((request) async {seen.add(request.uri.toString());request.response.statusCode = 204;await request.response.close();});
    final source = {'openapi':'3.2.1','info':{'title':'Styled form','version':'1'},'servers':[{'url':'http://127.0.0.1:${server.port}'}],
      'paths':{'/p':{'get':{'parameters':[{'name':'all','in':'querystring','required':true,'content':{'application/x-www-form-urlencoded':{
        'schema':{'type':'object','required':['q'],'additionalProperties':false,'properties':{'q':{'type':'array','minItems':1,'maxItems':2,'items':{'type':'string','enum':['a b','a+b']}}}},
        'encoding':{'q':{'style':'form','explode':true}},
      }}}],'responses':{'204':{'description':'Empty'}}}}}};
    final file = File('${directory.path}/api.json');await file.writeAsString(jsonEncode(source));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
    final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
    Future<void> send(BusyProject owner, String location, String name, String data) async {
      final plan = await owner.prepareRequest(owner.roots.single.id, resource: owner.roots.single.id, pointer:'/paths/~1p/get');
      try {
        final result = await const ContractRequestExecutor().execute(plan, OperationRequestDraft(planIdentity:plan.identity,
          parameters:{OperationRequestDraft.parameterKey(location,name):RequestValue.json(data)}),resolveSecret:(_) async => throw StateError('No credentials'));
        try {expect(result.outgoing.valid,true);expect(seen.last,'/p?q=a%20b&q=a%2Bb');} finally {await result.close();}
      } finally {plan.close();}
    }
    await send(project,'querystring','all','{"q":["a b","a+b"]}');
    final review = await project.prepareMigration(project.roots.single.id,'${directory.path}/output',targetVersion:'3.0.4');
    addTearDown(review.close);expect(review.publishable,true,reason:'${review.result}');await review.publish();await file.delete();
    final cold = await BusyProject.open(review.destination,engine);addTearDown(cold.close);await send(cold,'query','q','["a b","a+b"]');
  });
  for (final version in ['3.2.0', '3.2.1']) {
    for (final target in ['3.1.2', '3.0.4']) {
      test('R3c-3 $version → $target preserves literal cookie groups, singleton arrays and authentication precedence', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-cookie-projection-');
        addTearDown(() => directory.delete(recursive: true));
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
        final seen = <String?>[];
        server.listen((request) async { seen.add(request.headers.value('cookie'));request.response.statusCode = 204;await request.response.close(); });
        final value = jsonDecode(r3cSource(version, 'json', server.port).replaceAll('9007199254740993.00', '"EXACT"')) as Map;
        final parameters = value['paths']['/p']['get']['parameters'] as List;
        parameters.removeWhere((parameter) => parameter['name'] == 'auth');
        parameters.addAll([
          {'name':'bundle','in':'cookie','style':'cookie','schema':{'type':'object','additionalProperties':false,'properties':{
            'percent':{'type':'string','enum':['','%2C']},'flag2':{'type':'boolean'},'auth':{'type':'string','enum':['explicit','credential%2C']}}}},
          {'name':'single','in':'cookie','style':'cookie','schema':{'type':'array','minItems':1,'maxItems':1,'items':{'type':'string','enum':['','a%20b']}},
            'examples':{'One':{'dataValue':['a%20b'],'serializedValue':'single=a%20b'}}},
        ]);
        final original = jsonEncode(value).replaceAll('"EXACT"', '9007199254740993.00');
        final settings = jsonDecode(r3cConfiguration('json').replaceAll('9007199254740993.00', '"EXACT"')) as Map;
        settings['tests'][0]['parameters']['cookie']['bundle'] = {'percent':'%2C','flag2':false};
        settings['tests'][0]['parameters']['cookie']['single'] = ['a%20b'];
        final configuration = jsonEncode(settings).replaceAll('"EXACT"', '9007199254740993.00');
        final file = File('${directory.path}/api.json'), config = File('${directory.path}/busyapi.yaml');
        await file.writeAsString(original);await config.writeAsString(configuration);
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
        final project = await BusyProject.open(directory.path, engine);addTearDown(project.close);
        Future<void> exercise(BusyProject owner, String location, String bundleName) async {
          final report = await const ContractTestRunner().run(owner, owner.roots.single.id, selectedCases: ['saved'],
            resolveSecret: (_) async => 'credential%2C');
          expect(report.passed, true, reason: '${report.toJson()}');
          expect(seen.last, 'literal=a%20b; one=safe; right=true; percent=%2C; flag2=false; single=a%20b; auth=credential%2C');
          final plan = await owner.prepareRequest(owner.roots.single.id, resource: owner.roots.single.id, pointer: '/paths/~1p/get');
          try {
            await expectLater(const ContractRequestBuilder().build(plan, OperationRequestDraft(planIdentity: plan.identity,
              environment: 'manual', parameters: {
                OperationRequestDraft.parameterKey(location, 'descriptionOnly'): const RequestValue.json('{"q":"a+b"}'),
                OperationRequestDraft.parameterKey('cookie', bundleName): bundleName == 'bundle'
                    ? const RequestValue.json('{"auth":"explicit"}') : const RequestValue.text('explicit'),
              }), resolveSecret: (_) async => throw StateError('An explicit authentication cookie must prevent acquisition')),
              throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'request.security.collision')));
          } finally { plan.close(); }
        }
        await exercise(project, 'querystring', 'bundle');
        final review = await project.prepareMigration(project.roots.single.id, '${directory.path}/output', targetVersion: target);
        addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');
        final records = (review.result['configurationProjections'] as List).cast<Map>();
        expect(records.any((record) => record.containsKey('cookieGroups')), true);expect(records.any((record) => record.containsKey('cookieUnwraps')), true);
        await review.publish();expect(await config.readAsString(), configuration);await file.delete();
        final cold = await BusyProject.open(review.destination, engine);addTearDown(cold.close);await exercise(cold, 'query', 'auth');
      });
    }
  }
  for (final target in ['3.1.2', '3.0.4', '2.0']) {
    test('R3c-2 $target preserves field permutations, empty queries and repeated arrays', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-factor-wire-');
      addTearDown(() => directory.delete(recursive: true));
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      final seen = <String>[];
      server.listen((request) async {seen.add(request.uri.toString());request.response.statusCode = 204;await request.response.close();});
      final file = File('${directory.path}/api.json');
      final source = r3cFactoredSource('3.2.1', server.port)
          .replaceFirst('"required":true', '"required":false').replaceFirst('"required":["flag"],', '');
      await file.writeAsString(source);
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
      final review = await project.prepareMigration(project.roots.single.id, '${directory.path}/output', targetVersion: target);
      addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');await review.publish();
      final cold = await BusyProject.open(review.destination, engine);addTearDown(cold.close);
      final values = <Map<String, Object>>[{},
        for (final array in [<String>[], [''], ['a+b', 'a+b']]) ...[
          {'text': '', 'q': array, 'flag': false}, {'flag': false, 'q': array, 'text': ''},
        ],
      ];
      for (final value in values) {
        final targets = <String>[];
        for (final owner in [project, cold]) {
          final root = owner.roots.single.id;
          final plan = await owner.prepareRequest(root, resource: root, pointer: '/paths/~1shared/get');
          try {
            final response = await const ContractRequestExecutor().execute(plan,
              OperationRequestDraft(planIdentity: plan.identity, parameters: owner == project ? {
                OperationRequestDraft.parameterKey('querystring', 'descriptionOnly'): RequestValue.json(jsonEncode(value)),
              } : {
                for (final entry in value.entries)
                  OperationRequestDraft.parameterKey('query', entry.key): RequestValue.json(jsonEncode(entry.value)),
              }), resolveSecret: (_) async => null);
            try {expect(response.conforming, true);targets.add(seen.last);} finally {await response.close();}
          } finally {plan.close();}
        }
        expect(targets[1], targets[0]);if (value.isEmpty) expect(targets.first, '/shared');
      }
    });
  }

  for (final version in ['3.2.0', '3.2.1']) {
    test('R3c-1 $version migration retains actual repeated request targets', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-array-wire-');
      addTearDown(() => directory.delete(recursive: true));
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);addTearDown(() => server.close(force: true));
      final seen = <String>[];
      server.listen((request) async {seen.add(request.uri.toString());request.response.statusCode = 204;await request.response.close();});
      final file = File('${directory.path}/api.json');await file.writeAsString(r3cRepeatedSource(version, server.port));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
      final review = await project.prepareMigration(project.roots.single.id, '${directory.path}/output', targetVersion: '3.0.4');
      addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');await review.publish();
      final cold = await BusyProject.open(review.destination, engine);addTearDown(cold.close);
      for (final values in [<String>[], [''], ['a+b'], ['a+b', 'a+b'], ['%20', '雪'], ['/?&=#']]) {
        final targets = <String>[];
        for (final owner in [project, cold]) {
          final root = owner.roots.single.id;
          final plan = await owner.prepareRequest(root, resource: root, pointer: '/paths/~1shared/get');
          try {
            final response = await const ContractRequestExecutor().execute(plan,
              OperationRequestDraft(planIdentity: plan.identity, parameters: {
                OperationRequestDraft.parameterKey(owner == project ? 'querystring' : 'query', owner == project ? 'descriptionOnly' : 'q'):
                  RequestValue.json(jsonEncode(owner == project ? {'q': values} : values)),
              }), resolveSecret: (_) async => 'credential');
            try {expect(response.conforming, true);targets.add(seen.last);} finally {await response.close();}
          } finally {plan.close();}
        }
        expect(targets[0], targets[1]);
        final query = values.map((value) => 'q=${Uri.encodeQueryComponent(value)}').join('&');
        expect(targets.first, '/shared${query.isEmpty ? '' : '?$query'}');
      }
    });
  }
  for (final version in ['3.0.4', '3.1.2', '3.2.1']) {
    test('R3c $version cookie content sends literal percent sequences, empty and omitted values', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-literal-cookie-');
      addTearDown(() => directory.delete(recursive: true));
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final seen = <String?>[];
      server.listen((request) async {
        seen.add(request.headers.value('cookie'));request.response.statusCode = 204;await request.response.close();
      });
      final file = File('${directory.path}/api.json');
      const values = ['a%20b', '%zz', '%', 'a+b', 'a/b', 'a=b', '!', ''];
      await file.writeAsString(jsonEncode({'openapi': version, 'info': {'title': 'Literal cookies', 'version': '1'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}], 'paths': {'/p': {'get': {
          'parameters': [{'name': 'token', 'in': 'cookie', 'content': {'text/plain': {'schema': {'type': 'string', 'enum': values}}}}],
          'responses': {'204': {'description': 'Empty'}},
        }}}}));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine);addTearDown(project.close);
      final root = project.roots.single.id;
      final plan = await project.prepareRequest(root, resource: root, pointer: '/paths/~1p/get');addTearDown(plan.close);
      for (final value in [...values, null]) {
        final response = await const ContractRequestExecutor().execute(plan,
          OperationRequestDraft(planIdentity: plan.identity, parameters: {
            if (value != null) OperationRequestDraft.parameterKey('cookie', 'token'): RequestValue.text(value),
          }), resolveSecret: (_) async => null);
        try {expect(response.conforming, true);expect(seen.last, value == null ? null : 'token=$value');}
        finally {await response.close();}
      }
    });
  }
  for (final version in ['3.0.4', '2.0', '3.1.2', '3.2.1']) {
    test(
      '$version actual parameter bytes distinguish empty names from whole queries',
      () async {
        final legacy = version == '2.0';
        final temp = await Directory.systemTemp.createTemp(
          'busyapi-parameter-wire-',
        );
        addTearDown(() => temp.delete(recursive: true));
        final seen = <(String, String, String?, List<int>)>[];
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        server.listen((request) async {
          final bytes = await request.fold<List<int>>(
            [],
            (all, chunk) => all..addAll(chunk),
          );
          seen.add((
            request.method,
            request.uri.toString(),
            request.headers.value('__proto__'),
            bytes,
          ));
          request.response.statusCode = 204;
          await request.response.close();
        });
        Map<String, dynamic> parameter(
          String name,
          String location,
          Map<String, dynamic> schema,
        ) => {
          'name': name,
          'in': location,
          'required': true,
          if (legacy)
            ...schema
          else ...{
            'schema': schema,
            if (name == 'q') ...{'style': 'form', 'explode': false},
          },
        };
        final value = {
          if (legacy) 'swagger': version else 'openapi': version,
          'info': {'title': 'Parameter bytes', 'version': 'api-version'},
          if (legacy) ...{
            'host': '127.0.0.1:${server.port}',
            'basePath': '/v1',
            'schemes': ['http'],
          } else
            'servers': [
              {'url': 'http://127.0.0.1:${server.port}/v1'},
            ],
          'paths': {
            '/p': {
              'post': {
                'parameters': [
                  parameter('', 'query', {
                    'type': 'string',
                    'enum': ['empty name', ''],
                  }),
                  parameter('__proto__', 'query', {
                    'type': 'string',
                    'enum': ['query'],
                  }),
                  parameter('__proto__', 'header', {
                    'type': 'string',
                    'enum': ['header'],
                  }),
                  parameter('q', 'query', {
                    'type': 'array',
                    'minItems': 2,
                    'maxItems': 2,
                    'items': {
                      'type': 'integer',
                      'enum': ['EXACT_VALUE', 0],
                    },
                  }),
                ],
                'responses': {
                  '204': {'description': 'Accepted'},
                },
              },
            },
            '/empty': {
              'post': {
                'parameters': [
                  {
                    ...parameter('', 'query', {
                      'type': 'string',
                      'enum': [''],
                    }),
                    if (legacy) 'allowEmptyValue': true,
                  },
                ],
                'responses': {
                  '204': {'description': 'Accepted'},
                },
              },
            },
          },
        };
        final source = File('${temp.path}/api.json');
        final original = jsonEncode(value)
            .replaceAll('"EXACT_VALUE"', '9007199254740993.00');
        await source.writeAsString(original);
        final engine = EngineProcess(
          executable: runtimeNode,
          helper: runtimeHelper,
        );
        addTearDown(engine.close);
        final project = await BusyProject.open(source.path, engine);
        addTearDown(project.close);
        final checked = await project.check(source.uri.toString());
        expect(checked['complete'], true, reason: '$checked');
        expect(
          (checked['findings'] as List).whereType<Map>().where(
            (finding) => finding['severity'] == 'error',
          ),
          isEmpty,
        );
        final operation = (checked['projection']['operations'] as List)
            .whereType<Map>()
            .where((operation) => operation['path'] == '/p')
            .single;
        final plan = await project.prepareRequest(
          source.uri.toString(),
          resource: operation['resource'] as String,
          pointer: operation['pointer'] as String,
          occurrence: operation['occurrence'] as String,
        );
        addTearDown(plan.close);
        final requestValues = {
          OperationRequestDraft.parameterKey('query', ''):
              const RequestValue.text('empty name'),
          OperationRequestDraft.parameterKey('query', '__proto__'):
              const RequestValue.text('query'),
          OperationRequestDraft.parameterKey('header', '__proto__'):
              const RequestValue.text('header'),
          OperationRequestDraft.parameterKey('query', 'q'):
              const RequestValue.json('[9007199254740993,0]'),
        };
        final result = await const ContractRequestExecutor().execute(
          plan,
          OperationRequestDraft(
            planIdentity: plan.identity,
            parameters: requestValues,
          ),
          resolveSecret: (_) async => null,
        );
        addTearDown(result.close);
        expect(result.response.status, 204);
        expect(result.outgoing.complete, true);
        expect(
          result.outgoing.valid,
          true,
          reason: '${result.outgoing.findings}',
        );
        expect(seen, hasLength(1));
        expect(seen.single.$1, 'POST');
        expect(
          seen.single.$2,
          '/v1/p?=empty%20name&__proto__=query&q=9007199254740993${legacy ? '%2C' : ','}0',
        );
        expect(seen.single.$3, 'header');
        expect(seen.single.$4, isEmpty);
        if (legacy) {
          await expectLater(
            const ContractRequestExecutor().execute(
              plan,
              OperationRequestDraft(
                planIdentity: plan.identity,
                parameters: {
                  ...requestValues,
                  OperationRequestDraft.parameterKey('query', ''):
                      const RequestValue.text(''),
                },
              ),
              resolveSecret: (_) async => null,
            ),
            throwsA(
              isA<CoreFailure>().having(
                (failure) => failure.code,
                'code',
                'request.parameter.empty',
              ),
            ),
          );
          expect(
            seen,
            hasLength(1),
            reason: 'A forbidden empty query cannot dispatch',
          );
        }
        final emptyOperation = (checked['projection']['operations'] as List)
            .whereType<Map>()
            .singleWhere((operation) => operation['path'] == '/empty');
        final emptyPlan = await project.prepareRequest(
          source.uri.toString(),
          resource: emptyOperation['resource'] as String,
          pointer: emptyOperation['pointer'] as String,
          occurrence: emptyOperation['occurrence'] as String,
        );
        addTearDown(emptyPlan.close);
        final emptyResult = await const ContractRequestExecutor().execute(
          emptyPlan,
          OperationRequestDraft(
            planIdentity: emptyPlan.identity,
            parameters: {
              OperationRequestDraft.parameterKey('query', ''):
                  const RequestValue.text(''),
            },
          ),
          resolveSecret: (_) async => null,
        );
        addTearDown(emptyResult.close);
        expect(emptyResult.response.status, 204);
        expect(emptyResult.outgoing.complete, true);
        expect(emptyResult.outgoing.valid, true);
        expect(seen, hasLength(2));
        expect(seen.last.$2, '/v1/empty?=');
        expect(seen.last.$4, isEmpty);
        expect(await source.readAsString(), original);
      },
    );
  }
}
