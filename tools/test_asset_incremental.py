"""Exercise real CMake/Ninja incremental asset dependencies with tiny inputs."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class IncrementalAssets(unittest.TestCase):
    def test_editor_assets_prepare_once_invalidate_and_recover_missing_output(self):
        with tempfile.TemporaryDirectory(prefix='busyapi-cmake-assets-') as temporary:
            source = Path(temporary) / 'source'
            (source / 'linux').mkdir(parents=True)
            (source / 'tools/contract_engine/src').mkdir(parents=True)
            shutil.copy2(ROOT / 'linux/contract_assets.cmake', source / 'linux/contract_assets.cmake')
            (source / 'tools/prepare_policy_isolation.py').write_text('# fixture input\n')
            (source / 'LICENSE').write_text('fixture original notice\n')
            (source / 'NOTICE').write_text('fixture attribution\n')
            input_file = source / 'tools/contract_engine/src/server.ts'
            input_file.write_text('fixture original source\n')
            (source / 'tools/prepare_contract_assets.py').write_text('''import argparse
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--node')
parser.add_argument('--output', type=Path)
parser.add_argument('--profile')
args = parser.parse_args()
assert args.profile == 'editor'
args.output.mkdir(parents=True, exist_ok=True)
with (args.output.parent / 'calls').open('a') as log: log.write('prepared\\n')
for name in ['build.json', 'node', 'engine.cjs', 'conversion-worker.cjs', 'mock-server.cjs', 'policy-worker.cjs']:
    (args.output / name).write_text('fixture prepared bytes')
''')
            (source / 'CMakeLists.txt').write_text('''cmake_minimum_required(VERSION 3.13)
project(asset_fixture NONE)
set(BINARY_NAME fixture)
set(BUSYAPI_EDITOR_DEVELOPMENT ON)
add_custom_target(fixture)
include(linux/contract_assets.cmake)
''')
            build = Path(temporary) / 'build'
            environment = dict(os.environ, BUSYAPI_NODE=shutil.which('python3'))

            def run(*command):
                result = subprocess.run(command, env=environment, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

            run('cmake', '-S', str(source), '-B', str(build), '-G', 'Ninja')
            assets = source / 'build/editor-contract-runtime'
            calls = assets.parent / 'calls'
            run('cmake', '--build', str(build))
            self.assertEqual(calls.read_text().splitlines(), ['prepared'])
            run('cmake', '--build', str(build))
            self.assertEqual(calls.read_text().splitlines(), ['prepared'])
            input_file.write_text('fixture changed source\n')
            run('cmake', '--build', str(build))
            self.assertEqual(len(calls.read_text().splitlines()), 2)
            (assets / 'engine.cjs').unlink()
            run('cmake', '--build', str(build))
            self.assertEqual(len(calls.read_text().splitlines()), 3)
            self.assertTrue((assets / 'engine.cjs').is_file())
            self.assertFalse((source / 'build/generator').exists())

    def test_process_helpers_replace_running_executables_without_in_place_writes(self):
        with tempfile.TemporaryDirectory(prefix='busyapi-test-runtime-') as temporary:
            source = Path(temporary)
            (source / 'tools').mkdir()
            shutil.copy2(ROOT / 'tools/prepare_test_runtime.sh', source / 'tools/prepare_test_runtime.sh')
            runtime = source / 'build/test-runtime'
            runtime.mkdir(parents=True)
            old = runtime / 'recovery-child'
            shutil.copy2('/bin/sleep', old)
            process = subprocess.Popen([str(old), '30'])
            def stop():
                if process.poll() is None:
                    process.kill()
                process.wait(timeout=5)
            self.addCleanup(stop)
            dart = source / 'dart'
            dart.write_text('''#!/usr/bin/python3
from pathlib import Path
import sys
assert sys.argv[1:3] == ['compile', 'exe']
output = Path(sys.argv[sys.argv.index('-o') + 1])
output.write_bytes(b'new fixture executable')
output.chmod(0o755)
''')
            dart.chmod(0o755)
            result = subprocess.run(['bash', str(source / 'tools/prepare_test_runtime.sh'), '--helpers-only'],
                                    env=dict(os.environ, BUSYAPI_DART=str(dart)),
                                    capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(old.read_bytes(), b'new fixture executable')
            self.assertIsNone(process.poll())
            process.terminate()
            process.wait(timeout=5)
            self.assertTrue((runtime / 'redirect-redaction-child').is_file())
            self.assertEqual(list(runtime.glob('compiled.*')), [])


if __name__ == '__main__':
    unittest.main()
