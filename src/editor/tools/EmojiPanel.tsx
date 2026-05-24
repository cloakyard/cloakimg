// EmojiPanel.tsx — Category-tabbed grid of curated system emojis plus a
// free-form paste/type input so the user can reach the long tail of the
// Unicode emoji catalogue (and modifiers, ZWJ sequences, country flags
// the curated set doesn't include) without us shipping any glyph
// assets.

import { useCallback, useMemo, useRef, useState } from "react";
import { PropRow } from "../atoms";
import { useEditor } from "../EditorContext";
import { DEFAULT_EMOJI, EMOJI_CATEGORIES, EMOJI_FONT_STACK } from "./emoji";

/** Grapheme-segment a string and return the first emoji cluster, or
 *  null if the input is empty / whitespace-only. We grab one cluster
 *  because the tool drops a single glyph per canvas click — pasting
 *  "😀😁🎉" should pick 😀 and let the user place each one separately. */
function firstEmojiGrapheme(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const it = seg.segment(trimmed)[Symbol.iterator]();
    const first = it.next();
    if (first.done) return null;
    return first.value.segment;
  }
  // Fallback for older browsers: take the first Unicode code point.
  // Loses ZWJ-joined sequences (family, flag) but at least returns a
  // glyph rather than half a surrogate pair.
  const cp = trimmed.codePointAt(0);
  return cp === undefined ? null : String.fromCodePoint(cp);
}

export function EmojiPanel() {
  const { toolState, patchTool } = useEditor();
  const [tabId, setTabId] = useState(EMOJI_CATEGORIES[0].id);
  const [customInput, setCustomInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const category = useMemo(
    () => EMOJI_CATEGORIES.find((c) => c.id === tabId) ?? EMOJI_CATEGORIES[0],
    [tabId],
  );

  const active = toolState.emojiChar || DEFAULT_EMOJI;

  const onPick = useCallback(
    (char: string) => {
      patchTool("emojiChar", char);
    },
    [patchTool],
  );

  const onApplyCustom = useCallback(() => {
    const picked = firstEmojiGrapheme(customInput);
    if (picked) {
      patchTool("emojiChar", picked);
      setCustomInput("");
    }
  }, [customInput, patchTool]);

  return (
    <>
      <PropRow label="Selected">
        <div className="flex items-center gap-2.5">
          <div
            role="img"
            aria-label={`Selected emoji ${active}`}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-[28px] leading-none"
            style={{ fontFamily: EMOJI_FONT_STACK }}
          >
            {active}
          </div>
          <div className="text-[11.5px] leading-snug text-text-muted">
            Click on the canvas to drop this emoji.
          </div>
        </div>
      </PropRow>

      <PropRow label="Category">
        <div className="flex flex-wrap gap-1">
          {EMOJI_CATEGORIES.map((c) => {
            const isActive = c.id === tabId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setTabId(c.id)}
                title={c.label}
                aria-label={c.label}
                aria-pressed={isActive}
                className={`flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-md px-1.5 text-[15px] leading-none ${
                  isActive
                    ? "border border-coral-500 bg-coral-500/10"
                    : "border border-border bg-surface"
                }`}
                style={{ fontFamily: EMOJI_FONT_STACK }}
              >
                {c.icon}
              </button>
            );
          })}
        </div>
      </PropRow>

      <PropRow label={category.label}>
        {/* No inner `max-h + overflow-y-auto` — the parent tool-controls
            scroller (PropertiesPanel on desktop, MobileEditorSurface's
            sheet on mobile) already owns the vertical scroll. A nested
            vertical scroller stole touch gestures on mobile and forced
            users to disambiguate which scrollbar they were trying to
            engage. Letting the grid grow to its natural height collapses
            the editor to a single vertical scroll surface. */}
        <div className="grid grid-cols-8 gap-1">
          {category.items.map((char) => {
            const isActive = char === active;
            return (
              <button
                key={`${category.id}-${char}`}
                type="button"
                onClick={() => onPick(char)}
                title={char}
                aria-label={char}
                aria-pressed={isActive}
                className={`flex aspect-square cursor-pointer items-center justify-center rounded-md text-[20px] leading-none ${
                  isActive
                    ? "border-2 border-coral-500 bg-coral-500/10"
                    : "border border-border bg-surface"
                }`}
                style={{ fontFamily: EMOJI_FONT_STACK }}
              >
                {char}
              </button>
            );
          })}
        </div>
      </PropRow>

      <PropRow label="Paste any emoji">
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onApplyCustom();
              }
            }}
            placeholder="🙂"
            aria-label="Paste any emoji"
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-[14px] leading-none"
            style={{ fontFamily: EMOJI_FONT_STACK }}
          />
          <button
            type="button"
            onClick={onApplyCustom}
            disabled={!firstEmojiGrapheme(customInput)}
            className="btn btn-secondary btn-sm shrink-0"
          >
            Use
          </button>
        </div>
      </PropRow>

      <div className="text-[11.5px] leading-relaxed text-text-muted">
        Pick from the grid or paste any emoji — including ones from your system picker (
        {navigator.platform.startsWith("Mac") ? "Cmd+Ctrl+Space" : "Win+."}). Drops as a layer you
        can drag, scale, and rotate.
      </div>
    </>
  );
}
