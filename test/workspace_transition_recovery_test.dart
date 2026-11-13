import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter_test/flutter_test.dart';

import '../packages/busyapi_core/test/test_support.dart';

class _PausedAnalysisEngine extends EngineProcess {
  _PausedAnalysisEngine()
    : super(executable: runtimeNode, helper: runtimeHelper);
  bool pauseNext = false;
  final entered = Completer<void>(), release = Completer<void>();
  @override
  Future<Map<String, dynamic>> request(
    String method,
    Map<String, Object?> params, {
    String? requestId,
  }) async {
    if (method == 'analyse' && pauseNext) {
      pauseNext = false;
      entered.complete();
      await release.future;
    }
    return super.request(method, params, requestId: requestId);
  }
}

class _PausedAdoptionStore extends RecoveryStore {
  _PausedAdoptionStore(super.directory);
  final entered = Completer<void>(), release = Completer<void>();

  @override
  Future<void> adopt(
    Map<String, dynamic> record,
    DocumentBuffer buffer, {
    PropertySession? draft,
    FormSession? form,
    bool Function()? current,
    void Function()? onAdopted,
  }) async {
    entered.complete();
    await release.future;
    await super.adopt(
      record,
      buffer,
      draft: draft,
      form: form,
      current: current,
      onAdopted: onAdopted,
    );
  }
}

