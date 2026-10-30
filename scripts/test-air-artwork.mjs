/** Finite artwork startup on real browser engines, with WebKit's four-thread hint. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const engines = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const engine = process.env.AIR_BROWSER || "webkit";
const out = resolve(process.env.AIR_EVIDENCE_DIR || `/tmp/air-artwork-${engine}`);
await mkdir(out, { recursive: true });
const urls = (process.env.AIR_FAMILY_URLS || "http://127.0.0.1:8433").split(",");
const names = ["cloakimg"];
const sizes =
  process.env.AIR_SMOKE === "1"
    ? [[390, 844]]
    : [
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
const evidence = {
  engine,
  layouts: [],
  fallbacks: [],
  lifecycle: [],
  stylesheetStartup: [],
  errors: [],
};
const browser = await engines[engine].launch({
  headless: true,
  ...(engine === "chromium" && process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
async function visit(index, width, height, theme, mode = "normal") {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: width <= 1024,
    ...(engine !== "firefox" ? { isMobile: width <= 1024 } : {}),
    colorScheme: theme,
    reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
  });
  await context.addInitScript((mode) => {
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 4 });
    Object.defineProperty(navigator, "deviceMemory", {
      value: mode === "constrained" ? 4 : undefined,
    });
    if (mode === "save-data")
      Object.defineProperty(navigator, "connection", { value: { saveData: true } });
    if (mode === "unsupported") Element.prototype.animate = undefined;
  }, mode);
  const page = await context.newPage();
  if (mode === "slow-css")
    await page.route("**/*.css", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });
  page.on("pageerror", (error) =>
    evidence.errors.push({ app: names[index], error: String(error) }),
  );
  await page.goto(urls[index], { waitUntil: "commit" });
  const art = page.locator("[data-art-state]").first();
  await art.waitFor();
  return { context, page, art };
}
const state = (page, value) =>
  page.waitForFunction(
    (value) => document.querySelector("[data-art-state]")?.dataset.artState === value,
    value,
    { timeout: 10000 },
  );

const observeMovement = async (art) =>
  await art.evaluate(async (root) => {
    const effects = root.getAnimations({ subtree: true });
    await Promise.all(effects.map((effect) => effect.ready));
    const sample = () =>
      effects.map((effect) => ({
        time: effect.currentTime,
        transform: getComputedStyle(effect.effect.target).transform,
        opacity: getComputedStyle(effect.effect.target).opacity,
      }));
    const before = sample();
    const start = performance.now();
    let after;
    // Some approved illustrations first hold their readable opening pose.
    do {
      await new Promise((resolve) => setTimeout(resolve, 100));
      after = sample();
    } while (
      performance.now() - start < 2000 &&
      after.every(
        (row, i) => row.transform === before[i].transform && row.opacity === before[i].opacity,
      )
    );
    return {
      count: effects.length,
      before,
      after,
      observedAfter: performance.now() - start,
    };
  });
