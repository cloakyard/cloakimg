// Capture the redesigned landing and editor across the full responsive
// contract. The run fails on console errors, horizontal overflow, or
// clipped primary shells so screenshots cannot quietly mask layout bugs.

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chromePath =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const testImage = resolve(root, "test-fixtures/00554.jpg");

if (!existsSync(chromePath) || !existsSync(testImage)) {
  console.error("Chrome or test-fixtures/00554.jpg is missing");
  process.exit(1);
}

const viewports = [
  { name: "desktop", width: 1440, height: 900, touch: false },
  { name: "tablet", width: 768, height: 1024, touch: true },
  { name: "phone-wide", width: 414, height: 896, touch: true },
  { name: "phone", width: 375, height: 812, touch: true },
  { name: "phone-compact", width: 320, height: 700, touch: true },
  { name: "android-narrow", width: 280, height: 653, touch: true },
];

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    `--user-data-dir=${mkdtempSync(resolve(tmpdir(), "cloakimg-responsive-audit-"))}`,
  ],
});

const failures = [];

async function inspectLayout(page, viewport, stage) {
  const result = await page.evaluate(() => {
    const rootElement = document.documentElement;
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };
    const escaped = Array.from(
      document.querySelectorAll(
        ".cloak-site-header__inner, .cloak-workbench, .cloak-dialog, .editor-topbar, .editor-mobile-surface",
      ),
    )
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector: element.className,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      })
      .filter(({ left, right }) => left < -1 || right > innerWidth + 1);
    const escapedControls = Array.from(
      document.querySelectorAll('button, a, input, select, textarea, [role="slider"]'),
    )
      .filter(visible)
      .filter((element) => !element.closest(".overflow-x-auto"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector:
            element.getAttribute("aria-label") ||
            element.textContent?.trim().slice(0, 40) ||
            element.tagName,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      })
      .filter(({ left, right }) => left < -1 || right > innerWidth + 1);
    const overlapPairs = [
      [".cloak-site-header .logo-wordmark", ".cloak-site-header__actions"],
      [".editor-topbar__brand .logo-wordmark", '.editor-topbar button[aria-label="Undo"]'],
    ];
    const overlaps = overlapPairs
      .map(([leftSelector, rightSelector]) => {
        const left = document.querySelector(leftSelector);
        const right = document.querySelector(rightSelector);
        if (!left || !right || !visible(left) || !visible(right)) return null;
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        if (leftRect.right <= rightRect.left + 1) return null;
        return {
          left: leftSelector,
          right: rightSelector,
          overlap: Math.round(leftRect.right - rightRect.left),
        };
      })
      .filter(Boolean);

    return {
      viewport: [innerWidth, innerHeight],
      scrollWidth: rootElement.scrollWidth,
      overflow: rootElement.scrollWidth > innerWidth + 1,
      escaped,
      escapedControls,
      overlaps,
    };
  });

  if (
    result.overflow ||
    result.escaped.length > 0 ||
    result.escapedControls.length > 0 ||
    result.overlaps.length > 0
  ) {
    failures.push(`${viewport.name}/${stage}: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify({ viewport: viewport.name, stage, ...result }));
}

async function inspectFooter(page, viewport) {
  const result = await page.evaluate(() => {
    const footer = document.querySelector(".cloak-site-footer");
    const navItems = Array.from(document.querySelectorAll(".cloak-site-footer__nav > *"));
    const actionItems = Array.from(document.querySelectorAll(".cloak-site-footer__actions > *"));
    const rectFor = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
      };
    };
    const wrappedLabels = [...navItems, ...actionItems]
      .filter((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const textRect = range.getBoundingClientRect();
        const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
        return Number.isFinite(lineHeight) && textRect.height > lineHeight * 1.5;
      })
      .map((element) => element.textContent?.trim())
      .filter(Boolean);

    return {
      footer: footer ? rectFor(footer) : null,
      navItems: navItems.map(rectFor),
      actionItems: actionItems.map(rectFor),
      wrappedLabels,
    };
  });

  const nav = result.navItems;
  const narrowGridMisaligned =
    viewport.width < 640 &&
    (nav.length !== 4 ||
      Math.abs(nav[0].top - nav[1].top) > 1 ||
      Math.abs(nav[2].top - nav[3].top) > 1 ||
      Math.abs(nav[0].left - nav[2].left) > 1 ||
      Math.abs(nav[1].left - nav[3].left) > 1);
  const escaped =
    !result.footer ||
    result.footer.left < -1 ||
    result.footer.right > viewport.width + 1 ||
    [...result.navItems, ...result.actionItems].some(
      (item) => item.left < -1 || item.right > viewport.width + 1,
    );

  if (escaped || narrowGridMisaligned || result.wrappedLabels.length > 0) {
    failures.push(`${viewport.name}/footer: ${JSON.stringify(result)}`);
  }

  const footer = await page.$(".cloak-site-footer");
  if (footer) {
    await footer.screenshot({ path: `/tmp/cloakimg-${viewport.name}-footer.png` });
  }
}

async function inspectOpenSelectList(page, viewport, label, stage) {
  const trigger = await page.$(`button[role="combobox"][aria-label="${label}"]`);
  if (!trigger) {
    failures.push(`${viewport.name}/${stage}: ${label} trigger missing`);
    return;
  }
  await trigger.click();

  await page.waitForFunction(
    (accessibleName) => {
      const trigger = Array.from(document.querySelectorAll('button[role="combobox"]')).find(
        (candidate) => candidate.getAttribute("aria-label") === accessibleName,
      );
      const listbox = trigger?.getAttribute("aria-controls");
      return listbox && document.getElementById(listbox)?.dataset.ready === "true";
    },
    { timeout: 3000 },
    label,
  );
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));

  const result = await page.evaluate((accessibleName) => {
    const trigger = Array.from(document.querySelectorAll('button[role="combobox"]')).find(
      (candidate) => candidate.getAttribute("aria-label") === accessibleName,
    );
    const native = Array.from(document.querySelectorAll("select")).find(
      (candidate) => candidate.getAttribute("aria-label") === accessibleName,
    );
    const listbox = trigger?.getAttribute("aria-controls")
      ? document.getElementById(trigger.getAttribute("aria-controls"))
      : null;
    if (!trigger || !native || !listbox) return { missing: true };

    const triggerRect = trigger.getBoundingClientRect();
    const listboxRect = listbox.getBoundingClientRect();
    const options = Array.from(listbox.querySelectorAll('[role="option"]'));
    const labels = Array.from(listbox.querySelectorAll(".select-control__option-label"));
    const selected = options.filter((option) => option.getAttribute("aria-selected") === "true");
    const selectedRect = selected[0]?.getBoundingClientRect();
    const groupLabels = Array.from(listbox.querySelectorAll(".select-control__group-label"));
    const activeId = trigger.getAttribute("aria-activedescendant");
    const indicator = trigger.querySelector(".select-control__indicator svg");
    const itemHeights = options.map((option) => option.getBoundingClientRect().height);
    let topLayer = false;
    try {
      topLayer = listbox.matches(":popover-open");
    } catch {
      topLayer = false;
    }

    return {
      missing: false,
      expanded: trigger.getAttribute("aria-expanded"),
      selectedValue: native.value,
      nativeOptionCount: native.options.length,
      optionCount: options.length,
      nativeGroupCount: native.querySelectorAll("optgroup").length,
      groupCount: listbox.querySelectorAll('[role="group"]').length,
      selectedCount: selected.length,
      selectedLabel: selected[0]?.textContent?.trim(),
      selectedMarker: !!selected[0]?.querySelector(".select-control__option-marker svg"),
      selectedFullyVisible: !!(
        selectedRect &&
        selectedRect.top >= listboxRect.top - 1 &&
        selectedRect.bottom <= listboxRect.bottom + 1
      ),
      activeOptionExists: !!(activeId && document.getElementById(activeId)),
      triggerWidth: Math.round(triggerRect.width),
      bounds: {
        left: Math.round(listboxRect.left),
        right: Math.round(listboxRect.right),
        top: Math.round(listboxRect.top),
        bottom: Math.round(listboxRect.bottom),
      },
      minItemHeight: Math.round(Math.min(...itemHeights)),
      listHorizontalOverflow: listbox.scrollWidth > listbox.clientWidth + 1,
      labelHorizontalOverflow: labels.some((entry) => entry.scrollWidth > entry.clientWidth + 1),
      optionFont: options[0] ? getComputedStyle(options[0]).fontFamily : "",
      groupFont: groupLabels[0] ? getComputedStyle(groupLabels[0]).fontFamily : "",
      background: getComputedStyle(listbox).backgroundColor,
      arrowTransform: indicator ? getComputedStyle(indicator).transform : "missing",
      placement: listbox.dataset.placement,
      topLayer,
    };
  }, label);

  const minimumHeight = viewport.touch ? 44 : 40;
  const invalid =
    result.missing ||
    result.expanded !== "true" ||
    result.nativeOptionCount !== result.optionCount ||
    result.nativeGroupCount !== result.groupCount ||
    result.selectedCount !== 1 ||
    !result.selectedMarker ||
    !result.selectedFullyVisible ||
    !result.activeOptionExists ||
    result.bounds.left < LISTBOX_EDGE_TOLERANCE ||
    result.bounds.right > viewport.width + 1 ||
    result.bounds.top < LISTBOX_EDGE_TOLERANCE ||
    result.bounds.bottom > viewport.height + 1 ||
    result.bounds.right - result.bounds.left + 1 < result.triggerWidth ||
    result.minItemHeight < minimumHeight ||
    result.listHorizontalOverflow ||
    result.labelHorizontalOverflow ||
    !result.optionFont.includes("Archivo") ||
    (result.groupCount > 0 && !result.groupFont.includes("JetBrains Mono")) ||
    result.background === "rgba(0, 0, 0, 0)" ||
    result.arrowTransform === "none" ||
    !result.topLayer;
  if (invalid) {
    failures.push(`${viewport.name}/${stage}: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify({ viewport: viewport.name, stage, listbox: result }));

  await page.screenshot({
    path: `/tmp/cloakimg-${viewport.name}-${stage}.png`,
    fullPage: false,
  });

  const beforeNavigation = await page.evaluate((accessibleName) => {
    const trigger = Array.from(document.querySelectorAll('button[role="combobox"]')).find(
      (candidate) => candidate.getAttribute("aria-label") === accessibleName,
    );
    const native = Array.from(document.querySelectorAll("select")).find(
      (candidate) => candidate.getAttribute("aria-label") === accessibleName,
    );
    return {
      active: trigger?.getAttribute("aria-activedescendant"),
      value: native?.value,
    };
  }, label);
  await page.keyboard.press("ArrowDown");
  const afterArrow = await page.evaluate((accessibleName) => {
    const trigger = Array.from(document.querySelectorAll('button[role="combobox"]')).find(
      (candidate) => candidate.getAttribute("aria-label") === accessibleName,
    );
    return trigger?.getAttribute("aria-activedescendant");
  }, label);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    (accessibleName) =>
      Array.from(document.querySelectorAll('button[role="combobox"]'))
        .find((candidate) => candidate.getAttribute("aria-label") === accessibleName)
        ?.getAttribute("aria-expanded") === "false",
    { timeout: 3000 },
    label,
  );
  const afterDismiss = await page.evaluate((accessibleName) => {
    const trigger = Array.from(document.querySelectorAll('button[role="combobox"]')).find(
      (candidate) => candidate.getAttribute("aria-label") === accessibleName,
    );
    const native = Array.from(document.querySelectorAll("select")).find(
      (candidate) => candidate.getAttribute("aria-label") === accessibleName,
    );
    return {
      focused: document.activeElement === trigger,
      value: native?.value,
    };
  }, label);
  if (
    beforeNavigation.active === afterArrow ||
    beforeNavigation.value !== afterDismiss.value ||
    !afterDismiss.focused
  ) {
    failures.push(
      `${viewport.name}/${stage}-keyboard: ${JSON.stringify({ beforeNavigation, afterArrow, afterDismiss })}`,
    );
  }
}

