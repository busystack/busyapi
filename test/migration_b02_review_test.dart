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

import '../packages/busyapi_core/test/b02_migration_support.dart';
import '../packages/busyapi_core/test/test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final mode in b02Cases) {
    final target = mode == 'finite-tuple' ? '3.0.4' : '2.0';
    final format = mode == 'condition' || mode == 'tail' ? 'yaml' : 'json';
    testWidgets('$mode native B02 review retains dirty source and cold runtime behavior in $target', (tester) async {
      tester.view.physicalSize = const Size(1400, 1200);tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
      final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      messenger.setMockMethodCallHandler(const MethodChannel('yaru_window'), (call) async =>
        call.method == 'state' ? {'active': true, 'visible': true, 'closable': true} : null);
      messenger.setMockMethodCallHandler(const MethodChannel('yaru_window/events'), (_) async => null);
      messenger.setMockMethodCallHandler(const MethodChannel('busyapi/native_menus'), (call) async {
        if (call.method != 'show') return null;
        final entries = (call.arguments as Map)['entries'] as List;
        final index = entries.indexWhere((entry) => entry['label'] == target || (entry['label'] as String).endsWith('/model.yaml'));
        expect(index, greaterThanOrEqualTo(0));return index;
      });
      addTearDown(() {
        for (final name in ['yaru_window', 'yaru_window/events', 'busyapi/native_menus']) {
          messenger.setMockMethodCallHandler(MethodChannel(name), null);
        }
      });
      final directory = Directory.systemTemp.createTempSync('busyapi-b02-review-');
      final file = File('${directory.path}/api.$format'), model = File('${directory.path}/model.yaml');
      final original = b02Api('3.2.1', format, port: 19090), modelOriginal = b02Model(mode);
      file.writeAsStringSync(original);model.writeAsStringSync(modelOriginal);
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
          await controller.initialize();await controller.open(file.path);
          controller.sourceEdit(controller.root!, original.replaceFirst('Original B02 雪', 'Unsaved B02 雪'));
          final shared = await controller.project!.buffer(model.uri.toString());
          controller.sourceEdit(shared.id, shared.text.replaceFirst('Original B02 model', 'Unsaved B02 model'));
          await controller.analyse();
        });
        await tester.pumpWidget(MaterialApp(
          theme: buildBusyApiTheme(brightness: Brightness.light, accentColor: Colors.blue),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(builder: (context) => Scaffold(body: TextButton(onPressed: () {
            dialog = showMigrationReview(context, controller, reveal: (_) async {});
          }, child: const Text('Review B02')))),
        ));
        await tester.tap(find.text('Review B02'));await tester.pumpAndSettle();
        final review = find.widgetWithText(BusyApiDialogButton, 'Review migration');
        await ready(() => review.evaluate().isNotEmpty);
        final choice = find.byWidgetPredicate((widget) => widget is BusyApiComboRow<String> && widget.title == 'Target specification');
        await tester.tap(choice);await tester.pumpAndSettle();
        await tester.runAsync(() => tester.tap(review));
        final destination = find.widgetWithText(BusyApiDialogButton, 'Review output');
        await ready(() => destination.evaluate().isNotEmpty);
        await tester.runAsync(() => tester.tap(destination));
        await ready(() => find.byType(BusyApiReviewComparison).evaluate().isNotEmpty);
        final comparison = tester.widget<BusyApiReviewComparison>(find.byType(BusyApiReviewComparison));
        expect(comparison.before, contains('Unsaved B02 雪'));expect(comparison.after, contains(target));
        final resource = find.byWidgetPredicate((widget) => widget is BusyApiComboRow<int>);
        expect(resource, findsOneWidget);await tester.tap(resource);await tester.pumpAndSettle();
        final sharedComparison = tester.widget<BusyApiReviewComparison>(find.byType(BusyApiReviewComparison));
        expect(sharedComparison.before, contains('Unsaved B02 model'));expect(sharedComparison.after, contains('Unsaved B02 model'));
        expect(sharedComparison.after, contains('x-alias: *literal'));expect(sharedComparison.after, contains('9007199254740993.00'));
        final publish = find.widgetWithText(BusyApiDialogButton, 'Create migrated copy');
        expect(tester.widget<BusyApiDialogButton>(publish).onPressed, isNotNull);
        await tester.runAsync(() => tester.tap(publish));
        final path = '${directory.path}/busyapi-migrated';
        await ready(() => File('$path/openapi.$format').existsSync() &&
          find.text('The migrated copy was created. Original documents are preserved.').evaluate().isNotEmpty);
        await tester.runAsync(() async {
          final cold = await BusyProject.open(path, controller.engine);
          try {
            final root = cold.roots.single.id;
            final prepared = await cold.prepareRequest(root, resource: root, pointer: '/paths/~1echo/post');
            try {
              final result = await prepared.evaluateRuntime([
                for (final direction in ['request-body', 'response-body']) for (final (sample, _) in b02Instances(mode))
                  RuntimeSchemaInstance(subject: direction, location: mode, text: sample,
                    schemaResource: root, schemaPointer: '${target == '2.0' ? '/definitions' : '/components/schemas'}/Subject'),
              ]);
              expect(result['complete'], true, reason: '$result');
              expect((result['runtimeEvaluations'] as List).map((value) => value['valid']), [
                for (final _ in ['request', 'response']) ...b02Instances(mode).map((value) => value.$2),
              ]);
            } finally {prepared.close();}
          } finally {cold.close();}
        });
        expect(file.readAsStringSync(), original);expect(model.readAsStringSync(), modelOriginal);
        expect(controller.buffer!.text, original.replaceFirst('Original B02 雪', 'Unsaved B02 雪'));
        expect(controller.buffer!.dirty, true);
        final close = find.widgetWithText(BusyApiDialogButton, 'Close');
        await tester.runAsync(() => tester.tap(close));await tester.pumpAndSettle();await tester.runAsync(() => dialog!);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());await tester.runAsync(controller.shutdown);controller.dispose();
        directory.deleteSync(recursive: true);
      }
    });
  }
}
