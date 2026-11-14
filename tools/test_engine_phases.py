"""Production/test asset admission and current-candidate qualification."""
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
# Match production script imports without executing any command on import.
sys.path.insert(0, str(ROOT / 'tools'))
import engine_tests as runner
import prepare_contract_assets as builder
import qualify_linux as qualification


class EnginePhases(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.dist = self.root / 'dist'
        self.dist.mkdir()
        for name, value in [('DIST', self.dist), ('PREPARED', self.dist / 'test-build.json')]:
            control = patch.object(runner, name, value)
            control.start()
            self.addCleanup(control.stop)
        self.value = {'helpers': [{'source': 'src/model.ts', 'target': 'model.cjs'}],
                      'suites': [{'path': 'first.cjs', 'nodeArgs': ['--disable-proto=throw']},
                                 {'path': 'second.cjs', 'nodeArgs': []}]}
        self.state = {'inputs': 'same-source', 'files': {}}

    def test_shell_compile_never_installs_prepares_tests_or_runs_suites(self):
        tools = self.root / 'tools'
        tools.mkdir()
        shutil.copy2(ROOT / 'tools/build_engine.sh', tools / 'build_engine.sh')
        (tools / 'node_toolchain.sh').write_text(
            'busyapi_select_node() { node_bin=/selected/node; npm_cli=/selected/npm; }\n')
        (tools / 'prepare_contract_assets.py').write_text(
            'import sys\nfrom pathlib import Path\n'
            'Path("compiled").write_text(" ".join(sys.argv[1:]))\n'
            'sys.exit(23 if Path("fail").exists() else 0)\n')
        result = subprocess.run(['/bin/bash', str(tools / 'build_engine.sh'), 'compile'],
                                cwd=self.root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / 'compiled').read_text(), '--node /selected/node')
        (self.root / 'fail').touch()
        result = subprocess.run(['/bin/bash', str(tools / 'build_engine.sh'), 'compile'],
                                cwd=self.root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 23, result.stderr)

    def test_type_failure_stops_production_before_bundling_or_receipt(self):
        engine = self.root / 'tools/contract_engine'
        engine.mkdir(parents=True)
        node = self.root / 'node'
        node.write_bytes(b'controlled build input')
        (engine / 'runtime.lock.json').write_text(json.dumps(
            {'node': '24.15.0', 'binarySha256': builder.digest(node)}))
        (engine / 'dependencies.review.json').write_text('{"version":1,"packages":{}}')
        packages = {'dependencies': {}, 'devDependencies': {'esbuild': '0.25.0', 'typescript': '5.7.3'}}
        (engine / 'package.json').write_text(json.dumps(packages))
        locked = {}
        for name, version in [('esbuild', '0.25.0'), ('@esbuild/linux-x64', '0.25.0'),
                              ('typescript', '5.7.3')]:
            folder = engine / 'node_modules' / name
            folder.mkdir(parents=True)
            (folder / 'package.json').write_text(json.dumps({'version': version}))
            locked['node_modules/' + name] = {'version': version}
        (engine / 'package-lock.json').write_text(json.dumps({'packages': locked}))
        output = self.root / 'runtime'
        failure = subprocess.CalledProcessError(23, ['typecheck'])
        with patch.object(builder, 'ROOT', self.root), \
                patch.object(builder, 'input_signature', return_value='captured'), \
                patch.object(builder.platform, 'system', return_value='Linux'), \
                patch.object(builder.platform, 'machine', return_value='x86_64'), \
                patch.object(builder.subprocess, 'run', side_effect=failure) as run:
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                builder.prepare(output, node)
        self.assertEqual(caught.exception.returncode, 23)
        self.assertEqual(run.call_count, 1)
        self.assertIn('/typescript/bin/tsc', run.call_args.args[0][1])
        self.assertFalse((output / 'engine.cjs').exists())
        self.assertFalse((output / 'build.json').exists())

    def test_full_suite_preserves_flags_order_and_failure_stops_remaining_tests(self):
        with patch.object(runner, 'admitted', return_value=self.state), \
                patch.object(runner.subprocess, 'run') as run:
            runner.execute(Path('/selected/node'), self.value)
        self.assertEqual([call.args[0] for call in run.call_args_list], [
            ['/selected/node', '--disable-proto=throw', 'first.cjs'],
            ['/selected/node', 'second.cjs']])
        with patch.object(runner, 'admitted', return_value=self.state), \
                patch.object(runner.subprocess, 'run', side_effect=subprocess.CalledProcessError(9, 'first')) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                runner.execute(Path('/selected/node'), self.value)
        self.assertEqual(run.call_count, 1)

    def test_candidate_rejects_behavior_failures_after_covering_every_independent_gate(self):
        flutter = '/sdk/bin/flutter'
        core = '/sdk/bin/cache/dart-sdk/bin/dart'
        gates = [(flutter, 'test', '--no-pub'),
                 (core, 'test', 'packages/busyapi_core/test'),
                 ('tools/build_engine.sh', 'test-all'),
                 (str(qualification.BUNDLE / 'libexec/busyapi/node'), '--test',
                  'tools/documentation_renderers/test_assets.mjs'),
                 ('python3', 'tools/artifact_smoke.py', str(qualification.BUNDLE))]
        failed = {gates[0]: 9, gates[2]: 11}

        def execute(command, **_):
            if tuple(command) in failed:
                raise subprocess.CalledProcessError(failed[tuple(command)], command)

        output = io.StringIO()
        with patch.object(qualification.shutil, 'which', return_value=flutter), \
                patch.object(qualification, 'capture', return_value={'candidate': 'fixed'}) as capture, \
                patch.object(qualification.subprocess, 'run', side_effect=execute) as run, \
                patch.object(sys, 'stdout', output):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                qualification.qualify(flutter)
        self.assertIn(caught.exception.returncode, failed.values())
        commands = [tuple(call.args[0]) for call in run.call_args_list]
        self.assertTrue(all(commands.count(gate) == 1 for gate in gates))
        self.assertEqual([call.args[0] for call in capture.call_args_list[-2:]],
                         [qualification.ROOT, qualification.BUNDLE])
        self.assertIn('FAILED official Flutter widgets (exit 9)', output.getvalue())
        self.assertIn('FAILED registered Engine/renderer suites (exit 11)', output.getvalue())
        self.assertNotIn('PASS', output.getvalue())

    def test_qualification_uses_installed_candidate_and_one_official_widget_harness(self):
        output = io.StringIO()
        with patch.object(qualification.shutil, 'which', return_value='/sdk/bin/flutter'), \
                patch.object(qualification, 'capture', return_value={'candidate': 'fixed'}), \
                patch.object(qualification.subprocess, 'run') as run, \
                patch.object(sys, 'stdout', output):
            qualification.qualify('/sdk/bin/flutter')
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(sum(command[1:3] == ['test', '--no-pub'] for command in commands), 1)
        self.assertEqual(commands.count(['tools/build_engine.sh', 'prepare-tests']), 1)
        self.assertEqual(commands.count(['tools/prepare_test_runtime.sh', '--helpers-only']), 1)
        self.assertIn('PASS automated Linux candidate qualification', output.getvalue())
        self.assertTrue(all(call.kwargs['env']['BUSYAPI_TEST_BUNDLE'] == str(qualification.BUNDLE)
                            for call in run.call_args_list))
        self.assertTrue(all(call.kwargs['env']['BUSYAPI_TEST_FIXTURE_DIRECTORY'] == str(qualification.FIXTURES)
                            for call in run.call_args_list))
        self.assertFalse(qualification.FIXTURES.is_relative_to(qualification.BUNDLE))
        gates = {tuple(command) for command in commands if command[1:3] == ['test', '--no-pub']
                 or command[-1] == 'packages/busyapi_core/test'
                 or command[-1] == 'test-all' or '--test' in command
                 or 'tools/artifact_smoke.py' in command}
        for prerequisite in [('tools/build_linux.sh', 'release'),
                             ('/sdk/bin/flutter', 'analyze', '--no-pub'),
                             ('tools/build_engine.sh', 'prepare-tests'),
                             ('tools/prepare_test_runtime.sh', '--helpers-only')]:
            def execute(command, **_):
                if tuple(command) == prerequisite:
                    raise subprocess.CalledProcessError(23, command)

            with self.subTest(prerequisite=prerequisite), \
                    patch.object(qualification.shutil, 'which', return_value='/sdk/bin/flutter'), \
                    patch.object(qualification, 'capture', return_value={'candidate': 'fixed'}), \
                    patch.object(qualification.subprocess, 'run', side_effect=execute) as run:
                with self.assertRaises(subprocess.CalledProcessError):
                    qualification.qualify('/sdk/bin/flutter')
            self.assertFalse(gates.intersection(tuple(call.args[0]) for call in run.call_args_list))

    def test_changed_candidate_or_source_rejects_qualification(self):
        for captures in [
            [{'source': 'before'}, {'source': 'changed'}],
            [{'source': 'same'}, {'source': 'same'}, {'candidate': 'before'},
             {'source': 'same'}, {'candidate': 'changed'}],
            [{'source': 'before'}, {'source': 'before'}, {'candidate': 'same'},
             {'source': 'changed'}, {'candidate': 'same'}],
        ]:
            output = io.StringIO()
            with self.subTest(captures=captures), \
                    patch.object(qualification.shutil, 'which', return_value='/sdk/bin/flutter'), \
                    patch.object(qualification, 'capture', side_effect=captures) as capture, \
                    patch.object(qualification.subprocess, 'run'), \
                    patch.object(sys, 'stdout', output):
                with self.assertRaisesRegex(RuntimeError, 'changed'):
                    qualification.qualify('/sdk/bin/flutter')
            if len(captures) > 2:
                self.assertEqual([call.args[0] for call in capture.call_args_list[-2:]],
                                 [qualification.ROOT, qualification.BUNDLE])
            self.assertNotIn('PASS', output.getvalue())

    def test_changed_inputs_or_helpers_reject_admission(self):
        files = {target: 'hash' for _, target in runner.RUNTIME_ENTRYPOINTS}
        files['model.cjs'] = 'hash'
        runner.PREPARED.write_text(json.dumps({'inputs': 'before', 'files': files}))
        with patch.object(runner, 'inputs', return_value='after'):
            with self.assertRaisesRegex(RuntimeError, 'stale'):
                runner.admitted(Path('/selected/node'), self.value)
        runner.PREPARED.write_text(json.dumps({'inputs': 'same', 'files': files}))
        with patch.object(runner, 'inputs', return_value='same'), \
                patch.object(runner, 'digest', return_value='tampered'):
            with self.assertRaises((FileNotFoundError, RuntimeError)):
                runner.admitted(Path('/selected/node'), self.value)
    def test_directly_executed_fixtures_do_not_rebuild_test_helpers(self):
        engine = self.root / 'tools/contract_engine'
        runtime = self.root / 'runtime'
        engine.mkdir(parents=True)
        runtime.mkdir()
        node = self.root / 'node'
        node.write_bytes(b'controlled runtime')
        (engine / 'src').mkdir()
        helper = engine / 'src/model.ts'
        helper.write_text('controlled helper source')
        (engine / 'runtime.lock.json').write_text(json.dumps({'binarySha256': builder.digest(node)}))
        receipt = {'inputs': 'production', 'profile': 'release', 'runtimeEntrypoints': [target for _, target in runner.RUNTIME_ENTRYPOINTS]}
        for target, field in [('engine.cjs', 'helperSha256'), ('conversion-worker.cjs', 'conversionHelperSha256'), ('policy-worker.cjs', 'policyHelperSha256'),
                              ('mock-server.cjs', 'mockHelperSha256')]:
            (runtime / target).write_text('controlled ' + target)
            receipt[field] = builder.digest(runtime / target)
        (runtime / 'build.json').write_text(json.dumps(receipt))
        registry = engine / 'test-suites.json'
        registry.write_text(json.dumps(self.value))
        script = self.root / 'tools/engine_tests.py'
        script.write_text('controlled runner input')
        (self.root / 'tools/build_engine.sh').write_text('controlled phase input')
        fixture = self.root / 'tools/documentation_renderers/test_fixtures/nested/package.json'
        fixture.parent.mkdir(parents=True)
        fixture.write_text('{"version":"original"}')
        with patch.object(runner, 'ROOT', self.root), patch.object(runner, 'ENGINE', engine), \
                patch.object(runner, 'RUNTIME', runtime), patch.object(runner, 'REGISTRY', registry), \
                patch.object(runner, '__file__', str(script)), \
                patch.object(runner, 'input_signature', return_value='production'):
            original = runner.inputs(node)
            fixture.write_text('{"version":"changed"}')
            changed = runner.inputs(node)
            self.assertEqual(original, changed)
            renamed = fixture.with_name('renamed.json')
            fixture.rename(renamed)
            moved = runner.inputs(node)
            self.assertEqual(changed, moved)
            added = fixture.with_name('additional.mjs')
            added.write_text('export default "nested fixture";')
            self.assertEqual(moved, runner.inputs(node))
            added.unlink()
            self.assertEqual(moved, runner.inputs(node))
            renamed.unlink()
            self.assertEqual(moved, runner.inputs(node))
            helper.write_text('changed compiled helper source')
            self.assertNotEqual(moved, runner.inputs(node))

    def test_registry_retains_ordinary_suite_discovery_and_required_security_flags(self):
        value = runner.registry()
        registered = {suite['path'] for suite in value['suites']}
        # These require the real kernel harness, retained as its own release gate.
        kernel = {'test_policy_isolation.cjs', 'test_policy_process.cjs', 'test_policy_execution.cjs'}
        expected = {str(path.relative_to(ROOT)) for path in (ROOT / 'tools/contract_engine').glob('test_*.cjs')
                    if path.name not in kernel}
        self.assertEqual({path for path in registered if path.startswith('tools/contract_engine/')}, expected)
        flags = {suite['path']: suite['nodeArgs'] for suite in value['suites']}
        self.assertEqual(flags['tools/contract_engine/test_server_contexts.cjs'], ['--disable-proto=throw'])
        self.assertEqual(flags['tools/contract_engine/test_migration_property_names.cjs'], ['--disable-proto=throw'])


if __name__ == '__main__':
    unittest.main()
