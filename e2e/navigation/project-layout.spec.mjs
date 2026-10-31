// Project layout (AGENTS.md, Consistency): one Tasks tab owns the List, Tree, Table and Kanban
// layouts and one Planning tab owns Calendar, Timeline and Capacity, with shared filters,
// keyboard selection and a layout remembered per project. Every view shares the same top bar,
// tabs and project actions on desktop and phone widths, and the header columns never overlap.
// Part of the cross-browser release gate.
import { test, expect, useApp } from "../fixtures.mjs";
import { reveal, selectProjectView, selectSettingsPage, openSettingsPage, chooseProject } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.demo();
  for (let i = 0; i < 24; i++) await store.createTask(project.id, { title: `Extra task ${i}` });
  const otherProject = await store.createProject({ title: "Other layouts" });
  await store.updateProject(otherProject.id, { revision: otherProject.revision, default_view: "tree" });
  return { project, otherProject };
});

const openProject = async (page) => {
  await page.goto(app.base);
  await chooseProject(page, app.project.id);
  await expect(page.locator('.topbar [role="heading"]')).toHaveText(app.project.title);
};
const pressedTaskLayout = (page) => page.locator('.task-view-switcher [aria-pressed="true"]');
async function boxOf(page, selector) {
  const handle = await page.waitForFunction((selector) => {
    const box = document.querySelector(selector)?.getBoundingClientRect();
    return box?.width && box.height ? box.toJSON() : false;
  }, selector);
  return handle.jsonValue();
}
// The first presence heartbeat on a board can refresh it and close its menus. Heartbeats never
// overlap, so once a second one has answered, that refresh is over.
async function boardSettled(page) {
  for (let i = 0; i < 2; i++) await page.waitForResponse((r) => r.url().endsWith("/presence") && r.request().method() === "POST");
}

test("one Tasks tab owns every task layout, with shared search and keyboard selection", { tag: "@gate" }, async ({ page }) => {
  await openProject(page);
  expect(await page.locator(".view-tab-group").evaluateAll((groups) => groups.map((g) => [...g.querySelectorAll("[data-view]")].map((el) => el.dataset.view))))
    .toEqual([["overview"], ["documents"], ["planning"], ["tasks"], ["board"]]);
  await selectProjectView(page, "table");
  await expect(page.locator('.tabs [aria-current="page"]')).toHaveAttribute("data-view", "tasks");
  await expect(page.locator(".tabs [data-view=table],.tabs [data-view=list],.tabs [data-view=tree]")).toHaveCount(0);
  await page.locator("#search").fill("Extra task 5");
  const tree = page.locator('.task-view-switcher [data-view="tree"]');
  await tree.focus();
  await page.keyboard.press("Enter");
  await expect(tree).toHaveAttribute("aria-pressed", "true");
  await expect(tree).toBeFocused();
  await expect(page.locator("#search")).toHaveValue("Extra task 5");
  await selectProjectView(page, "table");
  await expect(page.locator("[data-table-task]")).toHaveCount(1);
  await page.locator("#search").fill("");
  await selectProjectView(page, "board");
  await page.locator('.tabs [data-view="tasks"]').click();
  await expect(pressedTaskLayout(page)).toHaveAttribute("data-view", "table");
  // The Planning tab remembers its layout too, across reloads.
  await selectProjectView(page, "capacity");
  await selectProjectView(page, "board");
  await page.reload();
  await page.locator('.tabs [data-view="planning"]').click();
  await expect(page.locator('.planning-view-switcher [aria-pressed="true"]')).toHaveAttribute("data-view", "capacity");
  const calendar = page.locator('.planning-view-switcher [data-view="calendar"]');
  await calendar.focus();
  await page.keyboard.press("Enter");
  await expect(calendar).toBeFocused();
});

