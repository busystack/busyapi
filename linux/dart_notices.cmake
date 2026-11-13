# Independent headless-core notices for the GUI and companion AOT CLI. Nothing
# is installed or downloaded when a project is opened at runtime.
get_directory_property(BUSYAPI_NOTICE_FLUTTER_SDK
  DIRECTORY "${FLUTTER_MANAGED_DIR}" DEFINITION FLUTTER_ROOT)
set(BUSYAPI_NOTICE_DART "${BUSYAPI_NOTICE_FLUTTER_SDK}/bin/cache/dart-sdk/bin/dart")
if(NOT EXISTS "${BUSYAPI_NOTICE_DART}" OR
   NOT EXISTS "${BUSYAPI_SOURCE_DIR}/.dart_tool/package_config.json")
  message(FATAL_ERROR "Prepare the pinned Flutter SDK and run locked flutter pub get before building BusyAPI's Dart notice assets.")
endif()
set(BUSYAPI_DART_NOTICES "${BUSYAPI_SOURCE_DIR}/build/dart-notices" CACHE PATH
  "Build-time generated BusyAPI Dart notices")
file(GLOB BUSYAPI_NOTICE_TOOLS CONFIGURE_DEPENDS "${BUSYAPI_SOURCE_DIR}/packages/busyapi_core/tool/*.dart")
file(GLOB BUSYAPI_NOTICE_REVIEWS CONFIGURE_DEPENDS "${BUSYAPI_SOURCE_DIR}/tools/*review.json")
set(BUSYAPI_NOTICE_INPUTS ${BUSYAPI_NOTICE_TOOLS} ${BUSYAPI_NOTICE_REVIEWS}
  "${BUSYAPI_SOURCE_DIR}/pubspec.lock"
  "${BUSYAPI_SOURCE_DIR}/packages/busyapi_core/pubspec.lock"
  "${BUSYAPI_SOURCE_DIR}/.dart_tool/package_config.json"
  "${BUSYAPI_SOURCE_DIR}/LICENSE" "${BUSYAPI_SOURCE_DIR}/NOTICE")
# Declare the directory itself: Ninja creates its parent, while the atomic
# publisher retains ownership of creating/replacing the notice directory.
add_custom_command(OUTPUT "${BUSYAPI_DART_NOTICES}"
  COMMAND "${BUSYAPI_NOTICE_DART}"
    "--packages=${BUSYAPI_SOURCE_DIR}/.dart_tool/package_config.json"
    "${BUSYAPI_SOURCE_DIR}/packages/busyapi_core/tool/prepare_notices.dart"
    "--output=${BUSYAPI_DART_NOTICES}"
  DEPENDS ${BUSYAPI_NOTICE_INPUTS}
  VERBATIM)
add_custom_target(busyapi_dart_notices ALL DEPENDS "${BUSYAPI_DART_NOTICES}")
add_dependencies(${BINARY_NAME} busyapi_dart_notices)
install(DIRECTORY "${BUSYAPI_DART_NOTICES}/"
  DESTINATION "share/licenses/busyapi-dart"
  COMPONENT Runtime)
