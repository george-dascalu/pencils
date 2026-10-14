import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { reveal } from "./menu-controls.mjs";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-alignment-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Alignment lab" });
let board = (await store.snapshot(project.id)).boards[0];
const note = (id, x, y, extra = {}) => ({
  id,
  type: "sticky",
  text: id,
  x,
  y,
  w: 120,
  h: 100,
  ...extra,
});
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  settings: { snap: false },
  nodes: [note("target", 350, 300), note("moving", 100, 500)],
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(
  (id) =>
    localStorage.setItem(
      `pencils:camera:${id}`,
      JSON.stringify({ x: 50, y: 20, z: 1 }),
    ),
  board.id,
);
const current = async () =>
  (await store.snapshot(project.id)).boards.find((b) => b.id === board.id);
const node = (id) => page.locator(`[data-node="${id}"]`);
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Save did not complete");
}
async function enter(p = page) {
  await p.goto(base);
  await p.locator(".project-link").click();
  await p.locator("[data-view=board]").click();
  await p.locator("#canvas").waitFor();
}
async function drag(id, x, y, { alt = false } = {}) {
  const original = (await current()).nodes.find((n) => n.id === id);
  const r = await node(id).boundingBox();
  const z = await page
    .locator("#canvas-world")
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  if (alt) await page.keyboard.down("Alt");
  await page.mouse.move(
    r.x + r.width / 2 + (x - original.x) * z,
    r.y + r.height / 2 + (y - original.y) * z,
    { steps: 8 },
  );
}
const position = async (id) =>
  node(id).evaluate((el) => ({
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
  }));
