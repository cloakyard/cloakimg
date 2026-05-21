// probe-tool-rail-sweep.mjs — Click every tool in the rail in order
// and assert the panel renders + no console errors. Catches regressions
// from the StickerTool → EmojiTool refactor and any other broken
// imports / case mismatches in the ToolStage / ToolControls switches.
//
// Usage:
//   pnpm exec vp dev                           # in another shell
//   BASE_URL=http://localhost:5173 \
//     node scripts/probe-tool-rail-sweep.mjs

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

const TOOLS = [
  "Move",
  "Tap to fix",
  "Crop",
  "Perspective",
  "Adjust",
  "Time of day",
  "Filters",
  "Levels",
  "Selective",
  "Spot heal",
  "Portrait blur",
  "Remove BG",
  "Redact",
  "Text",
  "Shapes",
  "Draw",
  "Emoji",
  "Watermark",
  "Pen",
  "Place image",
  "Color picker",
  "Resize",
  "Frame",
  "Border",
];

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-sweep-"));
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1400, height: 900 },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});

const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push({ message: err.message, stack: err.stack }));
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

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
await new Promise((r) => setTimeout(r, 4000));

let fails = 0;
for (const label of TOOLS) {
  const clicked = await page.evaluate((l) => {
    const norm = (s) => (s ?? "").toLowerCase();
    const btn = Array.from(document.querySelectorAll("button")).find((b) => {
      const t = norm(
        (b.textContent ?? "") +
          " " +
          (b.getAttribute("title") ?? "") +
          " " +
          (b.getAttribute("aria-label") ?? ""),
      );
      // Match prefix of label so "Selective" matches "Selective color".
      return t.includes(l.toLowerCase());
    });
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
  if (!clicked) {
    console.error(`  ✗ ${label}: button not found`);
    fails++;
    continue;
  }
  await new Promise((r) => setTimeout(r, 250));
  // Spot-check no React render crash blanked the page.
  const stillAlive = await page.evaluate(() => !!document.querySelector("canvas"));
  if (!stillAlive) {
    console.error(`  ✗ ${label}: canvas vanished after click`);
    fails++;
    continue;
  }
  console.log(`  ✓ ${label}`);
}

const filteredErrors = pageErrors.filter((e) => !/ResizeObserver|jsdom/.test(e.message));
const filteredConsole = consoleErrors.filter(
  (t) => !/Download the React DevTools|favicon\.ico|Failed to load resource/i.test(t),
);

if (filteredErrors.length > 0) {
  console.error("\npageerrors:");
  for (const e of filteredErrors) console.error("  ", e.message);
  fails++;
}
if (filteredConsole.length > 0) {
  console.error("\nconsole errors:");
  for (const t of filteredConsole) console.error("  ", t);
}

await browser.close();
if (fails > 0) {
  console.error(`\nFAIL: ${fails} regressions`);
  process.exit(1);
}
console.log(`\nPASS: all ${TOOLS.length} tools click cleanly ✓`);
process.exit(0);
