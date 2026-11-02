import 'dart:convert';
import 'dart:typed_data';

import 'package:busyapi_core/src/response_field_capture.dart';
import 'package:test/test.dart';

void main() {
  test('response evidence handles boundaries and informational fields without changing socket chunks', () {
    final evidence = ResponseFieldCapture();
    final wire = latin1.encode('HTTP/1.1 103 Early Hints\r\nLink: </guide>; rel=preload\r\n\r\n'
        'HTTP/1.1 200 OK\r\nDate: Wed, 09 Jun 2021 10:18:14 GMT\r\n'
        'X-Unknown: first\r\nDate: Thu, 10 Jun 2021 10:18:14 GMT\r\n'
        'X-Unknown: caf\u00e9\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\n\r\n'
        'body\r\nX-Unknown: body data');
    for (final byte in wire) {
      final chunk = Uint8List.fromList([byte]);
      expect(identical(evidence.observe(chunk), chunk), true);
    }
    expect(evidence.completeFor(200), true);
    expect(evidence.fields, [
      ('date', 'Wed, 09 Jun 2021 10:18:14 GMT'), ('x-unknown', 'first'),
      ('date', 'Thu, 10 Jun 2021 10:18:14 GMT'), ('x-unknown', 'caf\u00e9'),
      ('set-cookie', 'a=1'), ('set-cookie', 'b=2'),
    ]);
    expect(evidence.completeFor(201), false);
  });
  test('bounded or folded field evidence stays incomplete without changing received bytes', () {
    for (final source in [
      'HTTP/1.1 200 OK\r\nX-Value: ${'x' * ResponseFieldCapture.maximumBytes}\r\n\r\n',
      'HTTP/1.1 200 OK\r\nX-Value: a\r\n b\r\n\r\n',
      'HTTP/1.1 200 OK\r\nX-Value: partial',
    ]) {
      final evidence = ResponseFieldCapture(), chunk = Uint8List.fromList(ascii.encode(source));
      expect(identical(evidence.observe(chunk), chunk), true);
      expect(evidence.completeFor(200), false);
      expect(evidence.failureFor(200), isNotNull);
    }
  });
}
