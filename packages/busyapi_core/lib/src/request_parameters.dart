import 'dart:io';

import 'model.dart';
import 'request_text_encoding.dart';
import 'swagger_serialization.dart';

CoreFailureSource? requestDefinitionSource(Map value) {
  final source = value['definition'] ?? value['source'];
  if (source case {
    'resource': String resource,
    'pointer': String pointer,
    'range': [int start, int end],
  }) {
    if (start >= 0 && end >= start)
      return CoreFailureSource(resource, pointer, SourceRange(start, end));
  }
  return null;
}

List<(String, String)> serializedParameter(Map parameter, String text) {
  final location = parameter['in'];
  final url =
      location == 'path' || location == 'query' || location == 'querystring';
  if ((url
              ? RegExp(r'[\x00-\x20\x7f#]')
              : location == 'header'
              ? RegExp(r'[\x00-\x08\x0a-\x1f\x7f]')
              : RegExp(r'[\x00-\x1f\x7f]'))
          .hasMatch(text) ||
      url && RegExp(r'%(?![0-9A-Fa-f]{2})').hasMatch(text)) {
    throw CoreFailure(
      'request.example.serialization',
      'The serialized parameter contains invalid URI/header structure. Edit its complete representation.',
    );
  }
  if (location == 'query' || location == 'querystring') return [('', text)];
  if (location == 'path' && (text.contains('/') || text.contains('?'))) {
    throw CoreFailure(
      'request.example.serialization',
      'Serialized path delimiters must be percent encoded.',
    );
  }
  if (location == 'cookie') {
    if (text.isEmpty) return [];
    return text.split(';').map((part) {
      final at = part.indexOf('=');
      if (at <= 0) {
        throw CoreFailure(
          'request.example.serialization',
          'Serialized cookies require name=value pairs.',
        );
      }
      return (part.substring(0, at).trim(), part.substring(at + 1));
    }).toList();
  }
  return [(parameter['name'] as String, text)];
}

/// Independent admission of a reviewed raw-query projection uses the same
/// exploded query serializer as HTTP execution. Numbers keep their captured
/// exact spelling through ExactConfigurationNumber.toString().
String queryRepresentation(Map fields, {Map<String, Map>? declarations}) {
  final pairs = <(String, String)>[];
  for (final entry in fields.entries) {
    if (entry.key is! String)
      throw const FormatException('Expected query names');
    pairs.addAll(
      serializeParameter(
        declarations?[entry.key] ??
            {
              'family': '3.1',
              'name': entry.key,
              'in': 'query',
              'style': 'form',
              'explode': true,
            },
        entry.value,
        '',
        structured: true,
      ),
    );
  }
  final text = pairs
      .map((pair) => '${encodeParameter(pair.$1, false)}=${pair.$2}')
      .join('&');
  // HTTP execution frames the same serialized fields with Uri.parse, whose
  // query mask also escapes literal brackets from reserved expansion.
  return Uri.parse('?$text').query;
}

/// Header examples reuse the request serializer, including exact numeric
/// leaves returned by the captured parameter-value projection.
String headerExampleRepresentation(
  Map header,
  Object? value,
  String original,
) => serializeParameter(
  {
    'family': header['family'],
    'in': 'header',
    'name': header['name'],
    'style': 'simple',
    'explode': header['explode'] == true,
  },
  value,
  original,
  structured: true,
).single.$2;

