import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire("/tmp/cloakyard-rollout-2026-10-21/cloakimg-clean/package.json");
const { launch } = require("puppeteer-core");
const sharp = createRequire("/Users/sumitsahoo/Developer/cloakresume/package.json")("sharp");
const out = "/tmp/cloakyard-rollout-2026-10-21/cloakimg/visual";
await mkdir(out, { recursive: true });
const rows = [],
  errors = [];
const browser = await launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--disable-gpu"],
});
try {
  for (const coarse of [false, true])
    for (const theme of ["light", "dark"]) {
      const contexts = [],
        pages = [];
      for (const port of [8232, 8231]) {
        const c = await browser.createBrowserContext();
        contexts.push(c);
        const p = await c.newPage();
        pages.push(p);
        p.on("pageerror", (e) => errors.push(String(e)));
        await p.setViewport({ width: 1440, height: 900, hasTouch: coarse });
        await p.emulateMediaFeatures([
          { name: "prefers-color-scheme", value: theme },
          { name: "prefers-reduced-motion", value: "reduce" },
        ]);
        await p.setBypassServiceWorker(true);
        await p.evaluateOnNewDocument(() =>
          Object.defineProperty(navigator, "serviceWorker", { value: undefined }),
        );
        await p.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle0" });
        await p.waitForSelector("#home-title");
      }
      for (const state of ["landing", "editor"]) {
        if (state === "editor")
          for (const p of pages) {
            await p.setViewport({ width: 1440, height: 900, hasTouch: coarse });
            await (
              await p.$('input[type="file"]')
            ).uploadFile("/tmp/cloakyard-rollout-2026-10-21/cloakimg/horizon-final/synthetic.png");
            await p.waitForSelector('button[aria-label="Export"]');
          }
        for (const [width, height] of [
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
        ]) {
          const data = [],
            images = [];
          for (let i = 0; i < 2; i++) {
            const p = pages[i];
            await p.setViewport({ width, height, hasTouch: coarse });
            await p.evaluate(async () => {
              await document.fonts.ready;
              scrollTo(0, 0);
              await new Promise((r) =>
                requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
              );
            });
            data.push(
              await p.evaluate(() => ({
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
                controls: [
                  ...document.querySelectorAll("button,summary,input,textarea,select,a,h1,h2,p"),
                ]
                  .filter(
                    (e) =>
                      e.checkVisibility() &&
                      !e.closest("[inert],.sr-only") &&
                      !e.matches(".cloak-skip-link"),
                  )
                  .map((e) => {
                    const s = getComputedStyle(e);
                    return {
                      tag: e.tagName,
                      text: e.textContent?.trim(),
                      rect: e.getBoundingClientRect().toJSON(),
                      font: s.font,
                      color: s.color,
                      background: s.backgroundColor,
                      border: s.border,
                      borderRadius: s.borderRadius,
                    };
                  }),
              })),
            );
            const png = await p.screenshot();
            images.push(png);
            if (i === 1 && [1440, 1280, 390].includes(width))
              await writeFile(
                `${out}/${state}-${width}-${theme}${coarse ? "-coarse" : ""}.png`,
                png,
              );
          }
          if (JSON.stringify(data[0]) !== JSON.stringify(data[1])) {
            await writeFile(
              `${out}/geometry-mismatch-${state}-${width}-${theme}.json`,
              JSON.stringify(data, null, 2),
            );
          }
          assert.deepEqual(data[1], data[0], `${state}/${width}/${theme} geometry/styles`);
          let differingPixels = 0,
            maxChannelDifference = 0;
          const a = await sharp(images[0]).ensureAlpha().raw().toBuffer(),
            b = await sharp(images[1]).ensureAlpha().raw().toBuffer();
          for (let j = 0; j < a.length; j += 4) {
            let d = 0;
            for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a[j + k] - b[j + k]));
            if (d) differingPixels++;
            maxChannelDifference = Math.max(maxChannelDifference, d);
          }
          rows.push({
            state,
            width,
            height,
            theme,
            coarse,
            geometryAndStylesEqual: true,
            overflow: data[1].overflow,
            differingPixels,
            maxChannelDifference,
            sha256: createHash("sha256").update(images[1]).digest("hex"),
          });
        }
      }
      for (const c of contexts) await c.close();
    }
  assert.deepEqual(errors, []);
  await writeFile(`${out}/comparison.json`, JSON.stringify({ rows, errors }, null, 2) + "\n");
  console.log(
    `${rows.length} baseline/current landing/editor geometry/style comparisons passed; pixel differences and existing overflow recorded.`,
  );
} finally {
  await browser.close();
}
