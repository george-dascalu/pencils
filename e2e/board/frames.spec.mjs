// Board frames: frame surface clicks and taps, nested selection, modifier toggles, marquee,
// cancellation, untitled and locked frames, drawing and cancelling frames, dragging a
// selected surface, nested movement, attach/detach, full-content duplicate/paste, a fixed
// camera, size presets/fit/select contents, safe deletion with undo, collapsed presentation,
// slide reordering, colours, persistence, and the toolbar on phones and in dark mode.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";
import { savedBoard, seedBoard, presetCamera, boardSettled, findOnBoard, worldPoint, canvasZoom, savesSettled } from "../helpers/board-canvas.mjs";

const note = { id: "note", type: "sticky", text: "Contained idea", x: 210, y: 390, w: 180, h: 100, frame: "inner" };
const fixtures = [
  { id: "outer", type: "frame", text: "Workshop", x: 100, y: 200, w: 700, h: 500 },
  { id: "inner", type: "frame", text: "Discussion", x: 180, y: 340, w: 300, h: 220, frame: "outer" },
  note,
  { id: "second", type: "frame", text: "Next steps", x: 900, y: 200, w: 400, h: 500 },
];

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Frame lab" });
  return { project, board: (await store.snapshot(project.id)).boards[0] };
});

test.use({ viewportSize: { width: 1600, height: 1100 } });

const current = () => savedBoard(app.store, app.project.id, app.board.id);
const saved = (id) => current().then((b) => b.nodes.find((n) => n.id === id));
const node = (page, id) => page.locator(`[data-node="${id}"]`);
const selectedIds = (page) => page.locator(".board-node.selected").evaluateAll((els) => els.map((el) => el.dataset.node).sort());
// Read the transform in one evaluation: a re-render after paste can detach the element
// between a locator's lookup and its evaluate.
const camera = (page) => page.evaluate(() => getComputedStyle(document.querySelector("#canvas-world")).transform);

async function open(page, nodes = fixtures) {
  await seedBoard(app.store, app.project.id, {
    nodes,
    edges: nodes.some((n) => n.id === "inner")
      ? [
          { id: "internal", from: "inner", to: "note" },
          { id: "external", from: "note", to: "second" },
        ]
      : [],
    settings: { snap: false, alignObjects: false },
    presentation: [],
  }, app.board.id);
  await presetCamera(page, app.board.id, { x: 40, y: 20, z: 0.8 });
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await node(page, nodes[0].id).waitFor();
}

// Drag an object (or a frame by its title) by (dx, dy) board units.
async function move(page, id, dx, dy, title = false) {
  const el = title ? node(page, id).locator(".frame-title") : node(page, id);
  const r = await el.boundingBox(), z = await canvasZoom(page);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + dx * z, r.y + r.height / 2 + dy * z, { steps: 8 });
  await page.mouse.up();
}

// Drag from a board point inside a selected frame's surface, optionally cancelling with Escape.
async function moveSurface(page, x, y, dx, dy, cancel = false) {
  const start = await worldPoint(page, x, y), end = await worldPoint(page, x + dx, y + dy);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.locator(".marquee"), "Dragging a selected frame does not start a selection box").toHaveCount(0);
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
}

async function toolbarStaysOnScreen(page) {
  await open(page);
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await findOnBoard(page, "outer", "Workshop");
  const width = page.viewportSize().width;
  await expect.poll(async () => {
    const r = await page.locator("#selection-tools").boundingBox();
    return r.x >= 0 && r.x + r.width <= width;
  }, { message: "the selection toolbar stays within the viewport" }).toBe(true);
}

test("drawing a frame around a note contains it and focuses the new untitled frame; Escape cancels another", async ({ page }) => {
  await open(page, [{ ...note, frame: undefined, x: 250, y: 300 }]);
  await page.locator('[aria-label="Draw frame"]').click();
  const start = await worldPoint(page, 200, 250), end = await worldPoint(page, 550, 500);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.locator(".frame-preview")).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => (await current()).nodes.length).toBe(2);
  const frame = (await current()).nodes.find((n) => n.type === "frame");
  expect([frame.x, frame.y, frame.w, frame.h]).toEqual([200, 250, 350, 250]);
  expect((await saved("note")).frame).toBe(frame.id);
  await expect(node(page, frame.id).locator(".frame-title")).toHaveText("");
  await expect.poll(() => page.evaluate(() => document.activeElement.dataset.node)).toBe(frame.id);

  await page.keyboard.press("f");
  const cancel = await worldPoint(page, 650, 550);
  await page.mouse.move(cancel.x, cancel.y);
  await page.mouse.down();
  await page.mouse.move(cancel.x + 100, cancel.y + 70);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".frame-preview")).toHaveCount(0);
  expect((await current()).nodes).toHaveLength(2);
});

