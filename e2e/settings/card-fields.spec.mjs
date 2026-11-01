// Owner request (T23, 31 October 2026): a project can turn off any built-in card field in Settings →
// Statuses & workflow → Card fields; cards always keep their ID and title. Values stay in the files.
// Fields that are off leave rows, cards, the card editor, filters, sort and Table columns, and the
// views that need them (Kanban: status, Tree: parent, Calendar and Timeline: dates, Capacity:
// assignee) leave the tabs.
import { settingsSaved } from "../helpers/menu-controls.mjs";
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async () => ({}));
let count = 0;
// A project per test, with one card that has every field set.
async function seed(off = []) {
  const project = await app.store.createProject({ title: `Fields ${++count}`, key: `FD${count}` });
  const task = await app.store.createTask(project.id, { title: "A card", status: "todo", priority: "high", assignee: "Ann", start: "2026-11-02", due: "2026-11-05" });
  if (off.length) await setOff(project.id, off);
  return { project, task };
}
async function setOff(id, off) {
  const { project } = await app.store.snapshot(id);
  await app.store.updateProject(id, { revision: project.revision, schema: { ...project.schema, off } });
}
const url = (s, view) => `${app.base}/#project/${s.project.id}/${view}`;
const row = (page) => page.locator(".task-row", { hasText: "A card" });

test("turning fields off in Settings hides them and the views that need them, and keeps their values", async ({ page }) => {
  const s = await seed();
  await page.goto(url(s, "settings/workflow"));
  const fields = page.getByRole("group", { name: "Card fields" });
  await expect(fields.getByRole("checkbox")).toHaveCount(9);
  for (const name of ["Assignee", "Status", "Priority", "Start date", "Due date", "Parent"])
    await fields.getByRole("checkbox", { name, exact: true }).uncheck();
  await settingsSaved(page);
  expect((await app.store.snapshot(s.project.id)).project.schema.off).toEqual(["assignee", "status", "priority", "start", "due", "parent"]);

  await page.goto(url(s, "list"));
  await expect(row(page).locator(".task-id")).toBeVisible();
  await expect(row(page).locator(".task-title")).toBeVisible();
  await expect(row(page).locator(".task-type"), "type stays on").toBeVisible();
  for (const part of [".row-assignee", ".row-status", ".row-priority", ".row-due", ".row-fields"])
    await expect(row(page).locator(part), part).toBeHidden();
  // Views: no Planning (dates and assignee are off), no Kanban (status) or Tree (parent).
  await expect(page.locator('.tabs [data-view="planning"]')).toHaveCount(0);
  await expect(page.locator(".view-layout-switcher [data-view]")).toHaveText(["List", "Table"]);
  // Sort keeps only what's on.
  await expect(page.locator("#sort option")).toHaveText(["Manual order", "Card ID", "Title A–Z", "Date created"]);
  // A link to a view that's off opens List.
  await page.goto(url(s, "kanban"));
  await expect(row(page)).toBeVisible();
  await expect(page.locator(".kanban")).toHaveCount(0);

  // The card editor keeps the type, ID and title.
  await row(page).locator(".task-id").click();
  const form = page.locator("#task-form");
  await expect(form.locator('[data-task-picker="type"]')).toBeVisible();
  for (const part of ['select[name="status"]', '[data-task-picker="priority"]', ".task-assignee-field", ".task-dates"])
    await expect(form.locator(part), part).toBeHidden();
  await page.keyboard.press("Escape");
  // A saved default view that's now hidden stays chosen, so saving General keeps it.
  const { project } = await app.store.snapshot(s.project.id);
  await app.store.updateProject(s.project.id, { revision: project.revision, default_view: "kanban" });
  await page.goto(url(s, "settings/general"));
  await expect(page.locator('select[name="default_view"]')).toHaveValue("kanban");

  // Turned back on, the values are still there.
  await setOff(s.project.id, []);
  await page.goto(url(s, "list"));
  await expect(row(page).locator(".row-status")).toContainText("To do");
  await expect(row(page).locator(".row-assignee")).toBeVisible();
});

test("filters and Table columns leave fields that are off", async ({ page }) => {
  const s = await seed(["status", "assignee", "tags", "due"]);
  await page.goto(url(s, "list"));
  await row(page).waitFor();
  await expect(row(page).locator(".row-due"), "the start date stays, without the due date").toBeVisible();
  await expect(row(page).locator(".row-due")).not.toContainText("5");
  await expect(row(page).locator(".row-due"), "the start date, 2 Nov").toContainText("2");
  // Search leaves text in fields that are off.
  await page.locator("#search").fill("Ann");
  await expect(row(page)).toHaveCount(0);
  await page.locator("#search").fill("");
  await expect(row(page)).toHaveCount(1);
  await page.locator('[data-board-menu="filters"] > summary').click();
  for (const id of ["#filter-status", "#filter-assignee", "#filter-tag", "#filter-completion"])
    await expect(page.locator(id), id).toBeHidden();
  await expect(page.locator("#filter-type")).toBeVisible();
  await page.goto(url(s, "table"));
  const heads = page.locator("th[data-column-key]");
  await expect(heads.first()).toBeVisible();
  const keys = await heads.evaluateAll((els) => els.map((el) => el.dataset.columnKey));
  for (const key of ["status", "assignee", "tags"]) expect(keys, key).not.toContain(key);
  expect(keys).toContain("priority");
  // The default view offers only views that stay (no Kanban without status).
  await page.goto(url(s, "settings/general"));
  await expect(page.locator('select[name="default_view"] option[value="list"]')).toHaveCount(1);
  await expect(page.locator('select[name="default_view"] option[value="kanban"]')).toHaveCount(0);
});

test("without estimates, Capacity counts tasks and offers no hours", async ({ page }) => {
  const s = await seed(["estimate"]);
  await page.goto(url(s, "capacity"));
  await page.locator("#capacity-scope").waitFor({ state: "attached" });
  await expect(page.locator("#capacity-unit")).toBeHidden();
  await expect(page.locator("#capacity-unit")).toHaveValue("tasks");
});

onDevices(["phone"], () => test("phone summaries and the bottom bar leave fields that are off", async ({ page }) => {
  const s = await seed(["status", "priority", "start", "due", "assignee"]);
  await page.goto(url(s, "list"));
  await row(page).waitFor();
  for (const field of ["assignee", "status", "priority"])
    await expect(row(page).locator(`.phone-field[data-field="${field}"]`), field).toBeHidden();
  await expect(row(page).locator(".phone-task-fields"), "no empty box").toBeHidden();
  await expect(page.locator('.tabs [data-view="planning"]')).toHaveCount(0);
}));
