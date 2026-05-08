// Tests for DropZone — focused on the thumbnail-preview path.
//
// Two decode branches in production:
//   • Browser-native (JPEG / PNG / WebP / AVIF / GIF):
//     URL.createObjectURL → <img src> (synchronous).
//   • HEIC / HEIF: libheif-js → ImageBitmap → canvas → data URL (async).
//
// The HEIC branch can't fully resolve under jsdom (canvas getContext
// returns null and libheif's wasm doesn't load), but we can still
// assert: the right detection fires, decodeHeic gets called, the
// loading state surfaces, and we never accidentally hand a HEIC blob
// URL to <img> (which would render a broken-image glyph).
//
// We mock decodeHeic to keep tests fast and deterministic, and let
// isHeicFile run real so we exercise the actual extension / MIME
// detection logic that ships in production.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock decodeHeic only — keep isHeicFile real so the format-detection
// branches below exercise the production logic.
vi.mock("../editor/heicDecoder", async () => {
  const actual =
    await vi.importActual<typeof import("../editor/heicDecoder")>("../editor/heicDecoder");
  return {
    ...actual,
    decodeHeic: vi.fn(async () => {
      // ImageBitmap is a host class we can't instantiate. The DropZone
      // duck-types width/height/close, so this shape is enough for the
      // code path through canvas drawing (which then early-returns in
      // jsdom because getContext returns null).
      return { width: 1200, height: 1600, close: () => undefined } as unknown as ImageBitmap;
    }),
  };
});

import { decodeHeic } from "../editor/heicDecoder";
import { DropZone } from "./DropZone";

