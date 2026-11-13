#!/usr/bin/python3
"""Installed CLI reviews preserve fixtures before any native input is sent."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from urllib.parse import unquote, urldefrag, urljoin

from tools.native_migration_preflight import (
    preflight_migration, verify_migration_metadata,
)


class PreflightTests(unittest.TestCase):
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
        return {'producer': 'busyapi-native-migration', 'producerVersion': 'fixture-protocol',
                'status': 'faithfully-convertible', 'complete': True, 'published': False,
                'target': {'declaredVersion': '2.0'}, 'reviewIdentity': 'a' * 64, 'configurationProjections': [], 'parameterChanges': [], **updates}

    def test_review_identifies_its_producer_without_a_duplicate_revision_policy(self):
        verify_migration_metadata(self.review())
        for value in (None, [], {}, self.review(producer='unrelated'),
                      self.review(producerVersion=None), self.review(producerVersion=''),
                      self.review(producerVersion='x' * 129)):
            with self.subTest(metadata=value), self.assertRaisesRegex(RuntimeError, 'producer identity'):
                verify_migration_metadata(value)

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

    def test_preflight_rejects_publication_or_original_changes_after_cli_review(self):
        binary = self.fake(self.review())
        original = binary.read_text()
        for mutate, message in [
            (f'from pathlib import Path; Path({str(self.destination)!r}).mkdir()\n', 'unexpectedly published'),
            (f'from pathlib import Path; Path({str(self.source)!r}).write_bytes(b"changed")\n', 'changed its original'),
        ]:
            with self.subTest(mutate=mutate):
                # Run the actual preflight child boundary, rather than changing
                # the evidence after the verifier has finished.
                binary.write_text(original.replace('sys.exit(0)', mutate + 'sys.exit(0)'))
                with self.assertRaisesRegex(RuntimeError, message):
                    preflight_migration(binary, self.source, '2.0', self.destination, self.originals)
                if self.destination.exists():
                    self.destination.rmdir()
                self.source.write_bytes(self.raw)

    def test_review_evidence_retains_exact_strings_and_opaque_conversion_metadata(self):
        record = {
            'pointer': '/tests/0/body',
            'before': '{"mediaType":"multipart/form-data","value":[{"tag":9007199254740993.00},{"tag":"雪"}]}',
            'after': '{"mediaType":"multipart/form-data","value":{"tag":[9007199254740993.00,"雪"]}}',
            'multipart': {'names': ['tag']},
        }
        report = preflight_migration(
            self.fake(self.review(configurationProjections=[record])), self.source,
            '2.0', self.destination, self.originals)
        self.assertEqual(report['configurationProjections'], [record])
        self.assertEqual(self.source.read_bytes(), self.raw)
        self.assertFalse(self.destination.exists())

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
                    schema = ({'type': 'string'} if version == '2.0' else
                              {'type': 'string', 'format': 'byte', 'minLength': 4}
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
                    self.assertFalse(report['published'])
                    self.assertFalse(destination.exists())
                    self.assertEqual(source.read_bytes(), raw)
                    self.assertEqual(fragment.read_bytes(), extra)
                    if version == '2.0':
                        # The actual response has a concrete native file binding.
                        # Its unused ordinary definition cannot independently
                        # acquire a raw-binary interpretation without a consumer.
                        unbound = b'{"Bytes":{"type":"string","format":"binary"}}\r\n'
                        fragment.write_bytes(unbound)
                        refused = subprocess.run([str(bundle / 'busyapi'), 'migrate', str(source),
                            '--target', target, '--output', str(destination), '--json'],
                            env={'PATH': '', 'LANG': 'C.UTF-8'}, capture_output=True, text=True, timeout=30)
                        self.assertNotEqual(refused.returncode, 0, refused.stdout + refused.stderr)
                        packet = json.loads(refused.stdout)
                        verify_migration_metadata(packet)
                        self.assertFalse(packet['complete'])
                        self.assertFalse(packet['published'])
                        self.assertEqual(packet['outputs'], [])
                        self.assertEqual(packet['changes'], [])
                        self.assertTrue(any(problem['code'] == 'migration.schema.binary-context'
                            and problem['resource'] == fragment.as_uri()
                            and problem['pointer'] == '/Bytes/format' for problem in packet['problems']))
                        self.assertFalse(destination.exists())
                        self.assertEqual(source.read_bytes(), raw)
                        self.assertEqual(fragment.read_bytes(), unbound)

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

    def test_actual_packaged_r3c2_factor_groups_and_saved_values(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        binary = bundle / 'busyapi'
        self.assertTrue(binary.is_file(), 'Build the assembled CLI or set BUSYAPI_TEST_BUNDLE')
        for version in ['3.2.0', '3.2.1']:
            for target in ['3.1.2', '3.0.4', '2.0']:
                with self.subTest(version=version, target=target):
                    source, configuration = self.root / 'factors.json', self.root / 'busyapi.yaml'
                    schema = {'type': 'object', 'additionalProperties': False, 'properties': {
                        'q': {'type': 'array', 'maxItems': 2, 'items': {'type': 'string', 'enum': ['', 'a+b']}},
                        'flag': {'type': 'boolean'}, 'text': {'type': 'string', 'enum': ['', '雪']}}}
                    whole = {'name': 'descriptionOnly', 'in': 'querystring', 'required': False,
                             'content': {'application/x-www-form-urlencoded': {'schema': schema}}}
                    value = {'openapi': version, 'info': {'title': 'R3c2', 'version': '1'},
                             'paths': {'/p': {'get': {'parameters': [whole], 'responses': {'204': {'description': 'Empty'}}}}}}
                    settings = {'version': 1, 'roots': [{'name': 'api', 'path': source.name}],
                                'tests': [{'name': 'saved', 'operation': {'method': 'get', 'path': '/p'},
                                           'parameters': {'querystring': {'descriptionOnly': {'text': '', 'q': ['a+b', 'a+b'], 'flag': False}}}}]}
                    originals = {source: json.dumps(value).encode(), configuration: json.dumps(settings).encode()}
                    for path, raw in originals.items():
                        path.write_bytes(raw)
                    destination = self.root / ('factors-' + version + '-' + target)
                    report = preflight_migration(binary, source, target, destination, originals)
                    projection = next(item for item in report['configurationProjections'] if item['pointer'] == '/tests/0/parameters')
                    query = json.loads(projection['after'])['query']
                    self.assertEqual(list(query), ['text', 'q', 'flag'])
                    self.assertEqual(query['q'], ['a+b', 'a+b'])
                    self.assertTrue(any(item['after'].endswith(' · flag') for item in report['parameterChanges']))
                    schema['required'] = ['flag', 'text']
                    refused = json.dumps(value).encode()
                    source.write_bytes(refused)
                    with self.assertRaisesRegex(RuntimeError, 'migration.parameter.querystring-factorization'):
                        preflight_migration(binary, source, target, destination, {**originals, source: refused})
                    self.assertFalse(destination.exists())

    def test_actual_packaged_r3c3_raw_inverse_previews_keep_source_private(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        for version in ['3.2.0', '3.2.1']:
            for format in ['yaml', 'json']:
                for target in ['3.1.2', '3.0.4', '2.0']:
                    with self.subTest(version=version, format=format, target=target):
                        source, configuration = self.root / ('inverse.' + format), self.root / 'busyapi.yaml'
                        media = {'schema': {'type': 'object', 'additionalProperties': False, 'required': ['flag'],
                                            'properties': {'q': {'type': 'array', 'maxItems': 2,
                                                                  'items': {'type': 'string', 'enum': ['', 'a+b', '%20']}},
                                                           'flag': {'type': 'boolean'}}}}
                        value = {'openapi': version, 'info': {'title': 'R3c3 inverse', 'version': '1'},
                                 'paths': {'/p': {'get': {'parameters': [{'name': 'all', 'in': 'querystring', 'required': True,
                                                                      'content': {'application/x-www-form-urlencoded': media}}],
                                                          'responses': {'204': {'description': 'Empty'}}}}}}
                        settings = {'version': 1, 'roots': [{'name': 'api', 'path': source.name}],
                                    'tests': [{'name': 'saved', 'operation': {'method': 'get', 'path': '/p'},
                                               'parameters': {'querystring': {'all': 'q=a%2Bb&q=%2520&flag=false'}}}]}
                        originals = {source: (('# Retain YAML source\n' if format == 'yaml' else '') + json.dumps(value)).encode(),
                                     configuration: json.dumps(settings).encode()}
                        for path, raw in originals.items():
                            path.write_bytes(raw)
                        destination = self.root / ('raw-' + version + '-' + format + '-' + target)
                        report = preflight_migration(bundle / 'busyapi', source, target, destination, originals)
                        projection = next(item for item in report['configurationProjections'] if item['pointer'] == '/tests/0/parameters')
                        query = json.loads(projection['after'])['query']
                        self.assertEqual(list(query), ['q', 'flag'])
                        self.assertEqual(query, {'q': ['a+b', '%20'], 'flag': False})
                        self.assertFalse(destination.exists())
                        for path, raw in originals.items():
                            self.assertEqual(path.read_bytes(), raw)
                        settings['tests'][0]['parameters']['querystring']['all'] = 'q=%FF&flag=false'
                        rejected = json.dumps(settings).encode()
                        configuration.write_bytes(rejected)
                        with self.assertRaisesRegex(RuntimeError, 'migration.parameter.saved-proof'):
                            preflight_migration(bundle / 'busyapi', source, target, destination, {**originals, configuration: rejected})

    def test_active_definitions_reopen_and_unrepresentable_inactive_definitions_refuse(self):
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
                    if unused is not None:
                        # Swagger has no independent inactive Path Item or
                        # Media Type envelope. Verify that real target-language
                        # refusal without requiring an internal holder/code.
                        result = subprocess.run(
                            [str(binary), 'migrate', str(source), '--target', '2.0',
                             '--output', str(destination), '--json'],
                            env={'PATH': '', 'LANG': 'C.UTF-8'}, capture_output=True, text=True, timeout=30)
                        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                        report = json.loads(result.stdout)
                        self.assertEqual(report['status'], 'blocked')
                        self.assertFalse(report['complete'])
                        self.assertFalse(report['published'])
                        self.assertEqual(report['outputs'], [])
                        container = 'pathItems' if unused == 'path-item' else 'mediaTypes'
                        self.assertTrue(any(
                            problem['resource'] == library.as_uri()
                            and problem['pointer'] == f'/components/{container}/Unused'
                            and problem['reason'] == 'target-representation'
                            for problem in report['problems']))
                        self.assertFalse(destination.exists())
                        for path, raw in originals.items():
                            self.assertEqual(path.read_bytes(), raw)
                        continue
                    report = preflight_migration(binary, source, '2.0', destination, originals)
                    self.assertFalse(report['published'])
                    self.assertFalse(destination.exists())
                    result = subprocess.run(
                        [str(binary), 'migrate', str(source), '--target', '2.0',
                         '--output', str(destination), '--json', '--apply', report['reviewIdentity']],
                        env={'PATH': '', 'LANG': 'C.UTF-8'}, capture_output=True, text=True, timeout=30)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    published = json.loads(result.stdout)
                    self.assertTrue(published['published'])
                    delivered_entry = destination / published['entry']
                    for path, raw in originals.items():
                        self.assertEqual(path.read_bytes(), raw)
                    # The output must resolve without consulting the originals.
                    retired = {path: path.with_name(path.name + '.retired') for path in originals}
                    try:
                        for path, moved in retired.items():
                            path.rename(moved)
                        result = subprocess.run(
                            [str(binary), 'check', str(destination), '--json'],
                            env={'PATH': '', 'LANG': 'C.UTF-8'}, capture_output=True, text=True, timeout=30)
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                        self.assertTrue(json.loads(result.stdout)['complete'])
                        flattened = self.root / ('r3b-bundle-' + str(unused) + '-' + format)
                        result = subprocess.run(
                            [str(binary), 'bundle', str(delivered_entry), '--output', str(flattened), '--json'],
                            env={'PATH': '', 'LANG': 'C.UTF-8'}, capture_output=True, text=True, timeout=30)
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                        bundled_entry = flattened / json.loads(result.stdout)['output']['entry']
                        document = json.loads(bundled_entry.read_text())
                        self.assertEqual(document['swagger'], '2.0')
                        self.assertEqual(set(document['paths']), {'/first', '/second'})

                        def resolve(value):
                            for _ in range(16):
                                if '$ref' not in value:
                                    return value
                                address, pointer = urldefrag(urljoin(bundled_entry.as_uri(), value['$ref']))
                                self.assertEqual(address, bundled_entry.as_uri())
                                self.assertTrue(pointer.startswith('/'), pointer)
                                value = document
                                for part in unquote(pointer[1:]).split('/'):
                                    key = part.replace('~1', '/').replace('~0', '~')
                                    value = value[int(key)] if isinstance(value, list) else value[key]
                            self.fail('The bundled fixture reference chain did not terminate')

                        for path in ['/first', '/second']:
                            item = resolve(document['paths'][path])
                            self.assertEqual(set(item) & {'get', 'post', 'put', 'patch', 'delete', 'head', 'options'}, {'post'})
                            operation = item['post']
                            parameters = {
                                (value['name'], value['in']): value
                                for value in map(resolve, [*item.get('parameters', []),
                                                           *operation.get('parameters', [])])
                            }
                            body = next(value for value in parameters.values() if value['in'] == 'body')
                            self.assertTrue(body['required'])
                            self.assertIn('schema', body)
                            response = resolve(operation['responses']['200'])
                            self.assertIn('schema', response)
                            self.assertEqual(operation.get('produces', document.get('produces')),
                                             ['application/vnd.count+json'])
                    finally:
                        for path, moved in retired.items():
                            if moved.exists():
                                moved.rename(path)
                    for path, raw in originals.items():
                        self.assertEqual(path.read_bytes(), raw)

    def test_unnamed_positional_multipart_refuses_an_older_instance_model(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        for version in ['3.2.0', '3.2.1']:
            for format in ['yaml', 'json']:
                for target in ['3.1.2', '3.0.4']:
                    with self.subTest(version=version, format=format, target=target):
                        source = self.root / ('positional.' + format)
                        media = {'schema': {'type': 'array', 'maxItems': 3, 'items': {'type': 'string'}},
                                 'prefixEncoding': [{'contentType': 'text/plain'}],
                                 'itemEncoding': {'contentType': 'text/plain'}}
                        value = {'openapi': version, 'info': {'title': 'Positional', 'version': '1'},
                                 'paths': {'/parts': {'post': {'requestBody': {'content': {'multipart/mixed': media}},
                                                            'responses': {'204': {'description': 'Empty'}}}}}}
                        raw = (json.dumps(value) if format == 'json' else
                               '# Keep positional source\r\n' + '\r\n'.join(json.dumps(k) + ': ' + json.dumps(v) for k, v in value.items())).encode()
                        source.write_bytes(raw)
                        destination = self.root / ('preview-' + version + '-' + format + '-' + target)
                        refused = subprocess.run([str(bundle / 'busyapi'), 'migrate', str(source),
                            '--target', target, '--output', str(destination), '--json'],
                            env={'PATH': '', 'LANG': 'C.UTF-8'}, capture_output=True, text=True, timeout=30)
                        self.assertNotEqual(refused.returncode, 0, refused.stdout + refused.stderr)
                        packet = json.loads(refused.stdout)
                        verify_migration_metadata(packet)
                        self.assertFalse(packet['complete'])
                        self.assertFalse(packet['published'])
                        self.assertEqual(packet['outputs'], [])
                        self.assertEqual(packet['changes'], [])
                        for field in ['prefixEncoding', 'itemEncoding']:
                            self.assertTrue(any(problem['resource'] == source.as_uri()
                                and problem['pointer'] == '/paths/~1parts/post/requestBody/content/multipart~1mixed/' + field
                                and problem['reason'] == 'target-representation' for problem in packet['problems']))
                        self.assertFalse(destination.exists())
                        self.assertEqual(source.read_bytes(), raw)




    def test_actual_packaged_r3d1b2_multi_name_saved_previews(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        for version in ['3.2.0', '3.2.1']:
            for format in ['yaml', 'json']:
                for target in ['3.1.2', '3.0.4']:
                    with self.subTest(version=version, format=format, target=target):
                        project = self.root / ('multi-' + version + '-' + format + '-' + target)
                        project.mkdir()
                        source, manifest = project / ('api.' + format), project / 'busyapi.yaml'
                        part = {'type': 'object', 'minProperties': 1, 'maxProperties': 1, 'additionalProperties': False,
                                'properties': {name: {'type': 'string'} for name in ['a', 'b', '雪']}}
                        value = {'openapi': version, 'info': {'title': 'Multi-name', 'version': '1'},
                                 'paths': {'/parts': {'post': {'requestBody': {'content': {'multipart/form-data': {
                                     'schema': {'type': 'array', 'maxItems': 3, 'items': part}, 'itemEncoding': {'contentType': 'text/plain'}}}},
                                     'responses': {'204': {'description': 'Empty'}}}}}}
                        raw = (json.dumps(value) if format == 'json' else '# Multi-name source\r\n' +
                               '\r\n'.join(json.dumps(k) + ': ' + json.dumps(v) for k, v in value.items())).encode()
                        configuration = ('version: 1\nroots: [{name: api, path: api.' + format + '}]\ntests:\n'
                                         '- name: selected\n  operation: {entry: api, method: POST, path: /parts}\n'
                                         '  body: {mediaType: multipart/form-data, value: [{b: snow}, {a: ""}, {a: 雪}]}\n').encode()
                        source.write_bytes(raw)
                        manifest.write_bytes(configuration)
                        destination = self.root / ('output-' + project.name)
                        report = preflight_migration(bundle / 'busyapi', project, target, destination, {source: raw, manifest: configuration})
                        self.assertTrue(report['complete'])
                        self.assertFalse(report['published'])
                        records = [record for record in report['configurationProjections'] if record['pointer'] == '/tests/0/body']
                        self.assertEqual(len(records), 1)
                        self.assertEqual(json.loads(records[0]['after'])['value'], {'b': ['snow'], 'a': ['', '雪']})
                        self.assertFalse(destination.exists())

    def test_actual_packaged_r3d1b3_finite_tuple_saved_previews(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        for version in ['3.2.0', '3.2.1']:
            for format in ['yaml', 'json']:
                for target in ['3.0.0', '3.0.1', '3.0.2', '3.0.3', '3.0.4']:
                    with self.subTest(version=version, format=format, target=target):
                        project = self.root / ('tuple-' + version + '-' + format + '-' + target)
                        project.mkdir()
                        source, manifest = project / ('api.' + format), project / 'busyapi.yaml'
                        def part(value):
                            return {'type': 'object', 'required': ['tag'], 'additionalProperties': False,
                                    'properties': {'tag': value}}
                        media = {'schema': {'type': 'array', 'items': False, 'prefixItems': [
                            part({'type': 'integer', 'const': 'EXACT'}), part({'type': 'string', 'enum': ['', '雪']}),
                            part({'type': 'boolean'})]}, 'itemEncoding': {'contentType': 'application/json'}}
                        value = {'openapi': version, 'info': {'title': 'Finite tuple', 'version': '1'}, 'paths': {'/parts': {'post': {
                            'requestBody': {'content': {'multipart/form-data': media}}, 'responses': {'204': {'description': 'Empty'}}}}}}
                        raw = (json.dumps(value) if format == 'json' else '# Tuple source\r\n' +
                               '\r\n'.join(json.dumps(k) + ': ' + json.dumps(v) for k, v in value.items())).replace('"EXACT"', '9007199254740993.00').encode()
                        configuration = ('version: 1\nroots: [{name: api, path: api.' + format + '}]\ntests:\n'
                                         '- name: tuple\n  operation: {entry: api, method: POST, path: /parts}\n'
                                         '  body: {mediaType: multipart/form-data, value: [{tag: 9007199254740993.00}, {tag: 雪}, {tag: true}], partMediaTypes: {tag: application/json}}\n').encode()
                        source.write_bytes(raw)
                        manifest.write_bytes(configuration)
                        destination = self.root / ('output-' + project.name)
                        report = preflight_migration(bundle / 'busyapi', project, target, destination, {source: raw, manifest: configuration})
                        self.assertTrue(report['complete'])
                        self.assertFalse(report['published'])
                        records = [record for record in report['configurationProjections'] if record['pointer'] == '/tests/0/body']
                        self.assertEqual(len(records), 1)
                        record = records[0]
                        self.assertIn('9007199254740993.00', record['after'])
                        self.assertEqual(json.loads(record['after'])['value']['tag'][1:], ['雪', True])
                        self.assertEqual(json.loads(record['after'])['partMediaTypes'], {'tag': 'application/json'})
                        self.assertFalse(destination.exists())
                        self.assertEqual(source.read_bytes(), raw)
                        self.assertEqual(manifest.read_bytes(), configuration)

    def test_actual_packaged_r3d1b4_mixed_media_saved_previews(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        for version in ['3.2.0', '3.2.1']:
            for format in ['yaml', 'json']:
                for target in ['3.1.2', '3.0.0', '3.0.1', '3.0.2', '3.0.3', '3.0.4']:
                    with self.subTest(version=version, format=format, target=target):
                        project = self.root / ('mixed-' + version + '-' + format + '-' + target)
                        project.mkdir()
                        source, library, manifest = project / ('api.' + format), project / 'media.json', project / 'busyapi.yaml'
                        part = {'type': 'object', 'required': ['tag'], 'additionalProperties': False,
                                'properties': {'tag': {'type': 'integer', 'minimum': 'EXACT'}}}
                        media = {'schema': {'type': 'array', 'maxItems': 3, 'items': part}, 'itemEncoding': {'contentType': 'application/json'}}
                        ref = {'$ref': '#/components/mediaTypes/Chain'}
                        value = {'openapi': version, 'info': {'title': 'Mixed media', 'version': '1'},
                                 'components': {'mediaTypes': {'Chain': {'$ref': 'media.json#/Shared'}}},
                                 'paths': {'/parts': {'post': {'requestBody': {'content': {
                                     'multipart/form-data': ref, 'application/json': ref}},
                                     'responses': {'200': {'description': 'JSON', 'content': {'application/json': ref}}}}}}}
                        raw = (json.dumps(value) if format == 'json' else
                               '# Keep mixed source\r\n' + '\r\n'.join(json.dumps(k) + ': ' + json.dumps(v) for k, v in value.items())).encode()
                        child = json.dumps({'Shared': media}).replace('"EXACT"', '9007199254740993.00').encode()
                        configuration = ('version: 1\nroots: [{name: api, path: api.' + format + '}]\ntests:\n'
                                         '- name: form\n  operation: {entry: api, method: POST, path: /parts}\n'
                                         '  body: {mediaType: multipart/form-data, value: [{tag: 9007199254740993.00}]}\n'
                                         '- name: json\n  operation: {entry: api, method: POST, path: /parts}\n'
                                         '  body: {mediaType: application/json, value: [{tag: 9007199254740993.00}]}\n').encode()
                        source.write_bytes(raw)
                        library.write_bytes(child)
                        manifest.write_bytes(configuration)
                        destination = self.root / ('output-' + project.name)
                        report = preflight_migration(bundle / 'busyapi', project, target, destination,
                                                     {source: raw, library: child, manifest: configuration})
                        self.assertTrue(report['complete'])
                        self.assertFalse(report['published'])
                        projections = [record for record in report['configurationProjections'] if record['pointer'] == '/tests/0/body']
                        self.assertEqual(len(projections), 1)
                        self.assertIn('9007199254740993.00', projections[0]['after'])
                        self.assertFalse(any(record['pointer'] == '/tests/1/body' for record in report['configurationProjections']))
                        self.assertFalse(destination.exists())
                        self.assertEqual(source.read_bytes(), raw)
                        self.assertEqual(library.read_bytes(), child)
                        self.assertEqual(manifest.read_bytes(), configuration)

    def test_actual_packaged_r3d1b_named_saved_previews(self):
        bundle = Path(os.environ.get('BUSYAPI_TEST_BUNDLE') or
                      Path(__file__).resolve().parent.parent / 'build/linux/x64/release/bundle')
        for version in ['3.2.0', '3.2.1']:
            for format in ['yaml', 'json']:
                for target in ['3.1.2', '3.0.4']:
                    with self.subTest(version=version, format=format, target=target):
                        project = self.root / ('named-' + version + '-' + format + '-' + target)
                        project.mkdir()
                        source = project / ('api.' + format)
                        part = {'type': 'object', 'required': ['tag'], 'additionalProperties': False,
                                'properties': {'tag': {'type': 'string'}}}
                        media = {'schema': {'type': 'array', 'maxItems': 3, 'items': part},
                                 'prefixEncoding': [{'contentType': 'text/plain'}],
                                 'itemEncoding': {'contentType': 'text/plain'}}
                        value = {'openapi': version, 'info': {'title': 'Named positional', 'version': '1'},
                                 'paths': {'/parts': {'post': {'requestBody': {'content': {'multipart/form-data': media}},
                                                            'responses': {'204': {'description': 'Empty'}}}}}}
                        raw = (json.dumps(value) if format == 'json' else
                               '# Keep named source\r\n' + '\r\n'.join(json.dumps(k) + ': ' + json.dumps(v) for k, v in value.items())).encode()
                        manifest = project / 'busyapi.yaml'
                        configuration = ('version: 1\nroots: [{name: api, path: api.' + format + '}]\ntests:\n'
                                         '- name: selected\n  operation: {entry: api, method: POST, path: /parts}\n'
                                         '  body: {mediaType: multipart/form-data, value: [{tag: snow}, {tag: ""}]}\n').encode()
                        source.write_bytes(raw)
                        manifest.write_bytes(configuration)
                        destination = self.root / ('output-' + project.name)
                        report = preflight_migration(bundle / 'busyapi', project, target, destination,
                                                     {source: raw, manifest: configuration})
                        self.assertTrue(report['complete'])
                        self.assertFalse(report['published'])
                        records = [record for record in report['configurationProjections'] if record['pointer'] == '/tests/0/body']
                        self.assertEqual(len(records), 1)
                        self.assertEqual(json.loads(records[0]['after'])['value'], {'tag': ['snow', '']})
                        self.assertFalse(destination.exists())
                        self.assertEqual(source.read_bytes(), raw)
                        self.assertEqual(manifest.read_bytes(), configuration)

if __name__ == '__main__':
    unittest.main()
