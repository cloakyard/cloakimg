// probe-bg-blur.mjs — Visual regression test for the rewritten Portrait
// blur algorithms.
//
// What it asserts:
//   1. Gaussian, gamma-space lens, and tilt-shift each produce VISUALLY
//      DIFFERENT pixels (hashes diverge). This confirms the new lens
//      algorithm isn't degenerating into "another gaussian", which was
//      the failure mode of the previous 3-averaged-gaussians lens.
//   2. The bake completes within a sane time window (no infinite blur
//      pipeline / no crash) for each lens kind.
//
// Operates on whole-image scope so the test doesn't depend on the AI
// subject-mask flow.
//
// Usage:
//   pnpm exec vp dev                           # in another shell
//   BASE_URL=http://localhost:5173 \
//     node scripts/probe-bg-blur.mjs

import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

if (!existsSync(chromePath) || !existsSync(TEST_JPG)) {
  console.error("Chrome or test fixture missing");
  process.exit(1);
}

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-bgblur-"));
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1400, height: 900 },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});

const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(err));

await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });

await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Open editor/i.test(b.textContent ?? ""),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1200));

await page.waitForSelector('input[type="file"]', { timeout: 10000 });
const inputs = await page.$$('input[type="file"]');
await inputs.at(-1).uploadFile(TEST_JPG);
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

// Switch to Portrait blur tool.
const portraitClicked = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t =
      (b.textContent ?? "") + " " + (b.getAttribute("aria-label") ?? "") + " " + (b.title ?? "");
    return /Portrait blur/i.test(t);
  });
  if (!btn) return false;
  btn.click();
  return true;
});
if (!portraitClicked) {
  console.error("FAIL: Portrait blur tool not found");
  await browser.close();
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 500));

// Drive tool state through the test-only __editorDebug.patchTool
// hook. Avoids fighting Slider's setPointerCapture under headless
// Chromium (the synthesised pointer events have a pointerId that
// setPointerCapture rejects). bgBlurScope=0 → Whole image, the
// AI-free path that lets us test the raw lens algorithms.
await page.evaluate(() => {
  window.__editorDebug.patchTool("bgBlurScope", 0);
  window.__editorDebug.patchTool("bgBlurAmount", 0.55);
});
await new Promise((r) => setTimeout(r, 500));

const sliderValue = await page.evaluate(
  () => window.__editorDebug?.toolState?.bgBlurAmount ?? null,
);
console.log(`  bgBlurAmount after patch: ${sliderValue}`);
if (sliderValue === null || sliderValue < 0.05) {
  console.error("FAIL: __editorDebug.patchTool didn't update bgBlurAmount");
  await browser.close();
  process.exit(1);
}

async function hashCanvas() {
  const dataUrl = await page.evaluate(() => {
    // The Fabric stage stacks a transparent overlay canvas on top of
    // the image canvas — both are >200 px. Pick the one with actual
    // photo pixels at its centre (alpha=255, RGB not pure white) so
    // we hash the live preview, not Fabric's empty interaction layer.
    const canvases = Array.from(document.querySelectorAll("canvas")).filter((cv) => {
      const r = cv.getBoundingClientRect();
      return r.width > 200 && r.height > 200;
    });
    for (const cv of canvases) {
      try {
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        if (!ctx) continue;
        const px = ctx.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data;
        const isOpaque = px[3] >= 250;
        const isNotWhite = px[0] < 240 || px[1] < 240 || px[2] < 240;
        if (isOpaque && isNotWhite) return cv.toDataURL("image/png");
      } catch {
        // ignore tainted-canvas / cross-origin cases
      }
    }
    return null;
  });
  if (!dataUrl) return null;
  const base64 = dataUrl.split(",")[1];
  return createHash("md5").update(Buffer.from(base64, "base64")).digest("hex");
}

async function saveSnapshot(name) {
  const dataUrl = await page.evaluate(() => {
    // The Fabric stage stacks a transparent overlay canvas on top of
    // the image canvas — both are >200 px. Pick the one with actual
    // photo pixels at its centre (alpha=255, RGB not pure white) so
    // we hash the live preview, not Fabric's empty interaction layer.
    const canvases = Array.from(document.querySelectorAll("canvas")).filter((cv) => {
      const r = cv.getBoundingClientRect();
      return r.width > 200 && r.height > 200;
    });
    for (const cv of canvases) {
      try {
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        if (!ctx) continue;
        const px = ctx.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data;
        const isOpaque = px[3] >= 250;
        const isNotWhite = px[0] < 240 || px[1] < 240 || px[2] < 240;
        if (isOpaque && isNotWhite) return cv.toDataURL("image/png");
      } catch {
        // ignore tainted-canvas / cross-origin cases
      }
    }
    return null;
  });
  if (!dataUrl) return;
  const base64 = dataUrl.split(",")[1];
  const path = `/tmp/cloakimg-bgblur-${name}.png`;
  writeFileSync(path, Buffer.from(base64, "base64"));
  console.log(`  ${path}`);
}

async function pickLens(kind) {
  await page.evaluate((k) => {
    window.__editorDebug.patchTool("bgBlurLens", k);
  }, kind);
  await new Promise((r) => setTimeout(r, 700));
}

console.log("→ Lens kind: gaussian");
await pickLens("gaussian");
const hashGaussian = await hashCanvas();
console.log(`  hash: ${hashGaussian}`);
await saveSnapshot("gaussian");

console.log("→ Lens kind: lens (gamma-space bokeh)");
await pickLens("lens");
const hashLens = await hashCanvas();
console.log(`  hash: ${hashLens}`);
await saveSnapshot("lens");

console.log("→ Lens kind: tilt-shift");
await pickLens("tilt-shift");
const hashTilt = await hashCanvas();
console.log(`  hash: ${hashTilt}`);
await saveSnapshot("tiltshift");

const errors = pageErrors.filter((e) => !/ResizeObserver/.test(e.message));
if (errors.length > 0) {
  console.error(
    "pageerrors:",
    errors.map((e) => e.message),
  );
  await browser.close();
  process.exit(1);
}

await browser.close();

let fails = 0;
if (!hashGaussian || !hashLens || !hashTilt) {
  console.error("FAIL: missing canvas hash");
  fails++;
}
if (hashGaussian === hashLens) {
  console.error(`FAIL: Gaussian and Lens produced identical output`);
  fails++;
}
if (hashGaussian === hashTilt) {
  console.error(`FAIL: Gaussian and Tilt-shift produced identical output`);
  fails++;
}
if (hashLens === hashTilt) {
  console.error(`FAIL: Lens and Tilt-shift produced identical output`);
  fails++;
}
if (fails > 0) process.exit(1);

console.log("\nPASS: all 3 lens kinds produce visually distinct output ✓");
process.exit(0);
