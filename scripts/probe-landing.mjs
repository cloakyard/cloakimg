// Quick probe — dump the landing page structure so we know how to
// drive it from puppeteer.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://localhost:5174";

if (!existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}`);
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1400, height: 900 },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const page = await browser.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
// Give react a moment to render past any splash.
await new Promise((r) => setTimeout(r, 1500));

const summary = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll("input")).map((i) => ({
    type: i.type,
    accept: i.accept,
    id: i.id,
    name: i.name,
    visibility: getComputedStyle(i).visibility,
    display: getComputedStyle(i).display,
  }));
  const buttons = Array.from(document.querySelectorAll("button"))
    .slice(0, 20)
    .map((b) => ({
      text: (b.textContent ?? "").trim().slice(0, 60),
      ariaLabel: b.getAttribute("aria-label"),
    }));
  const dropzones = Array.from(
    document.querySelectorAll('[class*="dropzone"], [class*="DropZone"], [data-dropzone]'),
  ).map((el) => el.className);
  return { inputs, buttons, dropzones, title: document.title };
});

console.log(JSON.stringify(summary, null, 2));
await browser.close();
