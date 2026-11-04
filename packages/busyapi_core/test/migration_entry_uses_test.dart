import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';
import 'migration_mixed_holder_fixture.dart';

void main() {
  test('declared legacy substitution is refused before Core publication', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-legacy-family-refusal-');addTearDown(() => directory.delete(recursive: true));
    final documents = mixedHolderDocuments('3.0.4', 'https://api.invalid');
    final primary = jsonDecode(documents['a.yaml']!.split('\r\n')[1]) as Map;
    primary['paths']['/local']['post']['responses']['200']['content']['application/json']['schema'] = {
      r'$ref': 'b.yaml#/paths/~1p/post/responses/200/content/application~1json/schema',
    };
    documents['a.yaml'] = jsonEncode(primary);
    for (final entry in documents.entries) await File('${directory.path}/${entry.key}').writeAsString(entry.value);
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
    final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
    final root = File('${directory.path}/a.yaml').uri.toString();
    final review = await source.prepareMigration(root, '${directory.path}/refused', targetVersion: '3.2.1');addTearDown(review.close);
    expect(review.publishable, false);expect(review.result['outputs'], isEmpty);
    expect((review.result['problems'] as List).whereType<Map>().any((problem) => problem['code'].toString().contains('reference.family')), true);
    await expectLater(review.publish(), throwsA(isA<CoreFailure>()));expect(Directory(review.destination).existsSync(), false);
    for (final entry in documents.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
  });
  for (final foreignVersion in ['3.1.2']) {
    test('mixed $foreignVersion component owners retain native bindings and wire behavior after relocation', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-mixed-owners-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      const wire = '{"value":9007199254740993.00,"entry":"chosen"}';
      const dictionaryWire = '{"a":{"value":9007199254740993.00,"entry":"chosen"}}';
      final sent = <List<int>>[];
      server.listen((request) async {
        if (request.uri.path == '/dictionary') {
          expect(request.method, 'GET');
          expect(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)), isEmpty);
          request.response.headers.set('content-type', 'application/json');
          request.response.add(utf8.encode(dictionaryWire));
          await request.response.close();
          return;
        }
        expect(request.method, 'POST');
        sent.add(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)));
        request.response.headers.set('content-type', 'application/json');
        request.response.add(utf8.encode(wire));
        await request.response.close();
      });
      Map<String, Object?> api(String version, String title, String prefix) => {
        'openapi': version, 'info': {'title': title, 'version': 'business'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/p': {'post': {
          'requestBody': {'content': {'application/json': {'schema': {r'$ref': '$prefix#/components/schemas/Base'}}}},
          'responses': {'200': {'description': 'Value', 'headers': {'X-Value': {r'$ref': '$prefix#/components/headers/Shared'}},
            'content': {'application/json': {'schema': {r'$ref': '$prefix#/components/schemas/Base'}}}}},
        }}},
        'components': {'schemas': {'Choice': {'allOf': [{r'$ref': 'b.yaml#/components/schemas/Base'}], 'x-entry': title}}},
      };
      final first = api('3.2.1', 'First', 'b.yaml'), second = api(foreignVersion, 'Second', '');
      final model = {
        if (foreignVersion == '3.1.2') r'$dynamicAnchor': 'node',
        'type': 'object', 'properties': {'value': {'type': 'integer', 'enum': ['EXACT']}, 'entry': {'type': 'string'},
          if (foreignVersion == '3.1.2') 'child': {r'$dynamicRef': '#node'}},
        'required': ['value', 'entry'], 'discriminator': {'propertyName': 'entry', 'mapping': {'chosen': 'Choice'}},
      };
      (second['components'] as Map)['schemas']['Base'] = model;
      (second['components'] as Map)['headers'] = {'Shared': {'schema': {r'$ref': '#/components/schemas/Base'}}};
      second['x-history'] = model;
      if (foreignVersion == '3.1.2') {
        (first['components'] as Map)['schemas']['Dictionary'] = {r'$ref': 'b.yaml#/components'};
        (first['components'] as Map)['schemas']['Document'] = {r'$ref': 'b.yaml#'};
        (first['components'] as Map)['schemas']['Assertions'] = {r'$ref': 'b.yaml#/components/schemas'};
        (second['components'] as Map)['schemas']['additionalProperties'] = {'allOf': [{r'$ref': '#/components/schemas/Base'}]};
        (second['components'] as Map)['schemas']['propertyNames'] = {'enum': ['a', '雪']};
        (first['paths'] as Map)['/dictionary'] = {'get': {'responses': {'200': {
          'description': 'Dictionary', 'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Assertions'}}},
        }}}};
      }
      String encode(Map value) => '# Keep mixed source 雪\r\n${jsonEncode(value).replaceAll('"EXACT"', '9007199254740993.00')}\r\n';
      final originals = {'a.yaml': encode(first), 'b.yaml': encode(second)};
      for (final entry in originals.entries) await File('${directory.path}/${entry.key}').writeAsString(entry.value);
      await File('${directory.path}/busyapi.yaml').writeAsString('version: 1\nroots:\n  - name: first\n    path: a.yaml\n  - name: second\n    path: b.yaml\n');
      final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
      final roots = [File('${directory.path}/a.yaml').uri.toString(), File('${directory.path}/b.yaml').uri.toString()];
      Future<void> exercise(BusyProject project, String root, {bool dictionary = false}) async {
        expect((await project.check(root))['status'], 'complete');
        final plan = await project.prepareRequest(root, resource: root, pointer: '/paths/~1p/post');
        try {
          final body = ((((plan.result['responses'] as List).single as Map)['content'] as List).single as Map)['schema'] as Map;
          Future<Map<String, dynamic>> material(Map start) async {
            var at = Map<String, dynamic>.from(start);
            for (var count = 0; count < 64; count++) {
              final page = await project.inspectObject(root, at['resource'], at['pointer'], contextKind: 'schema');
              final reference = (page['references'] as List).whereType<Map>().where((ref) => ref['keyword'] == r'$ref').firstOrNull;
              if (reference == null) return page;
              expect(reference['resolution'], 'resolved');at = Map<String, dynamic>.from(reference['target']);
            }
            fail('The reviewed material owner forwarding must remain bounded');
          }
          final at = await material(body);
          if (dictionary) {
            final annotation = await material({'resource': root, 'pointer': '/components/schemas/Dictionary'});
            final raw = (annotation['entries'] as List).whereType<Map>().singleWhere((entry) => entry['name'] == 'schemas')['raw'] as String;
            expect(raw, contains('9007199254740993.00'));
            final schemas = jsonDecode(raw) as Map;
            expect(schemas.keys.toSet(), {'Choice', 'Base', 'additionalProperties', 'propertyNames'});
            expect(schemas['Base']['discriminator']['mapping'], {'chosen': 'Choice'});
            expect(schemas['Choice']['x-entry'], 'Second');
            final document = await material({'resource': root, 'pointer': '/components/schemas/Document'});
            final version = (document['entries'] as List).whereType<Map>().singleWhere((entry) => entry['name'] == 'openapi');
            expect(version['value'], foreignVersion);
            final assertions = await material({'resource': root, 'pointer': '/components/schemas/Assertions'});
            final field = (assertions['fields'] as List).cast<Map>().singleWhere((field) => field['name'] == 'additionalProperties');
            expect(field['present'], true);expect(field['childKind'], 'schema');
          }
          final mapping = await project.inspectObject(root, at['resource'], '${at['pointer']}/discriminator/mapping', contextKind: 'discriminator-map');
          final binding = (mapping['references'] as List).whereType<Map>().single;
          expect(binding['targetResource'], root);expect(binding['targetPointer'], '/components/schemas/Choice');
          final result = await plan.evaluateRuntime([
            for (final text in [wire, '{"value":0}', '{"value":"wrong"}']) RuntimeSchemaInstance(
              subject: 'response-body', location: 'application/json', text: text,
              schemaResource: body['resource'], schemaPointer: body['pointer']),
          ]);
          expect(result['complete'], true, reason: '$result');
          expect((result['runtimeEvaluations'] as List).map((value) => value['valid']), [true, false, false]);
          final response = await const ContractRequestExecutor().execute(plan,
            OperationRequestDraft(planIdentity: plan.identity, body: RequestBodyDraft.raw(mediaType: 'application/json', text: wire)), resolveSecret: (_) async => null);
          try { expect(response.conforming, true, reason: '${response.outgoing.findings} ${response.received.findings}');expect(await response.response.bytes(), utf8.encode(wire));expect(sent.last, utf8.encode(wire)); }
          finally { await response.close(); }
        } finally { plan.close(); }
        if (dictionary) {
          final dictionaryPlan = await project.prepareRequest(root, resource: root, pointer: '/paths/~1dictionary/get');
          try {
            final body = ((((dictionaryPlan.result['responses'] as List).single as Map)['content'] as List).single as Map)['schema'] as Map;
            final result = await dictionaryPlan.evaluateRuntime([
              for (final text in [dictionaryWire, '{"雪":{"value":9007199254740993,"entry":"chosen"}}', '{"a":{"value":0,"entry":"chosen"}}', '{"bad":{"value":9007199254740993,"entry":"chosen"}}']) RuntimeSchemaInstance(
                subject: 'response-body', location: 'application/json', text: text,
                schemaResource: body['resource'], schemaPointer: body['pointer']),
            ]);
            expect(result['complete'], true, reason: '$result');
            expect((result['runtimeEvaluations'] as List).map((value) => value['valid']), [true, true, false, false]);
            final response = await const ContractRequestExecutor().execute(dictionaryPlan,
              OperationRequestDraft(planIdentity: dictionaryPlan.identity), resolveSecret: (_) async => null);
            try {
              expect(response.conforming, true, reason: '${response.received.findings}');
              expect(await response.response.bytes(), utf8.encode(dictionaryWire));
            } finally { await response.close(); }
          } finally { dictionaryPlan.close(); }
        }
      }
      await exercise(source, roots[0], dictionary: foreignVersion == '3.1.2');await exercise(source, roots[1]);
      final buffer = await source.buffer(roots[0]);source.store.replace(buffer.id, buffer.text.replaceFirst('First', 'Captured First'));
      final stale = await source.prepareMigration(roots[0], '${directory.path}/stale', targetVersion: '3.2.1');addTearDown(stale.close);
      expect(stale.publishable, true, reason: '${stale.result}');
      source.store.replace(buffer.id, buffer.text.replaceFirst('Captured First', 'Current First'));
      await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
      final review = await source.prepareMigration(roots[0], '${directory.path}/converted', targetVersion: '3.2.1');addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');expect(review.unsaved, true);
      await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
      expect(Directory(review.destination).existsSync(), false);await review.publish();
      for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
      final destinations = [for (final root in roots) Uri.parse(review.changes.singleWhere((change) => change.resource == root).destination).pathSegments.last];
      source.close();final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');
      for (final name in originals.keys) await File('${directory.path}/$name').delete();
      final cold = await BusyProject.open(relocated.path, engine);addTearDown(cold.close);
      for (final (index, name) in destinations.indexed) {
        await exercise(cold, File('${relocated.path}/$name').uri.toString(), dictionary: index == 0 && foreignVersion == '3.1.2');
      }
      final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'], environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
    });
  }
  test('identified native map children retain exact HTTP semantics after captured publication and original deletion', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-retained-map-');
    addTearDown(() => directory.delete(recursive: true));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    const wire = '{"雪":9007199254740993.00,"value":false}';
    server.listen((request) async {
      expect(request.method, 'GET');expect(request.uri.path, '/dictionary');
      expect(await request.fold<List<int>>([], (bytes, chunk) => bytes..addAll(chunk)), isEmpty);
      request.response.headers.set('content-type', 'application/json');
      request.response.add(utf8.encode(wire));await request.response.close();
    });
    final root = File('${directory.path}/a.json'), other = File('${directory.path}/b.yaml');
    await root.writeAsString(jsonEncode({
      'openapi': '3.2.1', 'info': {'title': 'Retained', 'version': '1'},
      'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
      'paths': {'/dictionary': {'get': {'responses': {'200': {'description': 'Values', 'content': {
        'application/json': {'schema': {r'$ref': '#/components/schemas/Target'}},
      }}}}}},
      'components': {'schemas': {
        'Target': {r'$ref': 'b.yaml#/components/schemas'},
        'Other': {'type': 'object', 'properties': {'kind': {'const': 'Other'}}},
        'Chooser': {'required': ['kind'], 'discriminator': {'propertyName': 'kind'}, 'oneOf': [
          {r'$ref': '#/components/schemas/Target'}, {r'$ref': '#/components/schemas/Other'},
        ]},
      }},
    }));
    const material = '{"\$id":"https://schemas.invalid/retained","type":"integer","enum":[9007199254740993.00]}';
    const secondary = '{"\$id":"https://schemas.invalid/secondary","type":"boolean","const":false}';
    await other.writeAsString('# retained 雪\r\nopenapi: 3.1.2\r\ninfo: {title: Resource, version: "1"}\r\npaths: {}\r\ncomponents:\r\n  schemas:\r\n    additionalProperties: $material\r\n    properties: {value: $secondary}\r\nx-history: $material\r\nx-secondary: $secondary\r\n');
    final originals = [await root.readAsBytes(), await other.readAsBytes()];
    Future<void> exercise(BusyProject project, String entry) async {
      expect((await project.check(entry))['status'], 'complete');
      final prepared = await project.prepareRequest(entry, resource: entry, pointer: '/paths/~1dictionary/get');
      try {
        final body = ((((prepared.result['responses'] as List).single as Map)['content'] as List).single as Map)['schema'] as Map;
        final evaluated = await prepared.evaluateRuntime([
          for (final value in [wire, '{}', '{"雪":0}', '{"value":true}']) RuntimeSchemaInstance(
            subject: 'response-body', location: 'application/json', text: value,
            schemaResource: body['resource'], schemaPointer: body['pointer']),
        ]);
        expect(evaluated['complete'], true, reason: '$evaluated');
        expect((evaluated['runtimeEvaluations'] as List).map((value) => value['valid']), [true, true, false, false]);
        final response = await const ContractRequestExecutor().execute(prepared,
          OperationRequestDraft(planIdentity: prepared.identity), resolveSecret: (_) async => null);
        try { expect(response.conforming, true, reason: '${response.received.findings}');expect(await response.response.bytes(), utf8.encode(wire)); }
        finally { await response.close(); }
      } finally { prepared.close(); }
    }
    final source = await BusyProject.open(root.path, engine);addTearDown(source.close);
    await exercise(source, root.uri.toString());
    final review = await source.prepareMigration(root.uri.toString(), '${directory.path}/output', targetVersion: '3.2.1');
    addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');
    await review.publish();expect([await root.readAsBytes(), await other.readAsBytes()], originals);
    source.close();final relocated = await Directory(review.destination).rename('${directory.path}/cold');
    await root.delete();await other.delete();
    final cold = await BusyProject.open(relocated.path, engine);addTearDown(cold.close);
    final entryName = Uri.parse(review.changes.singleWhere((change) => change.resource == root.uri.toString()).destination).pathSegments.last;
    final entry = File('${relocated.path}/$entryName').uri.toString();await exercise(cold, entry);
    final otherName = Uri.parse(review.changes.singleWhere((change) => change.resource == other.uri.toString()).destination).pathSegments.last;
    final page = await cold.inspectObject(entry, File('${relocated.path}/$otherName').uri.toString(), '/components/schemas/additionalProperties', contextKind: 'schema');
    expect(page['value'][r'$id'], 'https://schemas.invalid/retained');
    final literal = await cold.inspectObject(entry, File('${relocated.path}/$otherName').uri.toString(), '/components/schemas/properties', contextKind: 'schema');
    expect(literal['value']['value'][r'$id'], 'https://schemas.invalid/secondary');
    final view = await cold.inspectObject(entry, entry, '/components/schemas/Target', contextKind: 'schema');
    final target = (view['references'] as List).single['target'] as Map;
    final child = await cold.inspectObject(entry, target['resource'], '${target['pointer']}/properties/value', contextKind: 'schema');
    expect(child['value'][r'$id'], 'https://schemas.invalid/secondary');
    expect(child['value']['const'], false);
    expect(await File('${relocated.path}/$otherName').readAsString(), contains('9007199254740993.00'));
    final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'], environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
    expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
  });
  test('entry operation owners retain Link navigation and native fields after specialization', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-operation-owners-');
    addTearDown(() => directory.delete(recursive: true));
    Map<String, Object?> api(String name) => {
      'openapi': '3.2.1', 'info': {'title': name, 'version': 'business'},
      'servers': [{'url': 'https://api.invalid'}],
      'paths': {'/p': {r'$ref': 'shared.json#/Path'}},
      'components': {
        'securitySchemes': {'Access': {'type': 'apiKey', 'in': 'header', 'name': 'X-$name'}},
        'examples': {'Entry': name == 'First' ? {r'$ref': 'b.json#/components/examples/Entry'} : {'value': 'Captured root'}},
        if (name == 'First') 'links': {'Next': {'operationId': 'shared', 'description': '[Next](../next.md)'}},
      },
    };
    final originals = {
      'a.json': jsonEncode(api('First')), 'b.json': jsonEncode(api('Second')),
      'shared.json': jsonEncode({'Path': {'get': {'operationId': 'shared', 'security': [{'Access': <String>[]}],
        'responses': {'204': {'description': 'Empty', 'links': {'Next': {r'$ref': 'a.json#/components/links/Next'}}}}}},
        'Literal': {'operationId': 'shared', 'flag': false, 'empty': ''}}),
    };
    for (final entry in originals.entries) await File('${directory.path}/${entry.key}').writeAsString(entry.value);
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
    final source = await BusyProject.open('${directory.path}/a.json', engine);addTearDown(source.close);
    final roots = [File('${directory.path}/a.json').uri.toString(), File('${directory.path}/b.json').uri.toString()];
    Future<void> inspect(BusyProject owner, String root, String name, bool converted) async {
      final checked = await owner.check(root);expect(checked['complete'], true, reason: '$checked');
      final projection = checked['projection'] as Map, operation = (projection['operations'] as List).whereType<Map>().single;
      final link = (projection['references'] as List).whereType<Map>().singleWhere((value) =>
          value['connection'] == 'operationId' || value['connection'] == 'operationRef');
      expect(link['resolution'], 'resolved');expect(link['targetResource'], operation['resource']);expect(link['targetPointer'], operation['pointer']);
      final field = converted ? 'operationRef' : 'operationId';expect(link['connection'], field);
      final pointer = link['pointer'] as String;
      final page = await owner.inspectObject(root, link['resource'] as String,
          pointer.substring(0, pointer.lastIndexOf('/')), contextKind: 'link');
      final selected = (page['fields'] as List).whereType<Map>().singleWhere((value) => value['name'] == field);
      expect(selected['present'], true);
      final plan = await owner.prepareRequest(root, resource: operation['resource'] as String,
          pointer: operation['pointer'] as String, occurrence: operation['occurrence'] as String);
      try {
        expect((plan.result['operation'] as Map)['operationId'], 'shared');
        expect((((plan.result['security'] as Map)['schemes'] as Map)['Access'] as Map)['parameterName'], 'X-$name');
      } finally { plan.close(); }
    }
    await inspect(source, roots[0], 'First', false);await inspect(source, roots[1], 'Second', false);
    final review = await source.prepareMigration(roots[0], '${directory.path}/converted', targetVersion: '3.1.2');addTearDown(review.close);
    expect(review.publishable, true, reason: '${review.result}');await review.publish();
    final migrated = {for (final root in roots) root: review.changes.singleWhere((change) => change.resource == root).destination};
    for (final entry in originals.entries) expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
    source.close();
    final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');
    for (final name in originals.keys) await File('${directory.path}/$name').delete();
    final cold = await BusyProject.open(relocated.path, engine);addTearDown(cold.close);
    for (final (index, name) in [(0, 'First'), (1, 'Second')]) {
      final root = File('${relocated.path}/${Uri.parse(migrated[roots[index]]!).pathSegments.last}').uri.toString();
      await inspect(cold, root, name, true);
    }
    final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'],
      environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
    expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
  });
  for (final owner in ['ordinary', 'identified', 'partial']) {
    final identified = owner == 'identified', modernSource = owner != 'ordinary';
    test('cross-entry $owner owners preserve behavior through captured review, HTTP, publication and CLI', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-entry-uses-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      var returned = 'null';
      final sent = <List<int>>[];
      server.listen((request) async {
        expect(request.method, 'POST');
        expect(request.uri.path, '/p');
        sent.add(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)));
        request.response.headers.set('content-type', 'application/json');
        request.response.headers.set('X-Name', 'Name');
        request.response.add(utf8.encode(returned));
        await request.response.close();
      });
      Map<String, Object?> entry(String version, String title) => {
        'openapi': version, 'info': {'title': title, 'version': 'business'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/p': {'post': {
          'requestBody': {'required': true, 'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Model'}}}},
          'responses': {'200': {'description': 'Response', 'headers': {'X-Name': {r'$ref': 'headers.yaml#/Header'}},
            'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Model'}}}}},
        }}},
        'components': {'schemas': {'Model': {r'$ref': 'models.yaml#/Forward'}}, 'examples': {
          // Capture the second complete description without coupling the two
          // entry-specific Schema Objects to one another's runtime consumers.
          'Entry': title == 'Legacy' ? {r'$ref': 'modern.yaml#/components/examples/Entry'} : {'value': 'Modern entry'},
        }},
      };
      final originals = {
        'legacy.yaml': '# Keep legacy 雪\r\n${jsonEncode(entry(modernSource ? '3.1.2' : '3.0.4', 'Legacy'))}\r\n',
        'modern.yaml': '# Keep modern 雪\r\n${jsonEncode(entry('3.2.1', 'Modern'))}\r\n',
        'models.yaml': 'Forward: {\$ref: "#/Node"}\r\nNode: {${identified ? r'$id: "https://schemas.invalid/shared", ' : ''}${modernSource ? r'$dynamicAnchor: node, ' : ''}type: string, minLength: 1, nullable: true, description: "[Guide](guide.md)"}\r\n',
        'headers.yaml': 'Header: {description: "[Header](header.md)", schema: {${owner == 'partial' ? r'$dynamicAnchor: header, ' : ''}type: string, minLength: 1}}\r\n',
      };
      for (final entry in originals.entries) {
        await File('${directory.path}/${entry.key}').writeAsString(entry.value);
      }
      final source = await BusyProject.open('${directory.path}/legacy.yaml', engine);
      addTearDown(source.close);
      final legacy = File('${directory.path}/legacy.yaml').uri.toString();
      final modern = File('${directory.path}/modern.yaml').uri.toString();
      final buffer = await source.buffer(legacy);
      source.store.replace(legacy, buffer.text.replaceFirst('Legacy', 'Captured 雪'));

      Future<void> exercise(BusyProject project, String root, bool nullable) async {
        final plan = await project.prepareRequest(root, resource: root, pointer: '/paths/~1p/post');
        try {
          final schema = ((((plan.result['responses'] as List).single as Map)['content'] as List).single as Map)['schema'] as Map;
          final checked = await plan.evaluateRuntime([
            for (final text in ['null', '"雪"', '""']) RuntimeSchemaInstance(
              subject: 'response-body', location: text, text: text,
              schemaResource: schema['resource'] as String, schemaPointer: schema['pointer'] as String,
            ),
          ]);
          expect(checked['complete'], true, reason: '$checked');
          expect((checked['runtimeEvaluations'] as List).map((value) => value['valid']), [nullable, true, false]);
          returned = nullable ? 'null' : '"雪"';
          final response = await const ContractRequestExecutor().execute(plan,
              OperationRequestDraft(planIdentity: plan.identity, body: RequestBodyDraft.raw(mediaType: 'application/json', text: '"雪"')),
              resolveSecret: (_) async => null);
          try {
            expect(response.conforming, true, reason: '${response.outgoing.findings} ${response.received.findings}');
            expect(await response.response.bytes(), utf8.encode(returned));
            expect(sent.last, utf8.encode('"雪"'));
          } finally { await response.close(); }
        } finally { plan.close(); }
      }
      await exercise(source, legacy, !modernSource); await exercise(source, modern, false);
      final stale = await source.prepareMigration(legacy, '${directory.path}/stale', targetVersion: '3.2.1');
      addTearDown(stale.close);
      expect(stale.publishable, true, reason: '${stale.result}');
      source.store.replace(legacy, source.store.buffers[legacy]!.text.replaceFirst('Captured 雪', 'Latest 雪'));
      await expectLater(stale.publish(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
      expect(Directory(stale.destination).existsSync(), false);
      final review = await source.prepareMigration(legacy, '${directory.path}/converted', targetVersion: '3.2.1');
      addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}'); expect(review.unsaved, true);
      await expectLater(review.publish(cancelled: () => true), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
      expect(Directory(review.destination).existsSync(), false);
      await review.publish();
      for (final entry in originals.entries) {
        expect(await File('${directory.path}/${entry.key}').readAsString(), entry.value);
      }
      final migrated = {
        for (final id in [legacy, modern]) id: review.changes.singleWhere((change) => change.resource == id).destination,
      };
      final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');
      source.close();
      for (final name in originals.keys) { await File('${directory.path}/$name').delete(); }
      final cold = await BusyProject.open(relocated.path, engine); addTearDown(cold.close);
      expect(cold.roots, hasLength(2));
      for (final (id, nullable) in [(legacy, !modernSource), (modern, false)]) {
        final path = Uri.parse(migrated[id]!).pathSegments.last;
        final root = File('${relocated.path}/$path').uri.toString();
        expect((await cold.check(root))['status'], 'complete');
        await exercise(cold, root, nullable);
      }
      final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'],
          environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
      expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
    });
  }
}
