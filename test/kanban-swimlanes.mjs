import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { selectProjectView } from "./menu-controls.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-swimlanes-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Kanban swimlanes" });
const a = await store.createTask(project.id, {
  title: "Design the compact cards",
  status: "todo",
  assignee: "George",
  priority: "high",
});
const b = await store.createTask(project.id, {
  title: "Review the plan",
  status: "todo",
  assignee: "Pat",
  priority: "low",
  type: "bug",
});
await store.createTask(project.id, {
  title: "Unassigned work",
  status: "backlog",
});
const imported = await store.createTask(project.id, {
  title: "Source task",
  status: "todo",
  assignee: "George",
  priority: "high",
});
const file = store.file(project.id, "tasks", imported.id),
  record = await store.read(file);
await store.write(
  file,
  {
    ...record.data,
    source: { provider: "jira", external_id: "one", key: "JIRA-1" },
  },
  record.body,
  record,
);
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const kind = process.env.BROWSER || "chromium",
  browser = await { chromium, firefox, webkit }[kind].launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  hasTouch: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const url = `http://127.0.0.1:${server.address().port}/#project/${project.id}/kanban`;
const board = page.locator("#view-content > .kanban"),
  group = page.locator("#kanban-group");
const lane = (value) =>
  page.locator(`.kanban-lane[data-lane-value="${value}"]`);
const column = (value, status) =>
  lane(value).locator(`[data-drop-status="${status}"]`);
