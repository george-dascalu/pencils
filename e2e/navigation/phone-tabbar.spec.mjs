// Owner request, 29 October 2026 (mobile sidebar research, option A): phones switch views from a
// bottom tab bar, the top bar's view tabs in a floating, rounded bar; icons since 0.19.34. Tasks and
// Planning reopen their last layout; since 0.19.37 tapping the open tab again shows the layouts in
// a tray above the bar. The drawer keeps the organisation, projects, teams, the document list,
// Settings and Help, without view tiles. A Search button follows the tabs after a divider (29 Oct).
import { test, expect, onDevices, useApp } from "../fixtures.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Tab bar", key: "TB" });
  for (let i = 0; i < 30; i++) await store.createTask(project.id, { title: `Task ${i}` });
  const doc = await store.createDocument(project.id, { title: "Notes", body: "# Notes\n\nText." });
  const roadmap = await store.createDocument(project.id, { title: "Roadmap plan", body: "Plans" });
  await store.createDocument(project.id, { title: "Meeting", body: "We agreed the roadmap." });
  const sketches = await store.createBoard(project.id, { title: "Roadmap sketches" });
  await store.createTask(project.id, { title: "Roadmap review" });
  return { project, doc, roadmap, sketches };
});
const bar = (page) => page.locator(".topbar .tabs");
const tab = (page, view) => bar(page).locator(`[data-view="${view}"]`);
const open = async (page, view = "list") => {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await page.locator(`.main[data-layout-view="${view}"]`).waitFor();
};

