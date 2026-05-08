// RedactPanel.tsx — Mode (Rect / Brush), style (Pixelate / Blur /
// Solid), strength, brush size, and edge feather. The actual paint
// pipeline for manual rect / brush redaction lives in RedactTool.tsx.
//
// In addition to the manual modes, the panel exposes two **Smart
// anonymize** actions:
//
//   • Anonymize person  — apply the chosen style (pixelate / blur /
//     solid) to the detected subject only. Background stays sharp.
//   • Anonymize scene   — invert: keep the subject sharp, redact the
//     background. Useful when the subject is the legitimate content
//     of the photo and the surroundings (license plates, screen
//     contents, faces in the crowd) need scrubbing.
//
// Both actions route through the central subject-mask service, so
// detection runs once across the whole editor — picking Subject in
// Adjust earlier means these buttons are instantaneous here.

import { useCallback, useState } from "react";
import { I } from "../../components/icons";
import { InlineSpinner, PropRow, Segment, Slider } from "../atoms";
import { acquireCanvas, copyInto, releaseCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import { applyMaskScope, MaskConsentError, type MaskScope } from "../ai/subjectMask";
import { SmartActionError } from "../ai/ui/SmartActionError";
import { useSubjectMask } from "../ai/useSubjectMask";
import { applyRedaction, type RedactStyle } from "./redact";

const STYLE_LABELS = ["Pixelate", "Blur", "Solid"] as const;

export function RedactPanel() {
  const { toolState, patchTool, doc, commit } = useEditor();
  const subjectMask = useSubjectMask();
  const [smartBusy, setSmartBusy] = useState<null | "subject" | "background">(null);
  const [smartError, setSmartError] = useState<string | null>(null);
  const isBrush = toolState.redactMode === 1;

  const styleLabel = STYLE_LABELS[toolState.redactStyle as RedactStyle] ?? "Pixelate";

  const smartAnonymize = useCallback(
    async (scope: MaskScope) => {
      if (!doc) return;
      if (scope === 0) return;
      setSmartError(null);
      setSmartBusy(scope === 1 ? "subject" : "background");
      // Track the canvases we acquire here so the `finally` block can
      // release them on every exit path (success, throw, or silent
      // abort on mid-bake invalidation). Without this, an early
      // return from the abort path leaks pooled canvases.
      let full: HTMLCanvasElement | null = null;
      let composed: HTMLCanvasElement | null = null;
      // Yield to the browser's render cycle. Each call gives the
      // browser a frame to paint and to fire any queued events. We
      // sprinkle these between the bake's heavy phases so the spinner
      // animates and pinch-zoom / scroll stays responsive on mobile
      // instead of the whole sequence being one big main-thread
      // freeze.
      const yieldFrame = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        // Smart anonymize is user-initiated; clear any prior dismiss
        // latch via requestExplicit so the consent dialog re-opens
        // instead of the button silently no-op'ing. We don't use the
        // returned mask directly — we re-peek after the yields below
        // so a mid-bake invalidation (replaceWithFile, quality
        // change) is observed before we composite.
        if (!subjectMask.peek()) await subjectMask.requestExplicit();
        // First yield: lets the spinner state we just set paint
        // before we start the synchronous bake. On the warm-cache
        // path there's no `await` above to break us out of the click
        // microtask, so without this the spinner only appears AFTER
        // the bake.
        await yieldFrame();

        // Stage 1: snapshot the working canvas into our own buffer.
        full = acquireCanvas(doc.working.width, doc.working.height);
        const ctx = full.getContext("2d");
        if (!ctx) throw new Error("Couldn't get 2D context for redaction");
        ctx.drawImage(doc.working, 0, 0);
        await yieldFrame();

        // Stage 2: apply the chosen redaction style to the snapshot.
        // This is the slowest single phase (100–300 ms on a 24 MP
        // photo). Yielding before / after ensures the freeze is
        // bracketed by paint opportunities.
        applyRedaction(
          full,
          { x: 0, y: 0, w: full.width, h: full.height },
          {
            style: toolState.redactStyle as RedactStyle,
            strength: toolState.redactStrength,
            // No edge feathering at the canvas border — we want the
            // redaction to fill the entire side; the mask edge does
            // its own anti-aliasing where it transitions in / out.
            feather: 0,
          },
        );
        await yieldFrame();

        // Stage 3: mask-scope composite. Critical: re-peek the mask
        // here. During the yields above the central cache could have
        // been invalidated (replaceWithFile, resetToOriginal, or a
        // quality-tier change). A stale reference would point to a
        // canvas that's been released back to the pool and possibly
        // reallocated to another caller — compositing against it
        // would produce a corrupt result. Aborting silently is the
        // correct response to the user's explicit invalidation.
        const liveMask = subjectMask.peek();
        if (!liveMask) return;
        composed = applyMaskScope(doc.working, full, liveMask, scope);
        await yieldFrame();

        // Stage 4: bake into doc.working and commit.
        copyInto(doc.working, composed);
        commit(scope === 1 ? "Anonymize subject" : "Anonymize scene");
      } catch (err) {
        // Consent dialog handles the "user hasn't agreed yet" path —
        // don't double up by showing a coral error chip below the
        // smart buttons.
        if (err instanceof MaskConsentError) return;
        setSmartError(err instanceof Error ? err.message : "Couldn't detect subject.");
      } finally {
        if (composed && composed !== full) releaseCanvas(composed);
        if (full) releaseCanvas(full);
        setSmartBusy(null);
      }
    },
    [commit, doc, subjectMask, toolState.redactStrength, toolState.redactStyle],
  );

  return (
    <>
      {/* Smart anonymize — sits at the top because for the brand's
          core use case ("redact a screenshot, then export"), this is
          the one tap the user wants. The manual Rect / Brush
          controls below stay for fine-grained work. Two paired
          buttons rather than a hidden toggle so both options are one
          tap from the same surface. */}
      <PropRow label="Smart anonymize">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => void smartAnonymize(1)}
            disabled={smartBusy !== null}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-soft bg-page-bg px-2 py-2 font-[inherit] text-[11.5px] font-semibold text-text dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text"
            style={{ opacity: smartBusy ? 0.7 : 1 }}
          >
            {smartBusy === "subject" ? (
              <>
                <InlineSpinner size={12} /> Working…
              </>
            ) : (
              <>
                <I.Sparkles size={12} className="text-coral-500 dark:text-coral-400" /> Person
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => void smartAnonymize(2)}
            disabled={smartBusy !== null}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-soft bg-page-bg px-2 py-2 font-[inherit] text-[11.5px] font-semibold text-text dark:border-dark-border-soft dark:bg-dark-page-bg dark:text-dark-text"
            style={{ opacity: smartBusy ? 0.7 : 1 }}
          >
            {smartBusy === "background" ? (
              <>
                <InlineSpinner size={12} /> Working…
              </>
            ) : (
              <>
                <I.Sparkles size={12} className="text-coral-500 dark:text-coral-400" /> Scene
              </>
            )}
          </button>
        </div>
      </PropRow>
      <SmartActionError message={smartError} onDismiss={() => setSmartError(null)} />
      <div className="text-[11px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Person scrubs the detected subject with the selected style; Scene scrubs everything except
        the subject. Detection runs locally — your image never leaves this device.
      </div>

      <div className="my-1 h-px bg-border-soft dark:bg-dark-border-soft" />

      <PropRow label="Mode">
        <Segment
          options={["Rect", "Brush"]}
          active={toolState.redactMode}
          onChange={(i) => patchTool("redactMode", i)}
        />
      </PropRow>
      <PropRow label="Style">
        <Segment
          options={STYLE_LABELS}
          active={toolState.redactStyle}
          onChange={(i) => patchTool("redactStyle", i)}
        />
      </PropRow>
      <PropRow label="Strength" value={`${Math.round(toolState.redactStrength * 30)} px`}>
        <Slider
          value={toolState.redactStrength}
          accent
          defaultValue={0.5}
          onChange={(v) => patchTool("redactStrength", v)}
        />
      </PropRow>
      <PropRow label="Brush size" value={`${Math.round(toolState.brushSize * 100)} px`}>
        <Slider
          value={toolState.brushSize}
          defaultValue={0.32}
          onChange={(v) => patchTool("brushSize", v)}
        />
      </PropRow>
      <PropRow label="Edge feather" value={`${Math.round(toolState.feather * 30)} px`}>
        <Slider
          value={toolState.feather}
          defaultValue={0.2}
          onChange={(v) => patchTool("feather", v)}
        />
      </PropRow>
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        {isBrush
          ? `Drag along the canvas to paint ${styleLabel.toLowerCase()} redactions.`
          : `Drag a rectangle on the image to ${styleLabel.toLowerCase()} the region.`}
      </div>
    </>
  );
}
