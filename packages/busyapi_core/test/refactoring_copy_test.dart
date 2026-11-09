import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['2.0', '3.0.4', '3.1.2', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('$version $format extraction retains literal values and redirects configured contract consumers', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-literal-extraction-');
        addTearDown(() => directory.delete(recursive: true));
        final source = File('${directory.path}/api.$format'), other = File('${directory.path}/other.$format');
        final group = version == '2.0' ? '/definitions' : '/components/schemas';
        final pointer = '$group/Holder/default';
        Map<String, Object?> api(Map<String, Object?> schemas) => {
          if (version == '2.0') 'swagger': version else 'openapi': version,
          'info': {'title': 'Original', 'version': '1'}, 'paths': {},
          if (version == '2.0') 'definitions': schemas else 'components': {'schemas': schemas},
        };
        String encode(Object value) => '${format == 'yaml' ? '# Keep source\r\n' : ''}${jsonEncode(value).replaceAll('"EXACT"', '9007199254740993.00')}\r\n';
        final payload = {'type': 'integer', 'minimum': 'EXACT', 'description': '[Guide](guide.md)', 'x-data': {r'$ref': 'literal', 'bytes': 'AAECA/7/AA=='}};
        await source.writeAsString('\ufeff${encode(api({'Holder': {'default': payload}, 'Use': {r'$ref': '#$pointer'}}))}');
        await other.writeAsString(encode(api({'Use': {r'$ref': 'api.$format#$pointer'}})));
        await File('${directory.path}/busyapi.yaml').writeAsString('version: 1\nroots: [{name: Main, path: api.$format}, {name: Other, path: other.$format}]\n');
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final project = await BusyProject.open(directory.path, engine);
        addTearDown(project.close);
        final root = source.uri.toString(), buffer = await project.buffer(root), consumer = await project.buffer(other.uri.toString());
        final before = buffer.bytes(), consumerBefore = consumer.bytes();
        final plan = await project.planComponentExtraction({'root': root, 'resource': root, 'pointer': pointer, 'generation': buffer.generation}, 'Independent');
        expect(plan.result['sourceOwnership'][0]['effect'], 'retained-literal');
        await project.applyRefactoring(plan);
        final accepted = buffer.bytes(), consumerAccepted = consumer.bytes();
        final literal = await project.inspectObject(root, root, '$group/Holder');
        expect(literal['value']['default']['description'], '[Guide](guide.md)');
        expect(literal['value']['default']['x-data'][r'$ref'], 'literal');
        expect(buffer.text, contains('9007199254740993.00'));
        expect(buffer.text, contains('AAECA/7/AA=='));
        for (final id in [root, consumer.id]) {
          final page = await project.referencePage(id, id, '$group/Use');
          expect(page['references'][0]['target']['pointer'], '$group/Independent');
        }
        project.store.undo();expect(buffer.bytes(), before);expect(consumer.bytes(), consumerBefore);
        project.store.redo();expect(buffer.bytes(), accepted);expect(consumer.bytes(), consumerAccepted);
        await expectLater(project.applyRefactoring(plan), throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'refactor.stale')));
        expect((await PublicationStore('${directory.path}/state').save(project, project.store.buffers.values)).complete, true);
        final reopened = await BusyProject.open(directory.path, engine);
        addTearDown(reopened.close);
        expect((await reopened.buffer(root)).bytes(), accepted);
        expect((await reopened.buffer(consumer.id)).bytes(), consumerAccepted);
        expect((await reopened.check(root))['complete'], true);
      });
    }
  }
  for (final version in ['3.1.2', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      for (final keyword in [r'$ref', r'$dynamicRef']) {
        test('$version $format $keyword with schema siblings uses the existing extraction transaction', () async {
          final temp = await Directory.systemTemp.createTemp('busyapi-applicator-extract-');
          addTearDown(() => temp.delete(recursive: true));
          final file = File('${temp.path}/api.$format');
          const pointer = '/components/schemas/Owner/properties/child';
          final data = {
            'openapi': version,
            'info': {'title': 'Extraction', 'version': 'unrelated'},
            'paths': {},
            'components': {'schemas': {
              'Bound': {'type': 'integer'},
              'Owner': {'properties': {'child': {
                keyword: '#/components/schemas/Bound',
                'minimum': 'EXACT', 'description': 'Sibling annotation',
                'x-payload': {r'$ref': 'literal'},
              }}},
            }},
          };
          final original = '${format == 'yaml' ? '# Keep source\r\n' : ''}'
              '${jsonEncode(data).replaceFirst('"EXACT"', '9007199254740993.00')}\r\n';
          await file.writeAsString('\ufeff$original');
          final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
          addTearDown(engine.close);
          var project = await BusyProject.open(file.path, engine);
          addTearDown(() => project.close());
          final root = file.uri.toString(), buffer = await project.buffer(file.uri.toString());
          final target = <String, Object?>{
            'root': root, 'resource': root, 'pointer': pointer, 'generation': buffer.generation,
          };
          final page = await project.inspectObject(root, root, pointer);
          expect(page['schemaReferenceSiblings'], true);
          final plan = await project.planComponentExtraction(target, 'Extracted');
          expect(buffer.text, original);
          await project.applyRefactoring(plan);
          final accepted = buffer.bytes();
          final reference = await project.referencePage(root, root, '/components/schemas/Extracted');
          final edge = (reference['references'] as List).single as Map;
          expect(edge['keyword'], keyword);
          expect(edge['target']['pointer'], '/components/schemas/Bound');
          expect(edge['dynamic'], isNull);
          expect(buffer.text, contains('9007199254740993.00'));
          expect(buffer.text, contains('Sibling annotation'));
          expect(buffer.text, contains('literal'));
          expect((await project.check(root))['status'], 'complete');
          project.store.undo();
          expect(buffer.text, original);
          project.store.redo();
          expect(buffer.bytes(), accepted);
          await expectLater(project.applyRefactoring(plan), throwsA(
            isA<CoreFailure>().having((e) => e.code, 'code', 'refactor.stale'),
          ));
          expect(buffer.bytes(), accepted);
          await project.save(buffer);
          project.close();
          project = await BusyProject.open(file.path, engine);
          expect((await project.buffer(root)).bytes(), accepted);
          expect((await project.check(root))['status'], 'complete');
          expect((await project.referencePage(root, root, '/components/schemas/Extracted'))['references'][0]['keyword'], keyword);
        });
      }
    }
  }
  dynamic decode(String text) => jsonDecode(text.substring(text.indexOf('{')));
  test('semantic resource transitions are scoped, reversible and do not retarget siblings', () {
    const transition = SemanticTransition(
      'file:///old.yaml',
      '/components/schemas/A',
      '/components/schemas/B',
      destinationResource: 'file:///new.yaml',
    );
    expect(
      transition.mapResource(
        'file:///old.yaml',
        '/components/schemas/A/properties/n',
      ),
      'file:///new.yaml',
    );
    expect(
      transition.map('/components/schemas/A/properties/n'),
      '/components/schemas/B/properties/n',
    );
    expect(
      transition.mapResource('file:///old.yaml', '/components/schemas/Other'),
      'file:///old.yaml',
    );
    expect(
      transition.mapResource('file:///unrelated.yaml', '/components/schemas/A'),
      'file:///unrelated.yaml',
    );
    final reverse = transition.reversed;
    expect(
      reverse.mapResource(
        'file:///new.yaml',
        '/components/schemas/B/properties/n',
      ),
      'file:///old.yaml',
    );
    expect(
      reverse.map('/components/schemas/B/properties/n'),
      '/components/schemas/A/properties/n',
    );
    expect(
      reverse.mapResource('file:///new.yaml', '/components/schemas/Other'),
      'file:///new.yaml',
    );
    const samePointer = SemanticTransition(
      'a',
      '/Value',
      '/Value',
      destinationResource: 'b',
    );
    expect(samePointer.mapResource('a', '/Value/child'), 'b');
    expect(samePointer.reversed.mapResource('b', '/Value/child'), 'a');
  });
  for (final version in ['3.1.2', '3.2.1']) {
    for (final json in [false, true]) {
      test(
        'extract and inline $version $json preserve all buffers through undo and reopening',
        () async {
          final temp = await Directory.systemTemp.createTemp('busyapi-copy-');
          addTearDown(() => temp.delete(recursive: true));
          final engine = EngineProcess(
            executable: runtimeNode,
            helper: runtimeHelper,
          );
          addTearDown(engine.close);
          final root = File('${temp.path}/root.${json ? 'json' : 'yaml'}'),
              other = File('${temp.path}/other.json'),
              consumer = File('${temp.path}/consumer.json');
          final data = {
            'openapi': version,
            'info': {'title': 'Copies', 'version': '1'},
            'paths': <String, Object?>{},
            'components': {
              'schemas': {
                'Owner': {
                  'properties': {
                    'inline': {
                      'type': 'object',
                      'properties': {
                        'value': {'type': 'integer'},
                      },
                      'description': 'First\n😀 second\n',
                      'examples': [
                        {'value': 'EXACT_NUMBER', r'$ref': 'literal payload'},
                      ],
                    },
                    'boolean': false,
                  },
                },
                'External': {r'$ref': 'consumer.json#/Schema'},
              },
            },
          };
          var text = const JsonEncoder.withIndent('  ')
              .convert(data)
              .replaceAll('"EXACT_NUMBER"', '900719925474099312345');
          if (!json) {
            // A real YAML anchor with a literal-data consumer. The reviewed
            // transaction must disjoin it without changing that consumer.
            text = text.replaceFirst('"inline": {', '"inline": &owned {');
            text = '${text.substring(0, text.length - 1)},\n'
                '  "x-history": *owned\n}';
            text = '# retained\r\n${text.replaceAll('\n', '\r\n')}';
          }
          await root.writeAsString('\ufeff$text');
          const pointer = '/components/schemas/Owner/properties/inline';
          await consumer.writeAsString(
            jsonEncode({
              'Schema': {
                r'$ref':
                    '${root.uri.pathSegments.last}#$pointer/properties/value',
              },
            }),
          );
          await other.writeAsString(
            jsonEncode({
              'openapi': version,
              'info': {'title': 'Other', 'version': '1'},
              'paths': <String, Object?>{},
              'components': {
                'schemas': {
                  'Use': {r'$ref': 'consumer.json#/Schema'},
                },
              },
            }),
          );
          await File('${temp.path}/busyapi.yaml').writeAsString(
            'version: 1\nroots:\n  - name: first\n    path: ${root.uri.pathSegments.last}\n  - name: second\n    path: other.json\n',
          );
          var project = await BusyProject.open(temp.path, engine);
          addTearDown(() => project.close());
          final buffer = await project.buffer(root.uri.toString()),
              original = buffer.bytes(),
              oldConsumer = await consumer.readAsBytes(),
              otherBytes = await other.readAsBytes();
          final target = <String, Object?>{
            'root': root.uri.toString(),
            'resource': buffer.id,
            'generation': buffer.generation,
            'pointer': pointer,
          };
          final plan = await project.planComponentExtraction(
            target,
            'Extracted',
          );
          expect(plan.checkedRoots.toSet(), {
            root.uri.toString(),
            other.uri.toString(),
          });
          expect(plan.edits, hasLength(2));
          expect(
            buffer.bytes(),
            original,
            reason: 'Review/cancel does not mutate any source',
          );
          await project.applyRefactoring(plan);
          final accepted = buffer.bytes(),
              fragment = project.store.get(consumer.uri.toString());
          expect(buffer.text, contains('900719925474099312345'));
          if (!json) {
            final retained = decode(buffer.text)['x-history'];
            expect(retained['type'], 'object');
            expect(retained['description'], 'First\n😀 second\n');
            expect(retained[r'$ref'], isNull);
          }
          expect(buffer.text, isNot(endsWith('\n')));
          expect(buffer.hasBom, true);
          expect(
            decode(
              buffer.text,
            )['components']['schemas']['Owner']['properties']['inline'],
            {r'$ref': '#/components/schemas/Extracted'},
          );
          expect(
            fragment.text,
            contains('#/components/schemas/Extracted/properties/value'),
          );
          final consumerAccepted = fragment.bytes();
          final undo = project.store.undo();
          expect(
            undo.single.map('/components/schemas/Extracted/properties/value'),
            '$pointer/properties/value',
          );
          expect(buffer.bytes(), original);
          expect(fragment.bytes(), oldConsumer);
          project.store.redo();
          expect(buffer.bytes(), accepted);
          expect(fragment.bytes(), consumerAccepted);
          final inlinePlan = await project.planReferenceInlining({
            ...target,
            'generation': buffer.generation,
          });
          await project.applyRefactoring(inlinePlan);
          final inlined = decode(buffer.text)['components']['schemas'];
          expect(inlined['Owner']['properties']['inline']['type'], 'object');
          expect(inlined['Extracted']['description'], 'First\n😀 second\n');
          expect(buffer.text, contains('900719925474099312345'));
          project.store.undo();
          expect(buffer.bytes(), accepted);
          expect(fragment.bytes(), consumerAccepted);
          project.store.redo();
          final finalBytes = buffer.bytes();
          final publication = PublicationStore(
            '${temp.path}/private-publication',
          );
          expect(
            (await publication.save(
              project,
              project.store.buffers.values,
            )).complete,
            true,
          );
          project.close();
          project = await BusyProject.open(temp.path, engine);
          expect((await project.buffer(buffer.id)).bytes(), finalBytes);
          expect((await project.buffer(fragment.id)).bytes(), consumerAccepted);
          expect(await other.readAsBytes(), otherBytes);
          expect(
            (await project.check(root.uri.toString()))['status'],
            'complete',
          );
        },
      );
    }
  }
  test('later unopened disk input or unsaved consumer rejects the entire extraction', () async {
    final temp = await Directory.systemTemp.createTemp('busyapi-copy-stale-');
    addTearDown(() => temp.delete(recursive: true));
    final engine = EngineProcess(
      executable: runtimeNode,
      helper: runtimeHelper,
    );
    addTearDown(engine.close);
    final root = File('${temp.path}/root.json'),
        part = File('${temp.path}/part.json');
    await root.writeAsString(
      r'{"openapi":"3.2.1","info":{"title":"T","version":"1"},"paths":{},"components":{"schemas":{"A":{"properties":{"child":false}},"External":{"$ref":"part.json#/Use"}}}}',
    );
    await part.writeAsString(
      r'{"Use":{"$ref":"root.json#/components/schemas/A/properties/child"}}',
    );
    final project = await BusyProject.open(root.path, engine);
    addTearDown(project.close);
    final buffer = await project.buffer(root.uri.toString()),
        before = buffer.bytes();
    Future<RefactoringPlan> plan() => project.planComponentExtraction({
      'root': buffer.id,
      'resource': buffer.id,
      'generation': buffer.generation,
      'pointer': '/components/schemas/A/properties/child',
    }, 'Child');
    final unopened = await plan();
    expect(project.store.buffers.containsKey(part.uri.toString()), false);
    await part.writeAsString(
      r'{"Use":{"$ref":"root.json#/components/schemas/A/properties/child"},"later":true}',
    );
    await expectLater(
      project.applyRefactoring(unopened),
      throwsA(
        isA<CoreFailure>().having((e) => e.code, 'code', 'refactor.stale'),
      ),
    );
    expect(buffer.bytes(), before);
    final stale = await plan(),
        fragment = await project.buffer(part.uri.toString());
    project.store.replace(fragment.id, '${fragment.text}\n');
    await expectLater(
      project.applyRefactoring(stale),
      throwsA(
        isA<CoreFailure>().having((e) => e.code, 'code', 'refactor.stale'),
      ),
    );
    expect(buffer.bytes(), before);
    expect(fragment.dirty, true);
  });
  test('identified movement captures unsaved source and destination without losing their history', () async {
    final temp = await Directory.systemTemp.createTemp('busyapi-unsaved-resource-');
    addTearDown(() => temp.delete(recursive: true));
    final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    addTearDown(engine.close);
    await Directory('${temp.path}/deep').create();
    final root = File('${temp.path}/api.json'), destination = File('${temp.path}/deep/models.json');
    Map<String, Object?> api(Map<String, Object?> schemas) => {
      'openapi': '3.2.1', 'info': {'title': 'Original', 'version': '1'}, 'paths': {},
      'components': {'schemas': schemas},
    };
    await root.writeAsString(jsonEncode(api({'Public': {
      r'$id': 'node', r'$anchor': 'public', 'type': 'integer', 'minimum': 'EXACT',
    }})).replaceFirst('"EXACT"', '9007199254740993.00'));
    await destination.writeAsString(jsonEncode(api({})));
    await File('${temp.path}/busyapi.yaml').writeAsString('version: 1\nroots: [{name: main, path: api.json}, {name: models, path: deep/models.json}]\n');
    final project = await BusyProject.open(temp.path, engine);
    addTearDown(project.close);
    final source = await project.buffer(root.uri.toString()), target = await project.buffer(destination.uri.toString());
    final diskSource = await root.readAsBytes(), diskTarget = await destination.readAsBytes();
    project.store.replace(source.id, source.text.replaceFirst('Original', 'Unsaved source'));
    project.store.replace(target.id, '${target.text.replaceFirst('Original', 'Unsaved destination')}\n');
    final unsavedSource = source.bytes(), unsavedTarget = target.bytes();
    final plan = await project.planComponentDefinitionMove({
      'root': source.id, 'resource': source.id, 'pointer': '/components/schemas/Public', 'generation': source.generation,
    }, 'Stored', destinationResource: target.id);
    await expectLater(project.applyRefactoring(plan, current: () => false), throwsA(isA<CoreFailure>()));
    expect(source.bytes(), unsavedSource);expect(target.bytes(), unsavedTarget);
    await project.applyRefactoring(plan);
    expect(source.text, contains('Unsaved source'));expect(target.text, contains('Unsaved destination'));
    expect(target.text, contains('9007199254740993.00'));
    expect(jsonDecode(target.text)['components']['schemas']['Stored'][r'$id'], root.uri.resolve('node').toString());
    final acceptedSource = source.bytes(), acceptedTarget = target.bytes();
    project.store.undo();expect(source.bytes(), unsavedSource);expect(target.bytes(), unsavedTarget);
    project.store.redo();expect(source.bytes(), acceptedSource);expect(target.bytes(), acceptedTarget);
    expect(await root.readAsBytes(), diskSource);expect(await destination.readAsBytes(), diskTarget);
    expect(source.dirty, true);expect(target.dirty, true);
  });
  for (final version in ['3.1.0', '3.1.1', '3.1.2', '3.2.0', '3.2.1']) {
    for (final (json, identified) in [(false, false), (true, false), (false, true), (true, true)]) {
      test(
        'cross-file extraction $version $json identified=$identified captures destination, history and publication',
        () async {
          final temp = await Directory.systemTemp.createTemp(
            'busyapi-extract-destination-',
          );
          addTearDown(() => temp.delete(recursive: true));
          final engine = EngineProcess(
            executable: runtimeNode,
            helper: runtimeHelper,
          );
          addTearDown(engine.close);
          final extension = json ? 'json' : 'yaml';
          final root = File('${temp.path}/a.$extension'),
              destination = File('${temp.path}/b.$extension'),
              consumer = File('${temp.path}/consumer.json');
          const pointer = '/components/schemas/Owner/properties/inline';
          final data = {
            'openapi': version,
            'info': {'title': 'A', 'version': '1'},
            'paths': <String, Object?>{},
            'components': {
              'schemas': {
                'Owner': {
                  if (identified) r'$id': 'https://schemas.invalid/owner/',
                  'properties': {
                    'inline': {
                      if (identified) r'$id': 'node',
                      if (identified) r'$schema': 'https://json-schema.org/draft/2020-12/schema',
                      if (identified) r'$anchor': 'public',
                      if (identified) r'$defs': {'Leaf': {r'$id': 'leaf', r'$anchor': 'leaf', 'type': 'integer'}},
                      'type': 'object',
                      'description': '😀 preserved\n',
                      'properties': {'n': identified ? {r'$dynamicRef': 'leaf#leaf'} : false},
                      'examples': ['EXACT'],
                    },
                  },
                },
                'External': {r'$ref': 'consumer.json#/Use'},
              },
            },
          };
          final source =
              '${json ? '' : '# retained\r\n'}${const JsonEncoder.withIndent('  ').convert(data).replaceAll('"EXACT"', '900719925474099312345')}';
          await root.writeAsString('\ufeff$source');
          await destination.writeAsString(
            jsonEncode({
              'openapi': version,
              'info': {'title': 'B', 'version': '1'},
              'paths': <String, Object?>{},
            }),
          );
          await consumer.writeAsString(
            jsonEncode({
              'Use': {r'$ref': 'a.$extension#$pointer/properties/n'},
            }),
          );
          await File('${temp.path}/busyapi.yaml').writeAsString(
            'version: 1\nroots:\n  - name: first\n    path: a.$extension\n  - name: models\n    path: b.$extension\n',
          );
          var project = await BusyProject.open(temp.path, engine);
          addTearDown(() => project.close());
          final original = {
            for (final f in [root, destination, consumer])
              f.uri.toString(): await f.readAsBytes(),
          };
          final buffer = await project.buffer(root.uri.toString());
          final plan = await project.planComponentExtraction(
            {
              'root': buffer.id,
              'resource': buffer.id,
              'generation': buffer.generation,
              'pointer': pointer,
            },
            'Copied',
            destinationResource: destination.uri.toString(),
          );
          expect(plan.edits, hasLength(3));
          expect(plan.transition.toResource, destination.uri.toString());
          for (final entry in original.entries)
            expect(
              await File(Uri.parse(entry.key).toFilePath()).readAsBytes(),
              entry.value,
            );
          await expectLater(project.applyRefactoring(plan, current: () => false), throwsA(isA<CoreFailure>()));
          expect(buffer.text, source);
          await project.applyRefactoring(plan);
          expect(
            decode(
              buffer.text,
            )['components']['schemas']['Owner']['properties']['inline'][r'$ref'],
            identified ? '${destination.uri}#/components/schemas/Copied' : 'b.$extension#/components/schemas/Copied',
          );
          expect(
            project.store.get(destination.uri.toString()).text,
            contains('900719925474099312345'),
          );
          expect((await project.check(buffer.id))['status'], 'complete');
          if (identified) {
            final moved = decode(project.store.get(destination.uri.toString()).text)['components']['schemas']['Copied'];
            expect(moved[r'$id'], 'https://schemas.invalid/owner/node');
            expect(moved[r'$defs']['Leaf'][r'$id'], 'leaf');
            final reference = await project.referencePage(buffer.id, destination.uri.toString(), '/components/schemas/Copied/properties/n');
            expect(reference['references'][0]['target']['pointer'], '/components/schemas/Copied/\$defs/Leaf');
            expect(reference['references'][0]['dynamic'], isNull);
          }
          await expectLater(project.applyRefactoring(plan), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'refactor.stale')));
          final saved = {
            for (final b in project.store.buffers.values) b.id: b.bytes(),
          };
          final reverse = project.store.undo().single;
          expect(
            reverse.mapResource(
              destination.uri.toString(),
              '/components/schemas/Copied/properties/n',
            ),
            buffer.id,
          );
          for (final entry in original.entries)
            expect(project.store.get(entry.key).bytes(), entry.value);
          final forward = project.store.redo().single;
          expect(
            forward.mapResource(buffer.id, '$pointer/properties/n'),
            destination.uri.toString(),
          );
          final publication = PublicationStore(
            '${temp.path}/private-publication',
          );
          if (version == '3.2.1' && !json) {
            final partial = await publication.save(
              project,
              project.store.buffers.values,
              beforePublish: (path) async {
                if (path == destination.path)
                  throw StateError('Injected destination publication failure');
              },
            );
            expect(partial.complete, false);
            expect(partial.failed.keys, contains(destination.uri.toString()));
            final inspection = await publication.inspect(project);
            expect(inspection.single['outcomes'], isNotEmpty);
            expect(
              project.store.get(destination.uri.toString()).bytes(),
              saved[destination.uri.toString()],
            );
            // An external writer after partial publication wins disk ownership;
            // neither restart inspection nor another save may overwrite it.
            final external = '${await destination.readAsString()}\n';
            await destination.writeAsString(external);
            expect(
              (await publication.save(
                project,
                project.store.buffers.values,
              )).complete,
              false,
            );
            expect(await destination.readAsString(), external);
            expect(
              project.store.get(destination.uri.toString()).bytes(),
              saved[destination.uri.toString()],
            );
            return;
          }
          expect(
            (await publication.save(
              project,
              project.store.buffers.values,
            )).complete,
            true,
          );
          project.close();
          project = await BusyProject.open(temp.path, engine);
          expect((await project.check(buffer.id))['status'], 'complete');
          for (final entry in saved.entries)
            expect((await project.buffer(entry.key)).bytes(), entry.value);
        },
      );
    }
  }
  test('real block YAML preserves mixed lines, quotes, comments and BOM through publication', () async {
    final temp = await Directory.systemTemp.createTemp('busyapi-copy-block-');
    addTearDown(() => temp.delete(recursive: true));
    final engine = EngineProcess(
      executable: runtimeNode,
      helper: runtimeHelper,
    );
    addTearDown(engine.close);
    final root = File('${temp.path}/root.yaml');
    const text = r'''# retained
openapi: 3.2.1
info: {title: Block, version: "1"}
paths: {}
components:
  schemas:
    Owner:
      properties:
        child:
          type: object # constraint comment
          description: |
            First 😀
            Second
          properties: {n: {type: integer}}
          examples:
            - {n: 900719925474099312345, "$ref": "literal payload"}
        after: false
    'Last': {x-kept: 1.00}''';
    final authored = text
        .replaceAll('\n', '\r\n')
        .replaceFirst('paths: {}\r\n', 'paths: {}\n');
    await root.writeAsString('\ufeff$authored');
    var project = await BusyProject.open(root.path, engine);
    addTearDown(() => project.close());
    final buffer = await project.buffer(root.uri.toString()),
        before = buffer.bytes();
    const pointer = '/components/schemas/Owner/properties/child';
    final plan = await project.planComponentExtraction({
      'root': buffer.id,
      'resource': buffer.id,
      'generation': buffer.generation,
      'pointer': pointer,
    }, 'Extracted');
    await project.applyRefactoring(plan);
    expect(buffer.text, contains('type: object # constraint comment\r\n'));
    expect(buffer.text, contains('First 😀\r\n'));
    expect(buffer.text, contains('900719925474099312345'));
    expect(buffer.text, contains("'Last': {x-kept: 1.00}"));
    expect(buffer.text, contains('paths: {}\n'));
    expect(buffer.text, contains('after: false\r\n'));
    expect(buffer.text, isNot(endsWith('\n')));
    final extracted = buffer.bytes();
    project.store.undo();
    expect(buffer.bytes(), before);
    project.store.redo();
    expect(buffer.bytes(), extracted);
    await project.applyRefactoring(
      await project.planReferenceInlining({
        'root': buffer.id,
        'resource': buffer.id,
        'generation': buffer.generation,
        'pointer': pointer,
      }),
    );
    expect(buffer.text, contains('900719925474099312345'));
    final accepted = buffer.bytes();
    final publication = PublicationStore('${temp.path}/private-publication');
    expect(
      (await publication.save(project, project.store.buffers.values)).complete,
      true,
    );
    expect(await root.readAsBytes(), accepted);
    project.close();
    project = await BusyProject.open(root.path, engine);
    expect((await project.buffer(buffer.id)).bytes(), accepted);
    expect((await project.check(buffer.id))['status'], 'complete');
  });
}
