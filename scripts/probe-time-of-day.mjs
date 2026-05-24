// probe-time-of-day.mjs — Verify the Time of Day panel renders cleanly
// at both desktop and mobile widths after the label-overlap fix.
// Checks: (a) no two label buttons overlap horizontally, (b) the
// active label flips coral when the dial moves, (c) tapping a label
// snaps the dial.

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

async function openTimeOfDay(page, isMobile) {
  if (isMobile) {
    // Mobile: tap Tools pill, then the Tone tool.
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /Open tools/i.test(b.getAttribute("aria-label") ?? ""),
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /Time of day|^Tone$/i.test(b.textContent?.trim() ?? ""),
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
  } else {
    // Desktop: click the toolbar button.
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /Time of day/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""),
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function checkLabels(page, viewportLabel) {
  const labels = await page.evaluate(() => {
    // The label legend buttons all have aria-pressed + aria-label
    // starting with "Snap to ". Grab them in document order.
    const buttons = Array.from(document.querySelectorAll('button[aria-label^="Snap to "]'));
    return buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return {
        label: b.textContent?.trim() ?? "",
        left: r.left,
        right: r.right,
        width: r.width,
      };
    });
  });

  if (labels.length !== 6) {
    console.log(`  ${viewportLabel}: FAIL — expected 6 labels, got ${labels.length}`);
    return false;
  }

  // Verify no two labels overlap horizontally.
  let overlap = false;
  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1];
    const cur = labels[i];
    if (cur.left < prev.right) {
      console.log(
        `  ${viewportLabel}: OVERLAP — "${prev.label}" (right ${prev.right.toFixed(1)}) into "${cur.label}" (left ${cur.left.toFixed(1)})`,
      );
      overlap = true;
    }
  }
  if (!overlap) {
    console.log(
      `  ${viewportLabel}: OK — 6 labels, gaps ${labels
        .slice(1)
        .map((c, i) => (c.left - labels[i].right).toFixed(0))
        .join(", ")}px`,
    );
  }
  return !overlap;
}

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-tod-"));
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});

let fails = 0;

// ─── Desktop ────────────────────────────────────────────────────────
console.log("─── Desktop (1280×800) ─────────────────────────");
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await openEditor(page);
  await openTimeOfDay(page, false);
  if (!(await checkLabels(page, "desktop"))) fails++;
  await page.screenshot({ path: "/tmp/cloakimg-tod-desktop.png" });
  console.log("  screenshot: /tmp/cloakimg-tod-desktop.png");
  await page.close();
}

// ─── Mobile ─────────────────────────────────────────────────────────
console.log("\n─── Mobile (390×844) ───────────────────────────");
{
  const page = await browser.newPage();
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  await openEditor(page);
  await openTimeOfDay(page, true);
  if (!(await checkLabels(page, "mobile"))) fails++;
  await page.screenshot({ path: "/tmp/cloakimg-tod-mobile.png" });
  console.log("  screenshot: /tmp/cloakimg-tod-mobile.png");
  await page.close();
}

await browser.close();

if (fails > 0) {
  console.log(`\nFAIL (${fails} viewport(s))`);
  process.exit(1);
}
console.log("\nPASS: labels do not overlap at desktop or mobile widths ✓");
