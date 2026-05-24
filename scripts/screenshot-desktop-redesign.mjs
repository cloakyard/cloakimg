// screenshot-desktop-redesign.mjs — Capture a desktop screenshot after
// the V3 desktop redesign (cream canvas matte, softened chrome). Useful
// for visual regression and confirming the airy treatment landed.
//
// Usage:
//   pnpm exec vp dev                           # in another shell
//   BASE_URL=http://localhost:5173 \
//     node scripts/screenshot-desktop-redesign.mjs

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
const OUT = resolve(ROOT, "/tmp/cloakimg-desktop-redesign.png");

if (!existsSync(chromePath) || !existsSync(TEST_JPG)) {
  console.error("Chrome or test fixture missing");
  process.exit(1);
}

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-desktop-shot-"));
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1440, height: 900 },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});

const page = await browser.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });

await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Open editor/i.test(b.textContent ?? ""),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1200));

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

await page.screenshot({ path: OUT, fullPage: false });
console.log(`Saved ${OUT}`);

// Click through Adjust → Emoji to capture the panel cross-fade.
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t = (b.textContent ?? "") + " " + (b.getAttribute("aria-label") ?? "");
    return /Adjust/i.test(t);
  });
  btn?.click();
});
await new Promise((r) => setTimeout(r, 800));
const adjustOut = OUT.replace(".png", "-adjust.png");
await page.screenshot({ path: adjustOut, fullPage: false });
console.log(`Saved ${adjustOut}`);

await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t = (b.textContent ?? "") + " " + (b.getAttribute("aria-label") ?? "");
    return /Emoji/i.test(t);
  });
  btn?.click();
});
await new Promise((r) => setTimeout(r, 800));
const emojiOut = OUT.replace(".png", "-emoji.png");
await page.screenshot({ path: emojiOut, fullPage: false });
console.log(`Saved ${emojiOut}`);

await browser.close();
process.exit(0);