test("clicking empty frame space selects the frame, with nested frames, modifiers, children, jitter, marquee and Escape", async ({ page }) => {
  await open(page);
  await findOnBoard(page, "outer", "Workshop");
  // Stay below the nested frame toolbar when adding its parent to selection.
  const emptyInside = await worldPoint(page, 600, 650);
  await page.mouse.click(emptyInside.x, emptyInside.y);
  await expect.poll(() => selectedIds(page), { message: "Empty frame space selects its frame" }).toEqual(["outer"]);
  const selectionCamera = await camera(page), selectionBoard = await current();
  const innerInside = await worldPoint(page, 440, 520);
  await page.mouse.click(innerInside.x, innerInside.y);
  await expect.poll(() => selectedIds(page), { message: "Nested frames take precedence" }).toEqual(["inner"]);
  await page.keyboard.down("Shift");
  await page.mouse.click(emptyInside.x, emptyInside.y);
  await page.keyboard.up("Shift");
  await expect.poll(() => selectedIds(page)).toEqual(["inner", "outer"]);
  await page.keyboard.down("Control");
  await page.mouse.click(emptyInside.x, emptyInside.y);
  await page.keyboard.up("Control");
  await expect.poll(() => selectedIds(page), { message: "Modifier clicks toggle frame selection" }).toEqual(["inner"]);
  const noteInside = await worldPoint(page, 300, 440);
  await page.mouse.click(noteInside.x, noteInside.y);
  await expect.poll(() => selectedIds(page), { message: "Children remain directly selectable" }).toEqual(["note"]);
  await page.mouse.move(emptyInside.x, emptyInside.y);
  await page.mouse.down();
  await page.mouse.move(emptyInside.x + 2, emptyInside.y + 1);
  await page.mouse.up();
  await expect.poll(() => selectedIds(page), { message: "Small pointer jitter remains a click" }).toEqual(["outer"]);
  await page.mouse.move(innerInside.x, innerInside.y);
  await page.mouse.down();
  const marqueeEnd = await worldPoint(page, 200, 380);
  await page.mouse.move(marqueeEnd.x, marqueeEnd.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => selectedIds(page), { message: "Dragging frame space still selects contained objects" }).toEqual(["note"]);
  await page.mouse.move(emptyInside.x, emptyInside.y);
  await page.mouse.down();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await selectedIds(page), "Cancelling a pending frame click preserves selection").toEqual(["note"]);
  const outside = await worldPoint(page, 850, 300);
  await page.mouse.click(outside.x, outside.y);
  await expect(page.locator(".board-node.selected"), "The board background still deselects everything").toHaveCount(0);
  expect(await current(), "Selection never mutates or saves frame contents").toEqual(selectionBoard);
  expect(await camera(page), "Selection does not move the camera").toBe(selectionCamera);
});

test("dragging a selected frame's surface carries its contents, one undo restores them, and Escape cancels", async ({ page }) => {
  await open(page);
  await findOnBoard(page, "outer", "Workshop");
  const emptyInside = await worldPoint(page, 600, 650);
  await page.mouse.click(emptyInside.x, emptyInside.y);
  await expect(node(page, "outer")).toHaveClass(/\bselected\b/);
  const selectionCamera = await camera(page), surfaceBefore = await current();
  await moveSurface(page, 600, 300, 35, 25);
  await expect.poll(async () => Math.abs((await saved("outer")).x - 135)).toBeLessThanOrEqual(1);
  const moved = await saved("outer"), dx = moved.x - 100, dy = moved.y - 200;
  expect(Math.abs(dy - 25)).toBeLessThanOrEqual(1);
  const after = await current();
  for (const id of ["outer", "inner", "note"]) {
    const old = surfaceBefore.nodes.find((n) => n.id === id), fresh = after.nodes.find((n) => n.id === id);
    expect(fresh.x, "Frame surface drag carries descendants").toBe(old.x + dx);
    expect(fresh.y).toBe(old.y + dy);
  }
  expect(after.nodes.find((n) => n.id === "second")).toEqual(surfaceBefore.nodes.find((n) => n.id === "second"));
  expect(await camera(page), "Moving a frame leaves the camera unchanged").toBe(selectionCamera);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await saved("outer")).x).toBe(100);
  expect((await current()).nodes, "One undo restores the frame and its contents").toEqual(surfaceBefore.nodes);
  await moveSurface(page, 600, 300, 40, 30, true);
  expect((await current()).nodes, "Escape cancels a frame surface drag").toEqual(surfaceBefore.nodes);
  await expect.poll(() => node(page, "outer").evaluate((el) => Math.round(parseFloat(el.style.left)))).toBe(100);
});

