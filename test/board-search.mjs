import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-search-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Search board" });
const task = await store.createTask(project.id, {
  title: "Find this task",
  assignee: "Alice",
});
let board = (await store.snapshot(project.id)).boards[0];
await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    { id: "task", type: "task", task: task.id, x: 500, y: 300, w: 310, h: 240 },
    {
      id: "note",
      type: "sticky",
      text: "Distant idea",
      x: 5000,
      y: 3000,
      w: 240,
      h: 200,
    },
  ],
});
const before = await store.snapshot(project.id);
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "webkit" ? webkit : process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  const button = page.locator('[data-pro="search-toggle"]');
  const panel = page.locator("#canvas-search-panel");
  const field = page.locator("#canvas-find");
  assert.ok(await panel.isHidden());
  assert.equal(await button.getAttribute("aria-expanded"), "false");
  await button.click();
  assert.ok(await field.evaluate((el) => el === document.activeElement));
  await field.fill("Distant idea");
  await page.locator('#canvas-find-results [data-id="note"]').click();
  assert.ok(await panel.isHidden());
  await page.locator('[data-node="note"]').waitFor({ state: "visible" });
  await button.click();
  await page.locator('[data-pro="return-viewport"]').click();
  assert.ok(await panel.isHidden());
  await page.keyboard.press("Control+f");
  assert.ok(await field.evaluate((el) => el === document.activeElement));
  await page.locator("#canvas-owner").fill("Alice");
  await page.locator("#canvas-status").selectOption("todo");
  await page.keyboard.press("Escape");
  assert.ok(await panel.isHidden());
  assert.ok(await button.evaluate((el) => el === document.activeElement));
  assert.ok(
    await button.evaluate((el) => el.classList.contains("has-filters")),
  );
  await button.click();
  assert.equal(await page.locator("#canvas-owner").inputValue(), "Alice");
  await page.locator("#canvas-owner").fill("");
  await page.locator("#canvas-status").selectOption("");
  assert.ok(
    !(await button.evaluate((el) => el.classList.contains("has-filters"))),
  );
  await page.locator("#canvas").click({ position: { x: 800, y: 100 } });
  assert.ok(await panel.isHidden());
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await button.click();
      const box = await panel.boundingBox();
      assert.ok(box.height < 550, "Object navigator stays bounded");
      assert.ok(box.x >= 0 && box.x + box.width <= width, JSON.stringify(box));
      assert.ok(await page.locator("#canvas-status").isVisible());
      await page.screenshot({
        path: `/tmp/pencils-search-${width}-${theme}.png`,
      });
      await button.click();
      assert.ok(await panel.isHidden());
    }
  }
  await page.reload();
  assert.ok(await panel.isHidden());
  // Start a remote refresh, then focus search while its project response is in flight.
  await page.waitForTimeout(800);
  let unblock, reached;
  const gate = new Promise((r) => {
    unblock = r;
  });
  const intercepted = new Promise((r) => {
    reached = r;
  });
  let delayed = false;
  await page.route(`**/api/projects/${project.id}`, async (route) => {
    if (!delayed && route.request().method() === "GET") {
      delayed = true;
      const response = await route.fetch();
      reached();
      await gate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  store.changed();
  await Promise.race([
    intercepted,
    new Promise((_, reject) =>
      setTimeout(() => reject(Error("Refresh was not requested")), 5000),
    ),
  ]);
  await button.click();
  await field.fill("Keep this search");
  await field.evaluate((el) => (el.dataset.refreshProbe = "same"));
  unblock();
  await page.waitForTimeout(1000);
  assert.equal(await field.inputValue(), "Keep this search");
  assert.equal(await field.getAttribute("data-refresh-probe"), "same");
  assert.ok(
    await field.evaluate((el) => el === document.activeElement),
    "In-flight refresh does not steal search focus",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !document.querySelector("#canvas-find")?.dataset.refreshProbe,
    { timeout: 5000 },
  );
  await page.unroute(`**/api/projects/${project.id}`);
  const after = await store.snapshot(project.id);
  assert.deepEqual(after.boards, before.boards);
  assert.deepEqual(after.tasks, before.tasks);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: collapsed search, toolbar toggle, keyboard focus/Escape, result navigation, filter indicator, outside dismissal, mobile and themes; board data unchanged.",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
