import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'custom_method_tls_test.dart' show certificates;
import 'test_support.dart';

typedef _Exchange = ({String line, Map<String, List<String>> headers, List<int> body});

class _EnvironmentProxy extends HttpOverrides {
  _EnvironmentProxy(this.environment);
  final Map<String, String> environment;
  @override
  String findProxyFromEnvironment(Uri uri, Map<String, String>? ignored) =>
      super.findProxyFromEnvironment(uri, environment);
}

class _PacProxy extends HttpOverrides {
  _PacProxy(this.configuration);
  final String configuration;
  @override
  String findProxyFromEnvironment(Uri uri, Map<String, String>? ignored) => configuration;
}

// Fixture reader only: bounded Content-Length exchanges, then a fixed approved
// tunnel peer. This test proxy cannot acquire a target supplied by a request.
StreamSubscription<Uint8List> _request(Socket socket, void Function(_Exchange) received) {
  final bytes = <int>[];
  var done = false;
  return socket.listen((chunk) {
    if (done) return;
    bytes.addAll(chunk);
    expect(bytes.length, lessThan(64 * 1024));
    final text = latin1.decode(bytes), end = text.indexOf('\r\n\r\n');
    if (end < 0) return;
    final lines = text.substring(0, end).split('\r\n'), headers = <String, List<String>>{};
    for (final line in lines.skip(1)) {
      final colon = line.indexOf(':');
      headers.putIfAbsent(line.substring(0, colon).toLowerCase(), () => [])
          .add(line.substring(colon + 1).trim());
    }
    final length = int.parse(headers['content-length']?.single ?? '0');
    if (bytes.length < end + 4 + length) return;
    done = true;
    received((line: lines.first, headers: headers, body: bytes.sublist(end + 4)));
  }, onError: (Object _) {});
}

Future<void> _reply(Socket socket, {bool invalid = false}) async {
  const entity = '9007199254740993.00';
  socket.add(ascii.encode('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n'
      'Cache-Control: private="a,b"\r\nCache-Control: max-age=9007199254740993\r\n'
      'ETag: "one"\r\n${invalid ? 'ETag: "two"\r\n' : ''}'
      'Content-Length: ${entity.length}\r\nConnection: close\r\n\r\n$entity'));
  await socket.flush();
  await socket.close();
}

class _Proxy {
  _Proxy(this.server);
  final ServerSocket server;
  final sockets = <Socket>{};
  final seen = <_Exchange>[];
  final arrived = Completer<void>(), closed = Completer<void>();
  final tunnelBytes = Completer<void>();
  bool invalid = false;
  int status = 200;
  bool stall = false;
  String get address => '127.0.0.1:${server.port}';

  static Future<_Proxy> start({int? tunnelPort}) async {
    final proxy = _Proxy(await ServerSocket.bind(InternetAddress.loopbackIPv4, 0));
    addTearDown(() async {
      for (final socket in proxy.sockets) { socket.destroy(); }
      await proxy.server.close();
    });
    proxy.server.listen((socket) {
      proxy.sockets.add(socket);
      late StreamSubscription<Uint8List> subscription;
      subscription = _request(socket, (request) async {
        proxy.seen.add(request);
        if (!proxy.arrived.isCompleted) proxy.arrived.complete();
        if (proxy.stall) return;
        if (tunnelPort == null) { await _reply(socket, invalid: proxy.invalid); return; }
        if (proxy.status < 200 || proxy.status >= 300) {
          socket.add(ascii.encode('HTTP/1.1 ${proxy.status} Denied\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'));
          await socket.flush(); socket.destroy(); return;
        }
        expect(request.line, matches('^CONNECT (127\\.0\\.0\\.1|localhost):$tunnelPort HTTP/1\\.1\$'));
        final upstream = await Socket.connect(InternetAddress.loopbackIPv4, tunnelPort);
        proxy.sockets.add(upstream);
        subscription.onData((bytes) {
          if (!proxy.tunnelBytes.isCompleted) proxy.tunnelBytes.complete();
          upstream.add(bytes);
        });
        subscription.onDone(() {
          upstream.destroy();
          if (!proxy.closed.isCompleted) proxy.closed.complete();
        });
        upstream.listen(socket.add, onError: (Object _) => socket.destroy(), onDone: socket.destroy);
        // Control fields must never replace the final origin's field evidence.
        // A successful CONNECT ignores this deliberately misleading length.
        socket.add(ascii.encode('HTTP/1.1 ${proxy.status} Connected\r\nContent-Length: 999\r\n'
            'ETag: "proxy-one"\r\nETag: "proxy-two"\r\n\r\n'));
        await socket.flush();
      });
      subscription.onDone(() {
        if (!proxy.closed.isCompleted) proxy.closed.complete();
      });
    });
    return proxy;
  }
}

