// probe-redact-issues.mjs — Isolated reproduction for the three bugs
// the user reported in the Redact panel against test-fixtures/IMG_1804.jpg:
//
//   1. Preview not updating after a smart action
//   2. Scene completes its bake but the preview stays stale
//   3. Faces fails to detect on a clear portrait JPEG
//
// Strategy: drive the actual UI, hash the on-screen canvas before and
// after each smart action, and log every console message + page error
// so we can see exactly where each flow falls over. This script does
// NOT touch test code — it's a real browser, real handlers, real
// MediaPipe / transformers.js.
//
// Usage:
//   1. Start dev server: pnpm exec vp dev (note the port)
//   2. CHROME_PATH=/path/to/chrome BASE_URL=http://localhost:5173 \
//      node scripts/probe-redact-issues.mjs

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME;
const baseUrl = process.env.BASE_URL || "http://localhost:5173";

// Allow `IMAGE=jpg|heic` env to pick the test fixture so we can run
// the same script against both formats and verify the AI flow ignores
// the upstream decoder choice.
const fixtureName =
  (process.env.IMAGE ?? "jpg").toLowerCase() === "heic" ? "IMG_1804.heic" : "IMG_1804.jpg";
const TEST_JPG = resolve(ROOT, `test-fixtures/${fixtureName}`);

if (!existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}`);
  process.exit(1);
}
if (!existsSync(TEST_JPG)) {
  console.error(`Test image not found at ${TEST_JPG}`);
  process.exit(1);
}
console.log(`→ Using test fixture: ${fixtureName}`);

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1400, height: 900 },
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const page = await browser.newPage();

const consoleLogs = [];
page.on("console", (msg) => {
  consoleLogs.push({ type: msg.type(), text: msg.text() });
});
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push({ message: err.message, stack: err.stack }));
page.on("workererror", (err) => pageErrors.push({ message: `[worker] ${err.message}` }));

console.log(`→ Navigating to ${baseUrl}`);
await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });

// Pre-grant face-detect consent so the dialog doesn't block the probe.
// The bug we're after is detection-on-portrait, not first-run consent.
await page.evaluate(() => {
  try {
    localStorage.setItem("ai_debug", "1");
    localStorage.setItem("cloakimg:detect-face:consented", "1");
  } catch {
    // ignore
  }
});
await page.reload({ waitUntil: "networkidle2" });

// —————————————— Open editor + upload JPEG ——————————————

console.log("→ Open editor → upload JPEG → confirm");
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) =>
    /Open editor/i.test(b.textContent ?? ""),
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1500));
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
await new Promise((r) => setTimeout(r, 4000));

// —————————————— Helpers run inside the page ——————————————

// Hash *all* canvases at higher resolution so a small redact on a
// 24 MP image still flips the hash. Returns one entry per canvas
// keyed by dims so we can compare specific surfaces (the visible
// viewport canvas vs doc.working).
async function getCanvasHashes() {
  return page.evaluate(async () => {
    async function hashCanvas(c) {
      // Hash at 256x256 — still cheap (~1 ms) but 16x more spatial
      // resolution than 64x64. A 600x600 face redact on a 4284x5712
      // image affects ~9 px in the 256x256 sample (vs 1-2 in 64x64).
      const small = document.createElement("canvas");
      small.width = 256;
      small.height = 256;
      const sctx = small.getContext("2d");
      sctx.drawImage(c, 0, 0, 256, 256);
      const data = sctx.getImageData(0, 0, 256, 256).data;
      const buf = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16);
    }
    const canvases = Array.from(document.querySelectorAll("canvas"));
    const out = [];
    for (const c of canvases) {
      out.push({
        width: c.width,
        height: c.height,
        clientW: c.clientWidth,
        clientH: c.clientHeight,
        hash: await hashCanvas(c),
      });
    }
    return out;
  });
}

function diffHashes(before, after) {
  const out = [];
  const max = Math.max(before.length, after.length);
  for (let i = 0; i < max; i++) {
    const b = before[i];
    const a = after[i];
    if (!b && !a) continue;
    if (!b || !a) {
      out.push(`#${i}: missing (b=${!!b} a=${!!a})`);
      continue;
    }
    const sameDims = b.width === a.width && b.height === a.height;
    if (!sameDims) out.push(`#${i}: dims drift ${b.width}x${b.height} → ${a.width}x${a.height}`);
    else if (b.hash !== a.hash)
      out.push(`#${i}: ${b.width}x${b.height} CHANGED (${b.hash} → ${a.hash})`);
    else out.push(`#${i}: ${b.width}x${b.height} same`);
  }
  return out;
}

