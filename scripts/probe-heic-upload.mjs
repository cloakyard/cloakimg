// probe-heic-upload.mjs — Isolated reproduction for the user's report
// that HEIC files fail to upload while JPEG works. We exercise the
// same drop-zone path the UI uses, capture every console + worker
// error, and fail loudly if the editor doesn't open.
//
// Usage:
//   pnpm exec vp dev                      # in another shell
//   BASE_URL=http://localhost:5173 \
//     node scripts/probe-heic-upload.mjs

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME;
const baseUrl = process.env.BASE_URL || "http://localhost:5173";

const TEST_HEIC = resolve(ROOT, "test-fixtures/IMG_1804.heic");

if (!existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}`);
  process.exit(1);
}
if (!existsSync(TEST_HEIC)) {
  console.error(`Test HEIC not found at ${TEST_HEIC}`);
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1400, height: 900 },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const page = await browser.newPage();

const consoleLogs = [];
page.on("console", (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push({ message: err.message, stack: err.stack }));
page.on("workererror", (err) => pageErrors.push({ message: `[worker] ${err.message}` }));

console.log(`→ Navigating to ${baseUrl}`);
await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });

console.log("→ Open editor");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Open editor/i.test(b.textContent ?? ""),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1500));
await page.waitForSelector('input[type="file"]', { timeout: 10000 });
const fileInputs = await page.$$('input[type="file"]');
console.log(`→ Uploading HEIC: ${TEST_HEIC}`);
await fileInputs[0].uploadFile(TEST_HEIC);

// Wait for either the "Open in editor" confirmation OR an error.
console.log("→ Waiting up to 30s for confirmation OR error message…");
const start = Date.now();
let outcome = "timeout";
while (Date.now() - start < 30000) {
  const tick = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const openBtn = buttons.find((b) => /Open in editor/i.test(b.textContent ?? ""));
    const allText = document.body.innerText.slice(0, 4000);
    const errorMatch = allText.match(/(error|failed|couldn'?t|unable|can'?t)[^.]*\./i);
    return {
      openVisible: !!openBtn,
      errorText: errorMatch ? errorMatch[0] : null,
      bodyHead: allText.slice(0, 500),
    };
  });
  if (tick.openVisible) {
    outcome = "ready";
    break;
  }
  if (tick.errorText) {
    outcome = `error: ${tick.errorText}`;
    console.log(`  ${(Date.now() - start) / 1000}s body:`, tick.bodyHead);
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(`→ Outcome: ${outcome}`);

// If "Open in editor" appeared, click it and verify the editor mounts.
if (outcome === "ready") {
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Open in editor/i.test(b.textContent ?? ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 4000));
  const editorReady = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("button")).some((b) =>
      /redact/i.test(
        (b.textContent ?? "") +
          " " +
          (b.getAttribute("title") ?? "") +
          " " +
          (b.getAttribute("aria-label") ?? ""),
      ),
    );
  });
  console.log(`→ Editor mounted (Redact tool present): ${editorReady}`);
}

console.log("\n========================================");
console.log("Console logs (filtered to HEIC / decode / error / warn):");
console.log("========================================");
for (const log of consoleLogs) {
  if (
    log.type === "error" ||
    log.type === "warning" ||
    /heic|heif|libheif|decode|wasm-bundle|drop|upload|file/i.test(log.text)
  ) {
    console.log(`  [${log.type}] ${log.text.slice(0, 320)}`);
  }
}

console.log("\nPage errors:");
for (const err of pageErrors) console.log(`  ${err.message}`);

await browser.close();
process.exit(0);
