// Rebuild every store/social image from the current app and brand source.
// The demo artwork is generated in-browser and opened through CloakIMG's
// real file-input path, so captures exercise the production editor without
// publishing a person's photograph or relying on a network fixture.

import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";

if (!existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}`);
  process.exit(1);
}

const targets = [
  {
    output: resolve(root, "public/screenshots/iPhone.png"),
    viewport: { width: 430, height: 932, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    orientation: "portrait",
    surface: "picker",
  },
  {
    output: resolve(root, "public/screenshots/iPad.png"),
    viewport: { width: 1366, height: 1024, isMobile: false, hasTouch: true, deviceScaleFactor: 2 },
    orientation: "landscape",
    surface: "adjust",
  },
];

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--user-data-dir=${mkdtempSync(resolve(tmpdir(), "cloakimg-pwa-shots-"))}`,
  ],
});

async function openDemoImage(page, orientation) {
  const fileName = orientation === "portrait" ? "coastal-light-portrait.png" : "coastal-light.png";

  await page.evaluate(
    async ({ fileName, orientation }) => {
      const portrait = orientation === "portrait";
      const width = portrait ? 1440 : 2000;
      const height = portrait ? 1800 : 1400;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create the demo image canvas.");

      const sx = width / 100;
      const sy = height / 100;
      const path = (points, fill) => {
        context.beginPath();
        points(context, sx, sy);
        context.closePath();
        context.fillStyle = fill;
        context.fill();
      };

      // Cool coastal light keeps Signal Coral reserved for the editor UI.
      const sky = context.createLinearGradient(0, 0, 0, height * 0.68);
      sky.addColorStop(0, "#7d9fc0");
      sky.addColorStop(0.55, "#d9b3a6");
      sky.addColorStop(1, "#efc79f");
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      const sun = context.createRadialGradient(
        width * 0.72,
        height * 0.27,
        0,
        width * 0.72,
        height * 0.27,
        width * 0.13,
      );
      sun.addColorStop(0, "rgba(255, 245, 214, 0.96)");
      sun.addColorStop(0.22, "rgba(255, 224, 181, 0.72)");
      sun.addColorStop(1, "rgba(255, 224, 181, 0)");
      context.fillStyle = sun;
      context.fillRect(0, 0, width, height);

      // Sparse cloud bands add photographic depth without using a real person or place.
      context.save();
      context.globalAlpha = 0.22;
      context.filter = `blur(${Math.round(width * 0.012)}px)`;
      context.fillStyle = "#fff8ed";
      for (const [x, y, rx, ry] of [
        [18, 19, 24, 5],
        [59, 13, 19, 4],
        [79, 36, 16, 4],
      ]) {
        context.beginPath();
        context.ellipse(x * sx, y * sy, rx * sx, ry * sy, -0.08, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();

      path((ctx, x, y) => {
        ctx.moveTo(0, 67 * y);
        ctx.bezierCurveTo(12 * x, 58 * y, 21 * x, 61 * y, 33 * x, 48 * y);
        ctx.bezierCurveTo(42 * x, 38 * y, 50 * x, 61 * y, 62 * x, 57 * y);
        ctx.bezierCurveTo(74 * x, 53 * y, 82 * x, 62 * y, 100 * x, 55 * y);
        ctx.lineTo(100 * x, 79 * y);
        ctx.lineTo(0, 79 * y);
      }, "#6f6570");

      path((ctx, x, y) => {
        ctx.moveTo(0, 74 * y);
        ctx.bezierCurveTo(15 * x, 64 * y, 22 * x, 73 * y, 35 * x, 60 * y);
        ctx.bezierCurveTo(47 * x, 50 * y, 54 * x, 73 * y, 66 * x, 64 * y);
        ctx.bezierCurveTo(77 * x, 57 * y, 86 * x, 73 * y, 100 * x, 65 * y);
        ctx.lineTo(100 * x, 84 * y);
        ctx.lineTo(0, 84 * y);
      }, "#3d3c47");

      const water = context.createLinearGradient(0, height * 0.66, 0, height);
      water.addColorStop(0, "#516f79");
      water.addColorStop(1, "#162e35");
      context.fillStyle = water;
      context.fillRect(0, height * 0.71, width, height * 0.29);

      context.save();
      context.globalAlpha = 0.34;
      context.strokeStyle = "#f5d2ac";
      context.lineWidth = Math.max(2, width * 0.0012);
      for (let index = 0; index < 18; index += 1) {
        const y = height * (0.75 + index * 0.012);
        const half = width * (0.025 + index * 0.011);
        context.beginPath();
        context.moveTo(width * 0.72 - half, y);
        context.quadraticCurveTo(width * 0.72, y - height * 0.004, width * 0.72 + half, y);
        context.stroke();
      }
      context.restore();

      path((ctx, x, y) => {
        ctx.moveTo(0, 87 * y);
        ctx.bezierCurveTo(14 * x, 82 * y, 24 * x, 91 * y, 38 * x, 85 * y);
        ctx.bezierCurveTo(54 * x, 79 * y, 66 * x, 91 * y, 82 * x, 84 * y);
        ctx.bezierCurveTo(89 * x, 81 * y, 95 * x, 83 * y, 100 * x, 80 * y);
        ctx.lineTo(100 * x, 100 * y);
        ctx.lineTo(0, 100 * y);
      }, "#15272b");

      // Deterministic fine grain prevents the generated scene from reading as flat vector art.
      let seed = 20260729;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      context.save();
      context.globalAlpha = 0.035;
      for (let index = 0; index < 18000; index += 1) {
        const value = random() > 0.5 ? 255 : 18;
        context.fillStyle = `rgb(${value} ${value} ${value})`;
        const size = random() > 0.94 ? 2 : 1;
        context.fillRect(Math.floor(random() * width), Math.floor(random() * height), size, size);
      }
      context.restore();

      const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, "image/png"));
      if (!blob) throw new Error("Could not encode the demo image.");
      const input = document.querySelector('#workbench input[type="file"]');
      if (!(input instanceof HTMLInputElement)) {
        throw new Error("The landing image input was not found.");
      }
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], fileName, { type: "image/png" }));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { fileName, orientation },
  );

  await page.waitForSelector(".editor-topbar", { timeout: 15000 });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("canvas")).some(
        (canvas) => canvas.width > 100 && canvas.height > 100,
      ),
    { timeout: 15000 },
  );
}

