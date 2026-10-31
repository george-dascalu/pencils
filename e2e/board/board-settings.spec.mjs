// Board appearance (Board settings until 0.20.73): an anchored, nonmodal popover beside the tool
// bar (light dismiss, Escape, focus return) that saves automatically. Snap is shared and persists
// per board across reloads and fresh browsers; display preferences (grid, minimap, expanded
// window), now in the zoom level's menu, persist in this browser and stay isolated per board.
// The popover works in full screen and fits a dark phone screen.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { clickControl } from "../helpers/menu-controls.mjs";
import { chooseBoard } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Settings" });
  const board = (await store.snapshot(project.id)).boards[0];
  const other = await store.createBoard(project.id, { title: "Other canvas" });
  return { project, board, other };
});

const boardRecord = async (id = app.board.id) => (await app.store.snapshot(app.project.id)).boards.find((b) => b.id === id);
// Shared board state each test starts from.
async function seed({ title = app.board.title, snap = true } = {}) {
  const board = await boardRecord();
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, title, settings: { ...board.settings, snap, alignObjects: true } });
}
async function enter(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator(`.board-tools[data-board="${app.board.id}"]`).waitFor();
}
const trigger = (page) => page.getByRole("button", { name: "Board appearance", exact: true });
const popup = (page) => page.locator("#board-settings-popover");
const close = (page) => page.getByRole("button", { name: "Close board appearance", exact: true }).click();
const saved = (page) => expect(page.locator("#board-save")).toHaveText("Saved automatically");
async function expectSnap(page, expected) {
  await trigger(page).click();
  if (expected) await expect(page.locator("#canvas-snap")).toBeChecked();
  else await expect(page.locator("#canvas-snap")).not.toBeChecked();
  await page.keyboard.press("Escape");
}
async function zoomToggle(page, name) {
  await page.locator("#zoom-label").click();
  await page.locator('[data-board-menu="zoom"] .board-menu-panel > button').filter({ hasText: name }).click();
}

test("board appearance opens in an anchored popover beside the tool bar that dismisses lightly and returns focus", async ({ page }) => {
  await seed();
  await enter(page);
  await expectSnap(page, true);
  // Anchored popover: no modal backdrop, light dismiss, keyboard and focus return.
  await trigger(page).click();
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  const b = await trigger(page).boundingBox(), bar = await page.locator(".board-tools").boundingBox(), p = await popup(page).boundingBox();
  expect(p.x >= bar.x + bar.width && p.x <= bar.x + bar.width + 10, "opens just beside the tool bar").toBe(true);
  expect(p.y + p.height <= b.y + b.height, "level with the button's foot").toBe(true);
  await page.locator("#canvas-align").uncheck();
  await page.locator("#canvas").click({ position: { x: 900, y: 300 } });
  await popup(page).waitFor({ state: "detached" });
  await trigger(page).click();
  await expect(page.locator("#canvas-align"), "changes save as they are made").not.toBeChecked();
  await page.locator("#canvas-align").check();
  await page.keyboard.press("Escape");
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await trigger(page).click();
  await popup(page).waitFor({ state: "detached" });
});

test("turning off snap and alignment saves automatically", async ({ page }) => {
  await seed();
  await enter(page);
  await trigger(page).click();
  await page.locator("#canvas-snap").uncheck();
  await page.locator("#canvas-align").uncheck();
  await close(page);
  await saved(page);
  await expect.poll(async () => (await boardRecord()).settings.snap).toBe(false);
  expect((await boardRecord()).settings.alignObjects).toBe(false);
});

test("display preferences persist in this browser per board, while snap is shared", async ({ page, browser }) => {
  await seed({ snap: false });
  await enter(page);
  await page.locator("#canvas").click({ position: { x: 700, y: 400 } });
  await page.keyboard.press("g");
  await page.keyboard.press("m");
  await page.locator("#board-expand").click();
  await zoomToggle(page, "Minimap");
  await expect(page.locator("#canvas-minimap")).toBeVisible();
  await zoomToggle(page, "Minimap");
  await expect(page.locator("#canvas-minimap")).toBeHidden();
  await page.reload();
  await page.locator("#canvas.board-expanded.grid-hidden").waitFor();
  await expect(page.locator("#canvas-minimap")).toBeHidden();
  await page.keyboard.press("Escape");
  await expectSnap(page, false);
  // The other board keeps its own settings and display.
  await chooseBoard(page, app.other.id);
  await expectSnap(page, true);
  await expect(page.locator("#canvas-minimap")).toBeVisible();
  await expect(page.locator("#canvas")).not.toHaveClass(/grid-hidden/);
  await chooseBoard(page, app.board.id);
  await expectSnap(page, false);
  await expect(page.locator("#canvas-minimap")).toBeHidden();
  await expect(page.locator("#canvas")).toHaveClass(/grid-hidden/);
  // A fresh browser shares the board's snap, not this browser's display.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fresh = await context.newPage();
  const errors = [];
  fresh.on("pageerror", (e) => errors.push(e.message));
  await enter(fresh);
  await expectSnap(fresh, false);
  await expect(fresh.locator("#canvas-minimap")).toBeVisible();
  await context.close();
  expect(errors, "no page errors in the fresh browser").toEqual([]);
});

test("turning snap back on persists across reload, and board appearance opens in full screen", async ({ page }) => {
  await seed({ snap: false });
  await enter(page);
  await trigger(page).click();
  await page.locator("#canvas-snap").check();
  await close(page);
  await saved(page);
  await expect.poll(async () => (await boardRecord()).settings.snap).toBe(true);
  await page.reload();
  await expectSnap(page, true);
  await page.locator("#board-expand").click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await trigger(page).click();
  await expect(popup(page)).toBeVisible();
  await close(page);
  await page.evaluate(() => document.exitFullscreen());
});

onDevices(["phone"], () => {
  test("board appearance fits a phone screen in the dark theme", async ({ page }) => {
    await seed();
    await enter(page);
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    // Phones keep Board appearance in the dock's Navigate row.
    await clickControl(page.locator('[data-feature="board-settings"]'));
    await expect(popup(page)).toBeVisible();
    const small = await popup(page).boundingBox();
    expect(small.x >= 0 && small.x + small.width <= 390 && small.y + small.height <= 844, JSON.stringify(small)).toBe(true);
    // Reset redraws the panel while its button waits in the closed Navigate row.
    await page.locator("[data-board-settings-reset]").click();
    await expect(popup(page), "Reset keeps the panel open").toBeVisible();
    // It stays just above the dock, by Navigate, rather than at the screen's corner.
    const dock = await page.locator(".phone-board-dock").boundingBox();
    const after = await popup(page).boundingBox();
    expect(after.y + after.height, JSON.stringify({ after, dock })).toBeLessThanOrEqual(dock.y);
    expect(after.y + after.height, JSON.stringify({ after, dock })).toBeGreaterThan(dock.y - 60);
    await page.keyboard.press("Escape");
  });
});
