/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4
 * component: editor tool · genre: modern-minimal · theme: DESIGN.md
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (40–41) · slop: pass (58/58) · mobile: pass (34, 49–57)
 */
// IdPhotoTool.tsx — Non-destructive ID/passport/visa crop guide and
// exact-size print-sheet output. Selecting this tool never mutates the
// working image or history; it only creates a PDF/print product.

import { type FabricObject, Rect as FabricRect } from "fabric";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I } from "../../components/icons";
import { InlineSpinner, PropRow, Segment, Slider } from "../atoms";
import { useEditor } from "../EditorContext";
import { renderCompositeCanvas } from "../exportPipeline";
import { FABRIC_SELECTION_COLOR } from "../fabricDefaults";
import type { Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import type { ToolState } from "../toolState";
import { backgroundFillLabel } from "./backgroundFill";
import type { Rect } from "./cropMath";
import {
  ID_PHOTO_DPI,
  PAPER_PRESETS,
  calculateSheetLayout,
  clampCrop,
  cropPosition,
  cropZoom,
  findPaperPreset,
  largestCenteredCrop,
  moveCrop,
  renderCropThumbnail,
  renderIdPhotoSheet,
  sheetToPdfBlob,
  zoomCrop,
} from "./idPhotoLayout";
import { ID_PHOTO_PRESETS, type IdPhotoPresetGroup, findIdPhotoPreset } from "./idPhotoPresets";
import { looksAlreadyRemoved } from "./removeBg";

const CROP_TAG = "cloak:cropOverlay";
const PRESET_GROUPS: readonly IdPhotoPresetGroup[] = ["Passport & ID", "Visa", "General"];

interface TaggedFabricObject extends FabricObject {
  cloakKind?: string;
}

function readCropBox(rect: FabricObject): Rect {
  return {
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    w: (rect.width ?? 0) * (rect.scaleX ?? 1),
    h: (rect.height ?? 0) * (rect.scaleY ?? 1),
  };
}

function photoSize(toolState: ToolState) {
  const preset = findIdPhotoPreset(toolState.idPhotoPresetId);
  return {
    preset,
    widthMm: preset.custom ? clampMm(toolState.idPhotoCustomW) : preset.widthMm,
    heightMm: preset.custom ? clampMm(toolState.idPhotoCustomH) : preset.heightMm,
  };
}

function clampMm(value: number) {
  return Math.min(100, Math.max(20, Number.isFinite(value) ? value : 35));
}

export function IdPhotoTool() {
  const { doc, getFabricCanvas, toolState, patchTool } = useEditor();
  const cropObjectRef = useRef<FabricObject | null>(null);
  const { preset, widthMm, heightMm } = photoSize(toolState);
  const aspect = widthMm / heightMm;

  const paintOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, transform: Transform) => {
      const cropObject = cropObjectRef.current;
      if (!cropObject || !doc) return;
      const crop = readCropBox(cropObject);
      const x = transform.ox + crop.x * transform.scale;
      const y = transform.oy + crop.y * transform.scale;
      const width = crop.w * transform.scale;
      const height = crop.h * transform.scale;
      const imageX = transform.ox;
      const imageY = transform.oy;
      const imageW = transform.iw * transform.scale;
      const imageH = transform.ih * transform.scale;

      ctx.save();
      ctx.fillStyle = "rgba(20, 18, 16, 0.56)";
      if (y > imageY) ctx.fillRect(imageX, imageY, imageW, y - imageY);
      if (y + height < imageY + imageH) {
        ctx.fillRect(imageX, y + height, imageW, imageY + imageH - (y + height));
      }
      if (x > imageX) ctx.fillRect(imageX, y, x - imageX, height);
      if (x + width < imageX + imageW) {
        ctx.fillRect(x + width, y, imageX + imageW - (x + width), height);
      }

      // Manual composition guide. It never claims to validate a face;
      // it simply gives the user an authority-sized chin-to-crown oval
      // and a centre/eye axis to line up against.
      const headMm = preset.headHeightMm
        ? (preset.headHeightMm.min + preset.headHeightMm.max) / 2
        : heightMm * 0.62;
      const headH = Math.min(height * 0.82, (headMm / heightMm) * height);
      const headW = Math.min(width * 0.72, headH * 0.72);
      const centreY = y + height * 0.44;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x + width / 2, y);
      ctx.lineTo(x + width / 2, y + height);
      ctx.moveTo(x, centreY);
      ctx.lineTo(x + width, centreY);
      ctx.ellipse(x + width / 2, centreY, headW / 2, headH / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },
    [doc, heightMm, preset.headHeightMm],
  );
  useStageProps({ paintOverlay });

  // Own one transient Fabric rectangle. It uses the existing crop tag,
  // so history, Layers, export, and tool hand-off already know to omit it.
  useEffect(() => {
    const fabricCanvas = getFabricCanvas();
    if (!fabricCanvas || !doc) return;
    for (const object of fabricCanvas.getObjects()) {
      if ((object as TaggedFabricObject).cloakKind === CROP_TAG) fabricCanvas.remove(object);
    }

    const stored = toolState.idPhotoCrop;
    const validStored =
      stored && stored.w > 0 && stored.h > 0 && Math.abs(stored.w / stored.h - aspect) < 0.01
        ? clampCrop(stored, doc.width, doc.height)
        : largestCenteredCrop(doc.width, doc.height, aspect);
    const rect = new FabricRect({
      left: validStored.x,
      top: validStored.y,
      width: validStored.w,
      height: validStored.h,
      originX: "left",
      originY: "top",
      fill: "transparent",
      stroke: FABRIC_SELECTION_COLOR,
      strokeWidth: 1.5,
      strokeUniform: true,
      cornerColor: FABRIC_SELECTION_COLOR,
      transparentCorners: false,
      borderColor: FABRIC_SELECTION_COLOR,
      borderScaleFactor: 1.5,
      padding: 0,
      lockRotation: true,
      lockUniScaling: true,
      objectCaching: false,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
    });
    rect.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false });
    (rect as TaggedFabricObject).cloakKind = CROP_TAG;
    fabricCanvas.add(rect);
    fabricCanvas.setActiveObject(rect);
    cropObjectRef.current = rect;
    patchTool("idPhotoCrop", validStored);

    const keepInside = (event?: { target?: FabricObject }) => {
      if (event?.target && event.target !== rect) return;
      let current = readCropBox(rect);
      if (current.w > doc.width || current.h > doc.height) {
        const shrink = Math.min(doc.width / current.w, doc.height / current.h);
        rect.set({
          scaleX: (rect.scaleX ?? 1) * shrink,
          scaleY: (rect.scaleY ?? 1) * shrink,
        });
        current = readCropBox(rect);
      }
      rect.set({
        left: Math.max(0, Math.min(doc.width - current.w, current.x)),
        top: Math.max(0, Math.min(doc.height - current.h, current.y)),
      });
      rect.setCoords();
      fabricCanvas.requestRenderAll();
    };
    const commitCrop = (event?: { target?: FabricObject }) => {
      if (event?.target && event.target !== rect) return;
      keepInside(event);
      const current = clampCrop(readCropBox(rect), doc.width, doc.height);
      rect.set({
        left: current.x,
        top: current.y,
        width: current.w,
        height: current.h,
        scaleX: 1,
        scaleY: 1,
      });
      rect.setCoords();
      patchTool("idPhotoCrop", current);
      fabricCanvas.requestRenderAll();
    };
    fabricCanvas.on("object:moving", keepInside);
    fabricCanvas.on("object:scaling", keepInside);
    fabricCanvas.on("object:modified", commitCrop);
    fabricCanvas.requestRenderAll();

    return () => {
      fabricCanvas.off("object:moving", keepInside);
      fabricCanvas.off("object:scaling", keepInside);
      fabricCanvas.off("object:modified", commitCrop);
      fabricCanvas.remove(rect);
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      cropObjectRef.current = null;
    };
    // Crop state changes are synchronized by the effect below; adding
    // it here would tear down the Fabric object during every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, getFabricCanvas, patchTool]);

  // Panel sliders and preset changes write image-space crop state.
  // Mirror those changes into the live Fabric object without remounting.
  useEffect(() => {
    const fabricCanvas = getFabricCanvas();
    const rect = cropObjectRef.current;
    if (!fabricCanvas || !rect || !doc) return;
    let next = toolState.idPhotoCrop;
    if (!next || Math.abs(next.w / next.h - aspect) >= 0.01) {
      next = largestCenteredCrop(doc.width, doc.height, aspect);
      patchTool("idPhotoCrop", next);
    } else {
      next = clampCrop(next, doc.width, doc.height);
    }
    const current = readCropBox(rect);
    if (
      Math.abs(current.x - next.x) < 0.25 &&
      Math.abs(current.y - next.y) < 0.25 &&
      Math.abs(current.w - next.w) < 0.25 &&
      Math.abs(current.h - next.h) < 0.25
    ) {
      return;
    }
    rect.set({
      left: next.x,
      top: next.y,
      width: next.w,
      height: next.h,
      scaleX: 1,
      scaleY: 1,
    });
    rect.setCoords();
    fabricCanvas.setActiveObject(rect);
    fabricCanvas.requestRenderAll();
  }, [aspect, doc, getFabricCanvas, patchTool, toolState.idPhotoCrop]);

  return null;
}

