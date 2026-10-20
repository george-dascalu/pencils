import { clickControl, reveal, selectProjectView } from "./menu-controls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { DEFAULT_SCHEMA } from "../server/model.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-table-tools-"));
const store = new Store(root);
await store.init();
const project = await store.createProject({
  title: "Sheets-style table",
  schema: {
    ...DEFAULT_SCHEMA,
    fields: [
      { id: "points", name: "Points", type: "number" },
      {
        id: "team",
        name: "Team",
        type: "select",
        options: ["Design", "Build"],
      },
    ],
  },
});
const seeded = [];
for (let i = 0; i < 110; i++)
  seeded.push(
    await store.createTask(project.id, {
      title: i === 104 ? "Needle after page one" : `Task ${i}`,
      assignee: i === 104 || i % 3 === 0 ? "Alice" : i % 3 === 1 ? "Bob" : "",
      priority: i % 2 ? "low" : "high",
      status: i % 2 ? "todo" : "done",
      due: i % 3 === 2 ? null : "2026-10-20",
      fields: { points: i, team: i % 2 ? "Design" : "Build" },
    }),
  );
const server = createServer(store);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await (
  ({chromium,firefox,webkit}[process.env.BROWSER || "chromium"])
).launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const rows = () => page.locator("[data-table-task]");
const snap = () => store.snapshot(project.id);
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await page.waitForTimeout(60);
  }
  throw Error("Timed out");
}
async function menu(key) {
  const m = page.locator(`[data-board-menu="table-${key}"]`);
  const options = m.locator('xpath=ancestor::details[contains(@class,"mobile-view-options")]');
  if ((await options.count()) && !(await options.evaluate((el) => el.open)))
    await options.locator(":scope > summary").click();
  if (!(await m.evaluate((e) => e.open)))
    await m.locator(":scope > summary").click();
  return m;
}
async function addFilter(field) {
  await menu("filters");
  await page
    .getByLabel("Add column filter", { exact: true })
    .selectOption(field);
}
async function chooseValue(name, value) {
  await menu("filters");
  await page
    .locator(".table-filter-rule")
    .filter({ has: page.locator("legend", { hasText: name }) })
    .locator(`input[type=checkbox][value="${value}"]`)
    .check();
}
async function reset() {
  await page.locator('[data-table-action="reset"]').click();
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator(".project-link").click();
  await selectProjectView(page, "table");
  await rows().first().waitFor();
  assert.equal(await rows().count(), 100);
  assert.match(
    await page.locator(".pagination").textContent(),
    /Page 1 of 2/,
  );
  // Column actions share real feedback and keep keyboard focus across redraws.
  const columnMenu = (key, p = page) => p.locator(`.spreadsheet th[data-column-key="${key}"] .table-header-menu`);
  const action = (key, name, p = page) => columnMenu(key, p).locator(`[data-table-column-action="${name}"]`);
  const background = (el) => el.evaluate((node) => getComputedStyle(node).backgroundColor);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => window.PencilsAppearance.write({ theme }), theme);
    const trigger = columnMenu("title").locator('summary');
    await trigger.click();
    await page.mouse.move(2, 2);
    const ascending = action("title", "asc");
    const resting = await background(ascending);
    await ascending.hover();
    await page.waitForTimeout(100);
    const hover = await background(ascending);
    assert.notEqual(hover, resting, `${theme}: row hover is visible`);
    await page.mouse.down();
    assert.notEqual(await background(ascending), hover, `${theme}: pressed state is distinct`);
    await page.mouse.move(2, 2);
    await page.mouse.up();
    if (!await columnMenu("title").evaluate(el => el.open)) await trigger.click();
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    assert.ok(await ascending.evaluate(el => el === document.activeElement));
    assert.equal(await ascending.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await page.keyboard.press('ArrowDown');
    assert.ok(await action("title", "desc").evaluate(el => el === document.activeElement));
    await page.keyboard.press('End');
    assert.ok(await action("title", "hide").evaluate(el => el === document.activeElement));
    await page.keyboard.press('Home');
    assert.ok(await ascending.evaluate(el => el === document.activeElement));
    await page.keyboard.press('Escape');
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
    await page.keyboard.press('ArrowUp');
    assert.ok(await action("title", "hide").evaluate(el => el === document.activeElement));
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => !document.querySelector('th[data-column-key="title"] .table-header-menu').open);
    await trigger.click();
    const panel = await columnMenu("title").locator('.board-menu-panel').boundingBox();
    assert.ok(panel.width <= 241 && panel.x >= 0);
    await page.screenshot({ path: `/tmp/pencils-column-menu-${theme}.png` });
    // Clicking the far edge of a row activates the same action as its label.
    const b = await ascending.boundingBox();
    await page.mouse.click(b.x + b.width - 8, b.y + b.height / 2);
    assert.equal(await page.locator('th[data-column-key="title"]').getAttribute('aria-sort'), 'ascending');
    assert.ok(await trigger.evaluate(el => el === document.activeElement), 'Sorting restores focus to the rebuilt trigger');
    await trigger.click();
    assert.equal(await ascending.getAttribute('data-applied'), 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('th[data-column-key="title"]').getAttribute('aria-sort'), 'descending');
    assert.ok(await trigger.evaluate(el => el === document.activeElement), 'Keyboard activation restores focus');
    await trigger.click();
    await action("title", "group").click();
    assert.ok(await page.locator('.table-group-row').count());
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
    await reset();
  }
  await columnMenu("priority").locator('summary').click();
  await action("priority", "hide").click();
  assert.equal(await columnMenu("priority").count(), 0);
  assert.ok(await page.locator('.table-header-menu > summary').evaluateAll(els => els.includes(document.activeElement)), 'Hiding a column focuses a remaining header');
  await page.locator('[data-board-menu="table-columns"] > summary').click();
  await page.locator('[data-column-visible="priority"]').check();
  await page.locator('[data-feature="columns-close"]').click();
  await addFilter("assignee");
  await page.keyboard.press('Escape');
  await columnMenu("priority").locator('summary').click();
  await action("priority", "filter").click();
  assert.ok(await page.locator('[data-table-filter="1"]').evaluateAll(els => els.includes(document.activeElement)), 'Filter action focuses its own field, not an earlier filter');
  await reset();
  await page.evaluate(() => window.PencilsAppearance.write({ theme: 'light' }));
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    const phone = await touch.newPage();
    phone.on('pageerror', e => errors.push(e.message));
    await phone.goto(`http://127.0.0.1:${server.address().port}`);
    await phone.locator('.project-link').waitFor({ state: 'attached' });
    await phone.locator('.mobile-menu').tap();
    await phone.locator('.project-link').tap();
    await selectProjectView(phone, 'table');
    await columnMenu('title', phone).locator('summary').tap();
    const bounds = await columnMenu('title', phone).locator('.board-menu-panel').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844);
    assert.ok((await action('title', 'desc', phone).boundingBox()).height >= 44, 'Touch action rows have a generous target');
    await phone.screenshot({ path: '/tmp/pencils-column-menu-mobile.png' });
    await action('title', 'desc', phone).tap();
    assert.equal(await phone.locator('th[data-column-key="title"]').getAttribute('aria-sort'), 'descending');
    assert.equal(await columnMenu('title', phone).evaluate(el => el.open), false);
    await phone.locator(".mobile-view-options > summary").tap();
    await phone.locator('[data-board-menu="table-groups"] > summary').tap();
    await phone.getByLabel("Group table by", { exact: true }).selectOption("assignee");
    await phone.getByLabel("Then group by", { exact: true }).selectOption("priority");
    const resetGrouping = phone.getByRole("button", { name: "Reset grouping", exact: true });
    const resetBounds = await resetGrouping.boundingBox();
    assert.ok(resetBounds.height >= 44 && resetBounds.x >= 0 && resetBounds.x + resetBounds.width <= 390, "Grouping reset fits the touch menu");
    await phone.screenshot({ path: "/tmp/pencils-group-reset-mobile.png" });
    await resetGrouping.tap();
    assert.equal(await phone.locator(".table-group-row").count(), 0);
    assert.equal(await phone.locator('th[data-column-key="title"]').getAttribute('aria-sort'), "descending");
    assert.ok(await resetGrouping.isDisabled());
  } finally { await touch.close(); }
  await menu("groups");
  await page
    .getByLabel("Group table by", { exact: true })
    .selectOption("assignee");
  await page
    .getByLabel("Then group by", { exact: true })
    .selectOption("status");
  assert.ok((await page.locator(".table-group-row").count()) >= 6);
  await page.locator('[data-table-action="collapse"]').click();
  assert.equal(await rows().count(), 0);
  await menu("groups");
  await page.locator('[data-table-action="expand"]').click();
  assert.equal(await rows().count(), 100);
  await page.locator('[data-board-menu="table-groups"] > summary').click();
  await page.screenshot({ path: "/tmp/pencils-table-groups.png" });
  // Collapsing a group excludes selected hidden tasks from a later bulk action.
  const alice = seeded[0];
  await page.locator(`[data-row-select="${alice.id}"]`).check();
  await page
    .locator('[data-table-action="group-toggle"]')
    .filter({ hasText: "Alice" })
    .first()
    .click();
  assert.equal(await page.locator("#grid-bulk").isVisible(), false);
  assert.equal(
    (await snap()).tasks.find((t) => t.id === alice.id).status,
    "done",
  );
  // Reset only grouping, including collapsed groups, without clearing other view rules.
  await columnMenu("title").locator("summary").click();
  await action("title", "desc").click();
  await addFilter("assignee");
  await chooseValue("Assignee", "Bob");
  const columnsBeforeReset = await page.locator("th[data-column-key]").evaluateAll(els => els.map(el => [el.dataset.columnKey, el.getBoundingClientRect().width]));
  await menu("groups");
  await page.locator('[data-table-action="collapse"]').click();
  assert.equal(await rows().count(), 0);
  await menu("groups");
  await page.screenshot({ path: "/tmp/pencils-group-reset-desktop.png" });
  await page.getByRole("button", { name: "Reset grouping", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(".table-group-row").count(), 0);
  assert.equal(await rows().count(), 37, "Assignee filter is preserved");
  assert.equal(await rows().first().locator('[data-task-field="title"]').inputValue(), "Task 109", "Descending title sort is preserved");
  assert.equal(await page.getByLabel("Group table by", { exact: true }).inputValue(), "");
  assert.ok(await page.getByLabel("Then group by", { exact: true }).isDisabled());
  assert.ok(await page.getByRole("button", { name: "Reset grouping", exact: true }).isDisabled());
  assert.ok(await page.getByLabel("Group table by", { exact: true }).evaluate(el => el === document.activeElement), "Focus returns to the grouping field");
  assert.deepEqual(await page.locator("th[data-column-key]").evaluateAll(els => els.map(el => [el.dataset.columnKey, el.getBoundingClientRect().width])), columnsBeforeReset);
  await page.reload();
  await rows().first().waitFor();
  assert.equal(await page.locator(".table-group-row").count(), 0, "Grouping reset persists after reload");
  assert.equal(await rows().count(), 37);
  assert.equal(await page.locator('th[data-column-key="title"]').getAttribute("aria-sort"), "descending");
  await reset();
  // Natural sorting, multi-sort and a third click clears sorting.
  await page
    .getByRole("button", { name: "Sort by Title", exact: true })
    .click();
  assert.equal(
    await rows().first().locator('[data-task-field="title"]').inputValue(),
    "Needle after page one",
  );
  await page
    .getByRole("button", { name: "Sort by Priority", exact: true })
    .click({ modifiers: ["Shift"] });
  assert.equal(await page.locator(".table-sort-indicator").count(), 2);
  await page
    .getByRole("button", { name: "Sort by Title", exact: true })
    .click();
  assert.equal(
    await rows().first().locator('[data-task-field="title"]').inputValue(),
    "Task 109",
  );
  await page
    .getByRole("button", { name: "Sort by Title", exact: true })
    .click();
  assert.equal(await page.locator(".table-sort-indicator").count(), 0);
  // Filtering must run before pagination and combine columns without losing blank values.
  await columnMenu("assignee").locator("summary").click();
  await action("assignee", "filter").click();
  await page.getByLabel("Search Assignee values", { exact: true }).fill("Ali");
  await chooseValue("Assignee", "Alice");
  assert.equal(
    await page
      .getByLabel("Search Assignee values", { exact: true })
      .inputValue(),
    "Ali",
  );
  await page.getByLabel("Search Assignee values", { exact: true }).fill("");
  assert.equal(await rows().count(), 38);
  await chooseValue("Assignee", "Bob");
  assert.equal(await rows().count(), 75);
  await addFilter("title");
  await page.getByLabel("Title filter text", { exact: true }).fill("Needle");
  await until(async () => (await rows().count()) === 1);
  assert.equal(
    await rows().first().getAttribute("data-table-task"),
    seeded[104].id,
  );
  assert.match(
    await columnMenu("assignee").locator("summary").getAttribute("aria-label"),
    /filter active/,
  );
  await page
    .getByLabel("Title filter text", { exact: true })
    .fill("No matches");
  await until(async () => (await rows().count()) === 0);
  assert.ok(await page.locator(".table-no-results").isVisible());
  await page.getByLabel("Title filter text", { exact: true }).fill("Needle");
  await until(async () => (await rows().count()) === 1);
  // Remember personal preferences across reload and include them in a named view.
  await page.reload();
  await rows().first().waitFor();
  assert.equal(await rows().count(), 1);
  await clickControl(page.locator('[data-feature="view-save"]'));
  await page.locator('#view-form [name="name"]').fill("My focused sheet");
  await page.locator('#view-form [name="scope"]').selectOption("project");
  await page.locator('#view-form [type="submit"]').click();
  await page.locator("dialog").waitFor({ state: "detached" });
  assert.equal((await snap()).project.views[0].table.filters.length, 2);
  await reset();
  assert.equal(await rows().count(), 100);
  await (
    await reveal(page.locator("#saved-view"))
  ).selectOption((await snap()).project.views[0].id);
  assert.equal(await rows().count(), 1);
  // Typed custom filters and date/empty filters.
  await reset();
  await addFilter("fields.points");
  await page.getByLabel("Points from", { exact: true }).fill("100");
  await until(async () => (await rows().count()) === 10);
  await page.getByLabel("Points to", { exact: true }).fill("104");
  await until(async () => (await rows().count()) === 5);
  await addFilter("due");
  await page
    .getByLabel("Due date filter condition", { exact: true })
    .selectOption("empty");
  assert.equal(await rows().count(), 2);
  // Preserve cell editing and other views; table rules stay scoped to Table.
  await page
    .getByRole("button", { name: "Remove Due date filter", exact: true })
    .click();
  const edit = rows().first().locator('[data-task-field="title"]');
  const id = await edit.getAttribute("data-id");
  await edit.fill("Edited in filtered table");
  await edit.press("Tab");
  await until(
    async () =>
      (await snap()).tasks.find((t) => t.id === id).title ===
      "Edited in filtered table",
  );
  await selectProjectView(page, "list");
  assert.equal(await page.locator(".table-view-tools").count(), 0);
  assert.equal(await page.locator(".task-row").count(), 100);
  await selectProjectView(page, "table");
  assert.equal(await rows().count(), 5);
  const points = rows().first().locator('[data-task-field="fields.points"]');
  await points.fill("200");
  await points.press("Tab");
  await menu("sorts");
  await until(async () => (await rows().count()) === 4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.PencilsAppearance.write({ theme: "dark" }));
  await menu("filters");
  await page.waitForTimeout(150);
  const bounds = await page
    .locator('[data-board-menu="table-filters"] .table-menu-panel')
    .boundingBox();
  assert.ok(
    bounds.x >= 0 && bounds.x + bounds.width <= 391,
    JSON.stringify(bounds),
  );
  await page.screenshot({ path: "/tmp/pencils-table-filters-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: menu hover/press/focus, keyboard and touch actions, focus restoration, applied states, grouping, sorting, filtering, editing, saved views and responsive themes.",
  );
} catch (e) {
  await page.screenshot({ path: "/tmp/pencils-table-tools-failure.png" });
  throw e;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await fs.rm(root, { recursive: true, force: true });
}
