import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-project-ids-")),
  store = new Store(root);
await store.init();
const p = await store.createProject({ title: "Website", key: "WEB" }),
  task = await store.createTask(p.id, { title: "Original task" }),
  server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await page.waitForTimeout(70);
  }
  throw Error("Save did not settle");
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  assert.match(await page.locator("#view-content").innerText(), /WEB-1/);
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.locator(".project-settings-page [name=key]").fill("APP");
  await page.locator("#project-form [type=submit]").click();
  await until(async () => (await store.snapshot(p.id)).project.key === "APP");
  assert.equal((await store.snapshot(p.id)).tasks[0].key, "APP-1");
  await page.locator("[data-view=board]").click();
  await page.locator("[data-board-menu=add] > summary").click();
  await page.locator("[data-action=board-task]").click();
  await page.locator("#board-task-search").fill("APP-1");
  await page.locator("[data-action=board-pick]").click();
  await until(async () =>
    (await store.snapshot(p.id)).boards[0].nodes.some(
      (n) => n.task === task.id,
    ),
  );
  assert.match(await page.locator(".board-node.task").innerText(), /APP-1/);
  await page.locator("[data-board-menu=add] > summary").click();
  await page.locator("[data-action=board-task]").click();
  await page.locator("[data-action=board-create-task]").click();
  await page.locator("#task-form [name=title]").fill("Created on board");
  await page.locator("#task-form [type=submit]").click();
  await until(
    async () =>
      (await store.snapshot(p.id)).tasks.length === 2 &&
      (await store.snapshot(p.id)).boards[0].nodes.length === 2,
  );
  await page.locator("[data-view=list]").click();
  assert.match(
    await page.locator("#view-content").innerText(),
    /Created on board/,
  );
  assert.match(await page.locator("#view-content").innerText(), /APP-2/);
  await page
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  await page.screenshot({ path: "/tmp/pencils-project-settings-page.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await page.locator("#project-form [name=key]").waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({ path: "/tmp/pencils-project-settings-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: settings page, project key rename, task IDs, picker and board-created tasks share project records.",
  );
} catch (e) {
  await page.screenshot({
    path: "/tmp/pencils-project-identities-failure.png",
  });
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  store.close?.();
  await fs.rm(root, { recursive: true, force: true });
}
