import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:busyapi_core/busyapi_core.dart';
import 'test_support.dart';

class ConnectMockFixture {
  ConnectMockFixture(this.directory,this.source,this.original,this.manifest,this.configuration,this.peer,this.project,this.engine,this.peers);
  final Directory directory;
  final File source,manifest;
  final String original,configuration;
  final ServerSocket peer;
  final BusyProject project;
  final EngineProcess engine;
  final Set<Socket> peers;
  String get authority=>'approved.test:${peer.port}';
  Future<void> close() async {for(final socket in peers.toList()) {
    socket.destroy();
  }await peer.close();project.close();await engine.close();await directory.delete(recursive:true);}
}
Future<ConnectMockFixture> createConnectMockFixture() async {
  final directory=await Directory.systemTemp.createTemp('busyapi-connect-workflow-');
  final peer=await ServerSocket.bind(InternetAddress.loopbackIPv4,0),peers=<Socket>{};
  peer.listen((socket){peers.add(socket);socket.listen(socket.add,onDone:(){peers.remove(socket);socket.destroy();},onError:(Object _){peers.remove(socket);socket.destroy();});});
  final source=File('${directory.path}/api.json'),manifest=File('${directory.path}/busyapi.yaml');
  final original=jsonEncode({'openapi':'3.2.1','info':{'title':'Approved mock tunnel','version':'1'},'components':{'securitySchemes':{'Key':{'type':'apiKey','in':'header','name':'X-Key'}}},'paths':{
    '/tunnel':{'additionalOperations':{'CONNECT':{'security':[{'Key':<Object?>[]}],'responses':{'200':{'description':'Tunnel'}}}}},
    '/sample':{'get':{'responses':{'200':{'description':'Pattern witness','content':{'application/json':{'schema':{'type':'string','pattern':r'^AB[0-9]{3}$'}}}}}}},
    '/binary':{'get':{'responses':{'200':{'description':'Binary witness','content':{'application/octet-stream':{'schema':{'maxLength':5,'not':{'maxLength':3}}}}}}}},
  }});
  final configuration=jsonEncode({'version':1,'roots':[{'name':'api','path':'api.json'}],'mock':{'tunnels':{'destinations':[{'path':'/tunnel','authority':'approved.test:${peer.port}','address':'127.0.0.1'}],'maximumTunnels':2,'maximumBytes':1048576,'idleTimeoutMs':30000,'durationMs':60000}}});
  await source.writeAsString(original);await manifest.writeAsString(configuration);
  final engine=EngineProcess(executable:runtimeNode,helper:runtimeHelper),project=await BusyProject.open(directory.path,engine);
  return ConnectMockFixture(directory,source,original,manifest,configuration,peer,project,engine,peers);
}
class ControlledTunnel {
  ControlledTunnel(this.socket){socket.listen((chunk){pending.addAll(chunk);changed?.complete();changed=null;},onDone:(){if(!closed.isCompleted)closed.complete();changed?.complete();changed=null;},onError:(Object _){if(!closed.isCompleted)closed.complete();changed?.complete();changed=null;});}
  final Socket socket;
  final pending=<int>[];
  final closed=Completer<void>();
  Completer<void>? changed;
  int status=0;
  String headers='';
  Future<void> wait() async {if(closed.isCompleted)throw StateError('Tunnel closed before expected bytes');changed??=Completer<void>();await changed!.future.timeout(const Duration(seconds:10));}
  Future<List<int>> read(int count) async {while(pending.length<count){await wait();}final bytes=pending.sublist(0,count);pending.removeRange(0,count);return bytes;}
  static Future<ControlledTunnel> open(int port,String authority,{List<int> head=const [],bool credentials=true}) async {
    final tunnel=ControlledTunnel(await Socket.connect(InternetAddress.loopbackIPv4,port));
    tunnel.socket.add([...ascii.encode('CONNECT $authority HTTP/1.1\r\nHost: $authority\r\n${credentials?'X-Key: synthetic-private-value\r\n':''}\r\n'),...head]);await tunnel.socket.flush();
    while(true){final at=latin1.decode(tunnel.pending).indexOf('\r\n\r\n');if(at>=0){tunnel.headers=latin1.decode(tunnel.pending.sublist(0,at));tunnel.pending.removeRange(0,at+4);tunnel.status=int.parse(tunnel.headers.split(' ')[1]);break;}await tunnel.wait();}
    return tunnel;
  }
}
