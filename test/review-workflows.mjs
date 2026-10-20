import { selectSettingsPage } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { clickControl } from "./menu-controls.mjs";
const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pencils-workflow-review-"),
  ),
  store = new Store(root);
await store.init();
const p = await store.createProject({ title: "Review workflows" }),
  a = await store.createTask(p.id, { title: "First task" }),
  b = await store.createTask(p.id, { title: "Second task" }),
  original = (await store.snapshot(p.id)).boards[0];
await store.updateBoard(p.id, original.id, {
  revision: original.revision,
  nodes: [a, b]
    .map((t, i) => ({
      id: `node-${i}`,
      type: "task",
      task: t.id,
      x: 140 + i * 390,
      y: 150,
      w: 340,
      h: 240,
    }))
    .concat([
      {
        id: "missing",
        type: "task",
        task: "t-missing",
        x: 140,
        y: 440,
        w: 340,
        h: 240,
      },
    ]),
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await { chromium, firefox, webkit }[
    process.env.BROWSER || "chromium"
  ].launch(),
  page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator('[data-view="board"]').click();
  await clickControl(page.locator('[data-pro="connections"]'));
  await page
    .locator('#keyboard-connector [name="from"]')
    .selectOption("node-0");
  await page.locator('#keyboard-connector [name="to"]').selectOption("node-1");
  await page
    .locator('#keyboard-connector [name="relationship"]')
    .selectOption("blocks");
  await page.locator('#keyboard-connector [name="label"]').fill("Ready before");
  await page.locator('#keyboard-connector button[type="submit"]').click();
  await page.locator("#keyboard-connector").waitFor({ state: "detached" });
  let snapshot = await store.snapshot(p.id);
  assert.deepEqual(snapshot.tasks.find((t) => t.id === b.id).dependencies, [
    a.id,
  ]);
  assert.equal(snapshot.boards[0].edges[0].fromSide, "right");
  assert.equal(snapshot.boards[0].edges[0].toSide, "left");
  await page.locator('[data-pro="task-detach"]').click();
  await page.waitForTimeout(650);
  snapshot = await store.snapshot(p.id);
  assert.equal(
    snapshot.boards[0].nodes.find((n) => n.id === "missing").type,
    "sticky",
  );
  await page.locator('[data-action="project-edit"]').click();
  await selectSettingsPage(page, "automation");
  await page.locator('[data-automation="add"]').click();
  await page.locator('#automation-form [name="name"]').fill("Set important");
  await page.locator('#automation-form [name="value"]').selectOption("high");
  await page
    .locator(
      '#automation-form button[type="submit"]',
    )
    .click();
  await page.locator('[data-automation="toggle"]').click();
  await page.locator('[data-automation="preview"]').click();
  await page.locator("#automation-apply").click();
  await page.locator("#automation-apply").waitFor({ state: "detached" });
  await page.locator('[data-automation="preview"]').waitFor();
  assert.ok(
    (await store.snapshot(p.id)).tasks.every((t) => t.priority === "high"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: keyboard dependency creation, unavailable-card detach and automation preview/apply.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
