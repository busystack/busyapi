import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';
import 'migration_mixed_holder_fixture.dart';

void main() {
  mixedLegacySchemaUses();
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
      expect(review.result['producerVersion'], '103');
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
    test('$format inherited dynamic anchors publish with their original resource and literal values', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-dynamic-uses-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final file = File('${directory.path}/api.$format');
      final original = format == 'yaml'
          ? 'openapi: 3.1.2\ninfo: {title: Original, version: business}\npaths: {}\n'
              'components:\n  schemas:\n    Model:\n      \$id: https://schemas.invalid/model\n'
              '      type: object\n      default:\n        \$dynamicAnchor: node\n        type: object\n'
              '        properties:\n          n: {enum: [9007199254740993.00]}\n'
              '          next: {\$dynamicRef: "#node"}\n'
              '    Value: {\$ref: "#/components/schemas/Model/default"}\n'
          : jsonEncode({
              'openapi': '3.1.2', 'info': {'title': 'Original', 'version': 'business'},
              'paths': <String, Object?>{}, 'components': {'schemas': {
                'Model': {r'$id': 'https://schemas.invalid/model', 'type': 'object', 'default': {
                  r'$dynamicAnchor': 'node', 'type': 'object', 'properties': {
                    'n': {'enum': ['EXACT']}, 'next': {r'$dynamicRef': '#node'},
                  },
                }},
                'Value': {r'$ref': '#/components/schemas/Model/default'},
              }},
            }).replaceAll('"EXACT"', '9007199254740993.00');
      await file.writeAsString(original);
      final project = await BusyProject.open(file.path, engine);
      addTearDown(project.close);
      final root = file.uri.toString();
      project.store.replace(root, original.replaceFirst('Original', 'Captured'));
      final destination = '${directory.path}/converted';
      final review = await project.prepareMigration(root, destination, targetVersion: '3.2.1');
      addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');
      expect(review.unsaved, true);
      await review.publish();
      final output = await BusyProject.open(destination, engine);
      addTearDown(output.close);
      final outputRoot = output.roots.single.id;
      final checked = await output.check(outputRoot);
      expect(checked['status'], 'complete', reason: '$checked');
      final references = (checked['projection'] as Map)['references'] as List;
      final reference = references.singleWhere((reference) => reference['pointer'] == '/components/schemas/Value/\$ref');
      expect(reference['resolution'], 'resolved');
      expect(reference['targetPointer'], startsWith('/components/schemas/Model/\$defs/'));
      final inspected = await output.inspectObject(outputRoot, outputRoot, '/components/schemas/Model');
      final text = await output.readDataValue(inspected), model = jsonDecode(text) as Map;
      expect(model[r'$id'], 'https://schemas.invalid/model');
      expect((model['default'] as Map)['properties']['next'][r'$dynamicRef'], '#node');
      expect(text, contains('9007199254740993.00'));
      expect(await file.readAsString(), original);
    });
  }
}

void mixedLegacySchemaUses() {
  for (final (restrictedVersion, target) in [('2.0', '3.2.1'), ('2.0', '2.0'), ('3.0.4', '3.2.1'), ('3.0.4', '3.0.4')]) {
    test('mixed $restrictedVersion holders retain recursive identified schemas, literal aliases and exact values for $target', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-mixed-legacy-schemas-');addTearDown(() => directory.delete(recursive: true));
      final originals = mixedLegacyHolderDocuments('https://api.invalid', restrictedVersion: restrictedVersion,
        overlappingContainers: target == '3.2.1');
      for (final entry in originals.entries) {
        final file = File('${directory.path}/${entry.key}');await file.parent.create(recursive: true);await file.writeAsString(entry.value);
      }
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);addTearDown(engine.close);
      final source = await BusyProject.open(directory.path, engine);addTearDown(source.close);
      final legacy = File('${directory.path}/legacy/api.yaml').uri.toString(), modern = File('${directory.path}/modern/api.yaml').uri.toString();
      Future<void> inspect(BusyProject project, String root, String pointer) async {
        final plan = await project.prepareRequest(root, resource: root, pointer: '/paths/~1value/get');
        try {
          final result = await plan.evaluateRuntime([
            for (final text in ['[]', '[[]]', '[[[]]]', '[0]', 'null']) RuntimeSchemaInstance(
              subject: 'response-body', location: 'recursive', text: text, schemaResource: root, schemaPointer: pointer),
            for (final text in ['9007199254740993.00', '9007199254740992', 'null']) RuntimeSchemaInstance(
              subject: 'response-body', location: 'exact', text: text, schemaResource: root,
              schemaPointer: pointer.startsWith('/definitions') ? '/definitions/Model' : '/components/schemas/Model'),
          ]);
          expect(result['complete'], true, reason: '$result');
          expect((result['runtimeEvaluations'] as List).map((value) => value['valid']), [true, true, true, false, false, true, false, false]);
        } finally { plan.close(); }
      }
      await inspect(source, modern, '/components/schemas/Node');
      final review = await source.prepareMigration(legacy, '${directory.path}/output', targetVersion: target);addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');await review.publish();
      final modernPath = Uri.parse(review.changes.singleWhere((change) => change.resource == modern).destination).pathSegments.last;
      final shared = File('${directory.path}/models/shared.yaml').uri.toString();
      final sharedCopy = review.changes.singleWhere((change) => change.resource == shared).destination;
      expect(await File.fromUri(Uri.parse(sharedCopy)).readAsString(), originals['models/shared.yaml']);
      source.close();final moved = await Directory(review.destination).rename('${directory.path}/cold');
      for (final path in originals.keys) await File('${directory.path}/$path').delete();
      final cold = await BusyProject.open(moved.path, engine);addTearDown(cold.close);
      final root = File('${moved.path}/$modernPath').uri.toString();
      expect((await cold.check(root))['status'], 'complete');
      await inspect(cold, root, target == '2.0' ? '/definitions/Node' : '/components/schemas/Node');
    });
  }
}
