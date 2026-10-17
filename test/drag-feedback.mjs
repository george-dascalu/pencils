import { openBoardSearch, selectProjectView } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-canvas-ui-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Board lab" }),
  a = await store.createTask(project.id, {
    title: "Write specification",
    assignee: "Alice",
    due: "2020-01-01",
    body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n",
  }),
  b = await store.createTask(project.id, {
    title: "Build prototype",
    assignee: "Bob",
  }),
  c = await store.createTask(project.id, { title: "Review prototype" });
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "note",
      type: "sticky",
      text: "First idea",
      x: 80,
      y: 150,
      w: 240,
      h: 200,
      color: "#f5e7a2",
    },
    { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
    { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
    {
      id: "far",
      type: "text",
      text: "A distant idea",
      x: 6000,
      y: 3000,
      w: 300,
      h: 150,
    },
  ],
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({
  headless: true,
  args: process.env.BROWSER === "firefox" ? [] : ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
  }),
  page = await context.newPage(),
  errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (!r.url().startsWith(base) && !r.url().startsWith("data:"))
    external.push(r.url());
});
page.setDefaultTimeout(12000);
const pro = (name, p = page) => p.locator(`[data-pro="${name}"]`).first();
const snap = () => store.snapshot(project.id);
const current = async () =>
  (await snap()).boards.find((x) => x.id === board.id);
