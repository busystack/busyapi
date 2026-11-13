#!/usr/bin/env python3
"""Assemble and check one Linux release candidate in this invocation.

No saved test receipt can qualify another candidate. Native interaction and
strict-confined platform acceptance remain separate from these automated gates.
"""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / 'build/linux/x64/release/bundle'


def capture(directory, *, source=False):
    """Bind this run to actual inputs/outputs, including modes and link targets."""
    result = {}
    excluded = {'build', 'node_modules', 'dist', '__pycache__', '.git', '.dart_tool',
                '.idea', '.agents', '.aws', '.codex', 'coverage', 'diagnostics',
                'qualification'} if source else set()
    for parent, folders, files in os.walk(directory, followlinks=False):
        folders[:] = sorted(name for name in folders if name not in excluded and
            (not source or (Path(parent) / name).relative_to(directory).as_posix() not in
             {'linux/flutter/ephemeral', 'lib/l10n/generated'}))
        for name in sorted(files + [name for name in folders if (Path(parent) / name).is_symlink()]):
            path = Path(parent) / name
            relative = path.relative_to(directory).as_posix()
            if source and (name in {'.flutter-plugins-dependencies', '.packages'} or
                           name.endswith(('.pyc', '.private.log', '.iml')) or
                           relative.startswith('linux/flutter/generated_')):
                continue
            if path.is_symlink():
                result[relative] = ('link', os.readlink(path))
            else:
                with path.open('rb') as data:
                    result[relative] = (path.stat().st_mode & 0o777,
                                        hashlib.file_digest(data, 'sha256').hexdigest())
    return result


def qualify(flutter):
    executable = shutil.which(flutter)
    if executable is None:
        raise RuntimeError('Select the pinned Flutter SDK with BUSYAPI_FLUTTER')
    flutter = Path(executable).resolve()
    dart = flutter.parent / 'cache/dart-sdk/bin/dart'
    environment = dict(os.environ, BUSYAPI_FLUTTER=str(flutter),
                       BUSYAPI_DART=str(dart), BUSYAPI_TEST_BUNDLE=str(BUNDLE))

    def run(*command):
        subprocess.run(list(map(str, command)), cwd=ROOT, env=environment, check=True)

    # Freeze source before assembly, then bind the checks to the installed
    # candidate. Nothing writes a persistent acceptance record.
    source = capture(ROOT, source=True)
    run('tools/build_linux.sh', 'release')
    if source != capture(ROOT, source=True):
        raise RuntimeError('Candidate inputs changed during assembly; retry qualification')
    candidate = capture(BUNDLE)
    run('tools/build_engine.sh', 'prepare-tests')
    run('tools/build_engine.sh', 'test-all')
    run(BUNDLE / 'libexec/busyapi/node', '--test',
        'tools/documentation_renderers/test_assets.mjs')
    run('tools/prepare_test_runtime.sh', '--helpers-only')
    run(flutter, 'analyze', '--no-pub')
    run(flutter, 'test', '--no-pub', '--concurrency=1')
    run(dart, 'test', 'packages/busyapi_core/test', '--concurrency=1')
    run('python3', 'tools/artifact_smoke.py', BUNDLE)
    if source != capture(ROOT, source=True) or candidate != capture(BUNDLE):
        raise RuntimeError('Candidate inputs or installed files changed during qualification')
    print('PASS automated Linux candidate qualification; native/platform acceptance remains separate')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        qualify(os.environ.get('BUSYAPI_FLUTTER', 'flutter'))
    except subprocess.CalledProcessError as error:
        parser.exit(max(1, error.returncode), f'Candidate qualification failed: {error}\n')
    except (OSError, RuntimeError) as error:
        parser.exit(1, f'Candidate qualification blocked: {error}\n')


if __name__ == '__main__':
    main()
