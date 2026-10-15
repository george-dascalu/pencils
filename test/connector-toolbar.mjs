import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(
  path.join(os.tmpdir(), "pencils-connector-toolbar-"),
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
  edges: [{ id: "edge", from: "one", to: "two", label: "Connect" }],
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
async function selectEdge() {
  const p = await page.evaluate(() => {
    const el = document.querySelector('path.canvas-edge[data-edge="edge"]');
    const p = el.getPointAtLength(el.getTotalLength() / 2);
    const q = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
    return { x: q.x, y: q.y };
  });
  await page.mouse.click(p.x, p.y);
  await page.getByRole("toolbar", { name: "Selected connector" }).waitFor();
}
async function menu(key) {
  const m = page.locator(`[data-selection-menu="${key}"]`);
  if ((await m.getAttribute("open")) === null)
    await m.locator("summary").click();
  return m;
}
async function head(key, value) {
  await menu(key);
  await page
    .locator(`[data-edge-head="${key}"][data-value="${value}"]`)
    .click();
  await until(async () => (await current()).edges[0][key] === value);
}
try {
  await page.goto(base);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await selectEdge();
  assert.equal(await page.locator("dialog").count(), 0);
  for (const kind of [
    "triangle",
    "circle",
    "circle-outline",
    "diamond",
    "diamond-outline",
    "bar",
    "none",
    "arrow",
  ]) {
    await head("toEnd", kind);
    const marker = await page
      .locator("path.canvas-edge")
      .getAttribute("marker-end");
    if (kind === "none") assert.equal(marker, null);
    else assert.ok(await page.locator(marker.slice(4, -1)).count());
  }
  await head("fromEnd", "diamond");
  await head("toEnd", "triangle");
  assert.equal(await page.locator('[data-selection-menu="line"]').count(), 0);
  assert.ok(
    await page
      .locator('[data-selection-menu="width"] > summary svg')
      .first()
      .isVisible(),
  );
  for (const [key, values] of [
    ["routing", ["straight", "curve", "elbow"]],
    ["lineStyle", ["dotted", "solid", "dashed"]],
  ]) {
    for (const value of values) {
      const control = await menu(key);
      await page
        .locator(`[data-edge-choice="${key}"][data-value="${value}"]`)
        .click();
      await until(async () => (await current()).edges[0][key] === value);
      assert.ok(
        (await control.locator("summary").getAttribute("title"))
          .toLowerCase()
          .endsWith(value),
      );
      assert.equal(await control.getAttribute("open"), null);
    }
  }
  await menu("width");
  assert.deepEqual(
    await page
      .locator('[data-edge-choice="width"] path')
      .evaluateAll((paths) =>
        paths.map((p) => getComputedStyle(p).strokeWidth),
      ),
    ["1px", "2px", "3px", "5px"],
  );
  await page
    .getByRole("button", { name: "Thickness: 3 px", exact: true })
    .click();
  await until(async () => (await current()).edges[0].width === 3);
  await menu("label");
  await page.locator('[data-edge-field="label"]').fill("A clear connection");
  await page.locator('[data-edge-field="label"]').press("Enter");
  await until(
    async () => (await current()).edges[0].label === "A clear connection",
  );
  await menu("label");
  await page
    .locator('[data-edge-field="label"]')
    .fill("Saved on click outside");
  await page.locator('[data-pro="search-toggle"]').click();
  await until(
    async () => (await current()).edges[0].label === "Saved on click outside",
  );
  await page.keyboard.press("Escape");
  await selectEdge();
  await menu("color");
  await page.locator('[data-color-choice="#f1a9a0"]').click();
  await until(async () => (await current()).edges[0].color === "#f1a9a0");
  const rendered = await page.evaluate(() => {
    const el = document.querySelector("path.canvas-edge");
    return {
      width: getComputedStyle(el).strokeWidth,
      dash: getComputedStyle(el).strokeDasharray,
      marker: el.getAttribute("marker-end"),
    };
  });
  assert.equal(rendered.width, "3px");
  assert.notEqual(rendered.dash, "none");
  assert.equal(
    await page
      .locator(rendered.marker.slice(4, -1) + " g")
      .getAttribute("fill"),
    "#f1a9a0",
  );
  await page.reload();
  await page.locator("#canvas").waitFor();
  await selectEdge();
  const e = (await current()).edges[0];
  assert.equal(e.fromEnd, "diamond");
  assert.equal(e.toEnd, "triangle");
  assert.equal(e.width, 3);
  assert.equal(e.label, "Saved on click outside");
  const native = JSON.parse(
    await fs.readFile(path.join(root, (await current()).file), "utf8"),
  );
  assert.equal(native.edges[0].fromEnd, "arrow");
  assert.equal(native.edges[0].pencils.fromEnd, "diamond");
  await head("toEnd", "circle");
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
  await until(async () => (await current()).edges[0].toEnd === "triangle");
  // SVG and PNG use the same coloured markers and stroke settings.
  const more = page
    .locator(".board-toolbar details")
    .filter({ has: page.locator('[data-feature="canvas-svg"]') });
  await more.locator("summary").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-feature="canvas-svg"]').click();
  const downloaded = await downloadPromise;
  const svg = await fs.readFile(await downloaded.path(), "utf8");
  assert.doesNotMatch(svg, /connector-selection/);
  assert.match(svg, /stroke-dasharray:8 5/);
  assert.match(svg, /fill="#f1a9a0"/);
  assert.match(svg, /M1 5L5 1L9 5L5 9Z/);
  if ((await more.getAttribute("open")) === null)
    await more.locator("summary").click();
  const pngPromise = page.waitForEvent("download");
  await page.locator('[data-feature="canvas-png"]').click();
  const png = await pngPromise;
  assert.ok((await fs.stat(await png.path())).size > 1000);
  for (const width of [1500, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(400);
    if (width === 390) {
      await page.evaluate(
        () => (document.documentElement.dataset.theme = "dark"),
      );
    }
    // Zooming and panning keep the selected connector toolbar inside the board.
    await menu("toEnd");
    const bar = await page.locator("#selection-tools").boundingBox();
    const pop = await page
      .locator('[data-selection-menu="toEnd"] .selection-popover')
      .boundingBox();
    assert.ok(bar.x >= 0 && bar.x + bar.width <= width + 1);
    assert.ok(pop.x >= 0 && pop.x + pop.width <= width + 1);
    assert.ok(pop.y >= 0 && pop.y + pop.height <= 1001);
    await page.screenshot({
      path: `/tmp/pencils-connector-toolbar-${width}.png`,
    });
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page
    .getByRole("button", { name: "Delete connector", exact: true })
    .click();
  await until(async () => (await current()).edges.length === 0);
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
  await until(async () => (await current()).edges.length === 1);
  assert.equal((await current()).edges[0].toEnd, "triangle");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: connector toolbar, all endpoint shapes, inline labels, colours, routing, strokes, undo, persistence, native Canvas fallback, SVG/PNG exports and mobile/dark layout",
  );
} catch (error) {
  console.error(errors);
  await page.screenshot({ path: "/tmp/pencils-connector-toolbar-failure.png" });
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
