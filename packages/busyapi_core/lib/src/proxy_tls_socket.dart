import 'dart:async';
import 'dart:io';

import 'cancellable_tls_socket.dart';
import 'model.dart';

typedef _ProxyRoute = ({String configuration, String? host, int? port});

// Bound capture before splitting the environment/PAC string or asking the SDK
// to enumerate it. These are transport work bounds, not proxy syntax rules.
const _maximumConfigurationLength = 64 * 1024;
const _maximumRoutes = 256;

final class _CapturedProxyRoute implements Exception {
  const _CapturedProxyRoute();
}

/// Ask the pinned SDK to validate and interpret its PAC configuration without
/// opening a connection. Keep the original entry for the SDK's authentication
/// handling; BusyAPI neither parses credentials nor invents a DIRECT fallback.
Future<List<_ProxyRoute>> _routes(String configuration) async {
  final entries = configuration
      .split(';')
      .map((entry) => entry.trim())
      .where((entry) => entry.isNotEmpty)
      .toList();
  if (entries.length > _maximumRoutes) {
    throw CoreFailure('request.proxy.configuration', 'The proxy configuration exceeds the bounded route limit');
  }
  final routes = <_ProxyRoute>[];
  final client = HttpClient()..findProxy = (_) => configuration;
  client.connectionFactory = (_, host, port) async {
    if (routes.length >= entries.length || (host == null) != (port == null)) {
      throw CoreFailure('request.proxy.configuration', 'The SDK proxy route capture is inconsistent');
    }
    routes.add((configuration: entries[routes.length], host: host, port: port));
    throw const _CapturedProxyRoute();
  };
  try {
    await client.openUrl('GET', Uri.parse('http://proxy-route.invalid'));
    throw StateError('Proxy route capture unexpectedly opened a connection');
  } on _CapturedProxyRoute {
    return routes;
  } finally {
    client.close(force: true);
  }
}

Future<void> _establishTunnel(Uri uri, int port, _ProxyRoute route, Socket socket) async {
  final client = HttpClient()
    ..findProxy = (_) => route.configuration
    ..autoUncompress = false;
  client.connectionFactory = (_, host, port) async {
    if (host != route.host || port != route.port) {
      throw CoreFailure('request.proxy.route', 'The SDK proxy route changed during connection preparation');
    }
    return ConnectionTask.fromSocket(Future<Socket>.value(socket), socket.destroy);
  };
  try {
    // CONNECT has no API path, query, body or origin credentials.
    final target = Uri(scheme: 'http', host: uri.host, port: port);
    final request = await client.openUrl('CONNECT', target);
    unawaited(request.done.then<void>(
      (_) {},
      onError: (Object _, StackTrace __) {},
    ));
    request.followRedirects = false;
    request.contentLength = 0;
    final response = await request.close();
    // RFC 9110 §9.3.6: any 2xx establishes the tunnel. The SDK's
    // CONNECT parser owns the Content-Length/Transfer-Encoding rules.
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const HttpException('The proxy did not establish the selected tunnel');
    }
    await response.detachSocket();
  } finally {
    client.close(force: true);
  }
}

/// HTTPS needs capture above TLS. HttpClient's internal proxy upgrade cannot
/// upgrade a public Socket decorator. Let the SDK select/parse each CONNECT
/// route over an owned raw socket, then transfer that raw subscription to the
/// same cancellable TLS owner used for direct connections. The outer client
/// receives the verified TLS socket and still frames the application exchange.
Future<ConnectionTask<Socket>> connectCancellableHttps(
  Uri uri, {
  required String Function(Uri) findProxy,
  SecurityContext? context,
  bool Function()? isCancelled,
}) async {
  final configuration = findProxy(uri);
  if (configuration.length > _maximumConfigurationLength) {
    throw CoreFailure('request.proxy.configuration', 'The proxy configuration exceeds its capture size limit');
  }
  final port = uri.port == 0 ? 443 : uri.port;
  if (configuration.trim() == 'DIRECT') {
    return connectCancellableTls(uri.host, port, context: context);
  }
  final routes = await _routes(configuration);
  if (isCancelled?.call() == true) {
    throw const SocketException('Connection attempt cancelled');
  }
  ConnectionTask<Socket>? active;
  Socket? connected;
  var cancelled = false;
  Future<Socket> connect() async {
    Object? failure;
    StackTrace? failureStack;
    for (final route in routes) {
      if (cancelled || isCancelled?.call() == true) {
        throw const SocketException('Connection attempt cancelled');
      }
      try {
        active = await connectCancellableTls(
          uri.host,
          port,
          context: context,
          connectionHost: route.host,
          connectionPort: route.port,
          establishTunnel: route.host == null
              ? null
              : (socket) => _establishTunnel(uri, port, route, socket),
        );
        if (cancelled) active!.cancel();
        final socket = await active!.socket;
        if (cancelled) {
          socket.destroy();
          throw const SocketException('Connection attempt cancelled');
        }
        return connected = socket;
      } on SocketException catch (error, stack) {
        failure = error;
        failureStack = stack;
      } on HttpException catch (error, stack) {
        failure = error;
        failureStack = stack;
      } on TlsException catch (error, stack) {
        failure = error;
        failureStack = stack;
      }
      active?.cancel();
    }
    Error.throwWithStackTrace(
      failure ?? const HttpException('No proxy route connected'),
      failureStack ?? StackTrace.current,
    );
  }
  return ConnectionTask.fromSocket(connect(), () {
    cancelled = true;
    active?.cancel();
    connected?.destroy();
  });
}
