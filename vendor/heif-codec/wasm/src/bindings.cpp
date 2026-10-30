#include "codec.h"

#include <algorithm>
#include <cstdint>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <string>
#include <webp/encode.h>

// Copy while the native allocation is alive. A typed_memory_view alone
// would outlive the local vector (or WebP allocation) returned below.
emscripten::val ownedBytes(const std::uint8_t *data, std::size_t size) {
  return emscripten::val::global("Uint8Array").new_(
      emscripten::val(emscripten::typed_memory_view(size, data)));
}

emscripten::val jsDecodeImage(const std::string &buffer) {
  const auto result = CloakimgHeif::decode(
      reinterpret_cast<const std::uint8_t *>(buffer.data()), buffer.size());
  auto images = emscripten::val::array();
  for (const auto &bitmap : result.data) {
    auto image = emscripten::val::object();
    image.set("width", bitmap.width);
    image.set("height", bitmap.height);
    image.set("data", ownedBytes(bitmap.data.data(), bitmap.data.size()));
    images.call<void>("push", image);
  }
  auto response = emscripten::val::object();
  response.set("err", result.err);
  response.set("data", images);
  return response;
}

emscripten::val jsEncodeImage(const std::string &buffer, int width, int height,
                              int quality) {
  const auto result = CloakimgHeif::encode(
      reinterpret_cast<const std::uint8_t *>(buffer.data()), buffer.size(), width,
      height, quality);
  auto response = emscripten::val::object();
  response.set("err", result.err);
  response.set("data", ownedBytes(result.data.data(), result.data.size()));
  return response;
}

emscripten::val jsEncodeWebp(const std::string &buffer, int width, int height,
                           int quality) {
  auto response = emscripten::val::object();
  response.set("data", emscripten::val::global("Uint8Array").new_(0));
  if (width <= 0 || height <= 0 || width > WEBP_MAX_DIMENSION ||
      height > WEBP_MAX_DIMENSION ||
      static_cast<std::uint64_t>(width) * height * 4 != buffer.size()) {
    response.set("err", "Invalid WebP image dimensions or pixel buffer");
    return response;
  }
  std::uint8_t *output = nullptr;
  const auto size = WebPEncodeRGBA(
      reinterpret_cast<const std::uint8_t *>(buffer.data()), width, height,
      width * 4, std::clamp(quality, 0, 100), &output);
  response.set("err", size ? "" : "WebP encoding failed");
  if (size) response.set("data", ownedBytes(output, size));
  WebPFree(output);
  return response;
}

EMSCRIPTEN_BINDINGS(cloakimg_heif_codec) {
  emscripten::function("jsDecodeImage", &jsDecodeImage);
  emscripten::function("jsEncodeImage", &jsEncodeImage);
  emscripten::function("jsEncodeWebp", &jsEncodeWebp);
}
