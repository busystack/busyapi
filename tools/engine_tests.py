#!/usr/bin/env python3
"""Prepare test-only bundles or execute the single committed suite registration.

Production assets must already exist from prepare_contract_assets.py. This runner
never installs inputs or builds a missing/stale production runtime.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

from prepare_contract_assets import (
    ROOT, RUNTIME_ENTRYPOINTS, copy_atomic, digest, input_signature,
)

ENGINE = ROOT / 'tools/contract_engine'
REGISTRY = ENGINE / 'test-suites.json'
RUNTIME = ROOT / 'build/contract-runtime'
DIST = ENGINE / 'dist'
PREPARED = DIST / 'test-build.json'
PASSED = DIST / 'test-all.json'


def registry():
    value = json.loads(REGISTRY.read_text())
    if value['version'] != 1:
        raise RuntimeError('Unsupported Engine suite registration')
    paths = [suite['path'] for suite in value['suites']]
    if len(paths) != len(set(paths)) or not paths:
        raise RuntimeError('Empty or duplicate Engine suite registration')
    for path in paths:
        if not (ROOT / path).is_file() or not (ROOT / path).resolve().is_relative_to(ROOT):
            raise RuntimeError('Invalid registered suite: ' + path)
    targets = [helper['target'] for helper in value['helpers']]
    if len(targets) != len(set(targets)):
        raise RuntimeError('Duplicate test helper')
    for helper in value['helpers']:
        if (Path(helper['target']).name != helper['target']
                or not (ENGINE / helper['source']).resolve().is_relative_to(ENGINE)
                or not (ENGINE / helper['source']).is_file()
                or helper['target'] in {target for _, target in RUNTIME_ENTRYPOINTS}):
            raise RuntimeError('Invalid test-only helper')
    return value


def inputs(node):
    receipt = json.loads((RUNTIME / 'build.json').read_text())
    lock = json.loads((ENGINE / 'runtime.lock.json').read_text())
    if (receipt['inputs'] != input_signature()
            or digest(node) != lock['binarySha256']
            or receipt['runtimeEntrypoints'] != [target for _, target in RUNTIME_ENTRYPOINTS]):
        raise RuntimeError('Production inputs are stale; run tools/build_engine.sh compile')
    for target, field in [('engine.cjs', 'helperSha256'),
                          ('policy-worker.cjs', 'policyHelperSha256'),
                          ('mock-server.cjs', 'mockHelperSha256')]:
        if digest(RUNTIME / target) != receipt[field]:
            raise RuntimeError('Production helper changed: ' + target)
    paths = [Path(__file__).resolve(), ROOT / 'tools/build_engine.sh', REGISTRY]
    paths += sorted(ENGINE.glob('*.cjs')) + sorted(ENGINE.glob('*.json'))
    for folder in ['src', 'testing', 'fixtures']:
        paths += sorted(path for path in (ENGINE / folder).rglob('*') if path.is_file())
    for pattern in ['*.mjs', '*.json']:
        paths += sorted((ROOT / 'tools/documentation_renderers').glob(pattern))
    # Bind tests to actual production bytes, native helpers, schemas and notices.
    paths += sorted(path for path in RUNTIME.rglob('*') if path.is_file())
    identity = hashlib.sha256()
    for path in paths:
        if path.is_symlink():
            raise RuntimeError('Test input must not be a symlink: ' + str(path))
        identity.update(str(path.relative_to(ROOT)).encode() + b'\0')
        identity.update(bytes.fromhex(digest(path)))
    return identity.hexdigest()


def write_record(path, value):
    with tempfile.TemporaryDirectory(dir=DIST) as temporary:
        staged = Path(temporary) / path.name
        staged.write_text(json.dumps(value, sort_keys=True, indent=2) + '\n')
        copy_atomic(staged, path)


def prepare(node, value):
    PREPARED.unlink(missing_ok=True)
    identity = inputs(node)
    DIST.mkdir(parents=True, exist_ok=True)
    compiler = ENGINE / 'node_modules/@esbuild/linux-x64/bin/esbuild'
    with tempfile.TemporaryDirectory(dir=DIST) as temporary:
        staging = Path(temporary)
        for _, target in RUNTIME_ENTRYPOINTS:
            copy_atomic(RUNTIME / target, staging / target)
        for helper in value['helpers']:
            subprocess.run([str(compiler), str(ENGINE / helper['source']), '--bundle',
                            '--platform=node', '--format=cjs', '--main-fields=module,main',
                            '--outfile=' + str(staging / helper['target'])], check=True, cwd=ROOT)
        files = {path.name: digest(path) for path in staging.iterdir()}
        if inputs(node) != identity:
            raise RuntimeError('Inputs changed while preparing Engine tests')
        for name in files:
            copy_atomic(staging / name, DIST / name)
    write_record(PREPARED, {'inputs': identity, 'files': files})


def admitted(node, value):
    state = json.loads(PREPARED.read_text())
    expected = {target for _, target in RUNTIME_ENTRYPOINTS}
    expected.update(helper['target'] for helper in value['helpers'])
    if state['inputs'] != inputs(node) or set(state['files']) != expected:
        raise RuntimeError('Test helpers are stale; run tools/build_engine.sh prepare-tests')
    for name, identity in state['files'].items():
        path = DIST / name
        if path.is_symlink() or digest(path) != identity:
            raise RuntimeError('Test helper changed: ' + name)
    return state


def execute(node, value, selected=None):
    state = admitted(node, value)
    suites = value['suites']
    if selected is not None:
        if len(selected) != len(set(selected)) or set(selected) - {s['path'] for s in suites}:
            raise RuntimeError('Use unique, complete registered suite paths for focused tests')
        suites = [suite for suite in suites if suite['path'] in selected]
    print('FOCUSED Engine checks' if selected is not None else 'ALL registered Engine/renderer checks', flush=True)
    commands = []
    for suite in suites:
        command = [str(node), *suite['nodeArgs'], suite['path']]
        print('Executing ' + suite['path'], flush=True)
        subprocess.run(command, check=True, cwd=ROOT)
        commands.append(command)
    if admitted(node, value) != state:
        raise RuntimeError('Engine test inputs changed during execution')
    if selected is None:
        write_record(PASSED, {'prepared': state, 'suites': value['suites'],
                              'commands': commands, 'exitStatus': 0})


def check(node, value):
    passed = json.loads(PASSED.read_text())
    if (passed['prepared'] != admitted(node, value)
            or passed['suites'] != value['suites'] or passed['exitStatus'] != 0):
        raise RuntimeError('Full Engine gate is missing, failed, skipped or stale')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['prepare', 'all', 'focused', 'check'])
    parser.add_argument('--node', type=Path, required=True)
    parser.add_argument('suites', nargs='*')
    args = parser.parse_intermixed_args()
    # Any new preparation/test attempt retires previous aggregate acceptance,
    # including an attempt that fails admission or only runs a focused subset.
    if args.phase != 'check':
        PASSED.unlink(missing_ok=True)
    try:
        value = registry()
        if args.phase != 'focused' and args.suites:
            raise RuntimeError('Suite selection is allowed only for focused checks')
        if args.phase == 'prepare':
            prepare(args.node.resolve(), value)
        elif args.phase == 'check':
            check(args.node.resolve(), value)
        elif args.phase == 'focused' and not args.suites:
            raise RuntimeError('Focused checks require registered suite paths')
        else:
            execute(args.node.resolve(), value, args.suites if args.phase == 'focused' else None)
    except subprocess.CalledProcessError as error:
        parser.exit(error.returncode if error.returncode > 0 else 1, f'Engine gate failed: {error}\n')
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        parser.exit(1, f'Engine gate blocked: {error}\n')


if __name__ == '__main__':
    main()
