import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-task-drag-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Task drag" });
const task = await store.createTask(project.id, {
  title: "Design the task browser",
  type: "story",
  assignee: "George",
  status: "review",
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const isFirefox = process.env.BROWSER === "firefox";
const browser = await (isFirefox ? firefox : chromium).launch({
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1500, height: 1000 },
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const snapshot = () => store.snapshot(project.id);
const nodes = async () => (await snapshot()).boards[0].nodes;
const until = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out");
};
const row = () =>
  page.locator(
    `#board-task-panel [data-action=board-pick][data-id="${task.id}"]`,
  );
const start = async () => {
  const r = await row().boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await page.locator("[data-view=board]").click();
  const c = await page.locator("#canvas").boundingBox(),
    x = c.x + c.width * 0.72,
    y = c.y + c.height * 0.55;
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 280);
  await page.waitForTimeout(300);
  // Pan to exercise both the translation and scale conversion.
  await page.keyboard.down("Space");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 65, y + 40, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await page.locator("[data-action=board-task]").click();
  const camera = await page.locator("#canvas-world").getAttribute("style");
  await start();
  await page.mouse.move(x, y, { steps: 10 });
  await page.locator(".task-drop-preview").waitFor();
  assert.match(
    await page.locator(".task-drop-preview").innerText(),
    /Design the task browser/,
  );
  assert.equal((await nodes()).length, 0);
  const preview = await page.locator(".task-drop-preview").boundingBox();
  await page.screenshot({ path: "/tmp/pencils-task-drag-preview.png" });
  await page.mouse.up();
  await until(async () => (await nodes()).length === 1);
  const placed = (await nodes())[0];
  assert.equal(placed.task, task.id);
  const box = await page.locator(`[data-node="${placed.id}"]`).boundingBox();
  assert.ok(
    Math.abs(box.x - preview.x) < 3 && Math.abs(box.y - preview.y) < 3,
    "Drop matches preview at zoom/pan",
  );
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    camera,
  );
  assert.equal(await page.locator(".task-drop-preview").count(), 0);
  assert.ok(
    await page
      .locator(`[data-node="${placed.id}"]`)
      .evaluate((el) => document.activeElement === el),
  );
  assert.equal((await snapshot()).tasks.length, 1);
  // Escape, invalid canvas chrome, and off-board drops must neither place nor click-add.
  for (const mode of ["escape", "outside", "panel"]) {
    await start();
    await page.mouse.move(x, y, { steps: 6 });
    if (mode === "escape") await page.keyboard.press("Escape");
    else if (mode === "outside") await page.mouse.move(5, 5, { steps: 3 });
    else {
      const r = await row().boundingBox();
      await page.mouse.move(r.x + 15, r.y + 15, { steps: 3 });
    }
    await page.mouse.up();
    assert.equal(await page.locator(".task-drop-preview").count(), 0);
    assert.equal((await nodes()).length, 1);
  }
  await page.locator("[data-action=board-undo]").click();
  await until(async () => (await nodes()).length === 0);
  assert.equal((await snapshot()).tasks.length, 1);
  await page.locator("[data-action=board-redo]").click();
  await until(async () => (await nodes()).length === 1);
  // A click still adds a linked card, even immediately after a completed drag.
  await row().click();
  await until(async () => (await nodes()).length === 2);
  if (!isFirefox) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () =>
        document.querySelector(".sidebar").getBoundingClientRect().right <= 1,
    );
    await page.evaluate(() =>
      window.PencilsAppearance.write({ theme: "dark" }),
    );
    const r = await row().boundingBox(),
      client = await context.newCDPSession(page);
    const source = { x: r.x + 30, y: r.y + r.height / 2 };
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [source],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: source.x + 35, y: source.y }],
    });
    await page.locator(".task-drop-preview").waitFor();
    assert.equal(
      await page
        .locator("#board-task-panel")
        .evaluate((el) => getComputedStyle(el).opacity),
      "0",
    );
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 240, y: 420 }],
    });
    await page.screenshot({ path: "/tmp/pencils-task-drag-mobile.png" });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await until(async () => (await nodes()).length === 3);
    assert.equal(
      await page
        .locator("#board-task-panel")
        .evaluate((el) => getComputedStyle(el).opacity),
      "1",
    );
  }
  await page.reload();
  await page.locator("#canvas").waitFor();
  assert.equal((await nodes()).length, isFirefox ? 2 : 3);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: linked task drag/drop, scaled preview, no camera changes, cancel/invalid drops, undo/redo, click fallback, persistence" +
      (!isFirefox ? ", mobile touch/dark mode" : "") +
      ".",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-task-drag-error.png" });
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
