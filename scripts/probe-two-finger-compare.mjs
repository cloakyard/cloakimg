// probe-two-finger-compare.mjs — Verify the new "rest two fingers on
// the photo to compare with original" mobile gesture. The mobile
// redesign hides the on-canvas compare pill (overlays would crowd the
// cream canvas), so we read `compareActive` straight from the editor's
// __editorDebug API instead of via the pill's aria-pressed attribute.
//
// Three scenarios:
//   1. Touch with TWO fingers + hold still for ~600 ms →
//      compareActive flips true; release → flips back to false.
//   2. Touch with two fingers but LIFT quickly (~150 ms) → no
//      compare-state flip (that's the two-finger-tap → undo gesture).
//   3. Touch with two fingers + IMMEDIATELY PINCH → no compare-state
//      flip (pinch should not get hijacked by the long-press).

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

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-twofinger-"));
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: {
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});

const page = await browser.newPage();
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
await fileInputs.at(-1).uploadFile(TEST_JPG);
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

// The CDP Touch dispatch doesn't drive React's pointer event system the
// way native touch does — but the canvas container listens to React
// pointer events (onPointerDown/Move/Up), so we'll use the lower-level
// Input.dispatchTouchEvent which feeds the Chromium event pipeline.
const client = await page.target().createCDPSession();

// Canvas screen center.
const handle = await page.evaluate(() => {
  const upper = document.querySelector("canvas.upper-canvas");
  if (!upper) return null;
  const r = upper.getBoundingClientRect();
  return { left: r.left, top: r.top, w: r.width, h: r.height };
});
if (!handle) {
  console.error("FAIL: no upper-canvas");
  await browser.close();
  process.exit(1);
}
const cx = handle.left + handle.w / 2;
const cy = handle.top + handle.h / 2;

// The mobile redesign hides the on-canvas compare pill (overlays would
// crowd the cream canvas), so we read compare state straight from the
// editor's debug API instead of via aria-pressed on the pill.
const readCompare = () => page.evaluate(() => window.__editorDebug?.compareActive ?? null);

let fails = 0;

console.log("─── Scenario 1: two-finger long-press → compare on ───");
console.log(`  initial compareActive=${await readCompare()}`);
const p1 = { x: cx - 30, y: cy };
const p2 = { x: cx + 30, y: cy };
await client.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [
    { x: p1.x, y: p1.y, id: 0 },
    { x: p2.x, y: p2.y, id: 1 },
  ],
});
// Hold still for 600 ms — comfortably past TWO_FINGER_HOLD_MS=420.
await new Promise((r) => setTimeout(r, 600));
const heldCompare = await readCompare();
console.log(`  during hold: compareActive=${heldCompare}`);
if (heldCompare !== true) {
  console.error("FAIL: long-press did not engage compareActive");
  fails++;
}
await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise((r) => setTimeout(r, 200));
const afterCompare = await readCompare();
console.log(`  after release: compareActive=${afterCompare}`);
if (afterCompare !== false) {
  console.error("FAIL: release did not restore edit view");
  fails++;
}

console.log("\n─── Scenario 2: quick two-finger tap → undo (no compare) ───");
await client.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [
    { x: p1.x, y: p1.y, id: 0 },
    { x: p2.x, y: p2.y, id: 1 },
  ],
});
await new Promise((r) => setTimeout(r, 150));
await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise((r) => setTimeout(r, 250));
const tapCompare = await readCompare();
console.log(`  after quick tap: compareActive=${tapCompare}`);
if (tapCompare !== false) {
  console.error("FAIL: quick two-finger tap engaged compare (should not)");
  fails++;
}

console.log("\n─── Scenario 3: pinch (move during hold window) → no compare ───");
await client.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [
    { x: p1.x, y: p1.y, id: 0 },
    { x: p2.x, y: p2.y, id: 1 },
  ],
});
// Spread fingers immediately, then hold.
for (let i = 1; i <= 8; i++) {
  const t = i / 8;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: p1.x - 40 * t, y: p1.y, id: 0 },
      { x: p2.x + 40 * t, y: p2.y, id: 1 },
    ],
  });
  await new Promise((r) => setTimeout(r, 30));
}
// Continue holding to see if the (now-cancelled) timer would fire.
await new Promise((r) => setTimeout(r, 500));
const pinchCompare = await readCompare();
console.log(`  during pinch hold: compareActive=${pinchCompare}`);
if (pinchCompare !== false) {
  console.error("FAIL: pinch gesture hijacked into compare");
  fails++;
}
await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise((r) => setTimeout(r, 200));

await browser.close();
if (fails > 0) {
  console.log(`\nFAIL (${fails} scenario(s))`);
  process.exit(1);
}
console.log("\nPASS: two-finger long-press compare gesture works, pinch + tap unaffected ✓");
