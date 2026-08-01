// probe-history-bar.mjs — Reproduce the user's "history bar cut off"
// bug. Open the editor, commit two trivial Adjust changes (so the
// scrubber unhides), then screenshot.

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

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-hist-"));
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
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
await new Promise((r) => setTimeout(r, 4000));

// Drive a few Adjust commits to populate history.
for (let i = 0; i < 4; i++) {
  await page.evaluate((n) => {
    const w = window;
    const cur = w.__editorDebug.toolState.adjust;
    const next = Array.isArray(cur) ? [...cur] : [];
    next[0] = 0.55 + n * 0.05;
    w.__editorDebug.patchTool("adjust", next);
  }, i);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-label="Move"]'))[0];
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-label="Adjust"]'))[0];
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
}

await new Promise((r) => setTimeout(r, 800));
const out = "/tmp/cloakimg-history-bug.png";
await page.screenshot({ path: out, fullPage: false });
console.log(`Saved ${out}`);

// Also measure the actual bounding box of the history scrubber.
const measure = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="history-scrubber"]');
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const thumbs = Array.from(el.querySelectorAll("button"));
  const thumbRects = thumbs.map((t) => {
    const rr = t.getBoundingClientRect();
    return { w: rr.width, h: rr.height, top: rr.top, bottom: rr.bottom };
  });
  const parent = el.parentElement;
  const pr = parent?.getBoundingClientRect();
  return {
    found: true,
    scrubber: { w: r.width, h: r.height, top: r.top, bottom: r.bottom },
    parent: pr ? { w: pr.width, h: pr.height, top: pr.top, bottom: pr.bottom } : null,
    thumbs: thumbRects,
  };
});
console.log(JSON.stringify(measure, null, 2));

await browser.close();