void main() {
  late Directory directory;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp(
      'busyapi-workspace-repair-',
    );
  });
  tearDown(() async {
    await directory.delete(recursive: true);
  });

  WorkspaceController controller({
    EngineProcess? engine,
    RecoveryStore? recovery,
  }) => WorkspaceController(
    engine ?? EngineProcess(executable: runtimeNode, helper: runtimeHelper),
    StateLocations(
      config: '${directory.path}/config',
      state: '${directory.path}/state',
      cache: '${directory.path}/cache',
    ),
    recovery: recovery,
  );

  String fixture(String format, {String title = 'Original'}) => format == 'json'
      ? jsonEncode({
          'openapi': '3.2.1',
          'info': {'title': title, 'version': '1'},
          'servers': [
            {'url': 'http://127.0.0.1:1/original'},
          ],
          'paths': {
            '/value': {
              'get': {
                'description': 'Original operation',
                'parameters': [
                  {
                    'name': 'q',
                    'in': 'query',
                    'description': 'Original parameter',
                    'schema': {'type': 'string'},
                  },
                ],
                'responses': {
                  '200': {'description': 'OK'},
                },
              },
            },
          },
          'components': {
            'schemas': {
              'Value': {'type': 'string', 'description': 'Original schema'},
            },
          },
        })
      : '# Keep authored source\r\nopenapi: 3.2.1\r\ninfo: {title: $title, version: "1"}\r\n'
            'servers: [{url: "http://127.0.0.1:1/original"}]\r\npaths:\r\n  /value:\r\n    get:\r\n'
            '      description: Original operation\r\n      parameters:\r\n'
            '        - {name: q, in: query, description: Original parameter, schema: {type: string}}\r\n'
            '      responses: {"200": {description: OK}}\r\n'
            'components: {schemas: {Value: {type: string, description: Original schema}}}\r\n';

  Future<Map<String, dynamic>> recoveryRecord(WorkspaceController owner) async {
    await owner.persist();
    final file = Directory(owner.recovery.directory)
        .listSync()
        .whereType<File>()
        .singleWhere((file) => file.path.endsWith('.json'));
    return Map<String, dynamic>.from(jsonDecode(file.readAsStringSync()) as Map)
      ..['recordPath'] = file.path;
  }

  for (final failure in ['manifest', 'missing', 'cancelled']) {
    test(
      '$failure open preserves pending analysis, source, fields and later transitions',
      () async {
        final engine = _PausedAnalysisEngine();
        final c = controller(engine: engine);
        addTearDown(c.shutdown);
        await c.initialize();
        final file = File('${directory.path}/api.yaml')
          ..writeAsStringSync(fixture('yaml'));
        await c.open(file.path);
        final previous = c.project, buffer = c.buffer!;
        final item = await previous!.inspectObject(c.root!, buffer.id, '/info');
        final draft = c.bind(item)..bind('title', 'Original');
        draft.edit('title', 'Recovered title');
        engine.pauseNext = true;
        final analysis = c.analyse();
        await engine.entered.future;
        final invalid = Directory('${directory.path}/invalid')..createSync();
        File('${invalid.path}/busyapi.yaml')
            .writeAsStringSync('version: 9\nroots: []\n');
        await expectLater(
          c.open(
            failure == 'missing'
                ? '${directory.path}/missing'
                : failure == 'cancelled'
                ? file.path
                : invalid.path,
            cancelled: () => failure == 'cancelled',
          ),
          throwsA(anything),
        );
        expect(c.project, same(previous));
        expect(c.draft, same(draft));
        expect(c.draft!.values['title'], 'Recovered title');
        engine.release.complete();
        await analysis;
        expect(c.checking, isFalse);
        expect(await c.flush(), isTrue);
        c.sourceEdit(
          buffer.id,
          buffer.text.replaceFirst('Original schema', 'Source schema'),
        );
        await c.saveAll();
        expect(file.readAsStringSync(), contains('Recovered title'));
        expect(file.readAsStringSync(), contains('Source schema'));
        final next = File('${directory.path}/next.json')
          ..writeAsStringSync(fixture('json', title: 'Next'));
        await c.open(next.path);
        expect(c.active, next.uri.toString());
      },
    );
  }

  test(
    'late analysis of an abandoned workspace cannot replace the new projection',
    () async {
      final engine = _PausedAnalysisEngine();
      final owner = controller(engine: engine);
      addTearDown(owner.shutdown);
      await owner.initialize();
      final first = File('${directory.path}/first.yaml')
        ..writeAsStringSync(fixture('yaml'));
      final second = File('${directory.path}/second.json')
        ..writeAsStringSync(fixture('json', title: 'Second'));
      await owner.open(first.path);
      engine.pauseNext = true;
      final old = owner.analyse();
      await engine.entered.future;
      await owner.open(second.path);
      await owner.analyse();
      engine.release.complete();
      await old;
      expect(owner.root, second.uri.toString());
      expect(owner.projection?['info']?['value']?['title'], 'Second');
      expect(owner.checking, isFalse);
    },
  );

  test(
    'an abandoned opening cannot adopt after a later open succeeds',
    () async {
      final engine = _PausedAnalysisEngine();
      final owner = controller(engine: engine);
      addTearDown(owner.shutdown);
      await owner.initialize();
      final initial = File('${directory.path}/initial.yaml')
        ..writeAsStringSync(fixture('yaml'));
      await owner.open(initial.path);
      Directory project(String name) {
        final folder = Directory('${directory.path}/$name')..createSync();
        File('${folder.path}/busyapi.yaml').writeAsStringSync(
          'version: 1\nroots: [{name: API, path: api.json}]\n',
        );
        File('${folder.path}/api.json')
            .writeAsStringSync(fixture('json', title: name));
        return folder;
      }

      final first = project('First'), second = project('Second');
      engine.pauseNext = true;
      final old = owner.open(first.path);
      final rejected = expectLater(old, throwsA(isA<CoreFailure>()));
      await engine.entered.future;
      await owner.open(second.path);
      engine.release.complete();
      await rejected;
      await owner.analyse();
      expect(owner.project!.location, second.path);
      expect(owner.buffer!.text, contains('Second'));
      expect(owner.checking, isFalse);
    },
  );

  for (final format in ['yaml', 'json']) {
    for (final boundary in ['acquisition', 'adoption']) {
      for (final input in ['property', 'form', 'source']) {
        test('$format recovery preserves $input input during $boundary', () async {
          var owner = controller();
          await owner.initialize();
          final file = File('${directory.path}/api.$format')
            ..writeAsStringSync(fixture(format));
          await owner.open(file.path);
          final originalItem = await owner.project!.inspectObject(
            owner.root!,
            file.uri.toString(),
            '/info',
          );
          owner.bind(originalItem)
            ..bind('title', 'Original')
            ..edit('title', 'Recovered title');
          owner.sourceEdit(
            owner.active!,
            owner.buffer!.text.replaceFirst(
              'Original schema',
              'Recovered source',
            ),
          );
          final record = await recoveryRecord(owner);
          final recordFile = File(record['recordPath'] as String);
          final preservedRecord = recordFile.readAsBytesSync();
          await owner.shutdown();
          final gate = _PausedAdoptionStore(owner.recovery.directory);
          owner = controller(recovery: boundary == 'adoption' ? gate : null);
          addTearDown(owner.shutdown);
          await owner.initialize();
          await owner.open(file.path);
          final item = await owner.project!.inspectObject(
            owner.root!,
            file.uri.toString(),
            '/info',
          );
          final live = owner.bind(item)..bind('title', 'Original');
          final originalText = owner.buffer!.text;
          final pending = owner.recoverBufferDraft(record);
          final rejected = expectLater(
            pending,
            throwsA(
              isA<CoreFailure>().having(
                (failure) => failure.code,
                'code',
                'recovery.stale',
              ),
            ),
          );
          if (boundary == 'adoption') await gate.entered.future;
          // Acquisition of an already open buffer still yields. Enter input
          // before that continuation, or while durable adoption is held above.
          FormSession? newForm;
          switch (input) {
            case 'property':
              live.edit('title', 'New input');
            case 'form':
              final field = (item['fields'] as List).cast<Map>().singleWhere(
                (field) => field['name'] == 'title',
              );
              newForm = owner.beginForm(
                'object.value',
                item,
                {'field': Map<String, dynamic>.from(field)},
                {'value': 'Original'},
              )..edit('value', 'New input');
            case 'source':
              owner.sourceEdit(
                owner.active!,
                originalText.replaceFirst('Original schema', 'New source'),
              );
          }
          if (boundary == 'adoption') gate.release.complete();
          await rejected;
          expect(owner.draft, input == 'form' ? isNull : same(live));
          expect(owner.form, same(newForm));
          if (input == 'property') expect(live.values['title'], 'New input');
          if (input == 'form') {
            expect(newForm!.values['value'], 'New input');
            newForm.verify(owner.buffer!, owner.root!);
          }
          if (input == 'source') {
            expect(owner.buffer!.text, contains('New source'));
            expect(owner.store!.canUndo, isTrue);
            owner.store!.undo();
            expect(owner.buffer!.text, originalText);
            owner.store!.redo();
            expect(owner.buffer!.text, contains('New source'));
          } else {
            expect(owner.buffer!.text, originalText);
          }
          expect(recordFile.readAsBytesSync(), preservedRecord);
          expect(file.readAsStringSync(), fixture(format));
        });
      }
    }
    for (final target in [
      ('/info', 'title'),
      ('/paths/~1value/get', 'description'),
      ('/components/schemas/Value', 'description'),
      ('/paths/~1value/get/parameters/0', 'description'),
      ('/servers/0', 'url'),
    ]) {
      test(
        '$format ${target.$1} recovered values apply, save and reopen at the current generation',
        () async {
          var owner = controller();
          await owner.initialize();
          final file = File('${directory.path}/api.$format')
            ..writeAsStringSync(fixture(format));
          await owner.open(file.path);
          final item = await owner.project!.inspectObject(
            owner.root!,
            file.uri.toString(),
            target.$1,
          );
          final session = owner.bind(item)
            ..bind(target.$2, (item['value'] as Map)[target.$2]);
          final value = target.$2 == 'url'
              ? 'http://127.0.0.1:1/recovered'
              : 'Recovered 雪';
          session.edit(target.$2, value);
          final record = await recoveryRecord(owner);
          await owner.shutdown();
          owner = controller();
          addTearDown(() => owner.shutdown());
          await owner.initialize();
          await owner.open(file.path);
          await owner.recoverBufferDraft(record);
          await owner.resumePropertyDraft();
          expect(owner.draft!.generation, owner.buffer!.generation);
          expect(owner.draft!.values[target.$2], value);
          expect(await owner.flush(), isTrue);
          await owner.saveAll();
          await owner.open(file.path);
          final reopened = await owner.project!.inspectObject(
            owner.root!,
            file.uri.toString(),
            target.$1,
          );
          expect((reopened['value'] as Map)[target.$2], value);
          if (format == 'yaml') {
            expect(
              file.readAsStringSync(),
              startsWith('# Keep authored source\r\n'),
            );
          }
        },
      );
    }

    test(
      '$format external change preserves disk bytes and pending recovery values',
      () async {
        final owner = controller();
        addTearDown(owner.shutdown);
        await owner.initialize();
        final file = File('${directory.path}/api.$format')
          ..writeAsStringSync(fixture(format));
        await owner.open(file.path);
        final item = await owner.project!.inspectObject(
          owner.root!,
          file.uri.toString(),
          '/components/schemas/Value',
        );
        final session = owner.bind(item)
          ..bind('description', 'Original schema');
        session.edit('description', 'Recovered schema');
        final record = await recoveryRecord(owner);
        await owner.open(file.path);
        final external = fixture(format, title: 'External');
        file.writeAsStringSync(external);
        await owner.project!.refreshDisk(owner.buffer!);
        await owner.recoverBufferDraft(record);
        await expectLater(
          owner.resumePropertyDraft(),
          throwsA(
            isA<CoreFailure>().having(
              (failure) => failure.code,
              'code',
              'draft.conflict',
            ),
          ),
        );
        expect(owner.draft!.values['description'], 'Recovered schema');
        expect(file.readAsStringSync(), external);
        expect(File(record['recordPath'] as String).existsSync(), isTrue);
        final resolved = await owner.reloadFromDisk(
          owner.project!.captureReload(owner.buffer!),
        );
        expect(resolved.status, BufferReloadStatus.applied);
        expect(owner.draft!.values['description'], 'Recovered schema');
        expect(owner.draft!.generation, owner.buffer!.generation);
        expect(await owner.flush(), isTrue);
        await owner.saveAll();
        expect(file.readAsStringSync(), contains('External'));
        expect(file.readAsStringSync(), contains('Recovered schema'));
      },
    );
  }
}