test("each project remembers its own layout, including across reloads", { tag: "@gate" }, async ({ page }) => {
  await openProject(page);
  await selectProjectView(page, "table");
  await chooseProject(page, app.otherProject.id);
  await expect(page.locator('.topbar [role="heading"]')).toHaveText(app.otherProject.title);
  await expect(pressedTaskLayout(page)).toHaveAttribute("data-view", "tree");
  await selectProjectView(page, "list");
  await selectProjectView(page, "board");
  await page.reload();
  await page.locator('.tabs [data-view="tasks"]').click();
  await expect(pressedTaskLayout(page)).toHaveAttribute("data-view", "list");
  await chooseProject(page, app.project.id);
  await expect(page.locator('.topbar [role="heading"]')).toHaveText(app.project.title);
  await expect(pressedTaskLayout(page)).toHaveAttribute("data-view", "table");
  // The command palette switches layouts as well.
  await selectProjectView(page, "board");
  await page.keyboard.press("Control+k");
  await page.locator('[data-command="view-tree"]').click();
  await expect(pressedTaskLayout(page)).toHaveAttribute("data-view", "tree");
});

const views = ["overview", "list", "tree", "table", "kanban", "board", "calendar", "timeline", "capacity"];
async function everyViewSharesTheHeader(page, size) {
  let header;
  for (const view of views) {
    await selectProjectView(page, view);
    if (view === "board") await boardSettled(page);
    const taskLayout = ["list", "tree", "table", "kanban"].includes(view);
    const planningLayout = ["calendar", "timeline", "capacity"].includes(view);
    await expect(page.locator(".task-view-switcher")).toHaveCount(taskLayout ? 1 : 0);
    await expect(page.locator("#project-view-switcher")).toHaveValue(taskLayout ? "tasks" : planningLayout ? "planning" : view);
    await expect(page.locator(".planning-view-switcher")).toHaveCount(planningLayout ? 1 : 0);
    if (taskLayout || planningLayout) {
      await expect(page.locator('.view-layout-switcher [aria-pressed="true"]')).toHaveAttribute("data-view", view);
      if (size.width > 600) {
        const switcher = await boxOf(page, ".view-layout-switcher");
        expect(switcher.x >= 0 && switcher.x + switcher.width <= size.width).toBe(true);
      } else await expect(page.locator(".layout-tray .view-layout-switcher"), "phones switch layouts from the bottom bar's tray (0.19.37)").toHaveCount(1);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = await boxOf(page, ".topbar");
    const actions = await boxOf(page, size.width > 600 ? "#board-project-tools" : ".phone-new-task");
    const tabs = await page.locator(".tabs .tab").evaluateAll((buttons) => buttons.map((button) => ({ view: button.dataset.view, rect: button.getBoundingClientRect().toJSON() })));
    header ||= { box, actions, tabs };
    expect(box, `${view}: shared top bar`).toEqual(header.box);
    expect(tabs, `${view}: project tabs stay in place`).toEqual(header.tabs);
    expect(actions, `${view}: shared project actions`).toEqual(header.actions);
    await expect(page.locator(".hero")).toBeHidden();
    // Since 0.19.31 one Settings button replaces the project gear and the avatar.
    await expect(page.locator(".sidebar [data-action=settings]")).toHaveCount(1);
    await page.locator("#view-content").waitFor({ state: "visible" });
    const content = await boxOf(page, "#view-content");
    expect(content.height, `${view}: content has a visible box`).toBeGreaterThan(0);
    expect(content.y, `${view}: content starts at ${content.y}`).toBeLessThan(size.width > 600 ? 160 : 350);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view}: horizontal overflow`).toBe(true);
    await expect(page.locator('[data-board-menu="project"]')).toHaveCount(0);
    await expect(page.locator(".topbar .new-menu > summary:visible")).toHaveCount(1);
    await expect(page.locator('.topbar [data-action="settings"]'), "Settings is at the bottom of the sidebar (0.20.24)").toHaveCount(0);
    await expect(page.locator(".topbar .tabs")).toHaveCount(1);
    const create = await boxOf(page, size.width > 600 ? "#board-project-tools .new-menu > summary" : ".phone-new-task");
    if (size.width > 1150) {
      expect(Math.abs(actions.x + actions.width / 2 - (box.x + box.width / 2)), "Project navigation, including New task, is centred in the header").toBeLessThan(1);
      const breadcrumb = await boxOf(page, ".breadcrumb");
      expect(breadcrumb.right <= actions.left && actions.right <= box.right, "Project navigation fits between the breadcrumb and the header's end").toBe(true);
      const nav = await boxOf(page, ".tabs");
      expect(create.x >= nav.right && create.y >= box.y && create.bottom <= box.bottom, "New task follows the navigation in the top row").toBe(true);
    }
    // Since 0.20.70 no view, Board included, has saved views.
    await expect(page.locator('#saved-view,[data-feature="view-save"],[data-feature="view-save-as"],[data-feature="view-delete"]'), `${view}: no saved-view controls`).toHaveCount(0);
    if (!["board", "drawing", "overview"].includes(view)) {
      const rows = "#view-content .task-row,#view-content .kanban-card,#view-content [data-table-task],#view-content [data-timeline-row],#view-content [data-calendar-card],#view-content .capacity-task";
      await (await reveal(page.locator("#filter-assignee"))).fill("No matching owner");
      await page.locator("#filter-assignee").press("Tab");
      await page.waitForFunction((rows) => !document.querySelector(rows), rows);
      await expect(page.locator(".view-footnote,.table-result-summary")).toHaveCount(0);
      await expect(page.locator("[data-board-menu=filters] > summary")).toHaveAttribute("aria-label", "Filters (1 active)");
      await page.keyboard.press("Escape");
      await (await reveal(page.locator("#filter-assignee"))).fill("");
      await page.locator("#filter-assignee").press("Tab");
      await page.waitForFunction((rows) => !!document.querySelector(rows), rows);
      await expect(page.locator(".view-footnote,.table-result-summary")).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
  }
}

test("all nine views share the top bar, tabs, actions and filters on desktop", { tag: "@gate" }, async ({ page }) => {
  await openProject(page);
  await everyViewSharesTheHeader(page, page.viewportSize());
});

test.describe("phone width", () => {
  test.use({ viewportSize: { width: 390, height: 844 } });
  test("all nine views share the top bar, tabs, actions and filters at phone width", { tag: "@gate" }, async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/overview`);
    await page.locator(".project-overview").waitFor();
    await everyViewSharesTheHeader(page, page.viewportSize());
  });
});

