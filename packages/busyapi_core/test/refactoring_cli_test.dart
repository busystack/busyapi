import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  test('file reviews bind content, permissions and BOM while ignoring restored generations', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-file-review-');
    addTearDown(() => directory.delete(recursive: true));
    final root = File('${directory.path}/api.json');
    await root.writeAsString('{"openapi":"3.2.1","info":{"title":"Review","version":"1"},"paths":{}}');
    final manifest = File('${directory.path}/busyapi.yaml');
    const configuration = 'version: 1\nroots: [{name: main, path: api.json}]\n';
    await manifest.writeAsString(configuration);
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final project = await BusyProject.open(directory.path, engine);
    addTearDown(project.close);
    final buffer = await project.buffer(root.uri.toString());
    final destination = '${directory.path}/new.json';
    const text = '{"generation":1,"snapshot":false,"n":9007199254740993.00}';
    final review = await project.planFileCreation(destination, text: text);
    for (final changed in [
      await project.planFileCreation(destination, text: text.replaceFirst('generation":1', 'generation":2')),
      await project.planFileCreation(destination, text: text, hasBom: true),
      await project.planFileCreation(destination, text: text, mode: 384),
      await project.planFileCreation('${directory.path}/different.json', text: text),
    ]) {
      expect(changed.reviewIdentity, isNot(review.reviewIdentity));
    }
    project.store.replace(buffer.id, buffer.text.replaceFirst('Review', 'Changed'));
    expect((await project.planFileCreation(destination, text: text)).reviewIdentity, isNot(review.reviewIdentity));
    project.store.undo();
    expect((await project.planFileCreation(destination, text: text)).reviewIdentity, review.reviewIdentity);
    final cancelled = await project.planFileCreation(destination, text: text);
    await expectLater(project.applyRefactoring(cancelled, current: () => false), throwsA(isA<CoreFailure>()));
    expect(await File(destination).exists(), false);
    expect(project.store.buffers.containsKey(Uri.file(destination).toString()), false);
    await manifest.writeAsString('$configuration# changed approval context\n');
    await expectLater(project.applyRefactoring(cancelled), throwsA(isA<CoreFailure>()));
    expect(await File(destination).exists(), false);
    await manifest.writeAsString(configuration);
    await root.writeAsString(buffer.text.replaceFirst('Review', 'External'));
    await expectLater(project.applyRefactoring(review), throwsA(isA<CoreFailure>()));
    expect(await File(destination).exists(), false);
  });

  test('independent CLI publishes reviewed file presence and path transactions without text edits', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-cli-file-');
    addTearDown(() => directory.delete(recursive: true));
    final root = File('${directory.path}/api.json'), template = File('${directory.path}/template.json');
    final original = utf8.encode('{"openapi":"3.2.1","info":{"title":"Files","version":"1"},"paths":{}}');
    await root.writeAsBytes(original);
    const text = '\ufeff{\r\n  "type": "integer", "minimum": 9007199254740993.00, "generation": 0\r\n}\r\n';
    await template.writeAsString(text);
    final environment = {
      'PATH': '', 'LANG': 'C.UTF-8', 'HOME': directory.path,
      'XDG_STATE_HOME': '${directory.path}/private-state',
    };
    Future<(int, Map)> invoke(List<String> options) async {
      final result = await Process.run('$testBundle/busyapi', [
        'refactor', root.path, '--json', ...options,
      ], environment: environment, includeParentEnvironment: false);
      expect(result.stderr, isEmpty);
      return (result.exitCode, jsonDecode(result.stdout as String) as Map);
    }
    const creation = ['--action', 'file-create', '--destination', 'new 雪.json', '--content-file', 'template.json', '--mode', '600'];
    final review = await invoke([...creation, '--review']);
    expect(review.$1, 0);expect(review.$2['fileIntent']['mode'], 384);
    expect(review.$2['fileIntent']['hasBom'], true);
    expect(review.$2['contentSource']['resource'], template.uri.toString());
    final destination = File('${directory.path}/new 雪.json');
    expect(await destination.exists(), false);
    expect((await invoke([...creation, '--review'])).$2['reviewIdentity'], review.$2['reviewIdentity']);
    final differentMode = await invoke([...creation, '--mode', '644', '--apply', review.$2['reviewIdentity'] as String]);
    expect(differentMode.$1, 3);expect(differentMode.$2['error']['code'], 'refactor.stale');
    await template.writeAsString(text.replaceFirst('generation": 0', 'generation": 1'));
    final stale = await invoke([...creation, '--apply', review.$2['reviewIdentity'] as String]);
    expect(stale.$1, 3);expect(stale.$2['error']['code'], 'refactor.stale');
    expect(await destination.exists(), false);
    await template.writeAsString(text);
    final applied = await invoke([...creation, '--apply', review.$2['reviewIdentity'] as String]);
    expect(applied.$1, 0);expect(applied.$2['publication']['published'], [destination.uri.toString()]);
    expect(await destination.readAsBytes(), utf8.encode(text));
    expect((await destination.stat()).mode & 511, 384);
    final occupied = await invoke([...creation, '--review']);
    expect(occupied.$1, 3);expect(occupied.$2['error']['code'], 'file.create.collision');
    expect(await destination.readAsBytes(), utf8.encode(text));

    const move = ['--action', 'file-move', '--resource', 'new 雪.json', '--destination', 'moved 雪.json'];
    final moving = await invoke([...move, '--review']);
    expect(moving.$1, 0);expect(moving.$2['edits'], isEmpty);
    final moved = File('${directory.path}/moved 雪.json');
    expect(await destination.exists(), true);expect(await moved.exists(), false);
    final moveResult = await invoke([...move, '--apply', moving.$2['reviewIdentity'] as String]);
    expect(moveResult.$1, 0);expect(moveResult.$2['published'], true);
    expect(await destination.exists(), false);expect(await moved.readAsBytes(), utf8.encode(text));
    expect((await moved.stat()).mode & 511, 384);
    const deletion = ['--action', 'file-delete', '--resource', 'moved 雪.json'];
    final deleting = await invoke([...deletion, '--review']);
    expect(deleting.$1, 0);expect(deleting.$2['edits'], isEmpty);
    expect(await moved.exists(), true);
    final deleted = await invoke([...deletion, '--apply', deleting.$2['reviewIdentity'] as String]);
    expect(deleted.$1, 0);expect(deleted.$2['published'], true);
    expect(await moved.exists(), false);expect(await root.readAsBytes(), original);
    expect(await template.readAsBytes(), utf8.encode(text));
    for (final invalid in [
      ['--action', 'file-create', '--destination', 'bad.json', '--text', '{}', '--content-file', 'template.json'],
      ['--action', 'file-move', '--destination', 'bad.json'],
      ['--action', 'file-delete', '--resource', 'template.json', '--pointer', ''],
      ['--action', 'yaml-ownership', '--pointer', '', '--additional'],
    ]) expect((await invoke(invalid)).$1, 3);
    await template.writeAsBytes([0xff]);
    expect((await invoke([...creation, '--review'])).$1, 3);
    expect(await destination.exists(), false);
  });

  test('CLI extraction, operation movement and root removal preserve multi-root contract relationships', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-cli-contract-maintenance-');
    addTearDown(() => directory.delete(recursive: true));
    final root = File('${directory.path}/api.json'), other = File('${directory.path}/other.json');
    const schemaPointer = '/paths/~1old/get/responses/200/content/application~1json/schema';
    await root.writeAsString(jsonEncode({
      'openapi': '3.2.1', 'info': {'title': 'Maintain', 'version': '1'},
      'paths': {'/old': {'get': {'operationId': 'read', 'responses': {'200': {
        'description': 'Value', 'content': {'application/json': {'schema': {'type': 'integer', 'minimum': 'EXACT'}}},
      }}}}},
      'components': {'schemas': {'Unused': {'type': 'string'}}},
      'x-history': {r'$ref': '#$schemaPointer'},
    }).replaceFirst('"EXACT"', '9007199254740993.00'));
    await other.writeAsString(jsonEncode({
      'openapi': '3.2.1', 'info': {'title': 'Other', 'version': '1'}, 'paths': {},
      'components': {'links': {'Read': {'operationRef': 'api.json#/paths/~1old/get'}}},
    }));
    final manifest = File('${directory.path}/busyapi.yaml');
    await manifest.writeAsString('# preserved\nversion: 1\nroots: [{name: main, path: api.json}, {name: other, path: other.json}]\n');
    final environment = {'PATH': '', 'LANG': 'C.UTF-8', 'HOME': directory.path, 'XDG_STATE_HOME': '${directory.path}/private-state'};
    Future<(int, Map)> invoke(List<String> options, {String selected = 'main'}) async {
      final result = await Process.run('$testBundle/busyapi', [
        'refactor', directory.path, '--root', selected, '--json', ...options,
      ], environment: environment, includeParentEnvironment: false);
      return (result.exitCode, jsonDecode(result.stdout as String) as Map);
    }
    Future<Map> apply(List<String> options, {String selected = 'main'}) async {
      final before = [await root.readAsBytes(), await other.readAsBytes(), await manifest.readAsBytes()];
      final review = await invoke([...options, '--review'], selected: selected);
      expect(review.$1, 0, reason: '${review.$2}');
      expect(review.$2['checkedRoots'].toSet(), {root.uri.toString(), other.uri.toString()});
      expect([await root.readAsBytes(), await other.readAsBytes(), await manifest.readAsBytes()], before);
      final accepted = await invoke([...options, '--apply', review.$2['reviewIdentity'] as String], selected: selected);
      expect(accepted.$1, 0, reason: '${accepted.$2}');
      expect(accepted.$2['published'], true);expect(accepted.$2['contractValidation'], 'not-run');
      return accepted.$2;
    }
    await apply(['--action', 'extract-file', '--pointer', schemaPointer, '--name', 'Stored', '--destination', 'stored.json']);
    final stored = File('${directory.path}/stored.json');
    expect(await stored.exists(), true);expect(await stored.readAsString(), contains('9007199254740993.00'));
    final blocked = await invoke(['--action', 'file-delete', '--resource', 'stored.json', '--review']);
    expect(blocked.$1, 2);expect(blocked.$2['blockers'], isNotEmpty);
    final denied = await invoke(['--action', 'file-delete', '--resource', 'stored.json', '--apply', blocked.$2['reviewIdentity'] as String]);
    expect(denied.$1, 2);expect(await stored.exists(), true);
    await apply(['--action', 'file-move', '--resource', 'stored.json', '--destination', 'relocated.json']);
    expect(await stored.exists(), false);
    await apply(['--action', 'object-delete', '--pointer', '/components/schemas/Unused']);
    await apply(['--action', 'operation-move', '--pointer', '/paths/~1old/get', '--method', 'COPY', '--additional', '--path', '/new']);
    final updated = jsonDecode(await root.readAsString()), updatedOther = jsonDecode(await other.readAsString());
    expect(updated['paths']['/new']['additionalOperations']['COPY']['operationId'], 'read');
    expect(updated['x-history'][r'$ref'], '#$schemaPointer');
    expect(updatedOther['components']['links']['Read']['operationRef'], 'api.json#/paths/~1new/additionalOperations/COPY');
    final physicalOther = await other.readAsBytes();
    await apply(['--action', 'root-remove'], selected: 'other');
    expect(await other.readAsBytes(), physicalOther);expect(await manifest.readAsString(), contains('# preserved'));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final project = await BusyProject.open(directory.path, engine);
    addTearDown(project.close);
    expect(project.roots.map((entry) => entry.name), ['main']);
    final check = await project.check(root.uri.toString());
    expect(check['status'], 'complete');
    final inspected = await project.inspectObject(root.uri.toString(), root.uri.toString(), '/components/schemas/Stored');
    expect(inspected['references'].single['targetResource'], File('${directory.path}/relocated.json').uri.toString());
  });
}
