// probe-cold-start.mjs — Reproduce the user's report that on a fresh
// cold start (no localStorage, no cache), tapping any smart-action
// button bounces them back to the landing page.
//
// We launch Chrome with a fresh user-data-dir so there's nothing
// preserved between runs (no consent flags, no HF model cache, no
// service worker, no React state). Then we drive the same flow the
// user described: open editor → upload JPEG → click Person / Faces →
// dismiss through every supported route → watch for navigation back to
// landing or a smart-action state that never settles.
//
// "Landed on home" detection: we install a marker on `window` after
// the editor mounts. If the page navigates back to landing the
// marker disappears (full reload) OR the landing-only "Open editor"
// button reappears in the DOM.
//
// Usage:
//   pnpm exec vp dev                           # in another shell
//   BASE_URL=http://localhost:5173 \
//     node scripts/probe-cold-start.mjs

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME;
const baseUrl = process.env.BASE_URL || "http://localhost:5173";

const TEST_JPG = resolve(ROOT, "test-fixtures/IMG_1804.jpg");

if (!existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}`);
  process.exit(1);
}
if (!existsSync(TEST_JPG)) {
  console.error(`Test image not found at ${TEST_JPG}`);
  process.exit(1);
}

// Each run gets a fresh profile dir so localStorage / IndexedDB / SW
// cache are guaranteed empty — exactly the user's "first start" scenario.
const profileDir = mkdtempSync(resolve(tmpdir(), "cloakimg-cold-"));
console.log(`→ Fresh user-data-dir: ${profileDir}`);

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1400, height: 900 },
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--user-data-dir=${profileDir}`,
    // NOTE: do NOT disable Service Worker — the suspected first-start
    // bug is a PWA `controllerchange` / SW activation triggering a
    // full reload right after the editor mounts.
  ],
});

const page = await browser.newPage();

const consoleLogs = [];
page.on("console", (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push({ message: err.message, stack: err.stack }));

// Navigation tracker — every URL change gets logged so we can see if
// the page reloaded / navigated.
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) {
    console.log(`  [navigation] → ${frame.url()}`);
  }
});

console.log(`→ Navigating to ${baseUrl}`);
await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });

// Turn on AI debug logging BUT DO NOT pre-grant any consent — we want
// the genuine first-time-cold-start path.
await page.evaluate(() => {
  try {
    localStorage.setItem("ai_debug", "1");
  } catch {
    // ignore
  }
});
await page.reload({ waitUntil: "networkidle2" });

console.log("→ Open editor");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Open editor/i.test(b.textContent ?? ""),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1500));

console.log(`→ Uploading JPEG: ${TEST_JPG}`);
await page.waitForSelector('input[type="file"]', { timeout: 10000 });
const fileInputs = await page.$$('input[type="file"]');
await fileInputs.at(-1).uploadFile(TEST_JPG);

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
console.log("→ Clicked 'Open in editor', waiting for editor to mount");
await new Promise((r) => setTimeout(r, 4000));

// Plant a marker on window to detect a full navigation back to landing
// (which would clear `window.__cloakProbeMarker`).
await page.evaluate(() => {
  window.__cloakProbeMarker = "editor-mounted";
});
console.log("→ Marker planted on window");

console.log("→ Click Redact tool");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t =
      (b.textContent ?? "") +
      " " +
      (b.getAttribute("title") ?? "") +
      " " +
      (b.getAttribute("aria-label") ?? "");
    return /redact/i.test(t);
  });
  btn?.click();
});
await page.waitForFunction(
  () => {
    const btns = Array.from(document.querySelectorAll("button"));
    return btns.some((b) => /^Faces/i.test((b.textContent ?? "").trim()));
  },
  { timeout: 10000 },
);

async function pageState(label) {
  return page.evaluate((l) => {
    const onLanding =
      Array.from(document.querySelectorAll("button")).some((b) =>
        /Open editor/i.test(b.textContent ?? ""),
      ) && !document.querySelector('canvas[width="1000"]');
    return {
      label: l,
      url: location.pathname + location.search,
      markerPresent: window.__cloakProbeMarker === "editor-mounted",
      onLanding,
      bodyHead: document.body.innerText.slice(0, 200),
    };
  }, label);
}

async function detectExitTriggers(label, durationMs) {
  // Snapshot console logs at the time we click; we'll filter for any
  // `editor exit()` lines that happen within the wait window.
  const beforeCount = consoleLogs.length;
  await new Promise((r) => setTimeout(r, durationMs));
  const newLogs = consoleLogs.slice(beforeCount);
  const exitLogs = newLogs.filter((l) => /editor exit\(\) called/.test(l.text));
  const errorLogs = newLogs.filter((l) => l.type === "error");
  console.log(`  ${label}: exitCalled=${exitLogs.length > 0} errorCount=${errorLogs.length}`);
  for (const e of exitLogs) console.log(`    EXIT: ${e.text.slice(0, 200)}`);
  for (const e of errorLogs.slice(0, 5)) console.log(`    [error] ${e.text.slice(0, 200)}`);
  return { exited: exitLogs.length > 0, errors: errorLogs };
}

