#!/usr/bin/python3
"""Producer mismatches must stop before a native fixture can take input."""
import json
import os
from pathlib import Path
import re
import tempfile
import unittest

from tools.native_migration_preflight import (
    MIGRATION_PRODUCER, preflight_migration, verify_migration_producer,
)


class PreflightTests(unittest.TestCase):
    def test_revision_matches_production_engine_and_core(self):
        repository = Path(__file__).resolve().parent.parent
        engine = (repository / 'tools/contract_engine/src/migration.ts').read_text()
        core = (repository / 'packages/busyapi_core/lib/src/migration.dart').read_text()
        engine_revision = re.search(r"const migrationProducerVersion\s*=\s*'([^']+)'", engine)
        core_revision = re.search(r"result\['producerVersion'\]\s*!=\s*'([^']+)'", core)
        self.assertIsNotNone(engine_revision, 'Locate the production migration producer')
        self.assertIsNotNone(core_revision, 'Locate Core migration admission')
        self.assertEqual(engine_revision.group(1), core_revision.group(1))
        self.assertEqual(MIGRATION_PRODUCER, engine_revision.group(1))

    def test_current_revision_is_accepted_and_previous_package_is_rejected(self):
        verify_migration_producer({'producer': 'busyapi-native-migration', 'producerVersion': '97'})
        for obsolete in ('25', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '80', '81', '82', '83', '84', '85', '86', '87', '88', '89', '90', '91', '92', '93', '94', '95', '96'):
            with self.subTest(obsolete=obsolete):
                with self.assertRaisesRegex(RuntimeError, 'producer differ'):
                    verify_migration_producer({'producer': 'busyapi-native-migration', 'producerVersion': obsolete})

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='busyapi-native-preflight-test-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.source = self.root / 'api.json'
        self.raw = b'{"openapi":"3.0.4","info":{"title":"Original","version":"1"},"paths":{}}\n'
        self.source.write_bytes(self.raw)
        self.originals = {self.source: self.raw}
        self.destination = self.root / 'preview'

    def fake(self, report, code=0, malformed=None):
        binary = self.root / 'busyapi-fake'
        payload = json.dumps(report) if malformed is None else malformed
        binary.write_text('#!/usr/bin/python3\nimport sys\nprint(' + repr(payload) + ')\nsys.exit(' + str(code) + ')\n')
        binary.chmod(0o700)
        return binary

    def review(self, **updates):
        return {'producer': 'busyapi-native-migration', 'producerVersion': MIGRATION_PRODUCER,
                'status': 'faithfully-convertible', 'complete': True, 'published': False,
                'target': {'declaredVersion': '2.0'}, 'reviewIdentity': 'a' * 64, 'configurationProjections': [], 'parameterChanges': [], **updates}

    def test_obsolete_producer_is_rejected_without_publication(self):
        for version in ['6', '23', '25', '31', '32', '33', '89', '90', '91', '92', '93', '94', '95']:
            with self.subTest(producerVersion=version):
                binary = self.fake(self.review(producerVersion=version))
                with self.assertRaisesRegex(RuntimeError, 'producer differ'):
                    preflight_migration(binary, self.source, '2.0', self.destination, self.originals)
                self.assertFalse(self.destination.exists())
                self.assertEqual(self.source.read_bytes(), self.raw)

    def test_malformed_failed_and_nonreview_outputs_are_not_readiness(self):
        cases = [(self.review(), 0, '{broken'), ([], 0, None),
                 (self.review(), 2, None), (self.review(complete=False), 0, None),
                 (self.review(published=True), 0, None),
                 (self.review(target=[]), 0, None),
                 (self.review(target={'declaredVersion': '3.1.2'}), 0, None),
                 (self.review(reviewIdentity=''), 0, None)]
        for report, code, malformed in cases:
            with self.subTest(report=report, code=code, malformed=malformed):
                with self.assertRaises(RuntimeError):
                    preflight_migration(self.fake(report, code, malformed), self.source,
                                        '2.0', self.destination, self.originals)
                self.assertFalse(self.destination.exists())
                self.assertEqual(self.source.read_bytes(), self.raw)

    def test_stale_source_and_occupied_destination_refuse_before_launch(self):
        self.source.write_bytes(b'Changed fixture')
        with self.assertRaisesRegex(RuntimeError, 'changed before preflight'):
            preflight_migration(self.root / 'missing-binary', self.source, '2.0',
                                self.destination, self.originals)
        self.source.write_bytes(self.raw)
        self.destination.mkdir()
        sentinel = self.destination / 'foreign'
        sentinel.write_bytes(b'Keep foreign destination')
        with self.assertRaisesRegex(RuntimeError, 'absent private preflight'):
            preflight_migration(self.root / 'missing-binary', self.source, '2.0',
                                self.destination, self.originals)
        self.assertEqual(sentinel.read_bytes(), b'Keep foreign destination')

    def test_actual_packaged_cli_previews_all_families_without_publication(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        binary = bundle / 'busyapi'
        self.assertTrue(binary.is_file(), 'Build the assembled CLI or set BUSYAPI_TEST_BUNDLE')
        for version in ['2.0', '3.0.4', '3.1.2', '3.2.1']:
            for format in ['yaml', 'json']:
                with self.subTest(version=version, format=format):
                    source = self.root / ('api-' + version + '.' + format)
                    fragment = self.root / ('model-' + version + '.json')
                    schema = {'$ref': fragment.name + '#/Item'}
                    response = {'description': 'Value', **({'schema': schema}
                                if version == '2.0' else {'content': {'application/json': {'schema': schema}}})}
                    value = {'swagger' if version == '2.0' else 'openapi': version,
                             'info': {'title': 'Owned 雪', 'version': 'api-version'},
                             **({'host': '127.0.0.1:1', 'basePath': '/v1', 'schemes': ['http'],
                                 'produces': ['application/json']} if version == '2.0'
                                else {'servers': [{'url': 'http://127.0.0.1:1/v1'}]}),
                             'paths': {'/value': {'get': {'responses': {'200': response}}}},
                             'x-kept': {'exact': 'EXACT', 'flag': False, 'empty': ''}}
                    raw = (('# Keep source 雪\r\n' if format == 'yaml' else '')
                           + json.dumps(value, ensure_ascii=False).replace('"EXACT"', '9007199254740993.000') + '\r\n').encode()
                    extra = b'{"Item":{"type":"integer"}}\r\n'
                    source.write_bytes(raw)
                    fragment.write_bytes(extra)
                    destination = self.root / ('preview-' + version + '-' + format)
                    report = preflight_migration(binary, source, '2.0', destination,
                                                 {source: raw, fragment: extra})
                    self.assertFalse(report['published'])
                    self.assertFalse(report['nativeAcceptance'])
                    self.assertEqual(report['producerVersion'], MIGRATION_PRODUCER)
                    self.assertFalse(destination.exists())
                    self.assertEqual(source.read_bytes(), raw)
                    self.assertEqual(fragment.read_bytes(), extra)

    def test_actual_packaged_b05_previews_keep_shared_operation_media_private(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        binary = bundle / 'busyapi'
        self.assertTrue(binary.is_file(), 'Build the assembled CLI or set BUSYAPI_TEST_BUNDLE')
        for format in ['yaml', 'json']:
            with self.subTest(format=format):
                source = self.root / ('entry.' + format)
                shared = self.root / ('shared.' + format)
                def api(name, consumes, produces, path):
                    return {'swagger': '2.0', 'info': {'title': name, 'version': '1'},
                            'host': 'api.invalid', 'schemes': ['https'],
                            'consumes': [consumes], 'produces': [produces], 'paths': {'/payload': path}}
                entry = api('First', 'application/json', 'application/vnd.reply-a+json',
                            {'$ref': shared.name + '#/paths/~1payload'})
                other = api('Second', 'application/vnd.request-b+json', 'application/json',
                            {'post': {'operationId': 'shared', 'parameters': [
                                {'in': 'body', 'name': 'payload', 'schema': {'type': 'integer'}}],
                                'responses': {'200': {'description': 'Reply', 'schema': {'type': 'integer'}}}}})
                def encode(value):
                    return (('# Keep contexts 雪\r\n' if format == 'yaml' else '')
                            + json.dumps(value, ensure_ascii=False) + '\r\n').encode()
                raw, extra = encode(entry), encode(other)
                source.write_bytes(raw)
                shared.write_bytes(extra)
                destination = self.root / ('b05-preview-' + format)
                report = preflight_migration(binary, source, '3.2.1', destination, {source: raw, shared: extra})
                self.assertEqual(report['producerVersion'], MIGRATION_PRODUCER)
                self.assertFalse(report['published'])
                self.assertFalse(report['nativeAcceptance'])
                self.assertFalse(destination.exists())
                self.assertEqual(source.read_bytes(), raw)
                self.assertEqual(shared.read_bytes(), extra)

    def test_configuration_projection_controls(self):
        for records in [None, {}, [{'pointer': '/environments/manual/authentication', 'before': None, 'after': '{}'}],
                        [{'pointer': '/tests/0/server', 'before': '1', 'after': 'invalid-json'}]]:
            with self.subTest(records=records), self.assertRaisesRegex(RuntimeError, 'configuration'):
                preflight_migration(self.fake(self.review(configurationProjections=records)), self.source, '2.0',
                                    self.destination, self.originals)
        records = [{'pointer': '/tests/0/server', 'before': '1', 'after': '0'}]
        report = preflight_migration(self.fake(self.review(configurationProjections=records)), self.source, '2.0',
                                    self.destination, self.originals)
        self.assertEqual(report['configurationProjections'], records)

    def test_parameter_review_protocol_controls(self):
        for changes in [None, {}, [{'resource': 'file:///a.json', 'pointer': '', 'name': 'p', 'before': 'cookie', 'after': 'form', 'range': [-1, 2]}]]:
            with self.subTest(changes=changes), self.assertRaisesRegex(RuntimeError, 'parameter'):
                preflight_migration(self.fake(self.review(parameterChanges=changes)), self.source, '2.0', self.destination, self.originals)
        records = [{'pointer': '/tests/0/parameters', 'before': '{"querystring":{"p":{"q":"%20"}}}',
                    'after': '{"query":{"p":{"q":"%20"}}}'}]
        report = preflight_migration(self.fake(self.review(configurationProjections=records)), self.source, '2.0', self.destination, self.originals)
        self.assertEqual(report['configurationProjections'], records)

    def test_actual_packaged_r3a_routes_and_reviewed_server_selections(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        for version in ['3.0.4', '3.1.2', '3.2.1']:
            source = self.root / ('r3a-' + version + '.json')
            configuration = self.root / 'busyapi.yaml'
            operation = {'responses': {'204': {'description': 'Empty'}}}
            choices = [{'url': 'https://api.invalid/write'}, {'url': 'https://api.invalid/write'}]
            value = {'openapi': version, 'info': {'title': 'R3a relocation', 'version': '1'},
                     'servers': [{'url': 'https://api.invalid/root'}],
                     'paths': {'/shared': {'get': operation, 'post': {**operation, 'servers': choices}}}}
            raw = json.dumps(value).encode()
            config = json.dumps({'version': 1, 'roots': [{'name': 'api', 'path': source.name}],
                                 'tests': [{'name': 'held', 'operation': {'method': 'post', 'path': '/shared'}, 'server': 1}]}).encode()
            source.write_bytes(raw)
            configuration.write_bytes(config)
            destination = self.root / ('r3a-preview-' + version)
            report = preflight_migration(bundle / 'busyapi', self.root, '2.0', destination,
                                         {source: raw, configuration: config})
            self.assertEqual(report['producerVersion'], MIGRATION_PRODUCER)
            self.assertFalse(report['published'])
            self.assertTrue(any(change['pointer'] == '/tests/0/server' for change in report['configurationProjections']))
            self.assertFalse(destination.exists())

    def test_actual_packaged_b05_r2_metadata_examples_and_refusals(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        binary = bundle / 'busyapi'
        for version in ['3.0.4', '3.1.2', '3.2.1']:
            for format in ['yaml', 'json']:
                with self.subTest(version=version, format=format):
                    source = self.root / ('r2-' + version + '.' + format)
                    ref = lambda kind, name: {'$ref': '#/components/' + kind + '/' + name}
                    media = {'schema': {'type': 'boolean'}, 'examples': {
                        'First': ref('examples', 'Alias'), 'Same': ref('examples', 'Payload')}}
                    value = {'openapi': version, 'info': {'title': 'R2 metadata', 'version': '1'},
                             'servers': [{'url': 'https://api.invalid'}],
                             'paths': {'/echo': {'post': {
                                 'parameters': [ref('parameters', 'Shared')],
                                 'requestBody': ref('requestBodies', 'Shared'),
                                 'responses': {'200': ref('responses', 'Reply'), '204': {'description': 'Empty'}}}}},
                             'components': {
                                 'parameters': {'Shared': {'name': 'flag', 'in': 'query', 'deprecated': False,
                                                          'allowReserved': False, 'schema': {'type': 'boolean'}}},
                                 'requestBodies': {'Shared': {'description': '[Request](./request.md)', 'required': True,
                                                              'content': {'application/json': media}}},
                                 'responses': {'Reply': {'description': 'Reply', 'headers': {'X-Flag': ref('headers', 'Flag')},
                                                        'content': {'application/json': media}}},
                                 'headers': {'Flag': {'required': False, 'deprecated': False, 'schema': {'type': 'boolean'}}},
                                 'examples': {'Alias': ref('examples', 'Payload'), 'Payload': {'value': False}}}}
                    raw = (('# R2 source remains private\n' if format == 'yaml' else '') + json.dumps(value)).encode()
                    source.write_bytes(raw)
                    destination = self.root / ('r2-preview-' + version + '-' + format)
                    report = preflight_migration(binary, source, '2.0', destination, {source: raw})
                    self.assertEqual(report['producerVersion'], MIGRATION_PRODUCER)
                    self.assertFalse(report['published'])
                    self.assertFalse(destination.exists())
                    self.assertEqual(source.read_bytes(), raw)
                    # Distinct values cannot acquire a lossless-selection claim.
                    reply = value['components']['responses']['Reply']['content']['application/json']
                    reply = {**reply, 'schema': {}, 'examples': {'First': {'value': False}, 'Other': {'value': 0}}}
                    value['components']['responses']['Reply']['content'] = {'application/json': reply}
                    refused = json.dumps(value).encode()
                    source.write_bytes(refused)
                    with self.assertRaisesRegex(RuntimeError, 'migration.response.named-examples'):
                        preflight_migration(binary, source, '2.0', destination, {source: refused})
                    self.assertFalse(destination.exists())
                    self.assertEqual(source.read_bytes(), refused)

    def test_actual_packaged_b05_r3_equivalent_servers_and_media_owners(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        binary = bundle / 'busyapi'
        for format in ['yaml', 'json']:
            source = self.root / ('r3.' + format)
            value = {'openapi': '3.2.1', 'info': {'title': 'R3 owners', 'version': '1'},
                     'servers': [{'url': '{scheme}://api.invalid/base',
                                  'variables': {'scheme': {'default': 'https', 'enum': ['http', 'https']}}}],
                     'paths': {'/echo': {'get': {'responses': {'200': {
                         'description': 'Boolean reply', 'content': {'application/json': {
                             '$ref': '#/components/mediaTypes/Payload'}}}}}}},
                     'components': {'mediaTypes': {'Payload': {'schema': {'type': 'boolean'},
                         'examples': {'False': {'dataValue': False, 'serializedValue': 'false'}}}}}}
            raw = (('# Keep R3 source\n' if format == 'yaml' else '') + json.dumps(value)).encode()
            source.write_bytes(raw)
            destination = self.root / ('r3-preview-' + format)
            report = preflight_migration(binary, source, '3.1.2', destination, {source: raw})
            self.assertEqual(report['producerVersion'], MIGRATION_PRODUCER)
            self.assertFalse(report['published'])
            self.assertFalse(destination.exists())
            self.assertEqual(source.read_bytes(), raw)
            value['servers'] = [{'url': 'https://one.invalid'}, {'url': 'https://two.invalid'}]
            refused = json.dumps(value).encode()
            source.write_bytes(refused)
            with self.assertRaisesRegex(RuntimeError, 'migration.server.targets'):
                preflight_migration(binary, source, '2.0', destination, {source: refused})
            self.assertFalse(destination.exists())
            self.assertEqual(source.read_bytes(), refused)

    def test_actual_packaged_b04_previews_keep_binary_resources_private(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        for version, target, encoded in [('2.0', '3.2.1', False),
                                          ('3.0.4', '3.1.2', True),
                                          ('3.1.2', '2.0', True),
                                          ('3.2.1', '3.0.4', False)]:
            for format in ['yaml', 'json']:
                with self.subTest(version=version, target=target, encoded=encoded, format=format):
                    source = self.root / ('binary-' + version + '.' + format)
                    fragment = self.root / ('binary-model-' + version + '.json')
                    legacy = version in ['2.0', '3.0.4']
                    schema = ({'type': 'string', 'format': 'byte', 'minLength': 4}
                              if encoded and legacy else
                              {'type': 'string', 'contentEncoding': 'base64', 'minLength': 4}
                              if encoded else {'type': 'string', 'format': 'binary'}
                              if legacy else {'maxLength': 4})
                    response = {'description': 'Bytes', **({'schema': {'type': 'file', 'format': 'byte'}}
                                if version == '2.0' else {'content': {'application/octet-stream': {
                                    'schema': {'$ref': fragment.name + '#/Bytes'}}}})}
                    value = {'swagger' if version == '2.0' else 'openapi': version,
                             'info': {'title': 'B04 preflight', 'version': '1'},
                             **({'host': 'api.invalid', 'schemes': ['https'], 'produces': ['application/octet-stream']}
                                if version == '2.0' else {'servers': [{'url': 'https://api.invalid'}]}),
                             'paths': {'/bytes': {'get': {'responses': {'200': response}}}}}
                    if version == '2.0':
                        # Capture the independently addressed ordinary schema
                        # beside the response's Swagger-only file position.
                        value['definitions'] = {'Bytes': {'$ref': fragment.name + '#/Bytes'}}
                    raw = (('# Keep binary source\r\n' if format == 'yaml' else '')
                           + json.dumps(value) + '\r\n').encode()
                    extra = (json.dumps({'Bytes': schema}) + '\r\n').encode()
                    source.write_bytes(raw)
                    fragment.write_bytes(extra)
                    destination = self.root / ('binary-preview-' + version + '-' + format)
                    report = preflight_migration(bundle / 'busyapi', source, target,
                                                 destination, {source: raw, fragment: extra})
                    self.assertEqual(report['producerVersion'], MIGRATION_PRODUCER)
                    self.assertFalse(report['published'])
                    self.assertFalse(destination.exists())
                    self.assertEqual(source.read_bytes(), raw)
                    self.assertEqual(fragment.read_bytes(), extra)


    def test_actual_packaged_r3c_finite_parameters_and_saved_values(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        binary = bundle / 'busyapi'
        self.assertTrue(binary.is_file(), 'Build the assembled CLI or set BUSYAPI_TEST_BUNDLE')
        for version in ['3.2.0', '3.2.1']:
            for format in ['yaml', 'json']:
                for target in ['3.1.2', '3.0.4']:
                    with self.subTest(version=version, format=format, target=target):
                        source = self.root / ('r3c-' + version + '.' + format)
                        configuration = self.root / 'busyapi.yaml'
                        whole = {'name': 'descriptionOnly', 'in': 'querystring', 'required': True,
                                 'content': {'application/x-www-form-urlencoded': {'schema': {
                                     'type': 'object', 'additionalProperties': False, 'required': ['q'],
                                     'properties': {'q': {'type': 'string', 'enum': ['', 'a+b', '%20']}}}}}}
                        cookie = {'name': 'literal', 'in': 'cookie', 'style': 'cookie',
                                  'schema': {'type': 'string', 'enum': ['a%20b', '']}}
                        value = {'openapi': version, 'info': {'title': 'R3c', 'version': '1'},
                                 'paths': {'/p': {'get': {'parameters': [whole, cookie],
                                                       'responses': {'204': {'description': 'Empty'}}}}}}
                        settings = {'version': 1, 'roots': [{'name': 'api', 'path': source.name}],
                                    'environments': {'manual': {'variables': {'keep': 'unchanged'}}},
                                    'tests': [{'name': 'saved', 'operation': {'method': 'get', 'path': '/p'},
                                               'parameters': {'querystring': {'descriptionOnly': {'q': '%20'}},
                                                              'cookie': {'literal': 'a%20b'}}}]}
                        raw = (('# Keep R3c source\r\n' if format == 'yaml' else '') + json.dumps(value) + '\r\n').encode()
                        originals = {source: raw, configuration: json.dumps(settings).encode()}
                        for path, data in originals.items():
                            path.write_bytes(data)
                        destination = self.root / ('r3c-' + version + '-' + format + '-' + target)
                        report = preflight_migration(binary, source, target, destination, originals)
                        self.assertEqual(report['producerVersion'], MIGRATION_PRODUCER)
                        self.assertTrue(any(change['pointer'] == '/tests/0/parameters' for change in report['configurationProjections']))
                        self.assertFalse(destination.exists())
                        for path, data in originals.items():
                            self.assertEqual(path.read_bytes(), data)
                        whole['content'] = {'application/json': {'schema': {'type': 'object', 'enum': [{'q': '%20'}]}}}
                        raw = json.dumps(value).encode()
                        source.write_bytes(raw)
                        with self.assertRaisesRegex(RuntimeError, 'migration.parameter.querystring-target'):
                            preflight_migration(binary, source, target, destination, {**originals, source: raw})
                        self.assertFalse(destination.exists())

    def test_actual_packaged_r3b_owners_and_unused_target_restrictions(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        binary = bundle / 'busyapi'
        self.assertTrue(binary.is_file(), 'Build the assembled CLI or set BUSYAPI_TEST_BUNDLE')
        for format in ['yaml', 'json']:
            for unused in [None, 'path-item', 'media']:
                with self.subTest(format=format, unused=unused):
                    source = self.root / ('r3b-' + str(unused) + '.' + format)
                    library = self.root / ('r3b-library-' + str(unused) + '.' + format)
                    payload = self.root / 'r3b-count.bin'
                    media_ref = {'$ref': '#/components/mediaTypes/Alias'}
                    item = {'post': {'requestBody': {'required': True, 'content': {'application/json': media_ref}},
                                     'responses': {'200': {'description': 'Count', 'content': {'application/vnd.count+json': media_ref}}}}}
                    components = {'pathItems': {'Item': item},
                                  'mediaTypes': {'Alias': {'$ref': '#/components/mediaTypes/Payload'},
                                                 'Payload': {'schema': {'type': 'integer'},
                                                             'examples': {'Count': {'externalValue': payload.name}}}}}
                    if unused == 'path-item':
                        components['pathItems']['Unused'] = {'get': {'responses': {'204': {'description': 'Inactive'}}}}
                    if unused == 'media':
                        components['mediaTypes']['Unused'] = {'schema': {'type': 'boolean'}, 'example': False}
                    entry = {'openapi': '3.2.1', 'info': {'title': 'R3b preflight', 'version': '1'},
                             'servers': [{'url': 'https://api.invalid'}],
                             'paths': {name: {'$ref': library.name + '#/components/pathItems/Item'} for name in ['/first', '/second']}}
                    objects = {'openapi': '3.2.1', 'info': {'title': 'R3b library', 'version': '1'},
                               'servers': [{'url': 'https://api.invalid'}], 'paths': {}, 'components': components}
                    def render(value):
                        return (('# Keep R3b source 雪\r\n' if format == 'yaml' else '')
                                + json.dumps(value, ensure_ascii=False) + '\r\n').encode()
                    originals = {source: render(entry), library: render(objects), payload: b'9007199254740993.00'}
                    for path, raw in originals.items():
                        path.write_bytes(raw)
                    destination = self.root / ('r3b-preview-' + str(unused) + '-' + format)
                    if unused is None:
                        report = preflight_migration(binary, source, '2.0', destination, originals)
                        self.assertEqual(report['producerVersion'], MIGRATION_PRODUCER)
                        self.assertFalse(report['published'])
                    else:
                        code = 'migration.path-item.unused-owner' if unused == 'path-item' else 'migration.media.unbound-owner'
                        with self.assertRaisesRegex(RuntimeError, code):
                            preflight_migration(binary, source, '2.0', destination, originals)
                    self.assertFalse(destination.exists())
                    for path, raw in originals.items():
                        self.assertEqual(path.read_bytes(), raw)


if __name__ == '__main__':
    unittest.main()
