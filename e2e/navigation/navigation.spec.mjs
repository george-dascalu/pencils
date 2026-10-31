// Global Back/Forward: every view, overview drilldowns, per-view preferences, settings,
// directories, organisations and boards join the browser history; reload and deep links
// return to the same place; rapid or failed navigation keeps the latest valid page; task
// edits autosave on Back and an invalid open editor is never discarded. Compact phone-width
// controls and legacy drawing links use the same router. Part of the cross-browser release gate.
import { test, expect, useApp } from "../fixtures.mjs";
import { selectProjectView, clickControl, openSettingsPage, openSidebar } from "../helpers/menu-controls.mjs";
import { chooseBoard } from "../helpers/board-canvas.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Navigation project", default_view: "overview" });
  const second = await store.createProject({ title: "Second project", default_view: "list" });
  const other = await store.createOrganisation({ title: "Other organisation" });
  const prerequisite = await store.createTask(project.id, { title: "Prerequisite" });
  const blocked = await store.createTask(project.id, { title: "Blocked task", dependencies: [prerequisite.id] });
  await store.createBoard(project.id, { title: "Second canvas" });
  const boards = (await store.snapshot(project.id)).boards;
  return { project, second, other, blocked, boards };
});

const projectRoute = (view, id = app.project.id) => `#project/${id}/${view}`;
const routeOf = (name) => projectRoute(name === "board" ? `board/${app.boards[0].id}` : name);

// The page has finished routing to `hash`: history, sidebar, tabs and content all agree.
async function at(page, hash) {
  await page.waitForFunction((hash) => {
    if (location.hash !== hash || history.state?.url !== hash || document.querySelector(".main")?.getAttribute("aria-busy") === "true") return false;
    const route = history.state.route;
    if (!route.project)
      return !document.querySelector(".tabs") && (route.page === "home" ? !document.querySelector(".project-settings-page") : !!document.querySelector("#settings-page-title"));
    if (document.querySelector(".project-link.active")?.dataset.id !== route.project) return false;
    if (route.view === "overview") return !!document.querySelector(".project-overview");
    if (route.view === "settings") return !!document.querySelector("#project-form");
    if (route.view === "board") return route.gallery ? !!document.querySelector(".drawing-gallery") : document.querySelector(".board-tools")?.dataset.board === route.board;
    return document.querySelector(".view-layout-switcher [aria-pressed=true]")?.dataset.view === route.view;
  }, hash);
  expect(new URL(page.url()).hash).toBe(hash);
}
async function back(page, hash) {
  await page.goBack();
  await at(page, hash);
}
async function forward(page, hash) {
  await page.goForward();
  await at(page, hash);
}
async function view(page, name) {
  await selectProjectView(page, name);
  await at(page, routeOf(name));
}
async function start(page, hash = projectRoute("overview")) {
  await page.goto(`${app.base}/${hash}`);
  await at(page, hash);
}
const reload = (page) => Promise.all([page.waitForEvent("domcontentloaded"), page.evaluate(() => location.reload())]);

test("an overview drilldown keeps its filters through Back, Forward and reload without duplicate entries", { tag: "@gate" }, async ({ page }) => {
  await start(page);
  const originalLength = await page.evaluate(() => history.length);
  await page.locator("[data-feature=overview-open][data-query=blocked]").click();
  await at(page, projectRoute("list"));
  await expect(page.locator(".task-row")).toHaveCount(1);
  await expect(page.locator(`[data-action=task-open][data-id="${app.blocked.id}"]`).first()).toBeVisible();
  await back(page, projectRoute("overview"));
  await expect(page.locator(".project-overview")).toBeVisible();
  await forward(page, projectRoute("list"));
  await expect(page.locator(".task-row")).toHaveCount(1);
  await reload(page);
  await at(page, projectRoute("list"));
  await expect(page.locator(".task-row"), "Reload keeps drilldown filters").toHaveCount(1);
  await back(page, projectRoute("overview"));
  expect(await page.evaluate(() => history.length), "Back/reload adds no duplicate entries").toBe(originalLength + 1);
});

test("Back and Forward step through every project view", { tag: "@gate" }, async ({ page }) => {
  await start(page);
  const views = ["list", "tree", "table", "kanban", "calendar", "timeline", "capacity", "board", "overview"];
  for (const name of views) await view(page, name);
  for (const name of views.slice(0, -1).reverse()) await back(page, routeOf(name));
  for (const name of views.slice(1)) await forward(page, routeOf(name));
});

test("Back, Forward and reload restore each view's search and table preferences", { tag: "@gate" }, async ({ page }) => {
  await start(page);
  await view(page, "table");
  await page.locator("#search").fill("Blocked");
  await page.waitForFunction(() => history.state.preferences.search === "Blocked");
  const tablePreferences = await page.evaluate(() => history.state.preferences.tablePreferences);
  const length = await page.evaluate(() => history.length);
  await selectProjectView(page, "table");
  expect(await page.evaluate(() => history.length), "Selecting the current page adds no entry").toBe(length);
  await view(page, "kanban");
  await page.locator("#search").fill("Prerequisite");
  await back(page, projectRoute("table"));
  await expect(page.locator("#search")).toHaveValue("Blocked");
  expect(await page.evaluate(() => history.state.preferences.tablePreferences)).toEqual(tablePreferences);
  await reload(page);
  await at(page, projectRoute("table"));
  await expect(page.locator("#search")).toHaveValue("Blocked");
  await forward(page, projectRoute("kanban"));
  await expect(page.locator("#search")).toHaveValue("Prerequisite");
});

