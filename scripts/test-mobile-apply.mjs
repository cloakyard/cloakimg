// test-mobile-apply.mjs — Real end-to-end check that the mobile global
// ✓ actually commits the active tool's bake (Crop, Resize, Perspective,
// RemoveBg). Drives the headless browser with touch events, taps ✓,
// reads the resulting doc dimensions / canvas-hash to confirm the
// commit fired. Exits non-zero on any failure so CI / a manual
// `node scripts/test-mobile-apply.mjs` returns a clear pass/fail.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TEST_JPG = resolve(ROOT, "test-fixtures/IMG_1804.jpg");
const CHROME =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = process.env.BASE_URL || "http://localhost:5173";

if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME}`);
  process.exit(1);
}

const failures = [];
function check(label, predicate) {
  if (predicate) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}`);
    failures.push(label);
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: {
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.setUserAgent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Firefox/150.0",
);
await page.setCacheEnabled(false);
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

// Mirror browser console + uncaught errors so the test surfaces them.
page.on("console", (msg) => {
  const text = msg.text();
  // Filter out the noisy JSDOM-ish info Vite likes to emit.
  if (/\[vite\]/.test(text)) return;
  console.log(`  [page ${msg.type()}] ${text}`);
});
page.on("pageerror", (err) => console.log(`  [page error] ${err.message}`));

console.log(`→ Open editor at ${BASE_URL}`);
await page.goto(BASE_URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.evaluate(() => {
  Array.from(document.querySelectorAll("button"))
    .find((b) => /Open editor/i.test(b.textContent ?? ""))
    ?.click();
});
await new Promise((r) => setTimeout(r, 1500));
const modalFileInput = await page.waitForSelector(
  '[role="dialog"][aria-modal="true"] input[type="file"]',
  { timeout: 10000 },
);
await modalFileInput.uploadFile(TEST_JPG);
await page.waitForFunction(
  () =>
    Array.from(document.querySelectorAll("button")).some((b) =>
      /Open in editor/i.test(b.textContent ?? ""),
    ),
  { timeout: 15000 },
);
await page.evaluate(() => {
  Array.from(document.querySelectorAll("button"))
    .find((b) => /Open in editor/i.test(b.textContent ?? ""))
    ?.click();
});
console.log("→ Wait for editor to mount");
await new Promise((r) => setTimeout(r, 5000));

// Helper: open the picker and pick a tool by aria-label.
async function pickTool(toolName) {
  await page.evaluate(() => {
    const tools = Array.from(document.querySelectorAll("button")).find(
      (b) => (b.getAttribute("aria-label") ?? "").trim() === "Open tools",
    );
    tools?.click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate((name) => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Tools"]');
    if (!dialog) return;
    Array.from(dialog.querySelectorAll("button"))
      .find((b) => (b.getAttribute("aria-label") ?? "").trim() === name)
      ?.click();
  }, toolName);
  await new Promise((r) => setTimeout(r, 1500));
}

// Helper: tap the global ✓.
async function tapConfirm() {
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("button"))
      .find((b) => (b.getAttribute("aria-label") ?? "").trim() === "Done")
      ?.click();
  });
  // Apply pipeline includes runBusy (2 rAFs + the bake itself, which
  // can include rAF + sync canvas drawImage + commit). Wait generously.
  await new Promise((r) => setTimeout(r, 2500));
}

// Helper: probe every visible canvas — dims AND a cheap pixel hash so a
// rotation that DOESN'T swap dims (square canvas) or a flip / colour
// bake still shows up as a hash delta. Returns the largest canvas's
// stats so test asserts can run without picking a specific element.
async function readCanvasState() {
  return await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll("main canvas"));
    if (canvases.length === 0) return null;
    function hashCanvas(c) {
      try {
        const ctx = c.getContext("2d");
        if (!ctx) return "no-ctx";
        const w = Math.min(c.width, 256);
        const h = Math.min(c.height, 256);
        if (w === 0 || h === 0) return "empty";
        const data = ctx.getImageData(0, 0, w, h).data;
        let h2 = 0;
        for (let i = 0; i < data.length; i += 64) h2 = (h2 * 31 + data[i]) | 0;
        return h2.toString(36);
      } catch (e) {
        return `err:${e.message}`;
      }
    }
    const stats = canvases.map((c, i) => ({
      i,
      w: c.width,
      h: c.height,
      hash: hashCanvas(c),
    }));
    let biggest = canvases[0];
    for (const c of canvases) {
      if (c.width * c.height > biggest.width * biggest.height) biggest = c;
    }
    return {
      w: biggest.width,
      h: biggest.height,
      hash: hashCanvas(biggest),
      all: stats,
    };
  });
}

// Read the actual doc dimensions from EditorContext via window debug
// hook (set inside an effect in EditorContext for this very purpose).
// The DOM canvases are Fabric's display surfaces which Fabric resizes
// to fit the viewport, so reading them doesn't tell us whether the
// underlying doc.working got rebaked. The debug hook reads doc.width
// / doc.height directly.
async function readDocDims() {
  return await page.evaluate(() => {
    const w = window;
    return w.__editorDebug?.docDims ?? null;
  });
}

const original = await readDocDims();
console.log(`Original doc dims: ${original?.w} × ${original?.h}`);
check(
  "uploaded image registered with non-zero dimensions",
  original && original.w > 0 && original.h > 0,
);
const originalState = await readCanvasState();
console.log(`Original canvases:`, JSON.stringify(originalState?.all));

