// probe-relight-download.mjs — First-run probe for the "tap Download →
// editor bounces to landing" bug. Opens the editor with a fixture,
// opens the Relight tool, taps the consent Download button, and checks
// whether the editor exited to the landing page. Captures the
// `editor exit() called` breadcrumb (with trigger stack) so we learn
// EXACTLY which call site fired exit().
//
// Usage:
//   vp dev   (note the port)
//   BASE_URL=http://localhost:5174 node scripts/probe-relight-download.mjs

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://localhost:5174";
const testImagePath = resolve(ROOT, "test-fixtures/IMG_1804.jpg");

for (const [label, p] of [
  ["Chrome", chromePath],
  ["fixture", testImagePath],
]) {
  if (!existsSync(p)) {
    console.error(`${label} not found at ${p}`);
    process.exit(1);
  }
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  defaultViewport: { width: 1400, height: 900 },
  // Give headless a shot at a WebGPU adapter (swiftshader) so we can
  // verify depth inference end-to-end, not just the consent flow.
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan",
  ],
});
const page = await browser.newPage();

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(`${e.message}\n${e.stack ?? ""}`));
page.on("workererror", (e) => pageErrors.push(`[worker] ${e.message}`));

const isLanding = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("button")).some((b) =>
      /Open editor/i.test(b.textContent ?? ""),
    ),
  );

console.log("→ Navigating to", baseUrl);
await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });

// First-run: clear every AI consent marker + enable debug logging.
await page.evaluate(() => {
  try {
    localStorage.setItem("ai_debug", "1");
    localStorage.removeItem("cloakimg:detect-face:consented");
    // Depth + segment use the HF CacheStorage probe; clear it too.
  } catch {}
});
await page.evaluate(async () => {
  if (typeof caches !== "undefined") {
    for (const k of await caches.keys()) await caches.delete(k);
  }
});
await page.reload({ waitUntil: "networkidle2" });

console.log("→ Open editor…");
await page.evaluate(() => {
  Array.from(document.querySelectorAll("button"))
    .find((b) => /Open editor/i.test(b.textContent ?? ""))
    ?.click();
});
await new Promise((r) => setTimeout(r, 1500));
await page.waitForSelector('input[type="file"]', { timeout: 10000 });
const inputs = await page.$$('input[type="file"]');
await inputs.at(-1).uploadFile(testImagePath);
await page.waitForFunction(
  () =>
    Array.from(document.querySelectorAll("button")).some((b) =>
      /Open in editor/i.test(b.textContent ?? ""),
    ),
  { timeout: 15000 },
);
await page.evaluate(() => {
  Array.from(document.querySelectorAll("button"))
    .find((b) => /Open in editor/i.test(b.textContent ?? ""))
    ?.click();
});
await new Promise((r) => setTimeout(r, 4000));

console.log("→ In editor? landing =", await isLanding());

// Open the Relight tool (rail button by aria-label / title / text).
console.log("→ Clicking Relight tool…");
const relightClicked = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button")).find((b) => {
    const t = `${b.textContent ?? ""} ${b.getAttribute("title") ?? ""} ${b.getAttribute("aria-label") ?? ""}`;
    return /relight/i.test(t);
  });
  if (!btn) return false;
  btn.click();
  return true;
});
console.log("  relight clicked:", relightClicked);
await new Promise((r) => setTimeout(r, 2000));

console.log("→ After opening Relight: landing =", await isLanding());

// The depth request fires on tool open → consent dialog. If it didn't
// appear (e.g. the in-panel "Enable relight" gate), click that first to
// surface the dialog.
const dialogVisible = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("button")).some((b) =>
      /Download \d+ MB/i.test(b.textContent ?? ""),
    ),
  );
if (!(await dialogVisible())) {
  console.log("→ No dialog yet — clicking in-panel 'Enable relight'…");
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("button"))
      .find((b) => /Enable relight/i.test(b.textContent ?? ""))
      ?.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
}
console.log("→ Consent dialog visible:", await dialogVisible());

// Click the DIALOG's Download button specifically (text "Download N MB").
const clickedDownload = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button.btn-primary")).find((b) =>
    /Download \d+ MB|Use \d+ MB/i.test(b.textContent ?? ""),
  );
  if (!btn) return false;
  btn.click();
  return true;
});
console.log("→ Clicked dialog Download:", clickedDownload);

// Watch for a landing bounce AND for the depth flow to settle
// (ready/error). Bounce is the primary assertion; ready confirms the
// model downloaded + inference ran when a backend is available.
let bounced = false;
let settled = null;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await isLanding()) {
    bounced = true;
    console.log(`‼️  BOUNCED TO LANDING after ${i + 1}s`);
    break;
  }
  if (logs.some((l) => /status: loading → ready/i.test(l))) {
    settled = "ready";
    console.log(`✓ depth ready after ~${i + 1}s`);
    break;
  }
  if (logs.some((l) => /status: loading → error/i.test(l))) {
    settled = "error";
    break;
  }
}

// Loop detection: a healthy flow requests depth a handful of times at
// most. A retry storm fires "estimateDepth start" dozens of times.
const depthStarts = logs.filter((l) => /estimateDepth start/i.test(l)).length;
// Surface the friendly error the panel shows (role=alert / error card).
const errorText = await page.evaluate(() => {
  const alert = document.querySelector('[role="alert"]');
  if (alert) return alert.textContent?.trim().slice(0, 240) ?? null;
  const card = Array.from(document.querySelectorAll("div")).find((d) =>
    /Couldn't|didn't respond|ran out|runtime|try again/i.test(d.textContent ?? ""),
  );
  return card?.textContent?.trim().slice(0, 240) ?? null;
});

console.log("\n======== RESULT ========");
console.log("Bounced to landing:", bounced);
console.log("depth settled:", settled ?? "(still loading / timed out)");
console.log("depth estimateDepth starts:", depthStarts, depthStarts > 6 ? "← RETRY LOOP" : "ok");
console.log("panel error text:", errorText);
console.log("\n--- exit() breadcrumbs ---");
for (const l of logs.filter((l) =>
  /editor exit\(\) called|exit\(\) trigger|Back to start/i.test(l),
)) {
  console.log(l);
}
console.log("\n--- page/worker errors ---");
for (const e of pageErrors.slice(0, 5)) console.log(e);
console.log("\n--- depth/worker console logs ---");
for (const l of logs.filter((l) => /depth|worker|backend/i.test(l)).slice(-20)) console.log(l);

await browser.close();
process.exit(bounced ? 1 : 0);