test("settings, home and organisation switches join the history", { tag: "@gate" }, async ({ page }) => {
  const { project, other } = app;
  await start(page, projectRoute("kanban"));
  // Since 0.19.31 the top bar's single Settings button opens the project's General first.
  await openSettingsPage(page);
  await at(page, projectRoute("settings/general"));
  await back(page, projectRoute("kanban"));
  await forward(page, projectRoute("settings/general"));
  await page.locator("[data-action=settings-close]").click();
  await at(page, projectRoute("kanban"));
  await clickControl(page.locator("[data-action=home]").first());
  await at(page, `#organisation/${project.organisation}/home`);
  await reload(page);
  await at(page, `#organisation/${project.organisation}/home`);
  await back(page, projectRoute("kanban"));
  await openSidebar(page);
  await page.locator("#organisation-select").selectOption(other.id);
  await at(page, `#organisation/${other.id}/home`);
  await back(page, projectRoute("kanban"));
  await expect(page.locator("#organisation-select")).toHaveValue(project.organisation);
});

// Boards are chosen in the sidebar since 0.20.74; the gallery only opens by its address.
test("board switches join the history", { tag: "@gate" }, async ({ page }) => {
  const { boards } = app;
  await start(page);
  await view(page, "board");
  await chooseBoard(page, boards[1].id);
  await at(page, projectRoute(`board/${boards[1].id}`));
  await back(page, projectRoute(`board/${boards[0].id}`));
  await expect(page.locator(".board-tools")).toHaveAttribute("data-board", boards[0].id);
  await forward(page, projectRoute(`board/${boards[1].id}`));
});

test("Back saves task edits and never discards an invalid open editor", { tag: "@gate" }, async ({ page }) => {
  const { blocked } = app;
  await start(page, projectRoute("kanban"));
  await view(page, "list");
  await clickControl(page.locator("[data-action=filters-reset]").first());
  await page.locator(`[data-action=task-open][data-id="${blocked.id}"]`).first().click();
  await page.locator("#task-form [name=title]").fill("");
  await page.goBack();
  await page.getByText("Finish saving this task before leaving it.", { exact: true }).waitFor();
  await at(page, projectRoute("list"));
  await expect(page.locator("#task-form")).toBeVisible();
  await page.locator("#task-form [name=title]").fill("Saved during Back");
  await back(page, projectRoute("kanban"));
  await expect(page.locator("#task-form")).toHaveCount(0);
  expect((await app.store.snapshot(app.project.id)).tasks.find((t) => t.id === blocked.id).title).toBe("Saved during Back");
});

test("the latest destination wins when a second Back arrives during a project request", { tag: "@gate" }, async ({ page }) => {
  const { project, second } = app;
  await start(page);
  await clickControl(page.locator(`.project-link[data-id="${second.id}"]`));
  await at(page, projectRoute("list", second.id));
  await clickControl(page.locator(`.project-link[data-id="${project.id}"]`));
  await at(page, projectRoute("overview"));
  // A slow response for the second project keeps its request in flight while Back is pressed again.
  await page.route(`**/api/projects/${second.id}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  const loadingProject = page.waitForRequest((req) => req.url().endsWith(`/api/projects/${second.id}`));
  await page.evaluate(() => history.back());
  await loadingProject;
  await page.evaluate(() => history.back());
  await at(page, projectRoute("overview"));
  await page.unroute(`**/api/projects/${second.id}`);
});

test("a missing destination keeps the current page and Forward history", { tag: "@gate" }, async ({ page }) => {
  const { project, second } = app;
  await start(page);
  await clickControl(page.locator(`.project-link[data-id="${second.id}"]`));
  await at(page, projectRoute("list", second.id));
  await page.route(`**/api/projects/${project.id}`, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Project no longer available" }) }),
  );
  await page.goBack();
  await page.getByText("Project no longer available", { exact: true }).waitFor();
  await at(page, projectRoute("list", second.id));
  await page.unroute(`**/api/projects/${project.id}`);
  await back(page, projectRoute("overview"));
});

test.describe("phone width", () => {
  test.use({ viewportSize: { width: 390, height: 900 } });
  test("compact area and layout controls, in-app hash links and legacy drawing links use the same routes", { tag: "@gate" }, async ({ page }) => {
    await start(page);
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await view(page, "kanban");
    await view(page, "capacity");
    // Phones reach a layout with the Planning tab (Calendar) and then the layout switcher (0.19.33).
    await back(page, projectRoute("calendar"));
    await back(page, projectRoute("kanban"));
    await expect(page.locator("#project-view-switcher")).toHaveValue("tasks");
    await forward(page, projectRoute("calendar"));
    await forward(page, projectRoute("capacity"));
    await expect(page.locator("#project-view-switcher")).toHaveValue("planning");
    // Hash links opened within the app use the same router, including legacy drawings.
    await page.evaluate((hash) => { location.hash = hash; }, projectRoute("list"));
    await at(page, projectRoute("list"));
    await back(page, projectRoute("capacity"));
    await page.goto(`${app.base}/${projectRoute(`drawing/${app.boards[0].id}`)}`);
    await at(page, projectRoute(`board/${app.boards[0].id}`));
    await page.locator("#canvas").waitFor();
  });
});
