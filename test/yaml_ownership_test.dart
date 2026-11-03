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

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('native YAML ownership review enables Info edits with reversible source', (tester) async {
    tester.view.physicalSize = const Size(1400, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    for (final channel in ['yaru_window', 'yaru_window/events']) {
      messenger.setMockMethodCallHandler(MethodChannel(channel), (_) async => null);
      addTearDown(() => messenger.setMockMethodCallHandler(MethodChannel(channel), null));
    }
    final directory = Directory.systemTemp.createTempSync('busyapi-native-yaml-owner-');
    const original = '# retained native source 雪😀\r\nopenapi: 3.2.1\r\n'
        'x-info: &info {title: Original, version: "1", x-number: 9007199254740993.00}\r\n'
        'info: *info\r\npaths: {}\r\nx-history: *info\r\n';
    final file = File('${directory.path}/api.yaml')..writeAsStringSync(original);
    final c = WorkspaceController(
      EngineProcess(executable: runtimeNode, helper: runtimeHelper),
      StateLocations(config: '${directory.path}/config', state: '${directory.path}/state', cache: '${directory.path}/cache'),
    );
    final actions = <Future<void>>[], errors = <Object>[];
    Future<void> ready(bool Function() condition) async {
      final clock = Stopwatch()..start();
      await tester.pump();
      while (!condition() && errors.isEmpty && clock.elapsed < const Duration(seconds: 12)) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
        await tester.pump(const Duration(milliseconds: 20));
      }
      expect(errors, isEmpty);
      expect(condition(), true, reason: 'pointer=${c.selectedPointer} error=${c.error}');
      await tester.pumpAndSettle();
    }
    Future<void> tap(String label) async {
      final finder = find.text(label).last;
      await tester.ensureVisible(finder);
      await tester.pumpAndSettle();
      await tester.runAsync(() => tester.tap(finder));
      await tester.pump();
    }
    Finder title() => find.descendant(
      of: find.widgetWithText(BusyApiGroupedTextEntry, 'Title'),
      matching: find.byType(TextField),
    );
    bool review() => find.text('Review YAML ownership').evaluate().any(
      (element) => ModalRoute.of(element)?.isCurrent == true,
    );
    try {
      await runWidgetIo(tester, () async {
        await c.initialize();
        await c.open(file.path);
        await c.selectObject({'root': c.root, 'resource': c.root, 'pointer': '/info'});
      });
      await tester.pumpWidget(MaterialApp(
        theme: buildBusyApiTheme(brightness: Brightness.light, accentColor: Colors.blue),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: ListenableBuilder(
          listenable: c,
          builder: (_, _) => Designer(
            controller: c, reveal: (_) {},
            run: (action) => actions.add(action().catchError((Object error) => errors.add(error))),
          ),
        )),
      ));
      await ready(() => find.text('Make this YAML occurrence independent…').evaluate().isNotEmpty);
      expect(tester.widget<TextField>(title()).enabled, false);
      for (final accept in [false, true]) {
        await tap('Make this YAML occurrence independent…');
        await ready(review);
        expect(c.buffer!.text, original);
        expect(file.readAsStringSync(), original);
        await tap(accept ? 'Apply' : 'Cancel');
        await ready(() => !review() && !c.checking);
        if (!accept) expect(c.buffer!.text, original);
      }
      await ready(() => title().evaluate().isNotEmpty && tester.widget<TextField>(title()).enabled == true);
      final owned = c.buffer!.text;
      expect(owned, contains('9007199254740993.00'));
      expect(owned, contains('x-history: *info'));
      await runWidgetIo(tester, () async {
        await c.undo();
        expect(c.buffer!.text, original);
        await c.redo();
        expect(c.buffer!.text, owned);
      });
      await ready(() => title().evaluate().isNotEmpty && tester.widget<TextField>(title()).enabled == true);
      await tester.runAsync(() => tester.enterText(title(), 'Independent 雪'));
      await runWidgetIo(tester, () async {
        expect(await c.flush(), true);
        await c.saveAll();
        final item = await c.project!.inspectObject(c.root!, c.root!, '/info');
        expect(item['value']['title'], 'Independent 雪');
      });
      expect(c.buffer!.text, contains('x-info: &info {title: Original'));
      expect(c.buffer!.text, contains('x-history: *info'));
      expect(file.readAsStringSync(), c.buffer!.text);
      expect(tester.takeException(), isNull);
      await runWidgetIo(tester, () => Future.wait(actions));
    } finally {
      await tester.pumpWidget(const SizedBox());
      await runWidgetIo(tester, c.shutdown);
      c.dispose();
      directory.deleteSync(recursive: true);
    }
  });
}
