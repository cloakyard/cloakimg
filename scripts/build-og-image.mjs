// Render the Air social card using only local artwork, CSS and the product logo.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => errors.push(request.url()));
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(resolve(root, "scripts/og-image.html")).href, {
    waitUntil: "load",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  if (errors.length) throw new Error(errors.join("\n"));
  await page.locator("#stage").wait();
  await (await page.$("#stage")).screenshot({ path: resolve(root, "public/icons/og-image.png") });
  console.log("Saved 1200×630 Air social preview.");
} finally {
  await browser.close();
}
