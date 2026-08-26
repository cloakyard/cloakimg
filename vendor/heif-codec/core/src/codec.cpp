#include "codec.h"

#include "libheif/heif.h"

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <iterator>
#include <memory>
#include <string>
#include <vector>

#define RETURN_HEIF_ERROR(scope, result)                                      \
  {                                                                           \
    const auto error = result;                                                \
    if (error.code != heif_error_Ok) {                                        \
      return {.err = std::string("HEIF ") + scope + ": " + error.message}; \
    }                                                                         \
  }

namespace CloakimgHeif {

namespace {

struct LibraryGuard {
  LibraryGuard() { heif_init(nullptr); }
  ~LibraryGuard() { heif_deinit(); }
};

struct ContextDeleter {
  void operator()(heif_context *value) const { heif_context_free(value); }
};
struct ImageHandleDeleter {
  void operator()(heif_image_handle *value) const { heif_image_handle_release(value); }
};
struct ImageDeleter {
  void operator()(heif_image *value) const { heif_image_release(value); }
};
struct EncoderDeleter {
  void operator()(heif_encoder *value) const { heif_encoder_release(value); }
};

using Context = std::unique_ptr<heif_context, ContextDeleter>;
using ImageHandle = std::unique_ptr<heif_image_handle, ImageHandleDeleter>;
using Image = std::unique_ptr<heif_image, ImageDeleter>;
using Encoder = std::unique_ptr<heif_encoder, EncoderDeleter>;

heif_error writeBytes(heif_context *, const void *data, size_t size,
                      void *userdata) {
  auto *buffer = static_cast<std::vector<std::uint8_t> *>(userdata);
  const auto *bytes = static_cast<const std::uint8_t *>(data);
  std::copy(bytes, bytes + size, std::back_inserter(*buffer));
  return {.code = heif_error_Ok,
          .subcode = heif_suberror_Unspecified,
          .message = "OK"};
}

} // namespace

EncodeResult encode(const std::uint8_t *buffer, int byteSize, int width,
                    int height, int quality) {
  if (!buffer || width <= 0 || height <= 0 ||
      byteSize != width * height * 4) {
    return {.err = "HEIF encode received invalid RGBA dimensions"};
  }

  LibraryGuard library;
  heif_image *rawImage = nullptr;
  RETURN_HEIF_ERROR(
      "image creation failed",
      heif_image_create(width, height, heif_colorspace_RGB,
                        heif_chroma_interleaved_RGBA, &rawImage));
  Image image(rawImage);

  constexpr auto channel = heif_channel_interleaved;
  RETURN_HEIF_ERROR("plane allocation failed",
                    heif_image_add_plane(image.get(), channel, width, height, 8));

  int stride = 0;
  auto *plane = heif_image_get_plane(image.get(), channel, &stride);
  if (!plane) return {.err = "HEIF encoder returned no image plane"};
  for (int y = 0; y < height; ++y) {
    std::memcpy(plane + y * stride, buffer + y * width * 4,
                static_cast<size_t>(width) * 4);
  }

  Context context(heif_context_alloc());
  if (!context) return {.err = "HEIF encoder could not allocate a context"};

  heif_encoder *rawEncoder = nullptr;
  RETURN_HEIF_ERROR(
      "encoder selection failed",
      heif_context_get_encoder_for_format(context.get(), heif_compression_HEVC,
                                          &rawEncoder));
  Encoder encoder(rawEncoder);
  RETURN_HEIF_ERROR(
      "quality setup failed",
      heif_encoder_set_lossy_quality(encoder.get(), std::clamp(quality, 0, 100)));
  RETURN_HEIF_ERROR(
      "image encode failed",
      heif_context_encode_image(context.get(), image.get(), encoder.get(), nullptr,
                                nullptr));

  heif_writer writer = {.writer_api_version = 1, .write = writeBytes};
  std::vector<std::uint8_t> output;
  RETURN_HEIF_ERROR("container write failed",
                    heif_context_write(context.get(), &writer, &output));
  return {.data = std::move(output)};
}

DecodeResult decode(const std::uint8_t *buffer, int byteSize) {
  if (!buffer || byteSize <= 0) return {.err = "HEIF decode received no data"};

  LibraryGuard library;
  Context context(heif_context_alloc());
  if (!context) return {.err = "HEIF decoder could not allocate a context"};
  RETURN_HEIF_ERROR(
      "container read failed",
      heif_context_read_from_memory(context.get(), buffer, byteSize, nullptr));

  heif_image_handle *rawHandle = nullptr;
  RETURN_HEIF_ERROR(
      "primary image lookup failed",
      heif_context_get_primary_image_handle(context.get(), &rawHandle));
  ImageHandle handle(rawHandle);

  heif_image *rawImage = nullptr;
  RETURN_HEIF_ERROR(
      "image decode failed",
      heif_decode_image(handle.get(), &rawImage, heif_colorspace_RGB,
                        heif_chroma_interleaved_RGBA, nullptr));
  Image image(rawImage);

  constexpr auto channel = heif_channel_interleaved;
  int stride = 0;
  const auto *plane = heif_image_get_plane_readonly(image.get(), channel, &stride);
  if (!plane) return {.err = "HEIF decoder returned no image plane"};

  const int width = heif_image_get_width(image.get(), channel);
  const int height = heif_image_get_height(image.get(), channel);
  std::vector<std::uint8_t> pixels(static_cast<size_t>(width) * height * 4);
  for (int y = 0; y < height; ++y) {
    std::memcpy(pixels.data() + static_cast<size_t>(y) * width * 4,
                plane + y * stride, static_cast<size_t>(width) * 4);
  }

  std::vector<Bitmap> bitmaps;
  bitmaps.push_back({.width = width, .height = height, .data = std::move(pixels)});
  return {.data = std::move(bitmaps)};
}

} // namespace CloakimgHeif
