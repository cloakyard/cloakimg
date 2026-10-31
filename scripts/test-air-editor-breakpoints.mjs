// Retain the active inspector, committed values and canvas across editor breakpoints.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-editor-breakpoints";
await mkdir(out, { recursive: true });
const results = [],
  errors = [];
for (const engine of ["chromium", "webkit"]) {
  const browser =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          executablePath:
            process.env.CHROME_PATH ||
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        });
  try {
    for (const theme of ["light", "dark"])
      for (const font of [16, 32])
        for (const tool of ["Crop & rotate", "Text"]) {
          const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
            colorScheme: theme,
            hasTouch: true,
            reducedMotion: "reduce",
            serviceWorkers: "block",
          });
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(process.env.BASE_URL || "http://127.0.0.1:8456");
          await page.addStyleTag({ content: `html{font-size:${font}px}` });
          await page
            .locator("input[type=file]")
            .first()
            .setInputFiles(resolve(root, "scripts/fixtures/orange.webp"));
          await page.locator(".editor-topbar [aria-label=Export]:not(:disabled)").waitFor();
          await page
            .locator(".editor-toolrail")
            .getByRole("button", { name: tool, exact: true })
            .click();
          const field =
            tool === "Text"
              ? page.getByRole("textbox", { name: "Caption", exact: true })
              : page.getByRole("spinbutton", { name: "Fine rotation", exact: true });
          const value = tool === "Text" ? "Keep this caption" : "-5";
          await field.fill(value);
          if (tool !== "Text") await field.press("Enter");
          const canvas = await page.locator("canvas.upper-canvas").elementHandle();
          for (const [width, height] of [
            [1024, 768],
            [390, 844],
            [767, 900],
            [768, 1024],
            [769, 900],
            [639, 390],
            [640, 390],
            [641, 390],
            [844, 500],
            [844, 501],
            [844, 390],
            [1280, 720],
          ]) {
            await page.setViewportSize({ width, height });
            const surface = page.locator(
              width < 768 || (width <= 960 && height <= 500)
                ? ".editor-mobile-surface"
                : ".editor-properties",
            );
            await surface.waitFor();
            const active =
              tool === "Text"
                ? surface.getByRole("textbox", { name: "Caption", exact: true })
                : surface.getByRole("spinbutton", { name: "Fine rotation", exact: true });
            await active.waitFor({ state: "visible" });
            assert.equal(await active.inputValue(), value);
            assert(
              await canvas.evaluate(
                (node) => node === document.querySelector("canvas.upper-canvas"),
              ),
            );
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
              false,
            );
            if (width === 390)
              await page.screenshot({
                path: `${out}/${engine}-${theme}-${font}-${tool === "Text" ? "text" : "crop"}.png`,
              });
            results.push({
              engine,
              theme,
              font,
              tool,
              width,
              height,
              retainedValue: true,
              persistentCanvas: true,
            });
          }
          await page.close();
        }
  } finally {
    await browser.close();
  }
}
await writeFile(out + "/results.json", JSON.stringify({ results, errors }, null, 2) + "\n");
assert.deepEqual(errors, []);
console.log(`${results.length} breakpoint transitions passed in both engines`);
