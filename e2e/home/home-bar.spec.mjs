// Owner requests (F0.21-79, 3 November 2026): Home keeps the project bar (the bottom bar on touch
// screens), which opens the last project chosen, or the first when none was; the sidebar always has
// a project chosen; phones show a Homepage (or Home) title in the middle of Home's row with Edit on
// the right; and the floating menu button's shadow is not cut off on Home or Settings.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSidebar } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const alpha = await store.createProject({ title: "Alpha", key: "AL" });
  const beta = await store.createProject({ title: "Beta", key: "BE" });
  return { alpha, beta };
});
const bar = (page) => page.locator(".topbar .tabs");

onDevices(["desktop", "ipad", "phone"], () => test("Home shows the project bar for the last project chosen, the first when none was", async ({ page, device }) => {
  await page.goto(app.base);
  await page.locator(".home-grid").waitFor();
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator(".tab-home")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#project-select"), "a project is always chosen").toHaveValue(app.alpha.id);
  await expect(page.locator('#project-select option[value=""]')).toHaveCount(0);
  await bar(page).locator('[data-view="overview"]').click();
  await expect(page).toHaveURL(new RegExp(`#project/${app.alpha.id}/overview$`));
  await expect(bar(page).locator('[data-view="overview"]')).toHaveAttribute("aria-current", "page");
  // One step of the history: Back returns Home.
  await page.goBack();
  await page.locator(".home-grid").waitFor();
  // Choosing the project the dropdown shows opens it.
  await openSidebar(page);
  await page.locator("#project-select").click();
  await page.locator(".sidebar-select-menu").getByRole("option", { name: "Alpha", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#project/${app.alpha.id}/`));
  // Choose another project, then go Home: the bar and the sidebar follow it.
  await openSidebar(page);
  await page.locator("#project-select").selectOption(app.beta.id);
  await expect(page).toHaveURL(new RegExp(`#project/${app.beta.id}/`));
  // Desktop's bar has no Home tab (the brand and the sidebar's Home row go there).
  if (device === "desktop") { await openSidebar(page); await page.locator(".sidebar .personal-links button").first().click(); }
  else await bar(page).locator(".tab-home").click();
  await page.locator(".home-grid").waitFor();
  await expect(page.locator("#project-select")).toHaveValue(app.beta.id);
  await bar(page).locator('[data-view="documents"]').click();
  await expect(page).toHaveURL(new RegExp(`#project/${app.beta.id}/documents`));
  // The personal space is not in the dropdown, which keeps showing the last project.
  await openSidebar(page);
  await page.locator('.sidebar [data-action="personal-open"]').click();
  await expect(page.locator("#project-select")).toHaveValue(app.beta.id);
}));

onDevices(["phone"], () => test("Home's row centres a Homepage title with Edit on the right, and the menu button's shadow is whole on Home and Settings", async ({ page }) => {
  await page.goto(app.base);
  await page.locator(".home-grid").waitFor();
  const width = page.viewportSize().width;
  const title = page.locator("#view-toolbar .home-title");
  await expect(title).toBeVisible();
  await expect(title).toHaveText("Homepage", { useInnerText: true });
  const [t, edit, menu] = await Promise.all([title, page.locator("#home-edit"), page.locator(".mobile-menu")].map((l) => l.boundingBox()));
  expect(Math.abs(t.x + t.width / 2 - width / 2), "the title is in the middle").toBeLessThan(4);
  expect(Math.abs(t.y + t.height / 2 - (menu.y + menu.height / 2)), "in the menu button's row").toBeLessThan(4);
  expect(edit.x, "Edit is on the right").toBeGreaterThan(t.x + t.width);
  expect(Math.abs(edit.x + edit.width - (width - 8)), "at the right edge, where New sits in a project").toBeLessThan(2);
  await expect(page.locator(".topbar .breadcrumb"), "nothing clips the menu button's shadow").toHaveCSS("overflow", "visible");
  // Editing adds Add panel on the left; short of room, the title shortens to Home, and it always fits.
  await page.setViewportSize({ width: 320, height: 700 });
  await page.locator("#home-edit").click();
  await expect(page.locator(".home")).toHaveAttribute("data-editing", "");
  const whole = () => title.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(await whole(), "the title is never cut short").toBe(true);
  await expect(title).toHaveText("Homepage", { useInnerText: true });
  // Narrower still, the title shortens to Home.
  await page.setViewportSize({ width: 290, height: 700 });
  await expect(title).toHaveText("Home", { useInnerText: true });
  expect(await whole()).toBe(true);
  const [add, short, editing] = await Promise.all([page.locator('[data-board-menu="home-add"] > summary'), title, page.locator("#home-edit")].map((l) => l.boundingBox()));
  expect(short.x, "the title clears Add panel").toBeGreaterThanOrEqual(add.x + add.width);
  expect(short.x + short.width, "and Edit").toBeLessThanOrEqual(editing.x);
  await page.locator("#home-edit").click();
  await openSidebar(page);
  await page.locator('.sidebar [data-action="settings"]').click();
  await page.locator(".settings-page, #view-content").first().waitFor();
  await expect(page.locator(".topbar .breadcrumb"), "Settings keeps the shadow whole too").toHaveCSS("overflow", "visible");
}));
