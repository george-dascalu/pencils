// Board navigation and editing controls: the expanded board's scroll lock, pointer-anchored
// scroll zoom and Shift-scroll panning, right/middle/Space/hand panning that leaves objects and
// the selection alone, keyboard shortcuts (group, lock, zoom, minimap, grid, find, help) that
// never fire while typing, Ctrl-click multi-selection, Alt-drag duplication, click-to-place
// stickies, tool shortcuts, and touch: a tap places a card while a drag only pans.
// The board never reaches the internet.
import { test, expect, useApp } from "../fixtures.mjs";
import { openBoardSearch } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board lab" });
  const a = await store.createTask(project.id, {
    title: "Write specification",
    assignee: "Alice",
    due: "2020-01-01",
    body: "## Scope\nOriginal scope.\n\n## Other\nKeep this.\n",
  });
  const b = await store.createTask(project.id, { title: "Build prototype", assignee: "Bob" });
  let board = (await store.snapshot(project.id)).boards[0];
  board = await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [
      { id: "note", type: "sticky", text: "First idea", x: 80, y: 150, w: 240, h: 200, color: "#f5e7a2" },
      { id: "task-a", type: "task", task: a.id, x: 420, y: 150, w: 310, h: 300 },
      { id: "task-b", type: "task", task: b.id, x: 830, y: 150, w: 300, h: 240 },
      { id: "far", type: "text", text: "A distant idea", x: 6000, y: 3000, w: 300, h: 150 },
    ],
    edges: [],
  });
  return { project, board };
});

test.use({ viewportSize: { width: 1600, height: 1100 } });

const current = async () => (await app.store.snapshot(app.project.id)).boards.find((x) => x.id === app.board.id);
const nodeOf = async (id) => (await current()).nodes.find((n) => n.id === id);
const poll = (fn, message) => expect.poll(fn, { message, timeout: 12000 });
const near = (a, b) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThan(1);

async function enter(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
  await page.locator('[data-node="note"]').waitFor();
}
async function saved(page) {
  await expect(page.locator("#board-save")).toHaveText("Saved automatically", { timeout: 12000 });
}
async function find(page, id, text) {
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill(text);
  await page.locator(`[data-pro=find-result][data-id="${id}"]`).click();
  await expect(page.locator(`[data-node="${id}"]`)).toBeVisible();
}
const camera = (page) =>
  page.locator("#canvas-world").evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, z: m.a };
  });
async function wheel(page, dx, dy, extra = {}) {
  await page.locator("#canvas").evaluate(
    (el, { dx, dy, extra }) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: r.left + 480, clientY: r.top + 280, deltaX: dx, deltaY: dy, ...extra }));
    },
    { dx, dy, extra },
  );
  await page.waitForFunction(() => !document.querySelector("#canvas").classList.contains("zooming"));
}
async function dragFrom(page, locator, button, modifier) {
  await locator.waitFor({ state: "visible" });
  const r = await locator.boundingBox();
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(r.x + 70, r.y + 70);
  await page.mouse.down({ button });
  await page.mouse.move(r.x + 130, r.y + 110, { steps: 8 });
  await page.mouse.up({ button });
  if (modifier) await page.keyboard.up(modifier);
}

let external;
test.beforeEach(({ page }) => {
  external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(app.base) && !r.url().startsWith("data:")) external.push(r.url());
  });
});
test.afterEach(() => expect(external, "no internet requests").toEqual([]));

test("the expanded board locks page scrolling, releases it on navigation and keeps the preference", async ({ page }) => {
  await enter(page);
  const pageOverflow = () =>
    page.evaluate(() => ({ html: getComputedStyle(document.documentElement).overflowY, body: getComputedStyle(document.body).overflowY }));
  const normalOverflow = await pageOverflow();
  await page.locator("#board-expand").click();
  await expect.poll(pageOverflow).toEqual({ html: "hidden", body: "hidden" });
  await expect(page.locator("#canvas")).toHaveClass(/\bboard-expanded\b/);
  // Navigating away must release the page scroll lock; returning restores the preference.
  await page.evaluate((id) => (location.hash = `project/${id}/overview`), app.project.id);
  await page.waitForFunction(() => !document.querySelector("#canvas"));
  await expect.poll(pageOverflow).toEqual(normalOverflow);
  await page.locator(".tabs [data-view=board]").click();
  await page.waitForFunction(() => document.querySelector("#canvas")?.classList.contains("board-expanded"));
  await expect.poll(pageOverflow).toEqual({ html: "hidden", body: "hidden" });
  await page.keyboard.press("Escape");
  await expect.poll(pageOverflow).toEqual(normalOverflow);
});

