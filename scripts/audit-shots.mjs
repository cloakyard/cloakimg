// audit-shots.mjs — Capture landing + editor at 3 viewports for design audit.

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

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-audit-"));
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "tablet", width: 820, height: 1180, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: VIEWPORTS[0],
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});

for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    deviceScaleFactor: 2,
  });
  await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));

  // Landing — full page
  const landingOut = `/tmp/cloakimg-audit-${vp.name}-landing.png`;
  await page.screenshot({ path: landingOut, fullPage: true });
  console.log(`Saved ${landingOut}`);

  // Open editor
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Open editor/i.test(b.textContent ?? ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 800));

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

  const editorOut = `/tmp/cloakimg-audit-${vp.name}-editor.png`;
  await page.screenshot({ path: editorOut, fullPage: false });
  console.log(`Saved ${editorOut}`);

  // On desktop/tablet, capture a tool panel open (Adjust)
  if (!vp.mobile) {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => {
        const t = (b.textContent ?? "") + " " + (b.getAttribute("aria-label") ?? "");
        return /^Adjust/i.test(t.trim());
      });
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 700));
    const adjustOut = `/tmp/cloakimg-audit-${vp.name}-editor-adjust.png`;
    await page.screenshot({ path: adjustOut, fullPage: false });
    console.log(`Saved ${adjustOut}`);
  } else {
    // On mobile, tap the bottom "Tools" pill to expand picker
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /Open tools/i.test(b.getAttribute("aria-label") ?? ""),
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 700));
    const pickerOut = `/tmp/cloakimg-audit-${vp.name}-editor-picker.png`;
    await page.screenshot({ path: pickerOut, fullPage: false });
    console.log(`Saved ${pickerOut}`);
  }

  await page.close();
}

await browser.close();
console.log("done");
