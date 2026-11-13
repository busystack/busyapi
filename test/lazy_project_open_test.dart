import 'dart:io';

import 'package:busyapi/l10n/generated/app_localizations.dart';
import 'package:busyapi/src/app/app_theme.dart';
import 'package:busyapi/src/app/busyapi_design.dart';
import 'package:busyapi/src/designer/designer.dart';
import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../packages/busyapi_core/test/test_support.dart';
import 'widget_io.dart';

class _SelectionEngine extends EngineProcess {
  _SelectionEngine() : super(executable: runtimeNode, helper: runtimeHelper);
  final analysedRoots = <String>[];

  @override
  Future<Map<String, dynamic>> request(
    String method,
    Map<String, Object?> params, {
    String? requestId,
  }) {
    if (method == 'analyse') analysedRoots.add(params['root'] as String);
    return super.request(method, params, requestId: requestId);
  }
}

void main() {
  testWidgets(
    'explicit and remembered root selection acquire only their source closure',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final directory = Directory.systemTemp.createTempSync(
        'busyapi-lazy-open-',
      );
      final projectDirectory = Directory('${directory.path}/project')
        ..createSync();
      final sources = <File, List<int>>{};
      for (final name in ['First', 'Second']) {
        final stem = name.toLowerCase();
        final root = File('${projectDirectory.path}/$stem.yaml')
          ..writeAsStringSync(
            'openapi: 3.2.1\ninfo: {title: $name, version: "1"}\npaths: {}\n'
            'components: {schemas: {Value: {\$ref: $stem-part.yaml#/Value}}}\n',
          );
        final part = File('${projectDirectory.path}/$stem-part.yaml')
          ..writeAsStringSync('Value: {type: string}\n');
        sources[root] = root.readAsBytesSync();
        sources[part] = part.readAsBytesSync();
      }
      final manifest = File('${projectDirectory.path}/busyapi.yaml')
        ..writeAsStringSync(
          'version: 1\nroots: [{name: First, path: first.yaml}, {name: Second, path: second.yaml}]\n',
        );
      sources[manifest] = manifest.readAsBytesSync();
      String id(String name) =>
          File('${projectDirectory.path}/$name.yaml').uri.toString();
      final first = id('first'), second = id('second');
      final locations = StateLocations(
        config: '${directory.path}/config',
        state: '${directory.path}/state',
        cache: '${directory.path}/cache',
      );
      var engine = _SelectionEngine();
      var c = WorkspaceController(engine, locations);
      final errors = <Object>[];
      Future<void> showDesigner() => tester.pumpWidget(
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
                run: (action) => action().catchError((Object error) {
                  errors.add(error);
                }),
                reveal: (_) {},
              ),
            ),
          ),
        ),
      );
      void onlySecond() {
        expect(c.root, second);
        expect(c.active, second);
        expect(engine.analysedRoots, isNotEmpty);
        expect(engine.analysedRoots.every((root) => root == second), true);
        expect(c.store!.buffers.keys, [second]);
        expect(c.project!.dependencies.keys, [second]);
        expect(c.project!.resourceFingerprints, contains(id('second-part')));
        expect(c.project!.resourceFingerprints, isNot(contains(first)));
        expect(
          c.project!.resourceFingerprints,
          isNot(contains(id('first-part'))),
        );
      }

      try {
        await runWidgetIo(tester, () async {
          await c.initialize();
          await c.open(projectDirectory.path);
          expect(c.project!.roots.map((root) => root.name), [
            'First',
            'Second',
          ]);
          expect(c.root, isNull);
          expect(c.store!.buffers, isEmpty);
          expect(engine.analysedRoots, isEmpty);
          expect(await c.selectRoot(second), true);
          await c.analyse();
          onlySecond();
          await c.project!.populateFileBrowser();
          expect(
            c.project!.files,
            contains(File.fromUri(Uri.parse(id('first-part'))).path),
          );
          onlySecond();
        });
        await showDesigner();
        final title = find.descendant(
          of: find.widgetWithText(BusyApiGroupedTextEntry, 'Title'),
          matching: find.byType(TextField),
        );
        expect(tester.widget<TextField>(title).controller!.text, 'Second');
        expect(tester.widget<TextField>(title).readOnly, false);
        await tester.pumpWidget(const SizedBox.shrink());
        await runWidgetIo(tester, c.shutdown);
        c.dispose();

        engine = _SelectionEngine();
        c = WorkspaceController(engine, locations);
        await tester.runAsync(() async {
          await c.initialize();
          await c.open(projectDirectory.path);
          await c.analyse();
          onlySecond();
        });
        await showDesigner();
        expect(tester.widget<TextField>(title).controller!.text, 'Second');
        await runWidgetIo(tester, () async {
          expect(await c.selectRoot(first), true);
          await c.analyse();
        });
        await tester.pump();
        expect(c.root, first);
        expect(engine.analysedRoots, contains(first));
        expect(c.project!.resourceFingerprints, contains(id('first-part')));
        expect(tester.widget<TextField>(title).controller!.text, 'First');
        for (final entry in sources.entries) {
          expect(entry.key.readAsBytesSync(), entry.value);
        }
        expect(errors, isEmpty);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        if (!c.disposed) await runWidgetIo(tester, c.shutdown);
        c.dispose();
        directory.deleteSync(recursive: true);
      }
    },
  );

  test(
    'missing sole configured root opens its manifest for recovery',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'busyapi-missing-root-',
      );
      final manifest = File('${directory.path}/busyapi.yaml')
        ..writeAsStringSync(
          'version: 1\nroots: [{name: Missing, path: missing.yaml}]\n',
        );
      final unrelated = File('${directory.path}/unrelated.yaml')
        ..writeAsStringSync(
          'openapi: 3.2.1\ninfo: {title: Other, version: "1"}\npaths: {}\n',
        );
      final engine = _SelectionEngine();
      final c = WorkspaceController(
        engine,
        StateLocations(
          config: '${directory.path}/config',
          state: '${directory.path}/state',
          cache: '${directory.path}/cache',
        ),
      );
      try {
        await c.initialize();
        await c.open(directory.path);
        expect(c.project!.roots.single.name, 'Missing');
        expect(c.root, isNull);
        expect(c.active, manifest.uri.toString());
        expect(c.buffer!.text, manifest.readAsStringSync());
        expect(c.mode, 'Source');
        expect(c.error, contains('access.read'));
        expect(engine.analysedRoots, isEmpty);
        expect(c.store!.buffers, isNot(contains(unrelated.uri.toString())));
      } finally {
        if (!c.disposed) await c.shutdown();
        c.dispose();
        await directory.delete(recursive: true);
      }
    },
  );
}
