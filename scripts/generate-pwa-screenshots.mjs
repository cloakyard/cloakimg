// Capture the actual Air editor with a local photographic test fixture.
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--user-data-dir=${mkdtempSync(resolve(tmpdir(), "cloakimg-pwa-shots-"))}`,
  ],
});
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
try {
  for (const [name, width, height, scale] of [
    ["iPhone", 430, 932, 3],
    ["iPad", 1024, 768, 2],
  ]) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: scale,
      isMobile: width < 768,
      hasTouch: true,
    });
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await page.goto(baseUrl, { waitUntil: "networkidle2" });
    await page
      .waitForSelector('button[aria-label="Dismiss offline status"]', { timeout: 5000 })
      .catch(() => undefined);
    const notice = await page.$('button[aria-label="Dismiss offline status"]');
    if (notice) await notice.click();
    await (
      await page.$('input[type="file"]')
    ).uploadFile(resolve(root, "scripts/fixtures/orange.webp"));
    await page.waitForSelector('.editor-topbar button[aria-label="Export"]:not(:disabled)');
    await page.evaluate(() => {
      const adjust = [...document.querySelectorAll(".editor-compact-nav button")].find(
        (button) => button.textContent.trim() === "Adjust",
      );
      if (!adjust) throw new Error("Compact Adjust shortcut missing");
      adjust.click();
    });
    await page.waitForFunction(
      () =>
        !document.querySelector("[data-tool-panel-loading]") &&
        (document.querySelector('.editor-mobile-surface [role="slider"]') ||
          document.querySelector('.editor-properties [role="slider"]')),
    );
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(width / 2, height / 2);
    const valid = await page.evaluate(
      () =>
        document.documentElement.scrollWidth === innerWidth &&
        !!document.querySelector("canvas.upper-canvas"),
    );
    if (!valid || errors.length) throw new Error(`Capture failed: ${errors.join("; ")}`);
    const path = resolve(root, `public/screenshots/${name}.png`);
    await page.screenshot({ path });
    if (statSync(path).size < 20000) throw new Error(`Empty capture: ${path}`);
    console.log(`Saved ${name}: ${width * scale}×${height * scale}`);
    await page.close();
  }
} finally {
  await browser.close();
}
