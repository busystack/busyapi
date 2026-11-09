import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

String _document(String version, String format, Map<String, Object?> schemas) {
  final value = <String, Object?>{
    if (version == '2.0') 'swagger': version else 'openapi': version,
    'info': {'title': 'Original 雪', 'version': 'business'},
    'paths': <String, Object?>{},
    if (version == '2.0') 'definitions': schemas
        else 'components': {'schemas': schemas},
  };
  return '\ufeff${format == 'yaml' ? '# Keep source\r\n' : ''}${jsonEncode(value).replaceAll('"EXACT"', '9007199254740993.00')}\r\n';
}

void main() {
  for (final version in ['3.1.2', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('$version $format conflicting Markdown roles specialize across roots in one file transaction', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-markdown-role-move-');
        addTearDown(() => directory.delete(recursive: true));
        final source = File('${directory.path}/source/api.$format'), other = File('${directory.path}/other/api.$format'), destination = File('${directory.path}/target/api.$format');
        for (final file in [source, other, destination]) await file.parent.create(recursive: true);
        const pointer = '/components/schemas/Owner/properties/Reply', at = '/paths/~1value/get/responses/200';
        Map<String, Object?> api(Object response, {bool schema = false}) => {
          'openapi': version, 'info': {'title': 'Original', 'version': '1'},
          'paths': {'/value': {'get': {'responses': {'200': response}}}},
          if (schema) 'components': {'schemas': {'Owner': {r'$id': 'https://schema.invalid/unrelated/base',
            'properties': {'Reply': {'description': '[Guide](guide.md) ![image](image.svg) `[code](code.md)`', 'x-number': 'EXACT'}}}}},
        };
        String encode(Object value) => '${format == 'yaml' ? '# Keep source\r\n' : ''}${jsonEncode(value).replaceAll('"EXACT"', '9007199254740993.00')}\r\n';
        // x-number belongs only to the schema annotation; the native Response
        // Object sees its extension value and retains it through specialization.
        await source.writeAsString(encode(api({r'$ref': '#$pointer'}, schema: true)));
        await other.writeAsString(encode(api({r'$ref': '../source/api.$format#$pointer'})));
        await File('${directory.path}/busyapi.yaml').writeAsString('version: 1\nroots: [{name: Source, path: source/api.$format}, {name: Other, path: other/api.$format}]\n');
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final project = await BusyProject.open(directory.path, engine);
        addTearDown(project.close);
        final buffer = await project.buffer(source.uri.toString()), consumer = await project.buffer(other.uri.toString());
        final stale = await project.planFileMove(buffer.id, destination.path);
        project.store.replace(consumer.id, consumer.text.replaceFirst('Original', 'Unsaved'));
        final before = buffer.bytes(), otherBefore = consumer.bytes();
        await expectLater(project.applyRefactoring(stale), throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'refactor.stale')));
        final plan = await project.planFileMove(buffer.id, destination.path);
        expect(plan.result['sourceOwnership'], hasLength(2));expect(plan.checkedRoots, hasLength(2));
        await expectLater(project.applyRefactoring(plan, current: () => false), throwsA(isA<CoreFailure>()));
        expect(buffer.bytes(), before);expect(consumer.bytes(), otherBefore);
        await project.applyRefactoring(plan);
        final accepted = buffer.bytes(), otherAccepted = consumer.bytes();
        final expected = '[Guide](<${source.uri.resolve('guide.md')}>) ![image](<${source.uri.resolve('image.svg')}>) `[code](code.md)`';
        for (final id in [buffer.id, consumer.id]) expect((await project.inspectObject(id, id, at))['value']['description'], expected);
        expect((await project.inspectObject(buffer.id, buffer.id, pointer))['value']['description'], '[Guide](guide.md) ![image](image.svg) `[code](code.md)`');
        expect(buffer.text, contains('9007199254740993.00'));
        project.store.undo();expect(buffer.bytes(), before);expect(consumer.bytes(), otherBefore);expect(buffer.id, source.uri.toString());
        project.store.redo();expect(buffer.bytes(), accepted);expect(consumer.bytes(), otherAccepted);
        final publication = PublicationStore('${directory.path}/state');
        final failed = await publication.save(project, project.store.buffers.values, beforePublish: (path) async {
          if (path == destination.path) throw StateError('Injected ownership publication failure');
        });
        expect(failed.complete, false);expect(destination.existsSync(), false);expect(source.existsSync(), true);
        expect(buffer.bytes(), accepted);expect(consumer.bytes(), otherAccepted);
        expect((await publication.save(project, project.store.buffers.values)).complete, true);
        final reopened = await BusyProject.open(directory.path, engine);
        addTearDown(reopened.close);
        expect((await reopened.buffer(destination.uri.toString())).bytes(), accepted);
        expect((await reopened.buffer(consumer.id)).bytes(), otherAccepted);
        for (final root in reopened.roots) expect((await reopened.check(root.id))['complete'], true);
      });
    }
  }
  for (final version in ['2.0', '3.0.4', '3.1.2', '3.2.1']) {
    test('$version shared YAML Markdown file review preserves independent aliases and publication history', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-shared-markdown-');
      addTearDown(() => directory.delete(recursive: true));
      final source = File('${directory.path}/source/api.yaml'), destination = File('${directory.path}/target/api.yaml');
      await source.parent.create(recursive: true);
      await destination.parent.create(recursive: true);
      final declaration = version == '2.0' ? 'swagger: "2.0"' : 'openapi: $version';
      final original = '\ufeff# Keep source\r\n$declaration\r\n'
          'x-info: &info {title: Original, version: "1", description: "[Guide](guide.md) ![image](image.svg) `[code](code.md)`", x-number: 9007199254740993.00, x-bytes: "AAECA/7/AA=="}\r\n'
          'info: *info\r\npaths: {}\r\nx-history: *info\r\n';
      await source.writeAsString(original);
      await File('${directory.path}/busyapi.yaml').writeAsString('version: 1\nroots: [{name: API, path: source/api.yaml}]\n');
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      final project = await BusyProject.open(directory.path, engine);
      addTearDown(project.close);
      final buffer = await project.buffer(source.uri.toString());
      final stale = await project.planFileMove(buffer.id, destination.path);
      project.store.replace(buffer.id, buffer.text.replaceFirst('Original', 'Unsaved'));
      final working = buffer.bytes();
      await expectLater(project.applyRefactoring(stale), throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'refactor.stale')));
      final plan = await project.planFileMove(buffer.id, destination.path);
      await expectLater(project.applyRefactoring(plan, current: () => false), throwsA(isA<CoreFailure>()));
      expect(buffer.bytes(), working);
      await project.applyRefactoring(plan);
      final accepted = buffer.bytes();
      final info = await project.inspectObject(buffer.id, buffer.id, '/info');
      expect(info['value']['description'], '[Guide](<${source.uri.resolve('guide.md')}>) ![image](<${source.uri.resolve('image.svg')}>) `[code](code.md)`');
      expect(buffer.text, contains('x-history: *info'));
      expect(buffer.text, contains('9007199254740993.00'));
      expect(buffer.text, contains('AAECA/7/AA=='));
      expect(buffer.hasBom, true);
      project.store.undo();expect(buffer.bytes(), working);expect(buffer.id, source.uri.toString());
      project.store.redo();expect(buffer.bytes(), accepted);expect(buffer.id, destination.uri.toString());
      final publication = PublicationStore('${directory.path}/state');
      final failed = await publication.save(project, [buffer], beforePublish: (path) async {
        if (path == destination.path) throw StateError('Injected shared Markdown publication failure');
      });
      expect(failed.complete, false);expect(buffer.bytes(), accepted);
      expect(destination.existsSync(), false);expect(source.readAsStringSync(), original);
      expect((await publication.save(project, [buffer])).complete, true);
      final reopened = await BusyProject.open(directory.path, engine);
      addTearDown(reopened.close);
      final fresh = await reopened.buffer(destination.uri.toString());
      expect(fresh.bytes(), accepted);
      expect((await reopened.check(fresh.id))['complete'], true);
      expect((await reopened.inspectObject(fresh.id, fresh.id, '/info'))['value']['description'], info['value']['description']);
    });
  }
  for (final version in ['2.0', '3.0.4', '3.1.2', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('$version $format inline Markdown mapping keeps originals, stale review and one-step history', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-inline-markdown-');
        addTearDown(() => directory.delete(recursive: true));
        await Directory('${directory.path}/source').create();
        await Directory('${directory.path}/target').create();
        final source = File('${directory.path}/source/api.$format');
        final destination = File('${directory.path}/target/api.$format');
        final group = version == '2.0' ? '/definitions' : '/components/schemas';
        const description = '[Guide](./guide.md?q=0&empty=#part) ![図](./image.svg)\n\n`[code](./literal.md)`';
        await source.writeAsString(_document(version, format, {
          'Model': {'type': 'object', 'description': description, 'required': ['n'],
            'properties': {'n': {r'$ref': '#$group/Number'}}, 'x-exact': 'EXACT'},
          'Number': {'type': 'integer', 'minimum': 'EXACT'},
        }));
        await destination.writeAsString(_document(version, format, {
          'Use': {r'$ref': '../source/api.$format#$group/Model'},
        }));
        await File('${directory.path}/busyapi.yaml').writeAsString(
            'version: 1\nroots:\n  - {name: Source, path: source/api.$format}\n  - {name: Target, path: target/api.$format}\n');
        final original = source.readAsBytesSync(), originalTarget = destination.readAsBytesSync();
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final project = await BusyProject.open(directory.path, engine);
        addTearDown(project.close);
        final buffer = await project.buffer(destination.uri.toString());
        Future<RefactoringPlan> prepare() => project.planReferenceInlining({
          'root': buffer.id, 'resource': buffer.id,
          'generation': buffer.generation, 'pointer': '$group/Use',
        });
        final stale = await prepare();
        project.store.replace(buffer.id, buffer.text.replaceFirst('Original', 'Unsaved'));
        final working = buffer.bytes();
        await expectLater(project.applyRefactoring(stale), throwsA(isA<CoreFailure>()
            .having((e) => e.code, 'code', 'refactor.stale')));
        expect(buffer.bytes(), working);
        final plan = await prepare();
        await expectLater(project.applyRefactoring(plan, current: () => false), throwsA(isA<CoreFailure>()
            .having((e) => e.code, 'code', 'refactor.stale')));
        expect(buffer.bytes(), working);
        await project.applyRefactoring(plan);
        final accepted = buffer.bytes();
        final inspected = await project.inspectObject(buffer.id, buffer.id, '$group/Use');
        final text = inspected['value']['description'] as String;
        expect(text, contains(source.uri.resolve('./guide.md?q=0&empty=#part').toString().replaceAll('&', '&amp;')));
        expect(text, contains(source.uri.resolve('./image.svg').toString()));
        expect(text, contains('`[code](./literal.md)`'));
        expect(buffer.text, contains('9007199254740993.00'));
        expect(source.readAsBytesSync(), original);
        expect(destination.readAsBytesSync(), originalTarget);
        project.store.undo();
        expect(buffer.bytes(), working);
        project.store.redo();
        expect(buffer.bytes(), accepted);
        expect((await project.check(buffer.id))['complete'], true);
        await project.save(buffer);
        expect(destination.readAsBytesSync(), accepted);
        expect(source.readAsBytesSync(), original);
        final reopened = await BusyProject.open(directory.path, engine);
        addTearDown(reopened.close);
        expect((await reopened.check(destination.uri.toString()))['complete'], true);
        final fresh = await reopened.inspectObject(destination.uri.toString(), destination.uri.toString(), '$group/Use');
        expect(fresh['value']['description'], text);
      });

      test('$version $format file Markdown mapping is virtual, reversible and safely reopened', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-move-markdown-');
        addTearDown(() => directory.delete(recursive: true));
        await Directory('${directory.path}/source').create();
        await Directory('${directory.path}/target').create();
        final source = File('${directory.path}/source/api.$format');
        final destination = File('${directory.path}/target/api.$format');
        final group = version == '2.0' ? '/definitions' : '/components/schemas';
        await source.writeAsString(_document(version, format, {
          'Model': {'type': 'string', 'description': '[Guide](./guide.md) [local](#section)',
            'x-data': {'description': '[literal](./payload.md)'}, 'x-exact': 'EXACT'},
        }));
        final original = source.readAsBytesSync();
        await File('${directory.path}/busyapi.yaml').writeAsString(
            'version: 1\nroots:\n  - {name: API, path: source/api.$format}\n');
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final project = await BusyProject.open(directory.path, engine);
        addTearDown(project.close);
        final buffer = await project.buffer(source.uri.toString());
        final stale = await project.planFileMove(buffer.id, destination.path);
        project.store.replace(buffer.id, buffer.text.replaceFirst('Original', 'Unsaved'));
        final working = buffer.bytes();
        await expectLater(project.applyRefactoring(stale), throwsA(isA<CoreFailure>()
            .having((e) => e.code, 'code', 'refactor.stale')));
        expect(buffer.id, source.uri.toString());
        expect(buffer.bytes(), working);
        final plan = await project.planFileMove(buffer.id, destination.path);
        expect(destination.existsSync(), false);
        await project.applyRefactoring(plan);
        expect(buffer.id, destination.uri.toString());
        final accepted = buffer.bytes();
        final expected = '[Guide](<${source.uri.resolve('./guide.md')}>) [local](#section)';
        final view = await project.inspectObject(buffer.id, buffer.id, '$group/Model');
        expect(view['value']['description'], expected);
        expect(view['value']['x-data']['description'], '[literal](./payload.md)');
        expect(source.readAsBytesSync(), original);
        expect(destination.existsSync(), false);
        project.store.undo();
        expect(buffer.id, source.uri.toString());
        expect(buffer.bytes(), working);
        project.store.redo();
        expect(buffer.id, destination.uri.toString());
        expect(buffer.bytes(), accepted);
        final publication = PublicationStore('${directory.path}/state');
        expect((await publication.save(project, [buffer])).complete, true);
        expect(destination.readAsBytesSync(), accepted);
        expect(source.existsSync(), false);
        final reopened = await BusyProject.open(directory.path, engine);
        addTearDown(reopened.close);
        final root = reopened.roots.single.id;
        expect(root, destination.uri.toString());
        expect((await reopened.check(root))['complete'], true);
        final fresh = await reopened.inspectObject(root, root, '$group/Model');
        expect(fresh['value']['description'], expected);
      });
    }
  }
}
