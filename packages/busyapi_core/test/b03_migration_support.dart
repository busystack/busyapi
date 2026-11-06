import 'dart:convert';

const b03Cases = ['names', 'patterns', 'contains', 'count', 'evaluated-properties', 'evaluated-items', 'content'];
String b03Target(String mode) => ['contains', 'evaluated-items'].contains(mode) ? '3.0.4' : '2.0';

String b03Api(String version, String format, {int? port}) {
  Map media() => {'application/json': {'schema': {r'$ref': '#/components/schemas/Subject'}}};
  final document = {
    'openapi': version, 'info': {'title': 'Original B03 雪', 'version': '1'},
    if (port != null) 'servers': [{'url': 'http://127.0.0.1:$port'}],
    'paths': {if (port != null) '/echo': {'post': {
      'requestBody': {'required': true, 'content': media()},
      'responses': {'200': {'description': 'Echo', 'content': media()}},
    }}},
    'components': {'schemas': {
      'Subject': {r'$ref': './model.yaml#model'},
      'Independent': {r'$ref': './model.yaml#/$defs/Independent'},
    }},
  };
  return format == 'json' ? jsonEncode(document) :
      '# Captured B03 API\r\n${document.entries.map((entry) => '${entry.key}: ${jsonEncode(entry.value)}').join('\r\n')}\r\n';
}

String b03Model(String mode) {
  final number = {'type': 'integer', 'enum': ['EXACT'], 'description': 'Selected number'};
  final Map<String, Object> schema = switch (mode) {
    'names' => {'type': 'object', 'propertyNames': {'pattern': '^n\$'},
      'allOf': [{'properties': {'n': {}, 'other': {}}, 'additionalProperties': false}], 'properties': {'n': number}},
    'patterns' => {'type': 'object',
      'allOf': [{'properties': {'n': {}, 'other': {}}, 'additionalProperties': false}],
      'patternProperties': {'^n': number}},
    'contains' => {'contains': number},
    'count' => {'allOf': [{'items': {'type': 'integer', 'minimum': 0}}],
      'contains': {'type': 'integer', 'description': 'Every matched item'}, 'minContains': 2, 'maxContains': 3},
    'evaluated-properties' => {'allOf': [{r'$ref': '#/$defs/Known'}],
      'properties': {'next': {r'$ref': '#model'}}, 'unevaluatedProperties': {'type': 'boolean', 'description': 'Remaining property'}},
    'evaluated-items' => {'contains': number, 'minContains': 0,
      'unevaluatedItems': {'type': 'string', 'description': 'Remaining item'}},
    'content' => {'type': 'object', 'properties': {'n': number}, 'contentEncoding': 'base16',
      'contentMediaType': 'application/json', 'contentSchema': {'type': 'string', 'title': 'Independent decoded schema'}},
    _ => throw ArgumentError.value(mode),
  };
  final branch = switch (mode) {
    'names' => 'propertyNames', 'patterns' => 'patternProperties/%5En',
    'contains' || 'count' => 'contains', 'evaluated-properties' => 'unevaluatedProperties',
    'evaluated-items' => 'unevaluatedItems', _ => 'contentSchema',
  };
  return ('# Original B03 model\r\n'
      '\$schema: https://json-schema.org/draft/2020-12/schema\r\n'
      '\$id: model.yaml\r\n\$defs:\r\n'
      '  Actual: ${jsonEncode({r'$anchor': 'model', ...schema})}\r\n'
      '  Known: ${jsonEncode({'properties': {'n': number}})}\r\n'
      '  Independent: {"\$ref":"#/\$defs/Actual/$branch"}\r\n'
      'x-values: &literal {number: EXACT, zero: 0, flag: false, nil: null}\r\n'
      'x-alias: *literal\r\n').replaceAll('"EXACT"', '9007199254740993.00').replaceAll('EXACT', '9007199254740993.00');
}

List<(String, bool)> b03Instances(String mode) => switch (mode) {
  'names' => [('{}', true), ('null', false), ('{"n":9007199254740993.00}', true),
    ('{"n":9007199254740992}', false), ('{"other":true}', false), ('{"n\\n":true}', false)],
  'patterns' => [('{}', true), ('null', false), ('{"n":9007199254740993.00}', true),
    ('{"n":9007199254740992}', false), ('{"other":true}', true), ('{"outside":true}', false)],
  'contains' => [('null', true), ('[]', false), ('[9007199254740993.00]', true),
    ('[9007199254740992]', false), ('[false,9007199254740993,9007199254740993]', true)],
  'count' => [('null', true), ('[]', false), ('[1]', false), ('[1,2]', true), ('[1,2,3]', true),
    ('[1,2,3,4]', false), ('[1,"2"]', false)],
  'evaluated-properties' => [('null', true), ('{}', true), ('{"n":9007199254740993.00}', true),
    ('{"n":9007199254740992}', false), ('{"n":9007199254740993,"extra":true}', true),
    ('{"extra":1}', false), ('{"next":{"extra":true}}', true)],
  'evaluated-items' => [('null', true), ('[]', true), ('[9007199254740993.00,"雪"]', true),
    ('[9007199254740992]', false), ('[false]', false), ('["雪","arbitrary tail"]', true)],
  'content' => [('null', false), ('{}', true), ('{"n":9007199254740993.00}', true),
    ('{"n":9007199254740992}', false), ('"not decoded"', false)],
  _ => throw ArgumentError.value(mode),
};
