import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { openBoardSearch, clickControl } from "./menu-controls.mjs";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-alignment-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Text alignment" });
const task = await store.createTask(project.id, {
  title: "Aligned task",
  body: "Task **body**\n\n- Keep this list",
  assignee: "Alice",
});
let board = (await store.snapshot(project.id)).boards[0];
const words =
  "A paragraph with enough words to wrap over multiple lines and demonstrate justified text inside a note without changing its Markdown content.";
const nodes = ["sticky", "text", "shape", "frame", "task", "query", "link"].map(
  (type, i) => ({
    id: type,
    type,
    x: (i % 3) * 420,
    y: Math.floor(i / 3) * 350,
    w: 340,
    h: 270,
    text:
      type === "frame"
        ? "Frame heading"
        : type === "query"
          ? "Live task view"
          : words,
    ...(type === "task" ? { task: task.id } : {}),
    ...(type === "link" ? { url: "https://example.com" } : {}),
  }),
);
nodes.push({
  id: "locked",
  type: "sticky",
  text: "Locked note",
  x: 900,
  y: 750,
  w: 220,
  h: 170,
  locked: true,
});
await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes,
  edges: [{ id: "edge", from: "sticky", to: "text", routing: "curve" }],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1500, height: 1100 },
  hasTouch: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const current = async () => (await store.snapshot(project.id)).boards[0];
