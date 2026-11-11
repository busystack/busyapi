"""Phase ordering/admission controls, prepared under the execution hold."""
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


class EnginePhases(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.dist = self.root / 'dist'
        self.dist.mkdir()
        for name, value in [('DIST', self.dist), ('PREPARED', self.dist / 'test-build.json'),
                            ('PASSED', self.dist / 'test-all.json')]:
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
            runner.check(Path('/selected/node'), self.value)
        self.assertEqual([call.args[0] for call in run.call_args_list], [
            ['/selected/node', '--disable-proto=throw', 'first.cjs'],
            ['/selected/node', 'second.cjs']])
        runner.PASSED.unlink()
        with patch.object(runner, 'admitted', return_value=self.state), \
                patch.object(runner.subprocess, 'run', side_effect=subprocess.CalledProcessError(9, 'first')) as run:
            with self.assertRaises(subprocess.CalledProcessError):
                runner.execute(Path('/selected/node'), self.value)
        self.assertEqual(run.call_count, 1)
        self.assertFalse(runner.PASSED.exists())

    def test_release_orders_mandatory_engine_phases_before_assembly(self):
        script = (ROOT / 'tools/build_linux.sh').read_text()
        steps = ['tools/build_engine.sh prepare\n', 'tools/build_engine.sh compile\n',
                 'tools/build_engine.sh prepare-tests\n', 'tools/build_engine.sh test-all\n',
                 'test packages/busyapi_core/test', 'build linux --release',
                 'tools/build_engine.sh check-all\n', 'python3 tools/package_linux.py']
        positions = [script.index(step) for step in steps]
        self.assertEqual(positions, sorted(positions))
        self.assertIn('set -euo pipefail', script)

    def test_focused_failed_and_skipped_attempts_cannot_reuse_full_evidence(self):
        for arguments in [['focused', '--node', '/selected/node', 'first.cjs'],
                          ['all', '--node', '/selected/node']]:
            runner.PASSED.write_text('old success')
            with patch.object(sys, 'argv', ['engine_tests.py', *arguments]), \
                    patch.object(runner, 'registry', return_value=self.value), \
                    patch.object(runner, 'admitted', side_effect=RuntimeError('stale')):
                with self.assertRaises(SystemExit) as caught:
                    runner.main()
            self.assertEqual(caught.exception.code, 1)
            self.assertFalse(runner.PASSED.exists())
        with self.assertRaises(FileNotFoundError):
            runner.check(Path('/selected/node'), self.value)
        with patch.object(runner, 'admitted', return_value=self.state), \
                patch.object(runner.subprocess, 'run'):
            runner.execute(Path('/selected/node'), self.value, ['first.cjs'])
        self.assertFalse(runner.PASSED.exists())

    def test_changed_inputs_or_helpers_reject_admission_and_aggregate(self):
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
        runner.PASSED.write_text(json.dumps({'prepared': self.state, 'suites': self.value['suites'], 'exitStatus': 0}))
        with patch.object(runner, 'admitted', return_value={'inputs': 'changed'}):
            with self.assertRaisesRegex(RuntimeError, 'stale'):
                runner.check(Path('/selected/node'), self.value)

    def test_nested_renderer_fixture_bytes_names_and_membership_change_identity(self):
        engine = self.root / 'tools/contract_engine'
        runtime = self.root / 'runtime'
        engine.mkdir(parents=True)
        runtime.mkdir()
        node = self.root / 'node'
        node.write_bytes(b'controlled runtime')
        (engine / 'runtime.lock.json').write_text(json.dumps({'binarySha256': builder.digest(node)}))
        receipt = {'inputs': 'production', 'runtimeEntrypoints': [target for _, target in runner.RUNTIME_ENTRYPOINTS]}
        for target, field in [('engine.cjs', 'helperSha256'), ('policy-worker.cjs', 'policyHelperSha256'),
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
            self.assertNotEqual(original, changed)
            renamed = fixture.with_name('renamed.json')
            fixture.rename(renamed)
            moved = runner.inputs(node)
            self.assertNotEqual(changed, moved)
            added = fixture.with_name('additional.mjs')
            added.write_text('export default "nested fixture";')
            self.assertNotEqual(moved, runner.inputs(node))
            added.unlink()
            self.assertEqual(moved, runner.inputs(node))
            renamed.unlink()
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
