import 'dart:convert';
import 'dart:io';
import 'migration_multi_name_multipart_review_fixture.dart';
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
import '../packages/busyapi_core/test/test_support.dart';

void namedMultipartReviewRegressions() {
  multiNameMultipartReviewRegressions();
  for (final stale in [false, true]) {
    testWidgets('R3d1b native named owners and saved-value review stale=$stale', (tester) async {
      final temp = Directory.systemTemp.createTempSync('busyapi-named-review-');
      final file = File('${temp.path}/openapi.yaml');
      final part = {'type': 'object', 'required': ['tag'], 'additionalProperties': false, 'properties': {'tag': {'type': 'string'}}};
      final original = jsonEncode({'openapi': '3.2.1', 'info': {'title': 'Original named', 'version': '1'}, 'paths': {'/parts': {'post': {
        'requestBody': {'content': {'multipart/form-data': {'schema': {'type': 'array', 'maxItems': 3, 'items': part}, 'itemEncoding': {'contentType': 'text/plain'}}}},
        'responses': {'204': {'description': 'Empty'}},
      }}}});
      file.writeAsStringSync(original);
      File('${temp.path}/busyapi.yaml').writeAsStringSync('version: 1\nroots: [{name: api, path: openapi.yaml}]\ntests:\n- name: saved\n  operation: {entry: api, method: POST, path: /parts}\n  body: {mediaType: multipart/form-data, value: [{tag: snow}, {tag: ""}]}\n');
      final controller = WorkspaceController(EngineProcess(executable: runtimeNode, helper: runtimeHelper),
        StateLocations(config: '${temp.path}/config', state: '${temp.path}/state', cache: '${temp.path}/cache'));
      Future<void>? dialog;
      Future<void> ready(bool Function() condition) async {
        final watch = Stopwatch()..start();
        while (!condition() && watch.elapsed < const Duration(seconds: 20)) {
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
          await tester.pump(const Duration(milliseconds: 20));
        }
        expect(condition(), true, reason: '${controller.error}');await tester.pumpAndSettle();
      }
      try {
        await tester.runAsync(() async {await controller.initialize();await controller.open(temp.path);
          controller.sourceEdit(controller.root!, original.replaceFirst('Original named', 'Unsaved named'));await controller.analyse();});
        await tester.pumpWidget(MaterialApp(theme: buildBusyApiTheme(brightness: Brightness.light, accentColor: Colors.blue),
          localizationsDelegates: AppLocalizations.localizationsDelegates, supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(builder: (context) => Scaffold(body: TextButton(onPressed: () => dialog = showMigrationReview(context, controller, reveal: (_) async {}), child: const Text('Migrate'))))));
        await tester.runAsync(() => tester.tap(find.text('Migrate')));await tester.pumpAndSettle();
        final review = find.widgetWithText(BusyApiDialogButton, 'Review migration');
        await ready(() => review.evaluate().isNotEmpty && tester.widget<BusyApiDialogButton>(review).onPressed != null);
        const channel = MethodChannel('busyapi/native_menus');
        final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
        messenger.setMockMethodCallHandler(channel, (call) async {
          if (call.method != 'show') return null;
          final entries = (call.arguments as Map)['entries'] as List;
          final index = entries.indexWhere((entry) => entry['label'] == '3.1.2');
          expect(index, greaterThanOrEqualTo(0));return index;
        });
        addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
        await tester.tap(find.byWidgetPredicate((widget) => widget is BusyApiComboRow<String> && widget.title == 'Target specification'));
        await tester.pumpAndSettle();
        await tester.runAsync(() => tester.tap(review));
        await ready(() => find.byType(BusyApiReviewComparison).evaluate().isNotEmpty);
        final comparison = tester.widget<BusyApiReviewComparison>(find.byType(BusyApiReviewComparison));
        expect(comparison.before, contains('itemEncoding'));expect(comparison.after, contains('encoding'));
        expect(comparison.after, contains('positional_named_schema'));
        expect(find.byWidgetPredicate((widget) => widget is SelectableText && (widget.data?.contains('/tests/0/body') ?? false)), findsOneWidget);
        final publish = find.widgetWithText(BusyApiDialogButton, 'Create migrated copy');
        if (stale) {
          await tester.runAsync(() async {controller.sourceEdit(controller.root!, original.replaceFirst('Original named', 'Changed named'));await controller.analyse();});
          await ready(() => tester.widget<BusyApiDialogButton>(publish).onPressed == null);
          expect(Directory('${temp.path}/busyapi-migrated').existsSync(), false);
        } else {
          await tester.runAsync(() => tester.tap(publish));
          await ready(() => File('${temp.path}/busyapi-migrated/busyapi.yaml').existsSync());
          final manifest = jsonDecode(File('${temp.path}/busyapi-migrated/busyapi.yaml').readAsStringSync()) as Map;
          expect(manifest['tests'][0]['body']['value'], {'tag': ['snow', '']});
        }
        expect(file.readAsStringSync(), original);
        await tester.runAsync(() => tester.tap(find.widgetWithText(BusyApiDialogButton, 'Close')));
        await tester.pumpAndSettle();await tester.runAsync(() => dialog!);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());await tester.runAsync(controller.shutdown);controller.dispose();temp.deleteSync(recursive: true);
      }
    });
  }
}
