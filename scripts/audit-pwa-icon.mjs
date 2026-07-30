// Verify the Android launcher asset, then render the common adaptive-icon
// masks into one contact sheet for human inspection.

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const screenshotPath = resolve(
  process.env.PWA_ICON_AUDIT_PATH || "/tmp/cloakimg-android-icon-masks.png",
);

if (!existsSync(chromePath)) {
  console.error(`Chrome is missing at ${chromePath}`);
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--user-data-dir=${mkdtempSync(resolve(tmpdir(), "cloakimg-pwa-icon-audit-"))}`,
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 620, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: "networkidle0" });

  const metrics = await page.evaluate(async () => {
    const iconUrl = new URL("/icons/maskable-icon-512x512.png", location.href).href;
    const response = await fetch(iconUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Maskable icon returned ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    if (bitmap.width !== 512 || bitmap.height !== 512) {
      throw new Error(`Expected a 512px maskable icon, received ${bitmap.width}×${bitmap.height}`);
    }

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is unavailable");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixelAt = (x, y) => {
      const offset = (y * canvas.width + x) * 4;
      return Array.from(pixels.slice(offset, offset + 4));
    };
    const cornerAlpha = [
      pixelAt(0, 0)[3],
      pixelAt(canvas.width - 1, 0)[3],
      pixelAt(0, canvas.height - 1)[3],
      pixelAt(canvas.width - 1, canvas.height - 1)[3],
    ];

    const centre = canvas.width / 2;
    const safeRadius = canvas.width * 0.4;
    let whitePixels = 0;
    let whitePixelsOutsideSafeZone = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const isGlyph =
          pixels[offset] >= 248 &&
          pixels[offset + 1] >= 248 &&
          pixels[offset + 2] >= 248 &&
          pixels[offset + 3] >= 250;
        if (!isGlyph) continue;
        whitePixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (Math.hypot(x + 0.5 - centre, y + 0.5 - centre) > safeRadius) {
          whitePixelsOutsideSafeZone += 1;
        }
      }
    }

    document.head.insertAdjacentHTML(
      "beforeend",
      `<style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          background: #faf8f5;
          color: #1f1a18;
          font-family: Arial, sans-serif;
        }
        main { padding: 32px; }
        h1 { margin: 0; font-size: 24px; line-height: 1.1; }
        p { margin: 8px 0 24px; color: #746b66; font-size: 13px; }
        .masks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        figure { margin: 0; text-align: center; }
        .tile {
          display: grid;
          min-height: 152px;
          place-items: center;
          border: 1px solid #e0d9d4;
          border-radius: 12px;
        }
        .tile.light { background: #ffffff; }
        .tile.dark { background: #27211f; }
        .icon {
          display: block;
          width: 120px;
          height: 120px;
          object-fit: cover;
        }
        .circle { border-radius: 50%; }
        .squircle { border-radius: 30%; }
        .rounded { border-radius: 18%; }
        figcaption {
          margin-top: 8px;
          color: #746b66;
          font-size: 11px;
          font-weight: 700;
        }
        .density {
          display: flex;
          align-items: end;
          justify-content: center;
          gap: 22px;
          margin-top: 28px;
          border-top: 1px solid #e0d9d4;
          padding-top: 22px;
        }
        .density img { display: block; border-radius: 28%; }
        .density span { display: block; margin-top: 6px; color: #746b66; font-size: 10px; }
      </style>`,
    );
    document.body.innerHTML = `
      <main>
        <h1>CloakIMG · Android launcher audit</h1>
        <p>Full-bleed maskable asset · common launcher crops · light and dark wallpapers</p>
        <div class="masks">
          <figure><div class="tile light"><img class="icon circle" src="${iconUrl}" alt=""></div><figcaption>Circle · light</figcaption></figure>
          <figure><div class="tile dark"><img class="icon circle" src="${iconUrl}" alt=""></div><figcaption>Circle · dark</figcaption></figure>
          <figure><div class="tile light"><img class="icon squircle" src="${iconUrl}" alt=""></div><figcaption>Squircle</figcaption></figure>
          <figure><div class="tile dark"><img class="icon rounded" src="${iconUrl}" alt=""></div><figcaption>Rounded square</figcaption></figure>
        </div>
        <div class="density" aria-label="Android launcher density preview">
          ${[48, 72, 96, 120]
            .map(
              (size) =>
                `<figure><img src="${iconUrl}" width="${size}" height="${size}" alt=""><span>${size}px</span></figure>`,
            )
            .join("")}
        </div>
      </main>`;
    await Promise.all(
      Array.from(document.images).map((image) =>
        image.complete ? Promise.resolve() : image.decode(),
      ),
    );

    return {
      dimensions: [bitmap.width, bitmap.height],
      cornerAlpha,
      whitePixels,
      whitePixelsOutsideSafeZone,
      whiteBounds: { minX, minY, maxX, maxY },
      safeRadius,
    };
  });

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({ screenshotPath, ...metrics }, null, 2));

  const fullyOpaque = metrics.cornerAlpha.every((alpha) => alpha === 255);
  if (!fullyOpaque || metrics.whitePixels === 0 || metrics.whitePixelsOutsideSafeZone !== 0) {
    console.error("Android maskable-icon audit failed");
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
