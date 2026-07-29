// DropZone.tsx — Shared file-picker dropzone. Drag-and-drop, paste,
// click-to-browse, and an explicit local-input status bar — all the
// controls that the StartModal upload tab pioneered, now reusable in any place
// that needs to pull image files in (StartModal, BatchView, etc.).
//
// Always returns an array via `onFiles` even in single-pick mode, so
// consumers don't have to special-case multi vs single.

import {
  type DragEvent as ReactDragEvent,
  type ClipboardEvent as ReactClipboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { decodeHeic, isHeicFile } from "../editor/heicDecoder";
import { I } from "./icons";

interface DropZoneProps {
  /** Receives picked / dropped / pasted files. Always an array (length 1
   *  in single-pick mode). */
  onFiles: (files: File[]) => void;
  /** Allow multiple files (drag-drop + file picker). Default false. */
  multiple?: boolean;
  /** Tighter padding on mobile widths. */
  isPhone?: boolean;
  /** Headline shown when no file is highlighted. */
  title?: string;
  /** Sub-headline below the title. */
  subtitle?: string;
  /** Accept attribute for the file input. Default covers the formats
   *  the editor decodes natively (createImageBitmap) plus HEIC/HEIF
   *  via libheif-js. */
  accept?: string;
  /** Show the "Paste from clipboard" button. Default true. */
  showPasteButton?: boolean;
  /** Single-pick mode: shows a "selected" state when set. Ignored when
   *  `multiple` is true. */
  selectedFile?: File | null;
}

const DEFAULT_ACCEPT = "image/*,.heic,.heif";

export function DropZone({
  onFiles,
  multiple = false,
  isPhone = false,
  title = "Drop an image here",
  subtitle = "or use Browse files — JPG, PNG, WebP, AVIF, HEIC, HEIF",
  accept = DEFAULT_ACCEPT,
  showPasteButton = true,
  selectedFile = null,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  // Thumbnail preview when a file is selected (single-pick mode). The
  // upload icon alone left users uncertain whether the *right* image was
  // queued — a thumbnail confirms it visually. Two decode paths:
  //
  //   • Browser-native formats (JPEG / PNG / WebP / AVIF / GIF):
  //     URL.createObjectURL → <img src>.
  //
  //   • HEIC / HEIF (popular among iPhone users): <img> can't decode
  //     these in Chrome / Firefox, so we route through libheif-js
  //     (the same decoder doc.ts uses) → ImageBitmap → small canvas
  //     → data URL. The wasm bundle + decoder instance are singleton-
  //     cached, so the second decode (when the user clicks "Open in
  //     editor") reuses everything and adds no extra round-trip.
  //
  // `previewLoading` flips on while the HEIC decode is in flight so we
  // can show a subtle spinner instead of leaving the FileImage icon
  // ambiguously frozen on screen.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  useEffect(() => {
    if (!selectedFile || multiple) {
      setPreviewUrl(null);
      setPreviewLoading(false);
      return;
    }
    if (isHeicFile(selectedFile)) {
      let cancelled = false;
      setPreviewUrl(null);
      setPreviewLoading(true);
      void (async () => {
        try {
          const bitmap = await decodeHeic(selectedFile);
          if (cancelled) {
            bitmap.close();
            return;
          }
          // Long edge ≤ 240 px keeps the data-URL payload small (~40 KB
          // at q=0.7) — same target as the recents thumbnail builder.
          const max = 240;
          const aspect = bitmap.width / bitmap.height;
          const w = aspect >= 1 ? max : Math.round(max * aspect);
          const h = aspect >= 1 ? Math.round(max / aspect) : max;
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            // jsdom or a browser without 2D canvas — fall back to the
            // file-icon path silently.
            bitmap.close();
            if (!cancelled) setPreviewLoading(false);
            return;
          }
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(bitmap, 0, 0, w, h);
          bitmap.close();
          const url = canvas.toDataURL("image/webp", 0.7);
          if (!cancelled) {
            setPreviewUrl(url);
            setPreviewLoading(false);
          }
        } catch {
          // Truly broken HEIC, libheif crash, etc. The file-icon
          // fallback already handles the visual; just clear loading.
          if (!cancelled) setPreviewLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    setPreviewLoading(false);
    return () => URL.revokeObjectURL(url);
  }, [multiple, selectedFile]);

  const onPick = useCallback(() => inputRef.current?.click(), []);

  const onDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>) => {
      e.preventDefault();
      // Stop bubbling — prevents an outer drop handler (e.g. BatchView's
      // section-level catcher) from also firing and double-adding files.
      e.stopPropagation();
      setHover(false);
      const all = Array.from(e.dataTransfer.files ?? []);
      const images = all.filter(
        (f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name),
      );
      if (!images.length) return;
      onFiles(multiple ? images : images.slice(0, 1));
    },
    [onFiles, multiple],
  );

  const onPaste = useCallback(
    async (e: ReactClipboardEvent<HTMLDivElement>) => {
      const items = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith("image/"));
      const files = items.map((i) => i.getAsFile()).filter((f): f is File => f !== null);
      if (!files.length) return;
      onFiles(multiple ? files : files.slice(0, 1));
    },
    [onFiles, multiple],
  );

  const onClipboardPasteButton = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      const collected: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          collected.push(new File([blob], "clipboard.png", { type }));
          if (!multiple) break;
        }
      }
      if (collected.length) onFiles(collected);
    } catch {
      // Permission denied / unsupported — silently no-op.
    }
  }, [onFiles, multiple]);

  const showSelected = !multiple && selectedFile;

  return (
    // Wrapper is a non-interactive `<section>` — it accepts dragged
    // files but is not itself a clickable region (clicking it does
    // nothing). The Browse / Paste buttons inside are the canonical
    // keyboard- and screen-reader-accessible affordances; "click
    // anywhere on the dashed area" was a bonus the lint rules
    // (correctly) flag as ambiguous a11y.
    <section
      aria-label={multiple ? "Drop or pick images" : "Drop or pick an image"}
      data-dragging={hover ? "true" : "false"}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      style={{ touchAction: "manipulation" }}
      className={`cloak-dropzone group ${isPhone ? "cloak-dropzone--phone" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(multiple ? files : files.slice(0, 1));
          e.target.value = "";
        }}
      />
      <div className="cloak-dropzone__bar">
        <span>Local image input</span>
        <span>{hover ? "Release to open" : "No image upload"}</span>
      </div>

      <div className="cloak-dropzone__body">
        {showSelected && previewUrl ? (
          <div className="cloak-dropzone__preview">
            <img src={previewUrl} alt={selectedFile.name} width={56} height={56} />
            <span aria-hidden>
              <I.Check size={12} stroke={3} />
            </span>
          </div>
        ) : (
          <div
            {...(previewLoading
              ? { role: "status", "aria-busy": true, "aria-label": "Decoding HEIC preview…" }
              : {})}
            className="cloak-dropzone__icon"
          >
            {previewLoading ? (
              <span aria-hidden className="cloak-dropzone__spinner" />
            ) : showSelected ? (
              <I.FileImage size={24} />
            ) : (
              <I.Upload size={24} />
            )}
          </div>
        )}

        <div className="cloak-dropzone__copy">
          <strong>{showSelected ? selectedFile.name : title}</strong>
          <span>
            {showSelected
              ? `${(selectedFile.size / 1024).toFixed(0)} KB · ${selectedFile.type || "image"}`
              : subtitle}
          </span>
        </div>

        <div className="cloak-dropzone__actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onPick();
            }}
          >
            <I.Folder size={13} /> Browse files
          </button>

          {showPasteButton && (
            <button
              type="button"
              aria-label="Paste from clipboard"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                void onClipboardPasteButton();
              }}
            >
              <I.Layers size={13} /> Paste
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
