// PrivacyAuditCard.tsx — Pre-export "what your image leaks" review.
// Renders inside the Export modal above the format/quality controls.
// Surfaces two classes of finding:
//
//   1. Visible content — faces detected by the on-device BlazeFace
//      model. One-tap "Blur all" applies a Blur redaction over every
//      detected face's padded bbox and commits to history (so it's
//      undoable after the user closes the export).
//
//   2. Metadata leaks — GPS coordinates baked into the EXIF. Surfaces
//      a one-tap "Strip GPS" that flips the existing `stripGPS`
//      metaToggle to true so the export pipeline excludes it.
//
// Findings appear conditionally — a clean image renders a single
// "Looks good" line and stays out of the way. Lightroom doesn't ship
// anything like this; CloakIMG positions it as the brand-defining
// safety net: "we won't let you accidentally publish your house
// number / kid's face."
//
// Face detection is opt-in via the existing consent flow. The card
// shows a "Scan for faces" button when nothing's been detected yet so
// the user actively triggers inference — privacy-first by design,
// matching the rest of the AI subsystem.

import { useCallback, useState } from "react";
import { I } from "../components/icons";
import { useEditor } from "./EditorContext";
import { useDetectFaces } from "./ai/capabilities/detect-face/hook";
import { padFaceBox } from "./ai/capabilities/detect-face/geometry";
import { applyRedaction } from "./tools/redact";
import type { MetaToggles } from "./toolState";

interface Props {
  /** Whether `stripGPS` is currently checked in the meta-toggles. The
   *  audit reads this to decide whether GPS is genuinely a finding
   *  (we don't nag once the user has already chosen to strip). */
  stripGPS: boolean;
  /** Patch a metaToggle from the audit's one-tap fix. */
  onPatchMeta: (next: Partial<MetaToggles>) => void;
}

const FACE_PAD = 0.15;
const FACE_FEATHER = 0.1;
const BLUR_STRENGTH = 0.6;

export function PrivacyAuditCard({ stripGPS, onPatchMeta }: Props) {
  const { doc, commit, runBusy } = useEditor();
  const faces = useDetectFaces();
  const [scanning, setScanning] = useState(false);

  // Findings derived in render — cheap (no allocation beyond the
  // returned tuple), so we don't bother memoising.
  const detected = faces.peek();
  const faceCount = detected?.length ?? 0;
  const facesScanned = detected !== null;
  const hasGPS = !!doc?.exif?.GPS && !stripGPS;
  // Show a "looks good" state ONLY when we've actually checked
  // everything — i.e. faces have been scanned AND GPS is either
  // absent or already stripped. Otherwise the card stays in
  // "scan?" mode so we don't falsely reassure the user.
  const auditComplete = facesScanned && faceCount === 0 && !hasGPS;
  const auditClean = auditComplete;

  const scan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      // requestExplicit clears any prior dismiss latch — clicking
      // "Scan for faces" is an explicit affirmative, mirroring the
      // Smart Anonymize / Tap-to-Fix entry points.
      await faces.requestExplicit();
    } catch {
      // Consent denial / detection failure surfaces via the host
      // dialog or the service's error state. Nothing to do here —
      // the card will simply continue showing "Scan for faces"
      // because faces.peek() stays null.
    } finally {
      setScanning(false);
    }
  }, [faces, scanning]);

  const blurAllFaces = useCallback(() => {
    if (!doc || !detected || detected.length === 0) return;
    void runBusy(`Blurring ${detected.length} face${detected.length === 1 ? "" : "s"}…`, () => {
      for (const face of detected) {
        const padded = padFaceBox(face, FACE_PAD, doc.working.width, doc.working.height);
        applyRedaction(
          doc.working,
          { x: padded.x, y: padded.y, w: padded.width, h: padded.height },
          { style: 1, strength: BLUR_STRENGTH, feather: FACE_FEATHER },
        );
      }
      commit(`Blur ${detected.length} face${detected.length === 1 ? "" : "s"}`);
      // Faces are now blurred in the doc; the detection cache is
      // stale (it points at boxes whose pixels are no longer faces).
      // Invalidate so a subsequent scan re-runs against the current
      // pixels.
      faces.invalidate();
    });
  }, [commit, detected, doc, faces, runBusy]);

  const stripGPSNow = useCallback(() => {
    onPatchMeta({ stripGPS: true });
  }, [onPatchMeta]);

  return (
    <div
      role="region"
      aria-label="Privacy review"
      data-testid="privacy-audit"
      className="flex flex-col gap-2 rounded-lg border border-coral-200/70 bg-coral-50/40 px-3 py-2.5 dark:border-coral-500/30 dark:bg-coral-900/15"
    >
      <div className="flex items-center gap-1.5">
        <I.Shield size={13} className="text-coral-600 dark:text-coral-300" />
        <span className="t-section-label tracking-[0.05em] text-coral-700 dark:text-coral-300">
          Privacy review
        </span>
      </div>

      {/* Findings — each row is conditional. When everything passes
          we collapse to a single "Looks good" row. */}
      {auditClean ? (
        <Finding icon={<I.Check size={12} stroke={2.5} />} tone="ok">
          Nothing sensitive detected — safe to export.
        </Finding>
      ) : (
        <>
          {/* Faces */}
          {!facesScanned && (
            <Finding icon={<I.Eye size={12} />} tone="info">
              <span className="flex-1">
                Faces haven't been checked yet. Scan locally to see if any are visible.
              </span>
              <Action onClick={scan} disabled={scanning} label={scanning ? "Scanning…" : "Scan"} />
            </Finding>
          )}
          {facesScanned && faceCount > 0 && (
            <Finding icon={<I.EyeOff size={12} />} tone="warn">
              <span className="flex-1">
                {faceCount} face{faceCount === 1 ? "" : "s"} visible.
              </span>
              <Action onClick={blurAllFaces} label="Blur all" />
            </Finding>
          )}
          {facesScanned && faceCount === 0 && (
            <Finding icon={<I.Check size={12} stroke={2.5} />} tone="ok">
              No faces detected.
            </Finding>
          )}

          {/* GPS */}
          {hasGPS && (
            <Finding icon={<I.Triangle size={12} />} tone="warn">
              <span className="flex-1">GPS coordinates embedded in this image's metadata.</span>
              <Action onClick={stripGPSNow} label="Strip GPS" />
            </Finding>
          )}
          {!hasGPS && !facesScanned && (
            <Finding icon={<I.Check size={12} stroke={2.5} />} tone="ok">
              No GPS in metadata.
            </Finding>
          )}
        </>
      )}
    </div>
  );
}

interface FindingProps {
  icon: React.ReactNode;
  tone: "ok" | "warn" | "info";
  children: React.ReactNode;
}
/** A single audit-row finding — icon + body + optional action. The
 *  tone drives the icon's colour so the user can scan the card
 *  vertically and pick up which lines need their attention. */
function Finding({ icon, tone, children }: FindingProps) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "warn"
        ? "text-coral-700 dark:text-coral-300"
        : "text-text-muted";
  return (
    <div className="flex items-center gap-2 text-[12px] leading-snug text-text">
      <span className={`shrink-0 ${toneClass}`}>{icon}</span>
      {children}
    </div>
  );
}

interface ActionProps {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}
/** Compact "do something about it" button — visual weight tuned to
 *  fit inside a single Finding row without dominating the body text. */
function Action({ onClick, label, disabled }: ActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ml-auto cursor-pointer rounded-md border-none bg-coral-500 px-2 py-1 font-[inherit] text-[11px] font-semibold text-white transition-colors hover:bg-coral-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
