// Owner request, 30 October 2026 (iPad): a board card shows its start and end dates and edits them
// in place with the shared calendar, and a date closes an open field menu, so only one picker is open.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Card pickers", key: "CP" });
  const task = await store.createTask(project.id, { title: "Picker card", status: "todo", priority: "low", start: "2026-10-26", due: "2026-10-30" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "card-a", type: "task", task: task.id, x: 200, y: 160, w: 360, h: 240 }] });
  return { project, task, board };
});
const card = (page) => page.locator('[data-node="card-a"]');
const saved = async () => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === app.task.id);

onDevices(["ipad", "desktop"], () => test("a board card shows both dates and edits them in place", async ({ page, device }) => {
  const current = await saved();
  await app.store.updateTask(app.project.id, app.task.id, { revision: current.revision, start: "2026-10-26", due: "2026-10-30" });
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  const dates = card(page).locator(".live-card-state > .field-box > .canvas-task-dates");
  await expect(dates, `${device}: start and end in the field box`).toHaveText(/26 Oct.*30 Oct/);
  const tap = (locator) => (device === "ipad" ? locator.tap() : locator.click());
  const menu = page.locator("#shared-select-menu"), calendar = page.locator("#shared-date-picker");
  await tap(card(page).locator(".canvas-task-priority"));
  await expect(menu).toBeVisible();
  await tap(dates.locator(".canvas-task-date").last());
  await expect(calendar, `${device}: tapping the end date opens the calendar`).toBeVisible();
  await expect(menu, `${device}: and closes the menu`).toBeHidden();
  await tap(calendar.locator('[data-date-value="2026-11-02"]'));
  await expect.poll(async () => (await saved()).due).toBe("2026-11-02");
  await expect(dates).toHaveText(/26 Oct.*2 Nov/);
  // The start can't pass the end.
  await tap(dates.locator(".canvas-task-date").first());
  await expect(calendar.locator('[data-date-value="2026-11-05"]')).toBeDisabled();
  await tap(calendar.locator('[data-date-value="2026-10-28"]'));
  await expect.poll(async () => (await saved()).start).toBe("2026-10-28");
}));

test("a board card's dates keep keyboard focus, say why a rejected date wasn't saved, and narrow cards keep the due date", async ({ page }) => {
  const current = await saved();
  await app.store.updateTask(app.project.id, app.task.id, { revision: current.revision, start: "2026-10-26", due: "2026-10-30" });
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  const calendar = page.locator("#shared-date-picker");
  const trigger = (name) => card(page).getByRole("button", { name: `Choose ${name} date for Picker card` });
  await trigger("Due").focus();
  await page.keyboard.press("Enter");
  await expect(calendar).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await saved()).due).toBe("2026-10-31");
  await expect(card(page).locator(".canvas-task-dates")).toHaveText(/31 Oct/);
  await expect(trigger("Due"), "focus returns to the date").toBeFocused();
  // Another writer moves the due date earlier; a start after it is refused, with the reason.
  const latest = await saved();
  await app.store.updateTask(app.project.id, app.task.id, { revision: latest.revision, due: "2026-10-27" });
  await trigger("Start").click();
  await calendar.locator('[data-date-value="2026-10-29"]').click();
  await expect(page.locator(".toast.error")).toBeVisible();
  // A narrow card keeps the due date, inside its box, and leaves the status room.
  const node = (await app.store.snapshot(app.project.id)).boards.find((b) => b.id === app.board.id);
  await app.store.updateBoard(app.project.id, app.board.id, { revision: node.revision, nodes: [{ ...node.nodes[0], w: 220 }] });
  await page.reload();
  const dates = card(page).locator(".canvas-task-dates");
  await expect(dates.locator(".canvas-task-date").first()).toBeHidden();
  await expect(dates.locator(".canvas-task-date").last()).toBeVisible();
  const [box, inner] = [await card(page).locator(".live-card-state > .field-box").boundingBox(), await dates.boundingBox()];
  expect(inner.x + inner.width, "dates inside the box").toBeLessThanOrEqual(box.x + box.width);
});

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
