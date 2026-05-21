// probe-tool-cancel.mjs — Regression test for the desktop tool-session
// commit + cancel parity:
//
//   1. Tool-switch race fix — Crop's apply now runs WHILE Crop's stage
//      hook is still mounted (so findCropRect can find the rect),
//      because setActiveTool awaits the pending apply before
//      unmounting. Pre-fix: clicking another tool while Crop had a
//      pending bake silently dropped the crop because findCropRect
//      returned null after the unmount cleanup removed the overlay.
//
//   2. Cancel parity — cancelCurrentTool (exposed on the editor
//      context, surfaced as Esc + a Cancel button in the
//      PropertiesPanel header) discards a pending apply AND undoes
//      back to the tool-entry checkpoint, just like mobile's ✕.
//
// Usage:
//   pnpm exec vp dev                           # in another shell
//   BASE_URL=http://localhost:5173 \
//     node scripts/probe-tool-cancel.mjs

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

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-cancel-"));
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
await inputs[0].uploadFile(TEST_JPG);
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

async function clickTool(toolName) {
  return page.evaluate((label) => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => {
      const t =
        (b.textContent ?? "") + " " + (b.getAttribute("aria-label") ?? "") + " " + (b.title ?? "");
      return new RegExp(`\\b${label}\\b`, "i").test(t);
    });
    if (!btn) return false;
    btn.click();
    return true;
  }, toolName);
}

function recordDepth() {
  return page.evaluate(() => window.__editorDebug?.historyDepth?.() ?? -1);
}

let fails = 0;

// ── Scenario 1: Crop-on-tool-switch commits cleanly ───────────────
// Switch to Crop, set rotationDeg to a non-zero value so the apply's
// `noTransform` check fails (driving the bake from React state alone,
// without needing the Fabric overlay rect to be moved). Then switch
// to Adjust — the pending apply should fire BEFORE Crop unmounts so
// findCropRect() resolves and the crop+rotate actually bakes.
// Pre-fix: setActiveTool fired the apply async via `void runBusy`,
// React unmounted Crop first, the unmount cleanup removed the rect
// from Fabric, and findCropRect returned null → silent no-op. Post-
// fix: setActiveTool awaits the apply, history depth bumps by one.
console.log("→ Scenario 1: Crop → switch to Adjust");
const initialDepth = await recordDepth();
console.log(`  initial historyDepth: ${initialDepth}`);

if (!(await clickTool("Crop"))) {
  console.error("FAIL: Crop button not found");
  fails++;
}
await new Promise((r) => setTimeout(r, 600));

// Drive Crop apply from panel state: rotationDeg=5 makes the apply's
// `noTransform` check false, so the bake runs regardless of whether
// the Fabric rect has been moved. The actual rotation value is
// arbitrary — only the not-zero matters for "not identity".
await page.evaluate(() => window.__editorDebug.patchTool("rotationDeg", 5));
await new Promise((r) => setTimeout(r, 400));

await clickTool("Adjust");
await new Promise((r) => setTimeout(r, 2500)); // wait for runBusy spinner + commit
const afterSwitchDepth = await recordDepth();
console.log(`  after Crop→Adjust historyDepth: ${afterSwitchDepth}`);

if (afterSwitchDepth <= initialDepth) {
  console.error("FAIL: Crop apply did not commit a history entry on tool switch");
  fails++;
} else {
  console.log("  ✓ Crop committed via tool switch (depth bumped)");
}

// ── Scenario 2: cancelCurrentTool rolls back the crop ─────────────
// Switch back to Crop, set a new rotation, manually commit via Apply
// (so we have a history entry to roll back), then trigger the Cancel
// button. Depth should drop back to the pre-Crop depth, and the user
// should be parked on Move.
console.log("→ Scenario 2: Crop → cancelCurrentTool rolls back");
await clickTool("Crop");
await new Promise((r) => setTimeout(r, 500));
const preCropDepth = await recordDepth();
console.log(`  pre-Crop historyDepth: ${preCropDepth}`);

// rotationDeg → dirties the panel → useApplyOnToolSwitch registers
// a pending apply, which is enough for canCancelCurrentTool to flip
// true. We don't need to force the apply to actually commit before
// cancelling (cancel discards pending too).
await page.evaluate(() => window.__editorDebug.patchTool("rotationDeg", 10));
await new Promise((r) => setTimeout(r, 400));

// Trigger cancel via the PropertiesPanel header X button (the visible
// affordance the user would click).
const cancelClicked = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t = (b.getAttribute("aria-label") ?? "") + " " + (b.title ?? "");
    return /Cancel changes/i.test(t);
  });
  if (!btn) return false;
  btn.click();
  return true;
});
if (!cancelClicked) {
  console.error("FAIL: Cancel button not found in PropertiesPanel header");
  fails++;
}
await new Promise((r) => setTimeout(r, 1500));

const afterCancelDepth = await recordDepth();
const activeAfter = await page.evaluate(() => window.__editorDebug?.toolState?.activeTool ?? null);
console.log(`  after cancel historyDepth: ${afterCancelDepth}, activeTool=${activeAfter}`);
if (afterCancelDepth !== preCropDepth) {
  console.error(
    `FAIL: cancel did not restore history depth (expected ${preCropDepth}, got ${afterCancelDepth})`,
  );
  fails++;
}
if (activeAfter !== "move") {
  console.error("FAIL: cancel did not return user to Move tool");
  fails++;
}
if (cancelClicked && fails === 0) {
  console.log("  ✓ Cancel rolled back the crop session");
}

// ── Scenario 3: Esc key as cancel shortcut ────────────────────────
console.log("→ Scenario 3: Esc cancels the current tool");
await clickTool("Adjust");
await new Promise((r) => setTimeout(r, 400));
// Dirty the panel — adjust slot 0 is exposure.
await page.evaluate(() => {
  const cur = window.__editorDebug.toolState.adjust;
  const next = [...cur];
  next[0] = 0.8;
  window.__editorDebug.patchTool("adjust", next);
});
await new Promise((r) => setTimeout(r, 300));
const canCancelDirty = await page.evaluate(() =>
  Boolean(
    Array.from(document.querySelectorAll("button")).find((b) => {
      const t = (b.getAttribute("aria-label") ?? "") + " " + (b.title ?? "");
      return /Cancel changes/i.test(t);
    }),
  ),
);
console.log(`  cancel button visible after dirtying Adjust: ${canCancelDirty}`);

await page.keyboard.press("Escape");
await new Promise((r) => setTimeout(r, 1500));
const afterEsc = await page.evaluate(() => window.__editorDebug?.toolState?.activeTool ?? null);
console.log(`  active tool after Esc: ${afterEsc}`);
if (afterEsc !== "move") {
  console.error("FAIL: Esc did not return user to Move tool");
  fails++;
}
if (!canCancelDirty) {
  console.error("FAIL: Cancel button did not appear when Adjust was dirty");
  fails++;
}

const errors = pageErrors.filter((e) => !/ResizeObserver/.test(e.message));
if (errors.length > 0) {
  console.error(
    "pageerrors:",
    errors.map((e) => e.message),
  );
  fails++;
}

await browser.close();
if (fails > 0) {
  console.error(`\nFAIL: ${fails} regressions`);
  process.exit(1);
}
console.log("\nPASS: tool-switch race + cancel parity verified ✓");
process.exit(0);
