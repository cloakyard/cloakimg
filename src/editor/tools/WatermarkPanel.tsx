// WatermarkPanel.tsx — Text or image watermark with anchor + opacity.
// One singleton text watermark and one singleton image watermark layer
// driven by tool state; clicking Apply syncs panel values into the
// matching layer (creating it on first use).

import { FabricImage, IText } from "fabric";
import { useCallback, useState } from "react";
import { ColorPicker } from "../ColorPicker";
import type { WatermarkAnchor } from "../doc";
import { useEditor } from "../EditorContext";
import { PropRow, Segment, Slider } from "../atoms";
import { I } from "../../components/icons";
import { regionCoverage } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";

/** Fabric `cloakKind` tags. Used to find the singleton on re-apply
 *  and so future code can route layer ops to the right kind. */
const WATERMARK_IMAGE_TAG = "cloak:watermarkImage";
const WATERMARK_TEXT_TAG = "cloak:watermarkText";

interface TaggedFabricObject {
  cloakKind?: string;
}

const POSITIONS: { id: WatermarkAnchor; label: string }[] = [
  { id: "tl", label: "Top L" },
  { id: "tc", label: "Top C" },
  { id: "tr", label: "Top R" },
  { id: "bl", label: "Btm L" },
  { id: "bc", label: "Btm C" },
  { id: "br", label: "Btm R" },
];

