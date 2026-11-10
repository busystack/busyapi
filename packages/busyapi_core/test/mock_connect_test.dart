import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';
import 'mock_connect_support.dart';
import 'test_support.dart';

void main(){
  test('changing captured tunnel approval invalidates startup before any helper launch',() async {
    final fixture=await createConnectMockFixture();addTearDown(fixture.close);
    final plan=await fixture.project.prepareMock(fixture.source.uri.toString());addTearDown(plan.close);
    final configuration=await fixture.project.buffer(fixture.manifest.uri.toString());
    fixture.project.store.replace(configuration.id,fixture.configuration.replaceAll(fixture.authority,'denied.test:1'));
    expect(plan.outdated,true);
    await expectLater(plan.start(nodeExecutable:'${fixture.directory.path}/absent-node',helper:'${fixture.directory.path}/absent-helper'),throwsA(isA<CoreFailure>().having((failure)=>failure.code,'code','mock.stale')));
    expect(await fixture.manifest.readAsString(),fixture.configuration);expect(fixture.peers,isEmpty);
  });
  test('Core captured policy, original source, generated responses and cancellation share mock lifecycle',() async {
    final fixture=await createConnectMockFixture();addTearDown(fixture.close);
    final plan=await fixture.project.prepareMock(fixture.source.uri.toString());addTearDown(plan.close);
    final cancellation=RunCancellation(),run=await plan.start(nodeExecutable:runtimeNode,helper:'$testBundle/libexec/busyapi/mock-server.cjs',cancellation:cancellation);addTearDown(run.stop);
    expect(run.nativeTunnels.version,'1');expect(run.nativeGeneration.version,'5');
    final established=run.tunnelEvents.firstWhere((event)=>event['event']=='tunnel-established');
    final tunnel=await ControlledTunnel.open(run.port,fixture.authority,head:[0,255,128,13,10]);addTearDown(tunnel.socket.destroy);
    expect(tunnel.status,200);expect(tunnel.headers.toLowerCase(),isNot(contains('content-length')));expect(tunnel.headers.toLowerCase(),isNot(contains('transfer-encoding')));expect(await tunnel.read(5),[0,255,128,13,10]);
    final event=await established.timeout(const Duration(seconds:10));expect((event['source'] as Map)['resource'],fixture.source.uri.toString());expect((event['source'] as Map)['pointer'],'/paths/~1tunnel/additionalOperations/CONNECT');expect(event['responseBody'],'not-applicable');
    final client=HttpClient();addTearDown(client.close);
    final sample=await (await client.getUrl(run.baseUri.resolve('/sample'))).close();expect(sample.statusCode,200);expect(jsonDecode(await utf8.decoder.bind(sample).join()),matches(r'^AB[0-9]{3}$'));
    final binary=await (await client.getUrl(run.baseUri.resolve('/binary'))).close();final bytes=await binary.fold<List<int>>([], (before,chunk)=>before..addAll(chunk));expect(bytes.length,inInclusiveRange(4,5));
    final refused=await ControlledTunnel.open(run.port,fixture.authority,credentials:false);addTearDown(refused.socket.destroy);expect(refused.status,401);
    final terminated=run.tunnelEvents.firstWhere((event)=>event['event']=='tunnel-terminated');cancellation.cancel();await run.exitCode.timeout(const Duration(seconds:10));await tunnel.closed.future.timeout(const Duration(seconds:10));expect((await terminated)['reason'],'cancelled');
    expect(run.errors,isNot(contains('synthetic-private-value')));expect(await fixture.source.readAsString(),fixture.original);expect(await fixture.manifest.readAsString(),fixture.configuration);
  });
  test('CLI saved policy emits separate machine-readable tunnel lifecycle and generated witness responses',() async {
    final fixture=await createConnectMockFixture();addTearDown(fixture.close);
    final process=await Process.start('$testBundle/busyapi',['mock',fixture.directory.path,'--json'],environment:const {'PATH':'','LANG':'C.UTF-8'},includeParentEnvironment:false);
    addTearDown(() async {process.kill(ProcessSignal.sigterm);await process.exitCode;});
    final ready=Completer<Map>(),established=Completer<Map>(),terminated=Completer<Map>();
    final errors=process.stderr.transform(utf8.decoder).join();
    final subscription=process.stdout.transform(utf8.decoder).transform(const LineSplitter()).listen((line){final value=jsonDecode(line) as Map;if(value['status']=='ready'&&!ready.isCompleted)ready.complete(value);if(value['event']=='tunnel-established'&&!established.isCompleted)established.complete(value);if(value['event']=='tunnel-terminated'&&!terminated.isCompleted)terminated.complete(value);});addTearDown(subscription.cancel);
    final message=await ready.future.timeout(const Duration(seconds:30));expect(message['nativeTunnels']['name'],'busyapi-native-tunnels');expect(message['nativeGeneration']['version'],'5');expect(message['input'],'saved-source');
    final tunnel=await ControlledTunnel.open(message['port'] as int,fixture.authority,head:[0,255]);addTearDown(tunnel.socket.destroy);expect(tunnel.status,200);expect(await tunnel.read(2),[0,255]);expect((await established.future.timeout(const Duration(seconds:10)))['responseBody'],'not-applicable');
    final client=HttpClient();addTearDown(client.close);final sample=await (await client.getUrl(Uri.parse('http://127.0.0.1:${message['port']}/sample'))).close();expect(sample.statusCode,200);expect(jsonDecode(await utf8.decoder.bind(sample).join()),matches(r'^AB[0-9]{3}$'));
    process.kill(ProcessSignal.sigterm);expect(await process.exitCode.timeout(const Duration(seconds:10)),0);expect((await terminated.future.timeout(const Duration(seconds:10)))['reason'],'cancelled');expect(await errors,isNot(contains('synthetic-private-value')));
    expect(await fixture.source.readAsString(),fixture.original);expect(await fixture.manifest.readAsString(),fixture.configuration);
  });
}
