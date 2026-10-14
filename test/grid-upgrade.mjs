import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { newGrid, syncGrid } from "../public/grid-model.js";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-grid-")),
  store = new Store(root);
await store.init();
const project = await store.createProject({ title: "Grid lab" }),
  initial = (await store.snapshot(project.id)).boards[0];
await store.updateBoard(project.id, initial.id, {
  revision: initial.revision,
  nodes: [
    {
      id: "grid",
      type: "grid",
      x: 400,
      y: 200,
      w: 600,
      h: 384,
      grid: newGrid(3, 3),
      text: "",
    },
    {
      id: "note",
      type: "sticky",
      x: 80,
      y: 250,
      w: 200,
      h: 120,
      text: "Contained note",
    },
    {
      id: "frame",
      type: "frame",
      x: 100,
      y: 650,
      w: 1100,
      h: 450,
      text: "Container",
    },
  ],
  settings: { snap: false, alignObjects: false },
  edges: [],
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
    process.env.BROWSER === "firefox" ? firefox : chromium
  ).launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1800, height: 1500 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const current = async () => (await store.snapshot(project.id)).boards[0];
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await page.waitForTimeout(70);
  }
  throw Error("Save did not settle");
}
const cell = (r, c) =>
  page.locator(
    `.board-node.grid.selected [data-grid-row="${r}"][data-grid-column="${c}"]`,
  );
const camera = () =>
  page.locator("#canvas-world").evaluate((el) => el.style.transform);

