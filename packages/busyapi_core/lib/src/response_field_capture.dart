import 'dart:convert';
import 'dart:typed_data';

/// Passive HTTP/1 field evidence before HttpClient coalesces or replaces fields.
/// The SDK still receives the identical chunks and owns all HTTP/body framing.
/// Capture exhaustion or unsupported folding cannot certify complete evidence.
final class ResponseFieldCapture {
  // Bound both storage and byte work, including informational response blocks.
  static const maximumBytes = 64 * 1024;
  static final _token = RegExp(r"^[-!#$%&'*+.^_`|~0-9A-Za-z]+$");
  static final _statusLine = RegExp(r'^HTTP/1\.[0-9] ([0-9]{3})(?:[ \t].*)?$');
  static final _outerWhitespace = RegExp(r'^[ \t]+|[ \t]+$');
  final _line = <int>[];
  final _fields = <(String, String)>[];
  int _bytes = 0;
  int? _status;
  bool _complete = false;
  String? _failure;

  List<(String, String)> get fields => List.unmodifiable(_fields);
  bool completeFor(int status) => _complete && _status == status;
  String? failureFor(int status) => completeFor(status)
      ? null
      : _failure ?? 'response-field-evidence-incomplete';

  Uint8List observe(Uint8List chunk) {
    if (_complete || _failure != null) return chunk;
    for (final byte in chunk) {
      if (++_bytes > maximumBytes) {
        _failure = 'response-field-evidence-limit';
        _line.clear();
        break;
      }
      if (byte != 10) {
        _line.add(byte);
        continue;
      }
      if (_line.isNotEmpty && _line.last == 13) _line.removeLast();
      final line = latin1.decode(_line);
      _line.clear();
      if (_status == null) {
        final match = _statusLine.firstMatch(line);
        if (match == null) {
          _failure = 'response-field-evidence-framing';
          break;
        }
        _status = int.parse(match[1]!);
      } else if (line.isEmpty) {
        if (_status! >= 100 && _status! < 200 && _status != 101) {
          _fields.clear();
          _status = null;
        } else {
          _complete = true;
          break;
        }
      } else {
        final colon = line.indexOf(':');
        if (colon <= 0 || !_token.hasMatch(line.substring(0, colon))) {
          _failure = 'response-field-evidence-framing';
          break;
        }
        final value = line.substring(colon + 1).replaceAll(_outerWhitespace, '');
        _fields.add((line.substring(0, colon).toLowerCase(), value));
      }
    }
    return chunk;
  }
}
