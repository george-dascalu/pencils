// Owner request, 31 October 2026: one action, one home. Each of these actions had a second copy:
// the board's More menu repeated the tool bar, the sidebar had two New project buttons and an
// organisation settings button beside the Settings button, Settings → You repeated Search, and
// task views kept a hidden caption. Timeline's Range wore the Weekends icon.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { openSettingsPage, openSidebar } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "One home" });
  await store.createTask(project.id, { title: "Dated", start: "2026-11-02", due: "2026-11-04" });
  const board = (await store.snapshot(project.id)).boards[0];
  return { project, board };
});
const tools = ['[data-tool="grid"]', '[data-tool="frame"]', '[data-tool="project-frame"]', '[data-tool="draw"]', '[data-feature="image-add"]'];

onDevices(["desktop", "phone"], () => test("the board bar's menus leave the tool bar's tools to the tool bar", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);
  await page.locator("#zoom-label").waitFor();
  const menus = page.locator(".board-toolbar details.board-menu, .mobile-view-options-panel details.board-menu, .board-tools details.board-menu");
  await expect(page.locator('details[data-board-menu="tools"] [data-feature="canvas-json"]'), `${device}: Board tools is built`).toBeAttached();
  for (const selector of tools) await expect(menus.locator(`:is(${selector}, [data-feature="grid-add"], [data-feature="frame-add"], [data-feature="draw-tool"])`), `${device}: ${selector} not in the board menus`).toHaveCount(0);
  // Phones reach them under the dock's +.
  if (device === "phone") await page.locator(".phone-board-more").click();
  for (const selector of tools) await expect(page.locator(`.board-tools ${selector}`), `${device}: ${selector}`).toBeVisible();
}));

onDevices(["desktop", "phone"], () => test("the sidebar has one New project button and no organisation settings button", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await openSidebar(page);
  const create = page.locator('.sidebar [data-action="project-new"]');
  await expect(create, device).toHaveCount(1);
  await expect(create, device).toBeVisible();
  if (device === "phone") {
    const box = await create.boundingBox();
    expect(Math.min(box.width, box.height), "a 44px target").toBeGreaterThanOrEqual(44);
  }
  const offset = await create.evaluate((b) => { const i = b.querySelector("svg").getBoundingClientRect(), r = b.getBoundingClientRect(); return Math.max(Math.abs(i.x + i.width / 2 - r.x - r.width / 2), Math.abs(i.y + i.height / 2 - r.y - r.height / 2)); });
  expect(offset, `${device}: the + is centred in its target`).toBeLessThanOrEqual(1);
  await expect(page.locator('.sidebar [data-action="organisation-edit"]'), device).toHaveCount(0);
  await expect(page.locator(".sidebar .phone-drawer-utilities [data-action=settings]"), device).toHaveCount(1);
  await create.click();
  await expect(page.locator("#project-form"), `${device}: the + creates a project`).toBeVisible();
}));

test("Settings → You leaves search to the Search button", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await openSettingsPage(page, "personal");
  await expect(page.locator('.project-settings-page .personal-workspace-actions [data-feature="recovery"]')).toBeVisible();
  await expect(page.locator('.project-settings-page [data-feature="global-search"]')).toHaveCount(0);
  await expect(page.locator('.topbar [data-feature="global-search"]')).toHaveCount(1);
});

test("task views have no hidden caption", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
  await expect(page.locator("#view-toolbar .caption")).toHaveCount(0);
});

test("Timeline's Range has its own icon", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/timeline`);
  await page.locator("[data-timeline-range]").waitFor();
  // The range icon (width-full in app.js), not the Weekends calendar.
  await expect(page.locator("[data-timeline-range] svg path").first()).toHaveAttribute("d", "M3 4v16M21 4v16M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4");
});
