// Owner request, 30 October 2026: choosing the active sort again reverses it, and the Sort button
// and its menu show the direction (↑ or ↓), as Table's column headers do.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Sort direction", key: "SD" });
  for (const title of ["Beta card", "Alpha card", "Gamma card"]) await store.createTask(project.id, { title });
  return { project };
});

onDevices(["desktop", "phone"], () => test("choosing the active sort again reverses it", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const sort = page.locator("[data-sort-menu]"), menu = page.locator("#shared-select-menu"), rows = page.locator(".task-row");
  const choose = async (name) => {
    await sort.click();
    await menu.getByRole("option", { name }).click();
  };
  const arrow = () => sort.locator(".sort-direction .icon").evaluate((el) => el.innerHTML);
  await choose("Title A–Z");
  await expect(rows, device).toHaveText([/Alpha/, /Beta/, /Gamma/]);
  await expect(sort).toHaveAttribute("aria-label", "Sort: Title A–Z");
  const up = await arrow();
  await sort.click();
  await expect(menu.getByRole("option", { selected: true }), `${device}: the menu shows the direction`).toHaveText("Title A–Z ↑");
  await menu.getByRole("option", { selected: true }).click();
  await expect(rows, `${device}: reversed`).toHaveText([/Gamma/, /Beta/, /Alpha/]);
  await expect(sort).toHaveAttribute("aria-label", "Sort: Title A–Z, reversed");
  expect(await arrow(), `${device}: the button's arrow turns`).not.toBe(up);
  await sort.click();
  await expect(menu.getByRole("option", { selected: true })).toHaveText("Title A–Z ↓");
  await page.keyboard.press("Escape");
  // Another sort starts ascending; Manual order has no direction to reverse.
  await choose("Date created");
  await expect(sort).toHaveAttribute("aria-label", "Sort: Date created");
  expect(await arrow()).toBe(up);
  await sort.click();
  await expect(menu.getByRole("option", { name: /^Title A–Z/ }), `${device}: the old sort loses its arrow`).toHaveText("Title A–Z");
  await expect(menu.getByRole("option", { selected: true })).toHaveText("Date created ↑");
  await page.keyboard.press("Escape");
  await choose("Manual order");
  await choose("Manual order");
  await expect(sort).toHaveAttribute("aria-label", "Sort: Manual order");
  await sort.click();
  await expect(menu.getByRole("option", { selected: true })).toHaveText("Manual order");
  await page.keyboard.press("Escape");
}));

test("the keyboard reverses the sort and keeps focus on Sort", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const sort = page.locator("[data-sort-menu]");
  await sort.click();
  await page.locator("#shared-select-menu").getByRole("option", { name: "Title A–Z" }).click();
  await expect(sort).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#shared-select-menu").getByRole("option", { selected: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".task-row")).toHaveText([/Gamma/, /Beta/, /Alpha/]);
  await expect(page.locator("[data-sort-menu]")).toBeFocused();
});
