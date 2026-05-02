// heicDecoder.ts — HEIC / HEIF decode via libheif-js (WASM).
//
// libheif-js ships a 1.4MB pre-bundled WASM module that is too heavy
// to ship in the main editor chunk. We lazy-import it on the first
// HEIC/HEIF the user opens, and cache the decoder instance for the
// rest of the session.
//
// What this module does NOT do (yet):
//   • Preserve HDR. libheif decodes 10/12-bit HEIC into a 16-bit
//     plane internally, but `image.display()` writes 8-bit RGBA — so
//     bright PQ/HLG highlights get tone-mapped down to SDR. True
//     HDR editing requires a 16-bit float pixel pipeline, which is
//     beyond the current architecture (see plan, phase 5).
//   • Preserve the source colorspace. The output is always sRGB.
//
// What it DOES handle: every iPhone HEIC photo, including 12-bit
// images, multi-image HEIFs (we take the primary), and odd subsampling
// (4:2:0 / 4:2:2 / 4:4:4). The result is a standard 8-bit ImageBitmap
// the rest of the editor can treat like any other photo.

interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(
    imageData: { data: Uint8ClampedArray; width: number; height: number },
    cb: (
      filledImageData: { data: Uint8ClampedArray; width: number; height: number } | null,
    ) => void,
  ): void;
}

interface HeifDecoder {
  decode(buffer: Uint8Array | ArrayBuffer): HeifImage[];
}

interface LibheifModule {
  HeifDecoder: new () => HeifDecoder;
}

let decoderPromise: Promise<HeifDecoder> | null = null;

async function getDecoder(): Promise<HeifDecoder> {
  if (!decoderPromise) {
    decoderPromise = (async () => {
      // libheif-js ships CommonJS — Vite handles the interop.
      // The `wasm-bundle` entry inlines the .wasm into the JS so we
      // don't need to host a sidecar file or configure a worker URL.
      const mod = (await import("libheif-js/wasm-bundle")) as
        | LibheifModule
        | { default: LibheifModule };
      const lib: LibheifModule = "default" in mod ? mod.default : mod;
      return new lib.HeifDecoder();
    })();
  }
  return decoderPromise;
}

/**
 * Decode a HEIC/HEIF file to an ImageBitmap. The first/primary image
 * in the container is returned — multi-image HEIFs (e.g. iPhone Live
 * Photos, image bursts) lose the secondary frames; that's fine for a
 * photo editor where the user opens "this picture" and not a stream.
 *
 * Throws with a friendly message if the file isn't actually decodable
 * HEIC (rare but possible — some `.heic`-named files are sneaky).
 */
export async function decodeHeic(file: File): Promise<ImageBitmap> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const decoder = await getDecoder();
  const images = decoder.decode(buf);
  if (!images || images.length === 0) {
    throw new Error(`Could not decode ${file.name} as HEIC/HEIF`);
  }
  const image = images[0];
  if (!image) {
    throw new Error(`Could not decode ${file.name} as HEIC/HEIF`);
  }
  const width = image.get_width();
  const height = image.get_height();
  const data = new Uint8ClampedArray(width * height * 4);

  await new Promise<void>((resolve, reject) => {
    image.display({ data, width, height }, (filled) => {
      if (!filled) {
        reject(new Error(`HEIF processing error decoding ${file.name}`));
        return;
      }
      resolve();
    });
  });

  // ImageData → ImageBitmap so callers can drop it into createImageBitmap-
  // returning paths without a special case.
  const imageData = new ImageData(data, width, height);
  return await createImageBitmap(imageData);
}

/**
 * Cheap content-type / extension check. We can't trust File.type alone
 * because Safari often reports an empty string for HEIC files dragged
 * from Photos.app, and Chrome returns `image/heic` only on some OSes.
 */
export function isHeicFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".heic") || lowerName.endsWith(".heif")) return true;
  const t = (file.type || "").toLowerCase();
  return t === "image/heic" || t === "image/heif" || t === "image/heic-sequence";
}
