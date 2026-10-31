// Exercise the real navigation on each layout; never use debug hooks to select tools.
export async function selectEditorTool(page, name) {
  const rail = page.locator(".editor-toolrail");
  if (await rail.count()) {
    await rail.getByRole("button", { name, exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Open tools", exact: true }).click();
    await page.getByRole("option", { name, exact: true }).click();
    await page.locator("#tool-search-title").waitFor({ state: "hidden" });
  }
  await page.waitForFunction(
    (name) =>
      document
        .querySelector(".editor-properties__heading h2, .editor-mobile-title")
        ?.textContent.trim() === name,
    name,
  );
  await page.locator("[data-tool-panel-loading]").waitFor({ state: "hidden" });
}
