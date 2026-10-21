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
      text: "First idea",
      x: 80,
      y: 150,
      w: 240,
      h: 200,
      color: "#f5e7a2",
    },
    { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
    {
      id: "frame",
      type: "frame",
      text: "A clear frame title",
      x: 100,
      y: 600,
      w: 480,
      h: 260,
    },
    { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
    {
      id: "link",
      type: "link",
      url: "https://example.com",
      text: "https://example.com",
      x: 750,
      y: 600,
      w: 280,
      h: 160,
    },
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
        .then((t) => t === "Saved automatically"),
    "save",
  );
}
async function find(id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page
    .locator(`#canvas-find-results [data-pro=find-result][data-id="${id}"]`)
    .click();
  await page.waitForTimeout(100);
}
async function textBounds(locator) {
  return locator.evaluate((el) => {
    const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange();
    range.selectNodeContents(text);
    const { x, y } = range.getBoundingClientRect();
    return { x, y };
  });
}
try {
  await enter();
  await find("note", "First idea");
  const node = page.locator('[data-node="note"]');
  const before = await node.boundingBox();
  const color = await node.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  const fontBefore = await node
    .locator(".canvas-markdown")
    .evaluate((el) => getComputedStyle(el).font);
  const textBefore = await textBounds(node.locator(".canvas-markdown"));
  await node.dblclick();
  assert.deepEqual(
    await node.boundingBox(),
    before,
    "Editing does not move or resize the note",
  );
  assert.equal(
    await node.evaluate((el) => getComputedStyle(el).backgroundColor),
    color,
  );
  const rich = page.locator("#canvas-inline-form .inline-rich");
  assert.equal(
    await rich.evaluate((el) => getComputedStyle(el).font),
    fontBefore,
  );
  assert.deepEqual(await rich.boundingBox(), before, "The editor fills the note");
  const textEditing = await textBounds(rich);
  assert.ok(
    Math.abs(textEditing.x - textBefore.x) < 1 &&
      Math.abs(textEditing.y - textBefore.y) < 1,
    "Text stays in the same location",
  );
  assert.ok(await page.locator("#canvas-inline-form textarea").isHidden());
  assert.equal(await node.locator(".inline-floating-tools").count(), 0);
  await rich.fill("The edited idea");
  await page.screenshot({ path: "/tmp/pencils-in-place-note.png" });
  await page.keyboard.press("Control+Enter");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "note").text ===
      "The edited idea",
  );
  await find("task-a", "Write specification");
  await page.locator('[data-node="task-a"] .task-title').dblclick();
  await page
    .getByRole("textbox", { name: "Task title", exact: true })
    .fill("A clearer task title");
  await page.locator("#canvas-inline-form .inline-rich").fill("The task notes");
  await page.keyboard.press("Control+Enter");
  await until(
    async () =>
      (await snap()).tasks.find((t) => t.id === a.id).title ===
      "A clearer task title",
  );
  assert.match(
    (await snap()).tasks.find((t) => t.id === a.id).body,
    /The task notes/,
  );
  await find("note", "The edited idea");
  const resize = async (dx, dy, shift = false, target = node) => {
    await target.click();
    const r = await target
      .locator('.resize-handle[data-resize-corner="se"]')
      .boundingBox();
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    assert.ok(await page.locator(".resize-dimensions").isVisible());
    await page.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy, {
      steps: 8,
    });
    const dimensions = await target.evaluate(
      (el) =>
        `${Math.round(parseFloat(el.style.width))} × ${Math.round(parseFloat(el.style.height))}`,
    );
    assert.equal(
      await page.locator(".resize-dimensions").textContent(),
      dimensions,
    );
    assert.equal(
      await page
        .locator(".resize-dimensions")
        .evaluate((el) => getComputedStyle(el).fontSize),
      "12px",
    );
    const badge = await page.locator(".resize-dimensions").boundingBox(),
      canvas = await page.locator("#canvas").boundingBox();
    assert.ok(
      badge.x >= canvas.x &&
        badge.y >= canvas.y &&
        badge.x + badge.width <= canvas.x + canvas.width &&
        badge.y + badge.height <= canvas.y + canvas.height,
    );
    await page.screenshot({ path: "/tmp/pencils-resize-dimensions.png" });
    await page.mouse.up();
    assert.equal(await page.locator(".resize-dimensions").count(), 0);
    if (shift) await page.keyboard.up("Shift");
    await saved();
  };
  let old = (await current()).nodes.find((n) => n.id === "note");
  const cancelHandle = await node
    .locator('.resize-handle[data-resize-corner="se"]')
    .boundingBox();
  await page.mouse.move(
    cancelHandle.x + cancelHandle.width / 2,
    cancelHandle.y + cancelHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(cancelHandle.x + 40, cancelHandle.y + 40, { steps: 4 });
  assert.ok(await page.locator(".resize-dimensions").isVisible());
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await page.locator(".resize-dimensions").count(), 0);
  assert.deepEqual(
    (await current()).nodes.find((n) => n.id === "note"),
    old,
  );
  await resize(100, 15, true);
  let next = (await current()).nodes.find((n) => n.id === "note");
  assert.ok(next.w > old.w);
  assert.equal(next.h, old.h);
  old = next;
  await resize(12, 100, true);
  next = (await current()).nodes.find((n) => n.id === "note");
  assert.ok(next.h > old.h);
  assert.equal(next.w, old.w);
  await resize(-600, -400);
  next = (await current()).nodes.find((n) => n.id === "note");
  assert.equal(next.w, 120);
  assert.equal(next.h, 100);
  await node.dblclick();
  await page
    .locator("#canvas-inline-form .inline-rich")
    .fill("A long piece of text ".repeat(40));
  await page.keyboard.press("Control+Enter");
  await saved();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-node="note"] .board-node-content, [data-node="note"] .canvas-markdown')]
      .some(el => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2),
  );
  const content = await node.locator(".board-node-content").boundingBox(),
    card = await node.boundingBox();
  assert.ok(
    content.x >= card.x &&
      content.y >= card.y &&
      content.x + content.width <= card.x + card.width + 1 &&
      content.y + content.height <= card.y + card.height + 1,
  );
  await find("task-a", "A clearer task title");
  const taskNode = page.locator('[data-node="task-a"]');
  await resize(-500, -500, false, taskNode);
  const smallTask = (await current()).nodes.find((n) => n.id === "task-a");
  assert.equal(smallTask.w, 220);
  assert.equal(smallTask.h, 180);
  assert.equal(
    await taskNode
      .locator(".board-node-content")
      .evaluate((el) => getComputedStyle(el).overflow),
    "hidden",
  );

  await find("frame", "A clear frame title");
  const frame = page.locator('[data-node="frame"]');
  const frameBox = await frame.boundingBox();
  const frameFont = await frame
    .locator(".frame-title")
    .evaluate((el) => getComputedStyle(el).font);
  await frame.locator(".frame-title").dblclick();
  assert.deepEqual(await frame.boundingBox(), frameBox);
  assert.equal(
    await rich.evaluate((el) => getComputedStyle(el).font),
    frameFont,
  );
  await rich.fill("Updated frame title");
  await page.keyboard.press("Control+Enter");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "frame").text ===
      "Updated frame title",
  );
  await frame.locator("[data-pro=collapse]").click();
  assert.ok((await frame.locator(".frame-title").boundingBox()).height > 18);

  await find("link", "https://example.com");
  await page
    .locator('[data-node="link"]')
    .dblclick({ position: { x: 15, y: 15 } });
  await rich.fill("javascript:alert(1)");
  await page.locator('[data-pro="search-toggle"]').click();
  await page
    .locator(".inline-error")
    .filter({ hasText: "Use an http" })
    .waitFor();
  assert.equal(
    (await current()).nodes.find((n) => n.id === "link").url,
    "https://example.com",
  );
  await rich.fill("https://example.com/updated");
  await page.keyboard.press("Control+Enter");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "link").url ===
      "https://example.com/updated",
  );

  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await find("note", "A long piece of text");
  const darkColor = await node.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await node.dblclick();
  assert.equal(
    await node.evaluate((el) => getComputedStyle(el).backgroundColor),
    darkColor,
  );
  await page.keyboard.press("Escape");

  await page.keyboard.press("n");
  await page.locator("#canvas").click({ position: { x: 800, y: 400 } });
  assert.equal(
    await page.locator("#canvas-inline-form .inline-rich").textContent(),
    "",
  );
  assert.equal(
    await page
      .locator("#canvas-inline-form .inline-rich")
      .getAttribute("data-empty"),
    "true",
  );
  await page.keyboard.press("Escape");
  const empty = (await current()).nodes.find(
    (n) => n.type === "sticky" && !n.text,
  );
  assert.ok(empty);
  assert.ok(
    await page.locator(`[data-node="${empty.id}"] .is-placeholder`).count(),
  );
  await saved();
  await page.reload();
  await page.locator("#canvas").waitFor();
  await find("frame", "Updated frame title");
  assert.equal(
    await page.locator('[data-node="frame"] .frame-title').textContent(),
    "Updated frame title",
  );
  await page.setViewportSize({ width: 480, height: 800 });
  await frame.locator(".frame-title").dblclick();
  const tools = await page.locator(".inline-floating-tools").boundingBox();
  assert.ok(tools.x >= 0 && tools.x + tools.width <= 481);
  await page.keyboard.press("Escape");
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: in-place visual editing, unchanged geometry/colour, linked task title/body, placeholders, bounded overflow, Shift axis resizing and live dimensions with cancellation cleanup.",
  );
} catch (error) {
  await page.screenshot({
    path: "/tmp/pencils-in-place-failure.png",
    fullPage: true,
  });
  console.error(errors);
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
