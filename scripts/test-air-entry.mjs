import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8133";
const output = process.env.AIR_EVIDENCE_DIR ?? "/tmp/cloakimg-air-entry";
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.setBypassServiceWorker(true);
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
  [639, 800],
  [640, 800],
  [641, 800],
  [767, 900],
  [769, 900],
  [1023, 768],
  [1025, 768],
  [1279, 800],
  [1281, 800],
];
const layouts = [];
async function geometry(state) {
  const result = await page.evaluate(() => {
    const targets = [
      ...document.querySelectorAll(
        ".img-header a, .img-header summary, .img-footer nav a, .img-site button",
      ),
    ].filter((node) => node.checkVisibility());
    const badTargets = targets
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.height < 43.5 || rect.width < 43.5;
      })
      .map((node) => node.textContent.trim());
    const textOutside = [];
    const walker = document.createTreeWalker(
      document.querySelector(".img-site"),
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || !node.parentElement.checkVisibility()) continue;
      if (node.parentElement.closest(".img-skip")) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.left < -1 || rect.right > innerWidth + 1)
          textOutside.push(node.textContent.trim().slice(0, 100));
      }
    }
    return {
      width: innerWidth,
      height: innerHeight,
      root: getComputedStyle(document.documentElement).fontSize,
      scrollWidth: document.documentElement.scrollWidth,
      pageContainsFooter:
        document.querySelector(".img-site").getBoundingClientRect().bottom >=
        document.querySelector(".img-footer").getBoundingClientRect().bottom - 1,
      badTargets,
      textOutside,
    };
  });
  assert.equal(result.pageContainsFooter, true, `Page background ends above footer: ${state}`);
  assert.equal(result.scrollWidth <= result.width, true, JSON.stringify({ state, ...result }));
  assert.deepEqual(result.textOutside, [], JSON.stringify({ state, ...result }));
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches))
    assert.deepEqual(result.badTargets, [], JSON.stringify({ state, ...result }));
  layouts.push({ state, ...result });
}
async function button(name) {
  const handle = await page.evaluateHandle(
    (label) =>
      [...document.querySelectorAll("button")].find(
        (node) => (node.getAttribute("aria-label") ?? node.textContent.trim()) === label,
      ),
    name,
  );
  assert.ok(handle.asElement(), `Missing ${name}`);
  await handle.asElement().click();
  await handle.dispose();
}
try {
  await page.goto(base, { waitUntil: "networkidle2" });
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#285ad7";
    ctx.fillRect(0, 0, 32, 48);
    ctx.fillStyle = "rgba(220,90,40,0.5)";
    ctx.fillRect(32, 0, 32, 24);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const fixture = resolve(output, "synthetic.png");
  await writeFile(fixture, Buffer.from(png, "base64"));
  for (const theme of ["light", "dark"])
    for (const [width, height] of sizes)
      for (const font of [16, 32]) {
        await page.setViewport({ width, height, hasTouch: width <= 1024, deviceScaleFactor: 1 });
        await page.emulateMediaFeatures([
          { name: "prefers-color-scheme", value: theme },
          { name: "prefers-reduced-motion", value: "reduce" },
        ]);
        await page.goto(base, { waitUntil: "networkidle2" });
        await page.evaluate((size) => {
          document.documentElement.style.fontSize = `${size}px`;
        }, font);
        await geometry(`${theme}/home`);
        if (await page.$eval(".img-mobile-navigation summary", (node) => node.checkVisibility())) {
          await page.click(".img-mobile-navigation summary");
          await geometry(`${theme}/navigation`);
          await page.keyboard.press("Escape");
          assert.equal(await page.$eval(".img-mobile-navigation", (node) => node.open), false);
          assert.equal(await page.evaluate(() => document.activeElement.tagName), "SUMMARY");
        }
        if (font === 16 && [320, 390, 768, 1280, 1440].includes(width)) {
          await page.screenshot({
            path: resolve(output, `home-${width}-${theme}.png`),
            fullPage: true,
          });
        }
        await page.evaluate(() => {
          const input = document.querySelector("input[type=file]");
          const data = new DataTransfer();
          data.items.add(new File(["wrong type"], "notes.txt", { type: "text/plain" }));
          input.files = data.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await page.waitForFunction(() =>
          document.querySelector(".img-dropzone__error")?.textContent.includes("Choose an image"),
        );
        await geometry(`${theme}/invalid-file`);
      }
  // Pointer-independent import, native chooser cancellation/same-file selection,
  // clipboard recovery, nested drag stability, and a real lossless output.
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(base, { waitUntil: "networkidle2" });
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    "Skip to main content",
  );
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement.id), "main");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await button("Paste from clipboard");
  await page.waitForFunction(() =>
    document.querySelector(".img-dropzone__error")?.textContent.includes("couldn’t be read"),
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { read: async () => [] },
    }),
  );
  await button("Paste from clipboard");
  await page.waitForFunction(() =>
    document.querySelector(".img-dropzone__error")?.textContent.includes("No image"),
  );
  const missedDrop = await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["image"], "test.png", { type: "image/png" }));
    const missed = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data });
    document.querySelector("h1").dispatchEvent(missed);
    const textData = new DataTransfer();
    textData.setData("text/plain", "text");
    const text = new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      dataTransfer: textData,
    });
    document.querySelector("h1").dispatchEvent(text);
    return { filePrevented: missed.defaultPrevented, textPrevented: text.defaultPrevented };
  });
  assert.deepEqual(missedDrop, { filePrevented: true, textPrevented: false });
  await button("Open editor");
  await page.waitForSelector("[role=dialog]");
  const input = await page.$("[role=dialog] input[type=file]");
  await input.uploadFile(fixture);
  await page.waitForSelector(".img-dropzone__preview img");
  assert.equal(await input.evaluate((node) => node.value), "");
  for (const theme of ["light", "dark"]) {
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
    await page.screenshot({ path: resolve(output, `selected-${theme}.png`) });
  }
  await input.uploadFile(fixture);
  await button("Open in editor");
  await page.waitForSelector(".editor-topbar");
  await page.waitForFunction(() =>
    document.querySelector(".editor-topbar")?.textContent.includes("64"),
  );
  await button("Export");
  await page.waitForSelector("[role=dialog]");
  const pngOption = await page.evaluateHandle(() =>
    [...document.querySelectorAll(".cloak-dialog label")]
      .find((label) => label.textContent.trim() === "PNG")
      ?.querySelector('input[type="radio"]'),
  );
  assert.ok(pngOption.asElement(), "Missing PNG format radio");
  await pngOption.asElement().click();
  assert.equal(await pngOption.evaluate((node) => node.checked), true);
  await pngOption.dispose();
  const cdp = await page.createCDPSession();
  const downloadDir = resolve(output, "downloads");
  await mkdir(downloadDir, { recursive: true });
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadDir,
    eventsEnabled: true,
  });
  const completed = new Promise((resolveDone, reject) => {
    const timeout = setTimeout(() => reject(new Error("PNG download timeout")), 20000);
    cdp.on("Browser.downloadProgress", (event) => {
      if (event.state === "completed") {
        clearTimeout(timeout);
        resolveDone();
      }
    });
  });
  await button("Download");
  await completed;
  const downloaded = (await readdir(downloadDir)).find((name) => name.endsWith(".png"));
  assert.ok(downloaded);
  const exported = (await readFile(resolve(downloadDir, downloaded))).toString("base64");
  const fidelity = await page.evaluate(
    async ({ before, after }) => {
      const pixels = async (base64) => {
        const image = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${base64}`)).blob(),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        image.close();
        return {
          width: canvas.width,
          height: canvas.height,
          data: [...context.getImageData(0, 0, canvas.width, canvas.height).data],
        };
      };
      const a = await pixels(before),
        b = await pixels(after);
      return { width: b.width, height: b.height, equal: JSON.stringify(a) === JSON.stringify(b) };
    },
    { before: png, after: exported },
  );
  assert.deepEqual(fidelity, { width: 64, height: 48, equal: true });
  await cdp.detach();
  // A JS-disabled entry remains readable and links to the source/family.
  await page.setJavaScriptEnabled(false);
  await page.goto(base, { waitUntil: "networkidle2" });
  assert.match(
    await page.$eval("body", (node) => node.textContent),
    /Enable JavaScript to edit photos/,
  );
  assert.equal(await page.$$eval("noscript a[href]", (nodes) => nodes.length), 3);
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "entry.json"),
    JSON.stringify(
      {
        base,
        layouts,
        checks: [
          "native keyboard skip/menu",
          "all destinations at compact widths",
          "wrong type preserves entry",
          "clipboard denied/empty recovery",
          "missed file drop prevented; text drag unchanged",
          "selected thumbnail; same file can be picked again",
          "real 64×48 PNG pixels and alpha unchanged",
          "no-JS explanation and links",
        ],
        fidelity,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Air entry passed: ${layouts.length} responsive/theme/text observations and real PNG fidelity.`,
  );
} finally {
  await browser.close();
}
