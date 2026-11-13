import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

class _LoadingEngine extends EngineProcess {
  _LoadingEngine() : super(executable: runtimeNode, helper: runtimeHelper);
  final analyses = <({String root, Set<String> resources})>[];
  var schemaEvaluations = 0;
  void Function()? onNormalization;
  @override
  Future<Map<String, dynamic>> request(
    String method,
    Map<String, Object?> params, {
    String? requestId,
  }) async {
    if (method == 'evaluateSchemas') schemaEvaluations++;
    if (method == 'analyse') {
      analyses.add((
        root: params['root'] as String,
        resources: {
          for (final resource in params['resources'] as List)
            (resource as Map)['id'] as String,
        },
      ));
    }
    final result = await super.request(method, params, requestId: requestId);
    if (method == 'normalizeResourceUris') onNormalization?.call();
    return result;
  }
}

void main() {
  late Directory directory;
  late _LoadingEngine engine;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp(
      'busyapi-configured-loading-',
    );
    engine = _LoadingEngine();
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
    'configured roots load before unrelated candidate and entry limits',
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
      await publishSources(project, [buffer]);
      await project.populateFileBrowser();
      expect(project.fileBrowserTruncated, isTrue);
      expect(root.readAsStringSync(), contains('Saved'));
      expect(project.roots.single.id, root.uri.toString());
    },
  );

  test('configured opening acquires no roots and checking one leaves the other closure untouched', () async {
    final first = File('${directory.path}/first.yaml')
      ..writeAsStringSync(
        '$contract'
        'components: {schemas: {Value: {\$ref: first-part.yaml#/Value}}}\n',
      );
    final second = File('${directory.path}/second.yaml')
      ..writeAsStringSync(
        '$contract'
        'components: {schemas: {Value: {\$ref: second-part.yaml#/Value}}}\n',
      );
    final firstPart = File('${directory.path}/first-part.yaml')
      ..writeAsStringSync('Value: {type: string}\n');
    final secondPart = File('${directory.path}/second-part.yaml')
      ..writeAsBytesSync([0xff]);
    manifest(
      'version: 1\nroots: [{name: First, path: first.yaml}, {name: Second, path: second.yaml}]\n',
    );
    final project = await BusyProject.open(directory.path, engine);
    addTearDown(project.close);
    expect(project.roots.map((root) => root.name), ['First', 'Second']);
    expect(project.store.buffers, isEmpty);
    expect(engine.analyses, isEmpty);
    expect(project.dependencies, isEmpty);
    await project.buffer(first.uri.toString());
    final result = await project.check(
      first.uri.toString(),
      schemaEvaluation: false,
    );
    expect(result['complete'], true, reason: '$result');
    expect(engine.analyses, isNotEmpty);
    expect(
      engine.analyses.every((job) => job.root == first.uri.toString()),
      true,
    );
    expect(
      engine.analyses.every(
        (job) =>
            !job.resources.contains(second.uri.toString()) &&
            !job.resources.contains(secondPart.uri.toString()),
      ),
      true,
    );
    expect(project.store.buffers.keys, [first.uri.toString()]);
    expect(project.dependencies.keys, [first.uri.toString()]);
    expect(project.resourceFingerprints, contains(firstPart.uri.toString()));
    expect(
      project.resourceFingerprints,
      isNot(contains(second.uri.toString())),
    );
    expect(
      project.resourceFingerprints,
      isNot(contains(secondPart.uri.toString())),
    );
    await project.populateFileBrowser();
    expect(project.files, contains(secondPart.path));
    expect(project.store.buffers.keys, [first.uri.toString()]);
    expect(secondPart.readAsBytesSync(), [0xff]);
  });

  test(
    'CLI root selection does not read malformed unselected source',
    () async {
      final first = File('${directory.path}/first.yaml')
        ..writeAsStringSync(contract);
      final second = File('${directory.path}/second.yaml')
        ..writeAsBytesSync([0xff]);
      manifest(
        'version: 1\nroots: [{name: First, path: first.yaml}, {name: Second, path: second.yaml}]\n',
      );
      final result = await Process.run(
        '$testBundle/busyapi',
        ['check', directory.path, '--root', 'First', '--json'],
        environment: const {'PATH': '', 'LANG': 'C.UTF-8'},
        includeParentEnvironment: false,
      );
      expect(result.exitCode, 0, reason: '${result.stdout}\n${result.stderr}');
      final report = jsonDecode(result.stdout as String) as Map;
      expect(report['complete'], true);
      expect(
        (report['checkedRoots'] as List).map((root) => (root as Map)['name']),
        ['First'],
      );
      expect(first.readAsStringSync(), contract);
      expect(second.readAsBytesSync(), [0xff]);
    },
  );

  test('explicit migration captures unselected configured consumers and their unsaved source', () async {
    final first = File('${directory.path}/first.yaml')..writeAsStringSync(
      '${contract.replaceFirst('Configured', 'First')}'
      'components: {schemas: {Value: {\$ref: shared.yaml#/Value}}}\n',
    );
    final second = File('${directory.path}/second.yaml')..writeAsStringSync(
      '${contract.replaceFirst('Configured', 'Second')}'
      'components: {schemas: {Value: {\$ref: shared.yaml#/Value}, Private: {\$ref: second-part.yaml#/Private}}}\n',
    );
    final shared = File('${directory.path}/shared.yaml')..writeAsStringSync('Value: {type: integer}\n');
    final private = File('${directory.path}/second-part.yaml')..writeAsStringSync('Private: {type: string}\n');
    final originals = {for (final file in [first, second, shared, private]) file: file.readAsBytesSync()};
    manifest('version: 1\nroots: [{name: First, path: first.yaml}, {name: Second, path: second.yaml}]\n');
    final project = await BusyProject.open(directory.path, engine);
    addTearDown(project.close);
    expect(project.store.buffers, isEmpty);expect(engine.analyses, isEmpty);
    await project.check(first.uri.toString(), schemaEvaluation: false);
    expect(engine.analyses.every((job) => !job.resources.contains(second.uri.toString())), true);
    final buffer = await project.buffer(second.uri.toString());
    project.store.replace(buffer.id, buffer.text.replaceFirst('Second', 'Captured Second'));
    final review = await project.prepareMigration(first.uri.toString(), '${directory.path}/review', targetVersion: '3.2.1');
    addTearDown(review.close);
    expect(review.publishable, true, reason: '${review.result}');expect(review.unsaved, true);
    expect(engine.schemaEvaluations, 0, reason: 'The conversion semantic owner validates its captured inputs');
    expect(review.changes.map((change) => change.resource).toSet(), containsAll(originals.keys.map((file) => file.uri.toString())));
    expect(review.changes.singleWhere((change) => change.resource == second.uri.toString()).after, contains('Captured Second'));
    for (final entry in originals.entries) expect(entry.key.readAsBytesSync(), entry.value);
    expect(Directory('${directory.path}/review').existsSync(), false);
  });

  test(
    'configured opening honors cancellation without running analysis',
    () async {
      manifest('version: 1\nroots: [{name: First, path: first.yaml}]\n');
      await expectLater(
        BusyProject.open(directory.path, engine, cancelled: () => true),
        throwsA(
          isA<CoreFailure>().having(
            (failure) => failure.code,
            'code',
            'open.cancelled',
          ),
        ),
      );
      expect(engine.analyses, isEmpty);
    },
  );

  test(
    'configured opening can be cancelled while metadata is acquired',
    () async {
      manifest(
        'version: 1\nroots: [{name: First, path: first.yaml}]\nresourceMappings: {"https://schemas.invalid/Value": value.yaml}\n',
      );
      var cancelled = false;
      engine.onNormalization = () => cancelled = true;
      await expectLater(
        BusyProject.open(directory.path, engine, cancelled: () => cancelled),
        throwsA(
          isA<CoreFailure>().having(
            (failure) => failure.code,
            'code',
            'open.cancelled',
          ),
        ),
      );
      expect(cancelled, true);
      expect(engine.analyses, isEmpty);
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
    expect(project.discoveryFailure, isNull);
    expect(project.store.buffers, isEmpty);
    expect(project.files, contains('${directory.path}/missing.yaml'));
    expect(engine.analyses, isEmpty);
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
