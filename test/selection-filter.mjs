import { openBoardSearch } from "./menu-controls.mjs";
import { clickControl } from "./menu-controls.mjs";
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
    { id: "frame", type: "frame", text: "Area", x: 20, y: 80, w: 1200, h: 500 },
    {
      id: "note",
      type: "sticky",
      text: "First idea",
      x: 100,
      y: 200,
      w: 220,
      h: 200,
      group: "g",
    },
    {
      id: "task-a",
      type: "task",
      task: a.id,
      x: 450,
      y: 200,
      w: 300,
      h: 240,
      group: "g",
    },
    {
      id: "linked",
      type: "task",
      task: b.id,
      displayAs: "note",
      x: 840,
      y: 200,
      w: 300,
      h: 240,
    },
    {
      id: "text",
      type: "text",
      text: "Some text",
      x: 100,
      y: 650,
      w: 250,
      h: 120,
    },
    {
      id: "locked",
      type: "shape",
      text: "Locked shape",
      locked: true,
      x: 500,
      y: 650,
      w: 180,
      h: 120,
    },
    {
      id: "far",
      type: "shape",
      text: "Off screen",
      x: 6000,
      y: 3000,
      w: 200,
      h: 120,
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
const selectedIds = async () =>
  (
    await page
      .locator(".board-node.selected")
      .evaluateAll((els) => els.map((e) => e.dataset.node))
  ).sort();
async function all() {
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+a");
}
async function filter() {
  await page.locator('[data-selection-menu="filter"] > summary').click();
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}
async function only(type) {
  await filter();
  await page.locator(`[data-selection-only="${type}"]`).click();
}
async function restore() {
  await filter();
  await page.locator("[data-selection-restore]").click();
}
try {
  await enter();
  const before = await current();
  await all();
  await filter();
  assert.equal(await page.locator("[data-selection-type]").count(), 5);
  assert.equal(
    await page
      .locator('[data-selection-type="sticky"]')
      .locator("..")
      .textContent()
      .then((t) => t.trim()),
    "Notes2",
  );
  await page.locator('[data-selection-only="sticky"]').click();
  assert.deepEqual(await selectedIds(), ["linked", "note"]);
  assert.deepEqual(
    await current(),
    before,
    "Filtering is selection-only; no saved data changes",
  );
  // A grouped task must stay put when only the notes are moved.
  await page.locator("#canvas").focus();
  await page.keyboard.press("ArrowRight");
  await until(
    async () => (await current()).nodes.find((n) => n.id === "note").x === 105,
  );
  assert.equal((await current()).nodes.find((n) => n.id === "task-a").x, 450);
  // Dragging a filtered member must not reselect its group or frame siblings.
  const box = await page.locator('[data-node="note"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 60,
    box.y + box.height / 2 + 50,
    { steps: 6 },
  );
  await page.mouse.up();
  await saved();
  assert.deepEqual(await selectedIds(), ["linked", "note"]);
  assert.equal((await current()).nodes.find((n) => n.id === "task-a").x, 450);
  await restore();
  assert.equal(
    await page.locator(".selection-filter-total").textContent(),
    "7",
  );
  await only("task");
  assert.deepEqual(await selectedIds(), ["task-a"]);
  assert.ok(await page.locator('[data-selection-menu="convert"]').isVisible());
  assert.ok(await page.locator('[data-selection-menu="filter"]').isVisible());
  await restore();
  await filter();
  for (const cb of await page.locator("[data-selection-type]").all())
    await cb.uncheck();
  assert.ok(await page.locator("[data-selection-apply]").isDisabled());
  await page.locator('[data-selection-type="task"]').check();
  await page.locator('[data-selection-type="text"]').check();
  assert.equal(
    await page.locator("[data-selection-apply]").textContent(),
    "Apply (2)",
  );
  await page.locator("[data-selection-apply]").click();
  assert.deepEqual(await selectedIds(), ["task-a", "text"]);
  // Colour only the filtered subset and retain locks.
  await page.locator('[data-selection-menu="color"] summary').click();
  await page.locator('[data-color-choice="#edc48b"]').click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "text").color === "#edc48b",
  );
  assert.equal(
    (await current()).nodes.find((n) => n.id === "note").color,
    undefined,
  );
  await restore();
  await only("frame");
  const childBefore = (await current()).nodes.find((n) => n.id === "task-a");
  const frameBefore = (await current()).nodes.find((n) => n.id === "frame");
  const frame = await page.locator('[data-node="frame"]').boundingBox();
  await page.mouse.move(frame.x + frame.width - 3, frame.y + 60);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width - 43, frame.y + 90, { steps: 6 });
  await page.mouse.up();
  await saved();
  assert.deepEqual(
    (await current()).nodes.find((n) => n.id === "task-a"),
    childBefore,
    "Excluded frame contents stay put",
  );
  const frameAfter = (await current()).nodes.find((n) => n.id === "frame");
  assert.ok(
    frameAfter.x !== frameBefore.x || frameAfter.y !== frameBefore.y,
    "Filtered frame actually moved",
  );
  await restore();
  await only("shape");
  // Offscreen selected objects still count; locks remain enforced.
  assert.equal(
    await page.locator(".selection-filter-total").textContent(),
    "2",
  );
  await page.locator("#canvas").focus();
  await page.keyboard.press("ArrowRight");
  await until(
    async () => (await current()).nodes.find((n) => n.id === "far").x === 6005,
  );
  assert.equal((await current()).nodes.find((n) => n.id === "locked").x, 500);
  await restore();
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(400);
    if (width === 390)
      await page.evaluate(
        () => (document.documentElement.dataset.theme = "dark"),
      );
    await filter();
    const panel = await page
      .locator('[data-selection-menu="filter"] .selection-popover')
      .boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= width + 1);
    assert.ok(panel.y >= 0 && panel.y + panel.height <= 1001);
    await page.screenshot({
      path: `/tmp/pencils-selection-filter-${width}.png`,
    });
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator('[data-selection-menu="filter"]').getAttribute("open"),
      null,
    );
  }
  await page.setViewportSize({ width: 1600, height: 1100 });
  // A fresh manual selection discards the previous filter pool.
  await find("text", "Some text");
  await page.locator('[data-node="text"]').click();
  assert.equal(await page.locator('[data-selection-menu="filter"]').count(), 0);
  await all();
  await only("sticky");
  await clickControl(page.locator('[data-feature="selection-delete"]'));
  await until(async () => (await current()).nodes.length === 5);
  assert.ok((await current()).nodes.some((n) => n.id === "task-a"));
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
  await until(async () => (await current()).nodes.length === 7);
  await page.reload();
  await page.locator("#canvas").waitFor();
  assert.equal(await page.locator('[data-selection-menu="filter"]').count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: type counts, linked notes, single/multiple type filters, restore, grouped dragging, frame isolation, locks, offscreen counts, subset edits/deletion, undo, keyboard, mobile/dark and reset",
  );
} catch (e) {
  console.error(errors);
  await page.screenshot({ path: "/tmp/pencils-selection-filter-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
