// screenshot-mobile-redesign.mjs — Capture three mobile-viewport
// screenshots of the V3 minimalist chrome:
//   1. Canvas idle (single floating "Tools" pill)
//   2. Tools picker open (full-screen grid modal)
//   3. In-tool view (Adjust active, MobileSheet showing controls + ✕/✓)
//
// Outputs to .tmp/mobile-redesign-*.png so we can eyeball them
// without having to spin up a real device. Mirrors the iPhone 14 Pro
// viewport size (393×852 CSS px, devicePixelRatio: 3) so the
// screenshots match what a phone user would see.
//
// Usage:
//   pnpm exec vp dev   # in another shell
//   node scripts/screenshot-mobile-redesign.mjs

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, ".tmp");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME;
const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const TEST_JPG = resolve(ROOT, "test-fixtures/IMG_1804.jpg");

if (!existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}`);
  process.exit(1);
}
if (!existsSync(TEST_JPG)) {
  console.error(`Test image not found at ${TEST_JPG}`);
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: {
    // iPhone 14 Pro CSS viewport
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

// Disable HTTP cache so a stale style.css from a previous run doesn't
// hide the cream-matte change we just shipped.
await page.setCacheEnabled(false);

// Force light colour-scheme — without this the screenshot honours the
// macOS system theme (often dark on dev boxes) and we'd be looking at
// the dark-mode treatment when the user's reference is the light one.
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

console.log(`→ Goto ${baseUrl}`);
await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });

// Sanity print: what's the actual computed --canvas-bg?
const canvasBg = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--canvas-bg").trim(),
);
console.log(`→ Computed --canvas-bg on this viewport: "${canvasBg}"`);

console.log("→ Open editor");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Open editor/i.test(b.textContent ?? ""),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1500));

console.log(`→ Upload ${TEST_JPG}`);
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
console.log("→ Wait for editor to mount");
await new Promise((r) => setTimeout(r, 5000));

// Close MobileSheet so we capture the canvas-idle view first.
await page.evaluate(() => {
  // The MobileSheet's drag handle has aria-label that includes "Close panel"
  const handle = Array.from(document.querySelectorAll("button")).find((b) =>
    /Close panel/i.test(b.getAttribute("aria-label") ?? ""),
  );
  handle?.click();
});
await new Promise((r) => setTimeout(r, 600));

// 1. Canvas idle.
const out1 = resolve(OUT_DIR, "mobile-redesign-1-canvas-idle.png");
await page.screenshot({ path: out1, fullPage: false });
console.log(`✓ ${out1}`);

// 2. Open Tools picker via the floating pill (V3 aria-label: "Open tools").
console.log("→ Tap pill");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") ?? "").trim() === "Open tools",
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 500));
const out2 = resolve(OUT_DIR, "mobile-redesign-2-tools-picker.png");
await page.screenshot({ path: out2, fullPage: false });
console.log(`✓ ${out2}`);

// 3. Pick "Adjust" from the picker → in-tool view (tall tool, hits cap).
console.log("→ Pick Adjust from picker");
await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"][aria-label="Tools"]');
  if (!dialog) return;
  const btn = Array.from(dialog.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") ?? "").trim() === "Adjust",
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1500));
const out3 = resolve(OUT_DIR, "mobile-redesign-3-in-tool.png");
await page.screenshot({ path: out3, fullPage: false });
console.log(`✓ ${out3}`);

// 4. Dismiss → re-open picker → pick Perspective (short tool, should
//    auto-size and not waste space). Tests V3.5 auto-height behavior.
console.log("→ Dismiss tool");
await page.evaluate(() => {
  const close = Array.from(document.querySelectorAll("button")).find((b) =>
    /Close — drag down/i.test(b.getAttribute("aria-label") ?? ""),
  );
  close?.click();
});
await new Promise((r) => setTimeout(r, 700));
console.log("→ Re-open picker, pick Perspective");
await page.evaluate(() => {
  const tools = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") ?? "").trim() === "Open tools",
  );
  tools?.click();
});
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"][aria-label="Tools"]');
  if (!dialog) return;
  const btn = Array.from(dialog.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") ?? "").trim() === "Perspective",
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1200));
const out4 = resolve(OUT_DIR, "mobile-redesign-4-perspective-autosize.png");
await page.screenshot({ path: out4, fullPage: false });
console.log(`✓ ${out4}`);

await browser.close();
console.log("\nDone — open the three PNGs in .tmp/ to compare against the reference.");
process.exit(0);