test("scroll zooms around the pointer, Shift-scroll pans vertically and pinch (Ctrl-scroll) zooms", async ({ page }) => {
  await enter(page);
  let before = await camera(page);
  await wheel(page, 0, -50);
  let after = await camera(page);
  expect(after.z).toBeGreaterThan(before.z);
  near((480 - before.x) / before.z, (480 - after.x) / after.z);
  near((280 - before.y) / before.z, (280 - after.y) / after.z);
  before = await camera(page);
  await wheel(page, 0, 31, { shiftKey: true });
  after = await camera(page);
  near(after.z, before.z);
  near(after.x, before.x);
  near(after.y, before.y - 31);
  before = after;
  await wheel(page, 22, 0, { shiftKey: true });
  after = await camera(page);
  near(after.z, before.z);
  near(after.y, before.y - 22);
  await wheel(page, 0, -20, { ctrlKey: true });
  expect((await camera(page)).z).toBeGreaterThan(after.z);
  before = await camera(page);
  await wheel(page, 0, 2.5);
  expect((await camera(page)).z).toBeLessThan(before.z);
});

test("right, middle, Space and hand-tool drags pan without moving objects or losing the selection", async ({ page }) => {
  await enter(page);
  await find(page, "note", "First idea");
  await page.locator("[data-node=note]").click();
  const original = structuredClone((await current()).nodes);
  for (const [button, modifier] of [["right", null], ["middle", null], ["left", "Space"]]) {
    const before = await camera(page);
    await dragFrom(page, page.locator("[data-node=note]"), button, modifier);
    const after = await camera(page);
    near(after.x, before.x + 60);
    near(after.y, before.y + 40);
    await expect(page.locator("[data-node=note]")).toHaveClass(/\bselected\b/);
  }
  await page.keyboard.press("h");
  const before = await camera(page);
  await dragFrom(page, page.locator("[data-node=note]"), "left");
  near((await camera(page)).x, before.x + 60);
  await page.keyboard.press("v");
  expect((await current()).nodes).toEqual(original);
});

test("keyboard shortcuts group, lock, zoom and toggle the minimap and grid, and find and help guard typing", async ({ page }) => {
  await enter(page);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+0");
  near((await camera(page)).z, 1);
  await find(page, "note", "First idea");
  await page.locator("[data-node=note]").click();
  await page.keyboard.press("Shift+2");
  await page.keyboard.press("Control+g");
  await saved(page);
  await poll(async () => !!(await nodeOf("note")).group).toBe(true);
  await page.keyboard.press("Control+Shift+g");
  await saved(page);
  await poll(async () => !!(await nodeOf("note")).group).toBe(false);
  await page.keyboard.press("Control+Shift+l");
  await saved(page);
  await poll(async () => !!(await nodeOf("note")).locked).toBe(true);
  await page.keyboard.press("Control+Shift+l");
  await saved(page);
  await page.keyboard.press("m");
  await expect(page.locator("#canvas-minimap")).toBeHidden();
  await page.keyboard.press("m");
  await expect(page.locator("#canvas-minimap")).toBeVisible();
  await page.keyboard.press("g");
  await expect(page.locator("#canvas")).toHaveClass(/\bgrid-hidden\b/);
  await page.keyboard.press("g");
  await page.keyboard.press("Control+f");
  await expect(page.locator("#canvas-find")).toBeFocused();
  // Typing shortcut letters into the search field types them instead.
  await page.keyboard.type("nht");
  await expect(page.locator("#canvas-find")).toHaveValue("nht");
  await openBoardSearch(page);
  await page.locator("#canvas-find").fill("");
  await page.locator("#canvas").focus();
  await page.keyboard.press("F1");
  await expect(page.locator("dialog h2")).toHaveText("Board shortcuts");
  await page.locator('dialog [data-action="dialog-close"]').click();
  await poll(async () => !!(await nodeOf("note")).locked, "the note is unlocked again").toBe(false);
});

