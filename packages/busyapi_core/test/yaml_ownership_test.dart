import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['2.0', '3.0.4', '3.1.2', '3.2.1']) {
    test('reviewed YAML ownership $version keeps original bytes and history', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-yaml-owner-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final declaration = version == '2.0' ? 'swagger: "2.0"' : 'openapi: $version';
      final text = '# retained 雪😀\r\n$declaration\r\n'
          'x-info: &info {title: Original, version: "1", x-number: 9007199254740993.00}\r\n'
          'info: *info\r\npaths: {}\r\nx-history: *info\r\n';
      final file = File('${directory.path}/api.yaml');
      await file.writeAsBytes([239, 187, 191, ...utf8.encode(text)]);
      var project = await BusyProject.open(file.path, engine);
      addTearDown(() => project.close());
      final buffer = await project.buffer(file.uri.toString()), original = buffer.bytes();
      Future<RefactoringPlan> prepare() async {
        final item = await project.inspectObject(buffer.id, buffer.id, '/info');
        return project.planYamlOwnership({
          'root': buffer.id, 'resource': buffer.id, 'pointer': '/info',
          'generation': item['generation'], 'range': item['range'], 'kind': 'info',
        });
      }
      final reviewed = await prepare();
      expect(reviewed.result['kind'], 'yaml-ownership');
      expect((await prepare()).reviewIdentity, reviewed.reviewIdentity);
      expect(buffer.bytes(), original);
      expect(await file.readAsBytes(), original);
      await project.applyRefactoring(reviewed);
      final accepted = buffer.bytes();
      expect(buffer.hasBom, true);
      expect(buffer.text, contains('# retained 雪😀\r\n'));
      expect(buffer.text, contains('9007199254740993.00'));
      final fresh = await project.inspectObject(buffer.id, buffer.id, '/info');
      expect(fresh['nodeKind'], 'object');
      expect(fresh['yamlOwnershipAvailable'], isNull);
      expect(fresh['shared'], false);
      project.store.undo();
      expect(buffer.bytes(), original);
      project.store.redo();
      expect(buffer.bytes(), accepted);
      await expectLater(project.applyRefactoring(reviewed), throwsA(
        isA<CoreFailure>().having((failure) => failure.code, 'code', 'refactor.stale'),
      ));
      final range = List<int>.from(fresh['range']);
      final session = PropertySession(
        root: buffer.id, buffer: buffer.id, generation: buffer.generation,
        pointer: '/info', range: range,
        expected: buffer.text.substring(range[0], range[1]),
      );
      await project.proposeAndApply(buffer.id, session, [
        {'kind': 'set', 'pointer': '/info/title', 'value': 'Independent 雪'},
      ]);
      final result = await project.inspectObject(buffer.id, buffer.id, '/info');
      expect(result['value']['title'], 'Independent 雪');
      expect(buffer.text, contains('x-info: &info {title: Original'));
      expect(buffer.text, contains('x-history: *info'));
      final saved = buffer.bytes();
      final publication = PublicationStore('${directory.path}/private-publication');
      expect((await publication.save(project, project.store.buffers.values)).complete, true);
      project.close();
      project = await BusyProject.open(file.path, engine);
      expect((await project.buffer(buffer.id)).bytes(), saved);
      expect((await project.check(buffer.id))['status'], 'complete');
    });
  }
  test('YAML ownership review rejects changed unopened dependencies', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-yaml-owner-stale-');
    addTearDown(() => directory.delete(recursive: true));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final file = File('${directory.path}/api.yaml'), dependency = File('${directory.path}/schema.yaml');
    const text = 'openapi: 3.2.1\ninfo: &info {title: Original, version: "1"}\n'
        'paths: {}\ncomponents: {schemas: {Use: {\$ref: "schema.yaml#/Schema"}}}\nx-info: *info\n';
    await file.writeAsString(text);
    await dependency.writeAsString('Schema: {type: string}\n');
    final project = await BusyProject.open(file.path, engine);
    addTearDown(project.close);
    final buffer = await project.buffer(file.uri.toString());
    final plan = await project.planYamlOwnership({
      'root': buffer.id, 'resource': buffer.id, 'pointer': '/info',
      'generation': buffer.generation, 'kind': 'info',
    });
    expect(project.store.buffers.containsKey(dependency.uri.toString()), false);
    await dependency.writeAsString('Schema: {type: integer}\n');
    await expectLater(project.applyRefactoring(plan), throwsA(
      isA<CoreFailure>().having((failure) => failure.code, 'code', 'refactor.stale'),
    ));
    expect(buffer.text, text);
    expect(await file.readAsString(), text);
  });
  for (final version in ['2.0', '3.0.4', '3.1.2', '3.2.1']) {
    test('independent CLI YAML ownership and component review $version', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-cli-yaml-owner-');
      addTearDown(() => directory.delete(recursive: true));
      final legacy = version == '2.0';
      final pointer = legacy ? '/definitions/Old' : '/components/schemas/Old';
      final declaration = legacy ? 'swagger: "2.0"' : 'openapi: $version';
      final text = '# CLI retained 雪\r\n$declaration\r\n'
          'x-info: &info {title: Original, version: "1"}\r\ninfo: *info\r\npaths: {}\r\n'
          '${legacy ? 'definitions:\r\n' : 'components:\r\n  schemas:\r\n'}'
          '${legacy ? '  ' : '    '}Old: &model {type: integer, minimum: 9007199254740993.00}\r\n'
          '${legacy ? '  ' : '    '}Use: {\$ref: "#$pointer"}\r\nx-model: *model\r\n';
      final file = File('${directory.path}/api.yaml');
      await file.writeAsString(text);
      Future<(int, Map)> cli(List<String> arguments) async {
        final process = await Process.run('$testBundle/busyapi', [
          'refactor', file.path, ...arguments, '--json',
        ], environment: {
          'PATH': '', 'LANG': 'C.UTF-8', 'HOME': directory.path,
          'XDG_STATE_HOME': '${directory.path}/private-state',
        }, includeParentEnvironment: false);
        expect(process.stderr, isEmpty);
        return (process.exitCode, jsonDecode(process.stdout as String) as Map);
      }
      const ownership = ['--action', 'yaml-ownership', '--pointer', '/info'];
      final review = await cli([...ownership, '--review']);
      expect(review.$1, 0);expect(review.$2['published'], false);
      expect(review.$2['contractValidation'], 'not-run');
      expect(await file.readAsString(), text);
      final repeated = await cli(ownership);
      expect(repeated.$2['reviewIdentity'], review.$2['reviewIdentity']);
      final wrong = await cli([...ownership, '--apply', 'wrong-review']);
      expect(wrong.$1, 3);expect(wrong.$2['error']['code'], 'refactor.stale');
      expect(await file.readAsString(), text);
      await file.writeAsString('$text# later source\r\n');
      final stale = await cli([...ownership, '--apply', review.$2['reviewIdentity'] as String]);
      expect(stale.$1, 3);expect(stale.$2['error']['code'], 'refactor.stale');
      expect(await file.readAsString(), '$text# later source\r\n');
      await file.writeAsString(text);
      final applied = await cli([...ownership, '--apply', review.$2['reviewIdentity'] as String]);
      expect(applied.$1, 0, reason: '${applied.$2}');expect(applied.$2['published'], true);
      final owned = await file.readAsString();
      expect(owned, contains('9007199254740993.00'));expect(owned, contains('x-model: *model'));
      final renameArgs = ['--action', 'component-rename', '--pointer', pointer, '--name', 'Moved'];
      final rename = await cli(renameArgs);
      expect(rename.$1, 0, reason: '${rename.$2}');expect(await file.readAsString(), owned);
      final renamed = await cli([...renameArgs, '--apply', rename.$2['reviewIdentity'] as String]);
      expect(renamed.$1, 0, reason: '${renamed.$2}');expect(renamed.$2['published'], true);
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final project = await BusyProject.open(file.path, engine);
      addTearDown(project.close);
      final root = project.roots.single.id;
      expect((await project.check(root))['status'], 'complete');
      final at = await project.inspectObject(root, root, pointer.replaceFirst('/Old', '/Moved'));
      expect(at['value']['minimum'], isNotNull);
      final use = await project.inspectObject(root, root, pointer.replaceFirst('/Old', '/Use'));
      expect((use['references'] as List).single['targetPointer'], pointer.replaceFirst('/Old', '/Moved'));
      final page = await project.inspectObject(root, root, '');
      final history = (page['entries'] as List).cast<Map>().singleWhere((entry) => entry['name'] == 'x-model');
      expect(history['raw'], contains('9007199254740993.00'));
      expect(jsonDecode(history['raw'] as String)['type'], 'integer');
    });
  }
  test('CLI maintenance shares cross-file property, schema, response and copy plans', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-cli-maintenance-');
    addTearDown(() => directory.delete(recursive: true));
    final root = File('${directory.path}/api.json'), other = File('${directory.path}/other.json');
    await root.writeAsString(jsonEncode({
      'openapi': '3.2.1', 'info': {'title': 'Maintenance', 'version': '1'},
      'paths': {'/p': {'get': {'responses': {'200': {'description': 'Stored'}}}}},
      'components': {'schemas': {
        'Model': {'type': 'object', 'properties': {
          'old': {'type': 'integer', 'minimum': 1}, 'note': {'type': 'string'},
        }, 'required': ['old'], r'$defs': {'Old': {'type': 'string'}}},
        'Use': {r'$ref': '#/components/schemas/Model'},
        'Definition': {r'$ref': '#/components/schemas/Model/\$defs/Old'},
      }},
      'x-history': {r'$ref': '#/components/schemas/Model/properties/old'},
    }));
    await other.writeAsString(jsonEncode({
      'openapi': '3.2.1', 'info': {'title': 'Other', 'version': '1'}, 'paths': {},
      'components': {'schemas': {'Use': {r'$ref': 'api.json#/components/schemas/Model/properties/old'}}},
    }));
    await File('${directory.path}/busyapi.yaml').writeAsString(
      'version: 1\nroots:\n  - name: main\n    path: api.json\n  - name: other\n    path: other.json\n',
    );
    final environment = {
      'PATH': '', 'LANG': 'C.UTF-8', 'HOME': directory.path,
      'XDG_STATE_HOME': '${directory.path}/private-state',
    };
    Future<Map> invoke(List<String> action) async {
      final result = await Process.run('$testBundle/busyapi', [
        'refactor', directory.path, '--root', 'main', '--json', ...action,
      ], environment: environment, includeParentEnvironment: false);
      expect(result.exitCode, 0, reason: '${result.stdout}\n${result.stderr}');
      return jsonDecode(result.stdout as String) as Map;
    }
    Future<void> apply(List<String> action) async {
      final before = [await root.readAsString(), await other.readAsString()];
      final review = await invoke([...action, '--review']);
      expect(review['checkedRoots'].toSet(), {root.uri.toString(), other.uri.toString()});
      expect([await root.readAsString(), await other.readAsString()], before);
      final accepted = await invoke([...action, '--apply', review['reviewIdentity'] as String]);
      expect(accepted['published'], true);
    }
    await apply(['--action', 'property-rename', '--pointer', '/components/schemas/Model/properties/old', '--name', 'clé/雪']);
    await apply(['--action', 'schema-definition-rename', '--pointer', '/components/schemas/Model/\$defs/Old', '--name', 'Renamed']);
    await apply(['--action', 'response-rename', '--pointer', '/paths/~1p/get/responses/200', '--name', '201']);
    const note = '/components/schemas/Model/properties/note';
    await apply(['--action', 'extract', '--pointer', note, '--name', 'Text']);
    expect(jsonDecode(await root.readAsString())['components']['schemas']['Model']['properties']['note'], {r'$ref': '#/components/schemas/Text'});
    await apply(['--action', 'inline', '--pointer', note]);
    expect(jsonDecode(await root.readAsString())['components']['schemas']['Model']['properties']['note'], {'type': 'string'});
    await apply(['--action', 'move-definition', '--pointer', '/components/schemas/Text', '--name', 'Moved', '--destination', 'other.json']);
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final project = await BusyProject.open(directory.path, engine);
    addTearDown(project.close);
    for (final entry in project.roots) expect((await project.check(entry.id))['status'], 'complete');
    final data = jsonDecode(await root.readAsString()), destination = jsonDecode(await other.readAsString());
    expect(data['components']['schemas']['Model']['required'], ['clé/雪']);
    expect(data['components']['schemas']['Definition'][r'$ref'], '#/components/schemas/Model/\$defs/Renamed');
    expect(data['paths']['/p']['get']['responses'].keys, ['201']);
    expect(data['x-history'][r'$ref'], '#/components/schemas/Model/properties/old');
    expect(destination['components']['schemas']['Moved'], {'type': 'string'});
    final consumer = await project.inspectObject(other.uri.toString(), other.uri.toString(), '/components/schemas/Use');
    expect(consumer['references'].single['targetPointer'], '/components/schemas/Model/properties/clé~1雪');
  });
}
