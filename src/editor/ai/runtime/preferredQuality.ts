// preferredQuality.ts — Remembers the last quality tier the user
// accepted in the consent dialog so the next session boots straight
// into "the model they already have on disk" instead of always
// defaulting to Fast. The cache itself is browser-managed
// (CacheStorage); this module only stores the *preference* in
// localStorage and validates it against the cache before honouring it.

import { type BgQuality, indexForQuality, QUALITY_KEYS } from "./bgModels";
import { isModelCached } from "./segment";

const KEY = "cloakimg:bgQuality";
const VALID = new Set<BgQuality>(QUALITY_KEYS);

/** Persist the user's chosen quality. Called from the consent dialog
 *  the moment the user taps Download (or "Use this model" when
 *  switching tiers). localStorage failures (private mode quotas,
 *  disabled storage) are swallowed silently — the user just doesn't
 *  get the cross-session memory benefit. */
export function savePreferredQuality(q: BgQuality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // Intentionally ignored — preference persistence is best-effort.
  }
}

/** Resolve the quality the editor should boot into. Order:
 *    1. Last quality the user accepted, if its bytes are still on disk
 *       (browser cache may have been cleared since).
 *    2. The largest cached tier — covers users who downloaded a model
 *       in a prior session before this preference key existed.
 *    3. `null` (caller falls back to the toolState default of "small").
 *
 *  Async because the cache check hits CacheStorage. The editor calls
 *  this once on mount and patches `bgQuality` in place — UI that
 *  reads `bgQuality` (consent dialog initial selection, RemoveBgPanel
 *  readout) picks up the change on the next render. */
export async function resolvePreferredQuality(): Promise<BgQuality | null> {
  const stored = readStored();
  if (stored && (await isModelCached(stored))) return stored;
  // Walk largest → smallest so a user who downloaded both "Better"
  // and "Best" in past sessions lands on "Best" by default.
  for (let i = QUALITY_KEYS.length - 1; i >= 0; i--) {
    const q = QUALITY_KEYS[i];
    if (q && (await isModelCached(q))) return q;
  }
  return null;
}

/** Index in `QUALITY_KEYS` (matches the numeric `bgQuality` field
 *  in toolState). Re-exported under the original name so the
 *  EditorContext restore path doesn't have to know about the
 *  registry's helper name. */
export function indexFor(q: BgQuality): number {
  return Math.max(0, indexForQuality(q));
}

function readStored(): BgQuality | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw && VALID.has(raw as BgQuality) ? (raw as BgQuality) : null;
  } catch {
    return null;
  }
}
