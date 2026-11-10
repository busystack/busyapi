import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

// Prepared application-consumer journeys. Execution remains subject to the
// release hold; these do not replace graphical or packaged acceptance.
void main() {
  for (final version in ['2.0', '3.0.4', '3.1.2', '3.2.1']) {
    for (final format in ['yaml', 'json']) {
      test('$version $format schema authoring uses captured Design, Source and Reference transactions', () async {
        final temp = await Directory.systemTemp.createTemp('busyapi-native-schema-');
        addTearDown(() => temp.delete(recursive: true));
        final swagger = version == '2.0';
        final modern = version.startsWith('3.1.') || version.startsWith('3.2.');
        final file = File('${temp.path}/api.$format');
        final modelFile = File('${temp.path}/models.$format');
        final value = <String, Object?>{
          swagger ? 'swagger' : 'openapi': version,
          'info': {'title': 'Schema workflow', 'version': 'unrelated'},
          'paths': {},
          swagger ? 'definitions' : 'components': swagger
              ? {'Model': {r'$ref': 'models.$format#/Model'}}
              : {'schemas': {'Model': {r'$ref': 'models.$format#/Model'}}},
        };
        final source = format == 'json'
            ? '${jsonEncode(value)}\r\n'
            : '# Keep entry\r\n${value.entries.map((entry) => '${jsonEncode(entry.key)}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n';
        final originalModel = format == 'json'
            ? '{"Model":{"properties":{"child":{}},"allOf":[{}],"additionalProperties":false},"x-number":9007199254740993.00}\r\n'
            : '# Keep model\r\nModel:\r\n  properties: {child: {}}\r\n  allOf: [{}]\r\n  additionalProperties: false\r\nx-number: &exact {number: 9007199254740993.00, ref: literal}\r\nx-alias: *exact\r\n';
        await file.writeAsString(source);
        await modelFile.writeAsBytes([239, 187, 191, ...utf8.encode(originalModel)]);
        final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
        addTearDown(engine.close);
        var project = await BusyProject.open(file.path, engine);
        addTearDown(() => project.close());
        final root = file.uri.toString(), model = modelFile.uri.toString();
        final buffer = await project.buffer(model);
        final page = await project.inspectObject(root, model, '/Model');
        final range = List<int>.from(page['range'] as List);
        final session = PropertySession(root: root, buffer: model, generation: buffer.generation,
            pointer: '/Model', range: range, expected: buffer.text.substring(range[0], range[1]));
        final raw = '{"type":"object","properties":{"child":{"type":"number","minimum":9007199254740993.00},'
            '"next":{${modern ? '"\$dynamicRef":"#node"' : '"\$ref":"#/Model"'}}},'
            '"allOf":[{}],"additionalProperties":true,"description":"Edited schema",'
            '${modern ? '"\$id":"https://schemas.example/model","\$dynamicAnchor":"node","if":{"required":["child"]},"then":{},"else":false,' : ''}'
            '"x-kept":{"zero":0,"empty":null}}';
        await project.proposeAndApply(root, session, [{
          'kind': 'setData', 'pointer': '/Model', 'raw': raw,
          'schemaValueForms': page['schemaValueForms'],
        }]);
        final designed = buffer.text;
        expect(designed, contains('9007199254740993.00'));
        if (format == 'yaml') {
          expect(designed, startsWith('# Keep model\r\n'));
          expect(designed, contains('x-alias: *exact\r\n'));
          expect(designed, contains('&exact {number: 9007199254740993.00, ref: literal}'));
          expect(RegExp(r'(?<!\r)\n').hasMatch(designed), false);
        }
        expect(buffer.hasBom, true);
        expect((await project.buffer(root)).text, source);
        final scalar = await project.referencePage(root, model, '/Model/properties/child/minimum');
        expect(scalar['text'], '9007199254740993.00');
        final schema = await project.referencePage(root, model, '/Model');
        expect(schema['schemaContext']['supported'], true);
        if (modern) expect(schema['schemaContext']['base'], 'https://schemas.example/model');
        final recursive = await project.referencePage(root, model, '/Model/properties/next');
        expect((recursive['references'] as List).single['target']['pointer'], '/Model');
        if (modern) expect((recursive['references'] as List).single['dynamic']['anchor'], 'node');
        final caret = designed.indexOf('true') + 1;
        buffer.selection = SourceSelection(caret, caret);
        final assistance = await project.assistSource(root, model, buffer.selection);
        final choice = assistance.completions.indexWhere((entry) => entry['label'] == 'false');
        expect(choice, greaterThanOrEqualTo(0));
        project.store.apply([assistance.completion(choice, buffer)], label: 'Schema Source edit');
        final changed = buffer.text;
        expect((await project.check(root))['status'], 'complete');
        project.store.undo();
        expect(buffer.text, designed);
        project.store.undo();
        expect(buffer.text, originalModel);
        project.store.redo();
        project.store.redo();
        expect(buffer.text, changed);
        await expectLater(project.proposeAndApply(root, session, [{
          'kind': 'setData', 'pointer': '/Model', 'raw': '{}', 'schemaValueForms': page['schemaValueForms'],
        }]), throwsA(isA<CoreFailure>().having((e) => e.code, 'code', 'draft.stale')));
        expect(buffer.text, changed);
        await project.save(buffer);
        project.close();
        project = await BusyProject.open(file.path, engine);
        expect((await project.buffer(model)).text, changed);
        expect((await project.buffer(model)).hasBom, true);
        expect((await project.buffer(root)).text, source);
        expect((await project.check(root))['status'], 'complete');
      });
    }
  }
  for (final fixture in ['swagger20', 'openapi30', 'openapi31', 'openapi32']) {
    for (final format in ['json', 'yaml']) {
    test('$fixture $format inventory authoring, authenticated execution and cold reopening journey', () async {
      final temp = await Directory.systemTemp.createTemp('busyapi-application-');
      addTearDown(() => temp.delete(recursive: true));
      final source = '$repositoryRoot/fixtures/native_application/$fixture';
      for (final name in ['api.json', 'models.json']) {
        final raw = await File('$source/$name').readAsString();
        await File('${temp.path}/${name.replaceFirst('.json', '.$format')}').writeAsString(
          format == 'json' ? raw : '\ufeff# Keep warehouse source 雪\r\n${raw.replaceAll('models.json', 'models.yaml').replaceAll('\n', '\r\n')}',
        );
      }
      final file = File('${temp.path}/api.$format');
      final modelFile = File('${temp.path}/models.$format');
      final originalDisk = await file.readAsBytes();
      final originalModelDisk = await modelFile.readAsBytes();
      final original = utf8.decode(originalDisk);
      final originalModel = utf8.decode(originalModelDisk);
      final declaration = fixture == 'swagger20' ? 'swagger' : 'openapi';
      final version = jsonDecode(await File('$source/api.json').readAsString())[declaration];
      const credential = '123e4567-e89b-42d3-a456-426614174000';
      const payload = '{"sku":"雪-1","quantity":2,"amount":9007199254740993}';
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final seen = <String>[];
      server.listen((request) async {
        expect(request.headers.value('x-warehouse-key'), 'warehouse-session-secret');
        seen.add(request.method);
        if (request.method == 'POST') {
          expect(request.uri.path, '/v1/orders');
          expect(await utf8.decoder.bind(request).join(), payload);
          request.response.statusCode = 201;
        } else {
          expect(request.method, 'GET');expect(request.uri.path, '/v1/inventory/雪-1');
          expect(request.uri.queryParameters['warehouse'], '北');
          expect(request.headers.value('x-correlation-id'), 'trace-1');
        }
        request.response.headers.contentType = ContentType.json;
        request.response.write(payload);await request.response.close();
      });
      await File('${temp.path}/busyapi.yaml').writeAsString(jsonEncode({
        'version': 1, 'roots': [{'name': 'warehouse', 'path': 'api.$format'}],
        'environments': {'local': {
          'baseUrl': 'http://127.0.0.1:${server.port}/v1',
          'authentication': {'alternative': 0, 'schemes': {'WarehouseKey': {'secretRef': credential}}},
        }},
      }));
      final engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
      addTearDown(engine.close);
      var project = await BusyProject.open(file.path, engine);
      addTearDown(() => project.close());
      final root = file.uri.toString(), model = modelFile.uri.toString();
      final buffer = await project.buffer(root);
      expect((await project.check(root))['status'], 'complete');
      await project.save(buffer);
      expect(await file.readAsBytes(), originalDisk);
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
      expect(await file.readAsBytes(), originalDisk);
      expect(await modelFile.readAsBytes(), originalModelDisk);

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
      final savedBytes = buffer.bytes();
      project.close();
      project = await BusyProject.open(file.path, engine);
      expect((await project.buffer(root)).text, saved);
      expect((await project.buffer(model)).text, savedModel);
      final data = (await project.inspectObject(root, root, ''))['value'] as Map;
      expect(data[declaration], version);
      expect((await project.inspectObject(root, root, '/info'))['value']['version'], '2026-11-inventory');
      expect(saved, contains('"exact": 9007199254740993'));
      expect((await project.check(root))['status'], 'complete');
      final cli = await Process.run('$testBundle/busyapi', ['check', file.path, '--json']);
      expect(cli.exitCode, 0, reason: '${cli.stdout}\n${cli.stderr}');

      final post = await project.prepareRequest(root, resource: root, pointer: pointer);
      addTearDown(post.close);
      final postDraft = OperationRequestDraft(planIdentity: post.identity, environment: 'local', securityAlternative: 0,
          body: const RequestBodyDraft.raw(mediaType: 'application/json', text: payload));
      final sent = await const ContractRequestExecutor().execute(post, postDraft,
          resolveSecret: (reference) async => reference == credential ? 'warehouse-session-secret' : null);
      try {
        expect(sent.conforming, true, reason: '${sent.outgoing.findings} ${sent.received.findings}');
        expect(await sent.response.bytes(), utf8.encode(payload));
      } finally {await sent.close();}
      final get = await project.prepareRequest(root, resource: root, pointer: '/paths/~1inventory~1{sku}/get');
      addTearDown(get.close);
      final getDraft = OperationRequestDraft(planIdentity: get.identity, environment: 'local', securityAlternative: 0,
          parameters: {
            OperationRequestDraft.parameterKey('path', 'sku'): const RequestValue.text('雪-1'),
            OperationRequestDraft.parameterKey('query', 'warehouse'): const RequestValue.text('北'),
            OperationRequestDraft.parameterKey('header', 'X-Correlation-Id'): const RequestValue.text('trace-1'),
          });
      final read = await const ContractRequestExecutor().execute(get, getDraft,
          resolveSecret: (_) async => 'warehouse-session-secret');
      try {expect(read.conforming, true, reason: '${read.outgoing.findings} ${read.received.findings}');}
      finally {await read.close();}
      final caseChanges = await project.applyRefactoring(await post.planCase('Warehouse order', postDraft));
      for (final id in caseChanges) await project.save(project.store.get(id));
      final caseSource = await File('${temp.path}/busyapi.yaml').readAsString();
      expect(caseSource, contains(credential));expect(caseSource, isNot(contains('warehouse-session-secret')));
      expect(caseSource, contains('9007199254740993'));
      project.close();project = await BusyProject.open(temp.path, engine);
      final cold = await project.prepareRequest(root, resource: root, pointer: pointer);addTearDown(cold.close);
      final loaded = await ContractTestRunner.reopenCase(cold, 'Warehouse order', project.access);
      final replay = await const ContractRequestExecutor().execute(cold, loaded,
          resolveSecret: (_) async => 'warehouse-session-secret');
      try {expect(replay.conforming, true);} finally {await replay.close();}
      final cliRun = await runCliWithSecrets(['test', temp.path, '--case', 'Warehouse order', '--json'],
          {credential: 'warehouse-session-secret'});
      expect(cliRun.code, 0, reason: '${cliRun.output} ${cliRun.error}');
      expect(cliRun.output, isNot(contains('warehouse-session-secret')));
      expect(seen, ['POST', 'GET', 'POST', 'POST']);
      final mockPlan = await project.prepareMock(root);addTearDown(mockPlan.close);
      final mock = await mockPlan.start(nodeExecutable: runtimeNode, helper: '$testBundle/libexec/busyapi/mock-server.cjs');
      addTearDown(mock.stop);
      final client = HttpClient();addTearDown(() => client.close(force: true));
      for (final control in ['valid', 'exact-minimum', 'missing-auth']) {
        final request = await client.postUrl(mock.baseUri.resolve('/orders'));
        request.headers.contentType = ContentType.json;
        if (control != 'missing-auth') request.headers.set('x-warehouse-key', 'warehouse-session-secret');
        request.headers.set('prefer', 'code=201');
        request.write(control == 'exact-minimum' ? payload.replaceFirst('9007199254740993', '9007199254740992') : payload);
        final response = await request.close();
        final responseText = await utf8.decoder.bind(response).join();
        expect(response.statusCode, control == 'valid' ? 201 : control == 'missing-auth' ? 401 : 422,
            reason: responseText);
        if (control == 'valid') {
          expect(response.headers.value('busyapi-response-validation-complete'), 'true');
          expect(responseText, contains('9007199254740993'));
        }
      }
      await mock.stop();
      expect((await project.buffer(root)).text, saved);
      expect((await project.buffer(model)).text, savedModel);
      expect(await file.readAsBytes(), savedBytes);

      // Invalid Source remains editable and receives native diagnostics;
      // undo restores the exact saved source without touching disk.
      final reopened = await project.buffer(root);
      final invalid = saved.replaceFirst('"type": "apiKey"', '"type": "invalid-security-type"');
      expect(invalid, isNot(saved));
      project.store.replace(root, invalid);
      expect((await project.check(root))['status'], 'invalid');
      project.store.undo();
      expect(reopened.text, saved);
      expect(await file.readAsBytes(), savedBytes);

      // The real recovery owner adopts exact unsaved buffers into a fresh
      // project. No checkpoint or adoption can publish over either source.
      final recovery = RecoveryStore('${temp.path}/private-recovery');
      project.store.replace(root, invalid);
      project.store.replace(model, '$savedModel\r\n');
      final unsavedModel = (await project.buffer(model)).text;
      for (final id in [root, model]) await recovery.persist(project.store.get(id));
      final records = <Map<String, dynamic>>[];
      for (final checkpoint in Directory(recovery.directory).listSync().whereType<File>()) {
        final text = await checkpoint.readAsString();
        expect(text, isNot(contains('warehouse-session-secret')));
        records.add((jsonDecode(text) as Map<String, dynamic>)..['recordPath'] = checkpoint.path);
      }
      expect(records, hasLength(2));
      final diskBeforeRecovery = {for (final source in [file, modelFile]) source.path: await source.readAsBytes()};
      project.close();project = await BusyProject.open(temp.path, engine);
      final nextRecovery = RecoveryStore(recovery.directory);
      for (final record in records) await nextRecovery.adopt(record, await project.buffer(record['id'] as String));
      final recovered = await project.buffer(root), recoveredModel = await project.buffer(model);
      expect(recovered.text, invalid);expect(recoveredModel.text, unsavedModel);
      expect(recovered.hasBom, format == 'yaml');expect(recoveredModel.hasBom, format == 'yaml');
      expect(recovered.externalConflict, false);expect(recoveredModel.externalConflict, false);
      expect((await project.check(root))['status'], 'invalid');
      expect(() => post.ensureCurrentPreparation(), throwsA(isA<CoreFailure>()));
      await expectLater(nextRecovery.adopt(records.first, await project.buffer(records.first['id'] as String)),
          throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'recovery.record')));
      for (final source in [file, modelFile]) expect(await source.readAsBytes(), diskBeforeRecovery[source.path]);
      project.store.replace(root, saved);
      expect((await project.check(root))['status'], 'complete');
      project.store.undo();expect(recovered.text, invalid);
      project.store.redo();expect(recovered.text, saved);
      final publications = PublicationStore('${temp.path}/private-publications');
      final published = await publications.save(project, [recovered, recoveredModel]);
      expect(published.complete, true, reason: '${published.failed}');
      for (final id in [root, model]) await nextRecovery.retire(id);
      expect(Directory(nextRecovery.directory).listSync().whereType<File>(), isEmpty);

      // Each established family fixture takes every other explicit target
      // route through the same reviewed owner: twelve directed routes in all.
      final originals = {for (final source in [file, modelFile, File('${temp.path}/busyapi.yaml')])
        source.path: await source.readAsBytes()};
      for (final target in ['2.0', '3.0.4', '3.1.2', '3.2.1'].where((target) => target != version)) {
        final review = await project.prepareMigration(root, '${temp.path}/migrated-$target', targetVersion: target);
        try {
          expect(review.publishable, true, reason: '$fixture → $target: ${review.result}');
          await review.publish();
          for (final source in originals.entries) expect(await File(source.key).readAsBytes(), source.value);
          final delivered = await BusyProject.open(review.destination, engine);
          try {
            final id = delivered.roots.single.id;
            expect((await delivered.check(id))['status'], 'complete');
            expect((await delivered.inspectObject(id, id, ''))['value'][target == '2.0' ? 'swagger' : 'openapi'], target);
            expect((await delivered.referencePage(id, id, '/x-preserve/exact'))['text'], '9007199254740993');
            final plan = await delivered.prepareRequest(id, resource: id, pointer: pointer);
            try {
              final exchangeCount = seen.length;
              final request = await ContractTestRunner.reopenCase(plan, 'Warehouse order', delivered.access);
              final result = await const ContractRequestExecutor().execute(plan, request,
                  resolveSecret: (reference) async => reference == credential ? 'warehouse-session-secret' : null);
              try {
                expect(result.conforming, true, reason: '${result.outgoing.findings} ${result.received.findings}');
                expect(await result.response.bytes(), utf8.encode(payload));
              } finally {await result.close();}
              final cli = await runCliWithSecrets(['test', review.destination, '--case', 'Warehouse order', '--json'],
                  {credential: 'warehouse-session-secret'});
              expect(cli.code, 0, reason: '${cli.output} ${cli.error}');
              expect(cli.output, isNot(contains('warehouse-session-secret')));
              expect(seen.length, exchangeCount + 2);
            } finally {plan.close();}
            final documentation = await delivered.prepareDocumentation(id, '${temp.path}/docs-$fixture-$target');
            try {
              await documentation.publish();
              final html = await File('${documentation.destination}/index.html').readAsString();
              expect(html, contains('Create warehouse order'));expect(html, contains('Stock'));
            } finally {documentation.close();}
          } finally {delivered.close();}
        } finally {review.close();}
      }
      for (final source in originals.entries) expect(await File(source.key).readAsBytes(), source.value);
    });
    }
  }
}
