import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { selectProjectView, clickControl } from "./menu-controls.mjs";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-navigation-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({
  title: "Navigation project",
  default_view: "overview",
});
const second = await store.createProject({
  title: "Second project",
  default_view: "list",
});
const other = await store.createOrganisation({ title: "Other organisation" });
const prerequisite = await store.createTask(project.id, {
  title: "Prerequisite",
});
const blocked = await store.createTask(project.id, {
  title: "Blocked task",
  dependencies: [prerequisite.id],
});
await store.createBoard(project.id, { title: "Second canvas" });
const boards = (await store.snapshot(project.id)).boards;
const server = createServer(store);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await (
  process.env.BROWSER === "firefox" ? firefox : chromium
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const base = `http://127.0.0.1:${server.address().port}`;
const projectRoute = (view, id = project.id) => `#project/${id}/${view}`;
async function at(hash) {
  await page.waitForFunction((hash) => {
    if (
      location.hash !== hash ||
      history.state?.url !== hash ||
      document.querySelector(".main")?.getAttribute("aria-busy") === "true"
    )
      return false;
    const route = history.state.route;
    if (!route.project)
      return (
        !document.querySelector(".tabs") &&
        (route.page === "home"
          ? !document.querySelector(".directory-page")
          : document.querySelector(".directory-link[aria-current=page]")
              ?.dataset.page === route.page)
      );
    if (
      document.querySelector(".project-link.active")?.dataset.id !==
      route.project
    )
      return false;
    if (route.view === "overview")
      return !!document.querySelector(".project-overview");
    if (route.view === "settings")
      return !!document.querySelector("#project-form");
    if (route.view === "board")
      return route.gallery
        ? !!document.querySelector(".drawing-gallery")
        : document.querySelector("#board-select")?.value === route.board;
    return (
      document.querySelector(".view-layout-switcher [aria-pressed=true]")
        ?.dataset.view === route.view
    );
  }, hash);
  assert.equal(new URL(page.url()).hash, hash);
}
async function back(hash) {
  await page.goBack();
  await at(hash);
}
async function forward(hash) {
  await page.goForward();
  await at(hash);
}
async function view(name) {
  await selectProjectView(page, name);
  await at(projectRoute(name === "board" ? `board/${boards[0].id}` : name));
}
try {
  await page.goto(`${base}/${projectRoute("overview")}`);
  await at(projectRoute("overview"));
  const originalLength = await page.evaluate(() => history.length);
  await page
    .locator("[data-feature=overview-open][data-query=blocked]")
    .click();
  await at(projectRoute("list"));
  assert.equal(await page.locator(".task-row").count(), 1);
  assert.ok(
    await page
      .locator(`[data-action=task-open][data-id="${blocked.id}"]`)
      .first()
      .isVisible(),
  );
  await back(projectRoute("overview"));
  assert.ok(await page.locator(".project-overview").isVisible());
  await forward(projectRoute("list"));
  assert.equal(await page.locator(".task-row").count(), 1);
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.evaluate(() => location.reload()),
  ]);
  await at(projectRoute("list"));
  assert.equal(
    await page.locator(".task-row").count(),
    1,
    "Reload keeps drilldown filters",
  );
  await back(projectRoute("overview"));
  assert.equal(
    await page.evaluate(() => history.length),
    originalLength + 1,
    "Back/reload adds no duplicate entries",
  );

  const views = [
    "list",
    "tree",
    "table",
    "kanban",
    "calendar",
    "timeline",
    "capacity",
    "board",
    "overview",
  ];
  for (const name of views) await view(name);
  for (const name of [...views].slice(0, -1).reverse())
    await back(projectRoute(name === "board" ? `board/${boards[0].id}` : name));
  for (const name of views.slice(1))
    await forward(
      projectRoute(name === "board" ? `board/${boards[0].id}` : name),
    );

  await view("table");
  await page.locator("#search").fill("Blocked");
  await page.waitForFunction(
    () => history.state.preferences.search === "Blocked",
  );
  const tablePreferences = await page.evaluate(
    () => history.state.preferences.tablePreferences,
  );
  const length = await page.evaluate(() => history.length);
  await selectProjectView(page, "table");
  assert.equal(
    await page.evaluate(() => history.length),
    length,
    "Selecting the current page adds no entry",
  );
  await view("kanban");
  await page.locator("#search").fill("Prerequisite");
  await back(projectRoute("table"));
  assert.equal(await page.locator("#search").inputValue(), "Blocked");
  assert.deepEqual(
    await page.evaluate(() => history.state.preferences.tablePreferences),
    tablePreferences,
  );
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.evaluate(() => location.reload()),
  ]);
  await at(projectRoute("table"));
  assert.equal(await page.locator("#search").inputValue(), "Blocked");
  await forward(projectRoute("kanban"));
  assert.equal(await page.locator("#search").inputValue(), "Prerequisite");

  await page.locator("[data-action=project-edit]").click();
  await at(projectRoute("settings/general"));
  await back(projectRoute("kanban"));
  await forward(projectRoute("settings/general"));
  await page.locator("[data-action=settings-close]").click();
  await at(projectRoute("kanban"));
  await page.locator(".directory-link[data-page=people]").click();
  await at(`#organisation/${project.organisation}/people`);
  await page.locator(".directory-link[data-page=teams]").click();
  await at(`#organisation/${project.organisation}/teams`);
  await back(`#organisation/${project.organisation}/people`);
  await back(projectRoute("kanban"));
  await page.locator("[data-action=home]").first().click();
  await at(`#organisation/${project.organisation}/home`);
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.evaluate(() => location.reload()),
  ]);
  await at(`#organisation/${project.organisation}/home`);
  await back(projectRoute("kanban"));
  await page.locator("#organisation-select").selectOption(other.id);
  await at(`#organisation/${other.id}/home`);
  await back(projectRoute("kanban"));
  assert.equal(
    await page.locator("#organisation-select").inputValue(),
    project.organisation,
  );

  await view("board");
  await page.locator("#board-select").selectOption(boards[1].id);
  await at(projectRoute(`board/${boards[1].id}`));
  await back(projectRoute(`board/${boards[0].id}`));
  assert.equal(await page.locator("#board-select").inputValue(), boards[0].id);
  await forward(projectRoute(`board/${boards[1].id}`));
  await clickControl(page.locator("[data-drawing-action=gallery]"));
  await at(projectRoute("board/gallery"));
  await back(projectRoute(`board/${boards[1].id}`));

  // Back/Forward must not replay task edits or discard an invalid open editor.
  await view("list");
  await clickControl(page.locator("[data-action=filters-reset]").first());
  await page
    .locator(`[data-action=task-open][data-id="${blocked.id}"]`)
    .first()
    .click();
  await page.locator("#task-form [name=title]").fill("");
  await page.goBack();
  await page
    .getByText("Finish saving this task before leaving it.", { exact: true })
    .waitFor();
  await at(projectRoute("list"));
  assert.ok(await page.locator("#task-form").isVisible());
  await page.locator("#task-form [name=title]").fill("Saved during Back");
  await back(projectRoute("kanban"));
  assert.equal(await page.locator("#task-form").count(), 0);
  assert.equal(
    (await store.snapshot(project.id)).tasks.find((t) => t.id === blocked.id)
      .title,
    "Saved during Back",
  );

  // Latest destination wins if a second Back arrives during a project request.
  await view("overview");
  await page.locator(`.project-link[data-id="${second.id}"]`).click();
  await at(projectRoute("list", second.id));
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await at(projectRoute("overview"));
  await page.route(`**/api/projects/${second.id}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  const loadingProject = page.waitForRequest((req) =>
    req.url().endsWith(`/api/projects/${second.id}`),
  );
  await page.evaluate(() => history.back());
  await loadingProject;
  await page.evaluate(() => history.back());
  await at(projectRoute("overview"));
  await page.unroute(`**/api/projects/${second.id}`);

  // A missing/inaccessible destination keeps the current page and Forward history.
  await page.locator(`.project-link[data-id="${second.id}"]`).click();
  await at(projectRoute("list", second.id));
  await page.route(`**/api/projects/${project.id}`, (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Project no longer available" }),
    }),
  );
  await page.goBack();
  await page
    .getByText("Project no longer available", { exact: true })
    .waitFor();
  await at(projectRoute("list", second.id));
  await page.unroute(`**/api/projects/${project.id}`);
  await back(projectRoute("overview"));

  // The same routes work with the compact mobile area/layout controls.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await view("kanban");
  await view("capacity");
  await back(projectRoute("kanban"));
  assert.equal(
    await page.locator("#project-view-switcher").inputValue(),
    "tasks",
  );
  await forward(projectRoute("capacity"));
  assert.equal(
    await page.locator("#project-view-switcher").inputValue(),
    "planning",
  );
  // Hash links opened within the app use the same router, including legacy drawings.
  await page.evaluate((hash) => {
    location.hash = hash;
  }, projectRoute("list"));
  await at(projectRoute("list"));
  await back(projectRoute("capacity"));
  await page.goto(`${base}/${projectRoute(`drawing/${boards[0].id}`)}`);
  await at(projectRoute(`board/${boards[0].id}`));
  await page.locator("#canvas").waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: global Back/Forward, drilldown filters, all views, reload/deep links, projects/organisations/directories/settings/canvases, mobile, failed and rapid navigation, task autosave and invalid-editor guard.",
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/pencils-navigation-failure.png" });
  console.log("URL:", page.url());
  console.log("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
}
