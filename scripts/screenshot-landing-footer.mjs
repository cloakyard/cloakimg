// screenshot-landing-footer.mjs — Capture the landing page so we can
// visually confirm the version pill now sits inside the "How it works"
// bento card (matches CloakPDF), not the Cloakyard family-promo card.

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const OUT = "/tmp/cloakimg-landing-footer.png";

if (!existsSync(chromePath)) {
  console.error("Chrome missing");
  process.exit(1);
}

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-landing-shot-"));
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1440, height: 2400 },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});

const page = await browser.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 800));

// Scroll to the footer so it's in view.
await page.evaluate(() => {
  document.querySelector("footer")?.scrollIntoView({ block: "end", behavior: "auto" });
});
await new Promise((r) => setTimeout(r, 600));

await page.screenshot({ path: OUT, fullPage: false });
console.log(`Saved ${OUT}`);

// Also capture only the footer crop for cleaner side-by-side review.
const footerBox = await page.evaluate(() => {
  const f = document.querySelector("footer");
  if (!f) return null;
  const r = f.getBoundingClientRect();
  return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: r.width, height: r.height };
});
if (footerBox) {
  const footerOut = OUT.replace(".png", "-cropped.png");
  await page.screenshot({ path: footerOut, clip: footerBox });
  console.log(`Saved ${footerOut}`);
}

await browser.close();
process.exit(0);
