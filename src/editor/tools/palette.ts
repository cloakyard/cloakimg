// palette.ts — Median-cut palette extraction. Downsample the image to
// keep the algorithm fast, then bucket-split the color space until we
// have N leaves and average each leaf.

interface RGB {
  r: number;
  g: number;
  b: number;
}

export function extractPalette(src: HTMLCanvasElement, count = 5): string[] {
  // Downsample to a small thumbnail for speed.
  const target = 80;
  const ratio = Math.min(target / src.width, target / src.height);
  const w = Math.max(1, Math.round(src.width * ratio));
  const h = Math.max(1, Math.round(src.height * ratio));
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(src, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const pixels: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push({
      r: data[i] ?? 0,
      g: data[i + 1] ?? 0,
      b: data[i + 2] ?? 0,
    });
  }
  return medianCut(pixels, count).map(rgbToHex);
}

function medianCut(pixels: RGB[], count: number): RGB[] {
  if (pixels.length === 0) return [];
  let buckets: RGB[][] = [pixels];
  while (buckets.length < count) {
    // Pick the bucket with the largest range and split it.
    let largest = -1;
    let largestRange = -1;
    let dimToSplit: keyof RGB = "r";
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (!b || b.length < 2) continue;
      const ranges = rangeOf(b);
      const max = Math.max(ranges.r, ranges.g, ranges.b);
      if (max > largestRange) {
        largestRange = max;
        largest = i;
        dimToSplit = ranges.r === max ? "r" : ranges.g === max ? "g" : "b";
      }
    }
    if (largest === -1) break;
    const bucket = buckets[largest];
    if (!bucket) break;
    bucket.sort((a, b) => a[dimToSplit] - b[dimToSplit]);
    const mid = Math.floor(bucket.length / 2);
    const left = bucket.slice(0, mid);
    const right = bucket.slice(mid);
    buckets = [...buckets.slice(0, largest), left, right, ...buckets.slice(largest + 1)];
  }
  return buckets.map((b) => averageColor(b)).filter(Boolean) as RGB[];
}

function rangeOf(arr: RGB[]): RGB {
  let rmin = 255,
    rmax = 0,
    gmin = 255,
    gmax = 0,
    bmin = 255,
    bmax = 0;
  for (const p of arr) {
    if (p.r < rmin) rmin = p.r;
    if (p.r > rmax) rmax = p.r;
    if (p.g < gmin) gmin = p.g;
    if (p.g > gmax) gmax = p.g;
    if (p.b < bmin) bmin = p.b;
    if (p.b > bmax) bmax = p.b;
  }
  return { r: rmax - rmin, g: gmax - gmin, b: bmax - bmin };
}

function averageColor(arr: RGB[]): RGB | null {
  if (arr.length === 0) return null;
  let r = 0,
    g = 0,
    b = 0;
  for (const p of arr) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  return {
    r: Math.round(r / arr.length),
    g: Math.round(g / arr.length),
    b: Math.round(b / arr.length),
  };
}

function rgbToHex({ r, g, b }: RGB): string {
  return (
    "#" + [r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")
  );
}
