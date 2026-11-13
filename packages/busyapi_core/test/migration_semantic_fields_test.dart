import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  test('entry-owned Example and Schema fields retain distinct media, native inspection and exact published bytes', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-semantic-fields-');
    addTearDown(() => directory.delete(recursive: true));
    await Directory('${directory.path}/defs').create();
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final observed = <(String, List<int>)>[];
    server.listen((request) async {
      expect(request.method, 'POST');expect(request.uri.path, '/echo');
      final bytes = await request.fold<List<int>>([], (all, chunk) => all..addAll(chunk));
      final mediaType = request.headers.contentType!.mimeType;
      observed.add((mediaType, bytes));
      request.response.headers.set('content-type', mediaType);
      request.response.add(bytes);await request.response.close();
    });
    const reference = 'defs/shared.yaml#/Example';
    Map<String, Object?> api(String version, String title, String type, Map schema) {
      Map media() => {'schema': schema, 'examples': {'Wire': {r'$ref': reference}}};
      return {
        'openapi': version, 'info': {'title': title, 'version': '1'},
        'servers': [{'url': 'http://127.0.0.1:${server.port}'}],
        'paths': {'/echo': {'post': {
          'requestBody': {'required': true, 'content': {type: media()}},
          'responses': {'200': {'description': 'Reply', 'content': {type: media()}}},
        }}}, 'components': {'examples': {}},
      };
    }
    final first = api('3.1.2', 'First', 'application/json', {'type': 'integer', 'enum': [0]});
    final second = api('3.2.1', 'Second', 'text/plain', {'type': 'string', 'enum': ['0']});
    (first['components'] as Map)['examples']['Bridge'] = {r'$ref': 'b.yaml#/components/examples/Bridge'};
    (second['components'] as Map)['examples']['Bridge'] = {'value': 'bridge'};
    (first['components'] as Map)['schemas'] = {'Data': {r'$ref': reference}};
    const example = {'externalValue': './payload.bin', 'description': '[Guide](./help.md)'};
    first['x-history'] = example;second['x-history'] = example;
    final files = [File('${directory.path}/a.json'), File('${directory.path}/b.yaml'), File('${directory.path}/defs/shared.yaml')];
    for (final (index, value) in [first, second, {'Example': example}].indexed) {
      await files[index].writeAsString('${index == 0 ? '' : '# retained 雪\r\n'}${jsonEncode(value)}\r\n');
    }
    final payload = File('${directory.path}/defs/payload.bin');await payload.writeAsBytes([48]);
    await File('${directory.path}/busyapi.yaml').writeAsString('version: 1\nroots: [{name: first, path: a.json}, {name: second, path: b.yaml}]\n');
    final originals = [for (final file in files) await file.readAsBytes()];
    Future<void> exercise(BusyProject project, String root, String mediaType, String bodyFile, {bool data = false}) async {
      expect((await project.check(root))['status'], 'complete');
      final prepared = await project.prepareRequest(root, resource: root, pointer: '/paths/~1echo/post');
      try {
        final media = ((prepared.result['requestBody'] as Map)['content'] as List).single as Map;
        expect(media['mediaType'], mediaType);
        expect((media['examples'] as List).single['wireBase64'], 'MA==');
        final response = await const ContractRequestExecutor().execute(prepared,
          OperationRequestDraft(planIdentity: prepared.identity, body: RequestBodyDraft.binaryFile(mediaType: mediaType, file: bodyFile)),
          resolveSecret: (_) async => null);
        try {
          expect(response.conforming, true, reason: '${response.outgoing.findings} ${response.received.findings}');
          expect(await response.response.bytes(), [48]);
          expect(observed.last.$1, mediaType);expect(observed.last.$2, [48]);
        } finally { await response.close(); }
      } finally { prepared.close(); }
      final document = await project.inspectObject(root, root, '');
      final literal = (document['entries'] as List).cast<Map>().singleWhere((entry) => entry['name'] == 'x-history');
      expect(jsonDecode(await project.readDataValue(Map<String, dynamic>.from(literal))), example);
      if (data) {
        var resource = root, pointer = '/components/schemas/Data';
        for (var count = 0; count < 64; count++) {
          final page = await project.inspectObject(root, resource, pointer, contextKind: 'schema');
          final reference = (page['references'] as List).cast<Map>().where((value) => value['keyword'] == r'$ref').firstOrNull;
          if (reference == null) { expect(page['value']['externalValue'], './payload.bin');return; }
          resource = reference['targetResource'] as String;pointer = reference['targetPointer'] as String;
        }
        fail('The Schema data owner forwarding must remain finite');
      }
    }
    final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
    await exercise(source, files[0].uri.toString(), 'application/json', payload.path, data: true);
    await exercise(source, files[1].uri.toString(), 'text/plain', payload.path);
    final review = await source.prepareMigration(files.first.uri.toString(), '${directory.path}/output', targetVersion: '3.2.1');
    addTearDown(review.close);expect(review.publishable, true, reason: '${review.result}');
    expect(review.exampleCopies, hasLength(1));await review.publish();
    expect([for (final file in files) await file.readAsBytes()], originals);expect(await payload.readAsBytes(), [48]);
    source.close();final relocated = await Directory(review.destination).rename('${directory.path}/cold');
    for (final file in files) await file.delete();await payload.delete();
    final cold = await BusyProject.open(relocated.path, engine);addTearDown(cold.close);
    final bodyFile = '${relocated.path}/${review.exampleCopies.single.path}';expect(await File(bodyFile).readAsBytes(), [48]);
    for (final (index, mediaType) in ['application/json', 'text/plain'].indexed) {
      final change = review.changes.singleWhere((change) => change.resource == files[index].uri.toString());
      final root = File('${relocated.path}/${Uri.parse(change.destination).pathSegments.last}').uri.toString();
      await exercise(cold, root, mediaType, bodyFile, data: index == 0);
    }
    final cli = await Process.run('$testBundle/busyapi', ['check', relocated.path, '--json'], environment: const {'PATH': '', 'LANG': 'C.UTF-8'}, includeParentEnvironment: false);
    expect(cli.exitCode, 0, reason: '${cli.stdout} ${cli.stderr}');
  });
}
