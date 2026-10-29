// Owner request, 29 October 2026 (mobile sidebar research, option A): phones switch views from a
// bottom tab bar, the top bar's view tabs as text labels in a floating, rounded bar. Tasks and Planning
// reopen their last layout, chosen with the toolbar's layout switcher. The drawer keeps the
// organisation, projects, teams, the document list, Settings and Help, without view tiles.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Tab bar", key: "TB" });
  for (let i = 0; i < 30; i++) await store.createTask(project.id, { title: `Task ${i}` });
  const doc = await store.createDocument(project.id, { title: "Notes", body: "# Notes\n\nText." });
  return { project, doc };
});
const bar = (page) => page.locator(".topbar .tabs");
const tab = (page, view) => bar(page).locator(`[data-view="${view}"]`);
const open = async (page, view = "list") => {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await page.locator(`.main[data-layout-view="${view}"]`).waitFor();
};

onDevices(["phone", "small"], () => test("five text tabs float at the bottom in a rounded bar and open each area", async ({ page, device }) => {
  await open(page);
  const box = await bar(page).boundingBox();
  const { width, height } = page.viewportSize();
  expect(box.y + box.height, `${device}: the bar sits near the bottom`).toBeGreaterThan(height - 24);
  expect(box.y + box.height, `${device}: detached from the bottom edge`).toBeLessThan(height);
  expect(box.x > 0 && box.x + box.width < width, `${device}: detached from the sides`).toBe(true);
  expect(parseFloat(await bar(page).evaluate((el) => getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThan(8);
  await expect(bar(page).locator(".tab")).toHaveText(["Overview", "Documents", "Planning", "Tasks", "Boards"]);
  await expect(bar(page).locator(".tab .icon").first(), "text only").toBeHidden();
  for (const t of await bar(page).locator(".tab").all()) {
    expect((await t.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(t.locator(".tab-label"), "labels fit").toHaveJSProperty("scrollWidth", await t.locator(".tab-label").evaluate((el) => el.clientWidth));
  }
  await expect(tab(page, "tasks")).toHaveAttribute("aria-current", "page");
  // The content ends above the bar instead of under it.
  const content = await page.locator("#view-content").boundingBox();
  expect(content.y + content.height).toBeLessThanOrEqual(box.y + 1);
  for (const [view, layout] of [["overview", "overview"], ["documents", "documents"], ["planning", "calendar"], ["board", "board"], ["tasks", "list"]]) {
    await tab(page, view).click();
    await page.locator(`.main[data-layout-view="${layout}"]`).waitFor();
    await expect(tab(page, view)).toHaveAttribute("aria-current", "page");
  }
}));

onDevices(["phone"], () => test("Tasks reopens the layout chosen with the toolbar switcher", async ({ page }) => {
  await open(page);
  const switcher = page.locator(".toolbar-left > .view-layout-switcher");
  await expect(switcher).toBeVisible();
  await switcher.locator('[data-view="kanban"]').click();
  await page.locator('.main[data-layout-view="kanban"]').waitFor();
  await tab(page, "overview").click();
  await page.locator('.main[data-layout-view="overview"]').waitFor();
  await tab(page, "tasks").click();
  await page.locator('.main[data-layout-view="kanban"]').waitFor();
}));

onDevices(["phone"], () => test("the bar steps aside while typing", async ({ page }) => {
  await open(page);
  await expect(bar(page)).toBeVisible();
  await page.locator("#search").focus();
  await expect(bar(page)).toBeHidden();
  await page.locator("#search").blur();
  await expect(bar(page)).toBeVisible();
}));

onDevices(["phone"], () => test("the drawer lists projects, teams, Settings and Help without view tiles", async ({ page }) => {
  await open(page);
  await page.locator(".mobile-menu").click();
  await page.locator(".sidebar.open").waitFor();
  const sidebar = page.locator(".sidebar");
  await expect(sidebar.locator(".project-link", { hasText: "Tab bar" })).toBeVisible();
  await expect(sidebar.locator(".directory-link")).toHaveCount(2);
  await expect(sidebar.locator(".phone-drawer-utilities button")).toHaveText(["Settings", "Help"]);
  await expect(sidebar.locator("[data-view]")).toHaveCount(0);
}));

onDevices(["phone"], () => test("tapping Documents again opens the document list", async ({ page }) => {
  await page.goto(`${app.base}/#project/${app.project.id}/documents/${app.doc.id}`);
  await page.locator('.main[data-layout-view="documents"]').waitFor();
  await tab(page, "documents").click();
  await page.locator(".sidebar.open").waitFor();
  await expect(page.locator(".sidebar")).toHaveAttribute("data-drawer-level", "documents");
  await expect(page.locator(".sidebar .sidebar-documents [data-document-open]", { hasText: "Notes" })).toBeVisible();
}));

onDevices(["ipad", "desktop"], () => test("wider screens keep the view tabs in the top bar", async ({ page }) => {
  await open(page);
  const box = await bar(page).boundingBox();
  expect(box.y).toBeLessThan(80);
  await expect(bar(page).locator(".tab-label").first()).toBeHidden();
}));
