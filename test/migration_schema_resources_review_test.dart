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

import '../packages/busyapi_core/test/migration_schema_resource_fixture.dart';
import '../packages/busyapi_core/test/test_support.dart';
import 'widget_io.dart';

void main() {
  for (final outcome in ['publish', 'stale', 'unsupported']) {
    testWidgets(
      'native whole-resource review $outcome retains originals and captured dialects',
      (tester) async {
        tester.view.physicalSize = const Size(1400, 1200);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final messenger =
            TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
        for (final name in ['yaru_window', 'yaru_window/events']) {
          messenger.setMockMethodCallHandler(
            MethodChannel(name),
            (call) async => call.method == 'state'
                ? {'active': true, 'visible': true, 'closable': true}
                : null,
          );
          addTearDown(
            () => messenger.setMockMethodCallHandler(MethodChannel(name), null),
          );
        }
        final directory = Directory.systemTemp.createTempSync(
          'busyapi-native-resource-review-',
        );
        final originals = schemaResourceDocuments(
          invalid: outcome == 'unsupported',
        );
        for (final entry in originals.entries) {
          final file = File('${directory.path}/${entry.key}');
          file.parent.createSync(recursive: true);
          file.writeAsStringSync(entry.value);
        }
        final controller = WorkspaceController(
          EngineProcess(executable: runtimeNode, helper: runtimeHelper),
          StateLocations(
            config: '${directory.path}/config',
            state: '${directory.path}/state',
            cache: '${directory.path}/cache',
          ),
        );
        Future<void>? dialog;
        final reviewedFiles = <String, String>{},
            reviewedDestinations = <String, String>{};
        Future<void> ready(bool Function() condition) async {
          final watch = Stopwatch()..start();
          await tester.pump();
          while (!condition() && watch.elapsed < const Duration(seconds: 20)) {
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 20)),
            );
            await tester.pump(const Duration(milliseconds: 20));
          }
          expect(
            condition(),
            true,
            reason:
                '${controller.error}; ${tester.widgetList<BusyApiStatusBox>(find.byType(BusyApiStatusBox)).map((widget) => widget.message).toList()}',
          );
          await tester.pumpAndSettle();
        }

        try {
          await runWidgetIo(tester, () async {
            await controller.initialize();
            await controller.open(directory.path);
            await controller.selectRoot(
              File('${directory.path}/first/api.yaml').uri.toString(),
            );
            controller.sourceEdit(
              controller.root!,
              controller.buffer!.text.replaceFirst('First', 'Captured First'),
            );
            await controller.analyse();
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
                    onPressed: () => dialog = showMigrationReview(
                      context,
                      controller,
                      reveal: (_) async {},
                    ),
                    child: const Text('Migrate'),
                  ),
                ),
              ),
            ),
          );
          await tester.runAsync(() => tester.tap(find.text('Migrate')));
          final review = find.widgetWithText(
            BusyApiDialogButton,
            'Review migration',
          );
          await ready(() => review.evaluate().isNotEmpty);
          await tester.runAsync(() => tester.tap(review));
          final output = find.widgetWithText(
            BusyApiDialogButton,
            'Review output',
          );
          await ready(() => output.evaluate().isNotEmpty);
          await tester.runAsync(() => tester.tap(output));
          final publish = find.widgetWithText(
            BusyApiDialogButton,
            'Create migrated copy',
          );
          if (outcome == 'unsupported') {
            await ready(
              () => find.textContaining('dialect').evaluate().isNotEmpty,
            );
            expect(
              tester.widget<BusyApiDialogButton>(publish).onPressed,
              isNull,
            );
          } else {
            await ready(
              () => find.byType(BusyApiReviewComparison).evaluate().isNotEmpty,
            );
            final resources = tester.widget<BusyApiComboRow<int>>(
              find.byWidgetPredicate(
                (widget) => widget is BusyApiComboRow<int>,
              ),
            );
            final comparisons = <String, BusyApiReviewComparison>{};
            for (final index in resources.values) {
              resources.onSelected(index);
              await tester.pumpAndSettle();
              final comparison = tester.widget<BusyApiReviewComparison>(
                find.byType(BusyApiReviewComparison),
              );
              comparisons[resources.labelFor(index)] = comparison;
              final destination = tester
                  .widgetList<SelectableText>(find.byType(SelectableText))
                  .map((widget) => widget.data)
                  .whereType<String>()
                  .singleWhere(
                    (value) => value.startsWith(
                      Uri.directory('${directory.path}/busyapi-migrated')
                          .toString(),
                    ),
                  );
              reviewedFiles[destination] = comparison.after;
              reviewedDestinations[resources.labelFor(index)] = destination;
            }
            final first =
                comparisons[File('${directory.path}/first/api.yaml').uri
                    .toString()]!;
            expect(first.before, controller.buffer!.text);
            expect(first.after, contains('Captured First'));
            expect(
              first.after,
              contains('https://json-schema.org/draft/2020-12/schema'),
            );
            final data =
                comparisons[File('${directory.path}/data/parts.yaml').uri
                    .toString()]!;
            expect(data.before, originals['data/parts.yaml']);
            for (final literal in [
              '9007199254740993.00',
              'literal-id',
              'literal-dialect',
              'literal-dynamic',
            ]) {
              expect(data.after, contains(literal));
            }
            if (outcome == 'stale') {
              await tester.runAsync(() async {
                final part = await controller.project!.buffer(
                  File('${directory.path}/data/parts.yaml').uri.toString(),
                );
                controller.sourceEdit(
                  part.id,
                  part.text.replaceFirst(
                    'Resource values',
                    'Current resource values',
                  ),
                );
                await controller.analyse();
              });
              await ready(
                () =>
                    tester.widget<BusyApiDialogButton>(publish).onPressed ==
                    null,
              );
            } else {
              expect(
                tester.widget<BusyApiDialogButton>(publish).onPressed,
                isNotNull,
              );
              await tester.runAsync(() => tester.tap(publish));
              await ready(
                () => find
                    .text(
                      'The migrated copy was created. Original documents are preserved.',
                    )
                    .evaluate()
                    .isNotEmpty,
              );
              await runWidgetIo(tester, () async {
                for (final entry in reviewedFiles.entries) {
                  expect(
                    await File.fromUri(Uri.parse(entry.key)).readAsString(),
                    entry.value,
                  );
                }
                final cold = await BusyProject.open(
                  '${directory.path}/busyapi-migrated',
                  controller.engine,
                );
                try {
                  for (final name in ['first/api.yaml', 'second/api.yaml']) {
                    final root =
                        reviewedDestinations[File('${directory.path}/$name').uri
                            .toString()]!;
                    final checked = await cold.check(root);
                    expect(checked['complete'], true, reason: '$checked');
                    expect(
                      (checked['projection']['operations'] as List)
                          .whereType<Map>()
                          .map((operation) => operation['path']),
                      ['/p'],
                    );
                  }
                } finally {
                  cold.close();
                }
              });
            }
          }
          expect(
            Directory('${directory.path}/busyapi-migrated').existsSync(),
            outcome == 'publish',
          );
          for (final entry in originals.entries) {
            expect(
              File('${directory.path}/${entry.key}').readAsStringSync(),
              entry.value,
            );
          }
          expect(
            controller.project!.store
                .get(File('${directory.path}/first/api.yaml').uri.toString())
                .dirty,
            true,
          );
        } finally {
          final close = find.widgetWithText(BusyApiDialogButton, 'Close');
          if (close.evaluate().isNotEmpty) await tester.tap(close);
          await tester.pumpAndSettle();
          if (dialog != null) await tester.runAsync(() => dialog!);
          await tester.pumpWidget(const SizedBox.shrink());
          await runWidgetIo(tester, controller.shutdown);
          controller.dispose();
          directory.deleteSync(recursive: true);
        }
      },
    );
  }
}
