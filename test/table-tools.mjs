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
    await page.locator(".table-result-summary").textContent(),
    /110 matching of 110 total/,
  );
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
  await page
    .getByRole("button", { name: "Filter Assignee", exact: true })
    .click();
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
  assert.equal(
    await page
      .getByRole("button", { name: "Filter Assignee", exact: true })
      .getAttribute("aria-pressed"),
    "true",
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
    "PASS: groups, nested collapse, safe bulk actions, multi-sort, cross-page filters, blanks/ranges/custom fields, counts, editing, personal persistence, shared saved views and mobile dark mode.",
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
