// Owner request, 31 October 2026: the app is as compact as Obsidian. On desktop and iPad a
// setting with a one-line control is one row (name on the left, control on the right, a divider
// between rows, a hint below its row); text areas keep the full width, and phones stack the name
// above the control. Menus of rows use 4px padding with their rows edge to edge; popovers that
// hold text or fields keep 8px.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Density", key: "DN" });
  await store.createTask(project.id, { title: "A card" });
  return { project };
});
const open = async (page, view = "list") => {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await page.locator(".task-row").first().waitFor();
};
// A General setting's control, by its form name.
const geometry = (page, name) => page.locator(`#settings-panel [name="${name}"]`).evaluate((control) => {
  const row = control.closest(".field");
  return { row: row.getBoundingClientRect().toJSON(), control: control.getBoundingClientRect().toJSON(), divider: getComputedStyle(row).borderBottomWidth, body: control.closest(".dialog-body").getBoundingClientRect().toJSON() };
});

onDevices(["desktop", "ipad"], () => test("a setting with a one-line control is one row: name left, control right, divided", async ({ page }) => {
  await open(page);
  await openSettingsPage(page, "general");
  for (const name of ["title", "key", "default_view"]) {
    const g = await geometry(page, name);
    expect(g.control.x, `${name}: the control sits on the right`).toBeGreaterThan(g.body.x + g.body.width / 2);
    expect(g.row.height, `${name}: one row`).toBeLessThanOrEqual(g.control.height + 20);
    // The key's divider sits below its hint (checked next).
    if (name !== "key") expect(g.divider, `${name}: rows are divided`).toBe("1px");
  }
  const description = await geometry(page, "body");
  expect(description.control.width, "text areas keep the full width").toBeGreaterThan(description.body.width * 0.8);
  // The key's hint belongs to its row: the divider moves below the hint.
  const hint = page.locator("#settings-panel .dialog-body > .field-hint").first();
  await expect(hint).toContainText("Task IDs look like");
  await expect(page.locator('#settings-panel .field:has(> [name="key"])')).toHaveCSS("border-bottom-width", "0px");
  await expect(hint).toHaveCSS("border-bottom-width", "1px");
  // Fields without a one-line control, such as Task types, keep their stacked layout.
  await openSettingsPage(page, "hierarchy");
  const types = await page.locator("#settings-panel .type-list-field").evaluate((field) => ({ field: field.getBoundingClientRect().toJSON(), label: field.querySelector("#type-list-label").getBoundingClientRect().toJSON(), chips: field.querySelector(".type-chips").getBoundingClientRect().toJSON() }));
  expect(types.chips.y, "the type chips sit below their label").toBeGreaterThanOrEqual(types.label.y + types.label.height);
  expect(Math.abs(types.chips.x - types.field.x), "and start at the field's edge").toBeLessThan(2);
}));

onDevices(["phone"], () => test("phones stack a setting's name above its control", async ({ page }) => {
  await open(page);
  await openSettingsPage(page, "general");
  const g = await geometry(page, "title");
  const name = await page.locator('#settings-panel .field:has(> [name="title"])').evaluate((row) => {
    const range = document.createRange();
    range.selectNodeContents(row.firstChild);
    return range.getBoundingClientRect().toJSON();
  });
  expect(name.width, "the name shows").toBeGreaterThan(0);
  await expect(page.locator('#settings-panel .field:has(> [name="title"])'), "at the same size as on wider screens").toHaveCSS("font-size", "13px");
  expect(name.y + name.height, "the name sits above its control").toBeLessThanOrEqual(g.control.y);
  expect(Math.abs(g.control.x - g.row.x), "the control starts at the row's edge").toBeLessThan(2);
  expect(g.control.width, "and is as wide as the form").toBeGreaterThan(g.body.width * 0.8);
}));

test("menus of rows use 4px padding with rows edge to edge; popovers with fields keep 8px", async ({ page }) => {
  await open(page);
  await page.locator(".topbar [data-new-menu]:not(.phone-new-task) > summary").click();
  const panel = page.locator(".topbar [data-new-menu]:not(.phone-new-task) .board-menu-panel");
  await panel.waitFor();
  expect(await panel.evaluate((el) => {
    const style = getComputedStyle(el), panel = el.getBoundingClientRect(), row = el.querySelector(":scope > button").getBoundingClientRect();
    return { padding: style.padding, gap: style.rowGap, inset: row.left - panel.left - el.clientLeft };
  })).toEqual({ padding: "4px", gap: "0px", inset: 4 });
  await page.keyboard.press("Escape");
  await page.locator("[data-sort-menu]").click();
  await expect(page.locator("#shared-select-menu")).toHaveCSS("padding", "4px");
  await page.keyboard.press("Escape");
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await page.locator('[data-board-menu="table-columns"] > summary').click();
  await expect(page.locator('[data-board-menu="table-columns"] .board-menu-panel'), "the Columns panel holds text and keeps its inset").toHaveCSS("padding", "8px");
});
