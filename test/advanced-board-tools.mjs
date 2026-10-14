import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { newGrid } from "../public/grid-model.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-components-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Components", key: "COMP" }),
  task = await store.createTask(project.id, {
    title: "Scheduled task",
    start: "2026-10-14",
    due: "2026-10-18",
  });
await store.createTask(project.id, { title: "Unscheduled task" });
let board = (await store.snapshot(project.id)).boards[0];
const grid = newGrid();
grid.cells[0][0].text = "Alpha";
grid.cells[0][1].text = "Beta";
board = await store.updateBoard(project.id, board.id, {
  revision: board.revision,
  nodes: [
    {
      id: "note",
      type: "sticky",
      text: "Typography note",
      x: 150,
      y: 240,
      w: 240,
      h: 180,
    },
    {
      id: "note2",
      type: "sticky",
      text: "Second note",
      x: 500,
      y: 240,
      w: 180,
      h: 120,
    },
    {
      id: "shape",
      type: "shape",
      text: "Decision",
      x: 850,
      y: 240,
      w: 240,
      h: 180,
    },
    {
      id: "grid",
      type: "grid",
      text: "",
      x: 150,
      y: 550,
      w: 540,
      h: 312,
      grid,
    },
    {
      id: "frame",
      type: "frame",
      text: "Frame one",
      x: 1100,
      y: 600,
      w: 640,
      h: 400,
    },
    {
      id: "query",
      type: "query",
      text: "Live work",
      x: 850,
      y: 1100,
      w: 800,
      h: 500,
      query: {},
      viewType: "table",
    },
  ],
  edges: [{ id: "edge", from: "note", to: "note2", label: "Connection" }],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`,
  browser = await (
    process.env.BROWSER === "firefox" ? firefox : chromium
  ).launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(10000);
const current = async () => (await store.snapshot(project.id)).boards[0];
async function until(fn) {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await page.waitForTimeout(80);
  }
  throw Error("Save timed out");
}
async function menu(key) {
  const m = page.locator(`[data-selection-menu="${key}"]`);
  if ((await m.getAttribute("open")) === null)
    await m.locator(":scope > summary").click();
  return m;
}
async function find(id, text) {
  const search = page.locator("#canvas-find");
  if (!(await search.isVisible()))
    await page.locator('[data-pro="search-toggle"]').click();
  await search.fill(text);
  await page.locator(`[data-pro="find-result"][data-id="${id}"]`).click();
  await page.waitForTimeout(100);
}
async function more() {
  const m = page.locator("[data-board-menu=more]");
  if ((await m.getAttribute("open")) === null)
    await m.locator(":scope > summary").click();
}
try {
  await page.goto(base);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  // Add multiple notes in one undoable operation.
  await more();
  await page.locator("[data-layout-tool=bulk-notes]").click();
  await page
    .locator("#bulk-stickies-form textarea")
    .fill("First bulk note\nSecond bulk note");
  await page
    .locator(
      "#bulk-stickies-form button[type=submit],#bulk-stickies-form .dialog-foot button",
    )
    .click();
  await until(
    async () =>
      (await current()).nodes.filter((n) => n.text?.includes("bulk note"))
        .length === 2,
  );
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
  await until(async () =>
    (await current()).nodes.every((n) => !n.text?.includes("bulk note")),
  );
  console.log("Bulk notes and undo");
  // Connector bends and labels remain on the main board.
  await find("note", "Typography");
  await page.keyboard.press("Escape");
  const line = page.locator("path.canvas-edge[data-edge=edge]");
  const p = await line.evaluate((el) => {
    const p = el.getPointAtLength(el.getTotalLength() / 2),
      q = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
    return { x: q.x, y: q.y };
  });
  await page.mouse.click(p.x, p.y);
  await page.locator(".connector-tools").waitFor();
  let h = await page.locator("[data-bend=new]").boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x, h.y + 80, { steps: 8 });
  await page.mouse.up();
  await until(async () => (await current()).edges[0].bends?.length === 1);
  await menu("label");
  await page.locator("[data-connector-command=add-label]").click();
  await until(async () => (await current()).edges[0].labels?.length === 1);
  await menu("label");
  await page.locator('[data-extra-label="0"]').fill("Extra context");
  await page.locator('[data-extra-label="0"]').press("Tab");
  await until(
    async () => (await current()).edges[0].labels[0].text === "Extra context",
  );
  h = await page.locator('[data-edge-label="0"]').boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 50, h.y + 60, { steps: 8 });
  await page.mouse.up();
  await until(async () => (await current()).edges[0].labels[0].y > 24);
  console.log("Connector bend and multiple draggable labels");
  // Import and replace an image without changing its ID or layout.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator("[data-board-menu=add] > summary").click();
  const chooser = page.waitForEvent("filechooser");
  await page.locator("[data-feature=image-add]").click();
  await (
    await chooser
  ).setFiles({ name: "image.png", mimeType: "image/png", buffer: png });
  await until(async () =>
    (await current()).nodes.some((n) => n.type === "image"),
  );
  const img = (await current()).nodes.find((n) => n.type === "image");
  await find(img.id, "image.png");
  await menu("geometry");
  await page.locator('[data-crop-side="0"]').evaluate((el) => {
    el.value = "20";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === img.id).crop?.[0] === 0.2,
  );
  await menu("geometry");
  const replacement = page.waitForEvent("filechooser");
  await page.locator("[data-image-command=replace]").click();
  await (
    await replacement
  ).setFiles({ name: "replacement.png", mimeType: "image/png", buffer: png });
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === img.id).src !== img.src,
  );
  const after = (await current()).nodes.find((n) => n.id === img.id);
  assert.equal(after.w, img.w);
  assert.equal(after.x, img.x);
  assert.equal(after.crop[0], 0.2);
  await menu("geometry");
  await page.locator("[data-image-command=reset]").click();
  await until(
    async () =>
      (await current()).nodes.find((n) => n.id === img.id).crop == null,
  );
  console.log(
    "Image crop/reset and replacement preserve identity and dimensions",
  );
  // Lasso uses a freehand selection boundary.
  await find("note", "Typography");
  await page.keyboard.press("p");
  await page.locator("[data-pen-mode=lasso]").click();
  const n = await page.locator("[data-node=note]").boundingBox();
  await page.mouse.move(n.x - 15, n.y - 15);
  await page.mouse.down();
  for (const [x, y] of [
    [n.x + n.width + 15, n.y - 15],
    [n.x + n.width + 15, n.y + n.height + 15],
    [n.x - 15, n.y + n.height + 15],
    [n.x - 15, n.y - 15],
  ])
    await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.up();
  assert.ok(
    await page
      .locator("[data-node=note]")
      .evaluate((e) => e.classList.contains("selected")),
  );
  console.log("Lasso selects enclosed objects");
  assert.deepEqual(errors, []);
  console.log("PASS: additional board tools");
} catch (e) {
  await page.screenshot({
    path: "/tmp/pencils-component-upgrades-failure.png",
  });
  console.error(errors);
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  store.close?.();
  await fs.rm(root, { recursive: true, force: true });
}
