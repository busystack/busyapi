import 'dart:convert';

const r3bCount = '9007199254740993.00';

Map<String, String> r3bSources(String format, {String baseUrl = 'https://api.invalid/v1', String? unused}) {
  Map<String, Object?> ref(String pointer) => {r'$ref': '#$pointer'};
  final item = {
    'parameters': [{'name': 'n', 'in': 'query', 'required': true, 'schema': {'type': 'integer'}}],
    'post': {
      'requestBody': {'required': true, 'content': {'application/json': ref('/components/mediaTypes/Alias')}},
      'responses': {
        '200': {'description': 'Count', 'content': {'application/vnd.count+json': ref('/components/mediaTypes/Payload')},
          'headers': {'X-Count': ref('/components/mediaTypes/Payload/encoding/part/headers/X-Part')}},
        '204': {'description': 'Empty'},
      },
    },
  };
  final entry = {
    'openapi': '3.2.1', 'info': {'title': 'R3b entry', 'version': '1'}, 'servers': [{'url': baseUrl}],
    'paths': {'/first': {r'$ref': 'library.$format#/components/pathItems/Alias'},
      '/second': {r'$ref': 'library.$format#/components/pathItems/Item'}},
  };
  final library = {
    'openapi': '3.2.1', 'info': {'title': 'Original R3b library', 'version': '1'}, 'servers': [{'url': baseUrl}], 'paths': {},
    'components': {
      'pathItems': {'Alias': ref('/components/pathItems/Item'), 'Item': item,
        if (unused == 'path-item') 'Unused': {'get': {'responses': {'204': {'description': 'Inactive'}}}}},
      'mediaTypes': {'Alias': ref('/components/mediaTypes/Payload'), 'Payload': {
        'schema': {'type': 'integer', 'enum': ['EXACT']},
        'examples': {'Count': ref('/components/examples/Count')},
        'encoding': {'part': {'headers': {'X-Part': {'schema': {'type': 'integer'}}}}},
        'prefixEncoding': <Object?>[], 'itemEncoding': <String, Object?>{},
      }, if (unused == 'media') 'Unused': {'schema': {'type': 'boolean'}, 'example': false}},
      'examples': {'Count': {'externalValue': 'count.bin'}},
      'schemas': {'Independent': ref('/components/mediaTypes/Payload/schema')},
      'headers': {'Part': ref('/components/mediaTypes/Payload/encoding/part/headers/X-Part')},
    },
    'x-literal': {'value': 'EXACT', 'flag': false, 'empty': '', r'$ref': 'literal-only'},
  };
  String render(Map<String, Object?> value) {
    final text = format == 'yaml'
        ? '# Preserve R3b ownership 雪\r\n${value.entries.map((entry) =>
            '${jsonEncode(entry.key)}: ${entry.key == 'x-literal' ? '&literal ' : ''}${jsonEncode(entry.value)}').join('\r\n')}\r\n${value.containsKey('x-literal') ? 'x-alias: *literal\r\n' : ''}'
        : '${jsonEncode(value)}\r\n';
    return text.replaceAll('"EXACT"', r3bCount);
  }
  return {'api.$format': render(entry), 'library.$format': render(library), 'count.bin': r3bCount};
}
