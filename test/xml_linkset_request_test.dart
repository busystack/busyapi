import 'dart:convert';
import 'dart:io';
import 'package:busyapi/l10n/generated/app_localizations.dart';
import 'package:busyapi/src/app/app_theme.dart';
import 'package:busyapi/src/workspace/request_run.dart';
import 'package:busyapi/src/workspace/workspace_controller.dart';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../packages/busyapi_core/test/test_support.dart';
class _NativeHttp extends HttpOverrides {}
void main() {
  for (final media in ['application/xml', 'application/linkset', 'application/linkset+json']) {
    testWidgets('native $media preview, wire inspection, saved case and stale draft', (tester) async {
      tester.view.physicalSize = const Size(1500, 1100);tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
      final directory = Directory.systemTemp.createTempSync('busyapi-modeled-controls-');
      final workspace = WorkspaceController(EngineProcess(executable: runtimeNode, helper: runtimeHelper),
        StateLocations(config: '${directory.path}/config', state: '${directory.path}/state', cache: '${directory.path}/cache'));
      final run = RequestRunController(workspace);HttpServer? server;
      final seen = <List<int>>[];final file = File('${directory.path}/api.yaml');
      final xml = media == 'application/xml';
      final value = xml ? '{"id":"a&b","value":9007199254740993}' : '{"linkset":[{"next":[{"href":"/p","title":"a,b"}]}]}';
      late String original;
      try {
        await tester.runAsync(() async {
          server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
          server!.listen((request) async {
            final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));seen.add(bytes);
            request.response.headers.set('content-type', media);request.response.add(bytes);await request.response.close();
          });
          final schema = xml ? {'type':'object','xml':{'name':'payload'},'allOf':[
            {r'$ref':'#/components/schemas/Base'}, {'required':['value'],'properties':{'value':{'type':'number'}}}
          ]} : {'type':'object','required':['linkset']};
          original = jsonEncode({'openapi':'3.2.1','info':{'title':'Native wire','version':'1'},
            'servers':[{'url':'http://127.0.0.1:${server!.port}'}],
            'components':{'schemas':{'Base':{'type':'object','required':['id'],'properties':{'id':{'type':'string','xml':{'nodeType':'attribute'}}}}}},
            'paths':{'/p':{'post':{'requestBody':{'content':{media:{'schema':schema}}},'responses':{'200':{'description':'OK','content':{media:{'schema':schema}}}}}}}});
          file.writeAsStringSync(original);
          File('${directory.path}/busyapi.yaml').writeAsStringSync('version: 1\nroots: [{name: api, path: api.yaml}]\n');
          await workspace.initialize();await workspace.open(file.path);await workspace.analyse();
          await run.open(Map<String,dynamic>.from((workspace.projection!['operations'] as List).single as Map));
          run.selectBodyMedia(media);run.bodyEnabled = true;run.bodyStructured = true;run.bodyText = value;run.refresh();
        });
        await tester.pumpWidget(MaterialApp(theme:buildBusyApiTheme(brightness:Brightness.light,accentColor:Colors.blue),
          localizationsDelegates:AppLocalizations.localizationsDelegates,supportedLocales:AppLocalizations.supportedLocales,
          home:Scaffold(body:RequestRunPanel(run:run))));
        await tester.runAsync(() async {await Future<void>.delayed(const Duration(milliseconds:500));});await tester.pump();
        // The current controls retain independent raw/structured drafts and
        // reject late previews when the mode/capture changes.
        await tester.runAsync(() async {
          run.selectStructuredBody(false);run.bodyText = xml ? '<raw/>' : '</raw>; rel=self';run.refresh();
          run.selectStructuredBody(true);expect(run.bodyText,value);
          run.selectStructuredBody(false);expect(run.bodyText,xml ? '<raw/>' : '</raw>; rel=self');
          run.selectStructuredBody(true);
        });
        await tester.runAsync(() async {await Future<void>.delayed(const Duration(milliseconds:500));});await tester.pump();
        expect(run.previewFailure,isNull);expect(run.serializedContent,isNotNull);
        expect(run.serializedContent, xml ? contains('9007199254740993') : contains('/p'));
        await tester.runAsync(() => HttpOverrides.runWithHttpOverrides(run.send,_NativeHttp()));await tester.pump();
        expect(run.failure,isNull,reason:run.failureMessage);expect(run.result!.conforming,true);
        expect(run.result!.received.modeledData,isNotNull);expect(run.result!.outgoing.modeledData,isNotNull);expect(seen,hasLength(1));
        expect(run.result!.request.body!.inspectionBytes,seen.single);expect(run.effectiveHeaders,isNotNull);
        await tester.runAsync(() async {
          final edit = await run.plan!.planCase('saved',run.draft());await workspace.project!.applyRefactoring(edit);
          await workspace.saveAll();await run.reconcileDraft();await run.reopenCase('saved');
        });
        expect(run.bodyStructured,true);expect(run.bodyText,value);expect(run.bodyMediaType,media);
        await tester.runAsync(() async {
          final captured = run.plan!;
          workspace.sourceEdit(workspace.active!,original.replaceFirst('Native wire','Changed wire'));
          await workspace.analyse();
          await expectLater(ContractRequestBuilder().build(captured,run.draft(),resolveSecret:(_) async=>null),throwsA(isA<CoreFailure>()));
        });
        expect(run.bodyText,value);expect(seen,hasLength(1));
        expect(file.readAsStringSync(),original);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.runAsync(() async {run.dispose();await workspace.shutdown();workspace.dispose();await server?.close(force:true);directory.deleteSync(recursive:true);});
      }
    });
  }
}
