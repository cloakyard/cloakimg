// Component and modal journey for the Cloakyard Workbench redesign.
// Audits the two most distinct layout modes and proves that the shared
// project, privacy, and export surfaces remain inside the viewport.

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";

if (!existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}`);
  process.exit(1);
}

const scenarios = [
  { name: "desktop", width: 1440, height: 900, touch: false },
  { name: "phone", width: 375, height: 812, touch: true },
];
const failures = [];

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--user-data-dir=${mkdtempSync(resolve(tmpdir(), "cloakimg-component-audit-"))}`,
  ],
});

async function clickButton(page, pattern) {
  const clicked = await page.evaluate((source) => {
    const matcher = new RegExp(source, "i");
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      [candidate.getAttribute("aria-label") ?? "", candidate.textContent ?? ""].some((label) =>
        matcher.test(label.trim()),
      ),
    );
    button?.click();
    return Boolean(button);
  }, pattern.source);
  if (!clicked) throw new Error(`Button not found: ${pattern}`);
}

async function auditDialog(page, scenario, stage) {
  await page.waitForSelector('.cloak-dialog[role="dialog"]', { timeout: 10000 });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 350));
  const state = await page.evaluate(() => {
    const dialog = document.querySelector('.cloak-dialog[role="dialog"]');
    if (!dialog) return null;
    const rect = dialog.getBoundingClientRect();
    return {
      labelled: Boolean(
        dialog.getAttribute("aria-label") || dialog.getAttribute("aria-labelledby"),
      ),
      modal: dialog.getAttribute("aria-modal"),
      solid: getComputedStyle(dialog).backdropFilter === "none",
      bounds: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      },
      viewport: [innerWidth, innerHeight],
    };
  });
  const fits =
    state &&
    state.labelled &&
    state.modal === "true" &&
    state.bounds.left >= -1 &&
    state.bounds.top >= -1 &&
    state.bounds.right <= state.viewport[0] + 1 &&
    state.bounds.bottom <= state.viewport[1] + 1;
  if (!fits) failures.push(`${scenario.name}/${stage}: ${JSON.stringify(state)}`);
  console.log(JSON.stringify({ scenario: scenario.name, stage, ...state }));
}

for (const scenario of scenarios) {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.setViewport({
    width: scenario.width,
    height: scenario.height,
    isMobile: scenario.touch,
    hasTouch: scenario.touch,
    deviceScaleFactor: 1,
  });

  await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
  await clickButton(page, /^Open editor/);
  await auditDialog(page, scenario, "project-upload");
  await clickButton(page, /^Blank canvas/);
  await auditDialog(page, scenario, "project-blank");
  await page.screenshot({
    path: `/tmp/cloakimg-${scenario.name}-project-dialog.png`,
    fullPage: false,
  });
  await clickButton(page, /^Create canvas/);
  await page.waitForSelector(".editor-topbar", { timeout: 15000 });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));

  await clickButton(page, /^Export$/);
  await auditDialog(page, scenario, "export");
  await page.screenshot({
    path: `/tmp/cloakimg-${scenario.name}-export-dialog.png`,
    fullPage: false,
  });

  if (errors.length > 0) failures.push(`${scenario.name}/console: ${errors.join(" | ")}`);
  await page.close();
}

await browser.close();

if (failures.length > 0) {
  console.error(`Component audit failed:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log(`Component audit passed for ${scenarios.length} layout modes.`);
