// Owner request, 31 October 2026 (board menus, like Miro, FigJam and Obsidian Canvas): the zoom
// level opens a menu (Fit board, 100%, Minimap, Background pattern), one Board appearance button
// at the foot of the tool bar replaces both Board settings buttons, without the board's name
// (Board tools → Rename has it), the display toggles (now in the zoom menu) or Import from Miro
// (now in Boards).
import { test, expect, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => ({ project: await store.createProject({ title: "Zoom and look", key: "ZL" }) }));
const open = async (page) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board`);
  await page.locator("#canvas").waitFor();
};
const zoomMenu = (page) => page.locator('[data-board-menu="zoom"]');
const row = (page, name) => zoomMenu(page).locator(".board-menu-panel > button").filter({ hasText: name });

test("the zoom level opens a menu: Fit board, 100%, Minimap and Background pattern", async ({ page }) => {
  await open(page);
  await page.locator("#zoom-label").click();
  await expect(zoomMenu(page).locator(".board-menu-panel")).toBeVisible();
  expect(await zoomMenu(page).locator(".board-menu-panel > button").evaluateAll((els) => els.map((el) => el.textContent.trim()))).toEqual(["Fit board", "100%", "Minimap", "Background pattern"]);
  await row(page, "100%").click();
  await expect(page.locator("#zoom-label")).toHaveText("100%");
  await expect(zoomMenu(page).locator(".board-menu-panel")).toBeHidden();
  await page.locator("#zoom-label").click();
  await expect(row(page, "Minimap")).toHaveAttribute("aria-pressed", "true");
  await row(page, "Minimap").click();
  await expect(page.locator("#canvas-minimap")).toBeHidden();
  await page.locator("#zoom-label").click();
  await expect(row(page, "Minimap")).toHaveAttribute("aria-pressed", "false");
  await row(page, "Background pattern").click();
  await expect(page.locator("#canvas")).toHaveClass(/grid-hidden/);
  await page.locator("#zoom-label").click();
  await expect(row(page, "Background pattern")).toHaveAttribute("aria-pressed", "false");
});

test("one Board appearance button opens the board's look, without its name, display or import", async ({ page }) => {
  await open(page);
  await expect(page.locator(".board-toolbar .board-settings-button")).toHaveCount(0);
  const button = page.locator('[data-feature="board-settings"]');
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAccessibleName("Board appearance");
  await expect(page.locator('.board-controls [data-feature="board-settings"]')).toHaveCount(1);
  await button.click();
  const panel = page.getByRole("dialog", { name: "Board appearance", exact: true });
  await expect(panel).toBeVisible();
  // It opens beside the tool bar, not over it.
  const bar = await page.locator(".board-tools").boundingBox();
  await expect.poll(async () => (await panel.boundingBox()).x, "beside the tool bar").toBeGreaterThanOrEqual(bar.x + bar.width);
  for (const gone of ['[name="title"]', '[name="show-minimap"]', '[name="show-pattern"]', '[data-feature="miro-import"]'])
    await expect(panel.locator(gone), gone).toHaveCount(0);
  for (const kept of ['[name="snap"]', '[name="align-objects"]', '[name="pattern"][value="grid"]', '[data-board-settings-reset]'])
    await expect(panel.locator(kept), kept).toHaveCount(1);
});

test("Boards imports from Miro", async ({ page }) => {
  await open(page);
  await page.locator('.board-toolbar [data-board-menu="board"] > summary').click();
  expect(await page.locator('.board-toolbar [data-board-menu="board"] .board-menu-panel > :is(button, a)').evaluateAll((els) => els.map((el) => el.textContent.trim()))).toEqual(["New board", "Import .canvas", "Import from Miro", "Boards"]);
  await page.locator('.board-toolbar [data-board-menu="board"] [data-feature="miro-import"]').click();
  await expect(page.locator("#miro-import-panel")).toBeVisible();
});
