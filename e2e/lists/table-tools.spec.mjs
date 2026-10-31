// Sheets-style Table tools: column menus with hover, pressed and focus states and
// keyboard navigation, focus restored after sorting, grouping and hiding, grouping with
// collapse/expand and Reset grouping, natural and multi-column sorting, column filters
// that run before pagination, typed number/date filters, cell editing, remembered
// preferences without a named-view control, touch menus, and both themes.
// Desktop tests belong to the cross-browser release gate.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { DEFAULT_SCHEMA } from "../../server/model.js";
import { selectProjectView } from "../helpers/menu-controls.mjs";

const gate = { tag: "@gate" };
const app = useApp(async (store) => {
  const project = await store.createProject({
    title: "Sheets-style table",
    schema: { ...DEFAULT_SCHEMA, fields: [{ id: "points", name: "Points", type: "number" }, { id: "team", name: "Team", type: "select", options: ["Design", "Build"] }] },
  });
  const seeded = [];
  for (let i = 0; i < 110; i++)
    seeded.push(await store.createTask(project.id, {
      title: i === 104 ? "Needle after page one" : `Task ${i}`,
      assignee: i === 104 || i % 3 === 0 ? "Alice" : i % 3 === 1 ? "Bob" : "",
      priority: i % 2 ? "low" : "high",
      status: i % 2 ? "todo" : "done",
      due: i % 3 === 2 ? null : "2026-10-20",
      fields: { points: i, team: i % 2 ? "Design" : "Build" },
    }));
  return { project, seeded };
});

const rows = (page) => page.locator("[data-table-task]");
const firstTitle = (page) => rows(page).first().locator('[data-task-field="title"]');
const snap = () => app.store.snapshot(app.project.id);
const columnMenu = (page, key) => page.locator(`.spreadsheet th[data-column-key="${key}"] .table-header-menu`);
const action = (page, key, name) => columnMenu(page, key).locator(`[data-table-column-action="${name}"]`);
const background = (locator) => locator.evaluate((node) => getComputedStyle(node).backgroundColor);
const groupBy = (page) => page.getByLabel("Group table by", { exact: true });
const thenBy = (page) => page.getByLabel("Then group by", { exact: true });
const resetGrouping = (page) => page.getByRole("button", { name: "Reset grouping", exact: true });
const columnWidths = (page) => page.locator("th[data-column-key]").evaluateAll((els) => els.map((el) => [el.dataset.columnKey, el.getBoundingClientRect().width]));

async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await rows(page).first().waitFor();
}
async function menu(page, key) {
  await page.waitForFunction(() => innerWidth > 600 || document.querySelector(".mobile-view-options .table-view-tools"));
  const m = page.locator(`[data-board-menu="table-${key}"]`);
  const options = m.locator('xpath=ancestor::details[contains(@class,"mobile-view-options")]');
  if ((await options.count()) && !(await options.evaluate((el) => el.open))) await options.locator(":scope > summary").click();
  if (!(await m.evaluate((el) => el.open))) await m.locator(":scope > summary").click();
  return m;
}
async function addFilter(page, field) {
  await menu(page, "filters");
  await page.getByLabel("Add column filter", { exact: true }).selectOption(field);
}
async function chooseValue(page, name, value) {
  await menu(page, "filters");
  await page.locator(".table-filter-rule").filter({ has: page.locator("legend", { hasText: name }) }).locator(`input[type=checkbox][value="${value}"]`).check();
}
const reset = (page) => page.locator('[data-table-action="reset"]').click();
async function groupByAssigneeThen(page, second) {
  await menu(page, "groups");
  await groupBy(page).selectOption("assignee");
  await thenBy(page).selectOption(second);
}