async function until(fn, label = "condition") {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out: " + label);
}
async function enter(p = page) {
  await p.goto(base);
  await p.locator(".project-link").click();
  await p.locator("[data-view=board]").click();
  await p.locator("#canvas").waitFor();
}
async function saved() {
  await until(
    () =>
      page
        .locator("#board-save")
        .textContent()
        .then((t) => /All (canvas )?changes saved/.test(t)),
    "save",
  );
}
async function find(id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro=find-result][data-id="${id}"]`).click();
  await page.waitForTimeout(100);
}
try {
  await enter();
  const sticky = page.locator(".board-tools [data-tool=sticky]");
  const canvas = page.locator("#canvas");
  let rect = await canvas.boundingBox(),
    source = await sticky.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(150);
  const startCount = (await current()).nodes.length;
  const x = rect.x + rect.width * 0.65,
    y = rect.y + rect.height * 0.6;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  await page.locator(".sticky-drop-preview").waitFor();
  assert.equal(
    (await current()).nodes.length,
    startCount,
    "No file mutation before drop",
  );
  const preview = await page.locator(".sticky-drop-preview").boundingBox();
  assert.ok(preview.x < x && preview.x + preview.width > x);
  assert.ok(preview.y < y && preview.y + preview.height > y);
  await page.screenshot({
    path: "/tmp/pencils-sticky-drag-preview.png",
    fullPage: true,
  });
  await page.mouse.up();
  await page.locator("#canvas-inline-form .inline-rich").fill("Dragged sticky");
  await page.locator('[data-pro="search-toggle"]').click();
  await until(async () =>
    (await current()).nodes.some((n) => n.text === "Dragged sticky"),
  );
  assert.equal((await current()).nodes.length, startCount + 1);
  const note = (await current()).nodes.find((n) => n.text === "Dragged sticky");
  const placed = await page.locator(`[data-node="${note.id}"]`).boundingBox();
  assert.ok(
    Math.abs(placed.x - preview.x) < 3 && Math.abs(placed.y - preview.y) < 3,
    "Dropped note matches its preview after zooming",
  );
  assert.equal(await page.locator(".sticky-drop-preview").count(), 0);
  // Invalid and cancelled drops leave the board untouched.
  for (const cancel of ["outside", "escape"]) {
    source = await sticky.boundingBox();
    await page.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 6 });
    if (cancel === "outside") await page.mouse.move(10, 10, { steps: 5 });
    else await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await page.locator(".sticky-drop-preview").count(), 0);
    assert.equal((await current()).nodes.length, startCount + 1);
  }
  console.log(
    "PASS: sticky drag preview, single persisted drop, outside-drop and Escape cancellation",
  );
  await selectProjectView(page, "kanban");
  const card = (id) => page.locator(`[data-drag-task="${id}"]`);
  async function checkTaskEditor() {
    await page.locator("#task-form").waitFor();
    assert.equal(await page.locator("#task-form").getAttribute("data-id"), a.id);
    assert.equal(await page.locator('#task-form [name="title"]').inputValue(), a.title);
    assert.ok(await page.getByRole("textbox", { name: "Task description", exact: true }).isVisible());
    assert.ok(await page.locator('#task-form [name="status"]').isVisible());
    assert.ok(await page.locator('[data-task-picker="priority"]').isVisible());
    await page.locator('[data-action="dialog-close"]').click();
    await page.locator("dialog").waitFor({ state: "detached" });
  }
  await card(a.id).click({ position: { x: 5, y: 5 } });
  await checkTaskEditor();
  for (const target of [".task-id", ".card-bottom .due", ".task-title"]) {
    await card(a.id).locator(target).click();
    await checkTaskEditor();
  }
  await card(a.id).locator(".task-title").focus();
  await page.keyboard.press("Enter");
  await checkTaskEditor();
  let from = await card(b.id).boundingBox(),
    to = await card(a.id).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + 40, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 8, { steps: 8 });
  await page.locator(".kanban-drop-placeholder").waitFor();
  assert.equal(await page.locator("#task-form").count(), 0, "Dragging does not open the card");
  assert.equal(
    await page
      .locator(".kanban-drop-placeholder")
      .evaluate((el) => el.nextElementSibling?.dataset.dragTask),
    a.id,
  );
  await page.waitForTimeout(350);
  const slot = await page.locator(".kanban-drop-placeholder").boundingBox();
  const nextCard = await card(a.id).boundingBox();
  assert.ok(
    slot.y + slot.height <= nextCard.y + 2,
    "Insertion slot reserves space above the next card",
  );
  await page.screenshot({
    path: "/tmp/pencils-kanban-insertion.png",
    fullPage: true,
  });
  await page.mouse.up();
  await until(async () => {
    const tasks = (await snap()).tasks;
    return (
      (tasks.find((t) => t.id === b.id).order || 0) <
      (tasks.find((t) => t.id === a.id).order || 0)
    );
  });
  assert.equal(await page.locator(".kanban-drop-placeholder").count(), 0);
  assert.equal(await page.locator("#task-form").count(), 0, "Dropping does not open the card");
  await card(c.id).dragTo(card(a.id), { targetPosition: { x: 80, y: 8 } });
  await until(async () => {
    const tasks = (await snap()).tasks;
    const order = (id) => tasks.find((t) => t.id === id).order || 0;
    return order(b.id) < order(c.id) && order(c.id) < order(a.id);
  }, "middle insertion preserves both neighbours");
  await card(b.id).dragTo(page.locator("[data-drop-status=done]"));
  await until(
    async () =>
      (await snap()).tasks.find((t) => t.id === b.id).status === "done",
  );
  await page.reload();
  await card(b.id).waitFor();
  assert.equal(
    await card(b.id).evaluate(
      (el) => el.closest("[data-drop-status]").dataset.dropStatus,
    ),
    "done",
  );
  // Hovering at the right edge scrolls toward offscreen columns without dropping.
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.locator(".kanban").evaluate((el) => (el.scrollLeft = 0));
  from = await card(a.id).boundingBox();
  const boardRect = await page.locator(".kanban").boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + 40, { steps: 5 });
  await page.mouse.move(boardRect.x + boardRect.width - 8, boardRect.y + 100, {
    steps: 12,
  });
  await page.waitForFunction(
    () => document.querySelector(".kanban").scrollLeft > 20,
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await page.locator(".kanban-drop-placeholder").count(), 0);
  assert.equal((await snap()).tasks.find((t) => t.id === a.id).status, "todo");
  assert.equal(await page.locator("#task-form").count(), 0, "Cancelling a drag does not open the card");
  await page.setViewportSize({ width: 390, height: 844 });
  await card(a.id).click({ position: { x: 5, y: 5 } });
  await checkTaskEditor();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: whole Kanban cards open the shared task editor on desktop/mobile; keyboard access, insertion preview, ordering, cross-column persistence, edge scroll and cancelled drag",
  );
} catch (e) {
  await page.screenshot({
    path: "/tmp/pencils-drag-failure.png",
    fullPage: true,
  });
  console.error(errors);
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
