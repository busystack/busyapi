import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final format in ['yaml', 'json']) {
    test('$format independent schema uses retain captured data through review and cold publication', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-schema-uses-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final file = File('${directory.path}/api.$format');
      final model = {
        'default': {'type': 'integer', 'minimum': 'EXACT'},
        'dependentRequired': {'required': ['value']},
      };
      final original = format == 'yaml'
          ? '# Preserve data\r\nopenapi: 3.2.1\r\n'
              'info: {title: Original, version: business}\r\npaths: {}\r\n'
              'components:\r\n  schemas:\r\n    Model:\r\n'
              '      default: &data {type: integer, minimum: 9007199254740993.00}\r\n'
              '      dependentRequired: {required: [value]}\r\n'
              '    Value: {\$ref: "#/components/schemas/Model/default"}\r\n'
              '    Dictionary: {\$ref: "#/components/schemas/Model/dependentRequired"}\r\n'
              'x-literal: *data\r\n'
          : jsonEncode({
              'openapi': '3.2.1', 'info': {'title': 'Original', 'version': 'business'},
              'paths': <String, Object?>{},
              'components': {'schemas': {
                'Model': model,
                'Value': {r'$ref': '#/components/schemas/Model/default'},
                'Dictionary': {r'$ref': '#/components/schemas/Model/dependentRequired'},
              }},
            }).replaceAll('"EXACT"', '9007199254740993.00');
      await file.writeAsString(original);
      final project = await BusyProject.open(file.path, engine);
      addTearDown(project.close);
      final root = file.uri.toString();
      project.store.replace(root, original.replaceFirst('Original', 'Captured 雪'));
      final destination = '${directory.path}/converted';
      Future<MigrationOutput> prepare() => project.prepareMigration(root, destination, targetVersion: '3.0.4');
      final review = await prepare();
      addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');
      expect(review.unsaved, true);
      expect(review.result['producerVersion'], '41');
      await expectLater(review.publish(cancelled: () => true),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
      expect(await Directory(destination).exists(), false);
      project.store.replace(root, (await project.buffer(root)).text.replaceFirst('Captured', 'Current'));
      await expectLater(review.publish(),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
      final fresh = await prepare();
      addTearDown(fresh.close);
      expect(fresh.publishable, true, reason: '${fresh.result}');
      await fresh.publish();
      final output = await BusyProject.open(destination, engine);
      addTearDown(output.close);
      final outputRoot = output.roots.single.id;
      final checked = await output.check(outputRoot);
      expect(checked['status'], 'complete', reason: '$checked');
      final references = (checked['projection'] as Map)['references'] as List;
      for (final name in ['Value', 'Dictionary']) {
        final reference = references.singleWhere((reference) => reference['pointer'] == '/components/schemas/$name/\$ref');
        expect(reference['resolution'], 'resolved');
        expect(reference['targetPointer'], startsWith('/_migrated_schema_use_'));
      }
      final inspected = await output.inspectObject(outputRoot, outputRoot, '/components/schemas/Model');
      final data = await output.readDataValue(inspected);
      expect(data, contains('9007199254740993.00'));
      expect((jsonDecode(data) as Map)['default']['type'], 'integer');
      expect((jsonDecode(data) as Map).containsKey('dependentRequired'), false);
      expect(await file.readAsString(), original);
      expect((await project.buffer(root)).dirty, true);
    });
  }
}
