// avifCodec.ts — AVIF WASM fallback used when canvas.toBlob cannot
// produce genuine AVIF bytes. Kept behind a dynamic import so the
// encoder and its WASM payload do not affect the initial app bundle.

export async function encodeAvifPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  quality: number,
): Promise<Uint8Array> {
  // Import the encoder entry directly; the package root also exports
  // its decoder, which would otherwise ship an unused ~1.2 MB WASM
  // asset in the production build.
  const { default: encode } = await import("@jsquash/avif/encode.js");
  // TS 7 models transferred typed arrays as ArrayBufferLike, while
  // ImageData deliberately requires a non-shared ArrayBuffer. Copying
  // here also gives the encoder an owned, stable pixel allocation.
  const ownedRgba = new Uint8ClampedArray(rgba.length);
  ownedRgba.set(rgba);
  // The encoder accepts the ImageData shape and does not rely on the
  // DOM constructor. This also keeps the function testable in Node and
  // usable in WebViews whose worker scope omits `ImageData` itself.
  const image = { data: ownedRgba, width, height, colorSpace: "srgb" } as ImageData;
  const buffer = await encode(image, {
    quality: Math.round(Math.min(1, Math.max(0, quality)) * 100),
    // A slightly faster setting is important for full-resolution
    // mobile exports; output remains materially smaller than WebP.
    speed: 8,
  });
  if (buffer.byteLength === 0) throw new Error("AVIF encoder returned an empty file");
  return new Uint8Array(buffer);
}
