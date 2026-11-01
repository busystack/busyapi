import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final target in ['3.1.0', '3.1.1', '3.1.2', '3.2.0', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('unsaved Swagger tuple reaches $target $format and publishes independently', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-direct-tuple-');
        addTearDown(() => directory.delete(recursive: true));
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final file = File('${directory.path}/api.$format');
        final original = format == 'yaml'
            ? 'swagger: "2.0"\r\ninfo: {title: Original, version: business}\r\n'
                'paths: {}\r\ndefinitions:\r\n  Tuple:\r\n    type: array\r\n'
                '    items: [{type: integer, minimum: 9007199254740993.00, exclusiveMinimum: true}, {type: string}]\r\n'
                'x-kept: {n: 9007199254740993.00, flag: false}\r\n'
            : '${jsonEncode({
                'swagger': '2.0', 'info': {'title': 'Original', 'version': 'business'},
                'paths': <String, Object?>{}, 'definitions': {'Tuple': {'type': 'array', 'items': [
                  {'type': 'integer', 'minimum': 'EXACT', 'exclusiveMinimum': true}, {'type': 'string'},
                ]}}, 'x-kept': {'n': 'EXACT', 'flag': false},
              })}\r\n'.replaceAll('"EXACT"', '9007199254740993.00');
        await file.writeAsString(original);
        final project = await BusyProject.open(file.path, engine);
        addTearDown(project.close);
        final root = file.uri.toString(), buffer = await project.buffer(file.uri.toString());
        project.store.replace(root, original.replaceFirst('Original', 'Unsaved 雪'));
        final destination = '${directory.path}/converted';
        Future<MigrationOutput> prepare() => project.prepareMigration(root, destination, targetVersion: target);
        final review = await prepare();
        addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');
        expect(review.unsaved, true);
        expect((review.result['stages'] as List).whereType<Map>().any(
            (stage) => stage['from'] == '2.0' && stage['to'] == '3.0'), false);
        await expectLater(review.publish(cancelled: () => true),
            throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
        expect(await Directory(destination).exists(), false);
        project.store.replace(root, buffer.text.replaceFirst('Unsaved 雪', 'Captured 雪'));
        await expectLater(review.publish(),
            throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
        expect(await Directory(destination).exists(), false);
        final fresh = await prepare();
        addTearDown(fresh.close);
        expect(fresh.publishable, true, reason: '${fresh.result}');
        await fresh.publish();
        final output = await BusyProject.open(destination, engine);
        addTearDown(output.close);
        final outputRoot = output.roots.single.id, checked = await output.check(output.roots.single.id);
        expect(checked['status'], 'complete', reason: '$checked');
        expect(checked['projection']['specification']['declaredVersion'], target);
        final object = await output.inspectObject(outputRoot, outputRoot, '/components/schemas/Tuple');
        final raw = await output.readDataValue(object), value = jsonDecode(raw) as Map;
        expect(value.containsKey('items'), false);
        expect(value['prefixItems'], hasLength(2));
        expect(raw, contains('9007199254740993.00'));
        expect((await output.buffer(outputRoot)).text, contains('Captured 雪'));
        expect(await file.readAsString(), original);
        expect(buffer.dirty, true);
      });
    }
  }
}
