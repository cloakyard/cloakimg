// HistoryScrubber.tsx — Visual timeline of every history entry below
// the canvas. Each thumbnail is a clickable "jump here" pin so the
// user can scrub through their edits the way they'd scrub through a
// video, instead of mashing Cmd-Z and counting steps. Photoshop's
// History panel is a list of words; this is a list of pixels.
//
// Hidden on mobile: the surface there is already short on vertical
// pixels (canvas + bottom sheet), and the linear undo/redo affordance
// inside the morphing sheet covers the common case. Desktop+tablet
// get the full timeline.
//
// Hidden too when there's just the base ("Open") entry — nothing to
// scrub yet, so the strip would only consume vertical canvas space
// without giving the user anything actionable.

import { useEffect, useRef, useState } from "react";
import { useEditorActions, useEditorReadOnly } from "./EditorContext";

const THUMB_PX = 30;

export function HistoryScrubber() {
  // Read-only + actions slices only (no tool state) so the scrubber
  // doesn't re-render on every slider tick.
  const { historyVersion, layout } = useEditorReadOnly();
  const { historyEntries, jumpToStep, historyDepth } = useEditorActions();

  // `historyVersion` drives a re-snapshot of the entries array. The
  // accessor itself is stable identity — the re-render trigger is the
  // version counter, not the array reference. Keep snapshot in
  // useState so the dependency on `historyVersion` is explicit and
  // React DevTools shows the value sensibly during debugging.
  const [snapshot, setSnapshot] = useState(() => historyEntries());
  const [cursor, setCursor] = useState(() => historyDepth());
  useEffect(() => {
    setSnapshot(historyEntries());
    setCursor(historyDepth());
  }, [historyVersion, historyEntries, historyDepth]);

  // Auto-scroll the active thumb into view when the cursor moves —
  // otherwise on a deep history the just-clicked thumb may sit
  // off-screen and the user loses their "you are here" feedback.
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [cursor]);

  // Hide on mobile + when the stack has ≤1 entry (the base alone).
  if (layout === "mobile") return null;
  if (snapshot.length <= 1) return null;

  return (
    <div
      // Floats inline below the canvas (within the canvas column —
      // see UnifiedEditor.tsx) so the canvas reflows naturally. Soft
      // top hairline marks the edge of the canvas region; the strip's
      // own background sits on the editor matte so it reads as a
      // continuation of the photo workbench, not as a separate
      // panel.
      className="flex shrink-0 items-center justify-center gap-2 border-t border-border-soft/60 px-4 py-2"
      data-testid="history-scrubber"
      role="toolbar"
      aria-label="Edit history timeline"
    >
      <span className="t-section-label hidden tracking-[0.12em] text-text-muted/70 sm:inline">
        History
      </span>
      {/* The horizontal scroller's `overflow-x-auto` implicitly forces
          `overflow-y: auto` per CSS spec — which clips the active
          thumb's `outline-offset-2 outline-2` ring (4 px outside the
          button) at the scroller's content box, making every thumb
          read as "flat-topped / flat-bottomed" cut-offs. Bumping the
          vertical padding from py-0.5 to py-1.5 gives the outline a
          6 px breathing buffer so the ring renders cleanly above and
          below each thumb.
          The horizontal `gap` matters for the same reason: the active
          outline reaches 4 px beyond each side of its button, and
          gap-1 (4 px) lands the outline exactly at the neighbour's
          edge — they appeared to bleed into one another. gap-2.5
          (10 px) gives ~3 px of clear space on each side of the ring
          so each thumb reads as its own card. */}
      <div className="scroll-thin flex max-w-full items-center gap-2.5 overflow-x-auto px-1 py-1.5">
        {snapshot.map((entry, i) => {
          const active = i === cursor;
          return (
            <button
              key={i}
              ref={active ? activeRef : null}
              type="button"
              onClick={() => void jumpToStep(i)}
              title={`Step ${i}: ${entry.label}`}
              aria-label={`Jump to step ${i}: ${entry.label}`}
              aria-pressed={active}
              // 30 px base, +2 px on hover/active via outline so the
              // bounding box doesn't shift the row's height. Coral
              // ring on active, neutral hairline on hover. Image is
              // painted from the entry's pre-built <canvas> via a
              // CSS background — works whether the entry is still
              // live (canvas-backed) or already compressed (the
              // thumb is independent of canvas/blob).
              className={`group relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border-none p-0 transition-all duration-150 ${
                active
                  ? "outline-2 outline-offset-2 outline-coral-500 dark:outline-coral-400"
                  : "outline-1 outline-offset-1 outline-border-soft hover:outline-text-muted/40"
              }`}
              style={{ width: THUMB_PX, height: THUMB_PX }}
            >
              <ThumbCanvas thumb={entry.thumb} />
              {/* The prior treatment dropped a coral "step number" pip
                  in the bottom-right of the active thumb. With the
                  active thumb already wearing a 4 px coral outline-ring
                  (outline-offset-2 + outline-2), the pip's bottom-right
                  corner clipped against that ring and read as a visual
                  overlap. The ring itself is enough "you are here" —
                  step counts live on the title attribute and aria-label
                  for users who need to reference them. */}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Paints the pre-built thumb canvas into a CSS-sized container by
 *  cloning its bitmap into a freshly-mounted child <canvas>. The
 *  entry's own thumb canvas is shared across renders — we can't
 *  insert it directly into multiple DOM positions, and we don't want
 *  to rip it out of the History object when the scrubber unmounts.
 *  The clone is cheap (≤96² blit) and keeps each scrubber-cell
 *  independent of every other consumer.
 *
 *  Returns the placeholder dot when the entry has no thumb yet (e.g.
 *  before push completed, or after a future eviction policy nulls
 *  thumbs to reclaim memory). */
function ThumbCanvas({ thumb }: { thumb: HTMLCanvasElement | null }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const out = ref.current;
    if (!out || !thumb) return;
    if (out.width !== thumb.width) out.width = thumb.width;
    if (out.height !== thumb.height) out.height = thumb.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.drawImage(thumb, 0, 0);
  }, [thumb]);
  if (!thumb) {
    return <span className="h-1.5 w-1.5 rounded-full bg-text-muted/40" aria-hidden="true" />;
  }
  return <canvas ref={ref} className="h-full w-full object-cover" />;
}
