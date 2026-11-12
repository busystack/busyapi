import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:busyapi_core/busyapi_core.dart';
import 'package:test/test.dart';

const _hello = {
  'protocol': 1,
  'engineVersion': '0.1.0',
  'nodeVersion': '24.15.0',
  'range': 'half-open',
  'lineBase': 1,
  'columnBase': 1,
  'bom': 'excluded',
  'offsetUnit': 'utf16',
  'lineEndings': 'raw',
};

/// The OS exit future can deliberately lag kill. Framing and EngineProcess's
/// real handshake, queues, timers, decoder and cleanup still execute normally.
class _ControlledProcess implements Process {
  _ControlledProcess(
    this.number, {
    this.badHello = false,
    this.holdRequests = false,
  }) {
    _input.stream.listen(_receive);
    stdin = IOSink(_input.sink);
  }
  final int number;
  final bool badHello, holdRequests;
  final _input = StreamController<List<int>>();
  final _output = StreamController<List<int>>();
  final _error = StreamController<List<int>>();
  final exited = Completer<int>(), killed = Completer<void>();
  final requested = Completer<void>();
  final _bytes = <int>[];
  final methods = <String>[];
  @override
  late final IOSink stdin;
  @override
  int get pid => number;
  @override
  Stream<List<int>> get stdout => _output.stream;
  @override
  Stream<List<int>> get stderr => _error.stream;
  @override
  Future<int> get exitCode => exited.future;

  void _receive(List<int> bytes) {
    _bytes.addAll(bytes);
    while (_bytes.length >= 4) {
      final length = ByteData.sublistView(
        Uint8List.fromList(_bytes.take(4).toList()),
      ).getUint32(0);
      if (_bytes.length < length + 4) return;
      final request =
          jsonDecode(utf8.decode(_bytes.sublist(4, length + 4))) as Map;
      _bytes.removeRange(0, length + 4);
      final method = request['method'] as String;
      methods.add(method);
      if (method == 'hello') {
        reply(
          request['id'] as String,
          badHello ? {..._hello, 'protocol': 99} : _hello,
        );
      } else if (method == 'shutdown') {
        reply(request['id'] as String, {});
        Timer.run(finish);
      } else if (method == 'cancel') {
        reply(request['id'] as String, {'cancelled': true});
      } else {
        if (!requested.isCompleted) requested.complete();
        if (!holdRequests) reply(request['id'] as String, {'session': number});
      }
    }
  }

  void reply(String id, Map<String, Object?> result) {
    if (exited.isCompleted) return;
    final payload = utf8.encode(
      jsonEncode({'protocol': 1, 'id': id, 'ok': true, 'result': result}),
    );
    final header = ByteData(4)..setUint32(0, payload.length);
    _output.add([...header.buffer.asUint8List(), ...payload]);
  }

  @override
  bool kill([ProcessSignal signal = ProcessSignal.sigterm]) {
    if (!killed.isCompleted) killed.complete();
    return true;
  }

  void finish() {
    if (exited.isCompleted) return;
    exited.complete(0);
    unawaited(_output.close());
    unawaited(_error.close());
    unawaited(stdin.close());
  }
}

void main() {
  late Directory directory;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp(
      'busyapi-engine-session-',
    );
    File('${directory.path}/node')
        .writeAsStringSync('controlled process input');
    File('${directory.path}/engine.cjs')
        .writeAsStringSync('controlled helper input');
  });
  tearDown(() async {
    await directory.delete(recursive: true);
  });

  EngineProcess engine(
    List<_ControlledProcess> sessions, {
    Duration timeout = const Duration(seconds: 2),
  }) => EngineProcess(
    executable: '${directory.path}/node',
    helper: '${directory.path}/engine.cjs',
    timeout: timeout,
    processStarter: (
      executable,
      arguments, {
      required environment,
      required includeParentEnvironment,
      required workingDirectory,
      required runInShell,
    }) async => sessions.removeAt(0),
  );

  test(
    'a request during delayed termination belongs to the replacement handshake',
    () async {
      final old = _ControlledProcess(1, badHello: true),
          next = _ControlledProcess(2);
      final sessions = [old, next], owner = engine([old, next]);
      addTearDown(() async {
        old.finish();
        next.finish();
        await owner.close();
      });
      final first = owner.request('inspect', {});
      final firstFailure = expectLater(
        first,
        throwsA(
          isA<CoreFailure>().having(
            (failure) => failure.code,
            'code',
            'engine.handshake',
          ),
        ),
      );
      await old.killed.future;
      final replacement = owner.request(
        'inspect',
        {},
        requestId: 'replacement',
      );
      await Future<void>.delayed(Duration.zero);
      expect(next.methods, isEmpty);
      old.finish();
      await firstFailure;
      expect((await replacement)['session'], 2);
      expect(next.methods, ['hello', 'inspect']);
      await owner.close();
      expect(next.exited.isCompleted, isTrue);
      expect(sessions.every((session) => session.exited.isCompleted), isTrue);
    },
  );

  test('cancellation releases its own overlapping request and close drains the process', () async {
    final active = _ControlledProcess(2, holdRequests: true),
        current = engine([active]);
    addTearDown(() async {
      active.finish();
      await current.close();
    });
    final pending = current.request('analyse', {}, requestId: 'cancel-me');
    final cancelled = expectLater(
      pending,
      throwsA(
        isA<CoreFailure>().having(
          (failure) => failure.code,
          'code',
          'cancelled',
        ),
      ),
    );
    await active.requested.future;
    final other = current.request('inspect', {}, requestId: 'other');
    await current.cancel('cancel-me');
    await cancelled;
    active.reply('other', {'session': 2});
    expect((await other)['session'], 2);
    await Future.wait([current.close(), current.close()]);
    expect(active.exited.isCompleted, isTrue);
    await expectLater(
      current.request('inspect', {}),
      throwsA(
        isA<CoreFailure>().having(
          (failure) => failure.code,
          'code',
          'engine.closed',
        ),
      ),
    );
  });

  test('timeout cancellation terminates the timed request without failing a later one', () async {
    final active = _ControlledProcess(2, holdRequests: true);
    final current = engine([active], timeout: const Duration(milliseconds: 50));
    addTearDown(() async {
      active.finish();
      await current.close();
    });
    await expectLater(
      current.request('analyse', {}, requestId: 'timed'),
      throwsA(
        isA<CoreFailure>().having(
          (failure) => failure.code,
          'code',
          'engine.timeout',
        ),
      ),
    );
    await current.cancel('timed');
    final next = current.request('inspect', {}, requestId: 'next');
    await Future<void>.delayed(Duration.zero);
    active.reply('next', {'session': 2});
    expect((await next)['session'], 2);
    await current.close();
    expect(active.exited.isCompleted, isTrue);
  });
}