async function clickInRedactPanel(matcher) {
  return page.evaluate((m) => {
    const re = new RegExp(m, "i");
    const btn = Array.from(document.querySelectorAll("button")).find((b) => {
      // Accept either the trimmed full text OR the first non-empty
      // text-child line. The new SmartAnonymizeButton has a label
      // line + description line, so the full textContent is
      // "Person\nWhole body silhouette" — match the label line.
      const full = (b.textContent ?? "").trim();
      const firstLine = full.split("\n")[0]?.trim() ?? "";
      return re.test(full) || re.test(firstLine);
    });
    if (!btn) return false;
    btn.click();
    return true;
  }, matcher);
}

async function getInlineErrorChip() {
  return page.evaluate(() => {
    const chip = document.querySelector('[role="alert"]');
    return chip?.textContent?.trim().slice(0, 200) ?? null;
  });
}

async function waitForBusyToClear(label, timeoutMs = 60000) {
  const start = Date.now();
  let lastDialog = "(none)";
  while (Date.now() - start < timeoutMs) {
    const tick = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const busy = btns.some((b) => /Working/i.test(b.textContent ?? ""));
      const dialogs = Array.from(
        document.querySelectorAll('[role="dialog"], [aria-labelledby]'),
      ).map((d) => d.getAttribute("aria-labelledby") || d.id || "(no id)");
      return { busy, dialogs };
    });
    if (tick.dialogs.join(",") !== lastDialog) {
      console.log(`  ${label} t=${Date.now() - start}ms dialogs=${JSON.stringify(tick.dialogs)}`);
      lastDialog = tick.dialogs.join(",");
    }
    if (!tick.busy) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`  ⚠️  ${label}: still busy after ${timeoutMs}ms`);
}

// —————————————— Step 1: enter Redact tool ——————————————

console.log("→ Click Redact tool");
const redactClicked = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t =
      (b.textContent ?? "") +
      " " +
      (b.getAttribute("title") ?? "") +
      " " +
      (b.getAttribute("aria-label") ?? "");
    return /redact/i.test(t);
  });
  if (!btn) return false;
  btn.click();
  return true;
});
if (!redactClicked) {
  console.error("Couldn't find Redact button");
  await browser.close();
  process.exit(1);
}
// Wait for the Person + Faces toggle pair (Scene was removed in the
// mutually-exclusive picker refactor).
await page.waitForFunction(
  () => {
    const btns = Array.from(document.querySelectorAll("button"));
    const txts = btns.map((b) => (b.textContent ?? "").trim());
    return txts.some((t) => /^Person/i.test(t)) && txts.some((t) => /^Faces/i.test(t));
  },
  { timeout: 10000 },
);
console.log("→ Person + Faces buttons rendered");

// Dismiss the auto-opened mask consent dialog if present, so the
// Faces test (which doesn't depend on subject mask) isn't blocked
// by a cascading busy state. The dialog has a Cancel / dismiss
// affordance — usually labelled "Maybe later" or it has an X icon.
// Dump the mask consent dialog's buttons so we know which one closes it.
const maskDialogButtons = await page.evaluate(() => {
  const dialog = document.querySelector('[aria-labelledby="cloak-mask-consent-title"]');
  if (!dialog) return null;
  return Array.from(dialog.querySelectorAll("button")).map((b) => ({
    text: (b.textContent ?? "").trim().slice(0, 80),
    ariaLabel: b.getAttribute("aria-label"),
    className: (b.className ?? "").slice(0, 80),
    disabled: b.disabled,
  }));
});
console.log(`→ Mask consent dialog buttons:\n${JSON.stringify(maskDialogButtons, null, 2)}`);

