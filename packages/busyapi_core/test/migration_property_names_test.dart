import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['3.1.2', '3.2.1']) {
    for (final target in ['2.0', '3.0.4']) {
      for (final format in ['yaml', 'json']) {
        test('$version to $target $format property names survive reviewed publication and cold checks', () async {
          final directory = await Directory.systemTemp.createTemp('busyapi-name-migration-');
          addTearDown(() => directory.delete(recursive: true));
          final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
          addTearDown(engine.close);
          final file = File('${directory.path}/api.$format');
          final value = {
            'openapi': version, 'info': {'title': 'Original', 'version': 'business'},
            'paths': {'/p': {'get': {'responses': {'200': {'description': 'Names',
              'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Model'}}},
            }}}}},
            'components': {'schemas': {
              'Model': {'propertyNames': {'enum': ['a/~雪', '__proto__']},
                'properties': {'a/~雪': {'type': 'integer', 'minimum': 'EXACT'}},
                'additionalProperties': {'type': 'integer'}},
              'Names': {r'$ref': '#/components/schemas/Model/propertyNames'},
            }},
            'x-literal': {'propertyNames': {'enum': ['a/~雪', '__proto__']}, 'n': 'EXACT'},
          };
          final original = '${format == 'yaml' ? '# Preserve name data\r\n' : ''}${jsonEncode(value)}\r\n'
              .replaceAll('"EXACT"', '9007199254740993.00');
          await file.writeAsString(original);
          final project = await BusyProject.open(file.path, engine);
          addTearDown(project.close);
          final root = file.uri.toString(), buffer = await project.buffer(root);
          project.store.replace(root, original.replaceFirst('Original', 'Unsaved 雪'));
          final samples = ['{}', '{"a/~雪":9007199254740993}', '{"a/~雪":9007199254740992}',
            '{"__proto__":0}', '{"other":0}', 'null', '0'];
          Future<List<bool>> outcomes(BusyProject owner, String id, String container) async {
            final plan = await owner.prepareRequest(id, resource: id, pointer: '/paths/~1p/get');
            try {
              final result = await plan.evaluateRuntime([
                for (final text in samples) RuntimeSchemaInstance(
                  subject: 'response-body', location: 'body', text: text,
                  schemaResource: id, schemaPointer: '$container/Model',
                ),
              ]);
              expect(result['complete'], true, reason: '$result');
              return (result['runtimeEvaluations'] as List).cast<Map>()
                  .map((proof) => proof['valid'] as bool).toList();
            } finally {
              plan.close();
            }
          }
          final before = await outcomes(project, root, '/components/schemas');
          final destination = '${directory.path}/converted';
          final review = await project.prepareMigration(root, destination, targetVersion: target);
          addTearDown(review.close);
          expect(review.publishable, true, reason: '${review.result}');
          expect(review.unsaved, true);
          await expectLater(review.publish(cancelled: () => true), throwsA(
            isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled'),
          ));
          expect(await Directory(destination).exists(), false);
          await review.publish();
          final output = await BusyProject.open(destination, engine);
          addTearDown(output.close);
          final outputRoot = output.roots.single.id;
          expect((await output.check(outputRoot))['status'], 'complete');
          expect(await outcomes(output, outputRoot, target == '2.0' ? '/definitions' : '/components/schemas'), before);
          final document = await output.inspectObject(outputRoot, outputRoot, '');
          final literal = Map<String, dynamic>.from((document['entries'] as List)
              .cast<Map>().singleWhere((entry) => entry['name'] == 'x-literal'));
          final raw = await output.readDataValue(literal);
          expect(jsonDecode(raw)['propertyNames']['enum'], ['a/~雪', '__proto__']);
          expect(raw, contains('9007199254740993.00'));
          expect(await file.readAsString(), original);
          expect(buffer.dirty, true);
        });
      }
    }
  }
}
