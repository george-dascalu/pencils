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

// Phones use the same view tabs as a bottom bar (0.19.33), where tapping the open Documents
// tab lists documents instead, so an open tab is left alone.
export async function selectProjectView(page, view) {
  const taskLayout = ["list", "tree", "table", "kanban"].includes(view);
  const planningLayout = ["calendar", "timeline", "capacity"].includes(view);
  const tab = taskLayout ? "tasks" : planningLayout ? "planning" : view;
  const mobile = page.locator("#project-view-switcher");
  if (await mobile.isVisible()) await mobile.selectOption(tab);
  else {
    const button = page.locator(`.tabs [data-view="${tab}"]`);
    if ((await button.getAttribute("aria-current")) !== "page") await button.click();
  }
  if (taskLayout || planningLayout)
    await page.locator(`.view-layout-switcher [data-view="${view}"]`).click();
}

export async function openBoardSearch(page) {
  if (await page.locator("#canvas-find").isVisible()) return;
  const toggle = page.locator('[data-pro="search-toggle"]');
  // Phones (0.18.26) keep Search in the canvas tools panel behind "More canvas tools".
  if (!(await toggle.isVisible()) && (await page.locator(".phone-board-more").isVisible()))
    await page.locator(".phone-board-more").click();
  await toggle.click();
}

export async function selectSettingsPage(page, section) {
  const mobile = page.locator("#settings-section-select");
  if (await mobile.isVisible()) await mobile.selectOption(section);
  else await page.locator(`.settings-navigation [data-settings-section="${section}"]`).click();
  await page.locator(".settings-loading").waitFor({ state: "detached" });
}
// Like selectSettingsPage, but waits for whichever section control the layout shows (the
// select on phones, the sidebar link elsewhere), so a re-render at the moment of the check
// cannot send the click to the hidden one. Resolves once the section's page has loaded.
export async function showSettingsSection(page, section) {
  const control = page.locator(`#settings-section-select, .settings-navigation [data-settings-section="${section}"]`).filter({ visible: true }).first();
  await control.waitFor();
  if (await control.evaluate((el) => el.tagName === "SELECT")) await page.locator("#settings-section-select").selectOption(section);
  else await control.click();
  await page.waitForFunction((section) => location.hash.split("/")[3] === section && !location.hash.split("/")[4], section);
  await page.locator(".settings-loading").waitFor({ state: "detached" });
}

// The weekends control is a pressed-state button shared by Calendar and Timeline.
export async function setWeekends(page, on) {
  const toggle = page.locator("[data-timeline-weekends], [data-calendar-weekends]").first();
  await toggle.waitFor({ state: "attached" });
  if (((await toggle.getAttribute("aria-pressed")) === "true") !== on) await clickControl(toggle);
}
export async function weekendsShown(page) {
  return (await page.locator("[data-timeline-weekends], [data-calendar-weekends]").first().getAttribute("aria-pressed")) === "true";
}

// Destructive actions confirm through the shared anchored popover.
export async function acceptConfirm(page) {
  await page.locator(".confirm-popover [data-confirm-accept]").click();
  await page.locator(".confirm-popover").waitFor({ state: "detached" });
}
export async function cancelConfirm(page) {
  await page.locator(".confirm-popover [data-confirm-cancel]").click();
  await page.locator(".confirm-popover").waitFor({ state: "detached" });
}

// Since 0.19.31 one Settings button (the top bar's, or the phone drawer's settings row) opens
// the Settings page: the project's sections (General first), "You" ("personal", the former
// Personal settings) and Organisation. Pass a section to show it. Leave with
// `[data-action=settings-close]`, which returns to the view Settings was opened from.
export async function openSettingsPage(page, section) {
  if (await page.locator(".mobile-menu").isVisible()) {
    await page.locator(".mobile-menu").click();
    await page.locator(".phone-drawer-utilities").getByRole("button", { name: "Settings", exact: true }).click();
  } else await page.locator(".topbar [data-action=settings]").click();
  await page.locator(".settings-navigation h1").waitFor();
  if (section) await showSettingsSection(page, section);
}
