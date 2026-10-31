// Owner request, 30 October 2026 (iPad): in List, Tree, Table and Kanban, search, filters and sort
// sit in the middle of the top bar (empty on iPad, whose view tabs are in the bottom bar), and the
// bookmark star sits before the title. Desktop and phones keep their toolbar row.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Top bar tools", key: "TB" });
  await store.createTask(project.id, { title: "Alpha card" });
  await store.createTask(project.id, { title: "Beta card" });
  const board = (await store.snapshot(project.id)).boards[0];
  const doc = await store.createDocument(project.id, { title: "Star note", body: "Text" });
  const second = await store.createDocument(project.id, { title: "Second note", body: "More" });
  return { project, board, doc, second };
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

// Owner request, 31 October 2026 (iPad): Board, Planning and an open document put the bookmark star
// before the title too, as the task views do.
onDevices(["ipad", "ipad-portrait"], () => test("Board, Planning and documents put the star before the title", async ({ page, device }) => {
  const { project, board, doc, second } = app;
  for (const [name, path, kind] of [["board", `board/${board.id}`, "board"], ["calendar", "calendar", "view"], ["timeline", "timeline", "view"], ["capacity", "capacity", "view"], ["document", `documents/${doc.id}`, "doc"]]) {
    await page.goto(`${app.base}/#project/${project.id}/${path}`);
    const star = page.locator(".topbar .breadcrumb .bookmark-button");
    await expect(star, `${device} ${name}: the star is in the top bar`).toHaveAttribute("data-kind", kind);
    await expect(page.locator(".bookmark-button"), `${device} ${name}: one star`).toHaveCount(1);
    await expect(star).toBeVisible();
    // A document's tabs show in the title's place (the heading stays for screen readers).
    const [box, title] = [await star.boundingBox(), await page.locator(name === "document" ? ".topbar .breadcrumb .document-tabs" : ".topbar .breadcrumb strong").boundingBox()];
    expect(box.x + box.width, `${device} ${name}: before the title`).toBeLessThanOrEqual(title.x);
    expect(Math.abs(box.y + box.height / 2 - (title.y + title.height / 2)), `${device} ${name}: level with the title`).toBeLessThanOrEqual(4);
    await star.click();
    await expect(star, `${device} ${name}: bookmarks`).toHaveAttribute("aria-pressed", "true");
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "false");
  }
  // Leaving the document takes its star with it, and coming back brings one star.
  for (const [path, kind] of [["calendar", "view"], [`documents/${doc.id}`, "doc"], ["list", "view"]]) {
    await page.goto(`${app.base}/#project/${project.id}/${path}`);
    await expect(page.locator(".topbar .breadcrumb .bookmark-button"), `${device} ${path}`).toHaveAttribute("data-kind", kind);
    await expect(page.locator(".bookmark-button"), `${device} ${path}: one star`).toHaveCount(1);
  }
  // Opening another document in place, from the sidebar, swaps the star for its own.
  await page.goto(`${app.base}/#project/${project.id}/documents/${doc.id}`);
  await page.locator(".topbar .mobile-menu").click();
  // By keyboard: the documents section's footer covers the last item once it's scrolled into view.
  await page.locator(".sidebar .sidebar-documents [data-document-open]", { hasText: "Second note" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".topbar .breadcrumb .bookmark-button"), `${device}: the second document's star`).toHaveAttribute("data-id", second.id);
  await expect(page.locator(".bookmark-button"), `${device}: one star`).toHaveCount(1);
  // Through a phone width and back, the star and the documents tray are each there once.
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".topbar .breadcrumb .bookmark-button"), `${device}: phones keep the star in the document bar`).toHaveCount(0);
  await page.setViewportSize(size);
  await expect(page.locator(".topbar .breadcrumb .bookmark-button"), `${device}: back before the title`).toHaveAttribute("data-id", second.id);
  await expect(page.locator(".bookmark-button")).toHaveCount(1);
  await expect(page.locator(".layout-tray"), `${device}: the documents tray`).toHaveCount(1);
}));

onDevices(["desktop", "phone"], () => test("desktop and phones keep Planning's star out of the top bar", async ({ page, device }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await expect(page.locator(".bookmark-button"), device).toHaveCount(1);
  await expect(page.locator(".topbar .breadcrumb .bookmark-button"), device).toHaveCount(0);
}));
