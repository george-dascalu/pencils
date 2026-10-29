// Board grids: range, additive and drag cell selection, bulk cell colour, the grid background,
// tab-separated paste and copy, objects contained in cells at their own size, row and column
// reordering by drag (with a preview that saves nothing until release, and cancellation) and by
// keyboard, locked children that move and duplicate with their grid, grids nested in frames,
// undo, reload, and a phone touch drag on enlarged handles with reduced motion.
// The steps build on each other (the note moves into the grid, the grid into the frame), so the
// file runs in order.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { newGrid } from "../../public/grid-model.js";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Grid lab" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "grid", type: "grid", x: 400, y: 200, w: 600, h: 384, grid: newGrid(3, 3), text: "" },
      { id: "note", type: "sticky", x: 80, y: 250, w: 200, h: 120, text: "Contained note" },
      { id: "frame", type: "frame", x: 100, y: 650, w: 1100, h: 450, text: "Container" },
    ],
    settings: { snap: false, alignObjects: false },
    edges: [],
  });
  return { project, board };
});

test.describe.configure({ mode: "serial" });
test.use({ viewportSize: { width: 1800, height: 1500 } });

const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
const snapshotNode = async (id) => (await current()).nodes.find((n) => n.id === id);
const poll = (fn, message) => expect.poll(fn, { message, timeout: 10000 });
const cell = (page, r, c) => page.locator(`.board-node.grid.selected [data-grid-row="${r}"][data-grid-column="${c}"]`);
const selectedCells = (page) => page.locator('.grid-cell[aria-selected="true"]');
const node = (page, id) => page.locator(`[data-node="${id}"]`);

async function dragBetween(page, a, b) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 14 });
  await page.mouse.up();
}
async function center(locator) {
  await expect(locator).toBeVisible();
  const r = await locator.boundingBox();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
async function openBoard(page) {
  await page.addInitScript((id) => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 30, y: 30, z: 1 })), app.board.id);
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator(".grid-grip").waitFor();
}
// Select the grid itself through its grip.
async function selectGrid(page) {
  await page.keyboard.press("Escape");
  await page.locator(".grid-grip").click();
  await expect(node(page, "grid")).toHaveClass(/\bselected\b/);
}
async function openGrid(page) {
  await openBoard(page);
  await selectGrid(page);
}

test("dragging across cells selects a range, Ctrl and Shift extend it, and a cell colour paints every selected cell", async ({ page }) => {
  await openGrid(page);
  await dragBetween(page, await center(cell(page, 0, 0)), await center(cell(page, 1, 1)));
  await expect(selectedCells(page)).toHaveCount(4);
  await page.locator('summary[aria-label="Cell colour"]').click();
  await page.locator('[data-color-choice="#edc48b"]:visible').click();
  await poll(async () => (await snapshotNode("grid")).grid.cells[1][1].color).toBe("#edc48b");
  for (const [r, c] of [[0, 0], [0, 1], [1, 0], [1, 1]]) expect((await snapshotNode("grid")).grid.cells[r][c].color).toBe("#edc48b");
  await cell(page, 2, 2).click({ modifiers: ["Control"] });
  await expect(selectedCells(page)).toHaveCount(5);
  await cell(page, 0, 0).click();
  await cell(page, 2, 1).click({ modifiers: ["Shift"] });
  await expect(selectedCells(page)).toHaveCount(6);
});

test("the grid background replaces selected and unselected cell colours, with undo and redo", async ({ page }) => {
  await openGrid(page);
  await page.locator('summary[aria-label="Grid background"]').click();
  await page.locator('[data-color-choice="#aed7dc"]:visible').click();
  await poll(async () => (await snapshotNode("grid")).color).toBe("#aed7dc");
  await expect
    .poll(() => page.locator(".grid-cell").evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).backgroundColor)), {
      message: "Grid background replaces selected and unselected cell colours",
    })
    .toEqual(Array(9).fill("rgb(174, 215, 220)"));
  await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
  await poll(async () => (await snapshotNode("grid")).color).not.toBe("#aed7dc");
  expect((await snapshotNode("grid")).grid.cells[1][1].color).toBe("#edc48b");
  expect((await snapshotNode("grid")).grid.cells[2][2].color).toBeUndefined();
  await page.getByRole("button", { name: "Redo canvas change", exact: true }).click();
  await poll(async () => (await snapshotNode("grid")).color).toBe("#aed7dc");
  await expect(cell(page, 2, 2)).toHaveCSS("background-color", "rgb(174, 215, 220)");
});

