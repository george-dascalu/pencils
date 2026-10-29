// Statuses & workflow: the workflow editor renames statuses, restricts transitions, sets the
// initial status and protects statuses in use, behind the unsaved-change guard. Every status
// control then offers only the allowed statuses: the card editor, new cards, Kanban drops, Table
// and Board, and the Board shows the saved status after a reload. The editor fits desktop and
// phone widths in both themes.
import { test, expect, useApp } from "../fixtures.mjs";
import { selectProjectView, selectSettingsPage } from "../helpers/menu-controls.mjs";
import { newCard } from "../helpers/new-card.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Workflow", schema: { statuses: ["todo", "doing", "done"], done: ["done"] } });
  const task = await store.createTask(project.id, { title: "Follow the rules" });
  const snap = await store.snapshot(project.id);
  await store.updateBoard(project.id, snap.boards[0].id, {
    revision: snap.boards[0].revision,
    nodes: [{ id: "task-card", type: "task", task: task.id, x: 100, y: 100, w: 320, h: 240 }],
    edges: [],
  });
  return { project, task };
});
// The first test saves the workflow the others rely on, and the task's status moves step by step.
test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1440, height: 1000 } });

const row = (page, id) => page.locator(`[data-workflow-status="${id}"]`);
const values = (locator) => locator.locator("option").evaluateAll((els) => els.map((e) => e.value));
const patched = (page) => page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes(app.task.id));
async function openWorkflow(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".top-actions [data-action=project-edit]").click();
  await selectSettingsPage(page, "workflow");
}

test("the workflow editor renames, restricts and protects statuses, and guards unsaved changes", async ({ page }) => {
  await page.goto(app.base);
  await page.locator(".project-link").click();
  await page.locator(".top-actions [data-action=project-edit]").click();
  await selectSettingsPage(page, "workflow");
  await row(page, "todo").locator("[data-status-name]").fill("Ready queue");
  await page.locator("[data-workflow-rules]").check();
  await row(page, "todo").locator("summary").click();
  await row(page, "todo").locator("[data-status-target=done]").uncheck();
  await row(page, "doing").locator("[data-status-initial]").check();
  await expect(row(page, "todo").locator("[data-status-remove]")).toBeDisabled();
  await page.getByLabel("New status name", { exact: true }).fill("On hold");
  await page.locator("[data-status-add]").click();
  await row(page, "on-hold").locator("[data-status-remove]").click();
  await expect(row(page, "on-hold")).toHaveCount(0);
  // Leaving with unsaved changes asks first; dismissing keeps the edits.
  page.once("dialog", (d) => d.dismiss());
  await page.locator("[data-action=settings-close]").click();
  await expect(row(page, "todo").locator("[data-status-name]")).toHaveValue("Ready queue");
  await expect(page.locator("[data-workflow-rules]")).toBeChecked();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Statuses & workflow saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to project", exact: true }).click();
  const config = (await app.store.snapshot(app.project.id)).project.schema;
  expect(config.transitions.todo).toEqual(["doing"]);
  expect(config.status_labels.todo).toBe("Ready queue");
});

test("the workflow editor fits desktop and phone widths in both themes", async ({ page }) => {
  await openWorkflow(page);
  await row(page, "todo").waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth > innerWidth), { message: `no overflow at ${width}px, ${theme}` }).toBe(false);
      await expect(page.locator(".workflow-editor")).toBeVisible();
    }
  }
});

test("the card editor offers only allowed statuses, and new cards start in the initial status", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator("[data-action=task-open]").first().click();
  await expect.poll(() => values(page.locator("#task-form [name=status]"))).toEqual(["todo", "doing"]);
  await page.locator('#task-form [data-action="dialog-close"]').click();
  await newCard(page);
  await expect(page.locator("#task-form [name=status]")).toHaveValue("doing");
  await page.locator('#task-form [data-action="dialog-close"]').click();
});

test("Kanban names the renamed status, refuses a disallowed drop and saves an allowed one", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await selectProjectView(page, "kanban");
  await expect(page.locator("[data-drop-status=todo] .column-header")).toContainText("Ready queue");
  const card = page.locator(`[data-drag-task="${app.task.id}"]`);
  await card.dragTo(page.locator("[data-drop-status=done]"));
  await expect(page.locator(`[data-drop-status=todo] [data-drag-task="${app.task.id}"]`)).toHaveCount(1);
  expect((await app.store.snapshot(app.project.id)).tasks[0].status).toBe("todo");
  const saved = patched(page);
  await card.dragTo(page.locator("[data-drop-status=doing]"));
  expect((await saved).status()).toBe(200);
});

test("Table and Board offer the statuses allowed from the current one, and the Board keeps the saved status after reload", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await selectProjectView(page, "table");
  const select = page.locator(`[data-task-field=status][data-id="${app.task.id}"]`);
  await expect.poll(() => values(select)).toEqual(["todo", "doing", "done"]);
  const saved = patched(page);
  await select.selectOption("done");
  await saved;
  await page.locator(".tabs [data-view=board]").click();
  await page.locator("[data-canvas-status]").first().waitFor();
  expect(await values(page.locator("[data-canvas-status]").first())).toEqual(["todo", "doing", "done"]);
  await page.reload();
  await page.locator(".tabs [data-view=board]").click();
  await expect(page.locator("[data-canvas-status]").first()).toHaveValue("done");
});
