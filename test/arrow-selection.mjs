import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "pencils-arrow-selection-"),
);
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Colours" });
let board = (await store.snapshot(project.id)).boards[0];
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "one",
      type: "sticky",
      text: "First idea",
      x: 100,
      y: 230,
      w: 220,
      h: 180,
      color: "#f5e7a2",
    },
    {
      id: "two",
      type: "sticky",
      text: "Second idea",
      x: 600,
      y: 230,
      w: 220,
      h: 180,
    },
  ],
  edges: [
    { id: "edge", from: "one", to: "two", routing: "straight" },
    {
      id: "other",
      from: "one",
      to: "two",
      fromSide: "bottom",
      toSide: "bottom",
      bends: [{ x: 450, y: 500 }],
    },
  ],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }),
  errors = [];
page.setDefaultTimeout(10000);
page.on("pageerror", (e) => errors.push(e.message));
const current = async () => (await store.snapshot(project.id)).boards[0];
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Save timed out");
}

async function selectArrow(id, modifier) {
  const p = await page.evaluate((id) => {
    const el = document.querySelector(`path.canvas-edge[data-edge="${id}"]`);
    const q = el.getPointAtLength(el.getTotalLength() * 0.35);
    const p = new DOMPoint(q.x, q.y).matrixTransform(el.getScreenCTM());
    return { x: p.x, y: p.y };
  }, id);
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.click(p.x, p.y);
  if (modifier) await page.keyboard.up(modifier);
}
const edges = () =>
  page
    .locator("path.canvas-edge.selected")
    .evaluateAll((els) => els.map((e) => e.dataset.edge).sort());
const highlightedEdges = () =>
  page.locator(".connector-selection").evaluateAll((els) =>
    els
      .filter((el) => getComputedStyle(el).opacity === "1")
      .map((el) => el.parentElement.dataset.edge)
      .sort(),
  );
const nodes = () =>
  page
    .locator(".board-node.selected")
    .evaluateAll((els) => els.map((e) => e.dataset.node).sort());
const camera = () => page.locator("#canvas-world").getAttribute("style");
async function filter() {
  await page.locator('[data-selection-menu="filter"] > summary').click();
}
async function undo() {
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
}
try {
  await page.goto(base);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await selectArrow("edge");
  assert.deepEqual(await edges(), ["edge"]);
  await selectArrow("other", "Shift");
  assert.deepEqual(await edges(), ["edge", "other"]);
  assert.deepEqual(await highlightedEdges(), ["edge", "other"]);
  assert.equal(await page.locator(".connector-endpoint").count(), 0);
  await page.screenshot({ path: "/tmp/pencils-arrow-highlights-desktop.png" });
  await page.locator('[data-selection-menu="width"] > summary').click();
  await page
    .getByRole("button", { name: "Thickness: 5 px", exact: true })
    .click();
  await until(async () => (await current()).edges.every((e) => e.width === 5));
  await page.locator('[data-selection-menu="toEnd"] > summary').click();
  await page.locator('[data-edge-head="toEnd"][data-value="diamond"]').click();
  await until(async () =>
    (await current()).edges.every((e) => e.toEnd === "diamond"),
  );
  await selectArrow("edge", "Control");
  assert.deepEqual(await edges(), ["other"]);
  assert.deepEqual(await highlightedEdges(), ["other"]);
  await page
    .locator('[data-node="one"]')
    .click({ modifiers: ["Shift"], position: { x: 60, y: 20 } });
  assert.deepEqual(await nodes(), ["one"]);
  assert.deepEqual(await edges(), ["other"]);
  assert.equal(
    await page.locator(".selection-filter-total").textContent(),
    "2",
  );
  await filter();
  await page.locator('[data-selection-only="edge"]').click();
  assert.deepEqual(await nodes(), []);
  assert.deepEqual(await edges(), ["other"]);
  await filter();
  await page.locator("[data-selection-restore]").click();
  assert.deepEqual(await nodes(), ["one"]);
  assert.deepEqual(await edges(), ["other"]);
  // Background click clears both selection kinds.
  const canvas = await page.locator("#canvas").boundingBox();
  await page.mouse.click(canvas.x + canvas.width - 250, canvas.y + 100);
  assert.deepEqual(await edges(), []);
  assert.deepEqual(await highlightedEdges(), []);
  assert.deepEqual(await nodes(), []);
  // A selection box includes the contained arrow along with its cards.
  const first = await page.locator('[data-node="one"]').boundingBox(),
    last = await page.locator('[data-node="two"]').boundingBox();
  await page.mouse.move(first.x - 10, first.y - 20);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width + 10, last.y + last.height + 10, {
    steps: 8,
  });
  await page.mouse.up();
  assert.deepEqual(await edges(), ["edge"]);
  assert.deepEqual(await highlightedEdges(), ["edge"]);
  assert.deepEqual(await nodes(), ["one", "two"]);
  // Select all includes both arrows. Filtering and deleting arrows keeps cards.
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+a");
  assert.deepEqual(await edges(), ["edge", "other"]);
  assert.deepEqual(await nodes(), ["one", "two"]);
  await page.keyboard.press("ArrowRight");
  await until(
    async () =>
      (await current()).edges.find((e) => e.id === "other").bends[0].x === 455,
  );
  await undo();
  await until(
    async () =>
      (await current()).edges.find((e) => e.id === "other").bends[0].x === 450,
  );
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+a");
  await filter();
  await page.locator('[data-selection-only="edge"]').click();
  const beforeCamera = await camera();
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+d");
  await until(async () => (await current()).edges.length === 4);
  assert.equal((await edges()).length, 2);
  assert.equal(await camera(), beforeCamera);
  await page.keyboard.press("Delete");
  await until(async () => (await current()).edges.length === 2);
  assert.equal((await current()).nodes.length, 2);
  await undo();
  await until(async () => (await current()).edges.length === 4);
  await undo();
  await until(async () => (await current()).edges.length === 2);
  await selectArrow("edge");
  await selectArrow("other", "Shift");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await until(async () => (await current()).edges.length === 4);
  assert.equal((await edges()).length, 2);
  assert.equal((await current()).nodes.length, 2);
  assert.equal(await camera(), beforeCamera);
  await page.keyboard.press("Delete");
  await until(async () => (await current()).edges.length === 2);
  // Mixed deletion and undo restore the linked graph in one action.
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await until(async () => (await current()).nodes.length === 0);
  assert.equal((await current()).edges.length, 0);
  await undo();
  await until(async () => (await current()).nodes.length === 2);
  assert.equal((await current()).edges.length, 2);
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+a");
  await filter();
  await page.locator('[data-selection-only="edge"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.waitForTimeout(300);
  const tools = await page.locator("#selection-tools").boundingBox();
  const mobileCanvas = await page.locator("#canvas").boundingBox();
  assert.ok(
    tools.x >= mobileCanvas.x &&
      tools.x + tools.width <= mobileCanvas.x + mobileCanvas.width + 1,
  );
  assert.deepEqual(await highlightedEdges(), ["edge", "other"]);
  await page.screenshot({ path: "/tmp/pencils-arrow-selection-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: arrow and mixed selection, modifiers, marquee, filters, shared styles, copy/duplicate, deletion, undo and fixed camera",
  );
} catch (error) {
  console.error(errors);
  await page.screenshot({ path: "/tmp/pencils-arrow-selection-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
