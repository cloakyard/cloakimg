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
    () => {
      const labels = Array.from(document.querySelectorAll('[role="slider"]')).map((slider) => {
        const labelId = slider.getAttribute("aria-labelledby");
        return labelId
          ? document.getElementById(labelId)?.textContent?.trim()
          : slider.getAttribute("aria-label");
      });
      return (
        labels.includes("Framing") &&
        labels.includes("Horizontal position") &&
        labels.includes("Vertical position")
      );
    },
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

  // The portrait fixture starts with a crop that can move horizontally,
  // while its full image height leaves no vertical travel until zoomed.
  // Verify that unavailable state is honest, then zoom and drive both
  // axes independently through their keyboard contract.
  const framingState = () =>
    page.evaluate(() => {
      const sliderByName = (name) =>
        Array.from(document.querySelectorAll('[role="slider"]')).find((slider) => {
          const labelId = slider.getAttribute("aria-labelledby");
          const label = labelId
            ? document.getElementById(labelId)?.textContent
            : slider.getAttribute("aria-label");
          return label?.trim() === name;
        });
      const horizontal = sliderByName("Horizontal position");
      const vertical = sliderByName("Vertical position");
      const guides = Array.from(document.querySelectorAll('[data-id-photo-cut-guides="corner"]'));
      return {
        horizontalDisabled: horizontal?.getAttribute("aria-disabled") === "true",
        verticalDisabled: vertical?.getAttribute("aria-disabled") === "true",
        horizontalValue: Number(horizontal?.getAttribute("aria-valuenow")),
        verticalValue: Number(vertical?.getAttribute("aria-valuenow")),
        guideCount: guides.length,
        invalidGuideLineCount: guides.filter((guide) => guide.querySelectorAll("line").length !== 8)
          .length,
        outlinedSlots: guides.filter(
          (guide) => getComputedStyle(guide.parentElement).outlineStyle !== "none",
        ).length,
      };
    });
  const focusSlider = (name) =>
    page.evaluate((sliderName) => {
      const slider = Array.from(document.querySelectorAll('[role="slider"]')).find((candidate) => {
        const labelId = candidate.getAttribute("aria-labelledby");
        const label = labelId
          ? document.getElementById(labelId)?.textContent
          : candidate.getAttribute("aria-label");
        return label?.trim() === sliderName;
      });
      slider?.focus();
      return !!slider;
    }, name);

  const beforeFraming = await framingState();
  if (
    beforeFraming.horizontalDisabled ||
    !beforeFraming.verticalDisabled ||
    beforeFraming.guideCount === 0 ||
    beforeFraming.invalidGuideLineCount > 0 ||
    beforeFraming.outlinedSlots > 0
  ) {
    failures.push(`${viewport.name}/id-photo-framing-before: ${JSON.stringify(beforeFraming)}`);
  }

  await focusSlider("Framing");
  await page.keyboard.press("End");
  await page.waitForFunction(() => {
    const sliders = Array.from(document.querySelectorAll('[role="slider"]'));
    const named = (name) =>
      sliders.find((slider) => {
        const labelId = slider.getAttribute("aria-labelledby");
        return document.getElementById(labelId)?.textContent?.trim() === name;
      });
    return (
      named("Horizontal position")?.getAttribute("aria-disabled") !== "true" &&
      named("Vertical position")?.getAttribute("aria-disabled") !== "true"
    );
  });
  await focusSlider("Horizontal position");
  await page.keyboard.press("End");
  await focusSlider("Vertical position");
  await page.keyboard.press("Home");
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));

  const afterFraming = await framingState();
  if (
    afterFraming.horizontalDisabled ||
    afterFraming.verticalDisabled ||
    Math.abs(afterFraming.horizontalValue - 1) > 0.001 ||
    Math.abs(afterFraming.verticalValue) > 0.001
  ) {
    failures.push(`${viewport.name}/id-photo-framing-after: ${JSON.stringify(afterFraming)}`);
  }
  console.log(
    JSON.stringify({
      viewport: viewport.name,
      stage: "id-photo-framing",
      before: beforeFraming,
      after: afterFraming,
    }),
  );

  await page.select('select[aria-label="Photo standard"]', "india-visa");
  await page.waitForFunction(
    () => document.querySelector(".select-control__value")?.textContent?.trim() === "India · Visa",
    { timeout: 3000 },
  );
  await inspect("india-visa");

  await page.$eval('select[aria-label="Paper size"]', (select) => {
    select.closest(".select-control")?.scrollIntoView({ block: "center" });
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
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