await page.addInitScript(
  (id) =>
    localStorage.setItem(
      `pencils:camera:${id}`,
      JSON.stringify({ x: 30, y: 30, z: 1 }),
    ),
  initial.id,
);
async function dragBetween(a, b) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 14 });
  await page.mouse.up();
}
async function center(loc) {
  let r;
  await until(async () => !!(r = await loc.boundingBox()));
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
const node = (id) => page.locator(`[data-node="${id}"]`);
const snapshotNode = async (id) =>
  (await current()).nodes.find((n) => n.id === id);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await page.locator("[data-view=board]").click();
  await page.keyboard.press("Escape");
  await page.locator(".grid-grip").click();
  await dragBetween(await center(cell(0, 0)), await center(cell(1, 1)));
  assert.equal(
    await page.locator('.grid-cell[aria-selected="true"]').count(),
    4,
  );
  await page.locator('summary[aria-label="Cell colour"]').click();
  await page.locator('[data-color-choice="#edc48b"]:visible').click();
  await until(
    async () =>
      (await snapshotNode("grid")).grid.cells[1][1].color === "#edc48b",
  );
  for (const [r, c] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ])
    assert.equal(
      (await snapshotNode("grid")).grid.cells[r][c].color,
      "#edc48b",
    );
  await cell(2, 2).click({ modifiers: ["Control"] });
  assert.equal(
    await page.locator('.grid-cell[aria-selected="true"]').count(),
    5,
  );
  await cell(0, 0).click();
  await cell(2, 1).click({ modifiers: ["Shift"] });
  assert.equal(
    await page.locator('.grid-cell[aria-selected="true"]').count(),
    6,
  );
  await page.locator('summary[aria-label="Grid background"]').click();
  await page.locator('[data-color-choice="#aed7dc"]:visible').click();
  await until(async () => (await snapshotNode("grid")).color === "#aed7dc");
  assert.ok(
    (
      await page
        .locator(".grid-cell")
        .evaluateAll((cells) =>
          cells.map((cell) => getComputedStyle(cell).backgroundColor),
        )
    ).every((color) => color === "rgb(174, 215, 220)"),
    "Grid background replaces selected and unselected cell colours",
  );
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
  await until(
    async () =>
      (await snapshotNode("grid")).grid.cells[1][1].color === "#edc48b",
  );
  assert.equal((await snapshotNode("grid")).grid.cells[2][2].color, undefined);
  await page
    .getByRole("button", { name: "Redo canvas change", exact: true })
    .click();
  await until(async () => (await snapshotNode("grid")).color === "#aed7dc");
  assert.equal(
    await cell(2, 2).evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(174, 215, 220)",
  );
  await cell(0, 0).click();
  await cell(0, 0).evaluate((el) => {
    const e = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clipboardData", {
      value: { getData: () => "A\tB\nC\tD" },
    });
    el.dispatchEvent(e);
  });
  await until(
    async () => (await snapshotNode("grid")).grid.cells[1][1].text === "D",
  );
  await cell(0, 0).click();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  assert.equal(
    await page.locator('.grid-cell[aria-selected="true"]').count(),
    4,
  );
  const copied = await cell(1, 1).evaluate((el) => {
    let text;
    const e = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clipboardData", {
      value: { setData: (_, v) => (text = v) },
    });
    el.dispatchEvent(e);
    return text;
  });
  assert.equal(copied, "A\tB\nC\tD");
  await page.keyboard.press("Delete");
  await until(
    async () => (await snapshotNode("grid")).grid.cells[1][1].text === "",
  );
  const noteBefore = await snapshotNode("note");
  await dragBetween(await center(node("note")), await center(cell(0, 0)));
  await until(async () => (await snapshotNode("note")).frame === "grid");
  let note = await snapshotNode("note");
  assert.deepEqual(note.gridCell, { row: 0, column: 0 });
  assert.equal(note.w, noteBefore.w);
  assert.equal(note.h, noteBefore.h);
  await page.keyboard.press("Escape");
  await page.locator(".grid-grip").click();
  const row0 = page.locator('[data-grid-axis="rows"][data-track="0"]'),
    row2 = page.locator('[data-grid-axis="rows"][data-track="2"]');
  await row0.click();
  assert.equal(
    await page.locator('.grid-cell[aria-selected="true"]').count(),
    3,
  );
  const beforeCancel = await current(),
    from = await center(row0),
    to = await center(row2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  assert.ok(await page.locator(".grid-reorder-marker").isVisible());
  assert.ok(await page.locator(".grid-drag-preview").isVisible());
  assert.ok(await page.locator(".grid-drag-preview .board-node").count());
  await until(async () =>
    (await page.locator(".grid-drag-status").textContent()).includes(
      "Release to move",
    ),
  );
  assert.deepEqual(
    (await current()).nodes,
    beforeCancel.nodes,
    "Reorder previews do not save intermediate layouts",
  );
  assert.ok(
    await cell(1, 0).evaluate(
      (el) => el.style.translate !== "" && el.style.translate !== "0px",
    ),
  );
  await page.screenshot({ path: "/tmp/pencils-grid-drag-preview.png" });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual((await current()).nodes, beforeCancel.nodes);
  assert.equal(
    await page
      .locator(".grid-drag-preview,.grid-reorder-marker,.grid-drag-status")
      .count(),
    0,
  );
  // Dropping outside the board cancels even with pointer capture.
  const canvasRect = await page.locator("#canvas").boundingBox();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 50, canvasRect.y - 20, { steps: 8 });
  await until(async () =>
    (await page.locator(".grid-drag-status").textContent()).includes("cancel"),
  );
  await page.mouse.up();
  assert.deepEqual((await current()).nodes, beforeCancel.nodes);
  assert.equal(await page.locator(".grid-drag-preview").count(), 0);
  // Moving within the original track is a no-op, without a history entry.
  await dragBetween(await center(row0), { x: from.x, y: from.y + 10 });
  assert.equal((await current()).revision, beforeCancel.revision);
  await dragBetween(await center(row0), await center(row2));
  await until(async () => (await snapshotNode("note")).gridCell.row === 2);
  const col0 = page.locator('[data-grid-axis="columns"][data-track="0"]'),
    col2 = page.locator('[data-grid-axis="columns"][data-track="2"]');
  await col0.click();
  assert.equal(
    await page.locator('.grid-cell[aria-selected="true"]').count(),
    3,
  );
  await dragBetween(await center(col0), await center(col2));
  await until(async () => (await snapshotNode("note")).gridCell.column === 2);
  // Track handles support keyboard reorder and restore focus to the moved track.
  await col2.focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await until(async () => (await snapshotNode("note")).gridCell.column === 1);
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.track),
    "1",
  );
  await page
    .getByRole("button", { name: "Undo canvas change", exact: true })
    .click();
  await until(async () => (await snapshotNode("note")).gridCell.column === 2);
  await node("note").click();
  await page.locator('#selection-tools [data-feature="lock"]').click();
  await until(async () => (await snapshotNode("note")).locked === true);
  await page.keyboard.press("Escape");
  await page.locator(".grid-grip").click();
  let before = await current(),
    grip = await center(page.locator(".grid-grip"));
  await dragBetween(grip, { x: grip.x + 90, y: grip.y + 45 });
  await until(
    async () =>
      (await snapshotNode("grid")).x !==
      before.nodes.find((n) => n.id === "grid").x,
  );
  note = await snapshotNode("note");
  assert.equal(note.x - before.nodes.find((n) => n.id === "note").x, 90);
  assert.equal(note.y - before.nodes.find((n) => n.id === "note").y, 45);
  await page.keyboard.press("Control+z");
  await until(
    async () =>
      (await snapshotNode("note")).x ===
      before.nodes.find((n) => n.id === "note").x,
  );
  await page.keyboard.press("Escape");
  await page.locator(".grid-grip").click();
  before = await current();
  await page.locator('#selection-tools [data-feature="duplicate"]').click();
  await until(
    async () => (await current()).nodes.length === before.nodes.length + 2,
  );
  const added = (await current()).nodes.filter(
      (n) => !before.nodes.some((o) => o.id === n.id),
    ),
    g = added.find((n) => n.type === "grid"),
    child = added.find((n) => n.type === "sticky");
  assert.equal(child.frame, g.id);
  assert.deepEqual(child.gridCell, { row: 2, column: 2 });
  await page.keyboard.press("Control+z");
  await until(
    async () => (await current()).nodes.length === before.nodes.length,
  );
  // Drag the grid into a frame, then move the frame with the nested, locked note.
  await page.keyboard.press("Escape");
  await page.locator(".grid-grip").click();
  grip = await center(page.locator(".grid-grip"));
  await dragBetween(grip, { x: grip.x, y: grip.y + 470 });
  await until(async () => (await snapshotNode("grid")).frame === "frame");
  before = await current();
  const titleBox = await node("frame").locator(".frame-title").boundingBox();
  let title = { x: titleBox.x + 40, y: titleBox.y + 12 };
  await dragBetween(title, { x: title.x + 40, y: title.y - 30 });
  await until(async () => (await snapshotNode("frame")).x === 140);
  for (const id of ["grid", "note"]) {
    const old = before.nodes.find((n) => n.id === id),
      now = await snapshotNode(id);
    assert.equal(now.x, old.x + 40);
    assert.equal(now.y, old.y - 30);
  }
  await page.reload();
  await page.locator(".grid-grip").waitFor();
  assert.equal((await snapshotNode("note")).frame, "grid");
  assert.equal((await snapshotNode("grid")).frame, "frame");
  await page.keyboard.press("Escape");
  await page.locator(".grid-grip").click();
  await page.screenshot({ path: "/tmp/pencils-grid-upgrade.png" });
  const beforeNudge = await current();
  await node("grid").focus();
  await page.keyboard.press("ArrowRight");
  await until(
    async () =>
      (await snapshotNode("note")).x ===
      beforeNudge.nodes.find((n) => n.id === "note").x + 5,
  );
  await page.keyboard.press("Control+z");
  await until(
    async () =>
      (await snapshotNode("note")).x ===
      beforeNudge.nodes.find((n) => n.id === "note").x,
  );
  const original = await snapshotNode("note");
  await page
    .locator('#selection-tools [data-feature="selection-delete"]')
    .click();
  await until(async () => !(await snapshotNode("grid")));
  assert.equal((await snapshotNode("note")).text, original.text);
  assert.equal((await snapshotNode("note")).frame, undefined);
  await page.keyboard.press("Control+z");
  await until(async () => !!(await snapshotNode("grid")));
  assert.equal((await snapshotNode("note")).frame, "grid");

  // Real touch events on a narrow, dark board; larger grips stay usable when zoomed out.
  if (process.env.BROWSER !== "firefox") {
    const grid = await snapshotNode("grid"),
      zoom = 0.35;
    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    mobile.on("pageerror", (e) => errors.push(e.message));
    await mobile.addInitScript(
      ({ id, x, y, z }) =>
        localStorage.setItem(
          `pencils:camera:${id}`,
          JSON.stringify({ x, y, z }),
        ),
      {
        id: initial.id,
        x: 110 - grid.x * zoom,
        y: 150 - grid.y * zoom,
        z: zoom,
      },
    );
    await mobile.emulateMedia({ reducedMotion: "reduce" });
    await mobile.goto(
      `http://127.0.0.1:${server.address().port}/#project/${project.id}/board`,
    );
    await mobile.locator("#canvas").waitFor();
    await mobile.evaluate(() =>
      window.PencilsAppearance.write({ theme: "dark" }),
    );
    await mobile.locator(".grid-grip").click();
    const handle = mobile.locator('[data-grid-axis="rows"][data-track="0"]');
    const start = await center(handle),
      end = await center(
        mobile.locator('[data-grid-axis="rows"][data-track="2"]'),
      );
    assert.ok((await handle.boundingBox()).width >= 23);
    const beforeTouch = await snapshotNode("grid");
    const cdp = await mobile.context().newCDPSession(mobile);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: start.x, y: start.y }],
    });
    for (let i = 1; i <= 10; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * i) / 10,
            y: start.y + ((end.y - start.y) * i) / 10,
          },
        ],
      });
    await mobile.locator(".grid-drag-preview").waitFor();
    assert.equal(
      await mobile
        .locator(".grid-reorder-item")
        .first()
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      "0s",
    );
    await mobile.screenshot({ path: "/tmp/pencils-grid-drag-mobile.png" });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await until(
      async () =>
        (await snapshotNode("grid")).grid.rows[2] === beforeTouch.grid.rows[0],
    );
    assert.equal(await mobile.locator(".grid-drag-preview").count(), 0);
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: range/additive/drag cell selection, bulk colour, grid background, row/column drag, auto-fit containment, locked children, nested frames, duplicate, undo and reload.",
  );
} catch (e) {
  console.error(
    "Browser errors",
    errors,
    "save state",
    await page.locator("#board-save").textContent(),
    "toast",
    await page.locator(".toast").allTextContents(),
    "nodes",
    (await current()).nodes.map((n) => ({
      id: n.id,
      type: n.type,
      frame: n.frame,
      gridCell: n.gridCell,
      x: n.x,
      y: n.y,
    })),
  );
  await page.screenshot({ path: "/tmp/pencils-grid-upgrade-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