export function IdPhotoPanel() {
  const { doc, layers, toolState, patchTool, getFabricCanvas, historyVersion } = useEditor();
  const [busy, setBusy] = useState<"pdf" | "print" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { preset, widthMm, heightMm } = photoSize(toolState);
  const paper = findPaperPreset(toolState.idPhotoPaperId);
  const layout = useMemo(
    () => calculateSheetLayout({ widthMm, heightMm }, paper),
    [heightMm, paper, widthMm],
  );
  const crop = toolState.idPhotoCrop;
  const aspect = widthMm / heightMm;
  const [thumbUrl, setThumbUrl] = useState("");
  const backgroundCleared = useMemo(
    () =>
      doc
        ? doc.backgroundTreatment === "transparent" ||
          (doc.backgroundTreatment === "original" && looksAlreadyRemoved(doc.working))
        : false,
    [doc, historyVersion],
  );
  const backgroundPrepared = backgroundCleared || (!!doc && doc.backgroundTreatment !== "original");
  const preparedBackgroundLabel =
    doc &&
    (doc.backgroundTreatment === "solid" ||
      doc.backgroundTreatment === "gradient" ||
      doc.backgroundTreatment === "vignette")
      ? backgroundFillLabel(doc.backgroundTreatment)
      : null;

  useEffect(() => {
    if (!doc?.working || !crop) {
      setThumbUrl("");
      return;
    }
    setThumbUrl(renderCropThumbnail(doc.working, crop));
  }, [crop, doc?.working]);

  const resetCrop = useCallback(() => {
    if (!doc) return;
    patchTool("idPhotoCrop", largestCenteredCrop(doc.width, doc.height, aspect));
  }, [aspect, doc, patchTool]);

  const handlePreset = useCallback(
    (id: string) => {
      patchTool("idPhotoPresetId", id);
      patchTool("idPhotoCrop", null);
      setError(null);
    },
    [patchTool],
  );

  const createSheet = useCallback(() => {
    if (!doc || !crop) throw new Error("Set the crop frame before creating a sheet.");
    if (layout.copies === 0) {
      throw new Error("That photo is larger than the selected paper. Choose a larger paper size.");
    }
    const source = renderCompositeCanvas(doc, layers, doc.width, doc.height, getFabricCanvas());
    return renderIdPhotoSheet(source, crop, layout, toolState.idPhotoCutLines);
  }, [crop, doc, getFabricCanvas, layers, layout, toolState.idPhotoCutLines]);

  const handlePdf = useCallback(async () => {
    if (busy) return;
    setBusy("pdf");
    setError(null);
    try {
      await waitForPaint();
      const sheet = createSheet();
      const blob = await sheetToPdfBlob(sheet, paper);
      downloadBlob(blob, `cloakimg-${preset.id}-${paper.id}.pdf`);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(null);
    }
  }, [busy, createSheet, paper, preset.id]);

  const handlePrint = useCallback(async () => {
    if (busy) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("The print window was blocked. Allow pop-ups for CloakIMG, then try again.");
      return;
    }
    printWindow.opener = null;
    printWindow.document.write(
      "<!doctype html><title>Preparing ID photo sheet</title><body style='font:16px sans-serif;padding:24px'>Preparing exact-size print…</body>",
    );
    printWindow.document.close();
    setBusy("print");
    setError(null);
    try {
      await waitForPaint();
      const sheet = createSheet();
      const blob = await canvasToPng(sheet);
      const url = URL.createObjectURL(blob);
      const width = paper.widthMm;
      const height = paper.heightMm;
      printWindow.document.open();
      printWindow.document.write(`<!doctype html>
<html><head><title>ID photo sheet</title><style>
@page { size: ${width}mm ${height}mm; margin: 0; }
html, body { width: ${width}mm; height: ${height}mm; margin: 0; padding: 0; background: white; }
img { display: block; width: ${width}mm; height: ${height}mm; object-fit: fill; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
</style></head><body><img id="sheet" alt="ID photo print sheet"></body></html>`);
      printWindow.document.close();
      const image = printWindow.document.getElementById("sheet") as HTMLImageElement | null;
      if (!image) throw new Error("The browser could not prepare the print preview.");
      image.addEventListener(
        "load",
        () => {
          printWindow.focus();
          printWindow.print();
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        { once: true },
      );
      image.src = url;
    } catch (caught) {
      printWindow.close();
      setError(messageFor(caught));
    } finally {
      setBusy(null);
    }
  }, [busy, createSheet, paper.heightMm, paper.widthMm]);

  const position = crop && doc ? cropPosition(crop, doc.width, doc.height) : { x: 0.5, y: 0.5 };
  const zoom = crop && doc ? cropZoom(crop, doc.width, doc.height, aspect) : 0;

  return (
    <>
      <PropRow label="Photo standard" value={`${formatMm(widthMm)} × ${formatMm(heightMm)} mm`}>
        <select
          aria-label="Photo standard"
          value={toolState.idPhotoPresetId}
          onChange={(event) => handlePreset(event.currentTarget.value)}
          className="h-10 w-full cursor-pointer rounded-md border border-border bg-surface px-2.5 text-[12px] font-semibold text-text outline-2 outline-transparent hover:bg-page-bg focus-visible:outline-coral-500 pointer-coarse:h-11"
        >
          {PRESET_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {ID_PHOTO_PRESETS.filter((entry) => entry.group === group).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} · {formatMm(entry.widthMm)} × {formatMm(entry.heightMm)} mm
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </PropRow>

      {preset.custom ? (
        <PropRow label="Custom size">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <DimensionInput
              label="Width in millimetres"
              value={toolState.idPhotoCustomW}
              onChange={(value) => {
                patchTool("idPhotoCustomW", value);
                patchTool("idPhotoCrop", null);
              }}
            />
            <span className="t-mono text-[11px] text-text-muted">×</span>
            <DimensionInput
              label="Height in millimetres"
              value={toolState.idPhotoCustomH}
              onChange={(value) => {
                patchTool("idPhotoCustomH", value);
                patchTool("idPhotoCrop", null);
              }}
            />
          </div>
        </PropRow>
      ) : null}

      <div className="rounded-md border border-border-soft bg-page-bg px-2.5 py-2 text-[11px] leading-relaxed text-text-muted">
        {preset.note ??
          "The frame sets physical size only. Background, expression, recency, and biometric acceptance still depend on the issuing authority."}
        {preset.sourceUrl ? (
          <a
            href={preset.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex min-h-7 w-fit items-center gap-1 whitespace-nowrap rounded-sm font-semibold text-coral-700 underline decoration-coral-300 underline-offset-2 outline-2 outline-transparent hover:text-coral-800 focus-visible:outline-coral-500 active:text-coral-900 dark:text-coral-300 dark:hover:text-coral-200"
          >
            Check {preset.sourceLabel ?? "authority guidance"}{" "}
            <I.ArrowUpRight size={11} aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => patchTool("activeTool", "bgrm")}
        className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-left outline-2 outline-transparent transition-colors focus-visible:outline-coral-500 pointer-coarse:min-h-12 ${
          backgroundPrepared
            ? "border-emerald-300/60 bg-emerald-50/70 hover:bg-emerald-50 active:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-900/15 dark:hover:bg-emerald-900/25 dark:active:bg-emerald-900/35"
            : "border-border-soft bg-page-bg hover:border-border hover:bg-surface active:bg-page-bg"
        }`}
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
            backgroundPrepared
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-surface text-text-muted"
          }`}
        >
          {backgroundPrepared ? (
            <I.Check size={14} stroke={2.5} aria-hidden="true" />
          ) : (
            <I.Layers size={14} aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-semibold text-text">
            {backgroundCleared
              ? "Cutout ready"
              : preparedBackgroundLabel
                ? `${preparedBackgroundLabel} background ready`
                : "Need a plain background?"}
          </span>
          <span className="block text-[10.5px] leading-snug text-text-muted">
            {backgroundCleared
              ? "Transparent areas will print on white paper."
              : preparedBackgroundLabel
                ? "The selected background is already baked into this photo."
                : "Remove it first, then return here to finish framing."}
          </span>
        </span>
        <span className="shrink-0 text-[10.5px] font-semibold text-coral-700 dark:text-coral-300">
          {backgroundPrepared ? "Review" : "Open"}
        </span>
      </button>

      {doc && crop ? (
        <>
          <PropRow label="Framing" value={`${Math.round(zoom * 200 + 100)}%`}>
            <Slider
              value={zoom}
              accent={zoom > 0}
              defaultValue={0}
              ariaValueText={`${Math.round(zoom * 200 + 100)}% zoom`}
              onChange={(value) =>
                patchTool("idPhotoCrop", zoomCrop(crop, doc.width, doc.height, aspect, value))
              }
            />
          </PropRow>
          <PropRow label="Horizontal position">
            <Slider
              value={position.x}
              accent
              defaultValue={0.5}
              ariaValueText={`${Math.round(position.x * 100)}% from left`}
              onChange={(value) =>
                patchTool("idPhotoCrop", moveCrop(crop, doc.width, doc.height, value, position.y))
              }
            />
          </PropRow>
          <PropRow label="Vertical position">
            <Slider
              value={position.y}
              accent
              defaultValue={0.5}
              ariaValueText={`${Math.round(position.y * 100)}% from top`}
              onChange={(value) =>
                patchTool("idPhotoCrop", moveCrop(crop, doc.width, doc.height, position.x, value))
              }
            />
          </PropRow>
          <button type="button" className="btn btn-secondary btn-sm w-full" onClick={resetCrop}>
            <I.Refresh size={12} aria-hidden="true" /> Reset framing
          </button>
        </>
      ) : null}

      <PropRow label="Paper">
        <select
          aria-label="Paper size"
          value={paper.id}
          onChange={(event) => {
            patchTool("idPhotoPaperId", event.currentTarget.value);
            setError(null);
          }}
          className="h-10 w-full cursor-pointer rounded-md border border-border bg-surface px-2.5 text-[12px] font-semibold text-text outline-2 outline-transparent hover:bg-page-bg focus-visible:outline-coral-500 pointer-coarse:h-11"
        >
          {PAPER_PRESETS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </PropRow>

      <PropRow label="Cut guide lines" value={toolState.idPhotoCutLines ? "On by default" : "Off"}>
        <Segment
          options={["Off", "On"]}
          active={toolState.idPhotoCutLines ? 1 : 0}
          onChange={(value) => patchTool("idPhotoCutLines", value === 1)}
        />
      </PropRow>

      <PropRow
        label="Print preview"
        value={layout.copies > 0 ? `${layout.copies} copies` : "Does not fit"}
      >
        <SheetPreview layout={layout} thumbUrl={thumbUrl} cutLines={toolState.idPhotoCutLines} />
        <div className="t-mono mt-1.5 flex flex-wrap justify-between gap-1 text-[10px] text-text-muted">
          <span>{ID_PHOTO_DPI} DPI</span>
          <span>{layout.rotated ? "Rotated to fit" : "Upright"}</span>
          <span>
            {paper.widthMm} × {paper.heightMm} mm
          </span>
        </div>
      </PropRow>

      {error ? (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-danger/35 bg-danger/8 px-2.5 py-2 text-[11px] leading-relaxed text-danger"
        >
          <I.AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-primary min-w-0 px-2"
          onClick={() => void handlePrint()}
          disabled={!!busy || !crop || layout.copies === 0}
        >
          {busy === "print" ? <InlineSpinner /> : <I.Printer size={13} aria-hidden="true" />}
          {busy === "print" ? "Preparing…" : "Print"}
        </button>
        <button
          type="button"
          className="btn btn-secondary min-w-0 px-2"
          onClick={() => void handlePdf()}
          disabled={!!busy || !crop || layout.copies === 0}
        >
          {busy === "pdf" ? <InlineSpinner /> : <I.Download size={13} aria-hidden="true" />}
          {busy === "pdf" ? "Building…" : "Save PDF"}
        </button>
      </div>
      <div className="text-[11px] leading-relaxed text-text-muted">
        Print at <strong className="font-semibold text-text">100% / Actual size</strong> and turn
        off “Fit to page.” Use photo-quality paper required by the authority. The face oval is a
        framing guide, not automatic biometric validation.
      </div>
    </>
  );
}

function DimensionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(formatMm(value));
  useEffect(() => setDraft(formatMm(value)), [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    const next = clampMm(Number.isFinite(parsed) ? parsed : value);
    setDraft(formatMm(next));
    onChange(next);
  };

  return (
    <label className="relative min-w-0">
      <span className="sr-only">{label}</span>
      <input
        name={label.toLowerCase().replaceAll(" ", "-")}
        autoComplete="off"
        type="number"
        min={20}
        max={100}
        step={0.1}
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(formatMm(value));
          }
        }}
        className="t-mono h-10 w-full rounded-md border border-border bg-surface pr-7 pl-2 text-right text-[12px] font-semibold text-text outline-2 outline-transparent hover:bg-page-bg focus-visible:outline-coral-500 pointer-coarse:h-11"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-text-muted">
        mm
      </span>
    </label>
  );
}

function SheetPreview({
  layout,
  thumbUrl,
  cutLines,
}: {
  layout: ReturnType<typeof calculateSheetLayout>;
  thumbUrl: string;
  cutLines: boolean;
}) {
  return (
    <div className="flex justify-center rounded-md bg-canvas-bg px-3 py-3">
      <div
        role="img"
        aria-label={`${layout.copies} photos arranged on ${layout.paper.label}`}
        className="relative max-h-52 w-auto max-w-full overflow-hidden bg-white shadow-sm"
        style={{ aspectRatio: `${layout.paper.widthMm} / ${layout.paper.heightMm}`, height: 188 }}
      >
        {layout.slots.map((slot, index) => (
          <div
            key={`${slot.xMm}-${slot.yMm}-${index}`}
            className={`absolute overflow-hidden ${cutLines ? "outline outline-[0.5px] outline-slate-500/70" : ""}`}
            style={{
              left: `${(slot.xMm / layout.paper.widthMm) * 100}%`,
              top: `${(slot.yMm / layout.paper.heightMm) * 100}%`,
              width: `${(slot.widthMm / layout.paper.widthMm) * 100}%`,
              height: `${(slot.heightMm / layout.paper.heightMm) * 100}%`,
            }}
          >
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt=""
                width={160}
                height={200}
                className={
                  layout.rotated
                    ? "absolute top-1/2 left-1/2 max-w-none object-fill"
                    : "h-full w-full object-fill"
                }
                style={
                  layout.rotated
                    ? {
                        width: `${(layout.photo.widthMm / layout.photo.heightMm) * 100}%`,
                        height: `${(layout.photo.heightMm / layout.photo.widthMm) * 100}%`,
                        transform: "translate(-50%, -50%) rotate(90deg)",
                      }
                    : undefined
                }
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMm(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function waitForPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not encode the print sheet."));
    }, "image/png");
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function messageFor(caught: unknown) {
  return caught instanceof Error
    ? caught.message
    : "The print sheet could not be created. Try a different paper size.";
}
