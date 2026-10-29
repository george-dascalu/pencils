// Bitmap board interactions: zoomed far out, objects are painted as one bitmap rather than DOM
// cards, yet they still drag (alone, with Shift-click, frames with their children, children
// inside frames, grids), touch drags them instead of panning, locked objects select but stay
// put, a marquee over more objects than the detail budget keeps them as bitmaps while moving
// them as a group, Shift-marquee adds to it, undo and reload keep the result, browser tab
// shortcuts reach the browser, and Tab still navigates the board.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { browserTabShortcuts } from "../helpers/browser-tab-shortcuts.mjs";
import { newGrid } from "../../public/grid-model.js";

const note = (id, x, y, extra = {}) => ({ id, type: "sticky", text: id, x, y, w: 400, h: 300, ...extra });
const group = Array.from({ length: 64 }, (_, i) => note(`group-${i}`, 5000 + (i % 8) * 600, 1000 + Math.floor(i / 8) * 450));
const nodes = (groupShift = { x: 0, y: 0 }) => [
  { id: "frame", type: "frame", x: 200, y: 1500, w: 1000, h: 700, text: "Container" },
  note("one", 200, 200), note("two", 1000, 900), note("child", 400, 1750, { frame: "frame" }),
  { id: "grid", type: "grid", x: 2200, y: 1500, w: 600, h: 400, grid: newGrid() },
  note("locked", 3200, 200, { locked: true }),
  ...group.map((n) => ({ ...n, x: n.x + groupShift.x, y: n.y + groupShift.y })),
];

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Bitmap interactions" });
  const board = (await store.snapshot(project.id)).boards[0];
  return { project, board };
});

test.use({ viewportSize: { width: 1440, height: 1000 } });

const snapshot = async () => (await app.store.snapshot(app.project.id)).boards[0];
// Each test starts from the seeded board (optionally with the group already moved).
async function resetBoard(groupShift) {
  const board = await snapshot();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: nodes(groupShift), edges: [], settings: { snap: false, alignObjects: false } });
}
async function settled(page) {
  await page.waitForFunction(() => document.querySelector("#canvas")?.dataset.objectCount === "70");
  // At 8% every object is part of the bitmap; no DOM cards are built.
  await expect(page.locator("#canvas")).toHaveAttribute("data-detailed-count", "0");
  await expect(page.locator(".board-node")).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript((id) => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 150, y: 130, z: 0.08 })), app.board.id);
});
async function openBoard(page, groupShift) {
  await resetBoard(groupShift);
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await settled(page);
  return page.locator("#canvas-world").getAttribute("style");
}

const point = (page, x, y) => page.locator("#canvas").evaluate((el, p) => {
  const b = el.getBoundingClientRect(), m = new DOMMatrix(document.querySelector("#canvas-world").style.transform);
  return { x: b.x + m.e + p.x * m.a, y: b.y + m.f + p.y * m.a };
}, { x, y });
async function move(page, x, y, dx, dy) {
  const p = await point(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 8 });
  await page.mouse.up();
}
async function marquee(page, from, to, steps) {
  const start = await point(page, ...from), end = await point(page, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps });
  await page.mouse.up();
}
const saved = (id, x, y) => expect.poll(async () => {
  const n = (await snapshot()).nodes.find((n) => n.id === id);
  return Math.abs(n.x - x) < 1 && Math.abs(n.y - y) < 1;
}, { message: `${id} saves at ${x}, ${y}` }).toBe(true);
const selected = async (page) => (await page.locator(".board-node.selected").evaluateAll((els) => els.map((el) => el.dataset.node))).sort();
async function clickAt(page, x, y) {
  const p = await point(page, x, y);
  await page.mouse.click(p.x, p.y);
}

test("a bitmap object drags without moving the camera, and Shift-click adds another for a group move", async ({ page }) => {
  const camera = await openBoard(page);
  await move(page, 400, 350, 40, 24);
  await saved("one", 700, 500);
  await expect(page.locator("#canvas-world"), "dragging a bitmap does not pan or zoom").toHaveAttribute("style", camera);
  const two = await point(page, 1200, 1050);
  await page.keyboard.down("Shift");
  await page.mouse.click(two.x, two.y);
  await page.keyboard.up("Shift");
  expect(await selected(page)).toEqual(["one", "two"]);
  await move(page, 900, 650, 40, 24);
  await saved("one", 1200, 800);
  await saved("two", 1500, 1200);
});

