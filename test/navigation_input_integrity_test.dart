import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter_test/flutter_test.dart';

import '../packages/busyapi_core/test/test_support.dart';

class _DelayedNavigation extends WorkspaceController {
  _DelayedNavigation(super.engine, super.locations);
  int? _flushCount;
  final entered = Completer<void>(), release = Completer<void>();
  void delayCommit() => _flushCount = 0;

  @override
  Future<bool> flush() async {
    if (_flushCount != null) _flushCount = _flushCount! + 1;
    if (_flushCount == 2) {
      entered.complete();
      await release.future;
      _flushCount = null;
    }
    return super.flush();
  }
}

void main() {
  for (final navigation in ['file', 'root', 'history']) {
    for (final composing in [false, true]) {
      test(
        'input arriving before $navigation commit ${composing ? 'blocks navigation while composing' : 'is committed before navigation'}',
        () async {
          final temp = await Directory.systemTemp.createTemp(
            'busyapi-navigation-input-',
          );
          final root = File('${temp.path}/root.yaml')
            ..writeAsStringSync(
              'openapi: 3.2.1\ninfo: {title: Original, version: "1"}\npaths: {}\n',
            );
          final fragment = File('${temp.path}/fragment.yaml')
            ..writeAsStringSync(
              'openapi: 3.2.1\ninfo: {title: Second, version: "1"}\npaths: {}\n',
            );
          File('${temp.path}/busyapi.yaml').writeAsStringSync(
            'version: 1\nroots:\n  - {name: Main, path: root.yaml}\n  - {name: Second, path: fragment.yaml}\n',
          );
          final c = _DelayedNavigation(
            EngineProcess(executable: runtimeNode, helper: runtimeHelper),
            StateLocations(
              config: '${temp.path}/config',
              state: '${temp.path}/state',
              cache: '${temp.path}/cache',
            ),
          );
          try {
            await c.initialize();
            await c.open(temp.path);
            await c.selectRoot(root.uri.toString());
            await c.analyse();
            final original = c.buffer!;
            final session = c.bind(
              Map<String, dynamic>.from(c.analysis!['info'] as Map),
            );
            if (navigation == 'history') {
              c.history.add({
                'resource': fragment.uri.toString(),
                'root': c.root,
                'pointer': '/info',
                'selectedResource': fragment.uri.toString(),
                'mode': 'Design',
              });
            }
            c.delayCommit();
            final opening = switch (navigation) {
              'root' =>
                c.selectRoot(fragment.uri.toString()).then<void>((_) {}),
              'history' => c.navigateHistory(1),
              _ => c.openFile(fragment.uri.toString()),
            };
            // Delay the existing final field-commit boundary, independently of
            // filesystem speed or whether another view already captured the file.
            await c.entered.future;
            expect(c.active, original.id);
            expect(c.draft, same(session));
            session.edit('title', 'Typed during navigation');
            session.composing = composing;
            c.release.complete();
            if (composing) {
              await expectLater(
                opening,
                throwsA(
                  isA<CoreFailure>().having(
                    (e) => e.code,
                    'code',
                    'draft.pending',
                  ),
                ),
              );
              expect(c.active, original.id);
              expect(c.hasPendingFields, true);
              expect(c.draft!.values['title'], 'Typed during navigation');
            } else {
              await opening;
              expect(c.active, fragment.uri.toString());
              expect(original.text, contains('Typed during navigation'));
              expect(c.hasPendingFields, false);
            }
            await c.persist();
            final records = [
              for (final file in Directory(
                c.recovery.directory,
              ).listSync().whereType<File>())
                if (file.path.endsWith('.json'))
                  jsonDecode(await file.readAsString()) as Map,
            ];
            expect(
              records.where((record) => record['id'] == original.id),
              hasLength(1),
            );
            final record = records.singleWhere(
              (record) => record['id'] == original.id,
            );
            expect(
              composing ? record['draft']['values']['title'] : record['text'],
              contains('Typed during navigation'),
            );
          } finally {
            if (c.draft != null) c.draft!.composing = false;
            if (!c.disposed) await c.shutdown();
            c.dispose();
            await temp.delete(recursive: true);
          }
        },
      );
    }
  }
}
