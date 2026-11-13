# Every Flutter/IDE build installs the executable-relative contract runtime.
# Preparation is offline and uses only explicitly provisioned, locked inputs.
find_package(Python3 REQUIRED COMPONENTS Interpreter)
get_filename_component(BUSYAPI_SOURCE_DIR "${CMAKE_CURRENT_LIST_DIR}/.." ABSOLUTE)
set(BUSYAPI_ASSET_PROFILE "release")
if(BUSYAPI_EDITOR_DEVELOPMENT)
  set(BUSYAPI_ASSET_PROFILE "editor")
endif()
if(NOT DEFINED BUSYAPI_CONTRACT_ASSETS)
  set(BUSYAPI_CONTRACT_ASSETS "${BUSYAPI_SOURCE_DIR}/build/${BUSYAPI_ASSET_PROFILE}-contract-runtime")
  if(NOT BUSYAPI_EDITOR_DEVELOPMENT)
    set(BUSYAPI_CONTRACT_ASSETS "${BUSYAPI_SOURCE_DIR}/build/contract-runtime")
  endif()
endif()
set(BUSYAPI_M3_TOOL_ASSETS "${BUSYAPI_SOURCE_DIR}/build/m3-tools")
file(GLOB_RECURSE BUSYAPI_CONTRACT_INPUTS CONFIGURE_DEPENDS
  "${BUSYAPI_SOURCE_DIR}/tools/contract_engine/src/*.ts"
  "${BUSYAPI_SOURCE_DIR}/tools/contract_engine/schemas/*.json"
  "${BUSYAPI_SOURCE_DIR}/tools/contract_engine/licenses/*"
  "${BUSYAPI_SOURCE_DIR}/tools/contract_engine/native/*")
file(GLOB BUSYAPI_CONTRACT_METADATA CONFIGURE_DEPENDS "${BUSYAPI_SOURCE_DIR}/tools/contract_engine/*.json")
set(BUSYAPI_SELECTED_NODE "$ENV{BUSYAPI_NODE}")
if(NOT BUSYAPI_SELECTED_NODE)
  unset(BUSYAPI_SELECTED_NODE)
  find_program(BUSYAPI_SELECTED_NODE NAMES node)
  if(NOT BUSYAPI_SELECTED_NODE)
    message(FATAL_ERROR "Select the pinned Node build input with BUSYAPI_NODE")
  endif()
endif()
set(BUSYAPI_CONTRACT_STAMP "${BUSYAPI_SOURCE_DIR}/build/${BUSYAPI_ASSET_PROFILE}-contract-runtime.prepared")
add_custom_command(OUTPUT "${BUSYAPI_CONTRACT_STAMP}"
  COMMAND "${Python3_EXECUTABLE}"
    "${BUSYAPI_SOURCE_DIR}/tools/prepare_contract_assets.py"
    --node "${BUSYAPI_SELECTED_NODE}" --output "${BUSYAPI_CONTRACT_ASSETS}" --profile "${BUSYAPI_ASSET_PROFILE}"
  COMMAND "${CMAKE_COMMAND}" -E touch "${BUSYAPI_CONTRACT_STAMP}"
  DEPENDS "${BUSYAPI_SELECTED_NODE}" ${BUSYAPI_CONTRACT_INPUTS} ${BUSYAPI_CONTRACT_METADATA}
    "${BUSYAPI_SOURCE_DIR}/tools/prepare_contract_assets.py"
    "${BUSYAPI_SOURCE_DIR}/tools/prepare_policy_isolation.py"
    "${BUSYAPI_SOURCE_DIR}/LICENSE" "${BUSYAPI_SOURCE_DIR}/NOTICE"
  BYPRODUCTS "${BUSYAPI_CONTRACT_ASSETS}/build.json" "${BUSYAPI_CONTRACT_ASSETS}/node"
    "${BUSYAPI_CONTRACT_ASSETS}/engine.cjs"
    "${BUSYAPI_CONTRACT_ASSETS}/conversion-worker.cjs"
    "${BUSYAPI_CONTRACT_ASSETS}/mock-server.cjs"
    "${BUSYAPI_CONTRACT_ASSETS}/policy-worker.cjs"
  VERBATIM)
add_custom_target(busyapi_contract_assets ALL DEPENDS "${BUSYAPI_CONTRACT_STAMP}")
add_dependencies(${BINARY_NAME} busyapi_contract_assets)

install(PROGRAMS "${BUSYAPI_CONTRACT_ASSETS}/node"
  DESTINATION "${CMAKE_INSTALL_PREFIX}/libexec/busyapi" COMPONENT Runtime)
