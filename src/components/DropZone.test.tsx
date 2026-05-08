// Tests for DropZone.
//
// Focused on the recently added thumbnail-preview path. Before this
// change, a selected file rendered as just a name + size string above
// the upload icon — users couldn't tell at a glance whether the *right*
// image was queued. Now a 80×80 thumbnail with a coral ring + green
// check confirms the choice. HEIC/HEIF aren't natively decodable by
// `<img>` in most browsers, so they fall back to a file icon rather
// than rendering a broken-image glyph. These tests pin that contract
// so a future refactor can't silently regress to the "name only" UI
// or hand HEIC files to <img>.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DropZone } from "./DropZone";

// jsdom implements URL.createObjectURL natively (returns
// `blob:nodedata:<uuid>`), so the tests below assert the resulting
// src starts with `blob:` rather than pinning an exact value.

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("DropZone", () => {
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

  it("renders a thumbnail <img> with a blob: object URL when a JPEG is selected (replaces the upload icon)", () => {
    const file = makeFile("hero.jpg", "image/jpeg");
    render(<DropZone onFiles={() => undefined} selectedFile={file} />);
    const img = screen.getByRole("img", { name: "hero.jpg" });
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src") ?? "").toMatch(/^blob:/);
  });

  it("thumbnail has a coral ring (matches the modal's 'ready to open' accent)", () => {
    const file = makeFile("hero.png", "image/png");
    render(<DropZone onFiles={() => undefined} selectedFile={file} />);
    const img = screen.getByRole("img");
    expect(img).toHaveClass("ring-2");
    expect(img.className).toContain("ring-coral-500");
  });

  // HEIC / HEIF fallback. Most browsers can't decode these via <img>,
  // so handing the URL to <img> would render a broken glyph. We fall
  // back to the FileImage icon — the user still sees the file name +
  // size, just without a visual preview.
  it("HEIC files do NOT render an <img> (no broken-image glyph) — falls back to file icon", () => {
    const file = makeFile("photo.heic", "image/heic");
    render(<DropZone onFiles={() => undefined} selectedFile={file} />);
    expect(screen.getByText("photo.heic")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("HEIC detection works on extension when the browser fails to set type", () => {
    const file = makeFile("photo.HEIF", "");
    render(<DropZone onFiles={() => undefined} selectedFile={file} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("clearing the selected file revokes the preview (no <img> on next render)", () => {
    const file = makeFile("hero.jpg", "image/jpeg");
    const { rerender } = render(<DropZone onFiles={() => undefined} selectedFile={file} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
    rerender(<DropZone onFiles={() => undefined} selectedFile={null} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  // Multi-pick mode is for batch flows (BatchView) where a single
  // "selected" thumbnail wouldn't make sense. The component should
  // never render the preview in that mode even if a selectedFile prop
  // sneaks in.
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
