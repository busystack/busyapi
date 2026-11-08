"""Check a packaged migration fixture before requesting desktop input."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import re


MIGRATION_PRODUCER = '99'


def verify_migration_producer(metadata):
    if (not isinstance(metadata, dict)
            or metadata.get('producer') != 'busyapi-native-migration'
            or metadata.get('producerVersion') != MIGRATION_PRODUCER):
        raise RuntimeError('Native migration fixture and packaged migration producer differ')


def verify_configuration_projections(report):
    records = report.get('configurationProjections')
    if not isinstance(records, list) or len(records) > 4096:
        raise RuntimeError('Migration review omitted bounded configuration projections')
    seen = set()
    pattern = r'/(?:environments/[^/]+/(?:servers/[^/]+|baseUrl)|tests/[0-9]+/(?:operation|parameters|server|servers/[^/]+))'
    for record in records:
        if (not isinstance(record, dict) or not isinstance(record.get('pointer'), str)
                or not re.fullmatch(pattern, record['pointer']) or record['pointer'] in seen
                or len(record['pointer']) > 65536
                or record.get('before') is not None and not isinstance(record['before'], str)
                or not isinstance(record.get('after'), str)):
            raise RuntimeError('Migration returned unrelated configuration projection records')
        seen.add(record['pointer'])
        for field in ('cookieUnwraps', 'emptyQueries'):
            names = record.get(field, [])
            if (not isinstance(names, list) or len(names) > 2048
                    or any(not isinstance(name, str) or not name for name in names)
                    or len(set(names)) != len(names)
                    or names and not record['pointer'].endswith('/parameters')):
                raise RuntimeError('Migration returned malformed empty/singleton parameter proofs')
        try:
            json.loads(record['after'])
            if record.get('before') is not None:
                json.loads(record['before'])
        except (ValueError, TypeError) as error:
            raise RuntimeError('Migration returned malformed exact configuration values') from error
        for field in ('rawQueries', 'cookieGroups'):
            proofs = record.get(field, [])
            if not isinstance(proofs, list) or len(proofs) > 2048 or proofs and not record['pointer'].endswith('/parameters'):
                raise RuntimeError('Migration returned unrelated parameter projection proofs')
            names = set()
            for proof in proofs:
                if (not isinstance(proof, dict) or not isinstance(proof.get('name'), str)
                        or proof['name'] in names or not isinstance(proof.get('destinations'), list)
                        or not 1 <= len(proof['destinations']) <= 2048
                        or any(not isinstance(name, str) or not name for name in proof['destinations'])
                        or len(set(proof['destinations'])) != len(proof['destinations'])):
                    raise RuntimeError('Migration returned malformed parameter projection proofs')
                names.add(proof['name'])
                if field == 'rawQueries':
                    targets = proof.get('targets')
                    if (not isinstance(targets, list) or len(targets) != len(proof['destinations'])
                            or any(not isinstance(target, dict)
                                   or target.get('name') != proof['destinations'][index]
                                   or not isinstance(target.get('resource'), str)
                                   or not isinstance(target.get('pointer'), str)
                                   or len(target['pointer']) > 65536
                                   or target['pointer'] and not target['pointer'].startswith('/')
                                   or re.search(r'~(?![01])', target['pointer'])
                                   for index, target in enumerate(targets))):
                        raise RuntimeError('Migration returned malformed raw query target owners')
                    try:
                        if not isinstance(proof.get('data'), str) or not isinstance(json.loads(proof['data']), dict):
                            raise ValueError('Expected captured decoded object data')
                    except (ValueError, TypeError) as error:
                        raise RuntimeError('Migration returned malformed raw query data') from error
    parameters = report.get('parameterChanges')
    if not isinstance(parameters, list) or len(parameters) > 4096:
        raise RuntimeError('Migration review omitted bounded parameter changes')
    seen_parameters = set()
    for change in parameters:
        if (not isinstance(change, dict) or any(not isinstance(change.get(key), str)
                for key in ('resource', 'pointer', 'name', 'before', 'after'))
                or not isinstance(change.get('range'), list) or len(change['range']) != 2
                or any(type(value) is not int for value in change['range'])
                or change['range'][0] < 0 or change['range'][1] < change['range'][0]):
            raise RuntimeError('Migration returned malformed parameter change locations')
        identity = tuple(change[key] for key in ('resource', 'pointer', 'before', 'after'))
        if (identity in seen_parameters or any(len(change[key]) > 65536 for key in ('pointer', 'name', 'before', 'after'))
                or change['pointer'] and not change['pointer'].startswith('/')
                or re.search(r'~(?![01])', change['pointer'])):
            raise RuntimeError('Migration returned malformed parameter change locations')
        seen_parameters.add(identity)


def preflight_migration(binary, source, target, destination, originals):
    """Preview the exact saved fixture; never apply or publish its conversion."""
    binary, source, destination = Path(binary), Path(source), Path(destination)
    if destination.exists() or destination.is_symlink():
        raise RuntimeError('Choose an absent private preflight destination')
    before = {str(path): hashlib.sha256(raw).hexdigest() for path, raw in originals.items()}
    if any(Path(path).read_bytes() != raw for path, raw in originals.items()):
        raise RuntimeError('Native migration fixture changed before preflight')
    result = subprocess.run(
        [str(binary), 'migrate', str(source), '--target', target,
         '--output', str(destination), '--json'],
        env={'PATH': '', 'LANG': 'C.UTF-8'},
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError('Packaged migration preflight failed: ' + result.stdout + result.stderr)
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError('Packaged migration returned malformed preflight JSON') from error
    verify_migration_producer(report)
    verify_configuration_projections(report)
    selected = report.get('target')
    identity = report.get('reviewIdentity')
    if (report.get('status') != 'faithfully-convertible'
            or report.get('complete') is not True
            or report.get('published') is not False
            or not isinstance(selected, dict) or selected.get('declaredVersion') != target
            or not isinstance(identity, str) or not re.fullmatch('[0-9a-f]{64}', identity)):
        raise RuntimeError('Packaged migration did not return a complete unpublished fixture review')
    if destination.exists() or destination.is_symlink():
        raise RuntimeError('Migration preflight unexpectedly published a destination')
    if any(Path(path).read_bytes() != raw for path, raw in originals.items()):
        raise RuntimeError('Migration preflight changed its original fixture')
    return {'producerVersion': report['producerVersion'], 'target': target,
            'reviewIdentity': report['reviewIdentity'], 'sourceIdentities': before,
            'published': False, 'nativeAcceptance': False,
            'configurationProjections': report['configurationProjections'], 'parameterChanges': report['parameterChanges']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    parser.add_argument('--version', choices=['2.0', '3.0.4', '3.1.2', '3.2.1'], default='3.0.4')
    parser.add_argument('--target', choices=['2.0', '3.0.4', '3.1.2', '3.2.1'], default='2.0')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='busyapi-migration-preflight-') as directory:
        path = Path(directory)
        source = path / 'api.json'
        value = {'swagger' if args.version == '2.0' else 'openapi': args.version,
                 'info': {'title': 'Owned preflight 雪', 'version': 'api-version'}, 'paths': {}}
        raw = (json.dumps(value, ensure_ascii=False) + '\n').encode()
        source.write_bytes(raw)
        report = preflight_migration(args.bundle.resolve() / 'busyapi', source,
                                     args.target, path / 'preview', {source: raw})
        print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
