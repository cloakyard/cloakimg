// probe-crop-drag.mjs — Verify a Fabric crop-handle drag actually moves
// the rect on both desktop (mouse) and mobile (touch). The bug we're
// hunting: ImageCanvas's setPointerCapture used to steal events from
// Fabric the moment the user touched a handle, so the rect never
// moved and history piled up.

import { existsSync, mkdtempSync } from "node:fs";
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

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-cropdrag-"));

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: VIEWPORTS[0],
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});

let ok = true;
for (const vp of VIEWPORTS) {
  console.log(`\n─── ${vp.name} (${vp.width}×${vp.height}) ───`);
  const page = await browser.newPage();
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    deviceScaleFactor: 1,
  });
  await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 600));

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Open editor/i.test(b.textContent ?? ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 600));
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

  // Expose the Fabric canvas instance via the upper-canvas DOM node.
  // In Fabric v7 the upper canvas has a back-pointer `.canvas` to the
  // Fabric Canvas instance.
  if (vp.mobile) {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /Open tools/i.test(b.getAttribute("aria-label") ?? ""),
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
  }
  // Tap Crop tool (aria-label is "Crop & rotate").
  const cropClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-label="Crop & rotate"]'))[0];
    if (!btn) return false;
    btn.click();
    return true;
  });
  console.log(`  Crop tool clicked: ${cropClicked}`);
  await new Promise((r) => setTimeout(r, 1200));

  // Confirm the tool is actually active.
  const activeTool = await page.evaluate(() => window.__editorDebug?.toolState?.activeTool);
  console.log(`  activeTool: ${activeTool}`);
  if (activeTool !== "crop") {
    console.log("  ⚠️  Crop tool didn't activate");
    ok = false;
    await page.close();
    continue;
  }

  // Read crop rect bounds via the dimension inputs (W/H/X/Y) the
  // CropPanel renders. Each is an <input type="number"> with a label
  // sibling. They're driven by Fabric's object:moving / object:scaling
  // events, so they reflect the live rect.
  const readBox = async () => {
    return page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
      const byLabel = {};
      for (const inp of inputs) {
        const lbl = inp.previousElementSibling?.textContent?.trim();
        if (lbl) byLabel[lbl] = Number(inp.value);
      }
      return byLabel;
    });
  };
  const before = await readBox();
  console.log(`  before: ${JSON.stringify(before)}`);
  if (!Number.isFinite(before.W) || !Number.isFinite(before.H)) {
    console.log("  ⚠️  Crop dimension inputs not found");
    ok = false;
    await page.close();
    continue;
  }

  // Compute the rect's CENTER in screen space and drag from there.
  // Dragging the centre tests "Fabric receives moves while we're
  // interactive" (the bug we're fixing) without needing to hit a
  // small corner handle's exact pixel position.
  const docDims = await page.evaluate(() => window.__editorDebug?.docDims);
  const handle = await page.evaluate(() => {
    const upper = document.querySelector("canvas.upper-canvas");
    if (!upper) return null;
    const r = upper.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  });
  const docAspect = docDims.w / docDims.h;
  const canvasAspect = handle.w / handle.h;
  const fitW = docAspect > canvasAspect ? handle.w : handle.h * docAspect;
  const fitH = docAspect > canvasAspect ? handle.w / docAspect : handle.h;
  const imageLeft = handle.left + (handle.w - fitW) / 2;
  const imageTop = handle.top + (handle.h - fitH) / 2;
  const scale = fitW / docDims.w;
  const rectCx = before.X + before.W / 2;
  const rectCy = before.Y + before.H / 2;
  const startX = imageLeft + rectCx * scale;
  const startY = imageTop + rectCy * scale;

  const historyBefore = await page.evaluate(() => window.__editorDebug?.historyLength?.() ?? -1);
  console.log(`  history length before drag: ${historyBefore}`);

  // Move the rect up-left by ~80 px in screen space — both axes have
  // room (X=257, Y=343 in doc space) and a Move event firing means
  // Fabric saw the drag.
  const endX = startX - 80;
  const endY = startY - 80;
  console.log(
    `  drag (${startX.toFixed(0)},${startY.toFixed(0)}) → (${endX.toFixed(0)},${endY.toFixed(0)})`,
  );

  if (vp.mobile) {
    await page.touchscreen.touchStart(startX, startY);
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      await page.touchscreen.touchMove(startX + (endX - startX) * t, startY + (endY - startY) * t);
      await new Promise((r) => setTimeout(r, 25));
    }
    await page.touchscreen.touchEnd();
  } else {
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      await page.mouse.move(startX + (endX - startX) * t, startY + (endY - startY) * t);
      await new Promise((r) => setTimeout(r, 25));
    }
    await page.mouse.up();
  }
  await new Promise((r) => setTimeout(r, 600));

  const after = await readBox();
  const historyAfter = await page.evaluate(() => window.__editorDebug?.historyLength?.() ?? -1);
  console.log(`  after: ${JSON.stringify(after)}`);
  console.log(`  history length after drag: ${historyAfter}`);

  // Move gesture: X / Y should change; W / H may or may not (clamping).
  const xChanged = Math.abs(after.X - before.X) > 50;
  const yChanged = Math.abs(after.Y - before.Y) > 50;
  const moved = xChanged || yChanged;
  const historyClean = historyAfter <= historyBefore + 1;
  console.log(`  rect changed: ${moved}, history clean: ${historyClean}`);
  if (!moved) {
    console.log(`  ❌ FAIL ${vp.name}: drag had no effect on rect`);
    ok = false;
  }
  if (!historyClean) {
    console.log(
      `  ❌ FAIL ${vp.name}: history grew by ${historyAfter - historyBefore} (should be ≤ 1)`,
    );
    ok = false;
  }
  if (moved && historyClean) console.log(`  ✓ ${vp.name} drag works, history clean`);

  const out = `/tmp/cloakimg-cropdrag-${vp.name}.png`;
  await page.screenshot({ path: out });
  await page.close();
}

await browser.close();
if (!ok) {
  console.log("\nFAIL");
  process.exit(1);
}
console.log("\nPASS: crop drag works on desktop + mobile, history stays clean ✓");
