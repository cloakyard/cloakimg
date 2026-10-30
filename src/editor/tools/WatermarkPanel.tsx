// WatermarkPanel.tsx — Text or image watermark with anchor + opacity.
// One singleton text watermark and one singleton image watermark layer
// driven by tool state; clicking Apply syncs panel values into the
// matching layer (creating it on first use).

import { FabricImage, IText } from "fabric";
import { useCallback, useState } from "react";
import { ImageFileButton } from "../ImageFileButton";
import { ColorPicker } from "../ColorPicker";
import { acquireCanvas, releaseCanvas, type WatermarkAnchor } from "../doc";
import { useEditor } from "../EditorContext";
import { InlineSpinner, PropRow, Segment, SliderField } from "../atoms";
import { I } from "../../components/icons";
import { MaskConsentError, regionCoverage } from "../ai/subjectMask";
import { MaskReadyPill } from "../ai/ui/MaskReadyPill";
import { SmartActionError } from "../ai/ui/SmartActionError";
import { useSubjectMask } from "../ai/useSubjectMask";

/** Fabric `cloakKind` tags. Used to find the singleton on re-apply
 *  and so future code can route layer ops to the right kind. */
const WATERMARK_IMAGE_TAG = "cloak:watermarkImage";
const WATERMARK_TEXT_TAG = "cloak:watermarkText";

interface TaggedFabricObject {
  cloakKind?: string;
}

const POSITIONS: { id: WatermarkAnchor; label: string; name: string }[] = [
  { id: "tl", label: "Top L", name: "Top left" },
  { id: "tc", label: "Top C", name: "Top centre" },
  { id: "tr", label: "Top R", name: "Top right" },
  { id: "bl", label: "Btm L", name: "Bottom left" },
  { id: "bc", label: "Btm C", name: "Bottom centre" },
  { id: "br", label: "Btm R", name: "Bottom right" },
];

export function WatermarkPanel() {
  const { toolState, patchTool, commit, doc, getFabricCanvas } = useEditor();
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
    let proxy: HTMLCanvasElement | null = null;
    try {
      // Smart Place is user-initiated; requestExplicit clears the
      // dismiss latch so a prior "Not now" doesn't silently break
      // future taps.
      const mask = subjectMask.peek() ?? (await subjectMask.requestExplicit());
      // Score against a downsampled proxy of the mask. `regionCoverage`
      // calls `getImageData(x, y, w, h)` for each region; on a 24 MP
      // mask with 22 % short-edge regions that allocates ~12 MB per
      // call × 6 calls. A 256 px proxy collapses that to <100 KB total
      // and the score (average alpha) is dimension-invariant. We use
      // the pool so the proxy canvas comes back for reuse instead of
      // allocating fresh each click.
      const PROXY_LONG_EDGE = 256;
      const long = Math.max(mask.width, mask.height);
      let scanCanvas: HTMLCanvasElement;
      if (long > PROXY_LONG_EDGE) {
        const ratio = PROXY_LONG_EDGE / long;
        const pw = Math.max(1, Math.round(mask.width * ratio));
        const ph = Math.max(1, Math.round(mask.height * ratio));
        proxy = acquireCanvas(pw, ph);
        const pctx = proxy.getContext("2d");
        if (!pctx) {
          // 2D context is unavailable — fall back to the full-res
          // mask so we at least produce a result. Release the canvas
          // we acquired so we don't leak.
          releaseCanvas(proxy);
          proxy = null;
          scanCanvas = mask;
        } else {
          pctx.imageSmoothingQuality = "low";
          pctx.drawImage(mask, 0, 0, pw, ph);
          scanCanvas = proxy;
        }
      } else {
        scanCanvas = mask;
      }
      // Region footprint: ~22 % of the short edge in each dimension.
      // That covers a generous corner / edge area — bigger than the
      // typical text watermark, so the score reflects "is this side
      // of the image clear?" rather than "is the exact pixel under
      // the watermark clear?". Scaled to whichever surface we end up
      // scanning (proxy or original).
      const W = scanCanvas.width;
      const H = scanCanvas.height;
      const short = Math.min(W, H);
      const rw = Math.max(1, Math.round(short * 0.22));
      const rh = Math.max(1, Math.round(short * 0.22));
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
        const score = regionCoverage(scanCanvas, region);
        if (score < bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      patchTool("watermarkPosition", bestIndex);
    } catch (err) {
      // Consent modal renders via the central host; the inline
      // smart-error chip below is for real detection failures only.
      if (err instanceof MaskConsentError) return;
      setSmartError(err instanceof Error ? err.message : "Couldn't detect subject.");
    } finally {
      if (proxy) releaseCanvas(proxy);
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
            name="watermark-text"
            type="text"
            aria-label="Watermark text"
            autoComplete="off"
            value={toolState.watermarkText}
            onChange={(e) => patchTool("watermarkText", e.target.value)}
            className="control-field w-full"
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
          <ImageFileButton
            accept="image/png,image/jpeg,image/webp"
            preview={toolState.watermarkImageDataUrl || undefined}
            onPick={onPickFile}
          />
        </PropRow>
      )}
      <PropRow label="Position">
        {/* Smart Place picks the corner with the least subject
            overlap, so the watermark lands diagonally opposite the
            face / centre of attention. The 6-tile manual grid below
            stays for users who want a specific corner regardless. */}
        <MaskReadyPill ready={!!subjectMask.peek()} align="end" />
        <button
          type="button"
          onClick={() => void smartPlace()}
          disabled={smartBusy}
          className="btn btn-secondary mb-1.5 w-full"
        >
          {smartBusy ? (
            <>
              <InlineSpinner size={16} /> Finding empty corner…
            </>
          ) : (
            <>
              <I.Sparkles size={16} /> Place away from subject
            </>
          )}
        </button>
        <div className="mb-1.5">
          <SmartActionError message={smartError} onDismiss={() => setSmartError(null)} />
        </div>
        <div className="air-segments img-position-grid">
          {POSITIONS.map((p, i) => {
            const active = i === toolState.watermarkPosition;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => patchTool("watermarkPosition", i)}
                aria-pressed={active}
                aria-label={p.name}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </PropRow>
      <SliderField
        label={isImage ? "Scale" : "Size"}
        domain={[0, isImage ? 50 : 120]}
        inputMin={isImage ? (8 / 240) * 100 : 8}
        inputStep={isImage ? 0.1 : 1}
        unit={isImage ? "%" : "px"}
        value={Math.min(1, toolState.watermarkSize / 120)}
        accent
        defaultValue={24 / 120}
        onChange={(v) => patchTool("watermarkSize", Math.max(8, v * 120))}
      />
      <SliderField
        label="Opacity"
        value={toolState.watermarkOpacity}
        accent
        defaultValue={0.55}
        onChange={(v) => patchTool("watermarkOpacity", v)}
      />
      <button
        type="button"
        className="btn btn-primary justify-center"
        onClick={isImage ? applyImage : applyText}
        disabled={isImage && !toolState.watermarkImageDataUrl}
        style={{ opacity: isImage && !toolState.watermarkImageDataUrl ? 0.5 : 1 }}
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
