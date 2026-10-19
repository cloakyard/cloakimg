/** Production landing lifecycle and local image handoff/output. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";
const base = process.env.BASE_URL || "http://127.0.0.1:8174";
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/cloakimg-air-horizon";
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const results = [];
try {
  for (const mode of ["normal", "reduced", "unsupported", "constrained", "save-data", "forced"]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const requests = [],
      errors = [];
    page.on("request", (r) => requests.push(r.url()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setViewport({ width: 1440, height: 900 });
    if (mode === "reduced")
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    if (mode === "unsupported")
      await page.evaluateOnNewDocument(() =>
        Object.defineProperty(navigator, "gpu", { value: undefined }),
      );
    if (mode === "constrained")
      await page.evaluateOnNewDocument(() =>
        Object.defineProperty(navigator, "hardwareConcurrency", { value: 4 }),
      );
    if (mode === "save-data")
      await page.evaluateOnNewDocument(() =>
        Object.defineProperty(navigator, "connection", {
          value: { saveData: true, addEventListener() {}, removeEventListener() {} },
        }),
      );
    const cdp = await page.createCDPSession();
    if (mode === "forced")
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "forced-colors", value: "active" }],
      });
    await page.goto(base, { waitUntil: "networkidle0" });
    await page.$eval(".img-horizon", (e) => e.scrollIntoView({ block: "center" }));
    const wait = (state) =>
      page.waitForFunction(
        (s) => document.querySelector(".img-horizon")?.dataset.lightState === s,
        { timeout: 15_000 },
        state,
      );
    const field = () => page.$eval(".img-horizon", (e) => ({ ...e.dataset }));
    await wait(mode === "normal" ? "idle" : mode === "save-data" ? "constrained" : mode);
    const initial = await field();
    if (mode === "normal") {
      assert.equal(initial.lightReady, "true");
      await page.mouse.move(1000, 450);
      await page.waitForFunction(
        (n) => Number(document.querySelector(".img-horizon").dataset.lightFrames) > n,
        {},
        Number(initial.lightFrames),
      );
      await wait("idle");
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await wait("offscreen");
      assert.equal((await field()).lightReady, undefined);
      await page.$eval(".img-horizon", (e) => e.scrollIntoView({ block: "center" }));
      await wait("idle");
      // Retain the detached field to observe actual effect cleanup on editor entry.
      await page.evaluate(() => {
        window.__oldHorizon = document.querySelector(".img-horizon");
      });
      const png = await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 64;
        c.height = 48;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#338dab";
        ctx.fillRect(0, 0, 32, 48);
        ctx.fillStyle = "rgba(244,81,44,0.5)";
        ctx.fillRect(32, 0, 32, 24);
        return c.toDataURL("image/png").split(",")[1];
      });
      const fixture = resolve(out, "synthetic.png");
      await writeFile(fixture, Buffer.from(png, "base64"));
      await (await page.$('input[type="file"]')).uploadFile(fixture);
      await page.waitForSelector('button[aria-label="Export"]', { timeout: 20_000 });
      assert.equal(await page.$(".img-horizon"), null);
      assert.equal(await page.evaluate(() => window.__oldHorizon.dataset.lightState), "disposed");
      await page.evaluate(() => {
        document.addEventListener(
          "click",
          (event) => {
            const anchor = event.target;
            if (anchor instanceof HTMLAnchorElement && anchor.download) {
              window.__download = anchor.href;
              event.preventDefault();
            }
          },
          true,
        );
      });
      await page.click('button[aria-label="Export"]');
      await page.waitForSelector('[role="dialog"]');
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('[role="dialog"] button')];
        buttons.find((b) => b.textContent.trim() === "PNG")?.click();
      });
      await page.evaluate(() =>
        [...document.querySelectorAll('[role="dialog"] button')]
          .find((b) => b.textContent.trim() === "Download")
          .click(),
      );
      await page.waitForFunction(() => window.__download);
      const output = await page.evaluate(async (source) => {
        async function pixels(blob) {
          const image = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
          const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", rgba))]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          return { width: image.width, height: image.height, hash };
        }
        const blob = await (await fetch(window.__download)).blob();
        return {
          type: blob.type,
          source: await pixels(await (await fetch(`data:image/png;base64,${source}`)).blob()),
          exported: await pixels(blob),
        };
      }, png);
      assert.equal(output.type, "image/png");
      assert.deepEqual(
        output.exported,
        output.source,
        "Dimensions and RGBA pixels survive landing → export",
      );
      results.push({ mode, initial, output, editorCleanup: "disposed" });
    } else {
      assert.ok(
        !requests.some((url) => url.includes("air-light-shader")),
        `${mode}: renderer stays unfetched`,
      );
      assert.equal(initial.lightReady, undefined);
      results.push({ mode, initial });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  const sw = await readFile(new URL("../dist/sw.js", import.meta.url), "utf8");
  assert.ok(!sw.includes("air-light-shader"), "Decorative shader is not precached");
  await writeFile(resolve(out, "lifecycle.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(
    "PASS: GPU/pointer/offscreen/editor cleanup; five restricted profiles; PNG RGBA/dimensions; shader outside precache.",
  );
} finally {
  await browser.close();
}