onDevices(["phone", "small"], () => test("five icon tabs float at the bottom in a rounded bar and open each area", async ({ page, device }) => {
  await open(page);
  const box = await bar(page).boundingBox();
  const { width, height } = page.viewportSize();
  expect(box.y + box.height, `${device}: the bar sits near the bottom`).toBeGreaterThan(height - 24);
  expect(box.y + box.height, `${device}: detached from the bottom edge`).toBeLessThan(height);
  expect(box.x > 0 && box.x + box.width < width, `${device}: detached from the sides`).toBe(true);
  expect(parseFloat(await bar(page).evaluate((el) => getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThan(8);
  expect(await bar(page).locator(".tab").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).toEqual(["Overview", "Documents", "Planning", "Tasks", "Boards", "Search"]);
  for (const t of await bar(page).locator(".tab").all()) {
    expect((await t.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(t.locator(".icon"), "icons only").toBeVisible();
    expect((await t.textContent()).trim(), "no text labels").toBe("");
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

onDevices(["phone", "small"], () => test("tapping the open Tasks or Planning tab shows its layouts in a tray above the bar", async ({ page, device }) => {
  await open(page);
  const tray = page.locator(".layout-tray");
  await expect(page.locator(".toolbar .view-layout-switcher"), "no layout row in the toolbar").toHaveCount(0);
  await expect(tray).toBeHidden();
  await expect(tab(page, "tasks")).toHaveAttribute("aria-expanded", "false");
  await tab(page, "tasks").click();
  await expect(tray).toBeVisible();
  await expect(tab(page, "tasks")).toHaveAttribute("aria-expanded", "true");
  const [trayBox, barBox] = [await tray.boundingBox(), await bar(page).boundingBox()];
  expect(trayBox.y + trayBox.height, `${device}: the tray sits above the bar`).toBeLessThanOrEqual(barBox.y);
  expect(trayBox.x >= barBox.x - 1 && trayBox.x + trayBox.width <= barBox.x + barBox.width + 1, `${device}: as wide as the bar`).toBe(true);
  await expect(tray.locator("button")).toHaveText(["List", "Tree", "Table", "Kanban"]);
  for (const b of await tray.locator("button").all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(tray.locator('[aria-pressed="true"]')).toHaveAttribute("data-view", "list");
  expect(await tray.evaluate((el) => el.previousElementSibling.contains(document.querySelector('.tabs [data-view="tasks"]'))), "right after its tab, for keyboard order").toBe(true);
  // Choosing the open layout just closes the tray; choosing another opens it and closes the tray.
  await tray.locator('[data-view="list"]').click();
  await expect(tray).toBeHidden();
  await tab(page, "tasks").click();
  await tray.locator('[data-view="kanban"]').click();
  await page.locator('.main[data-layout-view="kanban"]').waitFor();
  await expect(tray).toBeHidden();
  // Tapping the tab again, Escape and tapping outside all close it.
  await tab(page, "tasks").click();
  await expect(tray).toBeVisible();
  await tab(page, "tasks").click();
  await expect(tray).toBeHidden();
  await tab(page, "tasks").click();
  await page.keyboard.press("Escape");
  await expect(tray).toBeHidden();
  await tab(page, "tasks").click();
  await page.locator("#view-content").click({ position: { x: 5, y: 5 } });
  await expect(tray).toBeHidden();
  await expect(page.locator('.main[data-layout-view="kanban"]'), "tapping outside doesn't change the view").toHaveCount(1);
  // Back to List closes a tray opened on Kanban.
  await tab(page, "tasks").click();
  await page.goBack();
  await page.locator('.main[data-layout-view="list"]').waitFor();
  await expect(tray).toBeHidden();
  await tab(page, "tasks").click();
  await tray.locator('[data-view="kanban"]').click();
  await page.locator('.main[data-layout-view="kanban"]').waitFor();
  // Tasks reopens the chosen layout; Planning has its own three.
  await tab(page, "overview").click();
  await page.locator('.main[data-layout-view="overview"]').waitFor();
  await expect(page.locator(".layout-tray"), "no tray outside Tasks and Planning").toHaveCount(0);
  await tab(page, "tasks").click();
  await page.locator('.main[data-layout-view="kanban"]').waitFor();
  await tab(page, "planning").click();
  await page.locator('.main[data-layout-view="calendar"]').waitFor();
  await tab(page, "planning").click();
  await expect(tray.locator("button")).toHaveText(["Calendar", "Timeline", "Capacity"]);
  await tray.locator('[data-view="timeline"]').click();
  await page.locator('.main[data-layout-view="timeline"]').waitFor();
}));

onDevices(["phone", "small"], () => test("Search sits after a divider and finds documents, boards and cards", async ({ page, device }) => {
  await open(page);
  const search = bar(page).getByRole("button", { name: "Search", exact: true });
  const [boards, divider, button] = await Promise.all([tab(page, "board").boundingBox(), bar(page).locator(".tabs-divider").boundingBox(), search.boundingBox()]);
  expect(boards.x + boards.width <= divider.x && divider.x + divider.width <= button.x, `${device}: Boards, divider, Search`).toBe(true);
  expect(divider.height, "the divider is a visible line").toBeGreaterThan(10);
  expect(Math.abs(button.width - boards.width), "Search is as wide as a tab").toBeLessThanOrEqual(1);
  const find = async (name) => {
    await bar(page).getByRole("button", { name: "Search", exact: true }).click();
    await page.locator("#global-search-input").fill("roadmap");
    await expect(page.locator(".search-result", { hasText: "Meeting" }), "documents match on their text too").toBeVisible();
    await page.locator(".search-result", { hasText: name }).click();
  };
  await find("Roadmap plan");
  await expect(page).toHaveURL(new RegExp(`/documents/${app.roadmap.id}$`));
  await open(page);
  await find("Roadmap sketches");
  await expect(page).toHaveURL(new RegExp(`/board/${app.sketches.id}$`));
  await open(page);
  await find("Roadmap review");
  await expect(page.locator("#task-form [name=title]")).toHaveValue("Roadmap review");
}));

onDevices(["phone"], () => test("the bar steps aside while typing", async ({ page }) => {
  await open(page);
  await expect(bar(page)).toBeVisible();
  await page.locator("#search").focus();
  await expect(bar(page)).toBeHidden();
  await page.locator("#search").blur();
  await expect(bar(page)).toBeVisible();
}));

onDevices(["phone"], () => test("the drawer lists Personal, Today, projects, teams, Settings and Help without view tiles", async ({ page }) => {
  await open(page);
  await page.locator(".mobile-menu").click();
  await page.locator(".sidebar.open").waitFor();
  const sidebar = page.locator(".sidebar");
  await expect(sidebar.locator(".project-link", { hasText: "Tab bar" })).toBeVisible();
  await expect(sidebar.locator(".personal-links .directory-link")).toHaveText(["Personal", "Today"]);
  await expect(sidebar.locator(".directory-links .directory-link")).toHaveCount(2);
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
  await expect(bar(page).getByRole("button", { name: "Search", exact: true }), "Search is a phone bar button; wider screens use Ctrl/⌘ K").toBeHidden();
}));
