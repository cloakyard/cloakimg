// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import decodeAvif, { init as initAvifDecoder } from "@jsquash/avif/decode.js";
import { init as initAvifEncoder } from "@jsquash/avif/encode.js";
import { beforeAll, describe, expect, it } from "vitest";
import { encodeAvifPixels } from "./avifCodec";
import { decodeHeicPixels, encodeHeicPixels } from "./heifCodec";

function fixturePixels(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    const pixel = i / 4;
    rgba[i] = (pixel * 31) % 256;
    rgba[i + 1] = (pixel * 17) % 256;
    rgba[i + 2] = (pixel * 7) % 256;
    rgba[i + 3] = 255;
  }
  return rgba;
}

function brand(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.subarray(4, 12));
}

describe("real modern export codecs", () => {
  beforeAll(async () => {
    // jsquash's automatic Node loader tries to fetch a file: URL.
    // Compile the installed WASM bytes explicitly so this test is a
    // deterministic offline codec test, not a mocked network path.
    const packageRoot = dirname(fileURLToPath(import.meta.resolve("@jsquash/avif")));
    const encoderBytes = readFileSync(join(packageRoot, "codec/enc/avif_enc.wasm"));
    const decoderBytes = readFileSync(join(packageRoot, "codec/dec/avif_dec.wasm"));
    await initAvifEncoder(await WebAssembly.compile(encoderBytes as BufferSource));
    await initAvifDecoder(await WebAssembly.compile(decoderBytes as BufferSource));
  });

  it("encodes and decodes a real AVIF with the original dimensions", async () => {
    const bytes = await encodeAvifPixels(fixturePixels(8, 6), 8, 6, 0.8);

    expect(brand(bytes)).toBe("ftypavif");
    const decoded = await decodeAvif(bytes.buffer as ArrayBuffer);
    if (!decoded) throw new Error("AVIF decoder returned no image");
    expect({ width: decoded.width, height: decoded.height }).toEqual({ width: 8, height: 6 });
    expect(decoded.data).toHaveLength(8 * 6 * 4);
  });

  it("encodes and decodes a real HEIC/HEIF with the original dimensions", async () => {
    const bytes = await encodeHeicPixels(fixturePixels(8, 6), 8, 6, 0.8);

    expect(brand(bytes)).toBe("ftypheic");
    const decoded = await decodeHeicPixels(bytes);
    expect({ width: decoded.width, height: decoded.height }).toEqual({ width: 8, height: 6 });
    expect(decoded.rgba).toHaveLength(8 * 6 * 4);
  });

  it("applies HEIC export quality instead of ignoring the modal control", async () => {
    const pixels = fixturePixels(32, 24);
    const lowQuality = await encodeHeicPixels(pixels, 32, 24, 0.2);
    const highQuality = await encodeHeicPixels(pixels, 32, 24, 0.95);

    expect(highQuality).not.toEqual(lowQuality);
    expect(highQuality.byteLength).toBeGreaterThan(lowQuality.byteLength);
  });
});
