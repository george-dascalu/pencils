// The board pen: smooth ink over cards in the chosen colour and width, dots, straight
// highlighter lines with Shift, Escape cancelling a stroke, the eraser with cancel and
// undo, editing a saved stroke, remembered settings and presets, stylus pressure, pinch
// cancelling a touch stroke, locked strokes, SVG export, and the toolbar on a dark phone.
import fs from "node:fs/promises";
import { test, expect, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";

const card = { id: "card", type: "sticky", x: 300, y: 250, w: 300, h: 200, text: "Draw over this note" };
const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Pen lab" });
  return { project, board: (await store.snapshot(project.id)).boards[0] };
});
const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
const strokes = async () => (await current()).nodes.filter((n) => n.type === "draw");
const strokeCount = async () => (await strokes()).length;
// Each test starts from one note and no ink.
test.beforeEach(async () => {
  const board = await current();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: [card], edges: [], settings: { snap: false } });
});
// The coordinates below are board positions; this viewport keeps them all on screen.
test.use({ viewportSize: { width: 1600, height: 1100 } });

async function open(page) {
  await page.addInitScript((id) => localStorage.setItem(`pencils:camera:${id}`, JSON.stringify({ x: 30, y: 20, z: 1 })), app.board.id);
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator('[data-node="card"]').waitFor();
}
const world = (page, x, y) => page.locator("#canvas").evaluate((el, { x, y }) => {
  const r = el.getBoundingClientRect(), m = new DOMMatrix(document.querySelector("#canvas-world").style.transform);
  return { x: r.x + m.e + x * m.a, y: r.y + m.f + y * m.a };
}, { x, y });
async function draw(page, points, { shift = false, cancel = false } = {}) {
  const pts = await Promise.all(points.map(([x, y]) => world(page, x, y)));
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 8 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}
const penTool = async (page) => {
  await page.locator('.board-tools [aria-label="Pen"]').click();
  await expect(page.locator("#pen-tools")).toBeVisible();
};
const inkLine = [[320, 300], [360, 330], [430, 290], [540, 360]];
const highlightLine = [[320, 400], [420, 400], [540, 400]];
// Ink, a dot and a straight highlight, drawn as a user would.
async function drawInkDotAndHighlight(page) {
  await penTool(page);
  await draw(page, inkLine);
  await expect.poll(strokeCount).toBe(1);
  await draw(page, [[650, 300]]);
  await expect.poll(strokeCount).toBe(2);
  await page.locator('[data-pen-mode="highlighter"]').click();
  await page.locator("[data-pen-width]").selectOption("18");
  await draw(page, highlightLine, { shift: true });
  await expect.poll(strokeCount).toBe(3);
}