async function dismissMaskConsentIfOpen() {
  const dismissed = await page.evaluate(() => {
    const dialog = document.querySelector('[aria-labelledby="cloak-mask-consent-title"]');
    if (!dialog) return false;
    // Try a "Maybe later" / "Cancel" / "Not now" button first.
    const cancelBtn = Array.from(dialog.querySelectorAll("button")).find((b) =>
      /(maybe later|not now|cancel|dismiss|close|skip|no thanks|don't)/i.test(b.textContent ?? ""),
    );
    if (cancelBtn) {
      cancelBtn.click();
      return "cancel-button";
    }
    // Fall back to an aria-label="Close" / icon-only button.
    const closeBtn = Array.from(dialog.querySelectorAll("button")).find((b) =>
      /close|dismiss/i.test(b.getAttribute("aria-label") ?? ""),
    );
    if (closeBtn) {
      closeBtn.click();
      return "close-icon";
    }
    // Last resort: press Escape — most well-built dialogs honour it.
    return "no-cancel-affordance";
  });
  if (dismissed === "no-cancel-affordance") {
    await page.keyboard.press("Escape");
    console.log(`→ Mask consent dialog: pressed Escape (no Cancel button found)`);
  } else if (dismissed) {
    console.log(`→ Mask consent dialog dismissed via: ${dismissed}`);
  }
  await new Promise((r) => setTimeout(r, 800));
  const stillOpen = await page.evaluate(
    () => !!document.querySelector('[aria-labelledby="cloak-mask-consent-title"]'),
  );
  console.log(`→ Mask consent dialog still open after dismiss attempt: ${stillOpen}`);
}
await dismissMaskConsentIfOpen();

// Reset between tests by hitting Undo (Cmd+Z) so each test starts
// from the original image, not a redacted one.
async function undoOnce() {
  await page.keyboard.down("Meta");
  await page.keyboard.press("KeyZ");
  await page.keyboard.up("Meta");
  await new Promise((r) => setTimeout(r, 600));
}

// Probe button-disabled state to detect the cascading-busy artifact.
// Same multi-line tolerant matcher as clickInRedactPanel.
async function isButtonDisabled(matcher) {
  return page.evaluate((m) => {
    const re = new RegExp(m, "i");
    const btn = Array.from(document.querySelectorAll("button")).find((b) => {
      const full = (b.textContent ?? "").trim();
      const firstLine = full.split("\n")[0]?.trim() ?? "";
      return re.test(full) || re.test(firstLine);
    });
    return btn ? btn.disabled : null;
  }, matcher);
}

// —————————————— Test 1: Faces (independent of subject mask) ——————————————

console.log("\n========================================");
console.log("TEST 1: Faces smart action (run FIRST so it's not blocked");
console.log("        by a hung Person/Scene awaiting subject-mask consent)");
console.log("========================================");
const beforeFaces = await getCanvasHashes();
console.log(`  before: ${JSON.stringify(beforeFaces)}`);
console.log(`  Faces button disabled before click: ${await isButtonDisabled("^Faces")}`);
const okFaces = await clickInRedactPanel("^\\s*Faces");
console.log(`  click Faces → ${okFaces ? "ok" : "BUTTON NOT FOUND"}`);
await waitForBusyToClear("Faces", 90000);
await new Promise((r) => setTimeout(r, 1500));
const afterFaces = await getCanvasHashes();
const errFaces = await getInlineErrorChip();
console.log(`  after : ${JSON.stringify(afterFaces)}`);
console.log(`  diff  : ${diffHashes(beforeFaces, afterFaces).join(" | ")}`);
console.log(`  errChip: ${errFaces}`);

await undoOnce();

// —————————————— Test 2: Person ——————————————

console.log("\n========================================");
console.log("TEST 2: Person smart action");
console.log("        (will trigger subject-mask consent dialog if no prior grant)");
console.log("========================================");
const beforePerson = await getCanvasHashes();
console.log(`  before: ${JSON.stringify(beforePerson)}`);
console.log(`  Person button disabled before click: ${await isButtonDisabled("^Person")}`);
const okPerson = await clickInRedactPanel("^\\s*Person");
console.log(`  click Person → ${okPerson ? "ok" : "BUTTON NOT FOUND"}`);
// If the mask consent dialog appears, click "Download" to proceed
// through the actual end-to-end flow. The 42 MB small tier downloads
// in ~15 s on a fast connection.
await new Promise((r) => setTimeout(r, 1500));
const consentClick = await page.evaluate(() => {
  const dialog = document.querySelector('[aria-labelledby="cloak-mask-consent-title"]');
  if (!dialog) return null;
  const buttons = Array.from(dialog.querySelectorAll("button")).map((b) => ({
    text: (b.textContent ?? "").trim(),
    cls: b.className,
  }));
  // Pick the primary download button — match on btn-primary class.
  const primary = Array.from(dialog.querySelectorAll("button.btn-primary")).find((b) =>
    /Download|Use \d+ MB/i.test(b.textContent ?? ""),
  );
  if (primary) {
    primary.click();
    return { clicked: (primary.textContent ?? "").trim(), allButtons: buttons };
  }
  return { clicked: null, allButtons: buttons };
});
console.log(`  Mask consent dialog primary click: ${JSON.stringify(consentClick)}`);
await waitForBusyToClear("Person", 240000);
await new Promise((r) => setTimeout(r, 1500));
const afterPerson = await getCanvasHashes();
const errPerson = await getInlineErrorChip();
console.log(`  after : ${JSON.stringify(afterPerson)}`);
console.log(`  diff  : ${diffHashes(beforePerson, afterPerson).join(" | ")}`);
console.log(`  errChip: ${errPerson}`);

await undoOnce();

// —————————————— Test 3: Switch from Faces back to Person (mutually exclusive) ——————————————

console.log("\n========================================");
console.log("TEST 3: switch — re-click Faces, then click Person");
console.log("        Expected: Faces hash flips back, Person undoes Faces first.");
console.log("========================================");
console.log(`  re-running Faces to set the prior bake state…`);
await clickInRedactPanel("^\\s*Faces");
await waitForBusyToClear("Faces (warmup)", 60000);
await new Promise((r) => setTimeout(r, 1000));
const beforeSwitch = await getCanvasHashes();
console.log(`  before switch: ${JSON.stringify(beforeSwitch)}`);
console.log(`  Person button disabled: ${await isButtonDisabled("^Person")}`);
const okSwitch = await clickInRedactPanel("^\\s*Person");
console.log(`  click Person (switching from Faces) → ${okSwitch ? "ok" : "BUTTON NOT FOUND"}`);
// We don't expect Person to fully complete in headless (transformers.js
// segmentation needs WebGPU/WASM that swiftshader doesn't support);
// the bake will fail. We're verifying the picker geometry — Faces was
// undone first, so pixel state should match the pre-Faces baseline.
await waitForBusyToClear("Person (switch attempt)", 90000);
await new Promise((r) => setTimeout(r, 1500));
const afterSwitch = await getCanvasHashes();
const errSwitch = await getInlineErrorChip();
console.log(`  after switch : ${JSON.stringify(afterSwitch)}`);
console.log(`  diff (vs Faces-current): ${diffHashes(beforeSwitch, afterSwitch).join(" | ")}`);
console.log(`  errChip: ${errSwitch}`);

// —————————————— Final summary ——————————————

console.log("\n========================================");
console.log("SUMMARY");
console.log("========================================");
console.log(
  JSON.stringify(
    {
      person: { diff: diffHashes(beforePerson, afterPerson), err: errPerson },
      faces: { diff: diffHashes(beforeFaces, afterFaces), err: errFaces },
      switchFacesToPerson: {
        diff: diffHashes(beforeSwitch, afterSwitch),
        err: errSwitch,
      },
    },
    null,
    2,
  ),
);

console.log("\nALL Console logs (post-Redact-click):");
for (const log of consoleLogs) {
  // Skip Vite HMR + React DevTools noise.
  if (/vite\] (connecting|connected)/.test(log.text)) continue;
  if (/React DevTools/.test(log.text)) continue;
  console.log(`  [${log.type}] ${log.text.slice(0, 280)}`);
}

console.log("\nPage errors:");
for (const err of pageErrors) console.log(`  ${err.message}`);

await browser.close();
process.exit(0);
