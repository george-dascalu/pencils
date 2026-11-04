// Owner requests (F0.21-92, 4 November 2026): in List, Tree, Table and Kanban, Sort looks like the
// Filters button and sits right after it; and Kanban cards leave out the field their swimlanes
// group by (by assignee, no assignee on the cards).
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Sort beside filters", key: "SB" });
  await store.createTask(project.id, { title: "One", assignee: "Pat", priority: "high" });
  await store.createTask(project.id, { title: "Two", assignee: "Sam", priority: "low", type: "bug" });
  return { project };
});
const open = async (page, view) => {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await expect(page.locator(".main")).toHaveAttribute("data-layout-view", view);
  await page.locator(`#view-content :is(.task-row, .kanban-card, tr[data-table-task])`).first().waitFor();
};
const sortControl = (page, view) => page.locator(view === "table" ? '[data-board-menu="table-sorts"] > summary' : "#sort-button");
const look = (locator) => locator.evaluate((el) => {
  const cs = getComputedStyle(el);
  return { border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`, background: cs.backgroundColor, radius: cs.borderTopLeftRadius, width: el.offsetWidth, height: el.offsetHeight };
});

onDevices(["desktop", "ipad"], () => test("Sort looks like Filters and sits right after it in List, Tree, Table and Kanban", async ({ page, device }) => {
  for (const view of ["list", "tree", "table", "kanban"]) {
    await open(page, view);
    const filters = page.locator('[data-board-menu="filters"] > summary').first(), sort = sortControl(page, view);
    await expect(sort, `${device} ${view}: sort shows`).toBeVisible();
    const next = await page.locator('[data-board-menu="filters"]').first().evaluate((el) => el.nextElementSibling?.matches("#sort-button, [data-board-menu=table-sorts]"));
    expect(next, `${device} ${view}: sort follows Filters`).toBe(true);
    const [f, s] = [await filters.boundingBox(), await sort.boundingBox()];
    expect(s.x - (f.x + f.width), `${device} ${view}: just right of Filters`).toBeGreaterThanOrEqual(0);
    expect(s.x - (f.x + f.width), `${device} ${view}: just right of Filters`).toBeLessThanOrEqual(12);
    expect(Math.abs(s.y - f.y), `${device} ${view}: on Filters' line`).toBeLessThanOrEqual(1);
    await page.mouse.move(700, 600); // the last view's click leaves the pointer over Sort
    expect(await look(sort), `${device} ${view}: Filters' look`).toEqual(await look(filters));
    // It still opens the sort choices.
    await sort.click();
    await expect(page.locator(view === "table" ? '[data-board-menu="table-sorts"] .table-menu-panel' : "#shared-select-menu")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  // Table's menu stays one, after Filters, once a sort repaints the table.
  await open(page, "table");
  await sortControl(page, "table").click();
  await page.locator('[data-table-action="add-sort"]').click();
  await expect(page.locator('[data-board-menu="table-sorts"] > summary')).toHaveAttribute("aria-label", "Sort (1 active)");
  await expect(page.locator('[data-board-menu="table-sorts"]')).toHaveCount(1);
  expect(await page.locator('[data-board-menu="filters"]').first().evaluate((el) => el.nextElementSibling?.matches("[data-board-menu=table-sorts]"))).toBe(true);
}));

onDevices(["phone"], () => test("on phones Sort sits right after View options", async ({ page }) => {
  for (const view of ["list", "tree", "kanban"]) {
    await open(page, view);
    const next = await page.locator(".mobile-view-options").evaluate((el) => el.nextElementSibling?.id);
    expect(next, `${view}: sort follows View options`).toBe("sort-button");
  }
}));

test("Kanban cards leave out the field their swimlanes group by", async ({ page }) => {
  await open(page, "kanban");
  const shown = (selector) => page.locator(`.kanban-card ${selector}`).evaluateAll((els) => els.map((el) => getComputedStyle(el).display !== "none"));
  const fields = { assignee: ".kanban-fields > .row-assignee", priority: ".kanban-fields > .row-priority", type: ".card-top > .task-type" };
  for (const lanes of ["assignee", "priority", "type", "none"]) {
    await page.locator("#kanban-group").selectOption(lanes);
    await expect(page.locator(".kanban")).toHaveAttribute("data-group", lanes);
    for (const [field, selector] of Object.entries(fields))
      expect(await shown(selector), `by ${lanes}: ${field}`).toEqual([lanes !== field, lanes !== field]);
  }
  // The copy a drag lifts leaves it out too.
  await page.locator("#kanban-group").selectOption("assignee");
  await expect(page.locator(".kanban")).toHaveAttribute("data-group", "assignee");
  expect(await page.locator("[data-drag-task]").first().evaluate((el) => {
    const data = new DataTransfer();
    el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: data, clientX: 10, clientY: 10 }));
    const field = document.querySelector(".kanban-drag-image .kanban-fields > .row-assignee");
    const display = field && getComputedStyle(field).display;
    el.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: data }));
    return display;
  })).toBe("none");
});