const node = (id) => page.locator(`[data-node="${id}"]`);
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error("Timed out waiting for persisted change");
}
async function find(id) {
  await openBoardSearch(page);
  const text =
    id === "task"
      ? task.title
      : id === "locked"
        ? "Locked note"
        : id === "frame"
          ? "Frame heading"
          : id === "query"
            ? "Live task view"
            : words;
  await page.locator("#canvas-find").fill(text);
  await page.locator(`#canvas-find-results [data-id="${id}"]`).click();
  await node(id).waitFor({ state: "visible" });
}
async function align(value, editing = false) {
  const root = page.locator(
    editing ? ".inline-floating-tools" : "#selection-tools",
  );
  await root.locator('summary[aria-label="Text alignment"]').click();
  await root.locator(`[data-text-align="${value}"]`).click();
}
async function emptyPoint() {
  await page.waitForTimeout(250);
  return page.locator("#canvas").evaluate((canvas) => {
    const r = canvas.getBoundingClientRect();
    for (let y = r.bottom - 130; y > r.top + 80; y -= 50)
      for (let x = r.right - 260; x > r.left + 100; x -= 70) {
        const hit = document.elementFromPoint(x, y);
        if (
          hit?.closest("#canvas") &&
          !hit.closest(
            "[data-node],[data-edge],button,input,select,.canvas-panel,.board-tools,.board-controls,#selection-tools,.inline-floating-tools,#canvas-presence",
          )
        )
          return { x, y };
      }
    throw Error("No empty canvas point");
  });
}
async function clear() {
  const p = await emptyPoint();
  await page.mouse.click(p.x, p.y);
}
async function exportedSVG() {
  const download = page.waitForEvent("download");
  await clickControl(page.locator('[data-feature="canvas-svg"]'));
  return fs.readFile(await (await download).path(), "utf8");
}
async function assertClear() {
  assert.equal(
    await page
      .locator(
        ".board-node.selected,.canvas-edge.selected,.connector-endpoint,.connection-port,#selection-tools",
      )
      .count(),
    0,
  );
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await find("sticky");
  assert.deepEqual(
    await page
      .locator(".board-node")
      .evaluateAll((els) => [
        ...new Set(els.map((el) => getComputedStyle(el).padding)),
      ]),
    ["16px"],
  );
  const textMenu = page.locator('[data-selection-menu="text-align"]');
  for (const [value, expected] of [
    ["top", "flex-start"],
    ["middle", "center"],
    ["bottom", "flex-end"],
  ]) {
    if (!(await textMenu.evaluate((el) => el.open)))
      await textMenu.locator("summary").click();
    await textMenu
      .locator(`[data-text-style="verticalAlign"][value="${value}"]`)
      .click();
    await until(
      async () =>
        (await current()).nodes.find((n) => n.id === "sticky").verticalAlign ===
        value,
    );
    assert.equal(
      await node("sticky")
        .locator(".board-node-content")
        .evaluate((el) => getComputedStyle(el).justifyContent),
      expected,
    );
  }
  if (!(await textMenu.evaluate((el) => el.open)))
    await textMenu.locator("summary").click();
  assert.ok(
    (await textMenu.locator(".selection-popover").boundingBox()).width <= 210,
  );
  for (const button of await textMenu
    .locator(
      "[data-text-align],button[data-text-style=verticalAlign],[data-object-style]",
    )
    .all()) {
    assert.equal((await button.innerText()).trim(), "");
    assert.ok(await button.getAttribute("aria-label"));
    assert.ok(await button.locator("svg").count());
  }
  await page.screenshot({ path: "/tmp/pencils-alignment-icons.png" });
  // Close the menu to reuse the normal horizontal-alignment helper below.
  await textMenu.locator("summary").click();
  for (const value of ["center", "right", "justify", "left"]) {
    await align(value);
    await until(
      async () =>
        (await current()).nodes.find((n) => n.id === "sticky").textAlign ===
        value,
    );
    assert.equal(
      await node("sticky")
        .locator(".node-text")
        .evaluate((el) => getComputedStyle(el).textAlign),
      value,
    );
  }
  await align("center");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "sticky").textAlign ===
      "center",
  );
  await page.locator('[data-action="board-undo"]').click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "sticky").textAlign ===
      "left",
  );
  await page.locator('[data-action="board-redo"]').click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "sticky").textAlign ===
      "center",
  );
  await node("sticky").dblclick();
  const rich = page.locator("#canvas-inline-form .inline-rich");
  await rich.waitFor();
  await align("justify", true);
  assert.ok(await rich.isVisible());
  assert.equal(
    await rich.evaluate((el) => getComputedStyle(el).textAlign),
    "justify",
  );
  assert.equal(
    await page.locator('#canvas-inline-form [name="text"]').inputValue(),
    words,
  );
  await page.screenshot({ path: "/tmp/pencils-text-justify.png" });
  await clear();
  await assertClear();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "sticky").textAlign ===
      "justify",
  );
  assert.match(
    await exportedSVG(),
    /textLength="[0-9]+" lengthAdjust="spacing"/,
  );
  for (const id of ["text", "shape", "frame", "task", "query"]) {
    await find(id);
    await align("right");
    await until(
      async () =>
        (await current()).nodes.find((n) => n.id === id).textAlign === "right",
    );
    const target =
      id === "task"
        ? ".task-title"
        : id === "query"
          ? ".query-label"
          : ".node-text";
    await until(
      async () =>
        (await node(id)
          .locator(target)
          .evaluate((el) => getComputedStyle(el).textAlign)) === "right",
    );
    await page.locator('#selection-tools [data-pro="inline"]').click();
    await align("center", true);
    assert.equal(
      await node(id).evaluate((el) => getComputedStyle(el).padding),
      "16px",
      "Editing preserves shared object padding",
    );
    assert.equal(
      await rich.evaluate((el) => getComputedStyle(el).textAlign),
      "center",
    );
    await clear();
    await assertClear();
  }
  // An empty frame keeps its surface with no placeholder title.
  await find("frame");
  await page.locator('#selection-tools [data-pro="inline"]').click();
  await rich.fill("");
  await clear();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "frame").text === "",
  );
  assert.equal(await node("frame").locator(".frame-title").textContent(), "");
  assert.ok(await node("frame").isVisible());
  // Empty text objects and their connectors disappear as one undoable change.
  await find("text");
  await page.locator('#selection-tools [data-pro="inline"]').click();
  await rich.fill("   ");
  await clear();
  await until(
    async () => !(await current()).nodes.some((n) => n.id === "text"),
  );
  assert.equal(await node("text").count(), 0);
  assert.ok(
    !(await current()).edges.some((e) => e.from === "text" || e.to === "text"),
  );
  await page.locator('[data-action="board-undo"]').click();
  await until(async () => (await current()).nodes.some((n) => n.id === "text"));
  assert.equal(
    (await current()).nodes.find((n) => n.id === "text").text,
    words,
  );
  assert.ok((await current()).edges.some((e) => e.id === "edge"));
  await node("text").waitFor({ state: "attached" });
  // Abandoning a newly placed empty text object removes it too.
  const count = (await current()).nodes.length;
  await page.locator('[data-tool="text"]').click();
  await page.locator('[data-tool="text"].active').waitFor();
  const empty = await emptyPoint();
  await page.mouse.click(empty.x, empty.y);
  await rich.waitFor({ timeout: 5000 });
  await clear();
  await until(async () => (await current()).nodes.length === count);
  assert.equal((await store.snapshot(project.id)).tasks[0].body, task.body);
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+a");
  await page.locator('[data-selection-menu="filter"] > summary').click();
  await page.locator('[data-selection-type="edge"]').uncheck();
  await page.locator("[data-selection-apply]").click();
  await align("center");
  await until(async () =>
    (await current()).nodes
      .filter((n) => !n.locked)
      .every((n) => n.textAlign === "center"),
  );
  assert.equal(
    (await current()).nodes.find((n) => n.id === "locked").textAlign,
    undefined,
  );
  await clear();
  await assertClear();
  await find("sticky");
  await page.locator('[data-tool="hand"]').click();
  const p = await emptyPoint();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y + 20, { steps: 5 });
  await page.mouse.up();
  assert.ok(
    await node("sticky").evaluate((el) => el.classList.contains("selected")),
  );
  await clear();
  await assertClear();
  await page.locator('[data-tool="cursor"]').click();
  await find("sticky");
  const touch = await emptyPoint();
  await page.touchscreen.tap(touch.x, touch.y);
  await assertClear();
  await page.locator('[data-action="board-fit"]').click();
  await page.waitForTimeout(250);
  await page
    .locator('path.canvas-edge[data-edge="edge"]')
    .dispatchEvent("pointerdown", { button: 0 });
  assert.equal(
    await page.locator(".connector-endpoint[data-edge-end]").count(),
    2,
  );
  await clear();
  await assertClear();
  await find("sticky");
  const camera = await page.locator("#canvas-world").getAttribute("style");
  let ids = (await current()).nodes.map((n) => n.id);
  await page.locator('#selection-tools [data-feature="duplicate"]').click();
  await until(async () => (await current()).nodes.length === ids.length + 1);
  const duplicate = (await current()).nodes.find((n) => !ids.includes(n.id));
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.node),
    duplicate.id,
  );
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    camera,
  );
  ids = (await current()).nodes.map((n) => n.id);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await until(async () => (await current()).nodes.length === ids.length + 1);
  const pasted = (await current()).nodes.find((n) => !ids.includes(n.id));
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.node),
    pasted.id,
  );
  assert.equal(await page.locator(".board-node.selected").count(), 1);
  assert.equal(
    await page.locator("#canvas-world").getAttribute("style"),
    camera,
  );
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(400);
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "dark"),
    );
    await page.locator('[data-selection-menu="text-align"] > summary').click();
    await page.waitForFunction(() => {
      const rect = document
        .querySelector('[data-selection-menu="text-align"] .selection-popover')
        .getBoundingClientRect();
      return rect.x >= 0 && rect.right <= innerWidth + 1;
    });
    const r = await page
      .locator('[data-selection-menu="text-align"] .selection-popover')
      .boundingBox();
    assert.ok(
      r.x >= 0 && r.x + r.width <= width + 1,
      JSON.stringify({
        width,
        r,
        layout: await page.evaluate(() => ({
          scrollX,
          width: innerWidth,
          canvas: document
            .querySelector("#canvas")
            .getBoundingClientRect()
            .toJSON(),
        })),
      }),
    );
    await page.screenshot({ path: `/tmp/pencils-text-alignment-${width}.png` });
    await page.keyboard.press("Escape");
  }
  await page.reload();
  await find("sticky");
  assert.equal(
    await node("sticky")
      .locator(".node-text")
      .evaluate((el) => getComputedStyle(el).textAlign),
    "center",
  );
  assert.match(await exportedSVG(), /text-anchor="middle"/);
  const persisted = await current();
  assert.equal(persisted.nodes.find((n) => n.id === "sticky").text, words);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: text alignment across components and editors, Markdown preservation, undo/redo, locked multi-selection, persistence, aligned SVG exports, mobile/dark layout, background deselection, pan preservation, touch tap and undoable empty text cleanup.",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-text-alignment-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
