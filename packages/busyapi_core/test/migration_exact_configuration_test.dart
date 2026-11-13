import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:busyapi_core/src/exact_configuration.dart';
import 'package:test/test.dart';

import 'test_support.dart';

typedef _ReviewChange = void Function(Map<String, dynamic>);

class _ChangedReview extends EngineProcess {
  _ChangedReview(this.change) : super(executable: runtimeNode, helper: runtimeHelper);
  final _ReviewChange? change;
  Map<String, dynamic>? delivered;

  @override
  Future<Map<String, dynamic>> request(String method, Map<String, Object?> params, {String? requestId}) async {
    final result = await super.request(method, params, requestId: requestId);
    if (method == 'planMigration' && result['complete'] == true) {
      change?.call(result);
      delivered = result;
    }
    return result;
  }
}

void main() {
  test('exact configuration equality uses numbers, unordered maps and ordered arrays', () {
    for (final pair in [
      ('9007199254740993.00', '900719925474099300e-2'),
      ('1234567890123456789012345678901234567890', '123456789012345678901234567890123456789e1'),
      ('1e999999999999999999999999', '10e999999999999999999999998'),
      ('1e-999999999999999999999999', '10e-1000000000000000000000000'),
      ('0.0000000000000000000000000000000001', '1e-34'),
      ('-0.00e-999999', '-0'),
    ]) {
      final left = exactConfiguration('{"x":{"n":${pair.$1},"a":[1,2]}}');
      final right = exactConfiguration('{"x":{"a":[1.0,2e0],"n":${pair.$2}}}');
      expect(sameExactConfiguration(left, right), true, reason: '$pair');
      expect(sameExactConfiguration(left, exactConfiguration('{"x":{"n":${pair.$2},"a":[2,1]}}')), false);
    }
    expect(ExactConfigurationNumber('-0').sameValue(ExactConfigurationNumber('0')), true);
    expect(sameExactConfiguration(exactConfiguration('-0'), exactConfiguration('0')), false);
    expect(sameExactConfiguration(exactConfiguration('9007199254740993'), exactConfiguration('9007199254740992')), false);
    expect(sameExactConfiguration(exactConfiguration('1e99999'), exactConfiguration('2e99999')), false);
    expect(sameExactConfiguration(exactConfiguration('1e-99999'), exactConfiguration('2e-99999')), false);
    expect(sameExactConfiguration(exactConfiguration('"1"'), exactConfiguration('1')), false);
    expect(sameExactConfiguration(exactConfiguration('x: &n 9007199254740993.00\ny: *n\n'),
        exactConfiguration('{"y":9007199254740993,"x":9007199254740993e0}')), true);
  });

  // Conversion semantics belong to the engine. Core protects the captured
  // packet, paths and reviewed bytes rather than reconstructing transformations.
  final changes = <String, _ReviewChange?>{
    'untouched': null,
    'missing configuration projections': (result) => result.remove('configurationProjections'),
    'malformed configuration projection': (result) => result['configurationProjections'] = [{'pointer': 7, 'after': '{}'}],
    'malformed authentication alternative': (result) => result['configurationAlternatives'] = [{'environment': false, 'before': 0, 'after': 1}],
    'missing parameter review': (result) => result.remove('parameterChanges'),
    'foreign parameter review source': (result) => result['parameterChanges'] = [{'resource': 'file:///uncaptured.json', 'pointer': '', 'range': [0, 1], 'name': 'p', 'before': 'cookie', 'after': 'form'}],
    'changed manifest bytes': (result) => result['manifestText'] = (result['manifestText'] as String).replaceAll('9007199254740993.00', '9007199254740992.00'),
    'changed source output bytes': (result) => (result['outputs'] as List).first['text'] += '\n',
    'foreign output destination': (result) => (result['outputs'] as List).first['id'] = 'file:///unapproved/api.json',
    'unsafe output path': (result) => (result['outputs'] as List).first['path'] = '../api.json',
    'unrelated configuration capture': (result) => result['affectedConfiguration']['identity'] = 'unrelated',
  };
  for (final scenario in changes.entries) {
    test('migration review ${scenario.key}', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-exact-configuration-');
      addTearDown(() => directory.delete(recursive: true));
      final engine = _ChangedReview(scenario.value);
      addTearDown(engine.close);
      final source = File('${directory.path}/api.json');
      const sourceText = '{"openapi":"3.2.1","info":{"title":"Exact","version":"1"},"paths":{},'
          '"components":{"securitySchemes":{"Key":{"type":"apiKey","in":"header","name":"X-Key"}}},'
          '"security":[{"#/components/securitySchemes/Key":[]}]}';
      await source.writeAsString(sourceText);
      final configuration = File('${directory.path}/busyapi.yaml');
      const text = 'version: 1\nroots: [{name: api, path: api.json}]\nenvironments:\n'
          '  manual:\n    x-nested: {huge: 1e99999, tiny: 1e-99999, signed: -0.00e5, array: [1,2,3]}\n'
          '    authentication:\n      alternative: 2.0\n      schemes:\n'
          '        "#/components/securitySchemes/Key": {secretRef: 11111111-1111-4111-8111-111111111111, '
          'x-exact: {number: 9007199254740993.00, integer: 123456789012345678901234567890}}\n'
          'tests: [{name: held, operation: {method: get, path: /missing}, server: 2.0}]\n';
      await configuration.writeAsString(text);
      final project = await BusyProject.open(directory.path, engine);
      addTearDown(project.close);
      final destination = '${directory.path}/output';
      final preparation = project.prepareMigration(source.uri.toString(), destination, targetVersion: '3.0.4');
      if (scenario.value == null) {
        final review = await preparation;
        addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');
        expect(review.securityBindings, isNotEmpty);
        // A retained mutable RPC map cannot alter already reviewed output.
        engine.delivered!['manifestText'] = '{}';
        (engine.delivered!['outputs'] as List).first['text'] = 'changed after review';
        expect(() => review.result['manifestText'] = '{}', throwsUnsupportedError);
        await review.publish();
        final delivered = await File('$destination/busyapi.yaml').readAsString();
        // Exact spelling and inactive noninteger selectors survive semantic
        // conversion, immutable publication and cold reopen.
        for (final spelling in ['9007199254740993.00', '123456789012345678901234567890',
            '1e99999', '1e-99999', '-0.00e5', '"server":2.0', '"alternative":2.0',
            '11111111-1111-4111-8111-111111111111']) {
          expect(delivered, contains(spelling));
        }
        final exact = exactConfiguration(delivered) as Map;
        final original = exactConfiguration(text) as Map;
        expect(sameExactConfiguration(exact['tests'], original['tests'], preserveNumberSpelling: true), true);
        expect(sameExactConfiguration(exact['environments']['manual']['x-nested'],
            original['environments']['manual']['x-nested'], preserveNumberSpelling: true), true);
        final reopened = await BusyProject.open(destination, engine);
        addTearDown(reopened.close);
        expect(reopened.roots, hasLength(1));
      } else {
        await expectLater(preparation, throwsA(isA<CoreFailure>().having(
            (failure) => failure.code, 'code', 'migration.protocol')));
        expect(await Directory(destination).exists(), false);
      }
      expect(await source.readAsString(), sourceText);
      expect(await configuration.readAsString(), text);
    });
  }
}
