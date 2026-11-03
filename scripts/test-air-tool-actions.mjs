// Real UI transactions; the dev-only probe is read solely for history/pixel assertions.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { selectEditorTool } from "./air-editor-driver.mjs";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-tool-actions";
await mkdir(out, { recursive: true });
const results = [],
  errors = [],
  requests = [];
for (const engine of ["chromium", "webkit"]) {
  const browser =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        });
  try {
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [768, 1024],
      [844, 390],
      [1440, 900],
    ])
      for (const theme of ["light", "dark"]) {
        const p = await browser.newPage({
          viewport: { width, height },
          hasTouch: width < 1100,
          colorScheme: theme,
          serviceWorkers: "block",
          reducedMotion: process.env.AIR_REDUCED_MOTION || "reduce",
        });
        p.setDefaultTimeout(15000);
        p.on("console", (m) => {
          if (/Encountered two children|Each child in a list|Minified React error/.test(m.text()))
            errors.push(m.text());
        });
        p.on("pageerror", (e) => errors.push({ engine, width, theme, message: e.message }));
        p.on("request", (r) => {
          if (/huggingface|models\/.*\.(onnx|tflite)/.test(r.url())) requests.push(r.url());
        });
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8461");
        const fixture = await p.evaluate(() => {
          const c = document.createElement("canvas");
          c.width = 96;
          c.height = 64;
          const x = c.getContext("2d");
          x.fillStyle = "#ed8244";
          x.fillRect(8, 0, 88, 64);
          x.fillStyle = "#29805a";
          x.fillRect(28, 16, 32, 32);
          return c.toDataURL().split(",")[1];
        });
        await p
          .locator("input[type=file]")
          .first()
          .setInputFiles({
            name: "actions.png",
            mimeType: "image/png",
            buffer: Buffer.from(fixture, "base64"),
          });
        await p.locator(".editor-topbar [aria-label=Export]:not(:disabled)").waitFor();
        const snapshot = () =>
          p.evaluate(() => {
            const d = window.__editorDebug,
              c = d.docWorking;
            let hash = 2166136261;
            for (const n of c.getContext("2d").getImageData(0, 0, c.width, c.height).data)
              hash = Math.imul(hash ^ n, 16777619);
            return {
              width: c.width,
              height: c.height,
              hash: hash >>> 0,
              depth: d.historyDepth(),
              active: d.toolState.activeTool,
            };
          });
        const waitMove = () =>
          p.waitForFunction(
            () =>
              window.__editorDebug.toolState.activeTool === "move" &&
              !document.querySelector('[aria-label="Edit actions"] [aria-label="Apply"]'),
          );
        const action = (name) =>
          p
            .getByRole("group", { name: "Edit actions", exact: true })
            .getByRole("button", { name, exact: true });
        const field = (name) => p.getByRole("spinbutton", { name, exact: true });
        const enter = async (name, value) => {
          await field(name).fill(String(value));
          await field(name).press("Enter");
        };
        const base = await snapshot();
        await selectEditorTool(p, "Adjust");
        await enter("Exposure", 0.4);
        if (await p.getByRole("button", { name: "Expand controls", exact: true }).count()) {
          await p.getByRole("button", { name: "Expand controls", exact: true }).click();
          assert.equal((await snapshot()).depth, base.depth);
          await p.getByRole("button", { name: "Return to split view", exact: true }).click();
        }
        await action("Cancel").click();
        await waitMove();
        assert.deepEqual(await snapshot(), base);
        await selectEditorTool(p, "Adjust");
        assert.equal(await field("Exposure").inputValue(), "0");
        await field("Exposure").fill("");
        await action("Apply").click();
        assert.equal((await snapshot()).active, "adjust");
        assert.equal((await snapshot()).depth, base.depth);
        assert.equal(await field("Exposure").inputValue(), "");
        assert(await field("Exposure").evaluate((e) => e === document.activeElement));
        await enter("Exposure", 0.5);
        // Two activations in the same event turn must still produce one commit.
        await action("Apply").evaluate((b) => {
          b.click();
          b.click();
        });
        await waitMove();
        const adjusted = await snapshot();
        assert.equal(adjusted.depth, base.depth + 1);
        assert.notEqual(adjusted.hash, base.hash);
        await selectEditorTool(p, "Crop & rotate");
        await enter("Crop width", 48);
        await action("Cancel").click();
        await waitMove();
        assert.deepEqual(await snapshot(), adjusted);
        await selectEditorTool(p, "Crop & rotate");
        await enter("Crop width", 48);
        await enter("Crop Y", 0);
        await enter("Crop height", 64);
        await action("Apply").focus();
        await p.keyboard.press("Enter");
        await waitMove();
        const cropped = await snapshot();
        assert.equal(cropped.width, 48);
        assert.equal(cropped.height, 64);
        assert.equal(cropped.depth, adjusted.depth + 1);
        await p.getByRole("button", { name: "Undo", exact: true }).click();
        await p.waitForFunction(() => window.__editorDebug.docWorking.width === 96);
        await p.getByRole("button", { name: "Redo", exact: true }).click();
        await p.waitForFunction(() => window.__editorDebug.docWorking.width === 48);
        await selectEditorTool(p, "Resize");
        await enter("Width", 24);
        await action("Apply").click();
        await waitMove();
        const resized = await snapshot();
        assert.equal(resized.width, 24);
        assert.equal(resized.height, 32);
        assert.equal(resized.depth, cropped.depth + 1);
        await selectEditorTool(p, "Adjust");
        const scope = p.locator(".editor-adjust-scope > summary");
        if (await scope.count()) await scope.click();
        await p.getByRole("radio", { name: "Subject", exact: true }).check();
        await p.getByRole("dialog").getByRole("button", { name: "Not now", exact: true }).click();
        await action("Apply").click();
        assert.equal((await snapshot()).active, "adjust");
        assert.equal((await snapshot()).depth, resized.depth);
        await p.getByRole("radio", { name: "Whole", exact: true }).check();
        await action("Cancel").click();
        await waitMove();
        // A read-only panel has Close, with no fake Apply or rollback action.
        await selectEditorTool(p, "Color picker");
        assert.deepEqual(
          await p
            .getByRole("group", { name: "Edit actions" })
            .getByRole("button")
            .allTextContents(),
          ["Close"],
        );
        await action("Close").click();
        await waitMove();
        await p
          .locator(".editor-topbar")
          .getByRole("button", { name: "Export", exact: true })
          .click();
        const dialog = p.getByRole("dialog");
        await dialog.getByRole("radio", { name: "PNG", exact: true }).check();
        const [download] = await Promise.all([
          p.waitForEvent("download"),
          dialog.getByRole("button", { name: "Download", exact: true }).click(),
        ]);
        const file = `${out}/${engine}-${width}-${theme}.png`;
        await download.saveAs(file);
        const decoded = await p.evaluate(
          async (data) => {
            const bitmap = await createImageBitmap(
              new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], {
                type: "image/png",
              }),
            );
            const result = [bitmap.width, bitmap.height];
            bitmap.close();
            return result;
          },
          (await (await import("node:fs/promises")).readFile(file)).toString("base64"),
        );
        assert.deepEqual(decoded, [24, 32]);
        results.push({
          engine,
          width,
          height,
          theme,
          applyCancelReentry: true,
          invalidDraftPreserved: true,
          repeatOnce: true,
          cropResizeUndoRedo: true,
          consentGatePreserved: true,
          closeSemantics: true,
          download: decoded,
        });
        console.log(engine, width, theme, "passed");
        await p.close();
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
console.log(`${results.length} end-to-end action journeys and real PNG downloads passed`);
