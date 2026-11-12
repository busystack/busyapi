import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  test('large source splices preserve bytes and shared undo history', () {
    final original = '${'a' * 150000}\r\n😀 é 漢字\n${'z' * 150000}\r';
    final buffer = DocumentBuffer.decode('/tmp/large.yaml', [
      239,
      187,
      191,
      ...utf8.encode(original),
    ]);
    final store = BufferStore()..buffers[buffer.id] = buffer;
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
    await project.save(buffer);
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
    final store = BufferStore()
      ..buffers.addAll({first.id: first, second.id: second});
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
    first.update(accepted.replaceFirst(high, low));
    expect(
      store.undo,
      throwsA(
        isA<CoreFailure>().having(
          (failure) => failure.code,
          'code',
          'history.stale',
        ),
      ),
    );
    expect(second.text, '{"b":"changed"}');
    first.update(accepted);
    store.undo();
    expect(first.text, '{"a":"x"}');
    expect(second.text, '{"b":"y"}');
    store.redo();
    expect(first.text, accepted);
    expect(second.text, '{"b":"changed"}');
  });
}
