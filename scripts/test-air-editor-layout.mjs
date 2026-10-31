import { selectEditorTool } from "./air-editor-driver.mjs";
// Production editor layout regression. Use an external Playwright installation;
// no browser runner is included in the shipped application.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs AIR_BROWSER=webkit \
// BASE_URL=http://127.0.0.1:8455 node scripts/test-air-editor-layout.mjs
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engine = process.env.AIR_BROWSER || "chromium";
const output = resolve(process.env.AIR_EVIDENCE_DIR || `/tmp/cloakimg-editor-${engine}`);
const base = process.env.BASE_URL || "http://127.0.0.1:8455";
const names = [
  ...(await readFile(resolve(root, "src/editor/tools.ts"), "utf8")).matchAll(/name: "([^"]+)"/g),
]
  .map((m) => m[1])
  .filter((name) => !process.env.AIR_TOOLS || process.env.AIR_TOOLS.split(",").includes(name));
const sizes = [
  [320, 568],
  [375, 812],
  [390, 844],
  [430, 932],
  [768, 1024],
  [844, 390],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];
const profiles = [
  ...sizes.map(([width, height]) => ({ width, height, font: 16 })),
  ...[
    [320, 568],
    [390, 844],
    [1024, 768],
    [1280, 720],
  ].map(([width, height]) => ({ width, height, font: 32 })),
].filter(
  (profile) =>
    !process.env.AIR_WIDTHS || process.env.AIR_WIDTHS.split(",").includes(String(profile.width)),
);
assert(names.length && profiles.length, "Select at least one tool and viewport");
await mkdir(output, { recursive: true });
const browser =
  engine === "webkit"
    ? await webkit.launch()
    : await chromium.launch({
        executablePath:
          process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      });
const results = [],
  failures = [],
  errors = [],
  requests = [];
