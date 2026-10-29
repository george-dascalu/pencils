// AGENTS.md: buttons, fields and menu controls use the shared sizing tokens in
// public/controls.css (32px on desktop, 44px touch targets, 28px inside compact menus
// and in Compact density). Checks the header, toolbar and view-specific controls of
// every project view, the table menus, the card editor, Project settings and Personal
// settings, in light and dark, on desktop, tablet and phone widths, with no page overflow.
import { test, expect, onDevices, useApp } from "../fixtures.mjs";
import { reveal, selectSettingsPage } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Shared controls" });
  await store.createTask(project.id, { title: "Review controls", assignee: "George", priority: "high", start: "2026-10-20", due: "2026-10-24" });
  await store.createDocument(project.id, { title: "Brief", body: "# Project brief\n\nReview **every** view." });
  return { project };
});

const controls = ".button,.icon-button,.tab,.avatar,.project-link,.directory-link,.side-new,.organisation-actions button,.side-label button,.settings-navigation nav a,.task-picker-trigger,.board-menu>summary,.view-layout-switcher,.view-layout-switcher button,.search:has(> input),.selection-action,.board-tools button,.select-menu [role=option],.task-picker-popover [role=option],input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=hidden]),select:not([multiple])";
async function check(page, scope, name, height) {
  const result = await page.locator(scope).locator(controls).evaluateAll((els, expected) =>
    els.filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")
      .map((el) => ({
        name: el.getAttribute("aria-label") || el.id || el.textContent.trim().slice(0, 55),
        height: el.getBoundingClientRect().height,
        expected: expected < 44 && el.closest(".board-menu-panel,.select-menu,.task-picker-popover,.selection-menu > .selection-popover") ? 28 : expected,
      }))
      .filter((el) => Math.abs(el.height - el.expected) > 1), height);
  expect(result, `${name}: page and compact menu controls use shared heights`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const wide = overflow ? await page.locator("#view-content *").evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 15).map((el) => [el.tagName, el.className, el.id, el.getBoundingClientRect().toJSON()])) : [];
  expect(overflow, `${name}: no page overflow ${JSON.stringify(wide)}`).toBe(false);
}
const views = {
  overview: ".project-overview",
  documents: ".documents-workspace",
  list: ".list-group",
  tree: ".tree-wrapper",
  table: ".spreadsheet",
  kanban: ".kanban",
  timeline: ".task-timeline",
  calendar: ".calendar, .calendar-agenda",
  capacity: ".capacity-view",
  board: "#canvas",
};
// The widths the shared sizes were measured at; below 1000px the window has touch.
const sizes = { desktop: { width: 1500, height: 950 }, "ipad-portrait": { width: 768, height: 950 }, phone: { width: 390, height: 950 } };

async function openView(page, view, touch) {
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await page.locator(views[view]).first().waitFor();
  if (touch) await page.waitForFunction(() => document.querySelector(".sidebar").getBoundingClientRect().right <= 1);
}
const write = (page, settings) => page.evaluate((settings) => window.PencilsAppearance.write(settings), settings);

onDevices(Object.keys(sizes), (device) => {
  test.use({ viewportSize: sizes[device] });
  const { width } = sizes[device];
  const touch = width < 1000;
  const height = touch ? 44 : 32;

  for (const view of Object.keys(views)) {
    test(`${view}: header, toolbar and view controls use shared heights in light and dark`, async ({ page }) => {
      await openView(page, view, touch);
      for (const theme of ["light", "dark"]) {
        await write(page, { theme, density: "comfortable" });
        await check(page, ".main > .topbar", `${width} ${view} header ${theme}`, height);
        await check(page, "#view-toolbar", `${width} ${view} toolbar ${theme}`, height);
        if (view === "overview" && !touch) await check(page, ".sidebar", `${width} sidebar`, height);
      }
      if (view === "documents") {
        await check(page, "#document-form", `${width} document editor`, height);
        await expect(page.locator("[data-document-recovery]")).toBeHidden();
      }
      if (view === "board") await check(page, ".board-tools", `${width} board tools`, height);
      if (["timeline", "calendar", "capacity"].includes(view)) await check(page, ".planning-head", `${width} ${view} controls`, height);
    });
  }

  test("table cells, dropdown options and the columns menu use shared heights", async ({ page }) => {
    await openView(page, "table", touch);
    await write(page, { theme: "dark", density: "comfortable" });
    await check(page, ".spreadsheet tbody", `${width} table cells`, height);
    await page.locator(".spreadsheet tbody select").first().click();
    await page.locator("#shared-select-menu").waitFor();
    await check(page, "#shared-select-menu", `${width} dropdown options`, height);
    await page.keyboard.press("Escape");
    await (await reveal(page.locator("#column-list"))).waitFor({ state: "visible" });
    await check(page, ".table-columns-panel", `${width} columns menu`, height);
    await page.keyboard.press("Escape");
  });

  test("table group, sort and filter menus use shared heights in light and dark and start with controls", async ({ page }) => {
    await openView(page, "table", touch);
    await write(page, { density: "comfortable" });
    for (const theme of ["light", "dark"]) {
      await write(page, { theme });
      for (const key of ["groups", "sorts", "filters"]) {
        const menu = page.locator(`[data-board-menu="table-${key}"]`);
        // Phones keep these menus inside View options.
        await reveal(menu);
        await menu.locator("summary").click();
        if (key === "sorts") await menu.locator('[data-table-action="add-sort"]').click();
        await check(page, `[data-board-menu="table-${key}"] .table-menu-panel`, `${width} ${key} menu ${theme}`, height);
        await expect(menu.locator(".table-menu-panel > p"), "Menus start with controls instead of explanatory text").toHaveCount(0);
        if (key === "sorts") await menu.locator('[data-table-action="clear-sorts"]').click();
        await page.keyboard.press("Escape");
      }
    }
  });

  if (!touch)
    test("Compact density gives the toolbar, table and menus 28px controls", async ({ page }) => {
      await openView(page, "table", touch);
      await write(page, { density: "compact" });
      await check(page, "#view-toolbar", `${width} compact toolbar`, 28);
      await check(page, ".spreadsheet tbody", `${width} compact table`, 28);
      await page.locator('[data-board-menu="table-filters"] > summary').click();
      await check(page, '[data-board-menu="table-filters"] .table-menu-panel', `${width} compact density menu`, 28);
      await page.keyboard.press("Escape");
    });

  test("the card editor and its priority options use shared heights", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/list`);
    await page.locator(width <= 600 ? ".phone-task-open" : ".task-row > .task-id").first().click();
    await page.locator("#task-form").waitFor();
    await check(page, "#task-form", `${width} task editor`, height);
    await page.locator("#task-form [data-task-picker=priority] .task-picker-trigger").click();
    await page.locator(".task-picker-popover:not([hidden])").waitFor();
    await check(page, ".task-picker-popover", `${width} priority options`, height);
    await page.keyboard.press("Escape");
  });

  test("Project settings and Personal settings use shared heights", async ({ page }) => {
    await page.goto(`${app.base}/#project/${app.project.id}/settings/general`);
    await page.locator("[data-settings-form]").waitFor();
    await check(page, "#view-content", `${width} project settings`, height);
    // Since 0.19.31 Personal settings is the "You" section of the same Settings page.
    await selectSettingsPage(page, "personal");
    await page.locator("[name=personal-density]").waitFor();
    await check(page, "#view-content", `${width} personal settings`, height);
  });
});
