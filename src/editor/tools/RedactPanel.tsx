// RedactPanel.tsx — Mode (Rect / Brush), style (Pixelate / Blur /
// Solid), strength, brush size, and edge feather. The actual paint
// pipeline for manual rect / brush redaction lives in RedactTool.tsx.
//
// Above the manual modes the panel exposes a **Smart anonymize**
// section with one mutually-exclusive picker:
//
//   • Person — pixelate / blur / solid the detected subject silhouette.
//   • Faces  — pixelate / blur / solid every detected face individually.
//
// Mutually exclusive: tapping one undoes the other before applying.
// The user picks "what counts as the redaction target" once, and
// switching the target replaces the previous bake instead of stacking.
// (We previously had a third "Scene" option that inverted Person —
// removed because it's a niche use case that's better served by the
// manual Brush mode and was confusing the picker.)

import { useCallback, useState } from "react";
import { I } from "../../components/icons";
import { InlineSpinner, PropRow, Segment, Slider } from "../atoms";
import { acquireCanvas, copyInto, releaseCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import { applyMaskScope, MaskConsentError } from "../ai/subjectMask";
import { CapabilityConsentError } from "../ai/capability/service";
import { padFaceBox } from "../ai/capabilities/detect-face/geometry";
import { useDetectFaces } from "../ai/capabilities/detect-face/hook";
import { MaskReadyPill } from "../ai/ui/MaskReadyPill";
import { SmartActionError } from "../ai/ui/SmartActionError";
import { useSubjectMask } from "../ai/useSubjectMask";
import { applyRedaction, type RedactStyle } from "./redact";

const STYLE_LABELS = ["Pixelate", "Blur", "Solid"] as const;

/** Detect whether the last committed history entry was one of our smart
 *  anonymize bakes. Used to decide if a switch (Person → Faces or
 *  vice-versa) should undo the previous bake first so the two never
 *  stack. Pinned to the exact label format the smart-action handlers
 *  emit; if you rename a label, update this. */
function isSmartAnonymizeLabel(label: string | null): boolean {
  if (!label) return false;
  return /^Anonymize (subject|\d+ faces?)$/.test(label);
}

/** How much to expand each detected face box outward before applying
 *  the redaction style. Detector bboxes are tight to the visible face;
 *  hairline / chin / ears can sit a few percent outside. 15 % of the
 *  box dimension on each side covers all four edges without bleeding
 *  noticeably onto neighbouring content. */
const FACE_PAD_FRACTION = 0.15;
/** Soft-edge feather so the per-face redaction doesn't read as a hard
 *  rectangle stamped on the photo. Small enough that the face
 *  underneath isn't recognisable through the falloff. */
const FACE_FEATHER = 0.1;

export function RedactPanel() {
  const { toolState, patchTool, doc, commit, peekLastCommitLabel, undo } = useEditor();
  const subjectMask = useSubjectMask();
  const faces = useDetectFaces();
  const [smartBusy, setSmartBusy] = useState<null | "person" | "faces">(null);
  const [smartError, setSmartError] = useState<string | null>(null);
  const isBrush = toolState.redactMode === 1;

  const styleLabel = STYLE_LABELS[toolState.redactStyle as RedactStyle] ?? "Pixelate";

  /** If the last commit was the OTHER smart-anonymize kind, revert it
   *  first so picking Person / Faces is a true switch (not a stack).
   *  Returns the label it replaced (or null) so the calling action
   *  can log / count. */
  const replaceIfSwitching = useCallback(
    async (newKind: "person" | "faces") => {
      const last = peekLastCommitLabel();
      if (!isSmartAnonymizeLabel(last)) return null;
      // Person commits with the literal "Anonymize subject" label;
      // Faces commits "Anonymize N face[s]". Match on that to know
      // which side the previous entry was.
      const wasFaces = /face/i.test(last ?? "");
      const wasPerson = /subject/i.test(last ?? "");
      const switching = (newKind === "person" && wasFaces) || (newKind === "faces" && wasPerson);
      if (!switching) return null;
      await undo();
      return last;
    },
    [peekLastCommitLabel, undo],
  );

  const smartAnonymizePerson = useCallback(async () => {
    if (!doc) return;
    setSmartError(null);
    setSmartBusy("person");
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
    const yieldFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      // Mutually-exclusive: if Faces was the last bake, undo it so
      // the new Person bake replaces it instead of stacking. Done
      // BEFORE the consent / detection so the subject mask runs
      // against the original pixels (faster, more accurate).
      await replaceIfSwitching("person");
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
      // would produce a corrupt result.
      //
      // Surface the abort via the shared error chip rather than
      // returning silently: the previous behaviour made Smart
      // Anonymize look like a no-op button when a tier change
      // raced with the bake (the spinner cleared, no commit, no
      // explanation). One sentence is friendlier than nothing.
      const liveMask = subjectMask.peek();
      if (!liveMask) {
        setSmartError(
          "Smart Anonymize cancelled — the subject mask was invalidated mid-bake. Try again.",
        );
        return;
      }
      // Scope 1 = subject (paint the redaction over the person,
      // keep the background sharp). The inverse "scene" scope was
      // removed from this picker — manual Brush mode handles the
      // rare case where the user wants to scrub the surroundings.
      composed = applyMaskScope(doc.working, full, liveMask, 1);
      await yieldFrame();

      // Stage 4: bake into doc.working and commit.
      copyInto(doc.working, composed);
      commit("Anonymize subject");
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
  }, [
    commit,
    doc,
    replaceIfSwitching,
    subjectMask,
    toolState.redactStrength,
    toolState.redactStyle,
  ]);

  const smartAnonymizeFaces = useCallback(async () => {
    if (!doc) return;
    setSmartError(null);
    setSmartBusy("faces");
    const yieldFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      // Mutually-exclusive: undo a prior Person bake so Faces replaces
      // it. Done before the consent / detection so face detection runs
      // against the original pixels, not over a Person-redacted body.
      await replaceIfSwitching("faces");
      // Yield once so the spinner state we just set paints before the
      // synchronous redaction loop starts.
      await yieldFrame();

      // requestExplicit clears any prior dismiss latch — clicking
      // "Faces" is the user's affirmative "yes I want this" signal.
      // The first call surfaces the consent dialog via the host;
      // requestExplicit awaits across that flow so we don't bounce
      // the user with a "tap again" UX.
      const detected = faces.peek() ?? (await faces.requestExplicit());
      await yieldFrame();

      if (detected.length === 0) {
        setSmartError(
          "No faces detected in this image. Try a clearer photo, or use the manual Rect / Brush mode below.",
        );
        return;
      }

      // Apply the chosen redaction style to each face individually.
      // Padding expands each box ~15 % outward so hairline / chin
      // pixels are covered; feather softens the edges. Each call
      // mutates doc.working in place, which is fine: the per-face
      // rects are independent regions, and even when boxes overlap
      // the second pass still lands valid redacted pixels.
      const style = toolState.redactStyle as RedactStyle;
      const strength = toolState.redactStrength;
      for (const face of detected) {
        const padded = padFaceBox(face, FACE_PAD_FRACTION, doc.working.width, doc.working.height);
        applyRedaction(
          doc.working,
          { x: padded.x, y: padded.y, w: padded.width, h: padded.height },
          { style, strength, feather: FACE_FEATHER },
        );
      }
      await yieldFrame();

      commit(`Anonymize ${detected.length} face${detected.length === 1 ? "" : "s"}`);
    } catch (err) {
      // Consent dialog handles the "user hasn't agreed yet" path —
      // don't double up by showing the error chip below the buttons.
      if (err instanceof CapabilityConsentError) return;
      setSmartError(err instanceof Error ? err.message : "Couldn't detect faces.");
    } finally {
      setSmartBusy(null);
    }
  }, [commit, doc, faces, replaceIfSwitching, toolState.redactStrength, toolState.redactStyle]);

  return (
    <>
      {/* Smart anonymize — Person and Faces are mutually exclusive.
          Tapping one applies that bake; tapping the OTHER reverts the
          previous bake first (`replaceIfSwitching`) and applies the
          new one. The "active" border highlights whichever bake is
          currently the last commit so the user can see at a glance
          what's applied without scanning the canvas. */}
      <MaskReadyPill ready={!!subjectMask.peek()} align="end" />
      <PropRow label="Smart anonymize">
        <div className="grid grid-cols-2 gap-1.5">
          <SmartAnonymizeButton
            label="Person"
            description="Whole body silhouette"
            active={
              isSmartAnonymizeLabel(peekLastCommitLabel()) &&
              /subject/i.test(peekLastCommitLabel() ?? "")
            }
            busy={smartBusy === "person"}
            disabled={smartBusy !== null}
            onClick={() => void smartAnonymizePerson()}
          />
          {/* Faces uses a different model (MediaPipe BlazeFace
              full-range, ~1 MB) and produces per-face rects instead of
              the whole-subject mask. The mutually-exclusive contract
              is enforced inside the click handler via
              `replaceIfSwitching`. */}
          <SmartAnonymizeButton
            label="Faces"
            description="Each face individually"
            active={
              isSmartAnonymizeLabel(peekLastCommitLabel()) &&
              /face/i.test(peekLastCommitLabel() ?? "")
            }
            busy={smartBusy === "faces"}
            disabled={smartBusy !== null}
            onClick={() => void smartAnonymizeFaces()}
          />
        </div>
      </PropRow>
      <SmartActionError message={smartError} onDismiss={() => setSmartError(null)} />
      <div className="text-[11px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Pick one: Person redacts the whole subject silhouette; Faces redacts each detected face
        individually. Switching from one to the other replaces the previous bake. Detection runs
        locally — your image never leaves this device.
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

interface SmartAnonymizeButtonProps {
  label: string;
  description: string;
  /** True iff this kind is the currently-applied bake. Drives the
   *  active border + filled icon so the user sees at a glance which
   *  smart-anonymize is on without scanning the canvas. */
  active: boolean;
  /** True while THIS button's smart action is mid-flight. */
  busy: boolean;
  /** True while ANY smart action (this one or the sibling) is busy —
   *  prevents double-clicks across the picker. */
  disabled: boolean;
  onClick: () => void;
}

function SmartAnonymizeButton({
  label,
  description,
  active,
  busy,
  disabled,
  onClick,
}: SmartAnonymizeButtonProps) {
  // Active state uses the coral border (same as the consent dialog's
  // selected tier row). Inactive uses the soft border so the picker
  // reads as a single segmented control rather than two unrelated
  // buttons.
  const borderClass = active
    ? "border-coral-500 ring-2 ring-coral-500/30"
    : "border-border-soft dark:border-dark-border-soft";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex cursor-pointer flex-col items-stretch gap-0.5 rounded-md border bg-page-bg px-2.5 py-2 text-left font-[inherit] dark:bg-dark-page-bg ${borderClass}`}
      style={{ opacity: disabled && !busy ? 0.6 : 1 }}
    >
      <div className="flex items-center justify-between gap-2 text-[12px] font-semibold text-text dark:text-dark-text">
        <span className="flex items-center gap-1.5">
          {busy ? (
            <InlineSpinner size={12} />
          ) : (
            <I.Sparkles
              size={12}
              className={
                active
                  ? "fill-coral-500 text-coral-500 dark:fill-coral-400 dark:text-coral-400"
                  : "text-coral-500 dark:text-coral-400"
              }
            />
          )}
          {busy ? "Working…" : label}
        </span>
        {active && !busy && (
          <I.Check size={12} className="text-coral-500 dark:text-coral-400" aria-hidden />
        )}
      </div>
      <span className="text-[10.5px] leading-snug text-text-muted dark:text-dark-text-muted">
        {description}
      </span>
    </button>
  );
}
