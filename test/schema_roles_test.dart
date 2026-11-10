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

import '../packages/busyapi_core/test/schema_role_support.dart';
import '../packages/busyapi_core/test/test_support.dart';
import 'widget_io.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    for (final name in ['yaru_window', 'yaru_window/events']) {
      messenger.setMockMethodCallHandler(
        MethodChannel(name),
        (_) async => null,
      );
    }
  });
  tearDown(() {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    for (final name in ['yaru_window', 'yaru_window/events']) {
      messenger.setMockMethodCallHandler(MethodChannel(name), null);
    }
  });
  for (final version in ['3.1.2', '3.2.1']) {
    testWidgets('$version Design follows the captured role at a shared definition', (tester) async {
      tester.view.physicalSize=const Size(1300,1000);tester.view.devicePixelRatio=1;
      addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
      final temp=Directory.systemTemp.createTempSync('busyapi-role-navigation-');
      const pointer='/components/schemas/Owner/properties/Shared';
      final file=File('${temp.path}/api.json');
      final text=jsonEncode({'openapi':version,'info':{'title':'Roles','version':'1'},'paths':{},
        'components':{'schemas':{'Owner':{'properties':{'Shared':{'description':'Kept','schema':{'type':'string'}}}},
          'Use':{r'$ref':'#$pointer'}},'headers':{'Use':{r'$ref':'#$pointer'}}}});
      file.writeAsStringSync(text);
      final c=WorkspaceController(EngineProcess(executable:runtimeNode,helper:runtimeHelper),
        StateLocations(config:'${temp.path}/config',state:'${temp.path}/state',cache:'${temp.path}/cache'));
      final errors=<Object>[];
      Future<void> waitFor(bool Function() condition) async {
        final timer=Stopwatch()..start();
        while(!condition()&&errors.isEmpty&&timer.elapsed<const Duration(seconds:12)) {
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds:20)));
          await tester.pump();
        }
        expect(condition(),true);expect(errors,isEmpty);await tester.pumpAndSettle();
      }
      Future<void> ready(String kind) async {
        final timer=Stopwatch()..start();
        while(timer.elapsed<const Duration(seconds:12)) {
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds:20)));
          await tester.pump();
          final found=find.byKey(const ValueKey('object-interpretation'));
          if(found.evaluate().isNotEmpty&&tester.widget<BusyApiComboRow<String>>(found).selected==kind)break;
        }
        expect(tester.widget<BusyApiComboRow<String>>(find.byKey(const ValueKey('object-interpretation'))).selected,kind);
        expect(c.selectedObjectKind,kind);expect(errors,isEmpty);
      }
      try {
        await runWidgetIo(tester,() async {await c.initialize();await c.open(file.path);await c.analyse();});
        await tester.pumpWidget(MaterialApp(theme:buildBusyApiTheme(brightness:Brightness.light,accentColor:Colors.blue),
          localizationsDelegates:AppLocalizations.localizationsDelegates,supportedLocales:AppLocalizations.supportedLocales,
          home:Scaffold(body:ListenableBuilder(listenable:c,builder:(_,_)=>Designer(controller:c,
            run:(action){action().catchError((Object error){errors.add(error);});},reveal:(_){})))));
        for(final kind in ['header','schema','header']) {
          await runWidgetIo(tester,() async {
            final page=await c.project!.referencePage(c.root!,c.root!,kind=='header'?'/components/headers/Use':'/components/schemas/Use');
            final target=Map<String,dynamic>.from((page['references'] as List).single['target'] as Map);
            await c.selectObject(target);
          });
          await ready(kind);expect(c.selectedPointer,pointer);expect(c.buffer!.text,text);
        }
        expect(file.readAsStringSync(),text);
        final extract=find.widgetWithText(BusyApiActionRow,'Extract to component…');
        for(final accept in [false,true]) {
          await waitFor(() => extract.evaluate().any((element)=>(element.widget as BusyApiActionRow).onTap!=null));
          await tester.ensureVisible(extract);await tester.runAsync(() => tester.tap(extract));
          final name=find.descendant(of:find.widgetWithText(BusyApiGroupedTextEntry,'Name'),matching:find.byType(TextField));
          await waitFor(() => name.evaluate().isNotEmpty);
          await tester.runAsync(() => tester.enterText(name,'Extracted'));
          await tester.runAsync(() => tester.tap(find.widgetWithText(BusyApiDialogButton,'Apply')));
          await waitFor(() => find.text('Review component extraction').evaluate().isNotEmpty);
          expect(c.buffer!.text,text);
          await tester.runAsync(() => tester.tap(find.widgetWithText(BusyApiDialogButton,accept?'Apply':'Cancel')));
          await waitFor(() => find.text('Review component extraction').evaluate().isEmpty);
          if(accept)await waitFor(() => c.buffer!.text!=text);
          else expect(c.buffer!.text,text);
        }
        final accepted=c.buffer!.text;
        await runWidgetIo(tester,() async {
          final header=await c.project!.referencePage(c.root!,c.root!,'/components/headers/Use');
          final schema=await c.project!.referencePage(c.root!,c.root!,'/components/schemas/Use');
          expect(header['references'][0]['target']['pointer'],'/components/headers/Extracted');
          expect(schema['references'][0]['target']['pointer'],'/components/headers/Extracted');
          await c.undo();expect(c.buffer!.text,text);await c.redo();expect(c.buffer!.text,accepted);
          await c.saveAll();
        });
        expect(file.readAsStringSync(),accepted);
      } finally {
        await tester.pumpWidget(const SizedBox());await runWidgetIo(tester,c.shutdown);c.dispose();temp.deleteSync(recursive:true);
      }
    });
    for (final format in ['yaml', 'json']) {
      for (final keyword in [r'$defs', 'definitions']) {
        testWidgets(
          '$version $format $keyword Design retains physical ownership and Source diagnostics for a second schema role',
          (tester) async {
            tester.view.physicalSize = const Size(1400, 1100);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            final temp = Directory.systemTemp.createTempSync(
              'busyapi-schema-role-design-',
            );
            final original = schemaRoleSource(version, format, keyword, 1);
            final bytes = [0xef, 0xbb, 0xbf, ...utf8.encode(original)];
            final file = File('${temp.path}/api.$format')
              ..writeAsBytesSync(bytes);
            final controller = WorkspaceController(
              EngineProcess(executable: runtimeNode, helper: runtimeHelper),
              StateLocations(
                config: '${temp.path}/config',
                state: '${temp.path}/state',
                cache: '${temp.path}/cache',
              ),
            );
            final errors = <Object>[];
            Future<void> ready(bool Function() condition) async {
              final elapsed = Stopwatch()..start();
              await tester.pump();
              while (!condition() &&
                  elapsed.elapsed < const Duration(seconds: 12)) {
                await tester.runAsync(
                  () => Future<void>.delayed(const Duration(milliseconds: 20)),
                );
                await tester.pump(const Duration(milliseconds: 20));
              }
              expect(
                condition(),
                true,
                reason:
                    'analysis=${controller.analysis?["status"]} error=${controller.error}',
              );
              await tester.pumpAndSettle();
            }

            try {
              await runWidgetIo(tester, () async {
                await controller.initialize();
                await controller.open(file.path);
                await controller.selectObject({
                  'root': controller.root,
                  'resource': controller.root,
                  'pointer': '/components/schemas/Envelope/$keyword/properties',
                });
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
                  home: Scaffold(
                    body: ListenableBuilder(
                      listenable: controller,
                      builder: (_, _) => Designer(
                        controller: controller,
                        run: (action) {
                          action().catchError((Object e) {
                            errors.add(e);
                          });
                        },
                        reveal: (_) {},
                      ),
                    ),
                  ),
                ),
              );
              await ready(
                () =>
                    controller.analysis?['status'] == 'complete' &&
                    find.text('Add schema keyword').evaluate().isNotEmpty,
              );
              expect(
                controller.analysis?['status'],
                'complete',
                reason: jsonEncode(controller.analysis),
              );
              expect(find.text('Rename schema definition'), findsNothing);
              expect(find.text('Add schema keyword'), findsWidgets);
              final inspected = await tester.runAsync(
                () => controller.project!.inspectObject(
                  controller.root!,
                  controller.root!,
                  controller.selectedPointer,
                ),
              );
              expect(inspected!['kind'], 'schema');
              expect(inspected['schemaDefinitionNamePolicy'], isNull);
              expect(controller.scopeSafe(inspected), true);
              await runWidgetIo(tester, () async {
                controller.sourceEdit(
                  controller.root!,
                  original.replaceFirst('"properties": {', '"type": {'),
                );
                await controller.analyse();
                await controller.selectObject({
                  'root': controller.root,
                  'resource': controller.root,
                  'pointer': '/components/schemas/Envelope/$keyword',
                });
              });
              await tester.pumpAndSettle();
              final findings = controller.analysis!['findings'] as List;
              expect(
                findings.any(
                  (dynamic finding) =>
                      finding['code'] == 'schema.keyword.invalid' &&
                      (finding['pointer'] as String).startsWith(
                        '/components/schemas/Envelope/$keyword/type',
                      ),
                ),
                true,
                reason: jsonEncode(findings),
              );
              expect(file.readAsBytesSync(), bytes);
              await runWidgetIo(tester, () async {
                await controller.undo();
                await controller.analyse();
              });
              await tester.pumpAndSettle();
              expect(controller.buffer!.text, original);
              expect(controller.analysis?['status'], 'complete');
              expect(file.readAsBytesSync(), bytes);
              expect(errors, isEmpty);
              expect(tester.takeException(), isNull);
            } finally {
              await tester.pumpWidget(const SizedBox());
              await runWidgetIo(tester, controller.shutdown);
              controller.dispose();
              temp.deleteSync(recursive: true);
            }
          },
        );
      }
    }
  }
}
