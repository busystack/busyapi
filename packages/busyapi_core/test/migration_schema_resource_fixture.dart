import 'dart:convert';

Map<String, String> schemaResourceDocuments({bool invalid = false}) {
  final payload = {
    'Forward': {r'$ref': '#/Example/value/Node'},
    'Node': {r'$dynamicAnchor': 'node', 'type': 'object', 'required': ['n'],
      'properties': {'n': {r'$ref': 'nested/#number'}, 'tag': {'type': 'string'}, 'next': {r'$ref': 'middle'}},
      r'$defs': {'Number': {r'$id': 'nested/', r'$schema': invalid ? 'https://dialects.invalid/unknown' : 'https://json-schema.org/draft/2020-12/schema',
        r'$anchor': 'number', 'type': 'integer', 'enum': ['EXACT']}}},
    'Middle': {r'$id': 'middle', r'$dynamicRef': 'parts.yaml#node'},
    'Untouched': {r'$id': 'literal-id', r'$schema': 'literal-dialect', r'$dynamicRef': 'literal-dynamic', 'n': 'EXACT', 'flag': false, 'empty': ''},
  };
  Map<String, Object?> api(String version, String name) => {
    'openapi': version, 'info': {'title': name, 'version': 'business'},
    'servers': [{'url': 'https://api.invalid'}],
    if (name == 'First') 'jsonSchemaDialect': 'https://json-schema.org/draft/2020-12/schema',
    'paths': {'/p': {'get': {'responses': {'200': {'description': 'Value', 'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Strict'}}}}}}}},
    'components': {'schemas': {
      'Node': {r'$ref': '../data/parts.yaml#/Example/value/Forward'},
      'Bridge': {r'$ref': '../data/parts.yaml#/Example/value/Middle'},
      'Strict': {r'$id': 'strict', r'$dynamicAnchor': 'node', r'$ref': '../data/parts.yaml#/Example/value/Forward',
        'required': ['tag'], 'properties': {'tag': {'const': name}}},
    }, 'examples': {'Payload': {r'$ref': '../data/parts.yaml#/Example'}}},
  };
  String exact(Object? value) => jsonEncode(value).replaceAll('"EXACT"', '9007199254740993.00');
  return {
    'first/api.yaml': '# Keep first resource context 雪\r\n${exact(api('3.2.1', 'First'))}\r\n',
    'second/api.yaml': '# Keep second resource context 雪\r\n${exact(api('3.1.2', 'Second'))}\r\n',
    'data/parts.yaml': '# Resource values 雪\r\nExample:\r\n  value: &resources ${exact(payload)}\r\nLiteral: *resources\r\n',
    'busyapi.yaml': 'version: 1\nroots: [{name: first, path: first/api.yaml}, {name: second, path: second/api.yaml}]\n',
  };
}

List<String> schemaResourceInstances(String name) => [
  '{"n":9007199254740993}', '{"n":9007199254740993,"tag":"$name"}',
  '{"n":9007199254740993,"tag":"$name","next":{"n":9007199254740993}}',
  '{"n":9007199254740993,"tag":"$name","next":{"n":9007199254740993,"tag":"$name"}}',
  '{"n":9007199254740992}', 'null',
];
