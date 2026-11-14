import 'dart:convert';
import 'dart:io';

import 'package:busyapi/l10n/generated/app_localizations.dart';
import 'package:busyapi/src/app/app_theme.dart';
import 'package:busyapi/src/app/busyapi_design.dart';
import 'package:busyapi/src/designer/designer.dart';
import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../packages/busyapi_core/test/test_support.dart';
import 'widget_io.dart';

class _AuthoringEngine extends EngineProcess {
  _AuthoringEngine() : super(executable: runtimeNode, helper: runtimeHelper);
  void Function()? beforeProposal;

  @override
  Future<Map<String, dynamic>> request(
    String method,
    Map<String, Object?> params, {
    String? requestId,
  }) async {
    if (method == 'propose') {
      final boundary = beforeProposal;
      beforeProposal = null;
      boundary?.call();
    }
    return super.request(method, params, requestId: requestId);
  }
}

void main() {
  testWidgets(
    'scoped toggle flushes its owned pending fields and never paints a stale source model',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final temp = Directory.systemTemp.createTempSync(
            'busyapi-scoped-toggle-',
          ),
          file = File('${temp.path}/root.json');
      const pointer = '/paths/~1value/get';
      const original =
          '{"openapi":"3.2.1","info":{"title":"Scoped toggle","version":"1"},"paths":{"/value":{"get":{"summary":"Safe original","parameters":"invalid declaration","responses":{"204":{"description":"Bodyless"}}}}},"x-kept":{"n":9007199254740993.00}}';
      file.writeAsStringSync(original);
      final c = WorkspaceController(
        EngineProcess(executable: runtimeNode, helper: runtimeHelper),
        StateLocations(
          config: '${temp.path}/config',
          state: '${temp.path}/state',
          cache: '${temp.path}/cache',
        ),
      );
      final errors = <Object>[];
      Future<void>? pending;
      var menuCalls = 0;
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      const channel = MethodChannel('busyapi/native_menus');
      messenger.setMockMethodCallHandler(channel, (call) async {
        if (call.method != 'show') return null;
        menuCalls++;
        final entries = (call.arguments as Map)['entries'] as List;
        final index = entries.indexWhere((entry) => entry['label'] == 'false');
        expect(index, greaterThanOrEqualTo(0));
        return index;
      });
      addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
      Finder summary() => find.descendant(
        of: find.widgetWithText(BusyApiGroupedTextEntry, 'Summary'),
        matching: find.byType(TextField),
      );
      Finder toggle() => find.byWidgetPredicate(
        (widget) =>
            widget is BusyApiComboRow<String> &&
            widget.title.contains('deprecated'),
      );
      Future<void> ready(bool Function() condition) async {
        await tester.pump();
        final watch = Stopwatch()..start();
        while (!condition() &&
            errors.isEmpty &&
            watch.elapsed < const Duration(seconds: 10)) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 20)),
          );
          await tester.pump(const Duration(milliseconds: 20));
        }
        expect(errors, isEmpty);
        expect(condition(), true, reason: 'Current error=${c.error}');
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }

      try {
        await runWidgetIo(tester, () async {
          await c.initialize();
          await c.open(file.path);
          await c.selectObject({
            'root': c.root,
            'resource': c.root,
            'pointer': pointer,
            'occurrence': 'details:${c.root}#$pointer',
          });
          await c.analyse();
        });
        await tester.pumpWidget(
          MaterialApp(
            theme: buildBusyApiTheme(
              brightness: Brightness.light,
              accentColor: Colors.blue,
            ),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: Scaffold(
              body: ListenableBuilder(
                listenable: c,
                builder: (_, _) => Designer(
                  controller: c,
                  run: (action) =>
                      pending = action().catchError((Object error) {
                        errors.add(error);
                      }),
                  reveal: (_) {},
                ),
              ),
            ),
          ),
        );
        await ready(
          () =>
              summary().evaluate().isNotEmpty && toggle().evaluate().isNotEmpty,
        );
        expect(tester.widget<BusyApiComboRow<String>>(toggle()).enabled, true);
        await tester.runAsync(
          () => tester.enterText(summary(), 'Pending metadata'),
        );
        expect(c.draft!.pending, true);
        await tester.runAsync(() => tester.ensureVisible(toggle()));
        await tester.pumpAndSettle();
        bool applied() =>
            (jsonDecode(c.buffer!.text)['paths']['/value']['get']
                as Map)['deprecated'] ==
            false;
        await tester.runAsync(() async {
          await tester.tap(toggle());
          // Normal asynchronous field work can finish between paint frames.
          // Hold no fake parser/transaction boundary; use the actual native
          // menu route and complete core/worker operation before the next frame.
          final watch = Stopwatch()..start();
          while (!applied() &&
              errors.isEmpty &&
              watch.elapsed < const Duration(seconds: 10)) {
            await Future<void>.delayed(const Duration(milliseconds: 10));
          }
          expect(errors, isEmpty);
          expect(applied(), true);
          await pending;
        });
        expect(menuCalls, 1);
        expect(c.buffer!.text, contains('Pending metadata'));
        expect(c.buffer!.text, contains('"parameters":"invalid declaration"'));
        expect(c.buffer!.text, contains('9007199254740993.00'));
        await tester.pump();
        expect(
          tester.widget<TextField>(summary()).controller!.text,
          'Pending metadata',
          reason: 'The old page projection must not roll back a committed field for an intermediate frame',
        );
        await ready(
          () =>
              !c.checking &&
              tester.widget<BusyApiComboRow<String>>(toggle()).selected ==
                  'false',
        );
        final before = c.buffer!.text,
            fresh = await tester.runAsync(
              () => c.project!.inspectObject(c.root!, c.root!, pointer),
            );
        await tester.runAsync(() async {
          await expectLater(
            c.mutate(fresh!, [
              {'kind': 'remove', 'pointer': '$pointer/parameters'},
            ], authoredField: 'deprecated'),
            throwsA(
              isA<CoreFailure>().having((e) => e.code, 'code', 'draft.scope'),
            ),
          );
        });
        expect(
          c.buffer!.text,
          before,
          reason: 'A field-scoped action cannot remove an invalid sibling',
        );
        await runWidgetIo(tester, () async {
          await c.undo();
          await c.analyse();
        });
        expect(c.buffer!.text, contains('Pending metadata'));
        expect(c.buffer!.text, isNot(contains('deprecated')));
        await runWidgetIo(tester, () async {
          await c.undo();
          await c.analyse();
        });
        expect(c.buffer!.text, original);
        await runWidgetIo(tester, () async {
          await c.redo();
          await c.redo();
          await c.analyse();
          await c.saveBuffers();
          await c.analyse();
        });
        expect(file.readAsStringSync(), before);
        expect(c.analysis!['status'], isNot('complete'));
        expect(errors, isEmpty);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await runWidgetIo(tester, c.shutdown);
        c.dispose();
        temp.deleteSync(recursive: true);
      }
    },
  );

  for (final change in [
    'own-field',
    'other-field',
    'replacement',
    'dependency',
    'dialect',
    'configuration',
    'proposal-race',
    'proposal-owner-race',
    'projection',
    'cache-eviction',
    'query-replacement',
    'same-text-mode-capture',
    'same-path-project',
  ]) {
    test(
      'captured field authoring preserves its boundary across $change',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'busyapi-authoring-boundary-',
        );
        final source = File('${directory.path}/api.json'),
            model = File('${directory.path}/model.json');
        final manifest = File('${directory.path}/busyapi.yaml');
        const pointer = '/paths/~1value/get';
        final original = jsonEncode({
          'openapi': '3.2.1',
          'info': {'title': 'Captured', 'version': '1'},
          'paths': {
            '/value': {
              'get': {
                'summary': 'Original',
                'responses': {
                  '204': {'description': 'None'},
                },
              },
            },
          },
          'components': {
            'schemas': {
              'Value': {r'$ref': 'model.json#/Value'},
            },
          },
        });
        await source.writeAsString(original);
        await model.writeAsString('{"Value":{"type":"string"}}');
        final otherRoots = <File>[];
        if (change == 'cache-eviction') {
          for (var index = 0; index < 17; index++) {
            final other = File('${directory.path}/other-$index.json');
            await other.writeAsString(
              '{"openapi":"3.2.1","info":{"title":"Other","version":"1"},"paths":{}}',
            );
            otherRoots.add(other);
          }
        }
        await manifest.writeAsString(
          jsonEncode({
            'version': 1,
            'roots': [
              {'name': 'Main', 'path': 'api.json'},
              for (var index = 0; index < otherRoots.length; index++)
                {'name': 'Other $index', 'path': 'other-$index.json'},
            ],
          }),
        );
        final engine = _AuthoringEngine();
        final c = WorkspaceController(
          engine,
          StateLocations(
            config: '${directory.path}/config',
            state: '${directory.path}/state',
            cache: '${directory.path}/cache',
          ),
        );
        try {
          await c.open(directory.path);
          if (c.root != source.uri.toString()) {
            await c.selectRoot(source.uri.toString());
          }
          await c.analyse();
          final project = c.project!, root = c.root!, buffer = c.buffer!;
          final item = change == 'projection'
              ? Map<String, dynamic>.from(
                  (c.projection!['operations'] as List).single,
                )
              : await project.inspectObject(root, root, pointer);
          void changeDependency() => c.store!.replace(
            model.uri.toString(),
            '{"Value":{"type":"integer"}}',
          );
          if (change == 'own-field' || change == 'other-field') {
            final target = change == 'own-field'
                ? item
                : await project.inspectObject(root, root, '/info');
            c.bind(target)
              ..bind(
                change == 'own-field' ? 'summary' : 'title',
                change == 'own-field' ? 'Original' : 'Captured',
              )
              ..edit(change == 'own-field' ? 'summary' : 'title', 'Pending');
          } else if (change == 'replacement') {
            c.store!.forget(root);
            await project.buffer(root);
          } else if (change == 'configuration') {
            final configuration = await project.buffer(manifest.uri.toString());
            c.store!.replace(
              configuration.id,
              '${configuration.text}# changed capture\n',
            );
          } else if (change == 'cache-eviction') {
            for (final other in otherRoots) {
              await project.inspectObject(
                other.uri.toString(),
                other.uri.toString(),
                '/info',
              );
            }
          } else if (change == 'query-replacement') {
            await project.check(root);
          } else if (change == 'same-text-mode-capture') {
            final mode = (await source.stat()).mode & 0x1ff;
            final chmod = await Process.run('/usr/bin/chmod', [
              (mode == 384 ? 416 : 384).toRadixString(8),
              source.path,
            ]);
            expect(chmod.exitCode, 0);
            await project.refreshResources();
            final newer = await project.check(root);
            expect(newer['contextSnapshot'], item['snapshot']);
            expect(buffer.generation, item['generation']);
          } else if (change == 'same-path-project') {
            await c.open(directory.path);
            await c.analyse();
            expect(c.root, root);
            expect(c.buffer!.generation, item['generation']);
            expect(c.buffer!.text, original);
          } else if (change == 'projection') {
            // Use the actual adopted projection rather than a new inspection.
          } else {
            await project.buffer(model.uri.toString());
            if (change == 'proposal-owner-race') {
              engine.beforeProposal = () {
                c.store!.forget(root);
                c.store!.register(
                  DocumentBuffer.decode(source.path, source.readAsBytesSync()),
                );
              };
            } else if (change == 'proposal-race') {
              engine.beforeProposal = changeDependency;
            } else if (change == 'dialect') {
              c.store!.replace(
                model.uri.toString(),
                '{"\$schema":"https://unknown.example/dialect","Value":{"type":"string"}}',
              );
            } else {
              changeDependency();
            }
          }
          final operation = c.mutate(item, [
            {
              'kind': 'setData',
              'pointer': '$pointer/deprecated',
              'raw': 'false',
            },
          ], authoredField: 'deprecated');
          if (const [
            'own-field',
            'projection',
            'cache-eviction',
            'query-replacement',
          ].contains(change)) {
            await operation;
            expect(
              buffer.text,
              contains(
                change == 'own-field'
                    ? '"summary":"Pending"'
                    : '"summary":"Original"',
              ),
            );
            expect(
              jsonDecode(buffer.text)['paths']['/value']['get']['deprecated'],
              false,
            );
            await c.undo();
            expect(buffer.text, isNot(contains('deprecated')));
            if (change == 'own-field') {
              expect(buffer.text, contains('"summary":"Pending"'));
              await c.undo();
            }
            expect(buffer.text, original);
          } else {
            await expectLater(
              operation,
              throwsA(
                isA<CoreFailure>().having(
                  (failure) => failure.code,
                  'code',
                  change.startsWith('proposal-')
                      ? 'proposal.stale'
                      : 'draft.stale',
                ),
              ),
            );
            expect(
              c.store!.get(root).text,
              change == 'other-field'
                  ? original.replaceFirst('Captured', 'Pending')
                  : original,
            );
            expect(c.store!.get(root).text, isNot(contains('deprecated')));
          }
          expect(await source.readAsString(), original);
        } finally {
          await c.shutdown();
          c.dispose();
          await directory.delete(recursive: true);
        }
      },
    );
  }
}
