import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

import 'test_support.dart';

const _reference = '123e4567-e89b-42d3-a456-426614174001';

class _DeviceFixture {
  late Directory directory;
  late EngineProcess engine;
  late HttpServer server;
  late BusyProject project;
  late OperationRequestPlan plan;
  late File source;
  late String original;
  final paths = <String>[], polls = <DateTime>[], bodies = <Map<String, String>>[];
  List<String> errors = [];
  Map<String, Object?> overrides = {};
  bool stallFirst = false, redirect = false;

  Future<void> open(String version, String format) async {
    directory = await Directory.systemTemp.createTemp('busyapi-device-oauth-');
    engine = EngineProcess(executable: runtimeNode, helper: runtimeHelper);
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      paths.add(request.uri.path);
      final fields = Uri.splitQueryString(await utf8.decoder.bind(request).join());bodies.add(fields);
      request.response.headers.contentType = ContentType.json;
      if (request.uri.path == '/device') {
        if (redirect) {
          request.response.statusCode = 302;request.response.headers.set('location', '/not-authorized');
        } else {
          request.response.write(jsonEncode({'device_code': 'private-device-code', 'user_code': 'ABCD-EFGH',
            'verification_uri': 'http://127.0.0.1:${server.port}/verify',
            'verification_uri_complete': 'http://127.0.0.1:${server.port}/verify?user_code=ABCD-EFGH',
            'expires_in': 30, 'interval': 1, ...overrides}));
        }
      } else if (request.uri.path == '/token') {
        polls.add(DateTime.now().toUtc());
        expect(fields['grant_type'], 'urn:ietf:params:oauth:grant-type:device_code');
        expect(fields['device_code'], 'private-device-code');expect(fields['client_id'], 'desktop');
        if (stallFirst && polls.length == 1) return;
        if (errors.isNotEmpty) {
          request.response.statusCode = 400;request.response.write(jsonEncode({'error': errors.removeAt(0), 'error_description': 'PRIVATE-ERROR-DATA'}));
        } else {
          request.response.write('{"access_token":"device-token","token_type":"Bearer","scope":"read","expires_in":3600}');
        }
      } else if (request.uri.path == '/data') {
        expect(request.headers.value('authorization'), 'Bearer device-token');request.response.statusCode = 204;
      } else {request.response.statusCode = 404;}
      try {await request.response.close();} on Object { /* Cancelled grant owns its connection. */ }
    });
    source = File('${directory.path}/api.$format');
    final value = {'openapi': version, 'info': {'title': 'Device flow', 'version': 'business'},
      'servers': [{'url': 'http://127.0.0.1:${server.port}/'}],
      'components': {'securitySchemes': {'oauth': {'type': 'oauth2', 'flows': {'deviceAuthorization': {
        'deviceAuthorizationUrl': '/device', 'tokenUrl': '/token', 'scopes': {'read': 'Read'},
      }}}}}, 'paths': {'/data': {'get': {'security': [{'oauth': ['read']}], 'responses': {'204': {'description': 'Empty'}}}}}};
    original = format == 'yaml' ? '# Retain device declarations 雪\r\n${jsonEncode(value)}\r\n' : jsonEncode(value);
    await source.writeAsString(original);
    await File('${directory.path}/busyapi.yaml').writeAsString(jsonEncode({'version': 1,
      'roots': [{'name': 'api', 'path': 'api.$format'}], 'environments': {'local': {'authentication': {
        'alternative': 0, 'schemes': {'oauth': {'clientId': 'desktop', 'clientAuthentication': 'none', 'scopes': ['read'], 'accessTokenRef': _reference}},
      }}}}));
    project = await BusyProject.open(directory.path, engine);
    plan = await project.prepareRequest(source.uri.toString(), resource: source.uri.toString(), pointer: '/paths/~1data/get');
  }

  OperationRequestDraft get draft => OperationRequestDraft(planIdentity: plan.identity, environment: 'local', securityAlternative: 0);
  Future<OAuthToken> authorize({OAuthClient client = const OAuthClient(timeout: Duration(seconds: 20)),
      RunCancellation? cancellation, Future<void> Function(OAuthDevicePrompt)? present}) =>
      client.deviceAuthorization(plan, environment: 'local', scheme: 'oauth', draft: draft,
        cancellation: cancellation ?? RunCancellation(), present: present ?? (_) async {});
  Future<void> close() async {plan.close();project.close();await engine.close();await server.close(force: true);await directory.delete(recursive: true);}
}