List<(String, String)> serializeParameter(
  Map parameter,
  Object? value,
  String original, {
  bool structured = false,
  String? mediaValue,
  bool mediaValueEncoded = false,
  String Function(String)? encodeValue,
}) {
  final name = parameter['name'] as String;
  if (parameter['content'] is List &&
      (parameter['content'] as List).isNotEmpty) {
    final content = (parameter['content'] as List).whereType<Map>().toList();
    if (content.length != 1) {
      throw CoreFailure(
        'request.parameter.content',
        'A content parameter must select exactly one media declaration.',
      );
    }
    try {
      if (mediaValue == null)
        validateTextCharset(content.single['mediaType'] as String, [
          original,
          if ((content.single['mediaType'] as String).toLowerCase().startsWith(
                'application/x-www-form-urlencoded',
              ) &&
              value is Map)
            for (final entry in value.entries) ...[
              '${entry.key}',
              '${entry.value}',
            ],
        ]);
    } on CoreFailure catch (error) {
      throw CoreFailure(error.code, 'Parameter $name: ${error.message}');
    }
    final media = (content.single['mediaType'] as String)
        .split(';')
        .first
        .toLowerCase();
    var representation = mediaValue ?? original;
    final jsonMedia = media == 'application/json' || media.endsWith('+json');
    if (structured &&
        mediaValue == null &&
        !jsonMedia &&
        media != 'application/x-www-form-urlencoded') {
      if (media != 'text/plain' || value is Map || value is List) {
        throw CoreFailure(
          'request.parameter.media',
          'Parameter $name has no supported structured serializer for this media type. Use a literal serialized representation.',
        );
      }
      representation = value == null ? 'null' : '$value';
    }
    if (media == 'application/x-www-form-urlencoded' && value is Map) {
      if (value.values.any(
        (v) =>
            v is Map ||
            v is List && v.any((item) => item is Map || item is List),
      )) {
        throw CoreFailure(
          'request.parameter.media',
          'Parameter $name requires a complex form serializer. Use an explicitly serialized media example.',
        );
      }
      final fields = <String>[];
      final encoding = content.single['encoding'] as Map? ?? const {};
      for (final entry in value.entries) {
        final rule = encoding[entry.key] as Map? ?? const {};
        final styled = [
          'style',
          'explode',
          'allowReserved',
        ].any(rule.containsKey);
        if (styled) {
          final style = rule['style'] as String? ?? 'form';
          final pairs = serializeParameter(
            {
              'name': entry.key,
              'in': 'query',
              'style': style,
              'explode': rule['explode'] ?? (style == 'form'),
              'allowReserved': rule['allowReserved'] == true,
            },
            entry.value,
            '',
            structured: true,
            encodeValue: (text) =>
                encodeFormStyle(text, rule['allowReserved'] == true),
          );
          fields.addAll(
            pairs.map(
              (pair) => '${encodeFormStyle(pair.$1, false)}=${pair.$2}',
            ),
          );
        } else {
          for (final item
              in entry.value is List ? entry.value as List : [entry.value]) {
            fields.add(
              '${Uri.encodeQueryComponent(entry.key as String)}=${Uri.encodeQueryComponent(item == null ? 'null' : '$item')}',
            );
          }
        }
      }
      representation = fields.join('&');
    }
    if (mediaValue == null)
      validateTextCharset(content.single['mediaType'] as String, [
        representation,
      ]);
    return [
      (
        name,
        mediaValueEncoded
            ? representation
            : parameter['in'] == 'path'
            ? encodeParameter(representation, false)
            : parameter['in'] == 'query'
            ? encodeParameter(
                representation,
                parameter['allowReserved'] == true,
              )
            : parameter['in'] == 'querystring'
            ? _wholeQuery(parameter, representation)
            : representation,
      ),
    ];
  }
  if (parameter['family'] == '2.0')
    return serializeSwaggerParameter(parameter, value);
  final location = parameter['in'] as String,
      style =
          parameter['style'] as String? ??
          (location == 'query' || location == 'cookie' ? 'form' : 'simple'),
      explode = parameter['explode'] == true;
  String scalar(Object? item) {
    if (item is List || item is Map) {
      throw CoreFailure(
        'request.parameter.nesting',
        'This parameter style does not define nested data values. Select its declared content or a serialized example.',
        kind: CoreFailureKind.unsupported,
        source: requestDefinitionSource(parameter),
      );
    }
    if (item == null) return 'null';
    if (item is bool) return item ? 'true' : 'false';
    if (item is String) return item;
    if (item is num &&
        value == item &&
        RegExp(r'^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$')
            .hasMatch(original.trim())) {
      return original.trim();
    }
    return '$item';
  }

  final array = value is List ? value.map(scalar).toList() : null;
  final object = value is Map
      ? <String, String>{
          for (final entry in value.entries)
            '${entry.key}': scalar(entry.value),
        }
      : null;
  // RFC 6570 omits zero-member composite variables. An empty string still
  // emits a field and is not an omitted collection.
  if ((location == 'query' || location == 'cookie') &&
      (array != null && array.isEmpty || object != null && object.isEmpty))
    return [];
  if (location == 'path' &&
      (array != null && array.isEmpty || object != null && object.isEmpty))
    return [(name, '')];
  List<String> flattened(String delimiter, {bool equals = false}) {
    if (array != null) return array;
    if (object != null) {
      return [
        for (final entry in object.entries)
          if (equals)
            '${entry.key}${entry.value.isEmpty ? '' : '='}${entry.value}'
          else ...[
            entry.key,
            entry.value,
          ],
      ];
    }
    return [scalar(value)];
  }

  switch (location) {
    case 'path':
      if (style == 'label') {
        final serialized = object != null && explode
            ? object.entries
                  .map(
                    (entry) =>
                        '${encodeParameter(entry.key, false)}${entry.value.isEmpty ? '' : '='}${encodeParameter(entry.value, false)}',
                  )
                  .join('.')
            : flattened(',')
                  .map((item) => encodeParameter(item, false))
                  .join(array != null && explode ? '.' : ',');
        return [(name, '.$serialized')];
      }
      if (style == 'matrix') {
        if (object != null && explode) {
          return [
            (
              name,
              object.entries
                  .map(
                    (e) =>
                        ';${encodeParameter(e.key, false)}${e.value.isEmpty ? '' : '='}${encodeParameter(e.value, false)}',
                  )
                  .join(),
            ),
          ];
        }
        if (array != null && explode) {
          return [
            (
              name,
              array
                  .map(
                    (item) =>
                        ';${encodeParameter(name, false)}${item.isEmpty ? '' : '='}${encodeParameter(item, false)}',
                  )
                  .join(),
            ),
          ];
        }
        return [
          (
            name,
            ';${encodeParameter(name, false)}${value == '' ? '' : '='}${flattened(',').map((v) => encodeParameter(v, false)).join(',')}',
          ),
        ];
      }
      final serialized = object != null && explode
          ? object.entries
                .map(
                  (entry) =>
                      '${encodeParameter(entry.key, false)}${entry.value.isEmpty ? '' : '='}${encodeParameter(entry.value, false)}',
                )
                .join(',')
          : flattened(',')
                .map((item) => encodeParameter(item, false))
                .join(',');
      return [(name, serialized)];
    case 'header':
      return [
        (name, flattened(',', equals: object != null && explode).join(',')),
      ];
    case 'cookie':
    case 'query':
      if (location == 'cookie') {
        if (style == 'cookie' && parameter['family'] != '3.2' ||
            parameter['family'] == '3.2' && parameter['explode'] == false) {
          throw CoreFailure(
            'request.cookie.style',
            'This cookie style/explode declaration is invalid for its OpenAPI version.',
          );
        }
        if (style == 'form' && !explode && (array != null || object != null)) {
          final fields = flattened(',');
          // RFC6570 omits empty collections. One item needs no delimiter;
          // a structural comma would violate RFC6265 cookie-octet syntax.
          if (fields.isEmpty) return [];
          if (fields.length > 1) {
            throw CoreFailure(
              'request.cookie.encoding',
              'This unexploded form cookie needs a comma delimiter forbidden by Cookie syntax. Select a declared representation with an explicit encoding.',
              kind: CoreFailureKind.unsupported,
              source: requestDefinitionSource(parameter),
            );
          }
        }
        if (style != 'cookie' && style != 'form') {
          throw CoreFailure(
            'request.cookie.style',
            'Unsupported cookie style.',
          );
        }
      }
      String encode(String text) => encodeValue != null
          ? encodeValue(text)
          : location == 'query'
          ? encodeParameter(text, parameter['allowReserved'] == true)
          : style == 'form'
          ? encodeParameter(text, false)
          : text;
      String fieldName(String text) => location == 'cookie' && style == 'form'
          ? encodeParameter(text, false)
          : text;
      if (style == 'deepObject') {
        if (object == null) {
          throw CoreFailure(
            'request.parameter.style',
            'deepObject parameter $name requires an object value',
          );
        }
        return [
          for (final entry in object.entries)
            ('$name[${entry.key}]', encode(entry.value)),
        ];
      }
      final separator = style == 'spaceDelimited'
          ? ' '
          : style == 'pipeDelimited'
          ? '|'
          : style == 'tabDelimited'
          ? '\t'
          : ',';
      if (explode && array != null) {
        return [for (final item in array) (fieldName(name), encode(item))];
      }
      if (explode && object != null) {
        return [
          for (final entry in object.entries)
            (fieldName(entry.key), encode(entry.value)),
        ];
      }
      return [
        (
          fieldName(name),
          flattened(separator)
              .map(encode)
              .join(
                location == 'query' && separator != ','
                    ? encodeValue?.call(separator) ??
                          encodeParameter(separator, false)
                    : separator,
              ),
        ),
      ];
    case 'querystring':
      return [('', scalar(value))];
    default:
      throw CoreFailure(
        'request.parameter.location',
        'Unsupported parameter location',
      );
  }
}

