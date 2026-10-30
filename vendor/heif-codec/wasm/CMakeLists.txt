cmake_minimum_required(VERSION 3.25)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(cloakimg-heif-codec src/bindings.cpp)
add_dependencies(cloakimg-heif-codec cloakimg-heif libwebp)
target_include_directories(cloakimg-heif-codec PRIVATE ${CMAKE_BINARY_DIR}/libwebp-build/install/include)
target_link_libraries(cloakimg-heif-codec PRIVATE
  cloakimg-heif
  ${CMAKE_BINARY_DIR}/libwebp-build/install/lib/libwebp.a
  ${CMAKE_BINARY_DIR}/libwebp-build/install/lib/libsharpyuv.a
  -lembind
  -sINITIAL_MEMORY=64MB
  -sALLOW_MEMORY_GROWTH=1
  -sSTACK_SIZE=1MB
  -sSINGLE_FILE=1
  -sENVIRONMENT=web,worker
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createCloakimgHeifCodec
)

# Keeps clangd aware of Emscripten's system include paths.
execute_process(COMMAND em++ --cflags OUTPUT_VARIABLE EM_CFLAGS)
set_target_properties(cloakimg-heif-codec PROPERTIES COMPILE_FLAGS "${EM_CFLAGS}")