Future<({BusyProject project, String root, String original})> _project(Directory directory, Uri server,
    {bool tls = false}) async {
  final response = {'description': 'Exact response', 'headers': {
    'Cache-Control': {'content': {'text/plain': {'schema': {'type': 'string', 'enum': ['private="a,b", max-age=9007199254740993']}}}},
    'ETag': {'schema': {'type': 'string'}},
  }, 'content': {'application/json': {'schema': {'type': 'integer', 'enum': ['EXACT']}}}};
  Map<String, Object?> operation(bool body) => {
    if (body) 'requestBody': {'content': {'text/plain': {'schema': {'type': 'string'}}}},
    'responses': {'200': response},
  };
  final original = jsonEncode({'openapi': '3.2.1', 'info': {'title': 'Proxy', 'version': '1'},
    'servers': [{'url': server.toString()}], 'paths': {'/p': {
      'get': operation(false), 'post': operation(true), 'additionalOperations': {'purge': operation(true)},
    }}}).replaceAll('"EXACT"', '9007199254740993.00');
  final file = File('${directory.path}/api.json');
  await file.writeAsString(original);
  final material = {'caFile': 'certs/ca.crt', 'clientCertificateFile': 'certs/client.crt', 'clientKeyFile': 'certs/client.key'};
  await File('${directory.path}/busyapi.yaml').writeAsString(jsonEncode({'version': 1,
      'roots': [{'name': 'api', 'path': 'api.json'}], if (tls) 'environments': {
        'secure': {'tls': material},
        'untrusted': {'tls': {'clientCertificateFile': 'certs/client.crt', 'clientKeyFile': 'certs/client.key'}},
        'wrongName': {'baseUrl': 'https://localhost:${server.port}', 'tls': material},
      }, 'tests': [{'name': 'proxy', 'operation': {'method': 'GET', 'path': '/p'}, 'expect': {'status': 200}}]}));
  final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
  addTearDown(engine.close);
  final project = await BusyProject.open(file.path, engine);
  addTearDown(project.close);
  return (project: project, root: file.uri.toString(), original: original);
}

Future<ContractRequestResult> _send(BusyProject project, String root, String method,
    {String? environment, RunCancellation? cancellation, Duration timeout = const Duration(seconds: 10)}) async {
  final pointer = '/paths/~1p/${method == 'purge' ? 'additionalOperations/purge' : method.toLowerCase()}';
  final plan = await project.prepareRequest(root, resource: root, pointer: pointer);
  try {
    return await const ContractRequestExecutor().execute(plan,
        OperationRequestDraft(planIdentity: plan.identity, environment: environment,
          connectTimeout: timeout, overallTimeout: timeout,
          body: method == 'GET' ? const RequestBodyDraft.none() :
              const RequestBodyDraft.raw(mediaType: 'text/plain', text: '雪 BUSYAPI payload')),
        resolveSecret: (_) async => null, cancellation: cancellation);
  } finally { plan.close(); }
}

Future<void> _conforms(ContractRequestResult result, {bool valid = true}) async {
  try {
    expect(result.outgoing.complete, true, reason: '${result.outgoing.findings}');
    expect(result.outgoing.valid, true);
    expect(result.received.complete, true, reason: '${result.received.findings}');
    expect(result.received.valid, valid, reason: '${result.received.findings}');
    expect(result.conforming, valid);
    expect(await result.response.bytes(), ascii.encode('9007199254740993.00'));
    expect(result.response.headers.where((field) => field.$1 == 'cache-control').map((field) => field.$2),
        ['private="a,b"', 'max-age=9007199254740993']);
    if (!valid) expect(result.received.findings.any((finding) => finding['detailCode'] == 'runtime.header.repeated'), true);
  } finally { await result.close(); }
}

