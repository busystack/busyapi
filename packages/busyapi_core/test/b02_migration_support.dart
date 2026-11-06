import 'dart:convert';

// Shared production fixtures for Core and native review. Exact values are
// authored as CST numbers; test expectations never round them through double.
const b02Cases = ['condition', 'dependency', 'tail', 'finite-tuple', 'nested-dependency', 'flat-items'];

String b02Api(String version, String format, {int? port, String? mode}) {
  Map media() => {'application/json': {'schema': {r'$ref': '#/components/schemas/Subject'}}};
  final document = {
    'openapi': version,
    'info': {'title': 'Original B02 雪', 'version': '1'},
    if (port != null) 'servers': [{'url': 'http://127.0.0.1:$port'}],
    'paths': {if (port != null) '/echo': {'post': {
      if (mode == 'flat-items') 'parameters': [{r'$ref': '#/components/parameters/Values'}],
      'requestBody': {'required': true, 'content': media()},
      'responses': {'200': {'description': 'Echo', 'content': media(),
        if (mode == 'flat-items') 'headers': {'X-Values': {r'$ref': '#/components/headers/Alias'}},
      }},
    }}},
    'components': {'schemas': {
      'Subject': {r'$ref': './model.yaml#model'},
      'Independent': {r'$ref': './model.yaml#/$defs/Independent'},
    }, if (mode == 'flat-items') ...{
      'parameters': {'Values': {'name': 'values', 'in': 'query', 'style': 'form', 'explode': true,
        'schema': {r'$ref': '#/components/schemas/Subject'}}},
      'headers': {'Alias': {r'$ref': '#/components/headers/Actual'},
        'Actual': {'schema': {r'$ref': '#/components/schemas/Subject'}}},
    }},
  };
  return format == 'json' ? jsonEncode(document) :
      '# Captured B02 API\r\n${document.entries.map((entry) => '${entry.key}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n';
}

String b02Model(String mode) {
  final Map<String, Object> schema = switch (mode) {
    'condition' => {
      'if': {'type': 'object'},
      'then': {'type': 'object', 'required': ['n'], 'properties': {
        'n': {'type': 'integer', 'minimum': 'EXACT', 'description': 'Present number'},
        'next': {r'$ref': '#model'},
      }},
    },
    'dependency' => {
      'type': 'object', 'required': ['seed'],
      'allOf': [
        {'dependentRequired': {'seed': ['name']}},
        {'dependentSchemas': {'name': {'required': ['n'], 'properties': {
          'n': {'type': 'integer', 'enum': ['EXACT'], 'description': 'Triggered value'},
        }}}},
      ],
      'properties': {'seed': <String, Object>{}, 'name': {'type': 'string'}, 'n': {'type': 'integer'}},
    },
    'tail' => {
      'type': 'array',
      'prefixItems': [{'type': 'integer', 'minimum': 8, 'maximum': 20, 'multipleOf': 4}],
      'items': {'type': 'number', 'minimum': 0, 'maximum': 20, 'multipleOf': 2},
    },
    'finite-tuple' => {
      'type': 'array', 'maxItems': 3,
      'prefixItems': [{'enum': ['EXACT']}, {'type': 'boolean'}],
      'unevaluatedItems': {'type': 'integer', 'minimum': 0, 'maximum': 1},
    },
    'nested-dependency' => {
      'required': ['seed'], 'dependentSchemas': {'seed': {
        'type': 'object', 'required': ['seed'],
        'if': {'required': ['seed']},
        'then': {'required': ['n'], 'properties': {
          'n': {'type': 'integer', 'enum': ['EXACT'], 'description': 'Nested selected value'},
        }},
        'properties': {'seed': {'type': 'boolean'}, 'n': {'type': 'integer'}, 'next': {r'$ref': '#model'}},
      }},
    },
    'flat-items' => {
      'type': 'array', 'prefixItems': [{r'$dynamicRef': '#item'}],
      'items': {r'$dynamicRef': '#item'}, 'maxItems': 3,
    },
    _ => throw ArgumentError.value(mode),
  };
  final branch = switch (mode) {
    'condition' => 'then',
    'dependency' => 'allOf/1/dependentSchemas/name',
    'nested-dependency' => 'dependentSchemas/seed',
    _ => 'prefixItems/0',
  };
  final text = '# Original B02 model\r\n'
      '\$schema: https://json-schema.org/draft/2020-12/schema\r\n'
      '\$id: model.yaml\r\n\$defs:\r\n'
      '  Actual: ${jsonEncode({r'$anchor': 'model', ...schema})}\r\n'
      '${mode == 'flat-items' ? '  Item: {"\$dynamicAnchor":"item","type":"integer","format":"int64","minimum":EXACT}\r\n' : ''}'
      '  Independent: {"\$ref":"#/\$defs/Actual/$branch"}\r\n'
      'x-values: &literal {number: EXACT, zero: 0, flag: false, nil: null}\r\n'
      'x-alias: *literal\r\n';
  return text.replaceAll('"EXACT"', '9007199254740993.00').replaceAll('EXACT', '9007199254740993.00');
}

List<(String, bool)> b02Instances(String mode) => switch (mode) {
  'condition' => [('null', true), ('[]', true), ('{}', false),
    ('{"n":9007199254740993.00}', true), ('{"n":9007199254740992}', false),
    ('{"n":9007199254740993,"next":{}}', false)],
  'dependency' => [('null', false), ('{}', false), ('{"seed":false}', false),
    ('{"seed":false,"name":"雪"}', false),
    ('{"seed":false,"name":"雪","n":9007199254740993.00}', true),
    ('{"seed":false,"name":"雪","n":9007199254740992}', false)],
  'tail' => [('null', false), ('[]', true), ('[8]', true), ('[6]', false),
    ('[8,2,20]', true), ('[8,3]', false), ('[24]', false)],
  'finite-tuple' => [('null', false), ('[]', true), ('[9007199254740993.00]', true),
    ('[9007199254740992]', false), ('[9007199254740993,true,1]', true),
    ('[9007199254740993,true,2]', false), ('[9007199254740993,true,1,0]', false)],
  'nested-dependency' => [('null', true), ('[]', true), ('{}', false), ('{"seed":false}', false),
    ('{"seed":false,"n":9007199254740993.00}', true), ('{"seed":false,"n":9007199254740992}', false),
    ('{"seed":false,"n":9007199254740993,"next":{"seed":true}}', false)],
  'flat-items' => [('null', false), ('[]', true), ('[9007199254740993.00]', true),
    ('[9007199254740992]', false), ('[9007199254740993,9007199254740994]', true),
    ('[9007199254740993,9007199254740993,9007199254740993,9007199254740993]', false),
    ('9007199254740993', false), ('9007199254740992', false)],
  _ => throw ArgumentError.value(mode),
};
