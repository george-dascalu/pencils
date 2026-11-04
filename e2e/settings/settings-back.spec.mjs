// Owner request (F0.21-84, 3 November 2026): the Settings page has a back button in the top bar
// that returns to the page you had open; it is the page's only way back.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Back lab" });
  return { project, board: (await store.snapshot(project.id)).boards[0] };
});

onDevices(["desktop", "ipad", "phone"], () => test("Settings' back button sits in the top bar and returns to the board or Home", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator("#canvas").waitFor();
  await openSettingsPage(page);
  const back = page.locator('[data-action="settings-close"]');
  await expect(back, "one way back").toHaveCount(1);
  await expect(back).toBeVisible();
  const [bar, menu, button] = await Promise.all([page.locator(".main > .topbar"), page.locator(".topbar .mobile-menu"), back].map((l) => l.boundingBox()));
  expect(button.y + button.height / 2, "in the top bar's row").toBeLessThanOrEqual(bar.y + Math.max(bar.height, menu.height + 8));
  expect(Math.abs(button.y + button.height / 2 - (menu.y + menu.height / 2)), "level with the menu button").toBeLessThan(4);
  expect(button.x, "after the menu button").toBeGreaterThanOrEqual(menu.x + menu.width);
  await expect(back).toHaveAccessibleName("Back to project");
  if (device === "phone") expect(await back.evaluate((el) => getComputedStyle(el).borderRadius), "round, like the menu button").toBe("50%");
  await back.click();
  await expect(page).toHaveURL(new RegExp(`/board/${app.board.id}$`));
  await page.locator("#canvas").waitFor();
  // Without a project open, Settings returns Home.
  await page.goto(app.base);
  await page.locator(".home-grid").waitFor();
  await openSettingsPage(page);
  await expect(back).toHaveAccessibleName("Back");
  await back.click();
  await page.locator(".home-grid").waitFor();
}));