test("a frame drags from bitmap form with its children, and a child inside it drags on its own", async ({ page }) => {
  await openBoard(page);
  // Frames are directly draggable from bitmap form, carrying their hidden DOM children.
  await move(page, 250, 1550, 40, 24);
  await saved("frame", 700, 1800);
  await saved("child", 900, 2050);
  // A materialised frame must not steal a hit on a bitmap child inside it.
  await move(page, 1100, 2200, 24, 16);
  await saved("child", 1200, 2250);
});

test("a grid drags from bitmap form, and a locked bitmap selects but stays put", async ({ page }) => {
  await openBoard(page);
  await clickAt(page, 6000, 5000);
  await move(page, 2500, 1700, 40, 24);
  await saved("grid", 2700, 1800);
  await clickAt(page, 6000, 5000);
  await move(page, 3400, 350, 40, 24);
  await saved("locked", 3200, 200);
  await expect(page.locator("[data-node=locked].selected"), "locked bitmaps can be selected but not moved").toHaveCount(1);
});

onDevices(["ipad"], () => {
  test.use({ viewportSize: null });
  test("a touch drag on a bitmap object moves it instead of panning", async ({ page }) => {
    const camera = await openBoard(page);
    const cdp = await page.context().newCDPSession(page);
    const p = await point(page, 400, 350);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
    for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + i * 5, y: p.y + i * 3 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await saved("one", 700, 500);
    await expect(page.locator("#canvas-world")).toHaveAttribute("style", camera);
  });
});

test("a marquee over more objects than the detail budget keeps them as bitmaps and moves them as a group", async ({ page }) => {
  const camera = await openBoard(page);
  await clickAt(page, 4000, 5000);
  await marquee(page, [4800, 800], [9800, 4550], 12);
  await expect(page.locator(".selection-filter-total")).toHaveText("64");
  await expect(page.locator('[data-node^="group-"]'), "the marquee does not hydrate the selected bitmaps").toHaveCount(0);
  const hull = await page.locator(".multi-resize-box").boundingBox();
  await move(page, 5200, 1150, 40, 24);
  await saved("group-63", group[63].x + 500, group[63].y + 300);
  const moved = (await snapshot()).nodes;
  for (const n of group) {
    const actual = moved.find((x) => x.id === n.id);
    expect([actual.x, actual.y], n.id).toEqual([n.x + 500, n.y + 300]);
  }
  await expect(page.locator(".selection-filter-total")).toHaveText("64");
  await expect(page.locator(".board-node"), "bulk selections stay in bitmap form after movement").toHaveCount(0);
  const movedHull = await page.locator(".multi-resize-box").boundingBox();
  expect(Math.abs(movedHull.x - hull.x - 40) < 1 && Math.abs(movedHull.y - hull.y - 24) < 1, JSON.stringify({ hull, movedHull })).toBe(true);
  await expect(page.locator("#canvas-world")).toHaveAttribute("style", camera);
  await browserTabShortcuts(page.locator("#canvas"));
  await expect(page.locator(".selection-filter-total"), "browser tab switching leaves the group selected").toHaveText("64");
});

test("Shift-marquee adds a locked object that stays fixed while the group moves, and undo persists", async ({ page }) => {
  // The group where the previous test leaves it.
  await openBoard(page, { x: 500, y: 300 });
  await clickAt(page, 4000, 5000);
  await marquee(page, [5300, 1100], [10300, 4850], 12);
  await expect(page.locator(".selection-filter-total")).toHaveText("64");
  await page.keyboard.down("Shift");
  await marquee(page, [3100, 100], [3700, 600], 6);
  await page.keyboard.up("Shift");
  await expect(page.locator(".selection-filter-total")).toHaveText("65");
  await move(page, 5700, 1450, 24, 16);
  await saved("group-63", group[63].x + 800, group[63].y + 500);
  await saved("locked", 3200, 200);
  await page.keyboard.press("Control+z");
  await saved("group-63", group[63].x + 500, group[63].y + 300);
  await page.reload();
  await settled(page);
  await saved("group-0", group[0].x + 500, group[0].y + 300);
});

test("Tab on the board still moves through its objects", async ({ page }) => {
  await openBoard(page);
  await page.locator("#canvas").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#selection-tools")).toHaveCount(1);
});
