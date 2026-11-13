import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

// Preserve the actual native events while exercising their documented late
// delivery. No event, source input, or producer response is fabricated.
class _NativeEventGate {
  _NativeEventGate(this.path) : nativeZone = Zone.current;

  final String path;
  final Zone nativeZone;
  final firstHeld = Completer<void>();
  final _held = <void Function()>[];
  bool holding = true;
  int delivered = 0;

  Stream<FileSystemEvent> watch(String directory, int events, bool recursive) {
    late final StreamController<FileSystemEvent> output;
    StreamSubscription<FileSystemEvent>? input;
    output = StreamController<FileSystemEvent>(
      sync: true,
      onListen: () {
        input = nativeZone
            .run(
              () =>
                  Directory(directory)
                      .watch(events: events, recursive: recursive),
            )
            .listen(
              (event) {
                void deliver() {
                  if (event.path == path) delivered++;
                  output.add(event);
                }

                if (event.path == path && holding) {
                  _held.add(deliver);
                  if (!firstHeld.isCompleted) firstHeld.complete();
                } else {
                  deliver();
                }
              },
              onError: output.addError,
              onDone: output.close,
            );
      },
      onCancel: () => input?.cancel(),
    );
    return output.stream;
  }

  void release() {
    holding = false;
    final pending = List.of(_held);
    _held.clear();
    for (final deliver in pending) {
      deliver();
    }
  }
}

class _CaptureBoundaryEngine extends EngineProcess {
  _CaptureBoundaryEngine()
    : super(executable: runtimeNode, helper: runtimeHelper);

  Future<void> Function()? beforeMigration;
  Future<void> Function()? beforeInspect;

  @override
  Future<Map<String, dynamic>> request(
    String method,
    Map<String, Object?> params, {
    String? requestId,
  }) async {
    if (method == 'planMigration') {
      final boundary = beforeMigration;
      beforeMigration = null;
      await boundary?.call();
    }
    if (method == 'inspect') {
      final boundary = beforeInspect;
      beforeInspect = null;
      await boundary?.call();
    }
    return super.request(method, params, requestId: requestId);
  }
}

