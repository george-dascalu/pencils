// Owner request, 29 October 2026 (note-taking item 15): assignee, status and priority sit in one
// box whose border takes the priority's colour wherever they appear together, and each project
// sets its priority colours in Settings → Workflow.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Field box", key: "FB" });
  const high = await store.createTask(project.id, { title: "High card", status: "in-progress", priority: "high", assignee: "Alex" });
  const low = await store.createTask(project.id, { title: "Low card", status: "todo", priority: "low", assignee: "Alex", parent: high.id });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "card-a", type: "task", task: high.id, x: 200, y: 160, w: 320, h: 240 }] });
  return { project, high, low, board };
});
const url = (view) => `${app.base}/#project/${app.project.id}/${view}`;
const HIGH = "#d87935", LOW = "#508fb6", URGENT = "#cf5555";
// A box's border is the priority colour mixed with the line colour, as for every task field.
const mixed = (page, color) => page.evaluate((color) => {
  const el = document.createElement("span");
  el.style.borderTop = `1px solid color-mix(in srgb, ${color} 70%, var(--line))`;
  document.body.append(el);
  const value = getComputedStyle(el).borderTopColor;
  el.remove();
  return value;
}, color);
// The box holds each field once, the fields draw no border of their own, and the box's border takes the priority colour.
async function boxed(box, fields, color, label) {
  await expect(box, `${label}: one box`).toHaveCount(1);
  for (const field of fields) {
    await expect(box.locator(field), `${label}: ${field} inside the box`).toHaveCount(1);
    await expect(box.locator(field), `${label}: ${field} has no border of its own`).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  }
  const expected = await mixed(box.page(), color);
  // List and Tree rows draw their box at chip height behind taller targets (::after); other boxes are the element itself.
  await expect.poll(() => box.evaluate((el) => getComputedStyle(el, el.matches(".row-fields") ? "::after" : null).borderTopColor), `${label}: border in the priority colour`).toBe(expected);
}
const row = (page, task) => page.locator(`.task-row[data-task-order-row="${task.id}"]`);

test("rows, Kanban and board cards and the card editor hold the fields in one box coloured by priority", async ({ page }) => {
  for (const view of ["list", "tree"]) {
    await page.goto(url(view));
    for (const [task, color] of [[app.high, HIGH], [app.low, LOW]])
      await boxed(row(page, task).locator(".row-fields.field-box"), [".row-assignee .task-assignee", ".row-status .field-chip", ".row-priority .field-chip"], color, `${view} ${task.title}`);
  }
  await page.goto(url("kanban"));
  await boxed(page.locator(`[data-drag-task="${app.high.id}"] .field-box`), [".task-assignee", ".field-chip-priority"], HIGH, "kanban");
  await page.goto(url(`board/${app.board.id}`));
  await boxed(page.locator('[data-node="card-a"] .live-card-state .field-box'), [".task-assignee", ".canvas-task-status", ".canvas-task-priority"], HIGH, "board card");
  await page.goto(url("list"));
  await row(page, app.high).locator('[data-action="task-open"]').first().click();
  const editor = page.locator("#task-form");
  await boxed(editor.locator(".task-metadata-main .field-box"), [".task-assignee", 'select[name="status"]', ".task-picker-trigger"], HIGH, "card editor");
  await boxed(editor.locator(".task-relationship-metadata.field-box"), [".task-assignee", ".task-relationship-status", ".task-relationship-priority"], LOW, "relationship row");
  await editor.locator('[data-task-picker="priority"] .task-picker-trigger').click();
  await editor.locator('[data-task-picker="priority"] [data-picker-value="urgent"]').click();
  await boxed(editor.locator(".task-metadata-main .field-box"), [".task-assignee", 'select[name="status"]', ".task-picker-trigger"], URGENT, "card editor after a priority change");
});

onDevices(["phone"], () => test("phone summaries hold the fields in one box", async ({ page }) => {
  await page.goto(url("list"));
  await boxed(row(page, app.low).locator(".phone-task-meta .field-box"), [".task-assignee", ".phone-task-status", ".phone-task-priority"], LOW, "phone summary");
}));

test("each project sets its priority colours in Settings → Workflow", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/settings/workflow`);
  const picker = page.locator(".color-picker").filter({ has: page.locator('summary[aria-label="Low priority colour"]') });
  await picker.locator("summary").click();
  await picker.locator("[data-color-custom-toggle]").click();
  await picker.locator("[data-color-hex]").fill("#123abc");
  await picker.locator("[data-color-apply]").click();
  await page.locator("#workflow-form [type=submit]").click();
  await page.getByText("Changes saved", { exact: true }).waitFor();
  expect((await app.store.snapshot(app.project.id)).project.schema.priority_colors).toEqual({ low: "#123abc" });
  await page.goto(url("list"));
  await boxed(row(page, app.low).locator(".row-fields.field-box"), [".row-priority .field-chip"], "#123abc", "list after the setting");
});
