import { selectSettingsPage } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { reveal, clickControl, selectProjectView } from "./menu-controls.mjs";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-header-"));
const store = new Store(root);
await store.init();
const project = await store.demo();
for (let i = 0; i < 24; i++)
  await store.createTask(project.id, { title: `Extra task ${i}` });
const otherProject = await store.createProject({ title: "Other layouts" });
await store.updateProject(otherProject.id, {
  revision: otherProject.revision,
  default_view: "tree",
});
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await { chromium, firefox, webkit }[
  process.env.BROWSER || "chromium"
].launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function boxOf(selector) {
  const handle = await page.waitForFunction((selector) => {
    const box = document.querySelector(selector)?.getBoundingClientRect();
    return box?.width && box.height ? box.toJSON() : false;
  }, selector);
  return handle.jsonValue();
}
try {
  await page.goto(base);
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  assert.deepEqual(
    await page
      .locator(".view-tab-group")
      .evaluateAll((groups) =>
        groups.map((g) =>
          [...g.querySelectorAll("[data-view]")].map((el) => el.dataset.view),
        ),
      ),
    [["overview"], ["documents"], ["planning"], ["tasks"], ["board"]],
  );
  // One navigation tab owns all task layouts, with shared filters and keyboard access.
  await selectProjectView(page, "table");
  assert.equal(
    await page.locator('.tabs [aria-current="page"]').getAttribute("data-view"),
    "tasks",
  );
  assert.equal(
    await page
      .locator(
        ".tabs [data-view=table],.tabs [data-view=list],.tabs [data-view=tree]",
      )
      .count(),
    0,
  );
  await page.locator("#search").fill("Extra task 5");
  const tree = page.locator('.task-view-switcher [data-view="tree"]');
  await tree.focus();
  await page.keyboard.press("Enter");
  assert.equal(await tree.getAttribute("aria-pressed"), "true");
  assert.equal(
    await tree.evaluate((el) => el === document.activeElement),
    true,
  );
  assert.equal(await page.locator("#search").inputValue(), "Extra task 5");
  await selectProjectView(page, "table");
  assert.equal(await page.locator("[data-table-task]").count(), 1);
  await page.locator("#search").fill("");
  await selectProjectView(page, "board");
  await page.locator('.tabs [data-view="tasks"]').click();
  assert.equal(
    await page
      .locator('.task-view-switcher [aria-pressed="true"]')
      .getAttribute("data-view"),
    "table",
  );
  await selectProjectView(page, "capacity");
  await selectProjectView(page, "board");
  await page.reload();
  await page.locator('.tabs [data-view="planning"]').click();
  assert.equal(
    await page
      .locator('.planning-view-switcher [aria-pressed="true"]')
      .getAttribute("data-view"),
    "capacity",
  );
  const calendar = page.locator(
    '.planning-view-switcher [data-view="calendar"]',
  );
  await calendar.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await calendar.evaluate((el) => el === document.activeElement),
    true,
  );
  await selectProjectView(page, "table");
  // Each project remembers its own layout, including across reloads.
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await page.locator(`.project-link[data-id="${otherProject.id}"]`).click();
  await page
    .locator(`.project-link.active[data-id="${otherProject.id}"]`)
    .waitFor();
  assert.equal(
    await page
      .locator('.task-view-switcher [aria-pressed="true"]')
      .getAttribute("data-view"),
    "tree",
  );
  await selectProjectView(page, "list");
  await selectProjectView(page, "board");
  await page.reload();
  await page.locator('.tabs [data-view="tasks"]').click();
  assert.equal(
    await page
      .locator('.task-view-switcher [aria-pressed="true"]')
      .getAttribute("data-view"),
    "list",
  );
  await page.locator(`.project-link[data-id="${project.id}"]`).click();
  await page.locator(`.project-link.active[data-id="${project.id}"]`).waitFor();
  assert.equal(
    await page
      .locator('.task-view-switcher [aria-pressed="true"]')
      .getAttribute("data-view"),
    "table",
  );
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await selectProjectView(page, "board");
  await page.keyboard.press("Control+k");
  await page.locator('[data-command="view-tree"]').click();
  assert.equal(
    await page
      .locator('.task-view-switcher [aria-pressed="true"]')
      .getAttribute("data-view"),
    "tree",
  );
  const views = [
    "overview",
    "list",
    "tree",
    "table",
    "kanban",
    "board",
    "calendar",
    "timeline",
    "capacity",
  ];
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    let header;
    for (const view of views) {
      await selectProjectView(page, view);
      // The initial presence snapshot can refresh the board and close its menus.
      if (view === "board") await page.waitForTimeout(1500);
      const taskLayout = ["list", "tree", "table", "kanban"].includes(view);
      assert.equal(
        await page.locator(".task-view-switcher").count(),
        taskLayout ? 1 : 0,
      );
      assert.equal(
        await page.locator("#project-view-switcher").inputValue(),
        taskLayout
          ? "tasks"
          : ["calendar", "timeline", "capacity"].includes(view)
            ? "planning"
            : view,
      );
      const planningLayout = ["calendar", "timeline", "capacity"].includes(
        view,
      );
      assert.equal(
        await page.locator(".planning-view-switcher").count(),
        planningLayout ? 1 : 0,
      );
      if (taskLayout || planningLayout) {
        assert.equal(
          await page
            .locator('.view-layout-switcher [aria-pressed="true"]')
            .getAttribute("data-view"),
          view,
        );
        const switcher = await boxOf(".view-layout-switcher");
        assert.ok(switcher.x >= 0 && switcher.x + switcher.width <= size.width);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      const box = await boxOf(".topbar");
      const actions = await boxOf("#board-project-tools");
      const tabs = await page.locator(".tabs .tab").evaluateAll((buttons) =>
        buttons.map((button) => ({
          view: button.dataset.view,
          rect: button.getBoundingClientRect().toJSON(),
        })),
      );
      header ||= { box, actions, tabs };
      assert.deepEqual(box, header.box, `${view}: shared top bar`);
      assert.deepEqual(tabs, header.tabs, `${view}: project tabs stay in place`);
      assert.deepEqual(
        actions,
        header.actions,
        `${view}: shared project actions`,
      );
      assert.ok(await page.locator(".hero").isHidden());
      assert.equal(await page.locator("[data-action=project-edit]").count(), 1);
      await page.locator("#view-content").waitFor({ state: "visible" });
      const content = await boxOf("#view-content");
      assert.ok(content.height > 0, `${view}: content has a visible box`);
      assert.ok(
        content.y < (size.width > 600 ? 160 : 350),
        `${view}: content starts at ${content.y}`,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${view}: horizontal overflow`,
      );
      assert.equal(await page.locator('[data-board-menu="project"]').count(), 0);
      assert.equal(await page.locator('.topbar [data-action="task-new"]').count(), 1);
      assert.equal(await page.locator('.topbar .top-actions [data-action="project-edit"]').count(), 1);
      assert.equal(await page.locator('.topbar .tabs').count(), 1);
      const create = await boxOf('[data-action="task-new"]');
      const settings = await boxOf('[data-action="project-edit"]');
      if (size.width > 1150) {
        assert.ok(Math.abs(actions.x + actions.width / 2 - (box.x + box.width / 2)) < 1,
          "Project navigation, including New task, is centred in the header");
        const breadcrumb = await boxOf(".breadcrumb");
        const topActions = await boxOf(".top-actions");
        assert.ok(breadcrumb.right <= actions.left && actions.right <= topActions.left,
          "Project navigation fits between the breadcrumb and version controls");
        const nav = await boxOf('.tabs');
        assert.ok(create.x >= nav.right && create.y >= box.y && create.bottom <= box.bottom, "New task follows the navigation in the top row");
        assert.ok(settings.x >= actions.right, "Project settings is on the right");
      }
      await reveal(page.locator('#saved-view'));
      assert.ok(await page.locator('#saved-view').isVisible(), `${view}: saved views remain accessible`);
      await page.keyboard.press('Escape');
      if (!["board", "drawing", "overview"].includes(view)) {
        const taskLayout = ["list", "tree", "table", "kanban", "timeline"].includes(view);
        await (
          await reveal(page.locator("#filter-assignee"))
        ).fill("No matching owner");
        await page.locator("#filter-assignee").press("Tab");
        await page.waitForFunction((taskLayout) => taskLayout
          ? !document.querySelector("#view-content .task-row,#view-content .kanban-card,#view-content [data-table-task],#view-content [data-timeline-row]")
          : document.querySelector(".view-footnote")?.textContent.trim().startsWith("0 matching of"), taskLayout);
        if (taskLayout) assert.equal(await page.locator(".view-footnote,.table-result-summary").count(), 0);
        assert.match(
          await page
            .locator("[data-board-menu=filters] > summary")
            .textContent(),
          /Filters \(1\)/,
        );
        await page.keyboard.press("Escape");
        await (await reveal(page.locator("#filter-assignee"))).fill("");
        await page.locator("#filter-assignee").press("Tab");
        await page.waitForFunction((taskLayout) => taskLayout
          ? document.querySelector("#view-content .task-row,#view-content .kanban-card,#view-content [data-table-task],#view-content [data-timeline-row]")
          : !document.querySelector(".view-footnote")?.textContent.trim().startsWith("0 matching of"), taskLayout);
        await page.keyboard.press("Escape");
      }
      await page.screenshot({
        path: `/tmp/pencils-header-${size.width}-${view}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await selectProjectView(page, "list");
  await page.locator(".task-row").last().scrollIntoViewIfNeeded();
  assert.ok(
    await page.locator(".task-row").last().isVisible(),
    "Long views remain scrollable",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-action="project-edit"]').click();
  for (const section of ["workflow", "import", "sources", "automation"])
    assert.ok(await page.locator(`.settings-navigation [data-settings-section="${section}"]`).isVisible());
  assert.equal(await page.locator('.settings-navigation [data-feature="templates"]').count(), 0);
  await selectSettingsPage(page, "workflow");
  await page.locator("#workflow-form").waitFor();
  await selectProjectView(page, "table");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => document.documentElement.dataset.theme = theme, theme);
    const colours = await page.locator('.spreadsheet thead th').evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).backgroundColor));
    assert.equal(new Set(colours).size, 1, `${theme}: all column headers have the same colour`);
    await page.screenshot({ path: `/tmp/pencils-topbar-${theme}.png` });
  }
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  for (const width of [1920, 1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const left = await boxOf('.breadcrumb'), middle = await boxOf('#board-project-tools'), right = await boxOf('.top-actions');
    if (width > 1400) {
      assert.ok(left.right <= middle.left && middle.right <= right.left, `${width}: header columns never overlap with sidebar open`);
    } else assert.ok(left.right <= right.left, `${width}: breadcrumb and actions never overlap`);
    const headerBox = await boxOf('.topbar');
    assert.ok(Math.abs(middle.x + middle.width / 2 - headerBox.x - headerBox.width / 2) < 1,
      `${width}: navigation stays centred with the sidebar open`);
    assert.ok(right.right <= width && middle.right <= width);
    await page.screenshot({ path: `/tmp/pencils-topbar-expanded-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press("Control+k");
  await page.locator('#global-search-input').fill('Quick capture');
  await page.locator('[data-command="quick-capture"]').click();
  await page.locator('#quick-capture input').fill('Quick capture still available');
  await page.locator('#quick-capture [type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('#quick-capture input')?.value === '');
  assert.ok((await store.snapshot(project.id)).tasks.some((task) => task.title === 'Quick capture still available'));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: unified Tasks tab, per-project layout memory, keyboard selection, shared filters, and consistent desktop/mobile navigation across all nine views",
  );
} catch (e) {
  console.error(
    await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ".toolbar,.toolbar-left,.toolbar-right,.shared-query-controls,.toolbar select,.toolbar input",
        ),
      ].map((el) => ({
        tag: el.tagName,
        id: el.id,
        classes: el.className,
        rect: el.getBoundingClientRect().toJSON(),
        height: getComputedStyle(el).minHeight,
        padding: getComputedStyle(el).padding,
      })),
    ),
  );
  await page.screenshot({
    path: "/tmp/pencils-project-layout-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
