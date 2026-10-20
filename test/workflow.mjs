import { selectSettingsPage } from "./menu-controls.mjs";
import { selectProjectView } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-workflow-ui-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({
  title: "Workflow",
  schema: { statuses: ["todo", "doing", "done"], done: ["done"] },
});
const task = await store.createTask(project.id, { title: "Follow the rules" });
const snap = await store.snapshot(project.id);
await store.updateBoard(project.id, snap.boards[0].id, {
  revision: snap.boards[0].revision,
  nodes: [
    {
      id: "task-card",
      type: "task",
      task: task.id,
      x: 100,
      y: 100,
      w: 320,
      h: 240,
    },
  ],
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const row = (id) => page.locator(`[data-workflow-status="${id}"]`);
const values = (locator) =>
  locator.locator("option").evaluateAll((els) => els.map((e) => e.value));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-action=project-edit]").click();
  await selectSettingsPage(page, "workflow");
  await row("todo").locator("[data-status-name]").fill("Ready queue");
  await page.locator("[data-workflow-rules]").check();
  await row("todo").locator("summary").click();
  await row("todo").locator("[data-status-target=done]").uncheck();
  await row("doing").locator("[data-status-initial]").check();
  assert.ok(await row("todo").locator("[data-status-remove]").isDisabled());
  await page.getByLabel("New status name", { exact: true }).fill("On hold");
  await page.locator("[data-status-add]").click();
  await row("on-hold").locator("[data-status-remove]").click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page
        .locator(".workflow-editor")
        .screenshot({ path: `/tmp/pencils-workflow-${width}-${theme}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.once('dialog', d => d.dismiss());
  await page.locator('[data-action=settings-close]').click();
  assert.equal(await row('todo').locator('[data-status-name]').inputValue(), 'Ready queue');
  assert.ok(await page.locator('[data-workflow-rules]').isChecked());
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Statuses & workflow saved.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Back to project", exact: true })
    .click();
  let config = (await store.snapshot(project.id)).project.schema;
  assert.deepEqual(config.transitions.todo, ["doing"]);
  assert.equal(config.status_labels.todo, "Ready queue");
  await page.locator("[data-action=task-open]").first().click();
  assert.deepEqual(await values(page.locator("#task-form [name=status]")), [
    "todo",
    "doing",
  ]);
  await page.locator('#task-form [data-action="dialog-close"]').click();
  await page.locator("[data-action=task-new]:visible").first().click();
  assert.equal(
    await page.locator("#task-form [name=status]").inputValue(),
    "doing",
  );
  await page.locator('#task-form [data-action="dialog-close"]').click();
  await selectProjectView(page, "kanban");
  assert.ok(
    (
      await page.locator("[data-drop-status=todo] .column-header").innerText()
    ).includes("Ready queue"),
  );
  const card = page.locator(`[data-drag-task="${task.id}"]`);
  await card.dragTo(page.locator("[data-drop-status=done]"));
  assert.equal((await store.snapshot(project.id)).tasks[0].status, "todo");
  const saved = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes(task.id),
  );
  await card.dragTo(page.locator("[data-drop-status=doing]"));
  assert.equal((await saved).status(), 200);
  await selectProjectView(page, "table");
  let select = page.locator(`[data-task-field=status][data-id="${task.id}"]`);
  assert.deepEqual(await values(select), ["todo", "doing", "done"]);
  const saved2 = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().includes(task.id),
  );
  await select.selectOption("done");
  await saved2;
  await page.locator("[data-view=board]").click();
  await page.locator("[data-canvas-status]").waitFor();
  assert.deepEqual(await values(page.locator("[data-canvas-status]").first()), [
    "todo",
    "doing",
    "done",
  ]);
  await page.reload();
  await page.locator("[data-view=board]").click();
  await page.locator("[data-canvas-status]").waitFor();
  assert.equal(
    await page.locator("[data-canvas-status]").first().inputValue(),
    "done",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: workflow editor, labels, defaults, protected statuses, allowed selectors, blocked/allowed Kanban drops, table/board, reload and responsive themes.",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-workflow-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
