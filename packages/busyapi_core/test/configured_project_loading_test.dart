import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  late Directory directory;
  late EngineProcess engine;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp(
      'busyapi-configured-loading-',
    );
    engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
  });
  tearDown(() async {
    await engine.close();
    await directory.delete(recursive: true);
  });
  const contract =
      'openapi: 3.2.1\ninfo: {title: Configured, version: "1"}\npaths: {}\n';
  void manifest(String text) =>
      File('${directory.path}/busyapi.yaml').writeAsStringSync(text);

  test(
    'configured graph opens before unrelated candidate and entry limits',
    () async {
      manifest('version: 1\nroots: [{name: API, path: api.yaml}]\n');
      final root = File('${directory.path}/api.yaml')
        ..writeAsStringSync(contract);
      final unrelated = Directory('${directory.path}/unrelated')..createSync();
      for (var index = 0; index < 21050; index++) {
        File('${unrelated.path}/$index${index < 2100 ? '.json' : '.txt'}')
            .writeAsStringSync('{}');
      }
      final project = await BusyProject.open(directory.path, engine);
      addTearDown(project.close);
      expect(project.roots.single.id, root.uri.toString());
      expect(project.discoveryFailure, isNull);
      expect(project.files, contains(root.path));
      expect(
        project.files.any((path) => path.startsWith(unrelated.path)),
        isFalse,
      );
      final buffer = await project.buffer(root.uri.toString());
      project.store.replace(
        buffer.id,
        contract.replaceFirst('Configured', 'Saved'),
      );
      await project.save(buffer);
      await project.populateFileBrowser();
      expect(project.fileBrowserTruncated, isTrue);
      expect(root.readAsStringSync(), contains('Saved'));
      expect(project.roots.single.id, root.uri.toString());
    },
  );

  test('manifestless discovery still inspects candidate content', () async {
    final root = File('${directory.path}/unknown-name.json')
      ..writeAsStringSync(
        '{"openapi":"3.1.2","info":{"title":"Found","version":"1"},"paths":{}}',
      );
    File('${directory.path}/ordinary.yaml')
        .writeAsStringSync('unrelated: true\n');
    final project = await BusyProject.open(directory.path, engine);
    addTearDown(project.close);
    expect(project.roots.single.id, root.uri.toString());
  });

  test('invalid manifest is reported before candidate discovery', () async {
    manifest('version: 9\nroots: broken\n');
    await expectLater(
      BusyProject.open(directory.path, engine),
      throwsA(
        isA<CoreFailure>().having(
          (failure) => failure.code,
          'code',
          'manifest.version',
        ),
      ),
    );
  });

  test('missing configured root stays visible for file recovery', () async {
    manifest('version: 1\nroots: [{name: Missing, path: missing.yaml}]\n');
    File('${directory.path}/unrelated.yaml').writeAsStringSync(contract);
    final project = await BusyProject.open(directory.path, engine);
    addTearDown(project.close);
    expect(
      project.roots.single.id,
      File('${directory.path}/missing.yaml').uri.toString(),
    );
    expect(project.discoveryFailure, isNotNull);
    await expectLater(
      project.buffer(project.roots.single.id),
      throwsA(
        isA<CoreFailure>().having(
          (failure) => failure.code,
          'code',
          'access.read',
        ),
      ),
    );
  });

  test('an actual missing dependency remains a located diagnostic', () async {
    manifest('version: 1\nroots: [{name: API, path: api.yaml}]\n');
    final root = File('${directory.path}/api.yaml')
      ..writeAsStringSync(
        '$contract'
        'components: {schemas: {Value: {\$ref: "missing.yaml#/Value"}}}\n',
      );
    final project = await BusyProject.open(directory.path, engine);
    addTearDown(project.close);
    final checked = await project.check(root.uri.toString());
    final findings = checked['findings'] as List;
    expect(
      findings.any(
        (finding) =>
            '${finding['code']}'.contains('reference') ||
            '${finding['code']}'.contains('resource'),
      ),
      isTrue,
      reason: '$findings',
    );
    expect(root.readAsStringSync(), contains('missing.yaml#/Value'));
  });
}
