import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

// Prepared application-consumer journeys. Execution remains subject to the
// release hold; these do not replace graphical or packaged acceptance.
void main() {
  for (final fixture in ['swagger20', 'openapi30', 'openapi31', 'openapi32']) {
    test('$fixture existing inventory contract authoring and maintenance journey', () async {
      final temp = await Directory.systemTemp.createTemp('busyapi-application-');
      addTearDown(() => temp.delete(recursive: true));
      final source = '$repositoryRoot/fixtures/native_application/$fixture';
      for (final name in ['api.json', 'models.json']) {
        await File('$source/$name').copy('${temp.path}/$name');
      }
      final file = File('${temp.path}/api.json');
      final modelFile = File('${temp.path}/models.json');
      final original = await file.readAsString();
      final originalModel = await modelFile.readAsString();
      final declaration = fixture == 'swagger20' ? 'swagger' : 'openapi';
      final version = jsonDecode(original)[declaration];
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      var project = await BusyProject.open(file.path, engine);
      addTearDown(() => project.close());
      final root = file.uri.toString(), model = modelFile.uri.toString();
      final buffer = await project.buffer(root);
      expect((await project.check(root))['status'], 'complete');
      await project.save(buffer);
      expect(await file.readAsString(), original);
      final reference = await project.referencePage(root, root, '/paths/~1orders/post');
      expect(reference['family'], fixture == 'swagger20' ? '2.0' : (version as String).substring(0, 3));

      // The same inspect/propose API supplies Design's captured fields/edits.
      const pointer = '/paths/~1orders/post';
      final operation = await project.inspectObject(root, root, pointer);
      final range = List<int>.from(operation['range'] as List);
      await project.proposeAndApply(
        root,
        PropertySession(root: root, buffer: root, generation: buffer.generation,
          pointer: pointer, range: range,
          expected: buffer.text.substring(range[0], range[1])),
        [{'kind': 'set', 'pointer': '$pointer/summary', 'value': 'Create warehouse order'}],
      );
      expect(buffer.text, original.replaceFirst('Create a stock order', 'Create warehouse order'));
      final authored = buffer.text;
      project.store.undo();
      expect(buffer.text, original);
      project.store.redo();
      expect(buffer.text, authored);

      // Source assistance selects a boolean through the external schema's own
      // captured occurrence, rather than inferring its family from a filename.
      final modelBuffer = await project.buffer(model);
      final caret = modelBuffer.text.indexOf('false') + 2;
      modelBuffer.selection = SourceSelection(caret, caret);
      final assistance = await project.assistSource(root, model, modelBuffer.selection);
      final choice = assistance.completions.indexWhere((c) => c['label'] == 'true');
      expect(choice, greaterThanOrEqualTo(0));
      project.store.apply([assistance.completion(choice, modelBuffer)], label: 'Source schema completion');
      expect(modelBuffer.text, originalModel.replaceFirst('false', 'true'));

      final component = fixture == 'swagger20' ? '/definitions/Item' : '/components/schemas/Item';
      final rename = await project.planComponentRename({
        'resource': root, 'generation': buffer.generation, 'pointer': component,
      }, 'Stock');
      await project.applyRefactoring(rename);
      expect(buffer.text, contains(component.replaceFirst('/Item', '/Stock')));
      expect(buffer.text, isNot(contains('"$component"')));
      expect(buffer.text, contains('literal payload reference'));
      expect(buffer.text, contains('9007199254740993'));
      expect((await project.check(root))['status'], 'complete');
      expect(await file.readAsString(), original);
      expect(await modelFile.readAsString(), originalModel);

      final docs = await project.prepareDocumentation(root, '${temp.path}/docs');
      addTearDown(docs.close);
      await docs.publish();
      final html = await File('${docs.destination}/index.html').readAsString();
      expect(html, contains('Create warehouse order'));
      expect(html, contains('Warehouse inventory'));
      expect(html, contains('Stock'));
      for (final item in [buffer, modelBuffer]) {
        await project.save(item);
      }
      final saved = buffer.text, savedModel = modelBuffer.text;
      project.close();
      project = await BusyProject.open(file.path, engine);
      expect((await project.buffer(root)).text, saved);
      expect((await project.buffer(model)).text, savedModel);
      final data = jsonDecode(saved) as Map;
      expect(data[declaration], version);
      expect(data['info']['version'], '2026-11-inventory');
      expect(saved, contains('"exact": 9007199254740993'));
      expect((await project.check(root))['status'], 'complete');
      final cli = await Process.run('$testBundle/busyapi', ['check', file.path, '--json']);
      expect(cli.exitCode, 0, reason: '${cli.stdout}\n${cli.stderr}');

      // Invalid Source remains editable and receives native diagnostics;
      // undo restores the exact saved source without touching disk.
      final reopened = await project.buffer(root);
      final invalid = saved.replaceFirst('"type": "apiKey"', '"type": "invalid-security-type"');
      expect(invalid, isNot(saved));
      project.store.replace(root, invalid);
      expect((await project.check(root))['status'], 'invalid');
      project.store.undo();
      expect(reopened.text, saved);
      expect(await file.readAsString(), saved);
    });
  }
}
