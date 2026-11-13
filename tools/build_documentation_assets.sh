#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source tools/node_toolchain.sh
busyapi_select_node
case "${1:-compile}" in
  prepare)
    for dependency_tree in tools/documentation_renderers tools/documentation_renderers/swagger; do
      npm_args=(ci --prefix "$dependency_tree" --ignore-scripts --no-audit --no-fund)
      if [[ "${BUSYAPI_BUILD_OFFLINE:-0}" == 1 ]]; then npm_args+=(--offline); fi
      SCARF_ANALYTICS=false npm_config_update_notifier=false "$node_bin" "$npm_cli" "${npm_args[@]}"
    done
    exit 0;;
  compile) ;;
  *) echo 'Usage: tools/build_documentation_assets.sh [prepare|compile]' >&2; exit 2;;
esac
"$node_bin" tools/prepare_documentation_assets.mjs --output build/documentation-runtime/redoc
"$node_bin" tools/prepare_documentation_assets.mjs --output build/documentation-runtime/swagger --preset swagger
