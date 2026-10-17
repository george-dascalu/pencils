import { openBoardSearch } from "./menu-controls.mjs";
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
  });
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "note",
      type: "sticky",
      text: "First idea\n\nFull **Markdown** body with [[Write specification]].",
      comments: [{ id: "c1", text: "Keep this comment", author: "Alice" }],
      group: "group-a",
      x: 80,
      y: 150,
      w: 240,
      h: 200,
      color: "#f5e7a2",
    },
    { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
    { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
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
        .then((t) => t === "Saved automatically"),
    "save",
  );
}
async function find(id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro=find-result][data-id="${id}"]`).click();
  await page.waitForTimeout(100);
}
const node = (id) => page.locator(`[data-node="${id}"]`);
const currentNode = async (id) =>
  (await current()).nodes.find((n) => n.id === id);
const currentTask = async (id) => (await snap()).tasks.find((t) => t.id === id);
async function convert(id, target) {
  const heading = node(id).locator(".task-title,.note-title").first();
  if (await heading.count()) await heading.click();
  else await node(id).click();
  await page.locator('[data-selection-menu="convert"] summary').click();
  await page
    .locator(
      `#selection-tools [data-pro="${target === "Task" ? "convert" : "convert-note"}"]`,
    )
    .click();
  if (await page.locator("#draft-finalise-confirm").isVisible())
    await page.locator("#draft-finalise-confirm").click();
  await saved();
}
async function portPosition(id, side) {
  const r = await node(id).boundingBox();
  return {
    x:
      side === "left"
        ? r.x - 3
        : side === "right"
          ? r.x + r.width + 3
          : r.x + r.width / 2,
    y:
      side === "top"
        ? r.y - 3
        : side === "bottom"
          ? r.y + r.height + 3
          : r.y + r.height / 2,
  };
}
async function start(id, side) {
  await node(id).click();
  const p = await portPosition(id, side);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
}
async function edgePoint(id) {
  return page.locator(`path[data-edge="${id}"]`).evaluate((el) => {
    const p = el.getPointAtLength(el.getTotalLength() / 2),
      q = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
    return { x: q.x, y: q.y };
  });
}
try {
  await enter();
  const original = await currentNode("note");
  const surface = (id) =>
    node(id).evaluate((el) => {
      const s = getComputedStyle(el);
      return Object.fromEntries(
        [
          "backgroundColor",
          "borderRadius",
          "padding",
          "justifyContent",
          "fontFamily",
          "color",
          "boxShadow",
        ].map((k) => [k, s[k]]),
      );
    });
  const noteSurface = await surface("note");
  const noteCamera = await page.locator("#canvas-world").getAttribute("style");
  await convert("note", "Task");
  await until(async () => (await currentNode("note")).type === "draft");
  let draft = await currentNode("note");
  assert.equal(
    (await snap()).tasks.length,
    2,
    "Note conversion must not create a project task",
  );
  assert.equal(draft.task, undefined);
  assert.equal(draft.draft.title, "First idea");
  assert.equal(draft.text, "", "New drafts start with a blank description");
  assert.deepEqual(draft.comments, original.comments);
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    noteCamera,
  );
  await page.reload();
  await node("note").waitFor();
  assert.match(await node("note").innerText(), /Draft/);
  await page.locator('[data-action="board-undo"]').click();
  await until(async () => (await currentNode("note")).type === "sticky");
  assert.equal((await snap()).tasks.length, 2);
  assert.equal(
    (await currentNode("note")).text,
    original.text,
    "Undo restores the original note text",
  );
  await page.locator('[data-action="board-redo"]').click();
  await until(async () => (await currentNode("note")).type === "draft");
  await convert("note", "Task");
  await until(async () => (await currentNode("note")).type === "task");
  const converted = await currentNode("note"),
    created = await currentTask(converted.task);
  assert.equal(created.body, "");
  assert.ok(created.key, "Only finalised tasks receive a project ID");
  assert.deepEqual(converted.comments, original.comments);
  assert.equal(converted.group, original.group);
  assert.equal(converted.color, original.color);
  assert.equal(converted.x, original.x);
  const before = await currentTask(a.id);
  await convert("task-a", "Note");
  await until(async () => (await currentNode("task-a")).displayAs === "note");
  assert.deepEqual(
    await currentTask(a.id),
    before,
    "Task to Note does not mutate task metadata or Markdown",
  );
  assert.equal(
    await node("task-a")
      .locator(
        ".live-card-heading,.live-card-state,.task-title,[data-pro=task-details],.embed-label",
      )
      .count(),
    0,
  );
  assert.ok(
    await node("task-a").evaluate(
      (el) =>
        el.classList.contains("sticky") &&
        !el.matches(".task,.overdue,.blocked-task"),
    ),
  );
  assert.deepEqual(
    await surface("task-a"),
    noteSurface,
    "Converted tasks use the same note surface",
  );
  assert.equal(
    await node("task-a").locator(".note-title").textContent(),
    before.title,
  );
  assert.ok(
    (await node("task-a").locator(".note-body").textContent()).includes(
      "Original scope",
    ),
  );
  await page.screenshot({ path: "/tmp/pencils-task-as-note.png" });
  await page.reload();
  await page.locator("#canvas").waitFor();
  assert.ok(
    await node("task-a").evaluate((el) =>
      el.classList.contains("task-as-note"),
    ),
  );
  const native = JSON.parse(
    await fs.readFile(path.join(root, (await current()).file), "utf8"),
  );
  const nativeNote = native.nodes.find((n) => n.id === "task-a");
  assert.equal(
    nativeNote.type,
    "file",
    "Obsidian still links the original Markdown file",
  );
  assert.equal(nativeNote.pencils.displayAs, "note");
  await node("task-a").locator(".note-title").dblclick();
  await page
    .getByRole("textbox", { name: "Note title", exact: true })
    .fill("Edited while a note");
  assert.equal(
    await node("task-a")
      .locator(".live-card-heading,.live-card-state,[data-pro=task-details]")
      .count(),
    0,
  );
  assert.deepEqual(
    await surface("task-a"),
    noteSurface,
    "Editing keeps the note surface",
  );
  await page.locator("[data-rich-mode=source]").click();
  await page
    .locator(".inline-source")
    .fill("Notes edited without losing task fields.");
  await page.locator('[data-pro="search-toggle"]').click();
  await until(
    async () => (await currentTask(a.id)).title === "Edited while a note",
  );
  await convert("task-a", "Task");
  assert.ok(await node("task-a").locator(".live-card-state").isVisible());
  assert.ok(
    await node("task-a").evaluate(
      (el) => el.classList.contains("task") && !el.classList.contains("sticky"),
    ),
  );
  assert.notEqual(
    (await surface("task-a")).backgroundColor,
    noteSurface.backgroundColor,
  );
  const after = await currentTask(a.id);
  for (const field of [
    "assignee",
    "due",
    "type",
    "status",
    "priority",
    "tags",
    "parent",
    "fields",
    "dependencies",
    "comments",
  ])
    assert.deepEqual(after[field], before[field], field + " preserved");
  assert.equal(after.body, "Notes edited without losing task fields.");
  await convert("note", "Note");
  await convert("note", "Task");
  assert.equal(
    (await snap()).tasks.length,
    3,
    "Round trips reuse the task rather than creating duplicates",
  );

  await start("note", "right");
  const dest = await portPosition("task-a", "left");
  await page.mouse.move(dest.x - 30, dest.y, { steps: 5 });
  assert.match(await page.locator("#connection-draft").getAttribute("d"), / C/);
  assert.equal(
    await node("task-a").locator(".connection-nearby-port").count(),
    4,
  );
  assert.equal(await page.locator("#connection-draft.snapped").count(), 0);
  await page.mouse.move(dest.x - 5, dest.y);
  assert.equal(await page.locator("#connection-draft.snapped").count(), 1);
  assert.equal(
    await node("task-a")
      .locator(".connection-snapped")
      .getAttribute("data-port"),
    "left",
  );
  await page.keyboard.down("Control");
  assert.equal(await page.locator("#connection-draft.snapped").count(), 0);
  await page.keyboard.up("Control");
  assert.equal(await page.locator("#connection-draft.snapped").count(), 1);
  await page.screenshot({ path: "/tmp/pencils-connector-drag.png" });
  const preview = await page.locator("#connection-draft").getAttribute("d");
  await page.mouse.up();
  await until(async () => (await current()).edges.length === 1);
  let edge = (await current()).edges[0];
  assert.equal(edge.toSide, "left");
  assert.equal(
    await page.locator(`path[data-edge="${edge.id}"]`).getAttribute("d"),
    preview,
  );
  assert.equal(
    await page
      .locator(".connection-nearby-port,#connection-draft,.connection-target")
      .count(),
    0,
  );

  // Reconnect the end, preserving the connector identity and style.
  let p = await edgePoint(edge.id);
  await page.mouse.click(p.x, p.y);
  const handle = await page.locator('[data-edge-end="to"]').boundingBox();
  await page.mouse.move(handle.x + 2, handle.y + handle.height / 2);
  await page.mouse.down();
  const newEnd = await portPosition("task-b", "left");
  await page.mouse.move(newEnd.x - 4, newEnd.y, { steps: 8 });
  assert.equal(await page.locator("#connection-draft.snapped").count(), 1);
  await page.mouse.up();
  await until(async () => (await current()).edges[0].to === "task-b");
  assert.equal((await current()).edges[0].id, edge.id);
  assert.equal((await current()).edges[0].routing, edge.routing);
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
  await until(async () => (await current()).edges[0].to === "task-a");

  p = await edgePoint(edge.id);
  await page.mouse.click(p.x, p.y);
  const fromHandle = await page.locator('[data-edge-end="from"]').boundingBox();
  await page.mouse.move(
    fromHandle.x + fromHandle.width - 2,
    fromHandle.y + fromHandle.height / 2,
  );
  await page.mouse.down();
  const newStart = await portPosition("task-b", "top");
  await page.mouse.move(newStart.x, newStart.y - 4, { steps: 8 });
  assert.equal(await page.locator("#connection-draft.snapped").count(), 1);
  await page.mouse.up();
  await until(async () => (await current()).edges[0].from === "task-b");
  assert.equal((await current()).edges[0].to, "task-a");
  assert.equal((await current()).edges[0].fromSide, "top");
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
  await until(async () => (await current()).edges[0].from === "note");

  await start("note", "bottom");
  await page.mouse.move(650, 760);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(
    await page
      .locator("#connection-draft,.connection-target,.connection-nearby-port")
      .count(),
    0,
  );
  assert.equal((await current()).edges.length, 1);
  await start("note", "bottom");
  await page.mouse.move(650, 760);
  await page.mouse.up();
  assert.equal(
    (await current()).edges.length,
    1,
    "Dropping on empty space cancels without an orphan line",
  );
  await start("note", "bottom");
  await page.mouse.move(650, 760);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  assert.equal(await page.locator("#connection-draft").count(), 0);
  await start("note", "bottom");
  await page.mouse.move(650, 760);
  await page.locator("#canvas").dispatchEvent("pointercancel", {
    pointerId: 1,
    clientX: 650,
    clientY: 760,
  });
  await page.mouse.up();
  assert.equal(
    await page.locator("#connection-draft,.connection-nearby-port").count(),
    0,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: lossless Task/Note round trips, linked inline editing, Obsidian persistence, curved connector previews, nearby ports, snapping bypass, endpoint reconnection, undo and cancellation",
  );
} catch (error) {
  console.error(errors);
  await page.screenshot({
    path: "/tmp/pencils-board-interactions-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
