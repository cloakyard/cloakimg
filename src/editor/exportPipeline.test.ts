import { beforeEach, describe, expect, it, vi } from "vitest";

const { encodeModernCanvasMock } = vi.hoisted(() => ({
  encodeModernCanvasMock: vi.fn(),
}));

vi.mock("./exportCodec", () => ({
  encodeModernCanvas: encodeModernCanvasMock,
}));

import {
  blobMatchesFormat,
  encodeCanvas,
  renameForFormat,
  resolveExportDimensions,
  type ExportSettings,
  type Format,
} from "./exportPipeline";

const SETTINGS: ExportSettings = {
  format: 2,
  quality: 0.82,
  sizeBucket: 1,
};

describe("resolveExportDimensions", () => {
  it("uses the current edited document dimensions by default", () => {
    expect(resolveExportDimensions(3024, 4032, SETTINGS)).toEqual({
      width: 3024,
      height: 4032,
    });
  });

  it("preserves the current aspect ratio when width is edited", () => {
    expect(resolveExportDimensions(3024, 4032, { ...SETTINGS, width: 1512 })).toEqual({
      width: 1512,
      height: 2016,
    });
  });

  it("preserves the current aspect ratio when height is edited", () => {
    expect(resolveExportDimensions(4032, 3024, { ...SETTINGS, height: 1512 })).toEqual({
      width: 2016,
      height: 1512,
    });
  });

  it("ignores a stale mismatched height when older settings contain both edges", () => {
    expect(
      resolveExportDimensions(4284, 5712, {
        ...SETTINGS,
        width: 2142,
        height: 2142,
      }),
    ).toEqual({ width: 2142, height: 2856 });
  });

  it("keeps the edited ratio for the half-size preset", () => {
    expect(resolveExportDimensions(5712, 4284, { ...SETTINGS, sizeBucket: 2 })).toEqual({
      width: 2856,
      height: 2142,
    });
  });
});

const SIGNATURES: Record<Format, number[]> = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  avif: [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66],
  heic: [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63],
};

const MIMES: Record<Format, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
};

function formatBlob(format: Format, type = MIMES[format]): Blob {
  const bytes = new Uint8Array(SIGNATURES[format]);
  return new Blob([bytes.buffer], { type });
}

function fakeCanvas(nativeResult: Blob | null): HTMLCanvasElement {
  return {
    width: 8,
    height: 6,
    toBlob(callback: BlobCallback) {
      callback(nativeResult);
    },
  } as HTMLCanvasElement;
}

describe("export encoding", () => {
  beforeEach(() => {
    encodeModernCanvasMock.mockReset();
  });

  it.each(["jpeg", "png", "webp", "avif", "heic"] as const)(
    "accepts genuine native %s bytes",
    async (format) => {
      const blob = formatBlob(format);
      const result = await encodeCanvas(fakeCanvas(blob), format, 0.82);

      expect(result).toBe(blob);
      expect(await blobMatchesFormat(result, format)).toBe(true);
      expect(encodeModernCanvasMock).not.toHaveBeenCalled();
    },
  );

  it.each(["avif", "heic"] as const)(
    "uses the local codec when the browser falls back while encoding %s",
    async (format) => {
      const encoded = formatBlob(format);
      encodeModernCanvasMock.mockResolvedValue(encoded);

      const result = await encodeCanvas(fakeCanvas(formatBlob("png")), format, 0.71);

      expect(result).toBe(encoded);
      expect(result.type).toBe(MIMES[format]);
      expect(await blobMatchesFormat(result, format)).toBe(true);
      expect(encodeModernCanvasMock).toHaveBeenCalledOnce();
    },
  );

  it("never saves PNG fallback bytes under a .webp contract", async () => {
    const mislabeled = formatBlob("png", "image/webp");

    await expect(encodeCanvas(fakeCanvas(mislabeled), "webp", 0.82)).rejects.toThrow(
      "invalid image/webp bytes",
    );
    expect(encodeModernCanvasMock).not.toHaveBeenCalled();
  });

  it("rejects a WASM encoder result whose bytes do not match its MIME", async () => {
    encodeModernCanvasMock.mockResolvedValue(formatBlob("png", "image/avif"));

    await expect(encodeCanvas(fakeCanvas(formatBlob("png")), "avif", 0.82)).rejects.toThrow(
      "AVIF encoder returned invalid bytes",
    );
  });

  it.each([
    ["jpeg", "portrait.jpg"],
    ["png", "portrait.png"],
    ["webp", "portrait.webp"],
    ["avif", "portrait.avif"],
    ["heic", "portrait.heic"],
  ] as const)("pairs %s bytes with the correct download extension", (format, expected) => {
    expect(renameForFormat("portrait.HEIF", format)).toBe(expected);
  });
});