test("Ctrl-click toggles multi-selection and Alt-drag duplicates in place, with undo", async ({ page }) => {
  await enter(page);
  await find(page, "note", "First idea");
  await page.locator("[data-node=note]").click();
  await page.keyboard.press("Control+0");
  // Move the camera so both neighbouring cards are visible.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Alt+1");
  await page.locator("[data-node=note]").click();
  await page.locator("[data-node=task-a]").click({ modifiers: ["Control"] });
  await expect(page.locator(".board-node.selected")).toHaveCount(2);
  await page.locator("[data-node=task-a]").click({ modifiers: ["Control"] });
  await expect(page.locator(".board-node.selected")).toHaveCount(1);
  await page.keyboard.press("Shift+2");
  const duplicateCamera = await camera(page);
  const beforeDuplicate = await current();
  const count = beforeDuplicate.nodes.length;
  await dragFrom(page, page.locator("[data-node=note]"), "left", "Alt");
  await saved(page);
  await poll(async () => (await current()).nodes.length, "Alt-drag clone").toBe(count + 1);
  const duplicated = (await current()).nodes.filter((n) => n.text === "First idea");
  expect(duplicated.length).toBe(2);
  expect(duplicated.find((n) => n.id === "note")).toEqual(beforeDuplicate.nodes.find((n) => n.id === "note"));
  expect(duplicated[0].x).not.toBe(duplicated[1].x);
  const clone = duplicated.find((n) => n.id !== "note");
  await poll(() => page.evaluate(() => document.activeElement?.dataset.node), "the clone has focus").toBe(clone.id);
  expect(await camera(page), "Alt-drag duplication keeps the camera unchanged").toEqual(duplicateCamera);
  await page.keyboard.press("Control+z");
  await poll(async () => (await current()).nodes.length, "undo duplicate").toBe(count);
});

test("N places a sticky with a click instead of opening a dialog, and tool shortcuts switch tools", async ({ page }) => {
  await enter(page);
  await page.keyboard.press("Escape");
  await page.keyboard.press("n");
  await expect(page.locator("dialog"), "N must not open a task dialog on the board").toHaveCount(0);
  await page.locator("#canvas").click({ position: { x: 480, y: 300 } });
  await page.locator("#canvas-inline-form .inline-rich").fill("Placed with N");
  // Wheel scrolling in an editor must not pan or zoom the board.
  const before = await camera(page);
  await page.locator("#canvas-inline-form .inline-rich").dispatchEvent("wheel", { deltaY: 80, bubbles: true });
  expect(await camera(page)).toEqual(before);
  await page.keyboard.press("Control+Enter");
  await saved(page);
  await poll(async () => (await current()).nodes.some((n) => n.text === "Placed with N"), "placed note saved").toBe(true);
  await page.keyboard.press("t");
  await page.keyboard.press("Escape");
  await expect(page.locator("#canvas")).not.toHaveClass(/\bplacing\b/);
  await page.keyboard.press("l");
  await expect(page.locator('[data-tool="connect"]')).toHaveAttribute("class", "active");
  await page.keyboard.press("p");
  await expect(page.locator('.board-tools [data-feature="draw-tool"]')).toHaveClass(/\bactive\b/);
  await page.keyboard.press("v");
});

test("a touch tap places a card while a touch drag only pans", async ({ page }) => {
  await enter(page);
  const cdp = await page.context().newCDPSession(page);
  await page.locator('[data-action="board-add"][data-tool="text"]').click();
  const r = await page.locator("#canvas").boundingBox();
  const x = r.x + 420, y = r.y + 220;
  const count = (await current()).nodes.length;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 60, y: y + 40, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator("#canvas-inline-form"), "Dragging with a touch must not place a card").toHaveCount(0);
  expect((await current()).nodes.length).toBe(count);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.locator("#canvas-inline-form .inline-rich").fill("Placed by touch");
  await page.locator('[data-pro="search-toggle"]').click();
  await poll(async () => (await current()).nodes.some((n) => n.text === "Placed by touch"), "touch placement").toBe(true);
});
