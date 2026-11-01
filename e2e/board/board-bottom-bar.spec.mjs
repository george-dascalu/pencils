// Board sweep T95, 1 November 2026: on phones and iPad the board's menus and panels stay above the
// floating bottom bar (and the phone dock), so their last rows can be tapped: the selection
// toolbar's Arrange and colour menus with the custom picker open (T88, T89), Board tools and
// Board appearance. On phones, full screen leaves the dock where it was, clear of Safari's own
// bar, which iPhone keeps in full screen (T94).
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Bottom bar", key: "BO" });
  const board = (await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id, board.id, {
    revision: board.revision,
    nodes: [{ id: "note", type: "sticky", text: "Near the top", x: 40, y: 40, w: 200, h: 120, color: "#f5e7a2" }],
    edges: [],
  });
  return { project, board };
});
const open = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator('[data-node="note"]').waitFor();
};
// The highest point a panel may reach: the bottom bar's top, or the phone dock's.
const floor = (page) => page.evaluate(() => Math.min(...[".topbar .tabs", ".phone-board-dock"].map((s) => document.querySelector(s)).filter((el) => el?.getClientRects().length).map((el) => el.getBoundingClientRect().top)));
const bottom = (locator) => locator.evaluate((el) => el.getBoundingClientRect().bottom);
const clear = async (page, locator, name) =>
  expect.poll(async () => (await bottom(locator)) <= (await floor(page)), { message: `${name} ends above the bottom bar` }).toBe(true);

onDevices(["phone", "ipad"], () => {
  test("the selection toolbar's menus end above the bottom bar", async ({ page }) => {
    await open(page);
    await page.locator('[data-node="note"]').click();
    const arrange = page.locator('#selection-tools [data-selection-menu="arrange"]');
    await arrange.locator("> summary").click();
    await expect(arrange.locator(".selection-popover")).toBeVisible();
    await clear(page, arrange.locator(".selection-popover"), "Arrange");
    await arrange.locator("> summary").click();
    const colour = page.locator("#selection-tools .color-picker").filter({ has: page.locator("> summary[aria-label=\"Object colour\"]") });
    await colour.locator("> summary").click();
    await colour.locator("[data-color-custom-toggle]").click();
    await expect(colour.locator("[data-color-apply]")).toBeAttached();
    await clear(page, colour.locator(".selection-popover"), "Object colour with the custom picker");
  });
});

onDevices(["ipad"], () => {
  test("Board tools and Board appearance end above the bottom bar", async ({ page }) => {
    await open(page);
    const tools = page.locator('.board-toolbar [data-board-menu="tools"]');
    await tools.locator("> summary").click();
    await expect(tools.locator(".board-menu-panel")).toBeVisible();
    await clear(page, tools.locator(".board-menu-panel"), "Board tools");
    await page.keyboard.press("Escape");
    await page.locator('[data-feature="board-settings"]').click();
    await expect(page.locator("#board-settings-popover")).toBeVisible();
    await clear(page, page.locator("#board-settings-form"), "Board appearance");
  });
});

onDevices(["phone"], () => {
  test("full screen leaves the dock where it was", async ({ page }) => {
    await open(page);
    const dock = page.locator(".phone-board-dock");
    const before = await bottom(dock);
    await page.locator('[data-phone-category="navigate"]').click();
    await page.locator("#board-expand").click();
    await expect(page.locator(".canvas.board-expanded")).toBeVisible();
    expect(Math.abs((await bottom(dock)) - before)).toBeLessThanOrEqual(1);
  });
});