void main() {
  test('GET, POST and exact custom methods use the configured HTTP proxy and retain field lines', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-http-proxy-');
    addTearDown(() => directory.delete(recursive: true));
    final proxy = await _Proxy.start();
    final fixture = await _project(directory, Uri.parse('http://unresolvable.invalid:8181'));
    final routing = _EnvironmentProxy({'http_proxy': 'proxy-user:proxy-secret@${proxy.address}'});
    await HttpOverrides.runWithHttpOverrides(() async {
      for (final method in ['GET', 'POST', 'purge']) {
        await _conforms(await _send(fixture.project, fixture.root, method));
        expect(proxy.seen.last.line, '$method http://unresolvable.invalid:8181/p HTTP/1.1');
        expect(proxy.seen.last.headers['proxy-authorization'], ['Basic ${base64Encode(utf8.encode('proxy-user:proxy-secret'))}']);
        expect(proxy.seen.last.body, method == 'GET' ? isEmpty : utf8.encode('雪 BUSYAPI payload'));
      }
      proxy.invalid = true;
      await _conforms(await _send(fixture.project, fixture.root, 'GET'), valid: false);
    }, routing);
    proxy.invalid = false;
    final cli = await Process.run('$testBundle/busyapi', ['test', directory.path, '--case', 'proxy', '--json'],
        environment: {'PATH': '', 'LANG': 'C.UTF-8', 'http_proxy': 'proxy-user:proxy-secret@${proxy.address}'}, includeParentEnvironment: false);
    expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
    expect((jsonDecode(cli.stdout as String) as Map)['passed'], true);
    expect(await File('${directory.path}/api.json').readAsString(), fixture.original);
  });

  test('HTTPS proxy CONNECT retains fallback, TLS identity/client authentication, origin fields and proxy credential isolation', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-https-proxy-');
    addTearDown(() => directory.delete(recursive: true));
    final context = await certificates(directory);
    final origin = await SecureServerSocket.bind(InternetAddress.loopbackIPv4, 0, context, requireClientCertificate: true);
    final sockets = <Socket>[], seen = <_Exchange>[];
    addTearDown(() async { for (final socket in sockets) { socket.destroy(); } await origin.close(); });
    origin.listen((socket) {
      sockets.add(socket);
      expect(socket.peerCertificate, isNotNull);
      _request(socket, (request) async { seen.add(request); await _reply(socket); });
    }, onError: (Object _) {});
    final proxy = await _Proxy.start(tunnelPort: origin.port), refused = await _Proxy.start(tunnelPort: origin.port);
    refused.status = 502;
    final fixture = await _project(directory, Uri.parse('https://127.0.0.1:${origin.port}'), tls: true);
    final routing = _PacProxy('PROXY ${refused.address}; PROXY proxy-user:proxy-secret@${proxy.address}');
    await HttpOverrides.runWithHttpOverrides(() async {
      for (final method in ['GET', 'POST', 'purge']) {
        proxy.status = method == 'POST' ? 201 : 200;
        Future<ContractRequestResult> send() => _send(fixture.project, fixture.root, method, environment: 'secure');
        await _conforms(method == 'GET'
            ? await HttpOverrides.runWithHttpOverrides(send, _EnvironmentProxy({'https_proxy': 'proxy-user:proxy-secret@${proxy.address}'}))
            : await send());
        expect(proxy.seen.last.line, 'CONNECT 127.0.0.1:${origin.port} HTTP/1.1');
        expect(proxy.seen.last.headers['proxy-authorization'], ['Basic ${base64Encode(utf8.encode('proxy-user:proxy-secret'))}']);
        expect(seen.last.line, '$method /p HTTP/1.1');
        expect(seen.last.headers.containsKey('proxy-authorization'), false);
        expect(seen.last.body, method == 'GET' ? isEmpty : utf8.encode('雪 BUSYAPI payload'));
      }
      for (final environment in ['untrusted', 'wrongName']) {
        await expectLater(_send(fixture.project, fixture.root, 'GET', environment: environment),
            throwsA(isA<CoreFailure>().having((failure) => failure.code, 'TLS trust/name failure', 'request.tls')));
      }
    }, routing);
    expect(seen, hasLength(3));
    expect(refused.seen.length, proxy.seen.length - 1);
    final count = proxy.seen.length;
    await HttpOverrides.runWithHttpOverrides(() async {
      await expectLater(_send(fixture.project, fixture.root, 'GET', environment: 'secure'),
          throwsA(isA<CoreFailure>().having((failure) => failure.code, 'failed tunnel', 'request.transport.protocol')));
    }, _PacProxy('PROXY ${refused.address}'));
    expect(seen, hasLength(3), reason: 'A refused proxy must not fall back to DIRECT');
    await HttpOverrides.runWithHttpOverrides(() async {
      await expectLater(_send(fixture.project, fixture.root, 'GET', environment: 'secure'),
          throwsA(isA<CoreFailure>().having((failure) => failure.message, 'redacted proxy failure', isNot(contains('proxy-secret')))));
    }, _PacProxy('PROXY proxy-user:proxy-secret@${proxy.address}; INVALID'));
    expect(proxy.seen, hasLength(count), reason: 'Validate the whole configured route list before connecting');
    await HttpOverrides.runWithHttpOverrides(() async {
      await _conforms(await _send(fixture.project, fixture.root, 'GET', environment: 'secure'));
    }, _PacProxy('PROXY ${refused.address}; DIRECT'));
    expect(seen, hasLength(4), reason: 'An explicitly configured DIRECT fallback remains available');
  });

  test('the SDK no_proxy setting retains an explicitly selected direct route', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-no-proxy-');
    addTearDown(() => directory.delete(recursive: true));
    final origin = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0), sockets = <Socket>[];
    var seen = 0;
    addTearDown(() async { for (final socket in sockets) { socket.destroy(); } await origin.close(); });
    origin.listen((socket) {
      sockets.add(socket);
      _request(socket, (request) async { seen++; expect(request.line, 'GET /p HTTP/1.1'); await _reply(socket); });
    });
    final proxy = await _Proxy.start();
    final fixture = await _project(directory, Uri.parse('http://127.0.0.1:${origin.port}'));
    await HttpOverrides.runWithHttpOverrides(() async {
      await _conforms(await _send(fixture.project, fixture.root, 'GET'));
    }, _EnvironmentProxy({'http_proxy': proxy.address, 'no_proxy': '127.0.0.1'}));
    expect(seen, 1); expect(proxy.seen, isEmpty);
  });

  for (final handshake in [false, true]) for (final timeout in [false, true]) {
    test('proxy ${handshake ? 'TLS handshake' : 'CONNECT'} ${timeout ? 'timeout' : 'cancellation'} closes the actual peer', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-proxy-cancel-');
      addTearDown(() => directory.delete(recursive: true));
      final blackhole = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
      final sockets = <Socket>[];
      addTearDown(() async { for (final socket in sockets) { socket.destroy(); } await blackhole.close(); });
      blackhole.listen((socket) { sockets.add(socket); socket.listen((_) {}, onError: (Object _) {}); });
      final proxy = await _Proxy.start(tunnelPort: blackhole.port);
      proxy.stall = !handshake;
      final fixture = await _project(directory, Uri.parse('https://127.0.0.1:${blackhole.port}'));
      final cancellation = RunCancellation();
      await HttpOverrides.runWithHttpOverrides(() async {
        final call = _send(fixture.project, fixture.root, 'POST', cancellation: cancellation,
            timeout: timeout ? const Duration(seconds: 2) : const Duration(seconds: 10));
        final checked = expectLater(call, throwsA(isA<CoreFailure>().having((failure) => failure.code,
            'owned termination', timeout ? 'request.timeout' : 'cancelled')));
        await proxy.arrived.future.timeout(const Duration(seconds: 10));
        if (handshake) await proxy.tunnelBytes.future.timeout(const Duration(seconds: 10));
        if (!timeout) cancellation.cancel();
        await checked;
        await proxy.closed.future.timeout(const Duration(seconds: 5));
      }, _EnvironmentProxy({'https_proxy': proxy.address}));
    });
  }
}
