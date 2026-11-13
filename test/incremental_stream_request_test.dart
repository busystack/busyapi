import 'dart:async';
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
class _StreamingHttp extends HttpOverrides {}
Future<void> _until(bool Function() ready) async {
 final watch=Stopwatch()..start();
 while(!ready()){if(watch.elapsed>const Duration(seconds:10))throw StateError('The production streaming update did not arrive');await Future<void>.delayed(const Duration(milliseconds:10));}
}
void main(){
 for(final stale in [false,true]) {
   testWidgets('native stream ${stale?'rejects stale capture updates':'shows live records, stops and reopens its saved case'}',(tester) async {
  tester.view.physicalSize=const Size(1500,1200);tester.view.devicePixelRatio=1;addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
  final directory=Directory.systemTemp.createTempSync('busyapi-live-controls-');
  final workspace=WorkspaceController(EngineProcess(executable:runtimeNode,helper:runtimeHelper),StateLocations(config:'${directory.path}/config',state:'${directory.path}/state',cache:'${directory.path}/cache'));
  final run=RequestRunController(workspace),release=Completer<void>();HttpServer? server;Future<void>? sending;
  final file=File('${directory.path}/api.yaml');late String original;
  try{
   await tester.runAsync(() async {
    server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
    server!.listen((request) async {await request.drain<void>();request.response.bufferOutput=false;request.response.headers.set('content-type','application/x-ndjson');request.response.add(utf8.encode('9007199254740993\n'));await request.response.flush();await release.future;try{request.response.add(utf8.encode('-1\n'));await request.response.close();}on Object{/* Stopped by the native control. */}});
    original=jsonEncode({'openapi':'3.2.1','info':{'title':'Live request','version':'1'},'servers':[{'url':'http://127.0.0.1:${server!.port}'}],
      'paths':{'/events':{'get':{'responses':{'200':{'description':'Events','content':{'application/x-ndjson':{'itemSchema':{'type':'number','minimum':0}}}}}}}}});
    file.writeAsStringSync(original);File('${directory.path}/busyapi.yaml').writeAsStringSync('version: 1\nroots: [{name: api, path: api.yaml}]\n');
    await workspace.initialize();await workspace.open(file.path);await workspace.analyse();await run.open(Map<String,dynamic>.from((workspace.projection!['operations'] as List).single as Map));
   });
   await tester.pumpWidget(MaterialApp(theme:buildBusyApiTheme(brightness:Brightness.light,accentColor:Colors.blue),localizationsDelegates:AppLocalizations.localizationsDelegates,supportedLocales:AppLocalizations.supportedLocales,home:Scaffold(body:RequestRunPanel(run:run))));
   await tester.runAsync(() async {sending=HttpOverrides.runWithHttpOverrides(run.send,_StreamingHttp());await _until(()=>run.liveStream?.records==1);});await tester.pump();
   expect(run.result,isNull);expect(run.liveStream!.status,'active');expect(run.liveStream!.complete,false);expect(find.text('Received records'),findsWidgets);expect(find.text('Stop stream'),findsOneWidget);
   if(stale){
    await tester.runAsync(() async {workspace.sourceEdit(workspace.active!,original.replaceFirst('Live request','Unsaved request'));await workspace.analyse();release.complete();await sending;});await tester.pump();
    expect(run.liveStream,isNull);expect(run.result,isNull);expect(run.busy,false);expect(run.outdated,true);expect(file.readAsStringSync(),original);
   }else{
    await tester.ensureVisible(find.text('Stop stream'));await tester.tap(find.text('Stop stream'));await tester.runAsync(() async {await sending;});await tester.pump();
    expect(run.phase,'stopped');expect(run.result!.conforming,false);expect(run.result!.response.stream!.records,1);expect(run.result!.response.stream!.status,'stopped');expect(run.result!.response.stream!.complete,false);
    await tester.runAsync(() async {
     expect(await run.result!.response.bytes(),utf8.encode('9007199254740993\n'));
     run.streamStopAfterRecords=1;
     final edit=await run.plan!.planCase('stream',run.draft());await workspace.project!.applyRefactoring(edit);await workspace.saveAll();await run.reconcileDraft();await run.reopenCase('stream');
    });await tester.pump();expect(run.streamStopAfterRecords,1);expect(run.draft().streamStopAfterRecords,1);expect(file.readAsStringSync(),original);
   }
  }finally{
   if(!release.isCompleted)release.complete();await tester.pumpWidget(const SizedBox.shrink());
   await tester.runAsync(() async {run.dispose();try{await sending;}on Object{/* Disposal cancels the owned request. */}await workspace.shutdown();workspace.dispose();await server?.close(force:true);directory.deleteSync(recursive:true);});
  }
 });
 }
}