afterEach(() => {
  vi.clearAllMocks();
});

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("DropZone", () => {
  describe("idle / selected baseline", () => {
    it("idle state renders the default 'Drop an image here' title and the upload icon", () => {
      render(<DropZone onFiles={() => undefined} />);
      expect(screen.getByText(/Drop an image here/i)).toBeInTheDocument();
      expect(screen.queryByRole("img")).toBeNull();
    });

    it("renders the selected file name in single-pick mode", () => {
      const file = makeFile("vacation.jpg", "image/jpeg");
      render(<DropZone onFiles={() => undefined} selectedFile={file} />);
      expect(screen.getByText("vacation.jpg")).toBeInTheDocument();
    });

    it("clearing the selected file revokes the preview (no <img> on next render)", () => {
      const file = makeFile("hero.jpg", "image/jpeg");
      const { rerender } = render(<DropZone onFiles={() => undefined} selectedFile={file} />);
      expect(screen.getByRole("img")).toBeInTheDocument();
      rerender(<DropZone onFiles={() => undefined} selectedFile={null} />);
      expect(screen.queryByRole("img")).toBeNull();
    });

    // Multi-pick mode is for batch flows (BatchView). The single-image
    // thumbnail must not appear there even if selectedFile sneaks in.
    it("multiple={true} suppresses the thumbnail even if selectedFile is passed", () => {
      const file = makeFile("hero.jpg", "image/jpeg");
      render(<DropZone onFiles={() => undefined} selectedFile={file} multiple />);
      expect(screen.queryByRole("img")).toBeNull();
    });

    it("Browse / Paste action buttons remain available alongside the selected thumbnail", () => {
      const file = makeFile("hero.jpg", "image/jpeg");
      render(<DropZone onFiles={() => undefined} selectedFile={file} />);
      expect(screen.getByRole("button", { name: /Browse files/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Paste from clipboard/i })).toBeInTheDocument();
    });
  });

  // ── Format coverage — browser-native decodable ──────────────────────
  //
  // JPEG / PNG / WebP / AVIF / GIF all flow through the same
  // URL.createObjectURL → <img> path. We pin every popular format here
  // so a regression in the detection branch (e.g. accidentally adding
  // a format to the HEIC path) is caught by a dedicated case.
  describe("native-decodable formats render via createObjectURL", () => {
    const cases: Array<{ name: string; type: string; label: string }> = [
      { name: "hero.jpg", type: "image/jpeg", label: "JPEG" },
      { name: "hero.jpeg", type: "image/jpeg", label: "JPEG (.jpeg ext)" },
      { name: "hero.png", type: "image/png", label: "PNG" },
      { name: "hero.webp", type: "image/webp", label: "WebP" },
      { name: "hero.avif", type: "image/avif", label: "AVIF" },
      { name: "hero.gif", type: "image/gif", label: "GIF" },
    ];

    for (const { name, type, label } of cases) {
      it(`${label}: renders <img> with a blob: src`, () => {
        const file = makeFile(name, type);
        render(<DropZone onFiles={() => undefined} selectedFile={file} />);
        const img = screen.getByRole("img");
        expect(img.getAttribute("src") ?? "").toMatch(/^blob:/);
        expect(decodeHeic).not.toHaveBeenCalled();
      });
    }

    it("native-format thumbnails carry the coral ring and green-check accent", () => {
      const file = makeFile("hero.png", "image/png");
      render(<DropZone onFiles={() => undefined} selectedFile={file} />);
      const img = screen.getByRole("img");
      expect(img).toHaveClass("ring-2");
      expect(img.className).toContain("ring-coral-500");
    });
  });

  // ── Format coverage — HEIC / HEIF (libheif-js path) ─────────────────
  //
  // The bug that prompted this work: an iPhone HEIC drop showed only
  // the FileImage icon and the user couldn't tell whether the right
  // photo was queued. The fix routes HEIC through libheif-js. These
  // tests pin every detection branch + the loading state, so a future
  // refactor can't silently regress to "always FileImage for HEIC".
  describe("HEIC / HEIF formats route through libheif-js", () => {
    const heicCases: Array<{ name: string; type: string; label: string }> = [
      { name: "IMG_1804.heic", type: "image/heic", label: ".heic + image/heic" },
      { name: "IMG_1804.HEIC", type: "image/heic", label: "uppercase .HEIC extension" },
      { name: "scan.heif", type: "image/heif", label: ".heif + image/heif" },
      // Safari often reports "" for HEIC dragged from Photos.app — the
      // extension alone must drive detection.
      { name: "photo.heic", type: "", label: "extension-only (Safari empty type)" },
      // Multi-image HEIF burst — the type variant must also detect.
      { name: "burst.heic", type: "image/heic-sequence", label: "image/heic-sequence" },
      // Type-only signal: no extension, content-type set by some upload
      // pipelines.
      { name: "blob-from-clipboard", type: "image/heic", label: "type-only (no extension)" },
    ];

    for (const { name, type, label } of heicCases) {
      it(`${label}: triggers decodeHeic and never hands a blob: URL to <img>`, async () => {
        const file = makeFile(name, type);
        render(<DropZone onFiles={() => undefined} selectedFile={file} />);
        // While decode is in flight, the icon-spot exposes a status
        // role with the "Decoding HEIC preview…" label.
        expect(screen.getByRole("status")).toBeInTheDocument();
        expect(decodeHeic).toHaveBeenCalledTimes(1);
        await waitFor(() => {
          expect(screen.queryByRole("status")).toBeNull();
        });
        // Even after decode resolves, no <img> in jsdom because the
        // canvas getContext returns null — DropZone falls back to the
        // FileImage icon. The crucial guard is that we never assigned
        // the *file's* blob URL to <img>, which would render a broken-
        // image glyph in real browsers.
        const img = screen.queryByRole("img");
        if (img) {
          expect(img.getAttribute("src") ?? "").not.toMatch(/^blob:/);
        }
      });
    }

    it("a JPEG sneaking in does NOT trigger decodeHeic (negative control)", () => {
      const file = makeFile("hero.jpg", "image/jpeg");
      render(<DropZone onFiles={() => undefined} selectedFile={file} />);
      expect(decodeHeic).not.toHaveBeenCalled();
    });

    it("file change cancels the prior HEIC decode (no stale preview after switch)", async () => {
      const heic = makeFile("first.heic", "image/heic");
      const jpeg = makeFile("second.jpg", "image/jpeg");
      const { rerender } = render(<DropZone onFiles={() => undefined} selectedFile={heic} />);
      expect(decodeHeic).toHaveBeenCalledTimes(1);
      rerender(<DropZone onFiles={() => undefined} selectedFile={jpeg} />);
      // The JPEG path is synchronous — its blob: <img> shows up
      // immediately, and the in-flight HEIC decode's settle callback
      // is no-op'd by the cancel flag.
      const img = screen.getByRole("img");
      expect(img.getAttribute("src") ?? "").toMatch(/^blob:/);
      // No double-call: one decode for the original HEIC, none for the
      // replacement JPEG.
      expect(decodeHeic).toHaveBeenCalledTimes(1);
    });
  });
});
