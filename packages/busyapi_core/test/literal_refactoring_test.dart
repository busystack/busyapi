import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

void main() {
  for (final version in ['2.0', '3.0.4', '3.1.2', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('$version $format explicit inlining separates the last contract consumer before file relocation', () async {
        final directory = await Directory.systemTemp.createTemp('busyapi-literal-inline-');
        addTearDown(() => directory.delete(recursive: true));
        final source = File('${directory.path}/api.$format'), model = File('${directory.path}/model.$format'), moved = File('${directory.path}/deep/model.$format');
        await moved.parent.create();
        final group = version == '2.0' ? '/definitions' : '/components/schemas';
        final data = {
          if (version == '2.0') 'swagger': version else 'openapi': version,
          'info': {'title': 'Literal', 'version': '1'}, 'paths': {},
          if (version == '2.0') 'definitions': {
            'Holder': {'default': {r'$ref': 'model.$format', 'x-number': 'EXACT', 'x-bytes': 'AAECA/7/AA=='}},
            'Use': {r'$ref': '#$group/Holder/default'},
          } else 'components': {'schemas': {
            'Holder': {'default': {r'$ref': 'model.$format', 'x-number': 'EXACT', 'x-bytes': 'AAECA/7/AA=='}},
            'Use': {r'$ref': '#$group/Holder/default'},
          }},
        };
        await source.writeAsString('${format == 'yaml' ? '# Keep literal\n' : ''}${jsonEncode(data).replaceFirst('"EXACT"', '9007199254740993.00')}');
        await model.writeAsString('{"type":"string"}');
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        final project = await BusyProject.open(source.path, engine);
        addTearDown(project.close);
        final root = source.uri.toString(), buffer = await project.buffer(root), fragment = await project.buffer(model.uri.toString());
        final original = buffer.bytes();
        await expectLater(project.planFileMove(fragment.id, moved.path), throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'file.move.literal.ownership')));
        final inline = await project.planReferenceInlining({'root': root, 'resource': root, 'pointer': '$group/Use', 'generation': buffer.generation});
        await project.applyRefactoring(inline);
        final detached = buffer.bytes();
        final literal = (await project.inspectObject(root, root, '$group/Holder'))['value']['default'];
        expect(literal[r'$ref'], 'model.$format');expect(literal['x-bytes'], 'AAECA/7/AA==');
        expect(buffer.text, contains('9007199254740993.00'));
        await project.applyRefactoring(await project.planFileMove(fragment.id, moved.path));
        expect((await project.inspectObject(root, root, '$group/Holder'))['value']['default'], literal);
        final page = await project.referencePage(root, root, '$group/Use');
        expect(page['references'][0]['target']['resource'], moved.uri.toString());
        project.store.undo();expect(buffer.bytes(), detached);
        project.store.undo();expect(buffer.bytes(), original);
        project.store.redo();project.store.redo();
        expect((await PublicationStore('${directory.path}/state').save(project, project.store.buffers.values)).complete, true);
        final reopened = await BusyProject.open(source.path, engine);
        addTearDown(reopened.close);
        expect((await reopened.check(root))['complete'], true);
        expect((await reopened.inspectObject(root, root, '$group/Holder'))['value']['default'], literal);
      });
    }
  }
  for (final version in ['3.1.2', '3.2.1']) {
    for (final json in [false, true]) {
      for (final stable in [false, true]) {
        test(
          'dual source ownership $version $json stable=$stable rejects partial repairs and retains an explicit URI move',
          () async {
            final temp = await Directory.systemTemp.createTemp(
              'busyapi-literal-refactor-',
            );
            addTearDown(() => temp.delete(recursive: true));
            final extension = json ? 'json' : 'yaml',
                source = File('${temp.path}/root.$extension'),
                model = File('${temp.path}/model.$extension'),
                manifest = File('${temp.path}/busyapi.yaml'),
                destination = File('${temp.path}/moved/model.$extension');
            final reference = stable
                ? 'https://identities.invalid/old'
                : '#/components/schemas/Old';
            String encode(Object value) {
              final text = jsonEncode(value)
                  .replaceAll('111', '9007199254740993.00');
              return json ? text : '\ufeff# unchanged 雪😀\r\n$text';
            }

            await source.writeAsString(
              encode({
                'openapi': version,
                'info': {'title': 'Dual ownership', 'version': '1'},
                'paths': <String, Object?>{},
                'components': {
                  'schemas': {
                    'Old': {if (stable) r'$id': reference, 'type': 'string'},
                    'Literal': {
                      'const': {r'$ref': reference, 'x-count': 111},
                    },
                    'UseLiteral': {
                      r'$ref': '#/components/schemas/Literal/const',
                    },
                    'FileLiteral': {
                      'const': {r'$ref': 'model.$extension'},
                    },
                    'UseFileLiteral': {
                      r'$ref': '#/components/schemas/FileLiteral/const',
                    },
                    'PropertyLiteral': {
                      'const': {
                        'type': 'object',
                        'properties': {
                          'old': {'type': 'string'},
                        },
                        'required': ['old'],
                      },
                    },
                    'UsePropertyLiteral': {
                      r'$ref': '#/components/schemas/PropertyLiteral/const',
                    },
                  },
                },
              }),
            );
            await model.writeAsString(
              encode({'type': 'string', 'description': 'Saved model'}),
            );
            await manifest.writeAsString(
              'version: 1\nroots: [{name: Main, path: root.$extension}] # keep\nunknown: {\$ref: literal data}\n',
            );
            await destination.parent.create();
            final original = {
              for (final file in [source, model, manifest])
                file.path: await file.readAsBytes(),
            };
            final engine = EngineProcess(
              executable: runtimeNode,
              helper: runtimeHelper,
            );
            addTearDown(engine.close);
            final project = await BusyProject.open(temp.path, engine);
            addTearDown(project.close);
            final root = project.roots.single.id,
                buffer = await project.buffer(root),
                fragment = await project.buffer(model.uri.toString());
            project.store.replace(
              fragment.id,
              fragment.text.replaceFirst('Saved model', 'Unsaved model'),
            );
            final working = fragment.bytes(), generation = buffer.generation;
            final target = {
              'resource': root,
              'generation': generation,
              'pointer': '/components/schemas/Old',
            };
            if (stable) {
              final plan = await project.planComponentRename(target, 'New');
              await project.applyRefactoring(plan);
              expect(buffer.text, contains('https://identities.invalid/old'));
              expect(project.store.undo(), isNotEmpty);
              expect(buffer.bytes(), original[source.path]);
            } else {
              await expectLater(
                project.planComponentRename(target, 'New'),
                throwsA(
                  isA<CoreFailure>().having(
                    (error) => error.code,
                    'code',
                    'refactor.literal.ownership',
                  ),
                ),
              );
              expect(buffer.generation, generation);
            }
            await expectLater(
              project.planPropertyRename({
                'resource': root,
                'generation': buffer.generation,
                'pointer':
                    '/components/schemas/PropertyLiteral/const/properties/old',
              }, 'new'),
              throwsA(
                isA<CoreFailure>().having(
                  (error) => error.code,
                  'code',
                  'refactor.literal.ownership',
                ),
              ),
            );
            await expectLater(
              project.planFileMove(fragment.id, destination.path),
              throwsA(
                isA<CoreFailure>().having(
                  (error) => error.code,
                  'code',
                  'file.move.literal.ownership',
                ),
              ),
            );
            expect(fragment.bytes(), working);
            expect(buffer.bytes(), original[source.path]);
            expect(await destination.exists(), false);
            final retained = await project.planFileMove(
              fragment.id,
              destination.path,
              retainIdentity: true,
            );
            await project.applyRefactoring(retained);
            expect(fragment.bytes(), working);
            expect(buffer.bytes(), original[source.path]);
            expect(await destination.exists(), false);
            expect(project.store.undo(), isNotEmpty);
            expect(fragment.id, model.uri.toString());
            expect(fragment.bytes(), working);
            expect(project.store.redo(), isNotEmpty);
            expect(fragment.id, destination.uri.toString());
            expect(fragment.bytes(), working);
            for (final file in original.entries)
              expect(await File(file.key).readAsBytes(), file.value);
            final publication = PublicationStore('${temp.path}/private');
            expect(
              (await publication.save(
                project,
                project.store.buffers.values,
              )).complete,
              true,
            );
            expect(await source.readAsBytes(), original[source.path]);
            expect(await destination.readAsBytes(), working);
            final reopened = await BusyProject.open(temp.path, engine);
            addTearDown(reopened.close);
            final checked = await reopened.check(reopened.roots.single.id);
            expect(checked['complete'], true, reason: jsonEncode(checked));
            expect(
              (await reopened.buffer(destination.uri.toString())).bytes(),
              working,
            );
          },
        );
      }
    }
  }
}
