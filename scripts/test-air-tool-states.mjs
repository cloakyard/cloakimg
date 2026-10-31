import { selectEditorTool } from "./air-editor-driver.mjs";
// All 26 tool inspectors, alternate states, real chooser activation and text reflow.
// Supply PLAYWRIGHT_MODULE externally; BASE_URL points at a built preview.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  out =
    process.env.AIR_EVIDENCE_DIR ||
    `/tmp/cloakimg-tool-states-${process.env.AIR_BROWSER || "chromium"}`;
await mkdir(out, { recursive: true });
const engine = process.env.AIR_BROWSER || "chromium";
const browser =
  engine === "webkit"
    ? await webkit.launch()
    : await chromium.launch({
        executablePath:
          process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      });
const names = [
  ...(await readFile(root + "/src/editor/tools.ts", "utf8")).matchAll(/name: "([^"]+)"/g),
]
  .map((m) => m[1])
  .filter((n) => !process.env.AIR_TOOLS || process.env.AIR_TOOLS.split(",").includes(n));
const results = [],
  errors = [],
  failures = [],
  requests = [];
const sizes = JSON.parse(
  process.env.AIR_PROFILES ||
    "[[390,844,16],[1024,768,16],[1440,900,16],[390,844,32],[1024,768,32],[1440,900,32]]",
);
const themes = (process.env.AIR_THEMES || "light,dark").split(",");
try {
  for (const [width, height, font] of sizes)
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: width < 1100,
        colorScheme: theme,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (e) => errors.push({ width, font, theme, message: e.message }));
      page.on("request", (r) => {
        if (/huggingface|models\/.*\.(onnx|tflite)/.test(r.url())) requests.push(r.url());
      });
      for (const name of names) {
        let panel;
        const slug = name.toLowerCase().replace(/[^a-z]+/g, "-");
        async function shot(state) {
          await page.waitForTimeout(100);
          const row = await panel.evaluate((e) => {
            const bounds = e.getBoundingClientRect(),
              coarse = matchMedia("(pointer:coarse)").matches,
              issues = [];
            const shown = (x) => {
              const b = x.getBoundingClientRect(),
                s = getComputedStyle(x);
              return (
                b.width > 1 &&
                b.height > 1 &&
                s.visibility !== "hidden" &&
                s.display !== "none" &&
                s.opacity !== "0" &&
                !x.closest("[hidden],[aria-hidden=true],.sr-only")
              );
            };
            const label = (x) =>
              x.getAttribute("aria-label") ||
              x.labels?.[0]?.textContent ||
              x.textContent ||
              x.title ||
              x.outerHTML.slice(0, 70);
            for (const x of e.querySelectorAll("button,input,textarea,a,[role=slider]")) {
              if (!shown(x)) continue;
              const b = x.getBoundingClientRect(),
                minimum = coarse ? 44 : 32;
              if (
                x.tagName === "TEXTAREA" &&
                b.height < parseFloat(getComputedStyle(document.documentElement).fontSize) * 7.5 - 1
              )
                issues.push(["textarea-height", label(x), b.height]);
              if (
                !x.closest(".overflow-x-auto") &&
                (b.left < bounds.left - 1 || b.right > bounds.right + 1)
              )
                issues.push(["escape", label(x)]);
              if (
                !x.closest(".overflow-x-auto") &&
                (b.width < minimum - 1 || b.height < minimum - 1)
              )
                issues.push(["target", label(x), Math.round(b.width), Math.round(b.height)]);
            }
            for (const x of e.querySelectorAll("button,span,label,p,a")) {
              if (
                !shown(x) ||
                x.children.length ||
                !x.textContent.trim() ||
                x.closest(".overflow-x-auto") ||
                getComputedStyle(x).textOverflow === "ellipsis"
              )
                continue;
              const r = document.createRange();
              r.selectNodeContents(x);
              const b = r.getBoundingClientRect();
              if (b.left < bounds.left - 1 || b.right > bounds.right + 1)
                issues.push(["text", label(x)]);
              const button = x.closest("button");
              if (button) {
                for (const node of x.childNodes) {
                  if (node.nodeType !== Node.TEXT_NODE) continue;
                  for (const word of node.textContent.matchAll(/[A-Za-z]{3,}|[0-9]+:[0-9]+/g)) {
                    const wr = document.createRange();
                    wr.setStart(node, word.index);
                    wr.setEnd(node, word.index + word[0].length);
                    if (wr.getClientRects().length > 1)
                      issues.push(["split-word", label(button), word[0]]);
                  }
                }
              }
              if (
                x.tagName === "BUTTON" &&
                (x.scrollWidth > x.clientWidth + 2 || x.scrollHeight > x.clientHeight + 2)
              )
                issues.push(["clipped-label", label(x)]);
            }
            return {
              issues,
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              text: e.innerText.slice(0, 180),
            };
          });
          results.push({ width, height, font, theme, name, state, ...row });
          await panel.evaluate((e) => (e.scrollTop = 0));
          if (
            process.env.AIR_CAPTURES !== "0" &&
            (process.env.AIR_CAPTURES === "all" ||
              font === 16 ||
              [
                "Time of day",
                "Text",
                "Watermark",
                "Place image",
                "Border",
                "Remove BG",
                "Redact",
                "ID photo sheet",
              ].includes(name))
          ) {
            await page.screenshot({
              path: `${out}/${width}-${font}-${theme}-${slug}-${state}.png`,
            });
            await panel.evaluate((e) => (e.scrollTop = e.scrollHeight));
            await page.screenshot({
              path: `${out}/${width}-${font}-${theme}-${slug}-${state}-bottom.png`,
            });
          }
        }
        async function radio(label) {
          await panel.getByRole("radio", { name: label, exact: true }).check();
        }
        async function button(label) {
          await panel.getByRole("button", { name: label, exact: true }).click();
        }
        async function numeric(label, value) {
          const f = panel.getByRole("spinbutton", { name: label, exact: true });
          await f.fill(String(value));
          await f.press("Enter");
          assert.equal(await f.getAttribute("aria-invalid"), null);
        }
        async function browse() {
          const trigger = panel.getByRole("button", { name: /^(Choose|Replace) image…$/ });
          await trigger.focus();
          const choosing = page.waitForEvent("filechooser");
          await trigger.press("Enter");
          await (await choosing).setFiles(root + "/scripts/fixtures/orange.webp");
          await page.waitForTimeout(200);
        }
        async function consent() {
          const no = page
            .locator(".cloak-dialog")
            .getByRole("button", { name: "Not now", exact: true });
          if (await no.count()) {
            await shot("consent-background");
            await no.click();
            await page.locator(".cloak-dialog").waitFor({ state: "hidden" });
          }
        }
        try {
          await page.goto(process.env.BASE_URL || "http://127.0.0.1:8456");
          if (font !== 16) await page.addStyleTag({ content: `html{font-size:${font}px}` });
          await page
            .locator("input[type=file]")
            .first()
            .setInputFiles(root + "/scripts/fixtures/orange.webp");
          await page.locator(".editor-topbar [aria-label=Export]:not(:disabled)").waitFor();
          await selectEditorTool(page, name);
          panel = page
            .locator(".editor-properties .scroll-thin,.editor-mobile-surface .scroll-thin")
            .first();
          await page.locator("[data-tool-panel-loading]").waitFor({ state: "hidden" });
          await page.waitForTimeout(200);
          await consent();
          await shot("initial");
          switch (name) {
            case "Crop & rotate":
              await radio("1:1");
              await button("Flip H");
              await shot("square-flipped");
              await button("Reset crop area");
              break;
            case "Adjust":
              await numeric("Exposure", 1);
              await shot("adjusted");
              break;
            case "Time of day":
              await button("Snap to Golden");
              await shot("golden");
              break;
            case "Filters": {
              const choices = panel.locator("button[aria-pressed]");
              await choices.nth(1).click();
              await shot("selected");
              break;
            }
            case "Levels": {
              const f = panel.locator(".img-number input").first();
              await f.fill("20");
              await f.press("Enter");
              await shot("adjusted");
              break;
            }
            case "Selective color":
              await button("Magenta");
              await shot("magenta");
              break;
            case "Portrait blur":
              await radio("Whole image");
              await shot("whole");
              {
                const lenses = panel
                  .locator(".img-prop-row")
                  .filter({ hasText: "Lens" })
                  .getByRole("radio");
                if ((await lenses.count()) > 1) {
                  await lenses.last().check();
                  await shot("alternate-lens");
                }
              }
              break;
            case "Remove BG":
              await radio("Chroma");
              await shot("chroma");
              await button("Pick");
              await shot("chroma-picking");
              {
                const canvas = await page.locator("canvas.upper-canvas").boundingBox();
                await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
                await panel.getByRole("button", { name: "Clear sample", exact: true }).waitFor();
                await shot("chroma-sampled");
                await button("Clear sample");
                await button("Auto-detect");
              }
              {
                const fills = panel
                  .getByRole("group", { name: "Output background" })
                  .getByRole("button");
                await fills.last().click();
                await shot("background-fill");
              }
              break;
            case "Redact":
              await panel.getByRole("switch").click();
              await radio("Brush");
              await shot("brush-inspector");
              break;
            case "Text":
              await numeric("Outline", 2);
              await button("Arc down");
              await shot("outline-curve");
              break;
            case "Shapes":
              for (const kind of ["Rounded rectangle", "Polygon", "Star"]) {
                await button(kind);
                await shot(kind.toLowerCase().replaceAll(" ", "-"));
              }
              break;
            case "Draw":
              await radio("Eraser");
              await shot("eraser");
              break;
            case "Emoji": {
              const tabs = panel
                .locator(".img-prop-row")
                .filter({ hasText: "Category" })
                .getByRole("button");
              await tabs.last().click();
              await panel.getByRole("textbox", { name: "Paste any emoji" }).fill("🌄");
              await button("Use");
              await shot("custom");
              break;
            }
            case "Watermark":
              await radio("Image");
              await shot("image-empty");
              await browse();
              await shot("image-ready");
              await browse();
              await shot("same-image-reselected");
              break;
            case "Pen":
              await panel.getByRole("switch").click();
              await shot("fill");
              break;
            case "Place image":
              await browse();
              await panel.getByRole("button", { name: "To front", exact: true }).waitFor();
              await shot("image-selected");
              break;
            case "Color picker":
              await button("Re-extract palette");
              await shot("palette");
              break;
            case "Resize":
              await button("Unlock aspect ratio");
              await numeric("Width", 640);
              await shot("unlocked");
              break;
            case "ID photo sheet":
              await panel.getByRole("combobox", { name: "Photo standard", exact: true }).click();
              {
                const option = page.getByRole("option").filter({ hasText: "Custom" }).first();
                await option.click();
              }
              await shot("custom");
              await panel.getByRole("combobox", { name: "Paper size", exact: true }).click();
              await page.getByRole("option").last().click();
              await shot("paper");
              break;
            case "Frame": {
              const choices = panel.getByRole("button", { name: "Polaroid", exact: true });
              await choices.click();
              await shot("polaroid");
              break;
            }
            case "Border":
              await radio("Aspect");
              await shot("aspect");
              break;
            case "Tap to fix": {
              await page.waitForTimeout(600);
              const b = await page.locator("canvas.upper-canvas").boundingBox();
              await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
              await shot("target");
              break;
            }
            case "Spot heal":
              await numeric("Brush size", 50);
              await shot("brush");
              break;
          }
          console.log(width, font, theme, name, "pass");
        } catch (e) {
          failures.push({ width, font, theme, name, message: e.message });
          console.log("FAIL", width, font, theme, name, e.message.split("\n")[0]);
          await page
            .screenshot({ path: `${out}/${width}-${font}-${theme}-${slug}-failure.png` })
            .catch(() => {});
        }
      }
      await context.close();
    }
} finally {
  await browser.close();
  await writeFile(
    out + "/results.json",
    JSON.stringify({ engine, results, failures, errors, requests }, null, 2) + "\n",
  );
}
if (
  failures.length ||
  errors.length ||
  requests.length ||
  results.some((r) => r.issues.length || r.overflow)
)
  process.exitCode = 1;
