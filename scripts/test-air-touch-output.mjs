// Real PNG downloads: unchanged/adjusted output parity with the deployed build.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-touch-output";
await mkdir(out, { recursive: true });
const results = [],
  errors = [];
for (const engine of ["chromium", "webkit"]) {
  const browser =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        });
  try {
    for (const [width, height, theme] of [
      [390, 844, "dark"],
      [768, 1024, "light"],
      [1440, 900, "dark"],
    ]) {
      const p = await browser.newPage({
        viewport: { width, height },
        colorScheme: theme,
        hasTouch: width < 1100,
        serviceWorkers: "block",
        reducedMotion: "reduce",
      });
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(process.env.BASE_URL || "http://127.0.0.1:8456");
      const fixture = await p.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 64;
        c.height = 48;
        const ctx = c.getContext("2d");
        const d = ctx.createImageData(64, 48);
        for (let y = 0; y < 48; y++)
          for (let x = 0; x < 64; x++) {
            const i = (y * 64 + x) * 4;
            d.data.set([x * 4, y * 5, (x + y) * 2, x < 8 ? 0 : 255], i);
          }
        ctx.putImageData(d, 0, 0);
        return c.toDataURL().split(",")[1];
      });
      await p
        .locator("input[type=file]")
        .first()
        .setInputFiles({
          name: "output.png",
          mimeType: "image/png",
          buffer: Buffer.from(fixture, "base64"),
        });
      await p.locator(".editor-topbar [aria-label=Export]:not(:disabled)").waitFor();
      for (const state of ["original", "adjusted"]) {
        if (state === "adjusted") {
          if (await p.locator(".editor-toolrail").count())
            await p
              .locator(".editor-toolrail")
              .getByRole("button", { name: "Adjust", exact: true })
              .click();
          else {
            await p.getByRole("button", { name: "Open tools", exact: true }).click();
            const option = p.getByRole("option", { name: "Adjust", exact: true });
            if (await option.count()) await option.click();
            else
              await p
                .locator(".editor-mobile-surface")
                .getByRole("button", { name: "Adjust", exact: true })
                .click();
          }
          const tab = p.getByRole("radio", { name: "Adjust", exact: true });
          if (await tab.count()) await tab.check();
          const f = p.getByRole("spinbutton", { name: "Exposure", exact: true });
          await f.fill("0.5");
          await f.press("Enter");
        }
        await p
          .locator(".editor-topbar")
          .getByRole("button", { name: "Export", exact: true })
          .click();
        const d = p.getByRole("dialog");
        await d.getByRole("radio", { name: "PNG", exact: true }).check();
        const [download] = await Promise.all([
          p.waitForEvent("download"),
          d.getByRole("button", { name: "Download", exact: true }).click(),
        ]);
        const file = `${out}/${engine}-${width}-${state}.png`;
        await download.saveAs(file);
        const bytes = await readFile(file);
        const decoded = await p.evaluate(async (base64) => {
          const r = await fetch("data:image/png;base64," + base64);
          const bm = await createImageBitmap(await r.blob());
          const c = document.createElement("canvas");
          c.width = bm.width;
          c.height = bm.height;
          const ctx = c.getContext("2d");
          ctx.drawImage(bm, 0, 0);
          bm.close();
          const data = ctx.getImageData(0, 0, c.width, c.height).data;
          let hash = 2166136261;
          for (const byte of data) hash = Math.imul(hash ^ byte, 16777619);
          return { width: c.width, height: c.height, hash: hash >>> 0, transparent: data[3] === 0 };
        }, bytes.toString("base64"));
        assert.equal(decoded.width, 64);
        assert.equal(decoded.height, 48);
        assert(decoded.transparent);
        results.push({ engine, width, theme, state, ...decoded, viewportWidth: width });
        if (await d.isVisible())
          await d.getByRole("button", { name: "Close export", exact: true }).click();
        await d.waitFor({ state: "hidden" });
      }
      await p.close();
    }
  } finally {
    await browser.close();
  }
}
if (process.env.AIR_COMPARE) {
  const previous = JSON.parse(await readFile(process.env.AIR_COMPARE, "utf8"));
  assert.deepEqual(results, previous.results);
}
assert.deepEqual(errors, []);
await writeFile(out + "/results.json", JSON.stringify({ results, errors }, null, 2) + "\n");
console.log(
  `${results.length} real PNG downloads passed${process.env.AIR_COMPARE ? " with exact decoded parity" : ""}`,
);
