// Board alignment guides: live guides and edge snapping while dragging, equal gaps, Alt to
// bypass, Escape cleanup, undo, group geometry, resize dimension matching from every corner,
// and the per-board "align objects" setting persisting across reloads and devices.
//
// Under parallel load the old suite failed in its fixture step: it replaced the board on disk
// and reloaded as soon as the vault showed the previous save, while the page could still
// have that save queued; the reloaded page then saw a conflict and opened the board gallery
// (local checkpoints) instead of the board, so the next object never appeared. Each test now
// seeds its board before the page opens, and waits for the page's queued saves to clear
// (savesSettled) before any reload.
import { test, expect, useApp } from "../fixtures.mjs";
import { savedBoard, seedBoard, presetCamera, canvasZoom, savesSettled } from "../helpers/board-canvas.mjs";

const note = (id, x, y, extra = {}) => ({ id, type: "sticky", text: id, x, y, w: 120, h: 100, ...extra });

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Alignment lab" });
  const board = await seedBoard(store, project.id, { settings: { snap: false }, nodes: [], edges: [] });
  return { project, board };
});

test.use({ viewportSize: { width: 1600, height: 1100 } });

const current = () => savedBoard(app.store, app.project.id, app.board.id);
const saved = (id) => current().then((b) => b.nodes.find((n) => n.id === id));
const node = (page, id) => page.locator(`[data-node="${id}"]`);
const position = (page, id) => node(page, id).evaluate((el) => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }));
const size = (page, id = "moving") => node(page, id).evaluate((el) => ({ w: parseFloat(el.style.width), h: parseFloat(el.style.height) }));
const guides = (page) => page.locator(".alignment-guides");

// Each test starts from its own objects, with object alignment on and grid snapping off.
async function open(page, nodes, settings = { snap: false, alignObjects: true }) {
  await seedBoard(app.store, app.project.id, { nodes, edges: [], settings }, app.board.id);
  await presetCamera(page, app.board.id, { x: 50, y: 20, z: 1 });
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await node(page, nodes[0].id).waitFor();
}

// Press on an object and move it towards board position (x, y), leaving the button down.
async function drag(page, id, x, y, { alt = false } = {}) {
  const original = await saved(id);
  const r = await node(page, id).boundingBox();
  const z = await canvasZoom(page);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  if (alt) await page.keyboard.down("Alt");
  await page.mouse.move(r.x + r.width / 2 + (x - original.x) * z, r.y + r.height / 2 + (y - original.y) * z, { steps: 8 });
}

// Select "moving" and drag one of its resize handles by (dx, dy), leaving the button down.
async function resize(page, dx, dy, modifier, corner = "se") {
  await node(page, "moving").click();
  const handle = await node(page, "moving").locator(`.resize-handle[data-resize-corner="${corner}"]`).boundingBox();
  const z = await canvasZoom(page);
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + dx * z, handle.y + handle.height / 2 + dy * z, { steps: 8 });
}

async function setAlignObjects(page, on) {
  await page.getByRole("button", { name: "Board settings", exact: true }).click();
  await page.locator("#canvas-align").setChecked(on);
  await page.getByRole("button", { name: "Close board settings", exact: true }).click();
  await expect.poll(async () => (await current()).settings.alignObjects).toBe(on);
}

const resizeFixture = [note("target", 420, 300, { w: 247, h: 183 }), note("moving", 100, 500, { w: 180, h: 140 })];

test("dragging near another object snaps to its edge with a live guide, and one undo restores it", async ({ page }) => {
  await open(page, [note("target", 350, 300), note("moving", 100, 500)]);
  await drag(page, "moving", 346, 500);
  await expect.poll(async () => (await position(page, "moving")).x).toBe(350);
  await expect(page.locator(".alignment-guides .guide-align").first()).toBeAttached();
  await page.mouse.up();
  await expect.poll(async () => (await saved("moving")).x).toBe(350);
  await expect(guides(page)).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await saved("moving")).x).toBe(100);
});

