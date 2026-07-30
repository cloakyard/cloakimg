// Production-only PWA toast audit. Run against `vp preview` so the real
// generated service worker reaches its offline-ready state.

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173";
const screenshotPath = resolve(
  process.env.PWA_TOAST_AUDIT_PATH || "/tmp/cloakimg-android-pwa-toast.png",
);

if (!existsSync(chromePath)) {
  console.error(`Chrome is missing at ${chromePath}`);
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: {
    width: 280,
    height: 653,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--user-data-dir=${mkdtempSync(resolve(tmpdir(), "cloakimg-pwa-toast-audit-"))}`,
  ],
});

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
  const toast = await page.waitForSelector('[data-testid="pwa-toast-positioner"] [data-state]', {
    visible: true,
    timeout: 10000,
  });
  await page.focus('button[aria-label="Dismiss offline status"]');

  const metrics = await toast.evaluate((card) => {
    const rect = card.getBoundingClientRect();
    const controls = Array.from(card.querySelectorAll("button")).map((control) => {
      const controlRect = control.getBoundingClientRect();
      return {
        label: control.getAttribute("aria-label") || control.textContent?.trim(),
        left: Math.round(controlRect.left),
        right: Math.round(controlRect.right),
        top: Math.round(controlRect.top),
        bottom: Math.round(controlRect.bottom),
      };
    });
    return {
      state: card.getAttribute("data-state"),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      viewport: [innerWidth, innerHeight],
      scrollWidth: document.documentElement.scrollWidth,
      controls,
    };
  });

  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(JSON.stringify({ screenshotPath, errors, ...metrics }, null, 2));

  const escapedControl = metrics.controls.some(
    (control) => control.left < 0 || control.right > metrics.viewport[0],
  );
  if (
    errors.length > 0 ||
    metrics.state !== "offline" ||
    metrics.left < 0 ||
    metrics.right > metrics.viewport[0] ||
    metrics.bottom > metrics.viewport[1] ||
    metrics.scrollWidth > metrics.viewport[0] ||
    escapedControl
  ) {
    console.error("PWA toast audit failed");
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

process.exit(process.exitCode ?? 0);
