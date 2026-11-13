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
          raw['file'],
          raw['bytes'],
        ].where((value) => value != null).length;
        if (payloads != 1 ||
            raw['file'] != null &&
                (raw['file'] is! int || (raw['file'] as int) < 0) ||
            raw['bytes'] != null &&
                (raw['bytes'] is! String ||
                    transfer.schemaEncoded && raw['text'] is! String))
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
    this.omitContentType = false,
  });
  final String? name, text;
  final String contentType;
  final MultipartTransferEncoding transfer;
  final List<MultipartHeaderLine> headers;
  final int? file;
  final Uint8List? bytes;
  final MultipartEntityPlan? children;
  final bool omitContentType;
}

Never _invalid() => throw CoreFailure(
  'request.multipart.protocol',
  'Invalid bounded multipart preparation.',
);