void main() {
  for (final version in ['3.2.0', '3.2.1'])for (final format in ['yaml', 'json']) {
    test('$version $format device polling, native execution inputs, saved credentials and CLI', () async {
      final fixture = _DeviceFixture();await fixture.open(version, format);addTearDown(fixture.close);
      fixture.errors = ['authorization_pending', 'slow_down'];
      OAuthDevicePrompt? prompt;
      final issued = await fixture.authorize(present: (value) async {prompt = value;});
      expect(prompt!.userCode, 'ABCD-EFGH');expect(prompt!.verificationUriComplete!.queryParameters['user_code'], prompt!.userCode);
      expect(issued.accessToken, 'device-token');expect(issued.owner, fixture.plan.identity);expect(issued.scope, ['read']);
      expect(fixture.polls, hasLength(3));
      expect(fixture.polls[1].difference(fixture.polls[0]).inMilliseconds, greaterThanOrEqualTo(990));
      expect(fixture.polls[2].difference(fixture.polls[1]).inMilliseconds, greaterThanOrEqualTo(5990));
      expect(fixture.bodies.first, {'client_id': 'desktop', 'scope': 'read'});
      final sent = await const ContractRequestExecutor().execute(fixture.plan, fixture.draft, resolveSecret: (_) async => issued.accessToken);
      try {expect(sent.conforming, true, reason: '${sent.outgoing.findings}');} finally {await sent.close();}
      final changed = await fixture.project.applyRefactoring(await fixture.plan.planCase('Device authenticated', fixture.draft));
      for (final id in changed) await fixture.project.save(fixture.project.store.get(id));
      final manifest = await File('${fixture.directory.path}/busyapi.yaml').readAsString();
      expect(manifest, isNot(contains('device-token')));expect(manifest, isNot(contains('private-device-code')));
      final cli = await runCliWithSecrets(['test', fixture.directory.path, '--case', 'Device authenticated', '--json'], {_reference: issued.accessToken});
      expect(cli.code, 0, reason: '${cli.output} ${cli.error}');expect(cli.output, isNot(contains('device-token')));
      expect(await fixture.source.readAsString(), fixture.original);
    });
  }

  for (final error in ['access_denied', 'expired_token', 'invalid_client']) {
    test('device $error terminates polling without exposing endpoint data', () async {
      final fixture = _DeviceFixture();await fixture.open('3.2.1', 'json');addTearDown(fixture.close);fixture.errors = [error];
      await expectLater(fixture.authorize(), throwsA(isA<CoreFailure>().having((value) => value.message, 'redacted', isNot(contains('PRIVATE-ERROR-DATA')))));
      expect(fixture.polls, hasLength(1));
    });
  }
  test('device timeout backoff uses the same bounded OAuth transport', () async {
    final fixture = _DeviceFixture();await fixture.open('3.2.1', 'json');addTearDown(fixture.close);fixture.stallFirst = true;
    final issued = await fixture.authorize(client: const OAuthClient(timeout: Duration(seconds: 10), tokenExchangeTimeout: Duration(milliseconds: 150)));
    expect(issued.accessToken, 'device-token');expect(fixture.polls, hasLength(2));
    expect(fixture.polls[1].difference(fixture.polls[0]).inMilliseconds, greaterThanOrEqualTo(1990));
  });
  test('device cancellation, expiry, stale input, invalid metadata and redirects cannot publish a token', () async {
    final fixture = _DeviceFixture();await fixture.open('3.2.0', 'yaml');addTearDown(fixture.close);
    final cancelled = RunCancellation();
    await expectLater(fixture.authorize(cancellation: cancelled, present: (_) async {cancelled.cancel();}),
      throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'cancelled')));
    expect(fixture.polls, isEmpty);
    fixture.overrides = {'expires_in': 1, 'interval': 10};
    await expectLater(fixture.authorize(), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'oauth.device.expired')));
    expect(fixture.polls, isEmpty);
    for (final invalid in [{'interval': null}, {'interval': 0}, {'expires_in': false}, {'user_code': 'bad\ncode'},
        {'verification_uri': 'http://unapproved.invalid/verify'}, {'verification_uri_complete': 'https://user:secret@example.invalid/'}]) {
      fixture.overrides = invalid;
      await expectLater(fixture.authorize(), throwsA(isA<CoreFailure>()));
    }
    fixture.overrides = {};fixture.redirect = true;
    await expectLater(fixture.authorize(), throwsA(isA<CoreFailure>()));expect(fixture.paths, isNot(contains('/not-authorized')));
    fixture.redirect = false;
    await expectLater(fixture.authorize(present: (_) async {
      fixture.project.store.replace(fixture.source.uri.toString(), fixture.original.replaceFirst('Device flow', 'Changed owner'));
    }), throwsA(isA<CoreFailure>().having((error) => error.code, 'code', 'request.draft.stale')));
    expect(fixture.polls, isEmpty);expect(await fixture.source.readAsString(), fixture.original);
  });
}
