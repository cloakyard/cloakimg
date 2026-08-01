// probe-face-detect.mjs — Headless probe of the Smart Auto-Anonymize
// "Faces" flow against a running dev server. Captures every console
// log, network request, page error, and worker error so we can see
// EXACTLY where the flow falls over when the user reports "popup
// came and nothing happened".
//
// Usage:
//   1. Start the dev server in another shell: `vp dev` (note the port).
//   2. CHROME_PATH=/path/to/chrome BASE_URL=http://localhost:5174 \
//      node scripts/probe-face-detect.mjs

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME;
const baseUrl = process.env.BASE_URL || "http://localhost:5174";

if (!existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}`);
  process.exit(1);
}

// Use the portrait fixture so the journey verifies both the detector
// lifecycle and a positive face result instead of only the zero-result
// path from an old product screenshot.
const testImagePath = resolve(ROOT, "test-fixtures/00554.jpg");
if (!existsSync(testImagePath)) {
  console.error(`Test image not found at ${testImagePath}`);
  process.exit(1);
}
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1400, height: 900 },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const page = await browser.newPage();

// Capture EVERYTHING.
const consoleLogs = [];
page.on("console", (msg) => {
  consoleLogs.push({
    type: msg.type(),
    text: msg.text(),
    location: msg.location()?.url ? `${msg.location().url}:${msg.location().lineNumber}` : null,
  });
});
const pageErrors = [];
page.on("pageerror", (err) => {
  pageErrors.push({ message: err.message, stack: err.stack });
});
const workerErrors = [];
page.on("workererror", (err) => {
  workerErrors.push({ message: err.message, stack: err.stack });
});
const networkRequests = [];
function isAiRelevant(url) {
  return (
    url.includes("yunet") ||
    url.includes("blaze_face") ||
    url.includes("ort-wasm") ||
    url.includes("transformers") ||
    url.includes("tasks-vision") ||
    url.includes("vision_wasm") ||
    url.includes("mediapipe") ||
    url.includes("models/")
  );
}
page.on("request", (req) => {
  const url = req.url();
  if (isAiRelevant(url)) networkRequests.push({ phase: "request", method: req.method(), url });
});
page.on("response", async (resp) => {
  const url = resp.url();
  if (isAiRelevant(url)) {
    networkRequests.push({
      phase: "response",
      status: resp.status(),
      url,
      contentType: resp.headers()["content-type"],
    });
  }
});
page.on("requestfailed", (req) => {
  const url = req.url();
  if (isAiRelevant(url)) {
    networkRequests.push({
      phase: "request-failed",
      url,
      failureText: req.failure()?.errorText ?? null,
    });
  }
});

console.log("→ Navigating to", baseUrl);
await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });

// Turn on the AI debug-log gate so we see lifecycle transitions.
await page.evaluate(() => {
  try {
    localStorage.setItem("ai_debug", "1");
    // Also clear any cached face-detect consent so we see the
    // first-time-user flow.
    localStorage.removeItem("cloakimg:detect-face:consented");
  } catch {
    // ignore
  }
});
// Reload so the localStorage flag is read by the modules at init.
await page.reload({ waitUntil: "networkidle2" });

// Landing page has an "Open editor" button — click it first to
// reach the editor (the file input lives there, not on landing).
console.log("→ Clicking 'Open editor' on landing…");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Open editor/i.test(b.textContent ?? ""),
  );
  if (btn) btn.click();
});
// React route transition; give it a beat.
await new Promise((r) => setTimeout(r, 1500));

console.log("→ Looking for file input…");
await page.waitForSelector('input[type="file"]', { timeout: 10000 });

// Inject the portrait fixture through the active modal's file input.
const fileInputs = await page.$$('input[type="file"]');
if (fileInputs.length === 0) throw new Error("No file input found");
console.log(`→ Found ${fileInputs.length} file input(s); uploading to the active modal`);
await fileInputs.at(-1).uploadFile(testImagePath);

// Wait for the editor to be open. After upload, an "Open in editor"
// confirmation appears — click it to actually mount the editor.
console.log("→ Waiting for 'Open in editor' confirmation…");
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
  if (btn) btn.click();
});
console.log("→ Clicked 'Open in editor', waiting for tool rail…");
await new Promise((r) => setTimeout(r, 4000));

const railSummary = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("button")).map((b) => ({
    text: (b.textContent ?? "").trim().slice(0, 40),
    title: b.getAttribute("title"),
    ariaLabel: b.getAttribute("aria-label"),
  }));
});
console.log(`→ Found ${railSummary.length} buttons in editor`);

// Target the rail contract directly. A broad /redact/ text search can
// accidentally match explanatory or modal copy when the UI grows.
const redactClicked = await page.evaluate(() => {
  const btn = document.querySelector('.editor-toolrail button[aria-label="Redact"]');
  if (!btn) return false;
  btn.click();
  return true;
});
if (!redactClicked) {
  console.log("\n‼️  No Redact button matched. See dump above.");
  await browser.close();
  process.exit(1);
}
console.log("→ Clicked Redact tool");
await page.waitForFunction(
  () =>
    !document.querySelector("[data-tool-panel-loading]") &&
    document
      .querySelector('.editor-toolrail button[aria-label="Redact"]')
      ?.getAttribute("aria-pressed") === "true" &&
    /Smart anonymize/i.test(document.querySelector(".editor-properties")?.textContent ?? ""),
  { timeout: 20000 },
);

// Wait for the Faces button to appear.
console.log("→ Waiting for Faces button…");
await page.waitForFunction(
  () => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.some((b) => {
      const name = b.getAttribute("aria-label") ?? b.textContent ?? "";
      return /^\s*Faces/i.test(name) && !!b.closest(".editor-properties");
    });
  },
  { timeout: 20000 },
);

// Click Faces.
console.log("→ Clicking Faces button…");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const name = b.getAttribute("aria-label") ?? b.textContent ?? "";
    return /^\s*Faces/i.test(name) && !!b.closest(".editor-properties");
  });
  if (btn) btn.click();
});

// Wait briefly to capture the consent dialog or any error.
console.log("→ Waiting 2s for consent dialog or immediate result…");
await new Promise((r) => setTimeout(r, 2000));

// Inspect the consent dialog to confirm we're clicking the RIGHT
// dialog's Download button (face vs segment) and that the click
// dispatches an actual click event.
const dialogProbe = await page.evaluate(() => {
  // Find all visible dialogs (role=dialog or modal frames with
  // labelledby ids we set).
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-labelledby]')).map(
    (el) => {
      const labelId = el.getAttribute("aria-labelledby");
      const labelEl = labelId ? document.getElementById(labelId) : null;
      return {
        labelledBy: labelId,
        title: labelEl?.textContent?.trim() ?? null,
        classes: el.className.slice(0, 80),
      };
    },
  );
  const downloadButtons = Array.from(document.querySelectorAll("button"))
    .filter((b) => /Download|Use \d+ MB/i.test(b.textContent ?? ""))
    .map((b) => ({
      text: (b.textContent ?? "").trim(),
      disabled: b.disabled,
      // Walk up to find the closest dialog ancestor.
      dialog:
        b.closest("[aria-labelledby]")?.getAttribute("aria-labelledby") ??
        b.closest('[role="dialog"]')?.id ??
        null,
    }));
  return { dialogs, downloadButtons };
});
console.log("→ Dialog probe:");
console.log(JSON.stringify(dialogProbe, null, 2));

if (dialogProbe.downloadButtons.length > 0) {
  console.log("→ Clicking the PRIMARY Download button (btn-primary class)…");
  // The tier-picker row also matches "Download N MB" because its
  // descriptor text mentions the size. The actual action button is
  // the one with class `btn-primary` — match on that to avoid
  // grabbing the row.
  const downloadHandle = await page.evaluateHandle(() => {
    return (
      Array.from(document.querySelectorAll("button.btn-primary")).find((b) =>
        /Download|Use \d+ MB/i.test(b.textContent ?? ""),
      ) || null
    );
  });
  const downloadElement = downloadHandle?.asElement();
  if (downloadElement) {
    await downloadElement.click();
  } else {
    console.log("⚠️  Couldn't find btn-primary download button");
  }
  console.log("→ Waiting up to 60s for model load + inference (polls every 5s)…");
  // Poll the AI debug log + busy state instead of a single long wait
  // so we can see exactly when (or if) the flow stalls.
  for (let i = 1; i <= 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const tick = await page.evaluate(() => {
      const facesBtn = Array.from(document.querySelectorAll(".editor-properties button")).find(
        (b) => /^\s*(Faces|Working)/i.test(b.textContent ?? ""),
      );
      const errorChip = document.querySelector('[role="alert"]');
      return {
        facesBtnText: facesBtn?.textContent?.trim().slice(0, 30) ?? null,
        facesActive: facesBtn?.getAttribute("aria-pressed") === "true",
        facesDisabled: facesBtn instanceof HTMLButtonElement ? facesBtn.disabled : null,
        errorChipText: errorChip?.textContent?.slice(0, 200) ?? null,
      };
    });
    console.log(`  ${i * 5}s:`, JSON.stringify(tick));
    if (tick.errorChipText || tick.facesActive) {
      break;
    }
  }
} else {
  console.log("⚠️  No consent dialog visible. Maybe consent was already granted.");
  console.log("→ Waiting 5s for inference…");
  await new Promise((r) => setTimeout(r, 5000));
}

// Capture final state.
const state = await page.evaluate(() => {
  // Read the inline error chip if present.
  const errorChip = document.querySelector('[role="alert"]');
  const facesBtn = Array.from(document.querySelectorAll(".editor-properties button")).find((b) =>
    /^\s*(Faces|Working)/i.test(b.textContent ?? ""),
  );
  return {
    errorChipText: errorChip?.textContent ?? null,
    facesActive: facesBtn?.getAttribute("aria-pressed") === "true",
    busyButtons: Array.from(document.querySelectorAll("button"))
      .filter((b) => /Working/i.test(b.textContent ?? ""))
      .map((b) => b.textContent),
    documentTitle: document.title,
  };
});

console.log("\n========================================");
console.log("RESULT");
console.log("========================================");
console.log("Final state:", JSON.stringify(state, null, 2));
console.log("\nNetwork requests (AI-relevant):");
for (const req of networkRequests) {
  console.log(JSON.stringify(req));
}
console.log("\nConsole logs (last 60):");
for (const log of consoleLogs.slice(-60)) {
  console.log(`[${log.type}] ${log.text}${log.location ? ` (${log.location})` : ""}`);
}
console.log("\nPage errors:");
for (const err of pageErrors) console.log(err.message);
console.log("\nWorker errors:");
for (const err of workerErrors) console.log(err.message);

await browser.close();
const failedRequests = networkRequests.filter(
  (request) =>
    request.phase === "request-failed" ||
    (request.phase === "response" && typeof request.status === "number" && request.status >= 400),
);
const passed =
  state.facesActive &&
  !state.errorChipText &&
  state.busyButtons.length === 0 &&
  pageErrors.length === 0 &&
  workerErrors.length === 0 &&
  failedRequests.length === 0;
console.log(
  passed
    ? "\nPASS: detected and anonymized the portrait face ✓"
    : "\nFAIL: face flow did not complete cleanly",
);
process.exit(passed ? 0 : 1);
