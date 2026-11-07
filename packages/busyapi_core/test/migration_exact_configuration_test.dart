import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:busyapi_core/src/exact_configuration.dart';
import 'package:test/test.dart';

import 'test_support.dart';

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

  // This fixture goes through the real engine and Core review/publication.
  // The proxy changes only the delivered manifest and recomputes its byte hash;
  // successful rejection therefore requires the independent semantic proof.
  for (final scenario in [
    (name: 'missing configuration projections', from: 'projection:missing', to: '', accepted: false),
    (name: 'unrelated configuration projection', from: 'projection:unrelated', to: '', accepted: false),
    (name: 'untouched', from: '', to: '', accepted: true),
    (name: 'obsolete holder producer', from: 'producer:79', to: '', accepted: false),
    (name: 'obsolete container producer', from: 'producer:80', to: '', accepted: false),
    (name: 'obsolete resource producer', from: 'producer:81', to: '', accepted: false),
    (name: 'obsolete B01 producer', from: 'producer:82', to: '', accepted: false),
    (name: 'obsolete B01 handoff producer', from: 'producer:83', to: '', accepted: false),
    (name: 'obsolete incomplete B02 producer', from: 'producer:84', to: '', accepted: false),
    (name: 'obsolete B04-R1 producer', from: 'producer:88', to: '', accepted: false),
    (name: 'obsolete B04 handoff producer', from: 'producer:90', to: '', accepted: false),
    (name: 'obsolete B05-R1 producer', from: 'producer:91', to: '', accepted: false),
    (name: 'obsolete B05-R3a producer', from: 'producer:94', to: '', accepted: false),
    (name: 'obsolete partial B05-R3 producer', from: 'producer:93', to: '', accepted: false),
    (name: 'obsolete B05-R2 producer', from: 'producer:92', to: '', accepted: false),
    (name: 'equivalent decimals', from: '9007199254740993.00', to: '900719925474099300e-2', accepted: true),
    (name: 'equivalent positive exponent', from: '1e99999', to: '10e99998', accepted: true),
    (name: 'equivalent negative exponent', from: '1e-99999', to: '10e-100000', accepted: true),
    (name: 'rounded integer collision', from: '9007199254740993.00', to: '9007199254740992.00', accepted: false),
    (name: 'overflow collision', from: '1e99999', to: '2e99999', accepted: false),
    (name: 'underflow collision', from: '1e-99999', to: '2e-99999', accepted: false),
    (name: 'negative zero fidelity', from: '-0.00e5', to: '0.00e5', accepted: false),
    (name: 'array ordering', from: '[1,2,3]', to: '[3,2,1]', accepted: false),
    (name: 'credential binding', from: '11111111-1111-4111-8111-111111111111', to: '22222222-2222-4222-8222-222222222222', accepted: false),
    (name: 'saved Server selector activation', from: '"server":2.0', to: '"server":2', accepted: false),
    (name: 'authentication selector activation', from: '"alternative":2.0', to: '"alternative":2', accepted: false),
  ]) {
    test('Core exact configuration ${scenario.name}', () async {
      final directory = await Directory.systemTemp.createTemp('busyapi-exact-configuration-');
      addTearDown(() => directory.delete(recursive: true));
      final proxy = File('${directory.path}/proxy.cjs');
      await proxy.writeAsString('const helper = ${jsonEncode(runtimeHelper)};\n'
          'const from = ${jsonEncode(scenario.from)}, to = ${jsonEncode(scenario.to)};\n' + r'''
const child = require('node:child_process').spawn(process.execPath, [helper], {stdio:['pipe','pipe','pipe']});
const {createHash} = require('node:crypto');
process.stdin.pipe(child.stdin);child.stderr.pipe(process.stderr);
let pending = Buffer.alloc(0);
child.stdout.on('data', chunk => {
 pending = Buffer.concat([pending, chunk]);
 while (pending.length >= 4) {
  const length = pending.readUInt32BE(0);
  if (!length || length > 64*1024*1024) throw Error('Invalid fixture frame');
  if (pending.length < length+4) break;
  const value = JSON.parse(pending.subarray(4,length+4).toString('utf8'));
  pending = pending.subarray(length+4);
  const result = value.result;
  if (result?.producer === 'busyapi-native-migration' && result.complete && from) {
   if (from === 'projection:missing') delete result.configurationProjections;
   else if (from === 'projection:unrelated') result.configurationProjections = [{pointer:'/environments/manual/authentication',before:null,after:'{}'}];
   else if (from.startsWith('producer:')) result.producerVersion = from.slice('producer:'.length);
   else {
    if (!result.manifestText.includes(from)) throw Error('Mutation did not reach its production field');
    result.manifestText = result.manifestText.replaceAll(from,to);
    result.manifestIdentity = createHash('sha256').update(result.manifestText).digest('hex');
   }
  }
  const payload = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);process.stdout.write(header);process.stdout.write(payload);
 }
});
process.once('SIGTERM', () => child.kill('SIGTERM'));
child.once('exit', code => {process.exitCode = code ?? 1;});
''');
      final engine = EngineProcess(executable: runtimeNode, helper: proxy.path);
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
      if (scenario.accepted) {
        final review = await preparation;
        addTearDown(review.close);
        expect(review.publishable, true, reason: '${review.result}');
        expect(review.securityBindings, isNotEmpty);
        await review.publish();
        final delivered = await File('$destination/busyapi.yaml').readAsString();
        expect(delivered, contains(scenario.from.isEmpty ? '9007199254740993.00' : scenario.to));
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
