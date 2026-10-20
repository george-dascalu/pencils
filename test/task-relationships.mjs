import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { relationshipTypes } from "../public/task-relationship-model.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-relationships-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Relationships" });
const parent = await store.createTask(project.id, {
  title: "Release",
  type: "epic",
});
const main = await store.createTask(project.id, {
  title: "Build",
  parent: parent.id,
});
const child = await store.createTask(project.id, {
  title: "Test with a long title that wraps correctly in narrow panels",
});
const blocker = await store.createTask(project.id, { title: "Design" });
const successor = await store.createTask(project.id, {
  title: "Ship",
  dependencies: [blocker.id],
});
const related = await store.createTask(project.id, { title: "Notes", assignee: "George", priority: "high", status: "in-progress" });
const urgent = await store.createTask(project.id, { title: "Urgent follow-up", assignee: "Alice", priority: "urgent", status: "done" });
const lowest = await store.createTask(project.id, { title: "Later", priority: "none", status: "backlog" });
const board = (await store.snapshot(project.id)).boards[0];
await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    { id: "build", type: "task", task: main.id, x: 80, y: 100, w: 280, h: 220 },
  ],
});
const server = createServer(store);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "webkit" ? webkit : chromium
).launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const saved = async (id) =>
  (await store.snapshot(project.id)).tasks.find((task) => task.id === id);