void main() {
  test('late own publication hints preserve a freshly captured object page', () async {
    final directory = await Directory.systemTemp.createTemp(
      'busyapi-watch-inspect-',
    );
    addTearDown(() => directory.delete(recursive: true));
    final source = File('${directory.path}/api.json');
    const original =
        '{"openapi":"3.1.2","info":{"title":"Original","version":"1"},"paths":{}}';
    await source.writeAsString(original);
    final gate = _NativeEventGate(source.path);
    final engine = _CaptureBoundaryEngine();
    addTearDown(engine.close);
    await IOOverrides.runZoned(() async {
      final project = await BusyProject.open(source.path, engine);
      addTearDown(project.close);
      final root = source.uri.toString();
      expect((await project.check(root))['status'], 'complete');
      final buffer = await project.buffer(root);
      project.store.replace(
        root,
        original.replaceFirst('Original', 'Published'),
      );
      await publishSources(project, [buffer]);
      await gate.firstHeld.future;
      final published = await source.readAsBytes();
      var crossed = false;
      engine.beforeInspect = () async {
        crossed = true;
        gate.release();
        expect(gate.delivered, greaterThan(0));
      };
      final page = await project.inspectObject(root, root, '/info');
      expect(page['value']['title'], 'Published');
      expect(buffer.text, original.replaceFirst('Original', 'Published'));
      expect(await source.readAsBytes(), published);
      expect(crossed, true);
    }, fsWatch: gate.watch);
  });
  test(
    'native chmod of an unopened captured schema invalidates inspection',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'busyapi-watch-unopened-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final source = File('${directory.path}/api.json');
      final model = File('${directory.path}/model.json');
      await source.writeAsString(
        jsonEncode({
          'openapi': '3.1.2',
          'info': {'title': 'Unopened dependency', 'version': '1'},
          'paths': {},
          'components': {
            'schemas': {
              'Value': {r'$ref': 'model.json#/Value'},
            },
          },
        }),
      );
      const original = '{"Value":{"type":"string"}}';
      await model.writeAsString(original);
      final gate = _NativeEventGate(model.path);
      final engine = _CaptureBoundaryEngine();
      addTearDown(engine.close);
      await IOOverrides.runZoned(() async {
        final project = await BusyProject.open(source.path, engine);
        addTearDown(project.close);
        final root = source.uri.toString(), dependency = model.uri.toString();
        expect((await project.check(root))['status'], 'complete');
        expect(project.dependencies[root], contains(dependency));
        expect(project.store.buffers.containsKey(dependency), false);
        var crossed = false;
        engine.beforeInspect = () async {
          crossed = true;
          final mode = (await model.stat()).mode & 0x1ff;
          final changed = await Process.run('/usr/bin/chmod', [
            mode == 0x180 ? '640' : '600',
            model.path,
          ]);
          expect(changed.exitCode, 0);
          await gate.firstHeld.future;
          gate.release();
          expect(gate.delivered, greaterThan(0));
        };
        await expectLater(
          project.inspectObject(root, root, '/info'),
          throwsA(
            isA<CoreFailure>().having(
              (failure) => failure.code,
              'code',
              'inspect.stale',
            ),
          ),
        );
        expect(crossed, true);
        expect(project.store.buffers.containsKey(dependency), false);
        expect(await model.readAsString(), original);
      }, fsWatch: gate.watch);
    },
  );
  for (final mapped in [false, true]) {
    test(
      'native creation of a missing captured dependency invalidates inspection mapped=$mapped',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'busyapi-watch-missing-',
        );
        addTearDown(() => directory.delete(recursive: true));
        final source = File('${directory.path}/api.json');
        final model = File('${directory.path}/model.json');
        const logical = 'https://example.test/model';
        await source.writeAsString(
          jsonEncode({
            'openapi': '3.1.2',
            'info': {'title': 'Missing dependency', 'version': '1'},
            'paths': {},
            'components': {
              'schemas': {
                'Value': {
                  r'$ref': mapped ? '$logical#/Value' : 'model.json#/Value',
                },
              },
            },
          }),
        );
        if (mapped) {
          await File('${directory.path}/busyapi.yaml').writeAsString(
            jsonEncode({
              'version': 1,
              'roots': [
                {'name': 'Main', 'path': 'api.json'},
              ],
              'resourceMappings': {logical: 'model.json'},
            }),
          );
        }
        final gate = _NativeEventGate(model.path);
        final engine = _CaptureBoundaryEngine();
        addTearDown(engine.close);
        await IOOverrides.runZoned(() async {
          final project = await BusyProject.open(
            mapped ? directory.path : source.path,
            engine,
          );
          addTearDown(project.close);
          final root = source.uri.toString(), dependency = model.uri.toString();
          expect((await project.check(root))['status'], 'incomplete');
          if (mapped) {
            expect(project.approvedResources[logical], dependency);
          } else {
            expect(project.dependencies[root], contains(dependency));
          }
          expect(await model.exists(), false);
          expect(project.store.buffers.containsKey(dependency), false);
          var crossed = false;
          engine.beforeInspect = () async {
            crossed = true;
            await model.writeAsString('{"Value":{"type":"string"}}');
            await gate.firstHeld.future;
            gate.release();
            expect(gate.delivered, greaterThan(0));
          };
          await expectLater(
            project.inspectObject(root, root, '/info'),
            throwsA(
              isA<CoreFailure>().having(
                (failure) => failure.code,
                'code',
                'inspect.stale',
              ),
            ),
          );
          expect(crossed, true);
          expect(project.store.buffers.containsKey(dependency), false);
          expect((await project.check(root))['status'], 'complete');
        }, fsWatch: gate.watch);
      },
    );
  }
  test(
    'bounded reconciliation revisits a captured missing external example',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'busyapi-watch-example-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final source = File('${directory.path}/api.json');
      final example = File('${directory.path}/payload.json');
      final original = jsonEncode({
        'openapi': '3.1.2',
        'info': {'title': 'Missing example', 'version': '1'},
        'paths': {
          '/p': {
            'get': {
              'responses': {
                '200': {
                  'description': 'OK',
                  'content': {
                    'application/json': {
                      'schema': {'type': 'integer'},
                      'examples': {
                        'Payload': {'externalValue': 'payload.json'},
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      await source.writeAsString(original);
      final gate = _NativeEventGate(example.path);
      final engine = _CaptureBoundaryEngine();
      addTearDown(engine.close);
      await IOOverrides.runZoned(() async {
        final project = await BusyProject.open(source.path, engine);
        addTearDown(project.close);
        final root = source.uri.toString(), payload = example.uri.toString();
        await project.check(root);
        expect(await example.exists(), false);
        expect(project.store.buffers.containsKey(payload), false);
        var crossed = false;
        engine.beforeInspect = () async {
          crossed = true;
          await example.writeAsString('7');
          await gate.firstHeld.future;
          expect(gate.delivered, 0);
          final refreshed = await project.refreshResources(reconcile: false);
          expect(
            refreshed.resources,
            contains(payload),
            reason: 'Captured absence belongs to the bounded polling inventory',
          );
          expect(gate.delivered, 0);
        };
        try {
          await expectLater(
            project.inspectObject(root, root, '/info'),
            throwsA(
              isA<CoreFailure>().having(
                (failure) => failure.code,
                'code',
                'inspect.stale',
              ),
            ),
          );
        } finally {
          gate.release();
        }
        expect(crossed, true);
        expect(project.store.buffers.containsKey(payload), false);
        expect((await project.check(root))['status'], 'complete');
        expect(await source.readAsString(), original);
      }, fsWatch: gate.watch);
    },
  );
  test(
    'a new capture cannot rebaseline an older pending source result',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'busyapi-watch-rebaseline-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final source = File('${directory.path}/api.json');
      final model = File('${directory.path}/model.json');
      await source.writeAsString(
        jsonEncode({
          'openapi': '3.1.2',
          'info': {'title': 'Source', 'version': '1'},
          'paths': {},
          'components': {
            'schemas': {
              'Model': {r'$ref': 'model.json'},
            },
          },
        }),
      );
      const original = '{"type":"string","minLength":1}';
      const changed = '{"type":"string","minLength":3}';
      await model.writeAsString(original);
      final gate = _NativeEventGate(model.path);
      final engine = _CaptureBoundaryEngine();
      addTearDown(engine.close);
      await IOOverrides.runZoned(() async {
        final project = await BusyProject.open(source.path, engine);
        addTearDown(project.close);
        final root = source.uri.toString(), dependency = model.uri.toString();
        expect((await project.check(root))['status'], 'complete');
        expect(project.store.buffers.containsKey(dependency), false);
        var crossed = false;
        engine.beforeInspect = () async {
          crossed = true;
          await model.writeAsString(changed);
          await gate.firstHeld.future;
          expect(gate.delivered, 0);
          final observed = <ResourceRefresh>[];
          project.onResourcesRefreshed = observed.add;
          expect(
            (await project.check(root, saved: true))['status'],
            'complete',
          );
          expect(
            observed.any(
              (refresh) =>
                  refresh.resources.contains(dependency) &&
                  refresh.roots.contains(root),
            ),
            true,
            reason: 'Acquiring changed bytes must invalidate the earlier root cache before delayed hints arrive',
          );
          expect(gate.delivered, 0);
          gate.release();
          expect(gate.delivered, greaterThan(0));
        };
        await expectLater(
          project.inspectObject(root, dependency, '', contextKind: 'schema'),
          throwsA(
            isA<CoreFailure>().having(
              (failure) => failure.code,
              'code',
              'inspect.stale',
            ),
          ),
        );
        expect(crossed, true);
        expect(project.store.buffers.containsKey(dependency), false);
        expect(await model.readAsString(), changed);
      }, fsWatch: gate.watch);
    },
  );
  for (final change in ['none', 'bytes', 'permissions']) {
    test('late native hints reconcile captured input: $change', () async {
      final directory = await Directory.systemTemp.createTemp(
        'busyapi-watch-capture-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final source = File('${directory.path}/api.json');
      final payload = File('${directory.path}/payload.json');
      final gate = _NativeEventGate(payload.path);
      final engine = _CaptureBoundaryEngine();
      addTearDown(engine.close);
      final value = <String, Object?>{
        'openapi': '3.1.2',
        'info': {'title': 'Native watch capture', 'version': '1'},
        'paths': {
          '/value': {
            'post': {
              'requestBody': {
                'content': {
                  'application/json': {
                    'schema': {'type': 'object'},
                    'examples': {
                      'Choice': {r'$ref': '#/components/examples/Choice'},
                    },
                  },
                },
              },
              'responses': {
                '204': {'description': 'Empty'},
              },
            },
          },
        },
        'components': {
          'examples': {
            'Choice': <String, Object?>{
              'value': {'value': 'original'},
            },
          },
        },
      };
      await source.writeAsString(jsonEncode(value));
      const body = '{"value":"original"}';
      await IOOverrides.runZoned(() async {
        final project = await BusyProject.open(source.path, engine);
        addTearDown(project.close);
        final root = source.uri.toString();
        expect((await project.check(root))['status'], 'complete');
        await payload.writeAsString(body);
        await gate.firstHeld.future;
        final choice =
            ((value['components'] as Map)['examples'] as Map)['Choice'] as Map;
        choice
          ..remove('value')
          ..['externalValue'] = 'payload.json';
        final buffer = await project.buffer(root);
        project.store.replace(root, jsonEncode(value));
        await publishSources(project, [buffer]);
        final original = await source.readAsBytes();
        var crossed = false;
        engine.beforeMigration = () async {
          crossed = true;
          // The real producer receives the immutable capture already acquired
          // by prepareMigration. Old events must not impersonate a later edit.
          if (change == 'bytes') {
            await payload.writeAsString('{"value":"changed"}');
          } else if (change == 'permissions') {
            final mode = (await source.stat()).mode & 0x1ff;
            final result = await Process.run('/usr/bin/chmod', [
              mode == 0x180 ? '640' : '600',
              source.path,
            ]);
            expect(result.exitCode, 0);
          }
          gate.release();
          expect(gate.delivered, greaterThan(0));
        };
        final destination = '${directory.path}/converted';
        if (change == 'none') {
          final review = await project.prepareMigration(
            root,
            destination,
            targetVersion: '3.0.4',
          );
          addTearDown(review.close);
          expect(review.publishable, true, reason: '${review.result}');
          expect(review.exampleCopies.single.bytes, utf8.encode(body));
          await review.publish();
          expect(await source.readAsBytes(), original);
        } else {
          await expectLater(
            project.prepareMigration(root, destination, targetVersion: '3.0.4'),
            throwsA(
              isA<CoreFailure>().having(
                (failure) => failure.code,
                'code',
                'migration.stale',
              ),
            ),
          );
          expect(await Directory(destination).exists(), false);
          expect(await source.readAsBytes(), original);
        }
        expect(crossed, true);
      }, fsWatch: gate.watch);
    });
  }
}
