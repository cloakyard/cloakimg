/** Real-browser IME signal, native button, recovery and contrast regressions.
 * Synthetic composition signals are not a substitute for physical IME acceptance. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { selectEditorTool } from "./air-editor-driver.mjs";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.BASE_URL || "http://127.0.0.1:8922";
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-composition";
await mkdir(out, { recursive: true });
const rows = [];
const errors = [];
async function confirmIME(input) {
  for (const signal of [{ isComposing: true }, { keyCode: 229 }])
    await input.dispatchEvent("keydown", { key: "Enter", bubbles: true, ...signal });
}
for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
  const browser = await launcher.launch(
    engine === "chromium" ? { executablePath: process.env.CHROME_PATH } : {},
  );
  try {
    for (const [width, height] of [
      [390, 844],
      [768, 1024],
      [1280, 720],
      [1440, 900],
    ]) {
      for (const colorScheme of ["light", "dark"]) {
        const page = await browser.newPage({
          viewport: { width, height },
          colorScheme,
          hasTouch: width < 1100,
          serviceWorkers: "block",
        });
        page.setDefaultTimeout(15000);
        page.on("pageerror", (e) => errors.push(`${engine} ${width} ${e.message}`));
        const key = `${engine}-${width}-${colorScheme}`;
        await page.goto(`${base}/404.html`);
        await page.getByRole("heading", { name: "Page not found.", exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        const recovery = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          scheme: getComputedStyle(document.documentElement).colorScheme,
          marks: [...document.querySelectorAll(".air-page-brand svg, .air-page-brand img")].map(
            (e) => Math.round(e.getBoundingClientRect().width),
          ),
          scripts: [...document.scripts].map((e) => e.src),
          footer: document.querySelector("footer").textContent.replace(/\s+/g, " ").trim(),
        }));
        assert.equal(recovery.overflow, false);
        assert.deepEqual(recovery.marks, [36]);
        assert.match(recovery.footer, /Buy me a coffee/);
        assert.ok(
          !recovery.scripts.some((s) => /index-|vendor|react/.test(s)),
          "Recovery does not load the editor runtime",
        );
        await page.screenshot({ path: `${out}/${key}-recovery.png`, fullPage: true });
        await page.getByRole("link", { name: "Return to CloakIMG" }).click();
        await page.getByRole("button", { name: "Open editor", exact: true }).click();
        await page.getByRole("button", { name: "Blank canvas", exact: true }).click();
        await page.getByRole("button", { name: "Cancel", exact: true }).press("Enter");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(
          await page.locator(".editor-topbar").count(),
          0,
          "Cancel must not create a canvas",
        );
        await page
          .locator("input[type=file]")
          .first()
          .setInputFiles(resolve(import.meta.dirname, "fixtures/orange.webp"));
        await page.locator(".editor-topbar [aria-label=Export]:not(:disabled)").waitFor();
        await selectEditorTool(page, "Emoji");
        const emoji = page.getByRole("textbox", { name: "Paste any emoji" });
        await emoji.fill("👩🏽‍💻");
        await confirmIME(emoji);
        assert.equal(await emoji.inputValue(), "👩🏽‍💻");
        await emoji.press("Enter");
        assert.equal(await emoji.inputValue(), "");
        await selectEditorTool(page, "Text");
        await page.getByRole("button", { name: "Pick a color", exact: true }).first().click();
        const hex = page.getByRole("textbox", { name: "Hex value" });
        await hex.fill("#abc");
        await confirmIME(hex);
        assert.equal(await hex.inputValue(), "#abc");
        await hex.press("Enter");
        assert.equal(await hex.inputValue(), "#AABBCC");
        await page.waitForFunction(() => {
          const popup = document.querySelector(".img-colour-popover");
          return (
            popup &&
            getComputedStyle(popup).opacity === "1" &&
            popup.getAnimations().every((a) => a.playState === "finished")
          );
        });
        await page.screenshot({ path: `${out}/${key}-colour.png` });
        await page.getByRole("button", { name: "Done", exact: true }).click();
        await selectEditorTool(page, "Crop & rotate");
        const number = page.getByRole("spinbutton", { name: "Fine rotation", exact: true });
        await number.fill("10");
        await confirmIME(number);
        assert.equal(await number.evaluate((e) => e === document.activeElement), true);
        await number.press("Enter");
        assert.equal(await number.inputValue(), "10");
        assert.equal(await number.evaluate((e) => e === document.activeElement), false);
        await page.emulateMedia({ contrast: "more" });
        await page.mouse.move(0, 0);
        await page
          .locator("h2")
          .first()
          .evaluate((e) => {
            e.tabIndex = -1;
            e.focus();
          });
        const contrast = await page
          .locator(".air-scroll")
          .first()
          .evaluate((e) => {
            const s = getComputedStyle(e);
            return {
              thumb: s.getPropertyValue("--air-scroll-thumb").trim(),
              ink: s.getPropertyValue("--air-ink").trim(),
            };
          });
        assert.equal(contrast.thumb, contrast.ink);
        await page.screenshot({ path: `${out}/${key}-contrast.png` });
        rows.push({
          engine,
          width,
          height,
          colorScheme,
          recovery,
          contrast,
          composition: ["emoji", "hex", "number"],
          pass: true,
        });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
assert.deepEqual(errors, []);
await writeFile(`${out}/results.json`, JSON.stringify({ rows, errors }, null, 2));
console.log(
  `${rows.length} browser/layout/theme journeys passed; recovery, IME signals and increased contrast.`,
);
