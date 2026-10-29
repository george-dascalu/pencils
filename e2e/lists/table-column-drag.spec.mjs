// Table columns move by dragging their header grip: a preview without duplicated
// controls, a highlighted column and an insertion marker, no sorting side effects,
// widths that travel with their column, Escape/outside/pointer-cancel cancellation,
// keyboard moves (Alt+Arrow) matching the Columns popover, edge auto-scroll, hidden and
// custom columns, remembered order across reload, and touch dragging on the grip only.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { DEFAULT_SCHEMA } from "../../server/model.js";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Column drag", schema: { ...DEFAULT_SCHEMA, fields: [{ id: "points", name: "Points", type: "number" }] } });
  const task = await store.createTask(project.id, { title: "Alpha", priority: "high", fields: { points: 3 } });
  await store.createTask(project.id, { title: "Beta", priority: "low", fields: { points: 7 } });
  return { project, task };
});

const header = (page, key) => page.locator(`[data-table-sort-column="${key}"]`);
const grip = (page, key) => page.locator(`[data-column-drag="${key}"]`);
const order = (page) => page.locator(".spreadsheet thead th[data-column-key]").evaluateAll((els) => els.map((el) => el.dataset.columnKey));
const sort = (page) => page.locator(".spreadsheet thead th[data-column-key]").evaluateAll((els) => els.map((el) => [el.dataset.columnKey, el.getAttribute("aria-sort")]).sort());
const scroll = (page, left) => page.locator(".table-scroll").evaluate((el, x) => (el.scrollLeft = x), left);
const near = (value, target) => Math.abs(value - target) <= 1;
async function point(locator) {
  const b = await locator.boundingBox();
  expect(b).toBeTruthy();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/table`);
  await page.locator("[data-table-task]").first().waitFor();
}
async function startDrag(page, key, useTitle = false) {
  const target = useTitle ? header(page, key) : grip(page, key);
  await target.scrollIntoViewIfNeeded();
  const p = await point(target);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 10, p.y, { steps: 3 });
  await page.locator(".table-column-drag-ghost").waitFor();
  await expect(page.locator(".table-column-drag-sample")).toHaveCount(2);
  await expect(page.locator(".table-column-drag-ghost :is(input,select,button,[id])"), "The preview contains no duplicated controls").toHaveCount(0);
  await expect(page.locator("tbody .table-column-drag-source"), "Highlight the whole column").toHaveCount(2);
  return p;
}
async function dragBefore(page, key, beforeKey) {
  await startDrag(page, key);
  const box = await page.locator(`.spreadsheet th[data-column-key="${beforeKey}"]`).boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 10 });
  await expect(page.locator(".table-column-drop-marker")).toBeVisible();
  await expect(page.locator(".table-column-drag-ghost small")).toHaveText(/Before /);
  await page.mouse.up();
}
async function columns(page) {
  const menu = page.locator('[data-board-menu="table-columns"]');
  if (!(await menu.evaluate((el) => el.open))) await menu.locator(":scope > summary").click();
  return menu;
}
// Drags a header edge by dx pixels and returns the column's new width.
async function resize(page, key, dx) {
  const handle = await point(page.locator(`[data-resize-column="${key}"]`));
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + dx, handle.y, { steps: 5 });
  await page.mouse.up();
}
const columnWidth = (page, key) => header(page, key).locator("xpath=ancestor::th").evaluate((el) => el.offsetWidth);

test.describe("desktop", () => {
  test.use({ viewportSize: { width: 1600, height: 1000 } });

  test("a moved Type column keeps its own width, resizes to a narrow minimum and keeps its header actions", async ({ page }) => {
    await open(page);
    // Reordering must not transfer the old title-column minimum to Type.
    await dragBefore(page, "type", "key");
    const typeColumn = page.locator('.spreadsheet th[data-column-key="type"]');
    const typeWidth = () => typeColumn.evaluate((el) => el.getBoundingClientRect().width);
    await expect.poll(async () => near(await typeWidth(), 160)).toBe(true);
    const typeEdge = page.locator('[data-resize-column="type"]');
    const edge = await point(typeEdge);
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();
    await page.mouse.move(edge.x - 40, edge.y, { steps: 5 });
    expect(near(await typeWidth(), 120), "Type shrinks during the drag").toBe(true);
    await page.mouse.up();
    await expect.poll(async () => near(await typeWidth(), 120), "The narrower width survives rendering").toBe(true);
    await typeEdge.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => near(await typeWidth(), 90)).toBe(true);
    await expect(typeEdge, "Keyboard resizing retains focus").toBeFocused();

    // Header actions reveal together on hover or keyboard focus, without shifting columns.
    await page.locator("#search").focus();
    await page.mouse.move(10, 10);
    const typeGrip = typeColumn.locator(".table-column-grip");
    const typeMenu = typeColumn.locator(".table-header-menu > summary");
    await expect(typeGrip).toHaveCSS("opacity", "0");
    await expect(typeMenu).toHaveCSS("opacity", "0");
    const beforeHover = await typeWidth();
    await typeColumn.hover();
    await expect(typeGrip).toHaveCSS("opacity", "1");
    await expect(typeMenu).toHaveCSS("opacity", "1");
    await expect(grip(page, "title"), "Only the hovered column reveals its controls").toHaveCSS("opacity", "0");
    expect(await typeWidth()).toBe(beforeHover);
    await page.mouse.move(10, 10);
    await header(page, "type").focus();
    await expect(typeGrip).toHaveCSS("opacity", "1");
    await expect(typeMenu).toHaveCSS("opacity", "1");
    expect(await typeColumn.locator(".table-column-name").evaluate((el) => el.clientWidth >= el.scrollWidth), "The Type label remains readable at minimum width").toBe(true);
    await typeMenu.click();
    await page.mouse.move(10, 10);
    await expect(typeMenu, "The open menu keeps its trigger visible").toHaveCSS("opacity", "1");
    await expect(typeColumn.locator('[data-table-column-action="filter"]'), "Narrow columns retain filtering in the actions menu").toBeVisible();
    await page.keyboard.press("Escape");

    // Even a table with only two fields must keep their requested widths.
    await columns(page);
    for (const key of await order(page)) if (!["type", "title"].includes(key)) await page.locator(`[data-column-visible="${key}"]`).uncheck();
    await page.locator('[data-feature="columns-close"]').click();
    await expect.poll(async () => near(await typeWidth(), 90), "Hidden columns do not stretch the remaining fields").toBe(true);
  });

  test("dragging a column by its grip reorders it without sorting; a drag within its own slot does nothing", async ({ page }) => {
    await open(page);
    await header(page, "title").click();
    await expect(page.locator('.spreadsheet th[data-column-key="title"]')).toHaveAttribute("aria-sort", "ascending");
    const sorted = await sort(page);
    const initialOrder = await order(page);
    await grip(page, "priority").click();
    expect(await sort(page), "Clicking the grip never sorts").toEqual(sorted);
    expect(await order(page)).toEqual(initialOrder);
    // A movement within the original slot is a no-op.
    await startDrag(page, "priority");
    await expect(page.locator(".table-column-drag-ghost small")).toHaveText("Keep current position");
    await page.mouse.up();
    expect(await order(page)).toEqual(initialOrder);
    expect(await sort(page)).toEqual(sorted);
    await dragBefore(page, "priority", "type");
    // Default columns run type, assignee, status, priority (0.19.9).
    await expect.poll(async () => (await order(page)).slice(0, 6)).toEqual(["key", "title", "body", "priority", "type", "assignee"]);
    expect(await sort(page), "Dragging must not change sorting").toEqual(sorted);
    await expect(grip(page, "priority")).toBeFocused();
    expect(await page.locator(`[data-table-task="${app.task.id}"] td[data-column-key]`).evaluateAll((els) => els.map((el) => el.dataset.columnKey))).toEqual(await order(page));
    await expect(page.locator("[data-table-reorder-status]")).toHaveText(/Priority moved to column 4/);
    await header(page, "priority").click();
    await expect(header(page, "priority").locator("xpath=ancestor::th")).toHaveAttribute("aria-sort", "ascending");
  });

  test("header edges still resize, and widths travel with moved columns", async ({ page }) => {
    await open(page);
    await dragBefore(page, "priority", "type");
    const beforeResize = await order(page);
    const oldWidth = await columnWidth(page, "priority");
    await resize(page, "priority", 50);
    const width = await columnWidth(page, "priority");
    expect(width).toBeGreaterThanOrEqual(oldWidth + 45);
    expect(await order(page)).toEqual(beforeResize);
    await dragBefore(page, "priority", "title");
    await expect.poll(async () => (await order(page))[1]).toBe("priority");
    expect(await columnWidth(page, "priority")).toBe(width);
  });

  test("Escape, leaving the table and pointer cancel all leave order and sort unchanged", async ({ page }) => {
    await open(page);
    const original = await order(page), originalSort = await sort(page);
    const pos = await startDrag(page, "type");
    await page.mouse.move(pos.x - 170, pos.y);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await order(page)).toEqual(original);
    expect(await sort(page)).toEqual(originalSort);
    await expect(grip(page, "type"), "Escape restores focus to the grip").toBeFocused();
    await startDrag(page, "type");
    await page.mouse.move(10, 10);
    await expect(page.locator(".table-column-drop-marker")).toBeHidden();
    await expect(page.locator(".table-column-drag-ghost small")).toHaveText(/release to cancel/);
    await page.mouse.up();
    expect(await order(page)).toEqual(original);
    await startDrag(page, "type");
    await header(page, "type").dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.up();
    await expect(page.locator(".table-column-drag-ghost")).toHaveCount(0);
    expect(await order(page)).toEqual(original);
  });

  test("keyboard moves, the Columns popover and edge auto-scroll share one column order that survives reload", async ({ page }) => {
    await open(page);
    // Start where a resized Priority column has been dragged to the front.
    await dragBefore(page, "priority", "type");
    await resize(page, "priority", 50);
    const width = await columnWidth(page, "priority");
    await dragBefore(page, "priority", "title");
    await expect.poll(async () => (await order(page))[1]).toBe("priority");

    // Keyboard controls and the existing popover use exactly the same ordering.
    await header(page, "priority").focus();
    await page.keyboard.press("Alt+ArrowRight");
    await expect.poll(async () => (await order(page))[2]).toBe("priority");
    await page.keyboard.press("Alt+ArrowLeft");
    await expect.poll(async () => (await order(page))[1]).toBe("priority");
    await columns(page);
    await page.locator('[data-column-visible="status"]').uncheck();
    await page.locator('[data-column-setting="type"] [data-feature="column-up"]').click();
    await page.locator('[data-feature="columns-close"]').click();
    expect(await order(page)).not.toContain("status");
    // Desktop users can still drag the title itself.
    await startDrag(page, "type", true);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".table-column-drag-source")).toHaveCount(0);

    // Auto-scroll reaches the last custom field; hidden columns are not discarded.
    await scroll(page, 10000);
    await startDrag(page, "fields.points");
    const area = await page.locator(".table-scroll").boundingBox();
    const h = await point(header(page, "fields.points"));
    await page.mouse.move(area.x + 5, h.y, { steps: 10 });
    await expect.poll(() => page.locator(".table-scroll").evaluate((el) => el.scrollLeft)).toBe(0);
    await page.mouse.up();
    await expect.poll(async () => (await order(page))[0]).toBe("fields.points");
    await columns(page);
    const allColumns = await page.locator("[data-column-setting]").evaluateAll((els) => els.map((el) => el.dataset.columnSetting));
    expect(allColumns).toContain("status");
    await expect(page.locator('[data-column-visible="status"]')).not.toBeChecked();
    await page.locator('[data-feature="columns-close"]').click();
    const points = page.locator(`[data-table-task="${app.task.id}"] [data-task-field="fields.points"]`);
    await points.fill("42");
    await points.press("Tab");
    await expect.poll(async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.task.id).fields.points).toBe(42);

    // Keyboard moves keep their focus target visible when crossing the viewport edge.
    await grip(page, "fields.points").focus();
    for (let i = 1; i < (await order(page)).length; i++) await page.keyboard.press("Alt+ArrowRight");
    await expect.poll(async () => {
      const moved = await grip(page, "fields.points").boundingBox(), viewport = await page.locator(".table-scroll").boundingBox();
      return moved.x >= viewport.x && moved.x + moved.width <= viewport.x + viewport.width + 1;
    }, "the moved column stays in view").toBe(true);
    await expect(grip(page, "fields.points")).toBeFocused();

    const finalOrder = await order(page);
    await expect(page.locator('#saved-view,[data-feature="view-save"]')).toHaveCount(0);
    await page.reload();
    await page.locator("[data-table-task]").first().waitFor();
    expect(await order(page)).toEqual(finalOrder);
    await expect(page.locator('[data-resize-column="priority"]')).toHaveAttribute("aria-valuenow", String(width));
  });
});

// Smaller touch layout, with a real Chromium touch stream (not mouse events).
onDevices(["ipad-portrait"], () => {
  test.use({ viewportSize: { width: 760, height: 1024 } });

  test("touch: swiping header labels scrolls, the grip drags a column and a second finger cancels", async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
    // Assignee now precedes Status by default (0.19.9), so start one 160px column further right.
    await scroll(page, 640);
    const touchBefore = await order(page);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, p) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ ...p, id: 1, radiusX: 4, radiusY: 4 }] : [] });
    const title = await point(header(page, "status"));
    await touch("touchStart", title);
    for (let i = 1; i <= 10; i++) await touch("touchMove", { x: title.x - i * 10, y: title.y });
    await touch("touchEnd");
    await expect(page.locator(".table-column-drag-ghost"), "Swiping labels scrolls instead of dragging").toHaveCount(0);
    expect(await order(page)).toEqual(touchBefore);
    await expect.poll(() => page.locator(".table-scroll").evaluate((el) => el.scrollLeft), "Header labels allow native touch scrolling").toBeGreaterThan(640);
    await scroll(page, 640);
    const from = await point(grip(page, "status")), to = await point(grip(page, "type"));
    await touch("touchStart", from);
    for (let i = 1; i <= 10; i++) await touch("touchMove", { x: from.x + ((to.x - from.x) * i) / 10, y: from.y });
    await page.locator(".table-column-drag-ghost").waitFor();
    await touch("touchEnd");
    await expect.poll(async () => { const o = await order(page); return o.indexOf("status") < o.indexOf("type"); }).toBe(true);
    const afterDrop = await order(page);
    const again = await point(grip(page, "status"));
    await touch("touchStart", again);
    await touch("touchMove", { x: again.x + 30, y: again.y });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: again.x + 30, y: again.y, id: 1 }, { x: again.x + 80, y: again.y + 40, id: 2 }] });
    await touch("touchEnd");
    expect(await order(page), "A second finger cancels a column drag").toEqual(afterDrop);
    await expect(page.locator(".table-column-drag-ghost")).toHaveCount(0);
    await cdp.detach();
    const touchAfter = await order(page);
    expect(touchAfter).not.toEqual(touchBefore);
    expect(touchAfter.indexOf("status")).toBeLessThan(touchAfter.indexOf("type"));
    await expect(page.locator(".table-sort-indicator")).toHaveCount(0);
    const touchHeight = await page.locator(".spreadsheet th").first().evaluate((el) => el.getBoundingClientRect().height);
    expect(touchHeight >= 44 && touchHeight <= 45, `44px touch headers: ${touchHeight}`).toBe(true);
  });
});