test.describe("desktop", () => {
  test.use({ viewportSize: { width: 1500, height: 1000 } });

  test("column menus show hover, pressed and focus states, navigate by keyboard and restore focus after sorting and grouping", gate, async ({ page }) => {
    await open(page);
    await expect(rows(page)).toHaveCount(100);
    await expect(page.locator(".pagination")).toHaveText(/Page 1 of 2/);
    // Column actions share real feedback and keep keyboard focus across redraws.
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
      const trigger = columnMenu(page, "title").locator("summary");
      await trigger.click();
      await page.mouse.move(2, 2);
      const ascending = action(page, "title", "asc");
      const resting = await background(ascending);
      await ascending.hover();
      await expect.poll(() => background(ascending), `${theme}: row hover is visible`).not.toBe(resting);
      const hover = await background(ascending);
      await page.mouse.down();
      await expect.poll(() => background(ascending), `${theme}: pressed state is distinct`).not.toBe(hover);
      await page.mouse.move(2, 2);
      await page.mouse.up();
      if (!(await columnMenu(page, "title").evaluate((el) => el.open))) await trigger.click();
      await trigger.focus();
      await page.keyboard.press("ArrowDown");
      await expect(ascending).toBeFocused();
      await expect(ascending).toHaveCSS("outline-style", "solid");
      await page.keyboard.press("ArrowDown");
      await expect(action(page, "title", "desc")).toBeFocused();
      await page.keyboard.press("End");
      await expect(action(page, "title", "hide")).toBeFocused();
      await page.keyboard.press("Home");
      await expect(ascending).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(action(page, "title", "hide")).toBeFocused();
      await page.keyboard.press("Tab");
      await page.waitForFunction(() => !document.querySelector('th[data-column-key="title"] .table-header-menu').open);
      await trigger.click();
      const panel = await columnMenu(page, "title").locator(".board-menu-panel").boundingBox();
      expect(panel.width <= 241 && panel.x >= 0, JSON.stringify(panel)).toBe(true);
      // Clicking the far edge of a row activates the same action as its label.
      const b = await ascending.boundingBox();
      await page.mouse.click(b.x + b.width - 8, b.y + b.height / 2);
      await expect(page.locator('th[data-column-key="title"]')).toHaveAttribute("aria-sort", "ascending");
      await expect(trigger, "Sorting restores focus to the rebuilt trigger").toBeFocused();
      await trigger.click();
      await expect(ascending).toHaveAttribute("data-applied", "true");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(page.locator('th[data-column-key="title"]')).toHaveAttribute("aria-sort", "descending");
      await expect(trigger, "Keyboard activation restores focus").toBeFocused();
      await trigger.click();
      await action(page, "title", "group").click();
      await expect(page.locator(".table-group-row").first()).toBeAttached();
      await expect(trigger).toBeFocused();
      await reset(page);
    }
  });

  test("hiding a column focuses a remaining header, and a column's Filter action focuses its own field", gate, async ({ page }) => {
    await open(page);
    await columnMenu(page, "priority").locator("summary").click();
    await action(page, "priority", "hide").click();
    await expect(columnMenu(page, "priority")).toHaveCount(0);
    await expect.poll(() => page.locator(".table-header-menu > summary").evaluateAll((els) => els.includes(document.activeElement)), "Hiding a column focuses a remaining header").toBe(true);
    await page.locator('[data-board-menu="table-columns"] > summary').click();
    await page.locator('[data-column-visible="priority"]').check();
    await page.locator('[data-feature="columns-close"]').click();
    await addFilter(page, "assignee");
    await page.keyboard.press("Escape");
    await columnMenu(page, "priority").locator("summary").click();
    await action(page, "priority", "filter").click();
    await expect.poll(() => page.locator('[data-table-filter="1"]').evaluateAll((els) => els.includes(document.activeElement)), "Filter action focuses its own field, not an earlier filter").toBe(true);
    await reset(page);
  });

  test("groups collapse and expand, and a collapsed group's selected tasks leave bulk actions", gate, async ({ page }) => {
    await open(page);
    await groupByAssigneeThen(page, "status");
    expect(await page.locator(".table-group-row").count()).toBeGreaterThanOrEqual(6);
    await page.locator('[data-table-action="collapse"]').click();
    await expect(rows(page)).toHaveCount(0);
    await menu(page, "groups");
    await page.locator('[data-table-action="expand"]').click();
    await expect(rows(page)).toHaveCount(100);
    await page.locator('[data-board-menu="table-groups"] > summary').click();
    // Collapsing a group clears the selected rows, so a later bulk action can't reach hidden tasks.
    await page.locator('td[data-cell="0,0"]').click();
    await page.locator('td[data-cell="2,0"]').click({ modifiers: ["Shift"] });
    await expect(page.locator('#bulk-scope option[value="selected"]')).toHaveText("Selected rows (3)");
    await page.locator('[data-table-action="group-toggle"]').first().click();
    await expect(page.locator('#bulk-scope option[value="selected"]')).toHaveJSProperty("disabled", true);
  });

  test("Reset grouping clears only grouping, keeps filters, sort and widths, and persists after reload", gate, async ({ page }) => {
    await open(page);
    await groupByAssigneeThen(page, "status");
    await columnMenu(page, "title").locator("summary").click();
    await action(page, "title", "desc").click();
    await addFilter(page, "assignee");
    await chooseValue(page, "Assignee", "Bob");
    const columnsBeforeReset = await columnWidths(page);
    await menu(page, "groups");
    await page.locator('[data-table-action="collapse"]').click();
    await expect(rows(page)).toHaveCount(0);
    await menu(page, "groups");
    await resetGrouping(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".table-group-row")).toHaveCount(0);
    await expect(rows(page), "Assignee filter is preserved").toHaveCount(37);
    await expect(firstTitle(page), "Descending title sort is preserved").toHaveValue("Task 109");
    await expect(groupBy(page)).toHaveValue("");
    await expect(thenBy(page)).toBeDisabled();
    await expect(resetGrouping(page)).toBeDisabled();
    await expect(groupBy(page), "Focus returns to the grouping field").toBeFocused();
    expect(await columnWidths(page)).toEqual(columnsBeforeReset);
    await page.reload();
    await rows(page).first().waitFor();
    await expect(page.locator(".table-group-row"), "Grouping reset persists after reload").toHaveCount(0);
    await expect(rows(page)).toHaveCount(37);
    await expect(page.locator('th[data-column-key="title"]')).toHaveAttribute("aria-sort", "descending");
  });

  test("titles sort naturally, Shift adds a second sort, and a third click clears sorting", gate, async ({ page }) => {
    await open(page);
    const sortBy = (name) => page.getByRole("button", { name: `Sort by ${name}`, exact: true });
    await sortBy("Title").click();
    await expect(firstTitle(page)).toHaveValue("Needle after page one");
    await sortBy("Priority").click({ modifiers: ["Shift"] });
    await expect(page.locator(".table-sort-indicator")).toHaveCount(2);
    await sortBy("Title").click();
    await expect(firstTitle(page)).toHaveValue("Task 109");
    await sortBy("Title").click();
    await expect(page.locator(".table-sort-indicator")).toHaveCount(0);
  });

  test("column filters run before pagination, combine values and are remembered without a named view", gate, async ({ page }) => {
    await open(page);
    const search = page.getByLabel("Search Assignee values", { exact: true });
    const titleFilter = page.getByLabel("Title filter text", { exact: true });
    // Filtering must run before pagination and combine columns without losing blank values.
    await columnMenu(page, "assignee").locator("summary").click();
    await action(page, "assignee", "filter").click();
    await search.fill("Ali");
    await chooseValue(page, "Assignee", "Alice");
    await expect(search).toHaveValue("Ali");
    await search.fill("");
    await expect(rows(page)).toHaveCount(38);
    await chooseValue(page, "Assignee", "Bob");
    await expect(rows(page)).toHaveCount(75);
    await addFilter(page, "title");
    await titleFilter.fill("Needle");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toHaveAttribute("data-table-task", app.seeded[104].id);
    await expect(columnMenu(page, "assignee").locator("summary")).toHaveAttribute("aria-label", /filter active/);
    await titleFilter.fill("No matches");
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator(".table-no-results")).toBeVisible();
    await titleFilter.fill("Needle");
    await expect(rows(page)).toHaveCount(1);
    // Remember personal preferences across reload without a named-view control.
    await page.reload();
    await rows(page).first().waitFor();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.locator('#saved-view,[data-feature="view-save"]')).toHaveCount(0);
  });

  test("number and date filters narrow rows, cells stay editable and table rules stay in Table", gate, async ({ page }) => {
    await open(page);
    // Typed custom filters and date/empty filters, from default table rules.
    await addFilter(page, "fields.points");
    await page.getByLabel("Points from", { exact: true }).fill("100");
    await expect(rows(page)).toHaveCount(10);
    await page.getByLabel("Points to", { exact: true }).fill("104");
    await expect(rows(page)).toHaveCount(5);
    await addFilter(page, "due");
    await page.getByLabel("Due date filter condition", { exact: true }).selectOption("empty");
    await expect(rows(page)).toHaveCount(2);
    // Preserve cell editing and other views; table rules stay scoped to Table.
    await page.getByRole("button", { name: "Remove Due date filter", exact: true }).click();
    await expect(rows(page)).toHaveCount(5);
    const edit = firstTitle(page);
    const id = await edit.getAttribute("data-id");
    await edit.fill("Edited in filtered table");
    await edit.press("Tab");
    await expect.poll(async () => (await snap()).tasks.find((t) => t.id === id).title).toBe("Edited in filtered table");
    await selectProjectView(page, "list");
    await expect(page.locator(".task-row")).toHaveCount(100);
    await expect(page.locator(".table-view-tools")).toHaveCount(0);
    await selectProjectView(page, "table");
    await expect(rows(page)).toHaveCount(5);
    const points = rows(page).first().locator('[data-task-field="fields.points"]');
    await points.fill("200");
    await points.press("Tab");
    await menu(page, "sorts");
    await expect(rows(page)).toHaveCount(4);
    // At phone width the filter menu stays inside the window, in dark mode.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    await menu(page, "filters");
    const panel = page.locator('[data-board-menu="table-filters"] .table-menu-panel');
    await expect.poll(async () => { const b = await panel.boundingBox(); return b.x >= 0 && b.x + b.width <= 391; }, "the filter menu fits a phone-width window").toBe(true);
  });
});

