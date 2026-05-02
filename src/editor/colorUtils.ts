// colorUtils.ts — Tiny RGB / HSV / hex helpers for the custom color
// picker. Pure functions, no DOM, no allocations beyond the immediate
// return value.

export interface RGB {
  r: number; // 0..255
  g: number;
  b: number;
}

export interface HSV {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

export function rgbToHex({ r, g, b }: RGB): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => {
        const v = Math.max(0, Math.min(255, Math.round(c)));
        return v.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

/** Accepts `#rgb`, `#rrggbb`, or `rgb(...)` (returns black on parse fail). */
export function parseColor(input: string): RGB {
  const s = input.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b };
    }
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (m) return { r: +m[1]!, g: +m[2]!, b: +m[3]! };
  return { r: 0, g: 0, b: 0 };
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (hh >= 0 && hh < 1) [r1, g1, b1] = [c, x, 0];
  else if (hh < 2) [r1, g1, b1] = [x, c, 0];
  else if (hh < 3) [r1, g1, b1] = [0, c, x];
  else if (hh < 4) [r1, g1, b1] = [0, x, c];
  else if (hh < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** Push a hex onto the recent-picks list (newest first, deduped, capped). */
const RECENT_MAX = 8;
const recentPicks: string[] = [];

export function pushRecentColor(hex: string) {
  const norm = hex.toLowerCase();
  const i = recentPicks.indexOf(norm);
  if (i !== -1) recentPicks.splice(i, 1);
  recentPicks.unshift(norm);
  if (recentPicks.length > RECENT_MAX) recentPicks.length = RECENT_MAX;
  for (const cb of subscribers) cb();
}

export function getRecentColors(): readonly string[] {
  return recentPicks;
}

const subscribers = new Set<() => void>();
export function subscribeRecents(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
