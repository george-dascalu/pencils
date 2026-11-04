// The seeded project and helpers the Table tools specs share (table-tools.spec.mjs and
// table-tools-filters.spec.mjs, split so each runs in its own worker, F0.22-6).
import { DEFAULT_SCHEMA } from "../../server/model.js";

export async function seedTable(store) {
  const project = await store.createProject({
    title: "Sheets-style table",
    schema: { ...DEFAULT_SCHEMA, fields: [{ id: "points", name: "Points", type: "number" }, { id: "team", name: "Team", type: "select", options: ["Design", "Build"] }] },
  });
  const seeded = [];
  for (let i = 0; i < 110; i++)
    seeded.push(await store.createTask(project.id, {
      title: i === 104 ? "Needle after page one" : `Task ${i}`,
      assignee: i === 104 || i % 3 === 0 ? "Alice" : i % 3 === 1 ? "Bob" : "",
      priority: i % 2 ? "low" : "high",
      status: i % 2 ? "todo" : "done",
      due: i % 3 === 2 ? null : "2026-10-20",
      fields: { points: i, team: i % 2 ? "Design" : "Build" },
    }));
  return { project, seeded };
}

export function tableHelpers(app) {
  const rows = (page) => page.locator("[data-table-task]");
  const columnMenu = (page, key) => page.locator(`.spreadsheet th[data-column-key="${key}"] .table-header-menu`);
  const groupBy = (page) => page.getByLabel("Group table by", { exact: true });
  const thenBy = (page) => page.getByLabel("Then group by", { exact: true });
  async function menu(page, key) {
    await page.waitForFunction(() => innerWidth > 600 || document.querySelector(".mobile-view-options .table-view-tools"));
    const m = page.locator(`[data-board-menu="table-${key}"]`);
    const options = m.locator('xpath=ancestor::details[contains(@class,"mobile-view-options")]');
    if ((await options.count()) && !(await options.evaluate((el) => el.open))) await options.locator(":scope > summary").click();
    if (!(await m.evaluate((el) => el.open))) await m.locator(":scope > summary").click();
    return m;
  }
  return {
    rows,
    columnMenu,
    groupBy,
    thenBy,
    menu,
    firstTitle: (page) => rows(page).first().locator('[data-task-field="title"]'),
    snap: () => app.store.snapshot(app.project.id),
    action: (page, key, name) => columnMenu(page, key).locator(`[data-table-column-action="${name}"]`),
    background: (locator) => locator.evaluate((node) => getComputedStyle(node).backgroundColor),
    resetGrouping: (page) => page.getByRole("button", { name: "Reset grouping", exact: true }),
    columnWidths: (page) => page.locator("th[data-column-key]").evaluateAll((els) => els.map((el) => [el.dataset.columnKey, el.getBoundingClientRect().width])),
    reset: (page) => page.locator('[data-table-action="reset"]').click(),
    async open(page) {
      await page.goto(`${app.base}/#project/${app.project.id}/table`);
      await rows(page).first().waitFor();
    },
    async addFilter(page, field) {
      await menu(page, "filters");
      await page.getByLabel("Add column filter", { exact: true }).selectOption(field);
    },
    async chooseValue(page, name, value) {
      await menu(page, "filters");
      await page.locator(".table-filter-rule").filter({ has: page.locator("legend", { hasText: name }) }).locator(`input[type=checkbox][value="${value}"]`).check();
    },
    async groupByAssigneeThen(page, second) {
      await menu(page, "groups");
      await groupBy(page).selectOption("assignee");
      await thenBy(page).selectOption(second);
    },
  };
}
