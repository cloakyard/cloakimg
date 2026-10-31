import { selectEditorTool } from "./air-editor-driver.mjs";
// Native draft/step/focus behavior, switch labels, and image decode recovery in both engines.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-native-fields";
await mkdir(out, { recursive: true });
const results = [];
for (const engine of ["chromium", "webkit"]) {
  const b =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          executablePath:
            process.env.CHROME_PATH ||
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        });
  try {
    for (const [width, height, font] of [
      [390, 844, 16],
      [1024, 768, 32],
      [1440, 900, 16],
    ])
      for (const colorScheme of ["light", "dark"]) {
        const p = await b.newPage({
          viewport: { width, height },
          hasTouch: width < 1100,
          colorScheme,
          serviceWorkers: "block",
        });
        p.setDefaultTimeout(10000);
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8456");
        await p.addStyleTag({ content: `html{font-size:${font}px}` });
        await p
          .locator("input[type=file]")
          .first()
          .setInputFiles(resolve(root, "scripts/fixtures/orange.webp"));
        await p.locator(".editor-topbar [aria-label=Export]:not(:disabled)").waitFor();
        async function tool(name) {
          await selectEditorTool(p, name);
          await p.waitForTimeout(150);
        }
        await tool("Crop & rotate");
        const f = p.getByRole("spinbutton", { name: "Fine rotation", exact: true });
        await f.fill("60");
        await f.press("Enter");
        assert.equal(await f.inputValue(), "60");
        assert.equal(await f.getAttribute("aria-invalid"), "true");
        const focus = await f.evaluate((e) => ({
          input: getComputedStyle(e).outlineStyle,
          outer: getComputedStyle(e.parentElement).outlineWidth,
          border: getComputedStyle(e.parentElement).borderColor,
          appearance: getComputedStyle(e).appearance,
          mode: e.inputMode,
        }));
        assert.equal(focus.input, "none");
        assert.equal(focus.outer, "2px");
        assert.equal(focus.border, "rgba(0, 0, 0, 0)");
        assert.equal(focus.appearance, "textfield");
        assert.equal(focus.mode, "text");
        await f.press("ArrowDown");
        assert.equal(await f.inputValue(), "60");
        await f.fill("0.5");
        await f.press("Enter");
        assert.equal(await f.inputValue(), "0.5");
        assert.equal(await f.getAttribute("aria-invalid"), "true");
        await p.screenshot({ path: `${out}/${engine}-${width}-${font}-${colorScheme}-error.png` });
        await f.press("Escape");
        assert.equal(await f.inputValue(), "0");
        await f.fill("");
        await f.press("-");
        assert.equal(await f.evaluate((e) => e.validity.badInput), true);
        await f.press("Enter");
        assert.equal(await f.evaluate((e) => e.validity.badInput), true);
        await f.press("Escape");
        assert.equal(await f.inputValue(), "0");
        await f.press("ArrowDown");
        assert.equal(await f.inputValue(), "-1");
        await f.press("Shift+ArrowUp");
        assert.equal(await f.inputValue(), "9");
        await f.fill("-20");
        await f.press("Enter");
        assert.equal(await f.inputValue(), "-20");
        await p.getByRole("button", { name: "Reset crop area", exact: true }).click();
        assert.equal(await f.inputValue(), "0");
        await tool("Shapes");
        const s = p.getByRole("switch", { name: "Lock aspect", exact: true });
        const checked = await s.isChecked();
        await p.getByText("Lock aspect", { exact: true }).click();
        assert.equal(await s.isChecked(), !checked);
        await s.focus();
        await s.press("Space");
        assert.equal(await s.isChecked(), checked);
        await tool("Place image");
        const panel = p
          .locator(".editor-properties .scroll-thin,.editor-mobile-surface .scroll-thin")
          .first();
        await panel.locator("input[type=file]").setInputFiles({
          name: "broken.png",
          mimeType: "image/png",
          buffer: Buffer.from("invalid image"),
        });
        await panel.getByRole("alert").waitFor();
        assert.match(await panel.getByRole("alert").innerText(), /could not be opened/);
        await p.screenshot({
          path: `${out}/${engine}-${width}-${font}-${colorScheme}-file-error.png`,
        });
        const choose = panel.getByRole("button", { name: "Choose image…", exact: true });
        assert.equal(await choose.isEnabled(), true);
        await panel
          .locator("input[type=file]")
          .setInputFiles(resolve(root, "scripts/fixtures/orange.webp"));
        await panel.getByRole("button", { name: "To front", exact: true }).waitFor();
        assert.equal(await panel.getByRole("alert").count(), 0);
        results.push({
          engine,
          width,
          height,
          font,
          colorScheme,
          nativeStepping: true,
          invalidDrafts: true,
          labelAndSpace: true,
          fileRecovery: true,
        });
        console.log(results.at(-1));
        await p.close();
      }
  } finally {
    await b.close();
    await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  }
}
