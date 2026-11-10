import 'dart:convert';
import 'dart:io';

import 'package:busyapi/l10n/generated/app_localizations.dart';
import 'package:busyapi/src/app/app_theme.dart';
import 'package:busyapi/src/app/busyapi_design.dart';
import 'package:busyapi/src/workspace/request_run.dart';
import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../packages/busyapi_core/test/test_support.dart';

class _NativeHttp extends HttpOverrides {}

void main() {
  testWidgets('native external body selection preserves captured bytes and explicit text choice', (tester) async {
    tester.view.physicalSize = const Size(1500, 1100);tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
    final directory = Directory.systemTemp.createTempSync('busyapi-native-external-body-');
    final workspace = WorkspaceController(EngineProcess(executable: runtimeNode, helper: runtimeHelper),
      StateLocations(config: '${directory.path}/config', state: '${directory.path}/state', cache: '${directory.path}/cache'));
    final run = RequestRunController(workspace);HttpServer? server;
    const bytes = [0, 255, 128, 0], media = 'application/octet-stream';
    final file = File('${directory.path}/api.yaml'),payload = File('${directory.path}/payload.bin');
    final seen = <List<int>>[];late String source;
    final targets = <String>[];
    try {
      await tester.runAsync(() async {
        server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        server!.listen((request) async {
          targets.add(request.uri.toString());
          final entity = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));seen.add(entity);
          request.response.headers.set('content-type', media);request.response.add(entity);await request.response.close();
        });
        await payload.writeAsBytes(bytes);
        final representation = {'schema': {'not': {'type': 'null'}}};
        source = '# Keep external source 雪\r\n${jsonEncode({
          'openapi': '3.2.1', 'info': {'title': 'External request', 'version': '1'},
          'servers': [{'url': 'http://127.0.0.1:${server!.port}'}],
          'paths': {'/echo': {'post': {'parameters': [
            {'name': 'q', 'in': 'query', 'content': {media: {...representation,
              'examples': {'QueryBytes': {'externalValue': 'payload.bin'}}}}},
          ], 'requestBody': {'required': true, 'content': {media: {
            ...representation, 'examples': {'Bytes': {'externalValue': 'payload.bin'}},
          }}}, 'responses': {'200': {'description': 'Echo', 'content': {media: representation}}}}}},
        })}\r\n';await file.writeAsString(source);
        await workspace.initialize();await workspace.open(file.path);await workspace.analyse();
        expect(workspace.projection, isNotNull, reason: workspace.error);
        await run.open(Map<String, dynamic>.from((workspace.projection!['operations'] as List).single as Map));
      });
      await tester.pumpWidget(MaterialApp(theme: buildBusyApiTheme(brightness: Brightness.light, accentColor: Colors.blue),
        localizationsDelegates: AppLocalizations.localizationsDelegates, supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: RequestRunPanel(run: run))));
      final parameterChoice = find.byWidgetPredicate((widget) => widget is BusyApiActionRow && widget.title == 'Examples · QueryBytes · serialized');
      await tester.ensureVisible(parameterChoice);await tester.tap(parameterChoice);await tester.pumpAndSettle();
      expect(run.failure, isNull, reason: run.failureMessage);
      expect(run.draft().parameters[OperationRequestDraft.parameterKey('query', 'q')]!.capturedExample?.byteLength, bytes.length);
      final choice = find.byWidgetPredicate((widget) => widget is BusyApiActionRow && widget.title == 'Examples · application/octet-stream · Bytes');
      await tester.ensureVisible(choice);await tester.tap(choice);await tester.pumpAndSettle();
      expect(run.failure, isNull, reason: run.failureMessage);expect(run.bodyExample?.byteLength, bytes.length);
      expect(run.draft().body.capturedExample, same(run.bodyExample));expect(run.bodyEnabled, true);expect(run.bodyFiles, isEmpty);
      expect(find.byWidgetPredicate((widget) => widget is BusyApiActionRow && widget.subtitle?.contains(payload.uri.toString()) == true), findsOneWidget);
      await tester.runAsync(() => HttpOverrides.runWithHttpOverrides(run.send, _NativeHttp()));await tester.pumpAndSettle();
      expect(run.failure, isNull, reason: run.failureMessage);expect(seen, [bytes]);expect(await tester.runAsync(() => run.result!.response.bytes()), bytes);
      expect(targets, ['/echo?q=%00%FF%80%00']);
      await tester.runAsync(() async { await payload.writeAsBytes([1, 2]);await HttpOverrides.runWithHttpOverrides(run.send, _NativeHttp()); });
      await tester.pumpAndSettle();expect(run.failure, isNotNull);expect(seen, hasLength(1));
      final text = find.byWidgetPredicate((widget) => widget is BusyApiActionRow && widget.title == 'Use text instead of the selected file');
      await tester.ensureVisible(text);await tester.tap(text);await tester.pumpAndSettle();expect(run.bodyExample, isNull);
      expect(run.draft().body.capturedExample, isNull);expect(file.readAsStringSync(), source);expect(workspace.buffer!.text, source);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.runAsync(() async { run.dispose();await workspace.shutdown();workspace.dispose();await server?.close(force: true);directory.deleteSync(recursive: true); });
    }
  });
}