const LISTBOX_EDGE_TOLERANCE = 7;

async function inspectIdPhotoDropdowns(page, viewport) {
  if (viewport.width <= 600) {
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("button"))
        .find((button) => button.getAttribute("aria-label") === "Open tools")
        ?.click();
    });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 220));
  }

  const activated = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button[aria-label="ID photo sheet"]'));
    const visible = candidates.find((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.display !== "none";
    });
    visible?.click();
    return !!visible;
  });
  if (!activated) {
    failures.push(`${viewport.name}/id-photo-selects: tool button missing`);
    return;
  }

  await page.waitForSelector('select[aria-label="Photo standard"]', { timeout: 5000 });
  await page.waitForFunction(() => !document.querySelector("[data-tool-panel-loading]"), {
    timeout: 5000,
  });
  await page.waitForFunction(
    () =>
      Boolean(
        document.querySelector('canvas.upper-canvas[role="application"]') &&
        window.__editorDebug?.toolState.idPhotoCrop,
      ),
    { timeout: 5000 },
  );
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 160));

  const inspect = async (stage) => {
    const result = await page.evaluate(() => {
      const controls = Array.from(
        document.querySelectorAll(
          'select[aria-label="Photo standard"], select[aria-label="Paper size"]',
        ),
      );
      return controls.map((select) => {
        const shell = select.closest(".select-control");
        const value = shell?.querySelector(".select-control__value");
        const indicator = shell?.querySelector(".select-control__indicator svg");
        if (!shell || !value || !indicator) {
          return { label: select.getAttribute("aria-label"), missingShell: true };
        }
        const shellRect = shell.getBoundingClientRect();
        const valueRect = value.getBoundingClientRect();
        const indicatorRect = indicator.getBoundingClientRect();
        return {
          label: select.getAttribute("aria-label"),
          missingShell: false,
          selected: select.value,
          visibleValue: value.textContent?.trim(),
          shell: {
            left: Math.round(shellRect.left),
            right: Math.round(shellRect.right),
            height: Math.round(shellRect.height),
          },
          arrowInset: Math.round(shellRect.right - indicatorRect.right),
          textEscapes: valueRect.left < shellRect.left - 1 || valueRect.right > shellRect.right + 1,
          horizontalTextOverflow: value.scrollWidth > value.clientWidth + 1,
          nativeOpacity: getComputedStyle(select).opacity,
          indiaVisaPresent: Array.from(select.querySelectorAll("option")).some(
            (option) => option.value === "india-visa",
          ),
        };
      });
    });

    const invalid =
      result.length !== 2 ||
      result.some(
        (control) =>
          control.missingShell ||
          control.shell.left < -1 ||
          control.shell.right > viewport.width + 1 ||
          (viewport.touch && control.shell.height < 44) ||
          control.arrowInset < 8 ||
          control.textEscapes ||
          control.horizontalTextOverflow ||
          control.nativeOpacity !== "0" ||
          (control.label === "Photo standard" && !control.indiaVisaPresent),
      );
    if (invalid) {
      failures.push(`${viewport.name}/id-photo-selects-${stage}: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify({ viewport: viewport.name, stage, controls: result }));
  };

  await inspect("browser-match");
  await page.screenshot({
    path: `/tmp/cloakimg-${viewport.name}-id-photo-selects.png`,
    fullPage: false,
  });

  await inspectOpenSelectList(page, viewport, "Photo standard", "id-photo-standard-menu");
  if (viewport.name === "desktop") {
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
    await inspectOpenSelectList(page, viewport, "Photo standard", "id-photo-standard-menu-dark");
    await page.screenshot({
      path: "/tmp/cloakimg-desktop-id-photo-dark.png",
      fullPage: false,
    });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  }

  // ID framing now lives directly on the canvas. Audit the complete
  // replacement contract: the legacy sliders are gone, the Fabric
  // surface is keyboard-accessible, move / edge / corner gestures all
  // update state, and every resize preserves the selected photo ratio.
  const framingState = () =>
    page.evaluate(() => {
      const debug = window.__editorDebug;
      const crop = debug?.toolState.idPhotoCrop;
      const dimensions = debug?.docDims;
      const image = document.querySelector(".checker");
      const canvas = document.querySelector("canvas.upper-canvas");
      const imageRect = image?.getBoundingClientRect();
      const scale = crop && dimensions && imageRect ? imageRect.width / dimensions.w : 0;
      const guides = Array.from(document.querySelectorAll('[data-id-photo-cut-guides="corner"]'));
      return {
        crop,
        dimensions,
        cropAspect: crop ? crop.w / crop.h : null,
        withinBounds: Boolean(
          crop &&
          dimensions &&
          crop.x >= -0.01 &&
          crop.y >= -0.01 &&
          crop.x + crop.w <= dimensions.w + 0.01 &&
          crop.y + crop.h <= dimensions.h + 0.01,
        ),
        frame:
          crop && imageRect
            ? {
                left: imageRect.left + crop.x * scale,
                top: imageRect.top + crop.y * scale,
                right: imageRect.left + (crop.x + crop.w) * scale,
                bottom: imageRect.top + (crop.y + crop.h) * scale,
                width: crop.w * scale,
                height: crop.h * scale,
              }
            : null,
        canvasAccessible: Boolean(
          canvas &&
          canvas.getAttribute("role") === "application" &&
          canvas.getAttribute("tabindex") === "0" &&
          canvas.getAttribute("aria-label")?.includes("Drag an edge or corner handle"),
        ),
        legacySliderCount: document.querySelectorAll('[role="slider"]').length,
        instructionsPresent:
          document.body.textContent?.includes("drag inside the frame") === true &&
          document.body.textContent?.includes("drag any edge or corner") === true,
        guideCount: guides.length,
        invalidGuideLineCount: guides.filter((guide) => guide.querySelectorAll("line").length !== 8)
          .length,
        outlinedSlots: guides.filter(
          (guide) => getComputedStyle(guide.parentElement).outlineStyle !== "none",
        ).length,
      };
    });
  const dragFrame = async (from, to) => {
    const path = Array.from({ length: 5 }, (_, index) => {
      const progress = index / 4;
      return {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      };
    });
    if (viewport.touch) {
      await page.touchscreen.touchStart(path[0].x, path[0].y);
      for (const point of path.slice(1)) await page.touchscreen.touchMove(point.x, point.y);
      await page.touchscreen.touchEnd();
    } else {
      await page.mouse.move(path[0].x, path[0].y);
      await page.mouse.down();
      for (const point of path.slice(1)) await page.mouse.move(point.x, point.y);
      await page.mouse.up();
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 160));
  };

  const beforeFraming = await framingState();
  if (
    !beforeFraming.crop ||
    !beforeFraming.frame ||
    !beforeFraming.withinBounds ||
    !beforeFraming.canvasAccessible ||
    beforeFraming.legacySliderCount !== 0 ||
    !beforeFraming.instructionsPresent ||
    beforeFraming.guideCount === 0 ||
    beforeFraming.invalidGuideLineCount > 0 ||
    beforeFraming.outlinedSlots > 0
  ) {
    failures.push(`${viewport.name}/id-photo-framing-before: ${JSON.stringify(beforeFraming)}`);
  }

  await page.evaluate(() => document.querySelector("canvas.upper-canvas")?.focus());
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await page.keyboard.press("+");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 160));

  const afterKeyboard = await framingState();
  const aspect = beforeFraming.cropAspect;
  if (
    !afterKeyboard.crop ||
    !afterKeyboard.frame ||
    !afterKeyboard.withinBounds ||
    !(afterKeyboard.crop.w < beforeFraming.crop.w) ||
    !(afterKeyboard.crop.x > beforeFraming.crop.x) ||
    !(afterKeyboard.crop.y > beforeFraming.crop.y) ||
    Math.abs(afterKeyboard.cropAspect - aspect) > 0.0001
  ) {
    failures.push(`${viewport.name}/id-photo-framing-keyboard: ${JSON.stringify(afterKeyboard)}`);
  }

  if (afterKeyboard.frame) {
    await dragFrame(
      {
        x: (afterKeyboard.frame.left + afterKeyboard.frame.right) / 2,
        y: (afterKeyboard.frame.top + afterKeyboard.frame.bottom) / 2,
      },
      {
        x: (afterKeyboard.frame.left + afterKeyboard.frame.right) / 2 + 8,
        y: (afterKeyboard.frame.top + afterKeyboard.frame.bottom) / 2 + 6,
      },
    );
  }
  const afterMove = await framingState();
  if (
    !afterMove.crop ||
    !afterMove.frame ||
    !afterMove.withinBounds ||
    !(afterMove.crop.x > afterKeyboard.crop.x) ||
    !(afterMove.crop.y > afterKeyboard.crop.y) ||
    Math.abs(afterMove.cropAspect - aspect) > 0.0001
  ) {
    failures.push(`${viewport.name}/id-photo-framing-move: ${JSON.stringify(afterMove)}`);
  }

  if (afterMove.frame) {
    const edgeDelta = Math.max(8, Math.min(24, afterMove.frame.width * 0.15));
    await dragFrame(
      { x: afterMove.frame.right, y: (afterMove.frame.top + afterMove.frame.bottom) / 2 },
      {
        x: afterMove.frame.right - edgeDelta,
        y: (afterMove.frame.top + afterMove.frame.bottom) / 2,
      },
    );
  }
  const afterEdge = await framingState();
  if (
    !afterEdge.crop ||
    !afterEdge.frame ||
    !afterEdge.withinBounds ||
    !(afterEdge.crop.w < afterMove.crop.w) ||
    Math.abs(afterEdge.cropAspect - aspect) > 0.0001 ||
    Math.abs(afterEdge.frame.left - afterMove.frame.left) > 2
  ) {
    failures.push(`${viewport.name}/id-photo-framing-edge: ${JSON.stringify(afterEdge)}`);
  }

  if (afterEdge.frame) {
    const cornerDelta = Math.max(8, Math.min(20, afterEdge.frame.width * 0.12));
    await dragFrame(
      { x: afterEdge.frame.right, y: afterEdge.frame.bottom },
      { x: afterEdge.frame.right - cornerDelta, y: afterEdge.frame.bottom - cornerDelta },
    );
  }
  const afterCorner = await framingState();
  if (
    !afterCorner.crop ||
    !afterCorner.frame ||
    !afterCorner.withinBounds ||
    !(afterCorner.crop.w < afterEdge.crop.w) ||
    Math.abs(afterCorner.cropAspect - aspect) > 0.0001
  ) {
    failures.push(`${viewport.name}/id-photo-framing-corner: ${JSON.stringify(afterCorner)}`);
  }
  console.log(
    JSON.stringify({
      viewport: viewport.name,
      stage: "id-photo-framing",
      before: beforeFraming,
      afterKeyboard,
      afterMove,
      afterEdge,
      afterCorner,
    }),
  );
  await page.screenshot({
    path: `/tmp/cloakimg-${viewport.name}-id-photo-framing.png`,
    fullPage: false,
  });

  await page.evaluate(() => {
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Reset framing")
      ?.click();
  });
  await page.waitForFunction(
    (expectedWidth) =>
      Math.abs((window.__editorDebug?.toolState.idPhotoCrop?.w ?? 0) - expectedWidth) < 0.01,
    { timeout: 3000 },
    beforeFraming.crop.w,
  );
  const afterReset = await framingState();
  if (
    !afterReset.crop ||
    !afterReset.withinBounds ||
    Math.abs(afterReset.crop.x - beforeFraming.crop.x) > 0.01 ||
    Math.abs(afterReset.crop.y - beforeFraming.crop.y) > 0.01 ||
    Math.abs(afterReset.crop.w - beforeFraming.crop.w) > 0.01 ||
    Math.abs(afterReset.crop.h - beforeFraming.crop.h) > 0.01
  ) {
    failures.push(`${viewport.name}/id-photo-framing-reset: ${JSON.stringify(afterReset)}`);
  }

  await page.click('button[role="combobox"][aria-label="Photo standard"]');
  await page.waitForSelector('.select-control__listbox[data-ready="true"]', { timeout: 3000 });
  const indiaVisaSelected = await page.evaluate(() => {
    const select = document.querySelector('select[aria-label="Photo standard"]');
    const indiaOption = Array.from(select?.options ?? []).find(
      (option) => option.value === "india-visa",
    );
    const trigger = document.querySelector('button[role="combobox"][aria-label="Photo standard"]');
    const listbox = trigger?.getAttribute("aria-controls")
      ? document.getElementById(trigger.getAttribute("aria-controls"))
      : null;
    const option = indiaOption
      ? listbox?.querySelector(`[data-option-index="${indiaOption.index}"]`)
      : null;
    option?.click();
    return !!option;
  });
  if (!indiaVisaSelected) {
    failures.push(`${viewport.name}/id-photo-standard-menu: India visa item missing`);
  }
  await page.waitForFunction(
    () =>
      document.querySelector('select[aria-label="Photo standard"]')?.value === "india-visa" &&
      document
        .querySelector('select[aria-label="Photo standard"]')
        ?.closest(".select-control")
        ?.querySelector(".select-control__value")
        ?.textContent?.trim() === "India · Visa",
    { timeout: 3000 },
  );
  await page.waitForFunction(
    () =>
      Math.abs(
        window.__editorDebug?.toolState.idPhotoCrop?.w /
          window.__editorDebug?.toolState.idPhotoCrop?.h -
          1,
      ) < 0.0001,
    { timeout: 3000 },
  );
  const afterPreset = await framingState();
  if (
    !afterPreset.crop ||
    !afterPreset.withinBounds ||
    Math.abs(afterPreset.cropAspect - 1) > 0.0001
  ) {
    failures.push(`${viewport.name}/id-photo-framing-preset: ${JSON.stringify(afterPreset)}`);
  }
  await inspect("india-visa");

  await page.$eval('select[aria-label="Paper size"]', (select) => {
    select.closest(".select-control")?.scrollIntoView({ block: "center" });
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  await inspectOpenSelectList(page, viewport, "Paper size", "id-photo-paper-menu");
  await page.screenshot({
    path: `/tmp/cloakimg-${viewport.name}-id-photo-paper.png`,
    fullPage: false,
  });

  if (viewport.width <= 600) {
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("button"))
        .find((button) => button.getAttribute("aria-label") === "Cancel")
        ?.click();
    });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
  }
}

async function inspectBatchDropdown(page, viewport) {
  if (viewport.width <= 600) return;
  await page.click('button[aria-label="Batch"]');
  await page.waitForSelector(".editor-shell .scroll-thin", { timeout: 3000 });
  const expanded = await page.evaluate(() => {
    const convert = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.trim().startsWith("Convert"),
    );
    convert?.click();
    return !!convert;
  });
  if (!expanded) {
    failures.push(`${viewport.name}/batch-select: Convert step missing`);
    return;
  }
  await page.waitForSelector('select[aria-label="Format"]', { timeout: 3000 });
  const state = await page.evaluate(() => {
    const select = document.querySelector('select[aria-label="Format"]');
    const shell = select?.closest(".select-control");
    const value = shell?.querySelector(".select-control__value");
    const indicator = shell?.querySelector(".select-control__indicator svg");
    if (!select || !shell || !value || !indicator) return { missing: true };
    const shellRect = shell.getBoundingClientRect();
    const indicatorRect = indicator.getBoundingClientRect();
    return {
      missing: false,
      value: value.textContent?.trim(),
      arrowInset: Math.round(shellRect.right - indicatorRect.right),
      escaped: shellRect.left < -1 || shellRect.right > innerWidth + 1,
      overflow: value.scrollWidth > value.clientWidth + 1,
    };
  });
  if (state.missing || state.arrowInset < 8 || state.escaped || state.overflow) {
    failures.push(`${viewport.name}/batch-select: ${JSON.stringify(state)}`);
  }
  await inspectOpenSelectList(page, viewport, "Format", "batch-format-menu");
  await page.screenshot({
    path: `/tmp/cloakimg-${viewport.name}-batch-select.png`,
    fullPage: false,
  });
  await page.click('button[aria-label="Single photo"]');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
}

async function inspectMobileToolPicker(page, viewport) {
  const wrappedLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".editor-mobile-surface button[aria-pressed] span"))
      .filter((label) => {
        const lineHeight = Number.parseFloat(getComputedStyle(label).lineHeight);
        return (
          Number.isFinite(lineHeight) && label.getBoundingClientRect().height > lineHeight * 1.5
        );
      })
      .map((label) => label.textContent?.trim())
      .filter(Boolean),
  );
  if (wrappedLabels.length > 0) {
    failures.push(
      `${viewport.name}/tool-picker: wrapped button labels ${wrappedLabels.join(", ")}`,
    );
  }
}

async function inspectMobileToolSearch(page, viewport) {
  const search = await page.$('input[aria-label="Search editor tools"]');
  if (!search) {
    failures.push(`${viewport.name}/tool-search: search input missing`);
    return;
  }

  await search.type("portrait");
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  const searchState = await page.evaluate(() => {
    const resultButtons = Array.from(
      document.querySelectorAll(".editor-mobile-surface button[aria-pressed]"),
    )
      .map((button) => button.getAttribute("aria-label"))
      .filter(Boolean);
    const count = document.querySelector("#mobile-editor-tool-search-count")?.textContent?.trim();
    return { resultButtons, count };
  });
  if (
    searchState.resultButtons.length !== 1 ||
    searchState.resultButtons[0] !== "Portrait blur" ||
    searchState.count !== "1 matching tool"
  ) {
    failures.push(`${viewport.name}/tool-search: ${JSON.stringify(searchState)}`);
  }
  await page.screenshot({
    path: `/tmp/cloakimg-${viewport.name}-tool-search.png`,
    fullPage: false,
  });

  await page.click('button[aria-label="Clear editor tool search"]');
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
}

async function auditMobileToolPanels(page, viewport) {
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".editor-mobile-surface button[aria-pressed]"))
      .map((button) => button.getAttribute("aria-label"))
      .filter(Boolean),
  );

  for (const label of labels) {
    await page.evaluate((toolLabel) => {
      Array.from(document.querySelectorAll(".editor-mobile-surface button[aria-pressed]"))
        .find((button) => button.getAttribute("aria-label") === toolLabel)
        ?.click();
    }, label);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 260));

    await page.waitForFunction(() => !document.querySelector("[data-tool-panel-loading]"), {
      timeout: 5000,
    });
    const dismissedConsent = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) =>
          candidate.getAttribute("aria-label") === "Not now" ||
          candidate.textContent?.trim() === "Not now",
      );
      button?.click();
      return !!button;
    });
    if (dismissedConsent) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 160));
    }

    const panelState = await page.evaluate((toolLabel) => {
      const surface = document.querySelector(".editor-mobile-surface");
      const scroller = surface?.querySelector(".scroll-thin");
      if (!surface || !scroller) return { label: toolLabel, missing: true };
      const surfaceRect = surface.getBoundingClientRect();
      const scrollRect = scroller.getBoundingClientRect();
      const toolActions = ["Cancel", "Done"].map((label) => {
        const button = Array.from(surface.querySelectorAll("button")).find(
          (candidate) => candidate.getAttribute("aria-label") === label,
        );
        if (!button) return { label, missing: true };
        const rect = button.getBoundingClientRect();
        return {
          label,
          missing: false,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          pinnedAboveControls: rect.bottom <= scrollRect.top + 1,
          insideScroller: scroller.contains(button),
        };
      });
      const escapedControls = Array.from(
        scroller.querySelectorAll(
          'button, input, select, textarea, [role="slider"], [role="tab"], [role="radio"]',
        ),
      )
        .filter((control) => {
          const rect = control.getBoundingClientRect();
          const style = getComputedStyle(control);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.bottom > scrollRect.top &&
            rect.top < scrollRect.bottom &&
            !control.closest(".overflow-x-auto")
          );
        })
        .filter((control) => {
          const rect = control.getBoundingClientRect();
          return rect.left < scrollRect.left - 1 || rect.right > scrollRect.right + 1;
        })
        .map(
          (control) =>
            control.getAttribute("aria-label") || control.textContent?.trim().slice(0, 40),
        );
      const wrappedSegmentLabels = Array.from(scroller.querySelectorAll("button.flex-1"))
        .filter((button) => {
          const lineHeight = Number.parseFloat(getComputedStyle(button).lineHeight);
          if (!Number.isFinite(lineHeight)) return false;
          const range = document.createRange();
          range.selectNodeContents(button);
          return range.getBoundingClientRect().height > lineHeight * 1.5;
        })
        .map((button) => button.textContent?.trim())
        .filter(Boolean);
      return {
        label: toolLabel,
        surface: {
          left: Math.round(surfaceRect.left),
          right: Math.round(surfaceRect.right),
        },
        toolActions,
        escapedControls,
        wrappedSegmentLabels,
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
      };
    }, label);

    if (
      panelState.missing ||
      panelState.surface?.left < -1 ||
      panelState.surface?.right > viewport.width + 1 ||
      panelState.toolActions?.some(
        (action) =>
          action.missing ||
          !action.pinnedAboveControls ||
          action.insideScroller ||
          action.left < viewport.width / 2 ||
          action.right > viewport.width + 1,
      ) ||
      panelState.escapedControls?.length > 0 ||
      panelState.wrappedSegmentLabels?.length > 0
    ) {
      failures.push(`${viewport.name}/tool-${label}: ${JSON.stringify(panelState)}`);
    }

    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await page.screenshot({
      path: `/tmp/cloakimg-${viewport.name}-tool-${slug}-top.png`,
      fullPage: false,
    });

    if (panelState.scrollHeight > panelState.clientHeight + 8) {
      await page.evaluate(() => {
        const scroller = document.querySelector(".editor-mobile-surface .scroll-thin");
        scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "instant" });
      });
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
      await page.screenshot({
        path: `/tmp/cloakimg-${viewport.name}-tool-${slug}-bottom.png`,
        fullPage: false,
      });
    }

    await page.evaluate(() => {
      Array.from(document.querySelectorAll(".editor-mobile-surface button"))
        .find((button) => button.getAttribute("aria-label") === "Cancel")
        ?.click();
    });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("button"))
        .find((button) => button.getAttribute("aria-label") === "Open tools")
        ?.click();
    });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
  }
}

async function inspectScrolledPickerTransition(page, viewport) {
  const state = await page.evaluate(() => {
    const surface = document.querySelector(".editor-mobile-surface");
    const scroller = surface?.querySelector(".scroll-thin");
    if (!scroller) return { missing: true };
    scroller.scrollTop = scroller.scrollHeight;
    const resize = Array.from(surface.querySelectorAll("button[aria-pressed]")).find(
      (button) => button.getAttribute("aria-label") === "Resize",
    );
    resize?.click();
    return { missing: !resize };
  });
  if (state.missing) {
    failures.push(`${viewport.name}/picker-transition: Resize tool missing`);
    return;
  }

  await page.waitForFunction(() => !document.querySelector("[data-tool-panel-loading]"), {
    timeout: 5000,
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 80));
  const scrollTop = await page.evaluate(
    () => document.querySelector(".editor-mobile-surface .scroll-thin")?.scrollTop ?? -1,
  );
  if (scrollTop > 1 || scrollTop < 0) {
    failures.push(
      `${viewport.name}/picker-transition: tool controls opened at scrollTop ${scrollTop}`,
    );
  }
  await page.screenshot({
    path: `/tmp/cloakimg-${viewport.name}-picker-to-resize.png`,
    fullPage: false,
  });

  await page.evaluate(() => {
    Array.from(document.querySelectorAll(".editor-mobile-surface button"))
      .find((button) => button.getAttribute("aria-label") === "Cancel")
      ?.click();
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.getAttribute("aria-label") === "Open tools")
      ?.click();
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 180));
}

for (const viewport of viewports) {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    isMobile: viewport.touch,
    hasTouch: viewport.touch,
    deviceScaleFactor: 1,
  });
  await page.emulateTimezone("Asia/Kolkata");
  await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
  await inspectLayout(page, viewport, "landing");
  await inspectFooter(page, viewport);
  await page.screenshot({
    path: `/tmp/cloakimg-${viewport.name}-landing.png`,
    fullPage: false,
  });

  const openEditor = await page.waitForSelector("button", { timeout: 10000 });
  void openEditor;
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.trim().startsWith("Open editor"))
      ?.click();
  });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await inspectLayout(page, viewport, "start-dialog");

  const inputs = await page.$$('input[type="file"]');
  const modalInput = inputs.at(-1);
  if (!modalInput) throw new Error(`${viewport.name}: modal file input missing`);
  await modalInput.uploadFile(testImage);
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("button")).some((button) =>
        /open\s+in\s+editor/i.test(button.textContent ?? ""),
      ),
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("button"))
      .find((button) => /open\s+in\s+editor/i.test(button.textContent ?? ""))
      ?.click();
  });
  await page.waitForSelector(".editor-topbar", { timeout: 15000 });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1200));
  await inspectLayout(page, viewport, "editor");
  await page.screenshot({
    path: `/tmp/cloakimg-${viewport.name}-editor.png`,
    fullPage: false,
  });

  await inspectIdPhotoDropdowns(page, viewport);
  await inspectBatchDropdown(page, viewport);

  if (viewport.width <= 600) {
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("button"))
        .find((button) => button.getAttribute("aria-label") === "Open tools")
        ?.click();
    });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
    await inspectLayout(page, viewport, "tool-picker");
    await inspectMobileToolPicker(page, viewport);
    await page.screenshot({
      path: `/tmp/cloakimg-${viewport.name}-tool-picker.png`,
      fullPage: false,
    });
    if (viewport.name === "android-narrow") {
      await inspectMobileToolSearch(page, viewport);
      await inspectScrolledPickerTransition(page, viewport);
      await auditMobileToolPanels(page, viewport);
    }
  }

  if (errors.length > 0) failures.push(`${viewport.name}/console: ${errors.join(" | ")}`);
  await page.close();
}

await browser.close();

if (failures.length > 0) {
  console.error(`Responsive audit failed:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log(`Responsive audit passed at ${viewports.length} viewports.`);
process.exit(0);
