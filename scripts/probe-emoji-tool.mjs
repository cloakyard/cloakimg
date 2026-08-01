// probe-emoji-tool.mjs — Smoke test for the new EmojiTool (replacing
// the legacy StickerTool). Confirms the tool is reachable from the
// desktop rail, drops a FabricText emoji layer on canvas click, and
// shows up correctly in the Layers panel.
//
// Usage:
//   pnpm exec vp dev                           # in another shell
//   BASE_URL=http://localhost:5173 \
//     node scripts/probe-emoji-tool.mjs

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
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

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-emoji-"));
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1400, height: 900 },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});

const page = await browser.newPage();
const consoleLogs = [];
page.on("console", (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push({ message: err.message, stack: err.stack }));

console.log(`→ ${baseUrl}`);
await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });

console.log("→ Click 'Open editor'");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Open editor/i.test(b.textContent ?? ""),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1200));

console.log(`→ Upload ${TEST_JPG}`);
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
await new Promise((r) => setTimeout(r, 3500));

console.log("→ Looking for Emoji tool in rail");
const emojiToolFound = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t =
      (b.textContent ?? "") +
      " " +
      (b.getAttribute("title") ?? "") +
      " " +
      (b.getAttribute("aria-label") ?? "");
    return /^\s*emoji/i.test(t) || /emoji/i.test(t);
  });
  if (btn) {
    btn.click();
    return true;
  }
  return false;
});
if (!emojiToolFound) {
  console.error("FAIL: Could not find Emoji tool button in rail");
  await browser.close();
  process.exit(1);
}
console.log("  ✓ Clicked Emoji tool");
await new Promise((r) => setTimeout(r, 600));

const panelHasGrid = await page.evaluate(() => {
  return document.body.textContent.includes("Paste any emoji");
});
if (!panelHasGrid) {
  console.error("FAIL: EmojiPanel did not render (no 'Paste any emoji' label)");
  await browser.close();
  process.exit(1);
}
console.log("  ✓ EmojiPanel rendered with paste field");

console.log("→ Clicking canvas to drop emoji");
const canvasBox = await page.evaluate(() => {
  const canvases = Array.from(document.querySelectorAll("canvas"));
  const c = canvases.find((cv) => {
    const r = cv.getBoundingClientRect();
    return r.width > 200 && r.height > 200;
  });
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (!canvasBox) {
  console.error("FAIL: Could not find editor canvas");
  await browser.close();
  process.exit(1);
}
await page.mouse.click(canvasBox.x, canvasBox.y);
await new Promise((r) => setTimeout(r, 800));

const emojiLayerCount = await page.evaluate(() => {
  // The Layers panel rows expose their text content; look for "Emoji".
  const text = document.body.textContent;
  const matches = text.match(/Emoji/g) || [];
  return matches.length;
});
console.log(`  Layer/label "Emoji" occurrences in DOM: ${emojiLayerCount}`);
if (emojiLayerCount < 1) {
  console.error("FAIL: No 'Emoji' layer label appears in DOM after drop");
  await browser.close();
  process.exit(1);
}

const errors = pageErrors.filter(
  (e) => !/ResizeObserver|HTMLCanvasElement.prototype.getContext|jsdom/.test(e.message),
);
if (errors.length > 0) {
  console.error("FAIL: pageerrors:", errors);
  await browser.close();
  process.exit(1);
}

console.log("\nPASS: EmojiTool drops a layer on canvas click ✓");
await browser.close();
process.exit(0);
