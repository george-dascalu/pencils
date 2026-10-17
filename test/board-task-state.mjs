import { selectProjectView } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-card-state-ui-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Card availability" });
const archived = await store.createTask(project.id, { title: "Archived card" });
const live = await store.createTask(project.id, { title: "Soon deleted" });
const board = (await store.snapshot(project.id)).boards[0];
await store.updateTask(project.id, archived.id, {
  revision: archived.revision,
  archived: true,
});
await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "archived-card",
      type: "task",
      task: archived.id,
      x: 100,
      y: 100,
      w: 340,
      h: 270,
    },
    {
      id: "deleted-card",
      type: "task",
      task: live.id,
      x: 500,
      y: 100,
      w: 340,
      h: 270,
    },
    {
      id: "note-card",
      type: "task",
      task: live.id,
      displayAs: "note",
      x: 100,
      y: 420,
      w: 340,
      h: 270,
    },
    {
      id: "missing-card",
      type: "task",
      task: "t-missing",
      x: 500,
      y: 420,
      w: 340,
      h: 270,
    },
  ],
  edges: [{ id: "link", from: "archived-card", to: "deleted-card" }],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const node = (id) => page.locator(`[data-node="${id}"]`);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  assert.equal(
    await page.locator("[data-view=tasks] .tab-count").textContent(),
    "1",
  );
  await page.locator("[data-view=board]").click();
  await node("archived-card").getByText("Archived", { exact: true }).waitFor();
  await node("missing-card")
    .getByText("Task unavailable", { exact: true })
    .first()
    .waitFor();
  assert.equal(
    await node("deleted-card").locator("select[data-canvas-status]").count(),
    1,
  );
  await store.deleteTask(project.id, live.id, live.revision);
  // Polling replaces the rendered card without a manual reload.
  await node("deleted-card")
    .getByText("Deleted task", { exact: true })
    .waitFor();
  await node("note-card").getByText("Deleted task", { exact: true }).waitFor();
  assert.ok((await node("deleted-card").innerText()).includes(live.key));
  assert.ok((await node("deleted-card").innerText()).includes(live.title));
  assert.equal(
    await node("deleted-card")
      .locator("select,[data-inline-title],[data-pro=task-details]")
      .count(),
    0,
  );
  assert.equal(
    await page.locator('[data-edge="link"] .canvas-edge').count(),
    1,
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1050 });
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
      await page.screenshot({
        path: `/tmp/pencils-task-availability-${width}-${theme}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await node("deleted-card")
    .getByRole("button", { name: "Restore task", exact: true })
    .click();
  await node("deleted-card").locator("select[data-canvas-status]").waitFor();
  assert.equal(
    await node("deleted-card").locator(".board-task-availability").count(),
    0,
  );
  await node("note-card").locator(".node-text").waitFor({ state: "attached" });
  assert.equal(
    await node("note-card").locator(".board-task-availability").count(),
    0,
  );
  await node("archived-card")
    .getByRole("button", { name: "Unarchive", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !document.querySelector(
        '[data-node="archived-card"] .board-task-availability',
      ),
  );
  await selectProjectView(page, "list");
  await page.waitForFunction(
    () =>
      document.querySelector("[data-view=tasks] .tab-count")?.textContent ===
      "2",
  );
  await page.reload();
  assert.equal(
    await page.locator("[data-view=tasks] .tab-count").textContent(),
    "2",
  );
  const final = await store.snapshot(project.id);
  assert.equal(final.tasks.find((t) => t.id === archived.id).archived, false);
  assert.equal(final.boards[0].nodes.length, 4);
  assert.equal(final.boards[0].edges[0].id, "link");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: archived badges, deleted card/note placeholders, live deletion refresh, missing-file distinction, restore, connectors and responsive themes",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
