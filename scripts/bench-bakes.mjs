// bench-bakes.mjs — Time each bake function against a real loaded
// photo so we can put numbers behind the perf-audit claims. Two
// bench sizes are reported per preset:
//
//   • PREVIEW (1440 px long-edge) — the size live-preview hooks
//     actually bake during a slider drag. This is the number that
//     drives perceived UI responsiveness.
//   • FULL    (the source's real dimensions) — what users pay at
//     apply / export time, after they release the slider. This
//     blocks the main thread on commit unless bake-async-yields.
//
// Each preset is timed `ITERS` times; we report the median + min/max.
// BgBlur is intentionally NOT benched here — its bake uses Canvas
// `filter: blur()`, which the browser offloads to the GPU compositor
// and resolves at paint time, so the JS-side timing reports near-zero
// regardless of actual blur cost. To measure that path you need
// requestAnimationFrame / drawImage timing rather than wallclock
// around the bake call.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const TEST_JPG = resolve(ROOT, "test-fixtures/IMG_1804.jpg");
const ITERS = Number.parseInt(process.env.BENCH_ITERS ?? "7", 10);

async function openEditor(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Open editor/i.test(b.textContent ?? ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.waitForSelector('input[type="file"]', { timeout: 10000 });
  const fileInputs = await page.$$('input[type="file"]');
  await fileInputs[0].uploadFile(TEST_JPG);
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("button")).some((b) =>
        /Open in editor/i.test(b.textContent ?? ""),
      ),
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Open in editor/i.test(b.textContent ?? ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 4500));
}

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-bench-"));
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});

const page = await browser.newPage();
// Surface page-side console errors so a broken dynamic import doesn't
// silently disappear into an empty result table.
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("[page console]", msg.text());
});
page.on("pageerror", (err) => console.error("[page error]", err.message));

await openEditor(page);

// Sanity check: the working canvas must be reachable before we dive
// into bake timing — bake calls against a null source would silently
// short-circuit and report misleadingly fast numbers.
const dims = await page.evaluate(() => {
  const w = window.__editorDebug?.docWorking;
  return w ? { w: w.width, h: w.height } : null;
});
if (!dims) {
  console.error("FAIL: no working canvas available — editor didn't open");
  await browser.close();
  process.exit(1);
}
console.log(`source canvas: ${dims.w}×${dims.h} (${((dims.w * dims.h) / 1e6).toFixed(2)} MP)`);
console.log(`iterations per preset: ${ITERS} (median reported, min–max in parens)\n`);

