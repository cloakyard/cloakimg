// probe-firefox-faces.mjs — Reproduce the Firefox-only "Faces → Download
// → home screen" crash the user reported.
//
// puppeteer-core 24 supports Firefox via the WebDriver BiDi transport.
// We launch the system Firefox, navigate to the dev server, drive the
// same flow the user described, and capture EVERYTHING:
//
//   • console logs (all levels)
//   • pageerror (uncaught exceptions on the main thread)
//   • framenavigated (any URL change — would catch a window.location.assign)
//   • dialog opens / closes (in case Firefox surfaces beforeunload)
//   • a window-level marker that disappears if the editor unmounts
//   • the ai-debug log stream we already gate on `localStorage.ai_debug`
//
// Running:
//   pnpm exec vp dev                                # in another shell
//   node scripts/probe-firefox-faces.mjs            # this script
//
// Optional env:
//   BASE_URL=http://localhost:5173
//   FIREFOX_PATH=/opt/homebrew/bin/firefox

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const DEFAULT_FIREFOX = "/opt/homebrew/bin/firefox";
const firefoxPath = process.env.FIREFOX_PATH || DEFAULT_FIREFOX;
const baseUrl = process.env.BASE_URL || "http://localhost:5173";
const TEST_JPG = resolve(ROOT, "test-fixtures/IMG_1804.jpg");

if (!existsSync(firefoxPath)) {
  console.error(`Firefox not found at ${firefoxPath}`);
  process.exit(1);
}
if (!existsSync(TEST_JPG)) {
  console.error(`Test image not found at ${TEST_JPG}`);
  process.exit(1);
}

console.log(`→ Launching Firefox: ${firefoxPath} (headless=${process.env.HEADLESS !== "0"})`);
const browser = await puppeteer.launch({
  browser: "firefox",
  executablePath: firefoxPath,
  headless: process.env.HEADLESS !== "0",
  defaultViewport: { width: 1400, height: 900 },
});

const page = await browser.newPage();

const consoleLogs = [];
page.on("console", (msg) => {
  consoleLogs.push({ type: msg.type(), text: msg.text(), ts: Date.now() });
});
const pageErrors = [];
page.on("pageerror", (err) => {
  pageErrors.push({ message: err.message, stack: err.stack, ts: Date.now() });
});
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) {
    console.log(`  [navigation] → ${frame.url()}`);
  }
});
page.on("dialog", async (d) => {
  console.log(`  [browser-dialog ${d.type()}] ${d.message()}`);
  await d.dismiss().catch(() => undefined);
});

console.log(`→ Navigating to ${baseUrl}`);
await page.goto(baseUrl, { waitUntil: "load", timeout: 30000 });

// Enable ai_debug + drop any prior consent so we see the cold flow.
await page.evaluate(() => {
  try {
    localStorage.setItem("ai_debug", "1");
    localStorage.removeItem("cloakimg:detect-face:consented");
  } catch {
    // ignore
  }
});
await page.reload({ waitUntil: "load" });

console.log("→ Click 'Open editor' on landing");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Open editor/i.test(b.textContent ?? ""),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1500));

console.log(`→ Upload JPEG: ${TEST_JPG}`);
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
console.log("→ Clicked 'Open in editor', waiting for editor to mount");
await new Promise((r) => setTimeout(r, 5000));

// Plant a marker the editor is mounted; we watch it from now on.
await page.evaluate(() => {
  window.__cloakProbeMarker = "editor-mounted";
});
console.log("→ Marker planted");

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
    const onLanding = Array.from(document.querySelectorAll("button")).some((b) =>
      /Open editor/i.test(b.textContent ?? ""),
    );
    const errorBoundaryVisible = !!document.querySelector('[role="alertdialog"]');
    const consentDialogVisible = !!document.getElementById("cloak-capability-consent-title");
    return {
      label: l,
      url: location.pathname + location.search,
      markerPresent: window.__cloakProbeMarker === "editor-mounted",
      onLanding,
      errorBoundaryVisible,
      consentDialogVisible,
      bodyHead: document.body.innerText.slice(0, 200),
    };
  }, label);
}

console.log("\n========================================");
console.log("BEFORE clicking Faces");
console.log("========================================");
console.log(JSON.stringify(await pageState("before"), null, 2));

console.log("\n→ Click Faces");
const facesClicked = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /^Faces/i.test((b.textContent ?? "").trim()),
  );
  if (!btn) return false;
  btn.click();
  return true;
});
console.log(`  faces clicked: ${facesClicked}`);

await new Promise((r) => setTimeout(r, 2000));
console.log("\nAfter Faces click:");
console.log(JSON.stringify(await pageState("after-faces"), null, 2));

// Inspect the consent dialog state.
const dialogProbe = await page.evaluate(() => {
  const titleEl = document.getElementById("cloak-capability-consent-title");
  const downloadBtn = Array.from(document.querySelectorAll("button.btn-primary")).find((b) =>
    /Download|Use \d+ MB/i.test(b.textContent ?? ""),
  );
  return {
    title: titleEl?.textContent ?? null,
    downloadBtnText: downloadBtn?.textContent?.trim() ?? null,
    downloadBtnDisabled: downloadBtn?.disabled ?? null,
  };
});
console.log("Dialog:", JSON.stringify(dialogProbe, null, 2));

if (!dialogProbe.downloadBtnText) {
  console.log("⚠️  No Download button in consent dialog — bailing");
  await dumpAll();
  await browser.close();
  process.exit(1);
}

console.log("\n→ Click Download");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button.btn-primary")).find((b) =>
    /Download|Use \d+ MB/i.test(b.textContent ?? ""),
  );
  btn?.click();
});

console.log("→ Polling state every 1s for 20s after Download click");
let crashedAt = null;
for (let i = 1; i <= 20; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await pageState(`t+${i}s`);
  console.log(
    `  t+${i}s: marker=${s.markerPresent} onLanding=${s.onLanding} errorBoundary=${s.errorBoundaryVisible} consent=${s.consentDialogVisible}`,
  );
  if (!s.markerPresent || s.onLanding || s.errorBoundaryVisible) {
    crashedAt = i;
    console.log(`\n‼️  STATE FLIP detected at t+${i}s:`);
    console.log(JSON.stringify(s, null, 2));
    break;
  }
}

console.log("\n========================================");
console.log(`RESULT: ${crashedAt !== null ? `crashed at t+${crashedAt}s` : "no crash detected"}`);
console.log("========================================");

await dumpAll();

async function dumpAll() {
  console.log("\n— Page errors —");
  for (const e of pageErrors) {
    console.log(`  ${e.message}`);
    if (e.stack) console.log(`    ${e.stack.split("\n").slice(0, 5).join("\n    ")}`);
  }

  console.log("\n— Console logs (last 80) —");
  for (const log of consoleLogs.slice(-80)) {
    console.log(`  [${log.type}] ${log.text.slice(0, 280)}`);
  }

  console.log("\n— exit() / mediapipe / face / wasm hits —");
  for (const log of consoleLogs) {
    if (
      /exit\(\)|mediapipe|tasks-vision|blaze|wasm|FilesetResolver|ModuleFactory|importScripts|detect-face|self-error|unhandled rejection/i.test(
        log.text,
      )
    ) {
      console.log(`  [${log.type}] ${log.text.slice(0, 350)}`);
    }
  }
}

await browser.close();
process.exit(0);
