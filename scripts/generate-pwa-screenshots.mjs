// Capture the actual Air editor with a local photographic test fixture.
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
try {
  for (const theme of ["light", "dark"])
    for (const [name, width, height, scale] of [
      ["iPhone", 430, 932, 3],
      ["iPad", 1024, 768, 2],
    ]) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
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
        { name: "prefers-color-scheme", value: theme },
        { name: "prefers-reduced-motion", value: "reduce" },
      ]);
      await page.evaluateOnNewDocument(() => {
        // Keep capture-only notices and personal drafts out of the isolated fixture.
        Object.defineProperty(navigator, "serviceWorker", { value: undefined });
      });
      await page.goto(baseUrl, { waitUntil: "networkidle2" });
      await (
        await page.$('input[type="file"]')
      ).uploadFile(resolve(root, "scripts/fixtures/orange.webp"));
      await page.waitForSelector('.editor-topbar button[aria-label="Export"]:not(:disabled)');
      if (await page.$(".editor-toolrail")) {
        await page.locator('.editor-toolrail button[aria-label="Adjust"]').click();
      } else {
        await page.locator('button[aria-label="Open tools"]').click();
        await page.locator('[role="option"][aria-label="Adjust"]').click();
        await page.waitForSelector("#tool-search-title", { hidden: true });
      }
      await page.waitForFunction(
        () =>
          !document.querySelector("[data-tool-panel-loading]") &&
          (document.querySelector('.editor-mobile-surface [role="slider"]') ||
            document.querySelector('.editor-properties [role="slider"]')),
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
        document.activeElement?.blur();
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      });
      await page.mouse.move(0, 0);
      const valid = await page.evaluate(
        () =>
          document.documentElement.scrollWidth === innerWidth &&
          !!document.querySelector("canvas.upper-canvas"),
      );
      if (!valid || errors.length) throw new Error(`Capture failed: ${errors.join("; ")}`);
      // Dark README captures are documentation assets, not extra PWA precache payload.
      const folder = resolve(root, theme === "dark" ? "docs/screenshots" : "public/screenshots");
      mkdirSync(folder, { recursive: true });
      const path = resolve(folder, `${name}${theme === "dark" ? "-dark" : ""}.png`);
      await page.screenshot({ path });
      if (statSync(path).size < 20000) throw new Error(`Empty capture: ${path}`);
      console.log(`Saved ${name} ${theme}: ${width * scale}×${height * scale}`);
      await context.close();
    }
} finally {
  await browser.close();
}
