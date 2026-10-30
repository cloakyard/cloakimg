# CloakIMG image codec

This is a small Emscripten binding around actively maintained upstream codecs:

- libheif `v1.23.7` (LGPL-3.0), HEIF container handling
- libde265 `v1.1.3` (LGPL-3.0), HEVC decoding
- Kvazaar `v2.3.2` (BSD-3-Clause), HEVC encoding
- libwebp `v1.6.0` (BSD-3-Clause), WebP export fallback for browsers without native encoding
- Emscripten `6.0.13`, reproducible compiler image

The corresponding LGPL and BSD license texts are distributed in `licenses/`.
The WebP patent grant is included there too. All byte arrays returned by the
binding are copied to JavaScript-owned memory before native allocations expire.

The binding is derived from the MIT-licensed `hpp2334/elheif` API shape, but the
build and runtime are owned here so CloakIMG is not pinned to its inactive npm
package. x265 is deliberately disabled; it would impose GPL distribution terms.

Run `vp run build:heif-codec` from the repository root to rebuild
`src/editor/vendor/heif-codec.js`. When bumping an upstream version, update the
exact `GIT_TAG` in `core/CMakeLists.txt`, rebuild, and run the complete export
round-trip suite.

The same CMake target can be built without Docker using the official Emscripten
`6.0.13` SDK: activate it, set `EMSCRIPTEN_ROOT` to its directory, then run
`emcmake cmake -S vendor/heif-codec -B /tmp/cloakimg-codec -DEMSCRIPTEN=ON -DCMAKE_BUILD_TYPE=Release`
and `cmake --build /tmp/cloakimg-codec --target cloakimg-heif-codec`.
On macOS, put GNU sed on `PATH` for the upstream Kvazaar patch step.
Copy `/tmp/cloakimg-codec/wasm/cloakimg-heif-codec.js` to
`src/editor/vendor/heif-codec.js` before testing.
