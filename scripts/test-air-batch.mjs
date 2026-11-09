/** Real batch files, recipe editing and ZIP output across the Air viewport matrix. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-air-batch";
await mkdir(out, { recursive: true });
const sizes = [
  [320, 568],
  [375, 812],
  [390, 844],
  [430, 932],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];
const rows = [],
  errors = [];
for (const engine of ["chromium", "webkit"]) {
  const browser = await (engine === "webkit"
    ? webkit.launch()
    : chromium.launch({
        executablePath:
          process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      }));
  try {
    for (const [width, height] of sizes)
      for (const theme of ["light", "dark"]) {
        const p = await browser.newPage({
          viewport: { width, height },
          colorScheme: theme,
          hasTouch: width < 1100,
          serviceWorkers: "block",
          reducedMotion: "reduce",
          acceptDownloads: true,
        });
        p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(process.env.BASE_URL || "http://127.0.0.1:8622");
        const buffer = Buffer.from(
          await p.evaluate(() => {
            const c = document.createElement("canvas");
            c.width = 64;
            c.height = 48;
            const x = c.getContext("2d");
            x.fillStyle = "#306045";
            x.fillRect(0, 0, 64, 48);
            return c.toDataURL().split(",")[1];
          }),
          "base64",
        );
        const fixture = (name) => ({ name, mimeType: "image/png", buffer });
        await p.locator("input[type=file]").first().setInputFiles(fixture("batch-source.png"));
        await p.locator(".editor-topbar").waitFor();
        if (await p.getByRole("button", { name: "More actions", exact: true }).count()) {
          await p.getByRole("button", { name: "More actions", exact: true }).click();
          await p.getByRole("button", { name: "Batch editing", exact: true }).click();
        } else await p.getByRole("button", { name: "Batch", exact: true }).click();
        const batch = p.getByRole("region", { name: "Batch drop zone", exact: true });
        await batch.waitFor();
        const check = async (state) => {
          const metrics = await p.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            regions: [
              ...document.querySelectorAll(
                '[aria-label="Batch drop zone"],[aria-label="Batch recipe"]',
              ),
            ].map((n) => {
              const r = n.getBoundingClientRect();
              return {
                name: n.getAttribute("aria-label"),
                x: r.x,
                y: r.y,
                right: r.right,
                bottom: r.bottom,
                width: r.width,
                height: r.height,
                overflow: n.scrollWidth > n.clientWidth + 1,
              };
            }),
          }));
          assert.equal(metrics.overflow, false);
          for (const r of metrics.regions)
            assert.ok(
              r.width > 0 &&
                r.height > 0 &&
                r.x >= -1 &&
                r.right <= width + 1 &&
                r.y >= -1 &&
                r.bottom <= height + 1 &&
                !r.overflow,
              JSON.stringify({ engine, width, height, theme, state, r }),
            );
          rows.push({ engine, width, height, theme, state, ...metrics });
          if ([390, 768, 1280, 1440, 844].includes(width))
            await p.screenshot({ path: `${out}/${engine}-${width}-${theme}-${state}.png` });
        };
        await check("empty");
        await batch
          .locator("input[type=file]")
          .first()
          .setInputFiles([fixture("first.png"), fixture("second.png")]);
        await p.getByRole("button", { name: "Run on 2 files", exact: true }).waitFor();
        await check("queued");
        const step = p.getByRole("button", { name: /^Resize Long edge/ });
        const motionCase = [390, 768, 1440].includes(width);
        if (motionCase) await p.emulateMedia({ reducedMotion: "no-preference" });
        await step.click();
        const controls = p.locator(`#${await step.getAttribute("aria-controls")}`);
        await controls.waitFor();
        if (motionCase)
          assert.ok(
            await controls.evaluate((n) =>
              n.getAnimations().some((a) => a.effect.getTiming().duration === 180),
            ),
            "Shared disclosure entry is running",
          );
        await controls.getByRole("spinbutton", { name: "Long edge", exact: true }).fill("128");
        await controls.getByRole("spinbutton", { name: "Long edge", exact: true }).press("Tab");
        await check("recipe-expanded");
        await step.click();
        if (motionCase)
          assert.equal(
            await controls.evaluate((n) => n.inert),
            true,
            "Closing controls cannot receive input",
          );
        await controls.waitFor({ state: "hidden" });
        if (motionCase) {
          await p.emulateMedia({ reducedMotion: "reduce" });
          await step.click();
          assert.equal(await controls.evaluate((n) => n.getAnimations().length), 0);
          await step.click();
          await controls.waitFor({ state: "hidden" });
        }
        await p.getByRole("button", { name: "Run on 2 files", exact: true }).click();
        const zip = p.getByRole("button", { name: "Download all (2) as .zip", exact: true });
        await zip.waitFor();
        const [download] = await Promise.all([p.waitForEvent("download"), zip.click()]);
        const bytes = await readFile(await download.path());
        assert.equal(bytes.readUInt32LE(0), 0x04034b50);
        const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
        assert.ok(end >= 0);
        assert.equal(bytes.readUInt16LE(end + 10), 2);
        await check("completed");
        await p.close();
        console.log(`${engine} ${width} ${theme}: real two-file ZIP passed`);
      }
  } finally {
    await browser.close();
  }
}
await writeFile(`${out}/results.json`, JSON.stringify({ rows, errors }, null, 2));
assert.deepEqual(errors, []);
console.log(`${rows.length} batch states and ${rows.length / 4} real ZIP downloads passed`);