onDevices(["phone"], () => {
  test("on phones the column menu fits the screen with 44px actions, and Reset grouping fits the touch menu", async ({ page }) => {
    await open(page);
    const { width, height } = page.viewportSize();
    await columnMenu(page, "title").locator("summary").tap();
    const bounds = await columnMenu(page, "title").locator(".board-menu-panel").boundingBox();
    expect(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height, JSON.stringify(bounds)).toBe(true);
    expect((await action(page, "title", "desc").boundingBox()).height, "Touch action rows have a generous target").toBeGreaterThanOrEqual(44);
    await action(page, "title", "desc").tap();
    await expect(page.locator('th[data-column-key="title"]')).toHaveAttribute("aria-sort", "descending");
    expect(await columnMenu(page, "title").evaluate((el) => el.open)).toBe(false);
    await page.locator(".mobile-view-options > summary").tap();
    await page.locator('[data-board-menu="table-groups"] > summary').tap();
    await groupBy(page).selectOption("assignee");
    await thenBy(page).selectOption("priority");
    const resetBounds = await resetGrouping(page).boundingBox();
    expect(resetBounds.height >= 44 && resetBounds.x >= 0 && resetBounds.x + resetBounds.width <= width, `Grouping reset fits the touch menu ${JSON.stringify(resetBounds)}`).toBe(true);
    await resetGrouping(page).tap();
    await expect(page.locator(".table-group-row")).toHaveCount(0);
    await expect(page.locator('th[data-column-key="title"]')).toHaveAttribute("aria-sort", "descending");
    await expect(resetGrouping(page)).toBeDisabled();
  });
});
