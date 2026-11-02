import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final mode in ['list', 'singleton', 'date', 'unknown', 'cookies', 'informational', 'head']) {
    test('actual $mode response field lines retain bytes through execution and CLI cases', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-field-lines-');
      addTearDown(() => directory.delete(recursive: true));
      final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
      final sockets = <Socket>[];
      addTearDown(() async {
        for (final socket in sockets) { socket.destroy(); }
        await server.close();
      });
      final name = switch (mode) {
        'list' => 'Cache-Control',
        'singleton' => 'ETag',
        'date' => 'Date',
        'informational' => 'Cache-Control',
        'head' => 'Cache-Control',
        'cookies' => 'Set-Cookie',
        _ => 'X-Unknown',
      };
      final lines = switch (mode) {
        'list' => ['private="a,b"', 'max-age=9007199254740993'],
        'singleton' => ['"one"', '"two"'],
        'date' => ['Wed, 09 Jun 2021 10:18:14 GMT', 'Thu, 10 Jun 2021 10:18:14 GMT'],
        'informational' => ['private="a,b"', 'max-age=9007199254740993'],
        'head' => ['private="a,b"', 'max-age=9007199254740993'],
        'cookies' => ['a=1; Expires=Wed, 09 Jun 2021 10:18:14 GMT', 'b=2'],
        _ => ['a', 'b'],
      };
      final entity = utf8.encode('9007199254740993.00');
      final wire = <int>[
        if (mode == 'informational') ...ascii.encode('HTTP/1.1 103 Early Hints\r\nLink: </guide>; rel=preload\r\n\r\n'),
        ...ascii.encode('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n'
            '${lines.map((value) => '$name: $value\r\n').join()}'
            'Content-Length: ${entity.length}\r\nConnection: close\r\n\r\n'),
        if (mode != 'head') ...entity,
      ];
      server.listen((socket) {
        sockets.add(socket);
        final received = <int>[];
        var sent = false;
        socket.listen((chunk) {
          if (sent) return;
          received.addAll(chunk);
          if (ascii.decode(received).contains('\r\n\r\n')) {
            sent = true;
            socket.add(wire);
            socket.close();
          }
        });
      });
      final file = File('${directory.path}/api.json');
      final original = jsonEncode({
        'openapi': '3.2.1', 'info': {'title': 'Field lines', 'version': 'business'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/data': {mode == 'head' ? 'head' : 'get': {'responses': {'200': {
          'description': 'Reply',
          'headers': {name: {'content': {'text/plain': {'schema': {
            'type': 'string', 'enum': [lines.join(mode == 'cookies' ? '\n' : ', ')],
          }}}}},
          'content': {'application/json': {'schema': {'type': 'integer', 'enum': ['EXACT']}}},
        }}}}},
      }).replaceAll('"EXACT"', '9007199254740993.00');
      await file.writeAsString(original);
      await File('${directory.path}/busyapi.yaml').writeAsString(
          'version: 1\nroots: [{name: api, path: api.json}]\n'
          'tests: [{name: fields, operation: {method: ${mode == 'head' ? 'HEAD' : 'GET'}, path: /data}, expect: {status: 200}}]\n');
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final project = await BusyProject.open(directory.path, engine);
      addTearDown(project.close);
      final root = file.uri.toString(), checked = await project.check(file.uri.toString());
      expect(checked['status'], 'complete', reason: '$checked');
      final operation = (checked['projection']['operations'] as List).cast<Map>().single;
      final plan = await project.prepareRequest(root,
          resource: operation['resource'] as String, pointer: operation['pointer'] as String,
          occurrence: operation['occurrence'] as String);
      addTearDown(plan.close);
      final result = await const ContractRequestExecutor().execute(plan,
          OperationRequestDraft(planIdentity: plan.identity), resolveSecret: (_) async => null);
      addTearDown(result.close);
      expect(await result.response.bytes(), mode == 'head' ? isEmpty : entity);
      expect(result.response.headers.where((header) => header.$1 == name.toLowerCase()).map((header) => header.$2), lines);
      expect(result.received.complete, mode != 'unknown', reason: '${result.received.findings}');
      final invalid = mode == 'singleton' || mode == 'date';
      final valid = mode == 'list' || mode == 'cookies' || mode == 'informational' || mode == 'head';
      expect(result.conforming, valid);
      if (invalid || mode == 'unknown') {
        expect(result.received.findings.any((finding) =>
            finding['detailCode'] == (invalid ? 'runtime.header.repeated' : 'runtime.header.unchecked')),
            true, reason: '${result.received.findings}');
      }
      final cli = await runCliWithSecrets(['test', directory.path, '--case', 'fields', '--json'], {});
      expect(cli.code, mode == 'unknown' ? 2 : invalid ? 1 : 0, reason: cli.output);
      final report = jsonDecode(cli.output) as Map;
      expect(report['complete'], mode != 'unknown');
      expect(report['passed'], valid);
      expect(await file.readAsString(), original);
    });
  }
}
