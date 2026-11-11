const {test} = require('node:test');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const {SourceDocument, valueType} = require('./dist/document.cjs');
const {analyse, createGraph} = require('./dist/model.cjs');
const {planMigration} = require('./dist/migration.cjs');
const {evaluateSchemas} = require('./dist/schema_evaluation.cjs');

function capture(format, schemas, paths = {}, version = '3.2.1') {
    const root = 'file:///value-types/api.' + format;
    const document = {
        openapi: version,
        info: {title: 'Value types', version: '1'},
        paths,
        components: {schemas},
        'x-preserved': {number: 'EXACT_LARGE', flag: false, empty: null},
    };
    const text = (format === 'yaml'
        ? '# Preserve source\r\n' + YAML.stringify(document).replaceAll('\n', '\r\n')
        : JSON.stringify(document))
        .replace(/"?EXACT_LARGE"?/g, '9007199254740993.00')
        .replace(/"?EXACT_SMALL"?/g, '9007199254740992')
        .replace(/"?EXACT_EQUIVALENT"?/g, '900719925474099300e-2');
    return {root, snapshot: 'value-types', resources: [{id: root, text, generation: 4}]};
}

async function convert(input, targetVersion) {
    const original = input.resources.map(resource => resource.text);
    const review = await planMigration({
        ...input, targetVersion, destination: 'file:///converted-value-types/',
    });
    assert.equal(review.complete, true, JSON.stringify(review.problems));
    const output = {
        root: review.outputRoot,
        snapshot: 'reopened-value-types',
        resources: review.outputs.map(resource => ({...resource, generation: 0})),
    };
    assert.equal(analyse(output).status, 'complete');
    assert.deepEqual(input.resources.map(resource => resource.text), original);
    const before = new SourceDocument(input.resources[0].text, input.root);
    const resource = output.resources.find(resource => resource.id === output.root);
    const after = new SourceDocument(resource.text, output.root);
    assert.equal(after.dataJson('/x-preserved'), before.dataJson('/x-preserved'));
    if (before.format === 'yaml') {
        assert(resource.text.startsWith('# Preserve source\r\n'));
        assert(!/(?<!\r)\n/.test(resource.text));
    }
    return output;
}

function concrete(packet, pointer, kind) {
    const {graph} = createGraph(packet);
    let resource = packet.root;
    const seen = new Set();
    while (true) {
        const identity = JSON.stringify([resource, pointer]);
        assert(!seen.has(identity), 'Unexpected reference cycle');
        seen.add(identity);
        const reference = graph.referenceAs(resource, pointer, '$ref', kind);
        if (!reference) return {resource, pointer, document: graph.docs.get(resource)};
        assert.equal(reference.resolution, 'resolved');
        resource = reference.targetResource;
        pointer = reference.targetPointer;
    }
}

async function evaluate(packet, pointer, values, resource = packet.root) {
    const result = await evaluateSchemas({
        ...packet,
        runtimeInstances: values.map(text => ({
            subject: 'response-body', text, location: pointer,
            schema: {resource, pointer},
        })),
    });
    assert.equal(result.complete, true, JSON.stringify(result.findings));
    assert(result.runtimeEvaluations.every(value => value.complete));
    return result.runtimeEvaluations.map(value => value.valid);
}