try {
  for (const profile of profiles)
    for (const theme of ["light", "dark"]) {
      const { width, height, font } = profile;
      const page = await browser.newPage({
        viewport: { width, height },
        hasTouch: width < 1100,
        colorScheme: theme,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => errors.push(`${width}/${font}/${theme}: ${e.message}`));
      page.on("request", (r) => {
        if (/huggingface|cdn.*onnx|models\/.*\.(tflite|onnx)/.test(r.url())) requests.push(r.url());
      });
      await page.goto(base);
      if (font !== 16) await page.addStyleTag({ content: `html{font-size:${font}px}` });
      await page
        .locator("input[type=file]")
        .first()
        .setInputFiles(resolve(root, "scripts/fixtures/orange.webp"));
      await page.locator('.editor-topbar [aria-label="Export"]:not(:disabled)').waitFor();
      const canvas = await page.locator("canvas.upper-canvas").elementHandle();
      const mobile = (await page.locator(".editor-mobile-workspace").count()) > 0;
      const topbar = await page.locator(".editor-topbar").evaluate((e) => {
        const box = e.getBoundingClientRect(),
          minimum = matchMedia("(pointer: coarse)").matches ? 44 : 32;
        return [...e.querySelectorAll("button")]
          .filter((b) => {
            const r = b.getBoundingClientRect();
            return (
              r.width > 0 &&
              (r.width < minimum - 1 ||
                r.height < minimum - 1 ||
                r.left < box.left ||
                r.right > box.right + 1 ||
                r.top < box.top ||
                r.bottom > box.bottom + 1)
            );
          })
          .map((b) => b.getAttribute("aria-label") || b.textContent);
      });
      assert.deepEqual(topbar, [], `Toolbar ${JSON.stringify(profile)} ${theme}`);
      for (const name of names) {
        await selectEditorTool(page, name);
        await page.locator("[data-tool-panel-loading]").waitFor({ state: "hidden" });
        await page.waitForTimeout(150);
        const consent = page
          .locator(".cloak-dialog")
          .getByRole("button", { name: "Not now", exact: true });
        if (await consent.count()) {
          await consent.click();
          await page.locator(".cloak-dialog").waitFor({ state: "hidden" });
        }
        const result = await page.evaluate(
          ({ canvas, name }) => {
            const panel = document.querySelector(
                ".editor-properties .scroll-thin,.editor-mobile-surface .scroll-thin",
              ),
              r = panel.getBoundingClientRect();
            const visible = (e) => {
              const b = e.getBoundingClientRect(),
                s = getComputedStyle(e);
              return (
                b.width > 1 &&
                b.height > 1 &&
                s.visibility !== "hidden" &&
                s.display !== "none" &&
                s.opacity !== "0" &&
                !e.closest('[hidden],[aria-hidden="true"],.sr-only')
              );
            };
            const label = (e) =>
              e.getAttribute("aria-label") ||
              e
                .getAttribute("aria-labelledby")
                ?.split(" ")
                .map((id) => document.getElementById(id)?.textContent)
                .join(" ") ||
              e.labels?.[0]?.textContent ||
              e.textContent ||
              e.title;
            const escape = [],
              small = [],
              unnamed = [],
              textOverflow = [];
            for (const e of panel.querySelectorAll("button,input,textarea,[role=slider]")) {
              if (!visible(e)) continue;
              const b = e.getBoundingClientRect();
              if (!label(e)?.trim()) unnamed.push(e.outerHTML.slice(0, 120));
              if (e.closest(".overflow-x-auto")) continue;
              if (b.left < r.left - 1 || b.right > r.right + 1) escape.push(label(e));
              const minimum = matchMedia("(pointer: coarse)").matches ? 44 : 32;
              if (b.height < minimum - 1 || b.width < minimum - 1) small.push(label(e));
            }
            for (const e of panel.querySelectorAll("button,span,label,p,h2")) {
              if (
                !visible(e) ||
                e.children.length ||
                !e.textContent.trim() ||
                e.closest(".overflow-x-auto") ||
                getComputedStyle(e).textOverflow === "ellipsis"
              )
                continue;
              const range = document.createRange();
              range.selectNodeContents(e);
              const b = range.getBoundingClientRect();
              if (b.left < r.left - 1 || b.right > r.right + 1)
                textOverflow.push(e.textContent.trim());
            }
            const header = document.querySelector(
              ".editor-mobile-header,.editor-properties__header",
            );
            const headerIssues = [];
            if (header) {
              const bounds = header.getBoundingClientRect();
              const buttons = [...header.querySelectorAll("button")]
                .filter(visible)
                .map((e) => ({ name: label(e), box: e.getBoundingClientRect() }));
              const overlaps = (a, b) =>
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
              for (const [i, button] of buttons.entries()) {
                const b = button.box;
                if (
                  b.left < bounds.left ||
                  b.right > bounds.right + 1 ||
                  b.top < bounds.top ||
                  b.bottom > bounds.bottom + 1
                )
                  headerIssues.push(`action outside header: ${button.name}`);
                for (const other of buttons.slice(i + 1))
                  if (overlaps(b, other.box))
                    headerIssues.push(`overlapping actions: ${button.name}, ${other.name}`);
              }
              for (const text of header.querySelectorAll("h2,.editor-properties__heading > span")) {
                if (!visible(text)) continue;
                const range = document.createRange();
                range.selectNodeContents(text);
                for (const rect of range.getClientRects()) {
                  if (rect.left < bounds.left || rect.right > bounds.right + 1)
                    headerIssues.push(`title outside header: ${text.textContent}`);
                  if (buttons.some((button) => overlaps(rect, button.box)))
                    headerIssues.push(`title/action overlap: ${text.textContent}`);
                }
              }
            }
            return {
              name,
              headerIssues,
              escape,
              small,
              unnamed,
              textOverflow,
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              persistent: canvas === document.querySelector("canvas.upper-canvas"),
              preview: document.querySelector(".canvas-container")?.getBoundingClientRect().height,
              dialog: !!document.querySelector(".cloak-dialog"),
            };
          },
          { canvas, name },
        );
        results.push({ ...profile, theme, ...result });
        if (
          result.headerIssues.length ||
          result.escape.length ||
          result.small.length ||
          result.unnamed.length ||
          result.textOverflow.length ||
          result.overflow ||
          !result.persistent ||
          result.preview < 40 ||
          result.dialog
        )
          failures.push(results.at(-1));
        if (process.env.AIR_CAPTURES !== "0" && [390, 1280].includes(width)) {
          const stem = `${width}-${font}-${theme}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
          await page.screenshot({ path: resolve(output, `${stem}.png`) });
          await page
            .locator(".editor-properties .scroll-thin,.editor-mobile-surface .scroll-thin")
            .evaluate((e) => (e.scrollTop = e.scrollHeight));
          await page.screenshot({ path: resolve(output, `${stem}-bottom.png`) });
        }
        if (mobile) {
          await page
            .locator(".editor-mobile-surface")
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
          await page.locator(".editor-mobile-surface").waitFor({ state: "hidden" });
        }
      }
      await page
        .locator(".editor-topbar")
        .getByRole("button", { name: "Export", exact: true })
        .click();
      const dialog = page.locator(".cloak-dialog");
      await dialog.waitFor();
      await dialog.getByRole("radio", { name: "PNG", exact: true }).check();
      for (const name of ["Copy", "Download", "Close export"]) {
        const box = await dialog.getByRole("button", { name, exact: true }).boundingBox();
        assert(
          box &&
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= width + 1 &&
            box.y + box.height <= height + 1,
          `${name} unreachable: ${JSON.stringify(profile)}`,
        );
      }
      await page.screenshot({ path: resolve(output, `${width}-${font}-${theme}-export.png`) });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert(await canvas.evaluate((e) => e.isConnected), "Export remounted the canvas");
      console.log(
        JSON.stringify({
          ...profile,
          theme,
          tools: names.length,
          failures: failures.length,
        }),
      );
      await page.close();
    }
} finally {
  await browser.close();
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify({ engine, results, failures, errors, requests }, null, 2),
  );
}
assert.deepEqual({ failures, errors, requests }, { failures: [], errors: [], requests: [] });
