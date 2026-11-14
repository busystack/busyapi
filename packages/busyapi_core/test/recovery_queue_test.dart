import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

void main() {
  test(
    'worker recovery freezes fields and retirement follows in-flight encoding',
    () async {
      final temp = await Directory.systemTemp.createTemp(
        'busyapi-recovery-worker-',
      );
      addTearDown(() => temp.delete(recursive: true));
      final store = RecoveryStore(temp.path);
      final b = DocumentBuffer.decode('/tmp/large.yaml', utf8.encode('saved'));
      final buffers = BufferStore()..register(b);
      buffers.replace(b.id, '😀\r\n' * 300000);
      final capturedText = b.text;
      final draft = PropertySession(
        root: b.id,
        buffer: b.id,
        generation: b.generation,
        pointer: '/info',
        range: [0, 0],
        expected: '',
      )..values['title'] = 'captured';
      final saving = store.persist(b, draft: draft);
      draft.values['title'] = 'later';
      buffers.replace(b.id, 'later source');
      await saving;
      final file = Directory(temp.path).listSync().whereType<File>().single;
      final record = jsonDecode(await file.readAsString()) as Map;
      expect(record['text'], capturedText);
      expect(record['draft']['values']['title'], 'captured');
      buffers.replace(b.id, capturedText);
      final encoding = store.persist(b);
      // Run the worker before queuing retirement; the final record must be gone
      // even when an already-captured older generation is being encoded.
      await Future<void>.delayed(Duration.zero);
      final retiring = store.retire(b.id);
      await Future.wait([encoding, retiring]);
      expect(Directory(temp.path).listSync(), isEmpty);
    },
  );
  test('rapid checkpoints and retirements coalesce without corrupting the latest draft', () async {
    final temp = await Directory.systemTemp.createTemp(
      'busyapi-recovery-queue-',
    );
    addTearDown(() => temp.delete(recursive: true));
    final store = RecoveryStore(temp.path);
    final b = DocumentBuffer.decode('/tmp/queue.yaml', utf8.encode('saved'));
    final buffers = BufferStore()..register(b);
    final work = <Future<void>>[];
    for (var i = 0; i < 30; i++) {
      buffers.replace(b.id, 'draft $i');
      work.add(store.persist(b));
    }
    await Future.wait(work);
    final record = Directory(temp.path)
        .listSync()
        .whereType<File>()
        .singleWhere((f) => f.path.endsWith('.json'));
    expect(
      (jsonDecode(await record.readAsString()) as Map)['text'],
      'draft 29',
    );
    final retirement = store.retire(b.id);
    buffers.replace(b.id, 'newer draft');
    final checkpoint = store.persist(b);
    await Future.wait([retirement, checkpoint]);
    final newer = Directory(temp.path)
        .listSync()
        .whereType<File>()
        .singleWhere((f) => f.path.endsWith('.json'));
    expect(
      (jsonDecode(await newer.readAsString()) as Map)['text'],
      'newer draft',
    );
    await store.retire(b.id);
    expect(
      Directory(temp.path)
          .listSync()
          .whereType<File>()
          .where((f) => f.path.endsWith('.json')),
      isEmpty,
    );
  });
  test('a checkpoint enqueued at drain completion is persisted before its returned future succeeds', () async {
    final temp = await Directory.systemTemp.createTemp(
      'busyapi-recovery-queue-',
    );
    addTearDown(() => temp.delete(recursive: true));
    final source = File('${temp.path}/root.yaml');
    await source.writeAsString('saved\n');
    final buffer = DocumentBuffer.decode(
      source.path,
      await source.readAsBytes(),
    );
    final buffers = BufferStore()..register(buffer);
    buffers.replace(buffer.id, 'first unsaved\n');
    Future<void>? later;
    var queued = false;
    late RecoveryStore recovery;
    recovery = RecoveryStore(
      '${temp.path}/private-recovery',
      onCheckpointPhase: (phase) {
        if (phase == 'drain:end' && !queued) {
          queued = true;
          scheduleMicrotask(() {
            buffers.replace(buffer.id, 'latest unsaved 雪😀\n');
            later = recovery.persist(buffer);
          });
        }
      },
    );
    await recovery.persist(buffer);
    await Future<void>.delayed(Duration.zero);
    expect(later, isNotNull);
    await later;
    final records = [
      for (final entry in Directory(
        recovery.directory,
      ).listSync().whereType<File>())
        if (entry.path.endsWith('.json'))
          jsonDecode(await entry.readAsString()) as Map,
    ];
    expect(records, hasLength(1));
    expect(records.single['text'], 'latest unsaved 雪😀\n');
    expect(records.single['generation'], buffer.generation);
    expect(await source.readAsString(), 'saved\n');
  });
  test('a superseded checkpoint waiting on inventory does not flush an already obsolete record', () async {
    final temp = await Directory.systemTemp.createTemp(
      'busyapi-recovery-coalesced-',
    );
    addTearDown(() => temp.delete(recursive: true));
    final b = DocumentBuffer.decode(
      '${temp.path}/root.yaml',
      utf8.encode('saved'),
    );
    final buffers = BufferStore()..register(b);
    buffers.replace(b.id, 'first');
    late RecoveryStore recovery;
    Future<void>? newer;
    var replaced = false, writes = 0;
    recovery = RecoveryStore(
      '${temp.path}/recovery',
      onCheckpointPhase: (phase) {
        if (phase == 'inventory:end' && !replaced) {
          replaced = true;
          buffers.replace(b.id, 'newest captured 雪😀');
          newer = recovery.persist(b);
        }
        if (phase == 'write:start') writes++;
      },
    );
    await recovery.persist(b);
    await newer;
    expect(
      writes,
      1,
      reason: 'Only the already captured latest record needs a durable write',
    );
    final file = Directory(recovery.directory)
        .listSync()
        .whereType<File>()
        .single;
    expect(
      (jsonDecode(await file.readAsString()) as Map)['text'],
      'newest captured 雪😀',
    );
  });
  test('a newer capture queued during encoding replaces the obsolete durable write', () async {
    final temp = await Directory.systemTemp.createTemp(
      'busyapi-recovery-encoding-',
    );
    addTearDown(() => temp.delete(recursive: true));
    final source = File('${temp.path}/root.yaml');
    const baseline = 'saved\r\n', newest = 'newest source 雪😀\r\n';
    await source.writeAsString(baseline);
    final b = DocumentBuffer.decode(source.path, await source.readAsBytes());
    final buffers = BufferStore()..register(b);
    buffers.replace(b.id, 'old source\n');
    FormSession form(String value) => FormSession(
      kind: 'example',
      contentIdentity: textIdentity(b.text),
      target: PropertySession(
        root: b.id,
        buffer: b.id,
        generation: b.generation,
        pointer: '',
        range: [0, b.text.length],
        expected: b.text,
      ),
      arguments: const {'media': 'application/json'},
      initial: const {'example': '{}'},
    )..edit('example', value);
    final oldForm = form('old unfinished input');
    late RecoveryStore recovery;
    Future<void>? newer;
    var queued = false, writes = 0, durable = false;
    final completed = <Map>[];
    Future<void> afterDurable(Future<void> pending) async {
      await pending;
      expect(durable, true);
      final record = Directory(recovery.directory)
          .listSync()
          .whereType<File>()
          .single;
      completed.add(jsonDecode(await record.readAsString()) as Map);
    }

    recovery = RecoveryStore(
      '${temp.path}/recovery',
      onCheckpointPhase: (phase) {
        if (phase == 'encode:start' && !queued) {
          queued = true;
          buffers.replace(b.id, newest);
          buffers.setBom(b.id, true);
          final newestForm = form('newest unfinished { 雪😀\r\n');
          newer = afterDurable(recovery.persist(b, form: newestForm));
          newestForm.edit('example', 'later uncaptured input');
        }
        if (phase == 'write:start') {
          writes++;
          expect(completed, isEmpty);
        }
        if (phase == 'rename:end') durable = true;
      },
    );
    await afterDurable(recovery.persist(b, form: oldForm));
    expect(newer, isNotNull);
    await newer;
    expect(completed, hasLength(2));
    for (final record in completed) {
      expect(record['text'], newest);
      expect(record['hasBom'], true);
      expect(record['baseline'], baseline);
      expect(record['baselineHasBom'], false);
      expect(record['generation'], b.generation);
      expect(
        record['form']['values']['example'],
        'newest unfinished { 雪😀\r\n',
      );
    }
    final recordFile = Directory(recovery.directory)
        .listSync()
        .whereType<File>()
        .single;
    final record = Map<String, dynamic>.from(completed.first)
      ..['recordPath'] = recordFile.path;
    final restored = DocumentBuffer.decode(
      source.path,
      await source.readAsBytes(),
    );
    final restoredBuffers = BufferStore()..register(restored);
    final restoredForm = FormSession.restore(
      Map<String, dynamic>.from(record['form'] as Map),
    );
    await RecoveryStore(recovery.directory)
        .adopt(record, restored, store: restoredBuffers, form: restoredForm);
    restoredForm.verify(restored, restored.id, restoring: true);
    expect(restored.bytes(), [239, 187, 191, ...utf8.encode(newest)]);
    expect(restoredForm.values['example'], 'newest unfinished { 雪😀\r\n');
    expect(await source.readAsString(), baseline);
    expect(writes, 1, reason: 'Only the newest captured payload needs writing');
  });
  test(
    'an invalidated retirement queued during encoding retains that checkpoint',
    () async {
      final temp = await Directory.systemTemp.createTemp(
        'busyapi-recovery-retire-encoding-',
      );
      addTearDown(() => temp.delete(recursive: true));
      final b = DocumentBuffer.decode(
        '${temp.path}/root.yaml',
        utf8.encode('saved'),
      );
      final buffers = BufferStore()..register(b);
      buffers.replace(b.id, 'captured unsaved 雪😀\r\n');
      late RecoveryStore recovery;
      Future<void>? retiring;
      var current = true, queued = false, writes = 0;
      recovery = RecoveryStore(
        '${temp.path}/recovery',
        onCheckpointPhase: (phase) {
          if (phase == 'encode:start' && !queued) {
            queued = true;
            retiring = recovery.retireIfCurrent(b.id, () => current);
            current = false;
          }
          if (phase == 'write:start') writes++;
        },
      );
      await recovery.persist(b);
      await retiring;
      final record = jsonDecode(
        await Directory(recovery.directory)
            .listSync()
            .whereType<File>()
            .single
            .readAsString(),
      ) as Map;
      expect(writes, 1);
      expect(record['text'], b.text);
      expect(record['generation'], b.generation);
    },
  );
  test(
    'continuous captured updates cannot starve recovery publication',
    () async {
      final temp = await Directory.systemTemp.createTemp(
        'busyapi-recovery-fairness-',
      );
      addTearDown(() => temp.delete(recursive: true));
      final b = DocumentBuffer.decode(
        '${temp.path}/root.yaml',
        utf8.encode('saved'),
      );
      final buffers = BufferStore()..register(b);
      buffers.replace(b.id, 'initial');
      late RecoveryStore recovery;
      final pending = <Future<void>>[];
      var replaced = 0, pendingEncodes = 0, maximum = 0, writes = 0;
      recovery = RecoveryStore(
        '${temp.path}/recovery',
        onCheckpointPhase: (phase) {
          if (phase == 'encode:start') {
            pendingEncodes++;
            if (replaced < 6) {
              buffers.replace(b.id, 'captured ${++replaced} 雪😀');
              pending.add(recovery.persist(b));
            }
          }
          if (phase == 'rename:end') {
            writes++;
            if (pendingEncodes > maximum) maximum = pendingEncodes;
            pendingEncodes = 0;
          }
        },
      );
      await recovery.persist(b);
      await Future.wait(pending);
      expect(maximum, lessThanOrEqualTo(2));
      expect(writes, greaterThanOrEqualTo(3));
      final file = Directory(recovery.directory)
          .listSync()
          .whereType<File>()
          .single;
      final record = jsonDecode(await file.readAsString()) as Map;
      expect(record['text'], 'captured 6 雪😀');
      expect(record['generation'], b.generation);
    },
  );
}
