import 'package:yaml/yaml.dart';

/// Exact decimal data, independent of the host's integer and floating ranges.
/// This is the coefficient/exponent normalization used by the first-party
/// engine's exact_numbers.ts. It never expands a power of ten. The authored
/// spelling remains available separately from mathematical equality.
class ExactConfigurationNumber {
  ExactConfigurationNumber._(this.lexeme, this.coefficient, this.exponent,
      this.negativeZero, this.nativeInteger);

  factory ExactConfigurationNumber(String lexeme, {int? nativeInteger}) {
    final match = RegExp(r'^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$')
        .firstMatch(lexeme);
    if (match == null) throw const FormatException('Expected an exact JSON number');
    final fraction = match[3] ?? '';
    var digits = '${match[2]}$fraction'.replaceFirst(RegExp(r'^0+'), '');
    var exponent = BigInt.parse(match[4] ?? '0') - BigInt.from(fraction.length);
    final zero = digits.isEmpty;
    if (zero) {
      digits = '0';
      exponent = BigInt.zero;
    } else {
      final trimmed = digits.replaceFirst(RegExp(r'0+$'), '');
      exponent += BigInt.from(digits.length - trimmed.length);
      digits = '${match[1]}$trimmed';
    }
    return ExactConfigurationNumber._(
        lexeme, digits, exponent, zero && match[1] == '-', nativeInteger);
  }

  final String lexeme, coefficient;
  final BigInt exponent;
  final bool negativeZero;

  /// Retain the existing Core integer-only authentication selector behavior.
  /// A numerically equal decimal spelling must not activate an ignored setting.
  final int? nativeInteger;

  bool sameValue(ExactConfigurationNumber other, {bool preserveNegativeZero = false}) =>
      coefficient == other.coefficient && exponent == other.exponent &&
      (!preserveNegativeZero || negativeZero == other.negativeZero);
}

/// Use the existing YAML parser for both YAML and JSON, reading numeric scalar
/// spans before any lossy decoded value can participate in equality. Aliases
/// retain their anchor's scalar provenance. No replacement parser is involved.
Object? exactConfiguration(String text) {
  if (text.length > 65536) throw const FormatException('Configuration size limit');
  var work = 0;
  Object? read(YamlNode node, int depth) {
    if (++work > 2000000 || depth > 128) {
      throw const FormatException('Configuration nesting or work limit');
    }
    if (node is YamlMap) {
      final result = <String, Object?>{};
      for (final entry in node.nodes.entries) {
        final key = (entry.key as YamlNode).value;
        if (key is! String || result.containsKey(key)) {
          throw const FormatException('Expected unique string configuration keys');
        }
        result[key] = read(entry.value, depth + 1);
      }
      return result;
    }
    if (node is YamlList) return [for (final child in node.nodes) read(child, depth + 1)];
    if (node.value is num) {
      // Scalar spans include optional YAML anchor/tag properties. Their values
      // are already resolved by the YAML parser; only strip that token prefix.
      var raw = node.span.text.trim().replaceFirst(
          RegExp(r'^(?:(?:&[^\s]+|!<[^>]*>|![^\s]*)\s+)+'), '');
      raw = raw.replaceAll('_', '').replaceFirst(RegExp(r'^\+'), '');
      final decimal = RegExp(r'^(-?)([0-9]*)(?:\.([0-9]*))?([eE][+-]?[0-9]+)?$')
          .firstMatch(raw);
      if (decimal != null && ('${decimal[2]}${decimal[3] ?? ''}').isNotEmpty) {
        final integer = decimal[2]!.replaceFirst(RegExp(r'^0+(?=[0-9])'), '');
        raw = '${decimal[1]}${integer.isEmpty ? '0' : integer}'
            '${decimal[3] == null ? '' : '.${decimal[3]!.isEmpty ? '0' : decimal[3]}'}${decimal[4] ?? ''}';
      } else if (RegExp(r'^-?(?:0x[0-9a-fA-F]+|0o[0-7]+)$').hasMatch(raw)) {
        final negative = raw.startsWith('-');
        final unsigned = negative ? raw.substring(1) : raw;
        final value = unsigned.startsWith('0o')
            ? BigInt.parse(unsigned.substring(2), radix: 8) : BigInt.parse(unsigned);
        raw = '${negative ? '-' : ''}$value';
      }
      return ExactConfigurationNumber(raw,
          nativeInteger: node.value is int ? node.value as int : null);
    }
    return node.value;
  }
  return read(loadYamlNode(text), 0);
}

/// Mapping order is immaterial; sequence order and scalar types are material.
/// Signed zero is retained for configuration source fidelity, separately from
/// the mathematical JSON equality offered by ExactConfigurationNumber.
bool sameExactConfiguration(Object? a, Object? b) {
  var work = 0;
  bool equal(Object? left, Object? right, int depth) {
    if (++work > 2000000 || depth > 128) {
      throw const FormatException('Configuration comparison work limit');
    }
    if (left is int) left = ExactConfigurationNumber('$left', nativeInteger: left);
    if (right is int) right = ExactConfigurationNumber('$right', nativeInteger: right);
    if (left is ExactConfigurationNumber) {
      return right is ExactConfigurationNumber && left.sameValue(right, preserveNegativeZero: true);
    }
    if (left is Map) {
      return right is Map && left.length == right.length && left.keys.every(
          (key) => right.containsKey(key) && equal(left[key], right[key], depth + 1));
    }
    if (left is List) {
      return right is List && left.length == right.length &&
          Iterable<int>.generate(left.length).every((i) => equal(left[i], right[i], depth + 1));
    }
    return left == right;
  }
  return equal(a, b, 0);
}
