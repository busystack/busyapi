"""Selected real Node/npm and build-owned SDK metadata regressions."""
import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BuildToolchain(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='busyapi-selected-toolchain-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.node = Path(os.environ.get('BUSYAPI_NODE') or shutil.which('node')).resolve()
        self.env = dict(os.environ, BUSYAPI_NODE=str(self.node))

    def test_real_selected_node_and_npm_ignore_wrong_or_missing_ambient_tools(self):
        ambient = self.root / 'ambient'
        ambient.mkdir()
        for name in ['node', 'npm']:
            tool = ambient / name
            tool.write_text('#!/bin/sh\nexit 97\n')
            tool.chmod(0o755)
        # /usr/bin provides shell utilities, not a required ambient Node/npm.
        utilities = self.root/'utilities'
        utilities.mkdir()
        for name in ['readlink', 'dirname', 'sha256sum', 'cut']:
            (utilities/name).symlink_to('/usr/bin/' + name)
        for path in [str(ambient) + ':' + str(utilities), str(utilities)]:
            result = subprocess.run(['/bin/bash', '-c',
                'set -euo pipefail; source tools/node_toolchain.sh; busyapi_select_node; '
                '"$node_bin" -p "process.execPath"; "$node_bin" "$npm_cli" --version; '
                'node -p "process.execPath"'], cwd=ROOT, env=dict(self.env, PATH=path), capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            lines = result.stdout.splitlines()
            self.assertEqual(lines[0], str(self.node))
            self.assertEqual(lines[-1], str(self.node))
            self.assertRegex(lines[1], r'^\d+\.\d+\.\d+$')

    def test_each_compile_and_test_uses_selected_runtime_not_an_ambient_command(self):
        script = (ROOT / 'tools/build_engine.sh').read_text()
        self.assertNotRegex(script, r'(?m)^node ')
        self.assertIn('"$node_bin" "$npm_cli"', script)
        for name in ['build_linux.sh', 'build_engine.sh', 'build_documentation_assets.sh']:
            self.assertIn('busyapi_select_node', (ROOT / 'tools' / name).read_text())

    def test_engine_type_gate_is_shared_by_shell_package_and_cmake(self):
        script = (ROOT/'tools/build_engine.sh').read_text()
        self.assertIn('python3 tools/prepare_contract_assets.py --node "$node_bin"', script)
        compiler = json.loads((ROOT/'tools/contract_engine/tsconfig.json').read_text())
        self.assertTrue(compiler['compilerOptions']['noEmit'])
        self.assertIn('src', compiler['include'])
        package = json.loads((ROOT/'tools/contract_engine/package.json').read_text())
        self.assertEqual(package['devDependencies']['typescript'], '5.7.3')
        self.assertEqual(package['scripts']['typecheck'], 'bash ../build_engine.sh typecheck')
        self.assertEqual(package['scripts']['build'], 'bash ../build_engine.sh compile')
        self.assertEqual(package['scripts']['test'], 'bash ../build_engine.sh test-all')
        self.assertIn('tools/build_engine.sh test-all', (ROOT/'tools/build_linux.sh').read_text())
        self.assertIn('prepare_contract_assets.py', (ROOT/'linux/contract_assets.cmake').read_text())
        self.assertIn('tools/build_linux.sh', (ROOT/'.github/workflows/flutter-linux.yml').read_text())

    def test_recording_boundaries_execute_both_production_scripts_with_selected_node(self):
        selected = self.root/'distribution/bin'
        selected.mkdir(parents=True)
        # Real pinned ELF, synthetic npm/compile/test boundaries. This tests
        # production shell selection without installing/regenerating packages.
        subprocess.run(['/usr/bin/cp', '--preserve=mode', '--', str(self.node), str(selected/'node')], check=True)
        npm = self.root/'distribution/lib/node_modules/npm/bin/npm-cli.js'
        npm.parent.mkdir(parents=True)
        log = self.root/'calls.jsonl'
        record = "process.getBuiltinModule('node:fs').appendFileSync(process.env.BUILD_CALLS, JSON.stringify([process.execPath,process.argv[1]])+'\\n');"
        npm.write_text(record + "require('node:child_process').execFileSync('node',['-e',\"require('node:fs').appendFileSync(process.env.BUILD_CALLS,JSON.stringify([process.execPath,'npm-child'])+'\\\\n')\"]);")
        tools = self.root/'tools'
        tools.mkdir()
        shutil.copy2(ROOT/'tools/node_toolchain.sh', tools/'node_toolchain.sh')
        compiler = tools/'contract_engine/node_modules/@esbuild/linux-x64/bin/esbuild'
        compiler.parent.mkdir(parents=True)
        compiler.write_text('#!/bin/sh\nexit 0\n')
        compiler.chmod(0o755)
        ambient = self.root/'ambient'
        ambient.mkdir()
        for name in ['node','npm']:
            path = ambient/name
            path.write_text('#!/bin/sh\nexit 97\n')
            path.chmod(0o755)
        for name in ['build_engine.sh','build_documentation_assets.sh']:
            script = (ROOT/'tools'/name).read_text()
            (tools/name).write_text(script)
            for line in script.splitlines():
                line = line.strip()
                if not line.startswith('"$node_bin" ') or '"$npm_cli"' in line: continue
                arguments = shlex.split(line)
                script_arguments = [argument for argument in arguments[1:] if not argument.startswith('-') and (argument.endswith(('.cjs', '.mjs')) or argument.endswith('/typescript/bin/tsc'))]
                self.assertEqual(len(script_arguments), 1, line)
                argument = script_arguments[0].replace('$engine_dir', 'tools/contract_engine')
                target = self.root/argument
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(record)
            phase = ['prepare'] if name == 'build_engine.sh' else []
            result = subprocess.run(['/bin/bash', str(tools/name), *phase], cwd=self.root,
                env=dict(self.env, BUSYAPI_NODE=str(selected/'node'), BUILD_CALLS=str(log), PATH=str(ambient)+':/usr/bin:/bin'),
                capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        # The production compile phase delegates to Python, while this fixture
        # exercises exact Node/npm selection and explicit shell type checking.
        result = subprocess.run(['/bin/bash', str(tools/'build_engine.sh'), 'typecheck'],
            cwd=self.root, env=dict(self.env, BUSYAPI_NODE=str(selected/'node'), BUILD_CALLS=str(log)),
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [json.loads(line) for line in log.read_text().splitlines()]
        self.assertTrue(all(call[0] == str(selected/'node') for call in calls), calls)
        self.assertTrue(any(call[1] == 'npm-child' for call in calls))
        self.assertTrue(any(call[1].endswith('/typescript/bin/tsc') for call in calls))
        for entry in ['tools/documentation_renderers/test_assets.mjs',
                      'tools/prepare_documentation_assets.mjs']:
            self.assertTrue(any(call[1] == str(self.root / entry) for call in calls), entry)
        # A failed explicit type check propagates its actual status.
        checker = tools/'contract_engine/node_modules/typescript/bin/tsc'
        checker.write_text(record + 'process.exit(23);')
        bundle_marker = self.root/'bundler-started'
        compiler.write_text('#!/bin/sh\nprintf called > "$BUNDLE_MARKER"\nexit 0\n')
        result = subprocess.run(['/bin/bash', str(tools/'build_engine.sh'), 'typecheck'], cwd=self.root,
            env=dict(self.env, BUSYAPI_NODE=str(selected/'node'), BUILD_CALLS=str(log),
                BUNDLE_MARKER=str(bundle_marker), PATH=str(ambient)+':/usr/bin:/bin'),
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 23, result.stderr)
        self.assertFalse(bundle_marker.exists())


    def test_snap_policy_inputs_are_explicit_and_forwarded_to_the_existing_preparer(self):
        import textwrap
        recipe = (ROOT / 'snap/snapcraft.yaml').read_text()
        policy_setup = recipe.split('override-build: |', 1)[1].split(
            '      if test "${BUSYAPI_BUILD_OFFLINE', 1)[0]
        script = 'set -eu\n' + textwrap.dedent(policy_setup)
        tools = self.root / 'tools'
        tools.mkdir()
        captured = self.root / 'policy-args.json'
        (tools / 'prepare_policy_isolation.py').write_text(
            'import json,os,sys\nfrom pathlib import Path\n'
            'Path(os.environ["POLICY_RECIPE_ARGS"]).write_text(json.dumps(sys.argv[1:]))\n')
        environment = dict(self.env, BUSYAPI_FLUTTER='/explicit/official/flutter',
                           POLICY_RECIPE_ARGS=str(captured))
        environment.pop('BUSYAPI_NODE_INCLUDE', None)
        environment.pop('BUSYAPI_SECCOMP_INCLUDE', None)
        result = subprocess.run(['/bin/bash', '-c', script], cwd=self.root,
                                env=environment, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(captured.exists())
        node_headers = self.root / 'official node headers'
        seccomp_headers = self.root / 'official seccomp headers'
        node_headers.mkdir()
        seccomp_headers.mkdir()
        environment.update(BUSYAPI_NODE_INCLUDE=str(node_headers),
                           BUSYAPI_SECCOMP_INCLUDE=str(seccomp_headers))
        result = subprocess.run(['/bin/bash', '-c', script], cwd=self.root,
                                env=environment, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(captured.read_text()), [
            '--output', 'build/contract-runtime', '--node-include', str(node_headers),
            '--seccomp-include', str(seccomp_headers)])

    def test_concurrent_sdk_probes_have_unique_cleaned_metadata(self):
        flutter = self.root / 'flutter'
        flutter.write_text('#!/bin/sh\nmetadata_path="$(readlink /proc/$$/fd/1)"\nprintf \'%s\\n\' "$metadata_path" >> "$SDK_META_LOG"\nprintf \'{"frameworkVersion":"3.47.5","dartSdkVersion":"3.13.4"}\\n\'\n')
        flutter.chmod(0o755)
        script = 'set -euo pipefail; source tools/node_toolchain.sh; flutter_bin="$SELECTED_FLUTTER"; busyapi_sdk_metadata'
        log = self.root/'metadata-paths'
        env = dict(self.env, TMPDIR=str(self.root), SELECTED_FLUTTER=str(flutter), SDK_META_LOG=str(log))
        processes = [subprocess.Popen(['/bin/bash', '-c', script], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(8)]
        for process in processes:
            _, err = process.communicate(timeout=20)
            self.assertEqual(process.returncode, 0, err.decode())
        self.assertEqual(list(self.root.glob('busyapi-build-sdk.*.json')), [])
        self.assertEqual(len(set(log.read_text().splitlines())), 8)


if __name__ == '__main__':
    unittest.main()