async function fixture(nodes) {
  const b = await current();
  await store.updateBoard(project.id, board.id, {
    revision: b.revision,
    nodes,
  });
  await page.reload();
  await node(nodes[0].id).waitFor();
}
try {
  await enter();
  await drag("moving", 346, 500);
  assert.equal((await position("moving")).x, 350);
  assert.ok(await page.locator(".alignment-guides .guide-align").count());
  await page.mouse.up();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "moving").x === 350,
  );
  assert.equal(await page.locator(".alignment-guides").count(), 0);
  await page.keyboard.press("Control+z");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "moving").x === 100,
  );
  await drag("moving", 347, 500, { alt: true });
  assert.equal((await position("moving")).x, 347);
  assert.equal(await page.locator(".alignment-guides").count(), 0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  assert.equal((await position("moving")).x, 100);
  assert.equal(
    (await current()).nodes.length,
    2,
    "Alt pressed after drag start bypasses snapping without duplication",
  );
  await drag("moving", 346, 500);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await page.locator(".alignment-guides").count(), 0);
  assert.equal((await current()).nodes.find((n) => n.id === "moving").x, 100);

  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  await page.locator("#canvas-align").uncheck();
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  await until(async () => (await current()).settings.alignObjects === false);
  await page.reload();
  await node("moving").waitFor();
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  assert.equal(await page.locator("#canvas-align").isChecked(), false);
  await page.keyboard.press("Escape");
  await drag("moving", 346, 500);
  assert.equal((await position("moving")).x, 346);
  await page.mouse.up();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "moving").x === 346,
  );
  const fresh = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
  });
  fresh.setDefaultTimeout(12000);
  await enter(fresh);
  await fresh
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  assert.equal(await fresh.locator("#canvas-align").isChecked(), false);
  await fresh.keyboard.press("Escape");
  await fresh.close();
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  await page.locator("#canvas-align").check();
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  await until(async () => (await current()).settings.alignObjects === true);

  await fixture([
    note("a", 100, 300),
    note("b", 260, 300),
    note("moving", 600, 300),
  ]);
  await drag("moving", 424, 300);
  assert.equal((await position("moving")).x, 420);
  assert.equal(await page.locator(".alignment-guides .guide-gap").count(), 2);
  assert.deepEqual(
    await page.locator(".alignment-guides text").allTextContents(),
    ["40", "40"],
  );
  assert.equal(await page.locator("#selection-tools").isVisible(), false);
  await page.screenshot({ path: "/tmp/pencils-alignment-guides.png" });
  await page.mouse.up();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "moving").x === 420,
  );
  await page.reload();
  await node("moving").waitFor();
  assert.equal((await position("moving")).x, 420);

  await fixture([
    note("a", 107, 300, { group: "g" }),
    note("b", 253, 317, { group: "g" }),
    note("target", 600, 500),
  ]);
  await drag("a", 596, 300);
  assert.equal((await position("a")).x, 600);
  assert.equal((await position("b")).x - (await position("a")).x, 146);
  assert.equal((await position("b")).y - (await position("a")).y, 17);
  await page.mouse.up();
  await until(
    async () => (await current()).nodes.find((n) => n.id === "a").x === 600,
  );
  // Resize uses the same nearby-object setting, with paired dimension guides.
  const resizeFixture = () =>
    fixture([
      note("target", 420, 300, { w: 247, h: 183 }),
      note("moving", 100, 500, { w: 180, h: 140 }),
    ]);
  const size = () =>
    node("moving").evaluate((el) => ({
      w: parseFloat(el.style.width),
      h: parseFloat(el.style.height),
    }));
  async function resize(dx, dy, modifier, corner = "se") {
    await node("moving").click();
    const handle = await node("moving")
      .locator(`.resize-handle[data-resize-corner="${corner}"]`)
      .boundingBox();
    const z = await page
      .locator("#canvas-world")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handle.x + handle.width / 2 + dx * z,
      handle.y + handle.height / 2 + dy * z,
      { steps: 8 },
    );
  }
  await resizeFixture();
  await resize(64, 40);
  assert.deepEqual(await size(), { w: 247, h: 183 });
  assert.equal(await page.locator(".guide-size").count(), 4);
  assert.deepEqual(await page.locator(".guide-size text").allTextContents(), [
    "W 247",
    "W 247",
    "H 183",
    "H 183",
  ]);
  await page.screenshot({ path: "/tmp/pencils-resize-guides.png" });
  await page.mouse.up();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "moving").w === 247,
  );
  assert.equal(await page.locator(".alignment-guides").count(), 0);
  await page.reload();
  await node("moving").waitFor();
  assert.deepEqual(await size(), { w: 247, h: 183 });
  await resizeFixture();
  await resize(64, 40, "Shift");
  assert.deepEqual(await size(), { w: 247, h: 140 });
  assert.equal(await page.locator(".guide-size").count(), 2);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Shift");
  assert.deepEqual(await size(), { w: 180, h: 140 });
  assert.equal(await page.locator(".alignment-guides").count(), 0);
  await resize(64, 40, "Alt");
  assert.deepEqual(await size(), { w: 244, h: 180 });
  assert.equal(await page.locator(".alignment-guides").count(), 0);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "moving").w === 244,
  );
  await page.keyboard.press("Control+z");
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === "moving").w === 180,
  );
  // Every corner uses the same size magnets and keeps the opposite corner fixed.
  for (const corner of ["nw", "ne", "sw", "se"]) {
    await resizeFixture();
    await node("moving").click();
    assert.equal(await node("moving").locator(".resize-handle").count(), 4);
    const west = corner.includes("w"),
      north = corner.includes("n");
    await resize(west ? -64 : 64, north ? -40 : 40, undefined, corner);
    assert.deepEqual(await size(), { w: 247, h: 183 });
    const p = await position("moving");
    assert.equal(p.x, west ? 33 : 100);
    assert.equal(p.y, north ? 457 : 500);
    assert.equal(
      await page.locator(".resize-dimensions").textContent(),
      "247 × 183",
    );
    await page.screenshot({ path: `/tmp/pencils-resize-${corner}.png` });
    await page.mouse.up();
    await until(
      async () =>
        (await current()).nodes.find((n) => n.id === "moving").w === 247,
    );
    await page.keyboard.press("Control+z");
    await until(
      async () =>
        (await current()).nodes.find((n) => n.id === "moving").w === 180,
    );
    assert.equal((await position("moving")).x, 100);
    assert.equal((await position("moving")).y, 500);
  }
  await resize(-64, -40, "Shift", "nw");
  assert.deepEqual(await size(), { w: 247, h: 140 });
  assert.equal((await position("moving")).x, 33);
  assert.equal((await position("moving")).y, 500);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Shift");
  assert.deepEqual(await size(), { w: 180, h: 140 });
  assert.equal(await page.locator(".resize-dimensions").count(), 0);
  await page
    .getByRole("button", { name: "Board settings", exact: true })
    .click();
  await page.locator("#canvas-align").uncheck();
  await page
    .getByRole("button", { name: "Apply settings", exact: true })
    .click();
  await until(async () => (await current()).settings.alignObjects === false);
  await resize(64, 40);
  assert.deepEqual(await size(), { w: 244, h: 180 });
  assert.equal(await page.locator(".alignment-guides").count(), 0);
  await page.mouse.up();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: live guides, edge snapping, equal gaps, Alt bypass, Escape cleanup, undo, group geometry, resize dimension matching and per-board persistence across reload/devices.",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-alignment-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
