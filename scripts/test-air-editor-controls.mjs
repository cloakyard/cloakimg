// Real pointer and keyboard regressions for shared Air controls and canvas menu positioning.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-air-controls";
await mkdir(out, { recursive: true });
const results = [];
for (const engine of ["chrome", "webkit"]) {
  const b =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          executablePath:
            process.env.CHROME_PATH ||
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        });
  try {
    for (const width of [390, 1280])
      for (const theme of ["light", "dark"]) {
        const p = await b.newPage({
          viewport: { width, height: 844 },
          hasTouch: width < 1000,
          colorScheme: theme,
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        const requests = [];
        p.on("request", (r) => {
          if (/huggingface|models\/.*\.(tflite|onnx)/.test(r.url())) requests.push(r.url());
        });
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8455");
        await p
          .locator("input[type=file]")
          .first()
          .setInputFiles(resolve(root, "scripts/fixtures/orange.webp"));
        await p.locator(".editor-topbar [aria-label=Export]:not(:disabled)").waitFor();
        const mobile = width === 390;
        async function choose(name) {
          if (mobile) {
            const cancel = p
              .locator(".editor-mobile-surface")
              .getByRole("button", { name: "Cancel", exact: true });
            if (await cancel.count()) await cancel.click();
            await p.getByRole("button", { name: "Open tools", exact: true }).click();
          }
          await p
            .locator(mobile ? ".editor-mobile-surface" : ".editor-toolrail")
            .getByRole("button", { name, exact: true })
            .click();
          await p.locator("[data-tool-panel-loading]").waitFor({ state: "hidden" });
          await p.waitForTimeout(150);
        }
        await choose("Shapes");
        const sw = p.getByRole("switch", { name: "Lock aspect", exact: true });
        const initial = await sw.isChecked();
        await sw.focus();
        await p.keyboard.press("Space");
        assert.equal(await sw.isChecked(), !initial);
        await p.keyboard.press("Space");
        assert.equal(await sw.isChecked(), initial);
        const rect = await sw.boundingBox();
        assert.equal(rect.width, 44);
        assert.equal(rect.height, 44);
        const shape = p.locator(".img-shape-grid button").nth(2);
        await shape.click();
        assert.equal(await shape.getAttribute("aria-pressed"), "true");
        assert.equal(await shape.evaluate((e) => getComputedStyle(e, "::after").width), "16px");
        await p.screenshot({ path: `${out}/${engine}-${width}-${theme}-shapes.png` });
        await choose("Watermark");
        const pos = p.getByRole("button", { name: "Top left", exact: true });
        await pos.click();
        assert.equal(await pos.getAttribute("aria-pressed"), "true");
        await p.getByRole("button", { name: "Bottom right", exact: true }).click();
        assert.equal(await pos.getAttribute("aria-pressed"), "false");
        await choose("Tap to fix");
        await p.waitForTimeout(1000);
        const c = p.locator("canvas.upper-canvas");
        const box = await c.boundingBox();
        if (mobile) await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        else await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await p.waitForTimeout(200);
        for (let i = 0; i < 3; i++) {
          const n = p
            .locator(".cloak-dialog")
            .getByRole("button", { name: "Not now", exact: true });
          if (!(await n.count())) break;
          await n.last().click();
          await p.waitForTimeout(100);
        }
        await p.waitForTimeout(150);
        const pixel = await p
          .locator("canvas.lower-canvas")
          .evaluate((c) => [
            ...c
              .getContext("2d")
              .getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data,
          ]);
        assert(
          pixel[2] > pixel[0] * 2 && pixel[2] > pixel[1] * 1.5,
          `${engine} ${width}: target ${pixel}`,
        );
        const menu = await p.getByRole("dialog", { name: "Tap-to-fix actions" }).boundingBox();
        assert(menu);
        assert(
          Math.abs(menu.x + menu.width / 2 - (box.x + box.width / 2)) < 2,
          "Tap menu must share the target centre",
        );
        assert(
          Math.abs(menu.y + menu.height - (box.y + box.height / 2 - 12)) < 2,
          "Tap menu must sit above the target",
        );
        assert.deepEqual(requests, []);
        await p.screenshot({ path: `${out}/${engine}-${width}-${theme}-tap.png` });
        results.push({
          engine,
          width,
          theme,
          switchKeyboard: true,
          shapeChoice: true,
          watermarkChoice: true,
          tapPixel: pixel,
          menuAnchored: true,
          requests,
        });
        console.log(results.at(-1));
        await p.close();
      }
  } finally {
    await b.close();
    await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  }
}