test("Alt pressed after the drag starts bypasses snapping without duplicating, and Escape cancels the drag and its guides", async ({ page }) => {
  await open(page, [note("target", 350, 300), note("moving", 100, 500)]);
  await drag(page, "moving", 347, 500, { alt: true });
  await expect.poll(async () => (await position(page, "moving")).x).toBe(347);
  await expect(guides(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(async () => (await position(page, "moving")).x).toBe(100);
  expect((await current()).nodes, "Alt pressed after drag start bypasses snapping without duplication").toHaveLength(2);

  await drag(page, "moving", 346, 500);
  await expect.poll(async () => (await position(page, "moving")).x).toBe(350);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(guides(page)).toHaveCount(0);
  expect((await saved("moving")).x).toBe(100);
});

test("turning off object alignment persists for the board across reloads and other devices", async ({ page, browser }) => {
  await open(page, [note("target", 350, 300), note("moving", 100, 500)]);
  await setAlignObjects(page, false);
  await savesSettled(page);
  await page.reload();
  await node(page, "moving").waitFor();
  await page.getByRole("button", { name: "Board settings", exact: true }).click();
  await expect(page.locator("#canvas-align")).not.toBeChecked();
  await page.keyboard.press("Escape");
  await drag(page, "moving", 346, 500);
  await expect.poll(async () => (await position(page, "moving")).x).toBe(346);
  await page.mouse.up();
  await expect.poll(async () => (await saved("moving")).x).toBe(346);

  // Another device (a fresh browser profile) sees the same board setting.
  const other = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const fresh = await other.newPage();
  await fresh.goto(`${app.base}/#project/${app.project.id}/board`);
  await fresh.locator("#canvas").waitFor();
  await fresh.getByRole("button", { name: "Board settings", exact: true }).click();
  await expect(fresh.locator("#canvas-align")).not.toBeChecked();
  await fresh.keyboard.press("Escape");
  await other.close();

  await setAlignObjects(page, true);
});

test("equal gaps snap with measured guides, hide the selection toolbar while dragging, and persist", async ({ page }) => {
  await open(page, [note("a", 100, 300), note("b", 260, 300), note("moving", 600, 300)]);
  await drag(page, "moving", 424, 300);
  await expect.poll(async () => (await position(page, "moving")).x).toBe(420);
  await expect(page.locator(".alignment-guides .guide-gap")).toHaveCount(2);
  await expect(page.locator(".alignment-guides text")).toHaveText(["40", "40"]);
  await expect(page.locator("#selection-tools")).toBeHidden();
  await page.mouse.up();
  await expect.poll(async () => (await saved("moving")).x).toBe(420);
  await savesSettled(page);
  await page.reload();
  await node(page, "moving").waitFor();
  expect((await position(page, "moving")).x).toBe(420);
});

test("a group snaps as one and keeps its members' relative geometry", async ({ page }) => {
  await open(page, [note("a", 107, 300, { group: "g" }), note("b", 253, 317, { group: "g" }), note("target", 600, 500)]);
  await drag(page, "a", 596, 300);
  await expect.poll(async () => (await position(page, "a")).x).toBe(600);
  const [a, b] = [await position(page, "a"), await position(page, "b")];
  expect(b.x - a.x).toBe(146);
  expect(b.y - a.y).toBe(17);
  await page.mouse.up();
  await expect.poll(async () => (await saved("a")).x).toBe(600);
});

test("resizing matches a nearby object's dimensions with paired guides, and persists", async ({ page }) => {
  // Resize uses the same nearby-object setting, with paired dimension guides.
  await open(page, resizeFixture);
  await resize(page, 64, 40);
  await expect.poll(() => size(page)).toEqual({ w: 247, h: 183 });
  await expect(page.locator(".guide-size")).toHaveCount(4);
  await expect(page.locator(".guide-size text")).toHaveText(["W 247", "W 247", "H 183", "H 183"]);
  await page.mouse.up();
  await expect.poll(async () => (await saved("moving")).w).toBe(247);
  await expect(guides(page)).toHaveCount(0);
  await savesSettled(page);
  await page.reload();
  await node(page, "moving").waitFor();
  expect(await size(page)).toEqual({ w: 247, h: 183 });
});

test("Shift resizes along one axis, Escape cancels, and Alt resizes without magnets", async ({ page }) => {
  await open(page, resizeFixture);
  await resize(page, 64, 40, "Shift");
  await expect.poll(() => size(page)).toEqual({ w: 247, h: 140 });
  await expect(page.locator(".guide-size")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(() => size(page)).toEqual({ w: 180, h: 140 });
  await expect(guides(page)).toHaveCount(0);

  await resize(page, 64, 40, "Alt");
  await expect.poll(() => size(page)).toEqual({ w: 244, h: 180 });
  await expect(guides(page)).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(async () => (await saved("moving")).w).toBe(244);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await saved("moving")).w).toBe(180);
});

test("every resize corner uses the same size magnets and keeps the opposite corner fixed", async ({ page }) => {
  // Each corner ends with an undo, which restores the starting geometry for the next one.
  await open(page, resizeFixture);
  for (const corner of ["nw", "ne", "sw", "se"]) {
    await node(page, "moving").click();
    await expect(node(page, "moving").locator(".resize-handle")).toHaveCount(4);
    const west = corner.includes("w"), north = corner.includes("n");
    await resize(page, west ? -64 : 64, north ? -40 : 40, undefined, corner);
    await expect.poll(() => size(page)).toEqual({ w: 247, h: 183 });
    expect(await position(page, "moving")).toEqual({ x: west ? 33 : 100, y: north ? 457 : 500 });
    await expect(page.locator(".resize-dimensions")).toHaveText("247 × 183");
    await page.mouse.up();
    await expect.poll(async () => (await saved("moving")).w).toBe(247);
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await saved("moving")).w).toBe(180);
    await expect.poll(() => position(page, "moving")).toEqual({ x: 100, y: 500 });
  }
  // Shift from a corner keeps the opposite corner fixed along the free axis.
  await resize(page, -64, -40, "Shift", "nw");
  await expect.poll(() => size(page)).toEqual({ w: 247, h: 140 });
  expect(await position(page, "moving")).toEqual({ x: 33, y: 500 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(() => size(page)).toEqual({ w: 180, h: 140 });
  await expect(page.locator(".resize-dimensions")).toHaveCount(0);
});

test("with object alignment off, resizing ignores nearby dimensions", async ({ page }) => {
  await open(page, resizeFixture);
  await setAlignObjects(page, false);
  await resize(page, 64, 40);
  await expect.poll(() => size(page)).toEqual({ w: 244, h: 180 });
  await expect(guides(page)).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(async () => (await saved("moving")).w).toBe(244);
});
