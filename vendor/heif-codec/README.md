# CloakIMG HEIF codec

This is a small Emscripten binding around actively maintained upstream codecs:

- libheif `v1.22.2` (LGPL-3.0), HEIF container handling
- libde265 `v1.1.1` (LGPL-3.0), HEVC decoding
- Kvazaar `v2.3.2` (BSD-3-Clause), HEVC encoding
- Emscripten `6.0.8`, reproducible compiler image

The corresponding LGPL and BSD license texts are distributed in `licenses/`.

The binding is derived from the MIT-licensed `hpp2334/elheif` API shape, but the
build and runtime are owned here so CloakIMG is not pinned to its inactive npm
package. x265 is deliberately disabled; it would impose GPL distribution terms.

Run `vp run build:heif-codec` from the repository root to rebuild
`src/editor/vendor/heif-codec.js`. When bumping an upstream version, update the
exact `GIT_TAG` in `core/CMakeLists.txt`, rebuild, and run the complete export
round-trip suite.
