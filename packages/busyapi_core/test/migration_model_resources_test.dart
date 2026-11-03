import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  test('shared model, boolean and literal resource owners retain native choices and HTTP behavior after cold publication', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-model-resources-');
    addTearDown(() => directory.delete(recursive: true));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    const bodies = {'/model': '{"kind":"chosen","n":0}', '/choice': '{"kind":"Choice"}', '/literal': '{"n":0,"child":{"n":1}}'};
    server.listen((request) async {
      expect(request.method, 'GET');expect(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)), isEmpty);
      request.response.headers.set('content-type', 'application/json');
      request.response.add(utf8.encode(bodies[request.uri.path]!));await request.response.close();
    });
    Map<String, Object?> entry(String version, String name) => {
      'openapi': version, 'info': {'title': name, 'version': '1'},
      'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
      'paths': {for (final (path, schema) in [('/model', 'Base'), ('/choice', 'Select'), ('/literal', 'Literal')]) path: {'get': {'responses': {'200': {
        'description': 'Value', 'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/$schema'}}},
      }}}}},
      'components': {'schemas': {
        'Base': {r'$ref': 'models.json#/Node'},
        'Dog': {'allOf': [{r'$ref': '#/components/schemas/Base'}], 'x-entry': name},
        'Choice': {r'$ref': 'choice.json'}, 'Other': {'type': 'object', 'properties': {'kind': {'const': 'Other'}}},
        'Select': {'type': 'object', 'required': ['kind'], 'properties': {'kind': {'type': 'string'}},
          'oneOf': [{r'$ref': '#/components/schemas/Choice'}, {r'$ref': '#/components/schemas/Other'}], 'discriminator': {'propertyName': 'kind'}},
        'Literal': {r'$ref': 'b.yaml#/components/examples/Payload/value'},
      }},
    };
    const model = {r'$id': 'https://schemas.invalid/model', 'type': 'object', 'required': ['kind'],
      'properties': {'kind': {'type': 'string'}, 'n': {'type': 'integer'}},
      'discriminator': {'propertyName': 'kind', 'mapping': {'chosen': 'Dog'}}};
    const literal = {r'$id': 'https://schemas.invalid/recursive', r'$ref': r'#/$defs/Node', r'$defs': {'Node': {
      r'$dynamicAnchor': 'node', 'type': 'object', 'required': ['n'], 'properties': {'n': {'type': 'integer', 'minimum': 0}, 'child': {r'$dynamicRef': '#node'}},
    }}};
    final first = entry('3.2.1', 'First'), second = entry('3.1.2', 'Second');
    (second['components'] as Map)['examples'] = {'Payload': {'value': literal}};
    final files = [for (final name in ['a.json', 'b.yaml', 'models.json', 'choice.json']) File('${directory.path}/$name')];
    for (final (index, value) in [first, second, {'Node': model, 'x-literal': {'zero': 0, 'flag': false, 'empty': '', 'text': '雪'}}, true].indexed) {
      await files[index].writeAsString('${index == 1 ? '\ufeff# Keep source 雪\r\n' : ''}${jsonEncode(value)}\r\n');
    }
    await File('${directory.path}/busyapi.yaml').writeAsString('version: 1\nroots: [{name: first, path: a.json}, {name: second, path: b.yaml}]\n');
    final originals = [for (final file in files) await file.readAsBytes()];
    Future<Map<String, dynamic>> material(BusyProject project, String root, String pointer) async {
      var resource = root, at = pointer;
      for (var count = 0; count < 128; count++) {
        final page = await project.inspectObject(root, resource, at, contextKind: 'schema');
        final reference = (page['references'] as List).cast<Map>().where((value) => value['keyword'] == r'$ref').firstOrNull;
        if (reference == null) return page;
        expect(reference['resolution'], 'resolved');resource = reference['targetResource'];at = reference['targetPointer'];
      }
      fail('Material schema forwarding must remain bounded');
    }
    Future<void> exercise(BusyProject project, String root, String name, {bool delivered = false}) async {
      expect((await project.check(root))['status'], 'complete');
      final base = await material(project, root, '/components/schemas/Base');
      final metadata = await project.inspectObject(root, base['resource'], '${base['pointer']}/discriminator', contextKind: 'discriminator');
      final mapping = await project.inspectObject(root, base['resource'], '${base['pointer']}/discriminator/mapping', contextKind: 'discriminator-map');
      final binding = (mapping['references'] as List).cast<Map>().singleWhere((value) => value['keyword'] == 'chosen');
      final target = await project.inspectObject(root, binding['targetResource'], binding['targetPointer'], contextKind: 'schema');
      expect(target['value']['x-entry'], name);expect(metadata['kind'], 'discriminator');
      final boolean = await material(project, root, '/components/schemas/Choice');expect(boolean['boolean'], true);
      if (delivered) {
        expect(base['pointer'], contains(r'/$defs/'));expect(boolean['pointer'], contains(r'/$defs/'));
        final choices = await project.referenceChoices(root, base['resource'], '${base['pointer']}/discriminator', keyword: 'defaultMapping', query: '', contextKind: 'discriminator');
        expect(choices.result['complete'], true);expect((choices.result['entries'] as List).map((value) => value['label']), ['Dog']);
      }
      for (final (path, schema, texts, expected) in [
        ('/model', 'Base', [bodies['/model']!, '{"kind":"unknown"}', '{"kind":"chosen","n":false}', '{}'], [true, true, false, false]),
        ('/choice', 'Select', [bodies['/choice']!, '{"kind":"Other"}', '{}'], [true, false, false]),
        ('/literal', 'Literal', [bodies['/literal']!, '{"n":0,"child":{"n":-1}}', '{"n":"0"}'], [true, false, false]),
      ]) {
        final prepared = await project.prepareRequest(root, resource: root, pointer: '/paths/~1${path.substring(1)}/get');
        try {
          final evaluated = await prepared.evaluateRuntime([for (final text in texts) RuntimeSchemaInstance(
            subject: 'response-body', location: 'application/json', text: text, schemaResource: root, schemaPointer: '/components/schemas/$schema')]);
          expect(evaluated['complete'], true, reason: '$evaluated');expect((evaluated['runtimeEvaluations'] as List).map((value) => value['valid']), expected);
          final response = await const ContractRequestExecutor().execute(prepared, OperationRequestDraft(planIdentity: prepared.identity), resolveSecret: (_) async => null);
          try { expect(response.conforming, true, reason: '${response.received.findings}');expect(await response.response.bytes(), utf8.encode(bodies[path]!)); }
          finally { await response.close(); }
        } finally { prepared.close(); }
      }
    }
    final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
    for (final (index, name) in ['First', 'Second'].indexed) await exercise(source, files[index].uri.toString(), name);
    final review = await source.prepareMigration(files.first.uri.toString(), '${directory.path}/output', targetVersion: '3.2.1');
    addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');await review.publish();
    expect([for (final file in files) await file.readAsBytes()], originals);
    source.close();final relocated = await Directory(review.destination).rename('${directory.path}/cold 雪');
    for (final file in files) await file.delete();
    final project = await BusyProject.open(relocated.path, engine);addTearDown(project.close);
    for (final (index, name) in ['First', 'Second'].indexed) {
      final change = review.changes.singleWhere((change) => change.resource == files[index].uri.toString());
      final root = File('${relocated.path}/${Uri.parse(change.destination).pathSegments.last}').uri.toString();
      await exercise(project, root, name, delivered: true);
      if (index == 1) {
        final example = await project.inspectObject(root, root, '/components/examples/Payload', contextKind: 'example');
        final value = (example['fields'] as List).cast<Map>().singleWhere((value) => value['name'] == 'value');
        expect(jsonDecode(await project.readDataValue(Map<String, dynamic>.from(value))), literal);
      }
    }
    final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'], environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
    expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
  });
}
