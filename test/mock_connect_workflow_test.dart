import 'dart:convert';
import 'dart:io';
import 'package:busyapi/l10n/generated/app_localizations.dart';
import 'package:busyapi/src/app/app_theme.dart';
import 'package:busyapi/src/workspace/mock_run.dart';
import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../packages/busyapi_core/test/mock_connect_support.dart';
import '../packages/busyapi_core/test/test_support.dart';

void main(){
  testWidgets('native mock review uses captured approved CONNECT and generated responses, reports lifecycle and stops peers',(tester) async {
    final fixture=(await tester.runAsync(createConnectMockFixture))!;
    final workspace=WorkspaceController(fixture.engine,StateLocations(config:'${fixture.directory.path}/config',state:'${fixture.directory.path}/state',cache:'${fixture.directory.path}/cache'));
    final controller=MockRunController(workspace,nodeExecutable:runtimeNode,helper:'$testBundle/libexec/busyapi/mock-server.cjs');
    ControlledTunnel? tunnel;
    try {
      await tester.runAsync(() async {await workspace.initialize();await workspace.open(fixture.directory.path);await controller.prepare();});
      expect(controller.phase,'ready');expect(controller.plan!.configuration.mock['tunnels'],isNotNull);
      await tester.pumpWidget(MaterialApp(theme:buildBusyApiTheme(brightness:Brightness.light,accentColor:Colors.blue),localizationsDelegates:AppLocalizations.localizationsDelegates,supportedLocales:AppLocalizations.supportedLocales,home:Scaffold(body:MockRunPanel(controller:controller))));
      await tester.pumpAndSettle();expect(find.text('Start Mock'),findsOneWidget);
      await tester.runAsync(controller.start);await tester.pumpAndSettle();expect(controller.phase,'running',reason:controller.failure);
      final run=controller.run!;
      await tester.runAsync(() async {
        final event=run.tunnelEvents.firstWhere((value)=>value['event']=='tunnel-established');
        tunnel=await ControlledTunnel.open(run.port,fixture.authority,head:[0,255,128]);expect(tunnel!.status,200);expect(await tunnel!.read(3),[0,255,128]);expect((await event)['responseBody'],'not-applicable');
        final client=HttpClient();try{final response=await (await client.getUrl(run.baseUri.resolve('/sample'))).close();expect(response.statusCode,200);expect(jsonDecode(await utf8.decoder.bind(response).join()),matches(r'^AB[0-9]{3}$'));}finally{client.close(force:true);}
      });
      await tester.pumpAndSettle();expect(find.textContaining('CONNECT · Established'),findsOneWidget);
      await tester.runAsync(() async {await controller.stop();await tunnel!.closed.future;});await tester.pumpAndSettle();expect(controller.phase,'stopped');expect(controller.run,isNull);expect(find.textContaining('CONNECT · Ended'),findsOneWidget);
      await tester.runAsync(() async {expect(await fixture.source.readAsString(),fixture.original);expect(await fixture.manifest.readAsString(),fixture.configuration);});
    }finally{
      tunnel?.socket.destroy();controller.dispose();workspace.dispose();await tester.runAsync(fixture.close);
    }
  });
}