async function until(check) {
  for (let i = 0; i < 160; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error("Timed out waiting for relationship save");
}
const section = page.getByRole("region", {
  name: "Relationships",
  exact: true,
});
async function picker(kind, query = "") {
  if (!(await section.locator("[data-relationship-picker]").isVisible()))
    await section.locator("[data-relationship-toggle]").click();
  await section.getByLabel("Relationship type", { exact: true }).click();
  await page
    .locator("#shared-select-menu")
    .getByRole("option", {
      name: relationshipTypes.find(([value]) => value === kind)[1],
      exact: true,
    })
    .click();
  await section.getByLabel("Find a task to link", { exact: true }).fill(query);
}
async function add(kind, task) {
  await picker(kind, task.key);
  await section.locator(`[data-relationship-add="${task.id}"]`).click();
  await until(
    async () =>
      !(await section.locator("[data-relationship-picker]").isVisible()),
  );
}
const row = (kind, task) =>
  section.locator(
    `[data-relationship-remove="${task.id}"][data-relationship-kind="${kind}"]`,
  );
try {
  await page.goto(base);
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await page
    .locator(`[data-action=task-open][data-id="${main.id}"]`)
    .first()
    .click();
  await section.waitFor();
  assert.equal(await row("parent", parent).count(), 1);
  await page
    .locator('.task-description [contenteditable="true"]')
    .fill("Keep these description edits");
  await add("child", child);
  await until(async () => (await saved(child.id)).parent === main.id);
  assert.match((await saved(main.id)).body, /Keep these description edits/);
  await add("blocked-by", blocker);
  await until(async () =>
    (await saved(main.id)).dependencies?.includes(blocker.id),
  );
  await add("blocks", successor);
  await until(async () =>
    (await saved(successor.id)).dependencies?.includes(main.id),
  );
  assert.ok(
    (await saved(successor.id)).dependencies.includes(blocker.id),
    "Existing blockers survive",
  );
  await add("related", related);
  await until(async () =>
    (await saved(main.id)).related_records?.includes(related.id),
  );
  await add("related", urgent);
  await add("related", lowest);
  const relatedGroup = section.locator(".task-relationship-group").filter({ has: page.getByRole("heading", { name: "Related to", exact: true }) });
  const relatedOrder = () => relatedGroup.locator("[data-relationship-open]").evaluateAll(els => els.map(el => el.dataset.relationshipOpen));
  const beforeSort = (await store.snapshot(project.id)).tasks;
  const meta = section.locator(`[data-relationship-open="${related.id}"] .task-relationship-metadata`);
  assert.match(await meta.textContent(), /George.*High.*In progress/);
  assert.equal(await meta.locator('[data-task-color="assignee"],[data-task-color="priority"],[data-task-color="status"]').count(), 3);
  await section.getByLabel("Sort relationships", { exact: true }).selectOption("assignee");
  assert.deepEqual(await relatedOrder(), [urgent.id, related.id, lowest.id]);
  await section.getByLabel("Sort relationships", { exact: true }).selectOption("priority");
  assert.deepEqual(await relatedOrder(), [urgent.id, related.id, lowest.id]);
  await section.getByRole("button", { name: "Reverse relationship sort" }).click();
  assert.deepEqual(await relatedOrder(), [lowest.id, related.id, urgent.id]);
  await section.getByLabel("Sort relationships", { exact: true }).selectOption("status");
  assert.deepEqual(await relatedOrder(), [lowest.id, related.id, urgent.id]);
  assert.deepEqual((await store.snapshot(project.id)).tasks, beforeSort, "Sorting never changes task data");
  await row("related", urgent).click();
  await until(async () => await row("related", urgent).count() === 0);
  await row("related", lowest).click();
  await until(async () => await row("related", lowest).count() === 0);
  await picker("parent", child.key);
  assert.ok(
    await section.locator(`[data-relationship-add="${child.id}"]`).isDisabled(),
  );
  assert.match(
    await section.locator("[data-relationship-options]").textContent(),
    /parent\/child cycle/,
  );
  await picker("blocked-by", successor.key);
  assert.ok(
    await section
      .locator(`[data-relationship-add="${successor.id}"]`)
      .isDisabled(),
  );
  await page.getByLabel("Find a task to link", { exact: true }).press("Escape");
  assert.ok(await page.locator(".task-dialog").isVisible());
  assert.ok(await section.locator("[data-relationship-picker]").isHidden());
  // Related links appear from either endpoint and can be removed there.
  await section.locator(`[data-relationship-open="${related.id}"]`).click();
  await page.waitForFunction(
    (id) => document.querySelector("#task-form")?.dataset.id === id,
    related.id,
  );
  assert.equal(await row("related", main).count(), 1);
  await row("related", main).click();
  await until(
    async () => !(await saved(main.id)).related_records?.includes(related.id),
  );
  await page.locator("[data-action=dialog-close]").click();
  await page
    .locator(`[data-action=task-open][data-id="${main.id}"]`)
    .first()
    .click();
  for (const [kind, target] of [
    ["parent", parent],
    ["child", child],
    ["blocked-by", blocker],
    ["blocks", successor],
  ]) {
    await row(kind, target).click();
    await until(async () => (await row(kind, target).count()) === 0);
  }
  assert.equal((await saved(main.id)).parent, null);
  assert.equal((await saved(child.id)).parent, null);
  assert.deepEqual((await saved(main.id)).dependencies, []);
  assert.deepEqual((await saved(successor.id)).dependencies, [blocker.id]);
  // A failed save is visible and retained for the shared queue's retry.
  await page.route(
    `**/api/projects/${project.id}/tasks/${child.id}`,
    (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Relationship test outage" }),
          })
        : route.continue(),
  );
  await add("child", child);
  await until(async () =>
    /outage/.test(
      await section.locator("[data-relationship-status]").textContent(),
    ),
  );
  assert.equal((await saved(child.id)).parent, null);
  await page.unroute(`**/api/projects/${project.id}/tasks/${child.id}`);
  await until(async () => (await saved(child.id)).parent === main.id);
  await until(async () =>
    /saved/.test(
      await section.locator("[data-relationship-status]").textContent(),
    ),
  );
  await page.locator("[data-action=dialog-close]").click();
  await page.locator("[data-view=board]").click();
  await page.locator('[data-node="build"] [data-pro="task-details"]').click();
  assert.equal(await row("child", child).count(), 1);
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 780)
      await page.waitForFunction(
        () =>
          document.querySelector(".sidebar").getBoundingClientRect().right <= 1,
      );
    await picker("blocked-by", blocker.key);
    await section.scrollIntoViewIfNeeded();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) => (document.documentElement.dataset.theme = value),
        theme,
      );
      assert.ok(
        await section.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      );
      const box = await section.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
      await page.screenshot({
        path: `/tmp/pencils-relationships-${width}-${theme}.png`,
      });
    }
    await section
      .getByRole("button", { name: "Close relationship picker", exact: true })
      .click();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: relationship add/remove in both directions, existing data retained, cycle prevention, linked-task navigation, failed save retry, Board editor, mobile and themes.",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-relationships-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