test("dragging a frame by its title moves nested frames and notes, and keyboard nudges carry them too", async ({ page }) => {
  await open(page);
  await findOnBoard(page, "outer", "Workshop");
  const before = await current();
  await move(page, "outer", 30, 40, true);
  await expect.poll(async () => (await saved("outer")).x).toBe(130);
  const after = await current();
  for (const id of ["inner", "note"]) {
    const old = before.nodes.find((n) => n.id === id), fresh = after.nodes.find((n) => n.id === id);
    expect(fresh.x).toBe(old.x + 30);
    expect(fresh.y).toBe(old.y + 40);
  }
  await page.locator("#canvas").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await saved("outer")).x).toBe(135);
  expect((await saved("note")).x, "Keyboard nudging carries descendants").toBe(note.x + 35);
});

test("dragging a note out of its frame detaches it, and dropping it in another frame attaches it", async ({ page }) => {
  await open(page);
  await page.locator('[data-action="board-fit"]').click();
  await boardSettled(page);
  await node(page, "note").click();
  await move(page, "note", 600, 210);
  await expect.poll(async () => Math.abs((await saved("note")).x - 810)).toBeLessThanOrEqual(2);
  expect((await saved("note")).frame).toBeUndefined();
  await findOnBoard(page, "note", "Contained idea");
  await move(page, "note", 140, -180);
  await expect.poll(async () => (await saved("note")).frame).toBe("second");
});

test("duplicating or pasting a frame copies its full contents and internal connectors without moving the camera", async ({ page }) => {
  await open(page);
  await findOnBoard(page, "outer", "Workshop");
  const cam = await camera(page);
  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await current()).nodes.length).toBe(7);
  const board = await current();
  const copies = board.nodes.filter((n) => !fixtures.some((f) => f.id === n.id));
  expect(copies).toHaveLength(3);
  const outerCopy = copies.find((n) => n.text === "Workshop"),
    innerCopy = copies.find((n) => n.text === "Discussion"),
    noteCopy = copies.find((n) => n.type === "sticky");
  expect(innerCopy.frame).toBe(outerCopy.id);
  expect(noteCopy.frame).toBe(innerCopy.id);
  expect(board.edges.some((e) => e.from === innerCopy.id && e.to === noteCopy.id)).toBe(true);
  expect(board.edges, "Only internal connectors are copied").toHaveLength(3);
  expect(await camera(page)).toBe(cam);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await current()).nodes.length).toBe(4);

  await findOnBoard(page, "outer", "Workshop");
  const pasteCamera = await camera(page);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect.poll(async () => (await current()).nodes.length).toBe(7);
  expect(await camera(page)).toBe(pasteCamera);
});

test("size presets and fit leave contents alone, Select contents selects them, and deleting a frame keeps its contents", async ({ page }) => {
  await open(page);
  await findOnBoard(page, "outer", "Workshop");
  await page.locator('#selection-tools [data-selection-menu="frame-size"] > summary').click();
  await page.locator('[data-preset="square"]').click();
  await expect.poll(async () => (await saved("outer")).w).toBe(600);
  expect(await saved("note")).toEqual(note);
  await page.locator('[data-feature="frame-fit"]').click();
  await expect.poll(async () => (await saved("outer")).w).toBe(380);
  expect(await saved("note")).toEqual(note);
  await page.locator('[data-feature="frame-contents"]').click();
  await expect(page.locator(".board-node.selected")).toHaveCount(2);
  await findOnBoard(page, "outer", "Workshop");
  await page.locator('[data-feature="selection-delete"]').click();
  await expect.poll(async () => (await current()).nodes.length).toBe(3);
  expect((await current()).nodes.some((n) => n.id === "note")).toBe(true);
  expect((await saved("inner")).frame).toBeUndefined();
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await current()).nodes.length).toBe(4);
});

