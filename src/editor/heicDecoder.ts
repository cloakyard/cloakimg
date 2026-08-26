// heicDecoder.ts — HEIC / HEIF decode via the lazy local libheif WASM codec.
//
// Decoding remains fully local. The editor takes the primary image from
// multi-image HEIF containers and converts it to 8-bit sRGB RGBA, matching
// the rest of the current canvas pipeline.

import { decodeHeicPixels } from "./heifCodec";

/** Decode a HEIC/HEIF file to an ImageBitmap suitable for the editor canvas. */
export async function decodeHeic(file: File): Promise<ImageBitmap> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let decoded;
  try {
    decoded = await decodeHeicPixels(bytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not decode ${file.name} as HEIC/HEIF: ${detail}`);
  }

  const imageData = new ImageData(decoded.rgba, decoded.width, decoded.height);
  return await createImageBitmap(imageData);
}

/**
 * Cheap content-type / extension check. File.type is not enough because
 * Safari often reports an empty value for files dragged from Photos.
 */
export function isHeicFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".heic") || lowerName.endsWith(".heif")) return true;
  const type = (file.type || "").toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence"
  );
}
