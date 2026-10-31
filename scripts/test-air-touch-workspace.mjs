// Compact navigation, transaction boundaries, focused adjustment math and output
// history. Uses the dev-only read probe for assertions; every edit uses real UI.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { selectEditorTool } from "./air-editor-driver.mjs";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-touch-workspace";
await mkdir(out, { recursive: true });
const results = [],
  errors = [],
  requests = [];
for (const engine of ["chromium", "webkit"].filter(
  (e) => !process.env.AIR_BROWSER || e === process.env.AIR_BROWSER,
)) {
  const browser =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          executablePath:
            process.env.CHROME_PATH ||
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        });
  try {
    for (const width of [320, 390, 768, 1024, 1440].filter(
      (w) => !process.env.AIR_WIDTHS || process.env.AIR_WIDTHS.split(",").includes(String(w)),
    ))
      for (const theme of ["light", "dark"].filter(
        (t) => !process.env.AIR_THEME || t === process.env.AIR_THEME,
      )) {
        const height = width === 320 ? 568 : width === 768 ? 1024 : width === 1024 ? 768 : 900;
        const page = await browser.newPage({
          viewport: { width, height },
          hasTouch: width < 1100,
          colorScheme: theme,
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        console.log(engine, width, theme);
        page.setDefaultTimeout(15000);
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("request", (r) => {
          if (/huggingface|models\/.*\.(onnx|tflite)/.test(r.url())) requests.push(r.url());
        });
        await page.goto(process.env.BASE_URL || "http://127.0.0.1:8457");
        await page
          .locator("input[type=file]")
          .first()
          .setInputFiles(resolve(root, "scripts/fixtures/orange.webp"));
        await page.locator(".editor-topbar [aria-label=Export]:not(:disabled)").waitFor();
        const canvas = await page.locator("canvas.upper-canvas").elementHandle();
        const snapshot = () =>
          page.evaluate(async () => {
            const d = window.__editorDebug,
              c = d.docWorking,
              bytes = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
            let hash = 2166136261;
            for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
            // History already stores non-base entries as WebP at .92. Compare
            // to that existing decoded representation, not the uncompressed bake.
            const stored = document.createElement("canvas");
            stored.width = c.width;
            stored.height = c.height;
            stored
              .getContext("2d", {
                colorSpace: c.getContext("2d").getContextAttributes().colorSpace,
              })
              .drawImage(c, 0, 0);
            const blob = await new Promise((resolve) => stored.toBlob(resolve, "image/webp", 0.92));
            const bitmap = await createImageBitmap(blob);
            const restored = document.createElement("canvas");
            restored.width = c.width;
            restored.height = c.height;
            const context = restored.getContext("2d", {
              colorSpace: c.getContext("2d").getContextAttributes().colorSpace,
              willReadFrequently: true,
            });
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            let historyHash = 2166136261;
            for (const byte of context.getImageData(0, 0, c.width, c.height).data)
              historyHash = Math.imul(historyHash ^ byte, 16777619);
            return {
              historyHash: historyHash >>> 0,
              hash: hash >>> 0,
              depth: d.historyDepth(),
              adjust: d.toolState.adjust,
              curve: d.toolState.curveRGB,
              active: d.toolState.activeTool,
            };
          });
        const waitForPixels = (hash) =>
          page.waitForFunction((expected) => {
            const c = window.__editorDebug.docWorking;
            let actual = 2166136261;
            for (const byte of c.getContext("2d").getImageData(0, 0, c.width, c.height).data)
              actual = Math.imul(actual ^ byte, 16777619);
            return actual >>> 0 === expected;
          }, hash);
        const base = await snapshot();
        const field = () => page.getByRole("spinbutton", { name: "Exposure", exact: true });
        const enter = async (value) => {
          await field().fill(String(value));
          await field().press("Enter");
        };
        const cancel = async () => {
          await page
            .locator(".editor-mobile-surface,.editor-properties")
            .getByRole("button", { name: /^Cancel( changes)?$/ })
            .click();
          await page.waitForFunction(() => window.__editorDebug?.toolState.activeTool === "move");
          if (width < 768)
            await page.locator(".editor-mobile-surface").waitFor({ state: "hidden" });
        };
        await selectEditorTool(page, "Adjust");
        if (width < 768) assert.equal(await page.getByRole("spinbutton").count(), 1);
        await enter(0.6);
        // Opening and dismissing the catalogue does not apply or lose a preview.
        await page.keyboard.press("Control+k");
        await page.getByRole("dialog").waitFor();
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal((await snapshot()).depth, base.depth);
        assert.equal(await field().inputValue(), "0.6");
        await selectEditorTool(page, "Adjust");
        assert.equal((await snapshot()).depth, base.depth);
        await selectEditorTool(page, "Crop & rotate");
        const baked = await snapshot();
        assert.equal(baked.depth, base.depth + 1);
        assert.notEqual(baked.hash, base.hash);
        await page.getByRole("spinbutton", { name: "Fine rotation", exact: true }).fill("12");
        await page.getByRole("spinbutton", { name: "Fine rotation", exact: true }).press("Enter");
        await cancel();
        assert.equal((await snapshot()).hash, baked.hash);
        assert.equal((await snapshot()).depth, baked.depth);
        await selectEditorTool(page, "Adjust");
        await enter(-0.5);
        await cancel();
        await selectEditorTool(page, "Adjust");
        assert.equal(await field().inputValue(), "0");
        assert.equal((await snapshot()).hash, baked.hash);
        // Focused groups expose all eleven real values without changing their math.
        if (width < 1180) {
          const groups = {
            Light: ["Exposure", "Contrast", "Highlights", "Shadows", "Whites", "Blacks"],
            Colour: ["Temperature", "Saturation", "Vibrance"],
            Detail: ["Vignette", "Sharpen"],
          };
          for (const [group, names] of Object.entries(groups)) {
            await page.getByRole("combobox", { name: "Adjustment group" }).click();
            await page.getByRole("option", { name: group, exact: true }).click();
            for (const name of names) {
              if (width < 768)
                await page
                  .getByRole("group", { name: "Adjustment parameter" })
                  .getByRole("button", { name, exact: true })
                  .click();
              const f = page.getByRole("spinbutton", { name, exact: true });
              await f.fill(name === "Exposure" ? "0.4" : "20");
              await f.press("Enter");
            }
          }
          const current = (await snapshot()).adjust;
          assert.equal(current[0], 0.6);
          assert(current.slice(1).every((v) => v === 0.6));
          await page.getByRole("combobox", { name: "Adjustment group" }).click();
          await page.getByRole("option", { name: "Curves", exact: true }).click();
          await page.getByRole("button", { name: "Add point", exact: true }).click();
          assert.equal((await snapshot()).curve.length, 3);
          if (width < 768) {
            assert.equal(
              await page
                .getByRole("button", { name: "Return to split view" })
                .getAttribute("aria-pressed"),
              "true",
            );
            assert((await page.locator(".canvas-container").boundingBox()).height >= 127);
          }
          await page.screenshot({ path: `${out}/${engine}-${width}-${theme}-curves.png` });
          await cancel();
          await selectEditorTool(page, "Adjust");
          assert((await snapshot()).adjust.every((v) => v === 0.5));
          assert.equal((await snapshot()).curve.length, 2);
        }
        await enter(0.5);
        if (width < 1180)
          await page
            .locator(".editor-mobile-surface,.editor-properties")
            .getByRole("button", { name: "Done", exact: true })
            .click();
        else await selectEditorTool(page, "Move");
        await page.waitForFunction(() => window.__editorDebug?.toolState.activeTool === "move");
        const done = await snapshot();
        assert.equal(done.depth, baked.depth + 1);
        assert.notEqual(done.hash, baked.hash);
        await page
          .locator(".editor-topbar")
          .getByRole("button", { name: "Undo", exact: true })
          .click();
        await page.waitForFunction((d) => window.__editorDebug?.historyDepth() === d, baked.depth);
        await waitForPixels(baked.historyHash).catch(async (error) => {
          console.log(JSON.stringify({ base, baked, done, afterUndo: await snapshot() }));
          throw error;
        });
        await page
          .locator(".editor-topbar")
          .getByRole("button", { name: "Redo", exact: true })
          .click();
        await page.waitForFunction((d) => window.__editorDebug?.historyDepth() === d, done.depth);
        await waitForPixels(done.historyHash);
        assert(await canvas.evaluate((e) => e === document.querySelector("canvas.upper-canvas")));
        await selectEditorTool(page, "Adjust");
        await page.screenshot({ path: `${out}/${engine}-${width}-${theme}-adjust.png` });
        results.push({
          engine,
          width,
          height,
          theme,
          catalogueRetainsPreview: true,
          cancelAndReentry: true,
          doneAppliesOnce: true,
          undoRedoPixels: true,
          persistentCanvas: true,
        });
        await page.close();
      }
  } finally {
    await browser.close();
  }
}
await writeFile(
  `${out}/results.json`,
  JSON.stringify({ results, errors, requests }, null, 2) + "\n",
);
assert.deepEqual(errors, []);
assert.deepEqual(requests, []);
console.log(`${results.length} touch/navigation/history journeys passed in both engines`);
