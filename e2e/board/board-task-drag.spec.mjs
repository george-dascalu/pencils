// Board: drag a task from the Project tasks panel onto the board. A preview follows the
// pointer at any zoom and pan, the card lands where the preview showed without moving the
// camera, cancelled or invalid drops place nothing, undo/redo and a plain click still work,
// and on phones a touch drag hides the panel (dark theme) and drops on the board.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { seedBoard } from "../helpers/board-canvas.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Task drag" });
  const task = await store.createTask(project.id, { title: "Design the task browser", type: "story", assignee: "George", status: "review" });
  return { project, task };
});

const snapshot = () => app.store.snapshot(app.project.id);
const nodes = async () => (await snapshot()).boards[0].nodes;
const nodeCount = () => expect.poll(async () => (await nodes()).length);
const row = (page) => page.locator(`#board-task-panel [data-action=board-pick][data-id="${app.task.id}"]`);
const preview = (page) => page.locator(".task-drop-preview");

// Every test starts on an empty board.
test.beforeEach(async () => seedBoard(app.store, app.project.id, { nodes: [], edges: [] }));

async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
}
async function openPanel(page) {
  // Phones keep the board tools in the dock's Add row.
  await clickControl(page.locator("[data-action=board-task]"));
  await row(page).waitFor();
}
// Each save is followed by a background refresh that may rebuild the page (and the Project
// tasks panel) within about a second. Wait for it before the next drag, so the drag does not
// start on a row that is about to be replaced. If no rebuild comes, carry on.
const markPage = (page) => page.evaluate(() => { document.querySelector(".shell").dataset.stale = "yes"; });
const settle = (page) => page.waitForFunction(() => !document.querySelector(".shell")?.dataset.stale, null, { timeout: 2500 }).catch(() => {});
async function startDrag(page) {
  const r = await row(page).boundingBox();
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
}
// A point on the empty board, right of the panel.
async function dropPoint(page) {
  const c = await page.locator("#canvas").boundingBox();
  return { x: c.x + c.width * 0.72, y: c.y + c.height * 0.55 };
}
async function dragAndDrop(page) {
  const { x, y } = await dropPoint(page);
  await startDrag(page);
  await page.mouse.move(x, y, { steps: 10 });
  await preview(page).waitFor();
  await markPage(page);
  await page.mouse.up();
}

test("a dragged task lands as a linked card where its preview showed, at any zoom and pan", async ({ page }) => {
  await openBoard(page);
  const { x, y } = await dropPoint(page);
  const world = page.locator("#canvas-world");
  const initialCamera = await world.getAttribute("style");
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 280);
  await expect(world).not.toHaveAttribute("style", initialCamera);
  await expect(page.locator("#canvas")).not.toHaveClass(/zooming/);
  // Pan as well, to exercise both the translation and scale conversion.
  const zoomed = await world.getAttribute("style");
  await page.keyboard.down("Space");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 65, y + 40, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(world).not.toHaveAttribute("style", zoomed);
  await openPanel(page);
  const camera = await world.getAttribute("style");

  await startDrag(page);
  await page.mouse.move(x, y, { steps: 10 });
  await expect(preview(page)).toContainText("Design the task browser");
  expect(await nodes(), "nothing is placed before the drop").toHaveLength(0);
  const shown = await preview(page).boundingBox();
  await markPage(page);
  await page.mouse.up();
  await nodeCount().toBe(1);
  await settle(page);
  const placed = (await nodes())[0];
  expect(placed.task).toBe(app.task.id);
  const card = page.locator(`[data-node="${placed.id}"]`);
  const box = await card.boundingBox();
  expect(Math.abs(box.x - shown.x), "drop matches the preview at zoom/pan").toBeLessThan(3);
  expect(Math.abs(box.y - shown.y), "drop matches the preview at zoom/pan").toBeLessThan(3);
  await expect(world, "the drop does not move the camera").toHaveAttribute("style", camera);
  await expect(preview(page)).toHaveCount(0);
  await expect(card).toBeFocused();
  expect((await snapshot()).tasks, "the card links the existing task").toHaveLength(1);
});

test("Escape, board chrome and off-board drops place nothing and do not click-add", async ({ page }) => {
  await openBoard(page);
  await openPanel(page);
  const { x, y } = await dropPoint(page);
  for (const mode of ["escape", "outside", "panel"]) {
    await startDrag(page);
    await page.mouse.move(x, y, { steps: 6 });
    await preview(page).waitFor();
    if (mode === "escape") await page.keyboard.press("Escape");
    else if (mode === "outside") await page.mouse.move(5, 5, { steps: 3 });
    else {
      const r = await row(page).boundingBox();
      await page.mouse.move(r.x + 15, r.y + 15, { steps: 3 });
    }
    await page.mouse.up();
    await expect(preview(page), mode).toHaveCount(0);
    expect(await nodes(), mode).toHaveLength(0);
  }
});

test("undo and redo remove and restore a dropped card, and a click still adds one after a drag", async ({ page }) => {
  await openBoard(page);
  await openPanel(page);
  await dragAndDrop(page);
  await nodeCount().toBe(1);
  await settle(page);
  await page.locator("[data-action=board-undo]").click();
  await nodeCount().toBe(0);
  expect((await snapshot()).tasks, "undo keeps the task").toHaveLength(1);
  await page.locator("[data-action=board-redo]").click();
  await nodeCount().toBe(1);
  // A click still adds a linked card, even right after a completed drag.
  await row(page).click();
  await nodeCount().toBe(2);
  await page.reload();
  await page.locator("#canvas").waitFor();
  expect(await nodes(), "placed cards persist").toHaveLength(2);
});

onDevices(["phone"], () => test("a touch drag hides the panel and drops on the board in the dark theme", async ({ page }) => {
  await openBoard(page);
  await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await openPanel(page);
  const panel = page.locator("#board-task-panel");
  const r = await row(page).boundingBox();
  const client = await page.context().newCDPSession(page);
  const source = { x: r.x + 30, y: r.y + r.height / 2 };
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [source] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: source.x + 35, y: source.y }] });
  await preview(page).waitFor();
  await expect(panel).toHaveCSS("opacity", "0");
  // Phones reject drops under the selection toolbar, which never rises above 160px into
  // the board, so drop on the empty board above it.
  const board = await page.locator("#canvas").boundingBox();
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 240, y: board.y + 130 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await nodeCount().toBe(1);
  await expect(panel).toHaveCSS("opacity", "1");
  await page.reload();
  await page.locator("#canvas").waitFor();
  expect(await nodes(), "the touch drop persists").toHaveLength(1);
}));
