// Owner requests, 30 October 2026: Kanban cards show their dates, and a column has one way to add
// a card, the + at the top right of its header. Swimlane cells keep their own add button, which
// also sets the lane's value.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Kanban cards" });
  const dated = await store.createTask(project.id, { title: "Dated card", status: "todo", assignee: "Ann", due: "2026-12-05" });
  const late = await store.createTask(project.id, { title: "Late card", status: "todo", due: "2020-01-02" });
  const plain = await store.createTask(project.id, { title: "Plain card", status: "todo" });
  return { project, dated, late, plain };
});
const card = (page, task) => page.locator(`[data-drag-task="${task.id}"]`);

onDevices(["desktop", "phone"], () => test("cards show their due date in the field box after the priority, and each column adds cards from its header", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/kanban`);
  await card(page, app.dated).waitFor();
  const due = card(page, app.dated).locator(".card-bottom .due");
  await expect(due, `${device}: the due date shows`).toHaveText(/^5 Dec/);
  await expect(card(page, app.dated).locator("[data-row-dates]"), "screen readers hear it as an editable due date").toHaveAccessibleName(/Due 5 Dec.*edit dates/);
  const [box, priority, date] = await Promise.all([".card-bottom .field-box", ".card-bottom .field-chip-priority"].map((s) => card(page, app.dated).locator(s).boundingBox()).concat(due.boundingBox()));
  expect(date.x, `${device}: after the priority`).toBeGreaterThanOrEqual(priority.x + priority.width - 0.5);
  expect(date.x + date.width, `${device}: inside the box`).toBeLessThanOrEqual(box.x + box.width + 0.5);
  await expect(card(page, app.late).locator(".due"), "overdue dates are marked").toHaveClass(/overdue/);
  await expect(card(page, app.plain).locator("[data-row-dates]"), "an empty date can be set inline").toHaveAccessibleName(/Set dates/);
  // Even a narrow supported column keeps the four editable fields inside its card.
  const narrow = await card(page, app.late).evaluate((el) => {
    el.style.width = "240px";
    const c = el.getBoundingClientRect(), d = el.querySelector(".due").getBoundingClientRect();
    el.style.width = "";
    return d.right <= c.right + 0.5;
  });
  expect(narrow, `${device}: the date stays inside a narrow card`).toBe(true);
  const column = page.locator('.kanban-column[data-drop-status="todo"]');
  await expect(column.locator('[data-action="task-new"]'), `${device}: one add button`).toHaveCount(1);
  await expect(column.locator('.column-header [data-action="task-new"]')).toHaveCount(1);
}));