String _wholeQuery(Map parameter, String text) {
  final content = (parameter['content'] as List).whereType<Map>().toList();
  if (content.length != 1) {
    throw CoreFailure(
      'request.querystring.media',
      'Select a single whole-query representation.',
    );
  }
  final media = (content.single['mediaType'] as String)
      .split(';')
      .first
      .toLowerCase();
  if (media == 'application/x-www-form-urlencoded') {
    if (RegExp(r'[\x00-\x20\x7f#]').hasMatch(text) ||
        RegExp(r'%(?![0-9A-Fa-f]{2})').hasMatch(text)) {
      throw CoreFailure(
        'request.querystring.encoding',
        'Whole-query form content must already be valid form-encoded pairs.',
      );
    }
    return text;
  }
  if (media == 'application/json' ||
      media.endsWith('+json') ||
      media == 'text/plain') {
    return encodeParameter(text, false);
  }
  throw CoreFailure(
    'request.querystring.media',
    'This whole-query media representation is unsupported.',
  );
}

String encodeParameter(String value, bool allowReserved) {
  var encoded = Uri.encodeComponent(value).replaceAllMapped(
    RegExp(r"[!'()*]"),
    (m) => '%${m[0]!.codeUnitAt(0).toRadixString(16).toUpperCase()}',
  );
  if (allowReserved) {
    const retained = {
      '%3A': ':',
      '%2F': '/',
      '%3F': '?',
      '%5B': '[',
      '%5D': ']',
      '%40': '@',
      '%21': '!',
      '%24': r'$',
      '%27': "'",
      '%28': '(',
      '%29': ')',
      '%2A': '*',
      '%2B': '+',
      '%2C': ',',
      '%3B': ';',
    };
    for (final entry in retained.entries) {
      encoded = encoded
          .replaceAll(entry.key, entry.value)
          .replaceAll(entry.key.toLowerCase(), entry.value);
    }
    // Reserved expansion passes existing percent triples through once. Do
    // this after restoring reserved characters so %26/%3D/%23 stay encoded.
    encoded = encoded.replaceAllMapped(
      RegExp(r'%25([0-9A-Fa-f]{2})'),
      (match) => '%${match[1]}',
    );
  }
  return encoded;
}

// OAS Encoding Objects use query expansion with additional form delimiters
// escaped. A literal plus must survive form decoding as plus, not space.
String encodeFormStyle(String value, bool allowReserved) => encodeParameter(
  value,
  allowReserved,
).replaceAll('+', '%2B').replaceAll('[', '%5B').replaceAll(']', '%5D');

void validateRawTextCharset(String mediaType, Iterable<String> values) {
  validateRequestMediaType(mediaType);
  RequestTextEncoding.forMedia(mediaType, rawBody: true).validate(values);
}

void validateTextCharset(String mediaType, Iterable<String> values) {
  validateRequestMediaType(mediaType);
  RequestTextEncoding.forMedia(mediaType).validate(values);
}

void validateRequestMediaType(String value) {
  try {
    final parsed = ContentType.parse(value);
    if (RegExp(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+/[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
            .hasMatch(parsed.mimeType) &&
        !RegExp(r'[\x00-\x1f\x7f]').hasMatch(value)) {
      return;
    }
  } on FormatException {
    /* The authored wire media type remains invalid. */
  } on HttpException {
    /* The pinned header parser also rejects malformed parameters this way. */
  }
  throw CoreFailure('request.media-type', 'Choose a valid media type');
}