test("pasting tab-separated text fills cells, copying reads the selected range and Delete clears it", async ({ page }) => {
  await openGrid(page);
  await cell(page, 0, 0).click();
  await cell(page, 0, 0).evaluate((el) => {
    const e = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clipboardData", { value: { getData: () => "A\tB\nC\tD" } });
    el.dispatchEvent(e);
  });
  await poll(async () => (await snapshotNode("grid")).grid.cells[1][1].text).toBe("D");
  await cell(page, 0, 0).click();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(selectedCells(page)).toHaveCount(4);
  const copied = await cell(page, 1, 1).evaluate((el) => {
    let text;
    const e = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clipboardData", { value: { setData: (_, v) => (text = v) } });
    el.dispatchEvent(e);
    return text;
  });
  expect(copied).toBe("A\tB\nC\tD");
  await page.keyboard.press("Delete");
  await poll(async () => (await snapshotNode("grid")).grid.cells[1][1].text).toBe("");
});

test("a note dropped on a cell is contained there at its own size", async ({ page }) => {
  await openGrid(page);
  const noteBefore = await snapshotNode("note");
  await dragBetween(page, await center(node(page, "note")), await center(cell(page, 0, 0)));
  await poll(async () => (await snapshotNode("note")).frame).toBe("grid");
  const note = await snapshotNode("note");
  expect(note.gridCell).toEqual({ row: 0, column: 0 });
  expect(note.w).toBe(noteBefore.w);
  expect(note.h).toBe(noteBefore.h);
});

test("a row drag previews the move without saving and cancels with Escape, outside the board or in place", async ({ page }) => {
  await openGrid(page);
  const row0 = page.locator('[data-grid-axis="rows"][data-track="0"]');
  const row2 = page.locator('[data-grid-axis="rows"][data-track="2"]');
  await row0.click();
  await expect(selectedCells(page)).toHaveCount(3);
  const beforeCancel = await current();
  const from = await center(row0), to = await center(row2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(page.locator(".grid-reorder-marker")).toBeVisible();
  await expect(page.locator(".grid-drag-preview")).toBeVisible();
  expect(await page.locator(".grid-drag-preview .board-node").count()).toBeGreaterThan(0);
  await expect(page.locator(".grid-drag-status")).toContainText("Release to move");
  expect((await current()).nodes, "Reorder previews do not save intermediate layouts").toEqual(beforeCancel.nodes);
  expect(await cell(page, 1, 0).evaluate((el) => el.style.translate !== "" && el.style.translate !== "0px")).toBe(true);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await current()).nodes).toEqual(beforeCancel.nodes);
  await expect(page.locator(".grid-drag-preview,.grid-reorder-marker,.grid-drag-status")).toHaveCount(0);
  // Dropping outside the board cancels even with pointer capture.
  const canvasRect = await page.locator("#canvas").boundingBox();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 50, canvasRect.y - 20, { steps: 8 });
  await expect(page.locator(".grid-drag-status")).toContainText("cancel");
  await page.mouse.up();
  expect((await current()).nodes).toEqual(beforeCancel.nodes);
  await expect(page.locator(".grid-drag-preview")).toHaveCount(0);
  // Moving within the original track is a no-op, without a history entry.
  await dragBetween(page, await center(row0), { x: from.x, y: from.y + 10 });
  expect((await current()).revision).toBe(beforeCancel.revision);
});

test("rows and columns reorder by drag and by keyboard, carrying their contents, with undo", async ({ page }) => {
  await openGrid(page);
  const row0 = page.locator('[data-grid-axis="rows"][data-track="0"]');
  const row2 = page.locator('[data-grid-axis="rows"][data-track="2"]');
  await dragBetween(page, await center(row0), await center(row2));
  await poll(async () => (await snapshotNode("note")).gridCell.row).toBe(2);
  const col0 = page.locator('[data-grid-axis="columns"][data-track="0"]');
  const col2 = page.locator('[data-grid-axis="columns"][data-track="2"]');
  await col0.click();
  await expect(selectedCells(page)).toHaveCount(3);
  await dragBetween(page, await center(col0), await center(col2));
  await poll(async () => (await snapshotNode("note")).gridCell.column).toBe(2);
  // Track handles support keyboard reorder and restore focus to the moved track.
  await col2.focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await poll(async () => (await snapshotNode("note")).gridCell.column).toBe(1);
  await poll(() => page.evaluate(() => document.activeElement.dataset.track)).toBe("1");
  await page.getByRole("button", { name: "Undo canvas change", exact: true }).click();
  await poll(async () => (await snapshotNode("note")).gridCell.column).toBe(2);
});

