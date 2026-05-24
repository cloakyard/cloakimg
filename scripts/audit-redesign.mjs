// /tmp/cloakimg-audit.mjs — Audit the editor on desktop (1440×900) and
// mobile (390×844) viewports across light + dark mode. Captures
// screenshots and reads console errors for each combination.
//
//   BASE_URL=http://localhost:5174 node /tmp/cloakimg-audit.mjs

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://localhost:5174";
const TEST_PNG = resolve("/Users/sumitsahoo/Developer/cloakimg/public/icons/pwa-512x512.png");

if (!existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}`);
  process.exit(1);
}
if (!existsSync(TEST_PNG)) {
  console.error(`Test image not found at ${TEST_PNG}`);
  process.exit(1);
}

const SCENARIOS = [
  { name: "desktop-light", viewport: { width: 1440, height: 900 }, dark: false, isMobile: false },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, dark: true, isMobile: false },
  {
    name: "mobile-light",
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    dark: false,
    isMobile: true,
  },
  {
    name: "mobile-dark",
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    dark: true,
    isMobile: true,
  },
];

async function audit(scenario) {
  const profileDir = mkdtempSync(resolve(tmpdir(), `cloakimg-audit-${scenario.name}-`));
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      `--user-data-dir=${profileDir}`,
    ],
  });

  const errors = [];
  const warnings = [];
  try {
    const page = await browser.newPage();
    await page.setViewport(scenario.viewport);
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: scenario.dark ? "dark" : "light" },
    ]);
    page.on("console", (msg) => {
      const t = msg.type();
      if (t === "error") errors.push(msg.text());
      else if (t === "warning" || t === "warn") warnings.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

    await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Step 1: landing screenshot
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({
      path: `/tmp/cloakimg-${scenario.name}-01-landing.png`,
      fullPage: false,
    });

    // Click the "Open editor" CTA to mount StartModal + its file input.
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /open editor/i.test(b.textContent ?? ""),
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Step 2: file input is now mounted inside StartModal.
    let fileInputs = [];
    try {
      await page.waitForSelector('input[type="file"]', { timeout: 8000 });
      fileInputs = await page.$$('input[type="file"]');
    } catch {
      // ignore — handled below
    }
    if (fileInputs.length === 0) {
      console.warn(`[${scenario.name}] no file input on landing`);
    } else {
      await fileInputs[0].uploadFile(TEST_PNG);

      // Wait for StartModal confirm to appear (Open in editor button).
      // Match the modal CTA precisely — `open in editor` is distinct from
      // the landing CTA `open editor`, but a loose regex matched both
      // and re-triggered the landing CTA (DOM order) as a no-op.
      try {
        await page.waitForFunction(
          () =>
            Array.from(document.querySelectorAll("button")).some((b) =>
              /open\s+in\s+editor/i.test(b.textContent ?? ""),
            ),
          { timeout: 15000 },
        );
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button")).find((b) =>
            /open\s+in\s+editor/i.test(b.textContent ?? ""),
          );
          btn?.click();
        });
      } catch {
        console.warn(`[${scenario.name}] couldn't find "Open in editor" button`);
      }

      // Wait for the editor <main> to mount (proves Landing unmounted).
      try {
        await page.waitForSelector("main", { timeout: 15000 });
      } catch {
        console.warn(`[${scenario.name}] editor <main> never mounted`);
      }
      await new Promise((r) => setTimeout(r, 2500));

      // Step 3: editor idle screenshot
      await page.screenshot({
        path: `/tmp/cloakimg-${scenario.name}-02-editor-idle.png`,
        fullPage: false,
      });

      // Step 4: on mobile, tap the Tools pill to expand the bottom sheet;
      // on desktop, click the Adjust tool in the left rail.
      if (scenario.isMobile) {
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button")).find((b) =>
            /^open tools$/i.test((b.getAttribute("aria-label") ?? "").trim()),
          );
          btn?.click();
        });
        await new Promise((r) => setTimeout(r, 1000));
        await page.screenshot({
          path: `/tmp/cloakimg-${scenario.name}-03-tools-picker.png`,
        });
        // Pick Adjust from the picker
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button")).find((b) =>
            /^adjust$/i.test((b.getAttribute("aria-label") ?? "").trim()),
          );
          btn?.click();
        });
      } else {
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button")).find((b) =>
            /^adjust$/i.test((b.getAttribute("aria-label") ?? "").trim()),
          );
          btn?.click();
        });
      }
      await new Promise((r) => setTimeout(r, 1200));
      await page.screenshot({
        path: `/tmp/cloakimg-${scenario.name}-04-adjust.png`,
      });

      // Step 5: open Emoji to verify the single-scroll fix.
      if (scenario.isMobile) {
        // Cancel current tool first (the ✕ on the mobile footer).
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button")).find((b) =>
            /^cancel$/i.test((b.getAttribute("aria-label") ?? "").trim()),
          );
          btn?.click();
        });
        await new Promise((r) => setTimeout(r, 600));
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll("button")).find((b) =>
            /^open tools$/i.test((b.getAttribute("aria-label") ?? "").trim()),
          );
          btn?.click();
        });
        await new Promise((r) => setTimeout(r, 600));
      }
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          /^emoji$/i.test((b.getAttribute("aria-label") ?? "").trim()),
        );
        btn?.click();
      });
      await new Promise((r) => setTimeout(r, 1200));
      await page.screenshot({
        path: `/tmp/cloakimg-${scenario.name}-05-emoji.png`,
      });

      // Step 6: count vertical scrollers inside the tool panel area
      // (regression check for the EmojiPanel double-scroll bug).
      const scrollerCount = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll("div"));
        return candidates.filter((el) => {
          const cs = getComputedStyle(el);
          const oy = cs.overflowY;
          const scrollable = oy === "auto" || oy === "scroll";
          // Must actually have something to scroll
          return scrollable && el.scrollHeight > el.clientHeight + 4;
        }).length;
      });

      // Step 7: assert the cream page-bg is actually applied to <html>
      // and that no Grainient canvas remains in the editor tree.
      const visual = await page.evaluate(() => {
        const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const grainients = Array.from(document.querySelectorAll(".grainient-fixed")).length;
        // Find the editor <main>
        const main = document.querySelector("main");
        const mainBg = main ? getComputedStyle(main).backgroundColor : null;
        return { htmlBg, bodyBg, mainBg, grainients };
      });

      console.log(
        JSON.stringify(
          { scenario: scenario.name, errors, warnings, scrollerCount, visual },
          null,
          2,
        ),
      );
    }
  } finally {
    await browser.close();
  }
}

for (const s of SCENARIOS) {
  console.log(`\n=== ${s.name} ===`);
  try {
    await audit(s);
  } catch (e) {
    console.error(`[${s.name}] FAIL:`, e.message);
  }
}
process.exit(0);
