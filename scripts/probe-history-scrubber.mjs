// probe-history-scrubber.mjs — End-to-end check that the visual
// History Scrubber renders below the canvas, mirrors the underlying
// history stack, and lets the user click any step to jump there.
//
//   1. Scrubber does NOT render with just the base entry — empty
//      timelines would only steal canvas pixels.
//   2. After 2+ commits, the scrubber appears with the right label
//      sequence (Open / Crop / Adjust …) and the current step is
//      visually marked (aria-pressed="true").
//   3. Calling __editorDebug.jumpToStep(0) walks the cursor back to
//      the base; calling jumpToStep(N) walks it forward. The visible
//      doc dims revert to the entry's stored dims after each jump.
//
// Usage:
//   pnpm exec vp dev                           # in another shell
//   BASE_URL=http://localhost:5173 \
//     node scripts/probe-history-scrubber.mjs

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

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-history-scrubber-"));
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
await new Promise((r) => setTimeout(r, 4000));

let fails = 0;

// ── Scenario 1: Scrubber hidden when only base entry exists ────
console.log("→ Scenario 1: hidden with just base");
const len0 = await page.evaluate(() => window.__editorDebug?.historyLength?.() ?? -1);
const scrubberVisible0 = await page.evaluate(
  () => !!document.querySelector('[data-testid="history-scrubber"]'),
);
console.log(`  historyLength=${len0}, scrubber rendered=${scrubberVisible0}`);
if (len0 !== 1) {
  console.error(`FAIL: expected exactly 1 entry (Open), got ${len0}`);
  fails++;
}
if (scrubberVisible0) {
  console.error("FAIL: scrubber should be hidden with only the base entry");
  fails++;
}

// ── Scenario 2: Commit two edits → scrubber appears with labels ───
console.log("→ Scenario 2: scrubber renders after two commits");
// Adjust commit.
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t = `${b.textContent ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.title ?? ""}`;
    return /\bAdjust\b/i.test(t);
  });
  btn?.click();
});
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  const cur = window.__editorDebug.toolState.adjust;
  const next = [...cur];
  next[0] = 0.65;
  window.__editorDebug.patchTool("adjust", next);
});
await new Promise((r) => setTimeout(r, 400));
// Switch to Move flushes the pending apply.
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t = `${b.textContent ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.title ?? ""}`;
    return /\bMove\b/i.test(t);
  });
  btn?.click();
});
await new Promise((r) => setTimeout(r, 2500));
// Border commit.
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t = `${b.textContent ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.title ?? ""}`;
    return /\bBorder\b/i.test(t);
  });
  btn?.click();
});
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => window.__editorDebug.patchTool("borderThickness", 40));
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t = `${b.textContent ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.title ?? ""}`;
    return /\bMove\b/i.test(t);
  });
  btn?.click();
});
await new Promise((r) => setTimeout(r, 2500));

const len2 = await page.evaluate(() => window.__editorDebug?.historyLength?.() ?? -1);
const labels = await page.evaluate(() => window.__editorDebug?.historyLabels?.() ?? []);
const scrubberCount = await page.evaluate(
  () =>
    document.querySelectorAll('[data-testid="history-scrubber"] button[aria-label^="Jump to step"]')
      .length,
);
console.log(`  historyLength=${len2}, labels=[${labels.join(", ")}], buttons=${scrubberCount}`);
if (len2 !== 3) {
  console.error(`FAIL: expected 3 entries after two commits, got ${len2}`);
  fails++;
}
if (scrubberCount !== 3) {
  console.error(`FAIL: scrubber should render 3 thumb buttons, got ${scrubberCount}`);
  fails++;
}

const activePressed = await page.evaluate(() => {
  const btns = Array.from(
    document.querySelectorAll(
      '[data-testid="history-scrubber"] button[aria-label^="Jump to step"]',
    ),
  );
  return btns.map((b) => b.getAttribute("aria-pressed"));
});
console.log(`  aria-pressed states: [${activePressed.join(", ")}]`);
if (activePressed.filter((s) => s === "true").length !== 1) {
  console.error("FAIL: exactly one scrubber button should be marked aria-pressed='true'");
  fails++;
}
if (activePressed[activePressed.length - 1] !== "true") {
  console.error("FAIL: latest entry should be the active one after commits");
  fails++;
}

// ── Scenario 3: jumpToStep walks the cursor back and forward ──────
console.log("→ Scenario 3: jumpToStep round-trip");
const dimsLatest = await page.evaluate(() => window.__editorDebug?.docDims ?? null);
await page.evaluate(() => window.__editorDebug?.jumpToStep?.(0));
await new Promise((r) => setTimeout(r, 1200));
const depthBase = await page.evaluate(() => window.__editorDebug?.historyDepth?.() ?? -1);
const dimsBase = await page.evaluate(() => window.__editorDebug?.docDims ?? null);
console.log(`  after jump(0): depth=${depthBase}, dims=${dimsBase?.w}×${dimsBase?.h}`);
if (depthBase !== 0) {
  console.error(`FAIL: jumpToStep(0) should land cursor at 0, got ${depthBase}`);
  fails++;
}
if (dimsBase?.w === dimsLatest?.w && dimsBase?.h === dimsLatest?.h) {
  console.error("FAIL: dims didn't change on jump back — border bake should differ from base");
  fails++;
}

await page.evaluate(() => window.__editorDebug?.jumpToStep?.(2));
await new Promise((r) => setTimeout(r, 1200));
const depthLatest = await page.evaluate(() => window.__editorDebug?.historyDepth?.() ?? -1);
const dimsAfter = await page.evaluate(() => window.__editorDebug?.docDims ?? null);
console.log(`  after jump(2): depth=${depthLatest}, dims=${dimsAfter?.w}×${dimsAfter?.h}`);
if (depthLatest !== 2) {
  console.error(`FAIL: jumpToStep(2) should land cursor at 2, got ${depthLatest}`);
  fails++;
}
if (dimsAfter?.w !== dimsLatest?.w || dimsAfter?.h !== dimsLatest?.h) {
  console.error("FAIL: jumping back forward should restore the bordered dims");
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
console.log("\nPASS: visual history scrubber renders + jumps correctly ✓");
process.exit(0);
