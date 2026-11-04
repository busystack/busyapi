import 'dart:convert';

const mixedHolderSecret = '11111111-1111-4111-8111-111111111111';
const mixedHolderWire = '{"entry":"chosen","n":9007199254740993.00}';

Map<String, String> mixedHolderDocuments(String foreignVersion, String server, {bool invalid = false}) {
  final entryVersion = foreignVersion == '3.2.1' ? '3.1.2' : '3.2.1';
  Map<String, dynamic> api(String version, String name) => {
    'openapi': version, 'info': {'title': name, 'version': 'business'},
    'servers': [{'url': server}], 'paths': <String, dynamic>{},
    'components': {
      'securitySchemes': {'Access': {'type': 'apiKey', 'in': 'header', 'name': 'X-$name'}},
      'schemas': {'Choice': {'type': 'object', 'x-entry': name}},
      'links': {'Next': {'operationId': 'shared'}},
    },
  };
  final first = api(entryVersion, 'First'), second = api(foreignVersion, 'Second');
  final schema = {
    if (foreignVersion != '3.0.4') r'$dynamicAnchor': 'node',
    'type': 'object', 'required': ['entry', 'n'],
    'properties': {
      'entry': {'type': 'string'}, 'n': {'type': 'integer', 'enum': ['EXACT']},
      if (foreignVersion != '3.0.4') 'child': {r'$dynamicRef': '#node'},
    },
    'discriminator': {'propertyName': 'entry', 'mapping': {'chosen': 'Choice'}},
    'description': '[Guide](guide.md)',
  };
  (first['paths'] as Map)['/p'] = {r'$ref': 'b.yaml#/paths/~1p'};
  (second['paths'] as Map)['/p'] = {'post': {
    'operationId': 'shared', 'security': [{'Access': <String>[]}],
    'requestBody': {'required': true, 'content': {'application/json': {'schema': {
      r'$ref': '#/paths/~1p/post/responses/200/content/application~1json/schema',
    }}}},
    'responses': {'200': {'description': 'Value', 'content': {'application/json': {
      'schema': invalid ? {r'$ref': '#/missing'} : schema,
    }}, 'links': {'Next': {r'$ref': '#/components/links/Next'}}}},
  }};
  if (foreignVersion == '3.0.4') {
    // operationRef identifies the foreign operation without substituting its
    // legacy object family through a modern Reference Object.
    (first['paths'] as Map).clear();
    (first['paths'] as Map)['/local'] = {'post': {
      'operationId': 'local', 'security': [{'Access': <String>[]}],
      'requestBody': {'required': true, 'content': {'application/json': {'schema': schema}}},
      'responses': {'200': {'description': 'Local', 'content': {'application/json': {'schema': schema}}}},
    }};
    (first['components'] as Map)['links']['Use'] = {'operationRef': 'b.yaml#/paths/~1p/post'};
  }
  final literal = {'path': (second['paths'] as Map)['/p'], 'exact': 'EXACT',
    'flag': false, 'empty': '', 'zero': 0, 'lookalike': {r'$ref': 'literal-only'}};
  String exact(Object? value) => jsonEncode(value).replaceAll('"EXACT"', '9007199254740993.00');
  return {
    'a.yaml': '# Keep first 雪\r\n${exact(first)}\r\n',
    'b.yaml': '# Keep foreign 雪\r\n${second.entries.map((entry) => '${entry.key}: ${exact(entry.value)}').join('\r\n')}\r\n'
        'x-history: &history ${exact(literal)}\r\nx-alias: *history\r\n',
    'busyapi.yaml': 'version: 1\nroots: [{name: first, path: a.yaml}, {name: second, path: b.yaml}]\n'
        'environments:\n  manual:\n    authentication:\n      alternative: 0\n      schemes:\n'
        '        Access: {secretRef: $mixedHolderSecret}\n',
  };
}

Map<String, String> mixedLegacyHolderDocuments(String server, {String restrictedVersion = '2.0'}) {
  final uri = Uri.parse(server);
  Map<String, Object?> response(bool modern) => modern
    ? {'description': 'Value', 'content': {'application/json': {'schema': {r'$ref': '#/components/schemas/Model'}}}}
    : {'description': 'Value', 'schema': {r'$ref': '#/definitions/Model'}};
  Map<String, Object?> api(bool modern, String name) => {
    if (modern || restrictedVersion == '3.0.4') ...{'openapi': modern ? '3.1.2' : restrictedVersion, 'servers': [{'url': server}]}
    else ...{'swagger': '2.0', 'host': uri.authority, 'basePath': uri.path.isEmpty ? '/' : uri.path,
      'schemes': [uri.scheme], 'produces': ['application/json']},
    'info': {'title': name, 'version': 'business', 'description': '[Guide](guide.md)'},
    'paths': {'/p': {r'$ref': '../models/shared.yaml#/Path'}, '/value': {'get': {'responses': {'200': response(modern || restrictedVersion == '3.0.4')}}}},
    if (modern || restrictedVersion == '3.0.4') 'components': {
      'schemas': {'Model': {r'$ref': '../models/shared.yaml#/Model'}, if (modern) 'Node': {
        r'$id': 'https://schemas.invalid/legacy-holder-node', 'type': 'array',
        'items': {r'$ref': 'https://schemas.invalid/legacy-holder-node'},
      }}, 'securitySchemes': {'Access': {'type': 'apiKey', 'in': 'header', 'name': 'X-$name'}},
    } else ...{
      'definitions': {'Model': {r'$ref': '../models/shared.yaml#/Model'}},
      'securityDefinitions': {'Access': {'type': 'apiKey', 'in': 'header', 'name': 'X-$name'}},
    },
  };
  return {
    'legacy/api.yaml': '# Keep legacy 雪\r\n${jsonEncode(api(false, 'First'))}\r\n',
    'modern/api.yaml': '# Keep modern 雪\r\n${jsonEncode(api(true, 'Second'))}\r\n',
    'models/shared.yaml': 'Path: {post: {operationId: shared, security: [{Access: []}], responses: {204: {description: Empty}}}}\r\n'
        'Model: &model {type: integer, enum: [9007199254740993.00], description: "[Model](model.md)"}\r\n'
        'Literal: *model\r\nx-literal: {flag: false, empty: "", exact: 9007199254740993.00, \$ref: literal-only}\r\n',
    'busyapi.yaml': 'version: 1\nroots: [{name: legacy, path: legacy/api.yaml}, {name: modern, path: modern/api.yaml}]\n'
        'environments:\n  manual:\n    authentication:\n      alternative: 0\n      schemes:\n'
        '        Access: {secretRef: $mixedHolderSecret}\n',
  };
}
