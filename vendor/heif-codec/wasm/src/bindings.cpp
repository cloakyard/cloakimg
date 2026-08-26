#include "codec.h"

#include <cstdint>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <string>

emscripten::val jsDecodeImage(const std::string &buffer) {
  const auto result = CloakimgHeif::decode(
      reinterpret_cast<const std::uint8_t *>(buffer.data()), buffer.size());
  auto images = emscripten::val::array();
  for (const auto &bitmap : result.data) {
    auto image = emscripten::val::object();
    image.set("width", bitmap.width);
    image.set("height", bitmap.height);
    image.set("data", emscripten::typed_memory_view(bitmap.data.size(),
                                                    bitmap.data.data()));
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
  response.set("data", emscripten::typed_memory_view(result.data.size(),
                                                     result.data.data()));
  return response;
}

EMSCRIPTEN_BINDINGS(cloakimg_heif_codec) {
  emscripten::function("jsDecodeImage", &jsDecodeImage);
  emscripten::function("jsEncodeImage", &jsEncodeImage);
}
