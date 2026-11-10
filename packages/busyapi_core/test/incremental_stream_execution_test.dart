import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';
import 'native_media_execution_test.dart' show openMedia;
import 'test_support.dart';

void main() {
  for(final mode in ['independent-item','codec','resource','whole-unavailable','whole-missing']) {
    test('final original body proof preserves $mode evidence and evicted counts',() async {
      final directory=await Directory.systemTemp.createTemp('busyapi-stream-final-proof-');addTearDown(()=>directory.delete(recursive:true));
      final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
      server.listen((request) async {await request.drain<void>();request.response.headers.set('content-type','application/x-ndjson');request.response.write('1\n'*150);await request.response.close();});
      final fixture=await openMedia(directory,server,'3.2.1','json',{'schema':{'type':'array','minItems':150,'maxItems':150},'itemSchema':{'type':'integer'}},contentType:'application/x-ndjson',engineOverride:_StreamProofFault(mode));
      final result=await const ContractRequestExecutor().execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity),resolveSecret:(_) async=>null);addTearDown(result.close);
      final stream=result.response.stream!;
      expect(result.received.complete,false);expect(stream.complete,false);expect(stream.status,'incomplete');expect(stream.records,150);expect(stream.evidence.length,128);
      expect(stream.uncheckedRecords,mode.startsWith('whole-')?0:150);expect(stream.validRecords,mode.startsWith('whole-')?150:0);expect(stream.invalidRecords,0);
      if(!mode.startsWith('whole-')){expect(stream.evidence.every((item)=>item['complete']==false),true);expect(stream.findings.where((finding)=>finding['severity']=='warning'),isNotEmpty);expect(stream.findings.any((finding)=>finding.containsKey('resolvedBy')),false);}
      expect(await fixture.source.readAsString(),fixture.original);
    });
  }
  test('only actual deferred whole-content MIME bindings resolve on original final proof',() async {
    final directory=await Directory.systemTemp.createTemp('busyapi-stream-provisional-');addTearDown(()=>directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
    const type='multipart/form-data; boundary=proof',wire='--proof\r\nContent-Disposition: form-data; name="value"\r\nContent-Type: application/json\r\n\r\n1\r\n--proof--\r\n';
    server.listen((request) async {await request.drain<void>();request.response.headers.set('content-type',type);request.response.write(wire);await request.response.close();});
    final fixture=await openMedia(directory,server,'3.2.1','json',{'schema':{'type':'object','oneOf':[{'required':['value'],'properties':{'value':{'type':'integer','const':1}}},{'required':['value'],'properties':{'value':{'type':'integer','const':2}}}]},'encoding':{'value':{'contentType':'application/json'}}},contentType:type);
    final seen=<ContractStreamSnapshot>[];
    final result=await const ContractRequestExecutor().execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity),resolveSecret:(_) async=>null,onStream:seen.add);addTearDown(result.close);
    expect(seen.any((value)=>value.wholeResolvableRecords==1),true);expect(result.conforming,true,reason:'${result.received.findings}');expect(result.response.stream!.uncheckedRecords,0);expect(result.response.stream!.validRecords,1);
    expect(result.response.stream!.findings.any((value)=>value['resolvedBy']=='complete-content-evaluation'),true);
  });
  test('binary itemSchema remains unavailable beside a valid original whole schema',() async {
    final directory=await Directory.systemTemp.createTemp('busyapi-stream-binary-items-');addTearDown(()=>directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
    server.listen((request) async {await request.drain<void>();request.response.headers.set('content-type','application/octet-stream');request.response.add([0,255]);await request.response.close();});
    final fixture=await openMedia(directory,server,'3.2.1','json',{'schema':{'maxLength':3},'itemSchema':{}},contentType:'application/octet-stream');
    final result=await const ContractRequestExecutor().execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity),resolveSecret:(_) async=>null);addTearDown(result.close);
    expect(result.conforming,false);expect(result.response.stream!.status,'incomplete');expect(result.response.stream!.findings.any((finding)=>finding['code']=='runtime.media.items.unsupported'&&finding['severity']=='warning'),true);
  });
  for(final version in ['2.0','3.0.4','3.1.2','3.2.1']) {
    for(final type in ['application/jsonl','application/x-ndjson','application/json-seq','application/vendor+json-seq','text/event-stream']) {
      test('$version $type actual HTTP records arrive before EOF and whole-content evaluation',() async {
        final directory=await Directory.systemTemp.createTemp('busyapi-live-stream-');addTearDown(()=>directory.delete(recursive:true));
        final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
        final release=Completer<void>(),first=Completer<ContractStreamSnapshot>();
        addTearDown(() {if(!release.isCompleted)release.complete();});
        final sse=type=='text/event-stream',seq=type.endsWith('json-seq');
        final a=utf8.encode(sse?'id: kept\nretry: 9007199254740993\ndata: 雪😀\n\n': '${seq?'\x1e':''}{"n":9007199254740993,"v":"雪😀"}\n');
        final b=utf8.encode(sse?'data: last\n\n':'${seq?'\x1e':''}{"n":9007199254740993,"v":"last"}\n');
        server.listen((request) async {
          await request.drain<void>();request.response.bufferOutput=false;request.response.headers.set('content-type',type);
          for(final byte in a){request.response.add([byte]);await request.response.flush();}
          await release.future;request.response.add(b);await request.response.close();
        });
        final fixture=await openMedia(directory,server,version,'yaml',{
          'schema':{'type':'array','minItems':2,'maxItems':2},
          if(version=='3.2.1')'itemSchema':sse?{'type':'object','required':['data'],'properties':{'retry':{'type':'integer','enum':['EXACT_VALUE']}}}:{'type':'object','required':['n'],'properties':{'n':{'type':'number','enum':['EXACT_VALUE']}}},
        },contentType:type);
        var completed=false;final seen=<ContractStreamSnapshot>[];
        final pending=const ContractRequestExecutor().execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity),resolveSecret:(_) async=>null,
          onStream:(value){seen.add(value);if(value.records>0&&!first.isCompleted)first.complete(value);}).then((value){completed=true;return value;});
        final active=await first.future.timeout(const Duration(seconds:10));
        expect(completed,false);expect(active.status,'active');expect(active.complete,false);expect(active.records,1);expect(active.evidence.single['data'],contains('9007199254740993'));
        release.complete();final result=await pending;addTearDown(result.close);
        expect(result.conforming,true,reason:'${result.received.findings}');expect(result.response.stream!.records,2);expect(result.response.stream!.status,'complete');
        expect(result.response.stream!.receivedBytes,a.length+b.length);expect(await result.response.bytes(),[...a,...b]);expect(await result.response.decodedBytes(),[...a,...b]);
        expect(seen.where((value)=>!value.terminal).every((value)=>!value.complete),true);
        expect(await fixture.source.readAsString(),fixture.original);
      });
    }
  }
  for(final mode in ['stop','cancel','inactivity','overall','disconnect']) {
    test('$mode retains completed item results and original bytes without full conformance',() async {
      final directory=await Directory.systemTemp.createTemp('busyapi-stream-terminal-');addTearDown(()=>directory.delete(recursive:true));
      final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
      final release=Completer<void>();addTearDown(() {if(!release.isCompleted)release.complete();});
      server.listen((request) async {
        await request.drain<void>();request.response.headers.set('content-type','application/x-ndjson');request.response.bufferOutput=false;
        request.response.add(utf8.encode('9007199254740993\n'));await request.response.flush();
        if(mode=='disconnect'){await Future<void>.delayed(const Duration(milliseconds:50));final socket=await request.response.detachSocket(writeHeaders:false);socket.destroy();}
        else {await release.future;try{await request.response.close();}on Object{/* Client deliberately retired. */}}
      });
      final fixture=await openMedia(directory,server,'3.2.1','json',{'itemSchema':{'type':'number','enum':['EXACT_VALUE']}},contentType:'application/x-ndjson');
      final token=RunCancellation(),control=ContractStreamControl();
      final result=await const ContractRequestExecutor().execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity,inactivityTimeout:mode=='overall'?const Duration(seconds:10):const Duration(milliseconds:250),overallTimeout:mode=='overall'?const Duration(milliseconds:500):const Duration(seconds:30)),resolveSecret:(_) async=>null,cancellation:token,streamControl:control,
        onStream:(value){if(value.records>0&&!value.terminal){if(mode=='stop')control.stop();if(mode=='cancel')token.cancel();}});
      addTearDown(result.close);expect(result.conforming,false);expect(result.response.receiptComplete,false);expect(result.received.complete,false);
      expect(result.response.stream!.records,1);expect(result.response.stream!.validRecords,1);expect(result.response.stream!.status,mode=='stop'?'stopped':'incomplete');
      expect(await result.response.bytes(),utf8.encode('9007199254740993\n'));expect(result.response.stream!.complete,false);
    });
  }
  test('whole schema failure is deferred, while multiple invalid records are reported independently',() async {
    final directory=await Directory.systemTemp.createTemp('busyapi-stream-errors-');addTearDown(()=>directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
    server.listen((request) async {await request.drain<void>();request.response.headers.set('content-type','application/json-seq');request.response.add(utf8.encode('\x1e1\n\x1e-1\n\x1efalse\n\x1e123'));await request.response.close();});
    final fixture=await openMedia(directory,server,'3.2.1','json',{'schema':{'type':'array','maxItems':1},'itemSchema':{'type':'number','minimum':0}},contentType:'application/json-seq');
    final result=await const ContractRequestExecutor().execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity),resolveSecret:(_) async=>null);addTearDown(result.close);
    expect(result.conforming,false);expect(result.response.stream!.records,4);expect(result.response.stream!.invalidRecords,3);expect(result.response.stream!.status,'invalid');
    expect(result.response.stream!.findings.any((value)=>'${value['message']}'.contains('truncated')),true);
    expect(result.response.stream!.evidence[1]['findings'],isNotEmpty);
  });
  for(final compressed in [false,true]) {
    test('${compressed?'gzip':'plain'} stream uses paused storage/evaluation and retains exact entity bytes',() async {
      final directory=await Directory.systemTemp.createTemp('busyapi-stream-pressure-');addTearDown(()=>directory.delete(recursive:true));
      final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
      final first=Completer<void>(),release=Completer<void>(),stored=Completer<void>(),storageGate=Completer<void>(),evaluationGate=Completer<void>();
      addTearDown(() {if(!release.isCompleted)release.complete();if(!storageGate.isCompleted)storageGate.complete();if(!evaluationGate.isCompleted)evaluationGate.complete();});
      final a=compressed?gzip.encode(utf8.encode('1\n')):utf8.encode('1\n'),b=compressed?gzip.encode(utf8.encode('2\n')):utf8.encode('2\n');
      server.listen((request) async {await request.drain<void>();request.response.bufferOutput=false;request.response.headers.set('content-type','application/x-ndjson');if(compressed)request.response.headers.set('content-encoding','gzip');request.response.add(a);await request.response.flush();await release.future;request.response.add(b);await request.response.close();});
      final fixture=await openMedia(directory,server,'3.2.1','json',{'itemSchema':{'type':'integer'}},contentType:'application/x-ndjson');
      var writes=0,proved=false;
      final executor=ContractRequestExecutor(transport:ContractHttpTransport(openResponseStorage:(file) async=>_GateStorage(await FileResponseStorage.open(file),() async {writes++;if(writes==1){stored.complete();await storageGate.future;}})));
      final pending=executor.execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity),resolveSecret:(_) async=>null,onStream:(value) async {if(value.records==1&&!value.terminal&&!first.isCompleted){proved=true;first.complete();release.complete();await evaluationGate.future;}});
      await stored.future.timeout(const Duration(seconds:10));expect(proved,false);expect(writes,1);storageGate.complete();await first.future.timeout(const Duration(seconds:10));final heldWrites=writes;await Future<void>.delayed(const Duration(milliseconds:30));expect(writes,heldWrites);evaluationGate.complete();
      final result=await pending;addTearDown(result.close);expect(result.conforming,true,reason:'${result.received.findings}');expect(result.response.stream!.records,2);expect(result.response.stream!.decodedBytes,4);
      expect(await result.response.bytes(),[...a,...b]);expect(await result.response.decodedBytes(),utf8.encode('1\n2\n'));
    });
  }
  test('long streams retain bounded evidence with complete aggregate counts',() async {
    final directory=await Directory.systemTemp.createTemp('busyapi-stream-retention-');addTearDown(()=>directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
    server.listen((request) async {await request.drain<void>();request.response.headers.set('content-type','application/x-ndjson');for(var n=0;n<3000;n++){request.response.add(utf8.encode('${n%2==0?n:-1}\n'));if(n%128==0)await request.response.flush();}await request.response.close();});
    final fixture=await openMedia(directory,server,'3.2.1','json',{'itemSchema':{'type':'integer','minimum':0}},contentType:'application/x-ndjson');
    final result=await const ContractRequestExecutor().execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity,overallTimeout:const Duration(minutes:3)),resolveSecret:(_) async=>null);addTearDown(result.close);
    final stream=result.response.stream!;expect(stream.records,3000);expect(stream.validRecords,1500);expect(stream.invalidRecords,1500);expect(stream.evidence.length,lessThanOrEqualTo(128));expect(stream.findings.length,lessThanOrEqualTo(200));
    expect(stream.complete,true);expect(stream.status,'invalid');expect(result.received.complete,true);expect(result.received.valid,false);
  });
  test('nested multipart children are inspectable before the enclosing part ends',() async {
    final directory=await Directory.systemTemp.createTemp('busyapi-stream-mime-');addTearDown(()=>directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
    final first=Completer<void>(),release=Completer<void>();addTearDown(() {if(!release.isCompleted)release.complete();});
    const type='multipart/mixed; boundary=outer',prefix='--outer\r\nContent-Type: multipart/mixed; boundary=inner\r\n\r\n--inner\r\nContent-Type: application/json\r\n\r\n9007199254740993\r\n--inner\r\nContent-Type: application/octet-stream\r\n\r\n';
    final suffix=<int>[0,255,13,10,...ascii.encode('--inner--\r\n\r\n--outer--\r\n')];
    server.listen((request) async {await request.drain<void>();request.response.bufferOutput=false;request.response.headers.set('content-type',type);request.response.add(ascii.encode(prefix));await request.response.flush();await release.future;request.response.add(suffix);await request.response.close();});
    final fixture=await openMedia(directory,server,'3.2.1','json',{'schema':{'type':'array','prefixItems':[{'type':'array','prefixItems':[{'type':'number','enum':['EXACT_VALUE']},{'maxLength':2}],'items':false,'minItems':2}],'items':false,'minItems':1},'prefixEncoding':[{'contentType':'multipart/mixed','prefixEncoding':[{'contentType':'application/json'},{'contentType':'application/octet-stream'}]}]},contentType:type);
    final pending=const ContractRequestExecutor().execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity),resolveSecret:(_) async=>null,onStream:(value){if(value.evidence.any((item)=>(item['path'] as List?)?.length==2)&&!first.isCompleted)first.complete();});
    await first.future.timeout(const Duration(seconds:10));release.complete();final result=await pending;addTearDown(result.close);
    expect(result.conforming,true,reason:'${result.received.findings}');expect(result.response.stream!.records,3);expect(await result.response.bytes(),[...ascii.encode(prefix),...suffix]);
  });
  test('binary raw maxLength and response retention limits use actual received bytes',() async {
    final directory=await Directory.systemTemp.createTemp('busyapi-stream-bounds-');addTearDown(()=>directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
    var binary=true;
    server.listen((request) async {await request.drain<void>();request.response.headers.set('content-type',binary?'application/octet-stream':'application/x-ndjson');request.response.add(binary?[0,1,2,255]:utf8.encode('1\n2\n'));await request.response.close();});
    final fixture=await openMedia(directory,server,'3.2.1','json',{'schema':{'maxLength':3}},contentType:'application/octet-stream');
    final first=await const ContractRequestExecutor().execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity),resolveSecret:(_) async=>null);addTearDown(first.close);
    expect(first.received.complete,true);expect(first.received.valid,false);expect(first.response.stream!.status,'invalid');expect(first.response.stream!.receivedBytes,4);expect(first.response.stream!.decodedBytes,4);expect(await first.response.bytes(),[0,1,2,255]);
    binary=false;
    final secondFixture=await openMedia(directory,server,'3.2.1','json',{'itemSchema':{'type':'integer'}},contentType:'application/x-ndjson');
    final second=await const ContractRequestExecutor(transport:ContractHttpTransport(maximumResponseBytes:3)).execute(secondFixture.plan,OperationRequestDraft(planIdentity:secondFixture.plan.identity),resolveSecret:(_) async=>null);addTearDown(second.close);
    expect(second.received.complete,false);expect(second.response.stream!.status,'incomplete');expect(second.response.stream!.records,1);expect(second.response.stream!.receivedBytes,4);expect(second.response.stream!.decodedBytes,3);expect(second.response.incompleteReason,'response-size-limit');expect(await second.response.bytes(),utf8.encode('1\n2'));
  });
  test('whole-array assertions fail after EOF without inventing invalid item results',() async {
    final directory=await Directory.systemTemp.createTemp('busyapi-stream-whole-');addTearDown(()=>directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
    server.listen((request) async {await request.drain<void>();request.response.headers.set('content-type','application/x-ndjson');request.response.add(utf8.encode('1\n2\n'));await request.response.close();});
    final fixture=await openMedia(directory,server,'3.2.1','json',{'schema':{'type':'array','maxItems':1},'itemSchema':{'type':'integer'}},contentType:'application/x-ndjson');
    final result=await const ContractRequestExecutor().execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity),resolveSecret:(_) async=>null);addTearDown(result.close);
    expect(result.response.stream!.validRecords,2);expect(result.response.stream!.invalidRecords,0);expect(result.response.stream!.status,'invalid');expect(result.received.complete,true);expect(result.received.valid,false);
    expect(result.received.findings.any((value)=>value['code']=='runtime.schema.incompatible'&&(value['schema'] as Map?)?['pointer']=='/paths/~1data/post/responses/200/content/application~1x-ndjson/schema'),true);
  });
  test('a binary prefix cannot fail a non-monotone whole schema before EOF',() async {
    final directory=await Directory.systemTemp.createTemp('busyapi-stream-binary-eof-');addTearDown(()=>directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
    final observed=Completer<ContractStreamSnapshot>(),release=Completer<void>();addTearDown(() {if(!release.isCompleted)release.complete();});
    server.listen((request) async {await request.drain<void>();request.response.bufferOutput=false;request.response.headers.set('content-type','application/octet-stream');request.response.add([0,1]);await request.response.flush();await release.future;request.response.add([2,3]);await request.response.close();});
    final fixture=await openMedia(directory,server,'3.2.1','json',{'schema':{'not':{'maxLength':3}}},contentType:'application/octet-stream');
    final pending=const ContractRequestExecutor().execute(fixture.plan,OperationRequestDraft(planIdentity:fixture.plan.identity),resolveSecret:(_) async=>null,onStream:(value){if(value.decodedBytes==2&&!value.terminal&&!observed.isCompleted)observed.complete(value);});
    final prefix=await observed.future.timeout(const Duration(seconds:10));expect(prefix.status,'active');expect(prefix.complete,false);expect(prefix.findings.where((value)=>value['severity']=='error'),isEmpty);
    release.complete();final result=await pending;addTearDown(result.close);expect(result.conforming,true,reason:'${result.received.findings}');expect(result.response.stream!.status,'complete');expect(await result.response.bytes(),[0,1,2,3]);
  });
  test('a complete saved stream has equivalent Core and independent CLI counts and byte identity',() async {
    final directory=await Directory.systemTemp.createTemp('busyapi-stream-complete-cli-');addTearDown(()=>directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
    final wire=utf8.encode('\x1e9007199254740993\n\x1e2\n');
    server.listen((request) async {await request.drain<void>();request.response.headers.set('content-type','application/json-seq');for(final byte in wire){request.response.add([byte]);await request.response.flush();}await request.response.close();});
    final fixture=await openMedia(directory,server,'3.2.1','json',{'schema':{'type':'array','minItems':2,'maxItems':2},'itemSchema':{'type':'number'}},contentType:'application/json-seq');
    final changes=await fixture.project.applyRefactoring(await fixture.plan.planCase('all-records',OperationRequestDraft(planIdentity:fixture.plan.identity,headers:const [RequestHeaderValue('Accept','application/json-seq')])));
    expect((await PublicationStore('${directory.path}/publication').save(fixture.project,[for(final id in changes)fixture.project.store.get(id)])).complete,true);
    final engine=EngineProcess(executable:runtimeNode,helper:runtimeHelper);addTearDown(engine.close);final cold=await BusyProject.open(directory.path,engine);addTearDown(cold.close);
    final report=await const ContractTestRunner().run(cold,fixture.source.uri.toString(),selectedCases:['all-records'],resolveSecret:(_) async=>null);
    expect(report.complete,true);expect(report.cases.single.passed,true);expect(report.cases.single.stream!['validRecords'],2);expect(report.cases.single.stream!['receivedBytes'],wire.length);
    final cli=await Process.run('$testBundle/busyapi',['test',directory.path,'--case','all-records','--json'],environment:const {'PATH':'','LANG':'C.UTF-8'},includeParentEnvironment:false);
    expect(cli.exitCode,0,reason:'${cli.stdout} ${cli.stderr}');final output=jsonDecode(cli.stdout as String) as Map,entry=output['cases'][0] as Map;
    expect(output['producerVersion'],'4');expect(entry['stream']['status'],'complete');expect(entry['stream']['complete'],true);expect(entry['stream']['valid'],true);expect(entry['stream']['records'],2);expect(entry['stream']['receivedBytes'],wire.length);expect(entry['bodyIdentity'],report.cases.single.bodyIdentity);expect(entry['stream']['items'].every((dynamic value)=>!value.containsKey('data')),true);
    expect(await fixture.source.readAsString(),fixture.original);
  });
  test('saved stopping policy survives cold reopening and independent CLI execution',() async {
    final directory=await Directory.systemTemp.createTemp('busyapi-stream-cli-');addTearDown(()=>directory.delete(recursive:true));
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
    server.listen((request) async {await request.drain<void>();request.response.bufferOutput=false;request.response.headers.set('content-type','application/x-ndjson');request.response.add(utf8.encode('9007199254740993\n2\n'));await request.response.flush();try{await request.response.done;}on Object{/* Explicit stop closes the peer. */}});
    final fixture=await openMedia(directory,server,'3.2.1','yaml',{'itemSchema':{'type':'number'}},contentType:'application/x-ndjson');
    final changes=await fixture.project.applyRefactoring(await fixture.plan.planCase('one-record',OperationRequestDraft(planIdentity:fixture.plan.identity,streamStopAfterRecords:1,headers:const [RequestHeaderValue('Accept','application/x-ndjson')])));
    expect((await PublicationStore('${directory.path}/publication').save(fixture.project,[for(final id in changes)fixture.project.store.get(id)])).complete,true);
    final engine=EngineProcess(executable:runtimeNode,helper:runtimeHelper);addTearDown(engine.close);final cold=await BusyProject.open(directory.path,engine);addTearDown(cold.close);
    final plan=await cold.prepareRequest(fixture.source.uri.toString(),resource:fixture.source.uri.toString(),pointer:'/paths/~1data/post');addTearDown(plan.close);
    final draft=await ContractTestRunner.reopenCase(plan,'one-record',cold.access);expect(draft.streamStopAfterRecords,1);expect(draft.headers.single.value,'application/x-ndjson');
    final report=await const ContractTestRunner().run(cold,fixture.source.uri.toString(),selectedCases:['one-record'],resolveSecret:(_) async=>null);
    expect(report.complete,false);expect(report.cases.single.status,'stopped');expect(report.cases.single.stream!['records'],1);expect(report.cases.single.stream!['complete'],false);
    final cli=await Process.run('$testBundle/busyapi',['test',directory.path,'--case','one-record','--json'],environment:const {'PATH':'','LANG':'C.UTF-8'},includeParentEnvironment:false);
    expect(cli.exitCode,2,reason:'${cli.stdout} ${cli.stderr}');final output=jsonDecode(cli.stdout as String) as Map;
    expect(output['producerVersion'],'4');expect(output['cases'][0]['stream']['status'],'stopped');expect(output['cases'][0]['stream']['records'],1);expect(output['cases'][0]['passed'],false);expect(output['cases'][0]['stream']['valid'],false);
    expect(await fixture.source.readAsString(),fixture.original);
  });
}
class _GateStorage implements ResponseStorage {
  _GateStorage(this.owner,this.before);
  final ResponseStorage owner;
  final Future<void> Function() before;
  bool writing=false;
  @override Future<void> write(List<int> bytes) async {expect(writing,false);writing=true;try{await before();await owner.write(bytes);}finally{writing=false;}}
  @override Future<void> flush()=>owner.flush();
  @override Future<void> close()=>owner.close();
}

/// Controlled worker faults surround actual Engine results; all receipt,
/// retention, final captured-schema validation and aggregation use production.
class _StreamProofFault extends EngineProcess {
  _StreamProofFault(this.mode):super(executable:runtimeNode,helper:runtimeHelper);
  final String mode;
  @override Future<Map<String,dynamic>> request(String method,Map<String,Object?> params,{String? requestId}) async {
    final result=await super.request(method,params,requestId:requestId);
    if(method=='responseStreamChunk'&&!mode.startsWith('whole-')){
      result['records']=[for(final raw in result['records'] as List){...(raw as Map),'complete':false,'valid':false,'wholeResolvable':false,'findings':[{'code':mode=='resource'?'runtime.body.limit':mode=='codec'?'runtime.response.body.unchecked':'runtime.schema.unavailable','severity':'warning','message':'Controlled independent unavailable proof','subject':'response-item','recordIndex':raw['index']}]}];
    }
    if(method=='evaluateSchemas'&&mode.startsWith('whole-')&&(params['runtimeInstances'] as List? ?? const []).whereType<Map>().any((value)=>value['subject']=='response-body')){
      if(mode=='whole-missing'){result['runtimeEvaluations']=[];return result;}
      result['complete']=false;result['runtimeEvaluations']=[for(final raw in result['runtimeEvaluations'] as List){...(raw as Map),'complete':false,'valid':false,'reason':'evaluation-failed'}];
    }
    return result;
  }
}
