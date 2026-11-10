import 'dart:convert';
import 'dart:io';

import 'package:busyapi/l10n/generated/app_localizations.dart';
import 'package:busyapi/src/app/app_theme.dart';
import 'package:busyapi/src/app/busyapi_design.dart';
import 'package:busyapi/src/workspace/request_part_headers.dart';
import 'package:busyapi/src/workspace/request_run.dart';
import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../packages/busyapi_core/test/test_support.dart';

class _NativeHttp extends HttpOverrides {}

void main() {
  testWidgets('native captured multipart and Header choices reach existing byte generation', (tester) async {
    tester.view.physicalSize = const Size(1500, 1100);tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
    final directory = Directory.systemTemp.createTempSync('busyapi-native-part-example-');
    final workspace = WorkspaceController(EngineProcess(executable: runtimeNode, helper: runtimeHelper),
        StateLocations(config: '${directory.path}/config', state: '${directory.path}/state', cache: '${directory.path}/cache'));
    final run = RequestRunController(workspace);HttpServer? server;
    const bytes = [0, 255, 128, 0], meta = '{"n":9007199254740993.00}', media = 'application/octet-stream';
    final source = File('${directory.path}/api.json'), payload = File('${directory.path}/payload.bin');
    final seen = <List<int>>[];late String original;
    try {
      await tester.runAsync(() async {
        server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        server!.listen((request) async {
          seen.add(await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk)));
          request.response.headers.set('content-type', media);request.response.add(bytes);await request.response.close();
        });
        await payload.writeAsBytes(bytes);await File('${directory.path}/header.bin').writeAsString(meta);
        final binary = {'type': 'string', 'format': 'binary'};
        original = jsonEncode({'openapi': '3.0.4', 'info': {'title': 'Part choices', 'version': 'business'},
          'servers': [{'url': 'http://127.0.0.1:${server!.port}'}], 'paths': {'/parts': {'post': {
            'requestBody': {'content': {'multipart/mixed': {
              'schema': {'type': 'object', 'required': ['upload'], 'properties': {'upload': binary}},
              'encoding': {'upload': {'contentType': media, 'headers': {'X-Meta': {'required': true,
                'content': {'application/json': {'schema': {'type': 'object', 'properties': {'n': {'type': 'integer', 'enum': ['EXACT']}}}}},
                'examples': {'Approved': {'externalValue': 'header.bin'}},
              }}}},
            }}}, 'responses': {'200': {'description': 'Receipt', 'content': {media: {'schema': binary,
              'examples': {'Payload': {'externalValue': 'payload.bin'}}}}}},
          }}}}).replaceAll('"EXACT"', '9007199254740993.00');
        await source.writeAsString(original);
        await workspace.initialize();await workspace.open(source.path);await workspace.analyse();
        await run.open(Map<String, dynamic>.from((workspace.projection!['operations'] as List).single as Map));
        run.bodyEnabled = true;run.bodyStructured = true;run.bodyText = '{"upload":null}';run.refresh();
        await run.inspectMultipartParts();
      });
      await tester.pumpWidget(MaterialApp(theme: buildBusyApiTheme(brightness: Brightness.light, accentColor: Colors.blue),
        localizationsDelegates: AppLocalizations.localizationsDelegates, supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: RequestRunPanel(run: run))));
      final l = AppLocalizations.of(tester.element(find.byType(RequestRunPanel)))!;
      final encoding = find.text(l.requestPartEncoding).first;
      await tester.ensureVisible(encoding);await tester.tap(encoding);await tester.pumpAndSettle();
      final partChoice = find.byWidgetPredicate((widget) => widget is BusyApiActionRow && widget.title == '/upload · Examples · payload.bin');
      await tester.ensureVisible(partChoice);await tester.tap(partChoice);await tester.pumpAndSettle();
      expect(run.bodyFiles.single.capturedExample?.resource, payload.uri.toString());
      await tester.runAsync(run.inspectMultipartParts);await tester.pumpAndSettle();
      final headers = find.descendant(of: find.byType(RequestPartHeadersEditor), matching: find.text(l.requestPartHeaders));
      await tester.ensureVisible(headers);await tester.tap(headers);await tester.pumpAndSettle();
      final headerChoice = find.byWidgetPredicate((widget) => widget is BusyApiActionRow && widget.title == '/upload · X-Meta · Examples · Approved');
      await tester.ensureVisible(headerChoice);await tester.tap(headerChoice);await tester.pumpAndSettle();
      expect(run.partHeaders.single.exampleName, 'Approved');
      await tester.runAsync(() => HttpOverrides.runWithHttpOverrides(run.send, _NativeHttp()));await tester.pumpAndSettle();
      expect(run.failure, isNull, reason: run.failureMessage);expect(run.result!.conforming, true, reason: '${run.result!.outgoing.findings}');
      expect(String.fromCharCodes(seen.single), contains('X-Meta: $meta\r\n'));
      expect(String.fromCharCodes(seen.single), contains(String.fromCharCodes(bytes)));
      expect(source.readAsStringSync(), original);expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.runAsync(() async {run.dispose();await workspace.shutdown();workspace.dispose();await server?.close(force: true);directory.deleteSync(recursive: true);});
    }
  });
}
