// Fixed tool-local actions, scroll isolation, preview allocation and keyboard return.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { selectEditorTool } from "./air-editor-driver.mjs";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-canvas-layout";
await mkdir(out, { recursive: true });
const results = [],
  errors = [];
for (const engine of ["chromium", "webkit"]) {
  const browser = await (engine === "webkit"
    ? webkit.launch()
    : chromium.launch({
        executablePath:
          process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }));
  try {
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [768, 1024],
      [844, 390],
      [1280, 720],
    ]) {
      for (const theme of ["light", "dark"]) {
        const p = await browser.newPage({
          viewport: { width, height },
          hasTouch: width < 1100,
          colorScheme: theme,
          serviceWorkers: "block",
          reducedMotion: "reduce",
        });
        p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8470");
        await p
          .locator("input[type=file]")
          .first()
          .setInputFiles(new URL("./fixtures/orange.webp", import.meta.url).pathname);
        await p.locator('.editor-topbar [aria-label="Export"]:not(:disabled)').waitFor();
        await selectEditorTool(p, "Crop & rotate");
        const header = p.locator(".editor-mobile-header,.editor-properties__header");
        const actions = p.getByRole("group", { name: "Edit actions", exact: true });
        const photo = p.locator(".canvas-container"),
          body = p.locator(
            ".editor-mobile-surface > .scroll-thin,.editor-properties > .scroll-thin",
          );
        const before = {
          photo: await photo.boundingBox(),
          header: await header.boundingBox(),
          actions: await actions.boundingBox(),
        };
        const scrollBox = await body.boundingBox();
        await p.mouse.move(scrollBox.x + scrollBox.width / 2, scrollBox.y + scrollBox.height / 2);
        await p.mouse.wheel(0, 1200);
        await p.waitForTimeout(150);
        const after = {
          photo: await photo.boundingBox(),
          header: await header.boundingBox(),
          actions: await actions.boundingBox(),
        };
        assert.deepEqual(after, before, "Only controls may move while scrolling");
        assert(
          before.photo.height >= (await p.locator(".editor-shell").boundingBox()).height * 0.4 - 2,
        );
        const cancel = actions.getByRole("button", { name: "Cancel", exact: true });
        const compact = await actions.evaluate((e) =>
          e.classList.contains("air-editor-actions--compact"),
        );
        await p.keyboard.press("Tab");
        await cancel.focus();
        if (compact) {
          const tip = p.getByRole("tooltip");
          await tip.waitFor();
          assert.equal(await cancel.getAttribute("aria-describedby"), await tip.getAttribute("id"));
          assert.equal(await tip.textContent(), "Cancel");
          assert(await header.locator('[aria-label="Cancel"]').count());
        }
        await p.keyboard.press("Enter");
        const shortcut = p
          .locator(".editor-compact-nav")
          .getByRole("button", { name: "Crop", exact: true });
        const target = (await shortcut.count())
          ? shortcut
          : p
              .locator(".editor-toolrail")
              .getByRole("button", { name: "Crop & rotate", exact: true });
        await p.waitForFunction(() =>
          document.activeElement?.closest(".editor-compact-nav,.editor-toolrail"),
        );
        assert(await target.evaluate((e) => e === document.activeElement));
        await p.keyboard.press("Enter");
        await actions.waitFor();
        // Let the persistent canvas react to its reopened inspector size before capture.
        await p.waitForTimeout(300);
        await p.mouse.move(0, 0);
        await p.screenshot({ path: `${out}/${engine}-${width}-${theme}.png` });
        results.push({
          engine,
          width,
          height,
          theme,
          compact,
          photoHeight: before.photo.height,
          scrollIsolated: true,
          focusReturned: true,
        });
        await p.close();
      }
    }
  } finally {
    await browser.close();
  }
}
assert.deepEqual(errors, []);
await writeFile(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2) + "\n");
console.log(`${results.length} canvas/layout/keyboard journeys passed`);
