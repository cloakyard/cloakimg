// removeBg.ts — Local chroma-key background remover.
//
// Strategy: sample many points along the perimeter, then filter down
// to the *dominant colour cluster* — the colour the perimeter agrees
// on. This rejects samples that landed on foreground (hair touching
// the top edge, shoulders bleeding off the bottom) so they don't
// poison the keyer. For each pixel we use the minimum distance to any
// sample in the dominant cluster.
//
// After classification we run a 3×3 box-average pass over the alpha
// channel only. That softens the cutout edge from a hard step into a
// 1-px feather, which reads as anti-aliased on hair / fuzzy edges and
// hides per-pixel noise from the threshold.

import { createCanvas } from "../doc";

interface Sample {
  r: number;
  g: number;
  b: number;
}

interface Opts {
  threshold: number; // 0..1 from slider
  feather: number; // 0..1
  /** Optional explicit pick — bypasses the perimeter sampling. */
  sample?: Sample | null;
}

export function removeBackground(
  src: HTMLCanvasElement,
  { threshold, feather, sample }: Opts,
): HTMLCanvasElement {
  const out = createCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;

  // Build the candidate sample list. With an explicit pick we still
  // include the perimeter points: the user's pick is the primary, but
  // having alternates means a slight gradient in the background still
  // reads as background. The perimeter set is then filtered to the
  // dominant cluster so a subject touching the edge can't seed the
  // keyer with skin / hair / shirt colours.
  const samples: Sample[] = [];
  if (sample) samples.push(sample);
  const perim = sampleStrip(d, out.width, out.height);
  samples.push(...dominantCluster(perim));

  const t = Math.max(0.02, threshold * 0.6);
  const featherDist = Math.max(0.01, feather * 0.4);
  const tFeather = t + featherDist;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] ?? 0;
    const g = d[i + 1] ?? 0;
    const b = d[i + 2] ?? 0;
    const dist = minDistance(r, g, b, samples);
    if (dist <= t) {
      d[i + 3] = 0;
    } else if (dist <= tFeather) {
      const a = (dist - t) / featherDist;
      d[i + 3] = Math.round((d[i + 3] ?? 255) * a);
    }
  }

  // Smooth the alpha channel: 3×3 box average. Cleans up jagged edges
  // and gives hair / feathered regions a softer falloff.
  smoothAlpha(d, out.width, out.height);

  ctx.putImageData(img, 0, 0);
  return out;
}

function minDistance(r: number, g: number, b: number, samples: Sample[]): number {
  let best = Infinity;
  for (const s of samples) {
    const dr = (r - s.r) / 255;
    const dg = (g - s.g) / 255;
    const db = (b - s.b) / 255;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < best) best = dist;
  }
  return best;
}

/** Sample many points along the image perimeter, skipping any that are
 *  already transparent (so an image whose BG was previously removed
 *  doesn't seed the next pass with garbage). */
function sampleStrip(data: Uint8ClampedArray, w: number, h: number): Sample[] {
  const out: Sample[] = [];
  const stepX = Math.max(1, Math.floor(w / 24));
  const stepY = Math.max(1, Math.floor(h / 24));
  // Top + bottom rows
  for (let x = 0; x < w; x += stepX) {
    pushSample(data, x, 0, w, out);
    pushSample(data, x, h - 1, w, out);
  }
  // Left + right columns
  for (let y = 0; y < h; y += stepY) {
    pushSample(data, 0, y, w, out);
    pushSample(data, w - 1, y, w, out);
  }
  return out;
}

function pushSample(data: Uint8ClampedArray, x: number, y: number, w: number, out: Sample[]) {
  const i = (y * w + x) * 4;
  const a = data[i + 3] ?? 255;
  if (a < 200) return; // already transparent — skip
  out.push({ r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 });
}

/** Auto-tune threshold + feather based on how solid the background
 *  reads at the perimeter. A low-variance perimeter (flat studio
 *  backdrop) gets a tight threshold + minimal feather. A
 *  high-variance perimeter (gradient sky, textured backdrop) gets a
 *  wider threshold and more feather. The output values are slider
 *  positions in 0..1 to match `genericStrength` / `feather`. */
