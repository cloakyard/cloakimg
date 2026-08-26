cmake_minimum_required(VERSION 3.25)
project(cloakimg-heif-codec)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

add_subdirectory(core)
if(EMSCRIPTEN)
  add_subdirectory(wasm)
endif()
