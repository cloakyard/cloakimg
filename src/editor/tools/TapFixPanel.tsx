// TapFixPanel.tsx — Lightweight intro card for the Tap-to-Fix tool.
// The real interaction happens on the canvas (TapFixTool); this panel
// just sets expectations and surfaces a "warm up the AI" button so
// users who want instant tap response can prime the models before
// they start clicking.
//
// Kept deliberately minimal: every line of UI here is a line of UI
// competing with the tool's "tap anything" promise. The user should
// read the panel once, look at the canvas, and not need to come back.

import { I } from "../../components/icons";
import { useEditor } from "../EditorContext";
import { useDetectFaces } from "../ai/capabilities/detect-face/hook";
import { useSubjectMask } from "../ai/useSubjectMask";

export function TapFixPanel() {
  const { doc } = useEditor();
  const subjectMask = useSubjectMask();
  const faces = useDetectFaces();
  const subjectReady = !!subjectMask.peek();
  const facesReady = !!faces.peek();

  const primeAll = () => {
    // Fire-and-forget — the services return cached values instantly
    // when the work is already done, and the user is on the panel so
    // any consent modals land in front of them.
    if (!subjectReady) void subjectMask.requestExplicit().catch(() => undefined);
    if (!facesReady) void faces.requestExplicit().catch(() => undefined);
  };

  return (
    <>
      <div className="flex items-start gap-2 rounded-lg border border-coral-200/70 bg-coral-50/60 px-3 py-2.5 dark:border-coral-500/30 dark:bg-coral-900/15">
        <I.Wand size={14} className="mt-0.5 shrink-0 text-coral-600 dark:text-coral-300" />
        <div className="flex-1 text-[12px] leading-relaxed text-text">
          <div className="font-semibold">Tap anything on the photo.</div>
          <div className="mt-1 text-text-muted">
            CloakIMG figures out what you tapped and offers 2–3 things to do with it. Tap a face →
            redact options. Tap the subject → background tools. Tap anywhere else → spot heal.
          </div>
        </div>
      </div>

      {/* Readiness chips. Each capability flips green once the model
          has run on this image — gives the user a glance at how
          smart the next tap will be. Faces is independent of
          subject so both can be ready or not in any combination. */}
      <div className="flex items-center gap-1.5">
        <ReadinessChip label="Faces detected" ready={facesReady} />
        <ReadinessChip label="Subject mapped" ready={subjectReady} />
      </div>

      {!doc ? null : (
        <button
          type="button"
          onClick={primeAll}
          disabled={facesReady && subjectReady}
          className="btn btn-secondary btn-sm justify-center"
          style={{ opacity: facesReady && subjectReady ? 0.5 : 1 }}
        >
          <I.Sparkles size={12} />
          {facesReady && subjectReady ? "AI ready" : "Warm up AI"}
        </button>
      )}

      <div className="text-[11.5px] leading-relaxed text-text-muted">
        Warming up runs both models on this image once so the next tap is instant. You can also just
        tap — the models run on demand the first time you need them.
      </div>
    </>
  );
}

function ReadinessChip({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10.5px] font-semibold ${
        ready
          ? "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-200"
          : "border-border-soft bg-page-bg text-text-muted"
      }`}
    >
      <I.Check size={9} stroke={2.5} className={ready ? "" : "opacity-30"} />
      {label}
    </span>
  );
}