install(FILES "${BUSYAPI_CONTRACT_ASSETS}/engine.cjs"
  "${BUSYAPI_CONTRACT_ASSETS}/conversion-worker.cjs"
  "${BUSYAPI_CONTRACT_ASSETS}/build.json"
  "${BUSYAPI_CONTRACT_ASSETS}/mock-server.cjs"
  "${BUSYAPI_CONTRACT_ASSETS}/policy-worker.cjs"
  DESTINATION "${CMAKE_INSTALL_PREFIX}/libexec/busyapi" COMPONENT Runtime)
install(DIRECTORY "${BUSYAPI_CONTRACT_ASSETS}/schemas/"
  DESTINATION "${CMAKE_INSTALL_PREFIX}/share/busyapi/schemas" COMPONENT Runtime)
install(DIRECTORY "${BUSYAPI_CONTRACT_ASSETS}/licenses/"
  DESTINATION "${CMAKE_INSTALL_PREFIX}/share/licenses/busyapi-engine" COMPONENT Runtime)
if(NOT BUSYAPI_EDITOR_DEVELOPMENT)
  install(PROGRAMS "${BUSYAPI_CONTRACT_ASSETS}/policy-launcher"
    DESTINATION "${CMAKE_INSTALL_PREFIX}/libexec/busyapi" COMPONENT Runtime)
  install(FILES "${BUSYAPI_CONTRACT_ASSETS}/policy-isolation.node" "${BUSYAPI_CONTRACT_ASSETS}/policy-build.json"
    DESTINATION "${CMAKE_INSTALL_PREFIX}/libexec/busyapi" COMPONENT Runtime)
  add_custom_command(OUTPUT "${BUSYAPI_M3_TOOL_ASSETS}/tools.json"
    COMMAND "${Python3_EXECUTABLE}"
      "${BUSYAPI_SOURCE_DIR}/tools/prepare_m3_tools.py"
      --output "${BUSYAPI_M3_TOOL_ASSETS}"
    DEPENDS "${BUSYAPI_SOURCE_DIR}/tools/prepare_m3_tools.py" "${BUSYAPI_SOURCE_DIR}/LICENSE"
    BYPRODUCTS "${BUSYAPI_M3_TOOL_ASSETS}/oasdiff"
    VERBATIM)
  add_custom_target(busyapi_m3_tool_assets ALL DEPENDS "${BUSYAPI_M3_TOOL_ASSETS}/tools.json")
  add_dependencies(${BINARY_NAME} busyapi_m3_tool_assets)
  install(PROGRAMS "${BUSYAPI_M3_TOOL_ASSETS}/oasdiff"
    DESTINATION "${CMAKE_INSTALL_PREFIX}/libexec/busyapi" COMPONENT Runtime)
  install(FILES "${BUSYAPI_M3_TOOL_ASSETS}/tools.json"
    DESTINATION "${CMAKE_INSTALL_PREFIX}/share/busyapi" COMPONENT Runtime)
  install(DIRECTORY "${BUSYAPI_M3_TOOL_ASSETS}/licenses/"
    DESTINATION "${CMAKE_INSTALL_PREFIX}/share/licenses/busyapi-tools" COMPONENT Runtime)

  include("${CMAKE_CURRENT_LIST_DIR}/documentation_assets.cmake")

  # Explicitly prepared official JAR/JRE; no application-time provisioning.
  set(BUSYAPI_GENERATOR_ASSETS "${BUSYAPI_SOURCE_DIR}/build/generator")
  file(GLOB BUSYAPI_GENERATOR_INPUTS CONFIGURE_DEPENDS "${BUSYAPI_SOURCE_DIR}/tools/generator/*")
  add_custom_command(OUTPUT "${BUSYAPI_GENERATOR_ASSETS}/assets.json"
    COMMAND "${Python3_EXECUTABLE}" "${BUSYAPI_SOURCE_DIR}/tools/prepare_generator.py"
      --output "${BUSYAPI_GENERATOR_ASSETS}"
    DEPENDS "${BUSYAPI_SOURCE_DIR}/tools/prepare_generator.py" ${BUSYAPI_GENERATOR_INPUTS}
    VERBATIM)
  add_custom_target(busyapi_generator_assets ALL DEPENDS "${BUSYAPI_GENERATOR_ASSETS}/assets.json")
  add_dependencies(${BINARY_NAME} busyapi_generator_assets)
  install(DIRECTORY "${BUSYAPI_GENERATOR_ASSETS}/"
    DESTINATION "${CMAKE_INSTALL_PREFIX}/libexec/busyapi/generator"
    USE_SOURCE_PERMISSIONS COMPONENT Runtime)
  install(DIRECTORY "${BUSYAPI_GENERATOR_ASSETS}/notices/"
    DESTINATION "${CMAKE_INSTALL_PREFIX}/share/licenses/busyapi-generator" COMPONENT Runtime)
  install(DIRECTORY "${BUSYAPI_GENERATOR_ASSETS}/jre/legal/"
    DESTINATION "${CMAKE_INSTALL_PREFIX}/share/licenses/busyapi-generator/jre-legal" COMPONENT Runtime)

endif()