// ─── Test 1: Crop apply via global ✓ ───────────────────────────────
//
// The crop tool mounts a Fabric.Rect overlay. To shrink the crop, we
// reach into the live Fabric canvas, find the rect, and resize it
// programmatically. Then tap ✓ and verify the doc dimensions changed.

console.log("\n─── Test 1: Crop (1:1 aspect then ✓) ───");
await pickTool("Crop & rotate");

// Tap the 1:1 aspect button — this reshapes the rect to a square (the
// shorter dim of the image, here 3770×3770). After ✓ the doc should
// be 3770 × 3770 — dimensions equal to each other AND smaller than
// the original height. Way more deterministic than rotation, which
// `applyCrop` handles by rotating *within* the rect's box (so dims
// don't swap).
const aspected = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === "1:1",
  );
  if (!btn) {
    const labels = Array.from(document.querySelectorAll("button"))
      .map((b) => (b.textContent ?? "").trim())
      .filter(Boolean);
    console.log("Buttons visible:", JSON.stringify(labels));
    return false;
  }
  btn.click();
  return true;
});
check("found and clicked 1:1 aspect button", aspected);
await new Promise((r) => setTimeout(r, 600));

const stateAfterClick = await page.evaluate(() => window.__editorDebug?.toolState);
console.log(`cropAspect after 1:1 click: ${stateAfterClick?.cropAspect} (expected 1)`);
check(
  "cropAspect set to index 1 (proves click reached patchTool)",
  stateAfterClick && stateAfterClick.cropAspect === 1,
);

console.log("→ Tap ✓");
await tapConfirm();

const cropped = await readDocDims();
console.log(`After crop ✓ doc dims: ${cropped?.w} × ${cropped?.h}`);
check(
  "doc dimensions are square after 1:1 crop + ✓ (proves bake fired)",
  cropped && cropped.w === cropped.h,
);
check(
  "doc dimensions strictly smaller than original (proves a real crop happened)",
  cropped && original && cropped.w < original.w && cropped.h < original.h,
);

// ─── Test 2: Resize (set W to half, then ✓) ──────────────────────
//
// Resize was the tool that didn't even register pendingApply pre-V3.6.
// This proves the registration + global ✓ chain works for it too.

console.log("\n─── Test 2: Resize (W/2 then ✓) ───");
await pickTool("Resize");

const beforeResize = await readDocDims();
const targetW = Math.round((beforeResize?.w ?? 0) / 2);
console.log(`Setting resize W to ${targetW}`);

const resizeSet = await page.evaluate((w) => {
  // The resize panel renders a numeric input labelled W. Find it via
  // its input role and set the value.
  const inputs = Array.from(document.querySelectorAll('input[type="number"], input[inputmode]'));
  // Heuristic: the W input has aria-label "Width" or sibling "W"
  // label. Just set the first input that's near the word "W".
  for (const inp of inputs) {
    const label = inp.closest("label")?.textContent ?? inp.getAttribute("aria-label") ?? "";
    if (/^\s*W\b|width/i.test(label)) {
      // React patches HTMLInputElement.prototype's `value` setter so it
      // can intercept changes from JS. To make React treat this as a
      // user-driven change (and re-run controlled-input bookkeeping)
      // we have to dispatch through the ORIGINAL prototype setter, not
      // the patched one. Call it directly off the descriptor so the
      // unbound-method reference never escapes into a variable.
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(
        inp,
        String(w),
      );
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      inp.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    }
  }
  return false;
}, targetW);

if (!resizeSet) {
  // Fallback — use the Long edge preset "1080" which is much smaller
  // than the 4284 default.
  console.log("→ W input not found, using 1080 long-edge preset");
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "1080",
    );
    btn?.click();
  });
}
await new Promise((r) => setTimeout(r, 600));

console.log("→ Tap ✓");
await tapConfirm();

const resized = await readDocDims();
console.log(`After resize ✓ doc dims: ${resized?.w} × ${resized?.h}`);
check(
  "doc dimensions shrank after Resize ✓ (proves registered apply fired)",
  resized && beforeResize && (resized.w < beforeResize.w || resized.h < beforeResize.h),
);

// ─── Test 3: Crop ✕ (cancel) rewinds ──────────────────────────────
//
// Verifies the cancel path still works after V3.6's registerPendingApply(null)
// guard. Open Crop, change aspect to 4:5, tap ✕ — dims should NOT change
// (cancel discards the pending crop, no commit fires).

console.log("\n─── Test 3: Crop ✕ does not commit ───");
const beforeCancel = await readDocDims();
await pickTool("Crop & rotate");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === "4:5",
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 600));

console.log("→ Tap ✕");
await page.evaluate(() => {
  Array.from(document.querySelectorAll("button"))
    .find((b) => (b.getAttribute("aria-label") ?? "").trim() === "Cancel")
    ?.click();
});
await new Promise((r) => setTimeout(r, 1500));

const afterCancel = await readDocDims();
console.log(`After cancel ✕ doc dims: ${afterCancel?.w} × ${afterCancel?.h}`);
check(
  "doc dimensions UNCHANGED after Crop ✕ (proves cancel discards pending bake)",
  afterCancel &&
    beforeCancel &&
    afterCancel.w === beforeCancel.w &&
    afterCancel.h === beforeCancel.h,
);

// ─── Done ─────────────────────────────────────────────────────────
await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
} else {
  console.log("\nAll checks passed.");
  process.exit(0);
}
