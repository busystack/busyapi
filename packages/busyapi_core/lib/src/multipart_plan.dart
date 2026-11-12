import 'dart:convert';
import 'dart:typed_data';

import 'model.dart';
import 'multipart_encoding.dart';
import 'request_parameters.dart' show validateRequestMediaType;

/// The semantic engine chooses representations; Core acquires payloads and
/// emits this bounded MIME tree. Raw multipart bytes use the raw-body path.
class MultipartEntityPlan {
  const MultipartEntityPlan(this.contentType, this.parts);
  final String contentType;
  final List<MultipartPartPlan> parts;

  factory MultipartEntityPlan.fromJson(Object? value) {
    var count = 0;
    MultipartEntityPlan read(Object? value, int depth) {
      if (value is! Map ||
          value['contentType'] is! String ||
          value['parts'] is! List ||
          depth > 8)
        _invalid();
      validateRequestMediaType(value['contentType'] as String);
      final parts = <MultipartPartPlan>[];
      for (final raw in value['parts'] as List) {
        if (raw is! Map ||
            ++count > 2048 ||
            raw['contentType'] is! String ||
            raw['headers'] is! List ||
            raw['name'] != null && raw['name'] is! String ||
            raw['allowDisposition'] != null &&
                raw['allowDisposition'] is! bool ||
            raw['text'] != null && raw['text'] is! String)
          _invalid();
        validateRequestMediaType(raw['contentType'] as String);
        final transfer = MultipartTransferEncoding.fromJson(raw['transfer']);
        final payloads = [
          raw['children'],
          raw['urlencoded'],
          raw['file'],
          raw['bytes'],
        ].where((value) => value != null).length;
        if (payloads != 1 ||
            raw['file'] != null &&
                (raw['file'] is! int || (raw['file'] as int) < 0) ||
            raw['bytes'] != null &&
                (raw['bytes'] is! String || raw['text'] is! String))
          _invalid();
        Uint8List? bytes;
        if (raw['bytes'] is String) {
          try {
            bytes = base64Decode(raw['bytes'] as String);
          } on FormatException {
            _invalid();
          }
        }
        parts.add(
          MultipartPartPlan(
            name: raw['name'] as String?,
            contentType: raw['contentType'] as String,
            transfer: transfer,
            headers: List.unmodifiable(
              (raw['headers'] as List).map(
                (header) => MultipartHeaderLine.fromJson(
                  header,
                  allowDisposition: raw['allowDisposition'] == true,
                ),
              ),
            ),
            file: raw['file'] as int?,
            bytes: bytes,
            text: raw['text'] as String?,
            children: raw['children'] == null
                ? null
                : read(raw['children'], depth + 1),
            urlencoded: raw['urlencoded'] == null
                ? null
                : MultipartUrlencodedPlan.fromJson(raw['urlencoded']),
          ),
        );
      }
      return MultipartEntityPlan(
        value['contentType'] as String,
        List.unmodifiable(parts),
      );
    }

    return read(value, 0);
  }
}

class MultipartPartPlan {
  const MultipartPartPlan({
    required this.contentType,
    required this.transfer,
    this.name,
    this.headers = const [],
    this.file,
    this.bytes,
    this.text,
    this.children,
    this.urlencoded,
    this.omitContentType = false,
  });
  final String? name, text;
  final String contentType;
  final MultipartTransferEncoding transfer;
  final List<MultipartHeaderLine> headers;
  final int? file;
  final Uint8List? bytes;
  final MultipartEntityPlan? children;
  final MultipartUrlencodedPlan? urlencoded;
  final bool omitContentType;
}

class MultipartUrlencodedPlan {
  const MultipartUrlencodedPlan(
    this.raw,
    this.declaration,
    this.mediaTypes,
    this.mediaValues,
  );
  final String raw;
  final Map<String, Object?> declaration;
  final Map<String, String> mediaTypes;
  final Map<String, List<String>> mediaValues;
  factory MultipartUrlencodedPlan.fromJson(Object? value) {
    if (value is! Map ||
        value['raw'] is! String ||
        value['declaration'] is! Map ||
        value['mediaTypes'] is! Map ||
        value['mediaValues'] != null && value['mediaValues'] is! Map)
      _invalid();
    try {
      return MultipartUrlencodedPlan(
        value['raw'] as String,
        Map<String, Object?>.unmodifiable(value['declaration'] as Map),
        Map<String, String>.unmodifiable(value['mediaTypes'] as Map),
        Map.unmodifiable({
          for (final entry
              in (value['mediaValues'] as Map? ?? const {}).entries)
            entry.key as String: List<String>.unmodifiable(entry.value as List),
        }),
      );
    } on TypeError {
      _invalid();
    }
  }
}

Never _invalid() => throw CoreFailure(
  'request.multipart.protocol',
  'Invalid bounded multipart preparation.',
);