async function dumpDialogs() {
  return page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    return dialogs.map((d) => {
      const id = d.getAttribute("aria-labelledby") || d.id || "(no id)";
      const buttons = Array.from(d.querySelectorAll("button")).map((b) => ({
        text: (b.textContent ?? "").trim().slice(0, 60),
        ariaLabel: b.getAttribute("aria-label"),
        cls: (b.className ?? "").slice(0, 80),
      }));
      return { id, buttons };
    });
  });
}

async function clickInDialog(matcher) {
  return page.evaluate((m) => {
    const re = new RegExp(m, "i");
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return "no-dialog";
    const btn = Array.from(dialog.querySelectorAll("button")).find((b) => {
      const t = (b.textContent ?? "") + " " + (b.getAttribute("aria-label") ?? "");
      return re.test(t);
    });
    if (!btn) return "no-match";
    btn.click();
    return "clicked";
  }, matcher);
}

async function clickSmartAction(name) {
  return page.evaluate((n) => {
    // The new SmartAnonymizeButton concatenates label + description
    // text without a separator (e.g. "PersonWhole body silhouette").
    // Match if the button's trimmed textContent starts with the
    // requested name.
    const re = new RegExp(`^${n}`, "i");
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      re.test((b.textContent ?? "").trim()),
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, name);
}

async function reset() {
  // Press Escape, then check no dialog open.
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 600));
}

let failures = 0;
async function checkDismissal(label, clickResult) {
  const triggerState = await detectExitTriggers(label, 1200);
  const state = await pageState(label);
  console.log(JSON.stringify(state, null, 2));
  const passed =
    clickResult === "clicked" &&
    !triggerState.exited &&
    triggerState.errors.length === 0 &&
    state.markerPresent &&
    !state.onLanding &&
    !documentHasOpenConsent(state.bodyHead);
  console.log(`  ${passed ? "✓" : "✗"} ${label}`);
  if (!passed) failures++;
}

function documentHasOpenConsent(bodyText) {
  return /Download (subject detection|face detection)/i.test(bodyText);
}

// —————————————— TEST 1: cold-start, click Person → click X ——————————————

console.log("\n========================================");
console.log("TEST 1: cold-start → click Person → consent dialog appears → click X");
console.log("========================================");
console.log(JSON.stringify(await pageState("before-Person"), null, 2));
console.log(`  click Person → ${(await clickSmartAction("Person")) ? "ok" : "MISSING"}`);
await new Promise((r) => setTimeout(r, 1500));
console.log("  dialogs:", JSON.stringify(await dumpDialogs(), null, 2));
const personClose = await clickInDialog("Close");
console.log(`  click X (Close) → ${personClose}`);
await checkDismissal("after Person→X", personClose);

// —————————————— TEST 2: click Person → click "Not now" ——————————————

console.log("\n========================================");
console.log("TEST 2: cold-start → click Person → click 'Not now'");
console.log("========================================");
await reset();
console.log(`  click Person → ${(await clickSmartAction("Person")) ? "ok" : "MISSING"}`);
await new Promise((r) => setTimeout(r, 1500));
const personNotNow = await clickInDialog("Not now");
console.log(`  click 'Not now' → ${personNotNow}`);
await checkDismissal("after Person→Not-now", personNotNow);

// —————————————— TEST 3: click Faces → click X (face-detect dialog) ——————————————

console.log("\n========================================");
console.log("TEST 3: cold-start → click Faces → click X");
console.log("========================================");
await reset();
console.log(`  click Faces → ${(await clickSmartAction("Faces")) ? "ok" : "MISSING"}`);
await new Promise((r) => setTimeout(r, 1500));
console.log("  dialogs:", JSON.stringify(await dumpDialogs(), null, 2));
const facesClose = await clickInDialog("Close");
console.log(`  click X (Close) → ${facesClose}`);
await checkDismissal("after Faces→X", facesClose);

// —————————————— TEST 4: tap outside the dialog (backdrop click) ——————————————

console.log("\n========================================");
console.log("TEST 4: cold-start → click Person → click on dialog backdrop");
console.log("========================================");
await reset();
console.log(`  click Person → ${(await clickSmartAction("Person")) ? "ok" : "MISSING"}`);
await new Promise((r) => setTimeout(r, 1500));
const backdropClick = await page.evaluate(() => {
  const scrim = document.querySelector('.cloak-modal-scrim[aria-label="Close modal"]');
  if (!(scrim instanceof HTMLButtonElement)) return "no-overlay";
  scrim.click();
  return "clicked";
});
console.log(`  backdrop-click target: ${backdropClick}`);
await checkDismissal("after Person→backdrop", backdropClick);

// —————————————— Final report ——————————————

console.log("\n========================================");
console.log("ALL exit() / error logs in capture:");
console.log("========================================");
for (const log of consoleLogs) {
  if (/editor exit|panel.*exit|onExit|landing/i.test(log.text) || log.type === "error") {
    console.log(`  [${log.type}] ${log.text.slice(0, 280)}`);
  }
}

console.log("\nPage errors:");
for (const err of pageErrors) console.log(`  ${err.message}`);

await browser.close();
if (pageErrors.length > 0) failures += pageErrors.length;
console.log(
  failures === 0
    ? "\nPASS: all cold-start consent dismissal routes stay in the editor ✓"
    : `\nFAIL: ${failures} cold-start regression(s)`,
);
process.exit(failures === 0 ? 0 : 1);
