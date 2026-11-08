import 'dart:io';

import 'package:busyapi/l10n/generated/app_localizations.dart';
import 'package:busyapi/src/app/app_theme.dart';
import 'package:busyapi/src/app/busyapi_design.dart';
import 'package:busyapi/src/comparison/review_comparison.dart';
import 'package:busyapi/src/workspace/migration_review.dart';
import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../packages/busyapi_core/test/migration_r3c_fixture.dart';
import '../packages/busyapi_core/test/test_support.dart';

void main() {
  for (final state in ['publish', 'stale', 'unsupported', 'repeated', 'factored']) {
    testWidgets('R3c native review exposes exact parameter/configuration changes: $state', (tester) async {
      tester.view.physicalSize = const Size(1400, 1200);tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
      final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      for (final name in ['yaru_window', 'yaru_window/events']) {
        messenger.setMockMethodCallHandler(MethodChannel(name), (call) async =>
          name == 'yaru_window' && call.method == 'state' ? {'active': true, 'visible': true, 'closable': true} : null);
        addTearDown(() => messenger.setMockMethodCallHandler(MethodChannel(name), null));
      }
      const menu = MethodChannel('busyapi/native_menus');
      messenger.setMockMethodCallHandler(menu, (call) async => call.method == 'show'
        ? ((call.arguments as Map)['entries'] as List).indexWhere((entry) => entry['label'] == '3.0.4') : null);
      addTearDown(() => messenger.setMockMethodCallHandler(menu, null));
      final directory = Directory.systemTemp.createTempSync('busyapi-r3c-native-');
      final file = File('${directory.path}/api.yaml'), configuration = File('${directory.path}/busyapi.yaml');
      var original = state == 'factored' ? r3cFactoredSource('3.2.1', 1) : state == 'repeated' ? r3cRepeatedSource('3.2.1', 1) : r3cSource('3.2.1', 'yaml', 1);
      final savedConfiguration = state == 'factored' ? r3cFactoredConfiguration('yaml') : state == 'repeated' ? r3cRepeatedConfiguration('yaml') : r3cConfiguration('yaml');
      if (state == 'unsupported') original = original.replaceAll('application/x-www-form-urlencoded', 'application/json');
      file.writeAsStringSync(original);configuration.writeAsStringSync(savedConfiguration);
      final controller = WorkspaceController(EngineProcess(executable: runtimeNode, helper: runtimeHelper),
        StateLocations(config: '${directory.path}/config', state: '${directory.path}/state', cache: '${directory.path}/cache'));
      Future<void>? dialog;
      Future<void> ready(bool Function() condition) async {
        final watch = Stopwatch()..start();await tester.pump();
        while (!condition() && watch.elapsed < const Duration(seconds: 20)) {
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
          await tester.pump(const Duration(milliseconds: 20));
        }
        expect(condition(), true, reason: '${controller.error}');await tester.pumpAndSettle();
      }
      try {
        await tester.runAsync(() async {
          await controller.initialize();await controller.open(directory.path);
          controller.sourceEdit(controller.root!, controller.buffer!.text.replaceFirst('R3c parameters', 'Unsaved R3c parameters'));
          await controller.analyse();expect(controller.analysis!['status'], 'complete');
        });
        final working = controller.buffer!.text;
        await tester.pumpWidget(MaterialApp(
          theme: buildBusyApiTheme(brightness: Brightness.light, accentColor: Colors.blue),
          localizationsDelegates: AppLocalizations.localizationsDelegates, supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(builder: (context) => Scaffold(body: TextButton(
            onPressed: () => dialog = showMigrationReview(context, controller, reveal: (_) async {}), child: const Text('Migrate'),
          ))),
        ));
        await tester.runAsync(() => tester.tap(find.text('Migrate')));
        final review = find.widgetWithText(BusyApiDialogButton, 'Review migration');await ready(() => review.evaluate().isNotEmpty);
        await tester.tap(find.byWidgetPredicate((widget) => widget is BusyApiComboRow<String> && widget.title == 'Target specification'));
        await tester.pumpAndSettle();await tester.runAsync(() => tester.tap(review));
        final publish = find.widgetWithText(BusyApiDialogButton, 'Create migrated copy');
        await ready(() => publish.evaluate().isNotEmpty);
        if (state == 'unsupported') {
          expect(tester.widget<BusyApiDialogButton>(publish).onPressed, isNull);
          expect(find.textContaining('field-free framing'), findsOneWidget);
        } else {
          expect(find.textContaining('/tests/0/parameters'), findsOneWidget);
          final output = find.widgetWithText(BusyApiDialogButton, 'Review output');
          await tester.runAsync(() => tester.tap(output));await ready(() => find.byType(BusyApiReviewComparison).evaluate().isNotEmpty);
          final comparison = tester.widget<BusyApiReviewComparison>(find.byType(BusyApiReviewComparison));
          expect(comparison.before, working);if (state != 'factored') expect(comparison.after, contains('text/plain'));if (state != 'repeated') expect(comparison.after, contains('9007199254740993.00'));
          if (state == 'repeated' || state == 'factored') expect(comparison.after, contains('array'));
          if (state == 'stale') {
            await tester.runAsync(() async {controller.sourceEdit(controller.root!, '$working ');});
          }
          await tester.runAsync(() => tester.tap(publish));
          if (state == 'publish' || state == 'repeated' || state == 'factored') {
            await ready(() => File('${directory.path}/busyapi-migrated/openapi.yaml').existsSync());
            await tester.runAsync(() async {
              final cold = await BusyProject.open('${directory.path}/busyapi-migrated', controller.engine);
              try {expect((await cold.check(cold.roots.single.id))['complete'], true);} finally {cold.close();}
            });
          } else {
            await ready(() => find.textContaining('changed').evaluate().isNotEmpty);
            expect(Directory('${directory.path}/busyapi-migrated').existsSync(), false);
          }
        }
        expect(file.readAsStringSync(), original);
        expect(configuration.readAsStringSync(), savedConfiguration);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());await tester.runAsync(() async {
          controller.dispose();await dialog;await directory.delete(recursive: true);
        });
      }
    });
  }
}
