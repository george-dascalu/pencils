// Board settings: an anchored, nonmodal popover (light dismiss, Escape, focus return) that saves
// automatically. Snap and the board title are shared and persist per board across reloads and
// fresh browsers; display preferences (grid, minimap, expanded window) persist in this browser
// and stay isolated per board. The popover works in full screen and fits a dark phone screen.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal } from "../helpers/menu-controls.mjs";

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
  await app.store.updateBoard(app.project.id, board.id, { revision: board.revision, title, settings: { ...board.settings, snap } });
}
async function enter(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
  await page.locator("#board-select").selectOption(app.board.id);
}
const trigger = (page) => page.getByRole("button", { name: "Board settings", exact: true });
const popup = (page) => page.locator("#board-settings-popover");
const title = (page) => page.locator('#board-settings-form [name="title"]');
const close = (page) => page.getByRole("button", { name: "Close board settings", exact: true }).click();
const saved = (page) => expect(page.locator("#board-save")).toHaveText("Saved automatically");
async function expectSnap(page, expected) {
  await trigger(page).click();
  if (expected) await expect(page.locator("#canvas-snap")).toBeChecked();
  else await expect(page.locator("#canvas-snap")).not.toBeChecked();
  await page.keyboard.press("Escape");
}

test("board settings open in an anchored popover that dismisses lightly and returns focus", async ({ page }) => {
  await seed();
  await enter(page);
  await expectSnap(page, true);
  // Anchored popover: no modal backdrop, light dismiss, keyboard and focus return.
  await trigger(page).click();
  await expect(page.locator("dialog:modal")).toHaveCount(0);
  const b = await trigger(page).boundingBox(), p = await popup(page).boundingBox();
  expect(p.y >= b.y + b.height && p.y <= b.y + b.height + 10, "opens just below the button").toBe(true);
  expect(Math.abs(p.x - b.x), "aligned with the button").toBeLessThan(2);
  await title(page).fill("Discard this edit");
  await page.locator("#canvas").click({ position: { x: 900, y: 300 } });
  await popup(page).waitFor({ state: "detached" });
  await trigger(page).click();
  await expect(title(page)).toHaveValue("Discard this edit");
  await page.keyboard.press("Escape");
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await trigger(page).click();
  await popup(page).waitFor({ state: "detached" });
});

test("renaming and turning off snap and alignment save automatically, and a blank title is invalid", async ({ page }) => {
  await seed();
  await enter(page);
  await trigger(page).click();
  await title(page).fill("Renamed from settings");
  await page.locator("#canvas-snap").uncheck();
  await page.locator("#canvas-align").uncheck();
  await close(page);
  await saved(page);
  await expect.poll(async () => (await boardRecord()).settings.snap).toBe(false);
  expect((await boardRecord()).title).toBe("Renamed from settings");
  await expect(page.locator("#board-select option:checked")).toHaveText("Renamed from settings");
  await trigger(page).click();
  await title(page).fill("   ");
  expect(await title(page).evaluate((el) => !el.validity.valid), "a blank title is invalid").toBe(true);
  await title(page).fill("Renamed from settings");
  await close(page);
});

test("display preferences persist in this browser per board, while snap and the title are shared", async ({ page, browser }) => {
  await seed({ title: "Renamed from settings", snap: false });
  await enter(page);
  await page.locator("#canvas").click({ position: { x: 700, y: 400 } });
  await page.keyboard.press("g");
  await page.keyboard.press("m");
  await page.locator("#board-expand").click();
  await trigger(page).click();
  await expect(page.locator("#board-settings-form")).toBeVisible();
  await expect(page.locator('[name="show-minimap"]')).not.toBeChecked();
  await page.locator('[name="show-minimap"]').check();
  await close(page);
  await expect(page.locator("#canvas-minimap")).toBeVisible();
  await trigger(page).click();
  await page.locator('[name="show-minimap"]').uncheck();
  await close(page);
  await page.reload();
  await page.locator("#canvas.board-expanded.grid-hidden").waitFor();
  await expect(page.locator("#canvas-minimap")).toBeHidden();
  await page.keyboard.press("Escape");
  await expectSnap(page, false);
  // The other board keeps its own settings and display.
  await page.locator("#board-select").selectOption(app.other.id);
  await expectSnap(page, true);
  await expect(page.locator("#canvas-minimap")).toBeVisible();
  await expect(page.locator("#canvas")).not.toHaveClass(/grid-hidden/);
  await page.locator("#board-select").selectOption(app.board.id);
  await expectSnap(page, false);
  await expect(page.locator("#canvas-minimap")).toBeHidden();
  await expect(page.locator("#canvas")).toHaveClass(/grid-hidden/);
  // A fresh browser shares the board's snap and title, not this browser's display.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fresh = await context.newPage();
  const errors = [];
  fresh.on("pageerror", (e) => errors.push(e.message));
  await enter(fresh);
  await expectSnap(fresh, false);
  await expect(fresh.locator("#board-select option:checked")).toHaveText("Renamed from settings");
  await expect(fresh.locator("#canvas-minimap")).toBeVisible();
  await context.close();
  expect(errors, "no page errors in the fresh browser").toEqual([]);
});

test("turning snap back on persists across reload, and settings open in full screen", async ({ page }) => {
  await seed({ snap: false });
  await enter(page);
  await trigger(page).click();
  await page.locator("#canvas-snap").check();
  await close(page);
  await saved(page);
  await expect.poll(async () => (await boardRecord()).settings.snap).toBe(true);
  await page.reload();
  await expectSnap(page, true);
  await page.locator('[data-board-display="fullscreen"]').click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await trigger(page).click();
  await expect(popup(page)).toBeVisible();
  await close(page);
  await page.evaluate(() => document.exitFullscreen());
});

onDevices(["phone"], () => {
  test("board settings fit a phone screen in the dark theme", async ({ page }) => {
    await seed();
    await enter(page);
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    // Since 0.18.26 phones keep Board settings in the View options panel.
    await page.locator(".board-toolbar .mobile-view-options").waitFor();
    await (await reveal(page.locator(".board-toolbar .board-settings-button"))).click();
    await expect(popup(page)).toBeVisible();
    const small = await popup(page).boundingBox();
    expect(small.x >= 0 && small.x + small.width <= 390 && small.y + small.height <= 844, JSON.stringify(small)).toBe(true);
    await page.keyboard.press("Escape");
  });
});
