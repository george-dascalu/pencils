import { legacySubtasks } from "./task-editor-helpers.mjs";
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
  assert.equal(await form.locator("[name=priority]").inputValue(), "medium");
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
  await form.locator("[name=dependencies]").evaluate((select, id) => { select.value = id; select.dispatchEvent(new Event("change", { bubbles: true })); }, parent.id);
  // A parent inherited from task creation or a restored browser draft stays intact.
  await form.locator("[name=parent]").evaluate((input, id) => { input.value = id; input.dispatchEvent(new Event("input", { bubbles: true })); }, parent.id);
  await form.locator("[name=status]").selectOption("review");
  await form.locator("[name=assignee]").selectOption("Alice");
  await form.locator("[name=due]").fill("2026-10-30");
  await form.locator("[name=title]").fill("Repeat one");
  await form
    .locator('[aria-label="Task description"]')
    .fill("Only the first description");
  await legacySubtasks(form, [{ title: "Queued child", type: "task" }, { title: "Typed child", type: "task" }]);
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
    await page.waitForFunction(() => document.querySelector(".board-task-editor").getBoundingClientRect().right <= innerWidth);
    const { priority, status, assignee, start, due } = await form.evaluate(form => {
      const rect = selector => form.querySelector(selector).getBoundingClientRect().toJSON();
      return { priority: rect("[data-task-picker=priority]"), status: rect("[name=status]"), assignee: rect("[name=assignee]"), start: rect(".date-field:has([name=start])"), due: rect(".date-field:has([name=due])") };
    });
    assert.ok(assignee.x < priority.x && priority.x < status.x);
    assert.ok(
      Math.abs(priority.y - status.y) < 2 &&
        Math.abs(status.y - assignee.y) < 2,
      JSON.stringify({width, priority, status, assignee}),
    );
    assert.ok(
      start.y > status.y &&
        Math.abs(start.y - due.y) < 2 &&
        start.x < due.x,
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
  assert.deepEqual(first.dependencies, [parent.id]);
  assert.deepEqual(second.dependencies, []);
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
  assert.equal(await page.locator("dialog:modal").count(), 0);
  await form.locator("[name=title]").press("Escape");
  assert.equal((await snapshot()).tasks.length, 6);
  assert.equal(
    (await snapshot()).boards[0].nodes.filter((n) => n.type === "task").length,
    2,
  );

  // Every creation entry point shares the board's compact, non-blocking layout.
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const view of [
        "board",
        "overview",
        "list",
        "tree",
        "table",
        "kanban",
        "calendar",
        "timeline",
        "capacity",
      ]) {
        await selectProjectView(page, view);
        await page.locator("[data-action=task-new]").first().click();
        await form.waitFor();
        assert.equal(await form.locator("[name=priority]").inputValue(), "medium");
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const dialog = page.locator(".task-dialog");
        const box = await dialog.boundingBox();
        const footer = await form.locator(".task-editor-foot").boundingBox();
        const toolbar = await page.locator("#view-toolbar").boundingBox();
        const context = `${view}, ${width}px, ${theme}`;
        assert.ok(
          box.width <= 400 && box.height <= 760,
          `Compact panel: ${context}`,
        );
        assert.ok(
          box.x >= 12 && box.x + box.width <= width - 12,
          `Fits width: ${context}`,
        );
        assert.ok(
          box.y >= toolbar.y + toolbar.height && box.y + box.height <= 984,
          `Below toolbar, within viewport: ${context}`,
        );
        assert.ok(
          footer.y >= box.y && footer.y + footer.height <= box.y + box.height,
          `Footer stays inside: ${context}`,
        );
        assert.equal(await page.locator("dialog:modal").count(), 0);
        assert.equal(await dialog.locator(".task-panel-resizer").count(), 0);
        assert.equal(
          await form
            .locator("[name=title]")
            .evaluate((el) => el === document.activeElement),
          true,
        );
        assert.ok(
          await form.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        );
        assert.ok(
          await form
            .getByRole("checkbox", { name: "Create another" })
            .isVisible(),
        );
        assert.ok(
          await form
            .getByRole("button", { name: "Create task", exact: true })
            .isVisible(),
        );
        await form.locator(".task-description").scrollIntoViewIfNeeded();
        assert.ok(
          await form.locator(".task-description").isVisible(),
          `Lower fields reachable: ${context}`,
        );
        await form.locator("[name=title]").focus();
        await form
          .locator(".task-editor-content > .dialog-body")
          .evaluate((el) => {
            el.scrollTop = 0;
          });
        if (["table", "calendar"].includes(view))
          await page.screenshot({
            path: `/tmp/pencils-new-task-${view}-${width}-${theme}.png`,
          });
        await form.locator("[name=title]").press("Escape");
        await form.waitFor({ state: "detached" });
        if (view !== "board")
          assert.ok(
            await page
              .locator("[data-action=task-new]")
              .first()
              .evaluate((el) => el === document.activeElement),
            `Focus returns: ${context}`,
          );
      }
    }
  }
  assert.equal(
    (await snapshot()).tasks.length,
    6,
    "Opening and closing creates no tasks",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: create-another retention/reset, failed save retains content, subtasks once, unchanged camera, shared compact creation across all nine views, desktop/mobile, both themes and keyboard focus",
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