test("the pen draws smooth ink over a card in the chosen colour and width, and a click leaves a dot", async ({ page }) => {
  await open(page);
  await penTool(page);
  await page.locator("[data-pen-width]").selectOption("8");
  await page.locator('#pen-tools summary[aria-label="Pen colour"]').click();
  await page.locator('[data-color-choice="#f1a9a0"]').click();
  await draw(page, inkLine);
  await expect.poll(strokeCount).toBe(1);
  const ink = (await strokes())[0];
  expect(ink.strokeWidth).toBe(8);
  expect(ink.color).toBe("#f1a9a0");
  expect(ink.points.length).toBeGreaterThan(3);
  expect((await current()).nodes.find((n) => n.id === "card")).toEqual(card);
  expect(await page.locator(".board-node.draw svg").innerHTML()).toMatch(/ Q/);
  expect(await page.locator(".board-node.draw").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await expect(page.locator(".board-node.draw .object-caption")).toHaveCount(0);
  await draw(page, [[650, 300]]);
  await expect.poll(strokeCount).toBe(2);
  expect((await strokes())[1].points.length).toBe(1);
});

test("the highlighter draws a straight line with Shift, and Escape cancels a stroke", async ({ page }) => {
  await open(page);
  await penTool(page);
  await page.locator('[data-pen-mode="highlighter"]').click();
  await page.locator("[data-pen-width]").selectOption("18");
  await draw(page, highlightLine, { shift: true });
  await expect.poll(strokeCount).toBe(1);
  const highlight = (await strokes())[0];
  expect(highlight.opacity).toBe(0.32);
  expect(highlight.points.length).toBe(2);
  await draw(page, [[700, 450], [750, 470]], { cancel: true });
  expect(await strokeCount()).toBe(1);
  await expect(page.locator(".drawing-preview")).toHaveCount(0);
});

test("the eraser removes crossed strokes but not cards, Escape cancels it, and undo restores them", async ({ page }) => {
  await open(page);
  await drawInkDotAndHighlight(page);
  await page.keyboard.press("e");
  await expect(page.locator('[data-pen-mode="erase"]')).toHaveAttribute("aria-pressed", "true");
  await draw(page, [[400, 250], [400, 450]], { cancel: true });
  expect(await strokeCount()).toBe(3);
  await draw(page, [[400, 250], [400, 450]]);
  await expect.poll(strokeCount).toBe(1);
  expect((await current()).nodes.some((n) => n.id === "card")).toBe(true);
  await page.keyboard.press("Control+z");
  await expect.poll(strokeCount).toBe(3);
});

test("a saved stroke's width can be changed after selecting it", async ({ page }) => {
  await open(page);
  await penTool(page);
  await draw(page, inkLine);
  await expect.poll(strokeCount).toBe(1);
  const ink = (await strokes())[0];
  await page.keyboard.press("v");
  await expect(page.locator("#pen-tools")).toHaveCount(0);
  await page.locator(`[data-node="${ink.id}"]`).click();
  await page.locator("[data-stroke-width]").selectOption("12");
  await expect.poll(async () => (await strokes()).find((n) => n.id === ink.id).strokeWidth).toBe(12);
});

test("pen settings are remembered after a reload and presets switch the width", async ({ page }) => {
  await open(page);
  await penTool(page);
  await page.locator('[data-pen-mode="highlighter"]').click();
  await page.locator("[data-pen-width]").selectOption("18");
  await draw(page, highlightLine, { shift: true });
  await expect.poll(strokeCount).toBe(1);
  await page.reload();
  await page.locator(".board-node.draw").first().waitFor();
  await page.keyboard.press("p");
  await expect(page.locator("[data-pen-width]")).toHaveValue("18");
  await expect(page.locator('[data-pen-mode="highlighter"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-pen-preset="1"]').click();
  await expect(page.locator("[data-pen-width]")).toHaveValue("5");
  await page.locator('[data-pen-preset="0"]').click();
  await expect(page.locator("[data-pen-width]")).toHaveValue("18");
});

test("stylus pressure is saved, and a pinch cancels an in-progress touch stroke", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Pen and touch input need Chromium's CDP");
  await open(page);
  await penTool(page);
  await page.locator('[data-pen-mode="pen"]').click();
  await page.keyboard.press("v");
  const cdp = await page.context().newCDPSession(page);
  const pt = await world(page, 800, 500);
  const pen = (type, x, y, extra) => cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", pointerType: "pen", ...extra });
  await pen("mousePressed", pt.x, pt.y, { buttons: 1, force: 0.1 });
  for (let i = 1; i <= 8; i++) await pen("mouseMoved", pt.x + i * 8, pt.y + i * 4, { buttons: 1, force: 0.1 + i * 0.1 });
  await pen("mouseReleased", pt.x + 64, pt.y + 32, { buttons: 0 });
  await expect.poll(strokeCount).toBe(1);
  expect((await strokes()).find((n) => n.pressure && new Set(n.pressures).size > 1)).toBeTruthy();
  const touch = await world(page, 700, 600);
  const send = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  await send("touchStart", [{ x: touch.x, y: touch.y, id: 1 }]);
  await send("touchMove", [{ x: touch.x + 20, y: touch.y, id: 1 }]);
  await send("touchStart", [{ x: touch.x + 20, y: touch.y, id: 1 }, { x: touch.x + 80, y: touch.y, id: 2 }]);
  await send("touchMove", [{ x: touch.x, y: touch.y, id: 1 }, { x: touch.x + 110, y: touch.y, id: 2 }]);
  await send("touchEnd", []);
  expect(await strokeCount()).toBe(1);
  await expect(page.locator(".drawing-preview")).toHaveCount(0);
});

test("a locked stroke survives the eraser", async ({ page }) => {
  await open(page);
  await penTool(page);
  await draw(page, inkLine);
  await expect.poll(strokeCount).toBe(1);
  const ink = (await strokes())[0];
  await page.keyboard.press("v");
  await page.locator(`[data-node="${ink.id}"]`).click();
  await page.locator('[data-feature="lock"]').click();
  await expect.poll(async () => (await strokes()).find((n) => n.id === ink.id).locked).toBeTruthy();
  await page.keyboard.press("e");
  await expect(page.locator('[data-pen-mode="erase"]')).toHaveAttribute("aria-pressed", "true");
  await draw(page, [[400, 250], [400, 370]]);
  expect((await strokes()).some((n) => n.id === ink.id)).toBe(true);
});

test("the SVG export keeps highlighter opacity and round line caps", async ({ page }) => {
  await open(page);
  await drawInkDotAndHighlight(page);
  await page.keyboard.press("v");
  const download = page.waitForEvent("download");
  await clickControl(page.locator('[data-feature="canvas-svg"]'));
  const exported = await fs.readFile(await (await download).path(), "utf8");
  expect(exported).toMatch(/opacity="0.32"/);
  expect(exported).toMatch(/stroke-linecap="round"/);
});

test("the pen toolbar fits a phone in dark mode", async ({ page }) => {
  await open(page);
  await page.keyboard.press("p");
  await expect(page.locator("#pen-tools")).toBeVisible();
  await page.locator('[data-personal="sidebar"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await expect.poll(async () => {
    const bar = await page.locator("#pen-tools").boundingBox();
    return bar.x >= 0 && bar.x + bar.width <= 390;
  }).toBe(true);
});
