import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

class _ObservedBuffers extends BufferStore {
  bool forbidEnumeration = false;

  @override
  Iterable<DocumentBuffer> get fileBuffers {
    if (forbidEnumeration) {
      throw StateError('A targeted checkpoint enumerated the workspace');
    }
    return super.fileBuffers;
  }
}

void main() {
  test('file intent checkpoints and retirement use affected owners without a workspace sweep', () async {
    final directory = await Directory.systemTemp.createTemp(
      'busyapi-targeted-files-',
    );
    addTearDown(() => directory.delete(recursive: true));
    final buffers = _ObservedBuffers();
    DocumentBuffer buffer(String name, String text) {
      final path = '${directory.path}/$name';
      final b = DocumentBuffer.decode(path, utf8.encode(text));
      buffers.register(b);
      return b;
    }

    final moved = buffer('old.yaml', 'exact 雪😀\r\n');
    final repair = buffer('references.yaml', 'ref: old.yaml\n');
    final unrelated = buffer('other.yaml', 'saved\n');
    buffers.replace(unrelated.id, 'unrelated draft\n');
    final owner = FileRecoveryOwner(
      boundary: directory.path,
      location: directory.path,
      store: buffers,
      matches: (_) => false,
      restore: (_) => throw StateError('No adoption occurs in this test'),
    );
    final recovery = RecoveryStore('${directory.path}/recovery');
    final destination = '${directory.path}/new.yaml';
    buffers.apply(
      [
        TextEdit(
          buffer: repair.id,
          generation: repair.generation,
          start: 5,
          end: 13,
          expected: 'old.yaml',
          replacement: 'new.yaml',
        ),
      ],
      paths: [
        BufferPathEdit(
          buffer: moved.id,
          generation: moved.generation,
          expectedPath: moved.path,
          expectedText: moved.text,
          expectedBom: moved.hasBom,
          destination: Uri.file(destination).toString(),
          path: destination,
        ),
      ],
      coupledPublication: true,
    );
    buffers.forbidEnumeration = true;
    expect(
      await recovery.persistFileMoves(owner, affected: {moved, repair}),
      true,
    );
    List<Map<String, dynamic>> records() => [
      for (final f in Directory(
        recovery.directory,
      ).listSync().whereType<File>())
        if (f.path.endsWith('.json'))
          jsonDecode(f.readAsStringSync()) as Map<String, dynamic>,
    ];
    final first = records().single;
    expect(
      (first['buffers'] as List).map((b) => b['id']),
      unorderedEquals([moved.id, repair.id]),
    );
    expect(first['publicationGroups'], [
      unorderedEquals([moved.id, repair.id]),
    ]);
    // An unrelated edit neither traverses nor rewrites this durable group.
    expect(
      await recovery.persistFileMoves(owner, affected: {unrelated}),
      false,
    );
    expect(records().single, first);
    buffers.undo();
    expect(moved.hasFileIntent, false);
    expect(
      await recovery.persistFileMoves(owner, affected: {moved, repair}),
      false,
    );
    expect(records(), isEmpty);
    buffers.redo();
    expect(
      await recovery.persistFileMoves(owner, affected: {moved, repair}),
      true,
    );
    final restored = records().single;
    expect(
      [
        for (final b in restored['buffers'] as List)
          {...b as Map}..remove('generation'),
      ],
      [
        for (final b in first['buffers'] as List)
          {...b as Map}..remove('generation'),
      ],
    );
  });
}
