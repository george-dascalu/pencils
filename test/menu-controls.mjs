// Open the containing disclosure through its visible, keyboard-accessible control.
export async function reveal(locator) {
  await locator.waitFor({ state: "attached" });
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

export async function openBoardSearch(page) {
  if (!(await page.locator("#canvas-find").isVisible()))
    await page.locator('[data-pro="search-toggle"]').click();
}
