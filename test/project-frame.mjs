import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-project-frame-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Project frame lab" });
const parent = await store.createTask(project.id, {
  title: "Design",
  type: "epic",
});
const child = await store.createTask(project.id, {
  title: "Build",
  parent: parent.id,
  dependencies: [parent.id],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  ({chromium,firefox,webkit}[process.env.BROWSER || "chromium"])
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const current = async () => (await store.snapshot(project.id)).boards[0];
const until = async (fn) => {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await page.waitForTimeout(80);
  }
  throw Error("Save did not settle");
};
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  const camera = async () => {
    // Board saves can replace the world element during a read. Wait for the
    // current element's transform rather than sampling a detached node.
    const value = await page.waitForFunction(() => {
      const world = document.querySelector("#canvas-world");
      if (!world) return false;
      const transform = getComputedStyle(world).transform;
      return transform && transform !== "none" ? transform : false;
    });
    return value.jsonValue();
  };
  const originalCamera = await camera();
  const canvas = await page.locator("#canvas").boundingBox();
  const start = { x: canvas.x + 150, y: canvas.y + 90 };
  const draw = async () => {
    const tool = page.getByRole("button", {
      name: "Add Project frame",
      exact: true,
    });
    if (!(await tool.evaluate((el) => el.classList.contains("active"))))
      await tool.click();
    assert.equal(
      (await current()).nodes.length,
      0,
      "Choosing the tool does not create a frame",
    );
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 550, start.y + 480, { steps: 8 });
    await page.locator(".frame-preview").waitFor();
  };
  await draw();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal((await current()).nodes.length, 0, "Escape cancels drawing");
  await draw();
  await page.mouse.up();
  await until(async () => (await current()).nodes.some((n) => n.projectFrame));
  let board = await current();
  const frame = board.nodes.find((n) => n.projectFrame);
  assert.equal(
    board.nodes.length,
    1,
    "Place an empty frame before updating its plan",
  );
  assert.equal(await camera(), originalCamera, "Placement keeps the camera");
  const placed = await page.locator(`[data-node="${frame.id}"]`).boundingBox();
  assert.ok(
    Math.abs(placed.x - start.x) < 2 && Math.abs(placed.y - start.y) < 2,
    "Frame starts where drawn",
  );
  assert.ok(
    Math.abs(placed.width - 550) < 2 && Math.abs(placed.height - 480) < 2,
    "Frame uses drawn size",
  );
  await page.locator(`[data-node="${frame.id}"] .project-frame-update`).click();
  await page.locator("#frame-apply").click();
  await until(
    async () =>
      (await current()).nodes.filter((n) => n.type === "task").length === 2,
  );
  assert.equal(
    await camera(),
    originalCamera,
    "Updating the plan keeps the camera",
  );
  board = await current();
  assert.equal(board.edges.length, 2);
  const element = page.locator(`[data-node="${frame.id}"]`);
  await element.locator(".frame-title").dblclick({ force: true });
  assert.equal(await page.locator("#canvas-inline-form").count(), 0);
  const cardIds = board.nodes.map((n) => n.id);
  await element
    .getByRole("button", { name: "Update plan", exact: true })
    .click();
  await page.locator("#frame-apply").click();
  await page.waitForTimeout(500);
  assert.deepEqual(
    (await current()).nodes.map((n) => n.id),
    cardIds,
  );
  const beforeMove = structuredClone((await current()).nodes);
  let title;
  await until(async()=>{title=await element.locator(".frame-title").boundingBox();return !!title;});
  await page.mouse.move(title.x + 25, title.y + 10);
  await page.mouse.down();
  await page.mouse.move(title.x + 59, title.y + 44, { steps: 8 });
  await page.mouse.up();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === frame.id).x !==
      beforeMove.find((n) => n.id === frame.id).x,
  );
  const afterMove = (await current()).nodes;
  const movedFrame = afterMove.find((n) => n.id === frame.id),
    oldFrame = beforeMove.find((n) => n.id === frame.id);
  for (const node of afterMove) {
    const previous = beforeMove.find((n) => n.id === node.id);
    assert.ok(Math.abs(node.x - previous.x - (movedFrame.x - oldFrame.x)) <= 1);
    assert.ok(Math.abs(node.y - previous.y - (movedFrame.y - oldFrame.y)) <= 1);
  }
  assert.equal(await camera(), originalCamera, "Dragging keeps the camera");
  const third = await store.createTask(project.id, {
    title: "Ship",
    dependencies: [child.id],
  });
  await element
    .getByRole("button", { name: "Update plan", exact: true })
    .click();
  await page.locator("#frame-apply").click();
  await until(async () =>
    (await current()).nodes.some((n) => n.task === third.id),
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#board-save")?.textContent ===
      "Saved automatically",
  );
  await page.locator("[data-action=board-undo]").click();
  await until(
    async () => !(await current()).nodes.some((n) => n.task === third.id),
  );
  await page.reload();
  await page.locator(`[data-node="${frame.id}"]`).waitFor();
  assert.equal((await current()).edges.length, 2);
  await page.screenshot({ path: "/tmp/pencils-project-frame.png" });
  // Reproduce the reported pair: dependent appears first in task order.
  let snapshot = await store.snapshot(project.id);
  await store.updateTask(project.id, third.id, {
    revision: snapshot.tasks.find((t) => t.id === third.id).revision,
    archived: true,
  });
  await store.updateTask(project.id, child.id, {
    revision: snapshot.tasks.find((t) => t.id === child.id).revision,
    parent: null,
    dependencies: [],
  });
  snapshot = await store.snapshot(project.id);
  await store.updateTask(project.id, parent.id, {
    revision: snapshot.tasks.find((t) => t.id === parent.id).revision,
    dependencies: [child.id],
  });
  await element
    .getByRole("button", { name: "Update plan", exact: true })
    .click();
  await page.locator("#frame-relayout").check();
  await page.locator("#frame-apply").click();
  await until(async () => {
    const b = await current(),
      a = b.nodes.find((n) => n.task === child.id),
      target = b.nodes.find((n) => n.task === parent.id);
    return a && target && a.y === target.y && a.x + a.w < target.x;
  });
  const updated = await current();
  const prerequisite = updated.nodes.find((n) => n.task === child.id),
    dependent = updated.nodes.find((n) => n.task === parent.id);
  const aBox = await page
    .locator(`[data-node="${prerequisite.id}"]`)
    .boundingBox();
  const bBox = await page
    .locator(`[data-node="${dependent.id}"]`)
    .boundingBox();
  assert.ok(Math.abs(aBox.y - bBox.y) < 1, "Rendered dependency cards align");
  assert.ok(aBox.x + aBox.width < bBox.x, "Prerequisite appears on the left");
  assert.equal(
    await camera(),
    originalCamera,
    "Rearranging dependencies keeps the camera",
  );
  await page.screenshot({ path: "/tmp/pencils-project-frame-dependency.png" });
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "dark"),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: project frame drag placement/cancellation, moving contents, unchanged camera, updates, persistence, readonly title and undo",
  );
} catch (error) {
  console.log("Board state", JSON.stringify((await current()).nodes));
  console.log(
    "Save indicator",
    await page.locator("#board-save").textContent(),
  );
  console.log("Page errors", errors);
  await page.screenshot({
    path: `/tmp/pencils-plan-failure-${process.env.BROWSER || "chromium"}.png`,
  });
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
