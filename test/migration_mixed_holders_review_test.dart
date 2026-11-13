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

import '../packages/busyapi_core/test/migration_mixed_holder_fixture.dart';
import '../packages/busyapi_core/test/test_support.dart';

void main() {
  for (final version in ['3.0.4', '3.1.2']) {
    for (final outcome in ['publish', 'stale', 'invalid', 'overlap']) {
      testWidgets('native foreign $version holder review $outcome preserves original sources', (tester) async {
        tester.view.physicalSize = const Size(1400, 1200);tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
        final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
        for (final name in ['yaru_window', 'yaru_window/events']) {
          messenger.setMockMethodCallHandler(MethodChannel(name), (call) async => call.method == 'state'
            ? {'active': true, 'visible': true, 'closable': true} : null);
          addTearDown(() => messenger.setMockMethodCallHandler(MethodChannel(name), null));
        }
        final directory = Directory.systemTemp.createTempSync('busyapi-native-mixed-holders-');
        final originals = mixedHolderDocuments(version, 'https://api.invalid', invalid: outcome == 'invalid',
          overlappingContainers: outcome == 'overlap');
        for (final entry in originals.entries) {
          File('${directory.path}/${entry.key}').writeAsStringSync(entry.value);
        }
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
            controller.sourceEdit(controller.root!, controller.buffer!.text.replaceFirst('First', 'Captured First'));
            await controller.analyse();
          });
          await tester.pumpWidget(MaterialApp(
            theme: buildBusyApiTheme(brightness: Brightness.light, accentColor: Colors.blue),
            localizationsDelegates: AppLocalizations.localizationsDelegates, supportedLocales: AppLocalizations.supportedLocales,
            home: Builder(builder: (context) => Scaffold(body: TextButton(
              onPressed: () => dialog = showMigrationReview(context, controller, reveal: (_) async {}), child: const Text('Migrate')))),
          ));
          await tester.runAsync(() => tester.tap(find.text('Migrate')));
          final review = find.widgetWithText(BusyApiDialogButton, 'Review migration');
          await ready(() => review.evaluate().isNotEmpty);await tester.runAsync(() => tester.tap(review));
          final destination = find.widgetWithText(BusyApiDialogButton, 'Review output');
          await ready(() => destination.evaluate().isNotEmpty);await tester.runAsync(() => tester.tap(destination));
          final publish = find.widgetWithText(BusyApiDialogButton, 'Create migrated copy');
          if (outcome == 'invalid') {
            await ready(() => find.textContaining('migration.validation.').evaluate().isNotEmpty);
            expect(tester.widget<BusyApiDialogButton>(publish).onPressed, isNull);
          } else {
            await ready(() => find.byType(BusyApiReviewComparison).evaluate().isNotEmpty);
            final comparison = tester.widget<BusyApiReviewComparison>(find.byType(BusyApiReviewComparison));
            expect(comparison.before, contains('Captured First'));expect(comparison.after, contains('_migrated_entry_use_'));
            expect(comparison.after, contains('_migrated_security_owner_'));
            expect(find.text('${File('${directory.path}/b.yaml').uri} · $version → 3.2.1'), findsOneWidget);
            if (outcome == 'stale') {
              await tester.runAsync(() async {
                final file = File('${directory.path}/b.yaml');
                final buffer = await controller.project!.buffer(file.uri.toString());
                controller.sourceEdit(buffer.id, buffer.text.replaceFirst('Second', 'Changed Second'));await controller.analyse();
              });
              await ready(() => tester.widget<BusyApiDialogButton>(publish).onPressed == null);
            } else {
              expect(tester.widget<BusyApiDialogButton>(publish).onPressed, isNotNull);
              await tester.runAsync(() => tester.tap(publish));
              await ready(() => find.text('The migrated copy was created. Original documents are preserved.').evaluate().isNotEmpty);
              expect(File('${directory.path}/busyapi-migrated/openapi.yaml').readAsStringSync(), contains('3.2.1'));
              if (outcome == 'overlap') {
                final outputs = Directory('${directory.path}/busyapi-migrated').listSync().whereType<File>();
                expect(outputs.any((file) => file.readAsStringSync().contains('_migrated_object_use_')), true);
              }
            }
          }
          expect(Directory('${directory.path}/busyapi-migrated').existsSync(), outcome == 'publish' || outcome == 'overlap');
          for (final entry in originals.entries) {
            expect(File('${directory.path}/${entry.key}').readAsStringSync(), entry.value);
          }
          expect(controller.project!.store.get(File('${directory.path}/a.yaml').uri.toString()).dirty, true);
        } finally {
          final close = find.widgetWithText(BusyApiDialogButton, 'Close');
          if (close.evaluate().isNotEmpty) await tester.tap(close);
          await tester.pumpAndSettle();if (dialog != null) await tester.runAsync(() => dialog!);
          await tester.pumpWidget(const SizedBox.shrink());await tester.runAsync(controller.shutdown);controller.dispose();directory.deleteSync(recursive: true);
        }
      });
    }
  }
}
