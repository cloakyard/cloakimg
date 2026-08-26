cmake_minimum_required(VERSION 3.25)

include(ExternalProject)

option(EMSCRIPTEN "Build with Emscripten" OFF)

set(EXTRA_CXX_FLAGS "-D__EMSCRIPTEN_STANDALONE_WASM__=1")
set(EXTERNAL_ARGS
  -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
  -DCMAKE_INSTALL_PREFIX:PATH=install
  -DCMAKE_CXX_FLAGS=${EXTRA_CXX_FLAGS}
  -DCMAKE_C_FLAGS=${EXTRA_CXX_FLAGS}
)
if(EMSCRIPTEN)
  list(APPEND EXTERNAL_ARGS
    -DCMAKE_TOOLCHAIN_FILE=$ENV{EMSCRIPTEN_ROOT}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake
  )
endif()

# Exact upstream releases keep the generated codec reproducible. These
# projects are all active; see README.md for the update procedure.
ExternalProject_Add(kvazaar
  GIT_REPOSITORY https://github.com/ultravideo/kvazaar.git
  GIT_TAG v2.3.2
  GIT_SHALLOW TRUE
  UPDATE_DISCONNECTED TRUE
  SOURCE_DIR ${CMAKE_BINARY_DIR}/kvazaar-src
  BINARY_DIR ${CMAKE_BINARY_DIR}/kvazaar-build
  TEST_COMMAND ""
  PATCH_COMMAND sed -i "/-muse-unaligned-vector-move/d" ${CMAKE_BINARY_DIR}/kvazaar-src/CMakeLists.txt
  CMAKE_ARGS
    -DBUILD_TESTS=OFF
    -DBUILD_KVAZAAR_BINARY=OFF
    -DBUILD_SHARED_LIBS=OFF
    ${EXTERNAL_ARGS}
)

ExternalProject_Add(libde265
  GIT_REPOSITORY https://github.com/strukturag/libde265.git
  GIT_TAG v1.1.1
  GIT_SHALLOW TRUE
  UPDATE_DISCONNECTED TRUE
  SOURCE_DIR ${CMAKE_BINARY_DIR}/libde265-src
  BINARY_DIR ${CMAKE_BINARY_DIR}/libde265-build
  TEST_COMMAND ""
  CMAKE_ARGS
    -DENABLE_SDL=OFF
    -DENABLE_DECODER=OFF
    -DBUILD_SHARED_LIBS=OFF
    ${EXTERNAL_ARGS}
)

set(LIBDE265_INCLUDE_DIR ${CMAKE_BINARY_DIR}/libde265-build/install/include)
set(LIBDE265_LIBRARY_DIR ${CMAKE_BINARY_DIR}/libde265-build/libde265)
set(LIBDE265_LIBRARY ${LIBDE265_LIBRARY_DIR}/libde265.a)
set(KVAZAAR_INCLUDE_DIR ${CMAKE_BINARY_DIR}/kvazaar-build/install/include)
set(KVAZAAR_LIBRARY_DIR ${CMAKE_BINARY_DIR}/kvazaar-build/install/lib)
set(KVAZAAR_LIBRARY ${KVAZAAR_LIBRARY_DIR}/libkvazaar.a)
set(LIBHEIF_LIBRARY_DIR ${CMAKE_BINARY_DIR}/libheif-build/install/lib)

ExternalProject_Add(libheif
  GIT_REPOSITORY https://github.com/strukturag/libheif.git
  GIT_TAG v1.22.2
  GIT_SHALLOW TRUE
  UPDATE_DISCONNECTED TRUE
  SOURCE_DIR ${CMAKE_BINARY_DIR}/libheif-src
  BINARY_DIR ${CMAKE_BINARY_DIR}/libheif-build
  TEST_COMMAND ""
  CMAKE_ARGS
    -DENABLE_PLUGIN_LOADING=OFF
    -DENABLE_MULTITHREADING_SUPPORT=OFF
    -DENABLE_PARALLEL_TILE_DECODING=OFF
    -DWITH_X265=OFF
    -DWITH_KVAZAAR=ON
    -DWITH_LIBDE265=ON
    -DWITH_X264=OFF
    -DWITH_OpenH264_DECODER=OFF
    -DWITH_AOM_DECODER=OFF
    -DWITH_AOM_ENCODER=OFF
    -DWITH_LIBSHARPYUV=OFF
    -DWITH_GDK_PIXBUF=OFF
    -DWITH_EXAMPLES=OFF
    -DBUILD_TESTING=OFF
    -DBUILD_SHARED_LIBS=OFF
    -DLIBDE265_INCLUDE_DIR=${LIBDE265_INCLUDE_DIR}
    -DLIBDE265_LIBRARY=${LIBDE265_LIBRARY}
    -DKVAZAAR_INCLUDE_DIR=${KVAZAAR_INCLUDE_DIR}
    -DKVAZAAR_LIBRARY=${KVAZAAR_LIBRARY}
    ${EXTERNAL_ARGS}
)
add_dependencies(libheif kvazaar libde265)

set(CMAKE_CXX_STANDARD 17)
add_library(cloakimg-heif STATIC src/codec.cpp)
add_dependencies(cloakimg-heif libheif)
target_include_directories(cloakimg-heif PUBLIC include)
target_include_directories(cloakimg-heif PRIVATE ${CMAKE_BINARY_DIR}/libheif-build/install/include)
target_link_libraries(cloakimg-heif PUBLIC
  -lheif
  -lde265
  -lkvazaar
  -L${KVAZAAR_LIBRARY_DIR}
  -L${LIBDE265_LIBRARY_DIR}
  -L${LIBHEIF_LIBRARY_DIR}
)
