// Board component upgrades: typography, shape geometry and rotation, merged grid cells, named
// layers, multi-object resize, embedded live task views (Kanban moves update the project task),
// timeline drag and milestones, local frame PDF export, board session timer and votes, frame deep
// links with opt-in presenter following across devices, keyboard object resizing, and the
// personal mouse/trackpad and single-key preferences.
import fs from "node:fs/promises";
import { test, expect, useApp } from "../fixtures.mjs";
import { openBoardSearch, selectProjectView } from "../helpers/menu-controls.mjs";
import { newGrid } from "../../public/grid-model.js";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Components", key: "COMP" });
  const task = await store.createTask(project.id, { title: "Scheduled task", start: "2026-10-14", due: "2026-10-18" });
  await store.createTask(project.id, { title: "Unscheduled task" });
  let board = (await store.snapshot(project.id)).boards[0];
  const grid = newGrid();
  grid.cells[0][0].text = "Alpha";
  grid.cells[0][1].text = "Beta";
  board = await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "note", type: "sticky", text: "Typography note", x: 150, y: 240, w: 240, h: 180 },
      { id: "note2", type: "sticky", text: "Second note", x: 500, y: 240, w: 180, h: 120 },
      { id: "shape", type: "shape", text: "Decision", x: 850, y: 240, w: 240, h: 180 },
      { id: "grid", type: "grid", text: "", x: 150, y: 550, w: 540, h: 312, grid },
      { id: "frame", type: "frame", text: "Frame one", x: 1100, y: 600, w: 640, h: 400 },
      { id: "query", type: "query", text: "Live work", x: 850, y: 1100, w: 800, h: 500, query: {}, viewType: "table" },
    ],
    edges: [{ id: "edge", from: "note", to: "note2", label: "Connection" }],
  });
  return { project, task, board };
});

const viewport = { width: 1600, height: 1100 };
test.use({ viewportSize: viewport });

const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
const nodeOf = async (id) => (await current()).nodes.find((n) => n.id === id);
const taskOf = async (id) => (await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === id);
const poll = (fn, message) => expect.poll(fn, { message, timeout: 10000 });
const transform = (page) => page.locator("#canvas-world").evaluate((e) => e.style.transform);

