import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'model.dart';
import 'proxy_tls_socket.dart';
import 'response_field_capture.dart';

/// Preserve OAS 3.2 additionalOperations tokens (RFC 9110 §9.1) through the
/// pinned HttpClient, which uppercases its method argument. HTTP framing,
/// uploads, response parsing and cancellation remain owned by HttpClient. The
/// read side retains bounded original field evidence for all contract methods.
final class ExactHttpMethod {
  factory ExactHttpMethod(String method) {
    if (!RegExp(r"^[-!#$%&'*+.^_`|~0-9A-Za-z]+$").hasMatch(method)) {
      throw CoreFailure(
        'request.method',
        'The request method must be an HTTP token',
      );
    }
    return ExactHttpMethod._(
      ascii.encode('$method '),
      method == method.toUpperCase() ? method : wireMethod,
    );
  }
  ExactHttpMethod._(this._replacement, this.clientMethod);

  static const wireMethod = 'BUSYAPI';
  final Uint8List _replacement;
  /// Keep standard SDK method semantics (especially HEAD) when no case repair
  /// is needed. Only a case-sensitive custom token uses the neutral prefix.
  final String clientMethod;
  ResponseFieldCapture? _responseFields;
  ResponseFieldCapture? get responseFields => _responseFields;
  final _connections = <ConnectionTask<Socket>>{};
  var _closed = false;

  void configure(HttpClient client, {SecurityContext? context}) {
    // The SDK resolver still selects HTTP and HTTPS routes, including no_proxy
    // and authenticated PAC entries. HTTPS is connected by the owned TLS path;
    // the outer parser must not perform a second CONNECT/TLS upgrade.
    final findProxy = HttpClient.findProxyFromEnvironment;
    client.findProxy = (uri) => uri.isScheme('https') ? 'DIRECT' : findProxy(uri);
    client.connectionFactory = (uri, proxyHost, proxyPort) =>
        _connect(uri, proxyHost, proxyPort, context: context, findProxy: findProxy);
  }

  void close() {
    _closed = true;
    for (final connection in _connections) {
      connection.cancel();
    }
    _connections.clear();
  }

  Future<ConnectionTask<Socket>> _connect(
    Uri uri,
    String? proxyHost,
    int? proxyPort, {
    SecurityContext? context,
    required String Function(Uri) findProxy,
  }) async {
    if (_closed) throw const SocketException('Connection attempt cancelled');
    if (!uri.isScheme('http') && !uri.isScheme('https')) {
      throw CoreFailure('request.scheme', 'Use an HTTP or HTTPS API server');
    }
    if ((proxyHost == null) != (proxyPort == null)) {
      throw CoreFailure(
        'request.proxy.route',
        'The selected proxy has an incomplete connection address',
      );
    }
    final port = uri.port == 0 ? (uri.isScheme('https') ? 443 : 80) : uri.port;
    final task = uri.isScheme('https')
        ? await connectCancellableHttps(
            uri,
            context: context,
            findProxy: findProxy,
            isCancelled: () => _closed,
          )
        : await Socket.startConnect(proxyHost ?? uri.host, proxyPort ?? port);
    var cancelled = false;
    Socket? connected;
    final future = task.socket.then<Socket>((socket) {
      if (cancelled) {
        socket.destroy();
        throw const SocketException('Connection attempt cancelled');
      }
      final prefix = _MethodPrefix(
        _replacement,
        passthrough: clientMethod != wireMethod,
      );
      final fields = _responseFields = ResponseFieldCapture();
      return connected = socket is SecureSocket
          ? _ExactSecureSocket(socket, prefix, fields)
          : _ExactSocket(socket, prefix, fields);
    });
    final connection = ConnectionTask.fromSocket(future, () {
      cancelled = true;
      task.cancel();
      connected?.destroy();
    });
    if (_closed) {
      connection.cancel();
    } else {
      _connections.add(connection);
    }
    return connection;
  }
}