for (const format of ['yaml', 'json']) {
    test(`${format} semantic types retain physical syntax and exact numeric lexemes`, () => {
        const text = format === 'yaml'
            ? '# Data\r\nvalue: &value [special, 9007199254740993.00, true, null]\r\ncopy: *value\r\n'
            : '{"value":["special",9007199254740993.00,true,null],"copy":["special",9007199254740993.00,true,null]}';
        const document = new SourceDocument(text, 'file:///types.' + format);
        for (const parent of ['value', 'copy']) {
            assert.deepEqual([0, 1, 2, 3].map(index =>
                valueType(document.dataNode('/' + parent + '/' + index))),
            ['string', 'number', 'boolean', 'null']);
            assert.equal(document.dataJson('/' + parent + '/1'), '9007199254740993.00');
        }
        assert.equal(document.dataNode('/value/0').kind, format === 'yaml' ? 'scalar' : 'string');
        assert.equal(document.text, text);
    });

    test(`${format} constant string condition retains both branches after 3.0 conversion`, async () => {
        const input = capture(format, {
            Value: {type: 'string', if: {const: 'special'}, then: {minLength: 5}, else: {maxLength: 3}},
            Alias: {$ref: '#/components/schemas/Value'},
            Nested: {type: 'object', required: ['value'], properties: {value: {$ref: '#/components/schemas/Value'}}},
        });
        const values = ['"special"', '"abc"', '"abcd"', '"specialx"', '""', '1', 'false', 'null'];
        const expected = [true, true, false, false, true, false, false, false];
        for (const name of ['Value', 'Alias']) {
            assert.deepEqual(await evaluate(input, '/components/schemas/' + name, values), expected);
        }
        const nested = values.map(value => '{"value":' + value + '}');
        assert.deepEqual(await evaluate(input, '/components/schemas/Nested', nested), expected);
        const output = await convert(input, '3.0.4');
        for (const name of ['Value', 'Alias']) {
            assert.deepEqual(await evaluate(output, '/components/schemas/' + name, values), expected);
        }
        assert.deepEqual(await evaluate(output, '/components/schemas/Nested', nested), expected);
    });

    for (const [name, literal, other] of [
        ['string', 'special', 'other'],
        ['number', 'EXACT_LARGE', 'EXACT_SMALL'],
        ['boolean', true, false],
        ['null', null, false],
    ]) {
        test(`${format} ${name} conditional literals retain nested and referenced domains`, async () => {
            const input = capture(format, {
                Value: {enum: [literal, other], if: {const: literal}, then: {enum: [literal]}, else: {enum: [other]}},
                Alias: {$ref: '#/components/schemas/Value'},
                Nested: {type: 'array', items: {$ref: '#/components/schemas/Value'}},
            });
            const raw = value => value === 'EXACT_LARGE' ? '9007199254740993'
                : value === 'EXACT_SMALL' ? '9007199254740992' : JSON.stringify(value);
            const values = [raw(literal), raw(other), '{}', '[]', '0'];
            const expected = [true, true, false, false, false];
            const nested = values.map(value => '[' + value + ']');
            for (const name of ['Value', 'Alias']) {
                assert.deepEqual(await evaluate(input, '/components/schemas/' + name, values), expected);
            }
            assert.deepEqual(await evaluate(input, '/components/schemas/Nested', nested), expected);
            const output = await convert(input, '3.0.4');
            for (const name of ['Value', 'Alias']) {
                assert.deepEqual(await evaluate(output, '/components/schemas/' + name, values), expected);
            }
            assert.deepEqual(await evaluate(output, '/components/schemas/Nested', nested), expected);
        });
    }

    for (const [type, value] of [['integer', 1], ['string', 'special'], ['boolean', true]]) {
        test(`${format} ${type} query and Header defaults survive Swagger conversion`, async () => {
            const input = capture(format, {Value: {type, default: value}}, {
                '/value': {get: {
                    parameters: [{name: 'value', in: 'query', schema: {$ref: '#/components/schemas/Value'}}],
                    responses: {'200': {description: 'Value', headers: {X: {schema: {$ref: '#/components/schemas/Value'}}}}},
                }},
            }, '3.0.4');
            const output = await convert(input, '2.0');
            const pointer = '/paths/~1value/get';
            const values = [JSON.stringify(value), '{}', 'null'];
            const expected = [true, false, false];
            assert.deepEqual(await evaluate(input, '/components/schemas/Value', values), expected);
            for (const [suffix, kind] of [['/parameters/0', 'parameter'], ['/responses/200/headers/X', 'header']]) {
                const target = concrete(output, pointer + suffix, kind);
                assert.equal(target.document.dataNode(target.pointer + '/type').value, type);
                assert.equal(target.document.dataNode(target.pointer + '/default').value, value);
                assert.deepEqual(await evaluate(output, target.pointer, values, target.resource), expected);
            }
        });
    }

    test(`${format} exact enum intersection keeps adjacent large integers distinct`, async () => {
        const input = capture(format, {}, {
            '/value': {get: {
                parameters: [{name: 'value', in: 'query', schema: {
                    type: 'integer', allOf: [{enum: ['EXACT_SMALL', 'EXACT_LARGE']}, {enum: ['EXACT_EQUIVALENT']}],
                }}],
                responses: {'200': {description: 'Value'}},
            }},
        });
        const pointer = '/paths/~1value/get/parameters/0';
        const values = ['9007199254740992', '9007199254740993', '9007199254740994', '"9007199254740993"'];
        const expected = [false, true, false, false];
        assert.deepEqual(await evaluate(input, pointer + '/schema', values), expected);
        const output = await convert(input, '2.0');
        const target = concrete(output, pointer, 'parameter');
        assert.deepEqual(await evaluate(output, target.pointer, values, target.resource), expected);
        assert.equal(target.document.dataNode(target.pointer + '/enum').children.size, 1);
        assert.equal(target.document.dataJson(target.pointer + '/enum/0'), '9007199254740993.00');
    });
}
