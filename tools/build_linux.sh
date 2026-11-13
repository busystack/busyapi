#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
flutter_bin="${BUSYAPI_FLUTTER:-flutter}"
build_profile="${1:-release}"
case "$build_profile" in
  release|editor) ;;
  *) echo 'Usage: tools/build_linux.sh [release|editor]' >&2; exit 2;;
esac
export BUSYAPI_BUILD_PROFILE="$build_profile"
case "${BUSYAPI_DISTRIBUTION:-standalone}" in
  standalone|snap) ;;
  *) echo 'Choose BUSYAPI_DISTRIBUTION=standalone or snap.' >&2; exit 1;;
esac
if [[ "${BUSYAPI_DISTRIBUTION:-standalone}" == snap && -n "${BUSYAPI_NATIVE_SOURCE_CACHE:-}${BUSYAPI_NATIVE_SOURCE_INDEX:-}${BUSYAPI_NATIVE_SOURCE_OUTPUT:-}" ]]; then
  echo 'The standalone copied-library source companion is not a Snap platform inventory.' >&2
  exit 1
fi
if [[ -n "${BUSYAPI_NATIVE_SOURCE_CACHE:-}${BUSYAPI_NATIVE_SOURCE_INDEX:-}${BUSYAPI_NATIVE_SOURCE_OUTPUT:-}" ]]; then
  [[ -n "${BUSYAPI_NATIVE_SOURCE_CACHE:-}" && -n "${BUSYAPI_NATIVE_SOURCE_INDEX:-}" && -n "${BUSYAPI_NATIVE_SOURCE_OUTPUT:-}" ]] || {
    echo 'Set all three BUSYAPI_NATIVE_SOURCE_CACHE, BUSYAPI_NATIVE_SOURCE_INDEX and BUSYAPI_NATIVE_SOURCE_OUTPUT to assemble native source materials.' >&2
    exit 1
  }
fi
source tools/node_toolchain.sh
busyapi_select_node
dart_bin="$(dirname "$(readlink -f "$(command -v "$flutter_bin")")")/cache/dart-sdk/bin/dart"
# CMake admits the selected official SDK and captures its installed library.
busyapi_sdk_metadata
pub_args=(--enforce-lockfile)
if [[ "${BUSYAPI_BUILD_OFFLINE:-0}" == 1 ]]; then pub_args+=(--offline); fi
"$flutter_bin" pub get "${pub_args[@]}"
if [[ "$build_profile" == editor ]]; then
  "$flutter_bin" gen-l10n
  "$flutter_bin" build linux --debug --no-pub
  exit 0
fi
"$flutter_bin" gen-l10n
# CMake owns asset preparation; assembly never runs behavioral suites or
# reinstalls already provisioned dependencies.
"$flutter_bin" build linux --release --no-pub
bundle=build/linux/x64/release/bundle
"$dart_bin" compile exe packages/busyapi_core/bin/busyapi.dart -o "$bundle/busyapi"
package_args=("$bundle")
if [[ "${BUSYAPI_DISTRIBUTION:-standalone}" == snap ]]; then package_args+=(--platform-runtime); fi
python3 tools/package_linux.py "${package_args[@]}"
if [[ -n "${BUSYAPI_NATIVE_SOURCE_INDEX:-}" ]]; then
  python3 tools/native_sources.py "$bundle" --cache "$BUSYAPI_NATIVE_SOURCE_CACHE" \
    --index "$BUSYAPI_NATIVE_SOURCE_INDEX" --output "$BUSYAPI_NATIVE_SOURCE_OUTPUT"
fi
