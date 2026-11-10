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

void main() {
  for (final version in ['2.0', '3.0.4', '3.1.2', '3.2.1']) {
    testWidgets('$version native recursive schema inline retains shared targets and review/history', (tester) async {
      tester.view.physicalSize = const Size(1400, 1100);tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
      final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      for (final name in ['yaru_window', 'yaru_window/events']) {
        messenger.setMockMethodCallHandler(MethodChannel(name), (_) async => null);
        addTearDown(() => messenger.setMockMethodCallHandler(MethodChannel(name), null));
      }
      final directory = Directory.systemTemp.createTempSync('busyapi-native-recursive-inline-');
      final file = File('${directory.path}/api.json');
      final group = version == '2.0' ? '/definitions' : '/components/schemas';
      final schemas = {'Node': {'type': 'object', 'properties': {'n': {'type': 'integer', 'minimum': 'EXACT'},
        'next': {r'$ref': '#$group/Node'}}}, 'Use': {r'$ref': '#$group/Node'}};
      final original = jsonEncode({if (version == '2.0') 'swagger': version else 'openapi': version,
        'info': {'title': 'Recursive inline', 'version': 'business'}, 'paths': {},
        if (version == '2.0') 'definitions': schemas else 'components': {'schemas': schemas},
      }).replaceAll('"EXACT"', '9007199254740993.00');
      file.writeAsStringSync(original);
      final workspace = WorkspaceController(EngineProcess(executable: runtimeNode, helper: runtimeHelper),
        StateLocations(config: '${directory.path}/config', state: '${directory.path}/state', cache: '${directory.path}/cache'));
      Future<void>? pending;final errors = <Object>[];
      void run(Future<void> Function() action) {
        pending = action().catchError((Object error) {errors.add(error);});
      }
      Future<void> ready(bool Function() condition) async {
        final watch = Stopwatch()..start();
        while (!condition() && errors.isEmpty && watch.elapsed < const Duration(seconds: 12)) {
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
          await tester.pump(const Duration(milliseconds: 20));
        }
        expect(errors, isEmpty);expect(condition(), true, reason: workspace.error);await tester.pumpAndSettle();
      }
      try {
        await tester.runAsync(() async {await workspace.initialize();await workspace.open(file.path);await workspace.analyse();});
        await tester.pumpWidget(MaterialApp(theme: buildBusyApiTheme(brightness: Brightness.light, accentColor: Colors.blue),
          localizationsDelegates: AppLocalizations.localizationsDelegates, supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: AnimatedBuilder(animation: workspace, builder: (_, __) => Designer(controller: workspace, run: run, reveal: (_) {})))));
        for (final accept in [false, true]) {
          await tester.runAsync(() => workspace.selectObject({'root': workspace.root, 'resource': workspace.buffer!.id, 'pointer': '$group/Use'}));
          final action = find.widgetWithText(BusyApiActionRow, 'Inline this occurrence…');
          await ready(() => action.evaluate().any((element) => (element.widget as BusyApiActionRow).onTap != null));
          await tester.ensureVisible(action);await tester.runAsync(() => tester.tap(action));
          await ready(() => find.text('Review reference inlining').evaluate().isNotEmpty);
          expect(workspace.buffer!.text, original);
          final choice = find.widgetWithText(BusyApiDialogButton, accept ? 'Apply' : 'Cancel');
          await tester.ensureVisible(choice);await tester.runAsync(() => tester.tap(choice));
          await ready(() => find.text('Review reference inlining').evaluate().isEmpty);
          if (pending != null) await tester.runAsync(() => pending!);
          if (!accept) expect(workspace.buffer!.text, original);
        }
        final accepted = workspace.buffer!.bytes();
        final data = jsonDecode(workspace.buffer!.text), values = version == '2.0' ? data['definitions'] : data['components']['schemas'];
        expect(values['Node']['properties']['next'][r'$ref'], '#$group/Node');
        expect(values['Use']['properties']['next'][r'$ref'], '#$group/Node');expect(values['Use']['type'], 'object');
        expect(workspace.buffer!.text, contains('9007199254740993.00'));
        await tester.runAsync(() async {await workspace.undo();expect(workspace.buffer!.text, original);await workspace.redo();expect(workspace.buffer!.bytes(), accepted);await workspace.saveAll();});
        expect(file.readAsBytesSync(), accepted);expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.runAsync(() async {await workspace.shutdown();workspace.dispose();directory.deleteSync(recursive: true);});
      }
    });
  }
}
