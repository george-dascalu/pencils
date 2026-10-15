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
try {
  await page.goto(base);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await page.locator("[data-action=board-fit]").click();
  const node = (id) => page.locator(`[data-node="${id}"]`);
  const tool = () => page.locator(".board-tools [data-tool=connect]").click();
  const hover = async (id) => {
    const r = await node(id).boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.waitForTimeout(80);
  };
  const handle = (id, side) => node(id).locator(`[data-port="${side}"]`);
  const center = async (locator) => {
    const r = await locator.boundingBox();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  await tool();
  await hover("note");
  assert.equal(await node("note").locator(".connection-hover-port").count(), 4);
  assert.ok(
    !(await node("note").evaluate((el) => el.classList.contains("selected"))),
  );
  // Drag from an unselected object's revealed point onto a specific target point.
  const start = await center(handle("note", "right"));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await hover("task-a");
  assert.equal(await node("task-a").locator("[data-port]").count(), 4);
  const end = await center(handle("task-a", "left"));
  await page.mouse.move(end.x, end.y, { steps: 5 });
  assert.match(await page.locator("#connection-draft").getAttribute("d"), /C/);
  await page.mouse.up();
  await until(async () => (await current()).edges.length === 1);
  let edge = (await current()).edges[0];
  assert.deepEqual(
    [edge.from, edge.fromSide, edge.to, edge.toSide],
    ["note", "right", "task-a", "left"],
  );
  // Click start, then click end: no accidental connected note is created.
  await tool();
  await hover("note");
  await handle("note", "bottom").click();
  await hover("task-b");
  assert.ok(await page.locator("#connection-draft").isVisible());
  const clickedEnd = await center(handle("task-b", "top"));
  await page.mouse.click(clickedEnd.x, clickedEnd.y);
  await until(async () => (await current()).edges.length === 2);
  edge = (await current()).edges[1];
  assert.deepEqual(
    [edge.from, edge.fromSide, edge.to, edge.toSide],
    ["note", "bottom", "task-b", "top"],
  );
  assert.equal((await current()).nodes.length, 3);
  // Escape cancels a pending click connection; switching tools clears hover points.
  await tool();
  await hover("note");
  await handle("note", "left").click();
  await hover("task-a");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#connection-draft").count(), 0);
  assert.equal((await current()).edges.length, 2);
  await tool();
  await hover("note");
  await page.locator(".board-tools [data-tool=hand]").click();
  assert.equal(await page.locator(".connection-hover-port").count(), 0);
  await tool();
  await hover("note");
  await page.screenshot({ path: "/tmp/pencils-connect-hover.png" });
  // Locked objects never offer new connection points.
  const lockedBoard = await current();
  await store.updateBoard(project.id, board.id, {
    revision: lockedBoard.revision,
    nodes: lockedBoard.nodes.map((n) =>
      n.id === "task-b" ? { ...n, locked: true } : n,
    ),
    edges: lockedBoard.edges,
  });
  await page.reload();
  await page.locator("[data-action=board-fit]").click();
  await tool();
  await hover("task-b");
  assert.equal(await node("task-b").locator("[data-port]").count(), 0);
  assert.equal(await page.locator(".connection-hover-port").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: unselected object hover ports, exact drag endpoints, click-to-connect, curved preview, no unwanted objects, Escape and tool cleanup",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-connect-tool-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
