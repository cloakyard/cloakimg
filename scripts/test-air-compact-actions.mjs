import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { selectEditorTool } from "./air-editor-driver.mjs";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-compact-actions";
await mkdir(out, { recursive: true });
const results = [],
  errors = [];
for (const engine of ["chromium", "webkit"]) {
  const b =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        });
  try {
    for (const width of [390, 768])
      for (const colorScheme of ["light", "dark"]) {
        const p = await b.newPage({
          viewport: { width, height: width === 390 ? 844 : 1024 },
          hasTouch: true,
          colorScheme,
          serviceWorkers: "block",
          reducedMotion: "reduce",
        });
        console.log(engine, width, colorScheme);
        p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8456");
        await p
          .locator("input[type=file]")
          .first()
          .setInputFiles(resolve(root, "scripts/fixtures/orange.webp"));
        await p.locator(".editor-topbar [aria-label=Export]:not(:disabled)").waitFor();
        await selectEditorTool(p, "Adjust");
        const canvas = await p.locator("canvas.upper-canvas").elementHandle();
        const field = p.getByRole("spinbutton", { name: "Exposure", exact: true });
        await field.fill("0.4");
        await field.press("Enter");
        await p.getByRole("combobox", { name: "Adjustment group" }).click();
        await p.getByRole("listbox").waitFor();
        await p.keyboard.press("Escape");
        await p.getByRole("listbox").waitFor({ state: "hidden" });
        await p.waitForTimeout(300);
        assert.equal(await field.inputValue(), "0.4");
        await p.locator(".editor-adjust-scope > summary").click();
        await p.getByRole("radio", { name: "Subject", exact: true }).check();
        const consent = p.getByRole("dialog");
        await consent.getByRole("button", { name: "Not now", exact: true }).click();
        await consent.waitFor({ state: "hidden" });
        assert.equal((await p.locator("[inert]").count()) > 0, true);
        await p.getByRole("radio", { name: "Whole", exact: true }).check();
        assert.equal(await field.inputValue(), "0.4");
        await p.locator(".editor-adjust-scope > summary").click();
        await p.getByRole("button", { name: "More actions" }).click();
        let dialog = p.getByRole("dialog");
        await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
        await dialog.getByText("Zoom · 120%", { exact: true }).waitFor();
        await dialog.getByRole("button", { name: "Fit", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        assert.equal(await field.inputValue(), "0.4");
        await p.getByRole("button", { name: "More actions" }).click();
        assert(await canvas.evaluate((e) => e === document.querySelector("canvas.upper-canvas")));
        const beforeBatch = await p.locator("canvas.lower-canvas").evaluate((e) => e.toDataURL());
        await dialog.getByRole("button", { name: "Batch editing", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        await p.locator(".editor-compact-nav").waitFor({ state: "hidden" });
        await p.getByRole("button", { name: "More actions" }).click();
        await dialog.getByRole("button", { name: "Single photo", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        await field.waitFor();
        assert.equal(await field.inputValue(), "0.4");
        // Batch has its own stage. Existing scene serialization restores the
        // single-photo canvas on return; compare rendered pixels, not DOM identity.
        await p.waitForFunction(
          (expected) => document.querySelector("canvas.lower-canvas")?.toDataURL() === expected,
          beforeBatch,
        );
        await p.getByRole("button", { name: "Open tools", exact: true }).click();
        const search = p.getByRole("combobox", { name: "Search editor tools" });
        await search.fill("privacy");
        assert.equal(await p.getByRole("option").count(), 1);
        await p.keyboard.press("Escape");
        await p.waitForTimeout(300);
        assert.equal(await field.inputValue(), "0.4");
        results.push({
          engine,
          width,
          colorScheme,
          selectEscape: true,
          menuZoom: true,
          batchRoundTrip: true,
          retainedBatchPixels: true,
          catalogueSearch: true,
          persistentCanvas: true,
        });
        await p.close();
      }
  } finally {
    await b.close();
  }
}
await writeFile(out + "/results.json", JSON.stringify({ results, errors }, null, 2) + "\n");
assert.deepEqual(errors, []);
console.log(`${results.length} compact action journeys passed`);
