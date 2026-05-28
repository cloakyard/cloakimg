// TapFixTool.tsx — One tool, infinite verbs. The user taps the photo
// and the tool inspects what's at that point (face box from BlazeFace?
// subject pixel from the U²-Net mask? neither?) and surfaces 2–3
// context-aware action chips next to the tap.
//
// Photoshop forces the user to *pick* the tool first: "I see a pimple,
// so I want the spot-heal brush; I see a face, so I want lasso-then-
// blur." CloakIMG inverts that — the user taps the thing they want
// changed, and the editor maps "thing" to "verb." Casual users get a
// one-tap fix; power users keep the existing rail.
//
// MVP scope (this file):
//   • Tap inside a detected face box → "Pixelate face" / "Blur face" /
//     "Spot heal" (faces are the most common retouch target)
//   • Tap inside the subject silhouette → "Pixelate subject" /
//     "Remove background"
//   • Tap anywhere else → "Spot heal"
//   • A second tap dismisses the chip menu without acting.
//
// Future extensions (out of MVP): sky detection → sky lift; small
// blemish detection → auto-heal; OCR-detected text region →
// "Redact text".

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { I } from "../../components/icons";
import { useEditor } from "../EditorContext";
import type { ImagePoint, Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import { useDetectFaces } from "../ai/capabilities/detect-face/hook";
import { padFaceBox } from "../ai/capabilities/detect-face/geometry";
import { useSubjectMask } from "../ai/useSubjectMask";
import type { FaceBox } from "../ai/runtime/types";
import { applyRedaction, type RedactStyle } from "./redact";

interface TapState {
  /** Image-space tap coords. */
  ix: number;
  iy: number;
  /** Screen-space tap coords (for chip positioning — recomputed every
   *  render via the live Transform so pan/zoom doesn't desync the
   *  chips from the tap point). */
  sx: number;
  sy: number;
}

type TapContext = { kind: "face"; box: FaceBox } | { kind: "subject" } | { kind: "anywhere" };

export function TapFixTool() {
  const { doc, commit, runBusy, setActiveTool, patchTool } = useEditor();
  const subjectMask = useSubjectMask();
  const faces = useDetectFaces();
  const [tap, setTap] = useState<TapState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Offset that nudges the chip menu back on-screen when the tap lands
  // near a viewport edge (computed in the layout effect below).
  const [clamp, setClamp] = useState({ dx: 0, dy: 0 });
  // Reading the AI service versions here subscribes this component to
  // their updates: when face detection or the subject mask finishes
  // (possibly after the user already tapped), we re-render and the live
  // re-classification below upgrades the chip set accordingly.
  void subjectMask.state.version;
  void faces.state.version;

  // Run a callback through runBusy, dismiss the chips, and commit
  // with the chosen label. Centralised because every action does the
  // same dance.
  const runAndCommit = useCallback(
    (label: string, fn: () => void) => {
      void runBusy(label, () => {
        fn();
        commit(label);
        setTap(null);
      });
    },
    [commit, runBusy],
  );

  // Classify the tap. Order matters: face > subject > anywhere, so a
  // tap inside a face that's part of the subject silhouette routes
  // to the face-specific verbs first (the tighter region wins).
  const classify = useCallback(
    (p: ImagePoint): TapContext => {
      // Face check — iterate detected boxes; first hit wins.
      const detected = faces.peek();
      if (detected) {
        for (const box of detected) {
          if (
            p.x >= box.x &&
            p.x <= box.x + box.width &&
            p.y >= box.y &&
            p.y <= box.y + box.height
          ) {
            return { kind: "face", box };
          }
        }
      }
      // Subject check — sample the cached cut's alpha channel at the
      // tap point. The cut is doc-sized RGBA; alpha > 0 means
      // subject pixel.
      const cut = subjectMask.peek();
      if (cut) {
        const ctx = cut.getContext("2d");
        if (ctx) {
          const x = Math.round(Math.max(0, Math.min(cut.width - 1, p.x)));
          const y = Math.round(Math.max(0, Math.min(cut.height - 1, p.y)));
          const data = ctx.getImageData(x, y, 1, 1).data;
          const alpha = data[3] ?? 0;
          if (alpha > 40) return { kind: "subject" };
        }
      }
      return { kind: "anywhere" };
    },
    [faces, subjectMask],
  );

  // Pointer-down on the canvas. If chips are already open, treat the
  // second tap as "dismiss" so users can back out without acting.
  const onPointerDown = useCallback(
    (p: ImagePoint, e: React.PointerEvent<HTMLDivElement>) => {
      if (tap) {
        setTap(null);
        return;
      }
      if (!p.inside) return;
      // Capture both image-space and screen-space so the chips paint
      // at the click point. Using clientX/Y from the React event is
      // fine — it's already in viewport coords, which is what the
      // chip absolute-positioning math expects. Classification happens
      // live at render time (see `context` below) so late-arriving
      // detections aren't frozen out.
      setTap({ ix: p.x, iy: p.y, sx: e.clientX, sy: e.clientY });
    },
    [tap],
  );

  // Image-space → screen-space sync. The tap stores its initial
  // screen coords, but if the user pans/zooms after tapping the
  // chips would drift. paintOverlay runs every render and gives us
  // the live Transform — we recompute the screen coords from the
  // image-space tap and update state if they've moved more than a
  // pixel.
  const paintOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      if (!tap) return;
      const sx = t.ox + tap.ix * t.scale;
      const sy = t.oy + tap.iy * t.scale;
      if (Math.abs(sx - tap.sx) > 1 || Math.abs(sy - tap.sy) > 1) {
        setTap((prev) => (prev ? { ...prev, sx, sy } : prev));
      }

      // Tap marker — a small coral target at the exact tapped pixel so
      // the user can see what they're acting on. Matters most for Spot
      // heal (a precise point) and to disambiguate which face/subject a
      // tap landed on. White rings keep it legible on any background.
      const CORAL = "245, 97, 58";
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${CORAL}, 0.5)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${CORAL}, 0.95)`;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.stroke();
      ctx.restore();
    },
    [tap],
  );

  useStageProps({
    onImagePointerDown: onPointerDown,
    paintOverlay,
    cursor: "crosshair",
  });

  // Escape dismisses the chip menu — it's a modal, so the key should
  // back out of it without acting, same as the second-tap gesture.
  useEffect(() => {
    if (!tap) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTap(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap]);

  // Keep the chip menu on-screen. It's positioned at the tap point and
  // pulled up/left by its own size (translate -50% / -100%), so a tap
  // near the top or side edge would clip it off the viewport. We
  // measure from the *unclamped* anchor (offsetWidth/Height are immune
  // to the transform, so this can't feed back into itself) and nudge it
  // back inside with an 8px margin. Runs every render so chip-count
  // changes re-measure; the equality guard makes that a no-op when the
  // offset is unchanged.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !tap) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const m = 8;
    const anchorX = tap.sx;
    const anchorY = tap.sy - 12;
    let dx = 0;
    let dy = 0;
    const left = anchorX - w / 2;
    const right = anchorX + w / 2;
    if (left < m) dx = m - left;
    else if (right > window.innerWidth - m) dx = window.innerWidth - m - right;
    const top = anchorY - h;
    const bottom = anchorY;
    if (top < m) dy = m - top;
    else if (bottom > window.innerHeight - m) dy = window.innerHeight - m - bottom;
    setClamp((prev) => (prev.dx === dx && prev.dy === dy ? prev : { dx, dy }));
  });

  if (!tap || !doc) return null;

  // Classify the tap live, every render, from the stored image-space
  // point — so detections that finish after the tap (face box / subject
  // mask computed by another tool while the chips are open) upgrade the
  // chip set instead of being frozen out.
  const context = classify({ x: tap.ix, y: tap.iy, inside: true });

  // Build the chip set based on what's at the tap point. All actions
  // operate on doc.working directly via existing utilities — no new
  // pixel pipelines are introduced; this tool is purely a dispatcher
  // with smart targeting.
  const chips: { label: string; icon: React.ReactNode; run: () => void }[] = [];

  // Spot heal is offered in every context — faces are the most common
  // place users want to retouch (blemishes, stray hairs), so it sits
  // alongside the anonymize verbs there too. Hands off to the manual
  // Spot heal brush, which owns the radius control the launcher can't
  // infer.
  const spotHealChip = {
    label: "Spot heal here",
    icon: <I.Eraser size={12} />,
    run: () => {
      // Carry the exact tap point so Spot heal opens with its brush ring
      // already parked on the blemish the user pointed at, instead of
      // dropping them into the tool with no target.
      patchTool("spotHealSeed", { x: tap.ix, y: tap.iy });
      setActiveTool("spot");
      setTap(null);
    },
  };

  if (context.kind === "face") {
    const box = context.box;
    chips.push({
      label: "Pixelate face",
      icon: <I.EyeOff size={12} />,
      run: () => {
        const padded = padFaceBox(box, 0.15, doc.working.width, doc.working.height);
        runAndCommit("Pixelate face", () => {
          applyRedaction(
            doc.working,
            { x: padded.x, y: padded.y, w: padded.width, h: padded.height },
            { style: 0 as RedactStyle, strength: 0.5, feather: 0.1 },
          );
        });
      },
    });
    chips.push({
      label: "Blur face",
      icon: <I.Focus size={12} />,
      run: () => {
        const padded = padFaceBox(box, 0.15, doc.working.width, doc.working.height);
        runAndCommit("Blur face", () => {
          applyRedaction(
            doc.working,
            { x: padded.x, y: padded.y, w: padded.width, h: padded.height },
            { style: 1 as RedactStyle, strength: 0.5, feather: 0.1 },
          );
        });
      },
    });
    chips.push(spotHealChip);
  } else if (context.kind === "subject") {
    chips.push({
      label: "Remove background",
      icon: <I.Layers size={12} />,
      run: () => {
        // Hand off to the Remove BG tool — it owns the canonical
        // U²-Net composite path. Tap-to-fix is a launcher here, not
        // a re-implementer. The user's mask is already cached so
        // the receiving tool's Apply is instant.
        setActiveTool("bgrm");
        setTap(null);
      },
    });
    chips.push({
      label: "Pixelate subject",
      icon: <I.EyeOff size={12} />,
      run: () => {
        // Hand off to Redact's Smart anonymize Person — same
        // rationale: don't re-implement the smart-anonymize
        // pipeline here. Setting the active tool drops the user
        // into the panel one click away from Apply.
        setActiveTool("redact");
        setTap(null);
      },
    });
  } else {
    chips.push(spotHealChip);
  }

  // Chip menu — absolutely positioned at the tap point. Offset up
  // slightly so the chips don't sit directly under the finger; on
  // touch this is the difference between "tappable" and "covered."
  return (
    <div
      ref={menuRef}
      role="dialog"
      aria-label="Tap-to-fix actions"
      className="pointer-events-auto fixed z-50 flex gap-1.5 rounded-md border border-border-soft bg-surface px-1.5 py-1 shadow-[0_8px_22px_-6px_rgba(0,0,0,0.18)]"
      style={{
        left: tap.sx,
        top: tap.sy - 12,
        transform: `translate(calc(-50% + ${clamp.dx}px), calc(-100% + ${clamp.dy}px))`,
      }}
      data-testid="tapfix-chips"
    >
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={chip.run}
          className="flex cursor-pointer items-center gap-1 rounded-md border-none bg-coral-50 px-2 py-1 text-[11px] font-semibold text-coral-700 transition-colors hover:bg-coral-100 dark:bg-coral-900/30 dark:text-coral-300"
        >
          {chip.icon}
          {chip.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setTap(null)}
        title="Dismiss"
        aria-label="Dismiss tap-to-fix"
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-none bg-page-bg p-0 text-text-muted hover:bg-page-bg/60"
      >
        <I.X size={11} />
      </button>
    </div>
  );
}