const card = (id) => page.locator(`[data-drag-task="${id}"]`);
const snapshot = async () => (await store.snapshot(project.id)).tasks;
const reload = async () => {
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.evaluate(() => location.reload()),
  ]);
  await group.waitFor();
};
async function move(id, value, status) {
  const response = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith(`/tasks/${id}`),
  );
  await card(id).dragTo(column(value, status));
  assert.equal((await response).status(), 200);
  await column(value, status).locator(`[data-drag-task="${id}"]`).waitFor();
}
async function fits() {
  const metrics = await board.evaluate((el) => ({
    width: el.clientWidth,
    scrollWidth: el.scrollWidth,
    height: el.clientHeight,
    bottom: el.getBoundingClientRect().bottom,
    parent: el.parentElement.getBoundingClientRect().bottom,
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
  }));
  assert.ok(metrics.height > 200 && metrics.parent - metrics.bottom < 20);
  assert.ok(
    metrics.pageWidth <= metrics.viewportWidth &&
      metrics.pageHeight <= metrics.viewportHeight + 1,
  );
  const rows = await page
    .locator(".kanban-lane-row")
    .evaluateAll((els) =>
      els
        .filter((el) => !el.hidden)
        .map((el) => [...el.children].map((c) => c.getBoundingClientRect().x)),
    );
  assert.ok(
    rows.every((row) => row.every((x, i) => Math.abs(x - rows[0][i]) < 2)),
    "Status columns align in every lane",
  );
}
try {
  await page.goto(url);
  await group.waitFor();
  assert.equal(await group.inputValue(), "none");
  const initial = await snapshot();
  await group.selectOption("assignee");
  assert.equal(await page.locator(".kanban-lane").count(), 3);
  assert.equal(await lane("George").locator(".kanban-card").count(), 2);
  assert.equal(
    await lane("").locator(".kanban-lane-heading").textContent(),
    "Unassigned1",
  );
  assert.deepEqual(await snapshot(), initial, "Grouping does not edit tasks");
  await column("Pat", "in-progress").locator(".add-row").click();
  await page.locator("#task-form").waitFor({ timeout: 5000 });
  assert.equal(
    await page.locator("#task-form [name=assignee]").inputValue(),
    "Pat",
  );
  assert.equal(
    await page.locator("#task-form [name=status]").inputValue(),
    "in-progress",
  );
  await page.locator('[data-action="dialog-close"]').click();
  await lane("George").locator("[data-kanban-collapse]").click();
  assert.ok(await lane("George").locator(".kanban-lane-row").isHidden());
  await reload();
  assert.equal(await group.inputValue(), "assignee");
  assert.ok(await lane("George").locator(".kanban-lane-row").isHidden());
  await lane("George").locator("[data-kanban-collapse]").click();
  await move(a.id, "Pat", "in-progress");
  let tasks = await snapshot();
  assert.equal(tasks.find((t) => t.id === a.id).assignee, "Pat");
  assert.equal(tasks.find((t) => t.id === a.id).priority, "high");
  assert.equal(tasks.find((t) => t.id === b.id).status, "todo");
  await card(imported.id).dragTo(column("Pat", "in-progress"));
  assert.ok(
    await lane("George")
      .locator(`[data-drag-task="${imported.id}"]`)
      .isVisible(),
  );
  assert.equal(
    (await snapshot()).find((t) => t.id === imported.id).assignee,
    "George",
  );
  await group.selectOption("priority");
  await move(a.id, "low", "in-progress");
  assert.equal((await snapshot()).find((t) => t.id === a.id).priority, "low");
  await group.selectOption("type");
  await move(a.id, "bug", "in-progress");
  assert.equal((await snapshot()).find((t) => t.id === a.id).type, "bug");
  await group.selectOption("priority");
  await page.locator('[data-feature="view-save"]').click();
  await page.locator("#view-form [name=name]").fill("By priority");
  await page.locator("#view-form [name=scope]").selectOption("project");
  await page.locator("#view-form [type=submit]").click();
  await page.locator("#view-form").waitFor({ state: "detached" });
  const view = (await store.snapshot(project.id)).project.views.find(
    (v) => v.name === "By priority",
  );
  assert.equal(view.kanbanGroupBy, "priority");
  await group.selectOption("none");
  assert.equal(await page.locator(".kanban-lane").count(), 0);
  await page.locator("#saved-view").selectOption(view.id);
  assert.equal(await group.inputValue(), "priority");
  await page.locator("#search").fill("No matching cards");
  await page.waitForFunction(() => !document.querySelector(".kanban-card"));
  assert.equal(await page.locator(".kanban-lane").count(), 1);
  await fits();
  await page.locator("#search").fill("");
  await card(a.id).waitFor();
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await fits();
      await page.screenshot({
        path: `/tmp/pencils-swimlanes-${kind}-${width}-${theme}.png`,
        animations: "disabled",
      });
    }
  }
  await page.locator(".kanban-card .card-bottom").first().tap();
  await page.locator("#task-form").waitFor();
  await page.locator('[data-action="dialog-close"]').click();
  await page.setViewportSize({ width: 1600, height: 1000 });
  for (let i = 0; i < 20; i++)
    await store.createTask(project.id, {
      title: `Extra ${i}`,
      status: "todo",
      priority: "high",
    });
  await reload();
  await page.waitForFunction(
    () => document.querySelectorAll(".kanban-card").length >= 24,
  );
  const header = await page.locator(".kanban-lanes-header").boundingBox();
  await board.evaluate((el) => (el.scrollTop = 300));
  assert.ok(
    Math.abs(
      (await page.locator(".kanban-lanes-header").boundingBox()).y - header.y,
    ) < 2,
  );
  await page.waitForFunction(() => history.state?.scroll?.kanbanY >= 300);
  await selectProjectView(page, "overview");
  await page.goBack();
  await page.waitForFunction(
    () => document.querySelector(".kanban")?.scrollTop >= 300,
  );
  assert.equal(await group.inputValue(), "priority");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Kanban swimlanes, lane defaults/collapse/persistence/saved views, cross-lane status and field updates, protected source fields, full-size aligned rows and sticky headers, Back restoration, touch opening and responsive themes.",
  );
} catch (error) {
  console.error(errors, await page.locator(".toast").allTextContents());
  await page.screenshot({ path: "/tmp/pencils-swimlanes-error.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await store.queue;
  await fs.rm(root, { recursive: true, force: true });
}