async function openBoard(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
}
async function menu(page, key) {
  const m = page.locator(`[data-selection-menu="${key}"]`);
  if ((await m.getAttribute("open")) === null) await m.locator(":scope > summary").click();
  return m;
}
async function find(page, id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro="find-result"][data-id="${id}"]`).click();
  await expect(page.locator(`[data-node="${id}"]`)).toBeVisible();
}
// Since 0.20.72 Layers is the second tab of the outline, opened by the tool bar's Frames.
async function layers(page) {
  if (await page.locator("#canvas-outline").isHidden()) await page.locator(".board-tools [data-pro=outline]").click();
  await page.locator("#canvas-outline [data-tab=layers]").click();
}

test("font size and vertical alignment save and paint on a sticky", async ({ page }) => {
  await openBoard(page);
  await find(page, "note", "Typography");
  await menu(page, "text-align");
  await page.locator("#selection-tools [data-text-style=fontSize]").selectOption("24");
  await poll(async () => (await nodeOf("note")).fontSize).toBe(24);
  await menu(page, "text-align");
  await page.locator('#selection-tools [data-text-style=verticalAlign][value="bottom"]').click();
  await poll(async () => (await nodeOf("note")).verticalAlign).toBe("bottom");
  await expect(page.locator("[data-node=note] .board-node-content")).toHaveCSS("justify-content", "flex-end");
});

test("a shape's geometry and rotation save", async ({ page }) => {
  await openBoard(page);
  await find(page, "shape", "Decision");
  await menu(page, "geometry");
  await page.locator("[data-object-geometry=shape]").selectOption("diamond");
  await poll(async () => (await nodeOf("shape")).shape).toBe("diamond");
  await expect(page.locator("[data-node=shape] .shape-art polygon")).toHaveCount(1);
  await menu(page, "geometry");
  await page.locator("[data-object-geometry=rotation]").fill("30");
  await page.locator("[data-object-geometry=rotation]").press("Tab");
  await poll(async () => (await nodeOf("shape")).rotation).toBe(30);
});

test("merged grid cells keep both texts and stay merged after reload", async ({ page }) => {
  await openBoard(page);
  await find(page, "grid", "Alpha");
  const cells = page.locator("[data-node=grid] .grid-cell");
  await cells.nth(0).click();
  await cells.nth(1).click({ modifiers: ["Shift"] });
  const merge = page.locator("[data-grid-action=merge]");
  await merge.evaluate((e) => (e.closest("details").open = true));
  await merge.click();
  await poll(async () => (await nodeOf("grid")).grid.merges?.length).toBe(1);
  expect(await cells.nth(0).innerText()).toMatch(/Alpha[\s\S]*Beta/);
  await page.reload();
  await find(page, "grid", "Alpha");
  await expect(page.locator("[data-node=grid] .grid-cell").first()).toContainText("Beta");
});

test("a named layer takes objects and hides and shows them", async ({ page }) => {
  await openBoard(page);
  await find(page, "note", "Typography");
  await layers(page);
  await page.locator("#board-layers-form [name=name]").fill("Ideas");
  await page.locator("#board-layers-form [type=submit]").click();
  await poll(async () => (await current()).layers?.length).toBe(1);
  await page.locator('[data-layer-action=assign][data-layer]:not([data-layer=""])').click();
  await poll(async () => !!(await nodeOf("note")).layer).toBe(true);
  await page.locator("[data-layer-action=hide]").click();
  await poll(async () => !!(await nodeOf("note")).layerHidden).toBe(true);
  await expect(page.locator(".board-node[data-node=note]")).toHaveCount(0);
  await layers(page);
  await page.locator("[data-layer-action=hide]").click();
  await expect(page.locator(".board-node[data-node=note]")).toHaveCount(1);
});

test("several selected objects resize together from the group handle", async ({ page }) => {
  await openBoard(page);
  await find(page, "note", "Typography");
  await page.keyboard.down("Control");
  await page.locator("[data-node=note2]").click();
  await page.keyboard.up("Control");
  await expect(page.locator(".multi-resize-box")).toHaveCount(1);
  const handle = await page.locator("[data-group-resize=se]").boundingBox();
  const before = await nodeOf("note");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(Math.min(1580, handle.x + 50), handle.y + 70, { steps: 10 });
  await page.mouse.up();
  await poll(async () => (await nodeOf("note")).w).toBeGreaterThan(before.w);
});

test("an embedded task view switches to Kanban, where moving a card updates the project task", async ({ page }) => {
  await openBoard(page);
  await find(page, "query", "Live work");
  await expect(page.locator("[data-node=query] .embedded-table")).toContainText("COMP-1");
  await page.locator("[data-selection-menu=more] > summary").click();
  await page.locator("[data-pro=query-edit]").click();
  await page.locator("#canvas-query-form [name=viewType]").selectOption("kanban");
  await page.locator("#canvas-query-form [type=submit]").click();
  await poll(async () => (await nodeOf("query")).viewType).toBe("kanban");
  await page.locator(`[data-live-task="${app.task.id}"]`).dragTo(page.locator('[data-live-status="in-progress"]'));
  await poll(async () => (await taskOf(app.task.id)).status).toBe("in-progress");
});

test("dragging a timeline bar reschedules the task and the milestone toggle saves", async ({ page }) => {
  await openBoard(page);
  await selectProjectView(page, "timeline");
  const bar = page.locator(`[data-timeline-task="${app.task.id}"]`);
  const b = await bar.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 32, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await poll(async () => (await taskOf(app.task.id)).start).toBe("2026-10-16");
  await page.locator(`[data-milestone="${app.task.id}"]`).click();
  await poll(async () => (await taskOf(app.task.id)).milestone).toBe(true);
});

test("frames export locally as a PDF", async ({ page }) => {
  await openBoard(page);
  await find(page, "frame", "Frame one");
  await menu(page, "arrange");
  const download = page.waitForEvent("download");
  await page.locator("[data-feature=frames-pdf]").click();
  const bytes = await fs.readFile(await (await download).path());
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(bytes.length).toBeGreaterThan(1000);
});

test("a board session's timer and votes persist", async ({ page }) => {
  await openBoard(page);
  await find(page, "note", "Typography");
  // Board session lives in the board bar's Session menu (0.20.71).
  await page.locator("[data-board-menu=session] > summary").click();
  await page.locator("[data-session=open]").first().click();
  await page.locator("[data-session=timer]").click();
  await poll(async () => (await current()).settings?.session?.timerEnd > Date.now()).toBe(true);
  await page.locator("[data-session=vote-start]").click();
  await poll(async () => !!(await current()).settings?.session?.voting).toBe(true);
  await page.locator("[data-session=vote-cast]").click();
  await poll(async () => !!(await current()).settings?.session?.votes?.[0]?.nodes.includes("note")).toBe(true);
  await page.locator("[data-action=dialog-close]").click();
});

// Closed pages from earlier tests stay present for 15 seconds; start from an empty board room.
async function emptyRoom() {
  const presence = `${app.base}/api/projects/${app.project.id}/boards/${app.board.id}/presence`;
  for (const { client } of (await (await fetch(presence)).json()).members)
    await fetch(presence, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client, leave: true }) });
}

test("a frame deep link opens on another device, which follows the presenter only by choice", async ({ page, browser }) => {
  await emptyRoom();
  await openBoard(page);
  // Another device: a separate browser context.
  const device = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const other = await device.newPage();
  const otherErrors = [];
  other.on("pageerror", (e) => otherErrors.push(e.message));
  await other.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}/frame/frame`);
  await other.locator("#canvas").waitFor();
  // Invite once both devices are on the board.
  await expect(page.locator("#canvas-presence")).toContainText("2 here", { timeout: 12000 });
  // Board session lives in the board bar's Session menu (0.20.71).
  await page.locator("[data-board-menu=session] > summary").click();
  await page.locator("[data-session=open]").first().click();
  await page.locator("[data-session=invite]").click();
  await page.locator("[data-action=dialog-close]").click();
  await other.locator("#session-invitation [data-follow]").click();
  await other.locator("#session-status [data-session=unfollow]").waitFor();
  await poll(async () => (await transform(page)) === (await transform(other)), "the follower matches the presenter's camera").toBe(true);
  const c = await page.locator("#canvas").boundingBox();
  await page.mouse.move(c.x + 400, c.y + 200);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(c.x + 460, c.y + 240);
  await page.mouse.up({ button: "middle" });
  await poll(async () => (await transform(page)) === (await transform(other)), "the follower tracks the presenter's pan").toBe(true);
  await other.locator("[data-session=unfollow]").click();
  await device.close();
  expect(otherErrors, "no page errors on the other device").toEqual([]);
});

test("keyboard resizing works and the trackpad and single-key preferences change navigation", async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => window.PencilsAppearance.write({ navigation: "trackpad", singleKeys: false }));
  await find(page, "note", "Typography");
  await page.locator("[data-node=note]").focus();
  const oldSize = (await nodeOf("note")).w;
  await page.keyboard.press("Alt+Shift+ArrowRight");
  await poll(async () => (await nodeOf("note")).w).toBe(oldSize + 10);
  // Single-key shortcuts are off: N does not start placing a note.
  await page.keyboard.press("n");
  await expect(page.locator("#canvas")).not.toHaveClass(/\bplacing\b/);
  const oldTransform = await transform(page);
  const c = await page.locator("#canvas").boundingBox();
  await page.mouse.move(c.x + 400, c.y + 200);
  await page.mouse.wheel(0, 100);
  await poll(() => transform(page), "trackpad scrolling moves the board").not.toBe(oldTransform);
  await page.evaluate(() => window.PencilsAppearance.write({ navigation: "mouse", singleKeys: true }));
});
