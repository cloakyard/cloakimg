// DropZone.tsx — Shared file-picker dropzone. Drag-and-drop, paste,
// click-to-browse, and an interactive cursor "glow" — all the niceties
// that the StartModal upload tab pioneered, now reusable in any place
// that needs to pull image files in (StartModal, BatchView, etc.).
//
// Always returns an array via `onFiles` even in single-pick mode, so
// consumers don't have to special-case multi vs single.

import {
  type CSSProperties,
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
  subtitle = "or click to browse — JPG, PNG, WebP, AVIF, HEIC, HEIF",
  accept = DEFAULT_ACCEPT,
  showPasteButton = true,
  selectedFile = null,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [glowStyle, setGlowStyle] = useState<CSSProperties>({ opacity: 0 });
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

  const setGlowAt = useCallback((clientX: number, clientY: number) => {
    const zone = zoneRef.current;
    if (!zone) return;
    const rect = zone.getBoundingClientRect();
    setGlowStyle({
      opacity: 1,
      background: `radial-gradient(300px circle at ${clientX - rect.left}px ${clientY - rect.top}px, rgba(245,97,58,0.18), transparent 70%)`,
    });
  }, []);

  const clearGlow = useCallback(() => setGlowStyle({ opacity: 0 }), []);

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
      ref={zoneRef}
      aria-label={multiple ? "Drop or pick images" : "Drop or pick an image"}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      onMouseMove={(e) => setGlowAt(e.clientX, e.clientY)}
      onMouseLeave={clearGlow}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) setGlowAt(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) setGlowAt(t.clientX, t.clientY);
      }}
      onTouchEnd={clearGlow}
      onTouchCancel={clearGlow}
      style={{ touchAction: "manipulation" }}
      className={`group relative overflow-hidden rounded-2xl border-2 border-dashed bg-surface/70 text-center transition-[border-color,background-color,transform] duration-200 dark:bg-dark-surface/70 ${
        hover
          ? "scale-[1.005] border-coral-500 bg-coral-50/60 dark:bg-coral-900/30"
          : "border-border dark:border-dark-border"
      } ${isPhone ? "px-5 py-7" : "px-7 py-10"}`}
    >
      {/* Cursor / touch spotlight glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={glowStyle}
      />

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
      {showSelected && previewUrl ? (
        // Selected-file thumbnail. Confirms the *right* image is queued
        // — without this, users couldn't tell from the file name alone
        // whether they'd dropped the photo they meant. Coral ring marks
        // the "ready to open" state to match the rest of the modal's
        // active accents.
        <div className="relative z-10 mb-3.5 inline-flex">
          <img
            src={previewUrl}
            alt={selectedFile.name}
            className="h-20 w-20 rounded-2xl object-cover shadow-[0_4px_12px_-2px_rgba(0,0,0,0.15)] ring-2 ring-coral-500/70"
          />
          <span
            aria-hidden
            className="absolute -right-1.5 -bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-coral-500 text-white shadow-[0_2px_6px_-1px_rgba(245,97,58,0.5)]"
          >
            <I.Check size={13} stroke={3} />
          </span>
        </div>
      ) : (
        <div
          {...(previewLoading
            ? { role: "status", "aria-busy": true, "aria-label": "Decoding HEIC preview…" }
            : {})}
          className={`relative z-10 mb-3.5 inline-flex h-14 w-14 items-center justify-center rounded-2xl transition-[background-color,transform,color] duration-200 motion-safe:group-hover:-translate-y-0.5 ${
            hover
              ? "bg-coral-100 text-coral-600 dark:bg-coral-900/50"
              : showSelected
                ? "bg-coral-50 text-coral-600 dark:bg-coral-900/30 dark:text-coral-300"
                : "bg-page-bg text-text-muted group-hover:bg-coral-50 group-hover:text-coral-500 dark:bg-dark-page-bg dark:text-dark-text-muted dark:group-hover:bg-coral-900/30"
          }`}
        >
          {previewLoading ? (
            // Subtle spinner during HEIC decode (~200–500 ms on phones).
            // Without it, the FileImage icon sits frozen on a HEIC pick
            // and the user can't tell whether the app stalled or is
            // working. The animation is CSS-only via the global
            // `ci-spin` keyframes already used by Spinner.
            <span
              aria-hidden
              className="block h-5 w-5 rounded-full border-2 border-current border-t-transparent"
              style={{ animation: "ci-spin 0.9s linear infinite" }}
            />
          ) : showSelected ? (
            <I.FileImage size={24} />
          ) : (
            <I.Upload size={24} />
          )}
        </div>
      )}
      <div
        className={`relative z-10 mb-1 text-base font-semibold transition-colors duration-200 ${
          hover ? "text-coral-700 dark:text-coral-300" : "text-text dark:text-dark-text"
        }`}
      >
        {showSelected ? selectedFile.name : title}
      </div>
      <div className="relative z-10 mb-3.5 text-[13px] text-text-muted dark:text-dark-text-muted">
        {showSelected
          ? `${(selectedFile.size / 1024).toFixed(0)} KB · ${selectedFile.type || "image"}`
          : subtitle}
      </div>
      <div className="relative z-10 flex flex-wrap justify-center gap-2">
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
            className="btn btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              void onClipboardPasteButton();
            }}
          >
            <I.Layers size={13} /> Paste from clipboard
          </button>
        )}
      </div>
    </section>
  );
}
