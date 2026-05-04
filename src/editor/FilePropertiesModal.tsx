// FilePropertiesModal.tsx — File properties dialog opened from the
// top-bar filename. Surfaces what we know about the loaded image:
// name, dimensions, aspect, file size (when the source bytes are
// available), MIME / format, EXIF metadata (extracted across JPEG /
// HEIC / AVIF / WebP / PNG / TIFF), and layer count.

import { useEffect, useRef } from "react";
import { I } from "../components/icons";
import { ModalCloseButton, ModalFrame } from "../components/ModalFrame";
import { useEditor } from "./EditorContext";
import { exifToFields } from "./tools/exif";
import type { Layout } from "./types";
import { useFocusReturn, useFocusTrap } from "./useFocusReturn";
import { formatBytes } from "../utils/formatBytes";

interface Props {
  layout: Layout;
  onClose: () => void;
}

type IconComponent = (typeof I)[keyof typeof I];
type Row = [IconComponent, string, string];

export function FilePropertiesModal({ layout, onClose }: Props) {
  const { doc, layers, getFabricCanvas } = useEditor();
  const isMobile = layout === "mobile";
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusReturn(true);
  useFocusTrap(dialogRef, true);

  // Esc closes — paired with the trap so keyboard users can dismiss
  // the dialog without hunting for the close button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!doc) return null;

  const exifFields = exifToFields(doc.exif);
  const sourceBytes = doc.sourceBytes?.byteLength ?? 0;
  const aspect = ratio(doc.width, doc.height);
  const format = inferFormat(doc.fileName, doc.sourceIsJpeg);
  const fabricObjects = getFabricCanvas()?.getObjects().length ?? 0;
  const layerCount = layers.length + fabricObjects;

  const rows: Row[] = [
    [I.Tag, "Name", doc.fileName],
    [I.FileImage, "Format", format],
    [I.Maximize, "Dimensions", `${doc.width} × ${doc.height} px`],
    [I.Ratio, "Aspect ratio", aspect],
    [I.Sparkles, "Megapixels", `${((doc.width * doc.height) / 1_000_000).toFixed(2)} MP`],
  ];
  if (sourceBytes > 0) {
    rows.push([I.HardDrive, "Source size", formatBytes(sourceBytes)]);
  }
  if (layerCount > 0) {
    rows.push([I.Layers, "Layers", `${layerCount}`]);
  }

  const exifRows: Row[] = exifFields.map(([k, v]) => [iconForExifField(k), k, v]);

  return (
    <ModalFrame
      onClose={onClose}
      bottomSheet={isMobile}
      position="absolute"
      maxWidth="max-w-130"
      labelledBy="file-properties-title"
      dialogRef={dialogRef}
    >
      <div className="flex items-center justify-between border-b border-border-soft px-5 py-4 dark:border-dark-border-soft">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300">
            <I.FileImage size={16} />
          </div>
          <div>
            <div className="t-eyebrow text-[10px]">File</div>
            <div id="file-properties-title" className="t-headline text-base">
              Properties
            </div>
          </div>
        </div>
        <ModalCloseButton onClose={onClose} iconSize={14} />
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="rounded-lg bg-page-bg px-3 py-2.5 text-[12px] dark:bg-dark-page-bg">
          {rows.map((row) => (
            <PropRow key={row[1]} row={row} />
          ))}
        </div>

        {exifRows.length > 0 ? (
          <div>
            <div className="t-section-label mb-1.5">EXIF metadata</div>
            <div className="rounded-lg bg-page-bg px-3 py-2.5 text-[12px] dark:bg-dark-page-bg">
              {exifRows.map((row) => (
                <PropRow key={row[1]} row={row} />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
            No EXIF metadata found. Screenshots, edited exports, and images stripped of metadata
            won't have any to read.
          </div>
        )}
      </div>

      <div
        className={`border-t border-border-soft text-right dark:border-dark-border-soft ${
          isMobile ? "px-5 py-3 pb-[max(env(safe-area-inset-bottom),12px)]" : "px-5 py-3"
        }`}
      >
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalFrame>
  );
}

function PropRow({ row }: { row: Row }) {
  const [Ic, k, v] = row;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-soft py-1.5 last:border-b-0 dark:border-dark-border-soft">
      <span className="flex items-center gap-1.5 text-text-muted dark:text-dark-text-muted">
        <Ic size={12} className="shrink-0 self-center text-text-muted dark:text-dark-text-muted" />
        {k}
      </span>
      <span
        className="t-mono max-w-2/3 truncate text-right text-text dark:text-dark-text"
        title={v}
      >
        {v}
      </span>
    </div>
  );
}

function iconForExifField(name: string): IconComponent {
  switch (name) {
    case "Camera":
      return I.Camera;
    case "Lens":
      return I.Aperture;
    case "Exposure":
      return I.Sunburst;
    case "Date":
      return I.Calendar;
    case "GPS":
      return I.MapPin;
    case "Software":
      return I.Wand;
    default:
      return I.Tag;
  }
}

function ratio(w: number, h: number): string {
  if (!w || !h) return "—";
  const g = gcd(w, h);
  return `${w / g} : ${h / g}`;
}

function gcd(a: number, b: number): number {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function inferFormat(name: string, isJpeg: boolean): string {
  if (isJpeg) return "JPEG";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "JPEG";
    case "png":
      return "PNG";
    case "webp":
      return "WebP";
    case "avif":
      return "AVIF";
    case "gif":
      return "GIF";
    case "heic":
    case "heif":
      return "HEIC";
    default:
      return ext ? ext.toUpperCase() : "Unknown";
  }
}
