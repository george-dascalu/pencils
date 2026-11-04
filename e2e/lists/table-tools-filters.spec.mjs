// Table tools, grouping and filters (split from table-tools.spec.mjs, F0.22-6): grouping with
// collapse/expand and Reset grouping, column filters that run before pagination, typed
// number/date filters, cell editing and remembered preferences without a named-view control.
// Desktop tests belong to the cross-browser release gate.
import { test, expect, useApp } from "../fixtures.mjs";
import { selectProjectView } from "../helpers/menu-controls.mjs";
import { seedTable, tableHelpers } from "./table-tools-setup.mjs";

const gate = { tag: "@gate" };
const app = useApp(seedTable);
const { rows, firstTitle, snap, columnMenu, action, groupBy, thenBy, resetGrouping, columnWidths, open, menu, addFilter, chooseValue, groupByAssigneeThen } = tableHelpers(app);

test.describe("desktop", () => {
  test.use({ viewportSize: { width: 1500, height: 1000 } });

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
    await page.locator('tr[data-table-task] td[data-column-key="key"]').nth(0).click();
    await page.locator('tr[data-table-task] td[data-column-key="key"]').nth(2).click({ modifiers: ["Shift"] });
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
