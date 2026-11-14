import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:busyapi/l10n/generated/app_localizations.dart';
import 'package:busyapi/src/app/app_theme.dart';
import 'package:busyapi/src/app/busyapi_design.dart';
import 'package:busyapi/src/app/busyapi_search_field.dart';
import 'package:busyapi/src/designer/designer.dart';
import 'package:busyapi/src/designer/reference_picker.dart';
import 'package:busyapi/src/designer/schema_tree.dart';
import 'package:busyapi/src/reference/reference_object.dart';
import 'package:busyapi/src/reference/reference_view.dart';
import 'package:busyapi/src/workspace/api_tree_row.dart';
import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'widget_io.dart';
import 'workspace_io_trace.dart';

class _PickerEngine extends TracedEngineProcess {
  _PickerEngine(super.trace);
  Completer<void>? entered, release;
  Completer<void>? planEntered, planRelease;
  String? pageMethod, pagePointer;
  Completer<void>? pageEntered, pageRelease, pageFinished;
  final pageCalls = <String, int>{};
  @override
  Future<Map<String, dynamic>> request(
    String method,
    Map<String, Object?> params, {
    String? requestId,
  }) async {
    final pageKey = '$method:${params['pointer']}';
    pageCalls.update(pageKey, (value) => value + 1, ifAbsent: () => 1);
    final result = await super.request(method, params, requestId: requestId);
    if (method == pageMethod &&
        params['pointer'] == pagePointer &&
        pageRelease != null) {
      final gate = pageRelease!;
      pageRelease = null;
      pageEntered!.complete();
      await gate.future;
      pageFinished!.complete();
    }
    if (method == 'referenceChoices') {
      if (release case final gate?) {
        release = null;
        entered!.complete();
        await gate.future;
      }
    }
    if (method == 'planReference' && planRelease != null) {
      final gate = planRelease!;
      planRelease = null;
      planEntered!.complete();
      await gate.future;
    }
    return result;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(
      const MethodChannel('yaru_window'),
      (call) async => call.method == 'state'
          ? {'active': true, 'visible': true, 'closable': true}
          : null,
    );
    messenger.setMockMethodCallHandler(
      const MethodChannel('yaru_window/events'),
      (_) async => null,
    );
  });
  tearDown(() {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(
      const MethodChannel('yaru_window'),
      null,
    );
    messenger.setMockMethodCallHandler(
      const MethodChannel('yaru_window/events'),
      null,
    );
  });
  for (final method in ['inspect', 'referencePage', 'schemaTree']) {
    testWidgets(
      'metadata authority reloads held real $method without changing source state',
      (tester) async {
        tester.view.physicalSize = const Size(1280, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final directory = Directory.systemTemp.createTempSync(
          'busyapi-object-authority-',
        );
        final trace = WorkspaceIoTrace(), engine = _PickerEngine(trace);
        final c = TracedWorkspaceController(
          engine,
          StateLocations(
            config: '${directory.path}/config',
            state: '${directory.path}/state',
            cache: '${directory.path}/cache',
          ),
          trace,
        );
        final failures = <Object>[];
        final held = Completer<void>();
        BusyProject? presentationOwner;
        void Function(ResourceRefresh)? presentRefresh;
        var heldRefreshNotifications = 0;
        final pointer = method == 'inspect'
            ? '/components/schemas/Use'
            : '/components/schemas/Record';
        final source = File('${directory.path}/root.yaml');
        final original =
            '# preserve exact source 雪\r\n'
            'openapi: 3.2.1\r\n'
            'info: {title: Authority, version: "1"}\r\n'
            'paths: {}\r\n'
            'components:\r\n  schemas:\r\n'
            '    Use:\r\n      \$ref: "#/components/schemas/Record"\r\n'
            '      description: Pending description\r\n'
            '    Record:\r\n      type: object\r\n      description: |\r\n'
            '${List.generate(40, (i) => '        Reading line $i 雪\r\n').join('\r\n')}\r\n'
            '      properties:\r\n        flag: false\r\n'
            '        name: {type: string}\r\n'
            'x-number: 9007199254740993.00\r\n';
        final bytes = [239, 187, 191, ...utf8.encode(original)];
        Future<T> io<T>(Future<T> Function() work) =>
            runWidgetIo(tester, work, describeState: () => trace.describe(c));
        Future<void> waitFor(bool Function() ready) async {
          final clock = Stopwatch()..start();
          while (!ready() && clock.elapsed < const Duration(seconds: 8)) {
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 10)),
            );
            await tester.pump(const Duration(milliseconds: 10));
          }
          expect(failures, isEmpty);
          expect(ready(), true, reason: trace.describe(c));
        }

        late AppLocalizations l;
        Finder chooser() => find.byWidgetPredicate(
          (widget) =>
              widget is BusyApiActionRow &&
              widget.title == 'Choose reference target' &&
              widget.enabled &&
              widget.onTap != null,
        );
        Finder properties() => find.byWidgetPredicate(
          (widget) => widget is BusyApiTreeRow && widget.title == 'Properties',
        );
        bool loaded() => switch (method) {
          'inspect' => chooser().evaluate().isNotEmpty,
          'referencePage' =>
            find.text(l.referenceSchemaResource).evaluate().isNotEmpty,
          _ => properties().evaluate().isNotEmpty,
        };
        try {
          await io(() async {
            await source.writeAsBytes(bytes);
            await c.initialize();
            await c.open(source.path);
            c.mode = method == 'referencePage' ? 'Reference' : 'Design';
            await c.selectObject({
              'root': c.root,
              'resource': c.root,
              'pointer': pointer,
              'kind': 'schema',
            });
            await c.analyse();
          });
          final owner = c.project!, root = c.root!, buffer = c.buffer!;
          final context = c.analysis!['contextSnapshot'];
          final authorityA =
              c.analysis!['authoringContext'] as Map<String, dynamic>;
          final generation = buffer.generation;
          final originalVersion = c.store!.resourceVersion(root);
          final navigation = c.resourceNavigationGeneration;
          if (method == 'schemaTree') {
            presentationOwner = owner;
            presentRefresh = owner.onResourcesRefreshed;
            // Explicit analysis adopts the actual reconciled capture below.
            // Hold the presentation hint so a temporary null analysis cannot
            // incidentally rescue the old content-only tree reload key.
            owner.onResourcesRefreshed = (_) => heldRefreshNotifications++;
          }
          engine
            ..pageMethod = method
            ..pagePointer = pointer
            ..pageEntered = Completer<void>()
            ..pageFinished = Completer<void>()
            ..pageRelease = held;
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
                  builder: (_, _) => method == 'referencePage'
                      ? ReferenceView(controller: c, reveal: (_) {})
                      : Designer(
                          controller: c,
                          run: (action) => action().catchError((Object error) {
                            failures.add(error);
                          }),
                          reveal: (_) {},
                        ),
                ),
              ),
            ),
          );
          l = AppLocalizations.of(tester.element(find.byType(Scaffold)))!;
          await io(() => engine.pageEntered!.future);
          final mode = (await tester.runAsync(source.stat))!.mode & 0x1ff;
          await io(() async {
            final changed = await Process.run('/usr/bin/chmod', [
              mode == 0x180 ? '640' : '600',
              source.path,
            ]);
            expect(changed.exitCode, 0);
            await owner.refreshResources();
            await c.analyse();
          });
          final authorityB =
              c.analysis!['authoringContext'] as Map<String, dynamic>;
          expect(c.analysis!['contextSnapshot'], context);
          expect(buffer.generation, generation);
          expect(c.store!.resourceVersion(root), greaterThan(originalVersion));
          expect(authorityB['versions'], isNot(equals(authorityA['versions'])));
          expect(identical(authorityA, authorityB), false);
          expect(owner.authoringContext(root, authorityA), isNull);
          expect(owner.authoringContext(root, authorityB), isNotNull);
          expect(c.resourceNavigationGeneration, navigation);
          held.complete();
          await io(() => engine.pageFinished!.future);
          await waitFor(
            () =>
                loaded() ||
                find.text(l.retryObjectPage).evaluate().isNotEmpty ||
                find.text(l.referenceCurrentUnavailable).evaluate().isNotEmpty,
          );
          expect(
            loaded(),
            true,
            reason:
                'A retired $method reply must yield to the eligible metadata capture; refreshHints=$heldRefreshNotifications; ${trace.describe(c)}',
          );
          expect(engine.pageCalls['$method:$pointer'], 2);
          expect(buffer.text, original);
          expect(c.store!.canUndo, false);
          expect(await tester.runAsync(source.readAsBytes), bytes);
          final queryCount = Map<String, int>.from(engine.pageCalls);
          for (var i = 0; i < 3; i++) {
            c.notifyListeners();
            await tester.pump();
          }
          expect(identical(c.analysis!['authoringContext'], authorityB), true);
          expect(
            engine.pageCalls,
            queryCount,
            reason: 'Same-capture repaints must not issue source queries.',
          );

          State? retainedState;
          double? readingOffset;
          Finder? pendingField;
          if (method == 'inspect') {
            pendingField = find.byWidgetPredicate(
              (widget) => widget is DraftField && widget.label == 'Description',
            );
            await tester.ensureVisible(pendingField);
            retainedState = tester.state(pendingField);
            await tester.enterText(
              find.descendant(
                of: pendingField,
                matching: find.byType(EditableText),
              ),
              'Pending native input 雪',
            );
            await tester.pump();
            expect(c.hasPendingFields, true);
          } else if (method == 'schemaTree') {
            retainedState = tester.state(find.byType(AuthoredSchemaTree));
            final arrow = find.descendant(
              of: properties(),
              matching: find.byWidgetPredicate(
                (widget) =>
                    widget is GestureDetector &&
                    widget.child is AnimatedRotation,
              ),
            );
            await tester.tap(arrow);
            await waitFor(
              () => find.text('flag · false').evaluate().isNotEmpty,
            );
          } else {
            retainedState = tester.state(find.byType(ReferenceObjectView));
            final scroll = tester.state<ScrollableState>(
              find
                  .descendant(
                    of: find.byType(ReferenceObjectView),
                    matching: find.byType(Scrollable),
                  )
                  .first,
            );
            expect(scroll.position.maxScrollExtent, greaterThan(0));
            scroll.position.jumpTo(scroll.position.maxScrollExtent / 2);
            await tester.pump();
            readingOffset = scroll.position.pixels;
          }
          if (method != 'inspect') {
            final beforeRefresh = engine.pageCalls['$method:$pointer']!;
            await io(() async {
              final restored = await Process.run('/usr/bin/chmod', [
                mode.toRadixString(8),
                source.path,
              ]);
              expect(restored.exitCode, 0);
              await owner.refreshResources();
              await c.analyse();
            });
            await waitFor(
              () =>
                  loaded() &&
                  engine.pageCalls['$method:$pointer'] == beforeRefresh + 1,
            );
          }
          if (method == 'inspect') {
            final pendingQueries = Map<String, int>.from(engine.pageCalls);
            for (var i = 0; i < 3; i++) {
              c.notifyListeners();
              await tester.pump();
            }
            expect(
              identical(c.analysis!['authoringContext'], authorityB),
              true,
            );
            expect(engine.pageCalls, pendingQueries);
            final beforeRecheck = engine.pageCalls['$method:$pointer']!;
            await io(c.analyse);
            final authorityC = c.analysis!['authoringContext'] as Map;
            expect(identical(authorityB, authorityC), false);
            expect(authorityC['versions'], authorityB['versions']);
            expect(owner.authoringContext(root, authorityB), isNotNull);
            await waitFor(() =>
                engine.pageCalls['$method:$pointer'] == beforeRecheck + 1);
            final page = tester.widget<FutureBuilder<Map<String, dynamic>>>(
              find.descendant(
                of: find.byType(Designer),
                matching: find.byWidgetPredicate(
                  (widget) => widget is FutureBuilder<Map<String, dynamic>>,
                ),
              ).first,
            );
            await io(() => page.future!);
            await tester.pump();
            expect(tester.state(pendingField!), same(retainedState));
            expect(
              tester
                  .widget<EditableText>(
                    find.descendant(
                      of: pendingField,
                      matching: find.byType(EditableText),
                    ),
                  )
                  .controller
                  .text,
              'Pending native input 雪',
            );
            expect(c.hasPendingFields, true);
          } else if (method == 'schemaTree') {
            expect(
              tester.state(find.byType(AuthoredSchemaTree)),
              same(retainedState),
            );
            await waitFor(
              () => find.text('flag · false').evaluate().isNotEmpty,
            );
          } else {
            final dynamic reference = tester.state(
              find.byType(ReferenceObjectView),
            );
            await io(
              () => reference.request as Future<Map<String, dynamic>>,
            );
            await tester.pump();
            expect(
              tester.state(find.byType(ReferenceObjectView)),
              same(retainedState),
            );
            expect(
              tester
                  .state<ScrollableState>(
                    find
                        .descendant(
                          of: find.byType(ReferenceObjectView),
                          matching: find.byType(Scrollable),
                        )
                        .first,
                  )
                  .position
                  .pixels,
              readingOffset,
            );
          }
          expect(c.analysis!['contextSnapshot'], context);
          expect(buffer.generation, generation);
          expect(buffer.text, original);
          expect(c.store!.canUndo, false);
          expect(await tester.runAsync(source.readAsBytes), bytes);
          expect(tester.takeException(), isNull);
        } finally {
          presentationOwner?.onResourcesRefreshed = presentRefresh;
          if (!held.isCompleted) held.complete();
          await tester.pumpWidget(const SizedBox.shrink());
          await io(c.shutdown);
          c.dispose();
          directory.deleteSync(recursive: true);
        }
      },
    );
  }
  for (final version in ['3.1.2', '3.2.1']) {
    for (final json in [false, true]) {
      testWidgets(
        'native reference picker $version $json reviews last page and rejects stale ownership',
        (tester) async {
          tester.view.physicalSize = const Size(1280, 1100);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final temp = Directory.systemTemp.createTempSync(
            'busyapi-native-reference-picker-',
          );
          final trace = WorkspaceIoTrace();
          final engine = _PickerEngine(trace);
          Completer<void>? heldPlan;
          final c = TracedWorkspaceController(
            engine,
            StateLocations(
              config: '${temp.path}/config',
              state: '${temp.path}/state',
              cache: '${temp.path}/cache',
            ),
            trace,
          );
          final failures = <Object>[];
          Future<void>? pending;
          String state() {
            final rows = tester.widgetList<BusyApiActionRow>(
              find.byWidgetPredicate(
                (widget) =>
                    widget is BusyApiActionRow &&
                    widget.title == 'Choose reference target',
              ),
            );
            final authority = c.projection?['authoringContext'];
            return '${trace.describe(c)}; error=${c.error}; storage=${c.storageError}; '
                'generation=${c.buffer?.generation}; resource=${c.selectedResource}; pointer=${c.selectedPointer}; '
                'context=${c.analysis?['contextSnapshot']}; resources=${c.analysis?['resources']}; '
                'projectionCaptureCurrent=${authority is Map<String, dynamic> && c.root != null ? c.project?.authoringContext(c.root!, authority) != null : null}; '
                'selectorRows=${rows.map((row) => (enabled: row.enabled, onTap: row.onTap != null)).toList()}; '
                'statuses=${tester.widgetList<BusyApiStatusBox>(find.byType(BusyApiStatusBox)).map((status) => status.message).toList()}';
          }

          Future<T> io<T>(Future<T> Function() operation) => runWidgetIo(
            tester, operation, describeState: state,
          );
          Future<void> waitFor(bool Function() condition) async {
            await tester.pump();
            final timer = Stopwatch()..start();
            while (!condition() &&
                failures.isEmpty &&
                timer.elapsed < const Duration(seconds: 8)) {
              await tester.runAsync(
                () => Future<void>.delayed(const Duration(milliseconds: 20)),
              );
              await tester.pump(const Duration(milliseconds: 20));
            }
            expect(failures, isEmpty);
            final reached = condition();
            expect(reached, true, reason: reached ? null : state());
            await tester.pumpAndSettle();
          }

          Future<void> tap(String text) async {
            final finder = find.text(text).last;
            await tester.ensureVisible(finder);
            await tester.runAsync(() => tester.tap(finder));
            await tester.pump();
          }

          Future<void> openPicker() async {
            await waitFor(
              () => find
                  .byWidgetPredicate(
                    (widget) =>
                        widget is BusyApiActionRow &&
                        widget.title == 'Choose reference target' &&
                        widget.onTap != null &&
                        widget.enabled,
                  )
                  .evaluate()
                  .isNotEmpty,
            );
            await tap('Choose reference target');
            await waitFor(
              () => find.byType(BusyApiSearchField).evaluate().isNotEmpty,
            );
          }

          Future<void> search(String text) async {
            await tester.enterText(
              find.descendant(
                of: find.byType(BusyApiSearchField),
                matching: find.byType(EditableText),
              ),
              text,
            );
            await tester.pump(const Duration(milliseconds: 300));
          }

          try {
            final file = File('${temp.path}/root.${json ? 'json' : 'yaml'}');
            final entries = {
              for (var i = 0; i < 251; i++)
                'Item${i.toString().padLeft(3, '0')}': i == 250
                    ? false
                    : {'type': 'string'},
            };
            final original = json
                ? jsonEncode({
                    'openapi': version,
                    'info': {'title': 'Picker', 'version': '1'},
                    'paths': {},
                    'components': {
                      'schemas': {
                        'Use': {r'$ref': '#/components/schemas/Old'},
                        'Old': true,
                        ...entries,
                      },
                    },
                    'x-kept': {r'$ref': 'literal', 'text': '雪😀'},
                  })
                : '# keep 雪😀\r\nopenapi: $version\r\ninfo: {title: Picker, version: "1"}\r\npaths: {}\r\ncomponents:\r\n  schemas:\r\n    Use: {\$ref: \'#/components/schemas/Old\'}\r\n    Old: true\r\n${entries.entries.map((e) => '    ${e.key}: ${e.value == false ? 'false' : '{type: string}'}').join('\r\n')}\r\nx-number: 9007199254740993.00';
            await io(() async {
              await file.writeAsBytes([
                239,
                187,
                191,
                ...utf8.encode(original),
              ]);
              await c.initialize();
              await c.open(file.path);
              await c.selectObject({
                'root': c.root,
                'resource': c.root,
                'pointer': '/components/schemas/Use',
              });
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
                            failures.add(error);
                          }),
                      reveal: (_) {},
                    ),
                  ),
                ),
              ),
            );
            debugPrint('Reference picker: initial selection');
            await openPicker();
            await search('Item');
            await waitFor(
              () => find
                  .text(
                    '251 compatible target occurrences · current root and approved resources',
                  )
                  .evaluate()
                  .isNotEmpty,
            );
            expect(
              find.byType(BusyApiActionRow).evaluate().length,
              lessThan(30),
            );
            await tap('Last');
            await waitFor(() => find.text('Item250').evaluate().isNotEmpty);
            final location = tester.widget<Text>(
              find.text(
                'root.${json ? 'json' : 'yaml'}#/components/schemas/Item250',
              ),
            );
            expect(location.maxLines, 2);
            await tap('Item250');
            await waitFor(
              () => find.text('Review reference change').evaluate().isNotEmpty,
            );
            expect(c.buffer!.text, original);
            expect(
              find.textContaining('components/schemas/Use →').evaluate(),
              isNotEmpty,
            );
            await tap('Apply');
            await waitFor(
              () => c.buffer!.text.contains('#/components/schemas/Item250'),
            );
            await waitFor(
              () => find.text('Review reference change').evaluate().isEmpty,
            );
            final accepted = original.replaceFirst(
              '#/components/schemas/Old',
              '#/components/schemas/Item250',
            );
            expect(c.buffer!.text, accepted);
            expect(c.buffer!.hasBom, true);
            expect(await tester.runAsync(file.readAsBytes), [
              239,
              187,
              191,
              ...utf8.encode(original),
            ]);
            debugPrint('Reference picker: applied, undo/redo/save');
            await tester.runAsync(() => pending!);
            await io(c.undo);
            expect(c.buffer!.text, original);
            await io(c.redo);
            expect(c.buffer!.text, accepted);
            await io(c.saveAll);
            expect(await tester.runAsync(file.readAsBytes), [
              239,
              187,
              191,
              ...utf8.encode(accepted),
            ]);
            debugPrint('Reference picker: saved, reopen for no-op');
            await waitFor(() => !c.checking);
            await openPicker();
            await search('Item250');
            await waitFor(
              () => find
                  .text(
                    '1 compatible target occurrences · current root and approved resources',
                  )
                  .evaluate()
                  .isNotEmpty,
            );
            final generation = c.buffer!.generation;
            await tap('Item250');
            await waitFor(
              () => find.byType(BusyApiSearchField).evaluate().isEmpty,
            );
            expect(c.buffer!.generation, generation);
            expect(c.buffer!.text, accepted);
            // A reply from the real worker may arrive after Cancel. It cannot
            // rebuild the dialog or use its disposed query controller.
            debugPrint('Reference picker: no-op complete, held reply');
            engine.entered = Completer<void>();
            final gate = Completer<void>();
            engine.release = gate;
            await openPicker();
            await waitFor(() => engine.entered!.isCompleted);
            await tap('Cancel');
            gate.complete();
            await tester.runAsync(() => pending!);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            debugPrint('Reference picker: cancellation complete, stale source');
            await openPicker();
            await search('Old');
            await waitFor(
              () => find
                  .text(
                    '1 compatible target occurrences · current root and approved resources',
                  )
                  .evaluate()
                  .isNotEmpty,
            );
            final root = c.root!;
            c.store!.replace(root, '$accepted\n');
            c.notifyListeners();
            await waitFor(
              () => find
                  .text(
                    'The captured source or resources changed. Close and reopen this selector to review current targets.',
                  )
                  .evaluate()
                  .isNotEmpty,
            );
            await tap('Old');
            expect(c.buffer!.text, '$accepted\n');
            await tap('Cancel');
            await tester.runAsync(() => pending!);
            expect(failures, isEmpty);
            // A missing reference is repairable at that occurrence without
            // enabling unrelated invalid fields or changing the definition.
            final missing = '$accepted\n'.replaceFirst(
              '#/components/schemas/Item250',
              '#/components/schemas/Missing',
            );
            c.store!.replace(root, missing);
            await tester.runAsync(c.analyse);
            await openPicker();
            await search('Old');
            await waitFor(
              () => find
                  .text(
                    '1 compatible target occurrences · current root and approved resources',
                  )
                  .evaluate()
                  .isNotEmpty,
            );
            await tap('Old');
            await waitFor(
              () => find.text('Review reference change').evaluate().isNotEmpty,
            );
            expect(c.buffer!.text, missing);
            await tap('Apply');
            await waitFor(() => c.buffer!.text == '$original\n');
            await waitFor(
              () => find.text('Review reference change').evaluate().isEmpty,
            );
            await tester.runAsync(() => pending!);
            // An invalidated owner must not trap the dialog in its planning
            // state. The held real plan is read-only and must never be applied.
            engine.planEntered = Completer<void>();
            final planGate = heldPlan = Completer<void>();
            engine.planRelease = planGate;
            await openPicker();
            await search('Item250');
            await waitFor(
              () => find
                  .text(
                    '1 compatible target occurrences · current root and approved resources',
                  )
                  .evaluate()
                  .isNotEmpty,
            );
            await tap('Item250');
            await waitFor(() => engine.planEntered!.isCompleted);
            final beforeInvalidation = c.buffer!.text;
            c.store!.replace(root, '$beforeInvalidation\n');
            c.notifyListeners();
            await tester.pump();
            final cancel = tester.widget<BusyApiDialogButton>(
              find.widgetWithText(BusyApiDialogButton, 'Cancel'),
            );
            expect(
              cancel.onPressed,
              isNotNull,
              reason: 'An invalidated reference owner must still allow Cancel',
            );
            await tap('Cancel');
            planGate.complete();
            await io(() => pending!);
            expect(c.buffer!.text, '$beforeInvalidation\n');
          } finally {
            if (heldPlan != null && !heldPlan.isCompleted) heldPlan.complete();
            await tester.pumpWidget(const SizedBox());
            await tester.runAsync(() async {
              c.dispose();
              await engine.close();
              if (temp.existsSync()) await temp.delete(recursive: true);
            });
          }
        },
      );
      testWidgets(
        'reference planning owner $version $json can cancel before a held real plan returns',
        (tester) async {
          tester.view.physicalSize = const Size(1280, 1000);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final temp = Directory.systemTemp.createTempSync(
            'busyapi-reference-plan-owner-',
          );
          final engine = _PickerEngine(WorkspaceIoTrace());
          final gate = Completer<void>();
          final c = WorkspaceController(
            engine,
            StateLocations(
              config: '${temp.path}/config',
              state: '${temp.path}/state',
              cache: '${temp.path}/cache',
            ),
          );
          Future<RefactoringPlan?>? selection;
          Future<void> waitFor(bool Function() condition) async {
            final clock = Stopwatch()..start();
            while (!condition() && clock.elapsed < const Duration(seconds: 8)) {
              await tester.runAsync(
                () => Future<void>.delayed(const Duration(milliseconds: 10)),
              );
              await tester.pump(const Duration(milliseconds: 10));
            }
            expect(condition(), true);
            await tester.pumpAndSettle();
          }

          try {
            final file = File('${temp.path}/root.${json ? 'json' : 'yaml'}');
            final original = jsonEncode({
              'openapi': version,
              'info': {'title': 'Owner 雪😀', 'version': '1'},
              'paths': {},
              'components': {
                'schemas': {
                  'Use': {r'$ref': '#/components/schemas/Old'},
                  'Old': true,
                  'New': false,
                },
              },
            });
            late Map<String, dynamic> item;
            await runWidgetIo(tester, () async {
              await file.writeAsString(original);
              await c.initialize();
              await c.open(file.path);
              await c.selectObject({
                'root': c.root,
                'resource': c.root,
                'pointer': '/components/schemas/Use',
              });
              item = await c.project!.inspectObject(
                c.root!,
                c.root!,
                '/components/schemas/Use',
              );
            });
            await tester.pumpWidget(
              MaterialApp(
                theme: buildBusyApiTheme(
                  brightness: Brightness.light,
                  accentColor: Colors.blue,
                ),
                localizationsDelegates: AppLocalizations.localizationsDelegates,
                supportedLocales: AppLocalizations.supportedLocales,
                home: Builder(
                  builder: (context) => Scaffold(
                    body: TextButton(
                      onPressed: () {
                        selection = showReferencePicker(
                          context,
                          c,
                          c.project!,
                          item,
                          r'$ref',
                        );
                      },
                      child: const Text('Open selector'),
                    ),
                  ),
                ),
              ),
            );
            await tester.runAsync(() => tester.tap(find.text('Open selector')));
            await tester.pumpAndSettle();
            await waitFor(() => find.text('New').evaluate().isNotEmpty);
            engine.planEntered = Completer<void>();
            engine.planRelease = gate;
            await tester.runAsync(() => tester.tap(find.text('New')));
            await waitFor(() => engine.planEntered!.isCompleted);
            c.store!.replace(c.root!, '$original\n');
            c.notifyListeners();
            await tester.pump();
            final cancel = find.widgetWithText(BusyApiDialogButton, 'Cancel');
            expect(
              tester.widget<BusyApiDialogButton>(cancel).onPressed,
              isNotNull,
            );
            await tester.tap(cancel);
            expect(await runWidgetIo(tester, () => selection!), isNull);
            gate.complete();
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 30)),
            );
            await tester.pumpAndSettle();
            expect(find.text('Review reference change'), findsNothing);
            expect(c.buffer!.text, '$original\n');
            expect(file.readAsStringSync(), original);
            expect(tester.takeException(), isNull);
          } finally {
            if (!gate.isCompleted) gate.complete();
            await tester.pumpWidget(const SizedBox());
            await tester.runAsync(() async {
              c.dispose();
              c.project?.close();
              await engine.close();
              temp.deleteSync(recursive: true);
            });
          }
        },
      );
    }
  }
}
