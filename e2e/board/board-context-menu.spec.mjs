// Owner request (F0.22-65): a right click on a board object opens the board's own menu, beside the
// pointer: Copy, Paste, Duplicate and Delete, for the object and the rest of the selection it is part
// of. On an empty part of the board it pastes where it was clicked. The menu's key (or Shift+F10)
// opens it for the selection.
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Board menu" });
  const card = await store.createTask(project.id, { title: "Write specification" });
  return { project, card };
});
test.use({ viewportSize: { width: 1400, height: 900 } });

const current = async () => (await app.store.snapshot(app.project.id)).boards[0];
test.beforeEach(async () => {
  const board = await current();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, edges: [], nodes: [
    { id: "note", type: "sticky", text: "First idea", x: 80, y: 120, w: 240, h: 200, color: "#f5e7a2" },
    { id: "card", type: "task", task: app.card.id, x: 420, y: 120, w: 300, h: 220 },
    { id: "pinned", type: "sticky", text: "Pinned", x: 80, y: 400, w: 200, h: 160, locked: true },
  ] });
});
const menu = (page) => page.getByRole("dialog", { name: "Object actions" });
const item = (page, name) => menu(page).getByRole("button", { name, exact: true });
async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator('[data-node="card"]').waitFor();
}
async function rightClick(page, target, dx = 40, dy = 40) {
  const box = await target.boundingBox();
  const at = { x: box.x + dx, y: box.y + dy };
  await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(menu(page)).toBeVisible();
  return at;
}

test("a right click on a card opens Copy, Paste, Duplicate and Delete beside the pointer, for that card", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  // Anywhere on the card, its fields included.
  const field = page.locator('[data-node="card"] select[data-canvas-task-field="priority"]');
  const spot = await field.boundingBox();
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.matches('select[data-canvas-task-field="priority"]'), [spot.x + spot.width / 2, spot.y + spot.height / 2])).toBe(true);
  await rightClick(page, field, spot.width / 2, spot.height / 2);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  const at = await rightClick(page, page.locator('[data-node="card"]'));
  await expect(menu(page).getByRole("button")).toHaveText(["Copy", "Paste", "Duplicate", "Delete"]);
  // Beside the pointer, with the card selected; nothing to paste yet.
  const box = await menu(page).boundingBox();
  expect(Math.abs(box.x - at.x) <= 8 && box.y >= at.y && box.y - at.y <= 12, JSON.stringify({ box, at })).toBe(true);
  await expect(page.locator('[data-node="card"]')).toHaveClass(/selected/);
  await expect(item(page, "Paste")).toBeDisabled();
  // Rows edge to edge in the shared 4px menu padding, Delete after a divider.
  expect(await menu(page).evaluate(el => getComputedStyle(el).paddingTop)).toBe("4px");
  await item(page, "Duplicate").click();
  await expect(menu(page)).toBeHidden();
  await expect.poll(async () => (await current()).nodes.filter(n => n.task === app.card.id).length).toBe(2);
  // Escape closes it, back on the board.
  await rightClick(page, page.locator('[data-node="note"]'));
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
});

test("Copy, then Paste on an empty part of the board, puts the copy where it was clicked; Delete removes, undo restores", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await rightClick(page, page.locator('[data-node="note"]'));
  await item(page, "Copy").click();
  await expect(menu(page)).toBeHidden();
  const canvas = await page.locator("#canvas").boundingBox();
  const at = { x: canvas.x + 900, y: canvas.y + 500 };
  await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(item(page, "Copy")).toBeDisabled();
  await item(page, "Paste").click();
  await expect.poll(async () => (await current()).nodes.filter(n => n.text === "First idea").length).toBe(2);
  const copy = (await current()).nodes.find(n => n.text === "First idea" && n.id !== "note");
  const pasted = await page.locator(`[data-node="${copy.id}"]`).boundingBox();
  expect(Math.abs(pasted.x - at.x) <= 2 && Math.abs(pasted.y - at.y) <= 2, JSON.stringify({ pasted, at })).toBe(true);
  // Delete, from the same menu.
  await rightClick(page, page.locator('[data-node="note"]'));
  await item(page, "Delete").click();
  await expect.poll(async () => (await current()).nodes.some(n => n.id === "note")).toBe(false);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await current()).nodes.some(n => n.id === "note")).toBe(true);
});

test("a locked object can be copied and duplicated but not deleted, and the menu key opens the menu for the selection", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await rightClick(page, page.locator('[data-node="pinned"]'));
  await expect(item(page, "Delete")).toBeDisabled();
  await expect(item(page, "Copy")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  await page.keyboard.press("Shift+F10");
  await expect(menu(page)).toBeVisible();
  await expect(item(page, "Delete")).toBeDisabled();
});

test("inside a frame the menu is the board's, on its title the frame's, and drawing tools keep the right click", { tag: "@gate" }, async ({ page }) => {
  const board = await current();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, nodes: [...board.nodes, { id: "frame", type: "frame", text: "Sprint", x: 800, y: 420, w: 360, h: 260 }] });
  await open(page);
  const frame = page.locator('[data-node="frame"]');
  const box = await frame.boundingBox();
  await rightClick(page, frame, box.width / 2, box.height / 2);
  await expect(item(page, "Copy")).toBeDisabled();
  await expect(frame).not.toHaveClass(/selected/);
  await page.keyboard.press("Escape");
  await rightClick(page, frame.locator(".frame-title"), 8, 8);
  await expect(item(page, "Delete")).toBeEnabled();
  await expect(frame).toHaveClass(/selected/);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  // With the pen, a right click opens nothing.
  await page.keyboard.press("p");
  const card = await page.locator('[data-node="card"]').boundingBox();
  await page.mouse.click(card.x + 150, card.y + 180, { button: "right" });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await expect(menu(page)).toHaveCount(0);
});