export function WatermarkPanel() {
  const { toolState, patchTool, layers, commit, doc, getFabricCanvas } = useEditor();
  const subjectMask = useSubjectMask();
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const isImage = toolState.watermarkMode === 1;

  // Smart placement — score each of the 6 anchor regions by subject
  // coverage and pick the emptiest. A watermark in TL on a portrait
  // photo with a face top-left would clobber the subject; this puts
  // it diagonally opposite the busiest area instead. Each anchor is
  // scored against the SAME region size (~22 % of the short edge)
  // regardless of where the user has the size slider, so the ranking
  // is purely about subject overlap.
  const smartPlace = useCallback(async () => {
    if (!doc) return;
    setSmartError(null);
    setSmartBusy(true);
    try {
      const mask = subjectMask.peek() ?? (await subjectMask.request());
      // Region footprint: ~22 % of the short edge in each dimension.
      // That covers a generous corner / edge area — bigger than the
      // typical text watermark, so the score reflects "is this side
      // of the image clear?" rather than "is the exact pixel under
      // the watermark clear?".
      const short = Math.min(mask.width, mask.height);
      const rw = Math.round(short * 0.22);
      const rh = Math.round(short * 0.22);
      const W = mask.width;
      const H = mask.height;
      const cx = (W - rw) / 2;
      const regions = [
        { x: 0, y: 0, w: rw, h: rh }, // 0 TL
        { x: cx, y: 0, w: rw, h: rh }, // 1 TC
        { x: W - rw, y: 0, w: rw, h: rh }, // 2 TR
        { x: 0, y: H - rh, w: rw, h: rh }, // 3 BL
        { x: cx, y: H - rh, w: rw, h: rh }, // 4 BC
        { x: W - rw, y: H - rh, w: rw, h: rh }, // 5 BR
      ];
      let bestIndex = 5;
      let bestScore = Infinity;
      for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        if (!region) continue;
        const score = regionCoverage(mask, region);
        if (score < bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      patchTool("watermarkPosition", bestIndex);
    } catch (err) {
      setSmartError(err instanceof Error ? err.message : "Couldn't detect subject.");
    } finally {
      setSmartBusy(false);
    }
  }, [doc, patchTool, subjectMask]);

  const applyText = useCallback(() => {
    const fc = getFabricCanvas();
    if (!fc || !doc) return;

    // Drop any existing watermark-text singleton.
    for (const obj of fc.getObjects()) {
      if ((obj as TaggedFabricObject).cloakKind === WATERMARK_TEXT_TAG) {
        fc.remove(obj);
      }
    }

    const positionId = POSITIONS[toolState.watermarkPosition]?.id ?? "br";
    const padding = 16;
    // Watermark text uses image-space pixel size for fontSize so the
    // visual size scales with the doc on export.
    const fontSize = Math.max(8, toolState.watermarkSize);

    const text = new IText(toolState.watermarkText, {
      fontSize,
      fontFamily: "Inter, sans-serif",
      fontWeight: 600,
      fill: toolState.watermarkColor,
      opacity: toolState.watermarkOpacity,
      // Position the IText's anchor (originX/Y) at the requested corner
      // so re-anchoring on right-aligned variants doesn't bleed past the
      // image edge.
      ...anchorToOrigins(positionId),
      ...anchorToImageEdge(positionId, doc.width, doc.height, padding),
      // Pinned: user edits via the panel, not via canvas drag/scale.
      // F3's Move-tool selection won't grab this either.
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true,
      // Disable IText's own caret/selection editing for the
      // pinned-watermark UX; the panel is the source of truth.
      editable: false,
    });
    (text as TaggedFabricObject).cloakKind = WATERMARK_TEXT_TAG;
    fc.add(text);
    fc.requestRenderAll();
    commit("Apply text watermark");
  }, [commit, doc, getFabricCanvas, toolState]);

  const applyImage = useCallback(async () => {
    const src = toolState.watermarkImageDataUrl;
    const fc = getFabricCanvas();
    if (!src || !fc || !doc) return;

    // Single-instance semantics: drop any existing watermark image.
    for (const obj of fc.getObjects()) {
      if ((obj as TaggedFabricObject).cloakKind === WATERMARK_IMAGE_TAG) {
        fc.remove(obj);
      }
    }

    const img = await FabricImage.fromURL(src);
    // Scale so the watermark spans `watermarkSize / 240` of the doc width
    // (matches the legacy slider's 5%–50% range mapping).
    const targetWidth = doc.width * Math.max(0.05, Math.min(0.5, toolState.watermarkSize / 240));
    const naturalWidth = img.width || 1;
    const factor = targetWidth / naturalWidth;
    const naturalHeight = img.height || 1;
    const targetHeight = naturalHeight * factor;

    // Place at the requested anchor in image-space.
    const padding = 16;
    const positionId = POSITIONS[toolState.watermarkPosition]?.id ?? "br";
    const { left, top } = anchorToImagePos(
      positionId,
      doc.width,
      doc.height,
      targetWidth,
      targetHeight,
      padding,
    );

    img.set({
      left,
      top,
      scaleX: factor,
      scaleY: factor,
      opacity: toolState.watermarkOpacity,
      originX: "left",
      originY: "top",
      // Fabric will pick these up if we ever flip selection on (Phase F3).
      selectable: true,
      hasControls: true,
      hasBorders: true,
      lockUniScaling: true,
    });
    (img as TaggedFabricObject).cloakKind = WATERMARK_IMAGE_TAG;
    fc.add(img);
    fc.requestRenderAll();
    commit("Apply image watermark");
  }, [commit, doc, getFabricCanvas, toolState]);

  const onPickFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const dataUrl = await readFileAsDataUrl(file);
      patchTool("watermarkImageDataUrl", dataUrl);
    },
    [patchTool],
  );

  void layers;

  return (
    <>
      <PropRow label="Mode">
        <Segment
          options={["Text", "Image"]}
          active={toolState.watermarkMode}
          onChange={(i) => patchTool("watermarkMode", i)}
        />
      </PropRow>
      {!isImage && (
        <PropRow label="Text">
          <input
            type="text"
            value={toolState.watermarkText}
            onChange={(e) => patchTool("watermarkText", e.target.value)}
            className="w-full rounded-lg border border-border bg-page-bg px-2.5 py-2 font-[inherit] text-[12.5px] text-text dark:border-dark-border dark:bg-dark-page-bg dark:text-dark-text"
          />
        </PropRow>
      )}
      {!isImage && (
        <PropRow label="Color">
          <ColorPicker
            value={toolState.watermarkColor}
            onChange={(c) => patchTool("watermarkColor", c)}
          />
        </PropRow>
      )}
      {isImage && (
        <PropRow label="Image">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-border bg-page-bg px-2.5 py-2 text-xs dark:border-dark-border dark:bg-dark-page-bg">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            {toolState.watermarkImageDataUrl ? (
              <>
                <img
                  src={toolState.watermarkImageDataUrl}
                  alt=""
                  className="h-7 w-7 rounded-xs bg-surface object-contain dark:bg-dark-surface"
                />
                <span className="flex-1">Replace image…</span>
              </>
            ) : (
              <>
                <I.Upload size={14} />
                <span className="flex-1">Choose a PNG / JPG…</span>
              </>
            )}
          </label>
        </PropRow>
      )}
      <PropRow label="Position">
        {/* Smart Place picks the corner with the least subject
            overlap, so the watermark lands diagonally opposite the
            face / centre of attention. The 6-tile manual grid below
            stays for users who want a specific corner regardless. */}
        <button
          type="button"
          onClick={() => void smartPlace()}
          disabled={smartBusy}
          className="mb-1.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-soft bg-page-bg px-2 py-1.5 font-[inherit] text-[11.5px] font-semibold text-text dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text"
          style={{ opacity: smartBusy ? 0.7 : 1 }}
        >
          <I.Sparkles size={12} className="text-coral-500 dark:text-coral-400" />
          {smartBusy ? "Finding empty corner…" : "Place away from subject"}
        </button>
        {smartError && (
          <div className="mb-1.5 rounded-md border border-coral-300 bg-coral-50 px-2.5 py-1.5 text-[11px] text-coral-900 dark:border-coral-500/40 dark:bg-coral-900/20 dark:text-coral-200">
            {smartError}
          </div>
        )}
        <div className="grid grid-cols-3 gap-1">
          {POSITIONS.map((p, i) => {
            const active = i === toolState.watermarkPosition;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => patchTool("watermarkPosition", i)}
                className={`cursor-pointer rounded-md border px-1 py-2 font-[inherit] text-[11px] font-semibold ${
                  active
                    ? "border-coral-500 bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
                    : "border-border bg-surface text-text-muted dark:border-dark-border dark:bg-dark-surface dark:text-dark-text-muted"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </PropRow>
      <PropRow
        label={isImage ? "Scale" : "Size"}
        value={
          isImage
            ? `${Math.round((toolState.watermarkSize / 240) * 100)}%`
            : `${toolState.watermarkSize.toFixed(0)} px`
        }
      >
        <Slider
          value={Math.min(1, toolState.watermarkSize / 120)}
          accent
          defaultValue={24 / 120}
          onChange={(v) => patchTool("watermarkSize", Math.max(8, v * 120))}
        />
      </PropRow>
      <PropRow label="Opacity" value={`${Math.round(toolState.watermarkOpacity * 100)}%`}>
        <Slider
          value={toolState.watermarkOpacity}
          accent
          defaultValue={0.55}
          onChange={(v) => patchTool("watermarkOpacity", v)}
        />
      </PropRow>
      <button
        type="button"
        className="btn btn-primary justify-center"
        onClick={isImage ? applyImage : applyText}
        disabled={isImage && !toolState.watermarkImageDataUrl}
        style={{
          fontSize: 12.5,
          padding: "9px",
          opacity: isImage && !toolState.watermarkImageDataUrl ? 0.5 : 1,
        }}
      >
        Apply watermark
      </button>
    </>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/** Map an anchor to Fabric `originX` / `originY` so the IText pivots
 *  on its closest-to-edge corner. Image watermarks always use
 *  top-left origin and translate manually instead. */
function anchorToOrigins(anchor: WatermarkAnchor): {
  originX: "left" | "center" | "right";
  originY: "top" | "center" | "bottom";
} {
  const xMap: Record<string, "left" | "center" | "right"> = {
    l: "left",
    c: "center",
    r: "right",
  };
  const yMap: Record<string, "top" | "bottom"> = { t: "top", b: "bottom" };
  return {
    originX: xMap[anchor[1] ?? "l"] ?? "left",
    originY: yMap[anchor[0] ?? "t"] ?? "top",
  };
}

/** Compute the IText `left` / `top` offsets so the chosen origin lines
 *  up `padding` pixels inside the image edge. */
function anchorToImageEdge(
  anchor: WatermarkAnchor,
  imgW: number,
  imgH: number,
  padding: number,
): { left: number; top: number } {
  const { originX, originY } = anchorToOrigins(anchor);
  const left = originX === "left" ? padding : originX === "right" ? imgW - padding : imgW / 2;
  const top = originY === "top" ? padding : originY === "bottom" ? imgH - padding : imgH / 2;
  return { left, top };
}

/** Compute the image-space top-left for a watermark of the given size
 *  at the requested anchor. Pure math, used by the Fabric image path. */
function anchorToImagePos(
  anchor: WatermarkAnchor,
  imgW: number,
  imgH: number,
  w: number,
  h: number,
  padding: number,
): { left: number; top: number } {
  switch (anchor) {
    case "tl":
      return { left: padding, top: padding };
    case "tc":
      return { left: (imgW - w) / 2, top: padding };
    case "tr":
      return { left: imgW - w - padding, top: padding };
    case "bl":
      return { left: padding, top: imgH - h - padding };
    case "bc":
      return { left: (imgW - w) / 2, top: imgH - h - padding };
    case "br":
      return { left: imgW - w - padding, top: imgH - h - padding };
  }
}