final class _MethodPrefix {
  _MethodPrefix(this.replacement, {bool passthrough = false})
      : matched = passthrough ? expected.length : 0;
  static final List<int> expected = List.unmodifiable(
    ascii.encode('${ExactHttpMethod.wireMethod} '),
  );
  final Uint8List replacement;
  int matched;
  bool get incomplete => matched > 0 && matched < expected.length;

  List<int> rewrite(List<int> bytes) {
    if (matched == expected.length || bytes.isEmpty) return bytes;
    var offset = 0;
    while (offset < bytes.length && matched < expected.length) {
      if ((bytes[offset++] & 255) != expected[matched++]) {
        throw CoreFailure(
          'request.method.framing',
          'The native HTTP request prefix did not match its captured method adapter',
        );
      }
    }
    if (matched < expected.length) return const [];
    // Only this connection's first token is replaced. No search, decoding or
    // replacement touches the target URI, header values, framing or body bytes.
    return Uint8List(replacement.length + bytes.length - offset)
      ..setRange(0, replacement.length, replacement)
      ..setRange(
        replacement.length,
        replacement.length + bytes.length - offset,
        bytes,
        offset,
      );
  }
}

class _ExactSocket extends StreamView<Uint8List> implements Socket {
  _ExactSocket(this.socket, this.prefix, ResponseFieldCapture fields)
      : super(socket.map(fields.observe));
  final Socket socket;
  final _MethodPrefix prefix;

  @override
  void add(List<int> data) {
    final bytes = prefix.rewrite(data);
    if (bytes.isNotEmpty) socket.add(bytes);
  }

  @override
  Future<dynamic> addStream(Stream<List<int>> stream) =>
      socket.addStream(stream.map(prefix.rewrite));
  @override
  void addError(Object error, [StackTrace? stackTrace]) =>
      socket.addError(error, stackTrace);
  @override
  Encoding get encoding => socket.encoding;
  @override
  set encoding(Encoding value) => socket.encoding = value;
  @override
  void write(Object? object) => add(encoding.encode(object.toString()));
  @override
  void writeAll(Iterable<Object?> objects, [String separator = '']) {
    final values = objects.iterator;
    if (!values.moveNext()) return;
    write(values.current);
    while (values.moveNext()) {
      write(separator);
      write(values.current);
    }
  }

  @override
  void writeln([Object? object = '']) {
    write(object);
    write('\n');
  }

  @override
  void writeCharCode(int charCode) => write(String.fromCharCode(charCode));
  @override
  Future<dynamic> flush() => socket.flush();
  @override
  Future<dynamic> close() {
    if (prefix.incomplete) {
      socket.destroy();
      return Future<dynamic>.error(
        CoreFailure(
          'request.method.framing',
          'The native request ended before its method token was complete',
        ),
      );
    }
    return socket.close();
  }

  @override
  Future<dynamic> get done => socket.done;
  @override
  void destroy() => socket.destroy();
  @override
  bool setOption(SocketOption option, bool enabled) =>
      socket.setOption(option, enabled);
  @override
  Uint8List getRawOption(RawSocketOption option) => socket.getRawOption(option);
  @override
  void setRawOption(RawSocketOption option) => socket.setRawOption(option);
  @override
  InternetAddress get address => socket.address;
  @override
  InternetAddress get remoteAddress => socket.remoteAddress;
  @override
  int get port => socket.port;
  @override
  int get remotePort => socket.remotePort;
}

final class _ExactSecureSocket extends _ExactSocket implements SecureSocket {
  _ExactSecureSocket(this.secure, _MethodPrefix prefix, ResponseFieldCapture fields)
      : super(secure, prefix, fields);
  final SecureSocket secure;
  @override
  X509Certificate? get peerCertificate => secure.peerCertificate;
  @override
  String? get selectedProtocol => secure.selectedProtocol;
  @override
  @Deprecated('Matches the deprecated SecureSocket interface')
  void renegotiate({
    bool useSessionCache = true,
    bool requestClientCertificate = false,
    bool requireClientCertificate = false,
  }) => secure.renegotiate(
    useSessionCache: useSessionCache,
    requestClientCertificate: requestClientCertificate,
    requireClientCertificate: requireClientCertificate,
  );
}
