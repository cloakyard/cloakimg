// probe-scrollbar-coarse.mjs — Verify the scroll-thin scrollbar is
// hidden on touch (`pointer: coarse`) so the OS overlay takes over,
// but still visible on desktop. Inspects matchMedia + computed
// scrollbar-width on the actual sheet scroller element after the
// editor is open.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const TEST_JPG = resolve(ROOT, "test-fixtures/IMG_1804.jpg");

async function openEditor(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Open editor/i.test(b.textContent ?? ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.waitForSelector('input[type="file"]', { timeout: 10000 });
  const fileInputs = await page.$$('input[type="file"]');
  await fileInputs[0].uploadFile(TEST_JPG);
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("button")).some((b) =>
        /Open in editor/i.test(b.textContent ?? ""),
      ),
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Open in editor/i.test(b.textContent ?? ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 4500));
}

async function inspectScroller(page) {
  return page.evaluate(() => {
    const sc = document.querySelector(".scroll-thin.overflow-y-auto");
    if (!sc) return { error: "no scroll-thin element found" };
    const cs = getComputedStyle(sc);
    return {
      isCoarse: window.matchMedia("(pointer: coarse)").matches,
      scrollbarWidth: cs.scrollbarWidth,
      overflowY: cs.overflowY,
      clientWidth: sc.clientWidth,
      offsetWidth: sc.offsetWidth,
      gutterPx: sc.offsetWidth - sc.clientWidth,
    };
  });
}

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-scrollbar-"));
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});

let fails = 0;

// ─── Desktop (pointer: fine) ─────────────────────────────────────────
console.log("─── Desktop (pointer: fine — expect classic 6px bar) ───");
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await openEditor(page);
  // Open Time of Day to ensure a scroll-thin element is mounted.
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Time of day/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  const info = await inspectScroller(page);
  console.log(" ", JSON.stringify(info));
  // Desktop should report coarse=false. scrollbar-width: thin.
  if (info.isCoarse !== false) {
    console.log("  FAIL — desktop expected coarse=false");
    fails++;
  }
  if (info.scrollbarWidth !== "thin") {
    console.log(`  FAIL — desktop scrollbar-width=${info.scrollbarWidth}, expected thin`);
    fails++;
  }
  await page.close();
}

// ─── Mobile (pointer: coarse) ────────────────────────────────────────
console.log("\n─── Mobile (pointer: coarse — expect no classic bar) ───");
{
  const page = await browser.newPage();
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  // Puppeteer mobile emulation sets hasTouch but doesn't always flip
  // the matchMedia to coarse — emulate that explicitly via raw CDP.
  // Puppeteer's `emulateMediaFeatures` wrapper rejects the `pointer`
  // feature name, but `Emulation.setEmulatedMedia` accepts it.
  const cdp = await page.target().createCDPSession();
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "pointer", value: "coarse" }],
  });
  await openEditor(page);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Open tools/i.test(b.getAttribute("aria-label") ?? ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /^Tone$|Time of day/i.test(b.textContent?.trim() ?? ""),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const info = await inspectScroller(page);
  console.log(" ", JSON.stringify(info));
  if (info.isCoarse !== true) {
    console.log("  FAIL — mobile expected coarse=true");
    fails++;
  }
  if (info.scrollbarWidth !== "none") {
    console.log(`  FAIL — mobile scrollbar-width=${info.scrollbarWidth}, expected none`);
    fails++;
  }
  await page.close();
}

await browser.close();

if (fails > 0) {
  console.log(`\nFAIL (${fails} check(s))`);
  process.exit(1);
}
console.log("\nPASS: scroll-thin honors pointer: coarse ✓");
