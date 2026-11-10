import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:busyapi/l10n/generated/app_localizations.dart';
import 'package:busyapi/src/app/app_theme.dart';
import 'package:busyapi/src/app/busyapi_design.dart';
import 'package:busyapi/src/platform/secret_store.dart';
import 'package:busyapi/src/workspace/request_run.dart';
import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../packages/busyapi_core/test/test_support.dart';
import 'widget_io.dart';

class _NativeHttp extends HttpOverrides {}

void main() {
  for (final version in ['3.2.0', '3.2.1']) {
    testWidgets('$version native device prompt, session credential, authenticated request and Cancel', (tester) async {
      tester.view.physicalSize = const Size(1500, 1100);tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
      final directory = Directory.systemTemp.createTempSync('busyapi-native-device-');
      final workspace = WorkspaceController(EngineProcess(executable: runtimeNode, helper: runtimeHelper),
        StateLocations(config: '${directory.path}/config', state: '${directory.path}/state', cache: '${directory.path}/cache'));
      final secrets = EnvironmentSecretStore(persistent: SessionBusyApiSecretStore());
      final run = RequestRunController(workspace, secrets: secrets);
      const reference = '123e4567-e89b-42d3-a456-426614174001';
      final file = File('${directory.path}/api.json');
      HttpServer? server;var approved = false, sent = 0, polls = 0;late String source;
      Future<void>? authorization;
      try {
        await tester.runAsync(() async {
          server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          server!.listen((request) async {
            await request.drain<void>();request.response.headers.contentType = ContentType.json;
            if (request.uri.path == '/device') {
              request.response.write(jsonEncode({'device_code': 'private-code', 'user_code': 'NATIVE-CODE',
                'verification_uri': 'http://127.0.0.1:${server!.port}/verify', 'interval': 1, 'expires_in': 30}));
            } else if (request.uri.path == '/token') {
              polls++;
              if (!approved) {request.response.statusCode = 400;request.response.write('{"error":"authorization_pending"}');}
              else {request.response.write('{"access_token":"native-device-token","token_type":"Bearer","scope":"read"}');}
            } else {
              sent++;expect(request.headers.value('authorization'), 'Bearer native-device-token');request.response.statusCode = 204;
            }
            await request.response.close();
          });
          source = jsonEncode({'openapi': version, 'info': {'title': 'Device native', 'version': 'business'},
            'servers': [{'url': 'http://127.0.0.1:${server!.port}'}], 'components': {'securitySchemes': {'oauth': {
              'type': 'oauth2', 'flows': {'deviceAuthorization': {'deviceAuthorizationUrl': '/device', 'tokenUrl': '/token', 'scopes': {'read': 'Read'}}},
            }}}, 'paths': {'/data': {'get': {'security': [{'oauth': ['read']}], 'responses': {'204': {'description': 'Empty'}}}}}});
          await file.writeAsString(source);
          await File('${directory.path}/busyapi.yaml').writeAsString(jsonEncode({'version': 1, 'roots': [{'name': 'api', 'path': 'api.json'}],
            'environments': {'local': {'authentication': {'alternative': 0,
              'schemes': {'oauth': {'clientId': 'desktop', 'clientAuthentication': 'none', 'scopes': ['read'], 'accessTokenRef': reference}}}}}}));
          await workspace.initialize();await workspace.open(file.path);await workspace.analyse();
          await run.open(Map<String, dynamic>.from((workspace.projection!['operations'] as List).single as Map));run.selectEnvironment('local');
        });
        await tester.pumpWidget(MaterialApp(theme: buildBusyApiTheme(brightness: Brightness.light, accentColor: Colors.blue),
          localizationsDelegates: AppLocalizations.localizationsDelegates, supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: RequestRunPanel(run: run))));
        expect(find.text('Device authorization · oauth'), findsOneWidget);
        await tester.runAsync(() async {
          authorization = HttpOverrides.runWithHttpOverrides(() => run.authorizeOAuth('oauth', browser: false, device: true), _NativeHttp());
        });
        await runWidgetIo(tester, () async {
          while (run.oauthDevicePrompt == null && run.phase == 'authorizing') await Future<void>.delayed(const Duration(milliseconds: 10));
        });
        await tester.pumpAndSettle();
        final prompt = run.oauthDevicePrompt!;
        expect(find.byWidgetPredicate((widget) => widget is BusyApiActionRow && widget.subtitle == 'NATIVE-CODE'), findsOneWidget);
        expect(find.text('private-code'), findsNothing);expect(run.phase, 'authorizing');
        approved = true;
        await runWidgetIo(tester, () => authorization!);await tester.pumpAndSettle();
        expect(run.failure, isNull, reason: run.failureMessage);expect(run.oauthDevicePrompt, isNull);
        expect(await tester.runAsync(() => secrets.read(reference)), 'native-device-token');
        await tester.runAsync(() => HttpOverrides.runWithHttpOverrides(run.send, _NativeHttp()));await tester.pumpAndSettle();
        expect(sent, 1);expect(run.result!.conforming, true);expect(polls, greaterThan(0));
        await expectLater(run.openDeviceVerification(prompt), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'oauth.stale')));
        approved = false;
        await tester.runAsync(() async {authorization = HttpOverrides.runWithHttpOverrides(() => run.authorizeOAuth('oauth', browser: false, device: true), _NativeHttp());});
        await runWidgetIo(tester, () async {while (run.oauthDevicePrompt == null && run.phase == 'authorizing') await Future<void>.delayed(const Duration(milliseconds: 10));});
        run.cancel();await runWidgetIo(tester, () => authorization!);await tester.pumpAndSettle();
        expect(run.failure, 'cancelled');expect(run.oauthDevicePrompt, isNull);expect(sent, 1);
        expect(file.readAsStringSync(), source);expect(tester.takeException(), isNull);
      } finally {
        run.cancel();
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.runAsync(() async {if (authorization != null) await authorization;run.dispose();await workspace.shutdown();workspace.dispose();await server?.close(force: true);directory.deleteSync(recursive: true);});
      }
    });
  }
}
