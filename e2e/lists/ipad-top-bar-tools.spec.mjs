// Owner request, 30 October 2026 (iPad): in List, Tree, Table and Kanban, search, filters and sort
// sit in the middle of the top bar (empty on iPad, whose view tabs are in the bottom bar), and the
// bookmark star sits before the title. Desktop and phones keep their toolbar row.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Top bar tools", key: "TB" });
  await store.createTask(project.id, { title: "Alpha card" });
  await store.createTask(project.id, { title: "Beta card" });
  return { project };
});
const centre = (box) => box.x + box.width / 2;

onDevices(["ipad", "ipad-portrait"], () => test("search, filters and sort sit in the middle of the top bar, the star before the title", async ({ page, device }) => {
  for (const view of ["list", "tree", "table", "kanban"]) {
    await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
    await expect(page.locator(".main")).toHaveAttribute("data-layout-view", view);
    const tools = page.locator(".topbar .topbar-view-tools");
    await expect(tools.locator(".search"), `${device} ${view}: search`).toBeVisible();
    await expect(tools.locator('details.board-menu[data-board-menu="filters"]'), `${device} ${view}: filters`).toBeVisible();
    if (view !== "table") await expect(tools.locator("#sort-button"), `${device} ${view}: sort`).toBeVisible();
    const [bar, group] = [await page.locator(".topbar").boundingBox(), await tools.boundingBox()];
    expect(Math.abs(centre(group) - centre(bar)), `${device} ${view}: in the middle`).toBeLessThanOrEqual(24);
    const [star, title] = [await page.locator(".topbar .breadcrumb .bookmark-button").boundingBox(), await page.locator(".topbar .breadcrumb strong").boundingBox()];
    expect(star.x + star.width, `${device} ${view}: the star before the title`).toBeLessThanOrEqual(title.x);
    expect(group.x, `${device} ${view}: clear of the title`).toBeGreaterThanOrEqual(title.x + Math.min(title.width, 40));
  }
  // They still work: the search filters the cards, and the star bookmarks the view.
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  // Typed key by key, as each one filters the cards and repaints the toolbar, without the field
  // ever losing focus (which would put away an iPad's on-screen keyboard).
  await page.locator(".topbar #search").click();
  await page.locator(".topbar #search").evaluate((el) => { window.field = el; window.blurs = 0; el.addEventListener("blur", () => window.blurs++); });
  await page.keyboard.type("Beta", { delay: 80 });
  expect(await page.evaluate(() => window.blurs), "the search keeps focus while typing").toBe(0);
  expect(await page.evaluate(() => document.activeElement === window.field && window.field.isConnected), "the same field").toBe(true);
  await expect(page.locator(".topbar #search")).toHaveValue("Beta");
  await expect(page.locator(".topbar #search")).toBeFocused();
  await expect(page.locator(".task-row")).toHaveText([/Beta card/]);
  const star = page.locator(".topbar .breadcrumb .bookmark-button");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "false");
}));

onDevices(["desktop", "phone"], () => test("desktop and phones keep search, filters and sort in the toolbar row", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await expect(page.locator("#view-toolbar #search"), device).toBeAttached();
  await expect(page.locator(".topbar .topbar-view-tools")).toHaveCount(0);
}));