async function exposeFeaturedSurface(page, surface) {
  if (surface === "picker") {
    await page.click('button[aria-label="Open tools"]');
    await page.waitForSelector('button[aria-label="Adjust"]', { visible: true, timeout: 10000 });
    return;
  }

  await page.click('button[aria-label="Adjust"]');
  await page.waitForFunction(
    () =>
      document.querySelector(".editor-properties")?.textContent?.includes("Exposure") &&
      !document.querySelector("[data-tool-panel-loading]"),
    { timeout: 10000 },
  );
}

for (const target of targets) {
  const page = await browser.newPage();
  await page.setViewport(target.viewport);
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "light" },
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
  await openDemoImage(page, target.orientation);
  await exposeFeaturedSurface(page, target.surface);
  await page.mouse.move(target.viewport.width / 2, target.viewport.height / 2);
  await page.evaluate(() => document.fonts.ready);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));

  const layoutAudit = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    canvasCount: document.querySelectorAll("canvas").length,
  }));
  if (layoutAudit.scrollWidth !== layoutAudit.clientWidth || layoutAudit.canvasCount === 0) {
    throw new Error(`Screenshot layout audit failed: ${JSON.stringify(layoutAudit)}`);
  }

  await page.screenshot({ path: target.output, fullPage: false });
  console.log(`Saved ${target.output}`);
  await page.close();
}

const ogSvgPath = resolve(root, "public/icons/og-image.svg");
const ogOutput = resolve(root, "public/icons/og-image.png");
const archivo = readFileSync(
  resolve(root, "node_modules/@fontsource/archivo/files/archivo-latin-800-normal.woff2"),
).toString("base64");
const jetBrainsMono = readFileSync(
  resolve(
    root,
    "node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2",
  ),
).toString("base64");
const ogSvg = readFileSync(ogSvgPath, "utf8");
const ogPage = await browser.newPage();
await ogPage.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await ogPage.setContent(
  `<!doctype html>
  <html>
    <head>
      <style>
        @font-face {
          font-family: "Archivo";
          src: url(data:font/woff2;base64,${archivo}) format("woff2");
          font-style: normal;
          font-weight: 800;
        }
        @font-face {
          font-family: "JetBrains Mono";
          src: url(data:font/woff2;base64,${jetBrainsMono}) format("woff2");
          font-style: normal;
          font-weight: 700;
        }
        html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
        body { background: #faf8f5; }
        svg { display: block; width: 1200px; height: 630px; }
      </style>
    </head>
    <body>${ogSvg}</body>
  </html>`,
  { waitUntil: "load" },
);
await ogPage.evaluate(() => document.fonts.ready);
await ogPage.screenshot({ path: ogOutput, fullPage: false });
console.log(`Saved ${ogOutput}`);
await ogPage.close();

await browser.close();

for (const asset of [...targets.map((target) => target.output), ogOutput]) {
  if (statSync(asset).size < 20_000) {
    throw new Error(`Generated asset is unexpectedly small: ${asset}`);
  }
}
