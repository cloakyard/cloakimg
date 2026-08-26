// heifCodec.ts — Lazy HEIC/HEIF encode + decode through CloakIMG's
// reproducible libheif WASM build. The worker bundle contains current,
// actively maintained libheif/libde265/Kvazaar releases and no x265/GPL code.

import type createHeifCodec from "./vendor/heif-codec.js";

type HeifCodec = Awaited<ReturnType<typeof createHeifCodec>>;

let ready: Promise<HeifCodec> | null = null;

function getCodec(): Promise<HeifCodec> {
  if (!ready) {
    ready = import("./vendor/heif-codec.js").then(({ default: createCodec }) => createCodec());
  }
  return ready;
}

export interface DecodedHeifImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

export async function encodeHeicPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  quality = 0.82,
): Promise<Uint8Array> {
  const codec = await getCodec();
  const result = codec.jsEncodeImage(
    new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength),
    width,
    height,
    Math.round(Math.max(0, Math.min(1, quality)) * 100),
  );
  if (result.err) throw new Error(result.err);
  if (result.data.length === 0) throw new Error("HEIC encoder returned an empty file");

  // Emscripten owns the returned view. Copy before another call can grow
  // or reuse the WASM heap.
  return new Uint8Array(result.data);
}

export async function decodeHeicPixels(input: Uint8Array): Promise<DecodedHeifImage> {
  const codec = await getCodec();
  const result = codec.jsDecodeImage(input);
  if (result.err) throw new Error(result.err);
  const image = result.data[0];
  if (!image) throw new Error("HEIF decoder returned no image");
  return {
    width: image.width,
    height: image.height,
    rgba: new Uint8ClampedArray(image.data),
  };
}
