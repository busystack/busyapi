import 'dart:convert';
import 'dart:io';

import 'package:busyapi/l10n/generated/app_localizations.dart';
import 'package:busyapi/src/app/app_theme.dart';
import 'package:busyapi/src/app/busyapi_design.dart';
import 'package:busyapi/src/workspace/migration_review.dart';
import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../packages/busyapi_core/test/test_support.dart';

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
    for (final channel in ['yaru_window', 'yaru_window/events']) {
      messenger.setMockMethodCallHandler(MethodChannel(channel), null);
    }
  });
  _r3bUnusedReviews();
  for (final format in ['yaml', 'json']) {
    for (final targetVersion in ['3.2.1', '3.1.2', '3.0.4', '2.0']) {
      for (final stale in [false, true]) {
        for (final reusable
            in targetVersion == '2.0' ? [false, true] : [false]) {
          testWidgets(
            '$format $targetVersion ${reusable ? 'R3b reusable' : 'ordinary'} native example review ${stale ? 'rejects stale source' : 'publishes exact bytes'}',
            (tester) async {
              tester.view.physicalSize = const Size(1400, 1200);
              tester.view.devicePixelRatio = 1;
              addTearDown(tester.view.resetPhysicalSize);
              addTearDown(tester.view.resetDevicePixelRatio);
              final directory = Directory.systemTemp.createTempSync(
                'busyapi-example-review-',
              );
              final file = File('${directory.path}/api.$format'),
                  payload = File('${directory.path}/payload.bin');
              final sequence = targetVersion == '3.0.4',
                  modeled =
                      targetVersion == '3.1.2' || targetVersion == '3.0.4';
              final type = sequence
                  ? 'application/json-seq'
                  : modeled
                  ? 'application/xml'
                  : 'text/plain; charset=iso-8859-1';
              final bytes = sequence
                  ? utf8.encode('\x1e1\n\x1e2\n')
                  : modeled
                  ? utf8.encode('<value>café</value>')
                  : [99, 97, 102, 233];
              final value = {
                'openapi': modeled ? '3.2.1' : '3.0.4',
                'info': {'title': 'Original', 'version': 'business'},
                'servers': [
                  {'url': 'https://api.invalid'},
                ],
                'paths': {
                  '/': {
                    'get': {
                      'responses': {
                        '200': {
                          'description': 'Reply',
                          'content': {
                            type: {
                              'schema': sequence
                                  ? {'type': 'array'}
                                  : {
                                      'type': 'string',
                                      'enum': ['café'],
                                      if (modeled)
                                        'xml': {
                                          'name': 'value',
                                          'nodeType': 'element',
                                        },
                                    },
                              if (sequence)
                                'itemSchema': {'type': 'integer', 'minimum': 1},
                              'examples': {
                                'External': {
                                  'externalValue': './payload.bin',
                                  if (modeled)
                                    'dataValue': sequence ? [1, 2] : 'café',
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              };
              if (targetVersion == '2.0') {
                final operation =
                    ((value['paths'] as Map)['/'] as Map)['get'] as Map;
                final media =
                    ((((operation['responses'] as Map)['200'] as Map)['content']
                            as Map)[type]
                        as Map);
                value['components'] = {
                  'examples': {
                    'Bytes': {'externalValue': './payload.bin'},
                    'Alias': {r'$ref': '#/components/examples/Bytes'},
                  },
                };
                media['examples'] = {
                  'First': {r'$ref': '#/components/examples/Alias'},
                  'Same': {r'$ref': '#/components/examples/Bytes'},
                };
                // Exercise R3b through the actual native review/publication path.
                // The same external byte owner now sits under a reusable Media Type
                // and a reusable Path Item, reached only by this Paths occurrence.
                if (reusable) {
                  value['openapi'] = '3.2.1';
                  final components = value['components'] as Map;
                  components['mediaTypes'] = {
                    'Payload': Map<String, Object?>.from(media),
                  };
                  (((operation['responses'] as Map)['200'] as Map)['content']
                      as Map)[type] = {
                    r'$ref': '#/components/mediaTypes/Payload',
                  };
                  final paths = value['paths'] as Map;
                  components['pathItems'] = {'Item': paths['/']};
                  paths['/'] = {r'$ref': '#/components/pathItems/Item'};
                }
              }
              final original =
                  '${format == 'yaml' ? '# Keep original\r\n' : ''}${jsonEncode(value)}\r\n';
              file.writeAsStringSync(original);
              payload.writeAsBytesSync(bytes);
              final controller = WorkspaceController(
                EngineProcess(executable: runtimeNode, helper: runtimeHelper),
                StateLocations(
                  config: '${directory.path}/config',
                  state: '${directory.path}/state',
                  cache: '${directory.path}/cache',
                ),
              );
              Future<void>? dialog;
              Future<void> ready(bool Function() condition) async {
                final watch = Stopwatch()..start();
                await tester.pump();
                while (!condition() &&
                    watch.elapsed < const Duration(seconds: 20)) {
                  await tester.runAsync(
                    () =>
                        Future<void>.delayed(const Duration(milliseconds: 20)),
                  );
                  await tester.pump(const Duration(milliseconds: 20));
                }
                expect(condition(), true, reason: '${controller.error}');
                await tester.pumpAndSettle();
              }

              try {
                await tester.runAsync(() async {
                  await controller.initialize();
                  await controller.open(file.path);
                  await controller.analyse();
                  if (targetVersion == '2.0') {
                    controller.sourceEdit(
                      controller.root!,
                      controller.buffer!.text.replaceFirst(
                        'Original',
                        'Working R2',
                      ),
                    );
                    await controller.analyse();
                  }
                });
                await tester.pumpWidget(
                  MaterialApp(
                    theme: buildBusyApiTheme(
                      brightness: Brightness.light,
                      accentColor: Colors.blue,
                    ),
                    localizationsDelegates:
                        AppLocalizations.localizationsDelegates,
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
                if (targetVersion != '3.2.1') {
                  const channel = MethodChannel('busyapi/native_menus');
                  final messenger = TestDefaultBinaryMessengerBinding
                      .instance
                      .defaultBinaryMessenger;
                  messenger.setMockMethodCallHandler(channel, (call) async {
                    if (call.method != 'show') return null;
                    return ((call.arguments as Map)['entries'] as List)
                        .indexWhere((entry) => entry['label'] == targetVersion);
                  });
                  addTearDown(
                    () => messenger.setMockMethodCallHandler(channel, null),
                  );
                  await tester.tap(
                    find.byWidgetPredicate(
                      (widget) =>
                          widget is BusyApiComboRow<String> &&
                          widget.title == 'Target specification',
                    ),
                  );
                  await tester.pumpAndSettle();
                }
                await tester.runAsync(() => tester.tap(review));
                final destination = find.widgetWithText(
                  BusyApiDialogButton,
                  'Review output',
                );
                await ready(() => destination.evaluate().isNotEmpty);
                await tester.runAsync(() => tester.tap(destination));
                final copy = find.byWidgetPredicate(
                  (widget) =>
                      widget is SelectableText &&
                      widget.data?.startsWith(
                            'Copy ${bytes.length} bytes unchanged: ${payload.uri} → ',
                          ) ==
                          true,
                );
                final publish = find.widgetWithText(
                  BusyApiDialogButton,
                  'Create migrated copy',
                );
                if (targetVersion == '2.0') {
                  await ready(
                    () =>
                        publish.evaluate().isNotEmpty &&
                        tester.widget<BusyApiDialogButton>(publish).onPressed !=
                            null,
                  );
                  expect(copy, findsNothing);
                } else {
                  await ready(() => copy.evaluate().isNotEmpty);
                  await tester.ensureVisible(copy);
                  expect(
                    tester.widget<SelectableText>(copy).data,
                    contains('/examples/'),
                  );
                }
                expect(
                  tester.widget<BusyApiDialogButton>(publish).onPressed,
                  isNotNull,
                );
                final output = Directory('${directory.path}/busyapi-migrated');
                expect(output.existsSync(), false);
                if (stale) {
                  await tester.runAsync(() async {
                    controller.sourceEdit(
                      controller.root!,
                      controller.buffer!.text.replaceFirst(
                        targetVersion == '2.0' ? 'Working R2' : 'Original',
                        'Changed',
                      ),
                    );
                    await controller.analyse();
                  });
                  await ready(
                    () =>
                        tester.widget<BusyApiDialogButton>(publish).onPressed ==
                        null,
                  );
                  expect(output.existsSync(), false);
                } else {
                  await tester.runAsync(() => tester.tap(publish));
                  await ready(
                    () =>
                        output.existsSync() &&
                        find
                            .text(
                              'The migrated copy was created. Original documents are preserved.',
                            )
                            .evaluate()
                            .isNotEmpty,
                  );
                  if (targetVersion == '2.0') {
                    expect(
                      Directory('${output.path}/examples').existsSync(),
                      false,
                    );
                    final text = File('${output.path}/openapi.$format')
                        .readAsStringSync();
                    expect(text, contains('swagger'));
                    expect(text, contains('café'));
                    expect(text, contains('Working R2'));
                  } else {
                    final copies = Directory('${output.path}/examples')
                        .listSync()
                        .whereType<File>()
                        .toList();
                    expect(copies, hasLength(1));
                    expect(copies.single.readAsBytesSync(), bytes);
                    expect(
                      File('${output.path}/openapi.$format').readAsStringSync(),
                      contains('examples/'),
                    );
                  }
                }
                expect(file.readAsStringSync(), original);
                expect(payload.readAsBytesSync(), bytes);
                final close = find.widgetWithText(BusyApiDialogButton, 'Close');
                await ready(() => close.evaluate().isNotEmpty);
                await tester.runAsync(() => tester.tap(close));
                await tester.pumpAndSettle();
                await tester.runAsync(() => dialog!);
              } finally {
                await tester.pumpWidget(const SizedBox.shrink());
                await tester.runAsync(controller.shutdown);
                controller.dispose();
                directory.deleteSync(recursive: true);
              }
            },
          );
        }
      }
    }
  }
}

void _r3bUnusedReviews() {
  for (final kind in ['path-item', 'media']) {
    testWidgets(
      'R3b unused $kind reports a located target restriction and disables native publication',
      (tester) async {
        tester.view.physicalSize = const Size(1400, 1200);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final directory = Directory.systemTemp.createTempSync(
          'busyapi-r3b-unused-review-',
        );
        final file = File('${directory.path}/api.json');
        final original = jsonEncode({
          'openapi': '3.2.1',
          'info': {'title': 'Unused R3b', 'version': '1'},
          'paths': {},
          'components': {
            kind == 'path-item' ? 'pathItems' : 'mediaTypes': {
              'Unused': kind == 'path-item'
                  ? {
                      'get': {
                        'responses': {
                          '204': {'description': 'Inactive'},
                        },
                      },
                    }
                  : {
                      'schema': {'type': 'boolean'},
                      'example': false,
                    },
            },
          },
        });
        file.writeAsStringSync(original);
        final controller = WorkspaceController(
          EngineProcess(executable: runtimeNode, helper: runtimeHelper),
          StateLocations(
            config: '${directory.path}/config',
            state: '${directory.path}/state',
            cache: '${directory.path}/cache',
          ),
        );
        Future<void>? dialog;
        Future<void> ready(bool Function() condition) async {
          final watch = Stopwatch()..start();
          await tester.pump();
          while (!condition() && watch.elapsed < const Duration(seconds: 20)) {
            await tester.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 20)),
            );
            await tester.pump(const Duration(milliseconds: 20));
          }
          expect(condition(), true, reason: '${controller.error}');
          await tester.pumpAndSettle();
        }

        try {
          String? message;
          await tester.runAsync(() async {
            await controller.initialize();
            await controller.open(file.path);
            await controller.analyse();
            final preview = await controller.project!.prepareMigration(
              file.uri.toString(),
              '${directory.path}/preview',
              targetVersion: '2.0',
            );
            try {
              expect(preview.publishable, false);
              message = preview.problems.single.message;
              expect(
                (preview.result['problems'] as List).single['reason'],
                'target-representation',
              );
            } finally {
              preview.close();
            }
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
          const channel = MethodChannel('busyapi/native_menus');
          final messenger =
              TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
          messenger.setMockMethodCallHandler(
            channel,
            (call) async => call.method == 'show'
                ? ((call.arguments as Map)['entries'] as List).indexWhere(
                    (entry) => entry['label'] == '2.0',
                  )
                : null,
          );
          addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
          await tester.tap(
            find.byWidgetPredicate(
              (widget) =>
                  widget is BusyApiComboRow<String> &&
                  widget.title == 'Target specification',
            ),
          );
          await tester.pumpAndSettle();
          await tester.runAsync(() => tester.tap(review));
          final destination = find.widgetWithText(
            BusyApiDialogButton,
            'Review output',
          );
          await ready(() => destination.evaluate().isNotEmpty);
          await tester.runAsync(() => tester.tap(destination));
          await ready(
            () => find
                .widgetWithText(BusyApiActionRow, message!)
                .evaluate()
                .isNotEmpty,
          );
          final publish = find.widgetWithText(
            BusyApiDialogButton,
            'Create migrated copy',
          );
          expect(tester.widget<BusyApiDialogButton>(publish).onPressed, isNull);
          expect(
            Directory('${directory.path}/busyapi-migrated').existsSync(),
            false,
          );
          expect(file.readAsStringSync(), original);
          await tester.runAsync(
            () => tester.tap(find.widgetWithText(BusyApiDialogButton, 'Close')),
          );
          await tester.pumpAndSettle();
          await tester.runAsync(() => dialog!);
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.runAsync(controller.shutdown);
          controller.dispose();
          directory.deleteSync(recursive: true);
        }
      },
    );
  }
}
