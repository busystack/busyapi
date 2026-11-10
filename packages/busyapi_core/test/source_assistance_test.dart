import 'dart:async';
import 'dart:io';
import 'dart:convert';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

class HeldAssistance extends EngineProcess {
  HeldAssistance() : super(executable: runtimeNode, helper: runtimeHelper);
  Completer<void>? entered, release;
  bool priorProducer = false;
  @override
  Future<Map<String, dynamic>> request(
    String method,
    Map<String, Object?> params, {
    String? requestId,
  }) async {
    if (['assistSource', 'sourceFolds'].contains(method) && release != null) {
      entered!.complete();
      await release!.future;
    }
    final result = await super.request(method, params, requestId: requestId);
    return method == 'assistSource' && priorProducer
        ? {...result, 'producerVersion': '1'} : result;
  }
}

void main() {
  late Directory temp;
  late HeldAssistance engine;
  late BusyProject project;
  late DocumentBuffer buffer;
  late int caret;
  setUp(() async {
    temp = await Directory.systemTemp.createTemp('busyapi-assistance-');
    engine = HeldAssistance();
    const text =
        '{"openapi":"3.2.1","info":{"title":"Kept", § "version":"1"},"paths":{}}';
    caret = text.indexOf('§');
    final file = File('${temp.path}/root.json');
    await file.writeAsBytes([
      239,
      187,
      191,
      ...utf8.encode(text.replaceFirst('§', '')),
    ]);
    project = await BusyProject.open(file.path, engine);
    buffer = await project.buffer(project.roots.single.id);
    buffer.selection = SourceSelection(caret, caret);
  });
  tearDown(() async {
    project.close();
    await engine.close();
    await temp.delete(recursive: true);
  });
  Future<SourceAssistance> capture() => project.assistSource(
    project.roots.single.id,
    buffer.id,
    buffer.selection,
  );
  test('Source role choices share captured edits, history and stale guards', () async {
    const pointer = '/components/schemas/Owner/properties/Shared';
    final text = jsonEncode({
      'openapi': '3.2.1', 'info': {'title': 'Roles', 'version': '1'},
      'paths': <String, Object?>{},
      'components': {
        'schemas': {
          'Owner': {'properties': {'Shared': {'description': 'Kept', 'schema': {'type': 'string'}}}},
          'Use': {r'$ref': '#$pointer'},
        },
        'headers': {'Use': {r'$ref': '#$pointer'}},
      },
    }).replaceFirst('"type":"string"}}', '"type":"string"} }');
    project.store.replace(buffer.id, text);
    final at = text.indexOf('} }') + 2;
    buffer.selection = SourceSelection(at, at);
    final selected = await project.assistSource(project.roots.single.id,
        buffer.id, buffer.selection, contextPointer: pointer, contextKind: 'header');
    expect(selected.result['contextKind'], 'header');
    expect(selected.result['producerVersion'], '2');
    final index = selected.completions.indexWhere((choice) => choice['label'] == 'required = true');
    expect(index, greaterThanOrEqualTo(0));
    project.store.apply([selected.completion(index, buffer)], label: 'Source Header required');
    expect(buffer.text, contains('"required": true'));
    expect(selected.current, false);
    project.store.undo();expect(buffer.text, text);
    project.store.redo();expect(buffer.text, contains('"required": true'));
    await expectLater(project.assistSource(project.roots.single.id,
        buffer.id, buffer.selection, contextPointer: '/info', contextKind: 'header'),
        throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'assist.context.stale')));
    engine.priorProducer = true;
    await expectLater(capture(), throwsA(isA<CoreFailure>().having(
        (error) => error.code, 'code', 'assist.protocol')));
  });
  test(
    'assistance snapshot collection notifies clean physical reloads',
    () async {
      final refreshed = <String>[];
      await File(buffer.path)
          .writeAsString(buffer.text.replaceFirst('Kept', 'Reloaded'));
      final captured = await project
          .sourceAssistance(
            project.roots.single.id,
            buffer.id,
            const SourceSelection(0, 0),
            onResourceRefreshed: refreshed.add,
          )
          .run('folds');
      expect(refreshed, [buffer.id]);
      expect(buffer.text, contains('Reloaded'));
      expect(buffer.dirty, false);
      expect(captured.current, true);
    },
  );
  test('fold metadata rejects a newer generation and cannot become an empty success on cancellation', () async {
    for (final cancel in [false, true]) {
      engine.entered = Completer();
      engine.release = Completer();
      final job = project.sourceAssistance(
        project.roots.single.id,
        buffer.id,
        const SourceSelection(0, 0),
      );
      final pending = job.run('folds');
      await engine.entered!.future;
      if (cancel) {
        await job.cancel();
      } else {
        project.store.replace(buffer.id, '${buffer.text}\n');
      }
      engine.release!.complete();
      await expectLater(
        pending,
        throwsA(
          isA<CoreFailure>().having(
            (e) => e.code,
            'code',
            cancel ? 'cancelled' : 'assist.stale',
          ),
        ),
      );
      engine.release = null;
    }
  });
  test('folding can inspect an approved fragment without creating an editable buffer', () async {
    final file = File('${temp.path}/model.json');
    await file.writeAsString('{\n  "Model": {\n    "type": "string"\n  }\n}\n');
    project.store.replace(
      buffer.id,
      jsonEncode({
        'openapi': '3.2.1',
        'info': {'title': 'Fragment', 'version': '1'},
        'paths': {},
        'components': {
          'schemas': {
            'Model': {r'$ref': 'model.json#/Model'},
          },
        },
      }),
    );
    final result = await project
        .sourceAssistance(
          project.roots.single.id,
          file.uri.toString(),
          const SourceSelection(0, 0),
        )
        .run('folds');
    expect(
      (result.result['folds'] as List).any((f) => f['pointer'] == '/Model'),
      true,
    );
    expect(project.store.buffers.containsKey(file.uri.toString()), false);
  });
  test('bounded folding captures the physical generation without changing bytes or history', () async {
    final text = const JsonEncoder.withIndent('  ').convert({
      'openapi': '3.2.1',
      'info': {'title': 'Fold', 'version': '1'},
      'paths': {},
      'components': {
        'schemas': {
          'Model': {
            'type': 'object',
            'properties': {
              for (var i = 0; i < 300; i++) 'field$i': {'type': 'string'},
            },
          },
        },
      },
    });
    project.store.replace(buffer.id, text);
    final before = buffer.bytes();
    final captured = await project
        .sourceAssistance(
          project.roots.single.id,
          buffer.id,
          const SourceSelection(0, 0),
        )
        .run('folds', viewport: SourceRange(0, text.indexOf('field0')));
    final folds = captured.result['folds'] as List;
    expect(folds.any((f) => f['pointer'] == '/components/schemas/Model'), true);
    expect(
      folds.any((f) => (f['pointer'] as String).endsWith('/field299')),
      false,
    );
    expect(captured.current, true);
    expect(buffer.bytes(), before);
    project.store.undo();
    expect(captured.current, false);
    expect(buffer.text, contains('"title":"Kept"'));
  });
  test('acceptance uses one located source transaction and preserves BOM and saved bytes', () async {
    final before = buffer.bytes(), assistance = await capture();
    final index = assistance.completions.indexWhere(
      (c) => c['label'] == 'summary',
    );
    expect(index, greaterThanOrEqualTo(0));
    final edit = assistance.completion(index, buffer);
    expect(edit.start, caret);
    expect(edit.end, caret);
    project.store.apply([edit], label: 'Completion');
    expect(jsonDecode(buffer.text)['info']['summary'], '');
    expect(buffer.hasBom, true);
    final accepted = buffer.bytes();
    project.store.undo();
    expect(buffer.bytes(), before);
    project.store.redo();
    expect(buffer.bytes(), accepted);
    await project.save(buffer);
    expect(await File(buffer.path).readAsBytes(), accepted);
  });
  for (final version in ['2.0', '3.0.4', '3.1.2', '3.2.1']) {
    test('Source $version scalar schema occurrences share captured forms and reject stale edits', () async {
      final swagger = version == '2.0';
      final modern = version.startsWith('3.1.') || version.startsWith('3.2.');
      for (final member in ['"properties":{"child":null}', '"allOf":[null]']) {
        final source = '{"${swagger ? 'swagger' : 'openapi'}":"$version",'
            '"info":{"title":"Kept","version":"unrelated"},"paths":{},'
            '${swagger ? '"definitions"' : '"components":{"schemas"'}:'
            '{"Value":{$member}}${swagger ? '' : '}'},"x-number":9007199254740993.00}';
        project.store.replace(buffer.id, source);
        caret = source.indexOf('null') + 1;
        buffer.selection = SourceSelection(caret, caret);
        final assistance = await capture();
        expect(assistance.completions.map((entry) => entry['label']), modern ? ['{}', 'true', 'false'] : ['{}']);
        final selected = modern ? 'false' : '{}';
        final choice = assistance.completions.indexWhere((entry) => entry['label'] == selected);
        final edit = assistance.completion(choice, buffer);
        project.store.apply([edit], label: 'Schema occurrence');
        expect(buffer.text, source.replaceFirst('null', selected));
        expect((await project.check(project.roots.single.id))['status'], 'complete');
        expect(() => assistance.completion(choice, buffer),
            throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'assist.stale')));
        project.store.undo();
        expect(buffer.text, source);
        expect(buffer.hasBom, true);
      }
    });
    test('Source schema forms $version apply, undo, save and reopen through Core', () async {
      final swagger = version == '2.0';
      final source = '{"${swagger ? 'swagger' : 'openapi'}":"$version",'
          '"info":{"title":"Kept","version":"unrelated"},"paths":{},'
          '${swagger ? '"definitions"' : '"components":{"schemas"'}:'
          '{"Value":{"additionalProperties":null}}${swagger ? '' : '}'},'
          '"x-literal":{"number":9007199254740993,"ref":"literal"}}';
      project.store.replace(buffer.id, source);
      caret = source.indexOf('null') + 2;
      buffer.selection = SourceSelection(caret, caret);
      final assistance = await capture();
      expect(assistance.completions.map((c) => c['label']), ['{}', 'true', 'false']);
      final choice = assistance.completions.indexWhere((c) => c['label'] == 'false');
      project.store.apply([assistance.completion(choice, buffer)], label: 'Schema completion');
      final changed = buffer.text;
      expect(changed, source.replaceFirst('null', 'false'));
      expect(buffer.hasBom, true);
      project.store.undo();
      expect(buffer.text, source);
      project.store.redo();
      expect(buffer.text, changed);
      expect((await project.check(project.roots.single.id))['status'], 'complete');
      await project.save(buffer);
      final reopened = await BusyProject.open(buffer.path, engine);
      try {
        final saved = await reopened.buffer(reopened.roots.single.id);
        expect(saved.text, changed);
        expect(saved.hasBom, true);
        expect((await reopened.check(reopened.roots.single.id))['status'], 'complete');
      } finally {
        reopened.close();
      }
    });
  }
  test(
    'a moved caret or newer source cannot receive the captured suggestion',
    () async {
      final assistance = await capture(), before = buffer.text;
      buffer.selection = SourceSelection(caret + 1, caret + 1);
      expect(
        () => assistance.completion(0, buffer),
        throwsA(
          isA<CoreFailure>().having((e) => e.code, 'code', 'assist.stale'),
        ),
      );
      expect(buffer.text, before);
      buffer.selection = SourceSelection(caret, caret);
      project.store.replace(buffer.id, '${buffer.text}\n');
      expect(
        () => assistance.completion(0, buffer),
        throwsA(
          isA<CoreFailure>().having((e) => e.code, 'code', 'assist.stale'),
        ),
      );
    },
  );
  test('a half-typed key can be completed without disabling manual invalid-source editing', () async {
    final invalid = buffer.text.replaceFirst(
      '"title":"Kept", ',
      '"title":"Kept", "summ',
    );
    project.store.replace(buffer.id, invalid);
    caret = invalid.indexOf('"summ') + 5;
    buffer.selection = SourceSelection(caret, caret);
    final checked = await project.check(project.roots.single.id);
    expect(checked['status'], 'invalid');
    final assistance = await capture();
    final choice = assistance.completions.indexWhere(
      (c) => c['label'] == 'summary',
    );
    expect(choice, greaterThanOrEqualTo(0));
    project.store.apply([
      assistance.completion(choice, buffer),
    ], label: 'Completion');
    expect(jsonDecode(buffer.text)['info']['summary'], '');
    project.store.undo();
    expect(buffer.text, invalid);
    expect(buffer.hasBom, true);
  });
  test('an approval change remains stale even when another check populates the new cache', () async {
    engine.entered = Completer();
    engine.release = Completer();
    final pending = capture();
    await engine.entered!.future;
    await project.approveResource('https://contracts.test/root', buffer.id);
    await project.check(project.roots.single.id);
    engine.release!.complete();
    await expectLater(
      pending,
      throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'assist.stale')),
    );
  });
  test(
    'cancellation before dispatch cannot become an empty successful response',
    () async {
      await project.check(project.roots.single.id);
      engine.entered = Completer();
      engine.release = Completer();
      final job = project.sourceAssistance(
        project.roots.single.id,
        buffer.id,
        buffer.selection,
      );
      final pending = job.run('completion');
      await engine.entered!.future;
      await job.cancel();
      engine.release!.complete();
      await expectLater(
        pending,
        throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'cancelled')),
      );
      engine.release = null;
      expect((await capture()).completions, isNotEmpty);
    },
  );
}
