// Owner request, 30 October 2026 (iPad): a board card's date editor and its field menus close each
// other, so only one is open at a time, and the date editor opens below its date like the menus.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Card pickers", key: "CP" });
  const task = await store.createTask(project.id, { title: "Picker card", status: "todo", priority: "low", start: "2026-10-26", due: "2026-10-30" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "card-a", type: "task", task: task.id, x: 200, y: 160, w: 360, h: 240 }] });
  return { project, task, board };
});
const card = (page) => page.locator('[data-node="card-a"]');

onDevices(["ipad", "desktop"], () => test("a board card opens one picker at a time", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await card(page).locator(".field-box").waitFor();
  const tap = (locator) => (device === "ipad" ? locator.tap() : locator.click());
  const menu = page.locator("#shared-select-menu"), dates = page.locator("#task-dates-popover");
  await tap(card(page).locator(".canvas-task-priority"));
  await expect(menu).toBeVisible();
  await tap(card(page).locator(".canvas-task-due"));
  await expect(dates).toBeVisible();
  await expect(menu, `${device}: the dates close the menu`).toBeHidden();
  const [trigger, panel] = [await card(page).locator(".canvas-task-due").boundingBox(), await dates.boundingBox()];
  expect(panel.y, `${device}: below its date, like the menus ${JSON.stringify({ trigger, panel })}`).toBeGreaterThanOrEqual(trigger.y + trigger.height);
  await tap(card(page).locator(".canvas-task-priority"));
  await expect(menu).toBeVisible();
  await expect(dates, `${device}: the menu closes the dates`).toHaveCount(0);
}));

// The date editor opens below its date whenever it fits there, even with more room above, as the
// menus do (it opened above a date in the lower half of the screen), and shows all of itself.
test("the date editor opens below a date low on the screen when it fits", async ({ page }) => {
  for (let i = 0; i < 16; i++) await app.store.createTask(app.project.id, { title: `Row ${i}` });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  const dates = page.locator(".task-row .row-due");
  await page.locator(".task-row", { hasText: "Row 15" }).waitFor();
  const boxes = await dates.evaluateAll((els) => els.map((el) => { const { top, bottom } = el.getBoundingClientRect(); return { top, bottom }; }));
  // A date with clearly more room above than below, but room enough below for the editor.
  const index = boxes.findIndex(({ top, bottom }) => top > 900 - bottom + 40 && 900 - bottom > 300);
  expect(index, JSON.stringify(boxes)).toBeGreaterThanOrEqual(0);
  await dates.nth(index).click();
  const popover = page.locator("#task-dates-popover");
  const [panel, trigger] = [await popover.boundingBox(), await dates.nth(index).boundingBox()];
  expect(panel.y, JSON.stringify({ panel, trigger })).toBeGreaterThanOrEqual(trigger.y + trigger.height);
  expect(await popover.evaluate((el) => el.scrollHeight - el.clientHeight), "no scrolling inside").toBe(0);
});
