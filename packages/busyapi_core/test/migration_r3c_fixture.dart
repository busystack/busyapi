import 'dart:convert';

const r3cSecret = '11111111-1111-4111-8111-111111111111';

String r3cSource(String version, String format, int port) {
  final literal = {'type': 'string', 'enum': ['', 'a%20b', 'a+b', '!']};
  final value = {
    'openapi': version,
    'info': {'title': 'R3c parameters', 'version': '1'},
    'servers': [{'url': 'http://127.0.0.1:$port'}],
    'x-literal-schema': literal,
    'components': {
      'securitySchemes': {'Access': {'type': 'apiKey', 'in': 'cookie', 'name': 'auth'}},
      'parameters': {
        'Whole': {
          'name': 'descriptionOnly', 'in': 'querystring', 'required': true,
          'content': {'application/x-www-form-urlencoded': {
            'schema': {'type': 'object', 'additionalProperties': false, 'required': ['q'], 'properties': {
              'q': {'type': 'string', 'enum': ['', 'a+b', '%20', '/?&=#']},
              'count': {'type': 'integer', 'enum': ['EXACT']}, 'flag': {'type': 'boolean'},
            }},
            'examples': {'Plus': {'dataValue': {'q': 'a+b'}}},
          }},
        },
        'Literal': {'name': 'literal', 'in': 'cookie', 'style': 'cookie', 'schema': literal},
      },
    },
    'security': [{'Access': <String>[]}],
    'paths': {
      '/p': {
        'parameters': [{r'$ref': '#/components/parameters/Whole'}],
        'get': {
          'parameters': [
            {r'$ref': '#/components/parameters/Literal'},
            {'name': 'one', 'in': 'cookie', 'style': 'cookie', 'schema': {'type': 'array', 'maxItems': 1, 'items': {'type': 'string', 'enum': ['', 'safe']}}},
            {'name': 'object', 'in': 'cookie', 'style': 'cookie', 'schema': {'type': 'object', 'maxProperties': 1, 'additionalProperties': false, 'properties': {'right': {'type': 'boolean'}}}},
            {'name': 'auth', 'in': 'cookie', 'style': 'cookie', 'schema': {'type': 'string', 'enum': ['explicit']}},
          ],
          'responses': {'204': {'description': 'Empty'}},
        },
      },
      '/shared': {'get': {'parameters': [{r'$ref': '#/components/parameters/Whole'}], 'responses': {'204': {'description': 'Empty'}}}},
    },
  };
  final text = format == 'json' ? jsonEncode(value) : '# Preserve R3c aliases 雪\r\n${value.entries.map((entry) {
    if (entry.key == 'x-literal-schema') return '${jsonEncode(entry.key)}: &literal ${jsonEncode(entry.value)}';
    final raw = jsonEncode(entry.value).replaceAll('"schema":${jsonEncode(literal)}', '"schema": *literal');
    return '${jsonEncode(entry.key)}: $raw';
  }).join('\r\n')}\r\n';
  return text.replaceAll('"EXACT"', '9007199254740993.00');
}

String r3cConfiguration(String format) => jsonEncode({
  'version': 1, 'roots': [{'name': 'api', 'path': 'api.$format'}],
  'environments': {'manual': {'authentication': {'schemes': {'Access': {'secretRef': r3cSecret}}}, 'variables': {'held': 'unchanged'}}},
  'tests': [{
    'name': 'saved', 'operation': {'method': 'get', 'path': '/p'}, 'environment': 'manual',
    'parameters': {'querystring': {'descriptionOnly': {'q': 'a+b', 'count': 'EXACT', 'flag': false}},
      'cookie': {'literal': 'a%20b', 'one': ['safe'], 'object': {'right': true}}},
    'expect': {'status': 204},
  }],
}).replaceAll('"EXACT"', '9007199254740993.00');
