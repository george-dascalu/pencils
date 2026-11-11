// Owner request (F0.23-20): "if i click outside the edit card panel it should close it". A press
// on the page outside the card panel closes it as Escape does; presses in what the panel opened
// (its menus and date picker), drags and a press on another card (which opens that card) don't.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Outside presses" });
  const first = await store.createTask(project.id, { title: "First card" });
  const second = await store.createTask(project.id, { title: "Second card" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "card", type: "task", task: first.id, x: 20, y: 40, w: 320, h: 240 }] });
  return { project, first, second };
});
const panel = (page) => page.locator("dialog.task-dialog");
async function open(page, id = app.first.id) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(`[data-action="task-open"][data-id="${id}"]:visible`).first().click();
  await expect(page.locator(`#task-form[data-id="${id}"]`)).toBeVisible();
}
// A point on the List below its rows and left of the panel, where nothing can be pressed.
async function emptyPoint(page) {
  const point = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".task-row")].at(-1).getBoundingClientRect();
    const panel = document.querySelector("dialog.task-dialog").getBoundingClientRect();
    return { x: Math.round(Math.min(40, panel.left / 2)), y: Math.round(Math.min(rows.bottom + 80, innerHeight - 140)) };
  });
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return { app: !!el?.closest("#app"), control: !!el?.closest("button, a, input, select, textarea, label, summary, [tabindex]") };
  }, point);
  expect(hit, "the point is empty workspace").toEqual({ app: true, control: false });
  return point;
}
const press = (page, device, { x, y }) => (device === "desktop" ? page.mouse.click(x, y) : page.touchscreen.tap(x, y));
// The close waits a task after the press (for the press's own click), and focus would come back a
// frame after the close: let both pass before checking that neither happened.
const settled = (page) => page.evaluate(() => new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));

onDevices(["desktop", "ipad"], () => {
  test("a press on an empty part of the List closes the card panel and leaves focus with the press", async ({ page, device }) => {
    await open(page);
    await press(page, device, await emptyPoint(page));
    await expect(panel(page)).toHaveCount(0);
    await settled(page);
    expect(await page.evaluate(() => document.activeElement === document.body), "focus isn't handed back to the card's row").toBe(true);
  });

  test("presses in the panel's menu and date picker keep it open; a press outside closes the open menu first", async ({ page, device }) => {
    await open(page);
    const tap = (locator) => (device === "desktop" ? locator.click() : locator.tap());
    await tap(page.locator("#task-form [name=status]"));
    await tap(page.locator("#shared-select-menu").getByRole("option", { name: "In progress", exact: true }));
    await expect(page.locator("#task-form [name=status]")).toHaveValue("in-progress");
    await tap(page.locator("#task-form [data-date-range] [data-date-picker]:visible"));
    const picker = page.locator("#shared-date-picker");
    await expect(picker).toBeVisible();
    await tap(picker.locator('[data-date-value="2026-11-03"]'));
    await settled(page);
    await expect(panel(page), "a pick in the date picker").toHaveCount(1);
    await expect(picker).toBeVisible();
    const empty = await emptyPoint(page);
    await press(page, device, empty);
    await expect(picker, "the press closes the date picker").toHaveCount(0);
    await settled(page);
    await expect(panel(page), "and leaves the panel").toHaveCount(1);
    await press(page, device, empty);
    await expect(panel(page)).toHaveCount(0);
  });
});

// On an iPad the panel leaves only a strip of the List beside it, so the rows' controls are covered.
test("a press on another card opens that card in the panel", async ({ page }) => {
  await open(page);
  await page.locator(`.task-row [data-action="task-open"][data-id="${app.second.id}"]:visible`).first().click();
  await expect(page.locator(`#task-form[data-id="${app.second.id}"]`)).toBeVisible();
  await expect(panel(page)).toHaveCount(1);
});

test("a drag out of the panel or across the page, or a press that opens a context menu, doesn't close it", async ({ page }) => {
  await open(page);
  const title = await page.locator("#task-form [name=title]").boundingBox();
  const empty = await emptyPoint(page);
  // Selecting the title's text past the panel's edge.
  await page.mouse.move(title.x + title.width - 10, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(empty.x, empty.y, { steps: 5 });
  await page.mouse.up();
  await settled(page);
  await expect(panel(page)).toHaveCount(1);
  // A drag on the page, such as selecting text.
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move(empty.x + 30, empty.y - 60, { steps: 5 });
  await page.mouse.up();
  await settled(page);
  await expect(panel(page)).toHaveCount(1);
  // Control-click on a Mac, or a long press, opens the context menu.
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })), empty);
  await page.mouse.up();
  await settled(page);
  await expect(panel(page)).toHaveCount(1);
});

test("a press into a field on the page closes the panel and leaves focus there", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  const field = page.locator(`.task-row [data-row-field="title"][data-id="${app.second.id}"]`);
  await field.click({ position: { x: 12, y: 8 } });
  await expect(panel(page)).toHaveCount(0);
  await settled(page);
  await expect(field).toBeFocused();
});

test("beside a board, a press on empty board closes the card panel and a drag across it doesn't", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-node="card"] [data-pro=task-details]').click();
  await expect(page.locator(`#task-form[data-id="${app.first.id}"]`)).toBeVisible();
  const canvas = await page.locator("#canvas").boundingBox();
  const point = { x: Math.round(canvas.x + canvas.width - 120), y: Math.round(canvas.y + canvas.height - 160) };
  expect(await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest(".board-node, button, dialog"), point), "empty board").toBe(true);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x - 80, point.y - 60, { steps: 5 });
  await page.mouse.up();
  await settled(page);
  await expect(panel(page)).toHaveCount(1);
  await page.mouse.click(point.x, point.y);
  await expect(panel(page)).toHaveCount(0);
});
