import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final (version, target) in [('3.0.4', '3.2.1'), ('3.1.2', '3.0.4')]) {
    test('$version aliased schema capture migrates to $target without publishing stale data', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-alias-migration-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final root = File('${directory.path}/api.yaml');
      final models = File('${directory.path}/models.yaml');
      final original = 'openapi: "$version"\r\ninfo: {title: Aliases, version: "business"}\r\npaths: {}\r\n'
          'components: {schemas: {Value: {\$ref: "models.yaml#/Model"}, Alias: {\$ref: "models.yaml#/Alias"}}}\r\n';
      final source = '# Keep model comments\r\nModel: &model\r\n  type: object\r\n'
          '${version == '3.0.4' ? '  nullable: true\r\n' : ''}'
          '  required: [id]\r\n  properties:\r\n    id: &field {type: integer, enum: [9007199254740993.00]}\r\n'
          'Alias: *model # keep semantic use\r\nx-literal: *model # keep literal use\r\nx-field: *field\r\n';
      await root.writeAsString(original);
      await models.writeAsString(source);
      final project = await BusyProject.open(root.path, engine);
      addTearDown(project.close);
      final working = source.replaceAll('9007199254740993.00', '9007199254740995.00');
      final buffer = await project.buffer(models.uri.toString());
      project.store.replace(buffer.id, working);
      final destination = '${directory.path}/converted';
      Future<MigrationOutput> prepare() => project.prepareMigration(root.uri.toString(), destination, targetVersion: target);
      final review = await prepare();
      addTearDown(review.close);
      expect(review.publishable, true, reason: '${review.result}');
      expect(review.unsaved, true);
      if (version == '3.0.4') {
        expect((review.result['presentationChanges'] as List).whereType<Map>().any(
            (change) => change['resource'] == models.uri.toString() && change['pointer'] == '/x-literal'), true);
      }
      await expectLater(review.publish(cancelled: () => true),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
      expect(await Directory(destination).exists(), false);
      project.store.replace(buffer.id, '$working# changed after review\r\n');
      await expectLater(review.publish(),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'migration.stale')));
      expect(await Directory(destination).exists(), false);
      final fresh = await prepare();
      addTearDown(fresh.close);
      expect(fresh.publishable, true, reason: '${fresh.result}');
      await fresh.publish();
      final output = await BusyProject.open(destination, engine);
      addTearDown(output.close);
      final checked = await output.check(output.roots.single.id);
      expect(checked['status'], 'complete', reason: '$checked');
      expect(checked['projection']['specification']['declaredVersion'], target);
      final changed = fresh.changes.singleWhere((change) => change.resource == models.uri.toString());
      expect(changed.after, contains('9007199254740995.00'));
      expect(changed.after, contains('# keep literal use'));
      final references = (checked['projection'] as Map)['references'] as List;
      final model = references.firstWhere((reference) => reference['targetPointer'] == '/Model');
      final document = await output.inspectObject(output.roots.single.id, model['targetResource'] as String, '');
      final literalTarget = (document['entries'] as List).singleWhere((entry) => entry['name'] == 'x-literal') as Map;
      final literal = await output.referencePage(output.roots.single.id,
          literalTarget['resource'] as String, literalTarget['pointer'] as String, data: true);
      expect((literal['entries'] as List).any((entry) => entry['name'] == 'nullable'), version == '3.0.4');
      final required = await output.referencePage(output.roots.single.id,
          literalTarget['resource'] as String, '/x-literal/required', data: true);
      expect((required['entries'] as List).map((entry) => entry['text']), ['id']);
      final exact = await output.referencePage(output.roots.single.id,
          literalTarget['resource'] as String, '/x-literal/properties/id/enum', data: true);
      expect((exact['entries'] as List).single['text'], '9007199254740995.00');
      expect(await root.readAsString(), original);expect(await models.readAsString(), source);
      expect(buffer.dirty, true);
    });
  }
}
