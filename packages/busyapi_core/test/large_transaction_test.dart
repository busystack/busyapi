import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  test('undo restores logical state while old async captures remain stale', () {
    final buffer = DocumentBuffer.decode(
      '/tmp/history.yaml',
      utf8.encode('original 雪😀'),
    );
    final store = BufferStore()..register(buffer);
    final captured = buffer.generation;
    store.replace(buffer.id, 'edited 雪😀');
    store.undo();
    expect(buffer.text, 'original 雪😀');
    expect(buffer.generation, greaterThan(captured));
    store.replace(buffer.id, 'branched');
    expect(store.canRedo, false);
    store.undo();
    expect(buffer.text, 'original 雪😀');
  });

  test(
    'BOM changes belong to history and the saved baseline independently',
    () {
      final buffer = DocumentBuffer.decode(
        '/tmp/bom.yaml',
        utf8.encode('source\r\n'),
      );
      final store = BufferStore()..register(buffer);
      store.setBom(buffer.id, true);
      expect(buffer.dirty, true);
      expect(buffer.bytes().take(3), [239, 187, 191]);
      buffer.baselineHasBom = true; // Receipt for the captured published bytes.
      final savedRevision = buffer.generation;
      store.undo();
      expect(buffer.hasBom, false);
      expect(buffer.dirty, true);
      expect(buffer.generation, greaterThan(savedRevision));
      store.redo();
      expect(buffer.hasBom, true);
      expect(buffer.dirty, false);
    },
  );

  test(
    'a replacement owner cannot revive a captured generation at a reused path',
    () {
      final first = DocumentBuffer.decode(
        '/tmp/reused.yaml',
        utf8.encode('same'),
      );
      final store = BufferStore()..register(first);
      final snapshot = AnalysisSnapshot(
        root: first.id,
        resources: [first.snapshot()],
      );
      store.forget(first.id);
      final replacement = DocumentBuffer.decode(
        first.path,
        utf8.encode('same'),
      );
      store.register(replacement);
      expect(replacement.generation, greaterThan(first.generation));
      expect(snapshot.current(store), false);
    },
  );

  test('large source splices preserve bytes and shared undo history', () {
    final original = '${'a' * 150000}\r\n😀 é 漢字\n${'z' * 150000}\r';
    final buffer = DocumentBuffer.decode('/tmp/large.yaml', [
      239,
      187,
      191,
      ...utf8.encode(original),
    ]);
    final store = BufferStore()..register(buffer);
    for (final offset in [0, 150002, original.length]) {
      final beforeGeneration = buffer.generation;
      store.apply([
        TextEdit(
          buffer: buffer.id,
          generation: beforeGeneration,
          start: offset,
          end: offset,
          expected: '',
          replacement: 'α😀\r\n',
        ),
      ]);
      final expected = original.replaceRange(offset, offset, 'α😀\r\n');
      expect(buffer.text, expected);
      expect(buffer.lines.source, expected);
      store.undo();
      expect(buffer.bytes(), [239, 187, 191, ...utf8.encode(original)]);
      store.redo();
      expect(buffer.text, expected);
      store.undo();
      expect(buffer.generation, greaterThan(beforeGeneration));
    }
    store.apply([
      TextEdit(
        buffer: buffer.id,
        generation: buffer.generation,
        start: 0,
        end: original.length,
        expected: original,
        replacement: 'field: "😀"\r\n',
      ),
    ]);
    expect(buffer.text, 'field: "😀"\r\n');
    store.undo();
    expect(buffer.bytes(), [239, 187, 191, ...utf8.encode(original)]);
  });
  test('one MiB contract retains one hundred small edits across Save and exact undo/redo', () async {
    final directory = await Directory.systemTemp.createTemp(
      'busyapi-large-history-',
    );
    addTearDown(() => directory.delete(recursive: true));
    final original = jsonEncode({
      'openapi': '3.2.1',
      'info': {'title': 'Original', 'version': '1'},
      'paths': {},
      'x-padding': '${'a' * (1024 * 1024)}😀 é 漢字',
    });
    final file = File('${directory.path}/api.json')
      ..writeAsStringSync(original);
    final engine = EngineProcess(
      executable: runtimeNode,
      helper: runtimeHelper,
    );
    addTearDown(engine.close);
    final project = await BusyProject.open(file.path, engine);
    addTearDown(project.close);
    final buffer = await project.buffer(file.uri.toString());
    final offset = original.indexOf('Original');
    String title(int index) => 'Edit${index.toString().padLeft(4, '0')}';
    for (var index = 0; index < 100; index++) {
      project.store.apply([
        TextEdit(
          buffer: buffer.id,
          generation: buffer.generation,
          start: offset,
          end: offset + 8,
          expected: index == 0 ? 'Original' : title(index - 1),
          replacement: title(index),
        ),
      ]);
    }
    expect(project.store.historyRetainedBytes, lessThan(256 * 1024));
    await publishSources(project, [buffer]);
    final saved = original.replaceFirst('Original', title(99));
    expect(file.readAsStringSync(), saved);
    for (var index = 99; index >= 0; index--) {
      expect(project.store.canUndo, isTrue);
      project.store.undo();
      expect(
        buffer.text,
        original.replaceFirst(
          'Original',
          index == 0 ? 'Original' : title(index - 1),
        ),
      );
    }
    expect(project.store.canUndo, isFalse);
    expect(buffer.dirty, isTrue);
    for (var index = 0; index < 100; index++) {
      project.store.redo();
      expect(buffer.text, original.replaceFirst('Original', title(index)));
    }
    expect(buffer.dirty, isFalse);
    expect(buffer.bytes(), utf8.encode(saved));
    expect(file.readAsStringSync(), saved);
  });
  test('atomic history distinguishes unpaired source units without losing another resource', () {
    final first = DocumentBuffer.decode(
      '/tmp/first.json',
      utf8.encode('{"a":"x"}'),
    );
    final second = DocumentBuffer.decode(
      '/tmp/second.json',
      utf8.encode('{"b":"y"}'),
    );
    final store = BufferStore()..registerAll([first, second]);
    final high = String.fromCharCode(0xd800), low = String.fromCharCode(0xdc00);
    store.apply([
      TextEdit(
        buffer: first.id,
        generation: first.generation,
        start: 6,
        end: 7,
        expected: 'x',
        replacement: high,
      ),
      TextEdit(
        buffer: second.id,
        generation: second.generation,
        start: 6,
        end: 7,
        expected: 'y',
        replacement: 'changed',
      ),
    ]);
    final accepted = first.text;
    store.adopt(first, accepted.replaceFirst(high, low));
    expect(store.canUndo, false);
    store.undo();
    expect(second.text, '{"b":"changed"}');
    expect(first.text, accepted.replaceFirst(high, low));
    expect(store.canRedo, false);
  });
}
