// Visibility review: large projects stay complete in every view. Timeline pages 200 tasks at a
// time with unplanned tasks on the last page, Kanban counts every task in a column and shows the
// rest on request, changes from another client appear live, Tree search keeps ancestors as
// context, and at phone width the Calendar agenda, Overview metric queries, the command palette
// and Table keyboard editing, paste preview and the non-modal card panel all work.
import { test, expect, useApp } from "../fixtures.mjs";
import { clickControl, reveal, selectProjectView } from "../helpers/menu-controls.mjs";

const app = useApp(async (store) => {
  const project = await store.createProject({ title: "Visibility regression" });
  const records = [];
  for (let i = 0; i < 205; i++)
    records.push(await store.createTask(project.id, { title: i === 0 ? "needle child" : `Task ${i}`, start: "2026-10-01", due: "2026-10-20", status: i < 103 ? "todo" : "done" }));
  const parent = await store.createTask(project.id, { title: "Parent context" });
  await store.updateTask(project.id, records[0].id, { parent: parent.id, revision: records[0].revision });
  return { project, records };
});

async function open(page) {
  await page.goto(`${app.base}/#project/${app.project.id}/list`);
  await page.locator(".task-row").first().waitFor();
}

test("Timeline pages 200 tasks at a time and lists unplanned tasks on the last page", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await selectProjectView(page, "timeline");
  await page.locator(".timeline-row").first().waitFor();
  await expect(page.locator(".timeline-row")).toHaveCount(200);
  await expect(page.locator(".timeline-page-summary")).toHaveText(/Page 1 of 2 · 206 tasks/);
  await page.getByRole("button", { name: "Next tasks", exact: true }).click();
  await expect(page.locator(".timeline-row")).toHaveCount(6);
  await expect(page.locator(".timeline-unplanned")).toHaveCount(1);
});

test("Kanban counts every task in a column, shows the rest on request, and picks up changes from another client", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await selectProjectView(page, "kanban");
  await expect(page.locator('[data-drop-status="done"] .column-header')).toHaveText(/102/);
  await expect(page.locator('[data-drop-status="done"] .kanban-card')).toHaveCount(100);
  await page.locator('[data-kanban-more="done"]').click();
  await expect(page.locator('[data-drop-status="done"] .kanban-card')).toHaveCount(102);
  const { records } = app;
  await app.store.updateTask(app.project.id, records[1].id, { title: "Updated from another client", revision: records[1].revision });
  await expect(page.getByRole("button", { name: "Updated from another client", exact: true })).toBeVisible();
});

test("Tree search keeps the matching task's parent as context until the filters are reset", { tag: "@gate" }, async ({ page }) => {
  await open(page);
  await selectProjectView(page, "tree");
  await page.locator("#search").fill("needle");
  await expect(page.locator(".tree-row")).toHaveCount(2);
  await expect(page.locator(".tree-context .task-title")).toHaveValue(/Parent context/);
  await clickControl(page.locator('[data-action="filters-reset"]').first());
  await expect(page.locator("#search")).toHaveValue("");
});

test.describe("phone width", () => {
  test.use({ viewportSize: { width: 390, height: 844 } });

  test("the Calendar agenda lists scheduled and unscheduled tasks", { tag: "@gate" }, async ({ page }) => {
    await open(page);
    await selectProjectView(page, "calendar");
    // On phones, planning options sit in the shared View options panel.
    await (await reveal(page.locator("#calendar-mode"))).selectOption("agenda");
    await expect(page.locator(".calendar-agenda")).toHaveCount(1);
    await expect(page.locator(".calendar-unscheduled")).toHaveCount(1);
  });

  test("an Overview metric opens its tasks in the list, paged", { tag: "@gate" }, async ({ page }) => {
    await open(page);
    // Since 0.19.26 phones switch views with the drawer's view tiles.
    await selectProjectView(page, "overview");
    await page.locator('[data-query="done"]').click();
    await expect(page.locator("#filter-completion")).toHaveValue("done");
    await expect(page.locator(".task-row")).toHaveCount(100);
    await expect(page.locator("#pagination")).toHaveText(/Page 1 of 2/);
  });

  test("the command palette opens Table, where keyboard editing, paste preview and the card panel work", { tag: "@gate" }, async ({ page }) => {
    await open(page);
    await page.keyboard.press("Control+k");
    await page.locator("#global-search-input").fill("open table");
    await page.getByRole("button", { name: "Open Table view", exact: true }).click();
    await expect(page.locator(".spreadsheet")).toHaveCount(1);
    // Since 0.18.26 phone Table puts the title first (column 0) and the ID next to it, so
    // navigate from the ID cell back to the title.
    await page.locator('[data-cell="0,1"]').focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('[data-cell="0,0"]')).toBeFocused();
    await page.keyboard.press("Enter");
    const title = page.locator('[data-cell="0,0"] input');
    const before = await title.inputValue();
    await title.fill("Discard this edit");
    await page.keyboard.press("Escape");
    await expect(title).toHaveValue(before);
    await page.keyboard.press("Enter");
    await title.evaluate((el) => {
      const e = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(e, "clipboardData", { value: { getData: () => "New title\tDescription\tinvalid-type" } });
      el.dispatchEvent(e);
    });
    await expect(page.locator("#paste-apply")).toBeDisabled();
    await page.locator("#paste-cancel").click();
    // On phones the ID in the title line opens the card; the separate open button is hidden
    // (public/project-layout.css, phone Table).
    await page.locator("[data-table-task] .phone-table-key").first().click();
    const editor = page.locator(".project-task-editor");
    await editor.waitFor();
    expect(await editor.evaluate((el) => el.matches(":modal"))).toBe(false);
    const panel = await editor.boundingBox();
    expect(panel.x >= 0 && panel.x + panel.width <= 391, "the card panel fits the phone").toBe(true);
    await page.locator('[data-action="dialog-close"]').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  });
});
