#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
  '') ;;
  --helpers-only|--core) ;;
  *) echo 'Usage: tools/prepare_test_runtime.sh [--core|--helpers-only]' >&2; exit 2;;
esac
dart_bin="${BUSYAPI_DART:-$(command -v dart)}"
mkdir -p build/test-runtime
# A running fixture may still hold the previous executable. Compile beside it
# and publish by rename instead of truncating that executable's inode.
compile_executable() (
  local source_file="$1" destination="$2" stage
  stage="$(mktemp -d "$(dirname "$destination")/compiled.XXXXXXXX")"
  trap 'rm -f -- "$stage/executable"; rmdir -- "$stage"' EXIT
  "$dart_bin" compile exe "$source_file" -o "$stage/executable"
  mv -f -- "$stage/executable" "$destination"
)
if [[ "${1:-}" != --helpers-only ]]; then
if [[ "${1:-}" == --core ]]; then
  python3 tools/prepare_contract_assets.py --profile editor --output build/editor-contract-runtime
  python3 - <<'STAGE'
import sys
from pathlib import Path
sys.path.insert(0, 'tools')
from prepare_contract_assets import copy_atomic
source = Path('build/editor-contract-runtime')
target = Path('build/test-runtime/libexec/busyapi')
target.mkdir(parents=True, exist_ok=True)
for name in ['node', 'engine.cjs', 'conversion-worker.cjs', 'policy-worker.cjs',
             'mock-server.cjs', 'schemas', 'licenses', 'build.json']:
    paths = sorted((source / name).rglob('*')) if (source / name).is_dir() else [source / name]
    for path in paths:
        destination = target / path.relative_to(source)
        if path.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            copy_atomic(path, destination, path.stat().st_mode & 0o777)
STAGE

else
  python3 tools/prepare_contract_assets.py --output build/test-runtime/libexec/busyapi
  python3 tools/prepare_m3_tools.py --output build/test-runtime/libexec/busyapi
  python3 tools/prepare_generator.py --output build/test-runtime/libexec/busyapi/generator
  node_bin=build/test-runtime/libexec/busyapi/node
  "$node_bin" tools/prepare_documentation_assets.mjs --output build/test-runtime/share/busyapi/documentation/redoc
  "$node_bin" tools/prepare_documentation_assets.mjs --output build/test-runtime/share/busyapi/documentation/swagger --preset swagger
fi
compile_executable packages/busyapi_core/bin/busyapi.dart build/test-runtime/busyapi
"$dart_bin" packages/busyapi_core/tool/prepare_notices.dart --output=build/dart-notices
python3 tools/prepare_resource_package_assets.py --output build/resource-package-runtime \
  --dart "$dart_bin" --contract-runtime build/test-runtime/libexec/busyapi --dart-notices build/dart-notices
# Use the same installed layout as CMake. No runtime fallback to the checkout.
install -m 755 build/resource-package-runtime/resource-package-loader build/test-runtime/libexec/busyapi/resource-package-loader
mkdir -p build/test-runtime/share/busyapi/resource-package build/test-runtime/share/licenses/busyapi-dart build/test-runtime/share/licenses/busyapi-engine
install -m 644 build/resource-package-runtime/runtime.json build/test-runtime/share/busyapi/resource-package/runtime.json
cp -R build/dart-notices/. build/test-runtime/share/licenses/busyapi-dart/
cp -R build/test-runtime/libexec/busyapi/licenses/. build/test-runtime/share/licenses/busyapi-engine/
fi
compile_executable packages/busyapi_core/test/recovery_child.dart build/test-runtime/recovery-child

compile_executable packages/busyapi_core/test/publication_child.dart build/test-runtime/publication-child
compile_executable packages/busyapi_core/test/cli_fault_child.dart build/test-runtime/cli-fault-child
compile_executable packages/busyapi_core/test/definition_move_child.dart build/test-runtime/definition-move-child
compile_executable packages/busyapi_core/test/file_move_child.dart build/test-runtime/file-move-child
compile_executable packages/busyapi_core/test/redirect_redaction_child.dart build/test-runtime/redirect-redaction-child
