/** Compare actual built PWA notices, driven by real disposable waiting workers. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const base = resolve(import.meta.dirname, "..");
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE || "puppeteer-core");
const out = process.env.AIR_EVIDENCE_DIR || "/tmp/air-family-notices";
await mkdir(out, { recursive: true });
const sizes = [
  [320, 568],
  [375, 812],
  [390, 844],
  [430, 932],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];
const rows = [],
  captures = [],
  errors = [];
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const servers = [];
async function serve() {
  const root = resolve(base, "dist"),
    state = { version: 1, hold: false };
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    response.setHeader("Cache-Control", "no-store");
    if (path === "/sw.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(
        `// Notice fixture ${state.version}\nlet finish; const gate = new Promise(r => finish=r); self.addEventListener('install',()=>{}); self.addEventListener('activate',e=>e.waitUntil(${state.hold ? "gate.then(()=>self.clients.claim())" : "self.clients.claim()"})); self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();if(e.data?.type==='FINISH')finish();});`,
      );
      return;
    }
    try {
      const file = resolve(root, `.${path === "/" ? "/index.html" : path}`);
      assert.ok(file.startsWith(root + "/"));
      response.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".json": "application/json",
          ".webmanifest": "application/manifest+json",
          ".woff2": "font/woff2",
          ".wasm": "application/wasm",
        }[extname(file)] || "application/octet-stream",
      );
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return { state, url: `http://127.0.0.1:${server.address().port}` };
}
async function frame(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
async function capture(page, path) {
  let previous,
    stable = 0,
    bytes;
  for (let i = 0; i < 30 && stable < 2; i++) {
    await frame(page);
    bytes = await (await page.$(".air-update")).screenshot();
    const hash = createHash("sha256").update(bytes).digest("hex");
    stable = hash === previous ? stable + 1 : 0;
    previous = hash;
  }
  assert.equal(stable, 2, "Notice capture did not settle");
  await writeFile(path, bytes);
  return previous;
}
try {
  for (const app of process.env.AIR_NOTICE_LIFECYCLE_ONLY ? [] : ["cloakimg"]) {
    const server = await serve();
    for (const state of ["offline", "update", "updating"])
      for (const coarse of [true, false]) {
        const context = await browser.createBrowserContext(),
          page = await context.newPage();
        page.on("pageerror", (e) => errors.push({ app, state, message: e.message }));
        // Capture-only timers hold transient states; product lifecycle suites test real timing.
        await page.evaluateOnNewDocument(() => {
          const timeout = window.setTimeout.bind(window);
          window.setTimeout = (fn, delay, ...args) =>
            [1500, 4000].includes(delay) ? timeout(() => {}, delay) : timeout(fn, delay, ...args);
        });
        await page.setViewport({ width: coarse ? 390 : 1280, height: 720, hasTouch: coarse });
        await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
        server.state.hold = false;
        await page.goto(server.url, { waitUntil: "networkidle0" });
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
        await page.waitForSelector('.air-update[data-state="offline"]');
        if (state !== "offline") {
          server.state.version++;
          server.state.hold = state === "updating";
          await page.evaluate(async () => {
            await (await navigator.serviceWorker.ready).update();
          });
          await page.waitForSelector('.air-update[data-state="update"]');
          if (state === "updating") {
            await page.click('[aria-label="Update and reload"]');
            await page.waitForSelector('.air-update[data-state="updating"]');
          }
        }
        for (const theme of ["light", "dark"])
          for (const root of [16, 32])
            for (const [width, height] of sizes.filter(([width]) => width <= 1100 === coarse)) {
              await page.setViewport({ width, height, hasTouch: coarse });
              await page.emulateMediaFeatures([
                { name: "prefers-color-scheme", value: theme },
                { name: "prefers-reduced-motion", value: "reduce" },
              ]);
              await page.evaluate(
                (px) => (document.documentElement.style.fontSize = px + "px"),
                root,
              );
              await page.mouse.move(width - 1, height - 1);
              await frame(page);
              const buttons = await page.$$(".air-update button");
              for (const button of buttons) {
                await button.focus();
                await frame(page);
                assert(
                  await button.evaluate((b) => {
                    const r = b.getBoundingClientRect(),
                      host = b.closest(".air-update").getBoundingClientRect();
                    return r.top >= host.top + 3 && r.bottom <= host.bottom - 3;
                  }),
                  `Focused command clipped: ${app}/${state}/${width}/${root}`,
                );
              }
              if (root === 32 && [320, 844].includes(width)) {
                const file = `${app}-${state}-${width}-${theme}-${root}-focused.png`;
                captures.push({
                  app,
                  state,
                  theme,
                  root,
                  width,
                  focused: true,
                  file,
                  sha256: await capture(page, resolve(out, file)),
                });
              }
              await page.evaluate(() => {
                document.activeElement?.blur();
                document.querySelector(".air-update").scrollTop = 0;
                window.scrollTo(0, 0);
              });
              await frame(page);
              const metrics = await page.evaluate(() => {
                const host = document.querySelector(".air-update"),
                  panel = host.querySelector(".air-update-panel"),
                  copy = host.querySelector(".air-update-copy");
                const h = host.getBoundingClientRect(),
                  p = panel.getBoundingClientRect(),
                  skin = getComputedStyle(panel),
                  title = getComputedStyle(copy.querySelector("h2"));
                return {
                  height: h.height,
                  panelWidth: p.width,
                  panelHeight: p.height,
                  radius: skin.borderRadius,
                  border: skin.borderTopWidth,
                  background: skin.backgroundColor,
                  color: getComputedStyle(copy).color,
                  font: title.fontFamily,
                  titleSize: title.fontSize,
                  titleWeight: title.fontWeight,
                  text: copy.innerText,
                  actions: [...host.querySelectorAll("button")].map((b) => ({
                    label: b.getAttribute("aria-label") || b.innerText,
                    height: b.getBoundingClientRect().height,
                    disabled: b.getAttribute("aria-disabled"),
                  })),
                  overflow:
                    host.scrollWidth > host.clientWidth + 1 ||
                    document.documentElement.scrollWidth > innerWidth + 1,
                };
              });
              assert(
                !metrics.overflow,
                JSON.stringify({ app, state, theme, root, width, metrics }),
              );
              assert(metrics.height <= height * 0.45 + 1);
              assert.equal(metrics.radius, "18px");
              assert.equal(metrics.border, "1px");
              assert.equal(metrics.titleWeight, "500");
              assert(metrics.actions.every((b) => b.height >= (width <= 1100 ? 43.9 : 39.9)));
              rows.push({ app, state, theme, root, width, height, metrics });
              if (
                (root === 16 && [390, 768, 1024, 1280, 1440].includes(width)) ||
                (root === 32 && [320, 844].includes(width))
              ) {
                const file = `${app}-${state}-${width}-${theme}-${root}.png`;
                captures.push({
                  app,
                  state,
                  theme,
                  root,
                  width,
                  file,
                  sha256: await capture(page, resolve(out, file)),
                });
              }
            }
        await context.close();
      }
  }
  // Real worker activation must not reload another tab with an open image.
  const server = await serve();
  const context = await browser.createBrowserContext();
  const home = await context.newPage();
  const editor = await context.newPage();
  for (const page of [home, editor]) {
    page.on("pageerror", (e) =>
      errors.push({ app: "cloakimg", state: "lifecycle", message: e.message }),
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(server.url, { waitUntil: "networkidle0" });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  }
  await editor.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#123456";
    ctx.fillRect(0, 0, 64, 48);
    const blob = await new Promise((r) => canvas.toBlob(r));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "update-preservation.png", { type: "image/png" }));
    const input = document.querySelector("input[type=file]");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await editor.waitForSelector(".editor-topbar");
  await editor.waitForFunction(() =>
    document.querySelector(".editor-topbar").textContent.includes("64"),
  );
  await editor.evaluate(() => (window.__preserveImage = crypto.randomUUID()));
  const marker = await editor.evaluate(() => window.__preserveImage);
  server.state.version++;
  await home.evaluate(async () => {
    await (await navigator.serviceWorker.ready).update();
  });
  await home.waitForSelector('.air-update[data-state="update"]');
  await editor.waitForSelector('.air-update[data-state="update"]');
  const update = await editor.$('[aria-label="Update and reload"]');
  assert.equal(await update.evaluate((b) => b.getAttribute("aria-disabled")), "true");
  await update.click();
  assert.equal(await editor.evaluate(() => window.__preserveImage), marker);
  assert.match(await editor.$eval(".air-update", (n) => n.textContent), /return home to update/);
  await home.bringToFront();
  const navigation = home.waitForNavigation({ waitUntil: "networkidle0" });
  await home.click('[aria-label="Update and reload"]');
  await navigation;
  assert.equal(
    await editor.evaluate(() => window.__preserveImage),
    marker,
    "Another tab's update retains the editor",
  );
  assert.match(await editor.$eval(".editor-topbar", (n) => n.textContent), /64/);
  await editor.bringToFront();
  await editor.click('[aria-label="Back to start"]');
  await editor.waitForSelector(".img-site");
  await editor.waitForFunction(
    () =>
      document.querySelector('[aria-label="Update and reload"]')?.getAttribute("aria-disabled") !==
      "true",
  );
  const returned = editor.waitForNavigation({ waitUntil: "networkidle0" });
  await editor.click('[aria-label="Update and reload"]');
  await returned;
  assert.equal(
    await editor.evaluate(() => window.__preserveImage),
    undefined,
    "Explicit home update reloads",
  );
  await context.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  for (const server of servers) {
    server.closeAllConnections();
    server.close();
  }
  await writeFile(
    resolve(out, "notices.json"),
    JSON.stringify({ rows, captures, errors }, null, 2) + "\n",
  );
}
console.log(
  `${rows.length} CloakIMG real-worker notice layouts pass; ${captures.length} captures; no errors.`,
);