export function computeAutoParams(src: HTMLCanvasElement): {
  threshold: number;
  feather: number;
} {
  const ctx = src.getContext("2d");
  if (!ctx) return { threshold: 0.5, feather: 0.2 };
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const raw = sampleStrip(img.data, src.width, src.height);
  if (raw.length === 0) return { threshold: 0.5, feather: 0.2 };
  // Drop outliers (hair / shoulder / shirt that touched the perimeter)
  // before measuring spread — otherwise they inflate it and push the
  // threshold so wide that skin tones get partially keyed.
  const samples = dominantCluster(raw);

  // Mean colour
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (const s of samples) {
    mr += s.r;
    mg += s.g;
    mb += s.b;
  }
  mr /= samples.length;
  mg /= samples.length;
  mb /= samples.length;
  // Mean distance from the mean colour (a robust spread proxy).
  let spread = 0;
  for (const s of samples) {
    const dr = (s.r - mr) / 255;
    const dg = (s.g - mg) / 255;
    const db = (s.b - mb) / 255;
    spread += Math.sqrt(dr * dr + dg * dg + db * db);
  }
  spread /= samples.length;

  // Luminance (relative) gives a small nudge: very dark or very bright
  // backgrounds tolerate a slightly tighter threshold because the
  // foreground tends to differ in luminance too.
  const lum = (0.2126 * mr + 0.7152 * mg + 0.0722 * mb) / 255;
  const lumExtremity = Math.abs(lum - 0.5) * 2; // 0..1, peaks at black & white

  // Map spread → slider. Flat backgrounds (spread ~ 0) → ~0.18
  // (tight), busy backgrounds (spread ~ 0.4) → ~0.85 (wide).
  const baseThreshold = Math.min(0.95, Math.max(0.18, 0.18 + spread * 1.6));
  const threshold = Math.max(0.15, baseThreshold - lumExtremity * 0.05);
  // Feather: low spread → minimal soft edge; high spread → more
  // feather to hide the messy boundary.
  const feather = Math.min(0.6, 0.08 + spread * 0.9);
  return {
    threshold: round2(threshold),
    feather: round2(feather),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Cheap heuristic — does the image already have a fully-transparent
 *  perimeter (i.e. a previous Remove BG pass already cleared it)?
 *  Used to disable the action so users don't keep re-applying. */
export function looksAlreadyRemoved(src: HTMLCanvasElement): boolean {
  const ctx = src.getContext("2d");
  if (!ctx) return false;
  const w = src.width;
  const h = src.height;
  if (w < 4 || h < 4) return false;
  // Sample a coarse strip along all four edges.
  const stepX = Math.max(1, Math.floor(w / 32));
  const stepY = Math.max(1, Math.floor(h / 32));
  let total = 0;
  let transparent = 0;
  // Use 1px-tall horizontal strips for top/bottom and 1px-wide vertical
  // strips for left/right — a single getImageData per strip keeps it
  // cheap.
  const top = ctx.getImageData(0, 0, w, 1).data;
  const bot = ctx.getImageData(0, h - 1, w, 1).data;
  for (let x = 0; x < w; x += stepX) {
    total += 2;
    if ((top[x * 4 + 3] ?? 255) < 16) transparent++;
    if ((bot[x * 4 + 3] ?? 255) < 16) transparent++;
  }
  const left = ctx.getImageData(0, 0, 1, h).data;
  const right = ctx.getImageData(w - 1, 0, 1, h).data;
  for (let y = 0; y < h; y += stepY) {
    total += 2;
    if ((left[y * 4 + 3] ?? 255) < 16) transparent++;
    if ((right[y * 4 + 3] ?? 255) < 16) transparent++;
  }
  // 70% of the perimeter is fully transparent → BG considered removed.
  return total > 0 && transparent / total > 0.7;
}

/** Reduce a perimeter sample set to the dominant colour cluster.
 *
 *  Each sample casts votes for every other sample within a tight
 *  colour radius; the highest-voted sample is the "modal" background
 *  colour, and we return it together with its near-neighbours. This
 *  rejects outliers like a strand of hair on the top edge or a
 *  shoulder reaching the bottom, which would otherwise teach the
 *  keyer that skin / hair / shirt are background colours. */
function dominantCluster(samples: Sample[]): Sample[] {
  if (samples.length < 4) return samples;
  // Tight enough to separate skin from white; loose enough to
  // tolerate paper grain or sky gradients.
  const RADIUS = 0.12;
  let bestIdx = 0;
  let bestVotes = -1;
  for (let i = 0; i < samples.length; i++) {
    let votes = 0;
    const si = samples[i];
    if (!si) continue;
    for (let j = 0; j < samples.length; j++) {
      if (i === j) continue;
      const sj = samples[j];
      if (!sj) continue;
      if (colorDist(si, sj) < RADIUS) votes++;
    }
    if (votes > bestVotes) {
      bestVotes = votes;
      bestIdx = i;
    }
  }
  const center = samples[bestIdx];
  if (!center) return samples;
  const filtered = samples.filter((s) => colorDist(s, center) < RADIUS);
  // Fall back to the full set if filtering left us with too little to
  // cover normal background variation.
  return filtered.length >= 3 ? filtered : samples;
}

function colorDist(a: Sample, b: Sample): number {
  const dr = (a.r - b.r) / 255;
  const dg = (a.g - b.g) / 255;
  const db = (a.b - b.b) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** 3×3 box average over the alpha channel only. We can't do this in
 *  place — write into a small Uint8Array buffer and then copy back. */
function smoothAlpha(data: Uint8ClampedArray, w: number, h: number) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(w - 1, x + 1);
      const sum =
        (data[(ym * w + xm) * 4 + 3] ?? 0) +
        (data[(ym * w + x) * 4 + 3] ?? 0) +
        (data[(ym * w + xp) * 4 + 3] ?? 0) +
        (data[(y * w + xm) * 4 + 3] ?? 0) +
        (data[(y * w + x) * 4 + 3] ?? 0) +
        (data[(y * w + xp) * 4 + 3] ?? 0) +
        (data[(yp * w + xm) * 4 + 3] ?? 0) +
        (data[(yp * w + x) * 4 + 3] ?? 0) +
        (data[(yp * w + xp) * 4 + 3] ?? 0);
      out[y * w + x] = Math.round(sum / 9);
    }
  }
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    data[i + 3] = out[j] ?? data[i + 3] ?? 0;
  }
}
