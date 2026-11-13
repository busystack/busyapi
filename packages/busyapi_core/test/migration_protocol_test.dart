import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

class _ProtocolEngine extends EngineProcess {
  _ProtocolEngine() : super(executable: runtimeNode, helper: runtimeHelper);
  String? revision;

  @override
  Future<Map<String, dynamic>> request(
    String method,
    Map<String, Object?> params, {
    String? requestId,
  }) async {
    final result = await super.request(method, params, requestId: requestId);
    if (method != 'planMigration') return result;
    expect(result['producerVersion'], '107');
    return revision == null ? result : {...result, 'producerVersion': revision};
  }
}

void main() {
  test('shipped conversion protocol accepts 107 and rejects stale producers', () async {
    final directory = await Directory.systemTemp.createTemp('busyapi-protocol-');
    addTearDown(() => directory.delete(recursive: true));
    final source = File('${directory.path}/api.yaml');
    await source.writeAsString('openapi: 3.1.2\ninfo: {title: Protocol, version: business}\npaths: {}\n');
    final engine = _ProtocolEngine();
    addTearDown(engine.close);
    final project = await BusyProject.open(source.path, engine);
    addTearDown(project.close);
    for (final revision in ['30', '91', '104', '105', '106']) {
      engine.revision = revision;
      await expectLater(
        project.prepareMigration(source.uri.toString(), '${directory.path}/out', targetVersion: '3.2.0'),
        throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.protocol')),
      );
      expect(Directory('${directory.path}/out').existsSync(), false);
    }
    engine.revision = null;
    final review = await project.prepareMigration(source.uri.toString(), '${directory.path}/out', targetVersion: '3.2.0');
    addTearDown(review.close);
    expect(review.publishable, true, reason: '${review.result}');
  });
}
