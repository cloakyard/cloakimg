import {
  type DragEvent as ReactDragEvent,
  type ClipboardEvent as ReactClipboardEvent,
  useCallback,
  useId,
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
  /** Headline shown when no file is highlighted. */
  title?: string;
  /** Sub-headline below the title. */
  subtitle?: string;
  /** Accept attribute for the file input. Default covers the formats
   *  the editor decodes natively (createImageBitmap) plus HEIC/HEIF
   *  via the local libheif WASM codec. */
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
  title = "Drop an image here",
  subtitle = "or use Browse files — JPG, PNG, WebP, AVIF, HEIC, HEIF",
  accept = DEFAULT_ACCEPT,
  showPasteButton = true,
  selectedFile = null,
}: DropZoneProps) {
  const statusId = useId();
  const attempt = useRef(0);
  const clipboardPending = useRef(false);
  const [error, setError] = useState("");
  const [readingClipboard, setReadingClipboard] = useState(false);
  useEffect(
    () => () => {
      attempt.current++;
    },
    [],
  );
  useEffect(() => {
    attempt.current++;
    clipboardPending.current = false;
    setReadingClipboard(false);
  }, [selectedFile]);
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
  //     these in Chrome / Firefox, so we route through the local codec
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

  const acceptFiles = useCallback(
    (files: File[]) => {
      attempt.current++;
      clipboardPending.current = false;
      setReadingClipboard(false);
      if (!files.length) return;
      if (!multiple && files.length > 1) {
        setError("Choose one image at a time. Your current selection is unchanged.");
        return;
      }
      if (
        files.some(
          (file) =>
            !file.type.startsWith("image/") &&
            !/\.(jpe?g|png|webp|avif|gif|heic|heif|bmp|svg)$/i.test(file.name),
        )
      ) {
        setError("Choose an image file, such as JPG, PNG, WebP, AVIF, GIF, HEIC or HEIF.");
        return;
      }
      if (files.some((file) => file.size === 0)) {
        setError("That image is empty. Choose a file that contains image data.");
        return;
      }
      setError("");
      onFiles(files);
    },
    [multiple, onFiles],
  );

  const onPick = () => {
    attempt.current++;
    clipboardPending.current = false;
    setReadingClipboard(false);
    inputRef.current?.click();
  };

  const onDrop = (event: ReactDragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    setHover(false);
    acceptFiles(Array.from(event.dataTransfer.files));
  };

  const onPaste = (event: ReactClipboardEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    acceptFiles(files);
  };

  const onClipboardPasteButton = async () => {
    if (clipboardPending.current) return;
    const current = ++attempt.current;
    setError("");
    if (!navigator.clipboard?.read) {
      setError(
        "Clipboard access is unavailable. Use Browse files or paste an image here with your keyboard.",
      );
      return;
    }
    clipboardPending.current = true;
    setReadingClipboard(true);
    try {
      const items = await navigator.clipboard.read();
      const collected: File[] = [];
      for (const item of items) {
        const type = item.types.find((value) => value.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          if (current !== attempt.current) return;
          collected.push(new File([blob], "clipboard.png", { type }));
          if (!multiple) break;
        }
      }
      if (current !== attempt.current) return;
      if (collected.length) acceptFiles(collected);
      else setError("No image was found on the clipboard. Copy an image or use Browse files.");
    } catch {
      if (current === attempt.current)
        setError("The clipboard couldn’t be read. Allow clipboard access or use Browse files.");
    } finally {
      if (current === attempt.current) {
        clipboardPending.current = false;
        setReadingClipboard(false);
      }
    }
  };

  const showSelected = !multiple && selectedFile;

  return (
    <section
      aria-label={multiple ? "Drop or pick images" : "Drop or pick an image"}
      data-dragging={hover ? "true" : undefined}
      aria-describedby={error ? statusId : undefined}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setHover(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(false);
      }}
      onDrop={onDrop}
      onPaste={onPaste}
      className="img-dropzone"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          acceptFiles(files);
          e.target.value = "";
        }}
      />
      <div className="img-dropzone__body">
        {showSelected && previewUrl ? (
          <div className="img-dropzone__preview">
            <img src={previewUrl} alt={selectedFile.name} width={56} height={56} />
            <span aria-hidden>
              <I.Check size={12} stroke={1.6} />
            </span>
          </div>
        ) : (
          <div className="img-dropzone__icon" aria-hidden="true">
            {showSelected ? (
              <I.FileImage size={24} stroke={1.6} aria-hidden="true" />
            ) : (
              <I.Upload size={24} stroke={1.6} aria-hidden="true" />
            )}
          </div>
        )}

        <div className="img-dropzone__copy">
          <strong>
            {showSelected ? selectedFile.name : hover ? "Release to select your image" : title}
          </strong>
          <span>
            {showSelected
              ? `${(selectedFile.size / 1024).toFixed(0)} KB · ${selectedFile.type || "image"}`
              : subtitle}
          </span>
        </div>

        <div className="img-dropzone__actions">
          <button
            type="button"
            className="air-button air-button--primary"
            onClick={(e) => {
              e.stopPropagation();
              onPick();
            }}
          >
            <I.Folder size={18} stroke={1.6} aria-hidden="true" /> Browse files
          </button>

          {showPasteButton && (
            <button
              type="button"
              aria-label="Paste from clipboard"
              aria-disabled={readingClipboard}
              aria-busy={readingClipboard}
              className="air-button air-button--quiet"
              onClick={(e) => {
                e.stopPropagation();
                void onClipboardPasteButton();
              }}
            >
              <I.Layers size={18} stroke={1.6} aria-hidden="true" /> Paste
            </button>
          )}
        </div>
      </div>
      <p
        id={statusId}
        className={error ? "img-dropzone__error" : "img-dropzone__status"}
        role="status"
        aria-live="polite"
      >
        {error ||
          (readingClipboard
            ? "Reading the clipboard…"
            : previewLoading
              ? "Decoding HEIC preview…"
              : "")}
      </p>
    </section>
  );
}
