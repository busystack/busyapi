import {supportedSchemaDialect} from './reference_graph';
import type {GraphScope, ReferenceGraph} from './reference_graph';
import {schemaAuthoringContext, sameSchemaAuthoringContext, type SchemaAuthoringContext} from './schema_authoring_context';
import type {Node} from './document';

export type SchemaValueForm = 'object' | 'boolean' | 'object-array';
export type SchemaValueForms = Readonly<{
    version: 2;
    context: SchemaAuthoringContext;
    field: string;
    supported: boolean;
    forms: readonly SchemaValueForm[];
}>;

const objectForms = Object.freeze(['object'] as const);
const booleanForms = Object.freeze(['object', 'boolean'] as const);
const tupleForms = Object.freeze(['object', 'object-array'] as const);
const unavailableForms = Object.freeze([]);

/** Field value forms come from the containing schema occurrence, rather than
 * from a universal meaning for the presentation type "schema". OAS 3.0.4
 * §4.7.24.1 permits booleans only for additionalProperties; Swagger §6.4.18
 * retains Draft 4 tuple items with Schema Objects in place of JSON Schemas. */
export function schemaValueForms(graph: ReferenceGraph, scope: GraphScope, field: {name: string; type?: string}): SchemaValueForms | undefined {
    if (field.type !== 'schema') return;
    const supported = supportedSchemaDialect(scope);
    const forms = !supported ? unavailableForms : scope.family === '3.0'
        ? field.name === 'additionalProperties' ? booleanForms : objectForms
        : scope.family === '2.0' ? field.name === 'additionalProperties' ? booleanForms
            : scope.kind === 'schema' && field.name === 'items' ? tupleForms : objectForms
        : booleanForms;
    return {version: 2, context: schemaAuthoringContext(graph, scope), field: field.name, supported, forms};
}

/** Whole occurrences and collection members are Schema Objects too. Keep
 * their controls bound to the graph, including native roots, tuple members,
 * reusable definitions and schemas reached through approved references. The
 * reserved field tags cannot be confused with a fixed keyword capability. */
export function schemaOccurrenceForms(graph: ReferenceGraph, scope: GraphScope): SchemaValueForms | undefined {
    if (scope.kind !== 'schema') return;
    return schemaValueForms(graph, scope, {name: '@schema', type: 'schema'});
}

export function schemaEntryForms(graph: ReferenceGraph, scope: GraphScope): SchemaValueForms | undefined {
    if (!['schema-map', 'schema-array'].includes(scope.kind)) return;
    return schemaValueForms(graph, scope, {name: '@entry', type: 'schema'});
}

export function sameSchemaValueForms(expected: unknown, actual: SchemaValueForms): boolean {
    if (!expected || typeof expected !== 'object' || Array.isArray(expected)) return false;
    const value = expected as Record<string, unknown>;
    return value.version === actual.version && value.field === actual.field &&
        sameSchemaAuthoringContext(value.context, actual.context) && value.supported === actual.supported &&
        Array.isArray(value.forms) && value.forms.length === actual.forms.length &&
        value.forms.every((form, index) => form === actual.forms[index]);
}

export function allowsSchemaValue(forms: SchemaValueForms, node: Node): boolean {
    if (!forms.supported) return false;
    if (node.kind === 'object') return forms.forms.includes('object');
    if (typeof node.value === 'boolean') return forms.forms.includes('boolean');
    if (node.kind !== 'array' || !forms.forms.includes('object-array')) return false;
    for (const child of node.children.values()) if (child.kind !== 'object') return false;
    return true;
}