// Drive the benchmark inside the page so all imports + canvas access
// stay in one realm. Returns an array of { name, size, median, min, max }.
const rows = await page.evaluate(async (iters) => {
  const adjMod = await import("/src/editor/tools/adjustments.ts");
  const hslMod = await import("/src/editor/tools/hsl.ts");
  const docMod = await import("/src/editor/doc.ts");
  const fullSrc = window.__editorDebug.docWorking;
  if (!fullSrc) throw new Error("no docWorking");

  // ── Helpers ───────────────────────────────────────────────────────
  const time = (fn) => {
    const t0 = performance.now();
    const out = fn();
    const t1 = performance.now();
    return { ms: t1 - t0, out };
  };
  const release = (c) => {
    if (c) docMod.releaseCanvas(c);
  };
  const summarize = (samples) => {
    const sorted = [...samples].sort((a, b) => a - b);
    return {
      median: sorted[(sorted.length / 2) | 0],
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  };
  const run = (name, size, work) => {
    const samples = [];
    // Warm-up discarded, lets JIT settle.
    const warm = time(work);
    release(warm.out);
    for (let i = 0; i < iters; i++) {
      const s = time(work);
      samples.push(s.ms);
      release(s.out);
    }
    return { name, size, ...summarize(samples) };
  };
  // Downsample the source to the preview's standard long-edge cap
  // (1440 px desktop). The preview hooks bake against a canvas this
  // size during slider drags, so this is the timing users actually
  // feel — not the export-size run. Built outside the bench loops so
  // every preset shares the same input.
  const buildPreview = (src, cap) => {
    const long = Math.max(src.width, src.height);
    if (long <= cap) return src;
    const ratio = cap / long;
    const w = Math.max(1, Math.round(src.width * ratio));
    const h = Math.max(1, Math.round(src.height * ratio));
    const out = docMod.createCanvas(w, h);
    const ctx = out.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    return out;
  };
  const previewSrc = buildPreview(fullSrc, 1440);
  const previewLabel = `${previewSrc.width}×${previewSrc.height}`;
  const fullLabel = `${fullSrc.width}×${fullSrc.height}`;

  // ── Adjust presets ───────────────────────────────────────────────
  // ADJUST_KEYS index map: 0=exposure, 1=contrast, 5=vibrance.
  // Identity = all 0.5. Single-slider = bump one to 0.7; full pipeline
  // = stagger every slider away from identity so all stages activate.
  const ADJ_LEN = 11;
  const identityAdj = Array.from({ length: ADJ_LEN }, () => 0.5);
  const exposureOnly = [...identityAdj];
  exposureOnly[0] = 0.7;
  const contrastOnly = [...identityAdj];
  contrastOnly[1] = 0.7;
  const vibranceOnly = [...identityAdj];
  vibranceOnly[5] = 0.7;
  const fullPipeline = identityAdj.map((_, i) => 0.5 + 0.15 * ((i % 2) * 2 - 1));

  const hslIdent = hslMod.hslIdentity();
  const hslRedOnly = hslMod.hslIdentity();
  hslRedOnly.hue[0] = 0.7;
  const hslAllBands = hslMod.hslIdentity();
  for (let i = 0; i < 8; i++) {
    hslAllBands.hue[i] = 0.5 + (i % 2 === 0 ? 0.1 : -0.1);
    hslAllBands.sat[i] = 0.5 + 0.1;
  }

  // Each preset is benched at BOTH preview and full size so we can
  // see where the gating actually helps (the per-pixel inner loops
  // scale linearly with pixel count, so the ratio between the two
  // tells us how much overhead is fixed vs. per-pixel).
  const presets = [
    ["Adjust · identity (short-circuit)", (s) => adjMod.bakeAdjust(s, identityAdj, 0)],
    ["Adjust · exposure-only", (s) => adjMod.bakeAdjust(s, exposureOnly, 0)],
    ["Adjust · contrast-only", (s) => adjMod.bakeAdjust(s, contrastOnly, 0)],
    ["Adjust · vibrance-only", (s) => adjMod.bakeAdjust(s, vibranceOnly, 0)],
    ["Adjust · full pipeline (all active)", (s) => adjMod.bakeAdjust(s, fullPipeline, 0)],
    ["HSL · identity (short-circuit)", (s) => hslMod.bakeHsl(s, hslIdent)],
    ["HSL · single band (Red) — null-hue fast-path", (s) => hslMod.bakeHsl(s, hslRedOnly)],
    ["HSL · all 8 bands (no fast-path)", (s) => hslMod.bakeHsl(s, hslAllBands)],
  ];

  const results = [];
  for (const [name, work] of presets) {
    results.push(run(name, `preview ${previewLabel}`, () => work(previewSrc)));
  }
  for (const [name, work] of presets) {
    results.push(run(name, `full ${fullLabel}`, () => work(fullSrc)));
  }
  return results;
}, ITERS);

// Two passes: print the preview-sized rows first (what the user
// feels during a slider drag), then the full-size rows (what the
// commit / export bake takes). Each is sub-grouped so the eye can
// compare gated vs full pipeline without arithmetic.
const printGroup = (label, filtered) => {
  console.log(`\n── ${label} ${"─".repeat(72 - label.length)}`);
  console.log(`${"preset".padEnd(50)}median  (min   – max)`);
  for (const r of filtered) {
    const med = r.median.toFixed(2).padStart(7);
    const min = r.min.toFixed(2).padStart(6);
    const max = r.max.toFixed(2).padStart(6);
    console.log(`${r.name.padEnd(50)}${med} ms (${min} – ${max})`);
  }
};
printGroup(
  "PREVIEW size (slider-drag latency users actually feel)",
  rows.filter((r) => r.size.startsWith("preview")),
);
printGroup(
  "FULL size (commit / export bake — runs once after release)",
  rows.filter((r) => r.size.startsWith("full")),
);

await browser.close();
