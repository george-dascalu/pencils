// Owner request, 30 October 2026: Table has no checkboxes. Rows for a bulk change are picked as in
// a spreadsheet, by dragging or Shift-clicking across cells, and Bulk edit applies to them, to the
// visible rows or to every matching task. Phones, without a range, reach it for the visible or
// matching rows.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Table bulk", key: "TK" });
  const tasks = [];
  for (const title of ["One", "Two", "Three", "Four"]) tasks.push(await store.createTask(project.id, { title, status: "todo" }));
  return { project, tasks };
});
// The row actions column holds its drag handle and open button, without room left for a checkbox.
async function fitsRowActions(page) {
  const { cell, content } = await page.locator(".task-row-controls").first().evaluate((td) => {
    const style = getComputedStyle(td), actions = [...td.querySelectorAll(".task-row-actions > *")].filter((el) => el.getClientRects().length);
    const width = actions.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + (actions.length - 1) * parseFloat(getComputedStyle(td.firstElementChild).columnGap);
    return { cell: td.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), content: width };
  });
  expect(content, "the actions fit").toBeLessThanOrEqual(cell + 0.5);
  expect(cell - content, "no empty room").toBeLessThanOrEqual(12);
}
const statuses = async () => (await app.store.snapshot(app.project.id)).tasks.map((t) => [t.title, t.status]).sort();
const reset = async () => {
  for (const t of (await app.store.snapshot(app.project.id)).tasks) if (t.status !== "todo") await app.store.updateTask(app.project.id, t.id, { revision: t.revision, status: "todo" });
};

test("dragging across rows picks them for Bulk edit, and Shift-click extends", async ({ page }) => {
  await reset();
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  const id = (i) => page.locator(`td[data-cell="${i},0"]`);
  await expect(id(3)).toBeVisible();
  await expect(page.locator('.spreadsheet input[type="checkbox"]'), "no checkboxes").toHaveCount(0);
  await fitsRowActions(page);
  const [from, to] = [await id(0).boundingBox(), await id(2).boundingBox()];
  await page.mouse.move(from.x + 10, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator("td.range-selected")).toHaveCount(3);
  await page.locator('[data-board-menu="table-bulk"] > summary').click();
  const scope = page.locator("#bulk-scope");
  await expect(scope).toBeVisible();
  await expect(scope).toHaveValue("selected");
  await expect(scope.locator('option[value="selected"]')).toHaveText("Selected rows (3)");
  await page.locator("#bulk-status").selectOption("done");
  await page.getByRole("button", { name: "Change status" }).click();
  await expect.poll(statuses).toEqual([["Four", "todo"], ["One", "done"], ["Three", "done"], ["Two", "done"]]);
  await expect(page.locator("td.range-selected"), "the table repaints").toHaveCount(0);
  // Shift-click picks a range too; one row alone isn't a selection.
  await id(1).click();
  await page.locator('[data-board-menu="table-bulk"] > summary').click();
  await expect(scope.locator('option[value="selected"]')).toHaveJSProperty("disabled", true);
  await expect(scope).not.toHaveValue("selected");
  await page.keyboard.press("Escape");
  await id(1).click();
  await id(3).click({ modifiers: ["Shift"] });
  await page.locator('[data-board-menu="table-bulk"] > summary').click();
  await expect(scope).toBeVisible();
  await expect(scope.locator('option[value="selected"]')).toHaveText("Selected rows (3)");
});

onDevices(["phone"], () => test("phones reach Bulk edit for the visible or matching rows", async ({ page }) => {
  await reset();
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await expect(page.locator(`td[data-cell="3,0"]`)).toBeAttached();
  await expect(page.locator('.spreadsheet input[type="checkbox"]')).toHaveCount(0);
  await fitsRowActions(page);
  await page.locator(".mobile-view-options > summary").click();
  await page.locator('[data-board-menu="table-bulk"] > summary').click();
  await expect(page.locator("#bulk-scope")).toHaveValue("page");
  await page.locator("#bulk-status").selectOption("done");
  await page.getByRole("button", { name: "Change status" }).click();
  await expect.poll(statuses).toEqual([["Four", "done"], ["One", "done"], ["Three", "done"], ["Two", "done"]]);
}));

test("Shift+arrows and paste follow a dragged range, and Shift+Tab only moves back", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  const cell = (r, key) => page.locator(`tr[data-table-task] td[data-column-key="${key}"]`).nth(r);
  const drag = async (a, b) => {
    await a.scrollIntoViewIfNeeded();
    const [from, to] = [await a.boundingBox(), await b.boundingBox()];
    await page.mouse.move(from.x + 10, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 6 });
    await page.mouse.up();
  };
  await drag(cell(0, "key"), cell(1, "key"));
  await page.keyboard.press("Shift+ArrowDown");
  await expect(page.locator("td.range-selected"), "the range grows from its far end").toHaveCount(3);
  await cell(1, "key").click();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("td.range-selected"), "Shift+Tab moves, it doesn't select").toHaveCount(1);
  // A downward drag pastes from its top row.
  await drag(cell(0, "estimate"), cell(2, "estimate"));
  await page.evaluate(() => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "1\n2\n3" } });
    document.activeElement.dispatchEvent(event);
  });
  await page.locator("#paste-apply").click();
  await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.map((t) => [t.title, t.estimate ?? null]).sort()).toEqual([["Four", null], ["One", 1], ["Three", 3], ["Two", 2]]);
});