async function finishFast(art) {
  // Only used outside the real phone/desktop timing cases; advance every phase.
  await art.evaluate(async (root) => {
    const until = performance.now() + 2500;
    while (root.dataset.artState !== "complete" && performance.now() < until) {
      root.getAnimations({ subtree: true }).forEach((effect) => effect.finish());
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });
  assert.equal(await art.getAttribute("data-art-state"), "complete");
}
async function activate(page, button, touch) {
  // Cache-status insertion/removal can reflow the artwork after a scroll.
  // Read its hit target atomically and require two stable animation frames.
  const point = await button.evaluate(async (target) => {
    const until = performance.now() + 2500;
    let previous = "";
    while (performance.now() < until) {
      target.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const box = target.getBoundingClientRect();
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      const key = `${x},${y}`;
      if (
        key === previous &&
        box.width >= 44 &&
        box.height >= 44 &&
        document.elementFromPoint(x, y) === target
      )
        return { x, y };
      previous = key;
    }
    return null;
  });
  assert.ok(point, "Press must hit the stable, visible artwork");
  // Native coordinates deliberately allow a press on aria-disabled busy artwork.
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

try {
  for (let index = 0; index < urls.length; index++) {
    for (const theme of ["light", "dark"])
      for (const [width, height] of sizes) {
        const { context, page, art } = await visit(index, width, height, theme);
        try {
          const initial = await art.getAttribute("data-art-state");
          const button = art.getByRole("button", {
            name: "Replay CloakIMG animation",
          });
          await art.scrollIntoViewIfNeeded();
          await state(page, "playing");
          assert.equal(await button.getAttribute("aria-disabled"), "true");
          const firstEffects = await art.evaluateHandle((root) =>
            root.getAnimations({ subtree: true }),
          );
          await activate(page, button, width <= 1024);
          assert.ok(
            await art.evaluate(
              (root, before) =>
                before.every((effect) => root.getAnimations({ subtree: true }).includes(effect)),
              firstEffects,
            ),
            "Initial run must ignore activation",
          );
          await firstEffects.dispose();
          // Observe actual time and composited pixels changing, not just a state label.
          const movement = await observeMovement(art);
          assert.ok(movement.count > 0, `${names[index]} has no effects`);
          assert.ok(
            movement.after.some((row, i) => row.time > movement.before[i].time),
            "timeline must advance",
          );
          assert.ok(
            movement.after.some(
              (row, i) =>
                row.transform !== movement.before[i].transform ||
                row.opacity !== movement.before[i].opacity,
            ),
            "composited artwork must move",
          );
          const geometry = await art.evaluate((root) => {
            const box = root.getBoundingClientRect();
            return {
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              contained: box.left >= -1 && box.right <= innerWidth + 1,
              cpu: navigator.hardwareConcurrency,
              memory: navigator.deviceMemory ?? null,
            };
          });
          assert.equal(geometry.overflow, false);
          assert.equal(geometry.contained, true);
          const capture = [390, 844, 768, 1280, 1440].includes(width);
          const prefix = `${names[index]}-${width}-${theme}`;
          if (capture)
            await page.screenshot({ path: resolve(out, `${prefix}-moving.jpg`), quality: 75 });
          const complete = width === 390 || width === 1440;
          if (complete) {
            await state(page, "complete");
            assert.equal(
              await art.evaluate((root) => root.getAnimations({ subtree: true }).length),
              0,
            );
            await page.evaluate(() => {
              dispatchEvent(new PageTransitionEvent("pagehide"));
              dispatchEvent(new PageTransitionEvent("pageshow"));
            });
            assert.equal(await art.getAttribute("data-art-state"), "complete");
            await page.screenshot({ path: resolve(out, `${prefix}-settled.jpg`), quality: 75 });
          }
          if (!complete) await finishFast(art);
          // The initial cache notice may move the artwork offscreen after settling.
          // Re-enter the viewport before asserting the deliberate replay is available.
          await button.scrollIntoViewIfNeeded();
          await page.waitForFunction(
            () =>
              document.querySelector(".air-artwork-replay")?.getAttribute("aria-disabled") ===
              "false",
          );
          assert.equal(await button.getAttribute("aria-disabled"), "false");
          assert.equal(await button.getAttribute("tabindex"), "0");
          await activate(page, button, width <= 1024);
          await state(page, "playing");
          const replayEffects = await art.evaluateHandle((root) =>
            root.getAnimations({ subtree: true }),
          );
          await activate(page, button, width <= 1024);
          await activate(page, button, width <= 1024);
          assert.ok(
            await art.evaluate(
              (root, before) =>
                before.every((effect) => root.getAnimations({ subtree: true }).includes(effect)),
              replayEffects,
            ),
            JSON.stringify({
              message: "Repeated presses must not restart or queue",
              app: names[index],
              width,
              theme,
              state: await art.getAttribute("data-art-state"),
              effects: await art.evaluate((root) =>
                root
                  .getAnimations({ subtree: true })
                  .map((a) => ({ time: a.currentTime, state: a.playState })),
              ),
              old: await replayEffects.evaluate((effects) =>
                effects.map((a) => ({ time: a.currentTime, state: a.playState })),
              ),
              viewport: await page.evaluate(() => ({
                width: innerWidth,
                scale: visualViewport.scale,
              })),
            }),
          );
          await replayEffects.dispose();
          const replayMovement = await observeMovement(art);
          assert.ok(replayMovement.count > 0);
          assert.ok(
            replayMovement.after.some((row, i) => row.time > replayMovement.before[i].time),
          );
          assert.ok(
            replayMovement.after.some(
              (row, i) =>
                row.transform !== replayMovement.before[i].transform ||
                row.opacity !== replayMovement.before[i].opacity,
            ),
          );
          if (complete) await state(page, "complete");
          else await finishFast(art);
          assert.equal(
            await art.evaluate((root) => root.getAnimations({ subtree: true }).length),
            0,
          );
          assert.equal(await button.getAttribute("aria-disabled"), "false");
          await page.waitForTimeout(80);
          assert.equal(await art.getAttribute("data-art-state"), "complete", "No queued run");
          evidence.layouts.push({
            app: names[index],
            width,
            height,
            theme,
            initial,
            ...geometry,
            movement,
            replayMovement,
            input: width <= 1024 ? "tap" : "click",
            complete,
          });
        } finally {
          await context.close();
        }
      }
    for (const mode of ["reduced", "constrained", "save-data", "unsupported"]) {
      const { context, page, art } = await visit(index, 390, 844, "light", mode);
      try {
        await state(page, mode);
        const staticEffects = await art.evaluate((root) =>
          root.getAnimations({ subtree: true }).map((effect) => ({
            target: effect.effect.target.outerHTML,
            frames: effect.effect.getKeyframes(),
          })),
        );
        assert.deepEqual(staticEffects, [], JSON.stringify({ mode, staticEffects }));
        assert.equal(await art.locator(".air-artwork-replay").isVisible(), false);
        assert.equal(await art.locator(".air-artwork-replay").getAttribute("tabindex"), "-1");
        evidence.fallbacks.push({ app: names[index], mode });
      } finally {
        await context.close();
      }
    }
    // A cold stylesheet must not supply empty easing tokens or consume the intro.
    {
      const { context, page, art } = await visit(index, 390, 844, "light", "slow-css");
      try {
        await art.scrollIntoViewIfNeeded();
        await state(page, "playing");
        const movement = await observeMovement(art);
        assert.ok(movement.count > 0);
        assert.ok(movement.after.some((row, i) => row.time > movement.before[i].time));
        assert.ok(
          movement.after.some(
            (row, i) =>
              row.transform !== movement.before[i].transform ||
              row.opacity !== movement.before[i].opacity,
          ),
        );
        await state(page, "complete");
        const replay = art.locator(".air-artwork-replay");
        assert.equal(await replay.getAttribute("aria-disabled"), "false");
        await activate(page, replay, true);
        await state(page, "playing");
        await finishFast(art);
        evidence.stylesheetStartup.push({
          app: names[index],
          delayMs: 2000,
          movement,
          replay: true,
        });
      } finally {
        await context.close();
      }
    }
    const { context, page, art } = await visit(index, 1440, 900, "light");
    try {
      await state(page, "playing");
      const replay = art.locator(".air-artwork-replay");
      // A press begun during the initial run cannot become a replay on release.
      const box = await replay.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      assert.equal(await replay.evaluate((button) => getComputedStyle(button).transform), "none");
      assert.equal(await replay.evaluate((button) => button.getAnimations().length), 0);
      await finishFast(art);
      await page.mouse.up();
      assert.equal(await art.getAttribute("data-art-state"), "complete");
      await page.keyboard.press("Tab");
      await replay.focus();
      assert.equal(
        await replay.evaluate((button) => getComputedStyle(button).outlineOffset),
        "-3px",
        "Replay keeps the shared inset focus outline",
      );
      await page.keyboard.down("Enter");
      await state(page, "playing");
      assert.ok(
        await replay.evaluate((button) => button === document.activeElement),
        "Focus retained while replay is unavailable",
      );
      await finishFast(art);
      await page.keyboard.down("Enter");
      assert.equal(
        await art.getAttribute("data-art-state"),
        "complete",
        "Held Enter does not restart",
      );
      await page.keyboard.up("Enter");
      await replay.scrollIntoViewIfNeeded();
      const scroll = await page.evaluate(() => scrollY);
      await page.keyboard.press("Space");
      await state(page, "playing");
      assert.equal(await page.evaluate(() => scrollY), scroll, "Space replays without scrolling");
      await page.locator("footer").scrollIntoViewIfNeeded();
      await state(page, "offscreen");
      const frozen = await art.evaluate(async (root) => {
        const effects = root.getAnimations({ subtree: true });
        await Promise.all(effects.map((effect) => effect.ready));
        const before = effects.map((effect) => effect.currentTime);
        await new Promise((resolve) => setTimeout(resolve, 150));
        return effects.every(
          (effect, i) => effect.playState === "paused" && effect.currentTime === before[i],
        );
      });
      assert.ok(frozen);
      await art.scrollIntoViewIfNeeded();
      await state(page, "playing");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await state(page, "reduced");
      assert.equal(await art.evaluate((root) => root.getAnimations({ subtree: true }).length), 0);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await state(page, "complete");
      evidence.lifecycle.push({
        app: names[index],
        keyboardReplay: true,
        pressBeforeCompletionIgnored: true,
        focusRetained: true,
        offscreenFrozen: true,
        livePreferenceSettles: true,
        noReplay: true,
      });
    } finally {
      await context.close();
    }
    console.log(`${engine}: ${names[index]} passed`);
  }
  assert.deepEqual(evidence.errors, []);
} finally {
  await browser.close();
  await writeFile(resolve(out, "results.json"), JSON.stringify(evidence, null, 2));
}
console.log(
  `${engine}: ${evidence.layouts.length} moving layouts, ${evidence.fallbacks.length} fallbacks, ${evidence.lifecycle.length} lifecycle journeys passed.`,
);
