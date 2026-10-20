// Open the containing disclosure through its visible, keyboard-accessible control.
export async function reveal(locator) {
  await locator.waitFor({ state: "attached" });
  const options = locator.locator('xpath=ancestor::details[contains(@class,"mobile-view-options")]');
  if ((await options.count()) && !(await options.evaluate(el => el.open)))
    await options.locator(":scope > summary").click();
  const menu = locator.locator(
    'xpath=ancestor::details[contains(@class,"board-menu") or contains(@class,"selection-menu")]',
  );
  if ((await menu.count()) && !(await menu.evaluate((el) => el.open)))
    await menu.locator("summary").click();
  return locator;
}
export async function clickControl(locator) {
  await (await reveal(locator)).click();
}

export async function selectProjectView(page, view) {
  const taskLayout = ["list", "tree", "table", "kanban"].includes(view);
  const planningLayout = ["calendar", "timeline", "capacity"].includes(view);
  const tab = taskLayout ? "tasks" : planningLayout ? "planning" : view;
  const mobile = page.locator("#project-view-switcher");
  if (await mobile.isVisible()) await mobile.selectOption(tab);
  else await page.locator(`.tabs [data-view="${tab}"]`).click();
  if (taskLayout || planningLayout)
    await page.locator(`.view-layout-switcher [data-view="${view}"]`).click();
}

export async function openBoardSearch(page) {
  if (!(await page.locator("#canvas-find").isVisible()))
    await page.locator('[data-pro="search-toggle"]').click();
}

export async function selectSettingsPage(page, section) {
  const mobile = page.locator("#settings-section-select");
  if (await mobile.isVisible()) await mobile.selectOption(section);
  else await page.locator(`.settings-navigation [data-settings-section="${section}"]`).click();
  await page.locator(".settings-loading").waitFor({ state: "detached" });
}
