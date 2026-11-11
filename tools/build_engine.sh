#!/usr/bin/env bash
# Explicit phases. Provisioning is never an implicit side effect of compilation.
set -euo pipefail
cd "$(dirname "$0")/.."
phase="${1:-}"
if [[ $# -gt 0 ]]; then shift; fi
case "$phase" in
  prepare|typecheck|compile|prepare-tests|test-all|check-all) [[ $# == 0 ]] || exit 2;;
  test-focused) [[ $# -gt 0 ]] || { echo 'Name at least one registered suite path.' >&2; exit 2; };;
  *) echo 'Usage: tools/build_engine.sh {prepare|typecheck|compile|prepare-tests|test-all|test-focused SUITE...|check-all}' >&2; exit 2;;
esac
# Retire prior aggregate evidence even if input selection or the next gate fails.
if [[ "$phase" != check-all ]]; then
  rm -f -- tools/contract_engine/dist/test-all.json
fi
source tools/node_toolchain.sh
busyapi_select_node
engine_dir=tools/contract_engine
case "$phase" in
  prepare)
    npm_args=(ci --prefix "$engine_dir" --ignore-scripts --no-audit --no-fund)
    if [[ "${BUSYAPI_BUILD_OFFLINE:-0}" == 1 ]]; then npm_args+=(--offline); fi
    SCARF_ANALYTICS=false npm_config_update_notifier=false "$node_bin" "$npm_cli" "${npm_args[@]}";;
  typecheck)
    "$node_bin" "$engine_dir/node_modules/typescript/bin/tsc" --project "$engine_dir/tsconfig.json" --pretty false;;
  compile)
    python3 tools/prepare_contract_assets.py --node "$node_bin";;
  prepare-tests)
    python3 tools/engine_tests.py prepare --node "$node_bin";;
  test-all)
    python3 tools/engine_tests.py all --node "$node_bin";;
  test-focused)
    python3 tools/engine_tests.py focused --node "$node_bin" "$@";;
  check-all)
    python3 tools/engine_tests.py check --node "$node_bin";;
esac