test("moving and duplicating a grid carries its locked children, with undo", async ({ page }) => {
  await openBoard(page);
  await node(page, "note").click();
  await page.locator('#selection-tools [data-feature="lock"]').click();
  await poll(async () => (await snapshotNode("note")).locked).toBe(true);
  await selectGrid(page);
  let before = await current();
  const grip = await center(page.locator(".grid-grip"));
  await dragBetween(page, grip, { x: grip.x + 90, y: grip.y + 45 });
  await poll(async () => (await snapshotNode("grid")).x).not.toBe(before.nodes.find((n) => n.id === "grid").x);
  const note = await snapshotNode("note");
  expect(note.x - before.nodes.find((n) => n.id === "note").x).toBe(90);
  expect(note.y - before.nodes.find((n) => n.id === "note").y).toBe(45);
  await page.keyboard.press("Control+z");
  await poll(async () => (await snapshotNode("note")).x).toBe(before.nodes.find((n) => n.id === "note").x);
  await selectGrid(page);
  before = await current();
  await page.locator('#selection-tools [data-feature="duplicate"]').click();
  await poll(async () => (await current()).nodes.length).toBe(before.nodes.length + 2);
  const added = (await current()).nodes.filter((n) => !before.nodes.some((o) => o.id === n.id));
  const g = added.find((n) => n.type === "grid"), child = added.find((n) => n.type === "sticky");
  expect(child.frame).toBe(g.id);
  expect(child.gridCell).toEqual({ row: 2, column: 2 });
  await page.keyboard.press("Control+z");
  await poll(async () => (await current()).nodes.length).toBe(before.nodes.length);
});

test("a grid dragged into a frame moves with the frame, nested children included, and stays nested after reload", async ({ page }) => {
  await openGrid(page);
  const grip = await center(page.locator(".grid-grip"));
  await dragBetween(page, grip, { x: grip.x, y: grip.y + 470 });
  await poll(async () => (await snapshotNode("grid")).frame).toBe("frame");
  const before = await current();
  const titleBox = await node(page, "frame").locator(".frame-title").boundingBox();
  const title = { x: titleBox.x + 40, y: titleBox.y + 12 };
  await dragBetween(page, title, { x: title.x + 40, y: title.y - 30 });
  await poll(async () => (await snapshotNode("frame")).x).toBe(140);
  for (const id of ["grid", "note"]) {
    const old = before.nodes.find((n) => n.id === id), now = await snapshotNode(id);
    expect(now.x).toBe(old.x + 40);
    expect(now.y).toBe(old.y - 30);
  }
  await page.reload();
  await page.locator(".grid-grip").waitFor();
  expect((await snapshotNode("note")).frame).toBe("grid");
  expect((await snapshotNode("grid")).frame).toBe("frame");
});

test("nudging a grid moves its children, and deleting it frees them until undo restores it", async ({ page }) => {
  await openGrid(page);
  const beforeNudge = await current();
  await node(page, "grid").focus();
  await page.keyboard.press("ArrowRight");
  await poll(async () => (await snapshotNode("note")).x).toBe(beforeNudge.nodes.find((n) => n.id === "note").x + 5);
  await page.keyboard.press("Control+z");
  await poll(async () => (await snapshotNode("note")).x).toBe(beforeNudge.nodes.find((n) => n.id === "note").x);
  const original = await snapshotNode("note");
  await page.locator('#selection-tools [data-feature="selection-delete"]').click();
  await poll(async () => !!(await snapshotNode("grid"))).toBe(false);
  expect((await snapshotNode("note")).text).toBe(original.text);
  expect((await snapshotNode("note")).frame).toBeUndefined();
  await page.keyboard.press("Control+z");
  await poll(async () => !!(await snapshotNode("grid"))).toBe(true);
  expect((await snapshotNode("note")).frame).toBe("grid");
});

// Real touch events on a narrow, dark board; larger grips stay usable when zoomed out.
onDevices(["phone"], () => test("a touch drag on an enlarged row handle reorders rows on a dark phone board, without motion", async ({ page }) => {
  const grid = await snapshotNode("grid"), zoom = 0.35;
  await page.addInitScript(
    ({ id, x, y, z }) => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x, y, z })),
    { id: app.board.id, x: 110 - grid.x * zoom, y: 150 - grid.y * zoom, z: zoom },
  );
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await page.locator(".grid-grip").click();
  const handle = page.locator('[data-grid-axis="rows"][data-track="0"]');
  const start = await center(handle), end = await center(page.locator('[data-grid-axis="rows"][data-track="2"]'));
  expect((await handle.boundingBox()).width).toBeGreaterThanOrEqual(23);
  const beforeTouch = await snapshotNode("grid");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start.x, y: start.y }] });
  for (let i = 1; i <= 10; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: start.x + ((end.x - start.x) * i) / 10, y: start.y + ((end.y - start.y) * i) / 10 }],
    });
  await page.locator(".grid-drag-preview").waitFor();
  // Reduced motion disables the gap animation. The app-wide reduced-motion
  // rule (task-tools.css) sets every transition to 0.01ms, not 0s.
  const reorderDuration = await page.locator(".grid-reorder-item").first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(
    reorderDuration.split(",").every((d) => parseFloat(d) * (d.trim().endsWith("ms") ? 1 : 1000) < 1),
    `Reduced motion keeps the reorder instant (${reorderDuration})`,
  ).toBe(true);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await poll(async () => (await snapshotNode("grid")).grid.rows[2]).toBe(beforeTouch.grid.rows[0]);
  await expect(page.locator(".grid-drag-preview")).toHaveCount(0);
}));
