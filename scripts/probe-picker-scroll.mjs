// probe-picker-scroll.mjs — Verify the mobile tool-picker grid scrolls.
// The picker shows 24 tools in a 4-col grid; on a 390×844 viewport
// the grid is taller than the sheet's content area, so the inner
// scroller must accept vertical pans.

import { existsSync, mkdtempSync } from "node:fs";
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

const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-pickerscroll-"));
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: {
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--user-data-dir=${profileDir}`],
});
const page = await browser.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));

await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Open editor/i.test(b.textContent ?? ""),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 600));
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

// Tap "Tools" pill to open picker.
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Open tools/i.test(b.getAttribute("aria-label") ?? ""),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 700));

// Read the layout: outer scroller bounds vs inner content height.
// Also walk up the picker chain logging touch-action / overflow /
// pointer-events so we can spot any ancestor blocking touch pans.
const layout = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return { error: "no-dialog" };
  const scroller = dialog.querySelector(".scroll-thin.overflow-y-auto");
  if (!scroller) return { error: "no-scroller" };
  const content = scroller.firstElementChild;

  const chain = [];
  let el = scroller;
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    chain.push({
      tag: el.tagName.toLowerCase(),
      classes: el.className?.toString?.().slice(0, 60) ?? "",
      touchAction: cs.touchAction,
      overflowY: cs.overflowY,
      overflowX: cs.overflowX,
      overscroll: cs.overscrollBehavior,
      pointerEvents: cs.pointerEvents,
    });
    el = el.parentElement;
  }
  return {
    scrollerH: scroller.clientHeight,
    scrollerScrollH: scroller.scrollHeight,
    contentH: content?.getBoundingClientRect().height ?? 0,
    canScroll: scroller.scrollHeight > scroller.clientHeight,
    chain,
  };
});
console.log("  picker layout:");
console.log(JSON.stringify(layout, null, 2));

// Try to scroll the picker down by issuing a touch drag.
const target = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  const scroller = dialog?.querySelector(".scroll-thin.overflow-y-auto");
  if (!scroller) return null;
  const r = scroller.getBoundingClientRect();
  return { left: r.left, top: r.top, w: r.width, h: r.height };
});
if (target) {
  const client = await page.target().createCDPSession();
  const sx = target.left + target.w / 2;
  const sy = target.top + target.h * 0.7;
  const ey = target.top + target.h * 0.1;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: sx, y: sy, id: 0 }],
  });
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: sx, y: sy + (ey - sy) * t, id: 0 }],
    });
    await new Promise((r) => setTimeout(r, 25));
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await new Promise((r) => setTimeout(r, 400));
}

const after = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  const scroller = dialog?.querySelector(".scroll-thin.overflow-y-auto");
  return scroller ? { scrollTop: scroller.scrollTop } : null;
});
console.log(`  after drag: ${JSON.stringify(after)}`);

await page.screenshot({ path: "/tmp/cloakimg-picker-scroll.png" });
console.log("  screenshot: /tmp/cloakimg-picker-scroll.png");

await browser.close();
if (!layout.canScroll) console.log("⚠️  scroller content does not overflow");
else if (!after || after.scrollTop < 20) console.log("FAIL: scroll did not move");
else console.log(`PASS: scroller moved to ${after.scrollTop}`);