test("a collapsed frame hides its contents behind a square toggle, and presenting it shows them", async ({ page }) => {
  await open(page);
  await findOnBoard(page, "outer", "Workshop");
  const toggle = node(page, "outer").locator(':scope > [data-pro="collapse"]');
  const toggleSize = () => toggle.evaluate((el) => ({ width: el.offsetWidth, height: el.offsetHeight }));
  const expandedSize = await toggleSize();
  expect(expandedSize.width, "The frame toggle is square").toBe(expandedSize.height);
  await toggle.click();
  await expect.poll(async () => (await saved("outer")).collapsed).toBe(true);
  await expect(node(page, "note")).toHaveCount(0);
  expect(await toggleSize(), "Expand and collapse keep the same button size").toEqual(expandedSize);
  await page.locator('#selection-tools [data-pro="frame-present"]').click();
  await expect(page.locator("#presentation-controls")).toContainText(/1 \/ 2/);
  await expect(node(page, "note")).toBeVisible();
  expect((await saved("outer")).collapsed).toBe(true);
  await page.keyboard.press("Escape");
  await expect(node(page, "note")).toHaveCount(0);
  await findOnBoard(page, "outer", "Workshop");
  await page.locator('#selection-tools [data-pro="collapse"]').click();
  await expect.poll(async () => (await saved("outer")).collapsed).toBeFalsy();
});

test("the outline reorders slides by dragging and organises them by position, and the order persists", async ({ page }) => {
  await open(page);
  await clickControl(page.locator('[data-pro="outline"]').first());
  const row = (id) => page.locator(`#canvas-outline [data-frame-row="${id}"]`);
  await row("second").dragTo(row("outer"));
  await expect.poll(async () => (await current()).presentation[0]).toBe("second");
  await expect(row("inner")).toHaveAttribute("draggable", "false");
  await page.locator('#canvas-outline [data-pro="frames-organize"]').click();
  await expect.poll(async () => (await current()).presentation[0]).toBe("outer");
  await page.locator('#canvas-outline [data-pro="outline"]').click();
  await savesSettled(page);
  await page.reload();
  await findOnBoard(page, "outer", "Workshop");
  expect((await current()).presentation[0]).toBe("outer");
});

test("a frame colour applies from the selection toolbar", async ({ page }) => {
  await open(page);
  await findOnBoard(page, "outer", "Workshop");
  await page.locator('#selection-tools [data-selection-menu="color"] > summary').click();
  await page.getByRole("button", { name: "Rose", exact: true }).click();
  await expect.poll(async () => (await saved("outer")).color).toBe("#f1a9a0");
  await expect(node(page, "outer")).toHaveCSS("background-color", "rgb(241, 169, 160)");
});

test("the frame toolbar stays on screen in dark mode", async ({ page }) => {
  await toolbarStaysOnScreen(page);
});

onDevices(["phone"], () => {
  test.use({ viewportSize: null });

  test("the frame toolbar stays on screen in dark mode", async ({ page }) => {
    await toolbarStaysOnScreen(page);
  });

  test("untitled and locked frames are selectable by touch, and locked ones do not move from their interior", async ({ page }) => {
    await open(page, [{ ...fixtures[0], text: "", locked: true, x: 100, y: 100, w: 300, h: 300 }]);
    await page.locator('[data-action="board-fit"]').click();
    await boardSettled(page);
    const touchPoint = await worldPoint(page, 250, 250), touchBoard = await current();
    await page.touchscreen.tap(touchPoint.x, touchPoint.y);
    await expect.poll(() => selectedIds(page)).toEqual(["outer"]);
    await expect(node(page, "outer").locator(".frame-title")).toHaveText("");
    expect(await current()).toEqual(touchBoard);
    await moveSurface(page, 250, 250, 20, 15);
    await savesSettled(page);
    expect(await current(), "Locked frames cannot move from their interior").toEqual(touchBoard);
  });

  test("an untitled frame moves from its interior on a narrow screen, and the move persists", async ({ page }) => {
    await open(page, [{ ...fixtures[0], text: "", x: 100, y: 100, w: 300, h: 300 }]);
    await page.locator('[data-action="board-fit"]').click();
    await boardSettled(page);
    const unlockedTouch = await worldPoint(page, 250, 250);
    await page.touchscreen.tap(unlockedTouch.x, unlockedTouch.y);
    await moveSurface(page, 250, 250, 20, 15);
    await expect.poll(async () => Math.abs((await saved("outer")).x - 120)).toBeLessThanOrEqual(1);
    expect(Math.abs((await current()).nodes[0].y - 115), "Untitled frames move on a narrow viewport").toBeLessThanOrEqual(1);
    const mobileMoved = (await current()).nodes;
    await savesSettled(page);
    await page.reload();
    await node(page, "outer").waitFor();
    expect((await current()).nodes, "Frame surface movement persists").toEqual(mobileMoved);
  });
});
