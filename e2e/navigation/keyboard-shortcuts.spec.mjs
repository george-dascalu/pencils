// App-wide keyboard shortcuts work wherever focus is. Found while converting the UI assessment
// (29 October 2026): with focus on a header menu button, such as New after closing a new card,
// Ctrl+K did nothing because the menu's key handler stopped every key but Escape.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Shortcuts", key: "SH" }) }));

test("Ctrl+K opens search and commands while a header menu button has focus", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const menu = page.locator(".topbar .new-menu > summary:visible").first();
  await menu.focus();
  await expect(menu).toBeFocused();
  await page.keyboard.press("Control+k");
  await expect(page.locator("#global-search-input")).toBeVisible();
});

test("plain keys on a header menu button still work the menu", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const menu = page.locator(".topbar .new-menu > summary:visible").first();
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('.topbar .new-menu-panel:visible [data-action="task-new"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
});
