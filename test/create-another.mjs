import { selectProjectView } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-task-panel-"));
const store = new Store(root);
await store.init();
const org = await store.createOrganisation({
  title: "Batch studio",
  people: [{ id: "alice", name: "Alice" }],
  teams: [{ id: "design", name: "Design", members: ["alice"] }],
});
const project = await store.createProject({
  title: "Panel lab",
  organisation: org.id,
  teams: ["design"],
});
const parent = await store.createTask(project.id, {
  title: "Parent epic",
  type: "epic",
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const snapshot = () => store.snapshot(project.id);
const until = async (fn) => {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out");
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator("#organisation-select").selectOption(org.id);
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await page.locator("[data-view=board]").click();
  await page.locator("[data-action=board-task]").click();
  await page.locator("[data-action=board-create-task]").click();
  const form = page.locator("#task-form");
  const pick = async (name, value) => {
    await form
      .locator(`[data-task-picker="${name}"] .task-picker-trigger`)
      .click();
    await form
      .locator(`[data-task-picker="${name}"] [data-picker-value="${value}"]`)
      .click();
  };
  assert.equal(
    await form.getByText("Planning & relationships", { exact: true }).count(),
    0,
  );
  await pick("type", "story");
  await pick("priority", "high");
  await pick("parent", parent.id);
  await form.locator("[name=status]").selectOption("review");
  await form.locator("[name=assignee]").selectOption("Alice");
  await form.locator("[name=due]").fill("2026-10-30");
  await form.locator("[name=title]").fill("Repeat one");
  await form
    .locator('[aria-label="Task description"]')
    .fill("Only the first description");
  await form.locator("[name=subtaskTitle]").fill("Queued child");
  await form.locator("[data-task-modal=subtask-add]").click();
  await form.locator("[name=subtaskTitle]").fill("Typed child");
  await form.getByRole("checkbox", { name: "Create another" }).check();
  await page.locator("[data-task-list-back]").click();
  await page.locator("[data-action=board-create-task]").click();
  await form.locator("[data-feature=form-restore]").click();
  assert.ok(
    await form.getByRole("checkbox", { name: "Create another" }).isChecked(),
  );
  const camera = await page.locator("#canvas-world").getAttribute("style");
  const requestId = await form.locator("[name=creation_request]").inputValue();
  const url = `**/api/projects/${project.id}/tasks`;
  await page.route(url, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary create failure" }),
    }),
  );
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await form
    .locator(".form-error:not(.hidden):not([hidden])")
    .first()
    .waitFor();
  assert.equal(await form.locator("[name=title]").inputValue(), "Repeat one");
  assert.match(
    await form.locator('[aria-label="Task description"]').innerText(),
    /first description/,
  );
  assert.equal((await snapshot()).tasks.length, 1);
  await page.unroute(url);
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await until(async () => (await snapshot()).tasks.length === 4);
  await until(
    async () =>
      (await form.locator("[name=creation_request]").inputValue()) !==
      requestId,
  );
  assert.equal(await page.locator("#board-task-panel").count(), 0);
  assert.equal(await page.locator("dialog:modal").count(), 0);
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    camera,
  );
  for (const [name, value] of Object.entries({
    type: "story",
    priority: "high",
    status: "review",
    assignee: "Alice",
    parent: parent.id,
    due: "2026-10-30",
    title: "",
    subtaskTitle: "",
    pendingSubtasks: "[]",
  }))
    assert.equal(
      await form.locator(`[name="${name}"]`).inputValue(),
      value,
      name,
    );
  assert.equal(
    (await form.locator('[aria-label="Task description"]').innerText()).trim(),
    "",
  );
  assert.ok(
    await form.getByRole("checkbox", { name: "Create another" }).isChecked(),
  );
  assert.equal(
    await form
      .locator("[name=title]")
      .evaluate((el) => el === document.activeElement),
    true,
  );
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const rect = async (selector) => form.locator(selector).boundingBox();
    const priority = await rect("[data-task-picker=priority]"),
      status = await rect("[name=status]"),
      assignee = await rect("[name=assignee]"),
      parentBox = await rect("[data-task-picker=parent]"),
      due = await rect(".date-field:has([name=due])");
    assert.ok(priority.x < status.x && status.x < assignee.x);
    assert.ok(
      Math.abs(priority.y - status.y) < 2 &&
        Math.abs(status.y - assignee.y) < 2,
    );
    assert.ok(
      parentBox.y > status.y &&
        Math.abs(parentBox.y - due.y) < 2 &&
        parentBox.x < due.x,
    );
    assert.ok(
      await form.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    await page.screenshot({ path: `/tmp/pencils-create-another-${width}.png` });
  }
  await form.locator("[name=title]").fill("Repeat two");
  await form.getByRole("checkbox", { name: "Create another" }).uncheck();
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await until(async () => (await snapshot()).tasks.length === 5);
  const final = await snapshot(),
    first = final.tasks.find((t) => t.title === "Repeat one"),
    second = final.tasks.find((t) => t.title === "Repeat two");
  for (const task of [first, second]) {
    assert.equal(task.parent, parent.id);
    assert.equal(task.priority, "high");
    assert.equal(task.status, "review");
    assert.equal(task.assignee, "Alice");
    assert.equal(task.due, "2026-10-30");
    assert.equal(task.estimate, null);
  }
  assert.equal(second.body.trim(), "");
  assert.equal(final.tasks.filter((t) => t.parent === first.id).length, 2);
  assert.equal(final.tasks.filter((t) => t.parent === second.id).length, 0);
  assert.equal(
    final.boards[0].nodes.filter((n) => n.type === "task").length,
    2,
  );
  await page.setViewportSize({ width: 1500, height: 1000 });
  await selectProjectView(page, "list");
  await page.locator("[data-action=task-new]").first().click();
  assert.equal(
    await form.getByText("Planning & relationships", { exact: true }).count(),
    0,
  );
  await form.locator("[name=title]").fill("List repeated task");
  await form.getByRole("checkbox", { name: "Create another" }).check();
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await until(
    async () => (await form.locator("[name=title]").inputValue()) === "",
  );
  assert.equal(await page.locator("dialog:modal").count(), 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: creation order, no planning, create-another retention/reset, draft checkbox, failed save retains content, fresh request IDs, subtasks once, unchanged camera, mobile and shared List modal",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-create-another-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
