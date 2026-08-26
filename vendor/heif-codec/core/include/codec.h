#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace CloakimgHeif {

struct Bitmap {
  int width;
  int height;
  std::vector<std::uint8_t> data;
};

struct DecodeResult {
  std::string err;
  std::vector<Bitmap> data;
};

struct EncodeResult {
  std::string err;
  std::vector<std::uint8_t> data;
};

DecodeResult decode(const std::uint8_t *buffer, int byteSize);
EncodeResult encode(const std::uint8_t *buffer, int byteSize, int width,
                    int height, int quality);

} // namespace CloakimgHeif