test("long views scroll, settings lists its sections and table headers share one colour", { tag: "@gate" }, async ({ page }) => {
  await openProject(page);
  await selectProjectView(page, "list");
  await page.locator(".task-row").last().scrollIntoViewIfNeeded();
  await expect(page.locator(".task-row").last(), "Long views remain scrollable").toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await openSettingsPage(page);
  for (const section of ["workflow", "import", "sources", "automation"]) await expect(page.locator(`.settings-navigation [data-settings-section="${section}"]`)).toBeVisible();
  await expect(page.locator('.settings-navigation [data-feature="templates"]')).toHaveCount(0);
  await selectSettingsPage(page, "workflow");
  await page.locator("#workflow-form").waitFor();
  await selectProjectView(page, "table");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    const colours = await page.locator(".spreadsheet thead th").evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).backgroundColor));
    expect(new Set(colours).size, `${theme}: all column headers have the same colour`).toBe(1);
  }
});

// The sidebar opens over the page (0.20.24), so it never narrows the header.
test("header columns never overlap at any width", { tag: "@gate" }, async ({ page }) => {
  await openProject(page);
  await selectProjectView(page, "table");
  for (const width of [1920, 1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const left = await boxOf(page, ".breadcrumb"), middle = await boxOf(page, width <= 600 ? ".phone-new-task" : "#board-project-tools");
    expect(left.right, `${width}: breadcrumb and navigation never overlap`).toBeLessThanOrEqual(middle.left);
    const headerBox = await boxOf(page, ".topbar");
    if (width > 600) expect(Math.abs(middle.x + middle.width / 2 - headerBox.x - headerBox.width / 2), `${width}: navigation stays centred`).toBeLessThan(1);
    expect(middle.right).toBeLessThanOrEqual(width);
  }
});

test("quick capture stays available from the command palette", { tag: "@gate" }, async ({ page }) => {
  await openProject(page);
  await selectProjectView(page, "table");
  await page.keyboard.press("Control+k");
  await page.locator("#global-search-input").fill("Quick capture");
  await page.locator('[data-command="quick-capture"]').click();
  await page.locator("#quick-capture input").fill("Quick capture still available");
  await page.locator('#quick-capture [type="submit"]').click();
  await expect(page.locator("#quick-capture input")).toHaveValue("");
  expect((await app.store.snapshot(app.project.id)).tasks.some((task) => task.title === "Quick capture still available")).toBe(true);
});
