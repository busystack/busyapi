"""Actual selected compiler/plugin notice publication and Ninja installation."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from urllib.parse import unquote, urljoin, urlparse

from tools.verify_application_assets import verify

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / '.dart_tool/package_config.json'


class ApplicationAssets(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        configuration = json.loads(CONFIG.read_text())
        cls.packages = {item['name']: Path(unquote(urlparse(urljoin(CONFIG.as_uri(), item['rootUri'])).path)) for item in configuration['packages']}
        cls.sdk = cls.packages['flutter'].parent.parent
        cls.dart = os.environ.get('BUSYAPI_DART', str(cls.sdk/'bin/cache/dart-sdk/bin/dart'))
        cls.script = ROOT/'packages/busyapi_core/tool/prepare_notices.dart'
        selected = ROOT/'build/.last_build_id'
        if not selected.is_file():
            raise unittest.SkipTest('Build the ordinary pinned Linux application first')
        compiler = ROOT/'.dart_tool/flutter_build'/selected.read_text().strip()
        # Follow the selected compiler receipt, just as CMake does. A release
        # candidate must not require rebuilding an unrelated debug application.
        cls.mode = next((mode for mode in ('Release', 'Profile')
                         if (compiler/f'aot_elf_{mode.lower()}.stamp').is_file()), 'Debug')
        cls.relative_artifact = ('data/flutter_assets/kernel_blob.bin' if cls.mode == 'Debug'
                                 else 'lib/libapp.so')
        cls.artifact = ROOT/('build/flutter_assets/kernel_blob.bin' if cls.mode == 'Debug'
                            else 'build/lib/libapp.so')

    def run_tool(self, output, *extra):
        return subprocess.run([self.dart, '--packages='+str(CONFIG), str(self.script),
                               '--application='+str(self.artifact), '--mode='+self.mode, '--entry=lib/main.dart',
                               '--output='+str(output), *extra], capture_output=True, text=True, timeout=120)

    def test_actual_notices_and_covered_sources_survive_relocation_and_fail_closed_on_tampering(self):
        with tempfile.TemporaryDirectory(prefix='busyapi-application-assets-') as temporary:
            bundle = Path(temporary)/'relocated 雪 with spaces'
            artifact = bundle/self.relative_artifact
            artifact.parent.mkdir(parents=True)
            shutil.copyfile(self.artifact, artifact)
            output = bundle/'share/licenses/busyapi-application'
            result = self.run_tool(output)
            self.assertEqual(result.returncode, 0, result.stderr)
            inventory = verify(bundle)
            self.assertEqual(len(inventory['packages']), 82)
            self.assertEqual(sum(item['license'] == 'MPL-2.0' for item in inventory['packages']), 9)
            self.assertEqual(len(inventory['datasets']), 5)
            self.assertEqual(len(inventory['supplements']), 4)
            owner_notice = (output/'BusyAPI-NOTICE').read_text()
            self.assertIn('native Linux rendering stack uses the FreeType Project', owner_notice)
            self.assertIn('FreeType License (FTL) alternative', owner_notice)
            self.assertIn('This software is based in part on the work of the Independent JPEG Group.', owner_notice)
            self.assertEqual((output/'BusyAPI-NOTICE').read_bytes(), (ROOT/'NOTICE').read_bytes())
            for name, expected in [('UNICODE-16-LICENSE', '1991-2024 Unicode'), ('CLDR-48-LICENSE', '2004-2025 Unicode'), ('Apache-2.0', 'Patent'), ('WHATWG-HTML-ENTITIES-LICENSE', 'WHATWG')]:
                self.assertIn(expected, (output/'supplements'/name).read_text())
            before = {str(path.relative_to(output)): path.read_bytes() for path in output.rglob('*') if path.is_file()}
            result = self.run_tool(output)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(before, {str(path.relative_to(output)): path.read_bytes() for path in output.rglob('*') if path.is_file()})
            covered = output/'sources/gtk-2.2.0/lib/gtk.dart'
            original = covered.read_bytes()
            covered.write_bytes(original + b'changed')
            with self.assertRaisesRegex(RuntimeError, 'covered source'):
                verify(bundle)
            covered.write_bytes(original)
            notice = output/'supplements/UNICODE-16-LICENSE'
            original = notice.read_bytes()
            notice.write_bytes(original + b'changed')
            with self.assertRaisesRegex(RuntimeError, 'dataset/codec notice'):
                verify(bundle)
            notice.write_bytes(original)
            notice.unlink()
            notice.symlink_to(self.packages['characters']/'third_party/Unicode_Consortium/UNICODE_LICENSE.txt')
            with self.assertRaisesRegex(RuntimeError, 'symlinks'):
                verify(bundle)
            notice.unlink()
            notice.write_bytes(original)
            path = output/'dependencies.json'
            original_inventory = path.read_bytes()
            inventory['application']['entry'] = 'test/benchmark_desktop.dart'
            inventory['application']['productionEntry'] = False
            path.write_text(json.dumps(inventory))
            with self.assertRaisesRegex(RuntimeError, 'development/test entry'):
                verify(bundle)
            path.write_bytes(original_inventory)
            with artifact.open('r+b') as stream:
                first = stream.read(1)
                stream.seek(0)
                stream.write(bytes([first[0] ^ 1]))
            with self.assertRaisesRegex(RuntimeError, 'does not match'):
                verify(bundle)

    def test_unowned_output_is_not_overwritten_and_option_errors_cannot_publish(self):
        with tempfile.TemporaryDirectory(prefix='busyapi-application-denied-') as temporary:
            output = Path(temporary)/'source'
            output.mkdir()
            authored = output/'contract.yaml'
            authored.write_bytes(b'# unchanged\r\nopenapi: 3.2.0\r\n')
            result = self.run_tool(output)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(authored.read_bytes(), b'# unchanged\r\nopenapi: 3.2.0\r\n')
            result = self.run_tool(Path(temporary)/'not-created', '--font-assets=invalid')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('are separate', result.stderr)
            self.assertFalse((Path(temporary)/'not-created').exists())

    def test_ninja_tracks_outputs_changed_inside_the_flutter_backend(self):
        with tempfile.TemporaryDirectory(prefix='busyapi-compiler-output-') as temporary:
            root = Path(temporary)
            source, build = root/'source', root/'cmake'
            managed = source/'flutter'
            ephemeral = managed/'ephemeral'
            ephemeral.mkdir(parents=True)
            shutil.copy2(ROOT/'linux/flutter/CMakeLists.txt', managed/'CMakeLists.txt')
            shutil.copy2(ROOT/'linux/flutter_assets.cmake', source/'flutter_assets.cmake')
            backend = root/'sdk/packages/flutter_tools/bin/tool_backend.sh'
            backend.parent.mkdir(parents=True)
            program = root/'backend.py'
            program.write_text('''from pathlib import Path
root=Path(__file__).parent
def output(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_bytes()!=value: path.write_bytes(value)
output(root/'source/build/lib/libapp.so', (root/'selected').read_bytes())
output(root/'source/build/.last_build_id', b'fixed compiler configuration')
output(root/'source/build/flutter_assets/FontManifest.json', b'[]')
output(root/'source/flutter/ephemeral/libflutter_linux_gtk.so', b'fixed engine')
''')
            backend.write_text('#!/bin/sh\nexec /usr/bin/python3 '+str(program)+'\n')
            backend.chmod(0o755)
            recorder = root/'notice-recorder'
            recorder.write_text('''#!/usr/bin/python3
import sys
from pathlib import Path
def option(prefix): return next(value[len(prefix):] for value in sys.argv[1:] if value.startswith(prefix))
out=Path(option('--output=')); out.mkdir(parents=True, exist_ok=True)
(out/'seen').write_bytes(Path(option('--application=')).read_bytes())
with (out/'calls').open('a') as log: log.write('prepared\\n')
''')
            recorder.chmod(0o755)
            (ephemeral/'generated_config.cmake').write_text(f'''
set(PROJECT_DIR "{source}")
set(FLUTTER_ROOT "{root}/sdk")
set(FLUTTER_TARGET_PLATFORM linux-x64)
set(FLUTTER_TOOL_ENVIRONMENT "FLUTTER_TARGET=lib/main.dart")
''')
            notices = root/'notices'
            (source/'CMakeLists.txt').write_text(f'''cmake_minimum_required(VERSION 3.16)
project(compiler_output_test LANGUAGES NONE)
set(BINARY_NAME busyapi-desktop)
add_custom_target(busyapi-desktop ALL)
set(BUSYAPI_SOURCE_DIR "{ROOT}")
set(BUSYAPI_NOTICE_DART "{recorder}")
set(FLUTTER_MANAGED_DIR "{managed}")
set(BUSYAPI_APPLICATION_NOTICES "{notices}" CACHE PATH "" FORCE)
set(FLUTTER_ASSET_DIR_NAME flutter_assets)
add_subdirectory(flutter)
include("{ROOT}/linux/application_notices.cmake")
''')
            selected = root/'selected'
            selected.write_bytes(b'first application')
            result = subprocess.run(['cmake', '-G', 'Ninja', '-S', str(source), '-B', str(build),
                                     '-DCMAKE_BUILD_TYPE=Release'], capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
            for artifact, preparations in [(b'first application', 1), (b'later application', 2),
                                           (b'later application', 2)]:
                selected.write_bytes(artifact)
                result = subprocess.run(['cmake', '--build', str(build)], capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
                self.assertEqual((notices/'seen').read_bytes(), artifact)
                self.assertEqual((notices/'calls').read_text().splitlines(), ['prepared']*preparations)

    def test_ninja_all_mode_command_wiring_and_selected_notice_installation(self):
        with tempfile.TemporaryDirectory(prefix='busyapi-application-cmake-') as temporary:
            root = Path(temporary)
            source = root/'source'
            source.mkdir()
            managed = source/'flutter'
            managed.mkdir()
            (managed/'CMakeLists.txt').write_text('set(FLUTTER_TOOL_ENVIRONMENT "FLUTTER_TARGET=lib/main.dart")\n')
            (source/'CMakeLists.txt').write_text(f'''cmake_minimum_required(VERSION 3.16)
project(application_notice_test LANGUAGES NONE)
set(BINARY_NAME busyapi-desktop)
add_custom_target(${{BINARY_NAME}} ALL)
set(BUSYAPI_SOURCE_DIR "{ROOT}")
set(BUSYAPI_NOTICE_DART "{self.dart}")
set(FLUTTER_MANAGED_DIR "{managed}")
add_subdirectory(flutter)
set(PROJECT_BUILD_DIR "{ROOT}/build/")
set(FLUTTER_ASSET_DIR_NAME flutter_assets)
set(AOT_LIBRARY "{ROOT}/build/lib/libapp.so")
add_custom_target(flutter_assemble)
include("{ROOT}/linux/application_notices.cmake")
''')
            for mode in ('Debug', 'Profile', 'Release'):
                build = root/mode
                output = root/('notices-'+mode)
                install = root/('installed-'+mode)
                result = subprocess.run(['cmake', '-G', 'Ninja', '-S', str(source), '-B', str(build),
                                         '-DCMAKE_BUILD_TYPE='+mode, '-DCMAKE_INSTALL_PREFIX='+str(install),
                                         '-DBUSYAPI_APPLICATION_NOTICES='+str(output)], capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)
                ninja = (build/'build.ninja').read_text()
                self.assertIn('--mode='+mode, ninja)
                self.assertIn('--entry=lib/main.dart', ninja)
                artifact = ROOT/('build/flutter_assets/kernel_blob.bin' if mode == 'Debug'
                                else 'build/lib/libapp.so')
                self.assertIn(str(artifact), ninja)
                # Exercise the actual selected compiler output; the other
                # modes retain their wiring checks without forged receipts.
                if mode != self.mode:
                    continue
                result = subprocess.run(['cmake', '--build', str(build)], capture_output=True, text=True, timeout=120)
                self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
                result = subprocess.run(['cmake', '--install', str(build)], capture_output=True, text=True, timeout=60)
                self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
                artifact = install/self.relative_artifact
                artifact.parent.mkdir(parents=True)
                shutil.copyfile(self.artifact, artifact)
                self.assertEqual(len(verify(install)['packages']), 82)
                self.assertFalse(any(path.is_symlink() for path in install.rglob('*')))
            (managed/'CMakeLists.txt').write_text(f'set(FLUTTER_TOOL_ENVIRONMENT "FLUTTER_TARGET={ROOT}/test/benchmark_desktop.dart")\n')
            result = subprocess.run(['cmake', '-S', str(source), '-B', str(root/'Debug')], capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('--entry='+str(ROOT/'test/benchmark_desktop.dart'), (root/'Debug/build.ninja').read_text())


if __name__ == '__main__':
    unittest.main()
